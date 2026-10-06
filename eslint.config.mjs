import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist",
      "**/.next",
      "**/node_modules",
      "**/coverage",
      "**/next-env.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Plain JS config files run in Node.
    files: ["**/*.mjs"],
    languageOptions: { globals: { process: "readonly" } },
  },
);