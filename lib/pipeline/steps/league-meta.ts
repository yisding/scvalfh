/**
 * Step 03 (SPEC §7.4, §7.5 trigger a): one league metadata read per configured division of every
 * league in the run. Asserts `sportSeasonId`, `year` AND `sectionId === section.maxprepsSectionId`;
 * a mismatch FREEZES that league (its rows from a mismatched season are never published), never the
 * run. A canonical URL slug that differs from config only warns. A read error records the
 * division's meta as 'error' and nothing else.
 */

import { z } from 'zod';

import { divisionLabel, divisionsOf, getLeague, leagueOfDivision, sectionOf } from '../../leagues';
import { SEASON_YEAR, SPORT_SEASON_ID } from '../../season';
import { LeagueMetaSchema } from '../../sources/maxpreps';
import type { DivisionId, LeagueId } from '../../types';
import { FixtureMissing, TransportError } from '../contract';
import {
  asOfStamp,
  hasPreviousData,
  previousLeagueHealth,
  type PipelineContext,
  type RunState,
} from '../ledger';
import { resourceUrl } from '../transport';

const MetaEnvelope = z.looseObject({ data: LeagueMetaSchema });

/** The reason sentence for a league frozen by a mismatched division meta (§7.5 trigger a). */
export function metaMismatchReason(
  previous: PipelineContext['previous'],
  division: DivisionId,
  what: 'season' | 'section',
): string {
  const league = leagueOfDivision(division);
  const head = `MaxPreps moved the ${divisionLabel(division)} table to another ${what} this run`;
  const lastFresh = previousLeagueHealth(previous, league.id)?.lastFreshAt ?? null;
  return hasPreviousData(previous, league.id) && lastFresh
    ? `${head}, so ${league.shortName} is shown as of ${asOfStamp(lastFresh)}.`
    : `${head}, so ${league.shortName} has no results to show until it is fixed.`;
}

/** `blossom-valley--santa-teresa` from `…/league/blossom-valley--santa-teresa/?leagueid=…`. */
export function canonicalLeagueSlug(url: string | null | undefined): string | null {
  const m = /\/league\/([^/?#]+)/.exec(url ?? '');
  return m ? m[1] : null;
}

async function readMeta(ctx: PipelineContext, state: RunState, leagueId: LeagueId, division: DivisionId): Promise<void> {
  const key = { kind: 'maxpreps-league-meta', division } as const;
  const url = resourceUrl(key);
  const base = {
    id: 'maxpreps-api' as const,
    kind: 'league-meta' as const,
    scope: { league: leagueId, division },
    label: `${division} league metadata`,
    url,
    fetchedAt: ctx.fetchedAt,
  };
  const info = state.divisions.get(division);
  const setMeta = (meta: 'ok' | 'error' | 'mismatch' | 'skipped') => {
    if (info) info.meta = meta;
  };

  let body: string;
  let httpStatus: number;
  try {
    const res = await ctx.transport.get(key);
    body = res.body;
    httpStatus = res.httpStatus;
  } catch (err) {
    if (err instanceof FixtureMissing) {
      ctx.source({ ...base, status: 'skipped', error: 'not in corpus' });
      setMeta('skipped');
      return;
    }
    ctx.warn(`${division} league metadata unreadable: ${(err as Error).message}`, base.scope);
    ctx.source({
      ...base,
      status: 'error',
      ...(err instanceof TransportError && err.httpStatus !== null ? { httpStatus: err.httpStatus } : {}),
      error: (err as Error).message,
    });
    setMeta('error');
    return;
  }

  let meta: z.infer<typeof LeagueMetaSchema>;
  try {
    meta = MetaEnvelope.parse(JSON.parse(body) as unknown).data;
  } catch (err) {
    const message = err instanceof z.ZodError ? `schema drift: ${err.issues[0]?.message ?? 'invalid'}` : (err as Error).message;
    ctx.warn(`${division} league metadata unreadable: ${message}`, base.scope);
    ctx.source({ ...base, status: 'error', httpStatus, error: message });
    setMeta('error');
    return;
  }

  const section = sectionOf(leagueId);
  const problems: string[] = [];
  let what: 'season' | 'section' = 'season';
  if (meta.sportSeasonId !== SPORT_SEASON_ID) {
    problems.push(`sportSeasonId is ${meta.sportSeasonId}, expected ${SPORT_SEASON_ID}`);
  }
  if (meta.year !== SEASON_YEAR) problems.push(`year is ${meta.year}, expected ${SEASON_YEAR}`);
  if (meta.sectionId !== undefined && meta.sectionId !== null && meta.sectionId !== section.maxprepsSectionId) {
    if (problems.length === 0) what = 'section';
    problems.push(`sectionId is ${meta.sectionId}, expected ${section.maxprepsSectionId}`);
  } else if (!meta.sectionId) {
    ctx.warn(`${division} league metadata carries no sectionId; the section was not checked`, base.scope);
  }

  const slug = canonicalLeagueSlug(meta.canonicalUrl);
  const expectedSlug = divisionsOf(leagueId).find((d) => d.id === division)?.maxprepsSlug;
  if (slug !== null && expectedSlug && slug !== expectedSlug) {
    ctx.warn(`${division} league metadata: canonical URL slug is ${slug}, config says ${expectedSlug}`, base.scope);
  }

  if (problems.length > 0) {
    const message = `${division}: ${problems.join('; ')}`;
    ctx.warn(`league metadata mismatch — ${message}`, base.scope);
    ctx.source({ ...base, status: 'error', httpStatus, error: `mismatch: ${problems.join('; ')}` });
    setMeta('mismatch');
    ctx.leagues.degrade(
      leagueId,
      'frozen',
      metaMismatchReason(ctx.previous, division, what),
      what === 'season' ? 'meta season mismatch' : 'meta section mismatch',
    );
    return;
  }
  ctx.source({ ...base, status: 'ok', httpStatus });
  setMeta('ok');
}

export async function stepLeagueMeta(ctx: PipelineContext, state: RunState): Promise<void> {
  for (const leagueId of ctx.leaguesInRun()) {
    for (const division of getLeague(leagueId).divisions) {
      await readMeta(ctx, state, leagueId, division.id);
    }
  }
}
