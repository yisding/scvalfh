'use client';

import { useCallback, useEffect } from 'react';

import { PINNED_TEAM_KEY } from '../layout/pinned-team-script';

import {
  UNAVAILABLE,
  readStored,
  useIsHydrated,
  useStoredValue,
  writeStored,
} from './local-store';

/**
 * The one optional personalization: pin a team (DESIGN §1 decision 5, §7.12).
 *
 * `localStorage`, no account, no cookie, nothing leaves the browser. `ready` is false until after
 * hydration, so a server-rendered fallback never flashes the wrong state: the caller reserves the
 * card's height and the content swaps once storage has been read — CLS 0 in all three cases
 * (pinned, unpinned, storage blocked).
 *
 * A stored slug that is no longer in the snapshot is CLEARED and reported as `stalePin`, so the
 * caller can say "that team is no longer in the data" instead of rendering a ghost team.
 */
// Defined in a server-safe module, because the layout's inline marker script needs it too.
export { PINNED_TEAM_KEY };

export interface PinnedTeamState {
  /** The pinned slug, or null when nothing is pinned, storage is unavailable, or before hydration. */
  pinned: string | null;
  /** false until the first client read has happened. */
  ready: boolean;
  /** false when localStorage threw — the UI hides the pin button and says so. */
  available: boolean;
  /** A stored slug that is no longer in the snapshot. It has been cleared from storage. */
  stalePin: string | null;
  pin: (slug: string) => void;
  unpin: () => void;
  toggle: (slug: string) => void;
}

/**
 * @param knownSlugs every slug in the current snapshot, passed down from the server so a stale pin
 * can be detected without the client reading the snapshot.
 */
export function usePinnedTeam(knownSlugs?: readonly string[]): PinnedTeamState {
  const ready = useIsHydrated();
  const raw = useStoredValue(PINNED_TEAM_KEY);
  const available = raw !== UNAVAILABLE;
  const stored = available ? raw : null;
  const isStale = !!stored && !!knownSlugs && !knownSlugs.includes(stored);

  // Writing to localStorage is exactly the external-system sync an effect is for, and no React
  // state is set here — the store notifies its own subscribers and the render follows from that.
  useEffect(() => {
    if (isStale) writeStored(PINNED_TEAM_KEY, null);
  }, [isStale]);

  const pin = useCallback((slug: string) => {
    writeStored(PINNED_TEAM_KEY, slug);
  }, []);

  const unpin = useCallback(() => {
    writeStored(PINNED_TEAM_KEY, null);
  }, []);

  const toggle = useCallback((slug: string) => {
    const current = readStored(PINNED_TEAM_KEY);
    writeStored(PINNED_TEAM_KEY, current === slug ? null : slug);
  }, []);

  return {
    pinned: isStale ? null : stored,
    ready,
    available,
    stalePin: isStale ? stored : null,
    pin,
    unpin,
    toggle,
  };
}
