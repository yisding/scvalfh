/**
 * v1 → v2 in memory (SPEC §4.3): the committed SCVAL-only snapshot keeps loading. And the "league
 * added" upgrade (v2 → v2): a file written before the EAL existed keeps loading too, and so does a
 * NorCal file written before the Sunset and the three San Diego leagues (and their two sections).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { LEAGUES, leaguesInRegion } from '../lib/leagues';
import { addConfiguredLeagues, isSnapshotV1, lacksConfiguredLeagues, migrateV1ToV2 } from '../lib/snapshot-migrate';
import { loadSnapshot, parseSnapshot } from '../lib/snapshot-schema';
import { stableStringify } from '../lib/stable-json';
import { divisionGames } from '../lib/standings';
import { TEAMS, teamsInLeague } from '../lib/teams';
import type { Game, Snapshot } from '../lib/types';
import { VARIANTS_DIR } from './helpers';

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
  it('parses as v2 with the 99-team registry, in registry order', () => {
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.teams.map((t) => t.id)).toEqual(TEAMS.map((t) => t.id));
    expect(migrated.teams).toHaveLength(99);
    expect(migrated.standings).toHaveLength(99);
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
      // NorCal rows say 'results reported'; a 'site'-ordered SoCal row says 'games counted' (lib/standings.ts
      // tiebreakNote: SoCal copy avoids the word 'results').
      expect(s.tiebreak.note, s.slug).toMatch(/^No (division|league) (results reported|games counted) for /);
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
    // A San Diego opponent is a registry side now too, in no table with its SCVAL opponent.
    const scripps = migrated.games.filter((g) => g.home.name === 'Scripps Ranch' || g.away.name === 'Scripps Ranch');
    expect(scripps.length).toBeGreaterThan(0);
    for (const g of scripps) {
      expect([g.home.slug, g.away.slug]).toContain('scripps-ranch');
      expect([g.leagueDivision, g.countsFor]).toEqual([null, null]);
    }
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
    expect(migrated.season.sections.map((s) => s.id)).toEqual(['ccs', 'ncs', 'ns', 'ss', 'sds']);
    expect(migrated.season.leagues.map((l) => [l.id, l.postseasonKind])).toEqual([
      ['scval', 'ccs-ladder'], ['bval', 'ccs-ladder'], ['pcal', 'ccs-ladder'], ['mcal', 'league-tournament'],
      ['eal', 'unbracketed-tournament'], ['sunset', 'no-postseason'], ['city', 'section-playoffs'],
      ['north-county', 'section-playoffs'], ['metro', 'section-playoffs'],
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
    expect(migrated.counts.teams).toBe(99);
    expect(migrated.counts.games).toBe(migrated.games.length);
    expect(migrated.counts.leagueGames).toBe(migrated.games.filter((g) => g.countsFor !== null).length);
    expect(Object.keys(migrated.counts.byLeague)).toEqual(LEAGUES.map((l) => l.id));
    expect(migrated.counts.byLeague.scval.games).toBe(migrated.games.length);
    expect(migrated.counts.byLeague.bval.leagueGames).toBe(0);
  });
});

// ---------------------------------------------------------------- the "league added" upgrade (D15)

const EAL_SLUGS = new Set(teamsInLeague('eal').map((t) => t.slug));

/** The migrated golden as a four-league v2 file would have it: every EAL entry stripped. */
function withoutEal(full: Snapshot): Snapshot {
  const s = structuredClone(full);
  const unslug = (g: Game): Game => ({
    ...g,
    home: g.home.slug && EAL_SLUGS.has(g.home.slug) ? { ...g.home, slug: null } : g.home,
    away: g.away.slug && EAL_SLUGS.has(g.away.slug) ? { ...g.away, slug: null } : g.away,
  });
  const byLeague = { ...s.counts.byLeague };
  delete byLeague.eal;
  return {
    ...s,
    season: {
      ...s.season,
      sections: s.season.sections.filter((x) => x.id !== 'ns'),
      leagues: s.season.leagues.filter((l) => l.id !== 'eal'),
    },
    teams: s.teams.filter((t) => t.league !== 'eal'),
    games: s.games.map(unslug),
    standings: s.standings.filter((r) => r.division !== 'eal'),
    playoffs: { ...s.playoffs, games: s.playoffs.games.map(unslug) },
    leagueHealth: s.leagueHealth.filter((h) => h.leagueId !== 'eal'),
    crossCheck: s.crossCheck.filter((r) => !EAL_SLUGS.has(r.slug)),
    counts: { ...s.counts, teams: s.teams.length - EAL_SLUGS.size, byLeague },
  };
}

