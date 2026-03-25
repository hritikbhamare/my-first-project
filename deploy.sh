#!/bin/bash

# SFDC Event Handler Lambda - Deployment Script
# This script facilitates AWS SAM deployment with proper configuration

set -e

echo "=========================================="
echo "SFDC Event Handler Lambda Deployment"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check prerequisites
echo "Checking prerequisites..."

if ! command -v sam &> /dev/null; then
    echo -e "${RED}❌ AWS SAM CLI not found. Please install it first.${NC}"
    echo "   https://aws.amazon.com/serverless/sam/"
    exit 1
fi

if ! command -v aws &> /dev/null; then
    echo -e "${RED}❌ AWS CLI not found. Please install it first.${NC}"
    echo "   https://aws.amazon.com/cli/"
    exit 1
fi

if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js not found. Please install Node.js 18.x or higher.${NC}"
    exit 1
fi

echo -e "${GREEN}✓ All prerequisites met${NC}"
echo ""

# Determine deployment mode
echo "Choose deployment mode:"
echo "1) Guided deployment (interactive)"
echo "2) Quick deployment (uses defaults)"
echo "3) Build only (no deployment)"
echo ""
read -p "Enter option (1-3): " deployment_mode

# Get environment parameters
read -p "Environment (dev/staging/prod) [dev]: " environment
environment=${environment:-dev}

# Build the function
echo ""
echo "Building Lambda function..."
sam build || { echo -e "${RED}❌ Build failed${NC}"; exit 1; }
echo -e "${GREEN}✓ Build successful${NC}"

# Deploy
echo ""

if [ "$deployment_mode" == "1" ]; then
    echo "Starting guided deployment..."
    sam deploy --guided \
        --parameter-overrides \
            Environment=$environment
    
elif [ "$deployment_mode" == "2" ]; then
    # Quick deployment with defaults
    read -p "Stack name [sfdc-event-handler-${environment}]: " stack_name
    stack_name=${stack_name:-sfdc-event-handler-${environment}}
    
    read -p "S3 bucket for artifacts []: " s3_bucket
    
    read -p "DynamoDB table name [communication-logs]: " table_name
    table_name=${table_name:-communication-logs}
    
    read -p "Environment name for SFDC [prod]: " env_name
    env_name=${env_name:-prod}
    
    read -p "LOB API hostname [api.lob.com]: " hostname
    hostname=${hostname:-api.lob.com}
    
    read -p "LOB API path [/v1/letters]: " path
    path=${path:-/v1/letters}
    
    read -p "SFDC CRM path [/services/data/v62.0/composite]: " crmpath
    crmpath=${crmpath:-/services/data/v62.0/composite}
    
    echo ""
    echo "Deploying with parameters..."
    sam deploy \
        --stack-name "$stack_name" \
        --s3-bucket "$s3_bucket" \
        --parameter-overrides \
            Environment=$environment \
            TableName=$table_name \
            EnvName=$env_name \
            HostName=$hostname \
            EmailPath=$path \
            CrmPath=$crmpath \
        --capabilities CAPABILITY_IAM
    
elif [ "$deployment_mode" == "3" ]; then
    echo -e "${GREEN}✓ Build complete. Skipping deployment.${NC}"
    echo "To deploy, run:"
    echo "  sam deploy --guided"
    exit 0
else
    echo -e "${RED}❌ Invalid option${NC}"
    exit 1
fi

echo ""
echo "=========================================="
echo -e "${GREEN}✓ Deployment completed!${NC}"
echo "=========================================="
echo ""

# Get function details
function_name=$(aws cloudformation describe-stacks \
    --stack-name "${stack_name:-sfdc-event-handler-${environment}}" \
    --query 'Stacks[0].Outputs[?OutputKey==`FunctionName`].OutputValue' \
    --output text 2>/dev/null || echo "")

if [ -n "$function_name" ]; then
    echo "Function Name: $function_name"
    echo ""
    echo "Test the function:"
    echo "  sam local invoke SFDCEventHandlerFunction -e events/test-event.json"
    echo ""
    echo "View logs:"
    echo "  sam logs -n SFDCEventHandlerFunction --stack-name ${stack_name:-sfdc-event-handler-${environment}} --tail"
    echo ""
    echo "View metrics:"
    echo "  aws cloudwatch get-metric-statistics --namespace AWS/Lambda --metric-name Invocations --dimensions Name=FunctionName,Value=$function_name --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) --end-time $(date -u +%Y-%m-%dT%H:%M:%S) --period 300 --statistics Sum"
fi

echo ""