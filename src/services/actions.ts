import type { ParsedAssistantResponse, WriteRangeAction } from "../types";

function isRectangularMatrix(value: unknown): value is unknown[][] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((row) => Array.isArray(row) && row.length === value[0].length)
  );
}

function validateWriteRangeAction(value: unknown): WriteRangeAction | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Partial<WriteRangeAction>;
  if (candidate.action !== "writeRange" || typeof candidate.address !== "string") {
    return null;
  }
  const hasValues = isRectangularMatrix(candidate.values);
  const hasFormulas = isRectangularMatrix(candidate.formulas);
  if (hasValues === hasFormulas) {
    return null;
  }
  return {
    action: "writeRange",
    address: candidate.address,
    values: hasValues ? candidate.values : undefined,
    formulas: hasFormulas ? (candidate.formulas as string[][]) : undefined,
    autofitColumns: candidate.autofitColumns !== false,
  };
}

export function parseAssistantResponse(rawText: string): ParsedAssistantResponse {
  const base: ParsedAssistantResponse = { text: rawText || "", action: null };
  const match = rawText.match(/<glean_action>\s*([\s\S]*?)\s*<\/glean_action>/i);
  if (!match) {
    return base;
  }

  let jsonText = match[1].trim();
  jsonText = jsonText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  try {
    const parsed = JSON.parse(jsonText) as unknown;
    const action = validateWriteRangeAction(parsed);
    if (!action) {
      return base;
    }
    const matchStart = match.index ?? 0;
    const text = (rawText.slice(0, matchStart) + rawText.slice(matchStart + match[0].length))
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return { text, action };
  } catch {
    return base;
  }
}

export function actionDimensions(action: WriteRangeAction): { rows: number; columns: number } {
  const matrix = action.values || action.formulas || [];
  return {
    rows: matrix.length,
    columns: Array.isArray(matrix[0]) ? matrix[0].length : 0,
  };
}

export function describeWriteAction(action: WriteRangeAction): string {
  const { rows, columns } = actionDimensions(action);
  const kind = action.formulas ? "formulas" : "values";
  return `Apply ${rows * columns} ${kind} to ${action.address}`;
}
