/**
 * The site-facing read API. Every page and component reads the snapshot through this module.
 *
 * The snapshot is loaded and validated ONCE at module scope: bundled into the server code at build
 * time, and a schema failure surfaces at import time rather than half-way through a render.
 *
 * "Today" is ALWAYS derived from `snapshot.fetchedAt` in America/Los_Angeles — never from
 * Date.now() — so a build is reproducible and every "as of" label is honest (BUILD-BRIEF).
 */

import { readFileSync } from 'node:fs';

import bundledSnapshot from '../data/snapshot.json';

import { localDateKey, hoursBetween, isoDateKey, recordString } from './format';
import { CCS_BRACKET_URL, DIVISIONS } from './season';
import {
  crossoverPairings,
  outcomesFor,
  playoffOutcomeLabel,
  sortStandings,
} from './standings';
import { parseSnapshot } from './snapshot-schema';
import type {
  CcsCalendarEvent,
  ContestId,
  CrossCheckRow,
  Division,
  Game,
  GameStatus,
  OfficialFixture,
  Outcome,
  PlayoffProjection,
  Record3,
  SbliveCrossCheck,
  Season,
  SeasonPhase,
  SourceStatus,
  Standing,
  Team,
  TeamId,
  TeamSlug,
} from './types';

/**
 * data/snapshot.json is IMPORTED, so every toolchain bundles it into the server code at build time:
 * Turbopack for `next build`, Vite/Rolldown for vinext's Node server and its Cloudflare Worker.
 * Nothing reads data/ from disk at run time. That is what lets the Worker start at all: workerd's
 * node:fs sees only /bundle, /tmp and /dev, and this module runs as a Worker instance starts (the
 * root layout and the dynamic metadata routes import it), so the old
 * `readFileSync(path.join(process.cwd(), 'data', 'snapshot.json'))` threw before any request was
 * served. A missing file is now a build error (the import does not resolve): run `pnpm fetch-data`
 * first.
 *
 * SCVAL_SNAPSHOT still swaps in another file (tests, a --out build), read with node:fs when this
 * module loads. It needs a real filesystem: next start, vinext start, vitest and tsx, never a
 * Worker.
 */
function load() {
  const override = process.env.SCVAL_SNAPSHOT;
  if (!override) return parseSnapshot(bundledSnapshot as unknown);
  let raw: string;
  try {
    raw = readFileSync(override, 'utf8');
  } catch (err) {
    throw new Error(
      `lib/data.ts: cannot read SCVAL_SNAPSHOT=${override} (${(err as Error).message})`,
    );
  }
  return parseSnapshot(JSON.parse(raw) as unknown);
}

const snapshot = load();

// ---------------------------------------------------------------- basics

export function getSnapshot() {
  return snapshot;
}

export function getSeason(): Season {
  return snapshot.season;
}

export function getFetchedAt(): string {
  return snapshot.fetchedAt;
}

/** 'YYYY-MM-DD' in America/Los_Angeles, derived from the snapshot stamp. */
export function getToday(): string {
  return localDateKey(snapshot.fetchedAt);
}

/** Hours since the snapshot was written, relative to an instant you supply. */
export function getSnapshotAgeHours(now: string = snapshot.fetchedAt): number {
  return hoursBetween(snapshot.fetchedAt, now);
}

export function getSources(): readonly SourceStatus[] {
  return snapshot.sources;
}

/** The MaxPreps STANDINGS comparison (DESIGN §9). */
export function getCrossCheck(): readonly CrossCheckRow[] {
  return snapshot.crossCheck;
}

/**
 * The SBLive SCORE cross-check (SPEC §5.7). Undefined when the step was skipped.
 * `conflicts` are games where the two sources publish different numbers — we show MaxPreps and say
 * so; `sbliveOnlyScored` are games SBLive has scored and MaxPreps has not, which we do NOT backfill.
 */
export function getSbliveCrossCheck(): SbliveCrossCheck | undefined {
  return snapshot.sbliveCrossCheck;
}

/** The scoreConflict on one game, for the "sources disagree" marker on a row. */
export function getScoreConflict(contestId: ContestId): Game['provenance']['scoreConflict'] {
  return getGameById(contestId)?.provenance.scoreConflict;
}

/**
 * Official SCVAL fixtures with NO contest in the snapshot — render these as
 * "scheduled per SCVAL, not reported" (SPEC §1.3). Today: the two Homestead–Cupertino legs
 * MaxPreps has never published.
 */
