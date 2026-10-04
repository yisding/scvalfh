import { getSnapshot } from '../../lib/data';
import {
  listWords,
  numberWord,
  recordString,
  recordWords,
  shortDate,
  signedGd,
  winPct,
} from '../../lib/format';
import { LEAGUES, getLeague } from '../../lib/leagues';
import { getPlayerStats } from '../../lib/player-stats';
import { getPriorSeason } from '../../lib/prior-season';
import type { PriorSeason } from '../../lib/prior-season-schema';
import { ELO_BASE, ELO_PER_GOAL, MARGIN_CAP, computeRatings, type TeamRating } from '../../lib/ratings';
import type {
  FieldStatKey,
  GoalieStatKey,
  PlayerStatLine,
  TeamPlayerStats,
} from '../../lib/player-stats-schema';
import type { ComputedRecord, Game, Standing, Team, TeamSlug } from '../../lib/types';
import { gamesSinceUpdate, savePercent, statText } from '../teams/player-stats-view';
import { plural } from '../ui/plural';

/** 'five': the number of configured leagues, in words (the captions say 'all five leagues'). */
const LEAGUE_COUNT = numberWord(LEAGUES.length);

/**
 * The /leaders page (DESIGN §16): site-wide leaderboards over all five leagues, derived from the
 * two files the rest of the site already reads. Pure, so tests/ui/leaders-view.test.ts can assert
 * it over the committed data and over synthetic games.
 *
 * Players (data/player-stats.json): most points, assists, saves and clean sheets. A player's
 * numbers are exactly what the team page shows: season totals as the coach entered them on
 * MaxPreps. Only teams whose coach tracks a stat can appear on its board, so every board says how
 * many teams it covers and names the ones it leaves out, and the section says whose totals are
 * behind the scores. A 0 never leads a board, and an untracked stat is never read as a 0.
 *
 * Schools (data/snapshot.json): best record, best league record, goals scored and allowed per game,
 * clean sheets, and last the highest Elo rating (lib/ratings.ts, DESIGN §20). Records are the
 * `Standing` rows the standings and team pages print (`overall` is every final, `computed` the
 * league games the table counts), so a team's record here is its record everywhere. Clean sheets
 * and the per-game rates come from the same finals, with forfeits left out of goals as
 * lib/standings.ts leaves them out (DESIGN §11.6). Records and rates need a minimum number of
 * results, half the median team's, so a 1-0 team does not top a table of 10-game seasons; the
 * teams below it are named. The Elo board's minimum counts the games its fit
 * counts this season (finals between two registry teams), by the same rule; a team under it is
 * still rated on its own page, as provisional. The ratings start from last season's
 * (data/prior-season.json); synthetic sources without one start every team at average.
 *
 * Every board ranks with standard competition ranking (1, 2, 2, 4): equal values share a place
 * and tied rows are listed by name. A board shows the places up to 10th, and every player or school
 * tied for the last of them, however many; a player board goes on to 25th the same way, behind a
 * "Show N more" disclosure.
 */

/** The places a board shows. */
export const BOARD_PLACES = 10;
/** The places a player board shows once expanded. */
export const EXPANDED_PLACES = 25;

export interface LeaderColumn {
  key: string;
  /** The column head: "Pts". */
  label: string;
  /** What a screen reader hears, and the notes spell out: "Points". */
  title: string;
}

export interface LeaderCell {
  /** null prints as a dash: a stat the coach did not enter for this player. */
  text: string | null;
  /** Read instead of `text` ("10 wins, 0 losses, 0 ties" for "10-0-0"). */
  sr?: string;
}

export interface LeaderTeamRef {
  slug: TeamSlug;
  name: string;
  /** ≤ 14 characters, for a phone-width cell. */
  shortName: string;
  /** "SCVAL" */
  league: string;
  /** The team page, at its player stats for a player row. */
  href: string;
  /** For the monogram. */
  team: Pick<Team, 'abbr' | 'name' | 'colors'>;
}

export interface LeaderRow {
  key: string;
  /** 1-based; tied rows share it. */
  rank: number;
  tied: boolean;
  /** The player's name on a player board, the school's on a school board. */
  name: string;
  team: LeaderTeamRef;
  /** One per column. */
  cells: LeaderCell[];
}

