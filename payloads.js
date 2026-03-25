/**
 * Payloads Module
 * Constructs request/response payloads for various API calls
 */

const config = require('./config');

/**
 * Get current timestamp in IST timezone
 */
function getCurrentTimestamp() {
  return new Date().toLocaleString('en-IN', {
    timeZone: config.TIMEZONE,
  });
}

/**
 * Extract the balance request body from the event payload
 */
function balanceReqBody(obj) {
  const body = obj.Request_Payload__c;
  if (!body) {
    throw new Error('Request_Payload__c is required in event payload');
  }
  return body;
}

/**
 * Construct SFDC composite request body for updating communication log
 */
function crmReqBody(logId_c, resObj) {
  if (!logId_c) {
    throw new Error('logId_c is required');
  }

  const status = resObj?.status === config.STATUS.SUCCESS
    ? config.STATUS.SUCCESS
    : config.STATUS.FAILURE;

  const body = {
    graphs: [
      {
        graphId: 1,
        compositeRequest: [
          {
            method: 'PATCH',
            url: `/services/data/${config.ENV_VARS.SFDC_API_VERSION}/sobjects/ASF_Communication_Log__c/${logId_c}`,
            referenceId: 'refUpdateInt',
            body: {
              Response__c: JSON.stringify(resObj),
            },
          },
        ],
      },
    ],
  };

  return JSON.stringify(body);
}

/**
 * Construct payload for database insert/update
 */
function putDbBody(logId_c, ENV_KEY, data) {
  if (!logId_c) {
    throw new Error('logId_c is required');
  }

  if (!data) {
    throw new Error('data is required');
  }

  const status = data.status === config.STATUS.SUCCESS
    ? config.STATUS.SENT
    : config.STATUS.NOT_SENT;

  const messageId = data?.data?.message_id || 'unknown';
  const createdDt = getCurrentTimestamp();

  return {
    createdDt,
    logId: logId_c,
    messageId,
    status_msg: status,
  };
}

module.exports = {
  balanceReqBody,
  crmReqBody,
  putDbBody,
  getCurrentTimestamp,
};