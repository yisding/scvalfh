import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/*
 * Layering, as lint errors. `no-restricted-imports` options do not merge across flat-config blocks
 * (the last matching block wins), so each file matches exactly one block below and every block
 * repeats the general bans. The patterns name relative specifiers; inside lib/ the `@/` alias is
 * banned outright so a path cannot dodge them, and in components/, app/ and scripts/ each pattern
 * covers `@/` as well. tests/lint-boundaries.test.ts proves each zone fires.
 */
const LIB_NOT_SITE = {
  regex: "^(\\.\\./)+(components|app|scripts|tests)/",
  message: "lib/ is the shared core: it must not depend on components/, app/, scripts/ or tests/.",
};
const LIB_NO_ALIAS = {
  regex: "^@/",
  message: "Inside lib/, import by relative path so the layer rules can see the edge.",
};

const LAYER_ZONES = [
  {
    files: ["lib/sources/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^(\\.\\./)+(pipeline|crosscheck)(/|$)",
              message:
                "lib/sources is an adapter: it must not depend on the pipeline or the cross-checks it serves.",
            },
            LIB_NOT_SITE,
            LIB_NO_ALIAS,
          ],
        },
      ],
    },
  },
  {
    files: ["lib/crosscheck/**", "lib/official/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^(\\.\\./)+pipeline(/|$)",
              message:
                "lib/crosscheck and lib/official feed the pipeline: they must not depend on it.",
            },
            LIB_NOT_SITE,
            LIB_NO_ALIAS,
          ],
        },
      ],
    },
  },
  {
    files: ["lib/**"],
    ignores: ["lib/sources/**", "lib/crosscheck/**", "lib/official/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [LIB_NOT_SITE, LIB_NO_ALIAS] }],
    },
  },
  {
    files: ["components/**", "app/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^(@/|(\\.\\./)+)(app|scripts|tests)/",
              message: "The site must not depend on app/ routes, scripts/ or tests/.",
            },
            {
              regex: "^(@/|(\\.\\./)+)lib/(pipeline|sources|official)(/|$)",
              message:
                "lib/pipeline, lib/sources and lib/official are build-only: the site renders the data files, it never builds them (tests/build-only-boundary.test.ts).",
            },
            {
              regex: "^(@/|(\\.\\./)+)lib/crosscheck/(?!cifss-notes$)",
              message:
                "lib/crosscheck is build-only; only lib/crosscheck/cifss-notes is site-safe (tests/build-only-boundary.test.ts).",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["scripts/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^(@/|(\\.\\./)+)tests/",
              message: "scripts/ run in production and CI: they must not depend on tests/.",
            },
          ],
        },
      ],
    },
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...LAYER_ZONES,
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
