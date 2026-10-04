/**
 * Id-first si.com side resolution (SPEC §7.9, owner decision D2 rule 7).
 *
 * The four statewide namesakes — University (Irvine 458756 / San Francisco 456869), Los Altos
 * (Hacienda Heights 458731 / Los Altos 458850), Santa Clara (Oxnard 456804 / Santa Clara 496839) and
 * Davis (Modesto 458828 / Davis 458605) — must NEVER resolve by name; a registry team resolves by its si.com team id or school id. Ported from
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
import { TEAMS, normalizeTeamKey } from '../lib/teams';

const DIR = path.join(__dirname, 'fixtures/sblive/identity');
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
  it('lists exactly the four statewide namesakes', () => {
    expect([...STATEWIDE_AMBIGUOUS].sort()).toEqual(['davis', 'losaltos', 'santaclara', 'university']);
    expect(STATEWIDE_AMBIGUOUS.has(normalizeTeamKey('Los Altos High School'))).toBe(true);
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
    // No row on these three Southern California pages is one of our 49 teams.
    expect(refs.filter((r) => r.slug !== null)).toEqual([]);
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