export interface LeaderBoard {
  /** The board's anchor: `/leaders#most-points`. */
  id: string;
  kind: 'player' | 'school';
  /** "Most points" */
  title: string;
  /** Beside the heading: "From 27 teams", "At least 5 games". */
  meta: string;
  /** The table's caption, for a screen reader. */
  caption: string;
  columns: LeaderColumn[];
  /** The index of the column the board is ranked on. */
  rankedBy: number;
  rows: LeaderRow[];
  /**
   * A player board's places after `rows`, up to EXPANDED_PLACES, behind a disclosure; null when
   * there are none, and always on a school board.
   */
  extra: LeaderExtra | null;
  /** One or two sentences under the board: what it counts and what it leaves out. */
  note: string;
  /** Shown instead of the table when no row qualifies. */
  empty: string;
}

export interface LeaderExtra {
  /** The disclosure's summary: "Show 15 more players". */
  summary: string;
  /** The second table's caption, for a screen reader. */
  caption: string;
  /** The rows after the board's own, ranked on from them. */
  rows: LeaderRow[];
}

export interface LeadersView {
  players: LeaderBoard[];
  schools: LeaderBoard[];
  /** Under the player boards: whose stats are missing, behind or carried forward. */
  playerNotes: string[];
  /** Under the school boards: what the records count and who has not played enough to qualify. */
  schoolNotes: string[];
  /** Teams with at least one player stat line. */
  statTeams: number;
  teamCount: number;
  /** "Fri Oct 2": the last day with a final, or null before the first one. */
  resultsThrough: string | null;
}

/** What the page is built from. Defaults to the bundled snapshot and player stats. */
export interface LeaderSources {
  /** Every registry team. */
  teams: readonly Team[];
  /** data/player-stats.json's per-team entries. */
  stats: readonly TeamPlayerStats[];
  /** One Standing per team (lib/standings.ts). */
  standings: readonly Standing[];
  /** Every contest. */
  games: readonly Game[];
  /** Last season's results, the Elo rating's starting point; null starts every team at average. */
  prior?: PriorSeason | null;
}

function defaultSources(): LeaderSources {
  const snapshot = getSnapshot();
  return {
    teams: snapshot.teams,
    stats: getPlayerStats().teams,
    standings: snapshot.standings,
    games: snapshot.games,
    prior: getPriorSeason(),
  };
}

// ---------------------------------------------------------------- ranking

interface Ranked<T> {
  item: T;
  rank: number;
  tied: boolean;
}

/**
 * Standard competition ranking over `sorted` (best first): neighbours that are `same` share a
 * place. Keeps the places up to `places`, with every row tied for the last of them, so the rows for
 * fewer places are always the first rows for more.
 */
export function rankBoard<T>(
  sorted: readonly T[],
  same: (a: T, b: T) => boolean,
  places = BOARD_PLACES,
): Ranked<T>[] {
  const groups: T[][] = [];
  for (const item of sorted) {
    const last = groups[groups.length - 1];
    if (last && same(last[0], item)) last.push(item);
    else groups.push([item]);
  }
  const rows: Ranked<T>[] = [];
  let place = 1;
  for (const group of groups) {
    if (place > places) break;
    for (const item of group) rows.push({ item, rank: place, tied: group.length > 1 });
    place += group.length;
  }
  return rows;
}

const byName = (a: string, b: string) => a.localeCompare(b);

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Half the median of the teams that have played, rounded up, and never below 1. */
export function qualifyingMinimum(gamesPlayed: readonly number[]): { min: number; median: number } {
  const m = median(gamesPlayed.filter((gp) => gp > 0));
  return { min: Math.max(1, Math.ceil(m / 2)), median: m };
}

function teamRef(team: Team, anchor = ''): LeaderTeamRef {
  return {
    slug: team.slug,
    name: team.name,
    shortName: team.shortName,
    league: getLeague(team.league).shortName,
    href: `/teams/${team.slug}${anchor}`,
    team: { abbr: team.abbr, name: team.name, colors: team.colors },
  };
}

// ---------------------------------------------------------------- players

type StatRef = { block: 'field'; key: FieldStatKey } | { block: 'goalkeeping'; key: GoalieStatKey };

