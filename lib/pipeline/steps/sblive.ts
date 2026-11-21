/**
 * Step 08 (SPEC §7.4, §7.9): si.com — the statewide scoreboards, the few targeted team pages D2
 * needs, owner decision D2's backfill (lib/crosscheck/backfill.ts) and the score cross-check (lib/crosscheck/crosscheck.ts).
 *
 *   1. scoreboards for every date in the trailing 14 days that has a game (`sblive-scoreboard` rows);
 *   2. planBackfill → team-games pages only for eligible items the scoreboards did not cover (cap 8;
 *      `--sblive-full` reads every team page of the run's leagues instead);
 *   3. decideBackfill (rules 2-4, 10), then decideReconcile (rule 5 conflicts, agreements, si.com-only rows)
 *      over what D2 left, folded together by withBackfill.
 *
 * Failure scope is "source stale" (§7.5), never an abort. An earlier si.com fill is decided again only
 * by the si.com data that covers it; when this run did not read that data (its page failed, was past the
 * team-page cap, or si.com was not read at all: every request failed, `--no-sblive`, nothing to read),
 * the fill is re-applied while still eligible (rule 10) and the failed pages' rows are marked stale. The
 * earlier fills, and the disagreements a run with no si.com data keeps, are the si.com claims (what the last
 * publication showed, lib/claims/sources/sblive.ts); a context with no claim store (a test's own) reads them off
 * its previous snapshot, which is what the claims seeded from that snapshot hold. When no si.com page was read,
 * the previous cross-check is carried, keeping only the rows that are still true of this run's games
 * (lib/crosscheck/crosscheck.ts `carryCrossCheck`): the report is run history, not a game's data.
 *
 * Every decision is returned with the rows read, so the run resolves the stage from the decisions and keeps the
 * fills as claims. The ledger's moves are the editor's, passed in (the ledger itself only when the context has no
 * editor view).
 */

import {
  carriedConflicts,
  conflictsFromSnapshot,
  storedConflictsOf,
  storedFillsOf,
  type SbliveStageDecisions,
} from '../../claims/sources/sblive';
import {
  applyBackfillDecision,
  cleanSbliveRows,
  decideBackfill,
  earlierFillsOf,
  planBackfill,
  playedFixture,
  scoreboardCoverage,
  type BackfillDecisions,
  type BackfillInput,
  type BackfillResult,
} from '../../crosscheck/backfill';
import { applyReconcile, carryCrossCheck, decideReconcile, emptyCrossCheck, withBackfill } from '../../crosscheck/crosscheck';
import { shiftDateKey } from '../../format';
import {
  dedupeSbliveGames,
  parseLeagueScoresPage,
  parseScoresDay,
  parseTeamGamesPage,
  SBLIVE_GAME_PATH_PREFIX,
  sbliveLeagueScoresUrl,
  sbliveScoresUrl,
  type SbliveGame,
} from '../../sources/sblive';
import { getLeague } from '../../leagues';
import { getTeamBySlug, teamsInLeague, unorderedPairKey } from '../../teams';
import type { Game, LeagueId, OfficialFixture, SbliveCrossCheck, SourceStatus, TeamSlug } from '../../types';
import {
  type ResourceKey,
  type RunContext,
  type SbliveStep,
  type SbliveStepResult,
} from '../contract';
import { classifyFetchError } from '../read';

/** The scoreboard window (SPEC §7.7: ≤ 15 scoreboards). */
export const SBLIVE_SCOREBOARD_DAYS = 14;

interface Attempt {
  row: Omit<SourceStatus, 'status'>;
  outcome: 'ok' | 'error' | 'skipped';
  httpStatus?: number;
  error?: string;
  rowCount?: number;
}

/**
 * The most league scoreboards one run reads (lib/sources/sblive.ts sbliveLeagueScoresUrl), newest day first: one
 * per si.com league slug of each of our leagues that played on a day the statewide scoreboard cut short. A girls
 * soccer day statewide runs to ~80-110 games, against the page's 24.
 */
export const SBLIVE_LEAGUE_SCOREBOARD_CAP = 30;

