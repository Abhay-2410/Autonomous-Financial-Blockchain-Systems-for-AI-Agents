#Requires -Version 5.1
param(
  [string]$Region = $(if ($env:AWS_REGION) { $env:AWS_REGION } else { "eu-north-1" }),
  [string]$MainStack = "agent-wallet-dev",
  [string]$NitroStack = "agent-wallet-nitro-dev",
  [string]$Environment = "dev"
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

Write-Host "==> LimitX Nitro host deploy (Windows / PowerShell)" -ForegroundColor Cyan
Write-Host "    Region=$Region  MainStack=$MainStack  NitroStack=$NitroStack"
Write-Host ""
Write-Host "Free Tier? Skip this script — use the main SAM stack Lambda signer instead." -ForegroundColor Yellow
Write-Host ""

if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
  throw "AWS CLI not found. Install AWS CLI v2 and configure credentials."
}

Write-Host "==> Resolving SigningKeyArn from stack $MainStack ..."
$keyArn = aws cloudformation describe-stacks `
  --stack-name $MainStack `
  --region $Region `
  --query "Stacks[0].Outputs[?OutputKey=='SigningKeyArn'].OutputValue" `
  --output text 2>$null

if (-not $keyArn -or $keyArn -eq "None") {
  $keyId = aws cloudformation describe-stacks `
    --stack-name $MainStack `
    --region $Region `
    --query "Stacks[0].Outputs[?OutputKey=='SigningKeyId'].OutputValue" `
    --output text
  if (-not $keyId -or $keyId -eq "None") {
    throw "Could not read SigningKeyArn/SigningKeyId from $MainStack. Deploy the main SAM stack first."
  }
  $account = aws sts get-caller-identity --query Account --output text
  $keyArn = "arn:aws:kms:${Region}:${account}:key/$keyId"
}

Write-Host "    SigningKeyArn=$keyArn"
Write-Host ""
Write-Host "==> Deploying $NitroStack (EC2 + VPC + exclusive KMS role) ..." -ForegroundColor Cyan

aws cloudformation deploy `
  --template-file "$here\nitro-enclave.yaml" `
  --stack-name $NitroStack `
  --parameter-overrides "Environment=$Environment" "SigningKeyArn=$keyArn" `
  --capabilities CAPABILITY_NAMED_IAM `
  --region $Region

if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "CloudFormation failed. Recent CREATE_FAILED events:" -ForegroundColor Red
  aws cloudformation describe-stack-events `
    --stack-name $NitroStack `
    --region $Region `
    --query "StackEvents[?ResourceStatus=='CREATE_FAILED'].[LogicalResourceId,ResourceStatusReason]" `
    --output text
  Write-Host ""
  Write-Host "Common cause: Free Tier-only accounts cannot launch c5.xlarge/m5.xlarge," -ForegroundColor Yellow
  Write-Host "and Nitro Enclaves require those (or larger) instance types."
  Write-Host "Skip Nitro: do not re-run this script. Redeploy the main SAM stack with"
  Write-Host "empty EnclaveParentUrl so SignTransaction Lambda keeps kms:Sign:"
  Write-Host "  cd ..; sam build --template template.yaml; sam deploy"
  throw "cloudformation deploy failed with exit $LASTEXITCODE"
}

Write-Host ""
Write-Host "==> Stack outputs" -ForegroundColor Green
aws cloudformation describe-stacks `
  --stack-name $NitroStack `
  --region $Region `
  --query "Stacks[0].Outputs" `
  --output table

$instanceId = aws cloudformation describe-stacks `
  --stack-name $NitroStack `
  --region $Region `
  --query "Stacks[0].Outputs[?OutputKey=='NitroEnclaveInstanceId'].OutputValue" `
  --output text

$privateIp = aws cloudformation describe-stacks `
  --stack-name $NitroStack `
  --region $Region `
  --query "Stacks[0].Outputs[?OutputKey=='NitroEnclavePrivateIp'].OutputValue" `
  --output text

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host " Host stack is up. Do NOT run deploy.sh here."
Write-Host "============================================"
Write-Host " InstanceId : $instanceId"
Write-Host " PrivateIp  : $privateIp"
Write-Host ""
Write-Host " Next - on that Amazon Linux EC2 (SSM or SSH):"
Write-Host "   1. Clone/copy this repo onto the instance"
Write-Host "   2. sudo AWS_REGION=$Region bash infra/nitro-enclave/deploy.sh"
Write-Host ""
Write-Host " Open a shell on the instance from PowerShell:"
Write-Host "   aws ssm start-session --target $instanceId --region $Region"
Write-Host "============================================"