interface PlayerEntry {
  player: PlayerStatLine;
  stats: TeamPlayerStats;
  team: Team;
}

interface PlayerBoardSpec {
  id: string;
  title: string;
  /** The stat in a sentence: "assists", "clean sheets". */
  statWord: string;
  /** Who can lead it: "player" or "goalkeeper". */
  who: [string, string];
  stat: StatRef;
  columns: Array<LeaderColumn & { cell: (e: PlayerEntry) => LeaderCell }>;
  rankedBy: number;
  /** Said under the board before the coverage sentence. */
  lead: string;
}

const statOf = (p: PlayerStatLine, ref: StatRef): number | null =>
  ref.block === 'field' ? (p.field?.[ref.key] ?? null) : (p.goalkeeping?.[ref.key] ?? null);

const tracks = (t: TeamPlayerStats, ref: StatRef): boolean =>
  ref.block === 'field'
    ? t.tracked.field.includes(ref.key)
    : t.tracked.goalkeeping.includes(ref.key);

const num = (v: number | null): LeaderCell => ({ text: statText(v) });
const field = (key: FieldStatKey) => (e: PlayerEntry) => num(e.player.field?.[key] ?? null);
const keeper = (key: GoalieStatKey) => (e: PlayerEntry) => num(e.player.goalkeeping?.[key] ?? null);

const PLAYER_BOARDS: PlayerBoardSpec[] = [
  {
    id: 'most-points',
    title: 'Most points',
    statWord: 'points',
    who: ['player', 'players'],
    stat: { block: 'field', key: 'points' },
    columns: [
      { key: 'goals', label: 'G', title: 'Goals', cell: field('goals') },
      { key: 'assists', label: 'A', title: 'Assists', cell: field('assists') },
      { key: 'points', label: 'Pts', title: 'Points', cell: field('points') },
    ],
    rankedBy: 2,
    lead: 'Points are MaxPreps’: 2 per goal, 1 per assist.',
  },
  {
    id: 'most-assists',
    title: 'Most assists',
    statWord: 'assists',
    who: ['player', 'players'],
    stat: { block: 'field', key: 'assists' },
    columns: [
      { key: 'gamesPlayed', label: 'GP', title: 'Games played', cell: field('gamesPlayed') },
      { key: 'assists', label: 'A', title: 'Assists', cell: field('assists') },
    ],
    rankedBy: 1,
    lead: 'Assists as the coach entered them.',
  },
  {
    id: 'most-saves',
    title: 'Most saves',
    statWord: 'saves',
    who: ['goalkeeper', 'goalkeepers'],
    stat: { block: 'goalkeeping', key: 'saves' },
    columns: [
      { key: 'gamesPlayed', label: 'GP', title: 'Games played', cell: keeper('gamesPlayed') },
      { key: 'saves', label: 'Sv', title: 'Saves', cell: keeper('saves') },
      {
        key: 'savePct',
        label: 'Sv%',
        title: 'Save percentage',
        cell: (e) => {
          const g = e.player.goalkeeping;
          const both = tracks(e.stats, { block: 'goalkeeping', key: 'goalsAgainst' });
          return {
            text: both && g && g.saves !== null && g.goalsAgainst !== null ? savePercent(g.saves, g.goalsAgainst) : null,
          };
        },
      },
    ],
    rankedBy: 1,
    lead: 'Sv% is saves over saves plus goals against, where the coach enters both.',
  },
  {
    id: 'most-clean-sheets',
    title: 'Most clean sheets',
    statWord: 'clean sheets',
    who: ['goalkeeper', 'goalkeepers'],
    stat: { block: 'goalkeeping', key: 'shutouts' },
    columns: [
      { key: 'gamesPlayed', label: 'GP', title: 'Games played', cell: keeper('gamesPlayed') },
      { key: 'shutouts', label: 'CS', title: 'Clean sheets', cell: keeper('shutouts') },
    ],
    rankedBy: 1,
    lead: 'Games a keeper finished without conceding, which MaxPreps calls shutouts.',
  },
];

/** School names, registry order: prose spells them out (shortName is for a narrow cell). */
const names = (teams: readonly Team[]) => teams.map((t) => t.name);

