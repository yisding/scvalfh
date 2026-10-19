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
    ignores: [
      "tests/fixtures/**",
      // Next puts a content hash of each metadata image file's own source into the URL it prints
      // (`og:image` …/opengraph-image?<hash>, `<link rel="icon" href="/icon?<hash>">`), so rewriting
      // these files' specifiers alone would change every page's HTML. They keep their relative
      // imports until a change that is meant to alter them anyway.
      "app/**/opengraph-image.tsx",
      "app/icon.tsx",
      "app/apple-icon.tsx",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^\\.\\./",
              message: "Import repo code as '@/<path>' (README, \"Local development\").",
            },
            // lib/format.ts and components/ui/plural.ts survive only for the metadata image routes
            // above, whose own bytes must not change (see the two files' headers).
            {
              regex: "^(@/lib/format|@/components/ui/plural|\\./format|\\./plural)$",
              message: "Import the formatters from '@/lib/format/<dates|numbers|words|score>' or '@/lib/shared/<dates|game>'.",
            },
            // lib/data.ts likewise survives only for the metadata image routes (see its header).
            {
              regex: "^(@/lib/data|\\./data)$",
              message: "Read the snapshot through '@/lib/datasets/snapshot' and '@/lib/queries/<provenance|leagues|teams|games|standings|phase|postseason>'.",
            },
            // The view models moved to views/ and the OG factories to components/og/; their old
            // component paths survive as re-exports only for the metadata image routes (see each
            // file's header).
            {
              regex: "^@/components/(layout/(og-theme|site|og-region-card|monogram-image)|standings/league-standings-card|schedule/day-summary|playoffs/(playoff-view|tournament-league)|teams/team-view|game/game-view)$",
              message: "Import from the module's home in views/ or components/og/; this path re-exports only for the metadata image routes.",
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
