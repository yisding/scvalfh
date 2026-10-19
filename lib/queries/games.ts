/**
 * The snapshot's contests (SPEC §13.3): filtered lists, one game, the dates with games, the landing
 * dates the Scores tab and the home page aim at, the official fixtures nobody has reported, and one
 * team's form line.
 */

import { getLeague } from '@/lib/config/leagues';
import { getFetchedAt, getSnapshot, getToday } from '@/lib/datasets/snapshot';
import type { OfficialFixture } from '@/lib/model/fixture';
import type { Game, GameStatus, Outcome } from '@/lib/model/game';
import type { ContestId, DivisionId, LeagueId, TeamSlug } from '@/lib/model/ids';
import type { Team } from '@/lib/model/team';
import { teamOfSide } from '@/lib/registry/teams';
import { localDateKey } from '@/lib/shared/dates';
import { sideOutcome } from '@/lib/shared/game';
import { resolveTeamRef } from './teams';

const snapshot = getSnapshot();

// ---------------------------------------------------------------- games

export interface GameFilter {
  /** A MaxPreps GUID or one of our slugs. */
  teamId?: string;
  /** ≥1 side in the league. */
  league?: LeagueId;
  /** ≥1 side in the division. */
  division?: DivisionId;
  /** countsFor !== null. */
  leagueOnly?: boolean;
  /** true: postseason !== null; false: postseason === null. */
  postseason?: boolean;
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

function hasSideIn(game: Game, pred: (t: Team) => boolean): boolean {
  const h = teamOfSide(game.home);
  const a = teamOfSide(game.away);
  return (!!h && pred(h)) || (!!a && pred(a));
}

export function getGames(filter: GameFilter = {}): Game[] {
  const statuses = filter.status
    ? new Set(Array.isArray(filter.status) ? filter.status : [filter.status])
    : null;
  const team = filter.teamId ? resolveTeamRef(filter.teamId) : undefined;
  if (filter.teamId && !team) return [];

  return snapshot.games.filter((g) => {
    if (team && !involvesTeam(g, team)) return false;
    if (filter.leagueOnly && g.countsFor === null) return false;
    if (filter.postseason === true && g.postseason === null) return false;
    if (filter.postseason === false && g.postseason !== null) return false;
    if (statuses && !statuses.has(g.status)) return false;
    if (filter.date && g.dateKey !== filter.date) return false;
    if (filter.league && !hasSideIn(g, (t) => t.league === filter.league)) return false;
    if (filter.division && !hasSideIn(g, (t) => t.division === filter.division)) return false;
    return true;
  });
}

export function getGameById(contestId: ContestId): Game | undefined {
  return snapshot.games.find((g) => g.contestId === contestId);
}

/** Every date with at least one contest, ascending — the /scores/[date] static params. */
export function getGameDates(filter: { league?: LeagueId } = {}): string[] {
  const games = filter.league ? getGames({ league: filter.league }) : snapshot.games;
  return [...new Set(games.map((g) => g.dateKey))].sort();
}

export function getGamesByDate(filter: { league?: LeagueId } = {}): Array<{ date: string; games: Game[] }> {
  return getGameDates(filter).map((date) => ({ date, games: getGames({ ...filter, date }) }));
}

/**
 * The last day a LEAGUE result was reported — for one division, one league, or all leagues.
 * `null` before league play has produced anything.
 *
 * This, never `getToday()`, is what a standings or projection caption's "through …" date means:
 * `getToday()` is the snapshot's own Pacific day and says nothing about whether a game was played
 * on it, and divisions do not play on the same days.
 */
export function getLastLeagueResultDate(
  scope: { league?: LeagueId; division?: DivisionId } = {},
): string | null {
  const leagueDivisions = scope.league
    ? new Set<string>(getLeague(scope.league).divisions.map((d) => d.id))
    : null;
  const dates = snapshot.games
    .filter(
      (g) =>
        g.status === 'final' &&
        g.countsFor !== null &&
        (!scope.division || g.countsFor === scope.division) &&
        (!leagueDivisions || leagueDivisions.has(g.countsFor)),
    )
    .map((g) => g.dateKey)
    .sort();
  return dates.length ? dates[dates.length - 1] : null;
}

/**
 * Non-league games played so far: finals of the league's teams that count for no table and are
 * no postseason game (the `isNonLeague` predicate, components/ui/describe-game.ts), dated on or
 * before `through`. The count the two pre-league-play notices (the home PhaseLead and the
 * /standings banner) print, so they cannot count differently.
 */
export function getNonLeagueFinalsPlayed(leagueId: LeagueId, through: string = getToday()): number {
  return getGames({ league: leagueId, status: 'final' }).filter(
    (g) => g.countsFor === null && g.postseason === null && g.dateKey <= through,
  ).length;
}

const PLAYABLE: GameStatus[] = ['scheduled', 'live', 'postponed'];

function scoped(filter: { league?: LeagueId }): Game[] {
  return filter.league ? getGames({ league: filter.league }) : snapshot.games;
}

/** The next `n` contests at or after `asOf` (default: the snapshot stamp). */
export function getUpcoming(n = 5, filter: { league?: LeagueId } = {}, asOf: string = getFetchedAt()): Game[] {
  const today = localDateKey(asOf);
  return scoped(filter)
    .filter((g) => PLAYABLE.includes(g.status) && g.dateKey >= today)
    .sort((a, b) => a.dateLocal.localeCompare(b.dateLocal))
    .slice(0, n);
}

/**
 * The most recent date that actually has reported results, so the home page never shows a stale
 * day as if it were last night (DESIGN §8).
 */
export function getLatestResultsDate(filter: { league?: LeagueId } = {}, asOf: string = getFetchedAt()): string | null {
  const today = localDateKey(asOf);
  const dates = scoped(filter)
    .filter((g) => g.status === 'final' && g.dateKey <= today)
    .map((g) => g.dateKey)
    .sort();
  return dates.length ? dates[dates.length - 1] : null;
}

/**
 * The Scores tab's landing date, across every league or within one: the latest day at or before
 * "today" (the snapshot's Pacific day, never the clock) with at least one final; before the first
 * result it is the next day with a contest; with no contests at all, none. BottomTabBar aims the
 * tab at it and ScheduleList lays out the days around it, so the two cannot disagree.
 */
export function getScoresLandingDate(filter: { league?: LeagueId } = {}): string | null {
  const today = getToday();
  return getLatestResultsDate(filter) ?? getGameDates(filter).find((d) => d >= today) ?? null;
}

/**
 * Official fixtures (any league) with NO contest in the snapshot — render these as "scheduled
 * per <SHORT>, not reported".
 */
export function getOfficialFixtures(
  filter: { league?: LeagueId; division?: DivisionId; slug?: string } = {},
): OfficialFixture[] {
  let rows = snapshot.officialFixtures ?? [];
  if (filter.league) rows = rows.filter((f) => f.league === filter.league);
  if (filter.division) rows = rows.filter((f) => f.division === filter.division);
  if (filter.slug) {
    const team = resolveTeamRef(filter.slug);
    if (!team) return [];
    rows = rows.filter((f) => f.awaySlug === team.slug || f.homeSlug === team.slug);
  }
  return [...rows];
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
  /** Forfeits have no goal margin and are excluded from MarginStrip (DESIGN §5.7). */
  excludedFromMargin: boolean;
}

export interface TeamForm {
  /** Every counted-division contest in date order, played or not, for the MarginStrip axis. */
  leagueGames: FormGame[];
}

export function getTeamForm(ref: string): TeamForm | undefined {
  const team = resolveTeamRef(ref);
  if (!team) return undefined;
  const all = getGames({ teamId: team.id }).sort((a, b) =>
    a.dateLocal.localeCompare(b.dateLocal),
  );
  const allGames: FormGame[] = all.map((g) => {
    const isHome = g.home.teamId === team.id;
    const mine = isHome ? g.home : g.away;
    const theirs = isHome ? g.away : g.home;
    const counted =
      g.status === 'final' && mine.score !== null && theirs.score !== null && !g.isForfeit;
    // sideOutcome: a shootout win (decider 'SO', level on goals: an EAL 1 v 1 win, a San Diego shootout) is the flagged side's win.
    const outcome: Outcome | null = sideOutcome(g, isHome ? 'home' : 'away');
    return {
      contestId: g.contestId,
      date: g.dateKey,
      opponent: theirs.name,
      opponentSlug: theirs.slug,
      site: g.site === 'neutral' ? 'neutral' : isHome ? 'home' : 'away',
      status: g.status,
      margin: counted ? (mine.score as number) - (theirs.score as number) : null,
      outcome,
      excludedFromMargin: g.isForfeit,
    };
  });
  const leagueGames = allGames.filter((_, i) => all[i].countsFor !== null);
  return { leagueGames };
}
