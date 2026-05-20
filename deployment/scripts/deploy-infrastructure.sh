#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."
source deployment/scripts/utils.sh

ENV_NAME="${1:-prod}"
load_env "$ENV_NAME"

for var in AWS_PROFILE AWS_REGION STACK_NAME DEPLOYMENT_ID DOMAIN_NAME CERTIFICATE_ARN ARTIFACT_BUCKET GLEAN_INSTANCE OAUTH_CLIENT_TYPE; do
  require_var "$var"
done

echo "Building frontend and backend..."
npm run build

echo "Ensuring artifact bucket exists: $ARTIFACT_BUCKET"
if ! aws_cmd s3api head-bucket --bucket "$ARTIFACT_BUCKET" >/dev/null 2>&1; then
  aws_cmd s3 mb "s3://${ARTIFACT_BUCKET}" --region "$AWS_REGION"
fi

echo "Packaging CloudFormation template..."
aws_cmd cloudformation package \
  --template-file deployment/cloudformation.yaml \
  --s3-bucket "$ARTIFACT_BUCKET" \
  --output-template-file deployment/.packaged.yaml

echo "Deploying stack: $STACK_NAME"
aws_cmd cloudformation deploy \
  --template-file deployment/.packaged.yaml \
  --stack-name "$STACK_NAME" \
  --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND \
  --parameter-overrides \
    DeploymentId="$DEPLOYMENT_ID" \
    DomainName="$DOMAIN_NAME" \
    CertificateArn="$CERTIFICATE_ARN" \
    GleanInstance="$GLEAN_INSTANCE" \
    OAuthClientType="$OAUTH_CLIENT_TYPE" \
    GleanOAuthClientId="${GLEAN_OAUTH_CLIENT_ID:-}" \
    GleanOAuthClientSecret="${GLEAN_OAUTH_CLIENT_SECRET:-}" \
    AdminEmails="${ADMIN_EMAILS:-}" \
    ArtifactBucketName="$ARTIFACT_BUCKET"

aws_cmd cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --query 'Stacks[0].Outputs' \
  --output table
