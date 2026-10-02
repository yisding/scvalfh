/**
 * Step 08 (SPEC §7.4, §7.9): si.com — the statewide scoreboards, the few targeted team pages D2
 * needs, owner decision D2's backfill (lib/backfill.ts) and the score cross-check (lib/crosscheck.ts).
 *
 *   1. scoreboards for every date in the trailing 14 days that has a game (`sblive-scoreboard` rows);
 *   2. planBackfill → team-games pages only for eligible items the scoreboards did not cover (cap 8;
 *      `--sblive-full` reads every team page of the run's leagues instead);
 *   3. applyBackfill (rules 2-4, 10), then reconcile (rule 5 conflicts, agreements, si.com-only rows)
 *      over what D2 left, folded together by withBackfill.
 *
 * Failure scope is "source stale" (§7.5): when EVERY si.com request fails, the previous snapshot's
 * backfills are re-applied where still eligible, its cross-check is carried, and this run's si.com
 * rows are marked stale. Never an abort.
 */

import { applyBackfill, cleanSbliveRows, planBackfill, scoreboardCoverage, shiftDateKey } from '../../backfill';
import { emptyCrossCheck, reconcile, withBackfill } from '../../crosscheck';
import {
  dedupeSbliveGames,
  parseScoresPage,
  parseTeamGamesPage,
  sbliveScoresUrl,
  type SbliveGame,
} from '../../sources/sblive';
import { getTeamBySlug, teamsInLeague } from '../../teams';
import type { Game, SbliveCrossCheck, SourceStatus, TeamSlug } from '../../types';
import {
  FixtureMissing,
  TransportError,
  type ResourceKey,
  type RunContext,
  type SbliveStep,
  type SbliveStepResult,
} from '../contract';

/** The scoreboard window (SPEC §7.7: ≤ 15 scoreboards). */
export const SBLIVE_SCOREBOARD_DAYS = 14;

interface Attempt {
  row: Omit<SourceStatus, 'status'>;
  outcome: 'ok' | 'error' | 'skipped';
  httpStatus?: number;
  error?: string;
  rowCount?: number;
}

/** Dates in [today − 14, today] with a MaxPreps game or an official fixture, ascending. */
export function scoreboardDates(games: readonly Game[], fixtureDates: readonly string[], today: string): string[] {
  const from = shiftDateKey(today, -SBLIVE_SCOREBOARD_DAYS);
  return [...new Set([...games.map((g) => g.dateKey), ...fixtureDates])]
    .filter((d) => d >= from && d <= today)
    .sort();
}

async function read(
  ctx: RunContext,
  key: ResourceKey,
  base: Omit<SourceStatus, 'status'>,
  parse: (body: string, url: string) => SbliveGame[],
): Promise<{ attempt: Attempt; games: SbliveGame[] }> {
  try {
    const res = await ctx.transport.get(key);
    const games = parse(res.body, res.url);
    return {
      attempt: { row: { ...base, url: res.url || base.url }, outcome: 'ok', httpStatus: res.httpStatus, rowCount: games.length },
      games,
    };
  } catch (err) {
    if (err instanceof FixtureMissing) {
      return { attempt: { row: base, outcome: 'skipped', error: 'not in corpus' }, games: [] };
    }
    const message = (err as Error).message;
    ctx.warn(`${base.label} failed: ${message}`, base.scope);
    const httpStatus = err instanceof TransportError && err.httpStatus !== null ? err.httpStatus : undefined;
    return { attempt: { row: base, outcome: 'error', error: message, ...(httpStatus !== undefined ? { httpStatus } : {}) }, games: [] };
  }
}

/** When this url was last fresh in the previous snapshot. */
function lastFresh(ctx: RunContext, url: string): string | undefined {
  const prior = ctx.previous?.sources.find((r) => r.url === url && (r.status === 'ok' || r.status === 'stale'));
  if (!prior) return undefined;
  return prior.status === 'ok' ? prior.fetchedAt : prior.carriedFrom;
}

