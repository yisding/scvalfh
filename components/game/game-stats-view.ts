/**
 * The game page's Game stats section (SPEC §1.1k): each followed side's box score for this game, as
 * its coach entered it on MaxPreps (`TeamPlayerStats.games` in data/player-stats.json, read by
 * scripts/fetch-player-stats.ts). Pure, so tests/ui/game-stats-view.test.ts can assert it over the
 * real file and over synthetic box scores.
 *
 * Shown only for a final where at least one side's entries give a table to show (a box score can
 * list a lineup and nothing else). Away first, like the scoreboard; a side outside the teams this
 * site follows has no box score to read and is not listed, and a followed side with nothing to show
 * says why in one line: its coach entered nothing for the game, or its stats could not be read
 * (lib/player-stats.ts getGameStatsEntry), which is never passed off as nothing entered.
 *
 * Per side, two tables of the team page's shape (components/teams/TeamPlayerStats.tsx StatsTable):
 *   - Scoring: goals, assists, shots, shots on goal and steals, only the ones this game's entries
 *     track, and only the players with at least one of them above zero, most goals first;
 *   - Goalkeeping: saves, goals against, opponent shots on goal and minutes, the tracked ones, for
 *     every player in MaxPreps' goalkeeping table with a number in any of them, longest in goal
 *     first (the team page's order: coaches list field players there too, with a save each).
 * Points (2 per goal, 1 per assist) and game-winning goals are left out: in one game they repeat
 * the goals beside them. A tracked stat a player has no number for prints as a dash, never as 0.
 *
 * The entries are the coach's, not the score's: where the goals they credit do not add up to the
 * side's score on the board, a note under the side's tables says so, and the score stays the
 * site's. Two kinds of game get no such note. A forfeit's score is not a game's goals. And a game
 * whose score may leave out or include a tiebreak (a shootout decider, an overtime count the
 * section's rules rule out, an MCAL tournament game whose shootout MaxPreps may record as goals)
 * gets one sentence for the section instead, which says the two need not agree without saying a
 * shootout was played (the San Diego Section's are inferred, never asserted: lib/leagues.ts).
 *
 * Game notes. Some coaches write goals, assists and saves in MaxPreps' note for the game instead
 * (Homestead's "goals scored Gabby Molly, Emry Borges"). The game page adds what the team page adds,
 * exactly: the credits lib/note-stats.ts keeps after its guards (a name on one roster only, no more
 * goals or assists than the side scored, nothing the coach also entered for the game, nothing that
 * cannot be checked, and no noted goal at all for a team whose entries and notes together pass its
 * goals scored). Each is added to the player's line in the box score, or to a line of its own (a side
 * with no box score can have a table from its note alone), the row is marked, and the section quotes
 * the note under the tables, so a reader can tell the two sources apart.
 */

import { getGameStatsEntry, type GameStatsEntry } from '../../lib/player-stats';
import type { NoteCredit } from '../../lib/note-stats';
import type { BoxScore, BoxScoreLine, FieldStatKey, GoalieStatKey } from '../../lib/player-stats-schema';
import { SHOOTOUT_NOTE } from '../../lib/postseason';
import type { TeamSlug } from '../../lib/types';
import type { StatColumn, StatRow, StatTable } from '../teams/player-stats-view';
import { overtimeInDoubt } from '../ui/describe-game';
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

/** The sentence a section gets when the score may leave out or include a tiebreak. */
export const TIEBREAK_CAVEAT =
  'This game’s score may leave out or include how a tie was broken, so the goals entered here need not add up to it.';

/** Under a side whose table is from the game note alone because its box score could not be read. */
export const UNREAD_WITH_NOTE =
  'The coach’s entries for this game could not be read in the latest update, so only what the game note adds is shown.';

