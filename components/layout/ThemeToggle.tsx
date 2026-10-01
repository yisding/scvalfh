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
const GLYPH: Record<Theme, string> = { system: '◐', light: '☀', dark: '☽' };
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
      className={`sx-tap inline-flex h-11 w-11 items-center justify-center rounded-chip text-ink-2${
        className ? ` ${className}` : ''
      }`}
    >
      <span aria-hidden="true">{GLYPH[theme]}</span>
      <span className="sr-only">
        {WORD[theme]} is on. Switch to {WORD[next].toLowerCase()}.
      </span>
    </button>
  );
}

export default ThemeToggle;
