import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { json, method, noContent, parseJsonBody } from "../lib/http";

interface ClientErrorBody {
  kind?: string;
  message?: string;
  status?: number;
}

export async function handler(event: APIGatewayProxyEventV2) {
  if (method(event) === "OPTIONS") {
    return noContent();
  }
  if (method(event) !== "POST") {
    return json(405, { error: "Method not allowed." });
  }

  const body = parseJsonBody<ClientErrorBody>(event);
  console.warn("client_error", {
    kind: String(body.kind || "unknown").slice(0, 80),
    message: String(body.message || "").slice(0, 240),
    status: body.status,
  });
  return json(202, { ok: true });
}