export function getOfficialFixtures(filter: { division?: Division; slug?: string } = {}): OfficialFixture[] {
  let rows = snapshot.officialFixtures ?? [];
  if (filter.division) rows = rows.filter((f) => f.division === filter.division);
  if (filter.slug) {
    const team = resolveTeamRef(filter.slug);
    if (!team) return [];
    rows = rows.filter((f) => f.awaySlug === team.slug || f.homeSlug === team.slug);
  }
  return [...rows];
}

/** null until SCVAL publishes a 2026-27 field hockey standings PDF; undefined if never polled. */
export function getOfficialStandingsPdfUrl(): string | null | undefined {
  return snapshot.officialStandingsPdfUrl;
}

/** The CCS iCal events, once the Oct 25 season gate has opened (SPEC §5.9). */
export function getCcsCalendar(): readonly CcsCalendarEvent[] | undefined {
  return snapshot.playoffs.ccsCalendar;
}

/** true when the CCS calendar corroborated every published key date. undefined if not yet polled. */
export function areKeyDatesConfirmed(): boolean | undefined {
  return snapshot.playoffs.keyDatesConfirmed;
}

export function getCounts() {
  return snapshot.counts;
}

// ---------------------------------------------------------------- teams

export function getTeams(division?: Division): readonly Team[] {
  return division ? snapshot.teams.filter((t) => t.division === division) : snapshot.teams;
}

export function getTeamBySlug(slug: string): Team | undefined {
  return snapshot.teams.find((t) => t.slug === slug);
}

export function getTeamById(id: string): Team | undefined {
  return snapshot.teams.find((t) => t.id === id);
}

/** Accepts a slug or a MaxPreps GUID. */
export function resolveTeamRef(ref: string): Team | undefined {
  return getTeamBySlug(ref) ?? getTeamById(ref);
}

export function getTeamSlugs(): TeamSlug[] {
  return snapshot.teams.map((t) => t.slug);
}

// ---------------------------------------------------------------- games

export interface GameFilter {
  /** A MaxPreps GUID or one of our slugs. */
  teamId?: string;
  division?: Division;
  leagueOnly?: boolean;
  status?: GameStatus | GameStatus[];
  /** 'YYYY-MM-DD' */
  date?: string;
}

function involvesTeam(game: Game, team: Team): boolean {
  return (
    game.home.teamId === team.id ||
    game.away.teamId === team.id ||
    game.home.slug === team.slug ||
    game.away.slug === team.slug
  );
}

export function getGames(filter: GameFilter = {}): Game[] {
  const statuses = filter.status
    ? new Set(Array.isArray(filter.status) ? filter.status : [filter.status])
    : null;
  const team = filter.teamId ? resolveTeamRef(filter.teamId) : undefined;
  if (filter.teamId && !team) return [];
  const divisionTeams = filter.division
    ? new Set(getTeams(filter.division).map((t) => t.slug as string))
    : null;

  return snapshot.games.filter((g) => {
    if (team && !involvesTeam(g, team)) return false;
    if (filter.leagueOnly && !g.isLeague) return false;
    if (statuses && !statuses.has(g.status)) return false;
    if (filter.date && g.dateKey !== filter.date) return false;
    if (
      divisionTeams &&
      !(
        (g.home.slug && divisionTeams.has(g.home.slug)) ||
        (g.away.slug && divisionTeams.has(g.away.slug))
      )
    ) {
      return false;
    }
    return true;
  });
}

export function getGameById(contestId: ContestId): Game | undefined {
  return snapshot.games.find((g) => g.contestId === contestId);
}

/** Every date with at least one contest, ascending — the /scores/[date] static params. */
export function getGameDates(): string[] {
  return [...new Set(snapshot.games.map((g) => g.dateKey))].sort();
}

export function getGamesByDate(): Array<{ date: string; games: Game[] }> {
  return getGameDates().map((date) => ({ date, games: getGames({ date }) }));
}

/**
 * The last day a LEAGUE result was reported — for one division, or across both when `division` is
 * omitted. `null` before league play has produced anything.
 *
 * This, never `getToday()`, is what a standings or projection caption's "through …" date means.
 * `getToday()` is the snapshot's own Pacific day and says nothing about whether a game was played
 * on it: on the live snapshot all three Sep 30 contests were still `scheduled` while /playoffs
 * captioned its table "through Sep 30", and the two divisions do not play on the same days, so one
 * shared date captioned De Anza "through Sep 29" on a day whose only finals were El Camino's.
 */
export function getLastLeagueResultDate(division?: Division): string | null {
  const dates = getGames({ ...(division ? { division } : {}), leagueOnly: true, status: 'final' })
    .map((g) => g.dateKey)
    .sort();
  return dates.length ? dates[dates.length - 1] : null;
}

