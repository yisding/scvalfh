import { getFetchedAt, getScoresLandingDate } from '../../lib/data';
import { formatStamp } from '../../lib/format';
import { LEAGUE_IDS } from '../../lib/leagues';
import type { LeagueId, TeamSlug } from '../../lib/types';

import MoreMenu, { type MoreMenuLink } from './MoreMenu';
import NavLink from './NavLink';
import { navLeagueHrefs } from './nav-targets';
import { DATA_CORRECTIONS_URL, NAV_LABELS } from './site';

/**
 * The phone bar (DESIGN §33). Four text tabs and a More sheet: Scores, Standings, Playoffs, Teams
 * (the same four sections, in the same order, as the start of the header nav), then `<MoreMenu />`
 * with the reader's team, Leaders, JV, History, About, the corrections thread and the two
 * preferences. The wordmark is Home, and home is the Scores page, so on `/` the Scores cell is the
 * selected one. No icons.
 *
 * The bar is 52px tall plus the safe-area inset, on the page colour (it is not a band). Each cell is
 * as wide as its word plus an equal share of the spare width, so the gaps between the five words are
 * equal; the labels are measured (tests/ui/tab-labels.test.ts): none truncates at any supported
 * width or text size.
 *
 * After hydration the four tabs follow the page's league, else the remembered one
 * (`/schedule/<id>#<date>`, `/standings/<id>`, `/playoffs#<id>` or `/playoffs/mcal`, `/teams#<id>`;
 * SPEC §8.3); the static HTML keeps the index hrefs.
 *
 * It is a `<nav aria-label="Sections">` and the current tab carries `aria-current`, a 3px accent bar
 * on the cell's top edge AND a 700 label, never colour alone. `aria-current` is "page" on the tab's
 * own route and "true" inside its section (a day or game page under Scores), see NavLink.tsx. The
 * More tab is lit on the routes its sheet leads to.
 *
 * Scores opens on the latest results, not on the top of a season-long list: its href carries the
 * date as a fragment (see scoresHrefs below), and so does each of its league targets
 * (`/schedule/<id>#<date>`, that league's own latest results). The header's Scores link stays
 * plain `/schedule`.
 */

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

export const TABS: ReadonlyArray<{ href: string; label: string }> = [
  // The href is replaced per build by scoresHrefs() in BottomTabBar below.
  { href: '/schedule', label: NAV_LABELS.scores },
  { href: '/standings', label: NAV_LABELS.standings },
  { href: '/playoffs', label: NAV_LABELS.playoffs },
  { href: '/teams', label: NAV_LABELS.teams },
];

/** The More sheet's links, in the footer index's order. Every route here is in MoreMenu's MORE_ROUTES. */
const MORE_LINKS: readonly MoreMenuLink[] = [
  { href: '/leaders', label: NAV_LABELS.leaders },
  { href: '/jv', label: NAV_LABELS.jv },
  { href: '/history/2025-26', label: NAV_LABELS.history },
  { href: '/about', label: NAV_LABELS.about },
  { href: DATA_CORRECTIONS_URL, label: NAV_LABELS.report, external: true },
];

export interface BottomTabBarProps {
  /** `{ slug: league }` for every team (the same map the prefs script embeds). */
  slugLeague?: Readonly<Record<TeamSlug, LeagueId>>;
  /** `{ slug: short name }` for every team: the More sheet's first row names the reader's pinned team. */
  teamNames?: Readonly<Record<TeamSlug, string>>;
}

export function BottomTabBar({ slugLeague, teamNames }: BottomTabBarProps) {
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
              leagueHrefs={tab.href === '/schedule' ? scores.leagueHrefs : hrefs[tab.href]}
              slugLeague={hrefs[tab.href] ? slugLeague : undefined}
            />
          </li>
        ))}
        <li>
          <MoreMenu
            links={MORE_LINKS}
            stamp={`Updated ${formatStamp(getFetchedAt())}`}
            teamNames={teamNames}
            mascotBase="/mascots/"
          />
        </li>
      </ul>
    </nav>
  );
}

export default BottomTabBar;
