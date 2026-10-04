/**
 * Step 07 — official fixtures (SPEC §7.8). Never an abort; every failure is scoped to a division.
 *
 *  - SCVAL (live-PDF divisions): the grid text through the transport ('scval-pdf-text'), parsed,
 *    membership-diffed (warnings only), matched with the 'legacy' matcher; the standings-index
 *    poll ('scval-standings-index'). A division whose grid fails or parses empty gets the previous
 *    snapshot's annotations back (carryOfficialForward, per division → `carriedDivisions`).
 *  - BVAL, PCAL, MCAL (bundled divisions): data/official/<league>-2026.json loaded and validated
 *    (schema + config + assertDoubleRoundRobin). A file that fails puts its divisions in
 *    `degradedDivisions` (classified by MaxPreps' league flag this run, league `degraded`) and
 *    carries the previous annotations. Otherwise the 'two-phase' matcher runs. Revision checks
 *    ('official-revision' per division vs `bundledSha256`) and the MCAL changes check
 *    ('official-changes' vs `officialChanges.sha256`) mark the row stale, the division
 *    `revisedUpstream` and the league `partial` with a reason — the bundled fixtures are STILL used.
 *  - EAL (official mode 'none'): the league publishes no schedule, so nothing is fetched, loaded or
 *    matched here; its league games are MaxPreps' league flag (classify step).
 *
 * Only leagues in `ctx.leaguesInRun()` are touched (the others are carried by the guards step).
 * `args.official === false` (--no-official) skips every request; bundled files are still loaded
 * (they are local and classification depends on them), SCVAL is carried from the previous run.
 */

import { postseasonTag } from '../../classify';
import { LEAGUES, divisionDisplay, divisionHeading, type DivisionConfig, type LeagueConfig } from '../../leagues';
import { matchOfficialFixtures } from '../../official/match';
import { hasOfficialDocument, loadBundledFixtures, type DocumentDivision } from '../../official/schema';
import { assertDoubleRoundRobin } from '../../official/validate';
import {
  PdftotextMissingError,
  SCVAL_STANDINGS_INDEX,
  carryOfficialForward,
  diffMembership,
  findStandingsPdfLink,
  listFieldHockeyLinks,
  parseSchedulePdfText,
} from '../../sources/scval-pdf';
import type { DivisionId, Game, LeagueId, OfficialFixture, SourceStatus } from '../../types';
import {
  FixtureMissing,
  TransportError,
  type OfficialStep,
  type OfficialStepResult,
  type RawResponse,
  type ResourceKey,
  type RunContext,
} from '../contract';
import { carriedFromOf } from '../ledger';

const RESCHEDULE_WINDOW_DAYS = 14;

/** A failed fetch, classified for its SourceStatus row. */
interface FetchFailure {
  status: 'error' | 'skipped';
  error: string;
  httpStatus?: number;
}

function failureOf(err: unknown): FetchFailure {
  if (err instanceof FixtureMissing) return { status: 'skipped', error: 'not in corpus' };
  if (err instanceof PdftotextMissingError) return { status: 'skipped', error: err.message };
  if (err instanceof TransportError) {
    return { status: 'error', error: err.message, ...(err.httpStatus !== null ? { httpStatus: err.httpStatus } : {}) };
  }
  return { status: 'error', error: err instanceof Error ? err.message : String(err) };
}

async function fetchResource(ctx: RunContext, key: ResourceKey): Promise<{ ok: RawResponse } | { failed: FetchFailure }> {
  try {
    return { ok: await ctx.transport.get(key) };
  } catch (err) {
    return { failed: failureOf(err) };
  }
}

/**
 * Contests that are never candidates for a league's fixtures (MatchOptions.isExcluded): postseason
 * games, games on/after the league's postseason cut-off (unless listed in leagueGameOverrides), and
 * any row whose contestType the league excludes.
 */
export function isExcludedFor(league: LeagueConfig): (game: Game) => boolean {
  const { postseasonFrom, leagueGameOverrides, excludeContestTypes } = league.rules;
  return (game) => {
    if (postseasonTag(game) !== null) return true;
    if (postseasonFrom !== null && game.dateKey >= postseasonFrom && !leagueGameOverrides.includes(game.contestId)) {
      return true;
    }
    const types = game.contestTypes ?? { home: null, away: null };
    return [types.home, types.away].some((t) => t !== null && excludeContestTypes.includes(t));
  };
}

/** `The official BVAL schedule file failed validation; …` (SPEC §7.8, verbatim). */
export function validationReason(league: LeagueConfig): string {
  return `The official ${league.shortName} schedule file failed validation; league games are identified by MaxPreps' league flag this run.`;
}

