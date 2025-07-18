// @ts-check
import js from "@eslint/js";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import babelParser from "@babel/eslint-parser";

/** @type {import("eslint").Linter.FlatConfig[]} */
export default [
  js.configs.recommended,
  {
    files: ["**/*.js", "**/*.jsx"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        ecmaFeatures: {
          jsx: true,
        },
        plugins: ["jsx"],
      },
      globals: {
        React: "writable",
        document: "readonly",
        window: "readonly",
      },
    },
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
    },
  },
  // Add this overrides block for JSX parsing
  {
    files: ["**/*.js", "**/*.jsx"],
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
  },
]; 