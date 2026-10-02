import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  GameSchema,
  SnapshotSchema,
  loadSnapshot,
  parseSnapshot,
  snapshotContentHash,
} from '../lib/snapshot-schema';
import type { Game, Snapshot } from '../lib/types';
import { game } from './game-builder';

const V1_PATH = path.join(import.meta.dirname, 'golden', 'snapshot-2026-10-02.v1.json');
const readV1 = (): unknown => JSON.parse(readFileSync(V1_PATH, 'utf8'));

/** The committed v1 golden, upgraded: a real, valid v2 snapshot (deep copy on every call). */
const MIGRATED = loadSnapshot(readV1());
function baseSnapshot(): Snapshot {
  const s = structuredClone(MIGRATED);
  // Present on every live in-season run, and it carries a SECOND wall-clock stamp under a name
  // of its own. It belongs in the base fixture so the content-hash tests below actually see it.
  s.sbliveCrossCheck = {
    sbliveFetchedAt: s.fetchedAt,
    compared: 1,
    agreements: 1,
    conflicts: [],
    sbliveOnlyScored: [],
    backfilled: [],
  };
  return s;
}

function issuesOf(raw: unknown): string {
  const result = SnapshotSchema.safeParse(raw);
  expect(result.success).toBe(false);
  return JSON.stringify(result.error?.issues);
}

/** A si.com-only game as D2 rule 2 publishes it. */
function sbliveGame(over: Partial<Game> = {}): Game {
  const g = game({ home: 'carmel', away: 'salinas', hs: 2, as: 1, date: '2026-09-23' });
  return {
    ...g,
    contestId: 'sblive:6541425',
    urls: { ...g.urls, maxpreps: null, sblive: 'https://www.si.com/high-school/stats/california/field-hockey/games/6541425' },
    provenance: {
      ...g.provenance,
      scores: 'sblive',
      schedule: 'sblive',
      backfill: { rule: 'absent-fixture', sbliveGameId: '6541425', maxpreps: null, note: 'MaxPreps has no contest for this official fixture.' },
    },
    ...over,
  };
}

describe('snapshot schema: accepts a real snapshot', () => {
  it('validates the migrated committed snapshot', () => {
    expect(() => parseSnapshot(baseSnapshot())).not.toThrow();
    expect(MIGRATED.teams).toHaveLength(43);
  });

  it('loadSnapshot upgrades v1 and passes v2 through', () => {
    const v2 = loadSnapshot(readV1());
    expect(v2.schemaVersion).toBe(2);
    expect(loadSnapshot(JSON.parse(JSON.stringify(v2)))).toEqual(v2);
  });

  it('parseSnapshot refuses a v1 file (only loadSnapshot migrates)', () => {
    expect(() => parseSnapshot(readV1())).toThrow(/snapshot failed validation/);
  });
});

