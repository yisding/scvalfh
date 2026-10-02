import { getGameDates, getLatestResultsDate, getToday } from '../../lib/data';

import NavLink from './NavLink';

/**
 * The phone bottom bar (DESIGN §1.3, §3.1, R-3). FIVE tabs, because "find my school" was a
 * top-three task with no phone nav entry. The bar is 56px tall plus the safe-area inset; each tab
 * is an equal fifth of a row capped at 448px, so a 320px phone still gets 64×56 per tab (past the
 * 44×44 minimum) and the fifth tab is never pushed off-screen. The labels are ≤6 characters at
 * 12px, so they do not truncate at any supported width.
 *
 * It is a `<nav aria-label="Sections">` and the active tab carries `aria-current`, accent ink, a
 * wash capsule behind its glyph AND a heavier label — never color alone. `aria-current` is "page"
 * on the tab's own route and "true" inside its section (a team page under Teams; a day or game page
 * under Scores, which used to leave the bar with nothing lit), see NavLink.tsx.
 *
 * Scores opens on the latest results, not on the top of a season-long list: its href carries the
 * date as a fragment (see scoresHref below). The desktop TopNav's Schedule link stays plain
 * `/schedule`, a page that also has the timeline rail to jump with.
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

/**
 * `/schedule#<date>` for the Scores tab. The date is the latest day at or before "today" (the
 * snapshot's Pacific day, never the clock) with at least one final; before the first result it is
 * the next day with a contest; with no contests at all it is plain `/schedule`. Each date group on
 * /schedule carries its date key as its `id` (components/schedule/ScheduleList.tsx).
 *
 * Computed at build time like every other page fact, so it costs no client JavaScript. NavLink
 * compares only the path part, so the tab is still current on /schedule itself.
 */
function scoresHref(): string {
  const today = getToday();
  const date = getLatestResultsDate() ?? getGameDates().find((d) => d >= today) ?? null;
  return date ? `/schedule#${date}` : '/schedule';
}

const TABS = [
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
    // Replaced per build by scoresHref() in BottomTabBar below.
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
        {/* A ranked list: a rank mark, then the row. Three bare lines read as a menu icon. */}
        <path d="M3 5h1.5M7.5 5H17M3 10h1.5M7.5 10H17M3 15h1.5M7.5 15H17" />
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
    label: 'CCS',
    glyph: (
      <svg {...ICON_PROPS} aria-hidden="true">
        {/* A trophy: cup, two handles, and a stem that reaches its base. A cup over a detached
            dash did not read as a trophy at 20px. */}
        <path d="M6 3h8v5a4 4 0 0 1-8 0zM6 5H4a2 2 0 0 0 2 3M14 5h2a2 2 0 0 1-2 3M10 12v4.5M7 17h6" />
      </svg>
    ),
  },
];

export function BottomTabBar() {
  const scores = scoresHref();
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
              href={tab.href === '/schedule' ? scores : tab.href}
              variant="tab"
              label={tab.label}
              glyph={tab.glyph}
            />
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default BottomTabBar;
