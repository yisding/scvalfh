import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Repo code is imported as '@/<path>' whenever the import leaves the file's directory, and as
  // './<path>' for same-directory and child modules; a '../' specifier is never needed (README,
  // "Local development"). tsconfig.json's `paths` maps '@/'; vitest, Next, vinext and tsx all read it.
  {
    files: ["**/*.{ts,tsx,mts}"],
    ignores: ["tests/fixtures/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^\\.\\./",
              message: "Import repo code as '@/<path>' (README, \"Local development\").",
            },
          ],
        },
      ],
    },
  },
  // The top-level dependency directions, as editor feedback (tests/arch/layers.test.ts owns the full
  // rule, including the ranks inside lib/): lib imports none of views, components, app, scripts or
  // tests; views never import components, app or scripts; components never import app or scripts;
  // and nothing outside tests/ imports tests/. The typescript resolver reads tsconfig.json's
  // `paths`, so '@/' specifiers resolve.
  {
    files: ["**/*.{ts,tsx,mts}"],
    settings: {
      "import/resolver": { typescript: { project: "./tsconfig.json" } },
    },
    rules: {
      "import/no-restricted-paths": [
        "error",
        {
          zones: [
            {
              target: "./lib",
              from: ["./views", "./components", "./app", "./scripts", "./tests"],
              message: "lib/ sits below views, components, app, scripts and tests (tests/arch/layers.test.ts).",
            },
            {
              target: "./views",
              from: ["./components", "./app", "./scripts"],
              message: "views/ hold view models: they never import components, app or scripts (tests/arch/layers.test.ts).",
            },
            {
              target: "./components",
              from: ["./app", "./scripts"],
              message: "components/ never import route files or scripts (tests/arch/layers.test.ts).",
            },
            {
              target: ["./app", "./components", "./lib", "./scripts", "./views", "./*.{ts,mts,mjs}"],
              from: "./tests",
              message: "Only tests import tests/ (tests/arch/layers.test.ts).",
            },
          ],
        },
      ],
    },
  },
  // Import cycles inside lib/ and views/ (rule (g) of tests/arch/layers.test.ts, which also counts
  // type-only imports; this rule skips them).
  {
    files: ["lib/**/*.{ts,tsx}", "views/**/*.{ts,tsx}"],
    rules: { "import/no-cycle": ["error", { ignoreExternal: true }] },
  },
  // tests/support/corpus-modules.ts names its vitest hook registrars useCorpusModules and
  // useSnapshotModules; they are not React hooks, and the rules-of-hooks rule would reject calling
  // them at the top of a test file (the only place they belong).
  {
    files: ["tests/**/*.ts"],
    rules: { "react-hooks/rules-of-hooks": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // vinext build output (`pnpm build:vinext`) and its dev/build cache.
    "dist/**",
    ".vinext/**",
    // The Cloudflare Workers build (`pnpm build:cloudflare`): built JS and generated workerd types.
    ".cloudflare/**",
    // Claude Code keeps agent worktrees (each with its own .next output) under .claude/.
    ".claude/**",
  ]),
]);

export default eslintConfig;