/** The run.ts fallback's reason when the official step itself failed (threw) this run. */
export function notAppliedReason(league: LeagueConfig): string {
  return `The official ${league.shortName} schedule could not be applied this run; league games are identified by MaxPreps' league flag this run.`;
}

/** `BVAL revised the Mt. Hamilton schedule after our copy (revised 9/20/26); official dates may be out of date.` */
export function revisionReason(division: DocumentDivision, league: LeagueConfig): string {
  const heading = divisionHeading(division.id);
  const what = heading === null ? 'its schedule' : `the ${heading} schedule`;
  const when = division.official.revisedOn ? ` (revised ${division.official.revisedOn})` : '';
  return `${league.shortName} revised ${what} after our copy${when}; official dates may be out of date.`;
}

/** `MCAL posted a schedule change after our copy; official dates may be out of date.` */
export function changesReason(league: LeagueConfig): string {
  return `${league.shortName} posted a schedule change after our copy; official dates may be out of date.`;
}

interface StepState {
  games: Game[];
  unmatched: OfficialFixture[];
  degradedDivisions: Set<DivisionId>;
  revisedUpstream: Set<DivisionId>;
  carriedDivisions: Set<DivisionId>;
  officialStandingsPdfUrl: string | null | undefined;
}

/** Put back the previous snapshot's annotations for one division; true when anything came back. */
function carryDivision(ctx: RunContext, state: StepState, leagueId: LeagueId, division: DivisionId): boolean {
  if (!ctx.previous) return false;
  const restored = carryOfficialForward([division], ctx.previous, state.games);
  if (restored.fixtures.length === 0 && restored.carried === 0) return false;
  state.games = restored.games;
  state.unmatched.push(...restored.fixtures);
  state.carriedDivisions.add(division);
  ctx.warn(
    `official ${division}: carried forward ${restored.fixtures.length} official fixture(s) and ` +
      `${restored.carried} game annotation(s) from the previous snapshot`,
    { league: leagueId, division },
  );
  return true;
}

function logMatch(ctx: RunContext, league: LeagueConfig, result: ReturnType<typeof matchOfficialFixtures>, total: number): void {
  const scope = { league: league.id };
  const tag = league.shortName.toLowerCase();
  for (const w of result.warnings) ctx.warn(`${tag} fixture: ${w}`, scope);
  for (const d of result.leagueDisagreements) ctx.warn(`${tag} league flag: ${d}`, scope);
  for (const r of result.reasons) ctx.degrade(league.id, 'partial', r, 'official fixture not counted');
  ctx.log(
    `  ${tag}: ${result.matched}/${total} official fixtures matched a contest; ` +
      `${result.unmatched.length} unmatched`,
  );
}

// ---------------------------------------------------------------- SCVAL (live PDFs)

