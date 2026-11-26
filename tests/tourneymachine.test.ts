/**
 * lib/sources/tourneymachine.ts and scripts/fetch-festival.ts — the 2026 National Hockey Festival's TourneyMachine
 * feed (DATA-SOURCES §1.16, DESIGN §35).
 *
 * `tests/fixtures/tourneymachine/tournament-results-2026-11-26T*.json` are three REAL captures of the whole-feed
 * endpoint on the first morning, trimmed to three of the eight divisions with every record of theirs kept as received
 * (tests/fixtures/tourneymachine/README.md says how): Adult 7v7 (one pool, no placement games), U-14 Girls 7v7 (one
 * pool, three placement games, B3 played before B2) and U-14 Girls 11v11 (four pools, ten crossovers in two bracket
 * columns). 15:11 and 15:18 UTC differ only by TourneyMachine re-randomizing every team's Color (no result in these
 * divisions changed between them); 15:35 has eight more results. `last-updated-2026-11-26T1535Z.json` is the
 * TournamentResultsLastUpdated body read with the 15:35 capture, narrow no-break space before PM and all.
 *
 * No test here touches the network or reads the clock: the script is driven through its `fetchImpl` seam.
 */

import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { displayTeamName } from '../lib/festival/festival-names';
import { FestivalFileSchema, festivalContentKey, type FestivalFile } from '../lib/festival/festival-schema';
import { POLITE_USER_AGENT } from '../lib/sources/http';
import {
  FEED_CLOCK_MARGIN_MS,
  FESTIVAL_INFO_URL,
  FESTIVAL_TIME_ZONE,
  FESTIVAL_TOURNAMENT_ID,
  bracketLayout,
  divisionLabels,
  cachedCopyVersion,
  feedIsCurrent,
  festivalCounts,
  lastUpdatedUrl,
  normalizeFestival,
  parseLastUpdated,
  publicResultsUrl,
  tmDate,
  tournamentResultsUrl,
  versionInstant,
  zoneOffset,
  type TmTournament,
} from '../lib/sources/tourneymachine';
import { stableStringify } from '../lib/stable-json';
import { main } from '../scripts/fetch-festival';
import { REPO, runScript } from './helpers';

const FIXTURES = path.join(REPO, 'tests', 'fixtures', 'tourneymachine');

/** One trimmed capture's body, as received. */
function body(stamp: '1511' | '1518' | '1535'): string {
  return readFileSync(path.join(FIXTURES, `tournament-results-2026-11-26T${stamp}Z.json`), 'utf8');
}

/** One trimmed capture, parsed (a fresh copy each call, so a test may edit it). */
function capture(stamp: '1511' | '1518' | '1535'): TmTournament {
  return JSON.parse(body(stamp)) as TmTournament;
}

const LAST_UPDATED_BODY = readFileSync(path.join(FIXTURES, 'last-updated-2026-11-26T1535Z.json'), 'utf8');
/** The live value: TourneyMachine prints a narrow no-break space (U+202F) before PM. */
const VERSION_1535 = 'v6_11/26/2026 3:26:47 PM';
/** The values read with the 15:11 and 15:18 captures (lu.json, lu2.json). */
const VERSION_1511 = 'v6_11/26/2026 3:11:37 PM';
const VERSION_1518 = 'v6_11/26/2026 3:13:00 PM';

const FETCHED_AT = '2026-11-26T15:35:57.588Z';
const normalize = (raw: unknown, sourceVersion = VERSION_1535, fetchedAt = FETCHED_AT): FestivalFile =>
  normalizeFestival(raw, { fetchedAt, sourceVersion });

const U14_7V7 = 14;
const U14_11V11 = 9;
const ADULT = 1;

