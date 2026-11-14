/**
 * The team page's player stats section (SPEC §1.1k), derived from data/player-stats.json, for every
 * team of all five leagues. Pure, so tests/ui/player-stats-view.test.ts can assert it over the real
 * file.
 *
 * Three blocks, each shown only when the team has something for it:
 *   - Scoring: games, goals, assists, points — the columns every stat-keeping coach fills in;
 *   - More: shots, shots on goal, game-winning goals, steals — only the ones this team tracks,
 *     and only the players with at least one of them;
 *   - Goalkeeping: one card per goalkeeper, since a team can track up to ten goalie stats and a
 *     table that wide cannot reflow at 320px (DESIGN §10.8).
 *
 * A column the team does not track never appears (lib/players/player-stats-schema.ts: untracked is null
 * for everyone). A tracked stat a player has no entry for prints as a dash, never as 0.
 *
 * Goalkeeping is printed as entered, with one figure this module works out: Save %, saves over
 * saves plus goals against. It is the only number on the section the coach did not type, so the
 * section says so, and it is left out of any card whose entered figures cannot all be true: the
 * coach's "opponent shots on goal" below saves plus goals against (Leland, 2026-10-03: 10 shots
 * on goal, 36 saves, 9 against). The card says the figures disagree instead.
 *
 * Some coaches write goals, assists and saves in MaxPreps' game note rather than on the stats sheet
 * (Homestead: "goals scored Gabby Molly, Emry Borges"). lib/players/note-stats.ts adds those to the
 * MaxPreps numbers; every row or card they changed is marked, and the section lists each noted
 * game with the note as written, so a reader can tell the two sources apart.
 */

import { listWords, numberWord, plural, shortDate } from '../../lib/format';
import type { NoteCredit, NoteStatKind } from '../../lib/players/note-stats';
import { getTeamPlayerStatsWithNotes } from '../../lib/players/player-stats';
import type {
  FieldStatKey,
  GoalieStatKey,
  PlayerStatLine,
  TeamPlayerStats,
} from '../../lib/players/player-stats-schema';
import { SPORT } from '../../lib/sports/current';
import type { Game, TeamSlug } from '../../lib/types';

/** Whether this build's stat line is basketball's (`Sport.stats.model`): one line per player, no goalkeepers. */
const BASKETBALL = SPORT.stats.model === 'basketball';
/** Whether it is volleyball's: one line per player too, its rates per set played. */
const VOLLEYBALL = SPORT.stats.model === 'volleyball';

export interface StatColumn {
  key: string;
  /** The column head: "G". */
  label: string;
  /** What a screen reader hears, and the legend spells out: "Goals". */
  title: string;
}

export interface StatRow {
  key: string;
  name: string;
  jersey: string | null;
  /** One per column; null prints as a dash. */
  values: Array<number | null>;
  /**
   * What each cell prints, where that is not the value rounded to a whole number: a per-game figure or a
   * percentage to one decimal ('14.2'), or a made-attempted pair ('3-6'). Absent where every cell is a count.
   */
  texts?: Array<string | null>;
  /** Some of these numbers come from a game note, not the stats sheet. */
  noted: boolean;
}

export interface StatTable {
  columns: StatColumn[];
  rows: StatRow[];
}

/** One of basketball's stat tables on the team page, with its heading and its screen-reader caption. */
export interface NamedStatTable {
  id: string;
  kicker: string;
  /** "Palo Alto scoring, this season" */
  caption: string;
  table: StatTable;
}

export interface GoalieCard {
  key: string;
  name: string;
  jersey: string | null;
  /** In GOALIE order; `text` null prints as a dash with "not recorded" for a screen reader. */
  stats: Array<{ label: string; text: string | null }>;
  /** Why no Save % is shown although saves and goals against are tracked, or null. */
  flag: string | null;
  /** Some of these numbers come from a game note, not the stats sheet. */
  noted: boolean;
}

