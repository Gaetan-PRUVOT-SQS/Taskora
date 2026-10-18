import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/coverage/**",
      "test-results/**",
      "test/e2e/cypress/screenshots/**",
      "test/e2e/cypress/videos/**",
    ],
  },
  js.configs.recommended,
  {
    // catch (err) {} without using err is common in this codebase and harmless
    rules: { "no-unused-vars": ["error", { caughtErrors: "none" }] },
  },
  {
    files: ["backend/**/*.js", "test/**/*.{js,mjs}", "scripts/**/*.{js,mjs}", "*.{js,mjs}", "frontend/*.config.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node },
    },
  },
  {
    files: ["frontend/src/**/*.{js,jsx}", "test/unit/frontend/**", "test/functional/frontend/**"],
    plugins: { react, "react-hooks": reactHooks },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    settings: { react: { version: "detect" } },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs["jsx-runtime"].rules,
      "react/prop-types": "off",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    files: ["frontend/public/sw.js"],
    languageOptions: { globals: { ...globals.serviceworker } },
  },
  {
    files: ["test/e2e/**/*.{js,mjs}"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    files: ["test/e2e/cypress/**/*.js", "cypress.config.js"],
    languageOptions: { globals: { ...globals.browser, ...globals.mocha, cy: "readonly", Cypress: "readonly", expect: "readonly" } },
  },
];
