/**
 * Standings computed from game rows, per the SCVAL Field Hockey By-Laws 2026-27.
 *
 * Article VI §1: the divisions play a double round robin; DIVISION GAMES ONLY count to the
 *   division record.
 * Article VI §2: 3 points for a win, 1 for a tie. "The division placement/standings will be the
 *   order of team points." A tie at the top means co-champions.
 * Article VI §3: if tied in points, better head-to-head record among the tied teams. "Work to
 *   bring one team out (once one is out start again through the tie breakers)."
 * Article VI §4: then the greater number of wins in division play.
 * Article VI §5: then the least goals given up between the tied teams.
 * Article VI §6: then goal differential between the tied teams.
 * Article VI §7: then a coin flip — which we cannot compute, so those teams SHARE a place and
 *   carry `tiebreak.shared`.
 * Article VII §2: places 1-3 are automatic qualifiers; 4th plays in on Oct 30 for the SCVAL 7th
 *   AQ; the play-in loser and both 5th-place teams go to CCS for at-large consideration.
 *
 * MaxPreps' own row is kept verbatim on every Standing for the published cross-check: its De Anza
 * arithmetic is internally suspect (Homestead and Cupertino both report 0 league goals for),
 * which is exactly why we compute and publish the disagreement instead of trusting it.
 */

import { BYLAW_CITATIONS, DIVISIONS, DIVISION_LABELS, leagueStandingsUrl } from './season';
import { TEAMS, getTeamById, teamsInDivision } from './teams';
import type {
  ComputedRecord,
  CrossCheckRow,
  CrossoverPairing,
  CrossoverSeat,
  Division,
  Game,
  Outcome,
  PlayoffStatus,
  Record3,
  ReportedRecord,
  Standing,
  Team,
  TeamId,
  TiebreakInfo,
  TiebreakStage,
} from './types';

// ---------------------------------------------------------------- accumulation

interface Tally {
  gp: number;
  w: number;
  l: number;
  t: number;
  gf: number;
  ga: number;
  home: Record3;
  away: Record3;
  neutral: Record3;
  /** Oldest → newest. */
  results: Outcome[];
}

const emptyRecord3 = (): Record3 => ({ w: 0, l: 0, t: 0 });

const emptyTally = (): Tally => ({
  gp: 0,
  w: 0,
  l: 0,
  t: 0,
  gf: 0,
  ga: 0,
  home: emptyRecord3(),
  away: emptyRecord3(),
  neutral: emptyRecord3(),
  results: [],
});

function bump(rec: Record3, outcome: Outcome): void {
  if (outcome === 'W') rec.w += 1;
  else if (outcome === 'L') rec.l += 1;
  else rec.t += 1;
}

/** A completed game as seen from one team. Returns null when the team is not in it. */
function perspective(
  game: Game,
  teamId: TeamId,
): { for: number; against: number; outcome: Outcome; site: Game['site'] } | null {
  const isHome = game.home.teamId === teamId;
  const isAway = game.away.teamId === teamId;
  if (!isHome && !isAway) return null;
  const mine = isHome ? game.home : game.away;
  const theirs = isHome ? game.away : game.home;
  if (mine.score === null || theirs.score === null) return null;
  const outcome: Outcome =
    mine.score > theirs.score ? 'W' : mine.score < theirs.score ? 'L' : 'T';
  return {
    for: mine.score,
    against: theirs.score,
    outcome,
    site: game.site === 'neutral' ? 'neutral' : isHome ? 'home' : 'away',
  };
}

function accumulate(tally: Tally, game: Game, teamId: TeamId): void {
  const view = perspective(game, teamId);
  if (!view) return;
  tally.gp += 1;
  if (view.outcome === 'W') tally.w += 1;
  else if (view.outcome === 'L') tally.l += 1;
  else tally.t += 1;
  // Forfeits count in W-L-T but NOT in goals (DESIGN §11.6).
  if (!game.isForfeit) {
    tally.gf += view.for;
    tally.ga += view.against;
  }
  bump(
    view.site === 'home' ? tally.home : view.site === 'away' ? tally.away : tally.neutral,
    view.outcome,
  );
  tally.results.push(view.outcome);
}