function playerBoard(
  spec: PlayerBoardSpec,
  entries: readonly PlayerEntry[],
  withStats: readonly { stats: TeamPlayerStats; team: Team }[],
): LeaderBoard {
  const tracking = withStats.filter((t) => tracks(t.stats, spec.stat));
  const notTracking = withStats.filter((t) => !tracks(t.stats, spec.stat));
  const value = (e: PlayerEntry) => statOf(e.player, spec.stat) ?? 0;
  const sorted = entries
    .filter((e) => tracks(e.stats, spec.stat) && value(e) > 0)
    .sort(
      (a, b) =>
        value(b) - value(a) ||
        byName(a.player.fullName, b.player.fullName) ||
        byName(a.team.name, b.team.name),
    );
  // Ranked once to 25th: the board's own rows are the places to 10th, the rest wait behind
  // "Show N more" (rankBoard keeps a tie whole, so a tie never straddles the two).
  const ranked = rankBoard(sorted, (a, b) => value(a) === value(b), EXPANDED_PLACES);
  const listed: LeaderRow[] = ranked.map(({ item: e, rank, tied }, i) => ({
    key: `${e.team.slug}:${e.player.careerId ?? `${e.player.shortName}-${i}`}`,
    rank,
    tied,
    name: e.player.fullName,
    team: teamRef(e.team, '#player-stats'),
    cells: spec.columns.map((c) => c.cell(e)),
  }));
  const rows = listed.filter((r) => r.rank <= BOARD_PLACES);
  const extra = listed.slice(rows.length);
  const caption = `${spec.title}, players in all ${LEAGUE_COUNT} leagues, this season`;

  // Name whichever list is shorter: the few teams that do enter the stat, or the few with stats
  // that do not.
  const coverage =
    tracking.length === 0
      ? `None of the ${plural(withStats.length, 'team')} with player stats enters ${spec.statWord}.`
      : notTracking.length === 0
        ? `Every team with player stats enters ${spec.statWord}.`
        : tracking.length <= notTracking.length
          ? `Only ${plural(tracking.length, 'team enters', 'teams enter')} ${spec.statWord}: ${listWords(names(tracking.map((t) => t.team)))}.`
          : `Of the ${plural(withStats.length, 'team')} with player stats, ${listWords(names(notTracking.map((t) => t.team)))} ${notTracking.length === 1 ? 'does' : 'do'} not enter ${spec.statWord}.`;

  return {
    id: spec.id,
    kind: 'player',
    title: spec.title,
    meta: `From ${plural(tracking.length, 'team')}`,
    caption,
    columns: spec.columns.map(({ key, label, title }) => ({ key, label, title })),
    rankedBy: spec.rankedBy,
    rows,
    extra: extra.length
      ? {
          summary: `Show ${plural(extra.length, `more ${spec.who[0]}`, `more ${spec.who[1]}`)}`,
          caption: `${caption}, continued`,
          rows: extra,
        }
      : null,
    note: `${spec.lead} ${coverage}`,
    empty:
      tracking.length === 0
        ? `No team enters ${spec.statWord} on MaxPreps yet.`
        : `No ${spec.who[0]} has any ${spec.statWord} entered yet.`,
  };
}

// ---------------------------------------------------------------- schools

interface SchoolLine {
  team: Team;
  overall: ComputedRecord;
  league: ComputedRecord;
  /** Finals whose goals count: forfeits are left out (DESIGN §11.6). */
  goalGames: number;
  gf: number;
  ga: number;
  cleanSheets: number;
}

function schoolLine(team: Team, standing: Standing, games: readonly Game[]): SchoolLine {
  let goalGames = 0;
  let gf = 0;
  let ga = 0;
  let cleanSheets = 0;
  for (const g of games) {
    if (g.status !== 'final' || g.isForfeit) continue;
    const isHome = g.home.teamId === team.id;
    if (!isHome && g.away.teamId !== team.id) continue;
    const mine = isHome ? g.home : g.away;
    const theirs = isHome ? g.away : g.home;
    if (mine.score === null || theirs.score === null) continue;
    goalGames += 1;
    gf += mine.score;
    ga += theirs.score;
    if (theirs.score === 0) cleanSheets += 1;
  }
  return { team, overall: standing.overall, league: standing.computed, goalGames, gf, ga, cleanSheets };
}

