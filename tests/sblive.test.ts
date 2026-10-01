/**
 * lib/sources/sblive.ts — the si.com (ex-SBLive) client.
 *
 * Fixtures are inline `data-react-props` snippets, HTML-escaped exactly the way si.com escapes
 * them, so the unescape → raw_decode → zod path is exercised end to end. Field names and shapes are
 * copied verbatim from the live captures of
 *   .../teams/458850-los-altos-eagles/games          (class "teams/Games")
 *   .../scores?date=2026-09-23                       (class "games/GenderSportIndex")
 *   .../leagues/4242-santa-clara-valley-de-anza/...   (class "organizations/Standings")
 */

import { describe, expect, it } from 'vitest';

import {
  dedupeSbliveGames,
  extractReactProps,
  harvestTeamWebPaths,
  parseJsonPrefix,
  parseScoresPage,
  parseStandingsTeamRefs,
  parseTeamGamesPage,
  sbliveGameKey,
  sbliveIdFromWebPath,
  sbliveScoresUrl,
  sbliveTeamGamesUrl,
} from '../lib/sources/sblive';
import { htmlUnescape } from '../lib/sources/http';

/** The escaping si.com actually applies to the attribute value. */
function escapeAttr(json: string): string {
  return json.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function page(className: string, props: unknown): string {
  return (
    '<!DOCTYPE html><html><body>\n' +
    `<div data-react-class="${className}" data-react-props="${escapeAttr(JSON.stringify(props))}"></div>\n` +
    '</body></html>'
  );
}

const teamNode = (over: Record<string, unknown> = {}) => ({
  id: '6528121',
  date: '2026-09-23T16:00:00.000-07:00',
  statusId: 3,
  shortStatusText: 'F',
  gameTypeLabel: 'League',
  locationText: 'Los Altos, CA',
  webPath: '/california/field-hockey/games/6528121-cupertino-vs-los-altos',
  titleText: 'Los Altos vs Cupertino',
  featured: {
    locationDescriptor: 'vs',
    isHome: true,
    result: 'WIN',
    scoreText: '4',
    standing: { overallRecord: '4-3-2', leagueRecord: '1-0' },
    team: {
      name: 'Los Altos',
      webPath: '/california/field-hockey/teams/458850-los-altos-eagles',
    },
  },
  opponent: {
    scoreText: '0',
    isHome: false,
    team: {
      name: 'Cupertino',
      webPath: '/california/field-hockey/teams/458665-cupertino-pioneers',
    },
  },
  ...over,
});

const teamGamesProps = (nodes: unknown[]) => ({
  query: {
    team: {
      id: '458850',
      name: 'Los Altos',
      webPath: '/california/field-hockey/teams/458850-los-altos-eagles',
      standing: { overallRecord: '4-3-2', leagueRecord: '1-0' },
      games: { nodes },
    },
  },
  variables: { id: '458850', schoolYear: '2026-2027', paginating: false },
  application: { env: 'production' },
});

describe('sblive: urls', () => {
  it('builds the verified si.com forms, never scorebooklive.com', () => {
    expect(sbliveTeamGamesUrl('458850-los-altos-eagles')).toBe(
      'https://www.si.com/high-school/stats/california/field-hockey/teams/458850-los-altos-eagles/games',
    );
    expect(sbliveScoresUrl('2026-09-23')).toBe(
      'https://www.si.com/high-school/stats/california/field-hockey/scores?date=2026-09-23',
    );
  });

  it('pulls the numeric SBLive id out of a web path', () => {
    expect(sbliveIdFromWebPath('/california/field-hockey/teams/458850-los-altos-eagles')).toBe('458850');
    expect(sbliveIdFromWebPath('/field-hockey/teams/485424-tba')).toBe('485424');
    expect(sbliveIdFromWebPath(null)).toBeNull();
    expect(sbliveIdFromWebPath('/california/field-hockey/games/6528121-x')).toBeNull();
  });
});

describe('sblive: props extraction', () => {
  it('unescapes the five entity forms si.com emits', () => {
    expect(htmlUnescape('&quot;a&quot; &amp; &#39;b&#39; &lt;c&gt;')).toBe('"a" & \'b\' <c>');
  });

  it('decodes the attribute and finds the top level {query, variables, application}', () => {
    const html = page('teams/Games', teamGamesProps([teamNode()]));
    const blocks = extractReactProps(html);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].className).toBe('teams/Games');
    // ⚠️ There is NO top-level `props` key — every path drops that prefix.
    expect(Object.keys(blocks[0].props as object).sort()).toEqual(['application', 'query', 'variables']);
  });

  it('filters by react class', () => {
    const html = page('teams/Games', teamGamesProps([])) + page('games/Other', { query: {} });
    expect(extractReactProps(html, 'games/Other')).toHaveLength(1);
    expect(extractReactProps(html, 'nope/Missing')).toHaveLength(0);
  });

  it('raw_decodes a value with trailing junk, the way JSONDecoder.raw_decode does', () => {
    expect(parseJsonPrefix('{"a":1}  trailing garbage')).toEqual({ a: 1 });
    expect(parseJsonPrefix('[1,2]}}')).toEqual([1, 2]);
    // A brace inside a string must not close the value early.
    expect(parseJsonPrefix('{"a":"}"} junk')).toEqual({ a: '}' });
    expect(() => parseJsonPrefix('not json')).toThrow();
  });

  it('names the classes it did see when the wanted one is absent', () => {
    expect(() => parseTeamGamesPage(page('games/Show', { query: {} }))).toThrow(/games\/Show/);
  });
});

