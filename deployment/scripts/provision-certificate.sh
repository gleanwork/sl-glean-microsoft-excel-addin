#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."
source deployment/scripts/utils.sh

ENV_NAME="${1:-prod}"
load_env "$ENV_NAME"

DOMAIN="${DOMAIN_NAME:-gleaninexcel.gleandemo.com}"
ZONE_NAME="${ROUTE53_ZONE_NAME:-gleandemo.com}"
CERT_REGION="us-east-1"

require_var AWS_PROFILE

echo "Looking up hosted zone for ${ZONE_NAME}"
ZONE_ID="$(aws_cmd route53 list-hosted-zones-by-name \
  --dns-name "${ZONE_NAME}" \
  --query "HostedZones[?Name=='${ZONE_NAME}.'] | [0].Id" \
  --output text | sed 's#^/hostedzone/##')"

if [[ -z "$ZONE_ID" || "$ZONE_ID" == "None" ]]; then
  echo "Could not find Route53 hosted zone for ${ZONE_NAME}" >&2
  exit 1
fi

echo "Checking for existing ACM certificate for ${DOMAIN}"
CERT_ARN="$(AWS_PROFILE="${AWS_PROFILE}" aws acm list-certificates \
  --region "${CERT_REGION}" \
  --certificate-statuses ISSUED PENDING_VALIDATION \
  --query "CertificateSummaryList[?DomainName=='${DOMAIN}'] | [0].CertificateArn" \
  --output text)"

if [[ -z "$CERT_ARN" || "$CERT_ARN" == "None" ]]; then
  echo "Requesting ACM certificate for ${DOMAIN}"
  CERT_ARN="$(AWS_PROFILE="${AWS_PROFILE}" aws acm request-certificate \
    --region "${CERT_REGION}" \
    --domain-name "${DOMAIN}" \
    --validation-method DNS \
    --idempotency-token "$(echo "${DOMAIN}" | tr -cd '[:alnum:]' | cut -c1-32)" \
    --query CertificateArn \
    --output text)"
fi

echo "Certificate ARN: ${CERT_ARN}"
echo "Waiting for DNS validation record to become available..."
for _ in {1..30}; do
  VALIDATION_JSON="$(AWS_PROFILE="${AWS_PROFILE}" aws acm describe-certificate \
    --region "${CERT_REGION}" \
    --certificate-arn "${CERT_ARN}" \
    --query "Certificate.DomainValidationOptions[0].ResourceRecord" \
    --output json)"
  if [[ "$VALIDATION_JSON" != "null" ]]; then
    break
  fi
  sleep 5
done

RECORD_NAME="$(node -e "const r=${VALIDATION_JSON}; console.log(r.Name)")"
RECORD_TYPE="$(node -e "const r=${VALIDATION_JSON}; console.log(r.Type)")"
RECORD_VALUE="$(node -e "const r=${VALIDATION_JSON}; console.log(r.Value)")"

echo "Creating validation record ${RECORD_NAME}"
CHANGE_BATCH="$(mktemp)"
cat >"${CHANGE_BATCH}" <<JSON
{
  "Comment": "Validate ACM certificate for ${DOMAIN}",
  "Changes": [
    {
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "${RECORD_NAME}",
        "Type": "${RECORD_TYPE}",
        "TTL": 300,
        "ResourceRecords": [{ "Value": "${RECORD_VALUE}" }]
      }
    }
  ]
}
JSON

aws_cmd route53 change-resource-record-sets \
  --hosted-zone-id "${ZONE_ID}" \
  --change-batch "file://${CHANGE_BATCH}" >/dev/null
rm -f "${CHANGE_BATCH}"

echo "Waiting for certificate validation..."
AWS_PROFILE="${AWS_PROFILE}" aws acm wait certificate-validated \
  --region "${CERT_REGION}" \
  --certificate-arn "${CERT_ARN}"

echo "Certificate validated: ${CERT_ARN}"
echo "Set CERTIFICATE_ARN=${CERT_ARN} in deployment/config/${ENV_NAME}.env"
