/**
 * si.com (§7.3, stage `sblive`): one claim per si.com value a game published, on the fixture of that game. A fill
 * (D2 rules 2-4, lib/crosscheck/backfill.ts) is keyed by its si.com row and holds what the game published: the value
 * written onto a MaxPreps contest (rules 3 and 4), or the whole `sblive:` game (rule 2), with the row itself when the
 * run that wrote it read it. A si.com disagreement on a game with no fill (rule 5's conflict, or the note on a game
 * MaxPreps has not scored, lib/crosscheck/crosscheck.ts) is a conflict mark keyed by the game's contest, with the
 * scores the game showed beside it.
 *
 * Rule 10 reads these claims: a fill whose item this run did not consult is carried while still eligible, and a run
 * that reads no si.com data keeps each disagreement while the game still shows the scores it was published beside,
 * exactly as the steps did with the previous snapshot's games. The claims are rewritten from the published games at
 * the end of every run, so they always hold the last publication; a rule-2 game is a fixture the stage creates from
 * its row's claim, and the same row lands on the same fixture run after run. Rows that decided nothing are not kept:
 * nothing reads them, and the statewide scoreboards list hundreds.
 *
 * The stage's decisions are the si.com step's: the real step records them as it takes them; an injected step (a
 * test's stand-in) has them read off the games it returns, which may differ from its input only in what a decision
 * writes.
 */

import { isDeepStrictEqual } from 'node:util';

import {
  applyBackfillDecision,
  backfillPublishedOf,
  isCarriableRule2Game,
  type BackfillDecision,
  type BackfillPublished,
  type EarlierFills,
} from '../../crosscheck/backfill';
import { applyReconcile, type ReconcileDecision } from '../../crosscheck/crosscheck';
import { byDateThenId } from '../../format';
import { isSbliveContestId } from '../../game-id';
import type { SbliveGame } from '../../sources/sblive';
import { stableStringify } from '../../stable-json';
import type { BackfillProvenance, ContestId, Game, Snapshot } from '../../types';
import { publishedFixture } from '../published';
import type { ClaimStore } from '../store';
import type { SbliveClaim } from '../types';

/** The stage's decisions: each existing game's fill and disagreement, by contest, and the rule-2 games appended in order. */
export interface SbliveStageDecisions {
  backfill: ReadonlyMap<ContestId, BackfillDecision>;
  reconcile: ReadonlyMap<ContestId, ReconcileDecision>;
  created: readonly Game[];
}

/** A disagreement a game published, and the scores it showed beside it. */
type StoredConflict = NonNullable<SbliveClaim['conflict']>;

/** A conflict mark's claim ref: the game's contest (the disagreement is about the game, not one si.com row). */
const sbliveConflictRef = (contestId: ContestId): string => `contest:${contestId}`;

/**
 * The game list through the si.com stage: the stage's input with each game's decisions, then the rule-2 games. The
 * run resolves the same per fixture over its view (lib/claims/resolve.ts), the rule-2 games entering it at the end;
 * this is the stage over a plain list.
 */
export function resolveSbliveStage(games: readonly Game[], d: SbliveStageDecisions): Game[] {
  const decided = (g: Game) => applyReconcile(applyBackfillDecision(g, d.backfill.get(g.contestId)), d.reconcile.get(g.contestId));
  return [...games.map(decided), ...d.created.map(decided)];
}

/**
 * The decisions an injected si.com step took, read off what it returned (§7.3): game by game against its input, a
 * changed fill as the value it now shows and a changed disagreement as the one it now carries; the games appended
 * after the input are its rule-2 games. A step that returned other games, or changed a game beyond what a decision
 * writes, broke the step contract: that throws.
 */
