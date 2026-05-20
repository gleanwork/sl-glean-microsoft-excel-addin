import { createRemoteJWKSet, jwtVerify } from "jose";
import { optionalEnv, requiredEnv } from "./env";

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks() {
  if (!jwks) {
    const instance = requiredEnv("GLEAN_INSTANCE");
    jwks = createRemoteJWKSet(new URL(`https://${instance}-be.glean.com/oauth/jwks`));
  }
  return jwks;
}

export async function verifyGleanToken(token: string): Promise<{ email?: string }> {
  const instance = requiredEnv("GLEAN_INSTANCE");
  const clientId = optionalEnv("GLEAN_OAUTH_CLIENT_ID", "glean-api");
  const issuer = `https://${instance}-be.glean.com/oauth`;
  const { payload } = await jwtVerify(token, getJwks(), {
    issuer,
    audience: [clientId, "glean-api"],
  });
  return {
    email:
      typeof payload.email === "string"
        ? payload.email.toLowerCase()
        : typeof payload.preferred_username === "string"
          ? payload.preferred_username.toLowerCase()
          : undefined,
  };
}
