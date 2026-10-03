/** v1 → v2 in memory (SPEC §4.3): the committed SCVAL-only snapshot keeps loading. */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { LEAGUES } from '../lib/leagues';
import { isSnapshotV1, migrateV1ToV2 } from '../lib/snapshot-migrate';
import { parseSnapshot, stableStringify } from '../lib/snapshot-schema';
import { divisionGames } from '../lib/standings';
import { TEAMS } from '../lib/teams';
import type { Game, Snapshot } from '../lib/types';

const GOLDEN = path.join(import.meta.dirname, 'golden');
const readV1 = (): Record<string, unknown> =>
  JSON.parse(readFileSync(path.join(GOLDEN, 'snapshot-2026-10-02.v1.json'), 'utf8')) as Record<string, unknown>;
const golden = JSON.parse(readFileSync(path.join(GOLDEN, 'scval-committed.json'), 'utf8')) as {
  standings: unknown[];
};

const v1 = readV1();
const v1Games = v1.games as Array<Game & { official?: { scheduledDate: string } }>;
const migrated: Snapshot = parseSnapshot(migrateV1ToV2(readV1()));
const SCVAL = ['de-anza', 'el-camino'];

describe('isSnapshotV1', () => {
  it('recognises v1 and nothing else', () => {
    expect(isSnapshotV1(readV1())).toBe(true);
    expect(isSnapshotV1(migrated)).toBe(false);
    expect(isSnapshotV1(null)).toBe(false);
    expect(isSnapshotV1({ season: { leagues: [] } })).toBe(false);
    expect(() => migrateV1ToV2(migrated)).toThrow(/not a v1 snapshot/);
  });

  it('does not mutate its input', () => {
    const raw = readV1();
    const before = JSON.stringify(raw);
    migrateV1ToV2(raw);
    expect(JSON.stringify(raw)).toBe(before);
  });
});

