/**
 * The words of the two-region leaders card (components/og/RegionCard.tsx), which the root OG card
 * (app/opengraph-image.tsx) and the /standings card (app/standings/opengraph-image.tsx) both draw:
 * the leader line per league, grouped into REGIONS order, and each card's title and footer.
 *
 * The row TEXT is standings' `leaderClause` (views/standings/leader-lines.ts) over `leaderLine`
 * (views/standings/standings-view.ts), so the two cards and the /standings metadata can never word
 * a league's leaders differently.
 *
 * Kept out of the route files: an `opengraph-image` route exports only its image function and
 * `alt` / `size` / `contentType` (node_modules/next/dist/docs/01-app/03-api-reference/
 * 03-file-conventions/01-metadata/opengraph-image.md, "Config exports"), and the test
 * (tests/ui/region-card.test.ts) needs these too.
 */

import { INDEPENDENT_LEAGUES, LEAGUES_PROPER, byRegion, isIndependentLeague } from '@/lib/config/leagues';
import { SEASON_CALENDAR_YEAR } from '@/lib/config/season';
import { shortDate } from '@/lib/format/dates';
import type { LeagueId, RegionId } from '@/lib/model/ids';
import { getLatestResultsDate } from '@/lib/queries/games';
import { getLeagueSummaries } from '@/lib/queries/leagues';
import { getTeams } from '@/lib/queries/teams';
import { leaderClause, type LeaderLine } from '@/views/standings/leader-lines';
import { buildStandingsOverviewView, leaderLine } from '@/views/standings/standings-view';

import { SITE_WORDMARK } from './site';

export interface RegionCardRow {
  id: LeagueId;
  shortName: string;
  text: string;
}

export interface RegionCardColumn {
  region: RegionId;
  /** 'Northern California' | 'Southern California'. */
  heading: string;
  rows: RegionCardRow[];
}

/** What one region card prints (the card adds only its sizing). */
export interface RegionCardModel {
  /** Small uppercase line above the title (the /standings card's SITE_WORDMARK); none on the root card. */
  eyebrow?: string;
  title: string;
  columns: readonly RegionCardColumn[];
  footer: string;
}

/** The leader lines per league (config order), grouped into REGIONS order; `lines` overrides for tests. */
export function regionCardColumns(
  linesOf: (leagueId: LeagueId) => readonly LeaderLine[] = (id) => {
    const league = getLeagueSummaries().find((l) => l.id === id);
    return league ? league.divisions.map((d) => leaderLine(d.id, d.heading)) : [];
  },
): RegionCardColumn[] {
  const leagues = getLeagueSummaries();
  return byRegion(leagues, (l) => l.region).map(({ region, items }) => ({
    region: region.id,
    heading: region.name,
    // Every table of the region, the LA independents' included (DESIGN §24.10); the group's row is
    // labelled by its division ('Independents'), since its short name is an adjective.
    rows: items
      .map((l) => ({
        id: l.id,
        shortName: isIndependentLeague(l.id) ? (l.divisions[0]?.label ?? l.shortName) : l.shortName,
        text: leaderClause(linesOf(l.id)),
      })),
  }));
}

/**
 * `9 leagues, 5 independents`: the leagues proper, then the teams in no league (DESIGN §24.9), so a card
 * never counts the independents as a tenth league.
 */
function leagueCountWords(): string {
  const independents = INDEPENDENT_LEAGUES.reduce((n, g) => n + g.divisions.reduce((m, d) => m + d.expectedTeams, 0), 0);
  return `${LEAGUES_PROPER.length} leagues${independents > 0 ? `, ${independents} independents` : ''}`;
}

/**
 * The root card (app/opengraph-image.tsx): `NorCal HS Field Hockey · 2026` (SITE_WORDMARK, shorter
 * than SITE_NAME, so one line at 44px) and `9 leagues, 3 independents · 102 teams · results through Oct 2 ·
 * unofficial`.
 */
export function rootCardProps(columns: readonly RegionCardColumn[] = regionCardColumns()): RegionCardModel {
  const through = getLatestResultsDate();
  return {
    title: `${SITE_WORDMARK} · ${SEASON_CALENDAR_YEAR}`,
    columns,
    footer: `${leagueCountWords()} · ${getTeams().length} teams · ${
      through ? `results through ${shortDate(through)}` : 'no results yet'
    } · unofficial`,
  };
}

/** The /standings card (app/standings/opengraph-image.tsx): the wordmark as eyebrow, "Standings — every league". */
export function standingsCardProps(columns: readonly RegionCardColumn[] = regionCardColumns()): RegionCardModel {
  const { throughDate } = buildStandingsOverviewView();
  return {
    eyebrow: SITE_WORDMARK,
    title: 'Standings — every league',
    columns,
    footer: `${leagueCountWords()} · ${getTeams().length} teams${
      throughDate ? ` · results through ${shortDate(throughDate)}` : ''
    } · unofficial`,
  };
}
