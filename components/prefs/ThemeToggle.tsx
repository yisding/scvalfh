'use client';

import { useSyncExternalStore } from 'react';

import { useIsHydrated, useStoredValue, writeStored } from './local-store';

import { THEME_META_ID, THEME_STORAGE_KEY, themeMetaColor } from './theme-script';

/**
 * The theme preference (DESIGN §33): ONE text button, not a switch. The site follows the device
 * (`prefers-color-scheme`); the button's label names what a press does: "Dark mode" while the page
 * is light, "Light mode" while it is dark. Rendered in the footer (`sx-textbtn`) and, as a list row
 * (`face="row"`), in the phone More sheet. Never in the header.
 *
 * A press sets `data-theme` on `<html>` and stores the choice. When the chosen theme is the
 * device's own, the stored override is REMOVED instead, so the site goes back to following the
 * device: there is no third "System" state to show or to get stuck outside of.
 *
 * `color-scheme` on `:root` (set by the CSS tokens) keeps form controls and scrollbars in step. The
 * pre-paint script in layout.tsx has already stamped the attribute, so there is no flash. The
 * browser chrome's `theme-color` follows the choice through one media-less meta that an explicit
 * theme prepends and following the device removes (components/prefs/theme-script.ts says why it is
 * not the layout's).
 *
 * Without JS the button would look live and do nothing, so it is `sx-js-only` (the device's scheme
 * still applies), and it is `disabled` until hydrated. The device's scheme is a
 * `useSyncExternalStore` read of the media query, with `false` (light) as the server snapshot, so the
 * hydrating render matches the HTML and the label settles a render later.
 */
type Theme = 'light' | 'dark';

const DARK_QUERY = '(prefers-color-scheme: dark)';

function subscribeOsScheme(onChange: () => void): () => void {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

const osIsDark = () => window.matchMedia(DARK_QUERY).matches;
const serverOsIsDark = () => false;

/** Show `theme`; `followDevice` drops the override (the device already shows it). */
function applyTheme(theme: Theme, followDevice: boolean) {
  const root = document.documentElement;
  let meta = document.getElementById(THEME_META_ID) as HTMLMetaElement | null;
  if (followDevice) {
    root.removeAttribute('data-theme');
    meta?.remove();
  } else {
    root.setAttribute('data-theme', theme);
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      meta.id = THEME_META_ID;
      document.head.prepend(meta);
    }
    meta.content = themeMetaColor(theme);
  }
  writeStored(THEME_STORAGE_KEY, followDevice ? null : theme);
}

export interface ThemeToggleProps {
  /** 'text' (default) is the footer's text button; 'row' is a More-sheet list row (the sheet styles it). */
  face?: 'text' | 'row';
  className?: string;
}

export function ThemeToggle({ face = 'text', className }: ThemeToggleProps) {
  const hydrated = useIsHydrated();
  const stored = useStoredValue(THEME_STORAGE_KEY);
  const osDark = useSyncExternalStore(subscribeOsScheme, osIsDark, serverOsIsDark);
  const device: Theme = osDark ? 'dark' : 'light';
  const current: Theme = hydrated && (stored === 'dark' || stored === 'light') ? stored : device;
  const next: Theme = current === 'dark' ? 'light' : 'dark';

  return (
    <button
      type="button"
      data-theme-toggle=""
      disabled={!hydrated}
      onClick={() => applyTheme(next, next === device)}
      className={['sx-js-only', face === 'text' ? 'sx-textbtn' : null, className].filter(Boolean).join(' ')}
    >
      {next === 'dark' ? 'Dark mode' : 'Light mode'}
    </button>
  );
}

export default ThemeToggle;