describe('the "league added" upgrade (a v2 file written before the EAL existed)', () => {
  const full = migrateV1ToV2(readV1()) as Snapshot;
  const stripped = withoutEal(full);

  it('recognises a v2 file whose leagues are a proper, in-order subsequence of the config', () => {
    expect(stripped.season.leagues.map((l) => l.id)).toEqual(['scval', 'bval', 'pcal', 'mcal', 'sunset', 'city', 'north-county', 'metro']);
    // The golden has two Bella Vista games: the stripped file holds them as name-only opponents.
    expect(stripped.games.filter((g) => g.home.name === 'Bella Vista' || g.away.name === 'Bella Vista')).toHaveLength(2);
    expect(lacksConfiguredLeagues(stripped)).toBe(true);
    expect(lacksConfiguredLeagues(full)).toBe(false);
    expect(lacksConfiguredLeagues(readV1())).toBe(false);
    expect(lacksConfiguredLeagues(null)).toBe(false);
    const reordered = { ...stripped, season: { ...stripped.season, leagues: [...stripped.season.leagues].reverse() } };
    expect(lacksConfiguredLeagues(reordered)).toBe(false);
    const unknown = { ...stripped, season: { ...stripped.season, leagues: [{ id: 'nope' }] } };
    expect(lacksConfiguredLeagues(unknown)).toBe(false);
    expect(() => addConfiguredLeagues(full)).toThrow(/lacks a configured league/);
  });

  it('loads it as if it had been written with the EAL: a round trip to the same snapshot', () => {
    expect(() => parseSnapshot(stripped)).toThrow(/snapshot failed validation/);
    expect(stableStringify(loadSnapshot(stripped))).toBe(stableStringify(loadSnapshot(full)));
  });

  it('leaves the existing leagues untouched and does not mutate its input', () => {
    const before = JSON.stringify(stripped);
    const upgraded = addConfiguredLeagues(stripped) as Snapshot;
    expect(JSON.stringify(stripped)).toBe(before);
    expect(stableStringify(upgraded.standings.filter((r) => r.division !== 'eal'))).toBe(stableStringify(stripped.standings));
    expect(stableStringify(upgraded.leagueHealth.filter((h) => h.leagueId !== 'eal'))).toBe(stableStringify(stripped.leagueHealth));
    // The EAL's rows land where config puts them: after MCAL's, before the Sunset's.
    const at = upgraded.standings.findIndex((r) => r.division === 'eal');
    expect(upgraded.standings.slice(at, at + 6).map((r) => r.slug)).toEqual([...EAL_SLUGS]);
    expect(upgraded.standings[at - 1].division).toBe('marin-county');
    expect(upgraded.standings[at + 6].division).toBe('sunset');
    const bv = upgraded.games.filter((g) => g.away.name === 'Bella Vista');
    expect(bv.map((g) => [g.away.slug, g.leagueDivision, g.countsFor])).toEqual([
      ['bella-vista', null, null], ['bella-vista', null, null],
    ]);
  });

  it('loads the frozen four-league finals-regression snapshot with a degraded EAL row', () => {
    const file = path.join(VARIANTS_DIR, 'finals-regression', 'previous-snapshot.json');
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Snapshot;
    expect(raw.season.leagues.map((l) => l.id)).toEqual(['scval', 'bval', 'pcal', 'mcal']);
    expect(lacksConfiguredLeagues(raw)).toBe(true);
    const loaded = loadSnapshot(raw);
    expect(loaded.teams).toHaveLength(99);
    expect(loaded.season.sections.map((s) => s.id)).toEqual(['ccs', 'ncs', 'ns', 'ss', 'sds']);
    expect(loaded.leagueHealth.map((h) => h.leagueId)).toEqual(LEAGUES.map((l) => l.id));
    expect(stableStringify(loaded.leagueHealth.slice(0, 4))).toBe(stableStringify(raw.leagueHealth));
    expect(loaded.leagueHealth[4]).toEqual({
      leagueId: 'eal',
      state: 'degraded',
      lastFreshAt: null,
      reasons: ['No EAL data in this snapshot yet: it was written before EAL was added.'],
      divisions: [{
        divisionId: 'eal', meta: 'skipped', reportedTable: 'skipped', reportedRows: null,
        classification: 'contest-type', official: null, countedFinals: 0, previousCountedFinals: null, backfilled: 0,
      }],
      teamFeeds: { total: 6, ok: 0, carried: 0, failed: 0 },
    });
    for (const r of loaded.standings.filter((x) => x.division === 'eal')) {
      expect([r.computed.gp, r.reported, r.hasReportedResults], r.slug).toEqual([0, null, false]);
    }
  });
});

