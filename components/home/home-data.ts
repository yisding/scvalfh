/**
 * Everything `/` renders, assembled once on the server (SPEC §10.1, DESIGN §3.1).
 *
 * This is the only module the home page reads data through, and it reads the snapshot ONLY through
 * `lib/data.ts` (plus the pure config helpers of `lib/leagues.ts` and `lib/pin-label.ts`). "Today"
 * is always `getToday()` — derived from `snapshot.fetchedAt` in America/Los_Angeles, never
 * `Date.now()` — so the build is reproducible and the "as of" stamp in the header is honest.
 *
 * The page carries EVERY league's panel in its static HTML; which one shows is decided before first
 * paint by `<html data-league>` and the scope stylesheet (SPEC §8.2). So every view below is built
 * for all four leagues, and all 43 pinned-card views are serialized for the client (the pin, and
 * therefore the league, is known only in the browser). Budget: serialized `teamViews` ≤ 60 KB
 * (tests/ui/home-weight.test.ts) — each view is a handful of strings, never a `Game`.
 */

import {
  getGameDates,
  getGames,
  getGoalDiffDomain,
  getLastLeagueResultDate,
  getLatestResultsDate,
  getLeagueSummaries,
  getOfficialFixtures,
  getPlayoffs,
  getSeasonPhase,
  getStandingContext,
  getStandingFor,
  getStandings,
  getTeamById,
  getTeamBySlug,
  getTeamPostseasonLine,
  getTeamSearchIndex,
  getTeams,
  getToday,
  getUpcoming,
  type LeagueSummary,
} from '../../lib/data';
import {
  EM_DASH,
  dateTimeAttr,
  monthDay,
  ordinal,
  recordString,
  shortDate,
  timeOfDayPT,
} from '../../lib/format';
import { gameHref } from '../../lib/game-id';
import { outcomesFor, statusBadge } from '../../lib/standings';
import {
  CCS,
  HISTORY_LEAGUE,
  getDivision,
  getLeague,
  sectionOf,
  type DivisionConfig,
  type LeagueConfig,
} from '../../lib/leagues';
import { pickerName, pinLabel } from '../../lib/pin-label';
import type { SearchIndex } from '../../lib/search';
import type { DivisionId, Game, LeagueId, SeasonPhase, Team, TeamColors } from '../../lib/types';
import type { LeagueChip } from '../layout/LeagueSwitcher';
import { describeGame, postseasonTagOf, type GameDisplay, type SideView } from '../ui/game-view';
import { plural } from '../ui/plural';

import type {
  HomeColors,
  HomeLastDisplay,
  HomeLastGame,
  HomeNextGame,
  HomeOfficialFixture,
  HomeTeamView,
  LeagueCardView,
  PinTileView,
} from './home-types';
import { POSTSEASON_LEAD } from './home-types';

// ---------------------------------------------------------------- shared helpers

/** Kickoff order, then away name, so a slate is stable between builds. */
function byKickoff(a: Game, b: Game): number {
  return a.dateLocal.localeCompare(b.dateLocal) || a.away.name.localeCompare(b.away.name);
}

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

function numberWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

/** '11:00' → '11 AM'; '16:30' → '4:30 PM'. */
function clock(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
}

