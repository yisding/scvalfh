/**
 * Step 13 (SPEC §7.4, §7.11): the snapshot, validated by `parseSnapshot` (a schema failure is a run
 * abort: nothing is written), the size and sources budgets (warn here, fail in tests), the
 * `snapshot.meta.json` object with its per-league rows and `commitSummary`, and the run's summary
 * line.
 */

import { CCS, getLeague } from '../../leagues';
import { buildSeason } from '../../season-build';
import { countsOf } from '../../snapshot-migrate';
import { parseSnapshot, snapshotContentHash, stableStringify } from '../../snapshot-schema';
import { TEAMS } from '../../teams';
import type { ContestId, Game, LeagueHealth, OfficialFixture, Snapshot } from '../../types';
import { RunAbort } from '../contract';
import type { PipelineContext, RunState } from '../ledger';
import type { RequestCounts } from '../transport';
import { byDateThenId } from './normalize';
import type { StandingsStepResult } from './standings';

/** SPEC §7.11 budgets. */
export const SNAPSHOT_MAX_BYTES = 1_600_000;
export const SNAPSHOT_WARN_BYTES = 1_200_000;
export const SOURCES_MAX = 140;

/**
 * D2 rule 10: a `sblive:<id>` game an earlier run published that a MaxPreps contest now supersedes
 * (the contest matched the same official fixture) maps to that contest, and the mapping is carried
 * for the rest of the season. Only keys that are no longer games and values that are games survive
 * (snapshot refinement 10).
 */
export function supersededGamesOf(games: readonly Game[], previous: Snapshot | null): Record<ContestId, ContestId> {
  const ids = new Set(games.map((g) => g.contestId));
  const out: Record<ContestId, ContestId> = {};
  for (const [from, to] of Object.entries(previous?.supersededGames ?? {})) {
    if (!ids.has(from) && ids.has(to)) out[from] = to;
  }
  const byFixture = new Map<string, ContestId>();
  for (const g of games) {
    if (g.official && !g.contestId.startsWith('sblive:')) byFixture.set(g.official.fixtureId, g.contestId);
  }
  for (const g of previous?.games ?? []) {
    if (!g.contestId.startsWith('sblive:') || ids.has(g.contestId) || !g.official) continue;
    const winner = byFixture.get(g.official.fixtureId);
    if (winner) out[g.contestId] = winner;
  }
  return out;
}

function sortFixtures(fixtures: readonly OfficialFixture[]): OfficialFixture[] {
  return [...fixtures].sort((a, b) => (a.dateKey === b.dateKey ? a.id.localeCompare(b.id) : a.dateKey.localeCompare(b.dateKey)));
}

/** `SCVAL +3 finals · BVAL +2 · PCAL frozen (meta season mismatch) · MCAL +4` */
export function commitSummaryOf(
  health: readonly LeagueHealth[],
  causes: (leagueId: string) => readonly string[],
): string {
  let unitWritten = false;
  return health
    .map((h) => {
      const short = getLeague(h.leagueId).shortName;
      if (h.state === 'frozen' || h.state === 'degraded') {
        const cause = causes(h.leagueId)[0];
        return `${short} ${h.state}${cause ? ` (${cause})` : ''}`;
      }
      const delta = finalsDeltaOf(h);
      const unit = unitWritten ? '' : ' finals';
      unitWritten = true;
      return `${short} ${delta >= 0 ? '+' : '-'}${Math.abs(delta)}${unit}`;
    })
    .join(' · ');
}

export function finalsDeltaOf(h: LeagueHealth): number {
  return h.divisions.reduce((sum, d) => sum + d.countedFinals - (d.previousCountedFinals ?? 0), 0);
}

export interface AssembleInput {
  state: RunState;
  table: StandingsStepResult;
  requests: RequestCounts;
}

