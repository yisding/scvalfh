/**
 * Id-first si.com side resolution (SPEC §7.9, owner decision D2 rule 7).
 *
 * The statewide namesakes — University (Irvine 458756 / San Francisco 456869), Los Altos
 * (Hacienda Heights 458731 / Los Altos 458850), Santa Clara (Oxnard 456804 / Santa Clara 496839) and
 * Davis (Modesto 458828 / Davis 458605), and since the Southern California seeds Westview, Del Norte,
 * Marina, San Marcos, Mission Vista, Granite Hills and Southwest (si.com's team search, 2026-10-06:
 * tests/fixtures/seeds/registry-seed-ss.json and registry-seed-sds.json, sbliveIdentity.nameSearch) —
 * must NEVER resolve by name; a registry team resolves by its si.com team id or school id. Ported from
 * the research draft (tests/fixtures/sblive/identity/sblive-identity.test.draft.ts.txt, prototype in
 * proto-resolver.ts.txt) and run against the captured si.com pages in tests/fixtures/sblive/identity/.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { DATA_QUALITY } from '../lib/leagues';
import {
  STATEWIDE_AMBIGUOUS,
  extractReactProps,
  harvestTeamWebPaths,
  parseScoresPage,
  parseStandingsTeamRefs,
  parseTeamGamesPage,
  resolveSbliveSide,
  sbliveIdsFrom,
} from '../lib/sources/sblive';
import { TEAMS, getTeamBySlug, normalizeTeamKey } from '../lib/teams';
import { REPO } from './helpers';

const DIR = path.join(REPO, 'tests', 'fixtures', 'sblive', 'identity');
const read = (file: string) => readFileSync(path.join(DIR, file), 'utf8');

const IMG_SCHOOL = (id: string) => `https://assets.scorebooklive.com/uploads/production/school/${id}/image/x.png`;
const IMG_TEAM = (id: string) => `https://assets.scorebooklive.com/uploads/production/team/${id}-v3/image/x.png`;

function escapeAttr(json: string): string {
  return json.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function page(className: string, props: unknown): string {
  return `<div data-react-class="${className}" data-react-props="${escapeAttr(JSON.stringify(props))}"></div>`;
}

const teamNode = (over: Record<string, unknown> = {}) => ({
  id: '6528121',
  date: '2026-09-23T16:00:00.000-07:00',
  statusId: 3,
  webPath: '/california/field-hockey/games/6528121-cupertino-vs-los-altos',
  featured: {
    isHome: true,
    scoreText: '4',
    team: { name: 'Los Altos', webPath: '/california/field-hockey/teams/458850-los-altos-eagles' },
  },
  opponent: {
    scoreText: '0',
    isHome: false,
    team: { name: 'Cupertino', webPath: '/california/field-hockey/teams/458665-cupertino-pioneers' },
  },
  ...over,
});

const teamGamesProps = (nodes: unknown[]) => ({
  query: {
    team: { id: '458850', name: 'Los Altos', webPath: '/california/field-hockey/teams/458850-los-altos-eagles', games: { nodes } },
  },
  variables: {},
  application: {},
});

const scoreboard = (teams: Array<{ name: string; image: string | null }>) =>
  page('games/GenderSportIndex', {
    query: {
      scoreboardDate: {
        date: '2026-09-23',
        games: {
          totalCount: 1,
          nodes: [
            {
              id: '1',
              date: '2026-09-23T16:00:00.000-07:00',
              statusId: 3,
              webPath: null,
              gameTeams: teams.map((t, i) => ({
                scoreText: String(i),
                isTbd: false,
                team: { name: t.name, image: t.image, state: { abbrev: 'CA' } },
              })),
            },
          ],
        },
      },
    },
  });

describe('sblive identity: the resolver, step by step', () => {
  it('lists exactly the eleven statewide namesakes', () => {
    expect([...STATEWIDE_AMBIGUOUS].sort()).toEqual([
      'davis', 'delnorte', 'granitehills', 'losaltos', 'marina', 'missionvista', 'sanmarcos', 'santaclara',
      'southwest', 'university', 'westview',
    ]);
    expect(STATEWIDE_AMBIGUOUS.has(normalizeTeamKey('Los Altos High School'))).toBe(true);
  });

  it('lists every namesake the SoCal si.com name search found, and each is a registry team', () => {
    const searched = ['registry-seed-ss.json', 'registry-seed-sds.json'].flatMap((file) => {
      const seed = JSON.parse(readFileSync(path.join(REPO, 'tests', 'fixtures', 'seeds', file), 'utf8')) as {
        sbliveIdentity: { nameSearch: { namesakes: Record<string, string> } };
      };
      return Object.keys(seed.sbliveIdentity.nameSearch.namesakes);
    });
    expect(searched.sort()).toEqual([
      'del-norte', 'granite-hills', 'marina', 'mission-vista', 'san-marcos', 'southwest', 'westview',
    ]);
    for (const slug of searched) {
      const t = getTeamBySlug(slug)!;
      expect(t, slug).toBeDefined();
      expect(STATEWIDE_AMBIGUOUS.has(normalizeTeamKey(t.name)), slug).toBe(true);
    }
    // si.com calls our Southwest "Southwest SD", a unique name; bare "Southwest" is El Centro's (583246).
    expect(resolveSbliveSide({ name: 'Southwest SD' })).toEqual({ slug: 'southwest', via: 'name' });
    expect(resolveSbliveSide({ name: 'Southwest' })).toEqual({ slug: null, via: null, refused: 'ambiguous-name' });
  });

  it('reads the team id from a web path, then a raw id, then a team-logo URL; the school id from a school logo', () => {
    expect(sbliveIdsFrom({ name: 'x', webPath: '/california/field-hockey/teams/458850-los-altos-eagles', rawId: 1 })).toEqual({ teamId: '458850', schoolId: null });
    expect(sbliveIdsFrom({ name: 'x', rawId: 456869, image: IMG_TEAM('1') })).toEqual({ teamId: '456869', schoolId: null });
    expect(sbliveIdsFrom({ name: 'x', image: IMG_TEAM('458850') })).toEqual({ teamId: '458850', schoolId: null });
    expect(sbliveIdsFrom({ name: 'x', image: IMG_SCHOOL('259') })).toEqual({ teamId: null, schoolId: '259' });
    expect(sbliveIdsFrom({ name: 'x' })).toEqual({ teamId: null, schoolId: null });
  });

  // The prototype's 14 regression cases (name, si.com team id, si.com school id → slug), plus Davis.
  const cases: Array<[string, string | null, string | null, string | null]> = [
    ['University', '458756', null, null],
    ['University', '999999', null, null],
    ['University', null, '11359', null],
    ['University', null, null, null],
    ['University', '456869', null, 'university-sf'],
    ['University', null, '259', 'university-sf'],
    ['Los Altos', '458731', null, null],
    ['Los Altos', null, '11179', null],
    ['Los Altos', '458850', null, 'los-altos'],
    ['Santa Clara', '456804', null, null],
    ['Santa Clara', null, '111', null],
    ['Santa Clara', '496839', null, 'santa-clara'],
    ['Tamalpais', null, null, 'tamalpais'],
    ['Convent & Stuart Hall', null, '6922', 'convent-sacred-heart'],
    ['Davis', '458828', null, null],
    ['Davis', null, null, null],
    ['Davis', '458605', null, 'davis'],
    ['Davis', null, '10575', 'davis'],
    // The Southern California namesakes (si.com team search, 2026-10-06).
    ['Westview', '464882', null, null],
    ['Westview', null, null, null],
    ['Westview', '458949', null, 'westview'],
    ['Westview', null, '12673', 'westview'],
    ['Del Norte', '458609', null, null],
    ['Del Norte', null, '10601', null],
    ['Del Norte', null, null, null],
    ['Del Norte', '458937', null, 'del-norte'],
    ['Marina', '500865', null, null],
    ['Marina', null, '12097', null],
    ['Marina', null, '11317', 'marina'],
    ['San Marcos', '459073', null, null],
    ['San Marcos', '459066', null, 'san-marcos'],
    ['Mission Vista', '480754', null, null],
    ['Mission Vista', '464852', null, 'mission-vista'],
    ['Granite Hills', '554634', null, null],
    ['Granite Hills', '458466', null, null],
    ['Granite Hills', '458713', null, 'granite-hills'],
    ['Southwest', '583246', null, null],
    ['Southwest', null, '32018', null],
    ['Southwest SD', '459138', null, 'southwest'],
  ];
  it.each(cases)('%s (team %s, school %s) → %s', (name, teamId, schoolId, want) => {
    const r = resolveSbliveSide({ name, rawId: teamId, image: schoolId ? IMG_SCHOOL(schoolId) : null });
    expect(r.slug).toBe(want);
    if (want === null) expect(r.refused).toBeDefined();
  });

  it('says HOW each side resolved', () => {
    expect(resolveSbliveSide({ name: 'University', rawId: '456869' })).toEqual({ slug: 'university-sf', via: 'team-id' });
    expect(resolveSbliveSide({ name: 'University', image: IMG_SCHOOL('259') })).toEqual({ slug: 'university-sf', via: 'school-id' });
    expect(resolveSbliveSide({ name: 'Tamalpais' })).toEqual({ slug: 'tamalpais', via: 'name' });
    expect(resolveSbliveSide({ name: 'University' })).toEqual({ slug: null, via: null, refused: 'ambiguous-name' });
    expect(resolveSbliveSide({ name: 'Tamalpais', image: IMG_SCHOOL('99999') })).toEqual({ slug: null, via: null, refused: 'id-contradicts-name' });
    expect(resolveSbliveSide({ name: 'Woodbridge' })).toEqual({ slug: null, via: null, refused: 'unknown' });
  });

  it('never resolves a JV-only or withdrawn si.com team, whatever its name says (step 0)', () => {
    for (const id of Object.keys(DATA_QUALITY.sbliveIgnoredTeamIds)) {
      expect(resolveSbliveSide({ name: 'Tamalpais', rawId: id })).toEqual({ slug: null, via: null, refused: 'ignored-team' });
    }
  });

  it('resolves every registry team with a recorded si.com id by that id, and by its school id when recorded', () => {
    for (const t of TEAMS) {
      if (t.external.sbliveTeamId) {
        expect(resolveSbliveSide({ name: 'Anything', rawId: t.external.sbliveTeamId }), t.slug).toEqual({ slug: t.slug, via: 'team-id' });
      }
      if (t.external.sbliveSchoolId) {
        expect(resolveSbliveSide({ name: t.name, image: IMG_SCHOOL(t.external.sbliveSchoolId) }), t.slug).toEqual({ slug: t.slug, via: 'school-id' });
      }
    }
  });
});

describe('sblive identity: statewide namesakes never resolve by name (parsers)', () => {
  it('a team-games side named "University" whose webPath id is not 456869 resolves to null', () => {
    const node = teamNode({
      opponent: { scoreText: '2', isHome: false, team: { name: 'University', webPath: '/california/field-hockey/teams/458756-university-trojans' } },
    });
    const [game] = parseTeamGamesPage(page('teams/Games', teamGamesProps([node])));
    const side = game.sides.find((s) => s.name === 'University');
    expect(side?.sbliveTeamId).toBe('458756');
    expect(side?.slug).toBeNull();
  });

  it('…and with webPath id 456869 resolves to university-sf', () => {
    const node = teamNode({
      opponent: { scoreText: '2', isHome: false, team: { name: 'University', webPath: '/california/field-hockey/teams/456869-university-red-devils' } },
    });
    const [game] = parseTeamGamesPage(page('teams/Games', teamGamesProps([node])));
    expect(game.sides.find((s) => s.name === 'University')?.slug).toBe('university-sf');
  });

  it('standings refs: the Irvine/Hacienda/Oxnard namesakes resolve to null', () => {
    const html = page('organizations/Standings', {
      query: {
        organization: {
          teamStandings: [
            { team: { id: '458756', name: 'University', webPath: '/california/field-hockey/teams/458756-university-trojans', image: IMG_SCHOOL('11359') } },
            { team: { id: '458731', name: 'Los Altos', webPath: '/california/field-hockey/teams/458731-los-altos-conquerors', image: IMG_SCHOOL('11179') } },
            { team: { id: '456804', name: 'Santa Clara', webPath: '/california/field-hockey/teams/456804-santa-clara-saints', image: IMG_SCHOOL('111') } },
          ],
        },
      },
    });
    expect(parseStandingsTeamRefs(html).map((r) => r.slug)).toEqual([null, null, null]);
  });

  it('scoreboard (no id, no webPath): identity comes from the image URL only', () => {
    const cases: Array<[string, string | null, string | null]> = [
      ['University', IMG_SCHOOL('11359'), null],
      ['University', IMG_SCHOOL('259'), 'university-sf'],
      ['University', null, null],
      ['Los Altos', IMG_SCHOOL('11179'), null],
      ['Los Altos', IMG_TEAM('458850'), 'los-altos'],
      ['Los Altos', null, null],
      ['Santa Clara', IMG_SCHOOL('111'), null],
      ['Santa Clara', IMG_SCHOOL('13089'), 'santa-clara'],
      ['Santa Clara', null, null],
    ];
    for (const [name, image, want] of cases) {
      const [game] = parseScoresPage(scoreboard([{ name, image }, { name: 'Woodbridge', image: IMG_SCHOOL('11360') }]));
      expect(game.sides.find((s) => s.name === name)?.slug, `${name} ${image}`).toBe(want);
    }
  });

  it('a non-ambiguous registry name still resolves with no id signal', () => {
    const [game] = parseScoresPage(scoreboard([{ name: 'Tamalpais', image: null }, { name: 'Woodbridge', image: null }]));
    expect(game.sides.find((s) => s.name === 'Tamalpais')).toMatchObject({ slug: 'tamalpais', via: 'name' });
  });

  it('a non-ambiguous name with a CONTRADICTING id resolves to null', () => {
    const [game] = parseScoresPage(scoreboard([{ name: 'Tamalpais', image: IMG_SCHOOL('99999') }, { name: 'X', image: null }]));
    expect(game.sides.find((s) => s.name === 'Tamalpais')?.slug).toBeNull();
  });
});

describe('sblive identity: the captured si.com pages', () => {
  it('league standings pages: University (Irvine), Los Altos (Hacienda Heights), Santa Clara (Oxnard) never become ours', () => {
    const refs = [
      ...parseStandingsTeamRefs(read('standings-4230-pacific-coast.html')),
      ...parseStandingsTeamRefs(read('standings-4200-hacienda.html')),
      ...parseStandingsTeamRefs(read('standings-4250-tri-county-athletic.html')),
    ];
    const namesakes = refs.filter((r) => ['University', 'Los Altos', 'Santa Clara'].includes(r.name));
    expect(namesakes.map((r) => r.sbliveTeamId).sort()).toEqual(['456804', '458731', '458756']);
    expect(namesakes.every((r) => r.slug === null)).toBe(true);
    // These three Southern California league pages (si.com's Pacific Coast, Hacienda and Tri-County
    // Athletic) list 22 teams, none of them one of our 99: no Sunset team and no San Diego Section
    // team plays in those leagues, so adding the SoCal registry changes nothing here.
    expect(refs).toHaveLength(22);
    expect(refs.filter((r) => r.slug !== null)).toEqual([]);
    const registryIds = new Set(TEAMS.map((t) => t.external.sbliveTeamId).filter(Boolean));
    expect(refs.filter((r) => r.sbliveTeamId !== null && registryIds.has(r.sbliveTeamId))).toEqual([]);
  });

  it('the namesakes’ own team pages resolve to null; ours resolve by team id', () => {
    const own = (file: string) => harvestTeamWebPaths(read(file))[0];
    expect(own('games-458756-university-trojans.html')).toMatchObject({ sbliveTeamId: '458756', slug: null });
    expect(own('games-456804-santa-clara-saints.html')).toMatchObject({ sbliveTeamId: '456804', slug: null });
    expect(own('games-456869-university-red-devils.html')).toMatchObject({ sbliveTeamId: '456869', slug: 'university-sf', via: 'team-id' });
    expect(own('games-458850-los-altos-eagles.html')).toMatchObject({ sbliveTeamId: '458850', slug: 'los-altos', via: 'team-id' });
    expect(own('games-496839-santa-clara-bruins.html')).toMatchObject({ sbliveTeamId: '496839', slug: 'santa-clara', via: 'team-id' });
  });

  it('the Hacienda Heights Los Altos page is not a team-games page at all (si.com served its article index)', () => {
    expect(extractReactProps(read('games-458731-los-altos-conquerors.html'), 'teams/Games')).toEqual([]);
  });

  it('team pages: every game row of ours resolves both featured sides by id', () => {
    for (const [file, slug] of [
      ['games-456869-university-red-devils.html', 'university-sf'],
      ['games-458850-los-altos-eagles.html', 'los-altos'],
      ['games-496839-santa-clara-bruins.html', 'santa-clara'],
    ] as const) {
      const games = parseTeamGamesPage(read(file));
      expect(games.length, file).toBeGreaterThan(0);
      for (const g of games) {
        const mine = g.sides.find((s) => s.slug === slug);
        expect(mine, `${file} ${g.sbliveGameId}`).toBeDefined();
        expect(mine?.via).toBe('team-id');
      }
    }
  });

  it('scoreboards: our namesakes resolve through their logo ids, never by name', () => {
    const sides = [...parseScoresPage(read('scores-2026-09-23.html')), ...parseScoresPage(read('scores-2026-09-30.html'))].flatMap((g) => g.sides);
    const named = (n: string) => sides.filter((s) => s.name === n);
    expect(named('University').length).toBeGreaterThan(0);
    for (const s of named('University')) expect(s).toMatchObject({ slug: 'university-sf', via: 'school-id', sbliveSchoolId: '259' });
    expect(named('Los Altos').length).toBeGreaterThan(0);
    for (const s of named('Los Altos')) expect(s).toMatchObject({ slug: 'los-altos', via: 'team-id', sbliveTeamId: '458850' });
    for (const s of named('Tamalpais')) expect(s).toMatchObject({ slug: 'tamalpais', via: 'school-id' });
    // Davis (an EAL team; Modesto has a Davis too) resolves through its school logo id only.
    expect(named('Davis').length).toBeGreaterThan(0);
    for (const s of named('Davis')) expect(s).toMatchObject({ slug: 'davis', via: 'school-id', sbliveSchoolId: '10575' });
    // Nothing ever resolves by name on a scoreboard to one of the namesakes.
    expect(sides.filter((s) => s.via === 'name' && STATEWIDE_AMBIGUOUS.has(normalizeTeamKey(s.name)))).toEqual([]);
  });

  it('scoreboards: the Southern California sides resolve to our teams through their logo ids', () => {
    const sides = [...parseScoresPage(read('scores-2026-09-23.html')), ...parseScoresPage(read('scores-2026-09-30.html'))].flatMap((g) => g.sides);
    const socal = new Set(TEAMS.slice(49).map((t) => t.slug));
    const ours = sides.filter((s) => s.slug !== null && socal.has(s.slug));
    // Every SoCal side on the two captured scoreboards that resolves does so by a si.com id.
    expect(ours.length).toBeGreaterThan(0);
    expect(ours.every((s) => s.via === 'school-id' || s.via === 'team-id')).toBe(true);
    expect(new Set(ours.map((s) => s.slug))).toEqual(new Set([
      'chaparral', 'clairemont', 'el-capitan', 'fountain-valley', 'huntington-beach', 'la-costa-canyon',
      'la-jolla-country-day', 'mission-bay', 'olympian', 'otay-ranch', 'sage-creek', 'southwest', 'hilltop', 'vista',
      'newport-harbor', 'edison', 'marina', 'westview', 'mission-hills', 'valley-center', 'del-norte', 'escondido',
      'san-pasqual', 'glendora', 'harvard-westlake', 'thousand-oaks',
    ]));
    expect(sides.find((s) => s.name === 'Southwest SD')).toMatchObject({ slug: 'southwest', via: 'school-id', sbliveSchoolId: '13422' });
    expect(sides.find((s) => s.name === 'Del Norte')).toMatchObject({ slug: 'del-norte', via: 'school-id', sbliveSchoolId: '12669' });
    expect(sides.find((s) => s.name === 'Marina')).toMatchObject({ slug: 'marina', via: 'school-id', sbliveSchoolId: '11317' });
    // Sep 30 lists Westview–Sage Creek twice: once with our Westview's school logo (12673), once with
    // no logo at all (si.com's West Los Angeles Westview, 464882, carries that game). Only the first is ours.
    const westviews = sides.filter((s) => s.name === 'Westview');
    expect(westviews.map((s) => [s.slug, s.via, s.refused ?? null])).toEqual([
      ['westview', 'school-id', null],
      [null, null, 'ambiguous-name'],
    ]);
    // The LA independents are registry teams now (DESIGN §24.9), resolved by their si.com ids too.
    for (const [name, slug] of [['Harvard-Westlake', 'harvard-westlake'], ['Thousand Oaks', 'thousand-oaks'], ['Glendora', 'glendora']]) {
      const found = sides.filter((x) => x.name === name);
      expect(found.length, name).toBeGreaterThan(0);
      for (const s of found) expect([s.slug, s.via === 'school-id' || s.via === 'team-id'], name).toEqual([slug, true]);
    }
  });

  it('a game page’s participant ids resolve both MCAL sides (Convent & Stuart Hall 512325, Tamalpais 486964)', () => {
    const [block] = extractReactProps(read('game-6181025.html'), 'games/Show');
    const participants = (block.props as { query: { game: { contest: { contestParticipants: Array<{ participant: { id: string } }> } } } })
      .query.game.contest.contestParticipants;
    expect(participants.map((p) => resolveSbliveSide({ name: null, rawId: p.participant.id }).slug)).toEqual([
      'convent-sacred-heart',
      'tamalpais',
    ]);
  });
});
