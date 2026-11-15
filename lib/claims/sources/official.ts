/**
 * League schedules (§7.2, stage `official`): one claim per official row, on the fixture of the game it stamped
 * (with `lastMatch`, the contest and the stamp the last publication showed) or, for a row no game matched, on an
 * official-only fixture of its own. The claims are rewritten from the published games and official fixtures at the
 * end of every run, so they always hold the last publication; a row read this run keeps the row as read, and one
 * not read keeps the row it had.
 *
 * A division the run does not read (a grid that failed or parsed empty, `--no-official`, a bundled file that failed
 * validation) is carried from these claims: each of its games with no stamp of its own gets the stamp its contest
 * last showed, and its unmatched rows come back, exactly as lib/sources/scval-pdf.ts carryOfficialForward carried
 * them from the previous snapshot.
 *
 * The stage's decisions (a stamp and its notes, or the classification note) are the official step's: the real step
 * records them as it takes them; an injected step (a test's stand-in) has them read off the games it returns, which
 * may differ from its input only in what a decision writes. A stamp on an si.com rule-2 game is not stored: that
 * stage keeps no claims yet, and the game never reaches the official stage of a later run.
 */

import { isDeepStrictEqual } from 'node:util';

import { applyOfficialDecision, type OfficialDecision } from '../../official/match';
import { carryOfficialForward, type CarryOfficialResult } from '../../sources/scval-pdf';
import { stableStringify } from '../../stable-json';
import type { ContestId, DivisionId, Game, OfficialFixture, OfficialStamp, Snapshot } from '../../types';
import { baseFixtureId, fixtureSideKey } from '../identity';
import { publishedFixture } from '../published';
import type { ClaimStore } from '../store';
import type { FixtureId, OfficialClaim } from '../types';

/** Each contest's official decisions, in the order the step took them (a classification note, then a carried stamp, at most). */
export type OfficialDecisionMap = ReadonlyMap<ContestId, readonly OfficialDecision[]>;

/** `game` with its decisions applied in order (lib/official/match.ts applyOfficialDecision). */
export function applyOfficialDecisions(game: Game, decisions: readonly OfficialDecision[] | undefined): Game {
  return (decisions ?? []).reduce((g, d) => applyOfficialDecision(g, d), game);
}

/** The game list through the official stage: the stage's input, each game with its contest's decisions. */
export function resolveOfficialStage(games: readonly Game[], decisions: OfficialDecisionMap): Game[] {
  return games.map((g) => applyOfficialDecisions(g, decisions.get(g.contestId)));
}

/** One decision into `map`, after the contest's earlier ones. */
export function recordOfficialDecision(map: Map<ContestId, OfficialDecision[]>, contestId: ContestId, decision: OfficialDecision): void {
  const list = map.get(contestId);
  if (list) list.push(decision);
  else map.set(contestId, [decision]);
}

/**
 * The decisions an injected official step took, read off what it returned (§7.2): game by game against its input,
 * the classification note it wrote and the stamp with the league-flag and host notes that came with it. A step that
 * returned other games, or changed a game beyond what a decision writes, broke the step contract: that throws.
 */
export function decisionsFromOfficialStep(before: readonly Game[], after: readonly Game[]): Map<ContestId, OfficialDecision[]> {
  if (after.length !== before.length) throw new Error(`the official step returned ${after.length} games for ${before.length}`);
  const out = new Map<ContestId, OfficialDecision[]>();
  before.forEach((was, i) => {
    const now = after[i];
    if (now === was) return;
    if (now.contestId !== was.contestId) throw new Error(`the official step returned ${now.contestId} where ${was.contestId} was`);
    const list: OfficialDecision[] = [];
    const note = now.provenance.classificationNote;
    if (note !== undefined && note !== was.provenance.classificationNote) list.push({ classificationNote: note });
    if (now.official !== undefined && !isDeepStrictEqual(now.official, was.official)) {
      const flag = now.provenance.leagueFlagConflict;
      const host = now.provenance.hostConflict;
      list.push({
        stamp: now.official,
        ...(flag !== undefined && flag !== was.provenance.leagueFlagConflict ? { leagueFlagNote: flag } : {}),
        ...(host !== undefined && host !== was.provenance.hostConflict ? { hostNote: host } : {}),
      });
    }
    if (!isDeepStrictEqual(applyOfficialDecisions(was, list), now)) {
      throw new Error(`the official step changed ${was.contestId} beyond its official stamp and notes`);
    }
    if (list.length === 0) return;
    const earlier = out.get(was.contestId);
    if (earlier && !isDeepStrictEqual(earlier, list)) throw new Error(`the official step decided ${was.contestId} twice, differently`);
    out.set(was.contestId, list);
  });
  return out;
}

/** What the last publication showed of the league schedules: each contest's stamp, and the rows no game matched. */
export interface StoredOfficial {
  stamps: ReadonlyMap<ContestId, OfficialStamp>;
  unmatched: readonly OfficialFixture[];
}

/** The snapshot's own order of official fixtures (lib/pipeline/steps/assemble.ts): date, then id. */
const byDateThenFixtureId = (a: OfficialFixture, b: OfficialFixture): number =>
  a.dateKey === b.dateKey ? a.id.localeCompare(b.id) : a.dateKey.localeCompare(b.dateKey);

