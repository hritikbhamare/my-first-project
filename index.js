/**
 * Main Handler Module
 * AWS Lambda Event Handler with SFDC Integration
 * Orchestrates LOB API calls, database logging, and SFDC updates
 */

const payloads = require('./payloads.js');
const network = require('./network.js');
const config = require('./config.js');
const Logger = require('./logger.js');

const authToken = require('/opt/nodejs/index.js');
const dbConn = require('/opt/nodejs/dbConn.js');

const { URL } = require('url');
const { v4: uuidv4 } = require('uuid');

const uniqueId = uuidv4();

// State management
let accessToken = null;
let crmHostName = null;
let logger = null;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Validates required environment variables
 */
function validateEnvironmentVariables() {
  const required = ['TABLE_NAME', 'ENV_NAME', 'HOSTNAME', 'EMAIL_PATH', 'API_KEY'];
  const missing = required.filter(key => !config.ENV_VARS[key]);

  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }
}

/**
 * Check if we're running out of time
 */
function checkExecutionTime() {
  if (logger.isTimeoutImminent()) {
    const remainingTime = logger.getRemainingTime();
    logger.warn('Timeout Imminent', `Only ${remainingTime}ms remaining`);
    throw new Error(`Lambda execution timeout imminent - only ${remainingTime}ms remaining`);
  }
}

/**
 * Fetch SFDC access token
 */
async function fetchAccessToken(tokenType = 'cached') {
  checkExecutionTime(); // Verify we have time for this operation

  try {
    const envKey = `${config.ENV_VARS.ENV_NAME}_sfdc_auth`;
    const rawTokenBody = await authToken.getToken(envKey, tokenType);
    const tokenBody = JSON.parse(rawTokenBody);

    accessToken = tokenBody.access_token;
    const instanceUrl = tokenBody.instance_url;
    crmHostName = new URL(instanceUrl).hostname;

    logger.debug('SFDC Token', `Fetched with type: ${tokenType}`);
  } catch (err) {
    logger.error('Fetch Access Token', err);
    throw new Error(`Failed to fetch SFDC access token: ${err.message}`);
  }
}

/**
 * Send email via LOB API with timeout protection
 */
async function sendEmail(reqBody, token) {
  checkExecutionTime();

  const reqHeaders = {
    'Content-Type': 'application/json',
    'api_key': token,
  };

  const options = {
    hostname: config.ENV_VARS.HOSTNAME,
    path: config.ENV_VARS.EMAIL_PATH,
    method: 'POST',
    port: config.API.PORT,
    headers: reqHeaders,
  };

  return network.callAPI(options, reqBody, config.LOG_TYPE.LOB_API);
}

/**
 * Log status to database with timeout protection
 */
async function logStatusToDb(putDbBody) {
  checkExecutionTime();
  return dbConn.putDb(config.ENV_VARS.TABLE_NAME, putDbBody);
}

/**
 * Update status in SFDC with timeout protection
 */
async function postStatusUpdate(crmReqBody) {
  checkExecutionTime();

  const reqHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };

  const options = {
    hostname: crmHostName,
    path: config.ENV_VARS.CRM_PATH,
    method: 'POST',
    port: config.API.PORT,
    headers: reqHeaders,
  };

  return network.callAPI(options, crmReqBody, config.LOG_TYPE.SFDC_EVENT_API);
}

/**
 * Extract and validate content version IDs from payload
 */
function extractContentVersionIds(detailsPayload) {
  const contentList = [];

  for (let i = 1; i <= config.ENV_VARS.LOOP_LENGTH; i++) {
    const idKey = `ContentVersionIds${i}__c`;
    const nameKey = `File_Name${i}__c`;

    if (!detailsPayload[idKey]) continue;

    contentList.push({
      id: detailsPayload[idKey],
      name: detailsPayload[nameKey],
    });
  }

  return contentList;
}

/**
 * Fetch content version attachments from SFDC with timeout protection
 */
async function getContentVersionAttachments(list, apiVersion = config.ENV_VARS.SFDC_API_VERSION) {
  checkExecutionTime();

  if (!Array.isArray(list) || list.length === 0) {
    logger.info('Content Attachments', 'No attachments to fetch');
    return [];
  }

  // Filter valid IDs
  const validList = list.filter(
    item =>
      item?.id && typeof item.id === 'string' && item.id.trim() !== ''
  );

  if (validList.length === 0) {
    logger.info('Content Attachments', 'No valid ContentVersion IDs provided');
    return [];
  }

  await fetchAccessToken();

  const fetchSingle = async (item) => {
    checkExecutionTime();

    const path = `/services/data/${apiVersion}/sobjects/ContentVersion/${encodeURIComponent(item.id)}/VersionData`;

    const options = {
      hostname: crmHostName,
      path,
      method: 'GET',
      port: config.API.PORT,
      headers: { Authorization: `Bearer ${accessToken}` },
    };

    try {
      const res = await network.uploadCallAPI(options, '', 'Content Fetch');
      return res.body;
    } catch (err) {
      // Retry with fresh token on 401
      if (err?.statusCode === 401) {
        await fetchAccessToken('fresh');
        options.headers.Authorization = `Bearer ${accessToken}`;
        const res = await network.uploadCallAPI(options, '', 'Content Fetch Retry');
        return res.body;
      }
      throw err;
    }
  };

  const results = await Promise.all(
    validList.map(async (item) => {
      const buffer = await fetchSingle(item);
      const fileName = item.name?.trim() ? item.name : `${item.id}.pdf`;

      return {
        name: fileName,
        content: buffer.toString('base64'),
      };
    })
  );

  return results;
}