export interface GameStatsSide {
  key: string;
  /** The display name, as the page prints it. */
  name: string;
  scoring: StatTable | null;
  goalies: StatTable | null;
  /** Why there is no table, when there is none; null when there is one. */
  empty: string | null;
  /** Where the entries and the score disagree, in a sentence; otherwise empty. */
  notes: string[];
}

export interface GameStatsView {
  sides: GameStatsSide[];
  /** The game's note as published, when it added to a shown side's numbers (the rows marked); else null. */
  notedFrom: string | null;
  /** TIEBREAK_CAVEAT, on a game whose score may not count the goals as entered; else null. */
  caveat: string | null;
  /** "G goals", "Sv saves" … for every column any side shows. */
  legend: string[];
}

/** Where a side's entries come from: data/player-stats.json, or a test's own. */
export type GameStatsLookup = (contestId: string, slug: TeamSlug) => GameStatsEntry;

/** A box score line, with whether a game note added to it. */
type Line = BoxScoreLine & { noted: boolean };
/** A side's box score with its note credits added: what the tables are built from. */
interface Entries {
  tracked: BoxScore['tracked'];
  players: Line[];
}

const lastWord = (name: string) => name.trim().split(/\s+/).pop()!.toLowerCase();

/**
 * `box` (if any) with `credits` added: a credit goes to the line the roster join named for the same
 * player (or, for a line under the sheet's short name, the same jersey and last name), else to a
 * line of its own. null when there is neither.
 */
function withCredits(box: BoxScore | undefined, credits: readonly NoteCredit[]): Entries | null {
  if (!box && !credits.length) return null;
  const field = new Set<FieldStatKey>(box?.tracked.field ?? []);
  const goalie = new Set<GoalieStatKey>(box?.tracked.goalkeeping ?? []);
  const players: Line[] = (box?.players ?? []).map((p) => ({
    ...p,
    field: p.field ? { ...p.field } : null,
    goalkeeping: p.goalkeeping ? { ...p.goalkeeping } : null,
    noted: false,
  }));
  for (const c of credits) {
    let line = players.find(
      (p) =>
        p.name === c.fullName ||
        (c.jersey !== null && p.jersey === c.jersey && lastWord(p.name) === lastWord(c.fullName)),
    );
    if (!line) {
      line = { name: c.fullName, jersey: c.jersey, field: null, goalkeeping: null, noted: false };
      players.push(line);
    }
    for (const kind of ['goals', 'assists'] as const) {
      if (c[kind] === 0) continue;
      field.add(kind);
      line.field = { ...line.field, [kind]: (line.field?.[kind] ?? 0) + c[kind] };
      line.noted = true;
    }
    if (c.saves > 0) {
      goalie.add('saves');
      line.goalkeeping = { ...line.goalkeeping, saves: (line.goalkeeping?.saves ?? 0) + c.saves };
      line.noted = true;
    }
  }
  return { tracked: { field: [...field], goalkeeping: [...goalie] }, players };
}

function scoringTable(box: Entries): StatTable | null {
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
    .map(({ p, i, values }) => ({ key: `${i}`, name: p.name, jersey: p.jersey, values, noted: p.noted }));
  return rows.length ? { columns, rows } : null;
}

/** Longest in goal first: minutes, then saves, then goals against (the team page's byTimeInGoal). */
function byTimeInGoal(a: BoxScoreLine, b: BoxScoreLine): number {
  const n = (p: BoxScoreLine, k: GoalieStatKey) => p.goalkeeping?.[k] ?? -1;
  return n(b, 'minutes') - n(a, 'minutes') || n(b, 'saves') - n(a, 'saves') || n(b, 'goalsAgainst') - n(a, 'goalsAgainst');
}