/** The stored official claims as the carry reads them: the stamps their `lastMatch` records, the unmatched rows in the snapshot's order. */
export function storedOfficialOf(store: ClaimStore): StoredOfficial {
  const stamps = new Map<ContestId, OfficialStamp>();
  const unmatched: OfficialFixture[] = [];
  for (const { claim } of store.claimsOf('official')) {
    if (claim.lastMatch) stamps.set(claim.lastMatch.contestId, claim.lastMatch.stamp);
    else if (claim.fixture) unmatched.push(claim.fixture);
  }
  return { stamps, unmatched: unmatched.sort(byDateThenFixtureId) };
}

/**
 * What a previous snapshot shows of the league schedules, for an official step run in a context that has no claim
 * store (a test's hand-built context): the same stamps and rows the claims seeded from that snapshot hold.
 */
export function storedOfficialFromSnapshot(previous: Pick<Snapshot, 'games' | 'officialFixtures'> | null): StoredOfficial {
  const stamps = new Map<ContestId, OfficialStamp>();
  for (const g of previous?.games ?? []) if (g.official && !g.contestId.startsWith('sblive:')) stamps.set(g.contestId, g.official);
  return { stamps, unmatched: [...(previous?.officialFixtures ?? [])].sort(byDateThenFixtureId) };
}

/**
 * The divisions `missing` carried from the stored claims onto `games` (carryOfficialForward's rule: a game of the
 * division with no stamp of its own gets its contest's stored stamp, no notes; the division's unmatched rows come
 * back), and the contests that got a stamp.
 */
export function carryOfficialFromClaims(
  missing: readonly DivisionId[],
  stored: StoredOfficial,
  games: readonly Game[],
): CarryOfficialResult & { stamped: ContestId[] } {
  const previous = { officialFixtures: stored.unmatched, games: [...stored.stamps].map(([contestId, official]) => ({ contestId, official })) };
  const restored = carryOfficialForward(missing, previous, games);
  const stamped = restored.games.filter((g, i) => g !== games[i]).map((g) => g.contestId);
  return { ...restored, stamped };
}

const sameClaim = (a: OfficialClaim, b: OfficialClaim): boolean => stableStringify({ ...a, seenAt: '' }) === stableStringify({ ...b, seenAt: '' });

/**
 * The official claims rewritten from what the run published: one claim per stamp a published game shows (on that
 * game's fixture, `lastMatch` recording the contest and stamp) and one per official fixture no game matched (on an
 * official-only fixture). `read` holds the rows read this run and their divisions: a claim keeps the row read, else
 * the row it held; it is stamped `fetchedAt` unless its division was not read and it holds the same as before. Also
 * how claims are seeded from a snapshot (lib/claims/from-snapshot.ts).
 */
export function writeBackOfficialClaims(
  store: ClaimStore,
  published: readonly Game[],
  unmatched: readonly OfficialFixture[],
  read: { rows: readonly OfficialFixture[]; divisions: ReadonlySet<DivisionId> },
  fetchedAt: string,
): void {
  const stored = new Map(store.claimsOf('official').map(({ id, claim }) => [claim.ref, { id, claim }]));
  for (const ref of stored.keys()) store.detach('official', ref);
  const rows = new Map(read.rows.map((f) => [f.id, f]));
  // One claim per row and game: a row both stamped and listed (or stamped twice) keeps each under a suffixed ref.
  const taken = new Set<string>();
  const refOf = (id: string): string => {
    let ref = id;
    for (let n = 2; taken.has(ref); n += 1) ref = `${id}#${n}`;
    taken.add(ref);
    return ref;
  };
  const kept = (fresh: OfficialClaim, division: DivisionId): OfficialClaim => {
    const was = stored.get(fresh.ref)?.claim;
    return was && !read.divisions.has(division) && sameClaim(was, fresh) ? { ...fresh, seenAt: was.seenAt } : fresh;
  };

  for (const game of published) {
    const stamp = game.official;
    if (!stamp) continue;
    const ref = refOf(stamp.fixtureId);
    const row = rows.get(stamp.fixtureId) ?? stored.get(ref)?.claim.fixture;
    const claim: OfficialClaim = { ref, seenAt: fetchedAt, ...(row ? { fixture: row } : { stamp }), lastMatch: { contestId: game.contestId, stamp } };
    const id = publishedFixture(store, game, stored.get(ref)?.id);
    if (id !== undefined) store.attach(id, 'official', kept(claim, stamp.division));
  }
  for (const fixture of unmatched) {
    const ref = refOf(fixture.id);
    const holder = stored.get(ref)?.id;
    const id: FixtureId =
      holder !== undefined && store.get(holder) !== undefined && store.get(holder)?.claims.maxpreps === undefined
        ? holder
        : store.create(
            baseFixtureId(fixture.dateKey, fixtureSideKey({ slug: fixture.awaySlug, name: fixture.awayName }), fixtureSideKey({ slug: fixture.homeSlug, name: fixture.homeName })),
          );
    store.attach(id, 'official', kept({ ref, seenAt: fetchedAt, fixture }, fixture.division));
  }
}
