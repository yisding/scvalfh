/**
 * Step 09, third part (after VNN and CCS): the San Diego Section's bracket sheet, the results of the Section's
 * playoff games MaxPreps lacks (lib/sources/sds-bracket-sheet.ts reads a tab, lib/postseason/sds-sheet-results.ts
 * decides the results; MaxPreps stays primary).
 *
 * One request per division tab (three), from the playoffs' first day (the config's window, Nov 2), while a San
 * Diego league is in the run and data/field-hockey/sds-brackets-2026.json has its brackets. PER TAB carry-forward: a tab not
 * read this run (the gate, `--leagues` without a San Diego league, not in the corpus, a failed request, a tab
 * whose title is not its division's) keeps the results the previous run published from it, read from the sheet's
 * claims (lib/claims/sources/sds-sheet.ts: the rows as the previous publication's games showed them), so a failed
 * read never takes a result off the site; a tab read with a warning (a column the parser could not place) keeps the
 * previous results for the pairs it did not read. The sheet's games with no score yet give the times MaxPreps lacks
 * and list the games it has not posted (lib/postseason/sds-sheet-results.ts rules 4-5). Every tab is a source row
 * ('ok' with its result count, else 'skipped' / 'error' / 'stale').
 *
 * MATCH is decideSdsSheet over this run's games; each decision is applied to its game, and a game only the sheet has
 * (`cifsds:`) is published on a fixture created from its row's claim. Runs before step 10, so the games it adds are
 * classified as every other game is (lib/classify.ts tags a game between two San Diego teams from Nov 2
 * 'section-playoffs').
 */

import { SDS_BRACKET_SHEET_URL } from '../../league-config/sections';
import { LEAGUES } from '../../leagues';
import { SDS_BRACKETS_FILE, sdsDivisionTeams } from '../../postseason/sds-brackets-file';
import { sdsPlayoffWindow } from '../../postseason/sds-brackets-schema';
import { applySdsSheetDecision, decideSdsSheet, isCifsdsContest, type SdsSheetDecision } from '../../postseason/sds-sheet-results';
import { parseSdsBracketTab, type SdsSheetFixture, type SdsSheetRead, type SdsSheetResult } from '../../sources/sds-bracket-sheet';
import { createSheetFixtures, storedSheetRows } from '../../claims/sources/sds-sheet';
import type { SdsTabTrace } from '../../claims/types';
import type { ContestId, Game } from '../../types';
import { carriedFromOf, type PipelineContext } from '../ledger';
import { classifyFetchError } from '../read';
import { resourceUrl } from '../transport';

const pairOf = (x: SdsSheetResult | SdsSheetFixture) =>
  ('teams' in x ? [...x.teams] : [x.winner, x.loser]).sort().join('~');

/** The earlier results or fixtures for pairs this run's read of the tab has neither a result nor a fixture for. */
export function keepUnread<T extends SdsSheetResult | SdsSheetFixture>(
  previous: readonly T[],
  fresh: readonly (SdsSheetResult | SdsSheetFixture)[],
): T[] {
  const read = new Set(fresh.map(pairOf));
  return previous.filter((r) => !read.has(pairOf(r)));
}

/**
 * A tab dated in another year than the playoffs' (last season's sheet left in place, a template not yet filled in)
 * is not this season's bracket: it is read as not recognised, so the division keeps its previous results.
 */
export function staleTab(read: Extract<SdsSheetRead, { recognised: true }>, windowFirst: string): SdsSheetRead {
  const year = windowFirst.slice(0, 4);
  const other = [...read.results, ...read.fixtures].find((x) => x.dateKey.slice(0, 4) !== year);
  return other ? { recognised: false, reason: `dated ${other.dateKey}, not the ${year} playoffs` } : read;
}

function label(division: string): string {
  return `sds bracket sheet ${division}`;
}

/**
 * The sheet's stage: each existing game's decision by contest id (the last one taken for it), and the games only the
 * sheet has, in the order the stage took them; with the stage's input decided, the `cifsds:` games among it left out
 * and the created games added, in the sheet's order (dateKey, then contest id).
 */
export interface SdsSheetStage {
  games: Game[];
  decisions: ReadonlyMap<ContestId, SdsSheetDecision>;
  created: readonly Game[];
  /** Whether the stage ran (the brackets file has divisions): only then are `cifsds:` games decided again and the list re-sorted. */
  ran: boolean;
}

