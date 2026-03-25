/**
 * Logger Utility Module
 * CloudWatch-optimized logging for AWS Lambda
 */

const config = require('./config');

class Logger {
  constructor(isDebug = config.ENV_VARS.IS_DEBUG, context = null) {
    this.isDebug = isDebug;
    this.lambdaContext = context ? config.getLambdaContext(context) : null;
    this.startTime = Date.now();
  }

  /**
   * Get elapsed time since logger creation
   */
  getElapsedTime() {
    return Date.now() - this.startTime;
  }

  /**
   * Get CloudWatch log prefix with Lambda context
   */
  getLogPrefix() {
    if (!this.lambdaContext) return '';
    return `[${this.lambdaContext.awsRequestId}]`;
  }

  /**
   * Log debug messages (only if IS_DEBUG enabled)
   */
  debug(label, data) {
    if (this.isDebug) {
      const timestamp = new Date().toISOString();
      const prefix = this.getLogPrefix();
      const message = this.formatMessage(data);
      console.debug(`${prefix} [${timestamp}] 🐛 ${label}:`, message);
    }
  }

  /**
   * Log info messages
   */
  info(label, data) {
    const timestamp = new Date().toISOString();
    const prefix = this.getLogPrefix();
    const message = this.formatMessage(data);
    console.log(`${prefix} [${timestamp}] ℹ️ ${label}:`, message);
  }

  /**
   * Log warning messages
   */
  warn(label, data) {
    const timestamp = new Date().toISOString();
    const prefix = this.getLogPrefix();
    const message = this.formatMessage(data);
    console.warn(`${prefix} [${timestamp}] ⚠️ ${label}:`, message);
  }

  /**
   * Log error messages
   */
  error(label, error) {
    const timestamp = new Date().toISOString();
    const prefix = this.getLogPrefix();
    const errorMsg = error?.message || String(error);
    const errorStack = error?.stack ? `\nStack: ${error.stack}` : '';
    console.error(`${prefix} [${timestamp}] ❌ ${label}: ${errorMsg}${errorStack}`);
  }

  /**
   * Log metrics for Lambda performance monitoring
   */
  logMetrics(metrics) {
    const metricsObj = {
      Timestamp: new Date().toISOString(),
      ElapsedTimeMs: this.getElapsedTime(),
      MemoryUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      ...metrics,
    };

    // CloudWatch Metrics format for easy parsing
    console.log(JSON.stringify({
      type: 'METRIC',
      data: metricsObj,
    }));
  }

  /**
   * Log Lambda execution summary
   */
  logExecutionSummary(statusCode, executionTime, additionalMetrics = {}) {
    const summary = {
      executionTime: executionTime,
      statusCode: statusCode,
      memoryUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      memoryLimitMb: config.LAMBDA.MEMORY_MB,
      ...additionalMetrics,
    };

    this.info('Execution Summary', JSON.stringify(summary));
  }

  /**
   * Format message for logging (truncate if needed)
   */
  formatMessage(data) {
    if (!data) return '';
    if (typeof data === 'string') {
      return data.length > config.API.MAX_RESPONSE_LOG_LENGTH
        ? data.substring(0, config.API.MAX_RESPONSE_LOG_LENGTH) + '...'
        : data;
    }
    try {
      const jsonStr = JSON.stringify(data);
      return jsonStr.length > config.API.MAX_RESPONSE_LOG_LENGTH
        ? jsonStr.substring(0, config.API.MAX_RESPONSE_LOG_LENGTH) + '...'
        : jsonStr;
    } catch {
      return String(data);
    }
  }

  /**
   * Log API request with truncation
   */
  logRequest(logType, options, body) {
    if (this.isDebug) {
      this.debug(`${logType} Request Options`, options);
      if (body) {
        const truncatedBody = String(body).substring(0, config.API.MAX_REQUEST_LOG_LENGTH);
        this.debug(`${logType} Request Body`, truncatedBody);
      }
    }
  }

  /**
   * Log API response with truncation
   */
  logResponse(logType, statusCode, body) {
    if (this.isDebug) {
      const truncatedBody = String(body || '').substring(0, config.API.MAX_RESPONSE_LOG_LENGTH);
      this.debug(`${logType} Response [${statusCode}]`, truncatedBody);
    }
  }

  /**
   * Log errors from failed API calls
   */
  logApiError(logType, options, body, statusCode, errorBody) {
    this.error(`${logType} API Error`,
      `Status: ${statusCode}, Host: ${options?.hostname}`);
    if (body) {
      this.error(`${logType} Request Body`, body);
    }
    this.error(`${logType} Response`, errorBody);
  }

  /**
   * Check if Lambda execution time is running low
   */
  isTimeoutImminent(buffer = config.LAMBDA.TIMEOUT_BUFFER) {
    if (!this.lambdaContext) return false;
    const remainingTime = this.lambdaContext.getRemainingTimeInMillis();
    return remainingTime < buffer;
  }

  /**
   * Get remaining execution time
   */
  getRemainingTime() {
    if (!this.lambdaContext) return null;
    return this.lambdaContext.getRemainingTimeInMillis();
  }
}

module.exports = Logger;