describe('tourneymachine: endpoints and the version stamp', () => {
  it('builds the whole-feed, version and public results URLs for the festival', () => {
    expect(FESTIVAL_TOURNAMENT_ID).toBe('h20260601141424398b290c0851f3e4c');
    expect(tournamentResultsUrl(FESTIVAL_TOURNAMENT_ID)).toBe(
      'https://tourneymachine.com/Public/Service/JSON/TournamentResults.aspx?IDTournament=h20260601141424398b290c0851f3e4c&nofile=true',
    );
    expect(lastUpdatedUrl(FESTIVAL_TOURNAMENT_ID)).toBe(
      'https://tourneymachine.com/Public/Service/JSON/TournamentResultsLastUpdated.aspx?IDTournament=h20260601141424398b290c0851f3e4c',
    );
    expect(publicResultsUrl(FESTIVAL_TOURNAMENT_ID)).toBe(
      'https://tourneymachine.com/Public/Results/Tournament.aspx?IDTournament=h20260601141424398b290c0851f3e4c',
    );
    expect(FESTIVAL_INFO_URL).toBe('https://www.usafieldhockey.com/events/2026/november/26/festival');
    expect(FESTIVAL_TIME_ZONE).toBe('America/New_York');
  });

  it('reads the version as an opaque string, escaped slashes and narrow no-break space included', () => {
    expect(LAST_UPDATED_BODY).toContain('\\/');
    expect(parseLastUpdated(LAST_UPDATED_BODY)).toBe(VERSION_1535);
    expect(() => parseLastUpdated('""')).toThrow();
    expect(() => parseLastUpdated('<html>')).toThrow();
  });

  it('reads the version’s clock as UTC, whatever space sits before AM or PM', () => {
    expect(versionInstant(VERSION_1535)).toBe(Date.UTC(2026, 10, 26, 15, 26, 47));
    expect(versionInstant('v6_11/26/2026 3:26:47 PM')).toBe(Date.UTC(2026, 10, 26, 15, 26, 47));
    expect(versionInstant('v6_11/27/2026 12:05:00 AM')).toBe(Date.UTC(2026, 10, 27, 0, 5, 0));
    expect(versionInstant('v6_11/27/2026 12:05:00 PM')).toBe(Date.UTC(2026, 10, 27, 12, 5, 0));
    expect(versionInstant('v7_something else')).toBeNull();
  });

  it('calls a whole-feed read current only when its Last-Modified is more than the margin after the version', () => {
    // The cached copy seen on 2026-11-26 (served at age 82): made 15:17:21, after the 3:13:00 PM version but
    // before 3:26:47 PM.
    const cached = 'Thu, 26 Nov 2026 15:17:21 GMT';
    expect(feedIsCurrent(cached, VERSION_1518)).toBe(true);
    expect(feedIsCurrent(cached, VERSION_1535)).toBe(false);
    // Both stamps are cut to the second: a copy stamped the version's own second may have been made just before
    // the score went in, and one within the clocks' margin may be too. Stale, so the next run reads again.
    expect(FEED_CLOCK_MARGIN_MS).toBe(2_000);
    expect(feedIsCurrent('Thu, 26 Nov 2026 15:26:47 GMT', VERSION_1535)).toBe(false);
    expect(feedIsCurrent('Thu, 26 Nov 2026 15:26:49 GMT', VERSION_1535)).toBe(false);
    expect(feedIsCurrent('Thu, 26 Nov 2026 15:26:50 GMT', VERSION_1535)).toBe(true);
    // Unknowable counts as current: no header, an unparseable one, a version of another shape.
    expect(feedIsCurrent(null, VERSION_1535)).toBe(true);
    expect(feedIsCurrent('yesterday', VERSION_1535)).toBe(true);
    expect(feedIsCurrent(cached, 'v7_opaque')).toBe(true);
  });
});

describe('tourneymachine: pieces', () => {
  it('turns M/D/YYYY into a calendar day and refuses anything else', () => {
    expect(tmDate('11/26/2026')).toBe('2026-11-26');
    expect(tmDate('1/2/2027')).toBe('2027-01-02');
    expect(() => tmDate('2026-11-26')).toThrow('not a M/D/YYYY date');
  });

  it('finds the venue’s UTC offset at a wall-clock time', () => {
    expect(zoneOffset('2026-11-26T08:00:00', FESTIVAL_TIME_ZONE)).toBe('-05:00');
    expect(zoneOffset('2026-11-28T14:00:00', FESTIVAL_TIME_ZONE)).toBe('-05:00');
    expect(zoneOffset('2026-07-01T12:00:00', FESTIVAL_TIME_ZONE)).toBe('-04:00');
  });

  it('labels the eight divisions from their feed names, in display order, whatever order they come in', () => {
    const feed = [
      { key: 1, name: 'Adult 7v7' },
      { key: 3, name: 'U-10 Co-Ed 7v7' },
      { key: 5, name: 'U-12 Co-Ed 7v7' },
      { key: 9, name: 'U-14 Girls 11v11' },
      { key: 14, name: 'U-14 Girls 7v7' },
      { key: 16, name: 'U-16 Girls 11v11' },
      { key: 22, name: 'U-19 Girls 11v11' },
      { key: 29, name: 'U14 Co-Ed 7v7' },
    ];
    const expected = [
      [3, 'u10', 'U10', '7v7'],
      [5, 'u12', 'U12', '7v7'],
      [29, 'u14-coed', 'U14 Co-Ed', '7v7'],
      [14, 'u14-7v7', 'U14 7v7', '7v7'],
      [9, 'u14-11v11', 'U14 11v11', '11v11'],
      [16, 'u16', 'U16', '11v11'],
      [22, 'u19', 'U19', '11v11'],
      [1, 'adult', 'Adult', '7v7'],
    ];
    const labels = (rows: typeof feed) => divisionLabels(rows).map((d) => [d.key, d.slug, d.short, d.format]);
    expect(labels(feed)).toEqual(expected);
    expect(labels([...feed].reverse())).toEqual(expected);
  });

  it('refuses a response whose division lists a game the dictionary lacks', () => {
    const raw = structuredClone(capture('1535')) as unknown as { GameDictionary: Record<string, unknown> };
    const [key] = Object.keys(raw.GameDictionary);
    delete raw.GameDictionary[key];
    expect(() => normalize(raw)).toThrow(`game ${key} is listed by division`);
  });

  it('refuses a division with no format or no age group', () => {
    expect(() => divisionLabels([{ key: 2, name: 'U-12 Girls' }])).toThrow('names no 11v11 or 7v7 format');
    expect(() => divisionLabels([{ key: 2, name: 'Masters 11v11' }])).toThrow('names no age group');
  });

  it('clusters bracket boxes into columns (330 and 335 are one) and ranks each column top to bottom', () => {
    const layout = bracketLayout([
      { key: 10, lp: 335, tp: 245 },
      { key: 11, lp: 0, tp: 165 },
      { key: 12, lp: 330, tp: 85 },
      { key: 13, lp: 0, tp: 85 },
      { key: 14, lp: 335, tp: 165 },
    ]);
    expect(Object.fromEntries(layout)).toEqual({
      13: { column: 0, row: 0 },
      11: { column: 0, row: 1 },
      12: { column: 1, row: 0 },
      14: { column: 1, row: 1 },
      10: { column: 1, row: 2 },
    });
  });
});