export function decisionsFromSbliveStep(before: readonly Game[], after: readonly Game[]): SbliveStageDecisions {
  if (after.length < before.length) throw new Error(`the si.com step returned ${after.length} games for ${before.length}`);
  const backfill = new Map<ContestId, BackfillDecision>();
  const reconcile = new Map<ContestId, ReconcileDecision>();
  before.forEach((was, i) => {
    const now = after[i];
    if (now === was) return;
    if (now.contestId !== was.contestId) throw new Error(`the si.com step returned ${now.contestId} where ${was.contestId} was`);
    const fill = now.provenance.backfill;
    const d: BackfillDecision | undefined =
      fill && !isDeepStrictEqual(fill, was.provenance.backfill)
        ? { kind: 'carried', published: backfillPublishedOf(now as Game & { provenance: { backfill: BackfillProvenance } }) }
        : undefined;
    const filled = applyBackfillDecision(was, d);
    const conflict = now.provenance.scoreConflict;
    const r = conflict && !isDeepStrictEqual(conflict, filled.provenance.scoreConflict) ? { scoreConflict: conflict } : undefined;
    if (!isDeepStrictEqual(applyReconcile(filled, r), now)) throw new Error(`the si.com step changed ${was.contestId} beyond its si.com value`);
    if (d) backfill.set(was.contestId, d);
    if (r) reconcile.set(was.contestId, r);
  });
  return { backfill, reconcile, created: after.slice(before.length) };
}

/** Every fill the claims hold, as rule 10 reads them: each contest's published value, and the rule-2 games in the publication's order. */
export function storedFillsOf(store: ClaimStore): EarlierFills {
  const contests = new Map<ContestId, BackfillPublished>();
  const games: Game[] = [];
  for (const { claim } of store.claimsOf('sblive')) {
    const fill = claim.fill;
    if (!fill) continue;
    if (fill.rule === 'absent-fixture') games.push(fill.game);
    else contests.set(fill.contestId, fill.published);
  }
  // The snapshot lists its games by date, then id (lib/pipeline/steps/assemble.ts); rule 10 appends them in that order.
  return { contests, games: games.filter(isCarriableRule2Game).sort(byDateThenId) };
}

/** Every disagreement the claims hold, by contest. */
export function storedConflictsOf(store: ClaimStore): Map<ContestId, StoredConflict> {
  const out = new Map<ContestId, StoredConflict>();
  for (const { claim } of store.claimsOf('sblive')) if (claim.conflict) out.set(claim.conflict.contestId, claim.conflict);
  return out;
}

/** What a game publishes as a disagreement mark: its si.com disagreement when it has no fill, with its scores. */
function conflictOf(g: Game): StoredConflict | null {
  const conflict = g.provenance.scoreConflict;
  if (!conflict || g.provenance.backfill) return null;
  return { contestId: g.contestId, scoreConflict: conflict, published: { home: g.home.score, away: g.away.score } };
}

/**
 * The disagreements a previous snapshot shows, for a si.com step run in a context that has no claim store (a test's
 * hand-built context): the same marks the claims seeded from that snapshot hold.
 */
export function conflictsFromSnapshot(previous: Pick<Snapshot, 'games'> | null): Map<ContestId, StoredConflict> {
  const out = new Map<ContestId, StoredConflict>();
  for (const g of previous?.games ?? []) {
    const c = conflictOf(g);
    if (c) out.set(g.contestId, c);
  }
  return out;
}

/**
 * Rule 5's disagreements carried into a run that read no si.com data: a game with no disagreement and no fill of
 * its own gets the one it published, while it still shows the scores it was published beside.
 */
export function carriedConflicts(games: readonly Game[], stored: ReadonlyMap<ContestId, StoredConflict>): Map<ContestId, ReconcileDecision> {
  const out = new Map<ContestId, ReconcileDecision>();
  for (const g of games) {
    const p = stored.get(g.contestId);
    if (!p || g.provenance.scoreConflict || g.provenance.backfill) continue;
    if (p.published.home !== g.home.score || p.published.away !== g.away.score) continue;
    out.set(g.contestId, { scoreConflict: p.scoreConflict });
  }
  return out;
}

/** The claim ref of a fill: its si.com row. */
const fillRef = (b: BackfillProvenance): string => b.sbliveGameId;