const recordCell = (r: ComputedRecord): LeaderCell => ({ text: recordString(r), sr: recordWords(r) });
const pctCell = (r: ComputedRecord): LeaderCell => ({ text: winPct(r.winPct) });
const gdCell = (r: ComputedRecord): LeaderCell => {
  const text = signedGd(r.gd);
  return { text, sr: r.gd === 0 ? 'even' : r.gd > 0 ? `plus ${r.gd}` : `minus ${-r.gd}` };
};
const rate = (goals: number, games: number) => (games > 0 ? goals / games : 0);
const rateText = (goals: number, games: number) => rate(goals, games).toFixed(2);

/** Win percentage, then more wins, then goal difference; the name orders what is left. */
function recordBoard(
  id: string,
  title: string,
  lines: readonly SchoolLine[],
  pick: (l: SchoolLine) => ComputedRecord,
  min: number,
  unitWord: string,
  note: string,
): LeaderBoard {
  const sorted = lines
    .filter((l) => pick(l).gp >= min)
    .sort(
      (a, b) =>
        pick(b).winPct - pick(a).winPct ||
        pick(b).w - pick(a).w ||
        pick(b).gd - pick(a).gd ||
        byName(a.team.name, b.team.name),
    );
  const same = (a: SchoolLine, b: SchoolLine) =>
    pick(a).winPct === pick(b).winPct && pick(a).w === pick(b).w && pick(a).gd === pick(b).gd;
  return schoolBoard(id, title, `At least ${plural(min, unitWord)}`, sorted, same, {
    columns: [
      { key: 'record', label: 'W-L-T', title: 'Wins, losses and ties', cell: (l) => recordCell(pick(l)) },
      { key: 'pct', label: 'Pct', title: 'Win percentage', cell: (l) => pctCell(pick(l)) },
      { key: 'gd', label: 'GD', title: 'Goal difference', cell: (l) => gdCell(pick(l)) },
    ],
    rankedBy: 1,
    note,
    empty: `No team has ${plural(min, unitWord)} yet.`,
  });
}

function schoolBoard<L extends { team: Team }>(
  id: string,
  title: string,
  meta: string,
  sorted: readonly L[],
  same: (a: L, b: L) => boolean,
  spec: {
    columns: Array<LeaderColumn & { cell: (l: L) => LeaderCell }>;
    rankedBy: number;
    note: string;
    empty: string;
    /** The team page anchor a row links to: '#elo'. */
    anchor?: string;
  },
): LeaderBoard {
  return {
    id,
    kind: 'school',
    title,
    meta,
    caption: `${title}, schools in all ${LEAGUE_COUNT} leagues, this season`,
    columns: spec.columns.map(({ key, label, title: t }) => ({ key, label, title: t })),
    rankedBy: spec.rankedBy,
    rows: rankBoard(sorted, same).map(({ item: l, rank, tied }) => ({
      key: l.team.slug,
      rank,
      tied,
      name: l.team.name,
      team: teamRef(l.team, spec.anchor),
      cells: spec.columns.map((c) => c.cell(l)),
    })),
    extra: null,
    note: spec.note,
    empty: spec.empty,
  };
}

// ---------------------------------------------------------------- the Elo board

export interface EloBoardView {
  /** The `#elo-rating` board: the top 10 places among the teams past the minimum. */
  board: LeaderBoard;
  /** Every rated team's rating, by slug (provisional and preseason ones included). */
  ratingBySlug: Map<TeamSlug, TeamRating>;
  /** The season the ratings start from ("2025-26"); null when every team starts at average. */
  seededFrom: string | null;
  /** The board's minimum: half the median of the rated teams' counted games. */
  minimum: { min: number; median: number };
  /** "Del Mar (1)": teams that have played this season but fewer than the minimum, fewest first. */
  below: string[];
}

/**
 * The Elo board (DESIGN §20), from the same teams and games as the rest of the page. Exported
 * because each team page reads its own place on it: a team page says "3rd on the Elo board"
 * only for a row this board lists, so the two cannot disagree.
 */
