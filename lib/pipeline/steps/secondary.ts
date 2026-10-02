/**
 * Step 09 (SPEC §7.4, §7.13): the secondary sources, logic unchanged from the single-file cron.
 *
 *  - VNN / PlayOn school calendars: venue + start-time corroboration (only for the verified sites
 *    whose team's league is in the run). PER SITE carry-forward: a school whose feed produced
 *    nothing this run keeps the venues and confirmed start times it published before.
 *  - CCS calendar + bracket poll, season-gated from CCS.pollFrom.
 *
 * Every failure becomes a SourceStatus row; a resource the corpus lacks is 'skipped' ('not in
 * corpus'), which is how an offline run skips these steps.
 */

import { CCS, getLeague } from '../../leagues';
import { CCS_ICAL_URL, ccsPollingOpen, confirmKeyDates, parseCcsIcal, readBracketPublished } from '../../sources/ccs';
import { VNN_SITE_IDS, applyVnnEvents, carryVnnForward, parseVnnIcs, type VnnEvent } from '../../sources/vnn-ics';
import { getTeamBySlug } from '../../teams';
import type { CcsCalendarEvent, Game } from '../../types';
import { FixtureMissing, TransportError, type SecondaryStepResult } from '../contract';
import { carriedFromOf, type PipelineContext } from '../ledger';
import { resourceUrl } from '../transport';

function statusOf(err: unknown): { httpStatus?: number } {
  return err instanceof TransportError && err.httpStatus !== null ? { httpStatus: err.httpStatus } : {};
}

async function stepVnn(ctx: PipelineContext, input: readonly Game[]): Promise<Game[]> {
  let games = [...input];
  if (!ctx.args.vnn) {
    ctx.log('  vnn: skipped (--no-vnn)');
    return games;
  }
  const inRun = new Set(ctx.leaguesInRun());
  const sites = VNN_SITE_IDS.filter((s) => {
    const team = getTeamBySlug(s.slug);
    return team !== undefined && inRun.has(team.league);
  });
  /** The school calendars that actually answered with events this run. */
  const answered = new Set<string>();
  const events: VnnEvent[] = [];
  for (const site of sites) {
    const key = { kind: 'vnn-ics', team: site.slug } as const;
    const team = getTeamBySlug(site.slug);
    const base = {
      id: 'vnn-ics' as const,
      kind: 'school-calendar' as const,
      scope: { league: team?.league, team: site.slug },
      label: `${site.slug} school calendar`,
      url: resourceUrl(key),
      fetchedAt: ctx.fetchedAt,
    };
    try {
      const res = await ctx.transport.get(key);
      const parsed = parseVnnIcs(res.body, site.slug);
      events.push(...parsed);
      if (parsed.length) answered.add(site.slug);
      ctx.source({ ...base, status: 'ok', httpStatus: res.httpStatus, rowCount: parsed.length });
    } catch (err) {
      if (err instanceof FixtureMissing) {
        ctx.source({ ...base, status: 'skipped', error: 'not in corpus' });
        continue;
      }
      ctx.warn(`vnn ${site.slug} calendar failed: ${(err as Error).message}`);
      ctx.source({ ...base, status: 'error', ...statusOf(err), error: (err as Error).message });
    }
  }
  if (events.length) {
    const applied = applyVnnEvents(games, events);
    games = applied.games;
    for (const w of applied.warnings) ctx.warn(`vnn: ${w}`);
    ctx.log(
      `  vnn: ${events.length} field-hockey events · venues added ${applied.venuesAdded} · ` +
        `times confirmed ${applied.timesConfirmed} · unmatched varsity ${applied.unmatched}`,
    );
  }

  // PER SITE: the venues and confirmed start times already published stay published.
  const missing = sites.filter((s) => !answered.has(s.slug)).map((s) => s.slug);
  if (missing.length && ctx.previous) {
    const restored = carryVnnForward(missing, ctx.previous.games, games);
    games = restored.games;
    if (restored.carried) {
      const carriedFrom = carriedFromOf(ctx.previous, (r) => r.id === 'vnn-ics' && r.status === 'ok');
      ctx.sources.markStale(
        (r) => r.id === 'vnn-ics' && missing.some((slug) => r.label === `${slug} school calendar`),
        'carried forward from the previous snapshot',
        carriedFrom,
      );
      ctx.warn(
        `vnn: ${missing.join(', ')} produced no calendar events — carried ${restored.carried} ` +
          `venue/start-time ${restored.carried === 1 ? 'annotation' : 'annotations'} forward from the previous snapshot`,
      );
    }
  }
  return games;
}

