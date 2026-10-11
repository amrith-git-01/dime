// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

/** @type {import('eslint').Linter.Config[]} */
const dimeTokenRules = {
  files: ["src/**/*.{ts,tsx}"],
  ignores: [
    "src/constants/**",
    "**/*.test.ts",
    "**/*.test.tsx",
  ],
  rules: {
    "no-restricted-syntax": [
      "error",
      {
        selector: "Literal[value=/#[0-9a-fA-F]{3,8}\\b/]",
        message:
          "Use design tokens from @/constants instead of hard-coded hex colors.",
      },
      {
        selector:
          "Literal[value=/^rgba?\\(/i]",
        message:
          "Use design tokens from @/constants instead of hard-coded rgba colors.",
      },
    ],
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["@/constants/theme"],
            message: "Import from @/constants instead of @/constants/theme.",
          },
          {
            group: ["@/features/*/components/**"],
            importNames: ["default"],
            message:
              "Screens and components must not import feature UI; migrate to @/components.",
          },
          {
            group: ["@/components/ui/**"],
            message: "Import UI primitives from @/components/ui.",
          },
        ],
      },
    ],
  },
};

const dimeFeatureBoundaryRules = {
  files: ["src/features/**/*.{ts,tsx}"],
  ignores: ["src/features/**/components/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["@/constants/theme"],
            message: "Import from @/constants instead of @/constants/theme.",
          },
          {
            group: ["@/components/**"],
            message:
              "Feature modules must not import components. Move shared non-UI logic to features, utils, or hooks.",
          },
        ],
      },
    ],
  },
};

const jestGlobals = {
  files: ["**/__tests__/**/*.{ts,tsx}", "**/*.test.{ts,tsx}"],
  languageOptions: {
    globals: {
      describe: "readonly",
      it: "readonly",
      test: "readonly",
      expect: "readonly",
      beforeEach: "readonly",
      afterEach: "readonly",
      beforeAll: "readonly",
      afterAll: "readonly",
      jest: "readonly",
    },
  },
};

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  dimeTokenRules,
  dimeFeatureBoundaryRules,
  jestGlobals,
]);
