/**
 * Step 09, third part (after VNN and CCS): the San Diego Section's bracket sheet, the results of the Section's
 * playoff games MaxPreps lacks (lib/sources/sds-bracket-sheet.ts reads a tab, lib/postseason/sds-sheet-results.ts
 * applies the results; MaxPreps stays primary).
 *
 * One request per division tab (three), from the playoffs' first day (the config's window, Nov 2), while a San
 * Diego league is in the run and data/sds-brackets-2026.json has its brackets. PER TAB carry-forward: a tab not
 * read this run (the gate, `--leagues` without a San Diego league, not in the corpus, a failed request, a tab
 * whose title is not its division's) keeps the results the previous snapshot took from it, read back from its
 * games, so a failed read never takes a result off the site; a tab read with a warning (a column the parser could
 * not place) keeps the previous results for the pairs it did not read. The sheet's games with no score yet give
 * the times MaxPreps lacks and list the games it has not posted (lib/postseason/sds-sheet-results.ts rules 4-5). Every tab is a source row ('ok' with its result
 * count, else 'skipped' / 'error' / 'stale').
 *
 * Runs before step 10, so the games it adds are classified as every other game is (lib/classify.ts tags a game
 * between two San Diego teams from Nov 2 'section-playoffs').
 */

import { SDS_BRACKET_SHEET_URL } from '../../league-config/sections';
import { LEAGUES } from '../../leagues';
import { SDS_BRACKETS_FILE, sdsDivisionTeams } from '../../postseason/sds-brackets-file';
import { sdsPlayoffWindow } from '../../postseason/sds-brackets-schema';
import { applySdsSheetResults, sheetFixturesFromGames, sheetResultsFromGames } from '../../postseason/sds-sheet-results';
import { parseSdsBracketTab, type SdsSheetFixture, type SdsSheetResult } from '../../sources/sds-bracket-sheet';
import type { Game } from '../../types';
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

function label(division: string): string {
  return `sds bracket sheet ${division}`;
}

export async function stepSdsSheet(ctx: PipelineContext, games: readonly Game[]): Promise<Game[]> {
  const file = SDS_BRACKETS_FILE;
  if (file.divisions.length === 0) return [...games];
  const window = sdsPlayoffWindow();
  const sdsLeagues = LEAGUES.filter((l) => l.postseason.kind === 'section-playoffs').map((l) => l.id);
  const inRun = ctx.leaguesInRun().some((id) => sdsLeagues.includes(id));
  const gate = !inRun
    ? 'no San Diego league in this run'
    : ctx.today < window.first
      ? `season gate: the playoffs start ${window.first} (today ${ctx.today})`
      : null;

  const previous = ctx.previous ? sheetResultsFromGames(ctx.previous.games, file) : [];
  const previousFixtures = ctx.previous ? sheetFixturesFromGames(ctx.previous.games, file) : [];
  const results: SdsSheetResult[] = [];
  const fixtures: SdsSheetFixture[] = [];
  const carried: string[] = [];
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
      const read = parseSdsBracketTab(res.body, { id: div.id, label: div.label, teams: sdsDivisionTeams(div) });
      if (!read.recognised) {
        ctx.warn(`sds bracket sheet ${div.id}: tab not recognised (${read.reason})`);
        ctx.source({ ...base, status: 'error', httpStatus: res.httpStatus, error: `tab not recognised: ${read.reason}` });
        carry();
        continue;
      }
      for (const w of read.warnings) ctx.warn(`sds bracket sheet: ${w}`);
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

  const applied = applySdsSheetResults({
    games,
    results,
    fixtures,
    today: ctx.today,
    file,
    windowFirst: window.first,
    sheetUrl: SDS_BRACKET_SHEET_URL,
    fetchedAt: ctx.fetchedAt,
  });
  for (const d of applied.disagreements) ctx.warn(`sds bracket sheet: ${d}`);
  ctx.log(
    `  sds bracket sheet: ${results.length} ${results.length === 1 ? 'result' : 'results'}` +
      `${gate ? ` (${gate})` : ''}${carried.length ? ` · carried ${carried.join(', ')}` : ''}` +
      ` · added ${applied.added.length} · scores filled ${applied.filled.length} · MaxPreps agrees ${applied.agreed}` +
      `${applied.disagreements.length ? ` · MaxPreps differs ${applied.disagreements.length}` : ''}` +
      ` · ${fixtures.length} to play: listed ${applied.listed.length} · times filled ${applied.timed.length}`,
  );
  return applied.games;
}
