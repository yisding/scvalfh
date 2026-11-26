/**
 * data/field-hockey/festival-clubs.json and lib/festival/festival.ts resolveFestivalClubs (DESIGN §35,
 * DATA-SOURCES §1.16): which club each National Hockey Festival team plays for. The committed file validates, every
 * claim beyond a name cites its evidence, every siteClub is a club on this site, and the teams of 2026-11-26 resolve
 * to the clubs researched for them; the resolution rules (longest prefix at a word boundary, the automatic club for
 * a team no curated club matches) are pinned on files built in memory; and a bad file is refused by name.
 *
 * The refresh job runs this file before it commits a new read, and a team added or withdrawn mid-event must never
 * stop that: the teams of 2026-11-26 are listed here (TEAMS_ON_2026_11_26) and checked where they still appear, and
 * a team that is not listed may take an automatic club.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  festivalClubOfTeam,
  festivalClubSlugs,
  festivalClubs,
  getFestivalClubsFile,
  loadFestivalClubs,
  resolveFestivalClubs,
  type FestivalClubsFile,
  type FestivalCuratedClub,
  type FestivalFile,
} from '../lib/festival/festival';
import { clubMatchText, matchesPrefix } from '../lib/festival/festival-names';
import { FestivalClubsFileSchema } from '../lib/festival/festival-clubs-schema';
import { getClub } from '../lib/players/clubs';
import { REPO } from './helpers';

const read = <T>(name: string): T => JSON.parse(readFileSync(path.join(REPO, 'data', 'field-hockey', name), 'utf8')) as T;
const raw = read<FestivalClubsFile>('festival-clubs.json');
const festival = read<FestivalFile>('festival.json');
const resolved = resolveFestivalClubs(festival, raw);

/** Every TourneyMachine team name on 2026-11-26 (118 teams), by the club it was researched to. */
const TEAMS_ON_2026_11_26: Record<string, readonly string[]> = {
  agh: ['AGH U12', 'AGH U14 1', 'AGH U14 2', 'AGH U16 1', 'AGH U16 2', 'AGH U16 3', 'AGH U19'],
  'aim-athletes': ['AIM Athletes', 'AIM Athletes U19'],
  'atlanta-fhc': ['Atlanta FHC U10', 'Atlanta FHC U12', 'Atlanta FHC U14', 'Atlanta FHC U19'],
  beastie: ['Beastie U12 Black', 'Beasties U14 Black'],
  'blue-star': ['Blue Star Warriors', 'Blue Star U19'],
  'bluegrass-premier': ['Bluegrass Sky'],
  'cape-ann-fhc': ['Cape Ann FHC Black'],
  'charlotte-ambush': ['Charlotte Ambush U14', 'Charlotte Ambush U16', 'Charlotte Ambush U19'],
  'cowtown-field-hockey': ['Cowtown Field Hockey Club U14', 'Cowtown Field Hockey Club U19'],
  doral: ['Doral U12'],
  dynasty: ['Dynasty Black'],
  'excelsior-hockey-club': ['Excelsior Hockey Club'],
  fhl: ['FHL'],
  firestyx: ['FireStyx'],
  'florida-united': ['Florida United white', 'Florida United Red', 'Florida United U16', 'Florida United U19'],
  frontier: ['Frontier Inferno'],
  gateway: [
    'U10 Gateway Red Stars',
    'U10 Gateway Red Stripes',
    'U12 Gateway Red Spirit',
    'U12 Gateway Red Stars',
    'U12 Gateway Red Stripes',
    'U14 Gateway Red Stars',
    'U14 Gateway Red Stripes',
    'U14 Gateway White',
    'U16 Gateway Red Stars',
    'U16 Gateway Red Stripes',
    'U16 Gateway White',
    'U19 Gateway Red',
    'U19 Gateway White',
  ],
  'hayward-hawks': ['Hayward Hawks'],
  htc: ['HTC'],
  'htc-ca': ['HTC CA U19'],
  ifhck: ['IFHCK Storm', 'IFHCK Thunder', 'IFHCK Fire', 'IFHCK ICE', 'IFHCK Phoenix', 'IFHCK SPIRIT', 'IFHCK Warriors'],
  'key-biscayne-field-hockey': ['Key Biscayne Field Hockey U10 White', 'Key Biscayne Field Hockey U12', 'Key Biscayne Field Hockey U14'],
  'legacy-academy': ['Legacy Academy'],
  lonestar: ['Lonestar U14 Orange', 'Lonestar U16 Orange', 'Lonestar U19 Orange'],
  meerkats: ['Meerkats Field Hockey'],
  'mid-jersey-knights': ['Mid-Jersey Knights FHC'],
  'new-heights': ['New Heights U12 Gold', 'New Heights U14 Pink', 'New Heights U16 Black', 'New Heights U16 Blue', 'New Heights U19 Red'],
  'new-york-elite': ['New York Elite U16'],
  'new-york-hc': ['New York H.C.'],
  'norcal-wolves': ['Norcal Wolves U16'],
  'peak-fh': ['Peak FH U19'],
  'pinnacle-field-hockey': ['Pinnacle White', 'Pinnacle Ivory', 'Pinnacle Blue', 'Pinnacle Sky', 'Pinnacle Black', 'Pinnacle Graphite'],
  'polar-bears': ['Polar Bears U14'],
  'red-lions-hockey-club': ['Red Lions'],
  'rob-short-academy': ['Rob Short Academy U16', 'ROB SHORT ACADEMY U19'],
  'san-francisco-hawks': ['San Francisco Hawks U16', 'San Francisco Hawks U19'],
  'spirit-of-usa': ['Spirit of USA', 'Spirit of USA U19'],
  summit: ['Summit'],
  'texas-pride': ['Texas Pride Red', 'Texas Pride White', 'Texas Pride Blue'],
  weston: ['Weston U10', 'Weston U12'],
  'williamsville-stampede': ['Williamsville Stampede U19'],
  'windy-city': ['Windy City Blast', 'Windy City Blaze', 'Windy City Spark', 'Windy City Flame', 'Windy City Inferno', 'Windy City Fire', 'Windy City Storm'],
  wizards: ['Wizards U12', 'Wizards U14', 'Wizards U16', 'Wizards U19', 'Wizards U19 Black'],
};

