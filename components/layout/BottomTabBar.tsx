import { getGameDates, getLatestResultsDate, getToday } from '../../lib/data';
import { LEAGUE_IDS } from '../../lib/leagues';
import type { LeagueId, TeamSlug } from '../../lib/types';

import NavLink from './NavLink';
import { navLeagueHrefs } from './TopNav';

/**
 * The phone bottom bar (DESIGN §1.3, §3.1, R-3, §18). FIVE tabs: Home, Scores, Teams, Leaders,
 * Playoffs. "Find my school" was a top-three task with no phone nav entry, so Teams has a tab; since
 * DESIGN §18 that page also holds every division's standings table, so the separate Table tab gave
 * its place to Leaders (/leaders). The bar is 56px tall plus the safe-area inset; each tab
 * is an equal fifth of a row capped at 448px, so a 320px phone still gets 64×56 per tab (past the
 * 44×44 minimum) and the fifth tab is never pushed off-screen. The labels are ≤ 8 characters,
 * measured: at 12px/500 Geist the widest, "Playoffs" (renamed from "CCS", which was false for
 * MCAL), is ≈ 49.5px against the 64px tab (tests/ui/text-metrics.ts), and tests/ui/tab-labels.test.ts
 * fails any label over 56px, so none truncates at any supported width.
 *
 * After hydration Scores, Teams and Playoffs follow the page's league, else the remembered one
 * (`/schedule/<id>#<date>`, `/teams#<id>`, `/playoffs#<id>` or `/playoffs/mcal`; SPEC §8.3); the
 * static HTML keeps the index hrefs.
 *
 * It is a `<nav aria-label="Sections">` and the active tab carries `aria-current`, accent ink, a
 * wash capsule behind its glyph AND a heavier label — never color alone. `aria-current` is "page"
 * on the tab's own route and "true" inside its section (a team page or a standings page under Teams;
 * a day or game page under Scores, which used to leave the bar with nothing lit), see NavLink.tsx.
 *
 * Scores opens on the latest results, not on the top of a season-long list: its href carries the
 * date as a fragment (see scoresHrefs below), and so does each of its league targets
 * (`/schedule/<id>#<date>`, that league's own latest results). The desktop TopNav's Schedule link
 * stays plain `/schedule`, a page that also has the timeline rail to jump with.
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
 * The Scores tab's landing date, across every league or within one: the latest day at or before
 * "today" (the snapshot's Pacific day, never the clock) with at least one final; before the first
 * result it is the next day with a contest; with no contests at all, none. Each day on the
 * /schedule index's "Every game day" list (components/schedule/ScheduleIndex.tsx) and each date
 * group on /schedule/<id> (components/schedule/ScheduleList.tsx) carries its date key as its `id`.
 */
function scoresDate(league?: LeagueId): string | null {
  const today = getToday();
  const filter = league ? { league } : {};
  return getLatestResultsDate(undefined, filter) ?? getGameDates(filter).find((d) => d >= today) ?? null;
}

const withDate = (path: string, date: string | null) => (date ? `${path}#${date}` : path);

/**
 * `/schedule#<date>` for the Scores tab, plus its per-league targets `/schedule/<id>#<date>`.
 * Computed at build time like every other page fact, so it costs no client JavaScript. NavLink
 * compares only the path part, so the tab is still current on /schedule and /schedule/<id>.
 */
function scoresHrefs(): { href: string; leagueHrefs: Readonly<Record<LeagueId, string>> } {
  return {
    href: withDate('/schedule', scoresDate()),
    leagueHrefs: Object.fromEntries(LEAGUE_IDS.map((id) => [id, withDate(`/schedule/${id}`, scoresDate(id))])),
  };
}

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
    // Replaced per build by scoresHrefs() in BottomTabBar below.
    glyph: (
      <svg {...ICON_PROPS} aria-hidden="true">
        <rect x="3" y="4" width="14" height="13" rx="1.5" />
        <path d="M3 8h14M7 4V2.5M13 4V2.5" />
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
    href: '/leaders',
    label: 'Leaders',
    glyph: (
      <svg {...ICON_PROPS} aria-hidden="true">
        {/* A podium: 1st in the middle, the highest block, with 2nd and 3rd beside it on one
            floor line. A plain bar chart would read as statistics, not places. */}
        <path d="M2.5 17.5h15M7.5 17.5V3.5h5v14M3 17.5V9h4.5M12.5 17.5V12H17v5.5" />
      </svg>
    ),
  },
  {
    href: '/playoffs',
    label: 'Playoffs',
    glyph: (
      <svg {...ICON_PROPS} aria-hidden="true">
        {/* A trophy: cup, two handles, and a stem that reaches its base. A cup over a detached
            dash did not read as a trophy at 20px. */}
        <path d="M6 3h8v5a4 4 0 0 1-8 0zM6 5H4a2 2 0 0 0 2 3M14 5h2a2 2 0 0 1-2 3M10 12v4.5M7 17h6" />
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
  const scores = scoresHrefs();
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
              href={tab.href === '/schedule' ? scores.href : tab.href}
              variant="tab"
              label={tab.label}
              glyph={tab.glyph}
              leagueHrefs={tab.href === '/schedule' ? scores.leagueHrefs : hrefs[tab.href]}
              slugLeague={hrefs[tab.href] ? slugLeague : undefined}
            />
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default BottomTabBar;