describe('normalizeFestival: the 15:35 capture', () => {
  const raw = capture('1535');
  const file = normalize(raw);
  const poolName = new Map(file.divisions.flatMap((d) => d.pools.map((p) => [p.id, p.name] as const)));
  /** team hex → its pool's hex, from the feed's own pool membership. */
  const rawPoolOf = new Map(Object.values(raw.PoolDictionary).flatMap((p) => p.IDTeams.map((t) => [t, p.IDPool] as const)));

  it('holds to the festival contract', () => {
    expect(FestivalFileSchema.safeParse(file).success).toBe(true);
    expect(festivalCounts(file)).toEqual({ games: 69, finals: 10 });
  });

  it('keeps the tournament, the venue and the stamps it was given', () => {
    expect(file.fetchedAt).toBe(FETCHED_AT);
    expect(file.sourceVersion).toBe(VERSION_1535);
    expect(file.tournament).toEqual({
      id: 'h20260601141424398b290c0851f3e4c',
      name: '2026 National Hockey Festival',
      startDate: '2026-11-26',
      endDate: '2026-11-28',
      timeZone: 'America/New_York',
      utcOffset: '-05:00',
      venue: {
        name: 'Paradise Coast Sports Complex',
        address: '3940 City Gate Blvd N',
        city: 'Naples',
        state: 'FL',
        zip: '34117',
        lat: 26.166685522399,
        lng: -81.670732498169,
      },
      resultsUrl: publicResultsUrl(FESTIVAL_TOURNAMENT_ID),
      infoUrl: FESTIVAL_INFO_URL,
    });
  });

  it('orders the fields by the number in their name, not the feed’s order', () => {
    const feedOrder = Object.values(raw.FacilityDictionary).map((f) => f.Name);
    const natural = Array.from({ length: 12 }, (_, i) => `Field ${i + 1}`);
    expect(feedOrder).not.toEqual(natural);
    expect(file.fields.map((f) => f.name)).toEqual(natural);
    expect(file.fields.map((f) => f.number)).toEqual(natural.map((_, i) => i + 1));
    expect(new Set(file.fields.map((f) => f.id))).toEqual(new Set(Object.keys(raw.FacilityDictionary)));
  });

  it('keeps each division’s integer key, feed name and bracket page, in display order', () => {
    expect(file.divisions.map((d) => [d.key, d.slug, d.short, d.format, d.name])).toEqual([
      [U14_7V7, 'u14-7v7', 'U14 7v7', '7v7', 'U-14 Girls 7v7'],
      [U14_11V11, 'u14-11v11', 'U14 11v11', '11v11', 'U-14 Girls 11v11'],
      [ADULT, 'adult', 'Adult', '7v7', 'Adult 7v7'],
    ]);
    for (const d of file.divisions) expect(d.bracketUrl).toBe(raw.DivisionDictionary[String(d.key)].BracketWebPage);
  });

  it('orders pools by name and keeps each pool’s teams in TourneyMachine’s order (its rank; full ties alphabetical)', () => {
    expect(file.divisions.map((d) => d.pools.map((p) => p.name))).toEqual([['Pool F'], ['Pool G', 'Pool H', 'Pool I', 'Pool J'], ['Pool V']]);
    const rawPools = new Map(Object.values(raw.PoolDictionary).map((p) => [p.IDPool, p.IDTeams]));
    for (const d of file.divisions) for (const p of d.pools) expect(p.teamIds, p.name).toEqual(rawPools.get(p.id));
  });

  it('keeps every team under its hex id with its feed name as printed (displayTeamName), its pool and its pool record, and drops Color', () => {
    expect(new Set(file.teams.map((t) => t.id))).toEqual(new Set(Object.keys(raw.TeamDictionary)));
    for (const t of file.teams) {
      const r = raw.TeamDictionary[t.id];
      expect(Object.keys(t).sort()).toEqual(['divisionKey', 'id', 'name', 'poolId', 'record', 'slug']);
      expect(t.name).toBe(displayTeamName(r.Name));
      expect(t.divisionKey).toBe(r.IDDivision);
      expect(t.poolId).toBe(rawPoolOf.get(t.id));
      expect(t.record).toEqual({
        w: r.WinsPool,
        l: r.LossesPool,
        t: r.TiesPool,
        pts: r.PointsPool,
        gf: r.ScoreForPool,
        ga: r.ScoreAgainstPool,
        gd: r.ScoreDifferentialPool,
      });
    }
    const text = JSON.stringify(file);
    expect(text).not.toContain('Color');
    for (const r of Object.values(raw.TeamDictionary)) expect(text).not.toContain(String(r.Color));
  });

  it('slugs a team by its division and its name without age tokens', () => {
    const slug = (name: string) => file.teams.find((t) => t.name === name)?.slug;
    expect(slug('AGH U14 1')).toBe('u14-11v11-agh-1');
    expect(slug('U14 Gateway Red Stars')).toBe('u14-11v11-gateway-red-stars');
    expect(slug('Cowtown Field Hockey Club U14')).toBe('u14-7v7-cowtown-field-hockey-club');
    expect(slug('Stars')).toBe('adult-stars');
    for (const t of file.teams) {
      expect(t.slug).toMatch(/^[a-z0-9-]+$/);
      expect(t.slug.startsWith(`${file.divisions.find((d) => d.key === t.divisionKey)!.slug}-`), t.slug).toBe(true);
    }
  });

  it('gives a colliding team slug -2, by team id order', () => {
    const edited = capture('1535');
    const [a, b] = Object.entries(edited.TeamDictionary)
      .filter(([, t]) => t.Name === 'Texas Pride Red' || t.Name === 'Texas Pride White')
      .map(([id]) => id)
      .sort();
    edited.TeamDictionary[a].Name = 'Texas Pride Red';
    edited.TeamDictionary[b].Name = 'Texas Pride Red U14';
    const teams = normalize(edited).teams;
    expect(teams.find((t) => t.id === a)!.slug).toBe('u14-11v11-texas-pride-red');
    expect(teams.find((t) => t.id === b)!.slug).toBe('u14-11v11-texas-pride-red-2');
  });

  it('keeps every game under its integer key, in the division whose IDGames lists it, on its field and at its time', () => {
    expect(file.games.map((g) => g.key).sort((x, y) => x - y)).toEqual(Object.keys(raw.GameDictionary).map(Number));
    const divisionOf = new Map(Object.entries(raw.DivisionDictionary).flatMap(([k, d]) => d.IDGames.map((g) => [g, Number(k)] as const)));
    for (const g of file.games) {
      const r = raw.GameDictionary[String(g.key)];
      expect(g.divisionKey).toBe(divisionOf.get(g.key));
      expect(g.number).toBe(r.GN);
      expect(g.fieldId).toBe(r.IDF);
      expect(g.start).toBe(r.S);
      expect(Date.parse(g.startUtc) - Date.parse(`${r.S}Z`)).toBe(5 * 3_600_000);
      expect(g.sides.map((s) => [s.teamId ?? '', s.label])).toEqual([
        [r.IDT1, displayTeamName(r.T1)],
        [r.IDT2, displayTeamName(r.T2)],
      ]);
      expect(g.kind).toBe(r.BR ? 'placement' : 'pool');
      if (g.kind === 'pool') expect(g.poolId).toBe(rawPoolOf.get(r.IDT1));
    }
  });

  it('sorts games by start, then field number, then key', () => {
    const fieldNumber = new Map(file.fields.map((f) => [f.id, f.number]));
    const order = file.games.map((g) => [g.startUtc, fieldNumber.get(g.fieldId)!, g.key] as const);
    const sorted = [...order].sort((x, y) => x[0].localeCompare(y[0]) || x[1] - y[1] || x[2] - y[2]);
    expect(order).toEqual(sorted);
  });

  it('gives a score only when the game is final or scoring has started', () => {
    for (const g of file.games) {
      const r = raw.GameDictionary[String(g.key)];
      expect(g.score, g.number).toEqual(r.F || r.I ? [r.S1, r.S2] : null);
      expect(g.status).toBe(r.F ? 'final' : 'scheduled');
    }
    // A 1-1 final is a score, not a placeholder: P1 Meerkats Field Hockey v Blue Star Warriors.
    const tie = file.games.find((g) => g.divisionKey === U14_7V7 && g.number === 'P1')!;
    expect([tie.status, tie.score]).toEqual(['final', [1, 1]]);
  });

  it('reads I without F as live, and ignores S1/S2 on a game with neither', () => {
    const edited = capture('1535');
    const keys = file.games.filter((g) => g.status === 'scheduled' && g.kind === 'pool').map((g) => String(g.key));
    Object.assign(edited.GameDictionary[keys[0]], { I: true, F: false, S1: 1, S2: 0 });
    Object.assign(edited.GameDictionary[keys[1]], { I: false, F: false, S1: 3, S2: 2 });
    const games = new Map(normalize(edited).games.map((g) => [String(g.key), g]));
    expect([games.get(keys[0])!.status, games.get(keys[0])!.score]).toEqual(['live', [1, 0]]);
    expect([games.get(keys[1])!.status, games.get(keys[1])!.score]).toEqual(['scheduled', null]);
  });

  it('marks a game with an exhibition team', () => {
    expect(file.games.some((g) => g.exhibition)).toBe(false);
    const edited = capture('1535');
    const key = String(file.games[0].key);
    edited.GameDictionary[key].Team2Exhibition = true;
    expect(normalize(edited).games.find((g) => String(g.key) === key)!.exhibition).toBe(true);
  });

  it('feeds every placement game from two pool places, with no pool and no team until TourneyMachine names one', () => {
    const placement = file.games.filter((g) => g.kind === 'placement');
    expect(placement).toHaveLength(13);
    for (const g of placement) {
      expect(g.poolId).toBeNull();
      expect(g.start.slice(0, 10)).toBe('2026-11-28');
      for (const s of g.sides) {
        expect(s.teamId).toBeNull();
        expect(s.label).toBe(`${poolName.get(s.source!.poolId)} ${['1st', '2nd', '3rd', '4th', '5th'][s.source!.place - 1]} Place`);
      }
    }
    for (const g of file.games.filter((x) => x.kind === 'pool')) expect([g.layout, ...g.sides.map((s) => s.source)]).toEqual([null, null, null]);
  });

  /** A division's placement games by bracket column, top to bottom: 'B1 Pool G 1 v Pool H 1'. */
  function columns(divisionKey: number): string[][] {
    const games = file.games.filter((g) => g.divisionKey === divisionKey && g.kind === 'placement');
    const count = Math.max(...games.map((g) => g.layout!.column)) + 1;
    return Array.from({ length: count }, (_, c) =>
      games
        .filter((g) => g.layout!.column === c)
        .sort((x, y) => x.layout!.row - y.layout!.row)
        .map((g) => `${g.number} ${g.sides.map((s) => `${poolName.get(s.source!.poolId)} ${s.source!.place}`).join(' v ')}`),
    );
  }

  it('lays the U14 11v11 crossovers out in TourneyMachine’s two columns, G/H then I/J, by place', () => {
    expect(columns(U14_11V11)).toEqual([
      ['B1 Pool G 1 v Pool H 1', 'B8 Pool G 2 v Pool H 2', 'B7 Pool G 3 v Pool H 3', 'B6 Pool G 4 v Pool H 4', 'B9 Pool G 5 v Pool H 5'],
      ['B5 Pool I 1 v Pool J 1', 'B4 Pool I 2 v Pool J 2', 'B3 Pool I 3 v Pool J 3', 'B2 Pool I 4 v Pool J 4', 'B10 Pool I 5 v Pool J 5'],
    ]);
  });

  it('lays the U14 7v7 placement games out in one column, where 4th place plays twice and B3 comes before B2', () => {
    expect(columns(U14_7V7)).toEqual([['B1 Pool F 1 v Pool F 2', 'B2 Pool F 3 v Pool F 4', 'B3 Pool F 4 v Pool F 5']]);
    const start = (n: string) => file.games.find((g) => g.divisionKey === U14_7V7 && g.number === n)!.start;
    expect([start('B3'), start('B1'), start('B2')]).toEqual(['2026-11-28T10:00:00', '2026-11-28T11:00:00', '2026-11-28T12:00:00']);
    expect(columns(ADULT)).toEqual([]);
  });

  it('takes a placement game’s team once TourneyMachine names it, and keeps the source', () => {
    const edited = capture('1535');
    const b1 = file.games.find((g) => g.divisionKey === U14_7V7 && g.number === 'B1')!;
    const first = file.divisions[0].pools[0].teamIds[0];
    Object.assign(edited.GameDictionary[String(b1.key)], { IDT1: first, T1: raw.TeamDictionary[first].Name });
    const side = normalize(edited).games.find((g) => g.key === b1.key)!.sides[0];
    expect(side).toEqual({ teamId: first, label: raw.TeamDictionary[first].Name, source: b1.sides[0].source });
  });

  it('gives the same file for the same feed, whatever order its dictionaries and lists come in', () => {
    expect(stableStringify(normalize(capture('1535')))).toBe(stableStringify(file));
    const shuffled = capture('1535');
    const reversed = <T>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).reverse());
    shuffled.TeamDictionary = reversed(shuffled.TeamDictionary);
    shuffled.FacilityDictionary = reversed(shuffled.FacilityDictionary);
    shuffled.IDDivisions = [...shuffled.IDDivisions].reverse();
    for (const d of Object.values(shuffled.DivisionDictionary)) d.IDPools = [...d.IDPools].reverse();
    expect(stableStringify(normalize(shuffled))).toBe(stableStringify(file));
  });
});