/** One game whose note added to the numbers, in the words the section prints. */
export interface NotedGame {
  key: string;
  /** "Wed Sep 30 vs Fremont". */
  game: string;
  /** "a goal each for Gabrielle Moll and Emry Borges". */
  added: string;
  /** The note as MaxPreps publishes it. */
  note: string;
}

export interface PlayerStatsView {
  teamName: string;
  status: TeamPlayerStats['status'];
  /** MaxPreps' human-facing stats page for the team. */
  statsUrl: string | null;
  /** "Thu Oct 1": the day MaxPreps says the stats were last entered. */
  updated: string | null;
  /** Final games played after that day: the totals do not include them yet. */
  gamesSince: number;
  scoring: StatTable | null;
  more: StatTable | null;
  goalies: GoalieCard[];
  /**
   * Basketball's tables (scoring, shooting, rebounds and assists, defense and more), in order; absent in a
   * sport whose line is field hockey's, where `scoring`, `more` and `goalies` are the section.
   */
  tables?: NamedStatTable[];
  /** Some table shows a figure this site works out from the entered totals (a per-game rate, a percentage). */
  showsDerived?: boolean;
  /** The derived rates are per set played (volleyball), not per game: the legend says which. */
  ratesPerSet?: boolean;
  /** Points are on the scoring table: the legend explains MaxPreps' 2-per-goal rule. */
  showsPoints: boolean;
  /** Some goalkeeper card shows a Save %, which this site works out: the footnote says how. */
  showsSavePercent: boolean;
  /** The coach enters some goalkeeping on MaxPreps, so the footnote on entered figures applies. */
  goalkeepingEntered: boolean;
  /** The games whose notes added goals or saves, oldest first; empty when none did. */
  notedGames: NotedGame[];
}

const SCORING: Array<{ key: FieldStatKey } & Omit<StatColumn, 'key'>> = [
  { key: 'gamesPlayed', label: 'GP', title: 'Games played' },
  { key: 'goals', label: 'G', title: 'Goals' },
  { key: 'assists', label: 'A', title: 'Assists' },
  { key: 'points', label: 'Pts', title: 'Points' },
];

const MORE: Array<{ key: FieldStatKey } & Omit<StatColumn, 'key'>> = [
  { key: 'shots', label: 'Sh', title: 'Shots' },
  { key: 'shotsOnGoal', label: 'SOG', title: 'Shots on goal' },
  { key: 'gameWinningGoals', label: 'GWG', title: 'Game-winning goals' },
  { key: 'steals', label: 'Stl', title: 'Steals' },
  // Field minutes stay in the data but are not shown: the one team that tracks them (St. Ignatius,
  // 2026-10-02) entered them for a single player, so every other row read as a real "0 minutes".
];

const GOALIE: Array<{ key: GoalieStatKey; label: string }> = [
  { key: 'gamesPlayed', label: 'Games' },
  { key: 'minutes', label: 'Minutes' },
  { key: 'overtimeMinutes', label: 'OT minutes' },
  // MaxPreps' OpponentShotsOnGoal, as the coach typed it: not a count of what this keeper faced,
  // and on some teams far below the saves entered beside it.
  { key: 'opponentShotsOnGoal', label: 'Opp. shots on goal' },
  { key: 'saves', label: 'Saves' },
  { key: 'goalsAgainst', label: 'Goals against' },
  { key: 'shutouts', label: 'Shutouts' },
  { key: 'wins', label: 'Wins' },
  { key: 'losses', label: 'Losses' },
  { key: 'ties', label: 'Ties' },
];

/** Whole numbers as they are; minutes rounded, since the column is a count of minutes. */
export function statText(value: number | null): string | null {
  return value === null ? null : String(Math.round(value));
}

/** "91.2%" — saves over shots that had to be saved (saves + goals against). */
export function savePercent(saves: number, goalsAgainst: number): string | null {
  const faced = saves + goalsAgainst;
  return faced > 0 ? `${((saves / faced) * 100).toFixed(1)}%` : null;
}