function goalieTable(box: Entries): StatTable | null {
  const tracked = new Set<string>(box.tracked.goalkeeping);
  const columns = GOALIE_COLUMNS.filter((c) => tracked.has(c.key));
  if (!columns.length) return null;
  const rows: StatRow[] = box.players
    .map((p, i) => ({ p, i, values: columns.map((c) => p.goalkeeping?.[c.key] ?? null) }))
    .filter(({ values }) => values.some((v) => v !== null))
    .sort((a, b) => byTimeInGoal(a.p, b.p) || a.i - b.i)
    .map(({ p, i, values }) => ({ key: `${i}`, name: p.name, jersey: p.jersey, values, noted: p.noted }));
  return rows.length ? { columns, rows } : null;
}

/** The note under a side whose entered goals are not its score, or null. */
function goalsNote(box: Entries, score: number | null): string | null {
  if (score === null) return null;
  const credited = box.players.reduce((n, p) => n + (p.field?.goals ?? 0), 0);
  if (credited === score) return null;
  const goals = score === 1 ? 'the goal' : `the ${score} goals`;
  if (credited === 0) return `No scorer is entered for ${goals}.`;
  if (credited < score) return `Scorers are entered for ${credited} of ${goals}.`;
  return `The entries credit ${credited} goals, more than the ${score} on the scoreboard.`;
}

/** A game whose score may leave out or include a tiebreak (see the header). */
function tiebreakInDoubt(model: GameModel): boolean {
  return model.game.decider === 'SO' || overtimeInDoubt(model.game) || model.postseasonNotes.includes(SHOOTOUT_NOTE);
}

function sideView(
  model: GameModel,
  side: GameSideModel,
  which: 'home' | 'away',
  lookup: GameStatsLookup,
  caveat: boolean,
): GameStatsSide | null {
  if (!side.team) return null;
  const { box: entered, unread, credits } = lookup(model.game.contestId, side.team.slug);
  const box = withCredits(entered, credits);
  const base = { key: side.team.slug, name: side.name };
  if (!box) {
    return {
      ...base,
      scoring: null,
      goalies: null,
      empty: unread
        ? 'Stats for this game could not be read in the latest update.'
        : 'No stats entered on MaxPreps for this game.',
      notes: [],
    };
  }
  const scoring = scoringTable(box);
  const goalies = goalieTable(box);
  if (!scoring && !goalies) {
    return { ...base, scoring, goalies, empty: 'No goals, assists or saves entered for this game.', notes: [] };
  }
  // A table from the note alone, for a side whose box score could not be read, says so: it is not
  // all the coach may have entered, so no goals note is worked out from it either.
  if (!entered && unread) {
    return { ...base, scoring, goalies, empty: null, notes: [UNREAD_WITH_NOTE] };
  }
  const note = model.game.forfeitBy || caveat ? null : goalsNote(box, model.game[which].score);
  return { ...base, scoring, goalies, empty: null, notes: note ? [note] : [] };
}

/** The section's model, or null when there is nothing to show: not a final, or no table on either side. */
export function buildGameStatsView(model: GameModel, lookup: GameStatsLookup = getGameStatsEntry): GameStatsView | null {
  if (model.game.status !== 'final') return null;
  const caveat = tiebreakInDoubt(model);
  const sides = [
    sideView(model, model.away, 'away', lookup, caveat),
    sideView(model, model.home, 'home', lookup, caveat),
  ].filter((s): s is GameStatsSide => s !== null);
  if (!sides.some((s) => s.scoring || s.goalies)) return null;
  const marked = sides.some((s) => [...(s.scoring?.rows ?? []), ...(s.goalies?.rows ?? [])].some((r) => r.noted));
  const shown = new Set(sides.flatMap((s) => [...(s.scoring?.columns ?? []), ...(s.goalies?.columns ?? [])]).map((c) => c.label));
  const legend = [...FIELD_COLUMNS, ...GOALIE_COLUMNS]
    .filter((c) => shown.has(c.label))
    .map((c) => `${c.label} ${c.title.toLowerCase()}`);
  return {
    sides,
    notedFrom: marked ? model.game.venue.text : null,
    caveat: caveat ? TIEBREAK_CAVEAT : null,
    legend,
  };
}