describe('sblive: team /games page', () => {
  it('normalizes a scored game to an unordered pair with both scores', () => {
    const [game] = parseTeamGamesPage(page('teams/Games', teamGamesProps([teamNode()])));
    expect(game.sbliveGameId).toBe('6528121');
    expect(game.dateKey).toBe('2026-09-23');
    expect(game.isFinal).toBe(true);
    expect(game.isScored).toBe(true);
    // Sorted by slug, so the key does not depend on which team's page it came from.
    expect(game.sides.map((s) => s.slug)).toEqual(['cupertino', 'los-altos']);
    expect(game.sides.map((s) => s.score)).toEqual([0, 4]);
    expect(game.sides.map((s) => s.sbliveTeamId)).toEqual(['458665', '458850']);
    expect(game.url).toBe(
      'https://www.si.com/high-school/stats/california/field-hockey/games/6528121-cupertino-vs-los-altos',
    );
    // Recorded for the log only: SBLive's own league flag is demonstrably unreliable.
    expect(game.gameTypeLabel).toBe('League');
  });

  it('keeps an unplayed game unscored — never 0-0', () => {
    const node = teamNode({
      id: '6545082',
      date: '2026-08-25T16:00:00.000-07:00',
      statusId: 1,
      shortStatusText: '4:00pm',
      featured: {
        locationDescriptor: '@',
        isHome: false,
        result: null,
        scoreText: null,
        team: { name: 'Los Altos', webPath: '/california/field-hockey/teams/458850-los-altos-eagles' },
      },
      opponent: {
        scoreText: null,
        isHome: true,
        team: { name: 'Presentation', webPath: '/california/field-hockey/teams/457986-presentation-panthers' },
      },
    });
    const [game] = parseTeamGamesPage(page('teams/Games', teamGamesProps([node])));
    expect(game.isFinal).toBe(false);
    expect(game.isScored).toBe(false);
    expect(game.sides.map((s) => s.score)).toEqual([null, null]);
  });

  it('leaves a non-SCVAL opponent as a name with no slug', () => {
    const node = teamNode({
      opponent: {
        scoreText: '2',
        isHome: false,
        team: { name: 'Leigh', webPath: '/california/field-hockey/teams/458515-leigh-longhorns' },
      },
    });
    const [game] = parseTeamGamesPage(page('teams/Games', teamGamesProps([node])));
    const leigh = game.sides.find((s) => s.name === 'Leigh');
    expect(leigh?.slug).toBeNull();
    expect(leigh?.sbliveTeamId).toBe('458515');
    expect(sbliveGameKey(game)).toBe('2026-09-23|los-altos~name:leigh');
  });

  it('resolves every registry alias spelling si.com uses', () => {
    const names = ['St. Ignatius', 'Saint Francis', 'Archbishop Mitty', 'Santa Clara'];
    const nodes = names.map((name, i) =>
      teamNode({
        id: `900${i}`,
        opponent: { scoreText: '1', isHome: false, team: { name, webPath: null } },
      }),
    );
    const games = parseTeamGamesPage(page('teams/Games', teamGamesProps(nodes)));
    const slugs = games.map((g) => g.sides.find((s) => s.name === names[games.indexOf(g)])?.slug);
    expect(slugs).toEqual(['st-ignatius', 'saint-francis', 'mitty', 'santa-clara']);
  });
});

