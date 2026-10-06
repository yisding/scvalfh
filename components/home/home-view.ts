/**
 * Everything `/` renders, assembled once on the server (SPEC §10.1, DESIGN §3.1).
 *
 * This is the only module the home page reads data through, and it reads the snapshot ONLY through
 * `lib/data.ts` (plus the pure config helpers of `lib/leagues.ts` and `lib/pin-label.ts`). "Today"
 * is always `getToday()` — derived from `snapshot.fetchedAt` in America/Los_Angeles, never
 * `Date.now()` — so the build is reproducible and the "as of" stamp in the header is honest.
 *
 * The page carries EVERY league's panel in its static HTML; which one shows is decided before first
 * paint by `<html data-league>`, `<html data-region>` and the scope stylesheet (SPEC §8.2,
 * DESIGN-socal §2.4). So every view below is built for all nine leagues, and all 99 pinned-card views
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
  getNonLeagueFinalsPlayed,
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
  playInClause,
  type LeagueSummary,
} from '../../lib/data';
import {
  EM_DASH,
  dateSpan,
  dateTimeAttr,
  leagueClock,
  listWords,
  monthDay,
  numberWord,
  ordinal,
  ordinalWord,
  recordString,
  shortDate,
  timeOfDayPT,
} from '../../lib/format';
import { gameHref } from '../../lib/game-id';
import { hasHistory } from '../../lib/history';
import { outcomesFor, playoffOutcomeLabel, statusBadge } from '../../lib/standings';
import {
  CCS,
  REGIONS,
  divisionHeading,
  getDivision,
  getLeague,
  isSingleDivision,
  leaguePlayStarts,
  sectionOf,
  type DivisionConfig,
  type LeagueConfig,
  type PostseasonConfig,
  type RegionConfig,
} from '../../lib/leagues';
import { pickerName, pinLabel } from '../../lib/pin-label';
import type { SearchIndex } from '../../lib/search';
import { teamOfSide } from '../../lib/teams';
import type { DivisionId, Game, LeagueId, RegionId, SeasonPhase, Team, TeamColors } from '../../lib/types';
import type { LeagueChip } from '../layout/LeagueSwitcher';
import { leagueChips } from '../layout/league-chips';
import { fixtureOpponent, nextOfficialFixture } from '../teams/team-view';
import { describeGame, gameKind, postseasonTagOf, type GameDisplay, type SideView } from '../ui/describe-game';
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
import { POSTSEASON_LEAD, rungCardText } from './home-types';

// ---------------------------------------------------------------- shared helpers

/** Kickoff order, then away name, so a slate is stable between builds. */
function byKickoff(a: Game, b: Game): number {
  return a.dateLocal.localeCompare(b.dateLocal) || a.away.name.localeCompare(b.away.name);
}

function colorsOf(team: Team): HomeColors {
  const { primary, onPrimary } = team.colors;
  return { primary, onPrimary };
}

function shortNameOf(side: Game['home']): string {
  return (side.slug ? getTeamBySlug(side.slug)?.shortName : undefined) ?? side.name;
}

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

// ---------------------------------------------------------------- phase lead

export interface PhaseLeadView {
  /** The bold opening sentence. */
  lead: string;
  /** The rest of the paragraph ('' when none). */
  body: string;
  link: { href: string; label: string } | null;
}

