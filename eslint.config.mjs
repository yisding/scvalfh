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
          ],
        },
      ],
    },
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
