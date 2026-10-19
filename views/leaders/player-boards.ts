/**
 * The /leaders player boards (data/player-stats.json): most points, Elo-adjusted points, assists, saves
 * and clean sheets, plus the notes under them. A player's numbers are exactly what the team page shows:
 * season totals as the coach entered them on MaxPreps, plus the goals and saves the coach wrote in game
 * notes instead (lib/engine/note-stats.ts). Their grade and position are the team page's roster row's
 * (lib/datasets/rosters.ts, joined on the stat line's athleteId), in the roster's words; a player the join misses
 * shows neither. Only teams whose coach tracks a stat can appear on its board, so every board says how
 * many teams it covers and names the ones it leaves out, and the section says whose totals are behind the
 * scores. A 0 never leads a board, and an untracked stat is never read as a 0.
 *
 * A player's Elo-adjusted points (lib/engine/adjusted-scoring.ts) are their points times their team's schedule
 * factor, so only a player whose team is past the Elo board's minimum is ranked: a factor from two games
 * is mostly noise.
 */

import type { AdjustedScoring } from '@/lib/engine/adjusted-scoring';
import { notedKinds } from '@/lib/engine/note-stats';
import { shortDate } from '@/lib/format/dates';
import { agree, gradeWord, listWords, plural } from '@/lib/format/words';
import type { Game } from '@/lib/model/game';
import type { TeamId } from '@/lib/model/ids';
import type { Team } from '@/lib/model/team';
import type { FieldStatKey, GoalieStatKey, PlayerStatLine, TeamPlayerStats } from '@/lib/schema/player-stats';
import { gamesSinceUpdate, savePercent } from '@/views/shared/stat-format';
import { positionWords } from '@/views/shared/words/position';

import { UNADJUSTED_NOTE, names, num, teamRef } from './board';
import { BOARD_PLACES, EXPANDED_PLACES, byName, rankBoard } from './ranking';
import type { BoardScope } from './scope';
import type { LaggingStats, LeaderBoard, LeaderColumnSpec, LeaderRow, RosterSource } from './types';

type StatRef = { block: 'field'; key: FieldStatKey } | { block: 'goalkeeping'; key: GoalieStatKey };

interface PlayerEntry {
  player: PlayerStatLine;
  stats: TeamPlayerStats;
  team: Team;
  /** LeaderRow.facts: the grade and position on the player's roster row. */
  facts: string[];
  /**
   * The team's schedule factor (lib/engine/adjusted-scoring.ts), or null when the team is under the Elo
   * board's minimum: too few games for one.
   */
  factor: number | null;
}

/** A team with player stats, and its schedule factor as PlayerEntry has it. */
interface StatTeam {
  stats: TeamPlayerStats;
  team: Team;
  factor: number | null;
}

interface PlayerBoardSpec {
  id: string;
  title: string;
  navLabel: string;
  /** The stat in a sentence: "assists", "clean sheets". */
  statWord: string;
  /** Who can lead it: "player" or "goalkeeper". */
  who: [string, string];
  stat: StatRef;
  columns: LeaderColumnSpec<PlayerEntry>[];
  rankedBy: number;
  /** Said under the board before the coverage sentence. */
  lead: string;
  /** LeaderBoard.method: how a derived number is worked out. */
  method?: string;
  /**
   * What the board ranks on, when it is not `stat` itself; null leaves the player off. A board with
   * one ranks only players whose team has a schedule factor, and names the teams without one.
   */
  value?: (e: PlayerEntry) => number | null;
}

const statOf = (p: PlayerStatLine, ref: StatRef): number | null =>
  ref.block === 'field' ? (p.field?.[ref.key] ?? null) : (p.goalkeeping?.[ref.key] ?? null);

const tracks = (t: TeamPlayerStats, ref: StatRef): boolean =>
  ref.block === 'field'
    ? t.tracked.field.includes(ref.key)
    : t.tracked.goalkeeping.includes(ref.key);

/** `v` to one decimal place: an adjusted number is ranked, and ties are shared, as printed. */
const tenths = (v: number) => Math.round(v * 10) / 10;
/** The schedule factor as the × column prints it (two places). */
const printedFactor = (factor: number) => Math.round(factor * 100) / 100;
/**
 * A player's Elo-adjusted points: their points times the team's schedule factor AS PRINTED, so a reader
 * multiplying the row's Pts by its × gets its Adj.
 */
