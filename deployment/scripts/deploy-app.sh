#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."
source deployment/scripts/utils.sh

ENV_NAME="${1:-prod}"
load_env "$ENV_NAME"

for var in AWS_PROFILE AWS_REGION STACK_NAME DOMAIN_NAME GLEAN_INSTANCE OAUTH_CLIENT_TYPE; do
  require_var "$var"
done

echo "Building app..."
npm run build
node deployment/scripts/generate-runtime-config.mjs
node deployment/scripts/generate-manifest.mjs

BUCKET_NAME="$(aws_cmd cloudformation describe-stacks --stack-name "$STACK_NAME" --query "Stacks[0].Outputs[?OutputKey=='StaticBucketName'].OutputValue" --output text)"
DISTRIBUTION_ID="$(aws_cmd cloudformation describe-stacks --stack-name "$STACK_NAME" --query "Stacks[0].Outputs[?OutputKey=='DistributionId'].OutputValue" --output text)"

if [[ -z "$BUCKET_NAME" || "$BUCKET_NAME" == "None" ]]; then
  echo "Could not resolve StaticBucketName from stack outputs." >&2
  exit 1
fi

echo "Uploading static assets to s3://$BUCKET_NAME"
aws_cmd s3 sync dist/ "s3://${BUCKET_NAME}/" \
  --delete \
  --cache-control "max-age=300"

echo "Invalidating CloudFront distribution $DISTRIBUTION_ID"
aws_cmd cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION_ID" \
  --paths "/*" >/dev/null

echo "App deployed."
echo "Manifest: https://${DOMAIN_NAME}/manifest.xml"
