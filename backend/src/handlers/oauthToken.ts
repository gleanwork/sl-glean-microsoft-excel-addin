import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { optionalEnv, requiredEnv } from "../lib/env";
import { json, method, noContent, parseJsonBody } from "../lib/http";

type TokenBody = Record<string, string | undefined>;

export async function handler(event: APIGatewayProxyEventV2) {
  if (method(event) === "OPTIONS") {
    return noContent();
  }
  if (method(event) !== "POST") {
    return json(405, { error: "Method not allowed." });
  }

  const body = parseJsonBody<TokenBody>(event);
  const allowedRedirectUri = requiredEnv("OAUTH_REDIRECT_URI");
  if (body.redirect_uri && body.redirect_uri !== allowedRedirectUri) {
    return json(400, { error: "Redirect URI is not allowed for this deployment." });
  }

  const instance = requiredEnv("GLEAN_INSTANCE");
  const clientSecret = optionalEnv("GLEAN_OAUTH_CLIENT_SECRET", "");
  const form = new URLSearchParams();
  for (const key of [
    "grant_type",
    "code",
    "redirect_uri",
    "client_id",
    "code_verifier",
    "refresh_token",
    "scope",
  ]) {
    if (body[key]) {
      form.set(key, body[key]);
    }
  }
  if (clientSecret) {
    form.set("client_secret", clientSecret);
  }

  const response = await fetch(`https://${instance}-be.glean.com/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  const text = await response.text();
  return {
    statusCode: response.status,
    headers: {
      "Content-Type": response.headers.get("content-type") || "application/json",
      "Cache-Control": "no-store",
    },
    body: text,
  };
}
