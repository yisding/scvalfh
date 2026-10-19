/**
 * `--sx-bg` in each mode (app/globals.css), as one constant with no imports, because three tiers
 * read it: the root layout's theme-color metas and the pre-paint script and ThemeToggle
 * (components/head/theme-script.ts, reached by a `'use client'` module), the web manifest
 * (app/manifest.ts), and the OG cards' background (views/site/og-theme.ts `OG.BG` is the dark one).
 */
export const THEME_COLOR = { light: '#f6f7f8', dark: '#0b0d10' } as const;
