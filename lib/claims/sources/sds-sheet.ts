/**
 * The San Diego Section's bracket sheet (§7.6, stage `sdsSheet`): one claim per sheet row and game, keyed by the
 * division and the pair (two teams meet once in the Section's playoffs), holding the row as the game last
 * published it, the host it published, and the game it was published on.
 *
 * A tab the run does not read is carried from these claims: its rows are the ones the previous publication showed,
 * read back from its games (lib/postseason/sds-sheet-results.ts sheetResultsFromGames, sheetFixturesFromGames) and
 * listed in that publication's order, so a carried tab decides exactly as one carried from the previous snapshot.
 * A game only the sheet has (`cifsds:`, rules 3 and 5) is a fixture the stage creates from the row's claim; the
 * same row lands on the same fixture run after run. The claims are rewritten from the published games at the end
 * of every run, so they always hold the last publication.
 */

import { byDateThenId } from '../../format';
import { isCifsdsContestId } from '../../game-id';
import type { SdsBracketsFile } from '../../postseason/sds-brackets-schema';
import { sheetFixturesFromGames, sheetResultsFromGames } from '../../postseason/sds-sheet-results';
import type { SdsSheetFixture, SdsSheetResult } from '../../sources/sds-bracket-sheet';
import { stableStringify } from '../../stable-json';
import type { Game } from '../../types';
import { gameBaseId, publishedFixture } from '../published';
import type { ClaimStore } from '../store';
import type { SdsSheetClaim } from '../types';

type SheetRow = SdsSheetResult | SdsSheetFixture;

const pairOf = (row: SheetRow): string => ('teams' in row ? [...row.teams] : [row.winner, row.loser]).sort().join('~');

/** A row's claim ref: its division and its pair, sorted. */
export const sheetClaimRef = (row: SheetRow): string => `${row.division}:${pairOf(row)}`;

/** The claim `row` gives as published on `game`, stamped `seenAt`: the row without its host, and the host apart. */
export function sheetClaimOf(row: SheetRow, game: Game, seenAt: string, ref: string = sheetClaimRef(row)): SdsSheetClaim {
  const { host: _host, ...rest } = row;
  void _host;
  return {
    ref,
    seenAt,
    ...('teams' in rest ? { fixture: rest } : { result: rest }),
    ...(game.home.slug ? { host: game.home.slug } : {}),
    published: { contestId: game.contestId, dateLocal: game.dateLocal },
  };
}

/**
 * The rows the last publication showed, with the host it published, in that publication's order: what a tab the
 * run does not read carries (lib/pipeline/steps/sds-sheet.ts).
 */
export function storedSheetRows(store: ClaimStore): { results: SdsSheetResult[]; fixtures: SdsSheetFixture[] } {
  const claims = store
    .claimsOf('sdsSheet')
    .map(({ claim }) => claim)
    .sort((a, b) => byDateThenId(a.published, b.published));
  const host = (c: SdsSheetClaim) => (c.host ? { host: c.host } : {});
  return {
    results: claims.flatMap((c) => (c.result ? [{ ...c.result, ...host(c) }] : [])),
    fixtures: claims.flatMap((c) => (c.fixture ? [{ ...c.fixture, ...host(c) }] : [])),
  };
}

/**
 * The `cifsds:` games the stage published this run, each on a fixture created from its row's claim (rules 3 and 5):
 * the fixture that held the row's claim before when that was a sheet game's, else a new one. `rows` are the rows the
 * stage decided over, in its order; a game's row is the first of its pair, as the stage took it.
 */
export function createSheetFixtures(store: ClaimStore, created: readonly Game[], rows: readonly SheetRow[], fetchedAt: string): void {
  for (const game of created) {
    if (!isCifsdsContestId(game.contestId)) continue;
    const pair = [game.home.slug ?? '', game.away.slug ?? ''].sort().join('~');
    const row = rows.find((r) => pairOf(r) === pair && ('teams' in r ? game.status !== 'final' : game.status === 'final'));
    if (!row) continue;
    const ref = sheetClaimRef(row);
    const holder = store.fixtureOf('sdsSheet', ref);
    const id = holder !== undefined && store.get(holder)?.claims.maxpreps === undefined ? holder : store.create(gameBaseId(game));
    store.attach(id, 'sdsSheet', sheetClaimOf(row, game, fetchedAt, ref));
  }
}

/**
 * The sheet's claims rewritten from the published games: every stored sheet claim is replaced by what a game shows
 * from the sheet. A claim keeps its stored seenAt while its tab was not read this run and it shows the same;
 * otherwise it is stamped `fetchedAt`. Also how claims are seeded from a snapshot (lib/claims/from-snapshot.ts).
 */
export function writeBackSheetClaims(
  store: ClaimStore,
  published: readonly Game[],
  file: SdsBracketsFile,
  tabRead: (division: string) => boolean,
  fetchedAt: string,
): void {
  const stored = new Map(store.claimsOf('sdsSheet').map(({ id, claim }) => [claim.ref, { id, claim }]));
  for (const ref of stored.keys()) store.detach('sdsSheet', ref);
  const taken = new Set<string>();
  for (const game of published) {
    for (const row of [...sheetResultsFromGames([game], file), ...sheetFixturesFromGames([game], file)]) {
      // Two published games of one pair (a MaxPreps contest outside the sheet's two days, beside the sheet's game) keep a claim each.
      const base = sheetClaimRef(row);
      const ref = taken.has(base) ? `${base}:${game.contestId}` : base;
      taken.add(ref);
      const was = stored.get(ref);
      const fresh = sheetClaimOf(row, game, fetchedAt, ref);
      const same = was !== undefined && stableStringify({ ...was.claim, seenAt: '' }) === stableStringify({ ...fresh, seenAt: '' });
      const claim = same && !tabRead(row.division) ? { ...fresh, seenAt: was.claim.seenAt } : fresh;
      store.attach(publishedFixture(store, game, was?.id), 'sdsSheet', claim);
    }
  }
}
