/**
 * data/field-hockey/festival.json (DESIGN §35, DATA-SOURCES §1.16): the committed file validates and every join
 * holds; lib/festival/festival.ts serves it in the orders the routes use; and a bad file — built in memory from the
 * real one, never written to disk — is refused with a message that names what is wrong.
 *
 * The refresh job (.github/workflows/update-data-festival.yml) runs this file before it commits a new read, so
 * nothing here may depend on how far the event has got: no count of final games, no "a scheduled game exists".
 * What it asserts holds from the first slot to the last (the divisions and their slugs are fixed for the event).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  FESTIVAL_GAME_MINUTES,
  festivalDivisionSlugs,
  festivalSlots,
  festivalTeamSlugs,
  getFestival,
  loadFestival,
} from '../lib/festival/festival';
import { FESTIVAL_RESERVED_SLUGS, displayTeamName } from '../lib/festival/festival-names';
import { FestivalFileSchema, type FestivalFile } from '../lib/festival/festival-schema';
import { stableStringify } from '../lib/stable-json';
import { REPO } from './helpers';

const FILE = path.join(REPO, 'data', 'field-hockey', 'festival.json');
const text = readFileSync(FILE, 'utf8');
const raw = JSON.parse(text) as FestivalFile;

function bad(edit: (f: FestivalFile) => void): () => FestivalFile {
  const copy = structuredClone(raw);
  edit(copy);
  return () => loadFestival(copy);
}

const teams = new Map(raw.teams.map((t) => [t.id, t]));
const pools = new Map(raw.divisions.flatMap((d) => d.pools.map((p) => [p.id, { ...p, divisionKey: d.key }] as const)));
const fieldNumber = new Map(raw.fields.map((f) => [f.id, f.number]));

describe('data/field-hockey/festival.json', () => {
  it('validates, is committed in canonical form, and is what the loader serves', () => {
    expect(FestivalFileSchema.safeParse(raw).success).toBe(true);
    expect(stableStringify(raw)).toBe(text);
    expect(loadFestival(raw)).toEqual(raw);
    expect(getFestival()).toEqual(raw);
  });

  it('is the 2026 National Hockey Festival in Naples, Nov 26–28, on Eastern Standard Time', () => {
    const t = raw.tournament;
    expect([t.id, t.name, t.startDate, t.endDate, t.timeZone, t.utcOffset]).toEqual([
      'h20260601141424398b290c0851f3e4c',
      '2026 National Hockey Festival',
      '2026-11-26',
      '2026-11-28',
      'America/New_York',
      '-05:00',
    ]);
    expect([t.venue.name, t.venue.city, t.venue.state]).toEqual(['Paradise Coast Sports Complex', 'Naples', 'FL']);
    expect(t.resultsUrl).toBe('https://tourneymachine.com/Public/Results/Tournament.aspx?IDTournament=h20260601141424398b290c0851f3e4c');
    expect(t.infoUrl).toBe('https://www.usafieldhockey.com/events/2026/november/26/festival');
  });

  it('cites only https pages', () => {
    for (const url of [raw.tournament.resultsUrl, raw.tournament.infoUrl, ...raw.divisions.map((d) => d.bracketUrl)]) {
      if (url !== null) expect(url.startsWith('https://'), url).toBe(true);
    }
  });

  it('has the eight divisions, in display order, none of them named like a static /festival route', () => {
    expect(raw.divisions.map((d) => d.slug)).toEqual(['u10', 'u12', 'u14-coed', 'u14-7v7', 'u14-11v11', 'u16', 'u19', 'adult']);
    expect(raw.divisions.map((d) => d.short)).toEqual(['U10', 'U12', 'U14 Co-Ed', 'U14 7v7', 'U14 11v11', 'U16', 'U19', 'Adult']);
    expect(festivalDivisionSlugs()).toEqual(raw.divisions.map((d) => d.slug));
    for (const d of raw.divisions) expect(FESTIVAL_RESERVED_SLUGS).not.toContain(d.slug);
  });

  it('numbers the fields in order, each named by its number', () => {
    expect(raw.fields.length).toBeGreaterThan(0);
    raw.fields.forEach((f, i) => {
      expect(f.number).toBe(i + 1);
      expect(f.name).toBe(`Field ${f.number}`);
    });
  });

  it('puts every team in one pool of its own division, under a unique slug that starts with that division’s', () => {
    const divisionSlug = new Map(raw.divisions.map((d) => [d.key, d.slug]));
    expect(new Set(raw.teams.map((t) => t.slug)).size).toBe(raw.teams.length);
    expect(festivalTeamSlugs()).toEqual(raw.teams.map((t) => t.slug));
    for (const t of raw.teams) {
      expect(t.slug).toMatch(/^[a-z0-9-]+$/);
      expect(t.slug.startsWith(`${divisionSlug.get(t.divisionKey)}-`), t.slug).toBe(true);
      expect(pools.get(t.poolId)?.divisionKey, t.name).toBe(t.divisionKey);
      expect([...pools.values()].filter((p) => p.teamIds.includes(t.id)).map((p) => p.id), t.name).toEqual([t.poolId]);
    }
    for (const p of pools.values()) expect(p.teamIds.every((id) => teams.has(id)), p.name).toBe(true);
  });

  it('has no team that has played more pool games than its pool gives it', () => {
    for (const t of raw.teams) {
      const scheduled = raw.games.filter((g) => g.poolId === t.poolId && g.sides.some((s) => s.teamId === t.id)).length;
      expect(t.record.w + t.record.l + t.record.t, t.name).toBeLessThanOrEqual(scheduled);
    }
  });

  it('plays every pool game between two teams of its pool, and feeds every placement game from two pool places of its division', () => {
    for (const g of raw.games) {
      const where = `${g.divisionKey}/${g.number}`;
      expect(fieldNumber.has(g.fieldId), where).toBe(true);
      for (const s of g.sides) if (s.teamId !== null) expect(teams.get(s.teamId)?.divisionKey, where).toBe(g.divisionKey);
      if (g.kind === 'pool') {
        expect(g.layout, where).toBeNull();
        for (const s of g.sides) {
          expect(s.source, where).toBeNull();
          expect(pools.get(g.poolId!)!.teamIds, where).toContain(s.teamId);
        }
      } else {
        expect(g.poolId, where).toBeNull();
        expect(g.layout, where).not.toBeNull();
        for (const s of g.sides) {
          const pool = pools.get(s.source!.poolId)!;
          expect(pool.divisionKey, where).toBe(g.divisionKey);
          expect(s.source!.place, where).toBeLessThanOrEqual(pool.teamIds.length);
        }
      }
    }
    expect(raw.games.some((g) => g.kind === 'placement')).toBe(true);
  });

  it('times every game on an event day, five hours behind UTC, in (start, field, key) order', () => {
    for (const g of raw.games) {
      expect(g.start.slice(0, 10) >= raw.tournament.startDate && g.start.slice(0, 10) <= raw.tournament.endDate, g.start).toBe(true);
      expect(Date.parse(g.startUtc) - Date.parse(`${g.start}Z`)).toBe(5 * 3_600_000);
    }
    const order = raw.games.map((g) => [g.startUtc, fieldNumber.get(g.fieldId)!, g.key] as const);
    expect(order).toEqual([...order].sort((a, b) => a[0].localeCompare(b[0]) || a[1] - b[1] || a[2] - b[2]));
  });

  it('gives a score exactly to the games that are live or final', () => {
    for (const g of raw.games) expect(g.score === null, `${g.divisionKey}/${g.number}`).toBe(g.status === 'scheduled');
  });

  it('groups the games into time slots that each end 55 minutes after they start', () => {
    const slots = festivalSlots(raw);
    expect(FESTIVAL_GAME_MINUTES).toBe(55);
    expect(slots.reduce((n, s) => n + s.games, 0)).toBe(raw.games.length);
    expect(slots.map((s) => s.startUtc)).toEqual([...new Set(raw.games.map((g) => g.startUtc))].sort());
    for (const s of slots) {
      expect(Date.parse(s.endUtc) - Date.parse(s.startUtc)).toBe(55 * 60_000);
      expect(s.endUtc).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00Z$/);
      expect(raw.games.find((g) => g.startUtc === s.startUtc)!.start).toBe(s.start);
    }
  });
});

describe('a bad festival file is refused', () => {
  const placement = raw.games.findIndex((g) => g.kind === 'placement');

  it('names a duplicate team slug and a duplicate game key', () => {
    expect(bad((f) => (f.fetchedAt = '2026-02-30T12:00:00Z'))).toThrow('not a real UTC time');
    expect(bad((f) => (f.fetchedAt = '2026-11-26T25:00:00.000Z'))).toThrow('not a real UTC time');
    expect(bad((f) => (f.teams[1].slug = f.teams[0].slug))).toThrow(`duplicate team slug ${raw.teams[0].slug}`);
    expect(bad((f) => (f.games[1].key = f.games[0].key))).toThrow(`duplicate game key ${raw.games[0].key}`);
  });

  it('refuses a division slug that is a static /festival route', () => {
    expect(bad((f) => (f.divisions[0].slug = 'schedule'))).toThrow('schedule is a /festival route of its own, not a division slug');
  });

  it('names a team in no pool, and a pool that does not list exactly its teams', () => {
    expect(bad((f) => (f.teams[0].poolId = 'hnopool'))).toThrow('no pool hnopool');
    const pool = raw.divisions[0].pools[0];
    expect(bad((f) => f.divisions[0].pools[0].teamIds.pop())).toThrow(`${pool.name}'s teamIds are not exactly the teams in it`);
  });

  it('names a game on a field the file does not have', () => {
    expect(bad((f) => (f.games[0].fieldId = 'hnofield'))).toThrow('no field hnofield');
  });

  it('names a pool game side from another pool', () => {
    const g = raw.games.find((x) => x.kind === 'pool' && raw.teams.some((t) => t.divisionKey === x.divisionKey && t.poolId !== x.poolId))!;
    const stranger = raw.teams.find((t) => t.divisionKey === g.divisionKey && t.poolId !== g.poolId)!;
    const i = raw.games.indexOf(g);
    expect(bad((f) => (f.games[i].sides[1].teamId = stranger.id))).toThrow(`${stranger.id} is not in pool ${g.poolId}`);
  });

  it('names a startUtc that is not the start at the file’s offset, and a game outside the event’s days', () => {
    const g = raw.games[0];
    expect(bad((f) => (f.games[0].startUtc = `${g.start}Z`))).toThrow(`${g.start}Z is not ${g.start} at -05:00`);
    const last = raw.games.length - 1;
    expect(
      bad((f) => {
        f.games[last].start = '2026-11-29T08:00:00';
        f.games[last].startUtc = '2026-11-29T13:00:00Z';
      }),
    ).toThrow('2026-11-29 is outside 2026-11-26..2026-11-28');
  });

  it('refuses a scheduled game with a score and a final game without one', () => {
    expect(
      bad((f) => {
        f.games[0].status = 'scheduled';
        f.games[0].score = [1, 0];
      }),
    ).toThrow('a scheduled game has no score');
    expect(
      bad((f) => {
        f.games[0].status = 'final';
        f.games[0].score = null;
      }),
    ).toThrow('a final game has a score');
  });

  it('refuses a placement game side with no source, or a place its pool does not have', () => {
    expect(bad((f) => (f.games[placement].sides[0].source = null))).toThrow('a placement game side has a source');
    expect(bad((f) => (f.games[placement].sides[0].source!.place = 99))).toThrow('has no place 99');
    expect(bad((f) => (f.games[placement].layout = null))).toThrow('a placement game has a bracket layout');
  });

  it('refuses games out of order', () => {
    expect(bad((f) => f.games.reverse())).toThrow('games are in (startUtc, field number, key) order');
  });

  it('refuses a fetchedAt that is not a UTC time', () => {
    expect(bad((f) => (f.fetchedAt = '2026-11-26 15:35'))).toThrow('expected an ISO UTC time');
  });
});

describe('team names as printed (DESIGN §35.1)', () => {
  it('capitalises the u of an age token and changes nothing else', () => {
    expect(displayTeamName('Atlanta FHC u10')).toBe('Atlanta FHC U10');
    expect(displayTeamName(' Norcal Wolves u16 ')).toBe('Norcal Wolves U16');
    expect(displayTeamName('U14 Gateway Red Stars')).toBe('U14 Gateway Red Stars');
    expect(displayTeamName('Florida United white')).toBe('Florida United white');
    expect(displayTeamName('Pool T 3rd Place')).toBe('Pool T 3rd Place');
    expect(displayTeamName('Summit')).toBe('Summit');
  });

  it('writes the feed’s capitalised non-acronyms as words, and leaves acronyms alone (owner ask)', () => {
    expect(displayTeamName('ROB SHORT ACADEMY U19')).toBe('Rob Short Academy U19');
    expect(displayTeamName('IFHCK ICE')).toBe('IFHCK Ice');
    expect(displayTeamName('IFHCK SPIRIT')).toBe('IFHCK Spirit');
    expect(displayTeamName('AGH U16 2')).toBe('AGH U16 2');
    expect(displayTeamName('HTC CA U19')).toBe('HTC CA U19');
    // Only a whole word in capitals: a word that merely contains one, or is written as a word already, is kept.
    expect(displayTeamName('Robins Academy')).toBe('Robins Academy');
    expect(displayTeamName('Spirit of USA')).toBe('Spirit of USA');
  });

  it('the committed file prints no lower-case age token in a team name or a bracket side', () => {
    const names = [...raw.teams.map((t) => t.name), ...raw.games.flatMap((g) => g.sides.map((s) => s.label))];
    expect(names.filter((n) => /\bu-?\d+\b/.test(n))).toEqual([]);
    for (const n of names) expect(displayTeamName(n)).toBe(n);
  });
});
