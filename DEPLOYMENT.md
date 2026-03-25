# AWS Lambda Deployment Guide

## Pre-Deployment Checklist

### AWS Account Setup
- [ ] AWS Account with appropriate permissions
- [ ] AWS CLI v2 installed and configured
- [ ] AWS SAM CLI installed
- [ ] Node.js 18.x or higher installed
- [ ] S3 bucket for CloudFormation artifacts

### Required Resources
- [ ] DynamoDB table created for event logs
- [ ] Secrets Manager secret for SFDC authentication
- [ ] VPC security groups configured (if using VPC)
- [ ] IAM role with required permissions

### External Services
- [ ] Salesforce environment configured
- [ ] Salesforce Connected App created for OAuth
- [ ] LOB API account and API key obtained
- [ ] EventBridge rule created for SFDC events

---

## Step 1: Create DynamoDB Table

```bash
aws dynamodb create-table \
  --table-name communication-logs \
  --attribute-definitions \
    AttributeName=logId,AttributeType=S \
    AttributeName=createdDt,AttributeType=S \
  --key-schema \
    AttributeName=logId,KeyType=HASH \
    AttributeName=createdDt,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1
```

**Alternative with provisioned capacity:**
```bash
aws dynamodb create-table \
  --table-name communication-logs \
  --attribute-definitions \
    AttributeName=logId,AttributeType=S \
    AttributeName=createdDt,AttributeType=S \
  --key-schema \
    AttributeName=logId,KeyType=HASH \
    AttributeName=createdDt,KeyType=RANGE \
  --billing-mode PROVISIONED \
  --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
  --region us-east-1
```

---

## Step 2: Create Secrets Manager Secret

```bash
# Create secret for SFDC authentication
aws secretsmanager create-secret \
  --name prod_sfdc_auth \
  --description "Salesforce authentication token" \
  --secret-string '{
    "access_token": "your_sfdc_access_token",
    "instance_url": "https://your-instance.salesforce.com",
    "token_type": "Bearer"
  }' \
  --region us-east-1

# Grant Lambda permission to access secret
aws lambda add-permission \
  --function-name sfdc-event-handler-prod \
  --statement-id AllowSecretsAccess \
  --action lambda:InvokeFunction \
  --principal secretsmanager.amazonaws.com
```

---

## Step 3: Create S3 Bucket for Artifacts

```bash
aws s3 mb s3://sfdc-lambda-artifacts-prod --region us-east-1

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket sfdc-lambda-artifacts-prod \
  --versioning-configuration Status=Enabled
```

---

## Step 4: Setup Environment Variables

```bash
# Copy example file
cp .env.example .env

# Edit .env with your values
# Important variables:
# - AWS_REGION=us-east-1
# - tablename=communication-logs
# - envname=prod
# - hostname=api.lob.com
# - api_key=your_lob_api_key
```

---

## Step 5: Deploy Lambda Function

### Windows (PowerShell)

```powershell
# Build and deploy with guided mode
.\deploy.ps1

# Or use specific action
.\deploy.ps1 -Action build
.\deploy.ps1 -Action deploy -Environment prod
.\deploy.ps1 -Action test
.\deploy.ps1 -Action logs
```

### Linux/macOS (Bash)

```bash
# Make script executable
chmod +x deploy.sh

# Build and deploy
./deploy.sh

# Deploy with environment
Environment=prod ./deploy.sh
```

### Manual SAM Deployment

```bash
# Build
sam build

# Deploy (guided)
sam deploy --guided

# Deploy (with overrides)
sam deploy \
  --stack-name sfdc-event-handler-prod \
  --s3-bucket sfdc-lambda-artifacts-prod \
  --parameter-overrides \
    Environment=prod \
    TableName=communication-logs \
    EnvName=prod \
    HostName=api.lob.com \
    EmailPath=/v1/letters \
    CrmPath=/services/data/v62.0/composite
```

