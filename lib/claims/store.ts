/**
 * The claim store (§6): every fixture and its claims, indexed by fixture id and by each claim's (source, ref), so
 * the same source row always lands on the same fixture (identity by stored ref). A run starts from the claims file
 * written beside the previous snapshot (or the claims seeded from that snapshot), replaces what each source read
 * this run with the fresh rows (`mergeRead`), and ends with `toFile`.
 *
 * The editor's claims (lib/fixtures) are rebuilt from the ledger every run, so `fromFile` discards the ones a file
 * holds. Fixture ids are minted by `create` and never change (lib/claims/identity.ts). Pure apart from mutating
 * itself: no I/O.
 */

import type { SportId } from '../sports/current';
import { mintFixtureId } from './identity';
import {
  CLAIMS_SCHEMA_VERSION,
  MULTI_CLAIM_SOURCES,
  type ClaimBase,
  type ClaimOf,
  type ClaimSource,
  type ClaimsFile,
  type Fixture,
  type FixtureClaims,
  type FixtureId,
} from './types';

const SOURCE_KEYS: readonly ClaimSource[] = ['maxpreps', 'editor', 'official', 'sblive', 'cifss', 'sdsSheet', 'vnn', 'box'];

const indexKey = (source: ClaimSource, ref: string): string => `${source}\u0000${ref}`;

