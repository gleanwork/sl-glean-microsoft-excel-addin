# Deployment Runbook

This runbook describes a customer-owned AWS deployment of Glean in Excel.

## Prerequisites

- AWS CLI authenticated with a profile that can deploy CloudFormation, S3, CloudFront, API Gateway, Lambda, DynamoDB, IAM, Route53, and ACM.
- ACM certificate in `us-east-1` for the add-in domain, or permission to create one.
- Route53 hosted zone for the add-in domain.
- Glean tenant slug.
- Glean OAuth configuration:
  - preferred: Dynamic Client Registration enabled;
  - fallback: static OAuth client ID and secret with redirect URI `https://<domain>/oauth-callback.html`.

## Architecture Notes

The deployment intentionally uses two API Gateway surfaces:

- **HTTP API** handles `/api/config`, `/api/oauth/register`, `/api/oauth/token`, and `/api/client-error`.
- **Regional REST API** handles `/api/chat` with `ResponseTransferMode: STREAM`, a 300-second integration timeout, and Lambda response streaming.

CloudFront routes `/api/chat*` to the REST API origin and all other `/api/*` traffic to the HTTP API origin.

## Deploy

```bash
cp deployment/config/prod.env.example deployment/config/prod.env
```

Fill `deployment/config/prod.env`.

Provision a certificate if needed:

```bash
./deployment/scripts/provision-certificate.sh prod
```

Deploy infrastructure:

```bash
./deployment/scripts/deploy-infrastructure.sh prod
```

Create or update DNS:

```bash
./deployment/scripts/upsert-route53-alias.sh prod
```

Deploy app assets and generated manifest:

```bash
./deployment/scripts/deploy-app.sh prod
```

## Validate

1. Open `https://<domain>/manifest.xml` and confirm it loads.
2. Install the manifest through Microsoft 365 Admin Center or sideload it in Excel.
3. Launch the add-in.
4. Sign in with Glean.
5. Select a small range and ask: `Summarize the selected rows`.
6. Ask a question that triggers Glean clarification questions and submit answers.
7. Ask for a small write action, review the preview card, and apply it to a test range.
8. Test `New chat`, `Sign out`, and `Auto-apply edits`.

## Operations

- DynamoDB point-in-time recovery is enabled for the config table.
- Production customers should set Lambda log retention according to their internal policy. AWS creates Lambda log groups automatically on first invocation unless they are imported into CloudFormation.
- Production customers should add CloudWatch alarms for Lambda errors/timeouts and API Gateway 5xx responses.
- Production customers should add WAF rules or attach the deployment to their existing web perimeter if required.

## Rollback

Static app rollback is an S3 sync of a previous `dist/` artifact plus CloudFront invalidation. Infrastructure rollback should use CloudFormation stack rollback or a previously packaged template.