export function stepAssemble(
  ctx: PipelineContext,
  { state, table, requests }: AssembleInput,
): { snapshot: Snapshot; meta: Record<string, unknown> } {
  const games = [...state.games].sort(byDateThenId);
  const sources = ctx.sources.ordered();
  const official = state.official;
  const officialStandingsPdfUrl =
    official.officialStandingsPdfUrl !== undefined ? official.officialStandingsPdfUrl : ctx.previous?.officialStandingsPdfUrl;
  const fixtures = sortFixtures(state.unmatched);
  const anyOfficial = fixtures.length > 0 || games.some((g) => g.official !== undefined);
  const secondary = state.secondary;

  const draft: Snapshot = {
    schemaVersion: 2,
    fetchedAt: ctx.fetchedAt,
    season: buildSeason(games),
    teams: TEAMS.map((t) => ({ ...t })),
    games,
    standings: table.standings,
    playoffs: {
      keyDates: { ...CCS.keyDates },
      ...(secondary.ccsCalendar ? { ccsCalendar: secondary.ccsCalendar } : {}),
      ...(secondary.keyDatesConfirmed === undefined ? {} : { keyDatesConfirmed: secondary.keyDatesConfirmed }),
      format: {
        elimination: 'single',
        ccsDivisions: CCS.ccsDivisions.map((d) => ({ name: d.name, seeds: [d.seeds[0], d.seeds[1]] as [number, number] })),
        autoQualifiers: { ...CCS.autoQualifiers },
        highSeedHostsThrough: CCS.highSeedHostsThrough,
      },
      bracketPublished: secondary.bracketPublished,
      bracketUrl: CCS.bracketUrl,
      games: [],
    },
    sources,
    leagueHealth: table.leagueHealth,
    dropped: ctx.dropped.all(),
    crossCheck: table.crossCheck,
    ...(state.crossCheck ? { sbliveCrossCheck: state.crossCheck } : {}),
    ...(anyOfficial ? { officialFixtures: fixtures } : {}),
    supersededGames: supersededGamesOf(games, ctx.previous),
    ...(officialStandingsPdfUrl === undefined ? {} : { officialStandingsPdfUrl }),
    counts: countsOf(games, table.standings),
  };

  let snapshot: Snapshot;
  try {
    snapshot = parseSnapshot(draft);
  } catch (err) {
    throw new RunAbort(`the assembled snapshot failed validation: ${(err as Error).message}`);
  }

  // Budgets: warn here, fail in tests.
  const bytes = Buffer.byteLength(stableStringify(snapshot), 'utf8');
  if (bytes > SNAPSHOT_MAX_BYTES) ctx.warn(`budget: snapshot.json is ${bytes} bytes, over the ${SNAPSHOT_MAX_BYTES}-byte budget`);
  else if (bytes > SNAPSHOT_WARN_BYTES) ctx.warn(`budget: snapshot.json is ${bytes} bytes, approaching the ${SNAPSHOT_MAX_BYTES}-byte budget`);
  if (sources.length > SOURCES_MAX) ctx.warn(`budget: ${sources.length} source rows, over the ${SOURCES_MAX}-row budget`);

  const health = snapshot.leagueHealth;
  const commitSummary = commitSummaryOf(health, (id) => ctx.leagues.causes(id));
  const counts = snapshot.counts;
  const backfilled = snapshot.games.filter((g) => g.provenance.scores === 'sblive').length;
  const ok = sources.filter((s) => s.status === 'ok').length;

  ctx.log(
    `summary: teams ${counts.teams} · games ${counts.games} (league ${counts.leagueGames}) · ` +
      `finals ${counts.finals} · pending ${counts.pending} · backfilled ${backfilled} · ` +
      `mismatches ${counts.mismatches} · sources ok ${ok}/${sources.length} · ` +
      `requests maxpreps:${requests.maxpreps} sblive:${requests.sblive} official:${requests.official} · ` +
      `leagues ${health.map((h) => `${h.leagueId}:${h.state}`).join(' ')}`,
  );
  if (snapshot.sbliveCrossCheck) {
    const x = snapshot.sbliveCrossCheck;
    ctx.log(
      `cross-check: compared ${x.compared} · agreements ${x.agreements} · conflicts ${x.conflicts.length} · ` +
        `sblive-only scored ${x.sbliveOnlyScored.length} · backfilled ${x.backfilled.length}`,
    );
  }
  if (snapshot.officialFixtures) {
    ctx.log(`official: ${snapshot.officialFixtures.length} official ${snapshot.officialFixtures.length === 1 ? 'fixture' : 'fixtures'} with no reported contest`);
  }
  for (const h of health) {
    for (const reason of h.reasons) ctx.log(`  ${h.leagueId} ${h.state}: ${reason}`);
  }

  const meta: Record<string, unknown> = {
    fetchedAt: ctx.fetchedAt,
    // The content identity with every fetchedAt stripped: the cron commits only when THIS changes.
    contentHash: snapshotContentHash(snapshot),
    // The PACIFIC date, which is what a commit message should say.
    today: ctx.today,
    counts,
    crossCheck: snapshot.sbliveCrossCheck
      ? {
          compared: snapshot.sbliveCrossCheck.compared,
          agreements: snapshot.sbliveCrossCheck.agreements,
          conflicts: snapshot.sbliveCrossCheck.conflicts.length,
          sbliveOnlyScored: snapshot.sbliveCrossCheck.sbliveOnlyScored.length,
          backfilled: snapshot.sbliveCrossCheck.backfilled.length,
        }
      : null,
    officialFixturesUnmatched: snapshot.officialFixtures?.length ?? null,
    officialStandingsPdfUrl: snapshot.officialStandingsPdfUrl ?? null,
    window: snapshot.season.window,
    sources: sources.map((s) => ({ label: s.label, status: s.status, rowCount: s.rowCount ?? null })),
    warnings: ctx.logLines.filter((l) => l.startsWith('WARN ')).length,
    requests: { maxpreps: requests.maxpreps, sblive: requests.sblive, official: requests.official },
    leagues: health.map((h) => ({
      id: h.leagueId,
      state: h.state,
      countedFinals: h.divisions.reduce((n, d) => n + d.countedFinals, 0),
      finalsDelta: finalsDeltaOf(h),
      missingPast: h.divisions.reduce((n, d) => n + (d.official?.missingPast ?? 0), 0),
      backfilled: h.divisions.reduce((n, d) => n + d.backfilled, 0),
      reasons: h.reasons,
    })),
    commitSummary,
  };
  return { snapshot, meta };
}