export function buildEloBoard(
  teams: readonly Team[],
  games: readonly Game[],
  prior: PriorSeason | null = null,
): EloBoardView {
  const table = computeRatings(teams, games, prior);
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const lines = table.ratings.map((rating) => ({ team: teamById.get(rating.teamId)!, rating }));
  const minimum = qualifyingMinimum(lines.map((l) => l.rating.games));
  // A team with no counted final last season (new to the registry, or only forfeits and unscored
  // games then) has no rating from it and starts at average: say so only when there is one, so
  // the note never claims a start a team did not have.
  const unseeded = table.ratings.some((r) => !r.seeded);
  const seeded = table.seededFrom
    ? `Each team started the season from its ${table.seededFrom} rating (the same fit over last season’s ${plural(table.priorGames, 'final')})${unseeded ? `, or from average if it had no counted ${table.seededFrom} final` : ''}; that start counts for one game and fades as this season’s results come in. `
    : '';
  const sorted = lines
    .filter((l) => l.rating.games >= minimum.min)
    .sort((a, b) => b.rating.elo - a.rating.elo || byName(a.team.name, b.team.name));
  const homeEdge = table.homeEdge > 0 ? `, allowing a home edge of ${plural(table.homeEdge, 'point')}` : '';
  const board = schoolBoard(
    'elo-rating',
    'Highest Elo rating',
    `At least ${plural(minimum.min, 'game')}`,
    sorted,
    (a, b) => a.rating.elo === b.rating.elo,
    {
      columns: [
        { key: 'gp', label: 'GP', title: 'Games counted', cell: (l) => num(l.rating.games) },
        { key: 'elo', label: 'Elo', title: 'Elo rating', cell: (l) => ({ text: String(l.rating.elo) }) },
      ],
      rankedBy: 1,
      anchor: '#elo',
      note:
        `Every final between two of the ${plural(teams.length, 'team')}, league or not, fitted at once: the ratings that best explain each game’s goal margin, counted up to ${MARGIN_CAP} goals${homeEdge}. ` +
        seeded +
        `${ELO_BASE} is an average team and ${ELO_PER_GOAL} points is about a goal, so a team rated 400 points higher is about a 10-to-1 favorite. Forfeits and games against schools outside the ${LEAGUE_COUNT} leagues are left out.`,
      empty: lines.some((l) => l.rating.games > 0)
        ? `No team has played ${plural(minimum.min, 'game')} yet.`
        : `No final between two of the ${plural(teams.length, 'team')} yet this season.`,
    },
  );
  return {
    board,
    ratingBySlug: new Map(lines.map((l) => [l.team.slug, l.rating])),
    seededFrom: table.seededFrom,
    minimum,
    below: lines
      .filter((l) => l.rating.games > 0 && l.rating.games < minimum.min)
      .sort((a, b) => a.rating.games - b.rating.games || byName(a.team.name, b.team.name))
      .map((l) => `${l.team.name} (${l.rating.games})`),
  };
}

/**
 * "Del Mar (1), Live Oak (2)": the teams that have played (`played`, the board's own count unless
 * given), but fewer than `min` of the games this board counts.
 */
function belowMinimum(
  lines: readonly SchoolLine[],
  gp: (l: SchoolLine) => number,
  min: number,
  played: (l: SchoolLine) => number = gp,
): string[] {
  return lines
    .filter((l) => played(l) > 0 && gp(l) < min)
    .sort((a, b) => gp(a) - gp(b) || byName(a.team.name, b.team.name))
    .map((l) => `${l.team.name} (${gp(l)})`);
}

// ---------------------------------------------------------------- the page

