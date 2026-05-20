import { requiredEnv } from "../lib/env";

declare const awslambda: {
  streamifyResponse: (
    handler: (event: any, responseStream: any, context: any) => Promise<void>,
  ) => unknown;
  HttpResponseStream: {
    from: (responseStream: any, metadata: unknown) => any;
  };
};

const maxBodyBytes = 128 * 1024;
const heartbeatMs = 10_000;

function headerValue(headers: Record<string, string | undefined> | undefined, name: string): string | null {
  if (!headers) {
    return null;
  }
  const direct = headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()];
  if (direct) {
    return direct;
  }
  const found = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return found?.[1] || null;
}

function bearerToken(event: any): string | null {
  const header = headerValue(event.headers, "authorization");
  if (!header?.startsWith("Bearer ")) {
    return null;
  }
  return header.slice("Bearer ".length).trim();
}

function requestBody(event: any): string {
  if (!event.body) {
    return "";
  }
  return event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
}

function sseData(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function extractText(response: any): string {
  const messages = response.messages || [];
  let text = "";
  for (const message of messages) {
    if (message.messageType === "CONTENT" || message.author === "GLEAN_AI") {
      for (const fragment of message.fragments || []) {
        text += fragment.text || "";
      }
    }
  }
  return text;
}

export const handler = awslambda.streamifyResponse(async (event, responseStream) => {
  responseStream = awslambda.HttpResponseStream.from(responseStream, {
    statusCode: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-store",
      "X-Accel-Buffering": "no",
    },
  });

  const write = (payload: unknown) => responseStream.write(sseData(payload));

  try {
    const token = bearerToken(event);
    if (!token) {
      write({ type: "error", error: "Sign in with Glean before asking a question.", status: 401 });
      responseStream.end();
      return;
    }

    const body = requestBody(event);
    if (Buffer.byteLength(body, "utf8") > maxBodyBytes) {
      write({
        type: "error",
        error: "Workbook context is too large. Select a smaller range and try again.",
        status: 413,
      });
      responseStream.end();
      return;
    }

    write({ type: "progress", message: "Glean is analyzing the workbook context." });
    const heartbeat = setInterval(() => {
      responseStream.write(": heartbeat\n\n");
    }, heartbeatMs);

    try {
      const instance = requiredEnv("GLEAN_INSTANCE");
      const upstream = await fetch(`https://${instance}-be.glean.com/rest/api/v1/chat`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Glean-Auth-Type": "OAUTH",
          "Content-Type": "application/json",
        },
        body,
      });

      const text = await upstream.text();
      if (!upstream.ok) {
        write({
          type: "error",
          error: "Glean could not answer this request.",
          status: upstream.status,
          details: text.slice(0, 500),
        });
        responseStream.end();
        return;
      }

      const parsed = JSON.parse(text);
      write({ type: "final", ...parsed, text: extractText(parsed) });
      responseStream.end();
    } finally {
      clearInterval(heartbeat);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    write({ type: "error", error: message });
    responseStream.end();
  }
});