/** The two adult teams (Pool V) no club is named for: they take automatic clubs of their own names. */
const AUTOMATIC_ON_2026_11_26 = ['Stars', 'Stripes'];

const clubBySlug = new Map(resolved.clubs.map((c) => [c.slug, c]));
const clubOfName = (name: string) => festival.teams.filter((t) => t.name === name).map((t) => resolved.clubOfTeam.get(t.id));

describe('data/field-hockey/festival-clubs.json', () => {
  it('validates, every siteClub is a club on this site, and it is what the loader serves', () => {
    expect(FestivalClubsFileSchema.safeParse(raw).success).toBe(true);
    expect(loadFestivalClubs(raw)).toEqual(raw);
    expect(getFestivalClubsFile()).toEqual(raw);
    for (const c of raw.clubs) if (c.siteClub !== null) expect(getClub(c.siteClub), c.slug).toBeDefined();
  });

  it('links the four clubs this site has a page for, and no false friend', () => {
    const linked = raw.clubs.filter((c) => c.siteClub !== null).map((c) => [c.slug, c.siteClub]);
    expect(linked).toEqual([
      ['hayward-hawks', 'hayward-hawks'],
      ['htc', 'htc'],
      ['htc-ca', 'htc'],
      ['norcal-wolves', 'norcal-impact'],
      ['san-francisco-hawks', 'sf-hawks'],
    ]);
  });

  it('calls only the researched clubs Californian, and HTC’s East Coast team not', () => {
    expect(raw.clubs.filter((c) => c.california).map((c) => c.slug)).toEqual(['hayward-hawks', 'htc-ca', 'norcal-wolves', 'san-francisco-hawks']);
    expect(raw.clubs.filter((c) => c.norCal).map((c) => c.slug)).toEqual(['hayward-hawks', 'norcal-wolves', 'san-francisco-hawks']);
    expect(raw.clubs.find((c) => c.slug === 'htc')!.california).toBe(false);
  });

  it('cites an https page and its words for every region, California, Northern California and siteClub claim', () => {
    for (const c of raw.clubs) {
      if (c.region !== null || c.california || c.norCal || c.siteClub !== null) expect(c.evidence.length, c.slug).toBeGreaterThan(0);
      for (const e of c.evidence) {
        expect(e.url.startsWith('https://'), `${c.slug} ${e.url}`).toBe(true);
        expect(e.quote.trim().length, c.slug).toBeGreaterThan(0);
      }
    }
    for (const s of raw.sources) expect(s.url.startsWith('https://'), s.url).toBe(true);
  });

  it('keys every team note by a team name of 2026-11-26 of its own club', () => {
    for (const c of raw.clubs) {
      for (const name of Object.keys(c.teamNotes ?? {})) expect(TEAMS_ON_2026_11_26[c.slug], c.slug).toContain(name);
    }
  });
});