export function buildLeadersView(sources: LeaderSources = defaultSources()): LeadersView {
  const { teams, stats, standings, games } = sources;
  const teamBySlug = new Map(teams.map((t) => [t.slug, t]));

  // ---- players
  const withStats = stats
    .filter((s) => s.players.length > 0 && teamBySlug.has(s.slug))
    .map((s) => ({ stats: s, team: teamBySlug.get(s.slug)! }));
  const entries: PlayerEntry[] = withStats.flatMap(({ stats: s, team }) =>
    s.players.map((player) => ({ player, stats: s, team })),
  );
  const players = PLAYER_BOARDS.map((spec) => playerBoard(spec, entries, withStats));

  const statSlugs = new Set(withStats.map((t) => t.team.slug));
  const noStats = teams.filter((t) => !statSlugs.has(t.slug));
  const playerNotes: string[] = [
    `Season totals for every varsity game, league and non-league, as each team’s coach entered them on MaxPreps. ` +
      (noStats.length === 0
        ? `All ${plural(teams.length, 'team')} have entered player stats.`
        : `${withStats.length} of the ${plural(teams.length, 'team')} have entered some. ${listWords(names(noStats))} ${noStats.length === 1 ? 'has' : 'have'} entered none, so ${noStats.length === 1 ? 'its' : 'their'} players cannot appear here.`),
  ];
  const behind = withStats
    .map(({ stats: s, team }) => ({
      team,
      since: gamesSinceUpdate(
        s.lastUpdated,
        games.filter((g) => g.home.teamId === team.id || g.away.teamId === team.id),
      ),
      updated: s.lastUpdated ? shortDate(s.lastUpdated.slice(0, 10)) : null,
    }))
    .filter((b) => b.since > 0 && b.updated !== null)
    .sort((a, b) => b.since - a.since || byName(a.team.name, b.team.name));
  if (behind.length > 0) {
    playerNotes.push(
      `Totals lag the scores where a coach has not entered the latest games: ${behind
        .map((b) => `${b.team.name} (${plural(b.since, 'game')} since ${b.updated})`)
        .join(', ')}.`,
    );
  }
  const carried = withStats.filter((t) => t.stats.status === 'carried-forward').map((t) => t.team);
  if (carried.length > 0) {
    playerNotes.push(
      `The latest stats update could not reach MaxPreps for ${listWords(names(carried))}, so ${carried.length === 1 ? 'its numbers are' : 'their numbers are'} from an earlier one.`,
    );
  }

  // ---- schools
  const standingById = new Map(standings.map((s) => [s.teamId, s]));
  const lines = teams.flatMap((t) => {
    const s = standingById.get(t.id);
    return s ? [schoolLine(t, s, games)] : [];
  });
  const overallMin = qualifyingMinimum(lines.map((l) => l.overall.gp));
  const leagueMin = qualifyingMinimum(lines.map((l) => l.league.gp));

  const elo = buildEloBoard(teams, games, sources.prior ?? null);
  const schools: LeaderBoard[] = [
    recordBoard(
      'best-record',
      'Best record',
      lines,
      (l) => l.overall,
      overallMin.min,
      'game',
      'Every final, league and non-league, postseason included: the overall record on each team’s page. A tie counts as half a win; equal percentages are split by more wins, then goal difference.',
    ),
    recordBoard(
      'best-league-record',
      'Best league record',
      lines,
      (l) => l.league,
      leagueMin.min,
      'league game',
      'League games only, as the standings count them. Leagues play different numbers of league games, so this compares percentages, not points.',
    ),
    schoolBoard(
      'most-goals',
      'Most goals per game',
      `At least ${plural(overallMin.min, 'game')}`,
      lines
        .filter((l) => l.goalGames >= overallMin.min && l.gf > 0)
        .sort(
          (a, b) =>
            rate(b.gf, b.goalGames) - rate(a.gf, a.goalGames) ||
            b.goalGames - a.goalGames ||
            byName(a.team.name, b.team.name),
        ),
      // Equal rates are split by more games played, so a shared place is an equal rate over the
      // same number of games (cross-multiplied: no float compare).
      (a, b) => a.gf * b.goalGames === b.gf * a.goalGames && a.goalGames === b.goalGames,
      {
        columns: [
          { key: 'gp', label: 'GP', title: 'Games played', cell: (l) => num(l.goalGames) },
          { key: 'gf', label: 'GF', title: 'Goals for', cell: (l) => num(l.gf) },
          { key: 'perGame', label: 'Avg', title: 'Goals for per game', cell: (l) => ({ text: rateText(l.gf, l.goalGames) }) },
        ],
        rankedBy: 2,
        note: 'Goals scored in every final, divided by the games played. Equal rates are split by more games played. Forfeits count in records but not in goals, so a forfeit is left out of both numbers here.',
        empty: lines.some((l) => l.goalGames >= overallMin.min)
          ? `None of the teams with at least ${plural(overallMin.min, 'game')} has scored yet.`
          : `No team has played ${plural(overallMin.min, 'game')} yet.`,
      },
    ),
    schoolBoard(
      'fewest-goals-allowed',
      'Fewest goals allowed per game',
      `At least ${plural(overallMin.min, 'game')}`,
      lines
        .filter((l) => l.goalGames >= overallMin.min)
        .sort(
          (a, b) =>
            rate(a.ga, a.goalGames) - rate(b.ga, b.goalGames) ||
            b.goalGames - a.goalGames ||
            byName(a.team.name, b.team.name),
        ),
      (a, b) => a.ga * b.goalGames === b.ga * a.goalGames && a.goalGames === b.goalGames,
      {
        columns: [
          { key: 'gp', label: 'GP', title: 'Games played', cell: (l) => num(l.goalGames) },
          { key: 'ga', label: 'GA', title: 'Goals against', cell: (l) => num(l.ga) },
          { key: 'perGame', label: 'Avg', title: 'Goals against per game', cell: (l) => ({ text: rateText(l.ga, l.goalGames) }) },
        ],
        rankedBy: 2,
        note: 'Goals conceded in every final, divided by the games played. Equal rates are split by more games played.',
        empty: `No team has played ${plural(overallMin.min, 'game')} yet.`,
      },
    ),
    schoolBoard(
      'school-clean-sheets',
      'Most clean sheets',
      `From all ${plural(lines.length, 'team')}`,
      lines
        .filter((l) => l.cleanSheets > 0)
        .sort((a, b) => b.cleanSheets - a.cleanSheets || byName(a.team.name, b.team.name)),
      (a, b) => a.cleanSheets === b.cleanSheets,
      {
        columns: [
          { key: 'gp', label: 'GP', title: 'Games played', cell: (l) => num(l.goalGames) },
          { key: 'cleanSheets', label: 'CS', title: 'Clean sheets', cell: (l) => num(l.cleanSheets) },
        ],
        rankedBy: 1,
        note: 'Finals in which the team did not concede, counted from every score on this site, so every team counts. The goalkeepers’ board counts only what coaches enter.',
        empty: 'No team has kept a clean sheet yet.',
      },
    ),
    // Last of the school boards (DESIGN §23).
    elo.board,
  ];

  const schoolNotes: string[] = [];
  const notYet = (below: string[]) => (below.length ? `; not there yet: ${listWords(below)}.` : '.');
  const overallBelow = belowMinimum(lines, (l) => l.overall.gp, overallMin.min);
  // The rate boards count only games with goals, and a forfeit has none, so a forfeit can leave a
  // school past the record minimum and short of the rate one: it is named for each it misses.
  const rateBelow = belowMinimum(lines, (l) => l.goalGames, overallMin.min, (l) => l.overall.gp);
  const leagueBelow = belowMinimum(lines, (l) => l.league.gp, leagueMin.min);
  if (overallMin.median > 0) {
    const lead = `need at least ${plural(overallMin.min, 'result')}, half the median of ${overallMin.median}`;
    if (rateBelow.join() === overallBelow.join()) {
      schoolNotes.push(`Records and goals per game ${lead}${notYet(overallBelow)}`);
    } else {
      schoolNotes.push(`Records ${lead}${notYet(overallBelow)}`);
      schoolNotes.push(
        `Goals per game need at least ${plural(overallMin.min, 'game')} with goals counted (a forfeit has none)${notYet(rateBelow)}`,
      );
    }
  }
  if (leagueMin.median > 0) {
    schoolNotes.push(
      `The league record needs at least ${plural(leagueMin.min, 'league result')}, half the median of ${leagueMin.median}${notYet(leagueBelow)}`,
    );
  }
  if (elo.minimum.median > 0) {
    schoolNotes.push(
      `The Elo board needs at least ${plural(elo.minimum.min, 'game')} against the ${LEAGUE_COUNT} leagues’ teams, half the median of ${elo.minimum.median}${notYet(elo.below)}`,
    );
  }

  const finals = games.filter((g) => g.status === 'final').map((g) => g.dateKey).sort();
  return {
    players,
    schools,
    playerNotes,
    schoolNotes,
    statTeams: withStats.length,
    teamCount: teams.length,
    resultsThrough: finals.length ? shortDate(finals[finals.length - 1]) : null,
  };
}
