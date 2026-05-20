import { forwardRef, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type {
  ChatMessage,
  ClarifyingQuestionResponse,
  ClarifyingQuestionsArtifact,
  ParsedAssistantResponse,
  ProgressStep,
  RuntimeConfig,
  SelectionContext,
  WriteRangeAction,
} from "./types";
import { parseAssistantResponse, describeWriteAction, actionDimensions } from "./services/actions";
import { buildAssistantPrompt, sendChat, sendClarifyingQuestionResponses } from "./services/chat";
import { loadRuntimeConfig } from "./services/config";
import { applyWriteRangeAction, getSelectionContext } from "./services/excel";
import { getValidAccessToken } from "./services/oauth";
import { authStorage } from "./services/storage";

const suggestions = [
  "Summarize the selected rows",
  "Explain this formula",
  "Find anomalies in this table",
  "Create formulas for the next column",
];

const autoApplyStorageKey = "glean_excel_auto_apply_edits";
const chatIdStorageKey = "glean_excel_chat_id";

function newMessage(role: ChatMessage["role"], label: string, text: string, pending = false): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    label,
    text,
    pending,
    createdAt: new Date().toISOString(),
  };
}

function withFollowUps(message: ChatMessage, followUpPrompts: string[]): ChatMessage {
  return followUpPrompts.length ? { ...message, followUpPrompts } : message;
}

function withClarifyingQuestions(
  message: ChatMessage,
  clarifyingQuestions: ClarifyingQuestionsArtifact | null,
): ChatMessage {
  return clarifyingQuestions ? { ...message, clarifyingQuestions } : message;
}

function withClarifyingResponses(
  message: ChatMessage,
  responses: ClarifyingQuestionResponse[],
): ChatMessage {
  return responses.length ? { ...message, clarifyingResponses: responses } : message;
}

function progressLabel(step: ProgressStep): string {
  switch (step) {
    case "reading-selection":
      return "Reading selection";
    case "finding-context":
      return "Finding Glean context";
    case "analyzing":
      return "Analyzing workbook";
    case "preparing-updates":
      return "Preparing updates";
    case "ready-to-review":
      return "Ready to review";
    default:
      return "";
  }
}