/** Tally → the published record. `place` is filled in once the order is known. */
function toComputed(tally: Tally, place: number): ComputedRecord {
  const { gp, w, l, t } = tally;
  const last5 = tally.results.slice(-5);
  let streak: ComputedRecord['streak'] = null;
  if (tally.results.length > 0) {
    const newest = tally.results[tally.results.length - 1];
    let count = 0;
    for (let i = tally.results.length - 1; i >= 0 && tally.results[i] === newest; i -= 1) count += 1;
    streak = { count, result: newest };
  }
  return {
    gp,
    w,
    l,
    t,
    // CIF convention: a tie is half a win. Asserted against MaxPreps' own pct (SPEC §5.6).
    winPct: gp > 0 ? (w + t / 2) / gp : 0,
    // Article VI §2.
    pts: 3 * w + t,
    gf: tally.gf,
    ga: tally.ga,
    gd: tally.gf - tally.ga,
    streak,
    last5,
    homeRecord: tally.home,
    awayRecord: tally.away,
    neutralRecord: tally.neutral,
    place,
  };
}

/** Division games only, final only (Article VI §1). */
export function divisionGames(games: readonly Game[], division: Division): Game[] {
  return games
    .filter(
      (g) => g.isLeague && g.leagueDivision === division && g.status === 'final',
    )
    .sort((a, b) => a.dateLocal.localeCompare(b.dateLocal));
}

// ---------------------------------------------------------------- tiebreakers

interface H2H {
  gp: number;
  w: number;
  l: number;
  t: number;
  gf: number;
  ga: number;
}

const emptyH2H = (): H2H => ({ gp: 0, w: 0, l: 0, t: 0, gf: 0, ga: 0 });

/** Head-to-head sub-table over the games played among `group` only (Article VI §3, §5, §6). */
function headToHead(group: readonly TeamId[], games: readonly Game[]): Map<TeamId, H2H> {
  const set = new Set(group);
  const out = new Map<TeamId, H2H>(group.map((id) => [id, emptyH2H()]));
  for (const game of games) {
    const h = game.home.teamId;
    const a = game.away.teamId;
    if (!h || !a || !set.has(h) || !set.has(a)) continue;
    for (const id of [h, a]) {
      const view = perspective(game, id);
      const row = out.get(id);
      if (!view || !row) continue;
      row.gp += 1;
      if (view.outcome === 'W') row.w += 1;
      else if (view.outcome === 'L') row.l += 1;
      else row.t += 1;
      if (!game.isForfeit) {
        row.gf += view.for;
        row.ga += view.against;
      }
    }
  }
  return out;
}

const STAGES: readonly Exclude<TiebreakStage, 'points' | 'coin-flip'>[] = [
  'head-to-head',
  'division-wins',
  'h2h-goals-against',
  'h2h-goal-diff',
];

const STAGE_CITATION: Record<TiebreakStage, string> = {
  points: BYLAW_CITATIONS.order,
  'head-to-head': BYLAW_CITATIONS.headToHead,
  'division-wins': BYLAW_CITATIONS.divisionWins,
  'h2h-goals-against': BYLAW_CITATIONS.h2hGoalsAgainst,
  'h2h-goal-diff': BYLAW_CITATIONS.h2hGoalDiff,
  'coin-flip': BYLAW_CITATIONS.coinFlip,
};

/** Higher is better for every stage. */
function stageKey(
  stage: (typeof STAGES)[number],
  id: TeamId,
  h2h: Map<TeamId, H2H>,
  computed: Map<TeamId, ComputedRecord>,
  allEqualGp: boolean,
): number {
  const row = h2h.get(id) ?? emptyH2H();
  switch (stage) {
    case 'head-to-head':
      // "Better head-to-head record". With an equal number of head-to-head games the by-laws'
      // own currency (points) ranks them; with an unequal number (mid-season, or an unplayed
      // fixture) points would reward the team that simply played more, so use win percentage.
      return allEqualGp ? 3 * row.w + row.t : row.gp > 0 ? (row.w + row.t / 2) / row.gp : 0;
    case 'division-wins':
      return computed.get(id)?.w ?? 0;
    case 'h2h-goals-against':
      // "Least goals given up between head to head teams tied" — fewer is better.
      return -row.ga;
    case 'h2h-goal-diff':
      return row.gf - row.ga;
  }
}

