import { mkdir, writeFile } from "node:fs/promises";

await mkdir("dist/config", { recursive: true });

const config = {
  apiBaseUrl: "/api",
  authMode: "sso",
  gleanInstance: process.env.GLEAN_INSTANCE || "",
  oauthClientType: process.env.OAUTH_CLIENT_TYPE || "dcr",
  oauthClientId: process.env.GLEAN_OAUTH_CLIENT_ID || "",
  features: {
    writeBack: true,
    workbookPreview: true,
    fileUpload: false,
    customFunctions: false,
  },
};

await writeFile("dist/config/runtime.json", `${JSON.stringify(config, null, 2)}\n`);