/** League scoreboards that may fail in one run before the rest wait for a later one (a slow or failing si.com). */
export const SBLIVE_LEAGUE_SCOREBOARD_FAILURES = 3;

export interface LeagueScoreboardPage {
  /** Our league, whose `sblive.leagueSlugs` the page is one of. */
  league: LeagueId;
  /** The si.com league slug. */
  slug: string;
  date: string;
}

/**
 * The league scoreboards to read: for each day the statewide page cut short (newest first), each league of the run
 * with a MaxPreps game or an official fixture of one of its teams that day, then each of its si.com league slugs,
 * in config order, up to `cap`. The rest are `deferred` (a later run, or a team page, covers them).
 */
export function leagueScoreboardPlan(
  truncatedDays: readonly string[],
  sides: ReadonlyArray<{ dateKey: string; slugs: ReadonlyArray<TeamSlug | null> }>,
  leaguesInRun: readonly LeagueId[],
  cap = SBLIVE_LEAGUE_SCOREBOARD_CAP,
): { pages: LeagueScoreboardPage[]; deferred: LeagueScoreboardPage[] } {
  const wanted: LeagueScoreboardPage[] = [];
  for (const date of [...new Set(truncatedDays)].sort().reverse()) {
    const playing = new Set(
      sides
        .filter((g) => g.dateKey === date)
        .flatMap((g) => g.slugs.flatMap((slug) => (slug ? [getTeamBySlug(slug)?.league] : [])))
        .filter((l): l is LeagueId => l !== undefined),
    );
    for (const league of leaguesInRun) {
      if (!playing.has(league)) continue;
      for (const slug of getLeague(league).sblive.leagueSlugs) wanted.push({ league, slug, date });
    }
  }
  return { pages: wanted.slice(0, cap), deferred: wanted.slice(cap) };
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
    const { status, ...failed } = classifyFetchError(err);
    if (status === 'skipped') return { attempt: { row: base, outcome: 'skipped', error: failed.error }, games: [] };
    ctx.warn(`${base.label} failed: ${failed.error}`, base.scope);
    return { attempt: { row: base, outcome: 'error', ...failed }, games: [] };
  }
}

/**
 * When this url was last fresh in the previous snapshot. Unlike carriedFromOf it matches by url (a
 * scoreboard row has no scope) and has no run-stamp fallback: a page the last run did not read
 * (a new scoreboard date) was never fresh, so it gets no carriedFrom at all.
 */
function lastFresh(ctx: RunContext, url: string): string | undefined {
  const prior = ctx.previous?.sources.find((r) => r.url === url && (r.status === 'ok' || r.status === 'stale'));
  if (!prior) return undefined;
  return prior.status === 'ok' ? prior.fetchedAt : prior.carriedFrom;
}

