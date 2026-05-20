import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { verifyGleanToken } from "../lib/auth";
import { getAdminEmails } from "../lib/configStore";
import { publicRuntimeConfig } from "../lib/env";
import { bearerToken, json, method, noContent } from "../lib/http";

export async function handler(event: APIGatewayProxyEventV2) {
  if (method(event) === "OPTIONS") {
    return noContent();
  }

  if (method(event) === "GET") {
    return json(200, publicRuntimeConfig());
  }

  if (method(event) === "PUT") {
    const token = bearerToken(event);
    if (!token) {
      return json(401, { error: "Missing bearer token." });
    }
    const identity = await verifyGleanToken(token);
    const admins = await getAdminEmails();
    if (!identity.email || !admins.includes(identity.email)) {
      return json(403, { error: "Only configured admins can update settings." });
    }
    return json(501, {
      error: "Admin config updates are reserved for the next implementation slice.",
    });
  }

  return json(405, { error: "Method not allowed." });
}
