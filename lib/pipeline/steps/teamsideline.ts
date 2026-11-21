/**
 * Steps 02-06 for a build whose primary source is the league's own TeamSideline site (lib/pipeline/primary.ts; the
 * VAL): one schedule page, the main level's (lib/sports/shape.ts TeamsidelineSportSeason.pages.main), holds the whole
 * league's season, its scores and its table, so it takes the place of MaxPreps' bootstrap, league metas, reported
 * tables and team feeds at once.
 *
 *  - COLLECT: the page (resource `teamsideline-schedule`), parsed whole (lib/sources/teamsideline.ts) and checked to
 *    be the configured program and level (teamsidelinePageMismatch, the counterpart of the MaxPreps bootstrap's season
 *    check), then read as games (lib/sources/teamsideline-games.ts), one `teamsideline` claim a game.
 *  - MATCH: the claims onto the store by contest id (a new game gets a fixture of its own, named by its day and
 *    sides); a game the page no longer lists loses its claim. The view starts from every game, by date then id.
 *  - A page that cannot be read, or is not the configured one, publishes nothing new: every league of the run is
 *    frozen to its previous snapshot (step 11 substitutes those games; with every league frozen the run aborts as a
 *    systemic outage, so the previous snapshot stays).
 *
 * The league's own table is read with the page; it is not compared with the computed one yet (the reported-table
 * cross-check reads MaxPreps' record shape), so every division's reported table is 'skipped'.
 */

import { attachEditorClaims } from '../../claims/editor';
import { baseFixtureId, fixtureSideKey } from '../../claims/identity';
import type { TeamsidelineClaim } from '../../claims/types';
import { byDateThenId } from '../../format';
import { LEAGUES } from '../../leagues';
import { SEASON_YEAR } from '../../season';
import { parseTeamsidelinePage, type TeamsidelinePage } from '../../sources/teamsideline';
import { fallYearOf, teamsidelineGames } from '../../sources/teamsideline-games';
import { teamsidelineLevel, teamsidelineLevelUrl, teamsidelinePageMismatch } from '../../sources/teamsideline-season';
import type { LeagueId, SourceStatus } from '../../types';
import type { PipelineContext, RunState } from '../ledger';
import { classifyFetchError } from '../read';

/** Every league of the run frozen to its previous snapshot, with the reason. */
function freezeRun(ctx: PipelineContext, leagues: readonly LeagueId[], reason: string, cause: string): void {
  for (const id of leagues) ctx.degrade(id, 'frozen', reason, cause);
}

export async function stepTeamsideline(ctx: PipelineContext, state: RunState): Promise<void> {
  attachEditorClaims(ctx.claims, ctx.editorClaims);
  const inRun = ctx.leaguesInRun();
  const leagues = LEAGUES.filter((l) => inRun.includes(l.id));
  if (leagues.length === 0) {
    ctx.view.start([], new Map());
    ctx.log('  teamsideline: no league in this run');
    return;
  }

  const url = teamsidelineLevelUrl('main');
  const level = teamsidelineLevel('main');
  const base: Omit<SourceStatus, 'status'> = {
    id: 'teamsideline',
    kind: 'league-schedule',
    // The page is the whole league's; with one league in the build its scope is that league.
    ...(leagues.length === 1 ? { scope: { league: leagues[0].id } } : {}),
    label: `league schedule ${level.subtitle}`,
    url,
    fetchedAt: ctx.fetchedAt,
  };

  let page: TeamsidelinePage;
  let httpStatus: number;
  try {
    const res = await ctx.transport.get({ kind: 'teamsideline-schedule', level: 'main' });
    httpStatus = res.httpStatus;
    page = parseTeamsidelinePage(res.body);
  } catch (err) {
    const failed = classifyFetchError(err);
    const message = failed.status === 'skipped' ? 'not in corpus' : (failed.error ?? (err as Error).message);
    ctx.source({ ...base, ...failed });
    ctx.warn(`teamsideline: the league's schedule page could not be read (${message})`);
    freezeRun(ctx, inRun, `The league’s schedule page could not be read this run (${message}); its games are as last published.`, 'league schedule unreadable');
    ctx.view.start([], new Map());
    return;
  }

  const mismatch = teamsidelinePageMismatch(page, 'main');
  if (mismatch !== null) {
    ctx.source({ ...base, status: 'error', httpStatus, error: `not the configured page: ${mismatch}` });
    ctx.warn(`teamsideline: ${url} is not the configured page: ${mismatch}`);
    freezeRun(ctx, inRun, `The league’s schedule page is not the one this site reads (${mismatch}); its games are as last published.`, 'league schedule changed');
    ctx.view.start([], new Map());
    return;
  }

  const read = teamsidelineGames({ page, scheduleId: level.scheduleId, fallYear: fallYearOf(SEASON_YEAR), fetchedAt: ctx.fetchedAt });
  for (const name of read.unknownNames) ctx.warn(`teamsideline: "${name}" is no registry team's name; its games are listed with a side that is not ours`);

  // MATCH: one claim a game, onto the store by contest id; a new game gets a fixture named by its day and sides, minted
  // in day order so a name is the same in every run.
  const fresh: TeamsidelineClaim[] = read.games
    .map((game) => ({ ref: game.contestId, seenAt: ctx.fetchedAt, game }))
    .sort((a, b) => (a.game.dateKey !== b.game.dateKey ? (a.game.dateKey < b.game.dateKey ? -1 : 1) : a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0));
  const vanished = ctx.claims.mergeRead('teamsideline', () => true, fresh, (c) =>
    ctx.claims.create(baseFixtureId(c.game.dateKey, fixtureSideKey(c.game.away), fixtureSideKey(c.game.home))),
  );
  for (const ref of vanished) ctx.log(`  teamsideline: ${ref} is no longer on the page`);

  const order = [...read.games]
    .sort(byDateThenId)
    .map((g) => ctx.claims.fixtureOf('teamsideline', g.contestId) as string);
  ctx.view.start(order, new Map());

  ctx.source({ ...base, status: 'ok', httpStatus, rowCount: page.games.length + page.playoffs.length });
  const finals = read.games.filter((g) => g.status === 'final').length;
  ctx.log(
    `  teamsideline: ${page.title} · ${page.subtitle} · ${read.games.length} games (${finals} final) · ` +
      `${page.standings.length} table rows${read.pendingPlayoffs.length > 0 ? ` · playoff seats not yet filled: ${read.pendingPlayoffs.join(', ')}` : ''}`,
  );
  void state;
}
