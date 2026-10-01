'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

import { PINNED_TEAM_ATTR } from '../layout/pinned-team-script';

import { usePinnedTeam } from './use-pinned-team';

/**
 * The pinned-team highlight, pass two: keep it correct after a CLIENT-SIDE navigation.
 *
 * Pass one is the inline <head> script (components/layout/pinned-team-script.ts), which is the only
 * thing that can mark a row before the first paint — but it hangs off `DOMContentLoaded`, which
 * fires once per document. Tapping Standings in the bottom tab bar is an RSC navigation, not a new
 * document, so on the primary phone journey the rows arrived unmarked: both the 2px accent rule and
 * the visually hidden "your team" note were simply absent
 * (node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md — "Scripts
 * inserted via DOM updates don't execute in the browser").
 *
 * It renders NOTHING. It lives in the root layout beside the nav, which is already a client module,
 * and it owns one attribute on elements the server rendered — never a class, so a row marked from
 * the server through `StandingsTable`'s `highlightSlug` is left exactly as it was.
 *
 * Keyed on `pathname` as well as the slug because the tables are different DOM on every route, and
 * gated on `ready` so the hydrating render — where the store still reports "nothing pinned" — never
 * strips the marks the head script has already painted.
 */
export function PinnedTeamMarks() {
  const pathname = usePathname();
  const { pinned, ready } = usePinnedTeam();

  useEffect(() => {
    if (!ready) return;
    for (const el of document.querySelectorAll<HTMLElement>('[data-team-slug]')) {
      if (pinned !== null && el.getAttribute('data-team-slug') === pinned) {
        el.setAttribute(PINNED_TEAM_ATTR, '');
      } else {
        el.removeAttribute(PINNED_TEAM_ATTR);
      }
    }
  }, [pathname, pinned, ready]);

  return null;
}

export default PinnedTeamMarks;