async function runLivePdfLeague(ctx: RunContext, league: LeagueConfig, divisions: readonly DocumentDivision[], state: StepState): Promise<void> {
  const fixtures: OfficialFixture[] = [];
  const read = new Set<DivisionId>();
  const rows = new Map<DivisionId, SourceStatus>();

  for (const d of divisions) {
    const base = {
      id: d.official.source,
      kind: 'official-schedule' as const,
      scope: { league: league.id, division: d.id },
      label: `${divisionDisplay(d.id)} official schedule (PDF)`,
      url: d.official.scheduleUrl,
      fetchedAt: ctx.fetchedAt,
    };
    if (!ctx.args.official) {
      rows.set(d.id, { ...base, status: 'skipped', error: 'disabled (--no-official)' });
      continue;
    }
    const res = await fetchResource(ctx, { kind: 'scval-pdf-text', division: d.id });
    if ('failed' in res) {
      if (res.failed.status === 'error') ctx.warn(`${d.id} official schedule PDF failed: ${res.failed.error}`, base.scope);
      else ctx.log(`  ${d.id} official schedule PDF skipped: ${res.failed.error}`);
      rows.set(d.id, { ...base, ...res.failed });
      continue;
    }
    const schedule = parseSchedulePdfText(res.ok.body, d.id);
    for (const w of schedule.warnings) ctx.warn(`${league.shortName.toLowerCase()} ${d.id}: ${w}`, base.scope);
    // Membership diff: a WARNING only. Alignment stays the registry's.
    for (const w of diffMembership(schedule).warnings) ctx.warn(`${league.shortName.toLowerCase()} ${w}`, base.scope);
    // Only a grid that yielded rows counts as read: a 200 that parses to nothing is a structural
    // change upstream, and publishing an empty division on the strength of it would blank it.
    if (schedule.fixtures.length > 0) {
      read.add(d.id);
      fixtures.push(...schedule.fixtures);
      rows.set(d.id, { ...base, status: 'ok', httpStatus: res.ok.httpStatus, rowCount: schedule.fixtures.length });
    } else {
      rows.set(d.id, { ...base, status: 'error', httpStatus: res.ok.httpStatus, rowCount: 0, error: 'the schedule PDF held no fixtures' });
    }
    ctx.log(`  ${d.id}: ${schedule.fixtures.length} official fixtures, crossover ${schedule.crossoverDate ?? 'n/a'}`);
  }

  if (fixtures.length > 0) {
    const result = matchOfficialFixtures(state.games, fixtures, {
      matcher: league.rules.matcher,
      isExcluded: isExcludedFor(league),
      rescheduleWindowDays: RESCHEDULE_WINDOW_DAYS,
      today: ctx.today,
    });
    state.games = result.games;
    state.unmatched.push(...result.unmatched);
    logMatch(ctx, league, result, fixtures.length);
  }

  // Per division: a grid that was not read gets its previous annotations back, stamped with when
  // that grid was last read (carriedFromOf follows a row that was itself carried).
  for (const d of divisions) {
    if (read.has(d.id)) continue;
    const carried = carryDivision(ctx, state, league.id, d.id);
    const row = rows.get(d.id);
    const carriedFrom = carriedFromOf(ctx.previous, (r) => r.kind === 'official-schedule' && r.scope?.division === d.id);
    if (carried && row && row.status === 'error' && carriedFrom) {
      rows.set(d.id, { ...row, status: 'stale', carriedFrom });
    } else if (carried && row && carriedFrom) {
      rows.set(d.id, { ...row, carriedFrom });
    }
  }
  for (const d of divisions) {
    const row = rows.get(d.id);
    if (row) ctx.source(row);
  }

  // The standings-index poll (a 2026-27 standings PDF, none yet).
  const indexBase = {
    id: divisions[0]?.official.source ?? 'scval-pdf',
    kind: 'standings-index' as const,
    scope: { league: league.id },
    label: `${league.shortName} standings index`,
    url: SCVAL_STANDINGS_INDEX,
    fetchedAt: ctx.fetchedAt,
  };
  if (!ctx.args.official) {
    ctx.source({ ...indexBase, status: 'skipped', error: 'disabled (--no-official)' });
    return;
  }
  const idx = await fetchResource(ctx, { kind: 'scval-standings-index' });
  if ('failed' in idx) {
    if (idx.failed.status === 'error') ctx.warn(`${league.shortName.toLowerCase()} standings index failed: ${idx.failed.error}`, indexBase.scope);
    ctx.source({ ...indexBase, ...idx.failed });
    return;
  }
  const link = findStandingsPdfLink(idx.ok.body);
  const links = listFieldHockeyLinks(idx.ok.body);
  state.officialStandingsPdfUrl = link?.url ?? null;
  ctx.source({ ...indexBase, status: 'ok', httpStatus: idx.ok.httpStatus, rowCount: links.length });
  ctx.log(`  ${league.shortName.toLowerCase()} standings index: ${links.length} field-hockey link(s); standings PDF ${link ? link.href : 'not published yet'}`);
}

// ---------------------------------------------------------------- BVAL, PCAL, MCAL (bundled)

