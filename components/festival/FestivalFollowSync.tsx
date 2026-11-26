'use client';

import { useEffect } from 'react';

import { UNAVAILABLE, readStored } from '../prefs/local-store';
import { FEST_FOLLOW_KEY, parseFollows } from './follow-script';
import { useFestivalFollows, writeFollows } from './use-festival-follows';

/**
 * Drops followed slugs the festival no longer has (a team withdrawn or renamed mid-event) from storage, so the
 * list never fills with ghosts and the hub's empty state comes back when nothing real is left. Rendered once, by
 * the festival layout, which passes the slugs: the head script cannot carry them (it runs on every page of the
 * site). Renders nothing.
 */
export function FestivalFollowSync({ knownSlugs }: { knownSlugs: readonly string[] }) {
  const { follows, ready, available } = useFestivalFollows();
  const stale = ready && available && follows.some((s) => !knownSlugs.includes(s));
  // Writing to localStorage is the external-system sync an effect is for; no React state is set here.
  useEffect(() => {
    if (!stale) return;
    const stored = readStored(FEST_FOLLOW_KEY);
    if (stored === UNAVAILABLE) return;
    writeFollows(parseFollows(stored).filter((s) => knownSlugs.includes(s)));
  }, [stale, knownSlugs]);
  return null;
}

export default FestivalFollowSync;
