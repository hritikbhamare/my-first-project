/**
 * Network Module
 * Handles HTTP/HTTPS requests with error handling, logging, and connection reuse
 * Optimized for AWS Lambda cold start performance
 */

const https = require('https');
const config = require('./config');
const Logger = require('./logger');

// Connection agents reused across invocations (set at module load)
// This helps reduce cold start times and connection overhead
const httpAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 50,
  timeout: config.API.SOCKET_TIMEOUT,
});

const binaryAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 50,
  timeout: config.API.SOCKET_TIMEOUT,
  rejectUnauthorized: false,
});

const logger = new Logger(config.ENV_VARS.IS_DEBUG);

/**
 * Validates response status code
 */
function isErrorStatus(statusCode) {
  return statusCode >= config.HTTP_STATUS.THRESHOLD;
}

/**
 * Creates a custom API error with detailed context
 */
function createApiError(message, statusCode = 500, body = null) {
  const err = new Error(message);
  err.name = 'APIError';
  err.statusCode = statusCode;
  err.body = body;
  return err;
}

/**
 * Generic HTTPS request handler with timeout protection
 * @param {Object} options - HTTPS request options
 * @param {string|Buffer} reqBody - Request body
 * @param {string} logType - Log type for identifying the API call
 * @param {Object} requestConfig - Configuration options (e.g., { binary: true })
 */
async function makeRequest(options, reqBody, logType, requestConfig = {}) {
  const { binary = false, customAgent = null } = requestConfig;

  logger.logRequest(logType, options, reqBody);

  return new Promise((resolve, reject) => {
    let timedOut = false;

    // Determine which agent to use (for connection reuse)
    const agent = customAgent || (binary ? binaryAgent : httpAgent);

    const req = https.request(
      {
        ...options,
        agent,
        timeout: config.API.CONNECTION_TIMEOUT,
      },
      (res) => {
        const chunks = [];

        res.on('data', (chunk) => {
          chunks.push(chunk);
        });

        res.on('end', () => {
          if (timedOut) return;

          try {
            const rawData = binary
              ? Buffer.concat(chunks)
              : Buffer.concat(chunks).toString();

            const responseData = {
              body: rawData,
              statusCode: res.statusCode,
            };

            logger.logResponse(logType, res.statusCode, rawData);

            if (isErrorStatus(res.statusCode)) {
              const errorMsg = typeof rawData === 'string' ? rawData : JSON.stringify(rawData);
              logger.error(`${logType} API Error`, errorMsg);
              return reject(createApiError(errorMsg, res.statusCode, rawData));
            }

            resolve(responseData);
          } catch (err) {
            logger.error(`${logType} Response Processing`, err);
            reject(err);
          }
        });
      }
    );

    // Timeout handler
    req.on('timeout', () => {
      timedOut = true;
      req.destroy();
      const errorMsg = `Request timeout after ${config.API.CONNECTION_TIMEOUT}ms`;
      logger.error(`${logType} Timeout`, errorMsg);
      reject(createApiError(errorMsg, 504)); // 504 Gateway Timeout
    });

    req.on('error', (err) => {
      if (timedOut) return;
      const errorMsg = err.message || 'Network error';
      logger.error(`${logType} Network Error`, errorMsg);
      reject(createApiError(errorMsg, config.HTTP_STATUS.INTERNAL_SERVER_ERROR));
    });

    if (reqBody) req.write(reqBody);
    req.end();
  });
}

/**
 * Make a standard API call (text/JSON response)
 */
async function callAPI(options, reqBody, logType) {
  return makeRequest(options, reqBody, logType, { binary: false });
}

/**
 * Make an API call for binary/file content
 */
async function uploadCallAPI(options, reqBody = '', logType) {
  return makeRequest(options, reqBody, logType, { binary: true });
}

/**
 * Cleanup connections (optional, for graceful shutdown)
 */
function closeConnections() {
  httpAgent.destroy();
  binaryAgent.destroy();
}

module.exports = { callAPI, uploadCallAPI, closeConnections };