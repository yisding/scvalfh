'use client';

import { useSyncExternalStore } from 'react';

import { ALL_LEAGUES, LEAGUE_KEY, PREFS_RESTAMP } from '../layout/prefs-script';
import { PINNED_TEAM_KEY } from '../layout/pinned-team-script';
import type { LeagueId } from '../../lib/types';

import { UNAVAILABLE, subscribeStore, useIsHydrated, useStoredValue, writeStored } from './local-store';

/**
 * The remembered league, the client half (SPEC §8.2).
 *
 * The SOURCE OF TRUTH on the client is `<html data-league>`, which the prefs script stamped before
 * first paint (components/layout/prefs-script.ts) and which the scope stylesheet already obeys. The
 * hook reads that attribute through `useSyncExternalStore` with a `null` server snapshot, so the
 * hydrating render matches the static HTML exactly and React re-renders once afterwards.
 *
 * The league is WRITTEN only by `setLeague` (a home scope chip, a "Show <SHORT> here" button) and
 * by pinning a team (`usePinnedTeam().pin`). Following a URL or a link-mode chip never writes it.
 */

export type LeagueFocus = 'panel' | 'card';

export interface EffectiveLeague {
  /** The effective league, or null (none stored, `'all'`, before hydration, or JS-free render). */
  league: LeagueId | null;
  /** false during SSR and the hydrating render. Buttons that write stay disabled until true. */
  ready: boolean;
  /** false when localStorage threw: switching still works for this page view, nothing is saved. */
  available: boolean;
}

function readStamp(): LeagueId | null {
  try {
    return document.documentElement.getAttribute('data-league');
  } catch {
    return null;
  }
}

/**
 * Another tab changed the league or the pin: re-run the prefs script's own stamp (it validates the
 * id against the configured leagues and the pin against the slug map) before subscribers re-read.
 */
function restampFromStorage(event: StorageEvent): void {
  if (event.key !== null && event.key !== LEAGUE_KEY && event.key !== PINNED_TEAM_KEY) return;
  try {
    const restamp = (window as unknown as Record<string, unknown>)[PREFS_RESTAMP];
    if (typeof restamp === 'function') (restamp as () => void)();
  } catch {
    /* the page keeps its current stamp */
  }
}

function subscribe(onChange: () => void): () => void {
  return subscribeStore(onChange, restampFromStorage);
}

export function useEffectiveLeague(): EffectiveLeague {
  const league = useSyncExternalStore(subscribe, readStamp, () => null);
  const ready = useIsHydrated();
  const available = useStoredValue(LEAGUE_KEY) !== UNAVAILABLE;
  return { league, ready, available };
}

/**
 * Move focus after a write (WCAG 2.4.3), one frame after the attribute changed so the target is
 * rendered: `'panel'` → the league panel's header `#league-<id>`, `'card'` → `#my-team-heading`.
 * `SectionHeader` puts the id on its wrapper and takes no tabIndex prop, so the wrapper is given
 * `tabindex="-1"` here (programmatically focusable, still out of the tab ring).
 */
export function focusAfterWrite(focus: LeagueFocus | undefined, leagueId: LeagueId | null): void {
  if (!focus) return;
  const id = focus === 'card' ? 'my-team-heading' : leagueId ? `league-${leagueId}` : null;
  if (!id) return;
  const run = () => {
    const el = document.getElementById(id);
    if (!el) return;
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    el.focus();
  };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
  else run();
}

/** Stamp `<html data-league>` (or remove it for `'all'`) without writing storage. */
function stampLeague(id: LeagueId | typeof ALL_LEAGUES): void {
  try {
    const html = document.documentElement;
    if (id === ALL_LEAGUES) html.removeAttribute('data-league');
    else html.setAttribute('data-league', id);
  } catch {
    /* no DOM */
  }
}

/**
 * Remember a league (or `'all'`): writes `scvalfh.league`, sets/removes `html[data-league]` so the
 * scope stylesheet swaps the panels at once, notifies every subscriber and, with `opts.focus`,
 * moves focus to the new panel's header (`'panel'`) or the My-team header (`'card'`). Without
 * `opts.focus` focus is left where it is (the scope chips keep it; they stay rendered).
 */
export function setLeague(id: LeagueId | typeof ALL_LEAGUES, opts?: { focus?: LeagueFocus }): void {
  stampLeague(id);
  // Notifies every subscriber (after the stamp, so they read the new attribute).
  writeStored(LEAGUE_KEY, id);
  focusAfterWrite(opts?.focus, id === ALL_LEAGUES ? null : id);
}