function resolveGroup(
  group: readonly TeamId[],
  games: readonly Game[],
  computed: Map<TeamId, ComputedRecord>,
  resolvedBy: Map<TeamId, TiebreakStage>,
  startStage = 0,
): TeamId[][] {
  if (group.length <= 1) return [[...group]];

  const h2h = headToHead(group, games);
  const gps = group.map((id) => h2h.get(id)?.gp ?? 0);
  const allEqualGp = gps.every((g) => g === gps[0]);

  for (let s = startStage; s < STAGES.length; s += 1) {
    const stage = STAGES[s];
    const keyed = group.map((id) => ({ id, key: stageKey(stage, id, h2h, computed, allEqualGp) }));
    const distinct = new Set(keyed.map((k) => k.key));
    if (distinct.size === 1) continue;

    // This stage brings at least one team out. Partition into buckets, best first, then start
    // the chain again for each bucket (Article VI §3: "once one is out start again").
    const buckets = [...distinct]
      .sort((a, b) => b - a)
      .map((key) => keyed.filter((k) => k.key === key).map((k) => k.id));
    const out: TeamId[][] = [];
    for (const bucket of buckets) {
      // Recorded now and overwritten by a deeper stage if this bucket splits again, so the note
      // always names the step that actually separated the team from its last tie-mates.
      for (const id of bucket) resolvedBy.set(id, stage);
      out.push(...resolveGroup(bucket, games, computed, resolvedBy, 0));
    }
    return out;
  }

  // Article VI §7: unresolved ⇒ a coin flip we cannot compute. The teams stay tied.
  for (const id of group) resolvedBy.set(id, 'coin-flip');
  return [[...group].sort((a, b) => nameOf(a).localeCompare(nameOf(b)))];
}

function nameOf(id: TeamId): string {
  return getTeamById(id)?.name ?? id;
}

// ---------------------------------------------------------------- reported rows

export function toReportedRecord(row: {
  conferenceWins: number;
  conferenceLosses: number;
  conferenceTies: number;
  overallWins: number;
  overallLosses: number;
  overallTies: number;
  conferencePoints: number;
  conferencePointsAgainst: number;
  points: number;
  pointsAgainst: number;
  conferenceContestsPlayed: number;
  overallContestsPlayed: number;
  conferenceStandingPlacement: number | null;
  conferenceWinningPercentage: number;
  winningPercentage: number;
  streak: number;
  streakResult: string | null;
  homeWins: number; homeLosses: number; homeTies: number;
  awayWins: number; awayLosses: number; awayTies: number;
  neutralWins: number; neutralLosses: number; neutralTies: number;
  modifiedOn: string;
}): ReportedRecord {
  const streakResult =
    row.streakResult === 'W' || row.streakResult === 'L' || row.streakResult === 'T'
      ? row.streakResult
      : null;
  return { ...row, streakResult };
}

function recordString(w: number, l: number, t: number): string {
  return `${w}-${l}-${t}`;
}

// ---------------------------------------------------------------- main

export interface ComputeOptions {
  /** MaxPreps' reported rows, keyed on schoolId. */
  reported?: Map<TeamId, ReportedRecord>;
}