const adjustedPoints = (e: PlayerEntry): number | null => {
  const points = e.player.field?.points ?? null;
  return points === null || e.factor === null ? null : tenths(points * printedFactor(e.factor));
};
const field = (key: FieldStatKey) => (e: PlayerEntry) => num(e.player.field?.[key] ?? null);
const keeper = (key: GoalieStatKey) => (e: PlayerEntry) => num(e.player.goalkeeping?.[key] ?? null);

const PLAYER_BOARDS: PlayerBoardSpec[] = [
  {
    id: 'most-points',
    title: 'Most points',
    navLabel: 'Points',
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
    id: 'adjusted-points',
    title: 'Most Elo-adjusted points',
    navLabel: 'Adjusted points',
    statWord: 'points',
    who: ['player', 'players'],
    stat: { block: 'field', key: 'points' },
    columns: [
      { key: 'points', label: 'Pts', title: 'Points', cell: field('points') },
      {
        key: 'factor',
        label: '×',
        title: 'Schedule factor',
        cell: (e) => ({ text: e.factor === null ? null : printedFactor(e.factor).toFixed(2) }),
      },
      {
        key: 'adjustedPoints',
        label: 'Adj',
        title: 'Elo-adjusted points',
        cell: (e) => {
          const v = adjustedPoints(e);
          return { text: v === null ? null : v.toFixed(1) };
        },
      },
    ],
    rankedBy: 2,
    lead: 'Points times the team’s schedule factor (the × column); above 1 is a harder schedule than average.',
    method:
      'The factor is how much harder the defenses the team met, and where, were than average, from their Elo ratings and the goals they have allowed. ' +
      'Season totals have no game-by-game split, so a player’s points are weighed like the team’s goals, and the factor covers all its counted games even where its totals lag.',
    value: adjustedPoints,
  },
  {
    id: 'most-assists',
    title: 'Most assists',
    navLabel: 'Assists',
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
    navLabel: 'Saves',
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
          // Saves that include a game note's cover other games than the goals against: no Sv%.
          const mixed = notedKinds(e.stats, e.player).has('saves');
          return {
            text: both && !mixed && g && g.saves !== null && g.goalsAgainst !== null ? savePercent(g.saves, g.goalsAgainst) : null,
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
    navLabel: 'Keeper clean sheets',
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

/** The grade and position(s) the team page's roster prints for a player, only those it has. */
function playerFacts(p: RosterSource['players'][number]): string[] {
  const facts: string[] = [];
  if (p.grade !== null) facts.push(gradeWord(p.grade));
  if (p.positions.length > 0) facts.push(positionWords(p.positions));
  return facts;
}

function playerBoard(
  spec: PlayerBoardSpec,
  entries: readonly PlayerEntry[],
  withStats: readonly StatTeam[],
  scope: BoardScope,
  unadjusted: boolean,
): LeaderBoard {
  const tracking = withStats.filter((t) => tracks(t.stats, spec.stat));
  const notTracking = withStats.filter((t) => !tracks(t.stats, spec.stat));
  const value = (e: PlayerEntry) => (spec.value ? spec.value(e) : statOf(e.player, spec.stat)) ?? 0;
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
    facts: e.facts,
    team: teamRef(e.team, '#player-stats'),
    cells: spec.columns.map((c) => c.cell(e)),
  }));
  const rows = listed.filter((r) => r.rank <= BOARD_PLACES);
  const extra = listed.slice(rows.length);
  const caption = `${spec.title}, players in ${scope.leagues}, this season`;

  // Name whichever list is shorter: the few teams that do enter the stat, or the few with stats
  // that do not.
  const coverage =
    tracking.length === 0
      ? `None of the ${plural(withStats.length, 'team')} with player stats enters ${spec.statWord}.`
      : notTracking.length === 0
        ? `Every team with player stats enters ${spec.statWord}.`
        : tracking.length <= notTracking.length
          ? `Only ${plural(tracking.length, 'team enters', 'teams enter')} ${spec.statWord}: ${listWords(names(tracking.map((t) => t.team)))}.`
          : `Of the ${plural(withStats.length, 'team')} with player stats, ${listWords(names(notTracking.map((t) => t.team)))} ${agree(notTracking.length, 'does', 'do')} not enter ${spec.statWord}.`;

  // An adjusted board names the teams that enter the stat but have no schedule factor yet.
  const unfactored = spec.value ? tracking.filter((t) => t.factor === null).map((t) => t.team) : [];
  const unfactoredNote = unfactored.length
    ? ` ${listWords(names(unfactored))} ${agree(unfactored.length, 'has', 'have')} not played enough counted games for a schedule factor yet.`
    : '';

  return {
    id: `${spec.id}${scope.suffix}`,
    kind: 'player',
    title: spec.title,
    navLabel: spec.navLabel,
    // An adjusted board ranks only the teams with a schedule factor, so it counts those.
    meta: `From ${plural(tracking.length - unfactored.length, 'team')}`,
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
    note: `${spec.lead} ${coverage}${unfactoredNote}${spec.value && unadjusted ? UNADJUSTED_NOTE : ''}`,
    method: spec.method ?? null,
    empty:
      tracking.length === 0
        ? `No team enters ${spec.statWord} on MaxPreps yet.`
        : unfactored.length === tracking.length
          ? `No team that enters ${spec.statWord} has played enough counted games for a schedule factor yet.`
          : unfactored.length > 0
            ? `No ${spec.who[0]} on a team with a schedule factor has any ${spec.statWord} entered yet.`
            : `No ${spec.who[0]} has any ${spec.statWord} entered yet.`,
  };
}

