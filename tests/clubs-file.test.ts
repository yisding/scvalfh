/**
 * data/clubs.json (SPEC §1.1j2, DESIGN §16): the committed file validates and holds every
 * load-time invariant; lib/clubs.ts serves it in display order (DESIGN §16.5); and a bad file —
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
  isHttpsUrl,
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
  getPlayerClubs,
  getTeamClubAffiliations,
  loadClubs,
} from '../lib/clubs';
import { LEAGUES } from '../lib/leagues';
import { classOf, getAllEnrichedRosters, getRosters } from '../lib/rosters';
import { getTeamBySlug } from '../lib/teams';
import { REPO } from './helpers';

const raw = JSON.parse(readFileSync(path.join(REPO, 'data', 'clubs.json'), 'utf8')) as ClubsFile;
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

  describe('as researched 2026-10-03 (changes only with a new sweep)', () => {
    const players = new Set(raw.affiliations.map((a) => `${a.teamSlug} ${a.athleteId}`));
    const schools = new Set(raw.affiliations.map((a) => a.teamSlug));

    it('holds 13 clubs and 67 affiliations: 61 of the 716 varsity rows, at 20 of the 43 schools', () => {
      expect(raw.clubs).toHaveLength(13);
      expect(raw.affiliations).toHaveLength(67);
      expect(players.size).toBe(61);
      expect(schools.size).toBe(20);
      const rows = teams.flatMap((t) => t.players.map((p) => ({ team: t.slug, level: p.level })));
      expect(rows).toHaveLength(745);
      expect(rows.filter((r) => r.level === 'jv')).toHaveLength(29);
      expect(new Set(rows.filter((r) => r.level === 'jv').map((r) => r.team))).toEqual(new Set(['los-gatos']));
      expect(teams).toHaveLength(43);
    });

    it('counts 52 current, 11 past and 4 unknown; 52 high and 15 medium', () => {
      expect(countBy(raw.affiliations, (a) => a.status)).toEqual({ current: 52, past: 11, unknown: 4 });
      expect(countBy(raw.affiliations, (a) => a.confidence)).toEqual({ high: 52, medium: 15 });
      expect(raw.affiliations.filter((a) => a.status === 'unknown').map((a) => a.fullName).sort()).toEqual([
        'Colette Boyd',
        'Gabrielle Moll',
        'Riya Mehrotra',
        'Ruhee Bhatnagar',
      ]);
    });

    it('rests on 181 source entries on 91 distinct pages, by kind', () => {
      // An entry is one page backing one tie: a club roster or a news story naming several players
      // is one page and several entries, so README §Clubs and DATA-SOURCES §1.1j2 give both counts.
      const sources = raw.affiliations.flatMap((a) => a.sources);
      expect(sources).toHaveLength(181);
      expect(new Set(sources.map((s) => s.url)).size).toBe(91);
      expect(countBy(sources, (s) => s.kind)).toEqual({
        sportsrecruits: 53,
        'club-site': 49,
        news: 33,
        ncsa: 22,
        'maxpreps-career': 13,
        other: 8,
        hudl: 1,
        event: 1,
        'school-site': 1,
      });
      const kinds = Object.keys(countBy(sources, (s) => s.kind));
      const pagesOf = (kind: string) => new Set(sources.filter((s) => s.kind === kind).map((s) => s.url)).size;
      expect(Object.fromEntries(kinds.map((k) => [k, pagesOf(k)]))).toEqual({
        sportsrecruits: 32,
        'club-site': 16,
        news: 6,
        ncsa: 19,
        'maxpreps-career': 13,
        other: 3,
        hudl: 1,
        event: 1,
        'school-site': 1,
      });
      // The one page filed under two kinds (news for four players, other for two), hence 92 by kind.
      const urls = [...new Set(sources.map((s) => s.url))];
      const kindsAt = (url: string) => new Set(sources.filter((s) => s.url === url).map((s) => s.kind));
      expect(urls.filter((url) => kindsAt(url).size > 1)).toEqual(['https://www.sticktogetherfh.com/all-league-2025/']);
      expect(new Set(raw.clubs.flatMap((c) => c.sources.map((s) => s.url))).size).toBe(68);
      expect(raw.clubs.flatMap((c) => c.sources)).toHaveLength(73);
    });

    it('ties players to six clubs, and none to the other seven', () => {
      const byClub = Object.fromEntries(
        raw.clubs
          .map((c) => [c.slug, raw.affiliations.filter((a) => a.club === c.slug)] as const)
          .filter(([, list]) => list.length > 0)
          .map(([slug, list]) => [slug, { ...{ current: 0, past: 0, unknown: 0 }, ...countBy(list, (a) => a.status) }]),
      );
      expect(byClub).toEqual({
        'sf-hawks': { current: 30, past: 0, unknown: 0 },
        'norcal-impact': { current: 17, past: 0, unknown: 0 },
        'fly-fhc': { current: 2, past: 4, unknown: 2 },
        infinity: { current: 1, past: 6, unknown: 1 },
        lightning: { current: 1, past: 1, unknown: 1 },
        htc: { current: 1, past: 0, unknown: 0 },
      });
      expect(raw.clubs.filter((c) => !byClub[c.slug]).map((c) => c.slug).sort()).toEqual([
        'golden-gate-rippers',
        'hayward-hawks',
        'lions',
        'pac-heights',
        'performance-fh',
        'sj-khalsa',
        'stryker',
      ]);
    });

    it('places the clubs by region, with none on the Peninsula, the Central Coast or in Sacramento', () => {
      expect(countBy(raw.clubs, (c) => c.region)).toEqual({
        'san-francisco': 2,
        'south-bay': 7,
        'east-bay': 2,
        marin: 1,
        elsewhere: 1,
      });
    });

    it('finds players in three of the four leagues', () => {
      const byLeague = Object.fromEntries(
        LEAGUES.map((l) => {
          const inLeague = raw.affiliations.filter((a) => getTeamBySlug(a.teamSlug)!.league === l.id);
          return [
            l.id,
            [new Set(inLeague.map((a) => `${a.teamSlug} ${a.athleteId}`)).size, new Set(inLeague.map((a) => a.teamSlug)).size],
          ];
        }),
      );
      expect(byLeague).toEqual({ scval: [28, 10], bval: [16, 6], pcal: [0, 0], mcal: [17, 4] });
    });
  });
});

describe('lib/clubs.ts', () => {
  it('orders clubs by region, then most tied players, then display name (DESIGN §16.5)', () => {
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
      'htc',
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
    expect(hawks).toHaveLength(30);
    expect(hawks).toEqual(raw.affiliations.filter((a) => a.club === 'sf-hawks'));
    expect(getClubAffiliations('pac-heights')).toEqual([]);
    expect(getClubAffiliations('nope')).toEqual([]);
    const total = getClubSlugs().reduce((n, slug) => n + getClubAffiliations(slug).length, 0);
    expect(total).toBe(raw.affiliations.length);
  });

  it('serves a team\'s affiliations', () => {
    const si = getTeamClubAffiliations('st-ignatius');
    expect(si).toHaveLength(13);
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

  it('names the six areas notes[] says were searched', () => {
    expect(SEARCHED_REGIONS).toEqual(['san-francisco', 'peninsula', 'south-bay', 'east-bay', 'marin', 'central-coast']);
    for (const r of SEARCHED_REGIONS) expect(CLUB_REGIONS).toContain(r);
  });
});

describe('lib/clubs-schema.ts helpers', () => {
  it('isBannedHost matches a social host or its subdomain, never a substring', () => {
    expect(isBannedHost('https://www.instagram.com/p/abc')).toBe(true);
    expect(isBannedHost('https://x.com/club')).toBe(true);
    expect(isBannedHost('https://m.facebook.com/club')).toBe(true);
    expect(isBannedHost('https://www.tiktok.com/@club')).toBe(true);
    expect(isBannedHost('https://twitter.com/club')).toBe(true);
    expect(isBannedHost('https://www.maxpreps.com/ca/')).toBe(false);
    expect(isBannedHost('https://notx.com/')).toBe(false);
    expect(isBannedHost('https://x.com.example.org/')).toBe(false);
    expect(isBannedHost('not a url')).toBe(false);
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
    expect(msg).toContain(`clubs: st-ignatius / Caitlyn Hughes (sf-hawks): news source says class of ${classOf(season, row.grade!) + 1}, the roster shows grade ${row.grade}`);
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
      ['clubs.0.region', (f) => ((f.clubs[0] as { region: string }).region = 'los-angeles')],
      ['affiliations.0.teamSlug', (f) => (f.affiliations[0].teamSlug = 'not-a-school')],
    ];
    for (const [where, edit] of cases) {
      const bad = structuredClone(raw);
      edit(bad);
      expect(refusals(bad).map((r) => r.split(':')[0]), where).toEqual([where]);
    }
  });
});