export function App() {
  const [config, setConfig] = useState<RuntimeConfig | null>(null);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [selection, setSelection] = useState<SelectionContext | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressStep>("idle");
  const [pendingAction, setPendingAction] = useState<{
    action: WriteRangeAction;
    response: ParsedAssistantResponse;
  } | null>(null);
  const [autoApplyEdits, setAutoApplyEdits] = useState(() => {
    try {
      return localStorage.getItem(autoApplyStorageKey) === "true";
    } catch {
      return false;
    }
  });
  const [currentChatId, setCurrentChatId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(chatIdStorageKey);
    } catch {
      return null;
    }
  });
  const chatThreadRef = useRef<HTMLElement | null>(null);
  const writePreviewRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    void loadRuntimeConfig().then(async (loaded) => {
      setConfig(loaded);
      setIsSignedIn(Boolean(await getValidAccessToken(loaded)));
    });
  }, []);

  useEffect(() => {
    if (!config || !isSignedIn) {
      return;
    }
    void refreshSelection();
    const interval = window.setInterval(() => void refreshSelection(), 5000);
    return () => window.clearInterval(interval);
  }, [config, isSignedIn]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (chatThreadRef.current) {
        chatThreadRef.current.scrollTop = chatThreadRef.current.scrollHeight;
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages, progress]);

  useEffect(() => {
    if (!pendingAction) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      writePreviewRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pendingAction]);

  useEffect(() => {
    try {
      localStorage.setItem(autoApplyStorageKey, String(autoApplyEdits));
    } catch {
      // Ignore storage failures in locked-down Office webviews.
    }
  }, [autoApplyEdits]);

  useEffect(() => {
    try {
      if (currentChatId) {
        localStorage.setItem(chatIdStorageKey, currentChatId);
      } else {
        localStorage.removeItem(chatIdStorageKey);
      }
    } catch {
      // Ignore storage failures in locked-down Office webviews.
    }
  }, [currentChatId]);

  async function refreshSelection() {
    if (!config) {
      return;
    }
    const context = await getSelectionContext(config.features.workbookPreview);
    setSelection(context);
  }

  function openDialog(url: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (typeof Office === "undefined" || !Office.context?.ui?.displayDialogAsync) {
        const popup = window.open(url, "glean-oauth", "width=520,height=680");
        if (!popup) {
          reject(new Error("Could not open the sign-in window."));
          return;
        }
        const onMessage = (event: MessageEvent) => {
          if (event.origin !== window.location.origin) {
            return;
          }
          window.removeEventListener("message", onMessage);
          resolve(typeof event.data === "string" ? JSON.parse(event.data) : event.data);
        };
        window.addEventListener("message", onMessage);
        return;
      }

      Office.context.ui.displayDialogAsync(
        url,
        { height: 65, width: 45, promptBeforeOpen: false },
        (result) => {
          if (result.status === Office.AsyncResultStatus.Failed) {
            reject(new Error(result.error.message));
            return;
          }
          const dialog = result.value;
          dialog.addEventHandler(Office.EventType.DialogMessageReceived, (arg) => {
            dialog.close();
            if ("message" in arg) {
              resolve(JSON.parse(arg.message));
            } else {
              reject(new Error("Sign-in returned an unexpected dialog response."));
            }
          });
          dialog.addEventHandler(Office.EventType.DialogEventReceived, () => {
            reject(new Error("Sign-in window was closed."));
          });
        },
      );
    });
  }

  async function signIn() {
    setStatus(null);
    try {
      const result = (await openDialog(`${window.location.origin}/oauth-dialog.html`)) as any;
      if (result.type === "oauth-success" && result.tokens) {
        authStorage.storeTokens(result.tokens);
        setIsSignedIn(true);
        setStatus("Connected to Glean.");
        await refreshSelection();
      } else {
        throw new Error(result.error || "Glean sign-in did not complete.");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  function signOut() {
    authStorage.clearTokens();
    setIsSignedIn(false);
    setMessages([]);
    setCurrentChatId(null);
    setPendingAction(null);
    setStatus("Signed out.");
  }

  function startNewChat() {
    setCurrentChatId(null);
    setMessages([]);
    setPendingAction(null);
    setProgress("idle");
    setStatus("Started a new chat.");
  }

  async function submitPrompt(promptText = input) {
    if (!config) {
      return;
    }
    const trimmed = promptText.trim();
    if (!trimmed) {
      return;
    }

    setInput("");
    setStatus(null);
    setPendingAction(null);
    setMessages((current) => [
      ...current,
      newMessage("user", selection?.displayAddress || "You", trimmed),
      newMessage("assistant", "Glean", "Thinking...", true),
    ]);

    try {
      setProgress("reading-selection");
      const freshSelection = await getSelectionContext(config.features.workbookPreview);
      setSelection(freshSelection);
      setProgress("finding-context");
      const token = await getValidAccessToken(config);
      if (!token) {
        setIsSignedIn(false);
        throw new Error("Your Glean session expired. Sign in again.");
      }
      setProgress("analyzing");
      const prompt = buildAssistantPrompt(trimmed, freshSelection);
      const answer = await sendChat(config, token, prompt, currentChatId);
      if (answer.chatId) {
        setCurrentChatId(answer.chatId);
      }
      setProgress("preparing-updates");
      const parsed = parseAssistantResponse(answer.text);
      setMessages((current) =>
        current.map((message) =>
          message.pending
            ? withClarifyingQuestions(
                withFollowUps(
                  { ...message, text: parsed.text || "Glean prepared a workbook update.", pending: false },
                  answer.followUpPrompts,
                ),
                answer.clarifyingQuestions,
              )
            : message,
        ),
      );
      if (parsed.action) {
        if (autoApplyEdits) {
          const updatedAddress = await applyWriteRangeAction(parsed.action);
          setMessages((current) => [
            ...current,
            newMessage("system", "Applied", `Updated ${updatedAddress}.`),
          ]);
          await refreshSelection();
          setProgress("idle");
        } else {
          setPendingAction({ action: parsed.action, response: parsed });
          setProgress("ready-to-review");
        }
      } else {
        setProgress("idle");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setMessages((current) =>
        current.map((item) =>
          item.pending ? { ...item, text: `Error: ${message}`, pending: false } : item,
        ),
      );
      setStatus(message);
      setProgress("idle");
    }
  }

  async function submitClarifyingAnswers(
    artifact: ClarifyingQuestionsArtifact,
    responses: ClarifyingQuestionResponse[],
  ) {
    if (!config) {
      return;
    }
    setStatus(null);
    setPendingAction(null);
    const answeredResponses = responses.filter(
      (response) => !response.skipped && response.answers?.length,
    );
    setMessages((current) => [
      ...current,
      withClarifyingResponses(
        newMessage(
          "user",
          "You",
          answeredResponses.length
            ? "Answered clarification questions."
            : "Skipped clarification questions.",
        ),
        answeredResponses,
      ),
      newMessage("assistant", "Glean", "Thinking...", true),
    ]);

    try {
      setProgress("analyzing");
      const token = await getValidAccessToken(config);
      if (!token) {
        setIsSignedIn(false);
        throw new Error("Your Glean session expired. Sign in again.");
      }
      const answer = await sendClarifyingQuestionResponses(
        config,
        token,
        currentChatId,
        artifact,
        responses,
      );
      if (answer.chatId) {
        setCurrentChatId(answer.chatId);
      }
      const parsed = parseAssistantResponse(answer.text);
      setMessages((current) =>
        current.map((message) =>
          message.pending
            ? withClarifyingQuestions(
                withFollowUps(
                  { ...message, text: parsed.text || "Glean prepared a workbook update.", pending: false },
                  answer.followUpPrompts,
                ),
                answer.clarifyingQuestions,
              )
            : message,
        ),
      );
      if (parsed.action) {
        if (autoApplyEdits) {
          const updatedAddress = await applyWriteRangeAction(parsed.action);
          setMessages((current) => [
            ...current,
            newMessage("system", "Applied", `Updated ${updatedAddress}.`),
          ]);
          await refreshSelection();
          setProgress("idle");
        } else {
          setPendingAction({ action: parsed.action, response: parsed });
          setProgress("ready-to-review");
        }
      } else {
        setProgress("idle");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setMessages((current) =>
        current.map((item) =>
          item.pending ? { ...item, text: `Error: ${message}`, pending: false } : item,
        ),
      );
      setStatus(message);
      setProgress("idle");
    }
  }

  async function applyPendingAction() {
    if (!pendingAction) {
      return;
    }
    try {
      const updatedAddress = await applyWriteRangeAction(pendingAction.action);
      setMessages((current) => [
        ...current,
        newMessage("system", "Applied", `Updated ${updatedAddress}.`),
      ]);
      setPendingAction(null);
      setProgress("idle");
      await refreshSelection();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  if (!config) {
    return <Shell status="Loading Glean in Excel..." />;
  }

  if (!isSignedIn) {
    return (
      <Shell status={status} variant="signin">
        <section className="hero-card">
          <img className="brand-logo" src="/assets/icon-80.png" alt="Glean" />
          <h1>Glean in Excel</h1>
          <p>
            Ask Glean about selected workbook data and review suggested updates before
            applying them to cells.
          </p>
          <button className="primary-button" onClick={() => void signIn()}>
            Sign in with Glean
          </button>
        </section>
      </Shell>
    );
  }

  return (
    <Shell status={status} onSignOut={signOut} onNewChat={startNewChat}>
      {selection && (selection.cappedBySelection || selection.cappedByCharacters) ? (
        <ContextLimitNotice selection={selection} />
      ) : null}

      <main className="chat-thread" aria-live="polite" ref={chatThreadRef}>
        {messages.length === 0 ? (
          <EmptyState onSuggestion={(value) => void submitPrompt(value)} />
        ) : (
          messages.map((message) => (
            <article key={message.id} className={`message message-${message.role}`}>
              <div className="message-label">{message.label}</div>
              <div className="message-body">
                {message.clarifyingResponses?.length ? (
                  <ClarifyingAnswerSummary responses={message.clarifyingResponses} />
                ) : message.role === "user" ? (
                  message.text
                ) : (
                  <MarkdownText text={message.text} />
                )}
              </div>
              {message.followUpPrompts?.length ? (
                <FollowUpPrompts
                  prompts={message.followUpPrompts}
                  onSelect={(prompt) => void submitPrompt(prompt)}
                />
              ) : null}
              {message.clarifyingQuestions ? (
                <ClarifyingQuestionsForm
                  artifact={message.clarifyingQuestions}
                  onSubmit={(responses) => void submitClarifyingAnswers(message.clarifyingQuestions!, responses)}
                />
              ) : null}
            </article>
          ))
        )}
      </main>

      {progress !== "idle" ? <div className="progress-step">{progressLabel(progress)}</div> : null}

      {selection ? <ContextPreview selection={selection} /> : null}

      {pendingAction ? (
        <WritePreview
          ref={writePreviewRef}
          action={pendingAction.action}
          onApply={() => void applyPendingAction()}
          onCancel={() => {
            setPendingAction(null);
            setProgress("idle");
          }}
        />
      ) : null}

      <div className="composer-shell">
        <div className="composer-toolbar">
          <EditModeToggle enabled={autoApplyEdits} onChange={setAutoApplyEdits} />
        </div>
        <form
          className="composer"
          onSubmit={(event) => {
            event.preventDefault();
            void submitPrompt();
          }}
        >
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submitPrompt();
              }
            }}
            placeholder="Ask Glean about this workbook..."
            rows={2}
          />
          <button className="primary-button" type="submit" disabled={!input.trim()}>
            Send
          </button>
        </form>
      </div>
    </Shell>
  );
}

function Shell({
  children,
  status,
  onSignOut,
  onNewChat,
  variant = "app",
}: {
  children?: ReactNode;
  status?: string | null;
  onSignOut?: () => void;
  onNewChat?: () => void;
  variant?: "app" | "signin";
}) {
  const isSignIn = variant === "signin";
  return (
    <div className={`app-shell ${isSignIn ? "app-shell-signin" : ""}`}>
      {!isSignIn ? (
        <header className="app-header">
          <div>
            <h1>Glean in Excel</h1>
          </div>
          <div className="header-actions">
            {onNewChat ? (
              <button className="secondary-button" onClick={onNewChat}>
                New chat
              </button>
            ) : null}
            {onSignOut ? (
              <button className="secondary-button" onClick={onSignOut}>
                Sign out
              </button>
            ) : null}
          </div>
        </header>
      ) : null}
      {status ? <div className="status-callout">{status}</div> : null}
      {children}
      {isSignIn ? (
        <div className="signin-footer eyebrow">Powered by Glean</div>
      ) : (
        <div className="app-footer eyebrow">Powered by Glean</div>
      )}
    </div>
  );
}

function EditModeToggle({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <div className="edit-mode-toggle" role="group" aria-label="Edit approval mode">
      <button
        type="button"
        className={!enabled ? "active" : ""}
        aria-pressed={!enabled}
        onClick={() => onChange(false)}
      >
        Ask before edits
      </button>
      <button
        type="button"
        className={enabled ? "active" : ""}
        aria-pressed={enabled}
        onClick={() => onChange(true)}
      >
        Auto-apply edits
      </button>
    </div>
  );
}

function EmptyState({ onSuggestion }: { onSuggestion: (value: string) => void }) {
  return (
    <section className="empty-state">
      <h2>Ask Glean about your workbook</h2>
      <p>
        Select a range, then ask a question. Glean can explain, summarize, and make updates.
      </p>
      <div className="suggestions">
        {suggestions.map((suggestion) => (
          <button key={suggestion} onClick={() => onSuggestion(suggestion)}>
            {suggestion}
          </button>
        ))}
      </div>
    </section>
  );
}

function FollowUpPrompts({
  prompts,
  onSelect,
}: {
  prompts: string[];
  onSelect: (prompt: string) => void;
}) {
  return (
    <div className="follow-up-prompts">
      <div className="follow-up-label">Follow-up questions</div>
      <div className="follow-up-chip-row">
        {prompts.map((prompt) => (
          <button key={prompt} type="button" onClick={() => onSelect(prompt)}>
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}

function ClarifyingAnswerSummary({ responses }: { responses: ClarifyingQuestionResponse[] }) {
  return (
    <section className="clarifying-answer-summary">
      <div className="clarifying-answer-title">Answered clarification questions</div>
      <dl>
        {responses.map((response) => (
          <div key={response.question} className="clarifying-answer-row">
            <dt>{response.question}</dt>
            <dd>{response.answers?.join(", ")}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ClarifyingQuestionsForm({
  artifact,
  onSubmit,
}: {
  artifact: ClarifyingQuestionsArtifact;
  onSubmit: (responses: ClarifyingQuestionResponse[]) => void;
}) {
  const [selected, setSelected] = useState<Record<number, number[]>>({});
  const [submitted, setSubmitted] = useState(false);

  function isVisible(questionIndex: number): boolean {
    const showWhen = artifact.questions[questionIndex].showWhen;
    if (!showWhen) {
      return true;
    }
    const parentSelected = selected[showWhen.questionIndex] || [];
    return parentSelected.some((index) => showWhen.selectedOptionIndices.includes(index));
  }

  function toggleOption(questionIndex: number, optionIndex: number) {
    const question = artifact.questions[questionIndex];
    setSelected((current) => {
      if (!question.multiSelect) {
        return { ...current, [questionIndex]: [optionIndex] };
      }
      const existing = current[questionIndex] || [];
      const next = existing.includes(optionIndex)
        ? existing.filter((index) => index !== optionIndex)
        : [...existing, optionIndex].sort((a, b) => a - b);
      return { ...current, [questionIndex]: next };
    });
  }

  const visibleQuestionIndices = artifact.questions
    .map((_, index) => index)
    .filter(isVisible);
  const isComplete = visibleQuestionIndices.every((index) => (selected[index] || []).length > 0);

  function buildResponses(): ClarifyingQuestionResponse[] {
    return artifact.questions.map((question, questionIndex) => {
      if (!isVisible(questionIndex)) {
        return { question: question.question, answers: [], skipped: true };
      }
      const answers = (selected[questionIndex] || [])
        .map((optionIndex) => question.options[optionIndex])
        .filter(Boolean);
      return answers.length
        ? { question: question.question, answers, skipped: false }
        : { question: question.question, answers: [], skipped: true };
    });
  }

  function submitResponses(responses: ClarifyingQuestionResponse[]) {
    setSubmitted(true);
    onSubmit(responses);
  }

  if (submitted) {
    return (
      <section className="clarifying-questions clarifying-questions-submitted">
        <div className="notice-icon" aria-hidden="true">✓</div>
        <div>
          <h2>Answers sent to Glean</h2>
          <p>Glean is continuing with your selections.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="clarifying-questions">
      <div className="clarifying-header">
        <h2>Glean needs a bit more context</h2>
        <p>Answer {visibleQuestionIndices.length} quick question{visibleQuestionIndices.length === 1 ? "" : "s"} to continue.</p>
      </div>
      <div className="clarifying-question-stack">
        {artifact.questions.map((question, questionIndex) => {
          if (!isVisible(questionIndex)) {
            return null;
          }
          const selectedOptions = selected[questionIndex] || [];
          return (
            <fieldset className="clarifying-question" key={`${question.question}-${questionIndex}`} disabled={submitted}>
              <legend>
                <span className="question-number">{questionIndex + 1}</span>
                <span>{question.question}</span>
                <span className="question-mode">{question.multiSelect ? "Choose all that apply" : "Choose one"}</span>
              </legend>
              <div className="clarifying-options">
                {question.options.map((option, optionIndex) => {
                  const active = selectedOptions.includes(optionIndex);
                  return (
                    <button
                      key={option}
                      type="button"
                      className={active ? "active" : ""}
                      aria-pressed={active}
                      onClick={() => toggleOption(questionIndex, optionIndex)}
                    >
                      {active ? <span aria-hidden="true">✓</span> : null}
                      {option}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
      </div>
      <div className="clarifying-actions">
        <button
          className="secondary-button"
          type="button"
          disabled={submitted}
          onClick={() => submitResponses([])}
        >
          Skip
        </button>
        <button
          className="primary-button"
          type="button"
          disabled={!isComplete || submitted}
          onClick={() => submitResponses(buildResponses())}
        >
          Continue with answers
        </button>
      </div>
    </section>
  );
}

function ContextLimitNotice({ selection }: { selection: SelectionContext }) {
  const title = selection.expandedFromWorkbook
    ? "Workbook preview is capped"
    : "Selection preview is capped";
  const scope = selection.expandedFromWorkbook
    ? `Glean will see up to ${selection.previewLimitRows} rows x ${selection.previewLimitColumns} columns per sheet across ${selection.workbookSheetsShown ?? 0} of ${selection.workbookSheetsTotal ?? 0} sheets.`
    : `Glean will see the top-left ${selection.previewRows} rows x ${selection.previewColumns} columns from ${selection.displayAddress}.`;
  const reason = selection.cappedByCharacters
    ? "The preview was also shortened to stay within the request size limit."
    : "Select a smaller range if you want Glean to see every cell in the selection.";

  return (
    <aside className="context-limit-notice" aria-live="polite">
      <div className="notice-icon" aria-hidden="true">i</div>
      <div>
        <h2>{title}</h2>
        <p>{scope}</p>
        <p>{reason}</p>
      </div>
    </aside>
  );
}

function MarkdownText({ text }: { text: string }) {
  const lines = text.split(/\n/);
  const blocks: ReactNode[] = [];
  let listItems: ReactNode[] = [];

  function flushList() {
    if (!listItems.length) {
      return;
    }
    blocks.push(<ul key={`ul-${blocks.length}`}>{listItems}</ul>);
    listItems = [];
  }

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      blocks.push(<br key={`br-${index}`} />);
      return;
    }
    if (/^-{3,}$/.test(trimmed)) {
      flushList();
      blocks.push(<hr key={`hr-${index}`} />);
      return;
    }
    const bullet = /^[-*]\s+(.+)$/.exec(trimmed);
    if (bullet) {
      listItems.push(<li key={`li-${index}`}>{renderInlineMarkdown(bullet[1])}</li>);
      return;
    }
    flushList();
    blocks.push(<p key={`p-${index}`}>{renderInlineMarkdown(trimmed)}</p>);
  });
  flushList();

  return <div className="markdown-text">{blocks}</div>;
}

function renderInlineMarkdown(text: string): ReactNode[] {
  const normalized = text.replace(/\*\*\*\*/g, "****");
  const parts = normalized.split(/(\*\*[^*]+?\*\*)/g).filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2).replace(/\*\*/g, "")}</strong>;
    }
    return <span key={index}>{part.replace(/\*\*/g, "")}</span>;
  });
}

function ContextPreview({ selection }: { selection: SelectionContext }) {
  const tableCount = selection.previewTables?.length || 0;
  return (
    <details className="context-preview">
      <summary>
        <span>{selection.expandedFromWorkbook ? "Workbook context preview" : "Selected range preview"}</span>
        <span className="preview-chip-row" aria-hidden="true">
          <span>{selection.displayAddress}</span>
          <span>{selection.previewRows} x {selection.previewColumns} preview</span>
          {(selection.cappedBySelection || selection.cappedByCharacters) ? <span>Capped</span> : null}
        </span>
      </summary>
      <p className="trust-copy">
        Only this preview is sent to Glean. Large selections are capped at {selection.previewLimitRows} rows x {selection.previewLimitColumns} columns.
      </p>
      {tableCount ? (
        <div className="preview-table-stack">
          {selection.previewTables?.map((table, index) => (
            <section className="preview-table-card" key={`${table.title}-${index}`}>
              <div className="preview-table-title">{table.title}</div>
              <div className="preview-table-scroll">
                <table>
                  <thead>
                    <tr>
                      {table.headers.map((header) => (
                        <th key={header}>{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {row.map((cell, cellIndex) => (
                          <td key={cellIndex} title={cell}>{cell || "\u00a0"}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      ) : (
        <p className="trust-copy">No visible cell contents.</p>
      )}
    </details>
  );
}

const WritePreview = forwardRef<HTMLElement, {
  action: WriteRangeAction;
  onApply: () => void;
  onCancel: () => void;
}>(
function WritePreview({
  action,
  onApply,
  onCancel,
}, ref) {
  const dimensions = actionDimensions(action);
  return (
    <section className="write-preview" ref={ref}>
      <div>
        <h2>Review workbook update</h2>
        <p>{describeWriteAction(action)}</p>
        <p className="trust-copy">
          Glean will not modify the workbook until you approve this change.
        </p>
      </div>
      <dl>
        <dt>Target</dt>
        <dd>{action.address}</dd>
        <dt>Size</dt>
        <dd>
          {dimensions.rows} rows x {dimensions.columns} columns
        </dd>
        <dt>Type</dt>
        <dd>{action.formulas ? "Formulas" : "Values"}</dd>
      </dl>
      <div className="button-row">
        <button className="secondary-button" onClick={onCancel}>
          Cancel
        </button>
        <button className="primary-button" onClick={onApply}>
          {describeWriteAction(action)}
        </button>
      </div>
    </section>
  );
});