export function computeStandings(
  games: readonly Game[],
  opts: ComputeOptions = {},
): Standing[] {
  const out: Standing[] = [];

  for (const division of DIVISIONS) {
    const teams = teamsInDivision(division);
    const league = divisionGames(games, division);
    const allFinals = games.filter((g) => g.status === 'final');

    const tallies = new Map<TeamId, Tally>();
    const overallTallies = new Map<TeamId, Tally>();
    for (const team of teams) {
      const t = emptyTally();
      const o = emptyTally();
      for (const g of league) accumulate(t, g, team.id);
      for (const g of allFinals) accumulate(o, g, team.id);
      tallies.set(team.id, t);
      overallTallies.set(team.id, o);
    }

    const computed = new Map<TeamId, ComputedRecord>(
      teams.map((team) => [team.id, toComputed(tallies.get(team.id)!, 0)]),
    );

    // Article VI §2: order by points. Teams with no reported results sort last (DESIGN §8).
    const played = teams.filter((t) => computed.get(t.id)!.gp > 0).map((t) => t.id);
    const unplayed = teams
      .filter((t) => computed.get(t.id)!.gp === 0)
      .map((t) => t.id)
      .sort((a, b) => nameOf(a).localeCompare(nameOf(b)));

    const byPoints = new Map<number, TeamId[]>();
    for (const id of played) {
      const pts = computed.get(id)!.pts;
      const bucket = byPoints.get(pts);
      if (bucket) bucket.push(id);
      else byPoints.set(pts, [id]);
    }

    const resolvedBy = new Map<TeamId, TiebreakStage>();
    const clusters: TeamId[][] = [];
    for (const pts of [...byPoints.keys()].sort((a, b) => b - a)) {
      const group = byPoints.get(pts)!;
      if (group.length === 1) resolvedBy.set(group[0], 'points');
      clusters.push(...resolveGroup(group, league, computed, resolvedBy));
    }

    // Standard competition ranking: a shared place consumes its own slots.
    let place = 0;
    const order: Array<{ id: TeamId; place: number; cluster: TeamId[] }> = [];
    for (const cluster of clusters) {
      place += 1;
      for (const id of cluster) order.push({ id, place, cluster });
      place += cluster.length - 1;
    }
    for (const id of unplayed) {
      place += 1;
      order.push({ id, place, cluster: [id] });
      resolvedBy.set(id, 'points');
    }

    for (const entry of order) {
      const team = getTeamById(entry.id)!;
      const record = toComputed(tallies.get(entry.id)!, entry.place);
      const overall = toComputed(overallTallies.get(entry.id)!, entry.place);
      const reported = opts.reported?.get(entry.id) ?? null;
      const shared = entry.cluster.length > 1;
      const stage = resolvedBy.get(entry.id) ?? 'points';
      const tiebreak: TiebreakInfo = {
        resolvedBy: stage,
        note: tiebreakNote(team, record, stage, entry.cluster),
        tiedWith: shared ? entry.cluster.filter((id) => id !== entry.id) : [],
        shared,
      };
      const { mismatch, detail } = compareToReported(record, overall, reported);
      out.push({
        teamId: entry.id,
        slug: team.slug,
        division,
        computed: record,
        overall,
        reported,
        mismatch,
        ...(detail ? { mismatchDetail: detail } : {}),
        tiebreak,
        playoffStatus: playoffStatus(entry.place),
        hasReportedResults: record.gp > 0,
      });
    }
  }

  return out;
}

function tiebreakNote(
  team: Team,
  record: ComputedRecord,
  stage: TiebreakStage,
  cluster: readonly TeamId[],
): string {
  if (record.gp === 0) {
    return `No division results reported for ${team.name}, so it is listed last; ${DIVISION_LABELS[team.division]} order is the order of team points (${BYLAW_CITATIONS.order}).`;
  }
  if (stage === 'points') {
    return `${record.pts} points (3 per win, 1 per tie) — placed on points alone, ${BYLAW_CITATIONS.order}.`;
  }
  const others = cluster.filter((id) => id !== team.id).map(nameOf);
  const tiedWith = others.length ? ` with ${others.join(', ')}` : '';
  if (stage === 'coin-flip') {
    return `Tied on ${record.pts} points${tiedWith} and unresolved by every criterion — ${BYLAW_CITATIONS.coinFlip}. We show them level.`;
  }
  return `Tied on ${record.pts} points; separated by ${STAGE_CITATION[stage]}.`;
}

