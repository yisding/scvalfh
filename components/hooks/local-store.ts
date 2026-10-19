'use client';

import { useSyncExternalStore } from 'react';

/**
 * The site stores exactly four things, all in this browser only (see /about#a11y), and this is the
 * whole storage layer for all four:
 *
 * - `scvalfh.theme`       — the Light/Dark choice (components/head/theme-script.ts);
 * - `scvalfh.pinnedTeam`  — the pinned team's slug (components/hooks/use-pinned-team.ts);
 * - `scvalfh.league`      — the remembered league: a league id or `'all'`
 *                           (components/hooks/use-league.ts, components/head/prefs-script.ts).
 *   It is written ONLY by a home scope chip, a "Show <SHORT> here" button or pinning a team —
 *   never by following a URL (SPEC §8.2);
 * - `scvalfh.region`      — the remembered region: `'norcal'` or `'socal'` (the same two modules;
 *                           DESIGN-socal §2.4). It is written ONLY by the region switcher and by
 *                           remembering a league (a scope chip, a "Show <SHORT> here" button, pinning
 *                           a team), which writes that league's region — never by following a URL.
 *
 * It is a `useSyncExternalStore` subscription rather than `useState` + `useEffect`, for three
 * reasons: it is the pattern React's own lint rule asks for (a setState inside an effect triggers
 * cascading renders); it gives correct SSR behaviour by construction — the server snapshot is
 * "nothing stored", so the first paint matches the HTML and React re-renders once after hydration,
 * with no flash and no hydration mismatch; and it listens for `storage`, so a change made in one
 * tab reaches the others.
 *
 * EVERY access is inside try/catch. A private window, blocked site data or a quota error surfaces
 * as `UNAVAILABLE` and the UI degrades to "not stored in this browser"; the page itself stays
 * completely correct without storage.
 */

/** A sentinel snapshot value meaning "localStorage threw". Never a legal stored value. */
export const UNAVAILABLE = '\u0000unavailable';

/**
 * Same-tab writes do not fire `storage`, so we fire our own event. `use-league` and
 * `use-pinned-team` also fire it after changing an `<html>` attribute, so every subscriber
 * re-reads in the same tick.
 */
const CHANGE_EVENT = 'scvalfh:storage';

/** Tell every subscriber to re-read (storage or the `<html>` stamp changed in this tab). */
export function notifyStore(): void {
  try {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    /* no event API — nothing to notify */
  }
}

export function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return UNAVAILABLE;
  }
}

/** @returns false when storage is unavailable, so the caller can say so in words. */
export function writeStored(key: string, value: string | null): boolean {
  let ok = true;
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    ok = false;
  }
  notifyStore();
  return ok;
}

/**
 * Subscribe to every store change: this tab's writes (`CHANGE_EVENT`) and other tabs' (`storage`).
 * `onStorage` runs first for a cross-tab event, so a caller can re-stamp `<html>` before the
 * subscribers re-read it.
 */
export function subscribeStore(
  onChange: () => void,
  onStorage?: (event: StorageEvent) => void,
): () => void {
  const storage = (event: StorageEvent) => {
    onStorage?.(event);
    onChange();
  };
  window.addEventListener('storage', storage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', storage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function subscribe(onChange: () => void): () => void {
  return subscribeStore(onChange);
}

const noopSubscribe = () => () => {};

/** false during SSR and the hydrating render, true afterwards. */
export function useIsHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/**
 * The current stored value: `null` when unset (and during SSR), `UNAVAILABLE` when storage threw.
 */
export function useStoredValue(key: string): string | null {
  return useSyncExternalStore(
    subscribe,
    () => readStored(key),
    () => null,
  );
}
