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

import { LEAGUES } from '../lib/leagues';
import * as sblive from '../lib/sources/sblive';
import {
  SBLIVE_HTTP_OPTIONS,
  SBLIVE_LEAGUE_SLUGS,
  dedupeSbliveGames,
  extractReactProps,
  harvestTeamWebPaths,
  isCaliforniaGameRow,
  parseJsonPrefix,
  parseScoresPage,
  parseStandingsTeamRefs,
  parseTeamGamesPage,
  sbliveGameKey,
  sbliveIdFromWebPath,
  sbliveScoresUrl,
  sbliveTeamGamesUrl,
} from '../lib/sources/sblive';
import { CHROME_USER_AGENT, htmlUnescape } from '../lib/sources/http';

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

describe('sblive: the frozen exports (SPEC §7.3) and the live HTTP options', () => {
  it('keeps every Stage-B frozen export', () => {
    for (const name of ['sbliveScoresUrl', 'sbliveTeamGamesUrl', 'parseScoresPage', 'parseTeamGamesPage', 'dedupeSbliveGames'] as const) {
      expect(typeof sblive[name], name).toBe('function');
    }
  });

  it('exports SBLIVE_HTTP_OPTIONS with the Chrome UA si.com requires and its own serial spacing', () => {
    expect(SBLIVE_HTTP_OPTIONS.userAgent).toBe(CHROME_USER_AGENT);
    expect(SBLIVE_HTTP_OPTIONS.concurrency).toBe(1);
    expect(SBLIVE_HTTP_OPTIONS.spacingMs).toBeGreaterThanOrEqual(500);
  });

  it('takes the league standings slugs from config (harvest only)', () => {
    expect(SBLIVE_LEAGUE_SLUGS).toEqual(LEAGUES.flatMap((l) => l.sblive.leagueSlugs));
    expect(SBLIVE_LEAGUE_SLUGS).toContain('4242-santa-clara-valley-de-anza');
    expect(SBLIVE_LEAGUE_SLUGS).toContain('4190-eastern-athletic');
  });
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

describe('sblive: malformed upstream rows never reach the snapshot', () => {
  it('drops a row with a non-numeric game id, with a warning', () => {
    const warnings: string[] = [];
    const html = page('teams/Games', teamGamesProps([teamNode({ id: 'G6528121' }), teamNode({ id: ' 6528122 ' })]));
    const rows = sblive.parseTeamGamesPage(html, 'https://example.test/x', (m) => warnings.push(m));
    expect(rows.map((r) => r.sbliveGameId)).toEqual(['6528122']);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/non-numeric game id "G6528121"/);
  });

  it('gives a row whose webPath is not a plain path no url (so D2 ignores it as a junk row)', () => {
    const html = page('teams/Games', teamGamesProps([
      teamNode({ webPath: '/california/field-hockey/games/6528121-cupertino-vs los-altos' }),
      teamNode({ id: '6528122', webPath: 'https://evil.example/x' }),
      teamNode({ id: '6528123' }),
    ]));
    const rows = sblive.parseTeamGamesPage(html);
    expect(rows.map((r) => r.url)).toEqual([
      null,
      null,
      'https://www.si.com/high-school/stats/california/field-hockey/games/6528121-cupertino-vs-los-altos',
    ]);
    expect(rows.filter((r) => sblive.isCaliforniaGameRow(r)).map((r) => r.sbliveGameId)).toEqual(['6528123']);
  });

  it('sbliveGameUrl accepts only plain paths; sbliveGameIdOf only digits', () => {
    expect(sblive.sbliveGameUrl('/california/field-hockey/games/1-a-vs-b')).toBe(
      'https://www.si.com/high-school/stats/california/field-hockey/games/1-a-vs-b',
    );
    for (const bad of [null, undefined, '', 'california/x', '/a b', '/a?b=1', '/a\nb', '/a"b']) {
      expect(sblive.sbliveGameUrl(bad), String(bad)).toBeNull();
    }
    expect(sblive.sbliveGameIdOf(6541425)).toBe('6541425');
    expect(sblive.sbliveGameIdOf('G6541425')).toBeNull();
    expect(sblive.sbliveGameIdOf(null)).toBeNull();
  });
});

describe('sblive: props extraction', () => {
  it('finds exactly the pairs the old regex found, in linear-ish time on hostile pages', () => {
    const RE = /data-react-class="([^"]+)"[^>]*?data-react-props="([^"]*)"/g;
    const viaRegex = (html: string) => [...html.matchAll(RE)].map((m) => [m[1], m[2]]);
    const tokens = ['data-react-class="', 'data-react-props="', '"', '>', '<div ', 'a', 'b{}', ' '];
    let x = 7;
    const next = () => ((x = (x * 1103515245 + 12345) >>> 0) % tokens.length);
    for (let n = 0; n < 400; n++) {
      const html = Array.from({ length: 1 + (n % 40) }, () => tokens[next()]).join('');
      expect(sblive.reactPropsPairs(html), html).toEqual(viaRegex(html));
    }
    const hostile = 'data-react-class="a" '.repeat(40_000); // ~840 KB, no props, no '>'
    const t0 = Date.now();
    expect(sblive.reactPropsPairs(hostile)).toEqual([]);
    expect(Date.now() - t0).toBeLessThan(1500);
  });

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
    // Both sides resolve by their si.com team id (the web path), never by name.
    expect(game.sides.map((s) => s.via)).toEqual(['team-id', 'team-id']);
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

  // Scripps Ranch was the non-member here until the San Diego Section joined the registry, and Thousand
  // Oaks until the Southern Section independents did (DESIGN §24.9). Oaks Christian (si.com 458114, a row of
  // si.com's Marmonte page with no games, read 2026-10-06) is no registry team: the opponent is synthetic.
  it('leaves a non-member opponent as a name with no slug', () => {
    const node = teamNode({
      opponent: {
        scoreText: '2',
        isHome: false,
        team: { name: 'Oaks Christian', webPath: '/california/field-hockey/teams/458114-oaks-christian-lions' },
      },
    });
    const [game] = parseTeamGamesPage(page('teams/Games', teamGamesProps([node])));
    const outsider = game.sides.find((s) => s.name === 'Oaks Christian');
    expect(outsider?.slug).toBeNull();
    expect(outsider?.via).toBeNull();
    expect(outsider?.refused).toBe('unknown');
    expect(outsider?.sbliveTeamId).toBe('458114');
    expect(sbliveGameKey(game)).toBe('2026-09-23|los-altos~name:oakschristian');
  });

  it('resolves a Southern Section independent by its si.com team id (Thousand Oaks is one of our teams now)', () => {
    const node = teamNode({
      opponent: {
        scoreText: '2',
        isHome: false,
        team: { name: 'Thousand Oaks', webPath: '/california/field-hockey/teams/458583-thousand-oaks-lancers' },
      },
    });
    const [game] = parseTeamGamesPage(page('teams/Games', teamGamesProps([node])));
    expect(game.sides.find((s) => s.name === 'Thousand Oaks')?.slug).toBe('thousand-oaks');
  });

  it('resolves a BVAL member by its si.com team id (Leigh is one of our teams now)', () => {
    const node = teamNode({
      opponent: {
        scoreText: '2',
        isHome: false,
        team: { name: 'Leigh', webPath: '/california/field-hockey/teams/458515-leigh-longhorns' },
      },
    });
    const [game] = parseTeamGamesPage(page('teams/Games', teamGamesProps([node])));
    const leigh = game.sides.find((s) => s.name === 'Leigh');
    expect(leigh?.slug).toBe('leigh');
    expect(leigh?.via).toBe('team-id');
    expect(sbliveGameKey(game)).toBe('2026-09-23|leigh~los-altos');
  });

  it('resolves every registry alias spelling si.com uses', () => {
    // Santa Clara is a statewide namesake (Oxnard's Santa Clara is another si.com team): it resolves
    // only through its si.com id, so its row carries the web path si.com publishes for it.
    const names: Array<[string, string | null]> = [
      ['St. Ignatius', null],
      ['Saint Francis', null],
      ['Archbishop Mitty', null],
      ['Santa Clara', '/california/field-hockey/teams/496839-santa-clara-bruins'],
    ];
    const nodes = names.map(([name, webPath], i) =>
      teamNode({
        id: `900${i}`,
        opponent: { scoreText: '1', isHome: false, team: { name, webPath } },
      }),
    );
    const games = parseTeamGamesPage(page('teams/Games', teamGamesProps(nodes)));
    const slugs = games.map((g) => g.sides.find((s) => s.name === names[games.indexOf(g)][0])?.slug);
    expect(slugs).toEqual(['st-ignatius', 'saint-francis', 'mitty', 'santa-clara']);
    expect(games.map((g) => g.sides.find((s) => s.name === names[games.indexOf(g)][0])?.via)).toEqual([
      'name',
      'name',
      'name',
      'team-id',
    ]);
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
                {
                  scoreText: '0', isWinner: false, isLoser: true, isTbd: false,
                  team: { name: 'Cupertino', image: 'https://assets.scorebooklive.com/uploads/production/school/11002/image/x.png', state: { abbrev: 'CA' } },
                },
                {
                  scoreText: '4', isWinner: true, isLoser: false, isTbd: false,
                  team: { name: 'Los Altos', image: 'https://assets.scorebooklive.com/uploads/production/team/458850-v3/image/Los_Altos__CA__Eagles_Logo.png', state: { abbrev: 'CA' } },
                },
              ],
            },
            {
              id: '6635128',
              date: '2026-09-23T15:30:00.000-07:00',
              statusId: 3,
              longStatusText: 'Final',
              titleText: 'Calabasas vs Oaks Christian',
              webPath: '/california/field-hockey/games/6635128-calabasas-vs-oaks-christian',
              gameTeams: [
                { scoreText: '0', isWinner: false, isLoser: true, isTbd: false, team: { name: 'Oaks Christian', state: { abbrev: 'CA' } } },
                { scoreText: '1', isWinner: true, isLoser: false, isTbd: false, team: { name: 'Calabasas', state: { abbrev: 'CA' } } },
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
    // The scoreboard has no web paths: identity comes from the logo URLs (school id, team id).
    expect(scval?.sides.map((s) => s.via)).toEqual(['school-id', 'team-id']);
    expect(scval?.sides.map((s) => s.sbliveSchoolId)).toEqual(['11002', null]);
  });

  it('never resolves the Los Altos namesake by name when the logo is missing', () => {
    const bare = JSON.parse(JSON.stringify(scoresProps)) as typeof scoresProps;
    for (const gt of bare.query.scoreboardDate.games.nodes[0].gameTeams) delete (gt.team as { image?: string }).image;
    const [game] = parseScoresPage(page('games/GenderSportIndex', bare)).filter((g) => g.sbliveGameId === '6528121');
    expect(game.sides.find((s) => s.name === 'Los Altos')).toMatchObject({ slug: null, refused: 'ambiguous-name' });
    // Cupertino is not a namesake: name resolution still works, and says so.
    expect(game.sides.find((s) => s.name === 'Cupertino')).toMatchObject({ slug: 'cupertino', via: 'name' });
  });

  // Calabasas and Oaks Christian (placeholder rows of si.com's Marmonte page, no games: a synthetic game) are
  // no registry teams. The Sunset schools used here first, then Glendora and Thousand Oaks, are registry
  // teams now.
  it('keeps games between two non-registry teams, with no slugs, so they simply never join', () => {
    const games = parseScoresPage(page('games/GenderSportIndex', scoresProps));
    const outside = games.find((g) => g.sides.some((s) => s.name === 'Calabasas'));
    expect(outside?.sides.every((s) => s.slug === null)).toBe(true);
  });

  // si.com server-renders a day's first 24 games; on 2026-10-06 the page said totalCount 29 and
  // pageInfo { endCursor: 'MjQ', hasNextPage: true }. No URL parameter reaches page two, so the parser
  // reads what it has and says the day is truncated.
  it('warns when the day has more games than the page holds (hasNextPage / totalCount)', () => {
    const warnings: string[] = [];
    const truncated = JSON.parse(JSON.stringify(scoresProps)) as typeof scoresProps & {
      query: { scoreboardDate: { games: { pageInfo?: unknown } } };
    };
    truncated.query.scoreboardDate.games.totalCount = 29;
    truncated.query.scoreboardDate.games.pageInfo = { endCursor: 'MjQ', hasNextPage: true };
    const games = parseScoresPage(page('games/GenderSportIndex', truncated), 'https://x.test/scores?date=2026-10-06', (m) =>
      warnings.push(m),
    );
    expect(games).toHaveLength(2);
    expect(warnings).toEqual([
      'si.com scoreboard lists 2 of 29 games; the rest load in the browser and are not read (https://x.test/scores?date=2026-10-06)',
    ]);
    const whole: string[] = [];
    parseScoresPage(page('games/GenderSportIndex', scoresProps), undefined, (m) => whole.push(m));
    expect(whole).toEqual([]);
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

describe('sblive: junk-row guard (D2 rule 7)', () => {
  it('accepts only /california/field-hockey/games/ rows', () => {
    const [game] = parseTeamGamesPage(page('teams/Games', teamGamesProps([teamNode()])));
    expect(isCaliforniaGameRow(game)).toBe(true);
    const ny = parseTeamGamesPage(
      page('teams/Games', teamGamesProps([teamNode({ id: '6642005', webPath: '/new-york/field-hockey/games/6642005-salinas-vs-stevenson' })])),
    )[0];
    expect(isCaliforniaGameRow(ny)).toBe(false);
    expect(isCaliforniaGameRow({ url: null })).toBe(false);
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