/** The credits' players, by the keys a stat line carries. */
function notedKeys(credits: readonly NoteCredit[], kinds: ReadonlyArray<NoteStatKind>): Set<string> {
  return new Set(
    credits
      .filter((c) => kinds.some((k) => c[k] > 0))
      .flatMap((c) => [c.careerId, c.athleteId].filter((k): k is string => k !== null)),
  );
}

const isNoted = (keys: Set<string>, p: PlayerStatLine) =>
  (p.careerId !== null && keys.has(p.careerId)) || (p.athleteId !== null && keys.has(p.athleteId));

function count(n: number, one: string, many: string): string {
  return n === 1 ? `${/^[aeiou]/.test(one) ? 'an' : 'a'} ${one}` : `${numberWord(n)} ${many}`;
}

const KIND_WORDS: Record<NoteStatKind, [string, string]> = {
  goals: ['goal', 'goals'],
  assists: ['assist', 'assists'],
  saves: ['save', 'saves'],
};

/** "a goal each for A and B", "two goals for A", "seven saves for C". */
function addedWords(credits: readonly NoteCredit[], kind: NoteStatKind): string | null {
  const [one, many] = KIND_WORDS[kind];
  const byCount = new Map<number, string[]>();
  for (const c of credits) if (c[kind] > 0) byCount.set(c[kind], [...(byCount.get(c[kind]) ?? []), c.fullName]);
  const parts = [...byCount].map(([n, names]) =>
    names.length > 1 ? `${count(n, one, many)} each for ${listWords(names)}` : `${count(n, one, many)} for ${names[0]}`,
  );
  return parts.length ? listWords(parts) : null;
}

/** The games the notes added to, one line each, oldest first. */
export function notedGames(credits: readonly NoteCredit[]): NotedGame[] {
  const byGame = new Map<string, NoteCredit[]>();
  for (const c of credits) byGame.set(c.contestId, [...(byGame.get(c.contestId) ?? []), c]);
  return [...byGame.values()]
    .sort((a, b) => a[0].dateKey.localeCompare(b[0].dateKey))
    .map((cs) => {
      const [first] = cs;
      return {
        key: first.contestId,
        game: `${shortDate(first.dateKey)} ${first.site === 'away' ? 'at' : 'vs'} ${first.opponent}`,
        added: listWords(
          (['goals', 'assists', 'saves'] as const).map((k) => addedWords(cs, k)).filter((w): w is string => w !== null),
        ),
        note: first.note,
      };
    });
}

function table(
  team: TeamPlayerStats,
  spec: typeof SCORING,
  players: PlayerStatLine[],
  keep: (values: Array<number | null>) => boolean,
  noted: Set<string> = new Set(),
): StatTable | null {
  const tracked = new Set<string>(team.tracked.field);
  const columns = spec.filter((c) => tracked.has(c.key));
  if (columns.length === 0) return null;
  const rows = players
    .map((p, i) => ({
      key: p.careerId ?? `${p.shortName}-${i}`,
      name: p.fullName,
      jersey: p.jersey,
      values: columns.map((c) => p.field?.[c.key] ?? null),
      noted: isNoted(noted, p),
    }))
    .filter((r) => keep(r.values));
  return rows.length ? { columns: columns.map(({ key, label, title }) => ({ key, label, title })), rows } : null;
}

/** Points, then goals, then assists, then games — and the name to break what is left. */
function byScoring(a: PlayerStatLine, b: PlayerStatLine): number {
  const v = (p: PlayerStatLine, k: FieldStatKey) => p.field?.[k] ?? -1;
  return (
    v(b, 'points') - v(a, 'points') ||
    v(b, 'goals') - v(a, 'goals') ||
    v(b, 'assists') - v(a, 'assists') ||
    v(b, 'gamesPlayed') - v(a, 'gamesPlayed') ||
    a.fullName.localeCompare(b.fullName)
  );
}

/**
 * The entered figures cannot all be true: every shot on goal is either saved or a goal, so the
 * opponent's shots on goal can never be fewer than saves plus goals against.
 */
