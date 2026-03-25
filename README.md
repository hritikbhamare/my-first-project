# SFDC Event Handler Lambda

AWS Lambda function that handles Salesforce events, sends emails via LOB API, and logs results to DynamoDB.

## Architecture

```
Salesforce EventBridge Rule
         ↓
    Lambda Function
    ├── LOB API Call (Send Email)
    ├── DynamoDB Log (Status Update)
    └── SFDC Update (Composite Request)
```

## Features

✅ **Lambda Optimizations**
- Connection pooling for HTTPS requests (reduces cold starts)
- CloudWatch metrics and performance logging
- Execution time monitoring with timeout checks
- Efficient error handling with retry logic
- Request/response truncation for CloudWatch logs

✅ **Integration**
- Salesforce Composite API for batch updates
- LOB API for email delivery
- DynamoDB for event logging
- AWS Secrets Manager for credential management

✅ **Monitoring**
- CloudWatch alarms for errors, duration, and throttles
- X-Ray tracing enabled
- Custom metrics and execution summaries
- Detailed error logging with stack traces

## Prerequisites

- AWS Account with appropriate IAM permissions
- AWS SAM CLI (`sam` command)
- Node.js 18.x or higher
- AWS CLI configured

## Environment Variables

Copy `.env.example` to `.env` and populate:

```bash
cp .env.example .env
```

Key variables:
- `tablename` - DynamoDB table for event logs
- `envname` - Environment identifier for Secrets Manager lookup
- `hostname` - LOB API hostname
- `api_key` - LOB API authentication key
- `crmpath` - Salesforce composite endpoint path
- `isdebug` - Enable debug logging (true/false)

## Deployment

### Local Testing

```bash
# Invoke function locally with test event
sam local invoke SFDCEventHandlerFunction -e events/test-event.json

# Start local API Gateway
sam local start-api
```

### Deploy to AWS

```bash
# Build the function
sam build

# Package and deploy (guided mode)
sam deploy --guided

# Or deploy to existing stack
sam deploy --stack-name sfdc-event-handler-dev --region us-east-1
```

**Guided deployment options:**
```
Stack Name: sfdc-event-handler-dev
Region: us-east-1
Parameter Environment: dev
Parameter TableName: communication-logs
Parameter EnvName: prod
Parameter HostName: api.lob.com
Parameter EmailPath: /v1/letters
Parameter CrmPath: /services/data/v62.0/composite
Parameter SfApiVersion: v62.0
Parameter LoopLength: 5
```

### IAM Permissions Required

The Lambda execution role needs:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:Query"
      ],
      "Resource": "arn:aws:dynamodb:*:*:table/communication-logs"
    },
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": "arn:aws:secretsmanager:*:*:secret:prod_sfdc_auth*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:log-group:/aws/lambda/sfdc-event-handler*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "xray:PutTraceSegments",
        "xray:PutTelemetryRecords"
      ],
      "Resource": "*"
    }
  ]
}
```

## Function Handler

**Entry Point:** `index.handler`

**Event Structure:**
```json
{
  "detail": {
    "payload": {
      "Request_Payload__c": "{ ... }",
      "LogID__c": "a12XX000000000AAA",
      "ContentVersionIds1__c": "068XX000000000AAA",
      "File_Name1__c": "document.pdf"
    }
  }
}
```

**Response Structure:**
```json
{
  "statusCode": 200,
  "body": "{\"status\": \"success\", \"message_id\": \"...\"}"
}
```

## Performance Optimization

### Cold Start Reduction
- Connection agents are reused across Lambda invocations
- Lazy module loading for heavy dependencies
- 512MB memory allocation for optimal CPU

### Execution Time Optimization
- Parallel attachment fetching with `Promise.all()`
- Timeout checks prevent fatal timeout errors
- Database and SFDC failures don't block email response

### Memory Management
- Streaming buffers for binary content
- Truncated logs to prevent CloudWatch overhead
- Efficient JSON parsing

## Monitoring & CloudWatch

### Metrics Collected
- Invocations
- Errors
- Duration
- Throttles
- Concurrent Executions

### CloudWatch Logs Format
```
[RequestId] [Timestamp] 🐛 Label: Data
```

### Example Queries

**Error rate:**
```
fields @timestamp, @message
| filter @message like /❌/
| stats count() as errors by bin(5m)
```

**Performance:**
```
fields @duration
| stats avg(@duration), max(@duration), pct(@duration, 99) by bin(5m)
```

## Troubleshooting

### Lambda Timeout
- Check `getRemainingTimeInMillis()` in logs
- Increase Lambda timeout (max 15 minutes)
- Reduce attachment count or optimize SFDC queries

### Connection Errors
- Verify LOB API and SFDC hostnames
- Check security groups and VPC configuration
- Verify API credentials in Secrets Manager

### DynamoDB Errors
- Check table exists and is accessible
- Verify partition key schema
- Check provisioned capacity

### SFDC Errors
- Verify composite API endpoint path
- Check SFDC session token validity
- Ensure required fields in request body

## Code Structure

```
├── index.js          # Main Lambda handler
├── config.js         # Configuration and constants
├── logger.js         # CloudWatch logging utility
├── network.js        # HTTPS request handling with connection pooling
├── payloads.js       # Request/response payload construction
├── package.json      # Dependencies
├── template.yaml     # SAM deployment template
└── .env.example      # Environment variable template
```

## Dependencies

- `uuid` - For generating unique identifiers
- AWS SDK (built-in)
- Node.js `https` module (built-in)

See `package.json` for version details.

## Development

### Local Development

```bash
# Install dependencies
npm install

# Run tests (if configured)
npm test

# Check for linting issues
npm run lint
```

### Debugging

Enable debug logging:
```bash
export isdebug=true
# Then deploy or test
```

Add custom breakpoints in code with `debugger;`

## Performance Benchmarks

**Typical Execution Times:**
- Cold Start: 1.5-2.5s
- Warm Start: 200-500ms
- LOB API Call: 500-1000ms
- SFDC Update: 500-1500ms
- Database Log: 100-300ms

**Memory Usage:**
- Heap: ~100-200MB
- Allocated: 512MB

## Security Best Practices

✅ Use AWS Secrets Manager for sensitive credentials
✅ Enable X-Ray tracing for debugging
✅ Restrict Lambda execution role permissions
✅ Enable VPC for database access if needed
✅ Use environment variables for configuration
✅ Enable CloudWatch alarms for monitoring
✅ Set timeout buffer of at least 5 seconds

## Support & Issues

For issues or questions:
1. Check CloudWatch logs for detailed error messages
2. Enable debug mode (`isdebug=true`)
3. Review X-Ray traces for service map
4. Check IAM permissions for all resources

## License

This code is for internal use only.