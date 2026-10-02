import { describe, expect, it } from 'vitest';

import { normalizeGames, seasonWindowOf } from '../lib/normalize';
import { buildSeason, CCS_BRACKET_URL, PLAYOFF_FORMAT, PLAYOFF_KEY_DATES } from '../lib/season';
import { computeStandings } from '../lib/standings';
import {
  GameSchema,
  SnapshotSchema,
  parseSnapshot,
  snapshotContentHash,
} from '../lib/snapshot-schema';
import { TEAMS } from '../lib/teams';
import type { Snapshot } from '../lib/types';
import { allScheduleRows, game } from './helpers';

const fetchedAt = '2026-09-29T15:00:00.000Z';
const games = normalizeGames(allScheduleRows(), { fetchedAt }).games;
const standings = computeStandings(games);

function baseSnapshot(): Snapshot {
  return {
    fetchedAt,
    season: buildSeason(seasonWindowOf(games)),
    teams: [...TEAMS],
    games,
    standings,
    playoffs: {
      keyDates: PLAYOFF_KEY_DATES,
      format: {
        elimination: PLAYOFF_FORMAT.elimination,
        divisions: PLAYOFF_FORMAT.divisions.map((d) => ({
          name: d.name,
          seeds: [d.seeds[0], d.seeds[1]] as [number, number],
        })),
        autoQualifiers: { ...PLAYOFF_FORMAT.autoQualifiers },
        highSeedHostsThrough: PLAYOFF_FORMAT.highSeedHostsThrough,
      },
      bracketPublished: false,
      bracketUrl: CCS_BRACKET_URL,
      games: [],
    },
    sources: [],
    crossCheck: [],
    // Present on every live in-season run, and it carries a SECOND wall-clock stamp under a name
    // of its own. It belongs in the base fixture so the content-hash tests below actually see it.
    sbliveCrossCheck: {
      sbliveFetchedAt: fetchedAt,
      compared: 1,
      agreements: 1,
      conflicts: [],
      sbliveOnlyScored: [],
    },
    counts: {
      teams: TEAMS.length,
      games: games.length,
      finals: games.filter((g) => g.status === 'final').length,
      pending: games.filter((g) => g.status === 'score-pending').length,
      leagueGames: games.filter((g) => g.isLeague).length,
      mismatches: 0,
    },
  };
}

describe('snapshot schema: accepts a real snapshot', () => {
  it('validates the fixture-built snapshot', () => {
    expect(() => parseSnapshot(baseSnapshot())).not.toThrow();
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
});

describe('snapshot schema: snapshot invariants', () => {
  it('rejects a snapshot with fewer than 15 teams', () => {
    const s = baseSnapshot();
    const broken = { ...s, teams: s.teams.slice(0, 14), counts: { ...s.counts, teams: 14 } };
    const result = SnapshotSchema.safeParse(broken);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toMatch(/exactly 15 teams/);
  });

  it('rejects duplicate contest ids', () => {
    const s = baseSnapshot();
    const dupe = [...s.games, s.games[0]];
    const result = SnapshotSchema.safeParse({
      ...s,
      games: dupe,
      counts: { ...s.counts, games: dupe.length },
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toMatch(/duplicate contestId/);
  });

  it('rejects a standings table that is missing a team', () => {
    const s = baseSnapshot();
    const result = SnapshotSchema.safeParse({ ...s, standings: s.standings.slice(1) });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toMatch(/standings row count/);
  });

  it('rejects a points column that is not 3w + t', () => {
    const s = baseSnapshot();
    const [first, ...rest] = s.standings;
    const broken = {
      ...s,
      standings: [{ ...first, computed: { ...first.computed, pts: first.computed.pts + 1 } }, ...rest],
    };
    const result = SnapshotSchema.safeParse(broken);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toMatch(/pts is not 3w \+ t/);
  });

  it('rejects stale counts', () => {
    const s = baseSnapshot();
    const result = SnapshotSchema.safeParse({ ...s, counts: { ...s.counts, games: 1 } });
    expect(result.success).toBe(false);
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
    const later = '2026-09-29T22:00:00.000Z';
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
      sbliveCrossCheck: { ...a.sbliveCrossCheck!, sbliveFetchedAt: '2026-09-29T22:00:00.000Z' },
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
