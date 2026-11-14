/**
 * Step 09 (SPEC §7.4, §7.13): the secondary sources, logic unchanged from the single-file cron.
 *
 *  - VNN / PlayOn school calendars: venue + start-time corroboration (only for the verified sites
 *    whose team's league is in the run). PER SITE carry-forward: a school whose feed produced
 *    nothing this run keeps the venues and confirmed start times it published before, and its
 *    source row is stamped with when that school's own calendar was last fresh.
 *  - CCS calendar + bracket poll, season-gated from CCS.pollFrom. PER PART carry-forward: a part
 *    not read this run (`--no-ccs`, no CCS league in `--leagues`, the season gate, not in the
 *    corpus, a failed request, or a tournament page `readTournamentPage` does not recognise: a 403
 *    body, an interstitial, a redesign, the wrong tournament) keeps the previous snapshot's value —
 *    the calendar its `ccsCalendar` + `keyDatesConfirmed`, the bracket its `bracketPublished` +
 *    `divisionsPublished` — so a run that never queried CCS (an MCAL-only refresh) cannot unpublish
 *    a live bracket or drop a confirmed calendar, and a page that is not the bracket page cannot
 *    publish one (2026-10-29: the old "marker gone" rule would have). With no previous snapshot the
 *    bracket is unpublished and there is no calendar. The source rows are unchanged ('skipped' /
 *    'error'): the carry only shows in the run log.
 *
 *  - The published brackets, whole (lib/sources/maxpreps-tournament.ts), for a championship whose divisions this
 *    site does not name itself (CCS.ccsDivisions empty: volleyball's Open Division and Divisions 1-5): every CCS
 *    division from the tournament page the bracket poll just read, then one page per CIF State division a team of
 *    ours plays in (the `bracket.url` of its games). PER BRACKET carry-forward: a bracket whose page was not read
 *    or did not parse this run keeps the previous snapshot's copy.
 *
 *  - The San Diego Section's bracket sheet (steps/sds-sheet.ts): the playoff results MaxPreps lacks, PER TAB
 *    carry-forward.
 *
 * Every failure becomes a SourceStatus row; a resource the corpus lacks is 'skipped' ('not in
 * corpus'), which is how an offline run skips these steps.
 */

import { CIF_STATE_RE } from '../../classify';
import { CCS } from '../../league-config/sections';
import { getLeague } from '../../leagues';
import { CCS_ICAL_URL, ccsPollingOpen, confirmKeyDates, parseCcsIcal, readTournamentPage } from '../../sources/ccs';
import { isTournamentPageUrl, parseTournamentBrackets } from '../../sources/maxpreps-tournament';
import { VNN_SITE_IDS, applyVnnEvents, carryVnnForward, parseVnnIcs, type VnnEvent } from '../../sources/vnn-ics';
import { getTeamBySlug } from '../../teams';
import type { CcsDivisionName, Game, TournamentBracket } from '../../types';
import type { SecondaryStepResult } from '../contract';
import { carriedFromOf, type PipelineContext } from '../ledger';
import { classifyFetchError } from '../read';
import { resourceUrl } from '../transport';
import { stepSdsSheet } from './sds-sheet';

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
      for (const slug of missing) {
        const label = `${slug} school calendar`;
        const carriedFrom = carriedFromOf(
          ctx.previous,
          (r) => r.id === 'vnn-ics' && (r.scope?.team === slug || r.label === label),
        );
        ctx.sources.markStale(
          (r) => r.id === 'vnn-ics' && r.label === label,
          'carried forward from the previous snapshot',
          carriedFrom,
        );
      }
      ctx.warn(
        `vnn: ${missing.join(', ')} produced no calendar events — carried ${restored.carried} ` +
          `venue/start-time ${restored.carried === 1 ? 'annotation' : 'annotations'} forward from the previous snapshot`,
      );
    }
  }
  return games;
}

type CcsState = Omit<SecondaryStepResult, 'games' | 'brackets'>;

type CcsBracketState = Pick<CcsState, 'bracketPublished' | 'divisionsPublished'>;

/** What this run read from CCS. A `null` part was not read: skipped, not in the corpus, failed, or (the bracket) a page not recognised. */
interface CcsRead {
  calendar: Pick<CcsState, 'ccsCalendar' | 'keyDatesConfirmed'> | null;
  bracket: CcsBracketState | null;
}

/**
 * The CCS state to publish: each part read this run as read, each part not read carried from the
 * previous snapshot (calendar and bracket independently), and with no previous snapshot today's
 * empty state (bracket not published, no calendar). `why` names what was not read, for the log.
 */
