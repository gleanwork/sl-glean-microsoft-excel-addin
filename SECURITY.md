# Security

## Reporting

Please report security issues privately to the repository maintainers. Do not open public issues containing credentials, tenant names, customer data, or exploit details.

## Deployment Notes

- Use Glean OAuth with PKCE. Do not ask end users to paste Glean API tokens.
- Prefer Dynamic Client Registration. If using a static OAuth client, keep the client secret server-side only.
- Do not commit `deployment/config/prod.env`, generated `manifest.xml`, OAuth secrets, AWS credentials, real customer workbook data, or Glean tokens.
- Keep CORS scoped to the deployed domain.
- Do not log prompts, selected range contents, workbook contents, bearer tokens, refresh tokens, or customer data.
- Review workbook updates before applying them. Write-back is intentionally approval-gated by default.
- Configure CloudWatch log retention, WAF rate limits, and DynamoDB point-in-time recovery for customer deployments.

## Data Handling

The add-in samples workbook context before sending it to Glean:

- Selected range preview: up to 25 rows x 15 columns.
- Workbook fallback preview: up to 25 rows x 15 columns per sampled sheet, up to 8 sheets.
- Total prompt context cap: 25,000 characters.

The UI shows when context is capped. Users can select a smaller range when they want Glean to see every selected cell.

## Logging

The reference backend must not log workbook contents, prompts, OAuth tokens, refresh tokens, or Glean responses. Temporary shape-only debugging should be removed or feature-gated before publishing.

## Customer Hardening

Before broad rollout, customers should consider:

- WAF rules on CloudFront or API Gateway.
- CloudWatch alarms for Lambda errors/timeouts and API Gateway 5xx.
- Centralized log shipping and retention policies.
- Security review of OAuth scopes and redirect URIs.
- Internal runbook for rotating static OAuth client secrets, if static mode is used.