describe('snapshot schema: game invariants (DESIGN §5.1)', () => {
  it('rejects a final game with a null score', () => {
    const g = game({ home: 'cupertino', away: 'fremont', hs: 2, as: 1 });
    const broken = { ...g, home: { ...g.home, score: null } };
    const result = GameSchema.safeParse(broken);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toMatch(/final game with a null score/);
  });

  it('rejects a non-final game carrying a score — the never-0-0 rule', () => {
    const g = game({ home: 'cupertino', away: 'fremont', status: 'scheduled' });
    const broken = {
      ...g,
      home: { ...g.home, score: 0 },
      away: { ...g.away, score: 0 },
    };
    const result = GameSchema.safeParse(broken);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toMatch(/non-final game carrying a score/);
  });

  /**
   * These URLs are third-party strings that go straight into an `href` on a prerendered page, and
   * React does not filter a scheme, so the contract is the chokepoint that has to.
   */
  it.each(['javascript:alert(1)', 'data:text/html,<script>x()</script>', '/relative', 'not a url'])(
    'rejects %s in a game URL',
    (bad) => {
      const g = game({ home: 'cupertino', away: 'fremont', hs: 1, as: 0 });
      const result = GameSchema.safeParse({ ...g, urls: { ...g.urls, maxpreps: bad } });
      expect(result.success).toBe(false);
      expect(JSON.stringify(result.error?.issues)).toMatch(/expected an http\(s\) URL/);
    },
  );

  it('accepts an ordinary https URL', () => {
    const g = game({ home: 'cupertino', away: 'fremont', hs: 1, as: 0 });
    const result = GameSchema.safeParse({
      ...g,
      urls: { ...g.urls, maxpreps: 'https://www.maxpreps.com/x' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a decider on a game that is not final', () => {
    const g = game({ home: 'cupertino', away: 'fremont', status: 'scheduled' });
    const result = GameSchema.safeParse({ ...g, decider: 'REG' });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toMatch(/decider\/status mismatch/);
  });

  it('rejects shootout data without an SO decider', () => {
    const g = game({ home: 'cupertino', away: 'fremont', hs: 1, as: 1 });
    const result = GameSchema.safeParse({ ...g, shootout: { home: 4, away: 3 } });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toMatch(/shootout\/decider mismatch/);
  });

  it('accepts a genuine 0-0 final', () => {
    const g = game({ home: 'cupertino', away: 'fremont', hs: 0, as: 0 });
    expect(GameSchema.safeParse(g).success).toBe(true);
  });

  it('rejects a dateKey that disagrees with dateLocal', () => {
    const g = game({ home: 'cupertino', away: 'fremont', hs: 1, as: 0, date: '2026-09-09' });
    const result = GameSchema.safeParse({ ...g, dateKey: '2026-09-10' });
    expect(result.success).toBe(false);
  });

  it('accepts a GUID or sblive:<digits> contest id, nothing else', () => {
    const g = game({ home: 'cupertino', away: 'fremont', hs: 1, as: 0 });
    expect(GameSchema.safeParse({ ...g, contestId: 'sblive:123' }).success).toBe(true);
    for (const bad of ['test-0001', 'sblive:abc', 'sblive-123', '']) {
      expect(GameSchema.safeParse({ ...g, contestId: bad }).success, bad).toBe(false);
    }
  });
});

describe('snapshot schema: checkAgainstConfig', () => {
  it('1. names the missing team when teams do not equal the registry', () => {
    const s = baseSnapshot();
    const broken = { ...s, teams: s.teams.slice(0, 42), counts: { ...s.counts, teams: 42 } };
    expect(issuesOf(broken)).toMatch(/teams do not equal the registry \(missing: marin-academy, extra: none\)/);
  });

  it('1. rejects the registry in another order', () => {
    const s = baseSnapshot();
    expect(issuesOf({ ...s, teams: [...s.teams].reverse() })).toMatch(/teams do not equal the registry.*order differs/);
  });

  it('2. rejects a team whose division is not in its league', () => {
    const s = baseSnapshot();
    s.teams[0] = { ...s.teams[0], division: 'pcal' };
    expect(issuesOf(s)).toMatch(/division pcal is not in scval/);
  });

  it('3. checks points under the team’s league', () => {
    const s = baseSnapshot();
    const [first, ...rest] = s.standings;
    const broken = {
      ...s,
      standings: [{ ...first, computed: { ...first.computed, pts: first.computed.pts + 1 } }, ...rest],
    };
    expect(issuesOf(broken)).toMatch(/pts is not 3w \+ 1t under scval/);
  });

  it('3. rejects a standings table that is missing a team', () => {
    const s = baseSnapshot();
    expect(issuesOf({ ...s, standings: s.standings.slice(1) })).toMatch(/standings row count/);
  });

  it('3. rejects a resolvedBy stage the league does not have', () => {
    const s = baseSnapshot();
    const i = s.standings.findIndex((r) => r.division === 'de-anza');
    s.standings[i] = { ...s.standings[i], tiebreak: { ...s.standings[i].tiebreak, resolvedBy: 'draw-number' } };
    expect(issuesOf(s)).toMatch(/draw-number is not a scval stage/);
  });

  it('3. allows play-in only for a league-tournament league', () => {
    const s = baseSnapshot();
    const i = s.standings.findIndex((r) => r.division === 'marin-county');
    s.standings[i] = { ...s.standings[i], tiebreak: { ...s.standings[i].tiebreak, resolvedBy: 'play-in' } };
    expect(() => parseSnapshot(s)).not.toThrow();
    const j = s.standings.findIndex((r) => r.division === 'pcal');
    s.standings[j] = { ...s.standings[j], tiebreak: { ...s.standings[j].tiebreak, resolvedBy: 'play-in' } };
    expect(issuesOf(s)).toMatch(/play-in is not a pcal stage/);
  });

  it('4. rejects duplicate contest ids', () => {
    const s = baseSnapshot();
    const dupe = [...s.games, s.games[0]];
    expect(issuesOf({ ...s, games: dupe, counts: { ...s.counts, games: dupe.length } })).toMatch(
      /duplicate contestId/,
    );
  });

  it('4. countsFor must equal classifyGame', () => {
    const s = baseSnapshot();
    const i = s.games.findIndex((g) => g.countsFor !== null);
    s.games[i] = { ...s.games[i], countsFor: null };
    expect(issuesOf(s)).toMatch(/countsFor null != classifyGame/);
    const j = s.games.findIndex((g) => g.countsFor === null && g.leagueDivision === null);
    const t = baseSnapshot();
    t.games[j] = { ...t.games[j], countsFor: 'de-anza' };
    expect(issuesOf(t)).toMatch(/countsFor de-anza != classifyGame null/);
  });

  it('4. honours a degraded division: contest-type evidence, never membership', () => {
    const s = baseSnapshot();
    const typed = game({ home: 'leigh', away: 'leland', hs: 1, as: 0, official: null });
    expect(typed.countsFor).toBeNull();
    const asDegraded: Game = { ...typed, countsFor: 'mt-hamilton' };
    s.games.push(asDegraded);
    s.counts.games += 1;
    expect(issuesOf(s)).toMatch(/countsFor mt-hamilton != classifyGame null/);
    const bval = s.leagueHealth.find((h) => h.leagueId === 'bval')!;
    bval.divisions = bval.divisions.map((d) =>
      d.divisionId === 'mt-hamilton' ? { ...d, classification: 'fallback-contest-type' } : d,
    );
    expect(() => parseSnapshot(s)).not.toThrow();
  });

  it('4. a sblive: game carries si.com scores, no MaxPreps URL and the absent-fixture rule', () => {
    const ok = baseSnapshot();
    ok.games.push(sbliveGame());
    ok.counts.games += 1;
    expect(() => parseSnapshot(ok)).not.toThrow();

    const g = sbliveGame();
    for (const [broken, message] of [
      [{ ...g, provenance: { ...g.provenance, scores: 'maxpreps-api' } }, /sblive: game must carry sblive scores/],
      [{ ...g, urls: { ...g.urls, maxpreps: 'https://www.maxpreps.com/x' } }, /sblive: game has no MaxPreps URL/],
      [{ ...g, urls: { ...g.urls, sblive: undefined } }, /sblive: game needs its si.com URL/],
      [
        { ...g, provenance: { ...g.provenance, backfill: { ...g.provenance.backfill!, rule: 'score-pending' } } },
        /needs backfill rule 'absent-fixture'/,
      ],
    ] as const) {
      const s = baseSnapshot();
      s.games.push(broken as Game);
      s.counts.games += 1;
      expect(issuesOf(s)).toMatch(message);
    }
  });

  it('4. any backfilled game carries si.com scores', () => {
    const s = baseSnapshot();
    const g = game({ home: 'carmel', away: 'salinas', hs: 1, as: 0 });
    s.games.push({
      ...g,
      provenance: {
        ...g.provenance,
        scores: 'maxpreps-api',
        backfill: { rule: 'score-pending', sbliveGameId: '1', maxpreps: null, note: 'x' },
      },
    });
    s.counts.games += 1;
    expect(issuesOf(s)).toMatch(/a backfilled game must carry sblive scores/);
  });

  it('5. official fixtures belong to a configured division of their league', () => {
    const s = baseSnapshot();
    s.officialFixtures = [{ ...s.officialFixtures![0], league: 'bval' }];
    expect(issuesOf(s)).toMatch(/bval is not the league of de-anza/);
  });

  it('6. season leagues and divisions equal config', () => {
    const s = baseSnapshot();
    s.season = { ...s.season, leagues: [...s.season.leagues].reverse() };
    expect(issuesOf(s)).toMatch(/season leagues differ from config/);
    const t = baseSnapshot();
    t.season.leagues[3] = { ...t.season.leagues[3], postseasonKind: 'ccs-ladder' };
    expect(issuesOf(t)).toMatch(/mcal postseasonKind differs from config/);
  });

  it('7. the CCS field adds up and matches config', () => {
    const s = baseSnapshot();
    s.playoffs.format.autoQualifiers = { ...s.playoffs.format.autoQualifiers, atLarge: 4 };
    expect(issuesOf(s)).toMatch(/autoQualifiers sum 17 != total 16/);
    const t = baseSnapshot();
    t.playoffs.format.autoQualifiers = { ...t.playoffs.format.autoQualifiers, mcal: 6 };
    expect(issuesOf(t)).toMatch(/autoQualifiers keys/);
  });

  it('8. one leagueHealth row per league, config order', () => {
    const s = baseSnapshot();
    expect(issuesOf({ ...s, leagueHealth: s.leagueHealth.slice(0, 3) })).toMatch(/leagueHealth rows must be one per configured league/);
  });

  it('9. cross-check slugs are registry slugs', () => {
    const s = baseSnapshot();
    s.crossCheck = [{ slug: 'wilcox', field: 'league record', ours: '1-0-0', theirs: '0-1-0', url: 'https://www.maxpreps.com/x' }];
    expect(issuesOf(s)).toMatch(/unknown slug wilcox/);
  });

  it('10. superseded games map an absent sblive: id to a present contest', () => {
    const s = baseSnapshot();
    s.supersededGames = { 'sblive:1': s.games[0].contestId };
    expect(() => parseSnapshot(s)).not.toThrow();
    const t = baseSnapshot();
    t.supersededGames = { 'sblive:1': 'sblive:2' };
    expect(issuesOf(t)).toMatch(/superseding contest sblive:2 is not in games/);
    const u = baseSnapshot();
    u.games.push(sbliveGame());
    u.counts.games += 1;
    u.supersededGames = { 'sblive:6541425': u.games[0].contestId };
    expect(issuesOf(u)).toMatch(/a superseded game is still in games/);
  });

  it('rejects stale counts', () => {
    const s = baseSnapshot();
    expect(issuesOf({ ...s, counts: { ...s.counts, games: 1 } })).toMatch(/counts.games is stale/);
  });

  it('reports a readable error message', () => {
    expect(() => parseSnapshot({})).toThrow(/snapshot failed validation/);
  });
});

/**
 * The cron's "commit the snapshot if it changed" guard compares this hash, because a byte diff of
 * snapshot.json is never empty: the run's timestamp is written into ~160 places.
 */
describe('snapshotContentHash', () => {
  it('ignores every fetchedAt stamp', () => {
    const a = baseSnapshot();
    const later = '2026-10-02T22:00:00.000Z';
    const b: Snapshot = {
      ...a,
      fetchedAt: later,
      games: a.games.map((g) => ({
        ...g,
        provenance: { ...g.provenance, fetchedAt: later },
      })),
      sources: a.sources.map((s) => ({ ...s, fetchedAt: later })),
      sbliveCrossCheck: { ...a.sbliveCrossCheck!, sbliveFetchedAt: later },
    };
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
    expect(snapshotContentHash(a)).toBe(snapshotContentHash(b));
  });

  /**
   * The SBLive report's stamp is written on every live in-season run
   * (`reconcile(…, { sbliveFetchedAt: fetchedAt })`) and it is NOT called `fetchedAt`, so a guard
   * that enumerated key names let it through and the cron committed a timestamp-only diff twice a
   * day. Asserted on its own so the regression cannot hide behind the top-level stamp.
   */
  it('ignores the SBLive report stamp on its own', () => {
    const a = baseSnapshot();
    const b: Snapshot = {
      ...a,
      sbliveCrossCheck: { ...a.sbliveCrossCheck!, sbliveFetchedAt: '2026-10-02T22:00:00.000Z' },
    };
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
    expect(snapshotContentHash(a)).toBe(snapshotContentHash(b));
  });

  it('still moves when the SBLive report says something different', () => {
    const a = baseSnapshot();
    const b: Snapshot = {
      ...a,
      sbliveCrossCheck: { ...a.sbliveCrossCheck!, agreements: 0 },
    };
    expect(snapshotContentHash(a)).not.toBe(snapshotContentHash(b));
  });

  it('moves when a score moves', () => {
    const a = baseSnapshot();
    const [first, ...rest] = a.games;
    const b: Snapshot = {
      ...a,
      games: [{ ...first, recap: `${first.recap ?? ''} (edited)` }, ...rest],
    };
    expect(snapshotContentHash(a)).not.toBe(snapshotContentHash(b));
  });

  it('is insensitive to key order', () => {
    const a = baseSnapshot();
    // Same object, keys emitted in reverse — the hash canonicalises before it digests.
    const reordered = Object.fromEntries(
      Object.entries(a as unknown as Record<string, unknown>).reverse(),
    ) as unknown as Snapshot;
    expect(Object.keys(reordered)).not.toEqual(Object.keys(a));
    expect(snapshotContentHash(a)).toBe(snapshotContentHash(reordered));
  });
});