/** The claim a published game gives: its fill, or its disagreement mark; null when it shows no si.com value. */
function claimOf(g: Game, seenAt: string): Omit<SbliveClaim, 'ref'> | null {
  const b = g.provenance.backfill;
  if (b) {
    if (b.rule !== 'absent-fixture') {
      return { seenAt, fill: { rule: b.rule, contestId: g.contestId, published: backfillPublishedOf(g as Game & { provenance: { backfill: BackfillProvenance } }) } };
    }
    if (!g.official) return null;
    return { seenAt, fill: { rule: 'absent-fixture', contestId: g.contestId, officialFixtureId: g.official.fixtureId, game: g } };
  }
  const conflict = conflictOf(g);
  return conflict ? { seenAt, conflict } : null;
}

/**
 * The rule-2 games the stage published this run, each on its fixture with its fill as the stage made it, so the
 * later stages of the run find the game's fixture (lib/claims/published.ts): the fixture that held the row's claim
 * when no MaxPreps contest holds it, else a new one. `rows` are the si.com rows read; a fill whose row was not read
 * keeps the row and the seenAt it had. The fill is rewritten from the published game at the end of the run.
 */
export function createSbliveFixtures(store: ClaimStore, created: readonly Game[], rows: ReadonlyMap<string, SbliveGame>, fetchedAt: string): void {
  for (const game of created) {
    const b = game.provenance.backfill;
    if (!isSbliveContestId(game.contestId) || !b) continue;
    const ref = fillRef(b);
    const holder = store.fixtureOf('sblive', ref);
    const was = holder !== undefined ? store.get(holder)?.claims.sblive?.find((c) => c.ref === ref) : undefined;
    const fresh = rows.has(ref);
    const claim = claimOf(game, fresh || !was ? fetchedAt : was.seenAt);
    if (!claim) continue;
    const row = rows.get(ref) ?? was?.row;
    store.attach(publishedFixture(store, game, holder), 'sblive', { ref, ...claim, ...(row ? { row } : {}) });
  }
}

const sameClaim = (a: SbliveClaim, b: SbliveClaim): boolean => stableStringify({ ...a, seenAt: '' }) === stableStringify({ ...b, seenAt: '' });

/**
 * The si.com claims rewritten from what the run published: one fill per published si.com value (on the game's
 * fixture; a rule-2 game on the fixture that held its row before, else a new one) and one disagreement mark per game
 * that shows one without a fill. `read` holds the rows read this run and whether si.com was read: a fill keeps the
 * row read, else the row it held; a claim is stamped `fetchedAt` unless what decided it was not read this run and it
 * holds the same as before. Also how claims are seeded from a snapshot (lib/claims/from-snapshot.ts).
 */
export function writeBackSbliveClaims(
  store: ClaimStore,
  published: readonly Game[],
  read: { rows: ReadonlyMap<string, SbliveGame>; sblive: boolean },
  fetchedAt: string,
): void {
  const stored = new Map(store.claimsOf('sblive').map(({ id, claim }) => [claim.ref, { id, claim }]));
  for (const ref of stored.keys()) store.detach('sblive', ref);
  // One claim per row and game: a row two games show (a fill carried beside a fresh one) keeps each under a suffixed ref.
  const taken = new Set<string>();
  const refOf = (base: string): string => {
    let ref = base;
    for (let n = 2; taken.has(ref); n += 1) ref = `${base}#${n}`;
    taken.add(ref);
    return ref;
  };
  for (const game of published) {
    const claim = claimOf(game, fetchedAt);
    if (!claim) continue;
    const b = game.provenance.backfill;
    const rowId = b ? fillRef(b) : null;
    const ref = refOf(rowId ?? sbliveConflictRef(game.contestId));
    const was = stored.get(ref);
    const fresh = rowId !== null && read.rows.has(rowId);
    const row = rowId !== null ? (read.rows.get(rowId) ?? was?.claim.row) : undefined;
    const full: SbliveClaim = { ref, ...claim, ...(row ? { row } : {}) };
    const unread = rowId !== null ? !fresh : !read.sblive;
    const kept = was !== undefined && unread && sameClaim(was.claim, full) ? { ...full, seenAt: was.claim.seenAt } : full;
    store.attach(publishedFixture(store, game, was?.id), 'sblive', kept);
  }
}