describe('the festival’s teams resolve to their clubs', () => {
  it('lists every curated club with its teams of 2026-11-26, and no other', () => {
    expect(Object.keys(TEAMS_ON_2026_11_26).sort()).toEqual(raw.clubs.map((c) => c.slug).sort());
  });

  it('gives every team of 2026-11-26 that is still in the file the club researched for it', () => {
    for (const [slug, names] of Object.entries(TEAMS_ON_2026_11_26)) {
      for (const name of names) for (const club of clubOfName(name)) expect(club, name).toBe(slug);
    }
  });

  it('gives the adult teams Stars and Stripes automatic clubs of their own names', () => {
    for (const name of AUTOMATIC_ON_2026_11_26) {
      for (const slug of clubOfName(name)) {
        expect(clubBySlug.get(slug!)).toMatchObject({ name, curated: false, california: false, siteClub: null });
      }
    }
  });

  it('leaves a curated club empty only when no team in the file carries one of its prefixes', () => {
    // Derived from the roster as it is now, not from 2026-11-26's, so a team that withdraws or one that joins a
    // curated club mid-event never fails the refresh job's tests.
    // A team goes to the club with its longest matching prefix ('HTC CA U19' to htc-ca, not htc), so a club is
    // carried only by the teams that prefix wins.
    const owner = (name: string) => {
      const text = clubMatchText(name);
      let best: { slug: string; length: number } | null = null;
      for (const c of raw.clubs) {
        for (const prefix of c.match) {
          if (matchesPrefix(text, prefix) && (best === null || prefix.length > best.length)) best = { slug: c.slug, length: prefix.length };
        }
      }
      return best?.slug;
    };
    const carried = new Set(festival.teams.map((t) => owner(t.name)));
    expect(resolved.unmatched).toEqual(raw.clubs.filter((c) => !carried.has(c.slug)).map((c) => c.slug));
  });

  it('gives every team one club, every club a unique slug, and serves them A–Z', () => {
    expect([...resolved.clubOfTeam.keys()].sort()).toEqual(festival.teams.map((t) => t.id).sort());
    expect(resolved.clubs.flatMap((c) => c.teamIds).sort()).toEqual(festival.teams.map((t) => t.id).sort());
    const slugs = resolved.clubs.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9-]+$/);
    const names = resolved.clubs.map((c) => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })));
    expect(festivalClubs()).toEqual(resolved.clubs);
    expect(festivalClubSlugs()).toEqual(slugs);
    expect(new Map(festivalClubOfTeam())).toEqual(resolved.clubOfTeam);
  });

  it('lists a club’s teams in the festival file’s order', () => {
    const order = new Map(festival.teams.map((t, i) => [t.id, i]));
    for (const c of resolved.clubs) {
      const at = c.teamIds.map((id) => order.get(id)!);
      expect(at, c.slug).toEqual([...at].sort((a, b) => a - b));
    }
  });

  it('carries the curated facts and keys team notes by team id', () => {
    const htc = clubBySlug.get('htc')!;
    const htcTeam = festival.teams.find((t) => t.name === 'HTC');
    if (htcTeam) expect(Object.keys(htc.teamNotes)).toEqual([htcTeam.id]);
    const facts = { california: true, norCal: true, siteClub: 'sf-hawks', region: 'San Francisco, Calif.' };
    expect(raw.clubs.find((c) => c.slug === 'san-francisco-hawks')).toMatchObject(facts);
    // The resolved club exists only while it has a team in the file (both Hawks teams could withdraw).
    const hawks = clubBySlug.get('san-francisco-hawks');
    if (hawks) expect(hawks).toMatchObject({ ...facts, curated: true });
  });

  it('finds the California teams of 2026-11-26 among the California clubs, and not HTC’s U16 team', () => {
    const name = new Map(festival.teams.map((t) => [t.id, t.name]));
    const california = resolved.clubs.filter((c) => c.california).flatMap((c) => c.teamIds.map((id) => name.get(id)!));
    const expected = ['Hayward Hawks', 'San Francisco Hawks U16', 'Norcal Wolves U16', 'HTC CA U19', 'San Francisco Hawks U19'];
    // Every one of them still in the file is there; a team that joins a California club mid-event may be too.
    expect(california).toEqual(expect.arrayContaining(expected.filter((n) => festival.teams.some((t) => t.name === n))));
    expect(california).not.toContain('HTC');
  });
});

