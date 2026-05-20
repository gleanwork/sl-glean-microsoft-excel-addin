import "./styles.css";
import { loadRuntimeConfig } from "./services/config";
import { buildAuthorizationUrl } from "./services/oauth";

async function start(): Promise<void> {
  try {
    const config = await loadRuntimeConfig();
    const url = await buildAuthorizationUrl(config);
    window.location.assign(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    document.body.innerHTML = `<main class="oauth-page"><h1>Could not start sign-in</h1><p>${message}</p></main>`;
  }
}

void start();