export function goalieFiguresDisagree(g: NonNullable<PlayerStatLine['goalkeeping']>): boolean {
  if (g.opponentShotsOnGoal === null || (g.saves === null && g.goalsAgainst === null)) return false;
  return (g.saves ?? 0) + (g.goalsAgainst ?? 0) > g.opponentShotsOnGoal;
}

function goalieCard(team: TeamPlayerStats, p: PlayerStatLine, i: number, noted: Set<string>): GoalieCard {
  const tracked = new Set<string>(team.tracked.goalkeeping);
  const g = p.goalkeeping!;
  // Saves that include a game note's cover games the entered goals against and shots on goal do
  // not: nothing is worked out from the two together.
  const mixed = isNoted(noted, p);
  const disagree = !mixed && goalieFiguresDisagree(g);
  const stats: GoalieCard['stats'] = [];
  let flag: string | null = null;
  for (const s of GOALIE) {
    if (!tracked.has(s.key)) continue;
    stats.push({ label: s.label, text: statText(g[s.key]) });
    // Save % sits right after goals against, only where both halves are tracked and entered, and
    // never beside figures that contradict each other.
    if (s.key === 'goalsAgainst' && tracked.has('saves') && g.saves !== null && g.goalsAgainst !== null) {
      const pct = savePercent(g.saves, g.goalsAgainst);
      if (pct && !disagree && !mixed) stats.push({ label: 'Save %', text: pct });
    }
  }
  if (mixed && g.saves !== null && g.goalsAgainst !== null && tracked.has('goalsAgainst')) {
    flag = 'No save % is worked out: some of these saves come from a game note, and the goals against do not cover the same games.';
  }
  if (disagree && g.opponentShotsOnGoal !== null) {
    // Whole counts with real plurals ("1 save", never "1 saves"), rounded as `statText` rounds.
    const count = (n: number, one: string, many: string) => plural(Math.round(n), one, many);
    const accounted =
      g.saves !== null && g.goalsAgainst !== null
        ? count(g.saves + g.goalsAgainst, 'save or goal against', 'saves plus goals against')
        : g.saves !== null
          ? count(g.saves, 'save', 'saves')
          : count(g.goalsAgainst ?? 0, 'goal against', 'goals against');
    const hidesPercent = g.saves !== null && g.goalsAgainst !== null && savePercent(g.saves, g.goalsAgainst) !== null;
    flag =
      `As entered, these cannot all be right: ${count(g.opponentShotsOnGoal, 'opponent shot on goal', 'opponent shots on goal')}, ` +
      `but ${accounted}.${hidesPercent ? ' No save % is worked out.' : ''}`;
  }
  return {
    key: p.careerId ?? `${p.shortName}-${i}`,
    name: p.fullName,
    jersey: p.jersey,
    stats,
    flag,
    noted: isNoted(noted, p),
  };
}

/**
 * The keeper MaxPreps' goalie group is mostly about leads: minutes in goal, then decisions
 * (wins + losses + ties), then saves, then goals against. Games played comes last, because MaxPreps
 * lists field players in the group with the team's full game count (University: a forward with
 * 12 goals and 2 saves had the same 16 games as the keeper with 10 wins).
 */
function byTimeInGoal(a: PlayerStatLine, b: PlayerStatLine): number {
  const g = (p: PlayerStatLine) => p.goalkeeping!;
  const n = (v: number | null) => v ?? -1;
  const decisions = (p: PlayerStatLine) => {
    const x = g(p);
    return x.wins === null && x.losses === null && x.ties === null ? -1 : (x.wins ?? 0) + (x.losses ?? 0) + (x.ties ?? 0);
  };
  return (
    n(g(b).minutes) - n(g(a).minutes) ||
    decisions(b) - decisions(a) ||
    n(g(b).saves) - n(g(a).saves) ||
    n(g(b).goalsAgainst) - n(g(a).goalsAgainst) ||
    n(g(b).gamesPlayed) - n(g(a).gamesPlayed) ||
    a.fullName.localeCompare(b.fullName)
  );
}

