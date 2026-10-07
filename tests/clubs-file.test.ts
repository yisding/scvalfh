/**
 * data/clubs.json (SPEC §1.1j2, DESIGN §17): the committed file validates and holds every
 * load-time invariant; lib/clubs.ts serves it in display order (DESIGN §17.5); and a bad file —
 * built in memory from the real one, never written to disk — is refused at load with a message
 * that names what is wrong (the path, or the team, player and club).
 *
 * The file is research, not a script's output, so the counts pinned below change only with a new
 * sweep: when one lands, re-count from the file and update them together with README §Clubs and
 * DATA-SOURCES §1.1j2.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  BANNED_HOSTS,
  CLUB_REGIONS,
  ClubsFileSchema,
  isAsOf,
  isBannedHost,
  clubSiteKey,
  type ClubsFile,
} from '../lib/clubs-schema';
import {
  SEARCHED_REGIONS,
  clubDisplayName,
  getAffiliatedPlayer,
  getClub,
  getClubAffiliations,
  getClubSlugs,
  getClubs,
  getClubsFile,
  getClubsLastChecked,
  getJvClubAffiliations,
  getPlayerClubs,
  getTeamClubAffiliations,
  loadClubs,
} from '../lib/clubs';
import { LEAGUES } from '../lib/leagues';
import { classOf, getAllEnrichedRosters, getRosters } from '../lib/rosters';
import { isHttpsUrl } from '../lib/schema-primitives';
import { getTeamBySlug } from '../lib/teams';
import { REPO } from './helpers';

const raw = JSON.parse(readFileSync(path.join(REPO, 'data', 'clubs.json'), 'utf8')) as ClubsFile;
/** The twelve club records the 2026-10-06 Southern California sweep added. */
const SOCAL_CLUBS: ReadonlySet<string> = new Set([
  'rush', 'coastal-clash', 'myto', 'knights-fhc', 'vcrd', 'bulldogs',
  'wc-riptide', 'la-tigers', 'sc-royals', 'hb-surfers', 'socal-strikers', 'oc-field-hockey-club',
]);
const teams = getAllEnrichedRosters();
const season = getRosters().season;

/** The merged roster row an affiliation names, looked up here rather than through lib/clubs.ts. */
function rowOf(a: { teamSlug: string; athleteId: string }) {
  return teams.find((t) => t.slug === a.teamSlug)?.players.find((p) => p.athleteId === a.athleteId);
}

/** The index of the affiliation for `name` (at `club`, when a player has several). */
function at(name: string, club?: string): number {
  const i = raw.affiliations.findIndex((a) => a.fullName === name && (club === undefined || a.club === club));
  if (i < 0) throw new Error(`no affiliation for ${name}${club ? ` at ${club}` : ''}`);
  return i;
}

/** What the schema says about `f`, as `path: message` lines; [] when it passes. */
function refusals(f: unknown): string[] {
  const parsed = ClubsFileSchema.safeParse(f);
  return parsed.success ? [] : parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
}

/** loadClubs' message for `f` (schema, then the join), or '' when it loads. */
function loadError(f: unknown, ...rest: [typeof teams?, string?]): string {
  try {
    loadClubs(f, ...rest);
    return '';
  } catch (err) {
    return (err as Error).message;
  }
}

/** Every URL the file holds: websites, program and roster pages, and every source. */
function allUrls(f: ClubsFile): string[] {
  return [
    ...f.clubs.flatMap((c) => [
      ...(c.website ? [c.website] : []),
      ...c.programs.map((p) => p.source),
      ...c.rosterPages,
      ...c.sources.map((s) => s.url),
    ]),
    ...f.affiliations.flatMap((a) => a.sources.map((s) => s.url)),
    ...f.jvAffiliations.flatMap((a) => a.sources.map((s) => s.url)),
  ];
}

const countBy = <T>(xs: readonly T[], key: (x: T) => string) =>
  xs.reduce<Record<string, number>>((acc, x) => ({ ...acc, [key(x)]: (acc[key(x)] ?? 0) + 1 }), {});