describe('resolveFestivalClubs: the rules', () => {
  const club = (slug: string, name: string, match: string[]): FestivalCuratedClub => ({
    slug,
    name,
    match,
    region: null,
    california: false,
    norCal: false,
    siteClub: null,
    evidence: [],
  });
  const clubsFile = (...clubs: FestivalCuratedClub[]): FestivalClubsFile => ({ checkedOn: '2026-11-26', sources: raw.sources, clubs });
  /** A festival of these team names (ids t1, t2, …); resolution reads nothing but the teams. */
  const teamsFile = (...names: string[]): FestivalFile => ({
    ...festival,
    teams: names.map((name, i) => ({ ...festival.teams[0], id: `t${i + 1}`, slug: `team-${i + 1}`, name })),
  });
  const resolve = (names: string[], clubs: FestivalCuratedClub[]) => {
    const r = resolveFestivalClubs(teamsFile(...names), clubsFile(...clubs));
    return { ...r, of: names.map((_, i) => r.clubOfTeam.get(`t${i + 1}`)) };
  };

  it('finds a team note keyed by the feed’s own spelling or by the printed name', () => {
    const wolves = { ...club('wolves', 'Wolves', ['wolves']), teamNotes: { 'Wolves u16': 'feed spelling', 'Wolves U19': 'printed' } };
    const r = resolve(['Wolves U16', 'Wolves U19'], [wolves]);
    expect(r.clubs[0].teamNotes).toEqual({ t1: 'feed spelling', t2: 'printed' });
  });

  it('leaves the shorter-prefix club empty when only the longer-prefix club’s team remains', () => {
    // HTC's East Coast team withdraws and HTC CA U19 stays: 'htc' matches its name too, but htc-ca wins it.
    const r = resolve(['HTC CA U19'], [club('htc', 'HTC', ['htc']), club('htc-ca', 'HTC CA', ['htc ca'])]);
    expect(r.of).toEqual(['htc-ca']);
    expect(r.unmatched).toEqual(['htc']);
  });

  it('takes the longest matching prefix, whichever club the file lists first', () => {
    const windy = club('windy', 'Windy', ['windy']);
    const windyCity = club('windy-city', 'Windy City', ['windy city']);
    const names = ['Windy City Blaze', 'Windy Hills U12'];
    expect(resolve(names, [windy, windyCity]).of).toEqual(['windy-city', 'windy']);
    expect(resolve(names, [windyCity, windy]).of).toEqual(['windy-city', 'windy']);
  });

  it('matches at a word boundary, after a leading age token, in any case', () => {
    const r = resolve(
      ['Beasties U14 Black', 'Beastie U12 Black', 'HTC CA U19', 'U14 Gateway Red Stars', 'ROB SHORT ACADEMY U19', 'Gatewayside'],
      [club('beastie', 'Beastie', ['beastie']), club('htc', 'HTC', ['htc']), club('gateway', 'Gateway', ['gateway']), club('rob-short-academy', 'Rob Short Academy', ['rob short academy'])],
    );
    expect(r.of).toEqual(['beasties-black', 'beastie', 'htc', 'gateway', 'rob-short-academy', 'gatewayside']);
  });

  it('gives teams no curated club matches a shared automatic club, named without age tokens or a trailing digit', () => {
    const r = resolve(['Brand New U16 1', 'Brand New U19', 'U16'], []);
    expect(r.of).toEqual(['brand-new', 'brand-new', 'u16']);
    expect(r.clubs.map((c) => [c.slug, c.name, c.curated, c.teamIds])).toEqual([
      ['brand-new', 'Brand New', false, ['t1', 't2']],
      ['u16', 'U16', false, ['t3']],
    ]);
  });

  it('suffixes an automatic club whose slug a curated club has, and reports the empty curated club', () => {
    const r = resolve(['Brand New U16'], [club('brand-new', 'Brand New Hockey', ['brand new hockey'])]);
    expect(r.of).toEqual(['brand-new-2']);
    expect(r.clubs.map((c) => c.slug)).toEqual(['brand-new-2']);
    expect(r.unmatched).toEqual(['brand-new']);
  });

  it('gives a team that joins mid-event an automatic club and leaves every other team where it was', () => {
    const grown: FestivalFile = { ...festival, teams: [...festival.teams, { ...festival.teams[0], id: 'hnewteam', slug: 'u16-pelicans', name: 'Pelicans U16' }] };
    const r = resolveFestivalClubs(grown, raw);
    expect(r.clubOfTeam.get('hnewteam')).toBe('pelicans');
    expect(r.clubs.find((c) => c.slug === 'pelicans')).toMatchObject({ name: 'Pelicans', curated: false, teamIds: ['hnewteam'] });
    for (const t of festival.teams) expect(r.clubOfTeam.get(t.id), t.name).toBe(resolved.clubOfTeam.get(t.id));
  });
});

