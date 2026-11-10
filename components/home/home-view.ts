/**
 * Everything `/` renders, assembled once on the server (SPEC §10.1, DESIGN §3.1).
 *
 * This is the only module the home page reads data through (with the three builders it composes: the phase lead,
 * phase-lead.ts; the postseason card, postseason-card.ts; the pinned-team cards, team-card.ts), and it reads the
 * snapshot ONLY through `lib/data.ts` (plus the pure config helpers of `lib/leagues.ts` and `components/words/pin-label.ts`). "Today"
 * is always `getToday()` — derived from `snapshot.fetchedAt` in America/Los_Angeles, never
 * `Date.now()` — so the build is reproducible and the "as of" stamp in the header is honest.
 *
 * The page carries EVERY league's panel in its static HTML; which one shows is decided before first
 * paint by `<html data-league>`, `<html data-region>` and the scope stylesheet (SPEC §8.2,
 * DESIGN-socal §2.4). So every view below is built for all nine leagues and the independents, and all 102 pinned-card views
 * are serialized for the client (the pin, and therefore the league, is known only in the browser).
 * Budget: serialized `teamViews` (tests/ui/home-weight.test.ts) — each view is a handful of strings,
 * never a `Game`.
 *
 * Region (DESIGN-socal §2.4): the first-visit blocks that summarise "every league" (the status line's
 * league list, the latest-results block, the league cards' grid) are built once per region, and a
 * panel's "Other leagues" strip names only the leagues of its own region: a NorCal family does not
 * need the San Diego leaders under its league, and the region toggle is how a reader crosses over.
 */

import {
  getGameDates,
  getGames,
  getGoalDiffDomain,
  getLastLeagueResultDate,
  getLatestResultsDate,
  getLeagueSummaries,
  getSeasonPhase,
  getStandings,
  getTeamById,
  getTeamSearchIndex,
  getTeams,
  getToday,
  getUpcoming,
  type LeagueSummary,
} from '../../lib/data';
import {
  listWords,
  recordString,
  recordWords,
} from '../../lib/format';
import { postseasonHref } from '../../lib/postseason/postseason-kind';
import { orderHead, orderValue, orderValueWords, ordersByRecord } from '../../lib/standings/order';
import { REGIONS } from '../../lib/league-config/sections';
import type {
  DivisionConfig,
  LeagueConfig,
  RegionConfig,
} from '../../lib/league-config/shape';
import {
  divisionHeading,
  getDivision,
  getLeague,
  isIndependentLeague,
  standingsLabel,
  isSingleDivision,
  sectionOf,
  standaloneName,
} from '../../lib/leagues';
import { pickerName, pinLabel } from '../words/pin-label';
import type { SearchIndex } from '../../lib/search';
import { teamOfSide } from '../../lib/teams';
import type { DivisionId, Game, LeagueId, RegionId, SeasonPhase, Team } from '../../lib/types';
import type { LeagueChip } from '../layout/league-chips';
import { leagueChips } from '../layout/league-chips';
import { regionIdSuffix } from '../leaders/scope';
import { thisWeekByRegion } from '../playoffs/this-week-inputs';
import type { ThisWeekView } from '../playoffs/this-week';
import { gameKind } from '../ui/describe-game';
import { plural } from '../words/plural';

import type {
  HomeTeamView,
  LeagueCardView,
  PinTileView,
} from './home-types';
import { byKickoff } from './by-kickoff';
import { phaseLead, type PhaseLeadView } from './phase-lead';
import { postseasonView, type PostseasonView } from './postseason-card';
import { buildTeamViews } from './team-card';

// ---------------------------------------------------------------- shared helpers

/** The league a game is filed under on the home page: its counted division's, else the first side's in config order. */
function homeLeagueOf(game: Game, leagueIds: readonly LeagueId[]): LeagueId | null {
  if (game.countsFor !== null) return getDivision(game.countsFor).leagueId;
  const sides = [game.home, game.away]
    .map(teamOfSide)
    .filter((t): t is Team => t !== undefined);
  for (const id of leagueIds) if (sides.some((t) => t.league === id)) return id;
  return null;
}

