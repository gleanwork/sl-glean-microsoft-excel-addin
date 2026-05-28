import type { ParsedAssistantResponse, WriteRangeAction } from "../types";

function isRectangularMatrix(value: unknown): value is unknown[][] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((row) => Array.isArray(row) && row.length === value[0].length)
  );
}

function matrixDimensions(value: unknown[][] | undefined): { rows: number; columns: number } | null {
  if (!isRectangularMatrix(value)) {
    return null;
  }
  return {
    rows: value.length,
    columns: Array.isArray(value[0]) ? value[0].length : 0,
  };
}

function validateWriteRangeAction(value: unknown): WriteRangeAction | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Partial<WriteRangeAction>;
  if (candidate.action !== "writeRange" || typeof candidate.address !== "string") {
    return null;
  }
  const valuesDimensions = matrixDimensions(candidate.values);
  const formulasDimensions = matrixDimensions(candidate.formulas);
  if (!valuesDimensions && !formulasDimensions) {
    return null;
  }
  return {
    action: "writeRange",
    address: candidate.address,
    values: valuesDimensions ? candidate.values : undefined,
    formulas: formulasDimensions ? (candidate.formulas as string[][]) : undefined,
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
  const valuesDimensions = matrixDimensions(action.values);
  const formulasDimensions = matrixDimensions(action.formulas);
  return {
    rows: Math.max(valuesDimensions?.rows || 0, formulasDimensions?.rows || 0),
    columns: Math.max(valuesDimensions?.columns || 0, formulasDimensions?.columns || 0),
  };
}

export function describeWriteAction(action: WriteRangeAction): string {
  const { rows, columns } = actionDimensions(action);
  const kind = action.values && action.formulas ? "values/formulas" : action.formulas ? "formulas" : "values";
  return `Apply ${rows * columns} ${kind} to ${action.address}`;
}