/**
 * Finals played after MaxPreps' "last updated" stamp: games the totals do not include yet. Both
 * stamps are naive local time in the same zone: on 2026-10-02 the finals at or before each team's
 * update matched MaxPreps' own games-played total on 9 of 10 teams (Palo Alto's total is one game
 * ahead of the snapshot). Compared whole, not by date, so a game later on the day of the update
 * counts (Santa Clara: updated 11:15, played at 16:00). Shared with the /leaders page, so both
 * pages say the same thing about the same team.
 */
export function gamesSinceUpdate(lastUpdated: string | null, games: readonly Game[]): number {
  const updatedAt = lastUpdated?.slice(0, 19) ?? null;
  if (!updatedAt) return 0;
  return new Set(
    games
      .filter((g) => g.status === 'final' && g.dateLocal.slice(0, 19) > updatedAt)
      .map((g) => g.contestId),
  ).size;
}

// ---------------------------------------------------------------- basketball

/** One decimal, as a stat table prints a rate: '14.2', '0.0'. */
export function oneDecimal(value: number): string {
  return value.toFixed(1);
}

/** A per-game rate, or null where either half is missing or no game is counted. */
export function perGameRate(total: number | null | undefined, games: number | null | undefined): number | null {
  return typeof total === 'number' && typeof games === 'number' && games > 0 ? total / games : null;
}

/** Made over attempted as a percentage (0-100), or null where either is missing or nothing was attempted. */
export function shootingPercent(made: number | null | undefined, attempts: number | null | undefined): number | null {
  return typeof made === 'number' && typeof attempts === 'number' && attempts > 0 ? (made / attempts) * 100 : null;
}

type Line = Record<string, number | null | undefined>;
interface BasketballColumn extends StatColumn {
  /** The stats the column needs the team to track. */
  needs: readonly string[];
  /** The cell's number, from a player's line. */
  value: (f: Line) => number | null;
  /** Printed to one decimal (a rate or a percentage) rather than as a whole count. */
  derived?: boolean;
  /** The decimals a derived cell prints, where not one: a hitting percentage is '.214'. */
  digits?: number;
}
const total = (key: string): Pick<BasketballColumn, 'needs' | 'value'> => ({ needs: [key], value: (f) => f[key] ?? null });
const rate = (key: string): Pick<BasketballColumn, 'needs' | 'value' | 'derived'> => ({
  needs: [key, 'gamesPlayed'],
  value: (f) => perGameRate(f[key], f.gamesPlayed),
  derived: true,
});
const pct = (made: string, attempts: string): Pick<BasketballColumn, 'needs' | 'value' | 'derived'> => ({
  needs: [made, attempts],
  value: (f) => shootingPercent(f[made], f[attempts]),
  derived: true,
});

/**
 * Basketball's team-page tables. Each keeps to five numeric columns so it fits 320px without a scroller
 * (DESIGN §10.8), which is why one wide stat sheet is four tables here. A column appears only when the team
 * tracks every stat it needs.
 */
