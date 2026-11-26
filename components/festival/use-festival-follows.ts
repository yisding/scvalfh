'use client';

import { useCallback } from 'react';

import { UNAVAILABLE, notifyStore, readStored, useIsHydrated, useStoredValue, writeStored } from '../prefs/local-store';
import { FEST_FOLLOW_ATTR, FEST_FOLLOW_KEY, FEST_FOLLOW_MAX, FEST_FOLLOW_RESTAMP, parseFollows } from './follow-script';

/**
 * The followed festival teams (DESIGN §35), the client half: read through the site's one storage layer
 * (components/prefs/local-store.ts: try/catch everywhere, `storage` events from other tabs), written storage
 * FIRST — when that throws nothing else happens and the caller says so in words, as usePinnedTeam does — then
 * `<html data-fest-follow>` is restamped (the stylesheet's only input) and every subscriber re-reads.
 *
 * `ready` is false during SSR and the hydrating render, so a control never shows a guessed state.
 */
export interface FestivalFollows {
  follows: readonly string[];
  ready: boolean;
  /** false when localStorage threw. */
  available: boolean;
  /** Whether the list is at FEST_FOLLOW_MAX: following one more is refused. */
  full: boolean;
  /** Add `slugs` (follow) or remove them; returns false, changing nothing, when storage is unavailable or full. */
  set: (slugs: readonly string[], on: boolean) => boolean;
}

function stamp(list: readonly string[]): void {
  try {
    const restamp = (window as unknown as Record<string, unknown>)[FEST_FOLLOW_RESTAMP];
    if (typeof restamp === 'function') {
      (restamp as () => void)();
      return;
    }
    const html = document.documentElement;
    if (list.length > 0) html.setAttribute(FEST_FOLLOW_ATTR, list.join(' '));
    else html.removeAttribute(FEST_FOLLOW_ATTR);
  } catch {
    /* no DOM */
  }
}

/** Write the list (the work behind `set`, and the stale-slug cleanup): storage, then `<html>`, then subscribers. */
export function writeFollows(list: readonly string[]): boolean {
  if (!writeStored(FEST_FOLLOW_KEY, list.length > 0 ? list.join(' ') : null)) return false;
  stamp(list);
  // writeStored notified before the stamp; notify again so subscribers read the new attribute.
  notifyStore();
  return true;
}

export function useFestivalFollows(): FestivalFollows {
  const ready = useIsHydrated();
  const raw = useStoredValue(FEST_FOLLOW_KEY);
  const available = raw !== UNAVAILABLE;
  const follows = available ? parseFollows(raw) : [];

  const set = useCallback((slugs: readonly string[], on: boolean) => {
    const stored = readStored(FEST_FOLLOW_KEY);
    if (stored === UNAVAILABLE) return false;
    const current = parseFollows(stored);
    const next = on ? [...current, ...slugs.filter((s) => !current.includes(s))] : current.filter((s) => !slugs.includes(s));
    if (next.length > FEST_FOLLOW_MAX) return false;
    return writeFollows(next);
  }, []);

  return { follows, ready, available, full: follows.length >= FEST_FOLLOW_MAX, set };
}