describe('data/clubs.json', () => {
  it('validates against the contract, drops nothing in the parse, and is what lib/clubs.ts serves', () => {
    expect(refusals(raw)).toEqual([]);
    // Zod strips keys it does not know: equality proves the contract covers every key in the file.
    expect(loadClubs(raw)).toEqual(raw);
    expect(getClubsFile()).toEqual(raw);
  });

  it('is for the rosters\' season', () => {
    expect(raw.season).toBe(season);
  });

  it('has unique club slugs, a real club behind every affiliation, and each (team, athlete, club) once', () => {
    const slugs = raw.clubs.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const a of raw.affiliations) expect(slugs, `${a.fullName} -> ${a.club}`).toContain(a.club);
    const triples = raw.affiliations.map((a) => `${a.teamSlug} ${a.athleteId} ${a.club}`);
    expect(new Set(triples).size).toBe(triples.length);
  });

  it('joins every affiliation to a varsity roster row of that team, under the row\'s own name', () => {
    for (const a of raw.affiliations) {
      const row = rowOf(a);
      expect(row, `${a.teamSlug} / ${a.fullName}`).toBeDefined();
      expect(row!.fullName).toBe(a.fullName);
      expect(row!.level, `${a.teamSlug} / ${a.fullName}`).not.toBe('jv');
      expect(getAffiliatedPlayer(a)).toEqual(row);
    }
  });

  it('agrees with the roster grade wherever a source states a class year', () => {
    let checked = 0;
    for (const a of raw.affiliations) {
      const grade = rowOf(a)!.grade;
      for (const s of a.sources) {
        if (s.statedClassYear === null || grade === null) continue;
        expect(s.statedClassYear, `${a.fullName} (${a.club}) ${s.url}`).toBe(classOf(season, grade));
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('links only https pages, never social media', () => {
    const urls = allUrls(raw);
    expect(urls.length).toBeGreaterThan(raw.affiliations.length);
    for (const u of urls) {
      expect(new URL(u).protocol, u).toBe('https:');
      const host = new URL(u).hostname;
      for (const banned of BANNED_HOSTS) {
        expect(host === banned || host.endsWith(`.${banned}`), u).toBe(false);
      }
    }
  });

  it('gives every club and every affiliation a source, and keeps quotes to 300 characters', () => {
    for (const c of raw.clubs) expect(c.sources.length, c.slug).toBeGreaterThan(0);
    for (const a of raw.affiliations) {
      expect(a.sources.length, a.fullName).toBeGreaterThan(0);
      for (const s of a.sources) {
        expect(s.quote.length, s.url).toBeGreaterThan(0);
        expect(s.quote.length, s.url).toBeLessThanOrEqual(300);
      }
    }
  });

  it('dates every affiliation in one of the five asOf shapes, or not at all', () => {
    for (const a of raw.affiliations) if (a.asOf !== null) expect(isAsOf(a.asOf), `${a.fullName}: ${a.asOf}`).toBe(true);
  });

  it('ends every basis on a whole sentence, never clipped mid-word', () => {
    // A basis clipped to a length stops mid-word ("… use 'Lange") or mid-argument, and a maintainer
    // re-checking the tie loses what it rests on.
    for (const a of raw.affiliations) expect(a.basis, `${a.fullName} (${a.club})`).toMatch(/[.!?]['"’”)]?$/);
  });

  // The 21 rows MaxPreps added to Marin Academy (18) and Westmont (3) after the sweeps, swept 2026-10-07.
  const OCT_7_ROWS = new Set(
    ['marin-academy', 'westmont'].flatMap((slug) =>
      teams
        .find((t) => t.slug === slug)!
        .players.filter((p) => slug === 'marin-academy' || ['Kaylee True', 'Lexi True', 'Savannah Murdoch'].includes(p.fullName))
        .map((p) => p.athleteId),
    ),
  );

  it('ties one of the 21 rows swept on 2026-10-07: Kaylee True to Fly FHC, from her own NCSA profile', () => {
    expect(OCT_7_ROWS.size).toBe(21);
    const found = raw.affiliations.filter((a) => OCT_7_ROWS.has(a.athleteId));
    expect(found.map((a) => [a.teamSlug, a.fullName, a.club, a.clubTeam, a.status, a.asOf, a.confidence])).toEqual([
      ['westmont', 'Kaylee True', 'fly-fhc', 'U16', 'unknown', '2025', 'high'],
    ]);
    expect(found[0].sources.map((s) => [s.kind, s.statedSchool, s.statedClassYear])).toEqual([['ncsa', 'Westmont High School', 2028]]);
    expect(raw.jvAffiliations.filter((a) => OCT_7_ROWS.has(a.athleteId))).toEqual([]);
  });

  describe('NorCal, as researched 2026-10-03, 2026-10-04 and 2026-10-05 (changes only with a new sweep)', () => {
    // These sweeps covered the 49 NorCal schools (SCVAL, BVAL, PCAL, MCAL, EAL), and the counts here are
    // over them: their ties, and the 16 clubs they found (HTC among them, whose record the 2026-10-06
    // Southern California sweep re-read and moved to San Diego). The SoCal sweep's are pinned below.
    const SWEPT = new Set(['scval', 'bval', 'pcal', 'mcal', 'eal']);
    const swept = teams.filter((t) => SWEPT.has(getTeamBySlug(t.slug)!.league));
    // Ties from the 2026-10-07 sweep of the rows MaxPreps added later are pinned in their own test below.
    const norcal = raw.affiliations.filter((a) => SWEPT.has(getTeamBySlug(a.teamSlug)!.league) && !OCT_7_ROWS.has(a.athleteId));
    const norcalClubs = raw.clubs.filter((c) => !SOCAL_CLUBS.has(c.slug));
    const players = new Set(norcal.map((a) => `${a.teamSlug} ${a.athleteId}`));
    const schools = new Set(norcal.map((a) => a.teamSlug));

    it('holds 16 clubs and 94 affiliations: 80 of the 811 varsity rows, at 25 of the 49 swept schools', () => {
      expect(norcalClubs).toHaveLength(16);
      expect(norcal).toHaveLength(94);
      expect(players.size).toBe(80);
      expect(schools.size).toBe(25);
      const rows = swept.flatMap((t) => t.players.map((p) => ({ team: t.slug, level: p.level })));
      // 840 rows when swept; the 2026-10-07 BVAL and MCAL roster refresh added 20 no sweep has covered
      // (Marin Academy's 18 and Westmont's 3, less one Tamalpais row MaxPreps dropped).
      expect(rows).toHaveLength(860);
      expect(rows.filter((r) => r.level === 'jv')).toHaveLength(29);
      expect(new Set(rows.filter((r) => r.level === 'jv').map((r) => r.team))).toEqual(new Set(['los-gatos']));
      expect(swept).toHaveLength(49);
      expect(teams).toHaveLength(102);
      expect(teams.filter((t) => !SWEPT.has(getTeamBySlug(t.slug)!.league)).flatMap((t) => t.players)).toHaveLength(842);
    });

    it('counts 71 current, 13 past and 10 unknown; 79 high and 15 medium', () => {
      expect(countBy(norcal, (a) => a.status)).toEqual({ current: 71, past: 13, unknown: 10 });
      expect(countBy(norcal, (a) => a.confidence)).toEqual({ high: 79, medium: 15 });
      expect(norcal.filter((a) => a.status === 'unknown').map((a) => a.fullName).sort()).toEqual([
        'Amelia Zedonis',
        'Brooklyn Barnard',
        'Colette Boyd',
        'Emma Traverso',
        'Gabrielle Moll',
        'Kira Kelly',
        'Maisy Martin',
        'Olivia Council',
        'Riya Mehrotra',
        'Ruhee Bhatnagar',
      ]);
    });

    it('rests on 251 source entries on 118 distinct URLs, by kind', () => {
      // An entry is one page backing one tie: a club roster or a news story naming several players
      // is one page and several entries, so README §Clubs and DATA-SOURCES §1.1j2 give both counts.
      const sources = norcal.flatMap((a) => a.sources);
      expect(sources).toHaveLength(251);
      expect(new Set(sources.map((s) => s.url)).size).toBe(118);
      // URLs, not pages: two pages are cited under two URLs each (Stick Together's 2025 all-league
      // page with and without its trailing slash, Gabrielle Moll's MaxPreps career page under two
      // name slugs), so the ties rest on 116 pages (103 from the 2026-10-03 sweep, 106 with 2026-10-04's).
      const page = (url: string) => url.replace(/\/$/, '').replace(/\/athletes\/[^/]+\/bio\/?\?careerid=/, '/careerid=');
      expect(new Set(sources.map((s) => page(s.url))).size).toBe(116);
      expect(countBy(sources, (s) => s.kind)).toEqual({
        sportsrecruits: 67,
        'club-site': 49,
        news: 34,
        event: 31,
        ncsa: 29,
        other: 19,
        'maxpreps-career': 19,
        'school-site': 2,
        hudl: 1,
      });
      const kinds = Object.keys(countBy(sources, (s) => s.kind));
      const urlsOf = (kind: string) => new Set(sources.filter((s) => s.kind === kind).map((s) => s.url)).size;
      expect(Object.fromEntries(kinds.map((k) => [k, urlsOf(k)]))).toEqual({
        sportsrecruits: 43,
        'club-site': 11,
        news: 6,
        event: 3,
        ncsa: 25,
        other: 9,
        'maxpreps-career': 19,
        'school-site': 2,
        hudl: 1,
      });
      // The one URL filed under two kinds (news for five players, other for two), hence 119 by kind.
      const urls = [...new Set(sources.map((s) => s.url))];
      const kindsAt = (url: string) => new Set(sources.filter((s) => s.url === url).map((s) => s.kind));
      expect(urls.filter((url) => kindsAt(url).size > 1)).toEqual(['https://www.sticktogetherfh.com/all-league-2025/']);
      // HTC's sources as the first sweep recorded them; the 2026-10-06 re-read changed its region and wording, not its sources.
      expect(new Set(norcalClubs.flatMap((c) => c.sources.map((s) => s.url))).size).toBe(86);
      expect(norcalClubs.flatMap((c) => c.sources)).toHaveLength(91);
    });

    it('ties players to nine clubs, and none to the other seven', () => {
      const byClub = Object.fromEntries(
        norcalClubs
          .map((c) => [c.slug, norcal.filter((a) => a.club === c.slug)] as const)
          .filter(([, list]) => list.length > 0)
          .map(([slug, list]) => [slug, { ...{ current: 0, past: 0, unknown: 0 }, ...countBy(list, (a) => a.status) }]),
      );
      expect(byClub).toEqual({
        'sf-hawks': { current: 32, past: 0, unknown: 0 },
        'norcal-impact': { current: 25, past: 0, unknown: 0 },
        'fly-fhc': { current: 5, past: 4, unknown: 4 },
        infinity: { current: 2, past: 6, unknown: 1 },
        lightning: { current: 1, past: 1, unknown: 1 },
        'golden-gate-rippers': { current: 0, past: 1, unknown: 0 },
        'd-city': { current: 0, past: 1, unknown: 3 },
        'chico-hotshots': { current: 4, past: 0, unknown: 1 },
        htc: { current: 2, past: 0, unknown: 0 },
      });
      expect(norcalClubs.filter((c) => !byClub[c.slug]).map((c) => c.slug).sort()).toEqual([
        'hayward-hawks',
        'lions',
        'pac-heights',
        'performance-fh',
        'roseville-fhc',
        'sj-khalsa',
        'stryker',
      ]);
    });

    it('ties three Davis players to NorCal Impact from the 2026-08-27 NFHCA watchlist (Kate Loscutoff, not Margaret)', () => {
      const davis = raw.affiliations.filter((a) => a.teamSlug === 'davis');
      expect(davis.map((a) => [a.fullName, rowOf(a)!.grade, a.club, a.status, a.asOf])).toEqual([
        ['Kira Kelly', 11, 'norcal-impact', 'current', '2026-08-27'],
        ['Kate Loscutoff', 12, 'norcal-impact', 'current', '2026-08-27'],
        ['Amelia Zedonis', 11, 'norcal-impact', 'current', '2026-08-27'],
        ['Kira Kelly', 11, 'd-city', 'unknown', '2025-08-28'],
        ['Kate Loscutoff', 12, 'd-city', 'past', '2024'],
        ['Amelia Zedonis', 11, 'd-city', 'unknown', '2025-08-28'],
        ['Maisy Martin', 11, 'd-city', 'unknown', null],
      ]);
      for (const a of davis.filter((x) => x.club === 'd-city' && x.status === 'unknown' && x.asOf !== null)) {
        expect(a.sources.map((s) => s.url)).toEqual(['https://nfhca.org/2025-high-school-watchlist/']);
        expect(a.sources[0].quote).toMatch(/ \| Davis Senior High School \| D-City \| Sophomore \| /);
      }
      const losc = davis.find((x) => x.club === 'd-city' && x.fullName === 'Kate Loscutoff')!;
      expect(losc.sources.map((s) => [s.kind, s.statedClassYear])).toEqual([['ncsa', 2027]]);
      for (const a of davis.filter((x) => x.club === 'norcal-impact')) {
        expect(a.sources.map((s) => s.url)).toEqual(['https://nfhca.org/nfhca-2026-high-school-watchlist/']);
        expect(a.sources[0].quote.startsWith('Davis Senior High School | NorCal Impact FHC | ')).toBe(true);
      }
      expect(teams.find((t) => t.slug === 'davis')!.players.some((p) => p.fullName === 'Margaret Loscutoff')).toBe(true);
    });

    it('places the clubs by region, with none on the Peninsula or the Central Coast', () => {
      expect(countBy(norcalClubs, (c) => c.region)).toEqual({
        'san-francisco': 2,
        'south-bay': 7,
        'east-bay': 2,
        marin: 1,
        sacramento: 2,
        'north-state': 1,
        'san-diego': 1,
      });
    });

    it('ties 13 players to more than one club', () => {
      const n = Object.values(countBy(norcal, (a) => `${a.teamSlug} ${a.athleteId}`)).filter((k) => k > 1).length;
      expect(n).toBe(13);
    });

    it('dates each club record: the first sweep’s on capturedAt, the three EAL-area clubs a day later, the SoCal ones and HTC on 2026-10-06', () => {
      expect(raw.capturedAt).toBe('2026-10-03');
      const day = (slug: string) =>
        SOCAL_CLUBS.has(slug) || slug === 'htc' ? '2026-10-06' : ['d-city', 'roseville-fhc', 'chico-hotshots'].includes(slug) ? '2026-10-04' : '2026-10-03';
      for (const c of raw.clubs) expect(c.checkedOn, c.slug).toBe(day(c.slug));
      expect(getClubsLastChecked()).toBe('2026-10-06');
    });

    it('ties two Pleasant Valley players to Chico Hotshots from their own MaxPreps career pages', () => {
      const pv = raw.affiliations.filter((a) => a.teamSlug === 'pleasant-valley');
      expect(pv.map((a) => [a.fullName, rowOf(a)!.grade, a.club, a.status, a.asOf, a.confidence, a.clubTeam])).toEqual([
        ['Lilah Letcher', 11, 'chico-hotshots', 'current', '2026-09-29', 'high', 'U19'],
        ['Kate Panighetti', 12, 'chico-hotshots', 'current', '2026-05-20', 'high', 'U19'],
      ]);
      for (const a of pv) {
        expect(a.sources.map((s) => [s.kind, s.statedSchool, s.sourceDate])).toEqual([['maxpreps-career', 'Pleasant Valley', a.asOf]]);
        expect(a.sources[0].quote).toContain('"clubOrganizationName":"Chico Hotshots","clubOrganizationCity":"Chico","clubOrganizationStateCode":"CA","sport":"Field Hockey"');
      }
    });

    it('finds players in four of the five NorCal leagues and in every Southern California group', () => {
      const byLeague = Object.fromEntries(
        LEAGUES.map((l) => {
          const inLeague = raw.affiliations.filter((a) => getTeamBySlug(a.teamSlug)!.league === l.id);
          return [
            l.id,
            [new Set(inLeague.map((a) => `${a.teamSlug} ${a.athleteId}`)).size, new Set(inLeague.map((a) => a.teamSlug)).size],
          ];
        }),
      );
      expect(byLeague).toEqual({
        scval: [36, 12],
        // 18 at 6 schools as swept; Westmont's Kaylee True (2026-10-07) is the 19th.
        bval: [19, 6],
        pcal: [0, 0],
        mcal: [17, 4],
        eal: [9, 3],
        sunset: [7, 3],
        city: [33, 9],
        'north-county': [20, 8],
        metro: [4, 2],
        independents: [4, 1],
      });
    });
  });

  describe('Southern California, as researched 2026-10-06 (changes only with a new sweep)', () => {
    const SOCAL_LEAGUES = new Set(['sunset', 'city', 'north-county', 'metro', 'independents']);
    const socal = raw.affiliations.filter((a) => SOCAL_LEAGUES.has(getTeamBySlug(a.teamSlug)!.league));

    it('adds 12 clubs and 76 ties: 68 of the 842 varsity rows, at 23 of the 53 schools', () => {
      expect(raw.clubs.filter((c) => SOCAL_CLUBS.has(c.slug))).toHaveLength(12);
      expect(raw.clubs).toHaveLength(28);
      expect(socal).toHaveLength(76);
      // 170, and the one 2026-10-07 tie (above).
      expect(raw.affiliations).toHaveLength(171);
      expect(new Set(socal.map((a) => `${a.teamSlug} ${a.athleteId}`)).size).toBe(68);
      expect(new Set(socal.map((a) => a.teamSlug)).size).toBe(23);
      // Nothing from the SoCal sweep is on a NorCal row, and nothing from the NorCal sweeps on a SoCal one.
      expect(raw.affiliations.length - socal.length).toBe(95);
    });

    it('counts 61 current, 6 past and 9 unknown; 63 high and 13 medium', () => {
      expect(countBy(socal, (a) => a.status)).toEqual({ current: 61, past: 6, unknown: 9 });
      expect(countBy(socal, (a) => a.confidence)).toEqual({ high: 63, medium: 13 });
      // The one tie on the revised nickname rule (2026-10-06): pages say "Abby", the roster Abigail.
      const abby = socal.find((a) => a.fullName === 'Abigail Karlander')!;
      expect([abby.club, abby.confidence, abby.sources.map((s) => s.statedSchool)]).toEqual(['rush', 'medium', [null, null]]);
    });

    it('rests on 173 source entries on 117 distinct URLs, by kind', () => {
      const sources = socal.flatMap((a) => a.sources);
      expect(sources).toHaveLength(173);
      expect(new Set(sources.map((s) => s.url)).size).toBe(117);
      expect(countBy(sources, (s) => s.kind)).toEqual({
        sportsrecruits: 80,
        other: 34,
        event: 20,
        'maxpreps-career': 15,
        'club-site': 13,
        ncsa: 8,
        fieldlevel: 3,
      });
    });

    it('ties players to seven clubs: HTC (now in San Diego) and six of the twelve new ones', () => {
      const byClub: Record<string, Record<string, number>> = {};
      for (const a of socal) {
        byClub[a.club] ??= { current: 0, past: 0, unknown: 0 };
        byClub[a.club][a.status]++;
      }
      expect(byClub).toEqual({
        htc: { current: 24, past: 0, unknown: 4 },
        rush: { current: 14, past: 1, unknown: 1 },
        myto: { current: 13, past: 1, unknown: 1 },
        vcrd: { current: 6, past: 0, unknown: 0 },
        'wc-riptide': { current: 0, past: 0, unknown: 1 },
        'coastal-clash': { current: 2, past: 4, unknown: 1 },
        'knights-fhc': { current: 2, past: 0, unknown: 1 },
      });
      expect([...SOCAL_CLUBS].filter((slug) => !byClub[slug]).sort()).toEqual([
        'bulldogs',
        'hb-surfers',
        'la-tigers',
        'oc-field-hockey-club',
        'sc-royals',
        'socal-strikers',
      ]);
    });

    it('places the twelve new clubs in four Southern California areas, none in the Inland Empire, and HTC in San Diego', () => {
      expect(countBy(raw.clubs.filter((c) => SOCAL_CLUBS.has(c.slug) || c.slug === 'htc'), (c) => c.region)).toEqual({
        'san-diego': 5,
        ventura: 2,
        'los-angeles': 2,
        'orange-county': 4,
      });
      expect(raw.clubs.some((c) => c.region === 'inland-empire' || c.region === 'elsewhere')).toBe(false);
    });

    it('ties 7 players to more than one club, and never credits a bare "Rush Devils" to one', () => {
      const n = Object.values(countBy(socal, (a) => `${a.teamSlug} ${a.athleteId}`)).filter((k) => k > 1).length;
      expect(n).toBe(7);
      // "Rush Devils" is a joint RUSH and VCRD squad: a RUSH or VCRD tie needs a page that names the club.
      for (const a of socal.filter((x) => x.club === 'rush' || x.club === 'vcrd')) {
        const names = a.club === 'rush' ? /\bRUSH\b(?! ?Devils)|Rush Field Hockey|Rush FH|rushfieldhockey|"RUSH"|Rush:/i : /VCRD|Ventura County Red Devils/;
        expect(a.sources.some((s) => names.test(s.quote) || names.test(s.url)), `${a.fullName} (${a.club})`).toBe(true);
      }
    });
  });

});

describe('data/clubs.json: jvAffiliations', () => {
  it('holds 4 ties for 3 Los Gatos JV players, each on a JV row with a class year that agrees', () => {
    expect(raw.jvAffiliations.map((a) => [a.fullName, rowOf(a)!.grade, a.club, a.status, a.clubTeam])).toEqual([
      ['Casey Moorehouse', 9, 'norcal-impact', 'current', null],
      ['Casey Moorehouse', 9, 'sf-hawks', 'current', null],
      ['Beatrix Monk', 9, 'norcal-impact', 'current', 'U16'],
      ['Colette Von Klemperer', 10, 'norcal-impact', 'current', null],
    ]);
    for (const a of raw.jvAffiliations) {
      expect(a.teamSlug).toBe('los-gatos');
      expect(rowOf(a)!.level, a.fullName).toBe('jv');
      expect(rowOf(a)!.fullName).toBe(a.fullName);
      for (const s of a.sources) expect(s.statedClassYear, a.fullName).toBe(classOf(season, rowOf(a)!.grade!));
      expect(a.basis, a.fullName).toMatch(/[.!?]['"’”)]?$/);
    }
  });

  it('resolves each JV tie to its JV roster row', () => {
    for (const a of getJvClubAffiliations()) {
      const row = getAffiliatedPlayer(a);
      expect(row.fullName, a.fullName).toBe(a.fullName);
      expect(row.level, a.fullName).toBe('jv');
    }
  });

  it('keeps them out of everything that lists varsity ties', () => {
    expect(getJvClubAffiliations()).toEqual(raw.jvAffiliations);
    const jvPlayers = new Set(raw.jvAffiliations.map((a) => `${a.teamSlug} ${a.athleteId}`));
    const served = getClubSlugs().flatMap((slug) => getClubAffiliations(slug));
    expect(served).toHaveLength(raw.affiliations.length);
    expect(served.filter((a) => jvPlayers.has(`${a.teamSlug} ${a.athleteId}`))).toEqual([]);
    for (const a of raw.jvAffiliations) {
      expect(getPlayerClubs(a.teamSlug, a.athleteId)).toEqual([]);
      expect(getTeamClubAffiliations(a.teamSlug)).not.toContainEqual(a);
    }
  });
});

describe('lib/clubs.ts', () => {
  it('orders clubs by region, then most tied players, then display name (DESIGN §17.5)', () => {
    expect(getClubSlugs()).toEqual([
      'sf-hawks',
      'pac-heights',
      'norcal-impact',
      'fly-fhc',
      'infinity',
      'lightning',
      'performance-fh',
      'sj-khalsa',
      'stryker',
      'hayward-hawks',
      'lions',
      'golden-gate-rippers',
      'd-city',
      'roseville-fhc',
      'chico-hotshots',
      'vcrd',
      'bulldogs',
      'wc-riptide',
      'la-tigers',
      'oc-field-hockey-club',
      'sc-royals',
      'socal-strikers',
      'hb-surfers',
      'htc',
      'rush',
      'myto',
      'coastal-clash',
      'knights-fhc',
    ]);
    expect(getClubs().map((c) => c.slug)).toEqual(getClubSlugs());
    // The rule, not just today's result: regions in CLUB_REGIONS order, counts never rising within one.
    const clubs = getClubs();
    for (let i = 1; i < clubs.length; i++) {
      const [a, b] = [clubs[i - 1], clubs[i]];
      const ra = CLUB_REGIONS.indexOf(a.region);
      const rb = CLUB_REGIONS.indexOf(b.region);
      expect(ra, b.slug).toBeLessThanOrEqual(rb);
      if (ra !== rb) continue;
      const [na, nb] = [getClubAffiliations(a.slug).length, getClubAffiliations(b.slug).length];
      expect(na, b.slug).toBeGreaterThanOrEqual(nb);
      if (na === nb) expect(clubDisplayName(a).localeCompare(clubDisplayName(b)), b.slug).toBeLessThan(0);
    }
  });

  it('looks clubs up by slug, and goes by the short name when there is one', () => {
    expect(getClub('nope')).toBeUndefined();
    const hawks = getClub('sf-hawks')!;
    expect(hawks.name).toBe('San Francisco Youth Field Hockey Club');
    expect(clubDisplayName(hawks)).toBe('SF Hawks');
    const performance = getClub('performance-fh')!;
    expect(performance.shortName).toBeNull();
    expect(clubDisplayName(performance)).toBe(performance.name);
  });

  it('serves each club\'s affiliations in file order, and [] for a club no tracked player is tied to', () => {
    const hawks = getClubAffiliations('sf-hawks');
    expect(hawks).toHaveLength(32);
    expect(hawks).toEqual(raw.affiliations.filter((a) => a.club === 'sf-hawks'));
    expect(getClubAffiliations('pac-heights')).toEqual([]);
    expect(getClubAffiliations('nope')).toEqual([]);
    const total = getClubSlugs().reduce((n, slug) => n + getClubAffiliations(slug).length, 0);
    expect(total).toBe(raw.affiliations.length);
  });

  it('serves a team\'s affiliations', () => {
    const si = getTeamClubAffiliations('st-ignatius');
    expect(si).toHaveLength(16);
    expect(si.every((a) => a.teamSlug === 'st-ignatius')).toBe(true);
    expect(getTeamClubAffiliations('valley-christian')).toEqual([]);
  });

  it('serves a player\'s clubs current first, then unknown, then past', () => {
    const mh = raw.affiliations[at('Melanie Henderson', 'norcal-impact')];
    const clubs = getPlayerClubs(mh.teamSlug, mh.athleteId);
    expect(clubs.map((a) => a.status)).toEqual(['current', 'past', 'past']);
    expect(clubs[0].club).toBe('norcal-impact');
    expect(new Set(clubs.map((a) => a.club))).toEqual(new Set(['norcal-impact', 'fly-fhc', 'lightning']));
    const riya = raw.affiliations[at('Riya Mehrotra')];
    expect(getPlayerClubs(riya.teamSlug, riya.athleteId).map((a) => [a.club, a.status])).toEqual([['fly-fhc', 'unknown']]);
    expect(getPlayerClubs(mh.teamSlug, 'nope')).toEqual([]);
    // The rule over every player: statuses never go back up the order.
    const rank = { current: 0, unknown: 1, past: 2 } as const;
    for (const a of raw.affiliations) {
      const ranks = getPlayerClubs(a.teamSlug, a.athleteId).map((x) => rank[x.status]);
      expect(ranks, a.fullName).toEqual([...ranks].sort((x, y) => x - y));
    }
  });

  it('serves the roster row each affiliation joined to, and refuses a pair no affiliation names', () => {
    const riya = raw.affiliations[at('Riya Mehrotra')];
    expect(getAffiliatedPlayer(riya).grade).toBeNull();
    expect(() => getAffiliatedPlayer({ teamSlug: 'st-ignatius', athleteId: 'nope' })).toThrow(/no roster row/);
  });

  it('names the eleven areas notes[] says were searched: six in NorCal, five in SoCal', () => {
    expect(SEARCHED_REGIONS).toEqual([
      'san-francisco', 'peninsula', 'south-bay', 'east-bay', 'marin', 'central-coast',
      'ventura', 'los-angeles', 'orange-county', 'inland-empire', 'san-diego',
    ]);
    for (const r of SEARCHED_REGIONS) expect(CLUB_REGIONS).toContain(r);
    expect(SEARCHED_REGIONS).not.toContain('sacramento');
    expect(SEARCHED_REGIONS).not.toContain('north-state');
    for (const c of getClubs()) if (!SEARCHED_REGIONS.includes(c.region)) expect(['sacramento', 'north-state', 'elsewhere'], c.slug).toContain(c.region);
  });
});

describe('lib/clubs-schema.ts helpers', () => {
  it('isBannedHost matches a social host or its subdomain, never a substring', () => {
    expect(isBannedHost('https://www.instagram.com/p/abc')).toBe(true);
    expect(isBannedHost('https://x.com/club')).toBe(true);
    expect(isBannedHost('https://m.facebook.com/club')).toBe(true);
    expect(isBannedHost('https://www.tiktok.com/@club')).toBe(true);
    expect(isBannedHost('https://twitter.com/club')).toBe(true);
    expect(isBannedHost('https://www.threads.net/@club/post/1')).toBe(true);
    expect(isBannedHost('https://youtu.be/abc')).toBe(true);
    expect(isBannedHost('https://www.youtube.com/watch?v=abc')).toBe(true);
    expect(isBannedHost('https://t.co/abc')).toBe(true);
    expect(isBannedHost('https://fb.me/abc')).toBe(true);
    expect(isBannedHost('https://pt.co/')).toBe(false);
    expect(isBannedHost('https://www.maxpreps.com/ca/')).toBe(false);
    expect(isBannedHost('https://notx.com/')).toBe(false);
    expect(isBannedHost('https://x.com.example.org/')).toBe(false);
    expect(isBannedHost('not a url')).toBe(false);
  });

  it('clubSiteKey reads a Google Site by two path segments and a TeamLinkt site by one', () => {
    expect(clubSiteKey('https://sites.google.com/view/dcityhockeyclub/about-us/current-roster')).toBe('sites.google.com/view/dcityhockeyclub');
    expect(clubSiteKey('https://sites.google.com/djusd.net/dhsfieldhockey/home')).toBe('sites.google.com/djusd.net/dhsfieldhockey');
    expect(clubSiteKey('https://leagues.teamlinkt.com/chicohotshotsfieldhockey/Divisions')).toBe('leagues.teamlinkt.com/chicohotshotsfieldhockey');
    expect(clubSiteKey('https://leagues.teamlinkt.com/leagues/NewsItem/34623/39251')).toBe('leagues.teamlinkt.com/leagues');
    expect(clubSiteKey('https://www.flyfhc.com/programs/')).toBe('flyfhc.com');
    expect(clubSiteKey('https://leagues.teamlinkt.com/ChicoHotshotsFieldHockey')).toBe('leagues.teamlinkt.com/chicohotshotsfieldhockey');
    expect(clubSiteKey('https://sites.google.com/a/example.org/one/home')).toBe('sites.google.com/a/example.org/one');
    expect(clubSiteKey('https://sites.google.com/a/example.org/two/home')).toBe('sites.google.com/a/example.org/two');
  });

  it('isHttpsUrl wants a parseable https URL', () => {
    expect(isHttpsUrl('https://flyfhc.com/')).toBe(true);
    expect(isHttpsUrl('http://flyfhc.com/')).toBe(false);
    expect(isHttpsUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpsUrl('flyfhc.com')).toBe(false);
  });

  it('isAsOf takes the five shapes and nothing else', () => {
    for (const ok of ['2026-07-08', '2025-10', '2025', '2025-26', '1999-00', '2015-2018', '2026-2026']) {
      expect(isAsOf(ok), ok).toBe(true);
    }
    for (const bad of ['2025-13', '2025-00', '2025/26', '2025-27', '2018-2015', '2026-02-30', '26-27', '2025-1', '', 'Fall 2025']) {
      expect(isAsOf(bad), bad).toBe(false);
    }
  });
});

describe('a bad file is refused at load', () => {
  it('loads the untouched file', () => {
    expect(loadError(structuredClone(raw))).toBe('');
  });

  it('refuses a class year that disagrees with a MaxPreps grade, naming the player', () => {
    const bad = structuredClone(raw);
    const a = bad.affiliations[at('Caitlyn Hughes')];
    const row = rowOf(a)!;
    expect(row.provenance.grade).toBe('maxpreps');
    a.sources[0].statedClassYear = classOf(season, row.grade!) + 1;
    const msg = loadError(bad);
    expect(msg).toMatch(/class of/);
    expect(msg).toContain('Caitlyn Hughes');
    // Her first source is the NFHCA 2026 high school watchlist, filed as an `event`.
    expect(msg).toContain(`clubs: st-ignatius / Caitlyn Hughes (sf-hawks): event source says class of ${classOf(season, row.grade!) + 1}, the roster shows grade ${row.grade}`);
  });

  it('checks a class year against the overlay grade when MaxPreps has none', () => {
    const bad = structuredClone(raw);
    const a = bad.affiliations[at('Junali Dutta')];
    const row = rowOf(a)!;
    expect(row.provenance.grade).not.toBe('maxpreps');
    expect(row.grade).not.toBeNull();
    a.sources[0].statedClassYear = classOf(season, row.grade!) - 1;
    const msg = loadError(bad);
    expect(msg).toMatch(/class of/);
    expect(msg).toContain('Junali Dutta');
  });

  it('lets any class year stand for a player with no grade anywhere', () => {
    const ok = structuredClone(raw);
    const a = ok.affiliations[at('Riya Mehrotra')];
    expect(rowOf(a)!.grade).toBeNull();
    for (const s of a.sources) s.statedClassYear = 2035;
    expect(loadError(ok)).toBe('');
  });

  it('refuses an affiliation to a club that is not in clubs[], with its path', () => {
    const bad = structuredClone(raw);
    bad.affiliations[3].club = 'nope';
    expect(refusals(bad)).toEqual(['affiliations.3.club: nope is not a club in clubs[]']);
    expect(loadError(bad)).toContain('affiliations.3.club: nope is not a club in clubs[]');
  });

  it('refuses an athlete who is not on that team\'s roster', () => {
    const bad = structuredClone(raw);
    bad.affiliations[0].athleteId = '00000000-0000-0000-0000-000000000000';
    expect(refusals(bad)).toEqual([]);
    expect(loadError(bad)).toMatch(/st-ignatius \/ Caitlyn Hughes \(sf-hawks\): athleteId 0{8}-.* is not a MaxPreps row of this team/);
    // A real athlete under the wrong team is the same failure.
    const moved = structuredClone(raw);
    moved.affiliations[0].teamSlug = 'leigh';
    expect(loadError(moved)).toMatch(/not a MaxPreps row/);
  });

  it('refuses a name MaxPreps spells differently', () => {
    const bad = structuredClone(raw);
    bad.affiliations[0].fullName = 'Kaitlyn Hughes';
    expect(loadError(bad)).toMatch(/Kaitlyn Hughes \(sf-hawks\): MaxPreps spells this player "Caitlyn Hughes"/);
  });

  it('refuses a JV row', () => {
    const lg = teams.find((t) => t.slug === 'los-gatos')!;
    const jv = lg.players.find((p) => p.level === 'jv')!;
    const bad = structuredClone(raw);
    const a = bad.affiliations[0];
    Object.assign(a, { teamSlug: 'los-gatos', athleteId: jv.athleteId, fullName: jv.fullName });
    for (const s of a.sources) s.statedClassYear = null;
    const msg = loadError(bad);
    expect(msg).toMatch(/JV/);
    expect(msg).toContain(jv.fullName);
  });

  it('refuses a JV tie on a varsity row, to a club the file does not hold, or for a player also in affiliations', () => {
    const varsity = structuredClone(raw);
    const v = raw.affiliations[at('Lizzie Moorehouse')];
    Object.assign(varsity.jvAffiliations[0], { athleteId: v.athleteId, fullName: v.fullName, club: 'sf-hawks' });
    for (const s of varsity.jvAffiliations[0].sources) s.statedClassYear = null;
    expect(refusals(varsity)).toEqual(['jvAffiliations.0: los-gatos / Lizzie Moorehouse is also in affiliations']);
    varsity.affiliations.splice(at('Lizzie Moorehouse'), 1);
    expect(loadError(varsity)).toMatch(/los-gatos \/ Lizzie Moorehouse \(sf-hawks\): not a JV row: jvAffiliations list JV rows only/);
    const club = structuredClone(raw);
    club.jvAffiliations[0].club = 'nope';
    expect(loadError(club)).toContain('jvAffiliations.0.club: nope is not a club in clubs[]');
    const twice = structuredClone(raw);
    twice.jvAffiliations.push(structuredClone(twice.jvAffiliations[0]));
    expect(refusals(twice)).toEqual(['jvAffiliations.4: duplicate JV affiliation: los-gatos / Casey Moorehouse / norcal-impact']);
    const year = structuredClone(raw);
    year.jvAffiliations[0].sources[0].statedClassYear = 2027;
    expect(loadError(year)).toMatch(/Casey Moorehouse \(norcal-impact\): sportsrecruits source says class of 2027, the roster shows grade 9/);
  });

  it('refuses a team the rosters do not hold', () => {
    expect(loadError(raw, teams.filter((t) => t.slug !== 'st-ignatius'))).toMatch(/st-ignatius \/ .*: no such team in rosters\.json/);
  });

  it('refuses a file for another season', () => {
    expect(loadError({ ...structuredClone(raw), season: '25-26' })).toBe(`clubs.json is for season 25-26, rosters for ${season}`);
    expect(loadError(raw, teams, '25-26')).toMatch(/season/);
    expect(refusals({ ...structuredClone(raw), season: '2026-27' })).toEqual(['season: expected a season like 26-27']);
  });

  it('refuses a social-media page anywhere: a source, a website, a program or roster page', () => {
    const club = raw.clubs.findIndex((c) => c.programs.length > 0 && c.website !== null);
    const source = structuredClone(raw);
    source.affiliations[2].sources[0].url = 'https://www.instagram.com/p/abc123/';
    expect(refusals(source)).toEqual(['affiliations.2.sources.0.url: social media is not a source']);
    expect(loadError(source)).toContain('affiliations.2.sources.0.url: social media is not a source');
    const website = structuredClone(raw);
    website.clubs[club].website = 'https://www.facebook.com/someclub';
    expect(refusals(website)).toEqual([`clubs.${club}.website: social media is not a source`]);
    const program = structuredClone(raw);
    program.clubs[club].programs[0].source = 'https://x.com/someclub/status/1';
    expect(refusals(program)).toEqual([`clubs.${club}.programs.0.source: social media is not a source`]);
    const roster = structuredClone(raw);
    roster.clubs[club].rosterPages.push('https://www.tiktok.com/@someclub');
    expect(refusals(roster)).toEqual([`clubs.${club}.rosterPages.${roster.clubs[club].rosterPages.length - 1}: social media is not a source`]);
    const clubSource = structuredClone(raw);
    clubSource.clubs[club].sources[0].url = 'https://twitter.com/someclub';
    expect(refusals(clubSource)).toEqual([`clubs.${club}.sources.0.url: social media is not a source`]);
  });

  it('refuses a URL that is not https', () => {
    const club = raw.clubs.findIndex((c) => c.website !== null);
    const http = structuredClone(raw);
    http.clubs[club].website = http.clubs[club].website!.replace(/^https:/, 'http:');
    expect(refusals(http)).toEqual([`clubs.${club}.website: expected an https URL`]);
    const junk = structuredClone(raw);
    junk.affiliations[0].sources[0].url = 'javascript:alert(1)';
    expect(refusals(junk)).toEqual(['affiliations.0.sources.0.url: expected an https URL']);
  });

  it('refuses a duplicate club slug and a duplicate affiliation', () => {
    const club = structuredClone(raw);
    club.clubs.push(structuredClone(club.clubs[1]));
    expect(refusals(club)).toEqual([`clubs.${raw.clubs.length}.slug: duplicate club slug ${raw.clubs[1].slug}`]);
    const aff = structuredClone(raw);
    aff.affiliations.push(structuredClone(aff.affiliations[0]));
    expect(refusals(aff)).toEqual([
      `affiliations.${raw.affiliations.length}: duplicate affiliation: st-ignatius / Caitlyn Hughes / sf-hawks`,
    ]);
    // The same player at a second club is not a duplicate.
    const second = structuredClone(raw);
    second.affiliations.push({ ...structuredClone(second.affiliations[0]), club: 'pac-heights' });
    expect(refusals(second)).toEqual([]);
  });

  it('refuses an affiliation or a club with no source', () => {
    const aff = structuredClone(raw);
    aff.affiliations[0].sources = [];
    expect(refusals(aff)).toEqual(['affiliations.0.sources: an affiliation needs at least one source']);
    const club = structuredClone(raw);
    club.clubs[0].sources = [];
    expect(refusals(club)).toEqual(['clubs.0.sources: a club needs at least one source']);
  });

  it('refuses an asOf in no known shape', () => {
    for (const asOf of ['2025/26', '2025-27', '2018-2015', 'last fall']) {
      const bad = structuredClone(raw);
      bad.affiliations[0].asOf = asOf;
      expect(refusals(bad), asOf).toHaveLength(1);
      expect(refusals(bad)[0], asOf).toMatch(/^affiliations\.0\.asOf: /);
    }
  });

  it('refuses a quote over 300 characters, and an empty one', () => {
    const at300 = structuredClone(raw);
    at300.affiliations[0].sources[0].quote = 'x'.repeat(300);
    expect(refusals(at300)).toEqual([]);
    const over = structuredClone(raw);
    over.affiliations[0].sources[0].quote = 'x'.repeat(301);
    expect(refusals(over)).toHaveLength(1);
    expect(refusals(over)[0]).toMatch(/^affiliations\.0\.sources\.0\.quote: /);
    const empty = structuredClone(raw);
    empty.affiliations[0].sources[0].quote = '';
    expect(refusals(empty)[0]).toMatch(/^affiliations\.0\.sources\.0\.quote: /);
  });

  it('refuses a status, kind, confidence or region outside its list, and a team outside the registry', () => {
    const cases: Array<[string, (f: ClubsFile) => void]> = [
      ['affiliations.0.status', (f) => ((f.affiliations[0] as { status: string }).status = 'former')],
      ['affiliations.0.sources.0.kind', (f) => ((f.affiliations[0].sources[0] as { kind: string }).kind = 'instagram')],
      ['affiliations.0.confidence', (f) => ((f.affiliations[0] as { confidence: string }).confidence = 'low')],
      ['clubs.0.region', (f) => ((f.clubs[0] as { region: string }).region = 'las-vegas')],
      ['affiliations.0.teamSlug', (f) => (f.affiliations[0].teamSlug = 'not-a-school')],
    ];
    for (const [where, edit] of cases) {
      const bad = structuredClone(raw);
      edit(bad);
      expect(refusals(bad).map((r) => r.split(':')[0]), where).toEqual([where]);
    }
  });
});
