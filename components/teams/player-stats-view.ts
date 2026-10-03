import { shortDate } from '../../lib/format';
import { getTeamPlayerStats } from '../../lib/player-stats';
import type {
  FieldStatKey,
  GoalieStatKey,
  PlayerStatLine,
  TeamPlayerStats,
} from '../../lib/player-stats-schema';
import type { Game, TeamSlug } from '../../lib/types';

/**
 * The team page's player stats section (SPEC §1.1k), derived from data/player-stats.json, for every
 * team of all four leagues. Pure, so tests/ui/player-stats-view.test.ts can assert it over the real
 * file.
 *
 * Three blocks, each shown only when the team has something for it:
 *   - Scoring: games, goals, assists, points — the columns every stat-keeping coach fills in;
 *   - More: shots, shots on goal, game-winning goals, steals — only the ones this team tracks,
 *     and only the players with at least one of them;
 *   - Goalkeeping: one card per goalkeeper, since a team can track up to ten goalie stats and a
 *     table that wide cannot reflow at 320px (DESIGN §10.8).
 *
 * A column the team does not track never appears (lib/player-stats-schema.ts: untracked is null
 * for everyone). A tracked stat a player has no entry for prints as a dash, never as 0.
 *
 * Goalkeeping is printed as entered, with one figure this module works out: Save %, saves over
 * saves plus goals against. It is the only number on the section the coach did not type, so the
 * section says so, and it is left out of any card whose entered figures cannot all be true: the
 * coach's "opponent shots on goal" below saves plus goals against (Leland, 2026-10-03: 10 shots
 * on goal, 36 saves, 9 against). The card says the figures disagree instead.
 */

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
}

export interface StatTable {
  columns: StatColumn[];
  rows: StatRow[];
}

export interface GoalieCard {
  key: string;
  name: string;
  jersey: string | null;
  /** In GOALIE order; `text` null prints as a dash with "not recorded" for a screen reader. */
  stats: Array<{ label: string; text: string | null }>;
  /** Why no Save % is shown although saves and goals against are tracked, or null. */
  flag: string | null;
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
  /** Points are on the scoring table: the legend explains MaxPreps' 2-per-goal rule. */
  showsPoints: boolean;
  /** Some goalkeeper card shows a Save %, which this site works out: the footnote says how. */
  showsSavePercent: boolean;
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

function table(
  team: TeamPlayerStats,
  spec: typeof SCORING,
  players: PlayerStatLine[],
  keep: (values: Array<number | null>) => boolean,
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

function goalieCard(team: TeamPlayerStats, p: PlayerStatLine, i: number): GoalieCard {
  const tracked = new Set<string>(team.tracked.goalkeeping);
  const g = p.goalkeeping!;
  const disagree = goalieFiguresDisagree(g);
  const stats: GoalieCard['stats'] = [];
  let flag: string | null = null;
  for (const s of GOALIE) {
    if (!tracked.has(s.key)) continue;
    stats.push({ label: s.label, text: statText(g[s.key]) });
    // Save % sits right after goals against, only where both halves are tracked and entered, and
    // never beside figures that contradict each other.
    if (s.key === 'goalsAgainst' && tracked.has('saves') && g.saves !== null && g.goalsAgainst !== null) {
      const pct = savePercent(g.saves, g.goalsAgainst);
      if (pct && !disagree) stats.push({ label: 'Save %', text: pct });
    }
  }
  if (disagree) {
    const accounted =
      g.saves !== null && g.goalsAgainst !== null
        ? `${statText(g.saves + g.goalsAgainst)} saves plus goals against`
        : g.saves !== null
          ? `${statText(g.saves)} saves`
          : `${statText(g.goalsAgainst)} goals against`;
    const hidesPercent = g.saves !== null && g.goalsAgainst !== null && savePercent(g.saves, g.goalsAgainst) !== null;
    flag =
      `As entered, these cannot all be right: ${statText(g.opponentShotsOnGoal)} opponent shots on goal, ` +
      `but ${accounted}.${hidesPercent ? ' No save % is worked out.' : ''}`;
  }
  return { key: p.careerId ?? `${p.shortName}-${i}`, name: p.fullName, jersey: p.jersey, stats, flag };
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

/**
 * The player stats section for any registry team, in every league. null only for a slug
 * data/player-stats.json does not hold (not a registry team). A team whose coach enters no stats
 * still gets a view, with no tables, and the section says so (status 'none'); one no run has
 * covered yet has status 'pending' and says that instead; one whose fetch failed with nothing to
 * fall back on has status 'error'. Never throws for a registry slug.
 *
 * @param games the team's league and non-league contests, to count finals played after MaxPreps'
 *   last stats update.
 * @param team the team's stats; defaults to data/player-stats.json's. Tests pass a fixture build,
 *   since the committed file moves with every refresh.
 */
export function buildPlayerStatsView(
  slug: TeamSlug,
  games: readonly Game[] = [],
  team: TeamPlayerStats | undefined = getTeamPlayerStats(slug),
): PlayerStatsView | null {
  if (!team) return null;

  const updatedDay = team.lastUpdated?.slice(0, 10) ?? null;
  const gamesSince = gamesSinceUpdate(team.lastUpdated, games);

  const field = team.players.filter((p) => p.field !== null).sort(byScoring);
  const scoring = table(team, SCORING, field, () => true);
  // The "more" table lists only players with at least one of its numbers above zero.
  const more = table(team, MORE, field, (values) => values.some((v) => v !== null && v > 0));

  const goalies = team.players
    .filter((p) => p.goalkeeping !== null)
    .sort(byTimeInGoal)
    .map((p, i) => goalieCard(team, p, i))
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
  };
}