function record(ctx: RunContext, attempts: readonly Attempt[], carried: boolean): void {
  for (const a of attempts) {
    const httpStatus = a.httpStatus !== undefined ? { httpStatus: a.httpStatus } : {};
    if (a.outcome === 'ok') {
      ctx.source({ ...a.row, status: 'ok', ...httpStatus, rowCount: a.rowCount ?? 0 });
    } else if (a.outcome === 'skipped') {
      ctx.source({ ...a.row, status: 'skipped', error: a.error });
    } else if (carried && ctx.previous) {
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

/** D2 over the stage's input (rules 2-4 and 10), with the earlier fills from the claims, and the games it leaves. */
function backfillOf(
  ctx: RunContext,
  input: Omit<BackfillInput, 'previous' | 'earlier' | 'today' | 'fetchedAt' | 'moves'>,
): { decided: BackfillDecisions; result: BackfillResult } {
  const decided = decideBackfill({
    ...input,
    today: ctx.today,
    previous: null,
    earlier: ctx.claims ? storedFillsOf(ctx.claims) : earlierFillsOf(ctx.previous),
    fetchedAt: ctx.fetchedAt,
    moves: ctx.editor?.moves,
  });
  const games = [...input.games.map((g) => applyBackfillDecision(g, decided.byContestId.get(g.contestId))), ...decided.created.map((c) => c.game)];
  const { byContestId: _byContestId, created: _created, consumed: _consumed, ...report } = decided;
  void [_byContestId, _created, _consumed];
  return { decided, result: { games, ...report } };
}

/**
 * What the step hands the run beside its games: whether si.com was read and the rows read (`rows` null: not read),
 * and the stage's decisions (D2's, and the disagreement each game carries). Each is left out when it holds nothing, so a step that read and
 * decided nothing returns only its games, fixtures and report.
 */
function handover(rows: SbliveGame[] | null, decided: BackfillDecisions, reconcile: SbliveStageDecisions['reconcile']): Partial<SbliveStepResult> {
  const decisions: SbliveStageDecisions = { backfill: decided.byContestId, reconcile, created: decided.created.map((c) => c.game) };
  const any = decisions.backfill.size > 0 || decisions.reconcile.size > 0 || decisions.created.length > 0;
  return { ...(rows ? { read: true } : {}), ...(rows?.length ? { rows } : {}), ...(any ? { decisions } : {}) };
}

/**
 * A run that read no si.com data: the earlier fills are re-applied where still eligible, each game keeps the
 * disagreement it published while it still shows the same scores, and the previous cross-check is carried with
 * only the rows still true of this run's games.
 */
function withoutSblive(ctx: RunContext, games: Game[], unmatched: OfficialFixture[], why: string): SbliveStepResult {
  const { decided, result } = backfillOf(ctx, { games, unmatched, sblive: [], sbliveFailed: true });
  for (const w of result.warnings) ctx.warn(`sblive: ${w}`);
  const conflicts = carriedConflicts(result.games, ctx.claims ? storedConflictsOf(ctx.claims) : conflictsFromSnapshot(ctx.previous));
  const carriedGames = result.games.map((g) => applyReconcile(g, conflicts.get(g.contestId)));
  const prior = ctx.previous?.sbliveCrossCheck;
  let crossCheck: SbliveCrossCheck | undefined;
  if (prior) crossCheck = carryCrossCheck(prior, carriedGames, result.rows);
  else if (result.rows.length) crossCheck = { ...emptyCrossCheck(ctx.fetchedAt), backfilled: result.rows };
  ctx.log(
    `  sblive: ${why} — ${prior ? 'carried the previous cross-check' : 'no earlier cross-check to carry'}` +
      ` and ${result.rows.length} earlier si.com ${result.rows.length === 1 ? 'score' : 'scores'} still eligible`,
  );
  ctx.trace?.push({ stage: 'sblive', kind: 'decide', input: { games, sblive: null }, games: carriedGames });
  return { games: carriedGames, unmatched: result.unmatched, sbliveCrossCheck: crossCheck, ...handover(null, decided, conflicts) };
}

export const stepSblive: SbliveStep = async (ctx, input): Promise<SbliveStepResult> => {
  const games = [...input.games];
  const unmatched = [...input.unmatched];
  if (!ctx.args.sblive) {
    ctx.log('  sblive: skipped (--no-sblive)');
    return withoutSblive(ctx, games, unmatched, 'not read (--no-sblive)');
  }

  const attempts: Attempt[] = [];
  const scoreboardRows: SbliveGame[] = [];
  const teamRows: SbliveGame[] = [];

  // 1. statewide scoreboards
  const truncatedDays: string[] = [];
  for (const date of scoreboardDates(games, unmatched.map((f) => playedFixture(f, ctx.editor?.moves).dateKey), ctx.today)) {
    const base: Omit<SourceStatus, 'status'> = {
      id: 'sblive',
      kind: 'sblive-scoreboard',
      label: `sblive scoreboard ${date}`,
      url: sbliveScoresUrl(date),
      fetchedAt: ctx.fetchedAt,
    };
    const res = await read(ctx, { kind: 'sblive-scores', date }, base, (body, url) => {
      const day = parseScoresDay(body, url, (m) => ctx.warn(`sblive: ${m}`, base.scope));
      if (day.truncated) truncatedDays.push(date);
      return day.games;
    });
    attempts.push(res.attempt);
    scoreboardRows.push(...res.games);
  }

  // 1b. a day the statewide page cut short: the league scoreboards of our leagues with a game that day the statewide
  // rows did not give, which list every game of their members (lib/sources/sblive.ts sbliveLeagueScoresUrl). A page the corpus does not hold is left out of the sources (a live run never skips a page), so an
  // offline run over a corpus captured before these pages were read is the run it always was.
  // Only the games the statewide rows did not already give (a pair of ours there near the date): a league page is
  // for what the cut hid. A game against a school outside the registry has no pair to look for, so it counts.
  const statewideCovers = scoreboardCoverage(scoreboardRows);
  const hidden = (dateKey: string, a: TeamSlug | null, b: TeamSlug | null) =>
    !(a && b && a !== b && statewideCovers(unorderedPairKey(a, b), dateKey));
  const leagueSides = [
    ...games.filter((g) => hidden(g.dateKey, g.home.slug, g.away.slug)).map((g) => ({ dateKey: g.dateKey, slugs: [g.home.slug, g.away.slug] })),
    ...unmatched.flatMap((f) => {
      const played = playedFixture(f, ctx.editor?.moves);
      return hidden(played.dateKey, played.homeSlug, played.awaySlug)
        ? [{ dateKey: played.dateKey, slugs: [played.homeSlug, played.awaySlug] }]
        : [];
    }),
  ];
  const leaguePlan = leagueScoreboardPlan(truncatedDays, leagueSides, ctx.leaguesInRun());
  if (leaguePlan.deferred.length) {
    ctx.log(
      `  sblive: ${leaguePlan.deferred.length} league ${leaguePlan.deferred.length === 1 ? 'scoreboard waits' : 'scoreboards wait'} ` +
        `for a later run (cap ${SBLIVE_LEAGUE_SCOREBOARD_CAP}): ${leaguePlan.deferred.map((p) => `${p.date} ${p.slug}`).join(', ')}`,
    );
  }
  const seenGames = new Set(scoreboardRows.map((g) => g.sbliveGameId));
  let leagueRead = 0;
  let leagueAdded = 0;
  let leagueFailed = 0;
  for (const [i, page] of leaguePlan.pages.entries()) {
    if (leagueFailed >= SBLIVE_LEAGUE_SCOREBOARD_FAILURES) {
      const rest = leaguePlan.pages.slice(i);
      ctx.log(
        `  sblive: ${leagueFailed} league scoreboards failed; the other ${rest.length} wait for a later run: ` +
          rest.map((p) => `${p.date} ${p.slug}`).join(', '),
      );
      break;
    }
    const base: Omit<SourceStatus, 'status'> = {
      id: 'sblive',
      kind: 'sblive-scoreboard',
      scope: { league: page.league },
      label: `sblive ${page.slug} scoreboard ${page.date}`,
      url: sbliveLeagueScoresUrl(page.slug, page.date),
      fetchedAt: ctx.fetchedAt,
    };
    const res = await read(ctx, { kind: 'sblive-league-scores', league: page.slug, date: page.date }, base, (body, url) =>
      parseLeagueScoresPage(body, page.slug, page.date, url, (m) => ctx.warn(`sblive: ${m}`, base.scope)),
    );
    if (res.attempt.outcome === 'skipped') continue;
    attempts.push(res.attempt);
    if (res.attempt.outcome === 'error') leagueFailed += 1;
    if (res.attempt.outcome === 'ok') leagueRead += 1;
    // Every row is kept, a game the statewide page gave too included: cleanSbliveRows keeps the better of the two
    // (scored and final over not), so a score the league page has by now is never lost to an earlier unscored row.
    for (const g of res.games) {
      scoreboardRows.push(g);
      if (seenGames.has(g.sbliveGameId)) continue;
      seenGames.add(g.sbliveGameId);
      leagueAdded += 1;
    }
  }
  if (leagueRead > 0) {
    ctx.log(
      `  sblive: ${leagueRead} league ${leagueRead === 1 ? 'scoreboard' : 'scoreboards'} for ${[...new Set(truncatedDays)].length} cut-short ` +
        `${truncatedDays.length === 1 ? 'day' : 'days'} added ${leagueAdded} ${leagueAdded === 1 ? 'game' : 'games'} the statewide pages did not list`,
    );
  }

  // 2. targeted team pages (D2 rule 8)
  const plan = planBackfill({ games, unmatched, today: ctx.today, moves: ctx.editor?.moves }, scoreboardCoverage(scoreboardRows));
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
    const res = await read(ctx, { kind: 'sblive-team-games', team: slug }, base, (body, url) =>
      parseTeamGamesPage(body, url, (m) => ctx.warn(`sblive: ${m}`, base.scope)),
    );
    attempts.push(res.attempt);
    teamRows.push(...res.games);
  }

  const ok = attempts.filter((a) => a.outcome === 'ok').length;
  const failed = attempts.filter((a) => a.outcome === 'error').length;

  // 3a. every si.com request failed: re-apply what is still eligible, carry the previous report.
  if (ok === 0 && failed > 0) {
    record(ctx, attempts, true);
    ctx.warn('sblive: every request failed');
    return withoutSblive(ctx, games, unmatched, 'every request failed');
  }

  // 3b. nothing was read (nothing to read, or nothing in the corpus): no si.com data this run.
  if (ok === 0) {
    record(ctx, attempts, false);
    ctx.log('  sblive: no si.com page was read this run');
    return withoutSblive(ctx, games, unmatched, 'nothing read');
  }

  // What this run consulted: a scoreboard row of the pair near the date, or a team page of either side.
  const scoreboardCovers = scoreboardCoverage(scoreboardRows);
  const okPages = new Set(
    attempts.flatMap((a) => (a.outcome === 'ok' && a.row.kind === 'sblive-team-games' && a.row.scope?.team ? [a.row.scope.team] : [])),
  );
  const consulted = (pairKey: string, date: string): boolean =>
    scoreboardCovers(pairKey, date) || pairKey.split('~').some((slug) => okPages.has(slug));

  const cleaned = cleanSbliveRows([...scoreboardRows, ...teamRows]);
  if (cleaned.junkPath.length) {
    ctx.log(`  sblive: ignored ${cleaned.junkPath.length} rows outside ${SBLIVE_GAME_PATH_PREFIX} (${cleaned.junkPath.map((g) => g.sbliveGameId).join(', ')})`);
  }
  if (cleaned.ignored.length) {
    ctx.log(`  sblive: dropped ${cleaned.ignored.length} JV-only/withdrawn rows (${cleaned.ignored.map((g) => g.sbliveGameId).join(', ')})`);
  }
  const { decided, result } = backfillOf(ctx, { games, unmatched, sblive: cleaned.rows, sbliveFailed: false, consulted });
  for (const w of result.warnings) ctx.warn(`sblive: ${w}`);
  // Failed pages are stale (not merely errors) when an earlier si.com score was carried in their place.
  record(ctx, attempts, result.carried.length > 0);
  for (const r of result.rows) ctx.log(`  sblive: published si.com ${r.rule} ${r.dateKey} ${r.label} (${r.sblive.away}-${r.sblive.home})`);

  // The statewide scoreboard is STATEWIDE: rows with no registry side can never join.
  const deduped = dedupeSbliveGames(cleaned.rows);
  const relevant = deduped.filter((g) => g.sides.some((s) => s.slug !== null));
  const rec = decideReconcile(result.games, relevant, { sbliveFetchedAt: ctx.fetchedAt, today: ctx.today, skipped: result.skipped });
  const out = result.games.map((g) => applyReconcile(g, rec.byContestId.get(g.contestId)));
  const crossCheck = withBackfill(rec.report, result);
  for (const c of crossCheck.conflicts) ctx.warn(`score conflict ${c.dateKey} ${c.label}: ${c.note}`);
  ctx.log(
    `  sblive: ${deduped.length} rows (${relevant.length} with a registry side) · ` +
      `matched ${crossCheck.compared} · agree ${crossCheck.agreements} · conflicts ${crossCheck.conflicts.length} · ` +
      `backfilled ${crossCheck.backfilled.length} · si.com-only ${crossCheck.sbliveOnlyScored.length} · unmatched ${rec.unmatched}`,
  );
  ctx.trace?.push({ stage: 'sblive', kind: 'decide', input: { games, sblive: cleaned.rows }, games: out });
  return { games: out, unmatched: result.unmatched, sbliveCrossCheck: crossCheck, ...handover(cleaned.rows, decided, rec.byContestId) };
};
