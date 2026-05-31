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
        ],
      },
    ],
  },
};

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  dimeTokenRules,
]);