const BASKETBALL_TABLES: ReadonlyArray<{ id: string; kicker: string; captionWords: string; columns: readonly BasketballColumn[] }> = [
  {
    id: 'scoring', kicker: 'Scoring', captionWords: 'scoring',
    columns: [
      { key: 'gamesPlayed', label: 'GP', title: 'Games played', ...total('gamesPlayed') },
      { key: 'points', label: 'PTS', title: 'Points', ...total('points') },
      { key: 'pointsPerGame', label: 'PPG', title: 'Points per game', ...rate('points') },
      { key: 'threePointsMade', label: '3PM', title: 'Three-pointers made', ...total('threePointsMade') },
    ],
  },
  {
    id: 'shooting', kicker: 'Shooting', captionWords: 'shooting percentages',
    columns: [
      { key: 'fieldGoalPercent', label: 'FG%', title: 'Field goal percentage', ...pct('fieldGoalsMade', 'fieldGoalAttempts') },
      { key: 'threePointPercent', label: '3P%', title: 'Three-point percentage', ...pct('threePointsMade', 'threePointAttempts') },
      { key: 'freeThrowPercent', label: 'FT%', title: 'Free throw percentage', ...pct('freeThrowsMade', 'freeThrowAttempts') },
      { key: 'freeThrowsMade', label: 'FTM', title: 'Free throws made', ...total('freeThrowsMade') },
    ],
  },
  {
    id: 'rebounds', kicker: 'Rebounds and assists', captionWords: 'rebounds and assists',
    columns: [
      { key: 'rebounds', label: 'REB', title: 'Rebounds', ...total('rebounds') },
      { key: 'reboundsPerGame', label: 'RPG', title: 'Rebounds per game', ...rate('rebounds') },
      { key: 'assists', label: 'AST', title: 'Assists', ...total('assists') },
      { key: 'assistsPerGame', label: 'APG', title: 'Assists per game', ...rate('assists') },
    ],
  },
  {
    id: 'defense', kicker: 'Defense and more', captionWords: 'steals, blocks, turnovers and fouls',
    columns: [
      { key: 'steals', label: 'STL', title: 'Steals', ...total('steals') },
      { key: 'blocks', label: 'BLK', title: 'Blocks', ...total('blocks') },
      { key: 'turnovers', label: 'TO', title: 'Turnovers', ...total('turnovers') },
      { key: 'personalFouls', label: 'PF', title: 'Personal fouls', ...total('personalFouls') },
      { key: 'minutes', label: 'MIN', title: 'Minutes', ...total('minutes') },
    ],
  },
];

/** A per-set rate (volleyball): the total over the sets the player played. */
const perSet = (key: string): Pick<BasketballColumn, 'needs' | 'value' | 'derived'> => ({
  needs: [key, 'setsPlayed'],
  value: (f) => perGameRate(f[key], f.setsPlayed),
  derived: true,
});

/** Kills less errors over attempts, the hitting percentage volleyball prints to three places; null with no attempt. */
export function hittingPercent(kills: number | null | undefined, errors: number | null | undefined, attempts: number | null | undefined): number | null {
  return typeof kills === 'number' && typeof errors === 'number' && typeof attempts === 'number' && attempts > 0
    ? (kills - errors) / attempts
    : null;
}

/** Solo blocks plus half the block assists: MaxPreps' "total blocks", which a team's sheet adds up the same way. */
export function totalBlocks(solo: number | null | undefined, assists: number | null | undefined): number | null {
  if (typeof solo !== 'number' && typeof assists !== 'number') return null;
  return (solo ?? 0) + (assists ?? 0) / 2;
}

/** A hitting percentage as volleyball prints it: '.214', '-.050', '1.000'. */
export function threeDecimals(value: number): string {
  const text = Math.abs(value).toFixed(3);
  const shown = text.startsWith('0') ? text.slice(1) : text;
  return value < 0 && Number(text) !== 0 ? `-${shown}` : shown;
}

/**
 * Volleyball's team-page tables, at most five numeric columns each like basketball's. A column appears only
 * when the team tracks every stat it needs.
 */