function ccsState(ctx: PipelineContext, read: CcsRead, why: string): CcsState {
  const prev = ctx.previous?.playoffs;
  const carried: string[] = [];
  let bracket: CcsBracketState = read.bracket ?? { bracketPublished: false };
  if (read.bracket === null && prev) {
    bracket = {
      bracketPublished: prev.bracketPublished,
      ...(prev.divisionsPublished ? { divisionsPublished: { ...prev.divisionsPublished } } : {}),
    };
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
  if (read.calendar === null || read.bracket === null) {
    ctx.log(
      `  ccs: ${why} — ${carried.length ? `carried ${carried.join('/')} state from the previous snapshot` : 'nothing to carry'}`,
    );
  }
  return { ...calendar, ...bracket };
}

/** The CCS state, whether the CCS sources were polled at all this run, and the tournament page's body when it was read and recognised. */
interface CcsStepResult {
  state: CcsState;
  polled: boolean;
  page: string | null;
}

async function stepCcs(ctx: PipelineContext): Promise<CcsStepResult> {
  const nothingRead: CcsRead = { calendar: null, bracket: null };
  if (!ctx.args.ccs) return { state: ccsState(ctx, nothingRead, 'skipped (--no-ccs)'), polled: false, page: null };
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
    url: CCS.bracketUrl ?? CCS.sources.index,
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
    return { state: ccsState(ctx, nothingRead, `skipped (${reason})`), polled: false, page: null };
  }

  const read: CcsRead = { calendar: null, bracket: null };
  let pageBody: string | null = null;
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
  if (CCS.bracketUrl === null) {
    // No MaxPreps tournament page exists for the season yet (soccer, 2026-11-06): nothing to read.
    ctx.source({ ...bracketBase, status: 'skipped', error: 'no MaxPreps CCS tournament page for this season yet' });
  } else try {
    const res = await ctx.transport.get({ kind: 'ccs-bracket' });
    const page = readTournamentPage(res.body);
    if (!page.recognised) {
      // Not the bracket page we know (a WAF body, an interstitial, a redesign, another tournament): the bracket
      // part was NOT READ. The previous state is carried, never flipped, and the row says why.
      ctx.warn(`ccs bracket: page not recognised (${page.reason})`);
      ctx.source({ ...bracketBase, status: 'error', httpStatus: res.httpStatus, error: `page not recognised: ${page.reason}` });
      ctx.log(`  ccs bracket: page not recognised (${page.reason}) — carried bracket state from the previous snapshot`);
      missed.push('bracket page not recognised');
    } else {
      // A division whose block is missing from an otherwise recognised page keeps its previous answer, else false.
      const prev = ctx.previous?.playoffs.divisionsPublished;
      const divisionsPublished = Object.fromEntries(
        CCS.ccsDivisions.map((d) => [d.name, page.divisions.find((p) => p.name === d.name)?.published ?? prev?.[d.name] ?? false]),
      ) as Record<CcsDivisionName, boolean>;
      // A championship whose divisions this site does not name (CCS.ccsDivisions empty: volleyball's Open Division
      // and Divisions 1-5) is published once any of its bracket blocks is.
      const bracketPublished = CCS.ccsDivisions.length === 0
        ? page.divisions.some((d) => d.published)
        : Object.values(divisionsPublished).some(Boolean);
      // No per-division answer is stored where this site names no division: the schema's two keys are field hockey's.
      read.bracket = CCS.ccsDivisions.length === 0 ? { bracketPublished } : { bracketPublished, divisionsPublished };
      pageBody = res.body;
      ctx.source({ ...bracketBase, status: 'ok', httpStatus: res.httpStatus, rowCount: page.divisions.filter((d) => d.published).length });
      ctx.log(`  ccs bracket: ${page.reason}`);
    }
  } catch (err) {
    const failed = classifyFetchError(err);
    if (failed.status === 'error') ctx.warn(`ccs bracket page failed: ${failed.error}`);
    ctx.source({ ...bracketBase, ...failed });
    missed.push(failed.status === 'skipped' ? 'bracket not in corpus' : 'bracket page failed');
  }
  return { state: ccsState(ctx, read, missed.join(', ')), polled: true, page: pageBody };
}

/** 'Open Division' first, then 'Division I' / 'Division 1' … in number order, then anything else by name. */
function divisionRank(name: string): number {
  if (/\bopen\b/i.test(name)) return 0;
  const word = /\bdivision\s+([ivx]+|\d+)\b/i.exec(name)?.[1].toUpperCase();
  if (!word) return 99;
  if (/^\d+$/.test(word)) return Number(word);
  const roman: Record<string, number> = { I: 1, V: 5, X: 10 };
  return [...word].reduce((sum, ch, i) => sum + (roman[ch] < (roman[word[i + 1]] ?? 0) ? -roman[ch] : roman[ch]), 0);
}

/**
 * The published brackets, whole (lib/types.ts CcsPlayoffs.brackets): the CCS divisions from `ccsPage` (the
 * tournament page stepCcs read and recognised; null = not read), then each CIF State division a team of ours plays
 * in, one page each. A bracket not read this run is the previous snapshot's. Only where this site names no CCS
 * division of its own (CCS.ccsDivisions empty); elsewhere undefined, and nothing is requested.
 */