/**
 * Add attachments to request body
 */
function addAttachments(targetObject, newAttachments) {
  const attachmentsToAdd = Array.isArray(newAttachments)
    ? newAttachments
    : [newAttachments].filter(a => a);

  if (!Array.isArray(targetObject.attachments)) {
    targetObject.attachments = [];
  }

  targetObject.attachments.push(...attachmentsToAdd);
  return targetObject;
}

/**
 * Handle SFDC session expiry with retry
 */
async function postStatusUpdateWithRetry(crmReqBody) {
  try {
    await postStatusUpdate(crmReqBody);
  } catch (err) {
    if (err.message?.includes(config.SFDC.ERROR_SESSION_ID)) {
      logger.info('SFDC Retry', 'Session expired, retrying with fresh token');
      await fetchAccessToken('fresh');
      await postStatusUpdate(crmReqBody);
    } else {
      throw err;
    }
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

const startTime = Date.now();
exports.handler = async (event, context) => {
  // Initialize logger with Lambda context
  logger = new Logger(config.ENV_VARS.IS_DEBUG, context);

  logger.info('Event Received', JSON.stringify(event, null, 2));
  logger.info('Lambda Context', {
    functionName: context?.functionName,
    memoryLimitMb: context?.memoryLimitInMB,
    requestId: context?.requestId,
    remainingTime: context?.getRemainingTimeInMillis?.(),
  });

  let sendMailResponse = {};
  let sendMailResponseObj = null;
  let startHandlerTime = Date.now();

  try {
    // Validate environment
    validateEnvironmentVariables();

    // Parse event
    const eventObj = event.body ? JSON.parse(event.body) : event;
    const eventDetails = eventObj.detail;

    if (!eventDetails || !eventDetails.payload) {
      throw new Error('Unstructured event payload found');
    }

    const detailsPayload = eventDetails.payload;
    const logId_c = detailsPayload.LogID__c;
    const token = config.ENV_VARS.API_KEY;

    // Validate required fields
    if (!logId_c) {
      throw new Error('LogID__c is required');
    }

    if (!token) {
      throw new Error('api_key is not defined');
    }

    // Construct request body
    const reqBody = payloads.balanceReqBody(detailsPayload);
    const contentList = extractContentVersionIds(detailsPayload);
    const multiAttachments = await getContentVersionAttachments(contentList);
    const updateWithAttachment = addAttachments(
      JSON.parse(reqBody),
      multiAttachments
    );

    // --- LOB API Call ---
    try {
      sendMailResponse = await sendEmail(
        JSON.stringify(updateWithAttachment),
        token
      );
      logger.info('LOB API Response', sendMailResponse);

      sendMailResponseObj = sendMailResponse.body
        ? JSON.parse(sendMailResponse.body)
        : {
            status: config.STATUS.SUCCESS,
            message: 'Request processed without a response body.',
          };
    } catch (err) {
      logger.error('LOB API Error', err);
      sendMailResponseObj = {
        status: config.STATUS.FAILURE,
        error: err.message,
      };
      sendMailResponse.statusCode = err.statusCode || 500;
      sendMailResponse.body = JSON.stringify(sendMailResponseObj);
    }

    // --- Log to Database ---
    try {
      const putDbBody = payloads.putDbBody(logId_c, uniqueId, sendMailResponseObj);
      logger.debug('DB Insert Body', putDbBody);
      await logStatusToDb(putDbBody);
    } catch (err) {
      logger.error('Database Log Error', err);
      // Continue even if DB logging fails
    }

    // --- Update SFDC ---
    try {
      await fetchAccessToken();
      const crmReqBody = payloads.crmReqBody(logId_c, sendMailResponseObj);
      logger.info('SFDC Request Body', crmReqBody);
      await postStatusUpdateWithRetry(crmReqBody);
    } catch (err) {
      logger.error('SFDC Update Error', err);
      // Continue; SFDC failure shouldn't block response
    }

    const handlerDuration = Date.now() - startHandlerTime;
    const statusCode = sendMailResponse.statusCode || 200;

    // Log execution metrics for CloudWatch monitoring
    logger.logExecutionSummary(statusCode, handlerDuration, {
      attachmentCount: multiAttachments.length,
      logId: logId_c,
    });

    // --- Return Response ---
    return {
      statusCode,
      body: sendMailResponse.body || JSON.stringify(sendMailResponseObj),
    };
  } catch (error) {
    logger.error('Handler Error', error);

    const errMsg = error.message || String(error);
    let errBody;

    try {
      errBody = JSON.parse(errMsg);
    } catch {
      errBody = { error: errMsg };
    }

    const handlerDuration = Date.now() - startHandlerTime;
    logger.logExecutionSummary(400, handlerDuration, { error: errMsg });

    return {
      statusCode: config.HTTP_STATUS.BAD_REQUEST,
      body: JSON.stringify(errBody),
    };
  }
};