describe('a bad clubs file is refused', () => {
  function bad(edit: (f: FestivalClubsFile) => void): () => FestivalClubsFile {
    const copy = structuredClone(raw);
    edit(copy);
    return () => loadFestivalClubs(copy);
  }
  const at = (slug: string) => (f: FestivalClubsFile) => f.clubs.find((c) => c.slug === slug)!;

  it('names a duplicate club slug and a prefix two clubs claim', () => {
    expect(bad((f) => f.clubs.push({ ...f.clubs[0], match: ['zzz'] }))).toThrow(`duplicate club slug ${raw.clubs[0].slug}`);
    expect(bad((f) => (at('wizards')(f).match = ['agh']))).toThrow("agh is also agh's prefix");
  });

  it('refuses a prefix that is not lower case and single-spaced', () => {
    expect(bad((f) => (at('windy-city')(f).match = ['Windy City']))).toThrow('Windy City is not a lower-case, single-spaced prefix');
    expect(bad((f) => (at('windy-city')(f).match = ['windy  city']))).toThrow('windy  city is not a lower-case, single-spaced prefix');
  });

  it('refuses a Northern California club that is not a California club', () => {
    expect(bad((f) => (at('san-francisco-hawks')(f).california = false))).toThrow('a Northern California club is a California club');
  });

  it('refuses a region, a California flag or a siteClub with no evidence', () => {
    const claim = 'a region, California flag or siteClub cites its evidence';
    expect(bad((f) => (at('agh')(f).region = 'Somewhere, Pa.'))).toThrow(claim);
    expect(bad((f) => (at('agh')(f).california = true))).toThrow(claim);
    expect(bad((f) => (at('agh')(f).siteClub = 'htc'))).toThrow(claim);
  });

  it('names a siteClub that is not a club on this site', () => {
    expect(bad((f) => (at('htc')(f).siteClub = 'no-such-club'))).toThrow(
      'festival-clubs: htc names siteClub no-such-club, which is not a club in data/field-hockey/clubs.json',
    );
  });
});
