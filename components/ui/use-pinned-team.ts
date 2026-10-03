'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';

import { PINNED_TEAM_KEY } from '../layout/pinned-team-script';
import type { LeagueId } from '../../lib/types';

import {
  UNAVAILABLE,
  notifyStore,
  readStored,
  subscribeStore,
  useIsHydrated,
  useStoredValue,
  writeStored,
} from './local-store';
import { focusAfterWrite, setLeague, type LeagueFocus } from './use-league';

/**
 * The one optional personalization: pin a team (DESIGN §1 decision 5, §7.12; SPEC §8.2).
 *
 * `localStorage`, no account, no cookie, nothing leaves the browser. `ready` is false until after
 * hydration, so a server-rendered fallback never flashes the wrong state: the caller reserves the
 * card's height and the content swaps once storage has been read — CLS 0 in all three cases
 * (pinned, unpinned, storage blocked).
 *
 * The pin is mirrored on `<html>` as `data-pin` (the slug) — stamped before first paint by the prefs
 * script (components/layout/prefs-script.ts) and kept in step here — because the home page's
 * scope stylesheet reserves the My-team slot from it.
 *
 * Pinning a team ALSO remembers its league (`setLeague(leagueId)`): pinning is one of the three
 * writes SPEC §8.2 allows. Unpinning leaves the league alone.
 *
 * A stored slug that is no longer in the snapshot is CLEARED from storage and reported as
 * `stalePin` for the rest of this page view (with `html[data-pin-stale]`), so the caller can say
 * "that team is no longer in the data" instead of rendering a ghost team; `unpin()` or `pin()`
 * dismisses it.
 */
// Defined in a server-safe module, because the layout's inline marker script needs it too.
export { PINNED_TEAM_KEY };

export interface PinOptions {
  /** `'card'` → focus `#my-team-heading`; `'panel'` → the pinned team's league panel header. */
  focus?: LeagueFocus;
}

export interface UnpinOptions {
  /**
   * `'auto'` (SPEC §8.2): one frame later, focus the unpinned team's tile when it is rendered (the
   * first rendered `[data-team-slug="<slug>"]` that is, or contains, a link or button), else
   * `unpinFallbackTarget()` (the slot's finder, the first-visit finder, or its heading). A function
   * returns the element to focus instead. Omitted: focus is left alone.
   */
  focus?: 'auto' | (() => HTMLElement | null | undefined);
}

export interface PinnedTeamState {
  /** The pinned slug, or null when nothing is pinned, storage is unavailable, or before hydration. */
  pinned: string | null;
  /** false until the first client read has happened. */
  ready: boolean;
  /** false when localStorage threw — the UI hides the pin button and says so. */
  available: boolean;
  /** A stored slug that is no longer in the snapshot. It has been cleared from storage. */
  stalePin: string | null;
  /**
   * Pin `slug`; with `leagueId` also remember that league (SPEC §8.2 write 3). Returns false — and
   * changes nothing — when storage is unavailable.
   */
  pin: (slug: string, leagueId?: LeagueId, opts?: PinOptions) => boolean;
  unpin: (opts?: UnpinOptions) => void;
  /** Pin, or unpin when `slug` is already the pin. */
  toggle: (slug: string, leagueId?: LeagueId) => void;
}

// ---------------------------------------------------------------- the stale pin, per page view

let staleSlug: string | null = null;

function readStale(): string | null {
  return staleSlug;
}

function setStale(slug: string | null): void {
  if (staleSlug === slug) return;
  staleSlug = slug;
  try {
    if (slug === null) document.documentElement.removeAttribute('data-pin-stale');
    else document.documentElement.setAttribute('data-pin-stale', '');
  } catch {
    /* no DOM */
  }
  notifyStore();
}

function subscribeStale(onChange: () => void): () => void {
  return subscribeStore(onChange);
}

// ---------------------------------------------------------------- <html data-pin>

function stampPin(slug: string | null): void {
  try {
    const html = document.documentElement;
    if (slug === null) html.removeAttribute('data-pin');
    else html.setAttribute('data-pin', slug);
  } catch {
    /* no DOM */
  }
}

function isRendered(el: Element): boolean {
  return el.getClientRects().length > 0;
}