---

## Step 6: Create EventBridge Rule

```bash
# Create rule for SFDC events
aws events put-rule \
  --name sfdc-communication-events \
  --event-pattern '{
    "source": ["salesforce.events"],
    "detail-type": ["Communication Event"]
  }' \
  --state ENABLED

# Add Lambda as target
aws events put-targets \
  --rule sfdc-communication-events \
  --targets "Id"="1","Arn"="arn:aws:lambda:us-east-1:123456789012:function:sfdc-event-handler-prod"

# Grant EventBridge permission to invoke Lambda
aws lambda add-permission \
  --function-name sfdc-event-handler-prod \
  --statement-id AllowEventBridgeInvoke \
  --action lambda:InvokeFunction \
  --principal events.amazonaws.com \
  --source-arn arn:aws:events:us-east-1:123456789012:rule/sfdc-communication-events
```

---

## Step 7: Configure IAM Policies

### Lambda Execution Role Policy

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DynamoDBAccess",
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:GetItem",
        "dynamodb:Query"
      ],
      "Resource": "arn:aws:dynamodb:us-east-1:123456789012:table/communication-logs"
    },
    {
      "Sid": "SecretsManagerAccess",
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": "arn:aws:secretsmanager:us-east-1:123456789012:secret:prod_sfdc_auth-*"
    },
    {
      "Sid": "CloudWatchLogs",
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/sfdc-event-handler-*"
    },
    {
      "Sid": "XRayAccess",
      "Effect": "Allow",
      "Action": [
        "xray:PutTraceSegments",
        "xray:PutTelemetryRecords"
      ],
      "Resource": "*"
    },
    {
      "Sid": "KMSDecrypt",
      "Effect": "Allow",
      "Action": [
        "kms:Decrypt"
      ],
      "Resource": "arn:aws:kms:us-east-1:123456789012:key/*",
      "Condition": {
        "StringEquals": {
          "kms:ViaService": "secretsmanager.us-east-1.amazonaws.com"
        }
      }
    }
  ]
}
```

### Apply Policy to Role

```bash
# Get role ARN from CloudFormation stack
aws cloudformation describe-stack-resources \
  --stack-name sfdc-event-handler-prod \
  --logical-resource-id SFDCEventHandlerFunction \
  --query 'StackResources[0].PhysicalResourceId' \
  --output text

# Attach policy
aws iam put-role-policy \
  --role-name sfdc-event-handler-prod-role \
  --policy-name Execution \
  --policy-document file://iam-policy.json
```

---

## Step 8: Test Deployment

### Test with SAM Local

```bash
sam local invoke SFDCEventHandlerFunction -e events/test-event.json
```

### Test with AWS Console

1. Go to Lambda console
2. Find `sfdc-event-handler-prod` function
3. Click "Test" tab
4. Create test event from template
5. Click "Test" button

### Test with AWS CLI

```bash
aws lambda invoke \
  --function-name sfdc-event-handler-prod \
  --payload file://events/test-event.json \
  --log-type Tail \
  response.json \
  | grep "LogResult" | awk -F'"' '{print $4}' | base64 --decode

cat response.json
```

---

## Step 9: Verify Monitoring

### Check CloudWatch Logs

```bash
# View recent logs
aws logs tail /aws/lambda/sfdc-event-handler-prod --follow

# Get log events
aws logs filter-log-events \
  --log-group-name /aws/lambda/sfdc-event-handler-prod \
  --query 'events[0:10]'
```

### Check X-Ray Traces

```bash
# Get service map
aws xray get-service-graph --start-time $(date -d '1 hour ago' +%s)

# Get trace summaries
aws xray get-trace-summaries \
  --start-time $(date -d '1 hour ago' +%s) \
  --filter-expression 'service(id(name: "sfdc-event-handler-prod"))'
