/**
 * Configuration and Constants Module
 * Centralized configuration for AWS Lambda deployment
 */

module.exports = {
  // AWS Lambda Configuration
  LAMBDA: {
    TIMEOUT_BUFFER: 5000, // 5 seconds buffer before Lambda timeout
    MAX_EXECUTION_TIME: 900000, // 15 minutes (900 seconds) default Lambda timeout
    MEMORY_MB: parseInt(process.env.AWS_LAMBDA_MEMORY_IN_MB || '512'),
    FUNCTION_NAME: process.env.AWS_LAMBDA_FUNCTION_NAME || 'SFDC-Event-Handler',
    REQUEST_ID: process.env.AWS_REQUEST_ID || 'local',
    LOG_GROUP: process.env.AWS_LAMBDA_LOG_GROUP_NAME || '/aws/lambda/unknown',
  },

  // API Configuration
  API: {
    PORT: 443,
    TIMEOUT: 30000,
    MAX_RESPONSE_LOG_LENGTH: 3000,
    MAX_REQUEST_LOG_LENGTH: 3000,
    CONNECTION_TIMEOUT: 10000,
    SOCKET_TIMEOUT: 30000,
  },

  // Connection Pool Settings (for database)
  CONNECTION_POOL: {
    ENABLED: true,
    MIN_SIZE: 2,
    MAX_SIZE: 10,
    IDLE_TIMEOUT: 30000,
    CONNECTION_TIMEOUT: 5000,
  },

  // Status Constants
  STATUS: {
    SUCCESS: 'success',
    FAILURE: 'Failure',
    SENT: 'sent',
    NOT_SENT: 'not sent',
  },

  // HTTP Status Codes
  HTTP_STATUS: {
    OK: 200,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    INTERNAL_SERVER_ERROR: 500,
    THRESHOLD: 300, // 3xx and above are considered errors
  },

  // Logging Types
  LOG_TYPE: {
    LOB_API: 'LOB API',
    SFDC_EVENT_API: 'SFDC Event API',
    DEBUG: 'DEBUG',
    ERROR: 'ERROR',
    INFO: 'INFO',
  },

  // SFDC Configuration
  SFDC: {
    DEFAULT_API_VERSION: 'v62.0',
    COMPOSITE_ENDPOINT_PATTERN: '/services/data/{version}/sobjects/ASF_Communication_Log__c/{logId}',
    CONTENT_VERSION_ENDPOINT_PATTERN: '/services/data/{version}/sobjects/ContentVersion/{id}/VersionData',
    ERROR_SESSION_ID: 'INVALID_SESSION_ID',
    MAX_RETRIES: 1,
    TOKEN_CACHE_TTL: 3600000, // 1 hour in milliseconds
  },

  // Timezone
  TIMEZONE: 'Asia/Kolkata',

  // Retry Configuration
  RETRY: {
    ENABLED: true,
    MAX_ATTEMPTS: 2,
    INITIAL_DELAY_MS: 1000,
    MAX_DELAY_MS: 5000,
    BACKOFF_MULTIPLIER: 2,
  },

  // Environment Variables (with defaults)
  ENV_VARS: {
    TABLE_NAME: process.env.tablename,
    ENV_NAME: process.env.envname,
    HOSTNAME: process.env.hostname,
    EMAIL_PATH: process.env.path,
    CRM_PATH: process.env.crmpath,
    API_KEY: process.env.api_key,
    IS_DEBUG: JSON.parse(process.env.isdebug || 'false'),
    LOOP_LENGTH: Number(process.env.loopLength || '5'),
    SFDC_API_VERSION: (process.env.sfdc_api_version || 'v62.0').trim(),
    STAGE: process.env.STAGE || 'dev',
    REGION: process.env.AWS_REGION || 'us-east-1',
  },

  // Lambda Context Information
  getLambdaContext: (context) => ({
    functionName: context?.functionName,
    functionVersion: context?.functionVersion,
    invokedFunctionArn: context?.invokedFunctionArn,
    memoryLimitInMB: context?.memoryLimitInMB,
    awsRequestId: context?.awsRequestId,
    logGroupName: context?.logGroupName,
    logStreamName: context?.logStreamName,
    getRemainingTimeInMillis: () => context?.getRemainingTimeInMillis?.() || 0,
  }),
};
