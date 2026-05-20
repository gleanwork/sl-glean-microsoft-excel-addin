import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["dist/**", "backend/dist/**", "node_modules/**", "manifest.xml"],
  },
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        Office: "readonly",
        Excel: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
