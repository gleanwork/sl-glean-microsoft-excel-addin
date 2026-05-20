import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        taskpane: "taskpane.html",
        oauthDialog: "oauth-dialog.html",
        oauthCallback: "oauth-callback.html",
      },
    },
  },
  server: {
    https: {},
  },
});