/** Code-unit order, never locale order: the file's order must not depend on the machine that wrote it. */
const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The claims of one source a fixture holds, as a list (empty, one, or the sorted list of a multi-claim source). */
function claimsIn(claims: FixtureClaims, source: ClaimSource): ClaimBase[] {
  const v = claims[source] as ClaimBase | ClaimBase[] | undefined;
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

function hasClaims(f: Fixture): boolean {
  return SOURCE_KEYS.some((s) => claimsIn(f.claims, s).length > 0);
}

export class ClaimStore {
  private readonly fixtures = new Map<FixtureId, Fixture>();
  private readonly index = new Map<string, FixtureId>();
  /** Every fixture id and alias ever held, so a merged fixture's id is never minted again. */
  private readonly taken = new Set<FixtureId>();

  /** A store holding `file`'s fixtures (deep copies), without its editor claims. An empty store for null. */
  static fromFile(file: ClaimsFile | null): ClaimStore {
    const store = new ClaimStore();
    for (const f of file?.fixtures ?? []) {
      const copy: Fixture = structuredClone(f);
      delete copy.claims.editor;
      store.fixtures.set(copy.id, copy);
      for (const source of SOURCE_KEYS) {
        for (const c of claimsIn(copy.claims, source)) store.index.set(indexKey(source, c.ref), copy.id);
      }
    }
    // A fixture that held only the editor's claim is rebuilt by this run under the same id, so it is not taken; one
    // that holds the contest ids its game was published under keeps them for the editor's claim to join.
    for (const [id, f] of store.fixtures) if (!hasClaims(f) && !(f.published && f.published.length > 0)) store.fixtures.delete(id);
    for (const f of store.fixtures.values()) {
      store.taken.add(f.id);
      for (const alias of f.aliases ?? []) store.taken.add(alias);
    }
    return store;
  }

  /** Fixture holding `ref` for `source`, if any (identity by stored ref). */
  fixtureOf(source: ClaimSource, ref: string): FixtureId | undefined {
    return this.index.get(indexKey(source, ref));
  }

  get(id: FixtureId): Fixture | undefined {
    return this.fixtures.get(id);
  }

  /** Every fixture id, in code-unit order. */
  ids(): FixtureId[] {
    return [...this.fixtures.keys()].sort(byCodeUnit);
  }

  /** Every claim of `source`, with the fixture holding it, by fixture id then ref. */
  claimsOf<S extends ClaimSource>(source: S): Array<{ id: FixtureId; claim: ClaimOf<S> }> {
    const out: Array<{ id: FixtureId; claim: ClaimOf<S> }> = [];
    for (const id of this.ids()) {
      const f = this.fixtures.get(id) as Fixture;
      for (const c of claimsIn(f.claims, source)) out.push({ id, claim: c as ClaimOf<S> });
    }
    return out;
  }

  /**
   * A source's read this run. A stored claim whose ref `fresh` lacks is detached when `readScopes` says its scope
   * was read (the source no longer lists the row), and kept with its older seenAt otherwise. Every fresh claim
   * replaces the stored claim of the same ref on that claim's fixture; a fresh claim no fixture holds goes to the
   * fixture `placeNew` names (called in `fresh` order, so the caller decides the order ids are minted in). Returns
   * the refs that vanished, sorted.
   */
  mergeRead<S extends ClaimSource>(
    source: S,
    readScopes: (claim: ClaimOf<S>) => boolean,
    fresh: readonly ClaimOf<S>[],
    placeNew?: (claim: ClaimOf<S>) => FixtureId,
  ): string[] {
    const freshRefs = new Set(fresh.map((c) => c.ref));
    const vanished: string[] = [];
    for (const { claim } of this.claimsOf(source)) {
      if (freshRefs.has(claim.ref) || !readScopes(claim)) continue;
      this.detach(source, claim.ref);
      vanished.push(claim.ref);
    }
    for (const c of fresh) {
      const id = this.fixtureOf(source, c.ref) ?? placeNew?.(c);
      if (id === undefined) throw new Error(`lib/claims/store.ts: no fixture for the new ${source} claim ${c.ref}`);
      this.attach(id, source, c);
    }
    return vanished.sort(byCodeUnit);
  }

  /** `claim` onto fixture `id`, replacing the claim of the same ref wherever it was and, for a one-claim source, the fixture's other claim. */
  attach<S extends ClaimSource>(id: FixtureId, source: S, claim: ClaimOf<S>): void {
    const f = this.fixtures.get(id);
    if (!f) throw new Error(`lib/claims/store.ts: no fixture ${id}`);
    const holder = this.fixtureOf(source, claim.ref);
    if (holder !== undefined && holder !== id) this.detach(source, claim.ref);
    const slot = f.claims as Record<ClaimSource, ClaimBase | ClaimBase[] | undefined>;
    if (MULTI_CLAIM_SOURCES.has(source)) {
      const list = claimsIn(f.claims, source).filter((c) => c.ref !== claim.ref);
      slot[source] = [...list, claim].sort((a, b) => byCodeUnit(a.ref, b.ref));
    } else {
      const prior = slot[source] as ClaimBase | undefined;
      if (prior && prior.ref !== claim.ref) this.index.delete(indexKey(source, prior.ref));
      slot[source] = claim;
    }
    this.index.set(indexKey(source, claim.ref), id);
  }

  /** The claim `ref` of `source` off its fixture; nothing when no fixture holds it. The fixture stays until `gc`. */
  detach(source: ClaimSource, ref: string): void {
    const id = this.fixtureOf(source, ref);
    if (id === undefined) return;
    this.index.delete(indexKey(source, ref));
    const f = this.fixtures.get(id) as Fixture;
    const slot = f.claims as Record<ClaimSource, ClaimBase | ClaimBase[] | undefined>;
    if (MULTI_CLAIM_SOURCES.has(source)) {
      const list = claimsIn(f.claims, source).filter((c) => c.ref !== ref);
      if (list.length > 0) slot[source] = list;
      else delete slot[source];
    } else {
      delete slot[source];
    }
  }

  /** A new fixture with no claims, its id minted from `base` (lib/claims/identity.ts mintFixtureId). */
  create(base: FixtureId): FixtureId {
    const id = mintFixtureId(base, this.taken);
    this.taken.add(id);
    this.fixtures.set(id, { id, claims: {} });
    return id;
  }

  /** Merge `from` into `into` (aliases += from.id, from's aliases); `from` is deleted. A one-claim source both hold is a conflict. */
  merge(from: FixtureId, into: FixtureId): void {
    if (from === into) return;
    const a = this.fixtures.get(from);
    const b = this.fixtures.get(into);
    if (!a || !b) throw new Error(`lib/claims/store.ts: cannot merge ${from} into ${into}: no such fixture`);
    for (const source of SOURCE_KEYS) {
      for (const c of claimsIn(a.claims, source)) {
        if (!MULTI_CLAIM_SOURCES.has(source) && claimsIn(b.claims, source).length > 0) {
          throw new Error(`lib/claims/store.ts: cannot merge ${from} into ${into}: both hold a ${source} claim`);
        }
        this.attach(into, source, c as ClaimOf<typeof source>);
      }
    }
    b.aliases = [...new Set([...(b.aliases ?? []), from, ...(a.aliases ?? [])])].sort(byCodeUnit);
    for (const p of a.published ?? []) this.markPublished(into, p.contestId, p.seenAt);
    this.fixtures.delete(from);
  }

  /** Fixture `id`'s game was published under `contestId` by the run stamped `at`: appended, or its stamp moved on. */
  markPublished(id: FixtureId, contestId: string, at: string): void {
    const f = this.fixtures.get(id);
    if (!f) throw new Error(`lib/claims/store.ts: no fixture ${id}`);
    const list = f.published ?? [];
    const held = list.find((p) => p.contestId === contestId);
    if (held) {
      if (held.seenAt < at) held.seenAt = at;
    } else {
      f.published = [...list, { contestId, seenAt: at }];
    }
  }

  /** Drop fixtures with no claims. */
  gc(): void {
    for (const [id, f] of this.fixtures) if (!hasClaims(f)) this.fixtures.delete(id);
  }

  /**
   * The file of this store as the run stamped `fetchedAt` writes it: fixtures with claims only, sorted by id, each
   * claim list by ref. seenAt and a MaxPreps game's `provenance.fetchedAt` stay in this in-memory form; the writer
   * leaves out what equals the file's stamp (lib/claims/file.ts).
   */
  toFile(fetchedAt: string, sport: SportId): ClaimsFile {
    const fixtures: Fixture[] = [];
    for (const id of this.ids()) {
      const f = this.fixtures.get(id) as Fixture;
      if (!hasClaims(f)) continue;
      const claims: FixtureClaims = {};
      const slot = claims as Record<ClaimSource, unknown>;
      for (const source of SOURCE_KEYS) {
        const list = claimsIn(f.claims, source);
        if (list.length === 0) continue;
        slot[source] = MULTI_CLAIM_SOURCES.has(source)
          ? structuredClone([...list].sort((x, y) => byCodeUnit(x.ref, y.ref)))
          : structuredClone(list[0]);
      }
      fixtures.push({
        id,
        ...(f.aliases && f.aliases.length > 0 ? { aliases: [...f.aliases] } : {}),
        claims,
        ...(f.published && f.published.length > 0 ? { published: structuredClone(f.published) } : {}),
      });
    }
    return { schemaVersion: CLAIMS_SCHEMA_VERSION, sport, fetchedAt, fixtures };
  }
}
