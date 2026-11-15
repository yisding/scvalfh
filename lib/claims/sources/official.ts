/**
 * League schedules (stage `official`): one claim per official row, on the fixture of the game it stamped
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
 * may differ from its input only in what a decision writes. The run hands them, by contest, to the view's fixtures
 * (lib/claims/view.ts). A stamp on an si.com rule-2 game is kept on that game's
 * fixture like any other (the row the game consumed stays in the claims); no carry stamps it, since the game is
 * appended after the official stage.
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

/** `game` with its decisions applied in order (lib/official/match.ts applyOfficialDecision). */
function applyOfficialDecisions(game: Game, decisions: readonly OfficialDecision[] | undefined): Game {
  return (decisions ?? []).reduce((g, d) => applyOfficialDecision(g, d), game);
}

/** One decision into `map`, after the contest's earlier ones. */
export function recordOfficialDecision(map: Map<ContestId, OfficialDecision[]>, contestId: ContestId, decision: OfficialDecision): void {
  const list = map.get(contestId);
  if (list) list.push(decision);
  else map.set(contestId, [decision]);
}

/**
 * The decisions an injected official step took, read off what it returned: game by game against its input,
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
  /** The league-flag and host notes each stamped contest showed with its stamp (a contest with none has no entry). */
  notes: ReadonlyMap<ContestId, { leagueFlagNote?: string; hostNote?: string }>;
}

/** The league-flag and host notes a stamp came with, or null when it came with none. */
function notesOf(leagueFlagNote: string | undefined, hostNote: string | undefined): { leagueFlagNote?: string; hostNote?: string } | null {
  if (leagueFlagNote === undefined && hostNote === undefined) return null;
  return { ...(leagueFlagNote !== undefined ? { leagueFlagNote } : {}), ...(hostNote !== undefined ? { hostNote } : {}) };
}

/** The snapshot's own order of official fixtures (lib/pipeline/steps/assemble.ts): date, then id. */
const byDateThenFixtureId = (a: OfficialFixture, b: OfficialFixture): number =>
  a.dateKey === b.dateKey ? a.id.localeCompare(b.id) : a.dateKey.localeCompare(b.dateKey);

/** The stored official claims as the carry reads them: the stamps their `lastMatch` records, the unmatched rows in the snapshot's order. */
export function storedOfficialOf(store: ClaimStore): StoredOfficial {
  const stamps = new Map<ContestId, OfficialStamp>();
  const notes = new Map<ContestId, { leagueFlagNote?: string; hostNote?: string }>();
  const unmatched: OfficialFixture[] = [];
  for (const { claim } of store.claimsOf('official')) {
    if (claim.lastMatch) {
      stamps.set(claim.lastMatch.contestId, claim.lastMatch.stamp);
      const shown = notesOf(claim.leagueFlagNote, claim.hostNote);
      if (shown) notes.set(claim.lastMatch.contestId, shown);
    } else if (claim.fixture) unmatched.push(claim.fixture);
  }
  return { stamps, unmatched: unmatched.sort(byDateThenFixtureId), notes };
}

/**
 * What a previous snapshot shows of the league schedules, for an official step run in a context that has no claim
 * store (a test's hand-built context): the same stamps and rows the claims seeded from that snapshot hold.
 */
export function storedOfficialFromSnapshot(previous: Pick<Snapshot, 'games' | 'officialFixtures'> | null): StoredOfficial {
  const stamps = new Map<ContestId, OfficialStamp>();
  const notes = new Map<ContestId, { leagueFlagNote?: string; hostNote?: string }>();
  for (const g of previous?.games ?? []) {
    if (!g.official) continue;
    stamps.set(g.contestId, g.official);
    const shown = notesOf(officialFlagNoteOf(g), g.provenance.hostConflict);
    if (shown) notes.set(g.contestId, shown);
  }
  return { stamps, unmatched: [...(previous?.officialFixtures ?? [])].sort(byDateThenFixtureId), notes };
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

/**
 * The official step's league-flag note a game shows, if any: its `provenance.leagueFlagConflict` unless that is
 * normalize's own sentence about the contest's two team rows, which the MaxPreps claim holds.
 */
export function officialFlagNoteOf(g: Pick<Game, 'provenance'>): string | undefined {
  const note = g.provenance.leagueFlagConflict;
  return note !== undefined && !note.startsWith('contestType disagrees') ? note : undefined;
}

const sameClaim = (a: OfficialClaim, b: OfficialClaim): boolean => stableStringify({ ...a, seenAt: '' }) === stableStringify({ ...b, seenAt: '' });

/**
 * The official claims rewritten from what the run published: one claim per stamp a published game shows (on that game's
 * fixture, `lastMatch` recording the contest and stamp, with the step's league-flag and host notes) and one per
 * official fixture no game matched (on an official-only fixture). `read` holds the rows read this run and their
 * divisions: a claim keeps the row read, else the row it held; it is stamped `fetchedAt` unless its division was not
 * read and it holds the same as before. Also how claims are seeded from a snapshot (lib/claims/from-snapshot.ts).
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
    const note = officialFlagNoteOf(game);
    const claim: OfficialClaim = {
      ref,
      seenAt: fetchedAt,
      ...(row ? { fixture: row } : { stamp }),
      lastMatch: { contestId: game.contestId, stamp },
      ...(note !== undefined ? { leagueFlagNote: note } : {}),
      ...(game.provenance.hostConflict !== undefined ? { hostNote: game.provenance.hostConflict } : {}),
    };
    store.attach(publishedFixture(store, game, stored.get(ref)?.id), 'official', kept(claim, stamp.division));
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