function record(ctx: RunContext, attempts: readonly Attempt[], allFailed: boolean): void {
  for (const a of attempts) {
    const httpStatus = a.httpStatus !== undefined ? { httpStatus: a.httpStatus } : {};
    if (a.outcome === 'ok') {
      ctx.source({ ...a.row, status: 'ok', ...httpStatus, rowCount: a.rowCount ?? 0 });
    } else if (a.outcome === 'skipped') {
      ctx.source({ ...a.row, status: 'skipped', error: a.error });
    } else if (allFailed && ctx.previous) {
      const carriedFrom = lastFresh(ctx, a.row.url);
      ctx.source({
        ...a.row,
        status: 'stale',
        ...httpStatus,
        error: `${a.error ?? 'request failed'}; previous si.com scores carried forward`,
        ...(carriedFrom ? { carriedFrom } : {}),
      });
    } else {
      ctx.source({ ...a.row, status: 'error', ...httpStatus, error: a.error });
    }
  }
}

function teamPageBase(ctx: RunContext, slug: TeamSlug): Omit<SourceStatus, 'status'> | null {
  const team = getTeamBySlug(slug);
  const url = team?.external.sbliveGamesUrl;
  if (!team || !url) return null;
  return {
    id: 'sblive',
    kind: 'sblive-team-games',
    scope: { league: team.league, team: slug },
    label: `sblive ${slug} games`,
    url,
    fetchedAt: ctx.fetchedAt,
  };
}