describe('migrateV1ToV2 on the committed v1 golden', () => {
  it('parses as v2 with the 43-team registry, in registry order', () => {
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.teams.map((t) => t.id)).toEqual(TEAMS.map((t) => t.id));
    expect(migrated.teams).toHaveLength(43);
    expect(migrated.standings).toHaveLength(43);
    expect(migrated.fetchedAt).toBe(v1.fetchedAt);
  });

  it('keeps the SCVAL standings rows byte-identical', () => {
    expect(stableStringify(migrated.standings.filter((s) => SCVAL.includes(s.division)))).toBe(
      stableStringify(golden.standings),
    );
  });

  it('gives every new team a "no results reported" row, listed last', () => {
    for (const s of migrated.standings.filter((r) => !SCVAL.includes(r.division))) {
      expect(s.hasReportedResults, s.slug).toBe(false);
      expect(s.computed.gp, s.slug).toBe(0);
      expect(s.reported).toBeNull();
      expect(s.tiebreak.note, s.slug).toMatch(/^No (division|league) results reported for /);
    }
    const leigh = migrated.standings.find((s) => s.slug === 'leigh')!;
    expect(leigh.tiebreak.note).toMatch(/^No division results reported for Leigh, so it is listed last; Mt\. Hamilton order/);
    const carmel = migrated.standings.find((s) => s.slug === 'carmel')!;
    expect(carmel.tiebreak.note).toMatch(/^No league results reported for Carmel, so it is listed last; PCAL order/);
  });

  it('re-resolves sides: Leigh now carries slug leigh', () => {
    const before = v1Games.filter((g) => g.home.name === 'Leigh' || g.away.name === 'Leigh');
    expect(before.length).toBeGreaterThan(0);
    for (const g of before) {
      expect([g.home.slug, g.away.slug]).not.toContain('leigh');
      const after = migrated.games.find((m) => m.contestId === g.contestId)!;
      const side = after.home.name === 'Leigh' ? after.home : after.away;
      expect(side.slug).toBe('leigh');
      expect(after.leagueDivision).toBeNull(); // an SCVAL opponent: never same-division
    }
    // A non-member stays a name only.
    const scripps = migrated.games.find((g) => g.home.name === 'Scripps Ranch' || g.away.name === 'Scripps Ranch')!;
    expect([scripps.home.slug, scripps.away.slug]).toContain(null);
  });

  it('adds placeholders, then classifies exactly as the pipeline does', () => {
    for (const g of migrated.games) {
      expect(g.contestTypes).toEqual({ home: null, away: null });
      expect(g.postseason).toBeNull();
      expect(g.countsFor).toBe(g.isLeague ? g.leagueDivision : null);
    }
  });

  it('upgrades the official stamps', () => {
    const stamped = migrated.games.filter((g) => g.official);
    expect(stamped).toHaveLength(v1Games.filter((g) => g.official).length);
    for (const g of stamped) {
      const o = g.official!;
      expect(o.division).toBe(g.leagueDivision);
      expect(o.source).toBe('scval-pdf');
      expect(o.fixtureId).toBe(`${o.division}:${o.scheduledDate}:${g.away.slug}@${g.home.slug}`);
      expect(o.pass).toBe(o.scheduledDate === g.dateKey ? 'same-date' : 'rescheduled');
    }
    expect(stamped.filter((g) => g.official!.pass === 'rescheduled')).toHaveLength(4);
  });

  it('upgrades the unmatched fixtures', () => {
    expect(migrated.officialFixtures).toEqual([
      {
        id: 'de-anza:2026-09-09:homestead@cupertino', league: 'scval', division: 'de-anza',
        dateKey: '2026-09-09', time: null, awayName: 'HOMESTEAD', homeName: 'CUPERTINO',
        awaySlug: 'homestead', homeSlug: 'cupertino', source: 'scval-pdf',
      },
      {
        id: 'de-anza:2026-10-05:cupertino@homestead', league: 'scval', division: 'de-anza',
        dateKey: '2026-10-05', time: null, awayName: 'CUPERTINO', homeName: 'HOMESTEAD',
        awaySlug: 'cupertino', homeSlug: 'homestead', source: 'scval-pdf',
      },
    ]);
  });

  it('builds the season from config with per-league windows', () => {
    expect(migrated.season.sections.map((s) => s.id)).toEqual(['ccs', 'ncs']);
    expect(migrated.season.leagues.map((l) => [l.id, l.postseasonKind])).toEqual([
      ['scval', 'ccs-ladder'], ['bval', 'ccs-ladder'], ['pcal', 'ccs-ladder'], ['mcal', 'league-tournament'],
    ]);
    const scval = migrated.season.leagues[0].window;
    expect(scval.lastGame).toBe('2026-10-28T18:00:00');
    expect(migrated.season.window.firstGame).toBe('2026-08-24T16:00:00');
  });

  it('rebuilds the CCS block from config', () => {
    expect(migrated.playoffs.keyDates.endOfLeagueSeason).toBe('2026-10-31');
    expect('crossover' in migrated.playoffs.keyDates).toBe(false);
    expect(migrated.playoffs.format.ccsDivisions).toEqual([
      { name: 'Division 1', seeds: [1, 8] },
      { name: 'Division 2', seeds: [9, 16] },
    ]);
    expect(migrated.playoffs.format.autoQualifiers).toEqual({ scval: 7, bval: 4, pcal: 2, atLarge: 3, total: 16 });
    expect(migrated.playoffs.bracketPublished).toBe(false);
  });

  it('gives SCVAL a fresh health row with real counted finals; the others degraded with the reason', () => {
    expect(migrated.leagueHealth.map((h) => h.leagueId)).toEqual(LEAGUES.map((l) => l.id));
    const [scval, ...others] = migrated.leagueHealth;
    expect(scval.state).toBe('fresh');
    expect(scval.lastFreshAt).toBe(migrated.fetchedAt);
    expect(scval.teamFeeds).toEqual({ total: 15, ok: 15, carried: 0, failed: 0 });
    for (const d of scval.divisions) {
      expect(d.countedFinals).toBe(divisionGames(migrated.games, d.divisionId).length);
      expect(d.countedFinals).toBeGreaterThan(0);
      expect(d.classification).toBe('contest-type');
      expect(d.reportedRows).toBe(d.divisionId === 'de-anza' ? 7 : 8);
    }
    for (const h of others) {
      const short = LEAGUES.find((l) => l.id === h.leagueId)!.shortName;
      expect(h.state).toBe('degraded');
      expect(h.lastFreshAt).toBeNull();
      expect(h.reasons).toEqual([`No ${short} data in this snapshot yet: it was written before ${short} was added.`]);
      for (const d of h.divisions) {
        expect(d.countedFinals).toBe(0);
        expect(d.previousCountedFinals).toBeNull();
      }
    }
  });

  it('starts the new lists empty and recomputes the counts', () => {
    expect(migrated.dropped).toEqual([]);
    expect(migrated.supersededGames).toEqual({});
    expect(migrated.sbliveCrossCheck?.backfilled).toEqual([]);
    expect(migrated.counts.teams).toBe(43);
    expect(migrated.counts.games).toBe(migrated.games.length);
    expect(migrated.counts.leagueGames).toBe(migrated.games.filter((g) => g.countsFor !== null).length);
    expect(Object.keys(migrated.counts.byLeague)).toEqual(['scval', 'bval', 'pcal', 'mcal']);
    expect(migrated.counts.byLeague.scval.games).toBe(migrated.games.length);
    expect(migrated.counts.byLeague.bval.leagueGames).toBe(0);
  });
});