```

### View CloudWatch Metrics

```bash
# Get Lambda metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Invocations \
  --dimensions Name=FunctionName,Value=sfdc-event-handler-prod \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum
```

---

## Step 10: Setup Alarms

### Performance Alarms

```bash
# Error rate alarm
aws cloudwatch put-metric-alarm \
  --alarm-name sfdc-handler-high-error-rate \
  --alarm-description "Alert when error rate > 5%" \
  --metric-name Errors \
  --namespace AWS/Lambda \
  --statistic Sum \
  --period 300 \
  --evaluation-periods 1 \
  --threshold 5 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --dimensions Name=FunctionName,Value=sfdc-event-handler-prod

# Duration alarm
aws cloudwatch put-metric-alarm \
  --alarm-name sfdc-handler-high-duration \
  --alarm-description "Alert when duration > 30s" \
  --metric-name Duration \
  --namespace AWS/Lambda \
  --statistic Average \
  --period 300 \
  --evaluation-periods 2 \
  --threshold 30000 \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=FunctionName,Value=sfdc-event-handler-prod

# Throttle alarm
aws cloudwatch put-metric-alarm \
  --alarm-name sfdc-handler-throttles \
  --alarm-description "Alert when throttles occur" \
  --metric-name Throttles \
  --namespace AWS/Lambda \
  --statistic Sum \
  --period 300 \
  --evaluation-periods 1 \
  --threshold 1 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --dimensions Name=FunctionName,Value=sfdc-event-handler-prod
```

---

## Troubleshooting

### Lambda Timeout

**Symptoms:** Function times out after 15 minutes

**Solutions:**
1. Check logs for `TimeoutError`
2. Verify `getRemainingTimeInMillis()` before critical operations
3. Increase Lambda timeout (max 15 min)
4. Break large operations into smaller Lambda invocations

### OutOfMemory Error

**Symptoms:** Function crashes with out-of-memory

**Solutions:**
1. Increase Memory allocation (128MB - 10GB)
2. Check for memory leaks in code
3. Stream large responses instead of buffering
4. Use Lambda Layers for heavy dependencies

### DynamoDB Throttling

**Symptoms:** `ProvisionedThroughputExceededException`

**Solutions:**
1. Use on-demand billing mode
2. Increase provisioned throughput
3. Implement exponential backoff retry
4. Check for hot partitions

### SFDC Connection Errors

**Symptoms:** `ECONNREFUSED`, `ETIMEDOUT`

**Solutions:**
1. Verify SFDC instance URL
2. Check Security Groups allow outbound HTTPS
3. Verify Secrets Manager secret is valid
4. Check network connectivity
5. Increase timeout values

### LOB API Failures

**Symptoms:** 401, 403, 429 errors

**Solutions:**
1. Verify API key is valid
2. Check API rate limits
3. Ensure request format is correct
4. Verify LOB API endpoint

---

## Cleanup

To remove the Lambda function and associated resources:

```bash
# Delete CloudFormation stack
aws cloudformation delete-stack \
  --stack-name sfdc-event-handler-prod

# Delete S3 bucket (must be empty)
aws s3 rm s3://sfdc-lambda-artifacts-prod --recursive
aws s3 rb s3://sfdc-lambda-artifacts-prod

# Delete DynamoDB table
aws dynamodb delete-table \
  --table-name communication-logs

# Delete EventBridge rule targets
aws events remove-targets \
  --rule sfdc-communication-events \
  --ids "1"

# Delete EventBridge rule
aws events delete-rule \
  --name sfdc-communication-events

# Delete Secrets Manager secret
aws secretsmanager delete-secret \
  --secret-id prod_sfdc_auth \
  --force-delete-without-recovery
```

---

## Support

For issues or questions during deployment:
1. Check CloudWatch logs for specific error messages
2. Enable debug logging in Lambda environment
3. Review X-Ray traces for service dependencies
4. Check AWS IAM permissions
5. Verify network connectivity and security groups