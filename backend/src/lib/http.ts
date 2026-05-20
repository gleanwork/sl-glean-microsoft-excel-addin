import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";

export interface LambdaContext {
  event: APIGatewayProxyEventV2;
  requestId: string;
}

export function json(
  statusCode: number,
  body: unknown,
  headers: Record<string, string> = {},
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...headers,
    },
    body: JSON.stringify(body),
  };
}

export function noContent(): APIGatewayProxyStructuredResultV2 {
  return { statusCode: 204, body: "" };
}

export function parseJsonBody<T>(event: APIGatewayProxyEventV2): T {
  if (!event.body) {
    return {} as T;
  }
  const body = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
  return JSON.parse(body) as T;
}

export function bearerToken(event: APIGatewayProxyEventV2): string | null {
  const header = event.headers.authorization || event.headers.Authorization;
  if (!header?.startsWith("Bearer ")) {
    return null;
  }
  return header.slice("Bearer ".length).trim();
}

export function method(event: APIGatewayProxyEventV2): string {
  return event.requestContext.http.method.toUpperCase();
}

export function requestOrigin(event: APIGatewayProxyEventV2): string {
  return event.headers.origin || event.headers.Origin || "";
}