async function runBundledLeague(ctx: RunContext, league: LeagueConfig, divisions: readonly DocumentDivision[], state: StepState): Promise<void> {
  const scopeOf = (d: DivisionConfig) => ({ league: league.id, division: d.id });

  // 1. Load + validate. Any failure degrades every division of the file.
  let fixtures: OfficialFixture[] = [];
  let failure: string | null = null;
  try {
    fixtures = loadBundledFixtures(league.id).filter((f) => divisions.some((d) => d.id === f.division));
    for (const d of divisions) assertDoubleRoundRobin(fixtures.filter((f) => f.division === d.id), d.id);
  } catch (err) {
    failure = err instanceof Error ? err.message : String(err);
  }
  for (const d of divisions) {
    const base = {
      id: d.official.source,
      kind: 'official-schedule' as const,
      scope: scopeOf(d),
      label: `${divisionDisplay(d.id)} official schedule (bundled copy)`,
      url: d.official.scheduleUrl,
      fetchedAt: ctx.fetchedAt,
    };
    ctx.source(
      failure === null
        ? { ...base, status: 'ok', rowCount: fixtures.filter((f) => f.division === d.id).length }
        : { ...base, status: 'error', error: failure },
    );
  }
  if (failure !== null) {
    ctx.warn(`${league.shortName.toLowerCase()} official file: ${failure}`, { league: league.id });
    for (const d of divisions) {
      state.degradedDivisions.add(d.id);
      carryDivision(ctx, state, league.id, d.id);
    }
    ctx.degrade(league.id, 'degraded', validationReason(league), 'official file invalid');
  }

  // 2. Revision checks (never change which fixtures are used).
  for (const d of divisions) {
    const base = {
      id: d.official.source,
      kind: 'official-revision-check' as const,
      scope: scopeOf(d),
      label: `${divisionDisplay(d.id)} official schedule revision check`,
      url: d.official.revisionCheckUrl ?? d.official.scheduleUrl,
      fetchedAt: ctx.fetchedAt,
    };
    if (!ctx.args.official) {
      ctx.source({ ...base, status: 'skipped', error: 'disabled (--no-official)' });
      continue;
    }
    const res = await fetchResource(ctx, { kind: 'official-revision', division: d.id });
    if ('failed' in res) {
      if (res.failed.status === 'error') ctx.warn(`${d.id} revision check failed: ${res.failed.error}`, base.scope);
      ctx.source({ ...base, ...res.failed });
      continue;
    }
    const hash = res.ok.body.trim().toLowerCase();
    if (hash === d.official.bundledSha256) {
      ctx.source({ ...base, status: 'ok', httpStatus: res.ok.httpStatus });
    } else {
      const reason = revisionReason(d, league);
      ctx.source({ ...base, status: 'stale', httpStatus: res.ok.httpStatus, error: reason });
      state.revisedUpstream.add(d.id);
      ctx.warn(`${d.id}: upstream sha256 ${hash} ≠ bundled ${d.official.bundledSha256}`, base.scope);
      ctx.degrade(league.id, 'partial', reason, 'upstream revised');
    }
  }

  // 3. The league's posted-changes page (MCAL Schedir.htm).
  if (league.officialChanges !== null) {
    const changes = league.officialChanges;
    const base = {
      id: divisions[0].official.source,
      kind: 'official-revision-check' as const,
      scope: { league: league.id },
      label: `${league.shortName} schedule changes`,
      url: changes.url,
      fetchedAt: ctx.fetchedAt,
    };
    if (!ctx.args.official) {
      ctx.source({ ...base, status: 'skipped', error: 'disabled (--no-official)' });
    } else {
      const res = await fetchResource(ctx, { kind: 'official-changes', league: league.id });
      if ('failed' in res) {
        if (res.failed.status === 'error') ctx.warn(`${league.id} changes check failed: ${res.failed.error}`, base.scope);
        ctx.source({ ...base, ...res.failed });
      } else if (res.ok.body.trim().toLowerCase() === changes.sha256) {
        ctx.source({ ...base, status: 'ok', httpStatus: res.ok.httpStatus });
      } else {
        const reason = changesReason(league);
        ctx.source({ ...base, status: 'stale', httpStatus: res.ok.httpStatus, error: reason });
        for (const d of divisions) state.revisedUpstream.add(d.id);
        ctx.degrade(league.id, 'partial', reason, 'schedule changes posted');
      }
    }
  }

  // 4. Match.
  if (failure !== null) return;
  const result = matchOfficialFixtures(state.games, fixtures, {
    matcher: league.rules.matcher,
    isExcluded: isExcludedFor(league),
    rescheduleWindowDays: RESCHEDULE_WINDOW_DAYS,
    today: ctx.today,
  });
  state.games = result.games;
  state.unmatched.push(...result.unmatched);
  logMatch(ctx, league, result, fixtures.length);
}

/** Step 07 (SPEC §7.4, §7.8). */
export const stepOfficial: OfficialStep = async (ctx, games) => {
  const inRun = new Set<LeagueId>(ctx.leaguesInRun());
  const state: StepState = {
    games: [...games],
    unmatched: [],
    degradedDivisions: new Set(),
    revisedUpstream: new Set(),
    carriedDivisions: new Set(),
    officialStandingsPdfUrl: undefined,
  };

  for (const league of LEAGUES) {
    if (!inRun.has(league.id)) continue;
    // A mode-'none' division (EAL) has no document: it is in neither list and is classified by
    // MaxPreps' league flag (classify step), with no fixtures and no revision check.
    const documented = league.divisions.filter(hasOfficialDocument);
    const live = documented.filter((d) => d.official.mode === 'live-pdf');
    const bundled = documented.filter((d) => d.official.mode === 'bundled');
    if (live.length > 0) await runLivePdfLeague(ctx, league, live, state);
    if (bundled.length > 0) await runBundledLeague(ctx, league, bundled, state);
  }

  const result: OfficialStepResult = {
    games: state.games,
    unmatched: state.unmatched,
    degradedDivisions: state.degradedDivisions,
    revisedUpstream: state.revisedUpstream,
    carriedDivisions: state.carriedDivisions,
    ...(state.officialStandingsPdfUrl !== undefined ? { officialStandingsPdfUrl: state.officialStandingsPdfUrl } : {}),
  };
  return result;
};