/**
 * Where focus goes after an unpin when the team's own tile is not rendered (SPEC §8.2, WCAG 2.4.3):
 * the My-team slot's finder field; else — the slot is hidden, e.g. a pin with "All" remembered,
 * where unpinning leaves no slot at all — the first-visit block's finder (`[data-scope="none"]`,
 * shown exactly when the slot hides); else that block's heading (`#find-your-team`, made
 * programmatically focusable). Shared by `focus: 'auto'` and MyTeamCard's own target.
 */
export function unpinFallbackTarget(): HTMLElement | null {
  for (const selector of ['.sx-myteam-slot input[type="search"]', '[data-scope="none"] input[type="search"]']) {
    const field = [...document.querySelectorAll<HTMLElement>(selector)].find(isRendered);
    if (field) return field;
  }
  const heading = document.getElementById('find-your-team');
  if (heading && isRendered(heading)) {
    if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
    return heading;
  }
  return null;
}

function focusAfterUnpin(slug: string | null, focus: UnpinOptions['focus']): void {
  if (!focus) return;
  const run = () => {
    let target: HTMLElement | null | undefined = null;
    if (typeof focus === 'function') {
      target = focus();
    } else {
      if (slug !== null && /^[a-z0-9-]+$/.test(slug)) {
        for (const el of document.querySelectorAll<HTMLElement>(`[data-team-slug="${slug}"]`)) {
          const control = el.matches('a[href], button')
            ? el
            : el.querySelector<HTMLElement>('a[href], button');
          if (control && isRendered(control)) {
            target = control;
            break;
          }
        }
      }
      if (!target) target = unpinFallbackTarget();
    }
    target?.focus();
  };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
  else run();
}

/**
 * Pin `slug` (the work behind `usePinnedTeam().pin`). Storage is written FIRST: when it throws
 * (a private window, blocked site data) nothing else happens — no `html[data-pin]` stamp, no
 * remembered league, no focus move — and this returns false, so the caller can fall back to a
 * plain team link instead of leaving an empty My-team box with nothing to unpin.
 */
export function pinTeam(slug: string, leagueId?: LeagueId, opts?: PinOptions): boolean {
  if (!writeStored(PINNED_TEAM_KEY, slug)) return false;
  stampPin(slug);
  setStale(null);
  // writeStored notified before the stamp; notify again so subscribers read the new attribute.
  notifyStore();
  if (leagueId) setLeague(leagueId);
  focusAfterWrite(opts?.focus, leagueId ?? null);
  return true;
}

/**
 * @param knownSlugs every slug in the current snapshot, passed down from the server so a stale pin
 * can be detected without the client reading the snapshot.
 */
export function usePinnedTeam(knownSlugs?: readonly string[]): PinnedTeamState {
  const ready = useIsHydrated();
  const raw = useStoredValue(PINNED_TEAM_KEY);
  const remembered = useSyncExternalStore(subscribeStale, readStale, () => null);
  const available = raw !== UNAVAILABLE;
  const stored = available ? raw : null;
  const isStale = !!stored && !!knownSlugs && !knownSlugs.includes(stored);

  // Writing to localStorage is exactly the external-system sync an effect is for, and no React
  // state is set here — the stores notify their own subscribers and the render follows from that.
  useEffect(() => {
    if (!isStale || !stored) return;
    setStale(stored);
    writeStored(PINNED_TEAM_KEY, null);
  }, [isStale, stored]);

  const pin = useCallback(
    (slug: string, leagueId?: LeagueId, opts?: PinOptions) => pinTeam(slug, leagueId, opts),
    [],
  );

  const unpin = useCallback((opts?: UnpinOptions) => {
    const previous = readStored(PINNED_TEAM_KEY);
    stampPin(null);
    setStale(null);
    writeStored(PINNED_TEAM_KEY, null);
    focusAfterUnpin(previous === UNAVAILABLE ? null : previous, opts?.focus);
  }, []);

  const toggle = useCallback(
    (slug: string, leagueId?: LeagueId) => {
      if (readStored(PINNED_TEAM_KEY) === slug) unpin();
      else pin(slug, leagueId);
    },
    [pin, unpin],
  );

  const stalePin = isStale ? stored : remembered;
  return {
    pinned: isStale ? null : stored,
    ready,
    available,
    stalePin,
    pin,
    unpin,
    toggle,
  };
}
