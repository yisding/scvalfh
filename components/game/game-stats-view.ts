/**
 * The game page's Game stats section (SPEC §1.1k): each followed side's box score for this game, as
 * its coach entered it on MaxPreps (`TeamPlayerStats.games` in data/player-stats.json, read by
 * scripts/fetch-player-stats.ts). Pure, so tests/ui/game-stats-view.test.ts can assert it over the
 * real file and over synthetic box scores.
 *
 * Shown only for a final where at least one side's coach entered something. Away first, like the
 * scoreboard; a side outside the teams this site follows has no box score to read and is not
 * listed, and a followed side whose coach entered nothing for the game says so in one line.
 *
 * Per side, two tables of the team page's shape (components/teams/TeamPlayerStats.tsx StatsTable):
 *   - Scoring: goals, assists, shots, shots on goal and steals, only the ones this game's entries
 *     track, and only the players with at least one of them above zero, most goals first;
 *   - Goalkeeping: saves, goals against, opponent shots on goal and minutes, the tracked ones, for
 *     every goalkeeper with a number in any of them.
 * Points (2 per goal, 1 per assist) and game-winning goals are left out: in one game they repeat
 * the goals beside them. A tracked stat a player has no number for prints as a dash, never as 0.
 *
 * The entries are the coach's, not the score's: where the goals they credit do not add up to the
 * side's score on the board, a note under the side's tables says so, and the score stays the
 * site's (a forfeit's score is not a game's goals, so no note is made there).
 */

import { getBoxScore } from '../../lib/player-stats';
import type { BoxScore, FieldStatKey, GoalieStatKey } from '../../lib/player-stats-schema';
import { plural } from '../../lib/format';
import type { TeamSlug } from '../../lib/types';
import type { StatColumn, StatRow, StatTable } from '../teams/player-stats-view';
import type { GameModel, GameSideModel } from './game-view';

/** The field stats a box score can show, in column order. */
const FIELD_COLUMNS: Array<StatColumn & { key: FieldStatKey }> = [
  { key: 'goals', label: 'G', title: 'Goals' },
  { key: 'assists', label: 'A', title: 'Assists' },
  { key: 'shots', label: 'Sh', title: 'Shots' },
  { key: 'shotsOnGoal', label: 'SOG', title: 'Shots on goal' },
  { key: 'steals', label: 'Stl', title: 'Steals' },
];

/** The goalkeeping stats a box score can show, in column order. */
const GOALIE_COLUMNS: Array<StatColumn & { key: GoalieStatKey }> = [
  { key: 'saves', label: 'Sv', title: 'Saves' },
  { key: 'goalsAgainst', label: 'GA', title: 'Goals against' },
  { key: 'opponentShotsOnGoal', label: 'SA', title: 'Shots on goal against' },
  { key: 'minutes', label: 'Min', title: 'Minutes' },
];

export interface GameStatsSide {
  key: string;
  /** The display name, as the page prints it. */
  name: string;
  /** null when the coach entered nothing for this game. */
  scoring: StatTable | null;
  goalies: StatTable | null;
  /** The coach entered stats for this game (some table may still be empty). */
  entered: boolean;
  /** Where the entries and the score disagree, in a sentence; otherwise empty. */
  notes: string[];
}

export interface GameStatsView {
  sides: GameStatsSide[];
  /** "G goals", "Sv saves" … for every column any side shows. */
  legend: string[];
}

function scoringTable(box: BoxScore): StatTable | null {
  const tracked = new Set<string>(box.tracked.field);
  const columns = FIELD_COLUMNS.filter((c) => tracked.has(c.key));
  if (!columns.length) return null;
  const rows: StatRow[] = box.players
    .map((p, i) => ({ p, i, values: columns.map((c) => p.field?.[c.key] ?? null) }))
    .filter(({ values }) => values.some((v) => v !== null && v > 0))
    .sort((a, b) => {
      // Most goals, then assists, then the rest of the columns in order; MaxPreps' order breaks ties.
      for (let c = 0; c < columns.length; c += 1) {
        const d = (b.values[c] ?? 0) - (a.values[c] ?? 0);
        if (d !== 0) return d;
      }
      return a.i - b.i;
    })
    .map(({ p, i, values }) => ({ key: `${i}`, name: p.name, jersey: p.jersey, values, noted: false }));
  return rows.length ? { columns, rows } : null;
}

function goalieTable(box: BoxScore): StatTable | null {
  const tracked = new Set<string>(box.tracked.goalkeeping);
  const columns = GOALIE_COLUMNS.filter((c) => tracked.has(c.key));
  if (!columns.length) return null;
  const rows: StatRow[] = box.players
    .map((p, i) => ({ p, i, values: columns.map((c) => p.goalkeeping?.[c.key] ?? null) }))
    .filter(({ values }) => values.some((v) => v !== null))
    .map(({ p, i, values }) => ({ key: `${i}`, name: p.name, jersey: p.jersey, values, noted: false }));
  return rows.length ? { columns, rows } : null;
}

/** The note under a side whose entered goals are not its score, or null. */
function goalsNote(name: string, box: BoxScore, score: number | null): string | null {
  if (score === null) return null;
  const credited = box.players.reduce((n, p) => n + (p.field?.goals ?? 0), 0);
  if (credited === score) return null;
  const its = score === 1 ? 'its goal' : `its ${score} goals`;
  if (credited === 0) return `${name}'s entries name no scorer for ${its}.`;
  if (credited < score) return `${name}'s entries credit ${credited} of ${its} to a player.`;
  return `${name}'s entries credit ${plural(credited, 'goal')}, more than the ${score} on the scoreboard.`;
}

/** Where a side's box score comes from: data/player-stats.json, or a test's own. */
export type BoxScoreLookup = (contestId: string, slug: TeamSlug) => BoxScore | undefined;

function sideView(
  model: GameModel,
  side: GameSideModel,
  which: 'home' | 'away',
  lookup: BoxScoreLookup,
): GameStatsSide | null {
  if (!side.team) return null;
  const box = lookup(model.game.contestId, side.team.slug);
  const base = { key: side.team.slug, name: side.name };
  if (!box) return { ...base, scoring: null, goalies: null, entered: false, notes: [] };
  const note = model.game.forfeitBy ? null : goalsNote(side.name, box, model.game[which].score);
  return {
    ...base,
    scoring: scoringTable(box),
    goalies: goalieTable(box),
    entered: true,
    notes: note ? [note] : [],
  };
}

/** The section's model, or null when there is nothing to show: not a final, or no side's entries. */
export function buildGameStatsView(model: GameModel, lookup: BoxScoreLookup = getBoxScore): GameStatsView | null {
  if (model.game.status !== 'final') return null;
  const sides = [sideView(model, model.away, 'away', lookup), sideView(model, model.home, 'home', lookup)].filter(
    (s): s is GameStatsSide => s !== null,
  );
  if (!sides.some((s) => s.entered)) return null;
  const shown = new Set(sides.flatMap((s) => [...(s.scoring?.columns ?? []), ...(s.goalies?.columns ?? [])]).map((c) => c.label));
  const legend = [...FIELD_COLUMNS, ...GOALIE_COLUMNS]
    .filter((c) => shown.has(c.label))
    .map((c) => `${c.label} ${c.title.toLowerCase()}`);
  return { sides, legend };
}
