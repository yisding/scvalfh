/**
 * Step 11b (docs/DATA-SOURCES.md §1.2a): the cifsshome.org score cross-check. It runs after the
 * guards, so it compares the games the snapshot will publish, and it never changes one: its only
 * output is `Snapshot.cifssCrossCheck` (lib/cifss-crosscheck.ts).
 *
 * Every Section our teams play in is read season to date (CIFSS_SECTIONS: one listing each, every
 * page of it), one SourceStatus row per Section. The report is all or nothing, so it never flaps
 * with a single page: unless every Section was read in full, the previous report is carried, keeping
 * only the rows still true of this run's games (`carryCifssCrossCheck`), and a failed Section's row
 * is marked stale. A Section the corpus lacks is 'skipped', which is how an offline run skips it.
 */

import { carryCifssCrossCheck, compareCifss, type NonGame } from '../../cifss-crosscheck';
import { dateKeyOf } from '../../normalize';
import {
  CIFSS_SECTIONS,
  CIFSS_SEASON_FROM,
  cifssListingUrl,
  parseCifssPage,
  type CifssRow,
  type CifssSectionKey,
} from '../../sources/cifss';
import { getTeamById, resolveTeam, sideJoinKey, unorderedPairKey } from '../../teams';
import type { CifssCrossCheck, SourceStatus } from '../../types';
import { carriedFromOf, type PipelineContext, type RunState } from '../ledger';
import { classifyFetchError } from '../read';

/** A Section listing longer than this many pages is read no further (and warned about). */
export const CIFSS_MAX_PAGES = 60;

const label = (section: CifssSectionKey): string =>
  `cifsshome.org ${CIFSS_SECTIONS.find((s) => s.key === section)?.name ?? section} field hockey`;

interface SectionRead {
  section: CifssSectionKey;
  outcome: 'ok' | 'error' | 'skipped';
  rows: CifssRow[];
  httpStatus?: number;
  error?: string;
}

async function readSection(ctx: PipelineContext, section: CifssSectionKey): Promise<SectionRead> {
  const rows: CifssRow[] = [];
  let lastPage = 1;
  let httpStatus: number | undefined;
  for (let page = 1; page <= lastPage; page += 1) {
    try {
      const res = await ctx.transport.get({ kind: 'cifss-scores', section, page, through: ctx.today });
      const parsed = parseCifssPage(res.body, section, (m) => ctx.log(`  cifss ${section}: ${m}`));
      rows.push(...parsed.rows);
      httpStatus = res.httpStatus;
      if (page === 1) {
        lastPage = Math.min(parsed.lastPage, CIFSS_MAX_PAGES);
        if (parsed.lastPage > CIFSS_MAX_PAGES) {
          ctx.warn(`cifss ${section}: ${parsed.lastPage} pages listed, reading the first ${CIFSS_MAX_PAGES}`);
        }
      }
    } catch (err) {
      const failed = classifyFetchError(err);
      const where = page === 1 ? '' : ` (page ${page} of ${lastPage})`;
      if (failed.status === 'error') ctx.warn(`${label(section)} failed${where}: ${failed.error}`);
      return { section, outcome: failed.status, rows: [], httpStatus: failed.httpStatus, error: `${failed.error}${where}` };
    }
  }
  return { section, outcome: 'ok', rows, httpStatus };
}

/** MaxPreps contests that are not games: reported Deleted this run, or dropped by the pipeline. */
function nonGamesOf(ctx: PipelineContext, state: RunState): NonGame[] {
  const out: NonGame[] = [];
  for (const r of state.rows) {
    if (r.calculatedFields.contestState !== 1 || r.contest.teams.length !== 2) continue;
    const [a, b] = r.contest.teams.map((t) =>
      sideJoinKey({ slug: (t.teamId ? getTeamById(t.teamId)?.slug : undefined) ?? null, name: t.name ?? '' }),
    );
    out.push({ dateKey: dateKeyOf(r.contest.date), pairKey: unorderedPairKey(a, b) });
  }
  for (const d of ctx.dropped.all()) {
    if (d.dateKey === null || d.teams.length !== 2) continue;
    const [a, b] = d.teams.map((name) => sideJoinKey({ slug: resolveTeam(name)?.slug ?? null, name }));
    out.push({ dateKey: d.dateKey, pairKey: unorderedPairKey(a, b) });
  }
  return out;
}

function carry(ctx: PipelineContext, state: RunState, why: string): CifssCrossCheck | undefined {
  const prior = ctx.previous?.cifssCrossCheck;
  ctx.log(`  cifss: ${why} — ${prior ? 'carried the previous cross-check' : 'no earlier cross-check to carry'}`);
  return prior ? carryCifssCrossCheck(prior, state.games) : undefined;
}

export async function stepCifss(ctx: PipelineContext, state: RunState): Promise<CifssCrossCheck | undefined> {
  if (!ctx.args.cifss) return carry(ctx, state, 'skipped (--no-cifss)');

  const reads: SectionRead[] = [];
  for (const { key } of CIFSS_SECTIONS) reads.push(await readSection(ctx, key));

  const failed = reads.some((r) => r.outcome === 'error');
  const complete = reads.every((r) => r.outcome === 'ok');
  for (const r of reads) {
    const base: Omit<SourceStatus, 'status'> = {
      id: 'cifss',
      kind: 'cifss-scores',
      label: label(r.section),
      url: cifssListingUrl(r.section, { from: CIFSS_SEASON_FROM, to: ctx.today }),
      fetchedAt: ctx.fetchedAt,
    };
    const httpStatus = r.httpStatus !== undefined ? { httpStatus: r.httpStatus } : {};
    if (r.outcome === 'ok') ctx.source({ ...base, status: 'ok', ...httpStatus, rowCount: r.rows.length });
    else ctx.source({ ...base, status: r.outcome, ...httpStatus, error: r.error });
  }

  if (!complete) {
    const result = carry(ctx, state, failed ? 'a Section listing failed' : 'not every Section was read');
    if (failed && result) {
      for (const r of reads.filter((x) => x.outcome === 'error')) {
        const pick = (row: SourceStatus) => row.id === 'cifss' && row.label === label(r.section);
        ctx.sources.markStale(pick, 'previous cifsshome.org cross-check carried forward', carriedFromOf(ctx.previous, pick));
      }
    }
    return result;
  }

  const rows = reads.flatMap((r) => r.rows);
  const { report, ambiguous, nonGameMatches } = compareCifss(state.games, rows, {
    cifssFetchedAt: ctx.fetchedAt,
    nonGames: nonGamesOf(ctx, state),
  });
  for (const a of ambiguous) ctx.log(`  cifss: ${a}: two schools entered different scores, neither MaxPreps', not compared`);
  for (const c of report.conflicts) ctx.log(`  cifss conflict ${c.dateKey} ${c.label}: ${c.note}`);
  ctx.log(
    `  cifss: ${rows.length} rows · compared ${report.compared} · agree ${report.agreements} · ` +
      `conflicts ${report.conflicts.length} · MaxPreps unscored ${report.cifssOnlyScored.length} · ` +
      `not on MaxPreps ${report.notOnMaxPreps.length} · deleted or dropped on MaxPreps ${nonGameMatches}`,
  );
  return report;
}
