export type OAuthClientType = "dcr" | "static";

export interface RuntimeConfig {
  apiBaseUrl: string;
  authMode: "sso";
  gleanInstance: string;
  oauthClientType: OAuthClientType;
  oauthClientId?: string;
  features: {
    writeBack: boolean;
    workbookPreview: boolean;
    fileUpload: boolean;
    customFunctions: boolean;
  };
}

export interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}

export interface SelectionContext {
  address: string;
  displayAddress: string;
  rowCount: number;
  columnCount: number;
  contents: string;
  truncated: boolean;
  expandedFromWorkbook: boolean;
  previewRows: number;
  previewColumns: number;
  previewLimitRows: number;
  previewLimitColumns: number;
  cappedBySelection: boolean;
  cappedByCharacters: boolean;
  workbookSheetsShown?: number;
  workbookSheetsTotal?: number;
  previewTables?: Array<{
    title: string;
    headers: string[];
    rows: string[][];
  }>;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  label: string;
  text: string;
  createdAt: string;
  pending?: boolean;
  followUpPrompts?: string[];
  clarifyingQuestions?: ClarifyingQuestionsArtifact;
  clarifyingResponses?: ClarifyingQuestionResponse[];
}

export interface ClarifyingQuestion {
  question: string;
  options: string[];
  multiSelect: boolean;
  showWhen?: {
    questionIndex: number;
    selectedOptionIndices: number[];
  };
}

export interface ClarifyingQuestionsArtifact {
  id: string;
  version?: number;
  questions: ClarifyingQuestion[];
}

export interface ClarifyingQuestionResponse {
  question: string;
  answers?: string[];
  skipped?: boolean;
}

export interface WriteRangeAction {
  action: "writeRange";
  address: string;
  values?: unknown[][];
  formulas?: string[][];
  autofitColumns?: boolean;
}

export interface ParsedAssistantResponse {
  text: string;
  action: WriteRangeAction | null;
}

export type ProgressStep =
  | "idle"
  | "reading-selection"
  | "finding-context"
  | "analyzing"
  | "preparing-updates"
  | "ready-to-review";
