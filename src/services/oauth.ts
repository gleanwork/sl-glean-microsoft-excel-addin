import type { OAuthTokens, RuntimeConfig } from "../types";
import { apiUrl } from "./config";
import { authStorage } from "./storage";

function randomString(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, length);
}

async function sha256(input: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function codeChallenge(verifier: string): Promise<string> {
  return base64UrlEncode(await sha256(verifier));
}

function gleanBase(config: RuntimeConfig): string {
  if (!config.gleanInstance) {
    throw new Error("Glean instance is not configured for this deployment.");
  }
  return `https://${config.gleanInstance}-be.glean.com`;
}

async function registerDcrClient(config: RuntimeConfig): Promise<string> {
  const cached = authStorage.getDcrClientId();
  if (cached) {
    return cached;
  }

  const response = await fetch(apiUrl(config, "/oauth/register"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ redirectUri: `${window.location.origin}/oauth-callback.html` }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.client_id) {
    throw new Error(body.error || "Could not register the Glean OAuth client.");
  }
  authStorage.setDcrClientId(body.client_id);
  return body.client_id;
}

async function getClientId(config: RuntimeConfig): Promise<string> {
  if (config.oauthClientType === "dcr") {
    return registerDcrClient(config);
  }
  if (!config.oauthClientId) {
    throw new Error("Static OAuth client ID is not configured.");
  }
  return config.oauthClientId;
}

export async function buildAuthorizationUrl(config: RuntimeConfig): Promise<string> {
  const clientId = await getClientId(config);
  const verifier = randomString(64);
  const state = randomString(32);
  authStorage.storePkce(verifier, state);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: `${window.location.origin}/oauth-callback.html`,
    scope: "chat search",
    state,
    code_challenge: await codeChallenge(verifier),
    code_challenge_method: "S256",
  });

  return `${gleanBase(config)}/oauth/authorize?${params.toString()}`;
}

export async function exchangeCode(
  config: RuntimeConfig,
  code: string,
  state: string,
): Promise<OAuthTokens> {
  const pkce = authStorage.readPkce();
  if (pkce.state !== state) {
    throw new Error("Sign-in state did not match. Please try again.");
  }

  const clientId = await getClientId(config);
  const redirectUri = `${window.location.origin}/oauth-callback.html`;
  const response = await fetch(apiUrl(config, "/oauth/token"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: pkce.verifier,
    }),
  });

  authStorage.clearPkce();
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (config.oauthClientType === "dcr" && body.error === "invalid_client") {
      authStorage.clearDcrClientId();
    }
    throw new Error(body.error_description || body.error || "Glean sign-in failed.");
  }

  const tokens = body as OAuthTokens;
  authStorage.storeTokens(tokens);
  return tokens;
}

export async function getValidAccessToken(config: RuntimeConfig): Promise<string | null> {
  const accessToken = authStorage.getAccessToken();
  if (accessToken && !authStorage.isAccessTokenExpired()) {
    return accessToken;
  }

  const refreshToken = authStorage.getRefreshToken();
  if (!refreshToken) {
    return null;
  }

  const clientId = await getClientId(config);
  const response = await fetch(apiUrl(config, "/oauth/token"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    authStorage.clearTokens(config.oauthClientType === "dcr" && body.error === "invalid_client");
    return null;
  }

  const tokens = body as OAuthTokens;
  authStorage.storeTokens(tokens);
  return tokens.access_token;
}