// ---------------------------------------------------------------- days

export interface HomeDay {
  /** 'YYYY-MM-DD' */
  date: string;
  /** Every contest that day with at least one side in the league, kickoff order. */
  games: Game[];
  total: number;
  isToday: boolean;
}

function leagueDay(
  league: LeagueId,
  date: string,
  today: string,
  opts: { playable?: boolean; finalsFirst?: boolean } = {},
): HomeDay {
  const all = getGames({ league, date }).sort(byKickoff);
  const games = opts.playable
    ? all.filter((g) => g.status !== 'final')
    : opts.finalsFirst
      ? // A results block leads with results: an unreported game of the same day follows them.
        [...all.filter((g) => g.status === 'final'), ...all.filter((g) => g.status !== 'final')]
      : all;
  return { date, games, total: games.length, isToday: date === today };
}

/** A contest that counts in one of this league's tables. */
function countsInLeague(game: Game, league: LeagueId): boolean {
  return game.countsFor !== null && getDivision(game.countsFor).leagueId === league;
}

/**
 * The first day AFTER `after` with a league game for this league, so a slate of non-league games
 * can say when league play resumes. Read from EVERY upcoming playable game of the league rather
 * than the slate's own day, so a long run of non-league dates cannot hide it. `games` is that
 * day's league games only, in kickoff order; `total` counts every contest of the league that day,
 * which is what the panel's other `All N on <date>` counts and the /scores page list; `postseason`
 * is how many of those are postseason contests (no table, a bracket), so the card can split the
 * rest the way its own meta does.
 */
export interface NextLeagueDay extends HomeDay {
  postseason: number;
  /** Non-league contests that day (neither counted in a table nor postseason), every status. */
  nonLeague: number;
}

function nextLeagueDay(league: LeagueId, after: string, today: string): NextLeagueDay | null {
  const date = getUpcoming(Number.MAX_SAFE_INTEGER, { league }).find(
    (g) => countsInLeague(g, league) && g.dateKey > after,
  )?.dateKey;
  if (!date) return null;
  const day = leagueDay(league, date, today, { playable: true });
  const all = getGames({ league, date });
  return {
    ...day,
    games: day.games.filter((g) => countsInLeague(g, league)),
    total: all.length,
    postseason: all.filter((g) => gameKind(g) === 'postseason').length,
    // Counted directly rather than as `total − league − postseason`: `games` holds only the
    // PLAYABLE league games, so a league game already final that day would otherwise be
    // mis-counted as non-league.
    nonLeague: all.filter((g) => gameKind(g) === 'non-league').length,
  };
}

/** The most recent played day with nothing reported for this league, or null (the common case). */
function unreportedDay(league: LeagueId, today: string, latest: string | null): string | null {
  const candidates = getGameDates({ league }).filter((d) => d < today && (!latest || d > latest));
  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    const games = getGames({ league, date: candidates[i] });
    if (games.length > 0 && games.every((g) => g.status !== 'final')) return candidates[i];
  }
  return null;
}

// ---------------------------------------------------------------- leaders (other-leagues strip)

export interface DivisionLeaders {
  /** Short names of every team in 1st place (level places included), registry/table order. */
  names: string[];
  pts: number;
}

/** The team(s) in 1st place with at least one counted result, or null before any league result. */
function divisionLeaders(division: DivisionId): DivisionLeaders | null {
  const top = getStandings(division).filter((s) => s.hasReportedResults && s.computed.place === 1);
  if (top.length === 0) return null;
  return {
    names: top.map((s) => getTeamById(s.teamId)?.shortName ?? s.slug),
    pts: top[0].computed.pts,
  };
}

// ---------------------------------------------------------------- mini standings

export interface MiniRow {
  slug: string;
  name: string;
  shortName: string;
  place: number;
  shared: boolean;
  hasResults: boolean;
  gp: number;
  record: string;
  /** '7 wins, 1 loss, 0 ties' — the record for the row link's accessible name. */
  recordWords: string;
  pts: number;
  /** The order column's cell and its words: '13' and '13 points', or '.750' and 'winning percentage .750'. */
  order: string;
  orderWords: string;
  gd: number;
}