const PLAYABLE: GameStatus[] = ['scheduled', 'live', 'postponed'];

/** The next `n` contests at or after `asOf` (default: the snapshot stamp). */
export function getUpcoming(n = 5, asOf: string = snapshot.fetchedAt): Game[] {
  const today = localDateKey(asOf);
  return snapshot.games
    .filter((g) => PLAYABLE.includes(g.status) && g.dateKey >= today)
    .sort((a, b) => a.dateLocal.localeCompare(b.dateLocal))
    .slice(0, n);
}

/** The most recent `n` finals at or before `asOf`, newest first. */
export function getRecentResults(n = 5, asOf: string = snapshot.fetchedAt): Game[] {
  const today = localDateKey(asOf);
  return snapshot.games
    .filter((g) => g.status === 'final' && g.dateKey <= today)
    .sort((a, b) => b.dateLocal.localeCompare(a.dateLocal))
    .slice(0, n);
}

/**
 * The most recent date that actually has reported results, so the home page never shows a stale
 * day as if it were last night (DESIGN §8).
 */
export function getLatestResultsDate(asOf: string = snapshot.fetchedAt): string | null {
  const today = localDateKey(asOf);
  const dates = snapshot.games
    .filter((g) => g.status === 'final' && g.dateKey <= today)
    .map((g) => g.dateKey)
    .sort();
  return dates.length ? dates[dates.length - 1] : null;
}

// ---------------------------------------------------------------- standings

export function getStandings(division: Division): Standing[] {
  return sortStandings(snapshot.standings.filter((s) => s.division === division));
}

export function getAllStandings(): Record<Division, Standing[]> {
  return {
    'de-anza': getStandings('de-anza'),
    'el-camino': getStandings('el-camino'),
  };
}

export function getStandingFor(ref: string): Standing | undefined {
  const team = resolveTeamRef(ref);
  return team ? snapshot.standings.find((s) => s.teamId === team.id) : undefined;
}

/** max |gd| in a division — the GoalDiffBar domain, per division (DESIGN §5.6). */
export function getGoalDiffDomain(division: Division): number {
  const values = getStandings(division).map((s) => Math.abs(s.computed.gd));
  return Math.max(1, ...values);
}

// ---------------------------------------------------------------- season phase

export function getSeasonPhase(asOf: string = snapshot.fetchedAt): SeasonPhase {
  const today = localDateKey(asOf);
  const w = snapshot.season.window;
  if (!w.firstGame) return 'preseason';
  const first = isoDateKey(w.firstGame);
  if (today < first) return 'preseason';
  const lastPlayed = [w.lastGame, w.lastLeagueGame]
    .filter((v): v is string => !!v)
    .map(isoDateKey)
    .sort();
  const regularEnd = lastPlayed[lastPlayed.length - 1] ?? first;
  if (today <= regularEnd) return 'regular';
  const { crossover, finals } = snapshot.playoffs.keyDates;
  if (today <= crossover) return 'crossover';
  if (today <= finals) return 'playoffs';
  return 'complete';
}

// ---------------------------------------------------------------- head to head

export interface HeadToHead {
  a: Team;
  b: Team;
  games: Game[];
  /** Record from A's point of view. */
  aRecord: Record3;
  bRecord: Record3;
  aGoals: number;
  bGoals: number;
  summary: string;
}

export function getHeadToHead(aRef: string, bRef: string): HeadToHead | undefined {
  const a = resolveTeamRef(aRef);
  const b = resolveTeamRef(bRef);
  if (!a || !b || a.id === b.id) return undefined;
  const games = snapshot.games
    .filter((g) => {
      const ids = [g.home.teamId, g.away.teamId];
      return ids.includes(a.id) && ids.includes(b.id);
    })
    .sort((x, y) => x.dateLocal.localeCompare(y.dateLocal));

  const aRecord: Record3 = { w: 0, l: 0, t: 0 };
  const bRecord: Record3 = { w: 0, l: 0, t: 0 };
  let aGoals = 0;
  let bGoals = 0;
  for (const g of games) {
    if (g.status !== 'final' || g.home.score === null || g.away.score === null) continue;
    const aIsHome = g.home.teamId === a.id;
    const aScore = aIsHome ? g.home.score : g.away.score;
    const bScore = aIsHome ? g.away.score : g.home.score;
    if (!g.isForfeit) {
      aGoals += aScore;
      bGoals += bScore;
    }
    if (aScore > bScore) {
      aRecord.w += 1;
      bRecord.l += 1;
    } else if (aScore < bScore) {
      aRecord.l += 1;
      bRecord.w += 1;
    } else {
      aRecord.t += 1;
      bRecord.t += 1;
    }
  }
  return {
    a,
    b,
    games,
    aRecord,
    bRecord,
    aGoals,
    bGoals,
    summary: `${a.shortName} ${recordString(aRecord)} vs ${b.shortName}`,
  };
}