function compareToReported(
  computed: ComputedRecord,
  overall: ComputedRecord,
  reported: ReportedRecord | null,
): { mismatch: boolean; detail?: string } {
  if (!reported) return { mismatch: false };
  const diffs: string[] = [];
  const ours = recordString(computed.w, computed.l, computed.t);
  const theirs = recordString(
    reported.conferenceWins,
    reported.conferenceLosses,
    reported.conferenceTies,
  );
  if (ours !== theirs) diffs.push(`league record ${ours} vs MaxPreps ${theirs}`);

  const oursOverall = recordString(overall.w, overall.l, overall.t);
  const theirsOverall = recordString(
    reported.overallWins,
    reported.overallLosses,
    reported.overallTies,
  );
  if (oursOverall !== theirsOverall) {
    diffs.push(`overall record ${oursOverall} vs MaxPreps ${theirsOverall}`);
  }
  if (computed.gf !== reported.conferencePoints || computed.ga !== reported.conferencePointsAgainst) {
    diffs.push(
      `league goals ${computed.gf}-${computed.ga} vs MaxPreps ` +
        `${reported.conferencePoints}-${reported.conferencePointsAgainst}`,
    );
  }
  // Place is deliberately NOT a mismatch: MaxPreps orders on win percentage while the by-laws
  // order on points (Article VI §2), so a place difference is a rules difference, not an
  // arithmetic error. It is still published as a cross-check row.
  return diffs.length ? { mismatch: true, detail: diffs.join('; ') } : { mismatch: false };
}

/** Field-by-field cross-check rows for /about#cross-check (DESIGN §9). */
export function buildCrossCheck(standings: readonly Standing[]): CrossCheckRow[] {
  const rows: CrossCheckRow[] = [];
  for (const s of standings) {
    const r = s.reported;
    if (!r) continue;
    const url = leagueStandingsUrl(s.division);
    const push = (field: string, ours: string, theirs: string) => {
      if (ours !== theirs) rows.push({ slug: s.slug, field, ours, theirs, url });
    };
    push(
      'league record',
      recordString(s.computed.w, s.computed.l, s.computed.t),
      recordString(r.conferenceWins, r.conferenceLosses, r.conferenceTies),
    );
    push(
      'overall record',
      recordString(s.overall.w, s.overall.l, s.overall.t),
      recordString(r.overallWins, r.overallLosses, r.overallTies),
    );
    push('league goals for', String(s.computed.gf), String(r.conferencePoints));
    push('league goals against', String(s.computed.ga), String(r.conferencePointsAgainst));
    push(
      'place (we order on points, Art. VI §2; MaxPreps orders on win pct)',
      String(s.computed.place),
      r.conferenceStandingPlacement === null ? '—' : String(r.conferenceStandingPlacement),
    );
    push(
      'win pct',
      s.computed.winPct.toFixed(3),
      r.conferenceWinningPercentage.toFixed(3),
    );
  }
  return rows;
}

// ---------------------------------------------------------------- projections

/** Article VII §2, for ONE finishing slot. */
export function playoffStatus(place: number): PlayoffStatus {
  if (place >= 1 && place <= 3) return 'aq';
  if (place === 4) return 'play-in';
  if (place === 5) return 'at-large';
  return 'out';
}

/**
 * Every status a team could still take, best first.
 *
 * Places use standard competition ranking, so `place` is the team's 1-based finishing SLOT and a
 * cluster left level by Article VI §7's coin flip spans as many slots as it has teams. Two teams
 * level on 3rd therefore hold the third automatic berth AND the 4th-place play-in spot between
 * them: reading `place` alone would label both of them "AQ" and make the play-in slot — and the
 * Oct 30 pairing built from it — disappear from the division. The same straddle at 4th would
 * swallow the 5th-place at-large submission. Neither slot is ever dropped here; the tied teams
 * carry both possibilities until the league flips the coin.
 */
