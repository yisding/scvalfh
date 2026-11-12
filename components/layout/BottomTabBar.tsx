import { getFetchedAt, getScoresLandingDate } from '../../lib/data';
import { formatStamp } from '../../lib/format';
import { LEAGUE_IDS } from '../../lib/leagues';
import type { LeagueId, TeamSlug } from '../../lib/types';

import MoreMenu, { type MoreMenuLink } from './MoreMenu';
import NavLink from './NavLink';
import { navLeagueHrefs } from './nav-targets';
import { DATA_CORRECTIONS_URL } from './site';

/**
 * The phone bottom bar (DESIGN §33). Four tabs and a More sheet: Home, Scores, Standings, Playoffs,
 * then `<MoreMenu />` with Teams, Leaders, JV, last season's archive, About and the corrections
 * thread. The bar is 56px tall plus the safe-area inset; each cell is an equal fifth of a row capped
 * at 448px, so a 320px phone still gets 64×56 per tab. The labels are 11px and measured
 * (tests/ui/tab-labels.test.ts): none truncates at any supported width or text size.
 *
 * After hydration Scores, Standings and Playoffs follow the page's league, else the remembered one
 * (`/schedule/<id>#<date>`, `/standings/<id>`, `/playoffs#<id>` or `/playoffs/mcal`; SPEC §8.3); the
 * static HTML keeps the index hrefs.
 *
 * It is a `<nav aria-label="Sections">` and the current tab carries `aria-current`, a 4px ink bar
 * hanging from the bar's top rule AND a 700 label, never colour alone. `aria-current` is "page" on
 * the tab's own route and "true" inside its section (a day or game page under Scores), see
 * NavLink.tsx. The More tab is lit on the routes its sheet leads to.
 *
 * Scores opens on the latest results, not on the top of a season-long list: its href carries the
 * date as a fragment (see scoresHrefs below), and so does each of its league targets
 * (`/schedule/<id>#<date>`, that league's own latest results). The masthead's Scores link stays
 * plain `/schedule`.
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
 * The Scores tab's landing date, across every league or within one (lib/data
 * getScoresLandingDate, which ScheduleList also reads). Each day on the /schedule index's "Every
 * game day" list (components/schedule/ScheduleIndex.tsx) and each date group on /schedule/<id>
 * (components/schedule/ScheduleList.tsx) carries its date key as its `id`.
 */
function scoresDate(league?: LeagueId): string | null {
  return getScoresLandingDate(league ? { league } : {});
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
    href: '/standings',
    label: 'Standings',
    glyph: (
      <svg {...ICON_PROPS} aria-hidden="true">
        {/* Three rows of a table. */}
        <path d="M3 5h14M3 10h14M3 15h14" />
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

/** The More sheet, in the footer index's order. Every route here is in MoreMenu's MORE_ROUTES. */
const MORE_LINKS: readonly MoreMenuLink[] = [
  { href: '/teams', label: 'Teams' },
  { href: '/leaders', label: 'Leaders' },
  { href: '/jv', label: 'JV' },
  { href: '/history/2025-26', label: '2025-26 archive' },
  { href: '/about', label: 'About and sources' },
  { href: DATA_CORRECTIONS_URL, label: 'Report an error', external: true },
];

const MORE_GLYPH = (
  <svg {...ICON_PROPS} aria-hidden="true">
    <path d="M4.5 10h.01M10 10h.01M15.5 10h.01" strokeWidth={2.4} />
  </svg>
);

export interface BottomTabBarProps {
  /** `{ slug: league }` for every team (the same map the prefs script embeds). */
  slugLeague?: Readonly<Record<TeamSlug, LeagueId>>;
}

export function BottomTabBar({ slugLeague }: BottomTabBarProps) {
  const hrefs = navLeagueHrefs();
  const scores = scoresHrefs();
  return (
    <nav aria-label="Sections" className="sx-chrome-bottom sx-tabbar">
      <ul>
        {TABS.map((tab) => (
          <li key={tab.href}>
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
        <li>
          <MoreMenu links={MORE_LINKS} glyph={MORE_GLYPH} stamp={`Updated ${formatStamp(getFetchedAt())}.`} />
        </li>
      </ul>
    </nav>
  );
}

export default BottomTabBar;
