// Flat config (ESLint 9). The plan names this file `.eslintrc.cjs`, but ESLint 9.35
// reads only `eslint.config.*` by default (eslintrc support needs ESLINT_USE_FLAT_CONFIG=false,
// which is not set here) - see the task-1 report for this and the typescript version deviation.
const tsParser = require("@typescript-eslint/parser");
const tsPlugin = require("@typescript-eslint/eslint-plugin");
const reactHooks = require("eslint-plugin-react-hooks");

module.exports = [
  {
    ignores: ["out/**", "dist/**", "node_modules/**", "test-results/**", "playwright-report/**"],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { "@typescript-eslint": tsPlugin },
    rules: {
      ...tsPlugin.configs.recommended.rules,
    },
  },
  ...reactHooks.configs["recommended-latest"],
];