// ---------------------------------------------------------------- team form

export interface FormGame {
  contestId: ContestId;
  date: string;
  opponent: string;
  opponentSlug: TeamSlug | null;
  site: Game['site'];
  status: GameStatus;
  /** goals for − goals against; null unless the game is a counted final. */
  margin: number | null;
  outcome: Outcome | null;
  isLeague: boolean;
  /** Forfeits have no goal margin and are excluded from MarginStrip (DESIGN §5.7). */
  excludedFromMargin: boolean;
}

export interface TeamForm {
  team: Team;
  standing: Standing | undefined;
  last5: Outcome[];
  streak: Standing['computed']['streak'];
  /** Every league contest in date order, played or not, for the MarginStrip axis. */
  leagueGames: FormGame[];
  nonLeagueCount: number;
}

export function getTeamForm(ref: string): TeamForm | undefined {
  const team = resolveTeamRef(ref);
  if (!team) return undefined;
  const standing = snapshot.standings.find((s) => s.teamId === team.id);
  const all = getGames({ teamId: team.id }).sort((a, b) =>
    a.dateLocal.localeCompare(b.dateLocal),
  );
  const leagueGames: FormGame[] = all
    .filter((g) => g.isLeague)
    .map((g) => {
      const isHome = g.home.teamId === team.id;
      const mine = isHome ? g.home : g.away;
      const theirs = isHome ? g.away : g.home;
      const counted =
        g.status === 'final' && mine.score !== null && theirs.score !== null && !g.isForfeit;
      const outcome: Outcome | null =
        g.status === 'final' && mine.score !== null && theirs.score !== null
          ? mine.score > theirs.score
            ? 'W'
            : mine.score < theirs.score
              ? 'L'
              : 'T'
          : null;
      return {
        contestId: g.contestId,
        date: g.dateKey,
        opponent: theirs.name,
        opponentSlug: theirs.slug,
        site: g.site === 'neutral' ? 'neutral' : isHome ? 'home' : 'away',
        status: g.status,
        margin: counted ? (mine.score as number) - (theirs.score as number) : null,
        outcome,
        isLeague: true,
        excludedFromMargin: g.isForfeit,
      };
    });
  return {
    team,
    standing,
    last5: standing ? [...standing.computed.last5] : [],
    streak: standing?.computed.streak ?? null,
    leagueGames,
    nonLeagueCount: all.filter((g) => !g.isLeague).length,
  };
}

// ---------------------------------------------------------------- playoffs

export function getPlayoffs() {
  return snapshot.playoffs;
}

/**
 * Article VII §2 projection: places 1-3 are automatic qualifiers, 4th plays in on Oct 30 for the
 * SCVAL 7th AQ, 5th goes to CCS for at-large consideration. No probability model exists, so every
 * status is a written word (DESIGN §6.1).
 */
export function getPlayoffProjection(asOf: string = snapshot.fetchedAt): PlayoffProjection {
  const byDivision = {} as PlayoffProjection['byDivision'];
  for (const division of DIVISIONS) {
    byDivision[division] = getStandings(division).map((s) => {
      // The union, not `s.playoffStatus`: a level place spans more than one finishing slot, so a
      // tie for 3rd holds both the third automatic berth and the 4th-place play-in spot.
      const statuses = outcomesFor(s);
      return {
        teamId: s.teamId,
        slug: s.slug,
        place: s.computed.place,
        status: statuses[0],
        statuses,
        label: s.hasReportedResults ? playoffOutcomeLabel(statuses) : 'No results reported',
        shared: s.tiebreak.shared,
      };
    });
  }
  return {
    asOf,
    berths: {
      auto: snapshot.playoffs.format.autoQualifiers.scval,
      total: snapshot.playoffs.format.autoQualifiers.total,
    },
    byDivision,
    crossover: {
      date: snapshot.playoffs.keyDates.crossover,
      pairings: crossoverPairings(snapshot.standings),
    },
  };
}

export const BRACKET_URL = CCS_BRACKET_URL;

/** Re-exported so a page never has to import two modules to name a team id. */
export type { Division, Game, Standing, Team, TeamId, TeamSlug };