export interface PlayerBoardsInput {
  /** The region's teams (registry order). */
  teams: readonly Team[];
  stats: readonly TeamPlayerStats[];
  games: readonly Game[];
  rosters: readonly RosterSource[];
  adjusted: ReadonlyMap<TeamId, AdjustedScoring>;
  /** The Elo board's minimum: a team past it has a schedule factor. */
  factorMin: number;
  unadjusted: boolean;
  scope: BoardScope;
}

export interface PlayerBoards {
  boards: LeaderBoard[];
  /** Whose stats are missing, and whose are carried forward from an earlier update. */
  notes: string[];
  /** Whose totals are behind the scores; null when nobody's are. */
  lagging: LaggingStats | null;
  /** The region's teams with at least one player stat line. */
  statTeams: number;
}

/** One region's player boards, in page order, and the notes under them. */
export function buildPlayerBoards(input: PlayerBoardsInput): PlayerBoards {
  const { teams, stats, games, rosters, adjusted, factorMin, unadjusted, scope } = input;
  const teamBySlug = new Map(teams.map((t) => [t.slug, t]));
  const factsByPlayer = new Map(
    rosters.flatMap((r) =>
      r.players.flatMap((p) => (p.athleteId === null ? [] : [[`${r.slug}:${p.athleteId}`, playerFacts(p)] as const])),
    ),
  );
  // The schedule factor of a team past the Elo board's minimum (the games both count are the same).
  const factorOf = (team: Team): number | null => {
    const a = adjusted.get(team.id);
    return a && a.games >= factorMin ? a.factor : null;
  };

  const withStats: StatTeam[] = stats
    .filter((s) => s.players.length > 0 && teamBySlug.has(s.slug))
    .map((s) => {
      const team = teamBySlug.get(s.slug)!;
      return { stats: s, team, factor: factorOf(team) };
    });
  const entries: PlayerEntry[] = withStats.flatMap(({ stats: s, team, factor }) =>
    s.players.map((player) => ({
      player,
      stats: s,
      team,
      facts: (player.athleteId === null ? undefined : factsByPlayer.get(`${s.slug}:${player.athleteId}`)) ?? [],
      factor,
    })),
  );
  const boards = PLAYER_BOARDS.map((spec) => playerBoard(spec, entries, withStats, scope, unadjusted));

  const statSlugs = new Set(withStats.map((t) => t.team.slug));
  const noStats = teams.filter((t) => !statSlugs.has(t.slug));
  const notes: string[] = [
    `Season totals for every varsity game, league and non-league, as each team’s coach entered them on MaxPreps. ` +
      (noStats.length === 0
        ? `All ${plural(teams.length, 'team')} have entered player stats.`
        : `${withStats.length} of the ${plural(teams.length, 'team')} have entered some. ${listWords(names(noStats))} ${agree(noStats.length, 'has', 'have')} entered none, so ${noStats.length === 1 ? 'its' : 'their'} players cannot appear here.`),
  ];
  const carried = withStats.filter((t) => t.stats.status === 'carried-forward').map((t) => t.team);
  if (carried.length > 0) {
    notes.push(
      `The latest stats update could not reach MaxPreps for ${listWords(names(carried))}, so ${carried.length === 1 ? 'its numbers are' : 'their numbers are'} from an earlier one.`,
    );
  }

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
  const lagging: LaggingStats | null = behind.length
    ? {
        summary: `${plural(behind.length, 'team’s totals lag', 'teams’ totals lag')} the scores`,
        items: behind.map((b) => `${b.team.name}: ${plural(b.since, 'game')} since ${b.updated}`),
      }
    : null;

  return { boards, notes, lagging, statTeams: withStats.length };
}
