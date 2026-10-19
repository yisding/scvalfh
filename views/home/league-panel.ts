/**
 * One league's home panel (components/home/LeaguePanel.tsx): every block a league shows on `/`,
 * assembled from the topic modules beside this one. The page carries every league's panel and the
 * scope stylesheet picks one before first paint (views/home/home-view.ts).
 */

import { getLeague, isIndependentLeague, isSingleDivision, sectionOf } from '@/lib/config/leagues';
import { divisionHeading } from '@/lib/config/leagues/labels';
import type { LeagueHealth } from '@/lib/model/health';
import type { LeagueId, RegionId } from '@/lib/model/ids';
import type { LeagueConfig } from '@/lib/model/league-config';
import type { SeasonPhase } from '@/lib/model/season';
import { getGameDates, getLatestResultsDate, getUpcoming } from '@/lib/queries/games';
import { type LeagueSummary, getLeagueHealth } from '@/lib/queries/leagues';
import { getSeasonPhase } from '@/lib/queries/phase';
import { getTeams } from '@/lib/queries/teams';
import { playoffsHref, standingsHref } from '@/lib/shared/routes';

import { leagueDay, nextLeagueDay, unreportedDay } from './days';
import type { HomeDay, NextLeagueDay } from './days';
import { miniDivision } from './mini-standings';
import type { MiniDivisionView } from './mini-standings';
import { leagueLeadersLine } from './other-leagues';
import type { OtherLeagueLine } from './other-leagues';
import { phaseLead } from './phase-lead';
import type { PhaseLeadView } from './phase-lead';
import { postseasonView } from './postseason-card';
import type { PostseasonView } from './postseason-card';
import { pinTileView } from './team-tiles';
import type { LeagueTeamsView } from './team-tiles';

export interface HomeLeaguePanel {
  id: LeagueId;
  /** The NorCal/SoCal block the page renders this panel in (DESIGN-socal §2.4). */
  region: RegionId;
  shortName: string;
  name: string;
  /** The league's data health (LeagueHealthNote, under the panel's heading). */
  health: LeagueHealth;
  phase: SeasonPhase;
  lead: PhaseLeadView | null;
  latest: HomeDay | null;
  unreported: HomeDay | null;
  slate: HomeDay | null;
  /**
   * The first day after the slate's with a league game, so a slate of non-league games can say
   * when league play resumes (`NextSlate`). Null when there is no slate or no league game after it.
   */
  nextLeague: NextLeagueDay | null;
  /** The first league contest of the season, for an empty "Latest scores" block. */
  firstGame: string | null;
  divisions: MiniDivisionView[];
  /** `PTS: ${citations.points}.` */
  pointsLegend: string;
  teams: LeagueTeamsView;
  postseason: PostseasonView;
  others: OtherLeagueLine[];
  /** Where an empty "Next" block points: the league's own postseason page. */
  afterSchedule: { href: string; label: string };
}

export function buildPanel(summary: LeagueSummary, all: readonly LeagueSummary[], today: string): HomeLeaguePanel {
  const league = getLeague(summary.id);
  const phase = getSeasonPhase(league.id);
  const latestDate = getLatestResultsDate({ league: league.id });
  const unreported = unreportedDay(league.id, today, latestDate);
  const slateDate = getUpcoming(1, { league: league.id })[0]?.dateKey ?? null;
  const single = isSingleDivision(league.id);
  const firstGame = getGameDates({ league: league.id })[0] ?? null;

  return {
    id: league.id,
    region: summary.region,
    shortName: league.shortName,
    name: league.name,
    health: getLeagueHealth(league.id),
    phase,
    lead: phaseLead(league, phase, today),
    latest: latestDate ? leagueDay(league.id, latestDate, today, { finalsFirst: true }) : null,
    unreported: unreported ? leagueDay(league.id, unreported, today) : null,
    slate: slateDate ? leagueDay(league.id, slateDate, today, { playable: true }) : null,
    nextLeague: slateDate ? nextLeagueDay(league.id, slateDate, today) : null,
    firstGame,
    divisions: league.divisions.map((d) => miniDivision(league, d)),
    pointsLegend: `PTS: ${league.rules.citations.points}.`,
    teams: {
      leagueId: league.id,
      shortName: league.shortName,
      title: isIndependentLeague(league.id) ? `${league.shortName} teams` : `Teams in ${league.shortName}`,
      singleDivision: single,
      groups: league.divisions.map((d) => ({
        id: d.id,
        heading: divisionHeading(d.id),
        // A–Z by the short name the tile prints, so a reader scans one alphabetical run per
        // division instead of the registry's order. Sorted here on the server, once, so the client
        // renders exactly the order the HTML shipped with.
        tiles: getTeams({ division: d.id })
          .slice()
          .sort((a, b) => a.shortName.localeCompare(b.shortName, 'en'))
          .map((t) => pinTileView(t, league.shortName, divisionHeading(d.id))),
      })),
    },
    postseason: postseasonView(league, phase, sectionOf(league.id).noChampionshipNote),
    // The other leagues of the panel's own region only (DESIGN-socal §2.4).
    others: all
      .filter((s) => s.id !== league.id && s.region === summary.region)
      .map((s) => ({
        id: s.id,
        shortName: s.shortName,
        href: standingsHref(s.id),
        text: leagueLeadersLine(getLeague(s.id)),
      })),
    afterSchedule: afterScheduleOf(league),
  };
}

/** Where an empty "Next" block points: the league's own postseason page or card. */
function afterScheduleOf(league: LeagueConfig): HomeLeaguePanel['afterSchedule'] {
  const ps = league.postseason;
  switch (ps.kind) {
    case 'league-tournament':
      return { href: playoffsHref(league.id), label: ps.name };
    case 'unbracketed-tournament':
      return { href: `/playoffs#${league.id}`, label: ps.name };
    case 'ccs-ladder':
      return { href: `/playoffs#${league.id}`, label: 'CCS playoffs' };
    case 'no-postseason':
      return { href: `/playoffs#${league.id}`, label: 'Postseason' };
    case 'section-playoffs':
      return { href: `/playoffs#${league.id}`, label: ps.name };
  }
}
