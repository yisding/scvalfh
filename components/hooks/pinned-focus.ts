/**
 * Where keyboard focus goes around pinning and unpinning a team (WCAG 2.4.3: never `<body>`). Plain
 * DOM functions, no React and no directive: MyTeamCard.tsx renders the Unpin button this file
 * names (`UNPIN_ID`), FindYourTeam.tsx and TeamFinder's `onPin` call `focusUnpin`, and the
 * fallback targets themselves live beside the pin state in use-pinned-team.ts.
 */

import { isNearViewport, unpinFallbackTarget } from '@/components/hooks/use-pinned-team';

/** The pinned card's Unpin button: where focus lands once a team is pinned (FindYourTeam, TeamFinder). */
export const UNPIN_ID = 'my-team-unpin';

/** Focus the pinned card's Unpin button once it has rendered. */
export function focusUnpin(): void {
  const run = () => document.getElementById(UNPIN_ID)?.focus();
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
  else run();
}

/**
 * Focus target after an unpin: the team's own tile when rendered and on screen (`isNearViewport` —
 * a tile far below the card is skipped, so the page does not jump), else `unpinFallbackTarget()` —
 * the slot's finder field, or, when the whole slot hides (a pin with "All" remembered), the
 * first-visit finder or its heading. Never `<body>` (WCAG 2.4.3).
 */
export function unpinFocusTarget(slug: string | null): HTMLElement | null {
  const rendered = (el: Element) => el.getClientRects().length > 0;
  if (slug && /^[a-z0-9-]+$/.test(slug)) {
    const tile = [...document.querySelectorAll<HTMLElement>(`[data-pin-tile="${slug}"]`)].find(
      (el) => rendered(el) && isNearViewport(el),
    );
    if (tile) return tile;
  }
  return unpinFallbackTarget();
}
