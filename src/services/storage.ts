import type { OAuthTokens } from "../types";

const tokenKeys = {
  accessToken: "glean_excel_oauth_access_token",
  refreshToken: "glean_excel_oauth_refresh_token",
  idToken: "glean_excel_oauth_id_token",
  tokenExpiry: "glean_excel_oauth_token_expiry",
  dcrClientId: "glean_excel_dcr_client_id",
};

const pkceKeys = {
  verifier: "glean_excel_oauth_code_verifier",
  state: "glean_excel_oauth_state",
};

export const authStorage = {
  storeTokens(tokens: OAuthTokens): void {
    localStorage.setItem(tokenKeys.accessToken, tokens.access_token);
    if (tokens.refresh_token) {
      localStorage.setItem(tokenKeys.refreshToken, tokens.refresh_token);
    }
    if (tokens.id_token) {
      localStorage.setItem(tokenKeys.idToken, tokens.id_token);
    }
    if (tokens.expires_in) {
      localStorage.setItem(
        tokenKeys.tokenExpiry,
        String(Date.now() + tokens.expires_in * 1000),
      );
    }
  },

  getAccessToken(): string | null {
    return localStorage.getItem(tokenKeys.accessToken);
  },

  getRefreshToken(): string | null {
    return localStorage.getItem(tokenKeys.refreshToken);
  },

  getIdToken(): string | null {
    return localStorage.getItem(tokenKeys.idToken);
  },

  getDcrClientId(): string | null {
    return localStorage.getItem(tokenKeys.dcrClientId);
  },

  setDcrClientId(clientId: string): void {
    localStorage.setItem(tokenKeys.dcrClientId, clientId);
  },

  clearDcrClientId(): void {
    localStorage.removeItem(tokenKeys.dcrClientId);
  },

  isAccessTokenExpired(bufferSeconds = 60): boolean {
    const expiry = Number(localStorage.getItem(tokenKeys.tokenExpiry) || "0");
    return !expiry || Date.now() > expiry - bufferSeconds * 1000;
  },

  clearTokens(clearDcr = false): void {
    localStorage.removeItem(tokenKeys.accessToken);
    localStorage.removeItem(tokenKeys.refreshToken);
    localStorage.removeItem(tokenKeys.idToken);
    localStorage.removeItem(tokenKeys.tokenExpiry);
    sessionStorage.removeItem(pkceKeys.verifier);
    sessionStorage.removeItem(pkceKeys.state);
    if (clearDcr) {
      localStorage.removeItem(tokenKeys.dcrClientId);
    }
  },

  storePkce(verifier: string, state: string): void {
    sessionStorage.setItem(pkceKeys.verifier, verifier);
    sessionStorage.setItem(pkceKeys.state, state);
  },

  readPkce(): { verifier: string; state: string } {
    const verifier = sessionStorage.getItem(pkceKeys.verifier);
    const state = sessionStorage.getItem(pkceKeys.state);
    if (!verifier || !state) {
      throw new Error("Sign-in session expired. Please try again.");
    }
    return { verifier, state };
  },

  clearPkce(): void {
    sessionStorage.removeItem(pkceKeys.verifier);
    sessionStorage.removeItem(pkceKeys.state);
  },
};