async function stepCcs(ctx: PipelineContext): Promise<Omit<SecondaryStepResult, 'games'>> {
  if (!ctx.args.ccs) {
    ctx.log('  ccs: skipped (--no-ccs)');
    return { bracketPublished: false };
  }
  const calendarBase = {
    id: 'ccs-ical' as const,
    kind: 'ccs-calendar' as const,
    scope: { section: 'ccs' as const },
    label: 'ccs calendar',
    url: CCS_ICAL_URL,
    fetchedAt: ctx.fetchedAt,
  };
  const bracketBase = {
    id: 'maxpreps-html' as const,
    kind: 'ccs-bracket' as const,
    scope: { section: 'ccs' as const },
    label: 'ccs bracket',
    url: CCS.bracketUrl,
    fetchedAt: ctx.fetchedAt,
  };
  // No CCS league in the run, or the season gate is closed: nothing to poll.
  const ccsInRun = ctx.leaguesInRun().some((id) => getLeague(id).sectionId === 'ccs');
  if (!ccsInRun || !ccsPollingOpen(ctx.today)) {
    const reason = !ccsInRun
      ? 'no CCS league in this run'
      : `season gate: polling opens ${CCS.pollFrom} (today ${ctx.today})`;
    ctx.source({ ...calendarBase, status: 'skipped', error: reason });
    ctx.source({ ...bracketBase, status: 'skipped', error: reason });
    ctx.log(`  ccs: skipped (${reason})`);
    return { bracketPublished: false };
  }

  let ccsCalendar: CcsCalendarEvent[] | undefined;
  let keyDatesConfirmed: boolean | undefined;
  let bracketPublished = false;
  try {
    const res = await ctx.transport.get({ kind: 'ccs-ical' });
    const events = parseCcsIcal(res.body);
    const check = confirmKeyDates(events);
    ccsCalendar = events;
    keyDatesConfirmed = check.confirmed;
    for (const d of check.differences) ctx.warn(`ccs calendar: ${d}`);
    ctx.source({ ...calendarBase, status: 'ok', httpStatus: res.httpStatus, rowCount: events.length });
    ctx.log(`  ccs calendar: ${events.length} events · key dates ${check.confirmed ? 'confirmed' : 'DIFFER'}`);
  } catch (err) {
    if (err instanceof FixtureMissing) {
      ctx.source({ ...calendarBase, status: 'skipped', error: 'not in corpus' });
    } else {
      ctx.warn(`ccs calendar failed: ${(err as Error).message}`);
      ctx.source({ ...calendarBase, status: 'error', ...statusOf(err), error: (err as Error).message });
    }
  }
  try {
    const res = await ctx.transport.get({ kind: 'ccs-bracket' });
    const state = readBracketPublished(res.body);
    bracketPublished = state.published;
    ctx.source({ ...bracketBase, status: 'ok', httpStatus: res.httpStatus });
    ctx.log(`  ccs bracket: ${state.published ? 'PUBLISHED' : 'not published'} (${state.reason})`);
  } catch (err) {
    if (err instanceof FixtureMissing) {
      ctx.source({ ...bracketBase, status: 'skipped', error: 'not in corpus' });
    } else {
      ctx.warn(`ccs bracket page failed: ${(err as Error).message}`);
      ctx.source({ ...bracketBase, status: 'error', ...statusOf(err), error: (err as Error).message });
    }
  }
  return {
    ...(ccsCalendar ? { ccsCalendar } : {}),
    ...(keyDatesConfirmed === undefined ? {} : { keyDatesConfirmed }),
    bracketPublished,
  };
}

export async function stepSecondary(ctx: PipelineContext, games: readonly Game[]): Promise<SecondaryStepResult> {
  const withVnn = await stepVnn(ctx, games);
  const ccs = await stepCcs(ctx);
  return { games: withVnn, ...ccs };
}
