#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."
source deployment/scripts/utils.sh

ENV_NAME="${1:-prod}"
load_env "$ENV_NAME"

DOMAIN="${DOMAIN_NAME:-gleaninexcel.gleandemo.com}"
ZONE_NAME="${ROUTE53_ZONE_NAME:-gleandemo.com}"
CLOUDFRONT_ZONE_ID="Z2FDTNDATAQYW2"

for var in AWS_PROFILE AWS_REGION STACK_NAME; do
  require_var "$var"
done

ZONE_ID="$(aws_cmd route53 list-hosted-zones-by-name \
  --dns-name "${ZONE_NAME}" \
  --query "HostedZones[?Name=='${ZONE_NAME}.'] | [0].Id" \
  --output text | sed 's#^/hostedzone/##')"

if [[ -z "$ZONE_ID" || "$ZONE_ID" == "None" ]]; then
  echo "Could not find Route53 hosted zone for ${ZONE_NAME}" >&2
  exit 1
fi

DISTRIBUTION_DOMAIN="$(aws_cmd cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs[?OutputKey=='DistributionDomainName'].OutputValue" \
  --output text)"

if [[ -z "$DISTRIBUTION_DOMAIN" || "$DISTRIBUTION_DOMAIN" == "None" ]]; then
  echo "Could not resolve DistributionDomainName from stack outputs." >&2
  exit 1
fi

CHANGE_BATCH="$(mktemp)"
cat >"${CHANGE_BATCH}" <<JSON
{
  "Comment": "Point ${DOMAIN} at Glean in Excel CloudFront distribution",
  "Changes": [
    {
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "${DOMAIN}",
        "Type": "A",
        "AliasTarget": {
          "HostedZoneId": "${CLOUDFRONT_ZONE_ID}",
          "DNSName": "${DISTRIBUTION_DOMAIN}",
          "EvaluateTargetHealth": false
        }
      }
    }
  ]
}
JSON

aws_cmd route53 change-resource-record-sets \
  --hosted-zone-id "${ZONE_ID}" \
  --change-batch "file://${CHANGE_BATCH}" >/dev/null
rm -f "${CHANGE_BATCH}"

echo "Route53 alias updated: ${DOMAIN} -> ${DISTRIBUTION_DOMAIN}"
