import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { getDcrConfig, putDcrConfig } from "../lib/configStore";
import { optionalEnv, requiredEnv } from "../lib/env";
import { json, method, noContent, parseJsonBody } from "../lib/http";

interface RegisterBody {
  redirectUri?: string;
}

export async function handler(event: APIGatewayProxyEventV2) {
  if (method(event) === "OPTIONS") {
    return noContent();
  }
  if (method(event) !== "POST") {
    return json(405, { error: "Method not allowed." });
  }

  const body = parseJsonBody<RegisterBody>(event);
  const allowedRedirectUri = requiredEnv("OAUTH_REDIRECT_URI");
  if (body.redirectUri && body.redirectUri !== allowedRedirectUri) {
    return json(400, { error: "Redirect URI is not allowed for this deployment." });
  }

  const cached = await getDcrConfig();
  if (cached?.clientId && cached.redirectUri === allowedRedirectUri) {
    return json(200, { client_id: cached.clientId, cached: true });
  }

  const instance = requiredEnv("GLEAN_INSTANCE");
  const response = await fetch(`https://${instance}-be.glean.com/oauth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: optionalEnv("DCR_CLIENT_NAME", "Glean in Excel"),
      redirect_uris: [allowedRedirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
  });

  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok || !responseBody.client_id) {
    return json(response.status || 502, {
      error: "DCR registration failed.",
      details: responseBody.error || responseBody.error_description || "Unknown DCR error.",
    });
  }

  await putDcrConfig({
    clientId: responseBody.client_id,
    redirectUri: allowedRedirectUri,
    createdAt: new Date().toISOString(),
  });

  return json(200, { client_id: responseBody.client_id, cached: false });
}