async function stepBrackets(
  ctx: PipelineContext,
  games: readonly Game[],
  polled: boolean,
  ccsPage: string | null,
): Promise<TournamentBracket[] | undefined> {
  if (CCS.ccsDivisions.length > 0) return undefined;
  const previous = ctx.previous?.playoffs.brackets ?? [];
  const carry = (list: readonly TournamentBracket[]): TournamentBracket[] => list.map((b) => structuredClone(b));
  // The CCS sources were not polled (--no-ccs, no CCS league in the run, the season gate): everything stays.
  if (!polled) return previous.length > 0 ? carry(previous) : undefined;

  const out: TournamentBracket[] = [];
  const carried: string[] = [];

  // 1. The CCS divisions, in page order; one the page no longer gives whole keeps its previous copy, in place.
  const previousCcs = previous.filter((b) => b.event === 'ccs');
  if (ccsPage === null || CCS.bracketUrl === null) {
    out.push(...carry(previousCcs));
    carried.push(...previousCcs.map((b) => `CCS ${b.name}`));
  } else {
    const page = parseTournamentBrackets(ccsPage);
    const read = page.brackets.map((b): TournamentBracket => ({ event: 'ccs', url: CCS.bracketUrl as string, ...b }));
    const kept = previousCcs.filter((b) => !read.some((r) => r.bracketId === b.bracketId));
    out.push(...[...read, ...carry(kept)].sort((a, b) => divisionRank(a.name) - divisionRank(b.name) || a.name.localeCompare(b.name)));
    carried.push(...kept.map((b) => `CCS ${b.name}`));
    for (const problem of page.problems.filter((p) => !/: not published$/.test(p))) ctx.warn(`ccs brackets: ${problem}`);
    ctx.log(`  ccs brackets: ${read.length} read whole (${read.map((b) => `${b.name} ${b.matchups.length}`).join(' · ') || 'none published'})`);
  }

  // 2. The CIF State divisions a team of ours plays in: the pages its games' bracket fields name.
  const targets = new Map<string, { url: string; name: string }>();
  for (const g of games) {
    const b = g.bracket;
    if (!b || !b.published || !b.url || !b.bracketId || !isTournamentPageUrl(b.url)) continue;
    if (!CIF_STATE_RE.test(b.tournament ?? '') || !(g.home.slug || g.away.slug)) continue;
    if (!targets.has(b.bracketId)) targets.set(b.bracketId, { url: b.url, name: b.name ?? b.bracketId });
  }
  const cif: TournamentBracket[] = [];
  for (const [bracketId, target] of targets) {
    const base = {
      id: 'maxpreps-html' as const,
      kind: 'tournament-bracket' as const,
      label: `cif bracket ${target.name}`,
      url: target.url,
      fetchedAt: ctx.fetchedAt,
    };
    const before = previous.find((b) => b.event === 'cif' && b.bracketId === bracketId);
    const keep = (why: string) => {
      if (before) {
        cif.push(structuredClone(before));
        carried.push(`CIF ${before.name}`);
      }
      ctx.log(`  cif bracket ${target.name}: ${why}${before ? ' — carried from the previous snapshot' : ''}`);
    };
    try {
      const res = await ctx.transport.get({ kind: 'tournament-bracket', bracketId, url: target.url });
      const page = parseTournamentBrackets(res.body);
      const found = page.brackets.find((b) => b.bracketId === bracketId);
      if (!found) {
        const reason = page.problems.join('; ') || 'the bracket is not on the page';
        ctx.warn(`cif bracket ${target.name}: not read (${reason})`);
        ctx.source({ ...base, status: 'error', httpStatus: res.httpStatus, error: `bracket not read: ${reason}` });
        keep('not read');
        continue;
      }
      cif.push({ event: 'cif', url: target.url, ...found });
      ctx.source({ ...base, status: 'ok', httpStatus: res.httpStatus, rowCount: found.matchups.length });
      ctx.log(`  cif bracket ${found.name}: ${found.matchups.length} matchups`);
    } catch (err) {
      const failed = classifyFetchError(err);
      if (failed.status === 'error') ctx.warn(`cif bracket ${target.name} failed: ${failed.error}`);
      ctx.source({ ...base, ...failed });
      keep(failed.status === 'skipped' ? 'not in corpus' : 'page failed');
    }
  }
  out.push(...cif.sort((a, b) => divisionRank(a.name) - divisionRank(b.name) || a.name.localeCompare(b.name)));
  if (carried.length > 0) ctx.log(`  brackets carried from the previous snapshot: ${carried.join(', ')}`);
  return out.length > 0 ? out : undefined;
}

export async function stepSecondary(ctx: PipelineContext, games: readonly Game[]): Promise<SecondaryStepResult> {
  const withVnn = await stepVnn(ctx, games);
  const ccs = await stepCcs(ctx);
  const brackets = await stepBrackets(ctx, withVnn, ccs.polled, ccs.page);
  const withSheet = await stepSdsSheet(ctx, withVnn);
  return { games: withSheet, ...ccs.state, ...(brackets ? { brackets } : {}) };
}