// ---------------------------------------------------------------- the Southern California leagues (DESIGN-socal §2.1.10)

const SOCAL_LEAGUES = leaguesInRegion('socal').map((l) => l.id);
const SOCAL_DIVISIONS = new Set(leaguesInRegion('socal').flatMap((l) => l.divisions.map((d) => d.id)));
const SOCAL_SLUGS = new Set(TEAMS.filter((t) => SOCAL_LEAGUES.includes(t.league)).map((t) => t.slug));

/** A snapshot as the five-league NorCal site wrote it: no SoCal section, league, team, row or slug. */
function withoutSoCal(full: Snapshot): Snapshot {
  const s = structuredClone(full);
  const unslug = (g: Game): Game => ({
    ...g,
    home: g.home.slug && SOCAL_SLUGS.has(g.home.slug) ? { ...g.home, slug: null } : g.home,
    away: g.away.slug && SOCAL_SLUGS.has(g.away.slug) ? { ...g.away, slug: null } : g.away,
  });
  const byLeague = { ...s.counts.byLeague };
  for (const id of SOCAL_LEAGUES) delete byLeague[id];
  return {
    ...s,
    season: {
      ...s.season,
      sections: s.season.sections.filter((x) => x.id !== 'ss' && x.id !== 'sds'),
      leagues: s.season.leagues.filter((l) => !SOCAL_LEAGUES.includes(l.id)),
    },
    teams: s.teams.filter((t) => !SOCAL_LEAGUES.includes(t.league)),
    games: s.games.map(unslug),
    standings: s.standings.filter((r) => !SOCAL_DIVISIONS.has(r.division)),
    playoffs: { ...s.playoffs, games: s.playoffs.games.map(unslug) },
    leagueHealth: s.leagueHealth.filter((h) => !SOCAL_LEAGUES.includes(h.leagueId)),
    crossCheck: s.crossCheck.filter((r) => !SOCAL_SLUGS.has(r.slug)),
    counts: { ...s.counts, teams: s.teams.length - SOCAL_SLUGS.size, byLeague },
  };
}