export const stepSblive: SbliveStep = async (ctx, input): Promise<SbliveStepResult> => {
  const games = [...input.games];
  const unmatched = [...input.unmatched];
  if (!ctx.args.sblive) {
    ctx.log('  sblive: skipped (--no-sblive)');
    return { games, unmatched, crossCheck: undefined };
  }

  const attempts: Attempt[] = [];
  const scoreboardRows: SbliveGame[] = [];
  const teamRows: SbliveGame[] = [];

  // 1. statewide scoreboards
  for (const date of scoreboardDates(games, unmatched.map((f) => f.dateKey), ctx.today)) {
    const base: Omit<SourceStatus, 'status'> = {
      id: 'sblive',
      kind: 'sblive-scoreboard',
      label: `sblive scoreboard ${date}`,
      url: sbliveScoresUrl(date),
      fetchedAt: ctx.fetchedAt,
    };
    const res = await read(ctx, { kind: 'sblive-scores', date }, base, parseScoresPage);
    attempts.push(res.attempt);
    scoreboardRows.push(...res.games);
  }

  // 2. targeted team pages (D2 rule 8)
  const plan = planBackfill({ games, unmatched, today: ctx.today }, scoreboardCoverage(scoreboardRows));
  let pages: TeamSlug[] = plan.teamPagesNeeded;
  if (ctx.args.sbliveFull) {
    pages = ctx
      .leaguesInRun()
      .flatMap((l) => teamsInLeague(l))
      .filter((t) => t.external.sbliveGamesUrl)
      .map((t) => t.slug);
  }
  if (plan.deferred.length) {
    ctx.log(
      `  sblive: ${plan.deferred.length} eligible ${plan.deferred.length === 1 ? 'item waits' : 'items wait'} for a later run ` +
        `(team-page cap or no si.com page): ${plan.deferred.map((i) => `${i.date} ${i.pairKey}`).join(', ')}`,
    );
  }
  for (const slug of pages) {
    const base = teamPageBase(ctx, slug);
    if (!base) continue;
    const res = await read(ctx, { kind: 'sblive-team-games', team: slug }, base, parseTeamGamesPage);
    attempts.push(res.attempt);
    teamRows.push(...res.games);
  }

  const ok = attempts.filter((a) => a.outcome === 'ok').length;
  const failed = attempts.filter((a) => a.outcome === 'error').length;
  const sbliveFailed = ok === 0 && failed > 0;
  record(ctx, attempts, sbliveFailed);

  // 3a. every si.com request failed: re-apply what is still eligible, carry the previous report.
  if (sbliveFailed) {
    const result = applyBackfill({
      games,
      unmatched,
      sblive: [],
      today: ctx.today,
      previous: ctx.previous,
      sbliveFailed: true,
      fetchedAt: ctx.fetchedAt,
    });
    for (const w of result.warnings) ctx.warn(`sblive: ${w}`);
    const prior = ctx.previous?.sbliveCrossCheck;
    const crossCheck: SbliveCrossCheck = prior
      ? { ...prior, backfilled: result.rows }
      : { ...emptyCrossCheck(ctx.fetchedAt), backfilled: result.rows };
    ctx.warn(
      prior
        ? 'sblive: every request failed — carried the previous cross-check and re-applied eligible si.com scores'
        : 'sblive: every request failed — the score cross-check is empty for this run',
    );
    return { games: carryConflicts(result.games, ctx), unmatched: result.unmatched, crossCheck };
  }

  // 3b. nothing was read (nothing to read, or nothing in the corpus): no si.com data this run.
  if (ok === 0) {
    ctx.log('  sblive: no si.com page was read this run');
    return { games, unmatched, crossCheck: undefined };
  }

  const cleaned = cleanSbliveRows([...scoreboardRows, ...teamRows]);
  if (cleaned.junkPath.length) {
    ctx.log(`  sblive: ignored ${cleaned.junkPath.length} rows outside /california/field-hockey/games/ (${cleaned.junkPath.map((g) => g.sbliveGameId).join(', ')})`);
  }
  if (cleaned.ignored.length) {
    ctx.log(`  sblive: dropped ${cleaned.ignored.length} JV-only/withdrawn rows (${cleaned.ignored.map((g) => g.sbliveGameId).join(', ')})`);
  }
  const result = applyBackfill({
    games,
    unmatched,
    sblive: cleaned.rows,
    today: ctx.today,
    previous: ctx.previous,
    sbliveFailed: false,
    fetchedAt: ctx.fetchedAt,
  });
  for (const w of result.warnings) ctx.warn(`sblive: ${w}`);
  for (const r of result.rows) ctx.log(`  sblive: published si.com ${r.rule} ${r.dateKey} ${r.label} (${r.sblive.away}-${r.sblive.home})`);

  // The statewide scoreboard is STATEWIDE: rows with no registry side can never join.
  const deduped = dedupeSbliveGames(cleaned.rows);
  const relevant = deduped.filter((g) => g.sides.some((s) => s.slug !== null));
  const rec = reconcile(result.games, relevant, { sbliveFetchedAt: ctx.fetchedAt, today: ctx.today });
  const crossCheck = withBackfill(rec.report, result);
  for (const c of crossCheck.conflicts) ctx.warn(`score conflict ${c.dateKey} ${c.label}: ${c.note}`);
  ctx.log(
    `  sblive: ${deduped.length} rows (${relevant.length} with a registry side) · ` +
      `matched ${crossCheck.compared} · agree ${crossCheck.agreements} · conflicts ${crossCheck.conflicts.length} · ` +
      `backfilled ${crossCheck.backfilled.length} · si.com-only ${crossCheck.sbliveOnlyScored.length} · unmatched ${rec.unmatched}`,
  );
  return { games: rec.games, unmatched: result.unmatched, crossCheck };
};

/** A run without si.com data keeps the plain-disagreement markers it published before (rule 5). */
function carryConflicts(games: readonly Game[], ctx: RunContext): Game[] {
  const prev = new Map((ctx.previous?.games ?? []).map((g) => [g.contestId, g]));
  return games.map((g) => {
    const p = prev.get(g.contestId);
    if (!p?.provenance.scoreConflict || g.provenance.scoreConflict || g.provenance.backfill) return g;
    if (p.provenance.backfill) return g;
    if (p.home.score !== g.home.score || p.away.score !== g.away.score) return g;
    return { ...g, provenance: { ...g.provenance, scoreConflict: p.provenance.scoreConflict } };
  });
}