export interface MiniDivisionView {
  id: DivisionId;
  /** null for a single-division league: no division label anywhere. */
  heading: string | null;
  leagueShort: string;
  /** The order column's head: 'Pts', or 'Pct' for a table ordered on its league record (lib/standings/order.ts). */
  orderHead: 'Pts' | 'Pct';
  /** Every row, table order; the component shows `home.miniRows` of them. */
  rows: MiniRow[];
  total: number;
  gdDomain: number;
  /** THIS division's last league result day, or null. */
  throughDate: string | null;
  /** `/standings/<league>#<division>` */
  href: string;
  /** `getDivision(d).home`, never a map keyed by division id. */
  home: DivisionConfig['home'];
}

function miniDivision(league: LeagueConfig, division: DivisionConfig): MiniDivisionView {
  const rows = getStandings(division.id).map((s): MiniRow => {
    const team = getTeamById(s.teamId);
    return {
      slug: s.slug,
      name: team?.name ?? s.slug,
      shortName: team?.shortName ?? s.slug,
      place: s.computed.place,
      shared: s.tiebreak.shared,
      hasResults: s.hasReportedResults,
      gp: s.computed.gp,
      record: recordString(s.computed),
      recordWords: recordWords(s.computed),
      pts: s.computed.pts,
      order: orderValue(league.rules, s.computed),
      orderWords: orderValueWords(league.rules, s.computed),
      gd: s.computed.gd,
    };
  });
  return {
    id: division.id,
    heading: divisionHeading(division.id),
    leagueShort: league.shortName,
    orderHead: ordersByRecord(league.rules) ? 'Pct' : 'Pts',
    rows,
    total: rows.length,
    gdDomain: getGoalDiffDomain(division.id),
    throughDate: getLastLeagueResultDate({ division: division.id }),
    href: `/standings/${league.id}#${division.id}`,
    home: division.home,
  };
}

// ---------------------------------------------------------------- other leagues strip

export interface OtherLeagueLine {
  id: LeagueId;
  shortName: string;
  href: string;
  /** 'St. Ignatius leads De Anza · Los Gatos leads El Camino' | 'Stevenson leads' | 'No league results yet' */
  text: string;
}

function leagueLeadersLine(league: LeagueConfig): string {
  const single = isSingleDivision(league.id);
  const clauses = league.divisions.map((d) => {
    const leaders = divisionLeaders(d.id);
    if (!leaders) return single ? null : `no results yet in ${d.label}`;
    const verb = leaders.names.length === 1 ? 'leads' : 'lead';
    return `${listWords(leaders.names, '&')} ${verb}${single ? '' : ` ${d.label}`}`;
  });
  if (clauses.every((c) => c === null || c.startsWith('no results yet'))) return 'No league results yet';
  return clauses.filter((c): c is string => c !== null).join(' · ');
}

// ---------------------------------------------------------------- team tiles

export interface LeagueTeamsView {
  leagueId: LeagueId;
  shortName: string;
  /**
   * The block's heading: 'Teams in SCVAL'; for a group with no league (the LA independents)
   * 'LA teams', since no team is "in" a group of independents.
   */
  title: string;
  singleDivision: boolean;
  groups: Array<{ id: DivisionId; heading: string | null; tiles: PinTileView[] }>;
}

function pinTileView(team: Team, leagueShort: string, heading: string | null): PinTileView {
  return {
    slug: team.slug,
    leagueId: team.league,
    name: team.name,
    pickerName: pickerName(team),
    pinLabel: pinLabel({ name: team.name, shortName: team.shortName, divisionHeading: heading, leagueShort }),
  };
}

// ---------------------------------------------------------------- the per-league panel

