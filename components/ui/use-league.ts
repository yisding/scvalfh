'use client';

import { useSyncExternalStore } from 'react';

import { ALL_LEAGUES, LEAGUE_KEY, PREFS_RESTAMP, REGION_KEY, REGION_OF, STAMPLESS_REGION } from '../layout/prefs-script';
import { PINNED_TEAM_KEY } from '../layout/pinned-team-script';
import type { LeagueId, RegionId } from '../../lib/types';

import { UNAVAILABLE, subscribeStore, useIsHydrated, useStoredValue, writeStored } from './local-store';

/**
 * The remembered league and region, the client half (SPEC §8.2; DESIGN-socal §2.4).
 *
 * The SOURCE OF TRUTH on the client is `<html data-league>` and `<html data-region>`, which the
 * prefs script stamped before first paint (components/layout/prefs-script.ts) and which the scope
 * stylesheet already obeys. The hooks read those attributes through `useSyncExternalStore` with a
 * server snapshot of `null` (league) and `'norcal'` (region), so the hydrating render matches the
 * static HTML exactly and React re-renders once afterwards. Neither hook reads storage for the value:
 * the stamp has already applied the precedence (a stored league beats a stored region beats a pin),
 * and reading storage here would be a second, drifting copy of it (design-review UI §5).
 *
 * The league is WRITTEN only by `setLeague` (a home scope chip, a "Show <SHORT> here" button) and
 * by pinning a team (`usePinnedTeam().pin`); the region by `setRegion` (the region switcher) and by
 * `setLeague`, which writes the league's region alongside it. Following a URL or a link-mode chip
 * never writes either. This module is the region's whole client state: the RegionSwitcher lives in
 * the existing LeagueSwitcher.tsx, so the toggle adds no client module (first-load JS, DESIGN-socal
 * §2.4).
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

export interface EffectiveRegion {
  /** The effective region: `'socal'` when `<html data-region="socal">`, else `'norcal'` (also SSR). */
  region: RegionId;
  /** false during SSR and the hydrating render. The region buttons stay disabled until true. */
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
 * The stamped region. Only `'socal'` is ever stamped (absent = the default region); any other value
 * reads as the default, so a hand-edited attribute cannot produce a region the page has no block for.
 */
function readRegionStamp(): RegionId {
  try {
    return document.documentElement.getAttribute('data-region') === 'socal' ? 'socal' : STAMPLESS_REGION;
  } catch {
    return STAMPLESS_REGION;
  }
}

/**
 * Another tab changed the league, the region or the pin: re-run the prefs script's own stamp (it
 * validates the id against the configured leagues, the pin against the slug map and applies the
 * region precedence) before subscribers re-read.
 */
function restampFromStorage(event: StorageEvent): void {
  if (event.key !== null && event.key !== LEAGUE_KEY && event.key !== PINNED_TEAM_KEY && event.key !== REGION_KEY) {
    return;
  }
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

/** The effective region, read from the `<html data-region>` stamp (server snapshot `'norcal'`). */
export function useEffectiveRegion(): EffectiveRegion {
  const region = useSyncExternalStore<RegionId>(subscribe, readRegionStamp, () => STAMPLESS_REGION);
  const ready = useIsHydrated();
  const available = useStoredValue(REGION_KEY) !== UNAVAILABLE;
  return { region, ready, available };
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

/** Stamp `<html data-region>` (removed for the default region) without writing storage. */
function stampRegion(region: RegionId): void {
  try {
    const html = document.documentElement;
    if (region === STAMPLESS_REGION) html.removeAttribute('data-region');
    else html.setAttribute('data-region', region);
  } catch {
    /* no DOM */
  }
}

/**
 * A league's region, from the prefs script's `window.__sxRegionOf` (the one copy of the map; no
 * client module imports lib/leagues). null for `'all'`, an unknown id, or when the script never ran.
 */
function regionOfLeague(id: LeagueId | typeof ALL_LEAGUES | null): RegionId | null {
  if (id === null || id === ALL_LEAGUES) return null;
  try {
    const lookup = (window as unknown as Record<string, unknown>)[REGION_OF];
    if (typeof lookup !== 'function') return null;
    const region = (lookup as (l: string) => unknown)(id);
    return region === 'socal' || region === 'norcal' ? region : null;
  } catch {
    return null;
  }
}

/**
 * Remember a league (or `'all'`): sets/removes `html[data-league]` AND, for a league, sets/removes
 * `html[data-region]` from that league's region in the same tick, so the scope stylesheet swaps the
 * panels and the region at once (pinning a SoCal team from the NorCal view never leaves the page
 * with its league panel inside a hidden region: design-review UI §5). Then writes `scvalfh.league`
 * and, for a league, `scvalfh.region`, which notifies every subscriber; and only then, with
 * `opts.focus`, moves focus to the new panel's header (`'panel'`) or the My-team header (`'card'`).
 * Without `opts.focus` focus is left where it is (the scope chips keep it; they stay rendered).
 * `'all'` leaves the region alone: the All chip means every league of the region on screen.
 *
 * Works with storage blocked: the stamps are made before the writes, and a failed write only means
 * nothing is remembered (re-running the prefs script here would read empty storage and undo them).
 */
export function setLeague(id: LeagueId | typeof ALL_LEAGUES, opts?: { focus?: LeagueFocus }): void {
  const region = regionOfLeague(id);
  stampLeague(id);
  if (region !== null) stampRegion(region);
  // Notifies every subscriber (after the stamps, so they read the new attributes).
  writeStored(LEAGUE_KEY, id);
  if (region !== null) writeStored(REGION_KEY, region);
  focusAfterWrite(opts?.focus, id === ALL_LEAGUES ? null : id);
}

/**
 * Remember a region (the region switcher): stamps `html[data-region]`, writes `scvalfh.region`, and
 * when the effective league (the `data-league` stamp, stored or pin-derived) is in the OTHER region,
 * also `setLeague('all')`: a league of the hidden region would leave the home page with no panel
 * shown. A league of the chosen region is kept. Focus is not moved: the switcher's buttons stay
 * rendered in both regions.
 */
export function setRegion(region: RegionId): void {
  stampRegion(region);
  writeStored(REGION_KEY, region);
  const league = readStamp();
  if (league !== null && regionOfLeague(league) !== region) setLeague(ALL_LEAGUES);
}