/** The PhaseLead copy for a league in a phase on a day (exported for tests/ui/home-view.test.ts). */
export function phaseLead(league: LeagueConfig, phase: SeasonPhase, today: string): PhaseLeadView | null {
  const short = league.shortName;
  const firstLeague = leaguePlayStarts(league.id);
  const ps = league.postseason;
  const keyDates = CCS.keyDates;

  if (phase === 'preseason' || (phase === 'regular' && today < firstLeague)) {
    // Games played SO FAR — a non-league final later in the season has not been played yet.
    const nonLeague = getNonLeagueFinalsPlayed(league.id, today);
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
      body: `The crossover games and the fourth-place play-in for ${short}’s ${ordinalWord(ps.autoBerths)} automatic CCS berth are ${shortDate(
        crossover?.date ?? keyDates.endOfLeagueSeason,
      )}; the CCS seeding meeting is ${shortDate(keyDates.seedingMeeting)}.`,
      link: { href: `/playoffs#${league.id}`, label: 'Who is in' },
    };
  }

  if (phase === 'play-in' && ps.kind === 'ccs-ladder') {
    const playIn = ps.pairings.find((p) => p.isPlayIn);
    if (playIn) {
      return {
        lead: `${short} league play is over.`,
        body: `${playInClause(league, ps, playIn)}; the CCS seeding meeting is ${shortDate(keyDates.seedingMeeting)}.`,
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

  if (phase === 'tournament' && ps.kind === 'unbracketed-tournament') {
    // No bracket and no page of its own: the dates and what is not published yet, linking to the
    // league's pointer card on /playoffs.
    return {
      lead: `The ${ps.name} is ${dateSpan(ps.dates.first, ps.dates.last)}; its format and site are not published yet.`,
      body: '',
      link: { href: `/playoffs#${league.id}`, label: 'Postseason' },
    };
  }

  if (phase === 'tournament' && ps.kind === 'section-playoffs') {
    // The San Diego Section's playoffs (Green Book 2026-27 Bylaw 2000.1): the Section places the teams and
    // draws the brackets, and this site projects neither, so the lead says when and what is published.
    const seeding = league.keyDates.find((d) => d.id === 'seeding-meeting');
    return {
      lead: `${short} league play is over.`,
      body: `The ${ps.name} are ${dateSpan(ps.dates.first, ps.dates.last)}${
        seeding ? `; the Section publishes its brackets after its ${shortDate(seeding.date)} seeding meeting` : ''
      }.`,
      link: { href: `/playoffs#${league.id}`, label: 'Postseason' },
    };
  }

  // The CCS tournament: only a league whose postseason is the CCS ladder reaches it.
  if (phase === 'playoffs' && ps.kind === 'ccs-ladder') {
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
      // A 'site' league publishes no standings (the Sunset, the San Diego leagues): the final table is ours.
      body:
        league.rules.orderScope === 'site'
          ? 'The tables below are this site’s final tables, ordered by its own points.'
          : 'The tables below are the final league standings.',
      // Only a league with a published 2025-26 table has a last season to link to.
      link: hasHistory(league.id) ? { href: `/history/2025-26#${league.id}`, label: 'Last season' } : null,
    };
  }

  return null;
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

function miniDivision(league: LeagueConfig, division: DivisionConfig): MiniDivisionView {
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
    heading: divisionHeading(division.id),
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
    }
  | {
      kind: 'unbracketed-tournament';
      leagueId: LeagueId;
      /** 'Super Regional, Oct 30–31 — the top six qualify' */
      line: string;
      /** The config's postseason note: format, seeding and site not published, no further path. */
      note: string;
      link: { href: string; label: string };
    }
  | {
      /** The Sunset: no playoffs (CIF-SS Blue Book 2011.1, 3500.2). The line is the config's note. */
      kind: 'no-postseason';
      leagueId: LeagueId;
      line: string;
      note: null;
      link: { href: string; label: string };
    }
  | {
      /**
       * A San Diego league: the Section's playoffs. The line is the config's `qualificationLine` (who the
       * Section places, and the one place a league decides), never "the top N qualify".
       */
      kind: 'section-playoffs';
      leagueId: LeagueId;
      line: string;
      note: string | null;
      link: { href: string; label: string };
    };

function postseasonView(league: LeagueConfig, phase: SeasonPhase, sectionNote: string | null): PostseasonView {
  const ps = league.postseason;
  switch (ps.kind) {
    case 'league-tournament':
      return leagueTournamentView(league, ps, sectionNote);
    case 'unbracketed-tournament':
      // No bracket, no rounds and no CCS dates: the event, its dates and the written qualifier count.
      return {
        kind: 'unbracketed-tournament',
        leagueId: league.id,
        line: `${ps.name}, ${dateSpan(ps.dates.first, ps.dates.last)} — the top ${numberWord(ps.qualifiers)} qualify`,
        note: ps.note,
        link: { href: `/playoffs#${league.id}`, label: 'Postseason' },
      };
    case 'ccs-ladder':
      return ccsLadderView(league, ps, phase);
    case 'no-postseason':
      return { kind: 'no-postseason', leagueId: league.id, line: ps.note, note: null, link: { href: `/playoffs#${league.id}`, label: 'Postseason' } };
    case 'section-playoffs':
      return {
        kind: 'section-playoffs',
        leagueId: league.id,
        line: ps.qualificationLine,
        note: sectionNote,
        link: { href: `/playoffs#${league.id}`, label: ps.name },
      };
  }
}

function leagueTournamentView(
  league: LeagueConfig,
  ps: Extract<PostseasonConfig, { kind: 'league-tournament' }>,
  sectionNote: string | null,
): PostseasonView {
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

function ccsLadderView(
  league: LeagueConfig,
  ps: Extract<PostseasonConfig, { kind: 'ccs-ladder' }>,
  phase: SeasonPhase,
): PostseasonView {
  const short = league.shortName;
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
    intro = `Play-in ${shortDate(playIn.date)}${playIn.time ? `, ${leagueClock(playIn.time)}` : ''}. Seeding meeting ${seeding}.`;
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
    pointsLegend: `PTS: ${league.rules.citations.points}.`,
    teams: {
      leagueId: league.id,
      shortName: league.shortName,
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
      return { href: `/playoffs/${league.id}`, label: ps.name };
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

// ---------------------------------------------------------------- my-team views

/** One score line: the registry short name ("Mitty" on a 358px card), glyph, weight, chip. */
function homeSide(side: SideView): HomeLastDisplay['home'] {
  return { name: side.shortName || side.name, glyph: side.glyph, hasScore: side.hasScore, weight: side.weight, chip: side.chip };
}

/** `describeGame()`'s decision, slimmed to what the card draws (the team-views budget, tests/ui/home-weight.test.ts). */
function slimDisplay(display: GameDisplay): HomeLastDisplay {
  const marks: NonNullable<HomeLastDisplay['marks']> = {};
  if (display.liveDot) marks.liveDot = true;
  if (display.strikeTime) marks.strikeTime = true;
  if (display.isNonLeague) marks.isNonLeague = true;
  if (display.deciderTag) marks.deciderTag = display.deciderTag;
  if (display.shootoutLabel) marks.shootoutLabel = display.shootoutLabel;
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
    versus: describeGame(game, slug).versus ?? 'vs',
    opponent: shortNameOf(theirs),
    kindLabel: postseasonTagOf(game) ?? (gameKind(game) === 'league' ? 'league' : 'non-league'),
    href: gameHref(game.contestId),
    // Two external chips at most plus "Game page": three chips, one row, the same height for every
    // team (no layout shift).
    links: links.slice(0, 2),
  };
}

/** The next fixture from the team's league's official schedule, for a team MaxPreps has no contest for. */
function officialNextView(team: Team, today: string, leagueShort: string): HomeOfficialFixture | null {
  const fixture = nextOfficialFixture(getOfficialFixtures({ slug: team.slug }), today);
  if (!fixture) return null;
  // A division with no official document has no fixtures; narrowing keeps the link honest anyway.
  const official = getDivision(fixture.division).official;
  if (official.mode === 'none') return null;
  const { versus, opponentName } = fixtureOpponent(fixture, team);
  return {
    dateLabel: shortDate(fixture.dateKey),
    dateKey: fixture.dateKey,
    versus,
    opponent: opponentName,
    leagueShort,
    scheduleUrl: official.scheduleUrl,
  };
}

const LATER_PHASES: ReadonlySet<SeasonPhase> = new Set<SeasonPhase>(['preseason', 'regular']);

/**
 * Every team (49), pre-serialized (DESIGN §7.12). The pin lives in the reader's browser, so the
 * server cannot know which one is wanted; shipping every compact view is the cost of the feature.
 */
export function buildTeamViews(): HomeTeamView[] {
  const today = getToday();
  const contexts = new Map<DivisionId, ReturnType<typeof getStandingContext>>();
  return getTeams().map((team) => {
    const league = getLeague(team.league);
    const heading = divisionHeading(team.division);
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
    // A one-rung label too long for that line ("<who>: <what>", the San Diego Section's champion rung)
    // gets its short form too (home-types.ts rungCardText); every other label is shown whole.
    const oneRung =
      line && outcomes.length === 1
        ? rungCardText(playoffOutcomeLabel(team.division, outcomes), statusBadge(team.division, outcomes[0]))
        : null;
    const shortLabel = tieBadges ?? (oneRung !== null && oneRung !== line?.label ? oneRung : null);
    return {
      // The identity the card draws is the search index's entry for this slug (HomeCardTeam).
      slug: team.slug,
      meta: [hasResults && place ? place : 'No results yet', heading, league.shortName]
        .filter((part): part is string => !!part)
        .join(' · '),
      // 'x of y played' while games are left; a league with no fixed schedule (the Sunset) has no "of y",
      // so its card says 'x played' once the team has played (DESIGN-socal §2.1.7).
      played:
        context === undefined
          ? null
          : context.scheduled === null || context.remaining === null
            ? context.counted > 0
              ? `${context.counted} played`
              : null
            : context.remaining > 0
              ? `${context.counted} of ${context.scheduled} played`
              : null,
      postseason: line ? `${lead.full} ${line.label}` : null,
      ...(shortLabel ? { postseasonShort: `${lead.short} ${shortLabel}` } : {}),
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
}

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
  return {
    today,
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
        idSuffix: region.id === 'norcal' ? '' : '-socal',
      };
    }),
  };
}
