export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable ${name}`);
  }
  return value;
}

export function optionalEnv(name: string, fallback = ""): string {
  return process.env[name] || fallback;
}

export function publicRuntimeConfig() {
  return {
    apiBaseUrl: "/api",
    authMode: "sso",
    gleanInstance: requiredEnv("GLEAN_INSTANCE"),
    oauthClientType: optionalEnv("OAUTH_CLIENT_TYPE", "dcr"),
    oauthClientId: optionalEnv("GLEAN_OAUTH_CLIENT_ID", ""),
    features: {
      writeBack: optionalEnv("FEATURE_WRITE_BACK", "true") === "true",
      workbookPreview: optionalEnv("FEATURE_WORKBOOK_PREVIEW", "true") === "true",
      fileUpload: optionalEnv("FEATURE_FILE_UPLOAD", "false") === "true",
      customFunctions: optionalEnv("FEATURE_CUSTOM_FUNCTIONS", "false") === "true",
    },
  };
}
