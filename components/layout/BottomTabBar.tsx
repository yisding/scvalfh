import type { LeagueId, TeamSlug } from '../../lib/types';

import NavLink from './NavLink';
import { navLeagueHrefs } from './TopNav';

/**
 * The phone bottom bar (DESIGN §1.3, §3.1, R-3). FIVE tabs, because "find my school" was a
 * top-three task with no phone nav entry. The bar is 56px tall plus the safe-area inset; each tab
 * is an equal fifth of a row capped at 448px, so a 320px phone still gets 64×56 per tab (past the
 * 44×44 minimum) and the fifth tab is never pushed off-screen. The labels are ≤ 8 characters,
 * measured: at 12px/500 Geist the widest, "Playoffs" (renamed from "CCS", which was false for
 * MCAL), is ≈ 49.5px against the 64px tab (tests/ui/text-metrics.ts), and tests/ui/tab-labels.test.ts
 * fails any label over 56px, so none truncates at any supported width.
 *
 * After hydration Scores, Table and Playoffs follow the page's league, else the remembered one
 * (`/schedule/<id>`, `/standings/<id>`, `/playoffs#<id>` or `/playoffs/mcal`; SPEC §8.3); the
 * static HTML keeps the index hrefs.
 *
 * It is a `<nav aria-label="Sections">` and the active tab carries `aria-current="page"`, accent
 * ink, a wash capsule behind its glyph AND a heavier label — never color alone.
 */
const ICON_PROPS = {
  width: 20,
  height: 20,
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export const TABS = [
  {
    href: '/',
    label: 'Home',
    glyph: (
      <svg {...ICON_PROPS} aria-hidden="true">
        <path d="M3 8.5 10 3l7 5.5" />
        <path d="M5 8v9h10V8" />
      </svg>
    ),
  },
  {
    href: '/schedule',
    label: 'Scores',
    glyph: (
      <svg {...ICON_PROPS} aria-hidden="true">
        <rect x="3" y="4" width="14" height="13" rx="1.5" />
        <path d="M3 8h14M7 4V2.5M13 4V2.5" />
      </svg>
    ),
  },
  {
    href: '/standings',
    label: 'Table',
    glyph: (
      <svg {...ICON_PROPS} aria-hidden="true">
        <path d="M3 5h14M3 10h14M3 15h14" />
      </svg>
    ),
  },
  {
    href: '/teams',
    label: 'Teams',
    glyph: (
      <svg {...ICON_PROPS} aria-hidden="true">
        <rect x="3" y="3" width="6" height="6" rx="1" />
        <rect x="11" y="3" width="6" height="6" rx="1" />
        <rect x="3" y="11" width="6" height="6" rx="1" />
        <rect x="11" y="11" width="6" height="6" rx="1" />
      </svg>
    ),
  },
  {
    href: '/playoffs',
    label: 'Playoffs',
    glyph: (
      <svg {...ICON_PROPS} aria-hidden="true">
        <path d="M4 4v8a6 6 0 0 0 12 0V4z" />
        <path d="M8 18h4" />
      </svg>
    ),
  },
];

export function BottomTabBar({
  slugLeague,
}: {
  /** `{ slug: league }` for every team (the same map the prefs script embeds). */
  slugLeague?: Readonly<Record<TeamSlug, LeagueId>>;
}) {
  const hrefs = navLeagueHrefs();
  return (
    <nav
      aria-label="Sections"
      className="sx-chrome-bottom fixed bottom-0 left-0 z-20 w-full bg-surface shadow-[0_-1px_0_var(--sx-border)] md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto flex w-full max-w-md list-none p-0">
        {TABS.map((tab) => (
          <li key={tab.href} className="min-w-0 flex-1">
            <NavLink
              href={tab.href}
              variant="tab"
              label={tab.label}
              glyph={tab.glyph}
              leagueHrefs={hrefs[tab.href]}
              slugLeague={hrefs[tab.href] ? slugLeague : undefined}
            />
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default BottomTabBar;