describe('the "league added" upgrade for the four Southern California leagues and their two sections', () => {
  const full = migrateV1ToV2(readV1()) as Snapshot;
  const norcal = withoutSoCal(full);

  it('recognises the five-league NorCal file and round-trips it to the nine-league snapshot', () => {
    expect(norcal.season.leagues.map((l) => l.id)).toEqual(['scval', 'bval', 'pcal', 'mcal', 'eal']);
    expect(norcal.season.sections.map((s) => s.id)).toEqual(['ccs', 'ncs', 'ns']);
    expect(norcal.teams).toHaveLength(49);
    expect(lacksConfiguredLeagues(norcal)).toBe(true);
    expect(() => parseSnapshot(norcal)).toThrow(/snapshot failed validation/);
    expect(stableStringify(loadSnapshot(norcal))).toBe(stableStringify(loadSnapshot(full)));
  });

  it('adds the two sections and four leagues in config order, each league degraded with the reason, NorCal untouched', () => {
    const before = JSON.stringify(norcal);
    const upgraded = addConfiguredLeagues(norcal) as Snapshot;
    expect(JSON.stringify(norcal)).toBe(before);
    expect(upgraded.season.sections.map((s) => s.id)).toEqual(['ccs', 'ncs', 'ns', 'ss', 'sds']);
    expect(upgraded.season.leagues.map((l) => l.id)).toEqual(LEAGUES.map((l) => l.id));
    expect(stableStringify(upgraded.season.leagues.slice(0, 5))).toBe(stableStringify(norcal.season.leagues));
    expect(stableStringify(upgraded.standings.slice(0, 49))).toBe(stableStringify(norcal.standings));
    expect(stableStringify(upgraded.leagueHealth.slice(0, 5))).toBe(stableStringify(norcal.leagueHealth));
    expect(upgraded.leagueHealth.slice(5).map((h) => [h.leagueId, h.state, h.reasons, h.divisions.map((d) => [d.divisionId, d.classification])])).toEqual([
      ['sunset', 'degraded', ['No Sunset data in this snapshot yet: it was written before Sunset was added.'], [['sunset', 'contest-type']]],
      ['city', 'degraded', ['No City data in this snapshot yet: it was written before City was added.'],
        [['city-western', 'membership'], ['city-eastern', 'membership']]],
      ['north-county', 'degraded', ['No North County data in this snapshot yet: it was written before North County was added.'],
        [['avocado', 'membership'], ['palomar', 'membership'], ['valley', 'membership']]],
      ['metro', 'degraded', ['No Metro data in this snapshot yet: it was written before Metro was added.'],
        [['metro-mesa', 'membership'], ['metro-south-bay', 'membership']]],
    ]);
    // The new rows carry no results; the Sunset's single rung still gives each a status.
    const added = upgraded.standings.slice(49);
    expect(added).toHaveLength(50);
    for (const r of added) expect([r.computed.gp, r.reported, r.hasReportedResults], r.slug).toEqual([0, null, false]);
    expect(new Set(added.filter((r) => r.division === 'sunset').map((r) => r.playoffStatus))).toEqual(new Set(['no-postseason']));
    // A Valley division row carries the null MaxPreps id config gives it.
    const valley = upgraded.season.leagues.find((l) => l.id === 'north-county')!.divisions.find((d) => d.id === 'valley')!;
    expect(valley.maxprepsLeagueId).toBeNull();
  });

  it('re-resolves the San Diego sides of NorCal games; those games stay in no table', () => {
    const upgraded = addConfiguredLeagues(norcal) as Snapshot;
    const crossRegion = upgraded.games.filter((g) => [g.home.slug, g.away.slug].some((x) => x !== null && SOCAL_SLUGS.has(x)));
    expect(crossRegion.length).toBeGreaterThan(0);
    for (const g of crossRegion) {
      expect([g.leagueDivision, g.countsFor], g.contestId).toEqual([null, null]);
      expect(g.home.slug !== null && g.away.slug !== null, g.contestId).toBe(true);
    }
  });

  it('loads the committed data/snapshot.json, whichever side of the amendment it was written on', () => {
    const committed = JSON.parse(readFileSync(path.join(import.meta.dirname, '..', 'data', 'snapshot.json'), 'utf8')) as Snapshot;
    const predates = lacksConfiguredLeagues(committed);
    const loaded = loadSnapshot(committed);
    expect(loaded.teams).toHaveLength(99);
    expect(loaded.season.leagues.map((l) => l.id)).toEqual(LEAGUES.map((l) => l.id));
    if (!predates) return;
    // Written by the five-league site: NorCal stays byte-identical, and every game keeps its classification.
    const n = committed.season.leagues.length;
    expect(stableStringify(loaded.leagueHealth.slice(0, n))).toBe(stableStringify(committed.leagueHealth));
    expect(stableStringify(loaded.standings.slice(0, committed.standings.length))).toBe(stableStringify(committed.standings));
    expect(loaded.games.map((g) => [g.contestId, g.countsFor, g.postseason])).toEqual(
      committed.games.map((g) => [g.contestId, g.countsFor, g.postseason]),
    );
    // Its NorCal–San Diego games gain their San Diego slugs.
    const gained = loaded.games.filter((g, i) => (g.home.slug ?? null) !== (committed.games[i].home.slug ?? null)
      || (g.away.slug ?? null) !== (committed.games[i].away.slug ?? null));
    expect(gained.length).toBeGreaterThan(0);
    for (const g of gained) expect([g.home.slug, g.away.slug].some((x) => x !== null && SOCAL_SLUGS.has(x)), g.contestId).toBe(true);
  });
});
