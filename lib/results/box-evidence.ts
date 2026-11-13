/**
 * Box scores as evidence about a game's result. Each team's coach enters a box score on MaxPreps apart from the
 * game's score (data/player-stats.json, scripts/fetch-player-stats.ts): its scorers' goals, its goalkeepers'
 * goals against and overtime minutes. It is one more slightly unreliable source (about 7% of the sides with
 * goals tracked do not total the game's score), but it is entered separately, so where it agrees with another
 * source it settles a disagreement, and a goalkeeper's overtime minutes say a game went to overtime when
 * MaxPreps' count is 0.
 *
 * Pure: `boxEvidenceFrom` reads the player-stats file as plain JSON, defensively, so lib/data.ts and the
 * pipeline can call it without importing lib/players/player-stats.ts (which imports lib/data).
 */

import type { BoxSide, Game } from '../types';
import { isLevelWithWinner } from '../postseason/level-final';

/** contestId → team slug → that team's box score of the game. */
export type BoxEvidence = ReadonlyMap<string, ReadonlyMap<string, BoxSide>>;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
const tracks = (tracked: unknown, group: string, key: string): boolean =>
  isObject(tracked) && Array.isArray(tracked[group]) && (tracked[group] as unknown[]).includes(key);

/** Every box score in a player-stats file, reduced to what bears on a result. Anything malformed is skipped. */
export function boxEvidenceFrom(playerStats: unknown): BoxEvidence {
  const out = new Map<string, Map<string, BoxSide>>();
  if (!isObject(playerStats) || !Array.isArray(playerStats.teams)) return out;
  for (const team of playerStats.teams) {
    if (!isObject(team) || typeof team.slug !== 'string' || !Array.isArray(team.games)) continue;
    for (const box of team.games) {
      if (!isObject(box) || typeof box.contestId !== 'string' || !Array.isArray(box.players)) continue;
      const players = box.players.filter(isObject);
      const side: BoxSide = {};
      // A stat counts only when the coach tracked it for this game: an untracked stat is unknown, not zero.
      if (tracks(box.tracked, 'field', 'goals')) {
        side.goals = players.reduce((n, p) => n + (isObject(p.field) ? count(p.field.goals) : 0), 0);
      }
      if (tracks(box.tracked, 'goalkeeping', 'goalsAgainst')) {
        side.goalsAgainst = players.reduce((n, p) => n + (isObject(p.goalkeeping) ? count(p.goalkeeping.goalsAgainst) : 0), 0);
      }
      if (tracks(box.tracked, 'goalkeeping', 'overtimeMinutes')) {
        side.overtimeMinutes = players.reduce((n, p) => Math.max(n, isObject(p.goalkeeping) ? count(p.goalkeeping.overtimeMinutes) : 0), 0);
      }
      if (Object.keys(side).length === 0) continue;
      const byTeam = out.get(box.contestId) ?? new Map<string, BoxSide>();
      byTeam.set(team.slug, side);
      out.set(box.contestId, byTeam);
    }
  }
  return out;
}

function sameSide(a: BoxSide | undefined, b: BoxSide | undefined): boolean {
  if (!a || !b) return !a && !b;
  return a.goals === b.goals && a.goalsAgainst === b.goalsAgainst && a.overtimeMinutes === b.overtimeMinutes;
}

/**
 * Whether a box score can bear on this game's record: another source already differs from the published score,
 * the game is level with the winner marked, MaxPreps' own flags contradict its score, or a goalkeeper played
 * overtime minutes in a game MaxPreps records no overtime for. Only those games carry `provenance.boxScore`,
 * so the snapshot does not grow by a box score per game.
 */
function bearsOn(game: Game, home: BoxSide | undefined, away: BoxSide | undefined): boolean {
  const p = game.provenance;
  // A cited correction settles its game: no box score is weighed against it.
  if (p.resultCorrection) return false;
  if (p.scoreConflict || p.cifssScore || p.resultConflict || p.adjudicated || p.overtimeEvidence || isLevelWithWinner(game.home, game.away)) return true;
  return game.otPeriods === 0 && ((home?.overtimeMinutes ?? 0) > 0 || (away?.overtimeMinutes ?? 0) > 0);
}

/**
 * The game with its two teams' box scores as `provenance.boxScore` when they bear on its record, and without
 * the field otherwise. `evidence` undefined leaves the game as it is (a caller with no player-stats file to
 * hand: the pipeline's previous snapshot); the same object when nothing changes.
 */
export function withBoxScore(game: Game, evidence: BoxEvidence | undefined): Game {
  if (!evidence) return game;
  const sides = game.status === 'final' ? evidence.get(game.contestId) : undefined;
  const home = game.home.slug ? sides?.get(game.home.slug) : undefined;
  const away = game.away.slug ? sides?.get(game.away.slug) : undefined;
  const have = game.provenance.boxScore;
  if ((!home && !away) || !bearsOn(game, home, away)) {
    if (!have) return game;
    const { boxScore: _gone, ...provenance } = game.provenance;
    void _gone;
    return { ...game, provenance };
  }
  if (have && sameSide(have.home, home) && sameSide(have.away, away)) return game;
  return { ...game, provenance: { ...game.provenance, boxScore: { ...(home ? { home } : {}), ...(away ? { away } : {}) } } };
}

/**
 * What the box scores say each side scored: a side's own scorers' total and the other side's goalkeepers' goals
 * against, whichever were tracked (0, 1 or 2 numbers per side).
 */
export function boxGoals(game: Pick<Game, 'provenance'>): { home: number[]; away: number[] } {
  const b = game.provenance.boxScore;
  const pick = (own: BoxSide | undefined, other: BoxSide | undefined): number[] =>
    [own?.goals, other?.goalsAgainst].filter((n): n is number => n !== undefined);
  return { home: pick(b?.home, b?.away), away: pick(b?.away, b?.home) };
}

/** The most overtime minutes either side's goalkeepers played, per the box scores; 0 when none tracked it. */
export function boxOvertimeMinutes(game: Pick<Game, 'provenance'>): number {
  const b = game.provenance.boxScore;
  return Math.max(b?.home?.overtimeMinutes ?? 0, b?.away?.overtimeMinutes ?? 0);
}