export async function stepSdsSheet(ctx: PipelineContext, games: readonly Game[]): Promise<SdsSheetStage> {
  const file = SDS_BRACKETS_FILE;
  if (file.divisions.length === 0) {
    ctx.trace?.push({ stage: 'sdsSheet', input: { tabs: [] }, results: [], fixtures: [], games: [...games] });
    return { games: [...games], decisions: new Map(), created: [], ran: false };
  }
  const window = sdsPlayoffWindow();
  const sdsLeagues = LEAGUES.filter((l) => l.postseason.kind === 'section-playoffs').map((l) => l.id);
  const inRun = ctx.leaguesInRun().some((id) => sdsLeagues.includes(id));
  const gate = !inRun
    ? 'no San Diego league in this run'
    : ctx.today < window.first
      ? `season gate: the playoffs start ${window.first} (today ${ctx.today})`
      : null;

  // What the previous run published from the sheet, from the sheet's claims, in that publication's order.
  const stored = storedSheetRows(ctx.claims);
  const previous = stored.results;
  const previousFixtures = stored.fixtures;
  const results: SdsSheetResult[] = [];
  const fixtures: SdsSheetFixture[] = [];
  const carried: string[] = [];
  const tabs: SdsTabTrace[] = [];
  for (const div of file.divisions) {
    const key = { kind: 'sds-bracket-sheet', division: div.id } as const;
    const base = {
      id: 'cifsds-sheet' as const,
      kind: 'sds-bracket-sheet' as const,
      scope: { section: 'sds' as const },
      label: label(div.id),
      url: resourceUrl(key),
      fetchedAt: ctx.fetchedAt,
    };
    const carry = () => {
      tabs.push({ division: div.id, read: 'carried', results: [], fixtures: [] });
      const kept = previous.filter((r) => r.division === div.id);
      results.push(...kept);
      fixtures.push(...previousFixtures.filter((f) => f.division === div.id));
      if (kept.length > 0) {
        carried.push(`${div.label} (${kept.length})`);
        ctx.sources.markStale(
          (r) => r.id === 'cifsds-sheet' && r.label === base.label,
          `${kept.length} ${kept.length === 1 ? 'result' : 'results'} carried forward from the previous snapshot`,
          carriedFromOf(ctx.previous, (r) => r.id === 'cifsds-sheet' && r.label === base.label),
        );
      }
    };
    if (gate) {
      ctx.source({ ...base, status: 'skipped', error: gate });
      carry();
      continue;
    }
    try {
      const res = await ctx.transport.get(key);
      const parsed = parseSdsBracketTab(res.body, { id: div.id, label: div.label, teams: sdsDivisionTeams(div) });
      const read = parsed.recognised ? staleTab(parsed, window.first) : parsed;
      if (!read.recognised) {
        ctx.warn(`sds bracket sheet ${div.id}: tab not recognised (${read.reason})`);
        ctx.source({ ...base, status: 'error', httpStatus: res.httpStatus, error: `tab not recognised: ${read.reason}` });
        carry();
        continue;
      }
      for (const w of read.warnings) ctx.warn(`sds bracket sheet: ${w}`);
      tabs.push({ division: div.id, read: read.warnings.length > 0 ? 'read-with-warnings' : 'read', results: read.results, fixtures: read.fixtures });
      results.push(...read.results);
      fixtures.push(...read.fixtures);
      ctx.source({ ...base, status: 'ok', httpStatus: res.httpStatus, rowCount: read.results.length });
      // Part of the tab could not be read (a warning): the games it held keep the previous run's results and
      // times, and only the pairs read this run replace theirs.
      if (read.warnings.length > 0) {
        const fresh = [...read.results, ...read.fixtures];
        const kept = keepUnread(previous.filter((r) => r.division === div.id), fresh);
        results.push(...kept);
        fixtures.push(...keepUnread(previousFixtures.filter((f) => f.division === div.id), fresh));
        if (kept.length > 0) carried.push(`${div.label} (${kept.length}, part of the tab not read)`);
      }
    } catch (err) {
      const failed = classifyFetchError(err);
      if (failed.status === 'error') ctx.warn(`sds bracket sheet ${div.id} failed: ${failed.error}`);
      ctx.source({ ...base, ...failed });
      carry();
    }
  }

  // MATCH: every decision against this run's games (rules 1-5), then each applied to its game.
  const decided = decideSdsSheet({
    games,
    results,
    fixtures,
    today: ctx.today,
    file,
    windowFirst: window.first,
    sheetUrl: SDS_BRACKET_SHEET_URL,
    fetchedAt: ctx.fetchedAt,
  });
  const out = games
    .filter((g) => !isCifsdsContest(g.contestId))
    .map((g) => {
      const decision = decided.decisions.get(g.contestId);
      return decision ? applySdsSheetDecision(g, decision) : g;
    });
  // The games only the sheet has, each on a fixture created from its row's claim, then the sheet's order.
  createSheetFixtures(ctx.claims, [...decided.added, ...decided.listed], [...results, ...fixtures], ctx.fetchedAt);
  out.push(...decided.added, ...decided.listed);
  out.sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.contestId.localeCompare(b.contestId));
  const filled = decided.steps.filter((s) => s.decision.kind === 'score').length;
  const timed = decided.steps.length - filled;

  for (const d of decided.disagreements) ctx.warn(`sds bracket sheet: ${d}`);
  ctx.log(
    `  sds bracket sheet: ${results.length} ${results.length === 1 ? 'result' : 'results'}` +
      `${gate ? ` (${gate})` : ''}${carried.length ? ` · carried ${carried.join(', ')}` : ''}` +
      ` · added ${decided.added.length} · scores filled ${filled} · MaxPreps agrees ${decided.agreed}` +
      `${decided.disagreements.length ? ` · MaxPreps differs ${decided.disagreements.length}` : ''}` +
      ` · ${fixtures.length} to play: listed ${decided.listed.length} · times filled ${timed}`,
  );
  ctx.trace?.push({ stage: 'sdsSheet', input: { tabs }, results, fixtures, games: [...out] });
  return { games: out, decisions: decided.decisions, created: [...decided.added, ...decided.listed], ran: true };
}
