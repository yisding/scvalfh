/**
 * Turning `snapshot.playoffs` into rounds a bracket can render — pure, and deliberately cautious.
 *
 * WHAT THE SNAPSHOT ACTUALLY CARRIES. `playoffs.games` is a plain `Game[]`: no seed numbers, and
 * no CCS division label (`Game.leagueDivision` is a LEAGUE division, which is meaningless for a
 * CCS bracket whose field holds SCVAL, BVAL and PCAL teams). The CCS's own two divisions are
 * `format.ccsDivisions` and are always called "CCS Division 1" / "CCS Division 2" in copy, never a
 * bare "Division 1" that could be read as a league division. So:
 *
 *  - **Rounds come from dates**, matched against the three published `keyDates`. Any other date
 *    becomes its own round named by that date rather than being forced into a named round.
 *  - **The two 8-team divisions are recovered structurally, not guessed.** A single-elimination
 *    bracket is a tree, so two independent divisions are two connected components once games are
 *    joined on the teams they share. If the games split cleanly into two components we render two
 *    brackets; if they do not (an unplayed slot with no named teams, or an unexpected shape) we
 *    render ONE bracket and say so, rather than assigning a division we cannot prove.
 *  - **Seeds are never invented.** `BracketGame.seeds` exists because a seed is information before
 *    a score (DESIGN §7.11), but nothing upstream publishes one yet, so both values are `null` and
 *    the card prints no seed at all.
 *
 * None of this can run against real data today: the 2026 CCS bracket is unpublished
 * (`bracketPublished === false`) and `playoffs.games` is empty, which is exactly why /playoffs
 * shows no skeleton bracket before seeding.
 */

import { isoDateKey, shortDate } from '../../lib/format';
import type { CcsPlayoffs, Game, GameSide } from '../../lib/types';

export type RoundKey = 'quarterfinals' | 'semifinals' | 'finals' | 'other';

export interface BracketGame {
  game: Game;
  /** Always `{ home: null, away: null }` today — no source publishes CCS seeds. */
  seeds: { home: number | null; away: number | null };
}

export interface BracketRound {
  key: RoundKey;
  /** 'Quarterfinals' | 'Semifinals' | 'Final' | 'Sat Nov 21' */
  name: string;
  dateKey: string;
  /** 'Sat Nov 7' */
  dateLabel: string;
  games: BracketGame[];
}

export interface BracketPath {
  id: string;
  /** 'CCS bracket' when the games do not split, 'Bracket 1' / 'Bracket 2' when they do. */
  name: string;
  rounds: BracketRound[];
}

const PLACEHOLDER = /^(tbd|tba|to be determined|winner|loser)\b/i;

/** true when a side names a real school rather than an unfilled slot. */
export function isNamedSide(side: GameSide): boolean {
  const name = side.name.trim();
  return name.length > 0 && !PLACEHOLDER.test(name);
}

/** The identity a game is joined on: our slug, the MaxPreps id, or the printed name. */
function participantKeys(game: Game): string[] {
  return [game.home, game.away]
    .filter(isNamedSide)
    .map((side) => side.slug ?? side.teamId ?? side.name.trim().toLowerCase());
}

export function roundKeyFor(dateKey: string, keyDates: CcsPlayoffs['keyDates']): RoundKey {
  if (dateKey === isoDateKey(keyDates.quarterfinals)) return 'quarterfinals';
  if (dateKey === isoDateKey(keyDates.semifinals)) return 'semifinals';
  if (dateKey === isoDateKey(keyDates.finals)) return 'finals';
  return 'other';
}

export const ROUND_NAMES: Record<Exclude<RoundKey, 'other'>, string> = {
  quarterfinals: 'Quarterfinals',
  semifinals: 'Semifinals',
  finals: 'Final',
};

function roundName(key: RoundKey, dateLabel: string): string {
  return key === 'other' ? dateLabel : ROUND_NAMES[key];
}

/**
 * Split games into connected components over the teams they share. Returns `null` when the split
 * cannot be trusted — any game with no identifiable team, or more components than the CCS field
 * has divisions — and the caller then renders a single bracket.
 */
