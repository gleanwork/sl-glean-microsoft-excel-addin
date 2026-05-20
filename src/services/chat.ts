import type {
  ClarifyingQuestion,
  ClarifyingQuestionResponse,
  ClarifyingQuestionsArtifact,
  RuntimeConfig,
  SelectionContext,
} from "../types";
import { apiUrl } from "./config";

export interface ChatResult {
  text: string;
  chatId: string | null;
  followUpPrompts: string[];
  clarifyingQuestions: ClarifyingQuestionsArtifact | null;
}

export function buildAssistantPrompt(question: string, selection: SelectionContext | null): string {
  const instructions = [
    "You are Glean, helping the user inside Microsoft Excel.",
    "Answer concisely and ground your answer in the workbook context when it is provided.",
    "",
    "If and only if the user asks you to write, fill, update, insert, replace, or otherwise modify cells, append exactly one action block:",
    "<glean_action>",
    '{"action":"writeRange","address":"B2:C3","values":[["Example","Value"]],"autofitColumns":true}',
    "</glean_action>",
    "",
    "Rules for write actions:",
    "- Use values for normal cell values and formulas for formulas.",
    "- The address dimensions must match the values or formulas dimensions.",
    "- If the user did not specify a target, anchor the write at the selected range.",
    "- Do not include a write action for read-only questions.",
  ];

  if (selection) {
    instructions.push("");
    instructions.push(`Current selection: ${selection.displayAddress}`);
    if (selection.expandedFromWorkbook) {
      instructions.push("The selected cells appeared empty, so this is a capped workbook preview.");
    } else {
      instructions.push("Selected cell preview:");
    }
    instructions.push(selection.contents || "(No visible cell contents.)");
    if (selection.truncated) {
      instructions.push("The preview was truncated before sending.");
    }
  }

  return `${instructions.join("\n")}\n\nUser request:\n${question}`;
}

export async function sendChat(
  config: RuntimeConfig,
  accessToken: string,
  prompt: string,
  chatId?: string | null,
): Promise<ChatResult> {
  return sendChatRequest(config, accessToken, {
    chatId,
    messages: [
      {
        author: "USER",
        fragments: [{ text: prompt }],
      },
    ],
  });
}

export async function sendClarifyingQuestionResponses(
  config: RuntimeConfig,
  accessToken: string,
  chatId: string | null,
  artifact: ClarifyingQuestionsArtifact,
  responses: ClarifyingQuestionResponse[],
): Promise<ChatResult> {
  const artifactInfo: Record<string, unknown> = {
    id: artifact.id,
    action: {
      clarifyingQuestionResponses: {
        responses,
      },
    },
  };
  if (typeof artifact.version === "number") {
    artifactInfo.version = artifact.version;
  }

  return sendChatRequest(config, accessToken, {
    chatId,
    messages: [
      {
        author: "USER",
        messageType: "CONTENT",
        fragments: [{ text: responses.length ? "Answered clarification questions." : "Skipped clarification questions." }],
        artifactInfo,
      },
    ],
  });
}

async function sendChatRequest(
  config: RuntimeConfig,
  accessToken: string,
  request: {
    chatId?: string | null;
    messages: unknown[];
  },
): Promise<ChatResult> {
  const requestBody: Record<string, unknown> = {
    stream: false,
    messages: request.messages,
  };
  if (request.chatId) {
    requestBody.chatId = request.chatId;
  }

  const response = await fetch(apiUrl(config, "/chat"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("text/event-stream")) {
    return readSseChatResponse(response);
  }

  const responseBody = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(
      typeof responseBody.error === "string"
        ? responseBody.error
        : `Glean request failed with HTTP ${response.status}.`,
    );
  }

  if (typeof responseBody.text === "string") {
    return {
      text: responseBody.text,
      chatId: typeof responseBody.chatId === "string" ? responseBody.chatId : null,
      followUpPrompts: extractFollowUpPrompts(responseBody),
      clarifyingQuestions: extractClarifyingQuestions(responseBody),
    };
  }
  return {
    text: extractChatText(responseBody),
    chatId: typeof responseBody.chatId === "string" ? responseBody.chatId : null,
    followUpPrompts: extractFollowUpPrompts(responseBody),
    clarifyingQuestions: extractClarifyingQuestions(responseBody),
  };
}

