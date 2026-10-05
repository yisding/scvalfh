/**
 * Step 09 (SPEC §7.4, §7.13): the secondary sources, logic unchanged from the single-file cron.
 *
 *  - VNN / PlayOn school calendars: venue + start-time corroboration (only for the verified sites
 *    whose team's league is in the run). PER SITE carry-forward: a school whose feed produced
 *    nothing this run keeps the venues and confirmed start times it published before.
 *  - CCS calendar + bracket poll, season-gated from CCS.pollFrom. PER PART carry-forward: a part
 *    not read this run (`--no-ccs`, no CCS league in `--leagues`, the season gate, not in the
 *    corpus, a failed request) keeps the previous snapshot's value — the calendar its
 *    `ccsCalendar` + `keyDatesConfirmed`, the bracket its `bracketPublished` — so a run that never
 *    queried CCS (an MCAL-only refresh) cannot unpublish a live bracket or drop a confirmed
 *    calendar. With no previous snapshot the bracket is unpublished and there is no calendar. The
 *    source rows are unchanged ('skipped' / 'error'): the carry only shows in the run log.
 *
 * Every failure becomes a SourceStatus row; a resource the corpus lacks is 'skipped' ('not in
 * corpus'), which is how an offline run skips these steps.
 */

import { CCS, getLeague } from '../../leagues';
import { CCS_ICAL_URL, ccsPollingOpen, confirmKeyDates, parseCcsIcal, readBracketPublished } from '../../sources/ccs';
import { VNN_SITE_IDS, applyVnnEvents, carryVnnForward, parseVnnIcs, type VnnEvent } from '../../sources/vnn-ics';
import { getTeamBySlug } from '../../teams';
import type { Game } from '../../types';
import type { SecondaryStepResult } from '../contract';
import { carriedFromOf, type PipelineContext } from '../ledger';
import { classifyFetchError } from '../read';
import { resourceUrl } from '../transport';

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
      const failed = classifyFetchError(err);
      if (failed.status === 'error') ctx.warn(`vnn ${site.slug} calendar failed: ${failed.error}`);
      ctx.source({ ...base, ...failed });
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

type CcsState = Omit<SecondaryStepResult, 'games'>;

/** What this run read from CCS. A `null` part was not read: skipped, not in the corpus, or failed. */
interface CcsRead {
  calendar: Pick<CcsState, 'ccsCalendar' | 'keyDatesConfirmed'> | null;
  bracketPublished: boolean | null;
}

/**
 * The CCS state to publish: each part read this run as read, each part not read carried from the
 * previous snapshot (calendar and bracket independently), and with no previous snapshot today's
 * empty state (bracket not published, no calendar). `why` names what was not read, for the log.
 */
function ccsState(ctx: PipelineContext, read: CcsRead, why: string): CcsState {
  const prev = ctx.previous?.playoffs;
  const carried: string[] = [];
  let bracketPublished = read.bracketPublished ?? false;
  if (read.bracketPublished === null && prev) {
    bracketPublished = prev.bracketPublished;
    carried.push('bracket');
  }
  let calendar = read.calendar ?? {};
  if (read.calendar === null && prev && (prev.ccsCalendar !== undefined || prev.keyDatesConfirmed !== undefined)) {
    calendar = {
      ...(prev.ccsCalendar ? { ccsCalendar: prev.ccsCalendar.map((e) => ({ ...e })) } : {}),
      ...(prev.keyDatesConfirmed === undefined ? {} : { keyDatesConfirmed: prev.keyDatesConfirmed }),
    };
    carried.push('calendar');
  }
  if (read.calendar === null || read.bracketPublished === null) {
    ctx.log(
      `  ccs: ${why} — ${carried.length ? `carried ${carried.join('/')} state from the previous snapshot` : 'nothing to carry'}`,
    );
  }
  return { ...calendar, bracketPublished };
}

async function stepCcs(ctx: PipelineContext): Promise<CcsState> {
  const nothingRead: CcsRead = { calendar: null, bracketPublished: null };
  if (!ctx.args.ccs) return ccsState(ctx, nothingRead, 'skipped (--no-ccs)');
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
    return ccsState(ctx, nothingRead, `skipped (${reason})`);
  }

  const read: CcsRead = { calendar: null, bracketPublished: null };
  const missed: string[] = [];
  try {
    const res = await ctx.transport.get({ kind: 'ccs-ical' });
    const events = parseCcsIcal(res.body);
    const check = confirmKeyDates(events);
    read.calendar = { ccsCalendar: events, keyDatesConfirmed: check.confirmed };
    for (const d of check.differences) ctx.warn(`ccs calendar: ${d}`);
    ctx.source({ ...calendarBase, status: 'ok', httpStatus: res.httpStatus, rowCount: events.length });
    ctx.log(`  ccs calendar: ${events.length} events · key dates ${check.confirmed ? 'confirmed' : 'DIFFER'}`);
  } catch (err) {
    const failed = classifyFetchError(err);
    if (failed.status === 'error') ctx.warn(`ccs calendar failed: ${failed.error}`);
    ctx.source({ ...calendarBase, ...failed });
    missed.push(failed.status === 'skipped' ? 'calendar not in corpus' : 'calendar failed');
  }
  try {
    const res = await ctx.transport.get({ kind: 'ccs-bracket' });
    const state = readBracketPublished(res.body);
    read.bracketPublished = state.published;
    ctx.source({ ...bracketBase, status: 'ok', httpStatus: res.httpStatus });
    ctx.log(`  ccs bracket: ${state.published ? 'PUBLISHED' : 'not published'} (${state.reason})`);
  } catch (err) {
    const failed = classifyFetchError(err);
    if (failed.status === 'error') ctx.warn(`ccs bracket page failed: ${failed.error}`);
    ctx.source({ ...bracketBase, ...failed });
    missed.push(failed.status === 'skipped' ? 'bracket not in corpus' : 'bracket page failed');
  }
  return ccsState(ctx, read, missed.join(', '));
}

export async function stepSecondary(ctx: PipelineContext, games: readonly Game[]): Promise<SecondaryStepResult> {
  const withVnn = await stepVnn(ctx, games);
  const ccs = await stepCcs(ctx);
  return { games: withVnn, ...ccs };
}
