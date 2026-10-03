/**
 * Classification: which division's table a game belongs to, decided ONCE (in the pipeline, and in
 * the v1 migration) and persisted as `Game.countsFor` (SPEC §5.1). Pure: no I/O, no clock.
 *
 * Membership of the same division (`Game.leagueDivision`) is always necessary, never sufficient:
 *  - SCVAL keeps today's contest-type evidence (`isLeague`) and excludes only CCS section games,
 *    so its tables stay byte-identical to the goldens;
 *  - BVAL, PCAL and MCAL count a game only when it matched a fixture of that division in the
 *    league's official schedule, and never a postseason game or a contestType 2/4 row.
 */

import { CCS, LEAGUES } from './leagues';
import type { LeagueConfig } from './leagues';
import { getTeamById, getTeamBySlug } from './teams';
import type { DivisionId, Game, GameSide, LeagueId, PostseasonTag, Team } from './types';

export interface ClassifyOptions {
  /** Divisions whose official fixture file is missing/invalid this run: classified by contest-type, never by membership alone. */
  degradedDivisions?: ReadonlySet<DivisionId>;
}

/** The registry team on one side, by MaxPreps GUID first, then by slug. */
function teamOf(side: Pick<GameSide, 'teamId' | 'slug'>): Team | undefined {
  return (side.teamId ? getTeamById(side.teamId) : undefined)
    ?? (side.slug ? getTeamBySlug(side.slug) : undefined);
}

/** Read the config at call time (tests override leagues through vi.mock). */
function leagueById(id: LeagueId): LeagueConfig | undefined {
  return LEAGUES.find((l) => l.id === id);
}

function leagueOfDivisionId(id: DivisionId): LeagueConfig | undefined {
  return LEAGUES.find((l) => l.divisions.some((d) => d.id === id));
}

/** Leagues of the registry sides (0, 1 or 2 distinct), home side first. */
export function leaguesOf(game: Pick<Game, 'home' | 'away'>): LeagueId[] {
  const out: LeagueId[] = [];
  for (const side of [game.home, game.away]) {
    const team = teamOf(side);
    if (team && !out.includes(team.league)) out.push(team.league);
  }
  return out;
}

/** The one league both sides are registry members of, or null. */
function sharedLeague(game: Pick<Game, 'home' | 'away'>): LeagueConfig | null {
  const home = teamOf(game.home);
  const away = teamOf(game.away);
  if (!home || !away || home.league !== away.league) return null;
  return leagueById(home.league) ?? null;
}

/**
 * In order; first match wins:
 *  1. CONFIG PAIRING: game.dateKey === pairing.date, one side in each pairing division (any places), both sides
 *     in the pairing's league → { kind: pairing.tag, leagueId, via: 'config-pairing' }.
 *  2. contestType 4 on either row → { kind, leagueId: the shared league or null, via: 'contest-type-4' }, where kind
 *     is 'mcal-tournament' when both sides are in one league whose postseason.kind is 'league-tournament'; else
 *     'ccs' when at least one registry side is in a CCS league and no registry side is in a league of another
 *     section (NCS holds no field hockey championship); else 'other' (an MCAL team against a non-registry or CCS
 *     opponent, or no registry side at all).
 *  2b. both sides members of one CCS league (postseason.kind 'ccs-ladder') and game.dateKey >=
 *     CCS.keyDates.quarterfinals → { kind: 'ccs', leagueId: that league, via: 'ccs-window' }.
 *  3. both sides members of one league L with rules.postseasonFrom, game.dateKey >= postseasonFrom, and
 *     contestId NOT in L.rules.leagueGameOverrides → { kind: 'mcal-tournament', leagueId: L, via: 'league-postseason-window' }.
 *  4. null.
 */
