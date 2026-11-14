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
 * (lib/players/player-stats.ts getGameStatsEntry), which is never passed off as nothing entered.
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
 * shootout was played (the San Diego Section's are inferred, never asserted: lib/league-config/sections.ts).
 *
 * Game notes. Some coaches write goals, assists and saves in MaxPreps' note for the game instead
 * (Homestead's "goals scored Gabby Molly, Emry Borges"). The game page adds what the team page adds,
 * exactly: the credits lib/players/note-stats.ts keeps after its guards (a name on one roster only, no more
 * goals or assists than the side scored, nothing the coach also entered for the game, nothing that
 * cannot be checked, and no noted goal at all for a team whose entries and notes together pass its
 * goals scored). Each is added to the player's line in the box score, or to a line of its own (a side
 * with no box score can have a table from its note alone), the row is marked, and the section quotes
 * the note under the tables, so a reader can tell the two sources apart.
 */

import { getGameStatsEntry, type GameStatsEntry } from '../../lib/players/player-stats';
import type { NoteCredit } from '../../lib/players/note-stats';
import type { BoxScore, BoxScoreLine, FieldStatKey, GoalieStatKey } from '../../lib/players/player-stats-schema';
import { SHOOTOUT_NOTE } from '../../lib/postseason/postseason';
import { SPORT } from '../../lib/sports/current';
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

/** Whether this build's box score is basketball's (`Sport.stats.model`): two tables per side, no goalkeepers. */
const BASKETBALL = SPORT.stats.model === 'basketball';
/** Whether it is volleyball's: two tables per side too (attacking and serving; blocks, digs, assists, receptions). */
const VOLLEYBALL = SPORT.stats.model === 'volleyball';
/** A sport whose box score is one line per player in two tables. */
const LINE_BOX = BASKETBALL || VOLLEYBALL;

export interface GameStatsSide {
  key: string;
  /** The display name, as the page prints it. */
  name: string;
  scoring: StatTable | null;
  /** The side's second table: goalkeeping, or in basketball rebounds, assists and the rest. */
  goalies: StatTable | null;
  /** What the first table is, for its caption: 'scoring' unless given (volleyball: 'attacking and serving'). */
  firstCaption?: string;
  /** What the second table is, for its caption: 'goalkeeping' unless given ('rebounds, assists and defense'). */
  secondCaption?: string;
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

/** A box score line, with whether a game note added to its field stats and to its goalkeeping. */
type Line = BoxScoreLine & { noted: { field: boolean; goalkeeping: boolean } };
/** A side's box score with its note credits added: what the tables are built from. */
interface Entries {
  tracked: BoxScore['tracked'];
  players: Line[];
}

const lastWord = (name: string) => name.trim().split(/\s+/).pop()!.toLowerCase();
/** "E. Borges": the stats sheet's short form, which a line keeps when the roster join missed. */
const SHORT_NAME = /^(\p{L})\.\s/u;

/** The line is the credited player: the roster's name, or the sheet's short form of it on the same jersey. */
function samePlayer(line: BoxScoreLine, c: NoteCredit): boolean {
  if (line.name === c.fullName) return true;
  const initial = SHORT_NAME.exec(line.name)?.[1];
  return (
    initial !== undefined &&
    c.jersey !== null &&
    line.jersey === c.jersey &&
    initial.toLowerCase() === c.fullName.trim()[0]?.toLowerCase() &&
    lastWord(line.name) === lastWord(c.fullName)
  );
}

/**
 * `box` (if any) with `credits` added: a credit goes to the credited player's line (samePlayer),
 * else to a line of its own. null when there is neither.
 */
function withCredits(box: BoxScore | undefined, credits: readonly NoteCredit[]): Entries | null {
  if (!box && !credits.length) return null;
  const field = new Set<FieldStatKey>(box?.tracked.field ?? []);
  const goalie = new Set<GoalieStatKey>(box?.tracked.goalkeeping ?? []);
  const players: Line[] = (box?.players ?? []).map((p) => ({
    ...p,
    field: p.field ? { ...p.field } : null,
    goalkeeping: p.goalkeeping ? { ...p.goalkeeping } : null,
    noted: { field: false, goalkeeping: false },
  }));
  for (const c of credits) {
    let line = players.find((p) => samePlayer(p, c));
    if (!line) {
      line = {
        name: c.fullName,
        jersey: c.jersey,
        field: null,
        goalkeeping: null,
        noted: { field: false, goalkeeping: false },
      };
      players.push(line);
    }
    for (const kind of ['goals', 'assists'] as const) {
      if (c[kind] === 0) continue;
      field.add(kind);
      line.field = { ...line.field, [kind]: (line.field?.[kind] ?? 0) + c[kind] };
      line.noted.field = true;
    }
    if (c.saves > 0) {
      goalie.add('saves');
      line.goalkeeping = { ...line.goalkeeping, saves: (line.goalkeeping?.saves ?? 0) + c.saves };
      line.noted.goalkeeping = true;
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
    .map(({ p, i, values }) => ({ key: `${i}`, name: p.name, jersey: p.jersey, values, noted: p.noted.field }));
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
    .map(({ p, i, values }) => ({ key: `${i}`, name: p.name, jersey: p.jersey, values, noted: p.noted.goalkeeping }));
  return rows.length ? { columns, rows } : null;
}

// ---------------------------------------------------------------- basketball

type BoxLine = Record<string, number | undefined>;
interface BasketballBoxColumn extends StatColumn {
  needs: readonly string[];
  /** The number the rows are sorted and kept on. */
  value: (f: BoxLine) => number | null;
  /** The cell: a count, or made-attempted ('3-6'). */
  text: (f: BoxLine) => string | null;
}
const boxCount = (key: string): Pick<BasketballBoxColumn, 'needs' | 'value' | 'text'> => ({
  needs: [key],
  value: (f) => f[key] ?? null,
  text: (f) => (f[key] === undefined ? null : String(Math.round(f[key]))),
});
const madeOf = (made: string, attempts: string): Pick<BasketballBoxColumn, 'needs' | 'value' | 'text'> => ({
  needs: [made, attempts],
  value: (f) => f[made] ?? null,
  text: (f) => (f[made] === undefined || f[attempts] === undefined ? null : `${f[made]}-${f[attempts]}`),
});
/** Basketball's box score, two tables of at most five columns each (320px, DESIGN §10.8). */
const BASKETBALL_SCORING: readonly BasketballBoxColumn[] = [
  { key: 'points', label: 'PTS', title: 'Points', ...boxCount('points') },
  { key: 'fieldGoals', label: 'FG', title: 'Field goals made-attempted', ...madeOf('fieldGoalsMade', 'fieldGoalAttempts') },
  { key: 'threePointers', label: '3PT', title: 'Three-pointers made-attempted', ...madeOf('threePointsMade', 'threePointAttempts') },
  { key: 'freeThrows', label: 'FT', title: 'Free throws made-attempted', ...madeOf('freeThrowsMade', 'freeThrowAttempts') },
  { key: 'personalFouls', label: 'PF', title: 'Personal fouls', ...boxCount('personalFouls') },
];
const BASKETBALL_MORE: readonly BasketballBoxColumn[] = [
  { key: 'rebounds', label: 'REB', title: 'Rebounds', ...boxCount('rebounds') },
  { key: 'assists', label: 'AST', title: 'Assists', ...boxCount('assists') },
  { key: 'steals', label: 'STL', title: 'Steals', ...boxCount('steals') },
  { key: 'blocks', label: 'BLK', title: 'Blocks', ...boxCount('blocks') },
  { key: 'turnovers', label: 'TO', title: 'Turnovers', ...boxCount('turnovers') },
];

/** Volleyball's box score, two tables of five columns each. */
const VOLLEYBALL_ATTACK: readonly BasketballBoxColumn[] = [
  { key: 'kills', label: 'K', title: 'Kills', ...boxCount('kills') },
  { key: 'attackErrors', label: 'E', title: 'Attack errors', ...boxCount('attackErrors') },
  { key: 'attackAttempts', label: 'TA', title: 'Attack attempts', ...boxCount('attackAttempts') },
  { key: 'aces', label: 'A', title: 'Aces', ...boxCount('aces') },
  { key: 'serveErrors', label: 'SE', title: 'Serve errors', ...boxCount('serveErrors') },
];
const VOLLEYBALL_MORE: readonly BasketballBoxColumn[] = [
  { key: 'soloBlocks', label: 'BS', title: 'Solo blocks', ...boxCount('soloBlocks') },
  { key: 'blockAssists', label: 'BA', title: 'Block assists', ...boxCount('blockAssists') },
  { key: 'digs', label: 'D', title: 'Digs', ...boxCount('digs') },
  { key: 'assists', label: 'Ast', title: 'Assists', ...boxCount('assists') },
  { key: 'receptions', label: 'R', title: 'Serve receptions', ...boxCount('receptions') },
];
/** The build's two box tables, the second one's caption, and the stats a side's rows are ordered on. */
const LINE_FIRST = VOLLEYBALL ? VOLLEYBALL_ATTACK : BASKETBALL_SCORING;
const LINE_SECOND = VOLLEYBALL ? VOLLEYBALL_MORE : BASKETBALL_MORE;
const LINE_SECOND_CAPTION = VOLLEYBALL ? 'blocks, digs, assists and serve receive' : 'rebounds, assists and defense';
const LINE_ORDER: readonly [string, string, string] = VOLLEYBALL ? ['kills', 'digs', 'assists'] : ['points', 'rebounds', 'assists'];

/**
 * One of a side's basketball (or volleyball) tables: every player the coach entered a line for, most points first (then
 * rebounds, assists, MaxPreps' order), the same order in both tables. Unlike a goals sport's scoring table,
 * a player with a line of zeros stays: they played, and a 0-for-4 night is part of the box score.
 */
function basketballTable(box: Entries, spec: readonly BasketballBoxColumn[]): StatTable | null {
  const tracked = new Set<string>(box.tracked.field);
  const columns = spec.filter((c) => c.needs.every((k) => tracked.has(k)));
  if (!columns.length) return null;
  const n = (p: Line, k: string) => (p.field as BoxLine | null)?.[k] ?? -1;
  const rows: StatRow[] = box.players
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.field !== null && Object.keys(p.field).length > 0)
    .sort((a, b) => n(b.p, LINE_ORDER[0]) - n(a.p, LINE_ORDER[0]) || n(b.p, LINE_ORDER[1]) - n(a.p, LINE_ORDER[1]) || n(b.p, LINE_ORDER[2]) - n(a.p, LINE_ORDER[2]) || a.i - b.i)
    .map(({ p, i }) => ({
      key: `${i}`,
      name: p.name,
      jersey: p.jersey,
      values: columns.map((c) => c.value(p.field as BoxLine)),
      texts: columns.map((c) => c.text(p.field as BoxLine)),
      noted: false,
    }));
  return rows.length ? { columns: columns.map(({ key, label, title }) => ({ key, label, title })), rows } : null;
}

/** The note under a basketball side whose entered points are not its score, or null. */
function pointsNote(box: Entries, score: number | null): string | null {
  if (score === null || !box.tracked.field.includes('points' as FieldStatKey)) return null;
  const credited = box.players.reduce((sum, p) => sum + ((p.field as BoxLine | null)?.points ?? 0), 0);
  if (credited === score) return null;
  return credited < score
    ? `The entries add up to ${credited} of the ${score} points on the scoreboard.`
    : `The entries add up to ${credited} points, more than the ${score} on the scoreboard.`;
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
  if (LINE_BOX) {
    const scoring = basketballTable(box, LINE_FIRST);
    const more = basketballTable(box, LINE_SECOND);
    const second = { goalies: more, secondCaption: LINE_SECOND_CAPTION, ...(VOLLEYBALL ? { firstCaption: 'attacking and serving' } : {}) };
    if (!scoring && !more) return { ...base, scoring, ...second, empty: 'No stats entered on MaxPreps for this game.', notes: [] };
    // Basketball's entered points are its score; a volleyball score is sets won, which no entry adds up to.
    const note = model.game.forfeitBy || !BASKETBALL ? null : pointsNote(box, model.game[which].score);
    return { ...base, scoring, ...second, empty: null, notes: note ? [note] : [] };
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
  // Basketball's score is its points, overtime included, and volleyball's its sets: no tiebreak sits outside either.
  const caveat = !LINE_BOX && tiebreakInDoubt(model);
  const sides = [
    sideView(model, model.away, 'away', lookup, caveat),
    sideView(model, model.home, 'home', lookup, caveat),
  ].filter((s): s is GameStatsSide => s !== null);
  if (!sides.some((s) => s.scoring || s.goalies)) return null;
  const marked = sides.some((s) => [...(s.scoring?.rows ?? []), ...(s.goalies?.rows ?? [])].some((r) => r.noted));
  const shown = new Set(sides.flatMap((s) => [...(s.scoring?.columns ?? []), ...(s.goalies?.columns ?? [])]).map((c) => c.label));
  const legend = (LINE_BOX ? [...LINE_FIRST, ...LINE_SECOND] : [...FIELD_COLUMNS, ...GOALIE_COLUMNS])
    .filter((c) => shown.has(c.label))
    .map((c) => `${c.label} ${c.title.toLowerCase()}`);
  return {
    sides,
    notedFrom: marked ? model.game.venue.text : null,
    caveat: caveat ? TIEBREAK_CAVEAT : null,
    legend,
  };
}