/** 'A', 'A & B', 'A, B & C'. */
function joinAmp(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

function colorsOf(team: Team): HomeColors {
  const { primary, secondary, onPrimary } = team.colors;
  return { primary, secondary, onPrimary };
}

function shortNameOf(side: Game['home']): string {
  return (side.slug ? getTeamBySlug(side.slug)?.shortName : undefined) ?? side.name;
}

/** The league a game is filed under on the home page: its counted division's, else the first side's in config order. */
function homeLeagueOf(game: Game, leagueIds: readonly LeagueId[]): LeagueId | null {
  if (game.countsFor !== null) return getDivision(game.countsFor).leagueId;
  const sides = [game.home, game.away]
    .map((s) => (s.teamId ? getTeamById(s.teamId) : undefined) ?? (s.slug ? getTeamBySlug(s.slug) : undefined))
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
}

function nextLeagueDay(league: LeagueId, after: string, today: string): NextLeagueDay | null {
  const date = getUpcoming(Number.MAX_SAFE_INTEGER, undefined, { league }).find(
    (g) => countsInLeague(g, league) && g.dateKey > after,
  )?.dateKey;
  if (!date) return null;
  const day = leagueDay(league, date, today, { playable: true });
  const all = getGames({ league, date });
  return {
    ...day,
    games: day.games.filter((g) => countsInLeague(g, league)),
    total: all.length,
    postseason: all.filter((g) => g.countsFor === null && g.postseason !== null).length,
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

// ---------------------------------------------------------------- leaders (strip, OG card)

export interface DivisionLeaders {
  /** Short names of every team in 1st place (level places included), registry/table order. */
  names: string[];
  pts: number;
}

/** The team(s) in 1st place with at least one counted result, or null before any league result. */
export function divisionLeaders(division: DivisionId): DivisionLeaders | null {
  const top = getStandings(division).filter((s) => s.hasReportedResults && s.computed.place === 1);
  if (top.length === 0) return null;
  return {
    names: top.map((s) => getTeamById(s.teamId)?.shortName ?? s.slug),
    pts: top[0].computed.pts,
  };
}

/** 'St Ignatius', 'A & B', 'A & B +1'. */
export function leaderNames(names: readonly string[]): string {
  if (names.length <= 2) return names.join(' & ');
  return `${names.slice(0, 2).join(' & ')} +${names.length - 2}`;
}

/** The root OG card's row text after a league's short name (SPEC §8.4). */
export function leagueRowText(divisions: ReadonlyArray<{ id: string; heading: string | null }>): string {
  const clauses = divisions.map((d) => {
    const leaders = divisionLeaders(d.id);
    if (!leaders) return null;
    const who = `${leaderNames(leaders.names)} ${leaders.pts} pts`;
    return d.heading ? `${d.heading}: ${who}` : who;
  });
  if (clauses.every((c) => c === null)) return 'No league results yet';
  return clauses
    .map((c, i) => c ?? `${divisions[i].heading ?? ''}: no results yet`)
    .join(' · ');
}

// ---------------------------------------------------------------- phase lead

export interface PhaseLeadView {
  /** The bold opening sentence. */
  lead: string;
  /** The rest of the paragraph ('' when none). */
  body: string;
  link: { href: string; label: string } | null;
}

function firstLeagueDate(league: LeagueConfig): string {
  return league.divisions.map((d) => d.leaguePlay.first).reduce((a, b) => (b < a ? b : a));
}

/** The PhaseLead copy for a league in a phase on a day (exported for tests/ui/home-view.test.ts). */
export function phaseLead(league: LeagueConfig, phase: SeasonPhase, today: string): PhaseLeadView | null {
  const short = league.shortName;
  const firstLeague = firstLeagueDate(league);
  const ps = league.postseason;
  const keyDates = CCS.keyDates;

  if (phase === 'preseason' || (phase === 'regular' && today < firstLeague)) {
    // Games played SO FAR — a non-league final later in the season has not been played yet.
    const nonLeague = getGames({ league: league.id, status: 'final' }).filter(
      (g) => g.countsFor === null && g.postseason === null && g.dateKey <= today,
    ).length;
    return {
      lead: `${short} league play starts ${shortDate(firstLeague)}.`,
      body:
        nonLeague > 0
          ? `These tables count league games only, so the ${plural(nonLeague, 'non-league game')} played so far ${
              nonLeague === 1 ? 'is' : 'are'
            } on the schedule and in the overall records, not in the standings.`
          : 'No games have been played yet, so every record below is empty on purpose.',
      link: { href: `/schedule/${league.id}`, label: 'Full schedule' },
    };
  }

  if (phase === 'regular') return null;

  if (phase === 'crossover' && ps.kind === 'ccs-ladder') {
    const crossover = ps.pairings[0];
    return {
      lead: 'League play is over.',
      body: `The crossover games and the fourth-place play-in for ${short}’s seventh automatic CCS berth are ${shortDate(
        crossover?.date ?? keyDates.endOfLeagueSeason,
      )}; the CCS seeding meeting is ${shortDate(keyDates.seedingMeeting)}.`,
      link: { href: `/playoffs#${league.id}`, label: 'Who is in' },
    };
  }

  if (phase === 'play-in' && ps.kind === 'ccs-ladder') {
    const playIn = ps.pairings.find((p) => p.isPlayIn);
    if (playIn) {
      const host = getDivision(playIn.seats[0].division).label;
      return {
        lead: `${short} league play is over.`,
        body: `${playIn.seatLabels[1]} plays at the ${host} champion ${shortDate(playIn.date)}${
          playIn.time ? `, ${clock(playIn.time)}` : ''
        }, for ${short}’s ${ordinalWord(ps.autoBerths)} automatic CCS berth; the CCS seeding meeting is ${shortDate(
          keyDates.seedingMeeting,
        )}.`,
        link: { href: `/playoffs#${league.id}`, label: 'Who is in' },
      };
    }
  }

  if (phase === 'tournament' && ps.kind === 'league-tournament') {
    const round = (id: string) => ps.rounds.find((r) => r.id === id);
    const qf = round('qf-1');
    const playIn = round('play-in');
    const final = round('final');
    return {
      lead: `${short} league play is over.`,
      body: `Quarterfinals are ${qf ? shortDate(qf.date) : 'to be set'}${
        playIn ? ` (a play-in ${shortDate(playIn.date)} only if needed)` : ''
      }; the final is ${final ? shortDate(final.date) : 'to be set'} at ${ps.finalSite.label}.`,
      link: { href: `/playoffs/${league.id}`, label: 'Bracket' },
    };
  }

  if (phase === 'playoffs') {
    if (today < keyDates.quarterfinals) {
      return {
        lead: `${short} league play is over.`,
        body: `CCS seeds the ${CCS.autoQualifiers.total}-team field on ${shortDate(
          keyDates.seedingMeeting,
        )}; quarterfinals are ${shortDate(keyDates.quarterfinals)}.`,
        link: { href: `/playoffs#${league.id}`, label: 'Who is in' },
      };
    }
    return {
      lead: 'The CCS tournament is under way.',
      body: `Quarterfinals ${shortDate(keyDates.quarterfinals)}, semifinals ${shortDate(
        keyDates.semifinals,
      )}, final ${shortDate(keyDates.finals)}. League standings below are final.`,
      link: { href: `/playoffs#${league.id}`, label: 'Bracket' },
    };
  }

  if (phase === 'complete') {
    return {
      lead: 'The season is over.',
      body: 'The tables below are the final league standings.',
      link: league.id === HISTORY_LEAGUE ? { href: '/history/2025-26', label: 'Last season' } : null,
    };
  }

  return null;
}

const ORDINAL_WORDS = ['zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'];

function ordinalWord(n: number): string {
  return ORDINAL_WORDS[n] ?? ordinal(n);
}

// ---------------------------------------------------------------- mini standings

export interface MiniRow {
  slug: string;
  name: string;
  shortName: string;
  abbr: string;
  colors: TeamColors;
  place: number;
  shared: boolean;
  hasResults: boolean;
  gp: number;
  record: string;
  pts: number;
  gd: number;
}

export interface MiniDivisionView {
  id: DivisionId;
  /** null for a single-division league: no division label anywhere. */
  heading: string | null;
  leagueShort: string;
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

function miniDivision(league: LeagueConfig, division: DivisionConfig, single: boolean): MiniDivisionView {
  const rows = getStandings(division.id).map((s): MiniRow => {
    const team = getTeamById(s.teamId);
    return {
      slug: s.slug,
      name: team?.name ?? s.slug,
      shortName: team?.shortName ?? s.slug,
      abbr: team?.abbr ?? '',
      colors: team?.colors ?? { primary: '000000', secondary: '000000', onPrimary: '#ffffff', source: 'placeholder' },
      place: s.computed.place,
      shared: s.tiebreak.shared,
      hasResults: s.hasReportedResults,
      gp: s.computed.gp,
      record: recordString(s.computed),
      pts: s.computed.pts,
      gd: s.computed.gd,
    };
  });
  return {
    id: division.id,
    heading: single ? null : division.label,
    leagueShort: league.shortName,
    rows,
    total: rows.length,
    gdDomain: getGoalDiffDomain(division.id),
    throughDate: getLastLeagueResultDate({ division: division.id }),
    href: `/standings/${league.id}#${division.id}`,
    home: division.home,
  };
}

// ---------------------------------------------------------------- postseason card

export type PostseasonView =
  | {
      kind: 'ccs-ladder';
      leagueId: LeagueId;
      /** One sentence about this league's own pre-CCS games, or the seeding date. */
      intro: string;
      meter: { claimed: number; total: number; label: string };
      dates: Array<{ term: string; date: string }>;
      bracket: { published: boolean; url: string };
      link: { href: string; label: string };
    }
  | {
      kind: 'league-tournament';
      leagueId: LeagueId;
      /** 'MCAL tournament · Quarterfinals Mon Oct 26 (a play-in Fri Oct 23 only if needed) · …' */
      line: string;
      /** The section's no-championship note (NCS). */
      note: string | null;
      link: { href: string; label: string };
    };

function postseasonView(league: LeagueConfig, phase: SeasonPhase, sectionNote: string | null): PostseasonView {
  const ps = league.postseason;
  const short = league.shortName;
  if (ps.kind === 'league-tournament') {
    const round = (id: string) => ps.rounds.find((r) => r.id === id);
    const qf = round('qf-1');
    const sf = round('sf-1');
    const final = round('final');
    const playIn = round('play-in');
    const parts = [ps.name];
    if (qf) parts.push(`Quarterfinals ${shortDate(qf.date)}${playIn ? ` (a play-in ${shortDate(playIn.date)} only if needed)` : ''}`);
    if (sf) parts.push(`Semifinals ${shortDate(sf.date)}`);
    if (final) parts.push(`Final ${shortDate(final.date)} at ${ps.finalSite.label}`);
    return {
      kind: 'league-tournament',
      leagueId: league.id,
      line: parts.join(' · '),
      note: sectionNote,
      link: { href: `/playoffs/${league.id}`, label: 'Bracket' },
    };
  }

  const total = CCS.autoQualifiers.total;
  const aqRung = ps.ladder.find((r) => r.status === 'aq');
  const aqTop = aqRung ? aqRung.places[1] : 0;
  const crossover = ps.pairings.find((p) => p.tag === 'scval-crossover');
  const playIn = ps.pairings.find((p) => p.tag === 'bval-play-in');
  let label: string;
  if (crossover) {
    label = `${short} holds ${ps.autoBerths} of the ${total} CCS berths automatically: the top ${numberWord(
      aqTop,
    )} in each division, plus the winner of the fourth-place play-in (By-Laws Article VII §1–2).`;
  } else if (playIn) {
    const aqDivision =
      aqRung && aqRung.divisions !== '*' && aqRung.divisions.length === 1 ? getDivision(aqRung.divisions[0]).label : null;
    const host = getDivision(playIn.seats[0].division).label;
    label = `${short} holds ${ps.autoBerths} of the ${total} CCS berths automatically: ${
      aqDivision ? `${aqDivision}’s` : 'the'
    } top ${numberWord(aqTop)}, plus the winner of the ${monthDay(playIn.date)} play-in (${playIn.seatLabels[1]} at the ${host} champion).`;
  } else {
    label = `${short} holds ${ps.autoBerths} of the ${total} CCS berths automatically: the top ${numberWord(
      aqTop,
    )} of the final standings.`;
  }

  const seeding = shortDate(CCS.keyDates.seedingMeeting);
  const beforeLeagueGames = phase === 'preseason' || phase === 'regular';
  let intro: string;
  if (crossover && beforeLeagueGames) {
    intro = `Crossover and the 4-vs-4 play-in ${shortDate(crossover.date)}. Seeding meeting ${seeding}.`;
  } else if (crossover && phase === 'crossover') {
    intro = `League play is done. Crossover and the play-in are ${shortDate(crossover.date)}; the seeding meeting is ${seeding}.`;
  } else if (playIn && (beforeLeagueGames || phase === 'play-in')) {
    intro = `Play-in ${shortDate(playIn.date)}${playIn.time ? `, ${clock(playIn.time)}` : ''}. Seeding meeting ${seeding}.`;
  } else {
    intro = `Seeding meeting ${seeding}.`;
  }

  const playoffs = getPlayoffs();
  return {
    kind: 'ccs-ladder',
    leagueId: league.id,
    intro,
    meter: { claimed: ps.autoBerths, total, label },
    dates: [
      { term: 'Quarterfinals', date: CCS.keyDates.quarterfinals },
      { term: 'Semifinals', date: CCS.keyDates.semifinals },
      { term: 'Final', date: CCS.keyDates.finals },
    ],
    bracket: { published: playoffs.bracketPublished, url: playoffs.bracketUrl },
    link: { href: `/playoffs#${league.id}`, label: 'CCS playoffs' },
  };
}

// ---------------------------------------------------------------- other leagues strip

export interface OtherLeagueLine {
  id: LeagueId;
  shortName: string;
  href: string;
  /** 'St Ignatius leads De Anza · Los Gatos leads El Camino' | 'Stevenson leads' | 'No league results yet' */
  text: string;
}

function leagueLeadersLine(league: LeagueConfig): string {
  const single = league.divisions.length === 1;
  const clauses = league.divisions.map((d) => {
    const leaders = divisionLeaders(d.id);
    if (!leaders) return single ? null : `no results yet in ${d.label}`;
    const verb = leaders.names.length === 1 ? 'leads' : 'lead';
    return `${joinAmp(leaders.names)} ${verb}${single ? '' : ` ${d.label}`}`;
  });
  if (clauses.every((c) => c === null || c.startsWith('no results yet'))) return 'No league results yet';
  return clauses.filter((c): c is string => c !== null).join(' · ');
}

// ---------------------------------------------------------------- team tiles

export interface LeagueTeamsView {
  leagueId: LeagueId;
  shortName: string;
  singleDivision: boolean;
  groups: Array<{ id: DivisionId; heading: string | null; tiles: PinTileView[] }>;
}

function pinTileView(team: Team, leagueShort: string, heading: string | null): PinTileView {
  return {
    slug: team.slug,
    leagueId: team.league,
    name: team.name,
    abbr: team.abbr,
    colors: colorsOf(team),
    pickerName: pickerName(team),
    pinLabel: pinLabel({ name: team.name, shortName: team.shortName, divisionHeading: heading, leagueShort }),
  };
}

// ---------------------------------------------------------------- the per-league panel

export interface HomeLeaguePanel {
  id: LeagueId;
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
  const latestDate = getLatestResultsDate(undefined, { league: league.id });
  const unreported = unreportedDay(league.id, today, latestDate);
  const slateDate = getUpcoming(1, undefined, { league: league.id })[0]?.dateKey ?? null;
  const single = league.divisions.length === 1;
  const firstGame = getGameDates({ league: league.id })[0] ?? null;

  return {
    id: league.id,
    shortName: league.shortName,
    name: league.name,
    phase,
    lead: phaseLead(league, phase, today),
    latest: latestDate ? leagueDay(league.id, latestDate, today, { finalsFirst: true }) : null,
    unreported: unreported ? leagueDay(league.id, unreported, today) : null,
    slate: slateDate ? leagueDay(league.id, slateDate, today, { playable: true }) : null,
    nextLeague: slateDate ? nextLeagueDay(league.id, slateDate, today) : null,
    firstGame,
    divisions: league.divisions.map((d) => miniDivision(league, d, single)),
    pointsLegend: `PTS: ${league.rules.citations.points}.`,
    teams: {
      leagueId: league.id,
      shortName: league.shortName,
      singleDivision: single,
      groups: league.divisions.map((d) => ({
        id: d.id,
        heading: single ? null : d.label,
        // A–Z by the short name the tile prints, so a reader scans one alphabetical run per
        // division instead of the registry's order. Sorted here on the server, once, so the client
        // renders exactly the order the HTML shipped with.
        tiles: getTeams({ division: d.id })
          .slice()
          .sort((a, b) => a.shortName.localeCompare(b.shortName, 'en'))
          .map((t) => pinTileView(t, league.shortName, single ? null : d.label)),
      })),
    },
    postseason: postseasonView(league, phase, sectionOf(league.id).noChampionshipNote),
    others: all
      .filter((s) => s.id !== league.id)
      .map((s) => ({
        id: s.id,
        shortName: s.shortName,
        href: `/standings/${s.id}`,
        text: leagueLeadersLine(getLeague(s.id)),
      })),
    afterSchedule:
      league.postseason.kind === 'league-tournament'
        ? { href: `/playoffs/${league.id}`, label: league.postseason.name }
        : { href: `/playoffs#${league.id}`, label: 'CCS playoffs' },
  };
}

// ---------------------------------------------------------------- my-team views

/** One score line: the registry short name ("St Ignatius" on a 358px card), glyph, weight, chip. */
function homeSide(side: SideView): HomeLastDisplay['home'] {
  return { name: side.shortName || side.name, glyph: side.glyph, hasScore: side.hasScore, weight: side.weight, chip: side.chip };
}

/** `describeGame()`'s decision, slimmed to what the card draws (the 60 KB budget). */
function slimDisplay(display: GameDisplay): HomeLastDisplay {
  const marks: NonNullable<HomeLastDisplay['marks']> = {};
  if (display.liveDot) marks.liveDot = true;
  if (display.strikeTime) marks.strikeTime = true;
  if (display.isNonLeague) marks.isNonLeague = true;
  if (display.deciderTag) marks.deciderTag = display.deciderTag;
  if (display.shootoutText) marks.shootoutText = display.shootoutText;
  if (display.sourceMark) marks.sourceMark = display.sourceMark;
  if (display.leagueTag) marks.leagueTag = display.leagueTag;
  if (display.postseasonTag) marks.postseasonTag = display.postseasonTag;
  return {
    kind: display.kind === 'unreported' ? 'unreported' : 'final',
    statusLabel: display.statusLabel,
    statusTone: display.statusTone,
    ...(Object.keys(marks).length > 0 ? { marks } : {}),
    note: display.note,
    sentence: display.sentence,
    home: homeSide(display.home),
    away: homeSide(display.away),
  };
}

function lastGameView(game: Game, slug: string): HomeLastGame {
  return {
    display: slimDisplay(describeGame(game, slug)),
    mineIsHome: game.home.slug === slug,
    dateLabel: shortDate(game.dateLocal),
    dateTime: dateTimeAttr(game),
    href: gameHref(game.contestId),
  };
}

function nextGameView(game: Game, slug: string): HomeNextGame {
  const mineIsHome = game.home.slug === slug;
  const theirs = mineIsHome ? game.away : game.home;
  const links: HomeNextGame['links'] = [];
  const address = game.venue.address;
  if (address) {
    links.push({
      label: 'Directions',
      href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${address.street}, ${address.city}, ${address.region} ${address.postalCode}`,
      )}`,
    });
  }
  if (game.urls.nfhsStream) links.push({ label: 'Stream', href: game.urls.nfhsStream });
  if (game.urls.goFan) links.push({ label: 'Tickets', href: game.urls.goFan });
  return {
    dateLabel: shortDate(game.dateLocal),
    dateTime: dateTimeAttr(game),
    timeLabel: game.isTimeTba ? 'Time TBA' : timeOfDayPT(game.dateLocal),
    versus: game.site === 'neutral' ? 'vs' : mineIsHome ? 'vs' : 'at',
    opponent: shortNameOf(theirs),
    kindLabel: postseasonTagOf(game) ?? (game.countsFor !== null ? 'league' : 'non-league'),
    href: gameHref(game.contestId),
    // Two external chips at most plus "Game page": three chips, one row, the same height for every
    // team (no layout shift).
    links: links.slice(0, 2),
  };
}

/** 'VALLEY CHRISTIAN' → 'Valley Christian', for a grid name with no registry row behind it. */
function titleCase(name: string): string {
  return name
    .toLowerCase()
    .replace(/(^|[\s.])([a-z])/g, (_, lead: string, ch: string) => `${lead}${ch.toUpperCase()}`);
}

/** The next fixture from the team's league's official schedule, for a team MaxPreps has no contest for. */
function officialNextView(team: Team, today: string, leagueShort: string): HomeOfficialFixture | null {
  const fixture = getOfficialFixtures({ slug: team.slug })
    .filter((f) => f.dateKey >= today)
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey))[0];
  if (!fixture) return null;
  const mineIsHome = fixture.homeSlug === team.slug;
  const otherSlug = mineIsHome ? fixture.awaySlug : fixture.homeSlug;
  const otherName = mineIsHome ? fixture.awayName : fixture.homeName;
  return {
    dateLabel: shortDate(fixture.dateKey),
    dateKey: fixture.dateKey,
    versus: mineIsHome ? 'vs' : 'at',
    opponent: (otherSlug ? getTeamBySlug(otherSlug)?.shortName : null) ?? titleCase(otherName),
    leagueShort,
    scheduleUrl: getDivision(fixture.division).official.scheduleUrl,
  };
}

const LATER_PHASES: ReadonlySet<SeasonPhase> = new Set<SeasonPhase>(['preseason', 'regular']);

/**
 * All 43 teams, pre-serialized (DESIGN §7.12). The pin lives in the reader's browser, so the server
 * cannot know which one is wanted; shipping all 43 compact views is the cost of the feature.
 */
export function buildTeamViews(): HomeTeamView[] {
  const today = getToday();
  const contexts = new Map<DivisionId, ReturnType<typeof getStandingContext>>();
  return getTeams().map((team) => {
    const league = getLeague(team.league);
    const single = league.divisions.length === 1;
    const heading = single ? null : getDivision(team.division).label;
    if (!contexts.has(team.division)) contexts.set(team.division, getStandingContext(team.division));
    const context = contexts.get(team.division)?.get(team.id);
    const standing = getStandingFor(team.slug);
    const games = getGames({ teamId: team.id }).sort(byKickoff);
    // The last PLAYED game: a final, or a game whose date has come and whose score has not
    // (score-pending), so a card never sits on an older "Last" after a newer game was played.
    const playedGames = games.filter(
      (g) => (g.status === 'final' || g.status === 'score-pending') && g.dateKey <= today,
    );
    const last = playedGames.at(-1) ?? null;
    const next =
      games.find(
        (g) =>
          g.dateKey >= today &&
          (g.status === 'scheduled' || g.status === 'live' || g.status === 'postponed'),
      ) ?? null;
    const hasResults = standing?.hasReportedResults ?? false;
    const place = standing
      ? standing.tiebreak.shared
        ? `tied ${ordinal(standing.computed.place)}`
        : ordinal(standing.computed.place)
      : null;
    const line = getTeamPostseasonLine(team.slug);
    const projected = LATER_PHASES.has(getSeasonPhase(league.id));
    const lead = projected ? POSTSEASON_LEAD.projected : POSTSEASON_LEAD.final;
    // The card's one visible line must show the STATUS at 320px (288px of text): a short lead, and
    // for a place shared across two rungs the rungs' badges ('Play-in or No AQ route (tied)')
    // instead of the full label with its tiebreak citation, which the team page carries.
    const outcomes = standing ? outcomesFor(standing) : [];
    const tieBadges =
      line && outcomes.length > 1 ? `${outcomes.map((o) => statusBadge(team.division, o)).join(' or ')} (tied)` : null;
    return {
      team: {
        abbr: team.abbr,
        name: team.name,
        colors: colorsOf(team),
        slug: team.slug,
        shortName: team.shortName,
        leagueId: team.league,
        leagueShort: league.shortName,
        divisionHeading: heading,
      },
      meta: [hasResults && place ? place : 'No results yet', heading, league.shortName]
        .filter((part): part is string => !!part)
        .join(' · '),
      played:
        context && context.remaining > 0 ? `${context.counted} of ${context.scheduled} played` : null,
      postseason: line ? `${lead.full} ${line.label}` : null,
      ...(tieBadges ? { postseasonShort: `${lead.short} ${tieBadges}` } : {}),
      tableHref: `/standings/${league.id}#${team.division}`,
      hasResults,
      leagueRecord: hasResults && standing ? recordString(standing.computed) : EM_DASH,
      overallRecord: standing && standing.overall.gp > 0 ? recordString(standing.overall) : EM_DASH,
      form: hasResults && standing ? [...standing.computed.last5] : [],
      last: last ? lastGameView(last, team.slug) : null,
      next: next ? nextGameView(next, team.slug) : null,
      officialNext: next ? null : officialNextView(team, today, league.shortName),
    };
  });
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

function crossLeagueLatest(leagueIds: readonly LeagueId[]): CrossLeagueLatest | null {
  const date = getLatestResultsDate();
  if (!date) return null;
  const games = getGames({ date }).sort(byKickoff);
  const groups = leagueIds
    .map((id) => {
      const mine = games.filter((g) => homeLeagueOf(g, leagueIds) === id);
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

export interface HomeData {
  today: string;
  status: HomeStatus;
  /** All 43, for the My-team slot. */
  teamViews: HomeTeamView[];
  searchIndex: SearchIndex;
  leagueChips: LeagueChip[];
  leagueCards: LeagueCardView[];
  panels: HomeLeaguePanel[];
  crossLeagueLatest: CrossLeagueLatest | null;
}

export function getHomeData(): HomeData {
  const today = getToday();
  const summaries = getLeagueSummaries();
  const leagueIds = summaries.map((s) => s.id);
  const teams = getTeams();
  return {
    today,
    status: {
      resultsThrough: getLatestResultsDate(),
      teamCount: teams.length,
      leagueShorts: summaries.map((s) => s.shortName),
    },
    teamViews: buildTeamViews(),
    searchIndex: getTeamSearchIndex(),
    leagueChips: summaries.map((s) => ({ id: s.id, shortName: s.shortName, sectionShort: s.section.shortName })),
    leagueCards: summaries.map((s) => ({
      id: s.id,
      shortName: s.shortName,
      name: s.name,
      sectionShort: s.section.shortName,
      region: s.region,
      teamsLine: plural(s.teamCount, 'team', 'teams'),
      divisions: s.singleDivision ? [] : s.divisions.map((d) => d.label),
      standingsHref: `/standings/${s.id}`,
    })),
    panels: summaries.map((s) => buildPanel(s, summaries, today)),
    crossLeagueLatest: crossLeagueLatest(leagueIds),
  };
}
