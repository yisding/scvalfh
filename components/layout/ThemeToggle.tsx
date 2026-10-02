'use client';

import { useIsHydrated, useStoredValue, writeStored } from '../ui/local-store';

import { THEME_STORAGE_KEY } from './theme-script';

/**
 * System / Light / Dark, cycled by one 44×44 button (DESIGN §7.14). One of the nine client modules
 * in the whole app.
 *
 * The accessible name comes from the button's CONTENTS and names both states: "Light theme is on.
 * Switch to dark theme." An `aria-label` was doing the second half on its own, which is exactly
 * how accname works — label (step 2C) beats name-from-content (step 2F) — so the visually hidden
 * sentence naming the CURRENT theme was computed away and never announced, the opposite of what
 * this comment used to promise.
 *
 * There is no `aria-pressed`: the control cycles THREE states, and a two-valued "pressed" cannot
 * tell Light from Dark (both are "on"). The name carries the whole story instead.
 *
 * "System" is stored as the ABSENCE of the attribute, so `prefers-color-scheme` stays in charge,
 * and `color-scheme` on `:root` (set by the CSS tokens) keeps form controls and scrollbars in step.
 * The pre-paint script in layout.tsx has already stamped the attribute, so there is no flash: this
 * component renders the neutral glyph on the server and the real one after hydration.
 */
type Theme = 'system' | 'light' | 'dark';

const ORDER: Theme[] = ['system', 'light', 'dark'];
const SVG_PROPS = {
  width: 20,
  height: 20,
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

/** 20px inline glyphs: a half-filled circle (system), a sun (light), a crescent (dark). */
const GLYPH: Record<Theme, React.ReactNode> = {
  system: (
    <svg {...SVG_PROPS}>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 3a7 7 0 0 0 0 14z" fill="currentColor" stroke="none" />
    </svg>
  ),
  light: (
    <svg {...SVG_PROPS}>
      <circle cx="10" cy="10" r="4" />
      <path d="M10 1.75v1.5M10 16.75v1.5M1.75 10h1.5M16.75 10h1.5M4.17 4.17l1.06 1.06M14.77 14.77l1.06 1.06M4.17 15.83l1.06-1.06M14.77 5.23l1.06-1.06" />
    </svg>
  ),
  dark: (
    <svg {...SVG_PROPS}>
      <path d="M16.5 12.2A7 7 0 0 1 7.8 3.5a7 7 0 1 0 8.7 8.7z" />
    </svg>
  ),
};
const WORD: Record<Theme, string> = {
  system: 'System theme',
  light: 'Light theme',
  dark: 'Dark theme',
};

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  writeStored(THEME_STORAGE_KEY, theme === 'system' ? null : theme);
}

export function ThemeToggle({ className }: { className?: string }) {
  const hydrated = useIsHydrated();
  const stored = useStoredValue(THEME_STORAGE_KEY);
  const theme: Theme =
    hydrated && (stored === 'dark' || stored === 'light') ? stored : 'system';
  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];

  return (
    <button
      type="button"
      onClick={() => applyTheme(next)}
      className={`sx-tap inline-flex h-11 w-11 items-center justify-center rounded-full text-ink-2 hover:bg-surface-2 hover:text-ink${
        className ? ` ${className}` : ''
      }`}
    >
      {GLYPH[theme]}
      <span className="sr-only">
        {WORD[theme]} is on. Switch to {WORD[next].toLowerCase()}.
      </span>
    </button>
  );
}

export default ThemeToggle;