describe('normalizeFestival: a feed it cannot read faithfully is refused', () => {
  const someGame = (raw: TmTournament, br: boolean) => Object.entries(raw.GameDictionary).find(([, g]) => g.BR === br)!;

  it('names a pool game between two pools', () => {
    const raw = capture('1535');
    const [key, g] = someGame(raw, false);
    const stranger = Object.values(raw.PoolDictionary).find((p) => !p.IDTeams.includes(g.IDT1) && p.IDDivision === raw.TeamDictionary[g.IDT1].IDDivision)!;
    g.IDT2 = stranger.IDTeams[0];
    expect(() => normalize(raw)).toThrow(`tourneymachine: game ${key} (${g.GN}) is not between two teams of one pool`);
  });

  it('names a placement game not fed from a pool place', () => {
    const raw = capture('1535');
    const [key, g] = someGame(raw, true);
    g.BT1S = '';
    expect(() => normalize(raw)).toThrow(`tourneymachine: game ${key} (${g.GN}) is not fed from a pool place`);
  });

  it('names a game on a field the feed does not list, and a game in no division', () => {
    const raw = capture('1535');
    const [key, g] = someGame(raw, false);
    g.IDF = 'hnofield';
    expect(() => normalize(raw)).toThrow(`game ${key} (${g.GN}) is on field hnofield, which is not in FacilityDictionary`);
    const orphan = capture('1535');
    for (const d of Object.values(orphan.DivisionDictionary)) d.IDGames = d.IDGames.filter((k) => String(k) !== key);
    expect(() => normalize(orphan)).toThrow(`game ${key} (${g.GN}) is in no division`);
  });

  it('names a team in no pool', () => {
    const raw = capture('1535');
    const pool = Object.values(raw.PoolDictionary)[0];
    const dropped = pool.IDTeams.pop()!;
    expect(() => normalize(raw)).toThrow(`(${dropped}) is in no pool`);
  });
});

