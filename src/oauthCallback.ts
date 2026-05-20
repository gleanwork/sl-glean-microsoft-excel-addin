import "./styles.css";
import { loadRuntimeConfig } from "./services/config";
import { exchangeCode } from "./services/oauth";

function postToParent(payload: unknown): void {
  const serialized = JSON.stringify(payload);
  if (typeof Office !== "undefined" && Office.context?.ui?.messageParent) {
    Office.context.ui.messageParent(serialized);
  } else if (window.opener) {
    window.opener.postMessage(serialized, window.location.origin);
  }
}

async function complete(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const state = params.get("state");
  const error = params.get("error");

  if (error) {
    postToParent({ type: "oauth-error", error });
    return;
  }
  if (!code || !state) {
    postToParent({ type: "oauth-error", error: "Missing OAuth code or state." });
    return;
  }

  try {
    const config = await loadRuntimeConfig();
    const tokens = await exchangeCode(config, code, state);
    postToParent({ type: "oauth-success", tokens });
    document.body.innerHTML = `<main class="oauth-page"><h1>Signed in</h1><p>You can close this window.</p></main>`;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    postToParent({ type: "oauth-error", error: message });
    document.body.innerHTML = `<main class="oauth-page"><h1>Sign-in failed</h1><p>${message}</p></main>`;
  }
}

void complete();