export interface HomeLeaguePanel {
  id: LeagueId;
  /** The NorCal/SoCal block the page renders this panel in (DESIGN-socal §2.4). */
  region: RegionId;
  shortName: string;
  name: string;
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

function buildPanel(summary: LeagueSummary, all: readonly LeagueSummary[], today: string): HomeLeaguePanel {
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
    phase,
    lead: phaseLead(league, phase, today),
    latest: latestDate ? leagueDay(league.id, latestDate, today, { finalsFirst: true }) : null,
    unreported: unreported ? leagueDay(league.id, unreported, today) : null,
    slate: slateDate ? leagueDay(league.id, slateDate, today, { playable: true }) : null,
    nextLeague: slateDate ? nextLeagueDay(league.id, slateDate, today) : null,
    firstGame,
    divisions: league.divisions.map((d) => miniDivision(league, d)),
    pointsLegend: `${orderHead(league.rules)}: ${league.rules.citations.points}.`,
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
        href: `/standings/${s.id}`,
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
      return { href: postseasonHref(league), label: ps.name };
    case 'unbracketed-tournament':
      return { href: postseasonHref(league), label: ps.name };
    case 'ccs-ladder':
      return { href: postseasonHref(league), label: 'CCS playoffs' };
    case 'no-postseason':
      return { href: postseasonHref(league), label: 'Postseason' };
    case 'section-playoffs':
      return { href: postseasonHref(league), label: ps.name };
  }
}

// ---------------------------------------------------------------- cross-league latest

export interface CrossLeagueLatest {
  date: string;
  /** Every contest that day. */
  total: number;
  groups: Array<{ leagueId: LeagueId; shortName: string; games: Game[]; total: number }>;
}

/** Rows per league in the first-visit "Latest" block. */
const CROSS_LEAGUE_ROWS = 2;

/**
 * The latest results day of `regionLeagues` (one region's leagues), with at most two rows per league.
 * `allLeagueIds` is every league in config order, so a game between a NorCal and a SoCal team is filed
 * under the same league on every page (its counted division's, else its first side's league in config
 * order: the NorCal one) and appears in one region's block only. `total` counts that region's games of
 * the day, which is what this block says ("All N").
 */
function crossLeagueLatest(
  regionLeagues: readonly LeagueId[],
  allLeagueIds: readonly LeagueId[],
): CrossLeagueLatest | null {
  const dates = regionLeagues
    .map((id) => getLatestResultsDate({ league: id }))
    .filter((d): d is string => d !== null)
    .sort();
  const date = dates.length > 0 ? dates[dates.length - 1] : null;
  if (!date) return null;
  const mineOf = (g: Game) => {
    const id = homeLeagueOf(g, allLeagueIds);
    return id !== null && regionLeagues.includes(id) ? id : null;
  };
  const games = getGames({ date })
    .filter((g) => mineOf(g) !== null)
    .sort(byKickoff);
  const groups = regionLeagues
    .map((id) => {
      const mine = games.filter((g) => mineOf(g) === id);
      // Finals first: this block is about results.
      const ordered = [...mine.filter((g) => g.status === 'final'), ...mine.filter((g) => g.status !== 'final')];
      return { leagueId: id, shortName: getLeague(id).shortName, games: ordered.slice(0, CROSS_LEAGUE_ROWS), total: mine.length };
    })
    .filter((g) => g.total > 0);
  return { date, total: games.length, groups };
}

// ---------------------------------------------------------------- the page's data

export interface HomeStatus {
  /** The latest results day across every league, or null before any result. */
  resultsThrough: string | null;
  teamCount: number;
  leagueShorts: string[];
}

/** One region's half of the first-visit view (DESIGN-socal §2.4): what the region-scoped blocks print. */
export interface HomeRegion {
  id: RegionId;
  /** 'Northern California' | 'Southern California': the card grid's h3. */
  name: RegionConfig['name'];
  /** 'NorCal' | 'SoCal' */
  shortName: RegionConfig['shortName'];
  /** The status line, over this region's leagues: its latest results day, its teams and its leagues. */
  status: HomeStatus;
  /** The region's league cards, config order. */
  leagueCards: LeagueCardView[];
  /** The region's latest results day across its leagues, or null before any. */
  latest: CrossLeagueLatest | null;
  /** '' for NorCal (today's ids), '-socal' for SoCal: the id rule for a block both regions repeat. */
  idSuffix: '' | '-socal';
}