async function readSseChatResponse(response: Response): Promise<ChatResult> {
  if (!response.body) {
    throw new Error("Glean returned an empty streaming response.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalText = "";
  let finalChatId: string | null = null;
  let finalFollowUpPrompts: string[] = [];
  let finalClarifyingQuestions: ClarifyingQuestionsArtifact | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const eventText = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const dataLines = eventText
        .split("\n")
        .filter((line) => line.startsWith("data: "))
        .map((line) => line.slice("data: ".length));
      if (dataLines.length) {
        const payload = JSON.parse(dataLines.join("\n"));
        if (payload.type === "error") {
          throw new Error(payload.error || "Glean could not answer this request.");
        }
        if (payload.type === "final") {
          finalText = typeof payload.text === "string" ? payload.text : extractChatText(payload);
          finalChatId = typeof payload.chatId === "string" ? payload.chatId : null;
          finalFollowUpPrompts = extractFollowUpPrompts(payload);
          finalClarifyingQuestions = extractClarifyingQuestions(payload);
        }
      }
      boundary = buffer.indexOf("\n\n");
    }
  }

  return {
    text: finalText || "Glean returned an empty response.",
    chatId: finalChatId,
    followUpPrompts: finalFollowUpPrompts,
    clarifyingQuestions: finalClarifyingQuestions,
  };
}

function extractChatText(response: any): string {
  const messages = response.messages || [];
  let text = "";
  for (const message of messages) {
    if (message.messageType === "CONTENT" || message.author === "GLEAN_AI") {
      for (const fragment of message.fragments || []) {
        text += fragment.text || "";
      }
    }
  }
  return text || "Glean returned an empty response.";
}

function extractFollowUpPrompts(response: any): string[] {
  if (!Array.isArray(response.followUpPrompts)) {
    return [];
  }
  return response.followUpPrompts
    .filter((prompt: unknown): prompt is string => typeof prompt === "string")
    .map((prompt: string) => prompt.trim())
    .filter(Boolean);
}

function extractClarifyingQuestions(response: any): ClarifyingQuestionsArtifact | null {
  const messages = Array.isArray(response.messages) ? response.messages : [];
  for (const message of messages) {
    if (message?.messageType !== "ARTIFACT_USER_QUESTIONS") {
      continue;
    }
    const artifactInfo = message.artifactInfo || {};
    const artifactId =
      typeof artifactInfo.id === "string"
        ? artifactInfo.id
        : typeof artifactInfo.artifactId === "string"
          ? artifactInfo.artifactId
          : "";
    const version =
      typeof artifactInfo.version === "number"
        ? artifactInfo.version
        : typeof artifactInfo.version === "string"
          ? Number(artifactInfo.version)
          : undefined;
    const fragments = Array.isArray(message.fragments) ? message.fragments : [];
    for (const fragment of fragments) {
      const questions = fragment?.artifact?.clarifyingQuestionsContent?.questions;
      if (!artifactId || !Array.isArray(questions)) {
        continue;
      }
      const parsedQuestions = questions
        .map(parseClarifyingQuestion)
        .filter((question: ClarifyingQuestion | null): question is ClarifyingQuestion => Boolean(question));
      if (parsedQuestions.length) {
        return {
          id: artifactId,
          version: Number.isFinite(version) ? version : undefined,
          questions: parsedQuestions,
        };
      }
    }
  }
  return null;
}

function parseClarifyingQuestion(raw: any): ClarifyingQuestion | null {
  if (!raw || typeof raw.question !== "string" || !Array.isArray(raw.options)) {
    return null;
  }
  const options = raw.options
    .filter((option: unknown): option is string => typeof option === "string")
    .map((option: string) => option.trim())
    .filter(Boolean);
  if (!options.length) {
    return null;
  }
  const showWhen = raw.showWhen;
  return {
    question: raw.question.trim(),
    options,
    multiSelect: raw.multiSelect === true,
    showWhen:
      showWhen &&
      Number.isInteger(showWhen.questionIndex) &&
      Array.isArray(showWhen.selectedOptionIndices)
        ? {
            questionIndex: showWhen.questionIndex,
            selectedOptionIndices: showWhen.selectedOptionIndices.filter((index: unknown): index is number =>
              Number.isInteger(index),
            ),
          }
        : undefined,
  };
}