const VOLLEYBALL_TABLES: ReadonlyArray<{ id: string; kicker: string; captionWords: string; columns: readonly BasketballColumn[] }> = [
  {
    id: 'attacking', kicker: 'Attacking', captionWords: 'attacking',
    columns: [
      { key: 'setsPlayed', label: 'SP', title: 'Sets played', ...total('setsPlayed') },
      { key: 'kills', label: 'K', title: 'Kills', ...total('kills') },
      { key: 'killsPerSet', label: 'K/S', title: 'Kills per set', ...perSet('kills') },
      { key: 'attackErrors', label: 'E', title: 'Attack errors', ...total('attackErrors') },
      {
        key: 'hittingPercent', label: 'Hit%', title: 'Hitting percentage',
        needs: ['kills', 'attackErrors', 'attackAttempts'],
        value: (f) => hittingPercent(f.kills, f.attackErrors, f.attackAttempts),
        derived: true, digits: 3,
      },
    ],
  },
  {
    id: 'serving', kicker: 'Serving', captionWords: 'serving',
    columns: [
      { key: 'aces', label: 'A', title: 'Aces', ...total('aces') },
      { key: 'acesPerSet', label: 'A/S', title: 'Aces per set', ...perSet('aces') },
      { key: 'serveAttempts', label: 'SA', title: 'Serve attempts', ...total('serveAttempts') },
      { key: 'serveErrors', label: 'SE', title: 'Serve errors', ...total('serveErrors') },
    ],
  },
  {
    id: 'defense', kicker: 'Blocking and digs', captionWords: 'blocking and digs',
    columns: [
      { key: 'soloBlocks', label: 'BS', title: 'Solo blocks', ...total('soloBlocks') },
      { key: 'blockAssists', label: 'BA', title: 'Block assists', ...total('blockAssists') },
      { key: 'digs', label: 'D', title: 'Digs', ...total('digs') },
      { key: 'digsPerSet', label: 'D/S', title: 'Digs per set', ...perSet('digs') },
    ],
  },
  {
    id: 'passing', kicker: 'Setting and serve receive', captionWords: 'assists and serve receive',
    columns: [
      { key: 'assists', label: 'Ast', title: 'Assists', ...total('assists') },
      { key: 'assistsPerSet', label: 'Ast/S', title: 'Assists per set', ...perSet('assists') },
      { key: 'receptions', label: 'R', title: 'Serve receptions', ...total('receptions') },
      { key: 'receptionErrors', label: 'RE', title: 'Serve reception errors', ...total('receptionErrors') },
    ],
  },
];

/** Most kills first, then digs, assists and sets; the name breaks what is left. */
function byKills(a: PlayerStatLine, b: PlayerStatLine): number {
  const v = (p: PlayerStatLine, k: string) => (p.field as Line | null)?.[k] ?? -1;
  return (
    v(b, 'kills') - v(a, 'kills') ||
    v(b, 'digs') - v(a, 'digs') ||
    v(b, 'assists') - v(a, 'assists') ||
    v(b, 'setsPlayed') - v(a, 'setsPlayed') ||
    a.fullName.localeCompare(b.fullName)
  );
}

/** The build's sport's line tables and row order (basketball's, or volleyball's). */
const LINE_TABLES = VOLLEYBALL ? VOLLEYBALL_TABLES : BASKETBALL_TABLES;

/** Most points first, then rebounds, assists and games; the name breaks what is left. */
function byPoints(a: PlayerStatLine, b: PlayerStatLine): number {
  const v = (p: PlayerStatLine, k: string) => (p.field as Line | null)?.[k] ?? -1;
  return (
    v(b, 'points') - v(a, 'points') ||
    v(b, 'rebounds') - v(a, 'rebounds') ||
    v(b, 'assists') - v(a, 'assists') ||
    v(b, 'gamesPlayed') - v(a, 'gamesPlayed') ||
    a.fullName.localeCompare(b.fullName)
  );
}

/**
 * Basketball's (or volleyball's) tables for a team: every player with a line, most points (kills) first, the
 * same order in every table so a reader can follow one player down the page. A table none of whose columns
 * the team tracks is left out.
 */
export function basketballTables(team: Pick<TeamPlayerStats, 'name' | 'tracked' | 'players'>): NamedStatTable[] {
  const tracked = new Set<string>(team.tracked.field);
  const players = team.players.filter((p) => p.field !== null).sort(VOLLEYBALL ? byKills : byPoints);
  const out: NamedStatTable[] = [];
  for (const spec of LINE_TABLES) {
    const columns = spec.columns.filter((c) => c.needs.every((k) => tracked.has(k)));
    if (columns.length === 0) continue;
    const rows: StatRow[] = players.map((p, i) => {
      const values = columns.map((c) => c.value(p.field as Line));
      return {
        key: p.careerId ?? `${p.shortName}-${i}`,
        name: p.fullName,
        jersey: p.jersey,
        values,
        texts: columns.map((c, at) => (values[at] === null ? null : c.derived ? (c.digits === 3 ? threeDecimals(values[at]!) : oneDecimal(values[at]!)) : String(Math.round(values[at]!)))),
        noted: false,
      };
    });
    if (rows.length === 0) continue;
    out.push({
      id: spec.id,
      kicker: spec.kicker,
      caption: `${team.name} ${spec.captionWords}, this season`,
      table: { columns: columns.map(({ key, label, title }) => ({ key, label, title })), rows },
    });
  }
  return out;
}