function splitByParticipants(games: Game[], maxGroups: number): Game[][] | null {
  const parent = new Map<string, string>();
  const find = (key: string): string => {
    let root = parent.get(key) ?? key;
    while (root !== (parent.get(root) ?? root)) root = parent.get(root) ?? root;
    parent.set(key, root);
    return root;
  };
  const union = (a: string, b: string) => {
    const [ra, rb] = [find(a), find(b)];
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const game of games) {
    const keys = participantKeys(game);
    if (keys.length === 0) return null;
    for (const key of keys) if (!parent.has(key)) parent.set(key, key);
    for (const key of keys.slice(1)) union(keys[0], key);
  }

  const groups = new Map<string, Game[]>();
  for (const game of games) {
    const root = find(participantKeys(game)[0]);
    const list = groups.get(root);
    if (list) list.push(game);
    else groups.set(root, [game]);
  }
  if (groups.size > maxGroups) return null;
  return [...groups.values()];
}

function buildRounds(games: Game[], keyDates: CcsPlayoffs['keyDates']): BracketRound[] {
  const byDate = new Map<string, Game[]>();
  for (const game of games) {
    const list = byDate.get(game.dateKey);
    if (list) list.push(game);
    else byDate.set(game.dateKey, [game]);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, roundGames]) => {
      const key = roundKeyFor(dateKey, keyDates);
      const dateLabel = shortDate(dateKey);
      return {
        key,
        name: roundName(key, dateLabel),
        dateKey,
        dateLabel,
        games: roundGames
          .slice()
          .sort((a, b) => a.dateLocal.localeCompare(b.dateLocal) ||
            a.contestId.localeCompare(b.contestId))
          .map((game) => ({ game, seeds: { home: null, away: null } })),
      };
    });
}

function earliest(games: Game[]): string {
  return games.reduce((min, g) => (g.dateLocal < min ? g.dateLocal : min), games[0].dateLocal);
}

/**
 * The CCS's two eight-team divisions as copy: 'CCS Division 1 (seeds 1-8)'. Always prefixed with
 * "CCS" so it can never be read as a league division.
 */
export function ccsDivisionLabels(playoffs: Pick<CcsPlayoffs, 'format'>): string[] {
  return playoffs.format.ccsDivisions.map((d) => `CCS ${d.name} (seeds ${d.seeds[0]}-${d.seeds[1]})`);
}

/** Every bracket the snapshot can support, in a stable order. Empty when nothing is published. */
export function buildBrackets(playoffs: CcsPlayoffs): BracketPath[] {
  const games = playoffs.games;
  if (games.length === 0) return [];
  const divisions = playoffs.format.ccsDivisions.length;
  const groups = splitByParticipants(games, divisions) ?? [games];
  const ordered = groups
    .slice()
    .sort(
      (a, b) =>
        earliest(a).localeCompare(earliest(b)) ||
        b.length - a.length ||
        a[0].contestId.localeCompare(b[0].contestId),
    );
  return ordered.map((group, index) => ({
    id: `bracket-${index + 1}`,
    name: ordered.length === 1 ? 'CCS bracket' : `Bracket ${index + 1}`,
    rounds: buildRounds(group, playoffs.keyDates),
  }));
}

export interface PendingRound {
  key: RoundKey;
  name: string;
  dateKey: string;
  dateLabel: string;
}

/** The published rounds that have no games in the snapshot yet — printed as a sentence, not a box. */
export function pendingRounds(playoffs: CcsPlayoffs, paths: BracketPath[]): PendingRound[] {
  const present = new Set(paths.flatMap((p) => p.rounds.map((r) => r.key)));
  const rounds: Array<[Exclude<RoundKey, 'other'>, string]> = [
    ['quarterfinals', playoffs.keyDates.quarterfinals],
    ['semifinals', playoffs.keyDates.semifinals],
    ['finals', playoffs.keyDates.finals],
  ];
  return rounds
    .filter(([key]) => !present.has(key))
    .map(([key, iso]) => ({
      key,
      name: ROUND_NAMES[key],
      dateKey: isoDateKey(iso),
      dateLabel: shortDate(iso),
    }));
}