export function postseasonTag(game: Game): PostseasonTag | null {
  const home = teamOf(game.home);
  const away = teamOf(game.away);
  const league = sharedLeague(game);

  // 1. a configured pairing (SCVAL crossover ×4, BVAL play-in)
  if (league && home && away && league.postseason.kind === 'ccs-ladder') {
    for (const pairing of league.postseason.pairings) {
      if (pairing.date !== game.dateKey) continue;
      const [a, b] = pairing.seats;
      const oneEach =
        (home.division === a.division && away.division === b.division) ||
        (home.division === b.division && away.division === a.division);
      if (oneEach) return { kind: pairing.tag, leagueId: league.id, via: 'config-pairing' };
    }
  }

  // 2. MaxPreps' own postseason flag on either row
  const types = game.contestTypes ?? { home: null, away: null };
  if (types.home === 4 || types.away === 4) {
    let kind: PostseasonTag['kind'];
    if (league?.postseason.kind === 'league-tournament') kind = 'mcal-tournament';
    else {
      const sections = [home, away]
        .filter((t): t is Team => t !== undefined)
        .map((t) => leagueById(t.league)?.sectionId ?? null);
      kind = sections.length > 0 && sections.every((s) => s === 'ccs') ? 'ccs' : 'other';
    }
    return { kind, leagueId: league ? league.id : null, via: 'contest-type-4' };
  }

  // 2b. the CCS bracket window
  if (league && league.postseason.kind === 'ccs-ladder' && game.dateKey >= CCS.keyDates.quarterfinals) {
    return { kind: 'ccs', leagueId: league.id, via: 'ccs-window' };
  }

  // 3. a league's own postseason window (MCAL from Oct 23)
  if (
    league &&
    league.rules.postseasonFrom !== null &&
    game.dateKey >= league.rules.postseasonFrom &&
    !league.rules.leagueGameOverrides.includes(game.contestId)
  ) {
    return { kind: 'mcal-tournament', leagueId: league.id, via: 'league-postseason-window' };
  }

  return null;
}

/**
 * The division whose table this game belongs to, for ANY status. null unless leagueDivision !== null. Then by the
 * division's league rule:
 *  - 'contest-type' (SCVAL): game.isLeague && game.postseason?.kind !== 'ccs' ? leagueDivision : null.
 *  - 'official-fixtures' (BVAL, PCAL, MCAL):
 *        null if game.postseason !== null
 *        null if contestTypes.home or contestTypes.away ∈ rules.excludeContestTypes
 *        if leagueDivision ∈ opts.degradedDivisions: game.isLeague ? leagueDivision : null    (never membership alone)
 *        else game.official?.division === leagueDivision ? leagueDivision : null
 */
export function classifyGame(game: Game, opts: ClassifyOptions = {}): DivisionId | null {
  const division = game.leagueDivision;
  if (division === null) return null;
  const league = leagueOfDivisionId(division);
  if (!league) return null;
  const { rules } = league;

  if (rules.classification === 'contest-type') {
    return game.isLeague && game.postseason?.kind !== 'ccs' ? division : null;
  }

  if (game.postseason !== null && game.postseason !== undefined) return null;
  const types = game.contestTypes ?? { home: null, away: null };
  for (const t of [types.home, types.away]) {
    if (t !== null && rules.excludeContestTypes.includes(t)) return null;
  }
  if (opts.degradedDivisions?.has(division)) return game.isLeague ? division : null;
  return game.official?.division === division ? division : null;
}

/** Sets postseason (if not already set) and then countsFor on a copy of every game. */
export function classifyGames(games: readonly Game[], opts: ClassifyOptions = {}): Game[] {
  return games.map((g) => {
    const tagged: Game = { ...g, postseason: g.postseason ?? postseasonTag(g) };
    return { ...tagged, countsFor: classifyGame(tagged, opts) };
  });
}

/** The UI's league / non-league tag: game.countsFor !== null. */
export function isLeagueGame(game: Pick<Game, 'countsFor'>): boolean {
  return game.countsFor !== null;
}