/** Whether a basketball column is worked out here rather than entered (a per-game rate, a percentage). */
const BASKETBALL_DERIVED = new Set(LINE_TABLES.flatMap((t) => t.columns.filter((c) => c.derived).map((c) => c.key)));

/**
 * The player stats section for any registry team, in every league. null only for a slug
 * data/player-stats.json does not hold (not a registry team). A team whose coach enters no stats
 * still gets a view, with no tables, and the section says so (status 'none'); one no run has
 * covered yet has status 'pending' and says that instead; one whose fetch failed with nothing to
 * fall back on has status 'error'. Never throws for a registry slug.
 *
 * @param games the team's league and non-league contests, to count finals played after MaxPreps'
 *   last stats update.
 * @param team the team's stats; defaults to data/player-stats.json's with the team's game notes
 *   added (lib/players/note-stats.ts). Tests pass a fixture build, since the committed file moves with
 *   every refresh. A team without `noteCredits` is shown as MaxPreps has it.
 */
export function buildPlayerStatsView(
  slug: TeamSlug,
  games: readonly Game[] = [],
  team:
    | (TeamPlayerStats & { noteCredits?: readonly NoteCredit[]; noteTracked?: TeamPlayerStats['tracked'] })
    | undefined = getTeamPlayerStatsWithNotes(slug),
): PlayerStatsView | null {
  if (!team) return null;
  const credits = team.noteCredits ?? [];
  const notedScoring = notedKeys(credits, ['goals', 'assists']);
  const notedSaves = notedKeys(credits, ['saves']);

  const updatedDay = team.lastUpdated?.slice(0, 10) ?? null;
  const gamesSince = gamesSinceUpdate(team.lastUpdated, games);
  if (BASKETBALL || VOLLEYBALL) {
    const tables = basketballTables(team);
    return {
      teamName: team.name,
      status: team.status,
      statsUrl: team.statsUrl,
      updated: updatedDay ? shortDate(updatedDay) : null,
      gamesSince,
      scoring: null,
      more: null,
      goalies: [],
      tables,
      showsDerived: tables.some((t) => t.table.columns.some((c) => BASKETBALL_DERIVED.has(c.key))),
      ...(VOLLEYBALL ? { ratesPerSet: true } : {}),
      showsPoints: false,
      showsSavePercent: false,
      notedGames: [],
      goalkeepingEntered: false,
    };
  }

  const field = team.players.filter((p) => p.field !== null).sort(byScoring);
  const scoring = table(team, SCORING, field, () => true, notedScoring);
  // The "more" table lists only players with at least one of its numbers above zero. Notes add
  // goals and assists only, which are on the scoring table, so nothing here is marked.
  const more = table(team, MORE, field, (values) => values.some((v) => v !== null && v > 0));

  const goalies = team.players
    .filter((p) => p.goalkeeping !== null)
    .sort(byTimeInGoal)
    .map((p, i) => goalieCard(team, p, i, notedSaves))
    .filter((c) => c.stats.length > 0);

  return {
    teamName: team.name,
    status: team.status,
    statsUrl: team.statsUrl,
    updated: updatedDay ? shortDate(updatedDay) : null,
    gamesSince,
    scoring,
    more,
    goalies,
    showsPoints: scoring?.columns.some((c) => c.key === 'points') ?? false,
    showsSavePercent: goalies.some((c) => c.stats.some((x) => x.label === 'Save %')),
    notedGames: notedGames(credits),
    goalkeepingEntered:
      goalies.length > 0 && team.tracked.goalkeeping.some((k) => !team.noteTracked?.goalkeeping.includes(k)),
  };
}