describe('sblive: statewide scoreboard', () => {
  const scoresProps = {
    query: {
      scoreboardDate: {
        date: '2026-09-23',
        blurb: null,
        games: {
          totalCount: 2,
          nodes: [
            {
              id: '6528121',
              date: '2026-09-23T16:00:00.000-07:00',
              statusId: 3,
              longStatusText: 'Final',
              titleText: 'Los Altos vs Cupertino',
              webPath: '/california/field-hockey/games/6528121-cupertino-vs-los-altos',
              gameTeams: [
                { scoreText: '0', isWinner: false, isLoser: true, isTbd: false, team: { name: 'Cupertino', state: { abbrev: 'CA' } } },
                { scoreText: '4', isWinner: true, isLoser: false, isTbd: false, team: { name: 'Los Altos', state: { abbrev: 'CA' } } },
              ],
            },
            {
              id: '6635128',
              date: '2026-09-23T15:30:00.000-07:00',
              statusId: 3,
              longStatusText: 'Final',
              titleText: 'Huntington Beach vs Fountain Valley',
              webPath: '/california/field-hockey/games/6635128-huntington-beach-vs-fountain-valley',
              gameTeams: [
                { scoreText: '0', isWinner: false, isLoser: true, isTbd: false, team: { name: 'Fountain Valley', state: { abbrev: 'CA' } } },
                { scoreText: '11', isWinner: true, isLoser: false, isTbd: false, team: { name: 'Huntington Beach', state: { abbrev: 'CA' } } },
              ],
            },
          ],
        },
      },
      stateGenderSportOrganizations: [],
    },
    variables: { level: 'VARSITY' },
    application: {},
  };

  it('reads the CORRECTED path query.scoreboardDate.games.nodes[]', () => {
    const games = parseScoresPage(page('games/GenderSportIndex', scoresProps));
    expect(games).toHaveLength(2);
    const scval = games.find((g) => g.sides.some((s) => s.slug === 'los-altos'));
    expect(scval?.sides.map((s) => s.score)).toEqual([0, 4]);
    expect(scval?.dateKey).toBe('2026-09-23');
  });

  it('keeps out-of-area games, with no slugs, so they simply never join', () => {
    const games = parseScoresPage(page('games/GenderSportIndex', scoresProps));
    const socal = games.find((g) => g.sides.some((s) => s.name === 'Huntington Beach'));
    expect(socal?.sides.every((s) => s.slug === null)).toBe(true);
  });

  it('is the wrong path if you look one level up', () => {
    const wrong = { query: { games: { nodes: [] } }, variables: {}, application: {} };
    expect(() => parseScoresPage(page('games/GenderSportIndex', wrong))).toThrow();
  });
});

describe('sblive: slug harvesting (never guessing)', () => {
  it('reads team web paths off a standings page and ignores its records', () => {
    const props = {
      query: {
        organization: {
          fullName: 'Santa Clara Valley De Anza',
          teamStandings: [
            {
              team: { id: 464806, name: 'Archbishop Mitty', webPath: '/california/field-hockey/teams/464806-archbishop-mitty-monarchs' },
              // Deliberately present and deliberately unread: SBLive's league buckets are wrong.
              standing: { leagueRecord: '1-0', overallRecord: '7-0' },
            },
            {
              team: { id: 458802, name: 'Los Gatos', webPath: '/california/field-hockey/teams/458802-los-gatos-wildcats' },
              standing: { leagueRecord: '0-1', overallRecord: '5-1' },
            },
          ],
        },
      },
      variables: { id: 4242 },
      application: {},
    };
    const refs = parseStandingsTeamRefs(page('organizations/Standings', props));
    expect(refs.map((r) => [r.slug, r.sbliveTeamId])).toEqual([
      ['mitty', '464806'],
      ['los-gatos', '458802'],
    ]);
  });

  it('harvests every distinct web path a team page mentions', () => {
    const nodes = [
      teamNode(),
      teamNode({
        id: '2',
        opponent: { scoreText: null, isHome: false, team: { name: 'Santa Clara', webPath: '/california/field-hockey/teams/496839-santa-clara-bruins' } },
      }),
      teamNode({ id: '3' }),
    ];
    const refs = harvestTeamWebPaths(page('teams/Games', teamGamesProps(nodes)));
    expect(refs.map((r) => r.sbliveTeamId).sort()).toEqual(['458665', '458850', '496839']);
    expect(refs.find((r) => r.sbliveTeamId === '496839')?.slug).toBe('santa-clara');
  });
});

describe('sblive: dedupe', () => {
  it('collapses the same contest seen from both teams, keeping the scored row', () => {
    const scored = parseTeamGamesPage(page('teams/Games', teamGamesProps([teamNode()])))[0];
    const unscored = {
      ...scored,
      sbliveGameId: 'other',
      isScored: false,
      isFinal: false,
      sides: [
        { ...scored.sides[0], score: null },
        { ...scored.sides[1], score: null },
      ] as typeof scored.sides,
    };
    const out = dedupeSbliveGames([unscored, scored]);
    expect(out).toHaveLength(1);
    expect(out[0].sbliveGameId).toBe('6528121');
  });
});
