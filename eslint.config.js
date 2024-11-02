import { Linter } from "eslint";
import typescriptParser from "@typescript-eslint/parser";
import typescriptPlugin from "@typescript-eslint/eslint-plugin";

/** @type {Linter.Config} */
export default {
  files: ["src/**/*.{ts,tsx}"],
  languageOptions: {
    parser: typescriptParser,
    parserOptions: {
      ecmaVersion: 2021,
      sourceType: "module",
    },
  },
  plugins: {
    "@typescript-eslint": typescriptPlugin,
  },
  rules: {
    "no-console": "warn",
    "semi": ["error", "always"],
    "@typescript-eslint/no-unused-vars": ["error"],
  },
};