describe('festivalContentKey: what counts as a change', () => {
  it('sees TourneyMachine’s Color churn as no change: 15:11 and 15:18 carry the same results', () => {
    const [early, late] = [capture('1511'), capture('1518')];
    const recoloured = Object.keys(early.TeamDictionary).filter((id) => early.TeamDictionary[id].Color !== late.TeamDictionary[id].Color);
    expect(recoloured.length).toBeGreaterThan(Object.keys(early.TeamDictionary).length / 2);
    expect(body('1511')).not.toBe(body('1518'));
    const a = normalize(early, VERSION_1518, '2026-11-26T15:11:00.000Z');
    const b = normalize(late, VERSION_1518, '2026-11-26T15:18:43.000Z');
    expect(festivalContentKey(a)).toBe(festivalContentKey(b));
  });

  it('sees new results as a change: 15:18 to 15:35', () => {
    const b = normalize(capture('1518'), VERSION_1535);
    const c = normalize(capture('1535'), VERSION_1535);
    expect(festivalCounts(b).finals).toBeLessThan(festivalCounts(c).finals);
    expect(festivalContentKey(b)).not.toBe(festivalContentKey(c));
  });

  it('ignores fetchedAt and nothing else, sourceVersion included', () => {
    const base = normalize(capture('1535'));
    const edit = (change: (f: FestivalFile) => void) => {
      const copy = structuredClone(base);
      change(copy);
      return festivalContentKey(copy);
    };
    const key = festivalContentKey(base);
    expect(edit((f) => (f.fetchedAt = '2026-11-27T00:00:00.000Z'))).toBe(key);
    // A version bump commits even with nothing else new, so the next run's version check sees it.
    expect(edit((f) => (f.sourceVersion = VERSION_1511))).not.toBe(key);
    expect(edit((f) => (f.games[0].score = [9, 9]))).not.toBe(key);
    expect(edit((f) => (f.teams[0].record.pts += 1))).not.toBe(key);
    expect(edit((f) => f.divisions[1].pools[0].teamIds.reverse())).not.toBe(key);
  });
});