export function playoffOutcomes(place: number, clusterSize = 1): PlayoffStatus[] {
  const size = Math.max(1, clusterSize);
  const out: PlayoffStatus[] = [];
  for (let slot = place; slot < place + size; slot += 1) {
    const status = playoffStatus(slot);
    if (!out.includes(status)) out.push(status);
  }
  return out;
}

/** `playoffOutcomes` for a ranked row: the cluster size is the tied group it belongs to. */
export function outcomesFor(row: Standing): PlayoffStatus[] {
  return playoffOutcomes(row.computed.place, row.tiebreak.tiedWith.length + 1);
}

export const PLAYOFF_STATUS_LABELS: Record<PlayoffStatus, string> = {
  aq: 'Automatic qualifier',
  'play-in': 'Play-in game Oct 30',
  'at-large': 'At-large consideration',
  out: 'No automatic path',
};

/** Lower-case continuations, so a union reads as one sentence rather than two headings. */
const OUTCOME_PHRASES: Record<PlayoffStatus, string> = {
  aq: 'automatic qualifier',
  'play-in': 'the Oct 30 play-in',
  'at-large': 'at-large consideration',
  out: 'no automatic path',
};

/**
 * 'Automatic qualifier', or 'Automatic qualifier or the Oct 30 play-in — decided by the Article
 * VI §7 coin flip' when a level place straddles a by-law boundary.
 */
export function playoffOutcomeLabel(outcomes: readonly PlayoffStatus[]): string {
  const [first, ...rest] = outcomes;
  if (first === undefined) return PLAYOFF_STATUS_LABELS.out;
  if (rest.length === 0) return PLAYOFF_STATUS_LABELS[first];
  const tail = rest.map((status) => OUTCOME_PHRASES[status]).join(' or ');
  return `${PLAYOFF_STATUS_LABELS[first]} or ${tail} — Article VI §7 decides it with a coin flip`;
}

/**
 * The Oct 30 crossover: #1 v #1, #2 v #2, #3 v #3 (CCS ordering help) and #4 v #4, whose winner
 * takes the SCVAL 7th automatic qualifier (Article VII §2).
 *
 * A seed is filled by the team whose cluster COVERS that slot, not by an exact `place ===` match:
 * with two teams level on 3rd nobody carries place 4, and an exact match would quietly render the
 * play-in pairing as empty. Such a seat returns every contender for it, and the UI says in words
 * that the coin flip has not been run.
 */
export function crossoverPairings(standings: readonly Standing[]): CrossoverPairing[] {
  const at = (division: Division, seed: number): CrossoverSeat =>
    standings
      .filter(
        (row) =>
          row.division === division &&
          row.hasReportedResults &&
          row.computed.place <= seed &&
          seed < row.computed.place + row.tiebreak.tiedWith.length + 1,
      )
      .map((row) => ({ teamId: row.teamId, slug: row.slug }));
  return [1, 2, 3, 4].map((seed) => ({
    seed,
    deAnza: at('de-anza', seed),
    elCamino: at('el-camino', seed),
    isPlayIn: seed === 4,
    label:
      seed === 4
        ? 'De Anza #4 vs El Camino #4 — play-in for the SCVAL 7th automatic qualifier'
        : `De Anza #${seed} vs El Camino #${seed} — crossover (helps CCS ordering)`,
  }));
}

/** Sort helper for the UI: division order, then place, then name. */
export function sortStandings(rows: readonly Standing[]): Standing[] {
  return [...rows].sort(
    (a, b) =>
      a.computed.place - b.computed.place ||
      nameOf(a.teamId).localeCompare(nameOf(b.teamId)),
  );
}

/** Every registry team must appear exactly once (DESIGN §12.1). */
export function assertFullTable(rows: readonly Standing[]): void {
  if (rows.length !== TEAMS.length) {
    throw new Error(`standings has ${rows.length} rows, expected ${TEAMS.length}`);
  }
  const seen = new Set(rows.map((r) => r.teamId));
  for (const team of TEAMS) {
    if (!seen.has(team.id)) throw new Error(`standings is missing ${team.slug}`);
  }
}