export interface HomeView {
  today: string;
  status: HomeStatus;
  /** Every team (49), for the My-team slot. */
  teamViews: HomeTeamView[];
  searchIndex: SearchIndex;
  leagueChips: LeagueChip[];
  leagueCards: LeagueCardView[];
  panels: HomeLeaguePanel[];
  /** NorCal, then SoCal (REGIONS order). */
  regions: HomeRegion[];
  /**
   * "This week in the postseason" per region (HomeThisWeek, `#this-week` / `#this-week-socal`): the same view
   * model as /playoffs' strip (components/playoffs/this-week.ts, inputs shared through this-week-inputs.ts), at
   * `HOME_THIS_WEEK_CAP` rows. `days` is empty when the window holds no postseason game or event (the whole
   * regular season, the Oct 2 corpus), and the component then renders nothing. The plan (final-11) typed this
   * `ThisWeekDay[]`; the view also carries the window's ends and the "+N more" count the strip prints.
   */
  thisWeek: Record<RegionId, ThisWeekView>;
}

/**
 * Rows per region on the home page. The strip is a pointer to /playoffs (12 rows there), not the postseason
 * page; every region's copy is in the home HTML and RSC payload at once (both regions ship, the scope
 * stylesheet hides one), and that payload is weighed against a budget (scripts/assert-budgets.ts). A row is
 * one link and one badge, no GameRow, so 8 rows a region add under 1.5 KB gzip. Added 2026-10-30 (plan final-11).
 */
export const HOME_THIS_WEEK_CAP = 8;

/** A league's card in "Find your team" (`LeagueCard`). */
function leagueCardView(s: LeagueSummary): LeagueCardView {
  return {
    id: s.id,
    shortName: s.shortName,
    name: s.name,
    sectionShort: s.section.shortName,
    regionId: s.region,
    cities: s.cities,
    teamsLine: plural(s.teamCount, 'team', 'teams'),
    divisions: s.singleDivision ? [] : s.divisions.map((d) => d.label),
    standingsHref: `/standings/${s.id}`,
    standingsLabel: standingsLabel(s.id),
    showName: standaloneName(s.id),
  };
}

/** The latest results day over some leagues' summaries, or null before any. */
function latestOf(summaries: readonly LeagueSummary[]): string | null {
  const dates = summaries
    .map((s) => getLatestResultsDate({ league: s.id }))
    .filter((d): d is string => d !== null)
    .sort();
  return dates.length > 0 ? dates[dates.length - 1] : null;
}

export function buildHomeView(): HomeView {
  const today = getToday();
  const summaries = getLeagueSummaries();
  const leagueIds = summaries.map((s) => s.id);
  const teams = getTeams();
  const leagueCards = summaries.map(leagueCardView);
  // No bracket links on the home strip: it points to /playoffs, where they are (this-week-inputs.ts bracketLinks).
  const thisWeek = thisWeekByRegion({ games: getGames(), today, cap: HOME_THIS_WEEK_CAP, bracketLinks: false });
  return {
    today,
    thisWeek,
    status: {
      resultsThrough: getLatestResultsDate(),
      teamCount: teams.length,
      leagueShorts: summaries.map((s) => s.shortName),
    },
    teamViews: buildTeamViews(),
    searchIndex: getTeamSearchIndex(),
    leagueChips: leagueChips(),
    leagueCards,
    panels: summaries.map((s) => buildPanel(s, summaries, today)),
    regions: REGIONS.map((region) => {
      const mine = summaries.filter((s) => s.region === region.id);
      const ids = mine.map((s) => s.id);
      return {
        id: region.id,
        name: region.name,
        shortName: region.shortName,
        status: {
          resultsThrough: latestOf(mine),
          teamCount: teams.filter((t) => ids.includes(t.league)).length,
          leagueShorts: mine.map((s) => s.shortName),
        },
        leagueCards: leagueCards.filter((c) => c.regionId === region.id),
        latest: crossLeagueLatest(ids, leagueIds),
        idSuffix: regionIdSuffix(region.id),
      };
    }),
  };
}