describe('scripts/fetch-festival.ts', () => {
  let dir: string;
  let out: string;
  let lines: string[];

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'scvalfh-festival-'));
    out = path.join(dir, 'festival.json');
    lines = [];
    const keep = (...args: unknown[]) => void lines.push(args.map(String).join(' '));
    vi.spyOn(console, 'log').mockImplementation(keep);
    vi.spyOn(console, 'warn').mockImplementation(keep);
    vi.spyOn(console, 'error').mockImplementation(keep);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** TourneyMachine as the script sees it: the version body and the feed body, and every request made. */
  function upstream(opts: { feed: string; lastModified?: string | null }) {
    const calls: Array<{ url: string; userAgent: string | undefined }> = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, userAgent: (init?.headers as Record<string, string> | undefined)?.['user-agent'] });
      if (url === lastUpdatedUrl(FESTIVAL_TOURNAMENT_ID)) return new Response(LAST_UPDATED_BODY);
      if (url === tournamentResultsUrl(FESTIVAL_TOURNAMENT_ID)) {
        const lastModified = opts.lastModified === undefined ? 'Thu, 26 Nov 2026 15:35:30 GMT' : opts.lastModified;
        return new Response(opts.feed, { headers: lastModified === null ? {} : { 'last-modified': lastModified } });
      }
      return new Response('not found', { status: 404 });
    }) as typeof fetch;
    return { fetchImpl, calls };
  }

  /** A committed file to start from. */
  function commit(file: FestivalFile): string {
    const text = stableStringify(file);
    writeFileSync(out, text, 'utf8');
    return text;
  }

  it('stops after the ~30-byte version check when the committed file has that version', async () => {
    const before = commit(normalize(capture('1535')));
    const { fetchImpl, calls } = upstream({ feed: body('1535') });
    expect(await main(['--out', out], fetchImpl)).toBe(0);
    expect(calls.map((c) => c.url)).toEqual([lastUpdatedUrl(FESTIVAL_TOURNAMENT_ID)]);
    expect(lines.join('\n')).toContain(`unchanged upstream (${VERSION_1535}, as of ${FETCHED_AT})`);
    expect(readFileSync(out, 'utf8')).toBe(before);
  });

  it('reads a new version, and writes the normalized file with the polite User-Agent on every request', async () => {
    commit(normalize(capture('1518'), VERSION_1518));
    const { fetchImpl, calls } = upstream({ feed: body('1535') });
    expect(await main(['--out', out, '--fetched-at', FETCHED_AT], fetchImpl)).toBe(0);
    expect(calls.map((c) => c.url)).toEqual([lastUpdatedUrl(FESTIVAL_TOURNAMENT_ID), tournamentResultsUrl(FESTIVAL_TOURNAMENT_ID)]);
    expect(calls.every((c) => c.userAgent === POLITE_USER_AGENT)).toBe(true);
    expect(readFileSync(out, 'utf8')).toBe(stableStringify(normalize(capture('1535'))));
    expect(lines.join('\n')).toContain('3 divisions, 28 teams, 10 of 69 games final');
  });

  it('writes nothing on --dry-run', async () => {
    const { fetchImpl, calls } = upstream({ feed: body('1535') });
    expect(await main(['--out', out, '--dry-run'], fetchImpl)).toBe(0);
    expect(calls).toHaveLength(2);
    expect(lines.join('\n')).toContain('dry run: nothing written');
    expect(existsSync(out)).toBe(false);
  });

  it('reads on --force, and leaves a file with the same content in place', async () => {
    const before = commit(normalize(capture('1535')));
    const { fetchImpl, calls } = upstream({ feed: body('1535') });
    expect(await main(['--out', out, '--force', '--fetched-at', '2026-11-26T15:40:00.000Z'], fetchImpl)).toBe(0);
    expect(calls).toHaveLength(2);
    expect(lines.join('\n')).toContain(`no change since ${FETCHED_AT}`);
    expect(readFileSync(out, 'utf8')).toBe(before);
  });

  it('keeps the committed version when the feed read is a cached copy older than the new version', async () => {
    commit(normalize(capture('1518'), VERSION_1518));
    const { fetchImpl } = upstream({ feed: body('1535'), lastModified: 'Thu, 26 Nov 2026 15:17:21 GMT' });
    expect(await main(['--out', out, '--fetched-at', FETCHED_AT], fetchImpl)).toBe(0);
    expect(lines.join('\n')).toContain('is a cached copy from Thu, 26 Nov 2026 15:17:21 GMT');
    const written = FestivalFileSchema.parse(JSON.parse(readFileSync(out, 'utf8')));
    // Stamped with the copy's own time, never a real version, so the next run reads the feed again.
    expect(written.sourceVersion).toBe('cached_11/26/2026 3:17:21 PM');
    expect(written.sourceVersion).not.toBe(VERSION_1535);
    expect(festivalCounts(written).finals).toBe(10);
  });

  it('never lets an older cached copy replace a newer one written before it (copies out of order)', async () => {
    commit(normalize(capture('1518'), VERSION_1518));
    // First a copy made 15:20:00 (the 3:26:47 PM results, but older than that version): written, stamped 3:20:00 PM.
    const newer = upstream({ feed: body('1535'), lastModified: 'Thu, 26 Nov 2026 15:20:00 GMT' });
    expect(await main(['--out', out, '--fetched-at', FETCHED_AT], newer.fetchImpl)).toBe(0);
    const afterNewer = readFileSync(out, 'utf8');
    expect(FestivalFileSchema.parse(JSON.parse(afterNewer)).sourceVersion).toBe('cached_11/26/2026 3:20:00 PM');
    // Then a copy made 15:17:21 with older results: after the committed 3:13:00 PM version, but before what was
    // published from the first copy, so the file is kept whole.
    const older = upstream({ feed: body('1518'), lastModified: 'Thu, 26 Nov 2026 15:17:21 GMT' });
    expect(await main(['--out', out, '--fetched-at', '2026-11-26T15:41:00.000Z'], older.fetchImpl)).toBe(0);
    expect(lines.join('\n')).toContain('the committed file is kept as it is');
    expect(readFileSync(out, 'utf8')).toBe(afterNewer);
  });

  it('writes a cached copy\'s version in TourneyMachine\'s format, which versionInstant reads back', () => {
    const v = cachedCopyVersion('Thu, 26 Nov 2026 00:05:09 GMT')!;
    expect(v).toBe('cached_11/26/2026 12:05:09 AM');
    expect(versionInstant(v)).toBe(Date.parse('2026-11-26T00:05:09Z'));
    expect(cachedCopyVersion(null)).toBeNull();
    expect(cachedCopyVersion('not a date')).toBeNull();
  });

  it('keeps the committed file whole when a forced read is a cached copy no newer than it', async () => {
    // The committed file holds the 3:26:47 PM results; a --force run is served the 3:13:00 PM-era copy (made 15:17:21,
    // before 3:26:47). Writing it would put the older results under the committed version, which the next ordinary
    // run would then skip.
    const before = commit(normalize(capture('1535')));
    const older = upstream({ feed: body('1518'), lastModified: 'Thu, 26 Nov 2026 15:17:21 GMT' });
    expect(await main(['--out', out, '--force', '--fetched-at', '2026-11-26T15:40:00.000Z'], older.fetchImpl)).toBe(0);
    expect(lines.join('\n')).toContain('the committed file is kept as it is');
    expect(readFileSync(out, 'utf8')).toBe(before);
    // And the next ordinary run, seeing the committed version upstream, leaves it alone.
    const again = upstream({ feed: body('1518') });
    expect(await main(['--out', out], again.fetchImpl)).toBe(0);
    expect(readFileSync(out, 'utf8')).toBe(before);
  });

  it('saves both bodies as received on --capture', async () => {
    const saved = path.join(dir, 'capture');
    const { fetchImpl } = upstream({ feed: body('1535') });
    expect(await main(['--out', out, '--capture', saved, '--fetched-at', FETCHED_AT], fetchImpl)).toBe(0);
    expect(readFileSync(path.join(saved, 'last-updated.json'), 'utf8')).toBe(`${LAST_UPDATED_BODY.trimEnd()}\n`);
    expect(readFileSync(path.join(saved, 'tournament-results.json'), 'utf8')).toBe(body('1535'));
  });

  it('refuses an unknown flag', async () => {
    await expect(main(['--nope'], upstream({ feed: '' }).fetchImpl)).rejects.toThrow('unknown flag --nope');
  });

  it('has nothing to fetch in another sport’s build, and asks nothing of the network there', () => {
    const run = runScript('scripts/fetch-festival.ts', ['--out', out], { env: { ...process.env, SCVAL_SPORT: 'soccer' } });
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('there is nothing to fetch. Nothing written.');
    expect(existsSync(out)).toBe(false);
  });
});
