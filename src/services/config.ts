import type { RuntimeConfig } from "../types";

const defaultConfig: RuntimeConfig = {
  apiBaseUrl: "/api",
  authMode: "sso",
  gleanInstance: "",
  oauthClientType: "dcr",
  oauthClientId: "",
  features: {
    writeBack: true,
    workbookPreview: true,
    fileUpload: false,
    customFunctions: false,
  },
};

let configPromise: Promise<RuntimeConfig> | null = null;

function normalizeConfig(input: Partial<RuntimeConfig>): RuntimeConfig {
  return {
    ...defaultConfig,
    ...input,
    apiBaseUrl: (input.apiBaseUrl || defaultConfig.apiBaseUrl).replace(/\/$/, ""),
    features: {
      ...defaultConfig.features,
      ...(input.features || {}),
    },
  };
}

export function loadRuntimeConfig(force = false): Promise<RuntimeConfig> {
  if (!force && configPromise) {
    return configPromise;
  }

  configPromise = fetch("/config/runtime.json", { cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) {
        return defaultConfig;
      }
      const json = (await response.json()) as Partial<RuntimeConfig>;
      return normalizeConfig(json);
    })
    .catch(() => defaultConfig);

  return configPromise;
}

export function apiUrl(config: RuntimeConfig, path: string): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${config.apiBaseUrl}${suffix}`;
}
