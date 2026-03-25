# SFDC Event Handler Lambda - Deployment Script (PowerShell)
# This script facilitates AWS SAM deployment on Windows

param(
    [ValidateSet("build", "deploy", "test", "logs")][string]$Action = "deploy",
    [string]$Environment = "dev",
    [string]$StackName = ""
)

Write-Host "=========================================="
Write-Host "SFDC Event Handler Lambda Deployment"
Write-Host "=========================================" -ForegroundColor Green
Write-Host ""

# Check prerequisites
Write-Host "Checking prerequisites..." -ForegroundColor Yellow

$prereqs = @("sam", "aws", "node")
$missing = @()

foreach ($cmd in $prereqs) {
    try {
        $null = & $cmd --version 2>$null
        Write-Host "✓ $cmd found" -ForegroundColor Green
    }
    catch {
        $missing += $cmd
        Write-Host "❌ $cmd not found" -ForegroundColor Red
    }
}

if ($missing.Count -gt 0) {
    Write-Host ""
    Write-Host "Missing prerequisites: $($missing -join ', ')" -ForegroundColor Red
    Write-Host ""
    Write-Host "Installation links:"
    Write-Host "  AWS SAM: https://aws.amazon.com/serverless/sam/"
    Write-Host "  AWS CLI: https://aws.amazon.com/cli/"
    Write-Host "  Node.js: https://nodejs.org/ (18.x or higher)"
    exit 1
}

Write-Host "✓ All prerequisites met" -ForegroundColor Green
Write-Host ""

# Set default stack name
if ([string]::IsNullOrEmpty($StackName)) {
    $StackName = "sfdc-event-handler-$Environment"
}

# Function to build
function Invoke-Build {
    Write-Host "Building Lambda function..." -ForegroundColor Yellow
    sam build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Build failed" -ForegroundColor Red
        exit 1
    }
    Write-Host "✓ Build successful" -ForegroundColor Green
}

# Function to deploy
function Invoke-Deploy {
    Invoke-Build
    Write-Host ""
    Write-Host "Choose deployment mode:" -ForegroundColor Cyan
    Write-Host "1) Guided deployment (interactive)"
    Write-Host "2) Quick deployment (uses defaults)"
    Write-Host ""
    
    $mode = Read-Host "Enter option (1-2)"
    
    if ($mode -eq "1") {
        Write-Host "Starting guided deployment..." -ForegroundColor Yellow
        sam deploy --guided `
            --parameter-overrides Environment=$Environment
    }
    elseif ($mode -eq "2") {
        Write-Host "Enter deployment parameters:" -ForegroundColor Cyan
        
        $tableName = Read-Host "DynamoDB table name [communication-logs]"
        if ([string]::IsNullOrEmpty($tableName)) { $tableName = "communication-logs" }
        
        $envName = Read-Host "Environment name for SFDC [prod]"
        if ([string]::IsNullOrEmpty($envName)) { $envName = "prod" }
        
        $hostname = Read-Host "LOB API hostname [api.lob.com]"
        if ([string]::IsNullOrEmpty($hostname)) { $hostname = "api.lob.com" }
        
        $path = Read-Host "LOB API path [/v1/letters]"
        if ([string]::IsNullOrEmpty($path)) { $path = "/v1/letters" }
        
        $crmpath = Read-Host "SFDC CRM path [/services/data/v62.0/composite]"
        if ([string]::IsNullOrEmpty($crmpath)) { $crmpath = "/services/data/v62.0/composite" }
        
        Write-Host ""
        Write-Host "Deploying..." -ForegroundColor Yellow
        
        sam deploy `
            --stack-name $StackName `
            --parameter-overrides `
                Environment=$Environment `
                TableName=$tableName `
                EnvName=$envName `
                HostName=$hostname `
                EmailPath=$path `
                CrmPath=$crmpath `
            --capabilities CAPABILITY_IAM
    }
    else {
        Write-Host "Invalid option" -ForegroundColor Red
        exit 1
    }
}

# Function to test
function Invoke-Test {
    Write-Host "Testing Lambda function locally..." -ForegroundColor Yellow
    
    $eventFile = "events/test-event.json"
    if (-not (Test-Path $eventFile)) {
        Write-Host "Creating test event file..." -ForegroundColor Cyan
        @"
{
  "detail": {
    "payload": {
      "Request_Payload__c": "{}",
      "LogID__c": "a12XX000000000AAA"
    }
  }
}
"@ | Out-File -FilePath $eventFile -Encoding UTF8
    }
    
    sam local invoke SFDCEventHandlerFunction -e $eventFile
}

# Function to view logs
function Invoke-Logs {
    Write-Host "Fetching Lambda logs..." -ForegroundColor Yellow
    sam logs -n SFDCEventHandlerFunction --stack-name $StackName --tail
}

# Execute action
switch ($Action) {
    "build" {
        Invoke-Build
    }
    "deploy" {
        Invoke-Deploy
    }
    "test" {
        Invoke-Test
    }
    "logs" {
        Invoke-Logs
    }
    default {
        Write-Host "Invalid action" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "=========================================="
Write-Host "Done!" -ForegroundColor Green
Write-Host "=========================================="