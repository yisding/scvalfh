/**
 * NavLink's league-aware targets and its active state (SPEC §8.3).
 *
 * The ACTIVE state comes from the base `href` only (prefix matching), so a league target never
 * breaks `aria-current`; the TARGET is `leagueHrefs[L] ?? href`, where L is the page's league
 * (`/standings|schedule|playoffs/<id>`, `/teams/<slug>`), else the remembered league, else none.
 * The static HTML always carries the index href.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

let mockPath = '/';
vi.mock('next/navigation', () => ({ usePathname: () => mockPath }));

import { NavLink, isActive, navTarget, pageLeagueOf } from '../../components/layout/NavLink';
import { navLeagueHrefs } from '../../components/layout/nav-targets';
import { TOP_LINKS } from '../../components/layout/TopNav';
import { TEAMS } from '../../lib/teams';

const HREFS = navLeagueHrefs();
const SLUG_LEAGUE = Object.fromEntries(TEAMS.map((t) => [t.slug, t.league]));
const LEAGUES = new Set(Object.keys(HREFS['/teams']));

function render(href: string, pathname: string): string {
  mockPath = pathname;
  return renderToStaticMarkup(
    createElement(NavLink, {
      href,
      variant: 'tab',
      label: 'X',
      leagueHrefs: HREFS[href],
      slugLeague: SLUG_LEAGUE,
    }),
  );
}

describe('the league hrefs the bars hand to NavLink', () => {
  it('Scores, Standings, Teams and Playoffs per league; MCAL’s Playoffs is its tournament page, EAL’s its card on /playoffs', () => {
    expect(HREFS['/schedule']).toEqual({
      scval: '/schedule/scval',
      bval: '/schedule/bval',
      pcal: '/schedule/pcal',
      mcal: '/schedule/mcal',
      eal: '/schedule/eal',
      sunset: '/schedule/sunset',
      city: '/schedule/city',
      'north-county': '/schedule/north-county',
      metro: '/schedule/metro',
      independents: '/schedule/independents',
    });
    // Teams took over the Table tab's job (DESIGN §18): your league's tables, on /teams.
    expect(HREFS['/teams']).toEqual({
      scval: '/teams#scval',
      bval: '/teams#bval',
      pcal: '/teams#pcal',
      mcal: '/teams#mcal',
      eal: '/teams#eal',
      sunset: '/teams#sunset',
      city: '/teams#city',
      'north-county': '/teams#north-county',
      metro: '/teams#metro',
      independents: '/teams#independents',
    });
    expect(HREFS['/playoffs']).toEqual({
      scval: '/playoffs#scval',
      bval: '/playoffs#bval',
      pcal: '/playoffs#pcal',
      mcal: '/playoffs/mcal',
      // No bracket and no /playoffs/eal page: the EAL's pointer card on the CCS page.
      eal: '/playoffs#eal',
      // No page of their own either (DESIGN-socal §2.4): the Sunset's 'no-postseason' card and the
      // three San Diego leagues' 'section-playoffs' cards in the SoCal block of /playoffs.
      sunset: '/playoffs#sunset',
      city: '/playoffs#city',
      'north-county': '/playoffs#north-county',
      metro: '/playoffs#metro',
      // The LA independents' 'no-postseason' card (DESIGN §24.9).
      independents: '/playoffs#independents',
    });
    // Standings is a section of its own again (DESIGN §33: /teams is a team directory, standings
    // live on /standings): its link follows the league like the other three.
    expect(HREFS['/standings']).toEqual(Object.fromEntries(Object.keys(HREFS['/schedule']).map((id) => [id, `/standings/${id}`])));
    expect(HREFS['/leaders']).toBeUndefined();
  });
});

describe('active state comes from the base href only', () => {
  it('base /playoffs with league href /playoffs#scval on /playoffs is active', () => {
    expect(isActive('/playoffs', '/playoffs')).toBe(true);
    expect(render('/playoffs', '/playoffs')).toContain('aria-current="page"');
  });

  it('base /schedule on /schedule/scval is active, as the page its league target names', () => {
    expect(isActive('/schedule/scval', '/schedule')).toBe(true);
    expect(render('/schedule', '/schedule/scval')).toContain('aria-current="page"');
  });

  it('/playoffs/mcal lights Playoffs; /standings and /standings/bval light Standings, not Teams and not Scores', () => {
    expect(render('/playoffs', '/playoffs/mcal')).toContain('aria-current="page"');
    expect(render('/standings', '/standings')).toContain('aria-current="page"');
    // A league page the link itself can point at is the page, not just "inside the section".
    expect(render('/standings', '/standings/bval')).toContain('aria-current="page"');
    expect(render('/teams', '/standings/bval')).not.toContain('aria-current');
    expect(render('/teams', '/standings')).not.toContain('aria-current');
    expect(render('/schedule', '/standings/bval')).not.toContain('aria-current');
  });

  it('exactly one of the six header links is lit on every kind of route', () => {
    const routes = ['/', '/schedule', '/schedule/scval', '/scores/2026-09-24', '/game/abc', '/standings', '/standings/mcal', '/playoffs', '/playoffs/mcal', '/teams', '/teams/leigh', '/leaders', '/jv', '/jv/scval'];
    for (const route of routes) {
      const lit = TOP_LINKS.filter((l) => isActive(route, l.href, HREFS[l.href]));
      expect(lit.map((l) => l.label), route).toHaveLength(1);
    }
    // Footer-only pages light nothing in the header.
    for (const route of ['/about', '/history/2025-26']) {
      expect(TOP_LINKS.filter((l) => isActive(route, l.href, HREFS[l.href])), route).toHaveLength(0);
    }
  });

  it('Scores is the current item on `/` (home is the Scores page), on /schedule, a day page and a game page', () => {
    // The page itself: home and the index.
    expect(render('/schedule', '/')).toContain('aria-current="page"');
    expect(render('/schedule', '/schedule')).toContain('aria-current="page"');
    // Inside the section: reached from Scores, not its own page.
    expect(render('/schedule', '/scores/2026-09-24')).toContain('aria-current="true"');
    expect(render('/schedule', '/game/2026-09-24-leigh-at-pioneer')).toContain('aria-current="true"');
    // A fragment target (the phone tab lands on a date) never breaks it.
    expect(render('/schedule#2026-09-24', '/')).toContain('aria-current="page"');
    // And nothing else is lit on `/`.
    for (const href of ['/standings', '/playoffs', '/teams', '/leaders', '/jv']) {
      expect(isActive('/', href, HREFS[href]), href).toBe(false);
    }
  });

  it('/teams#bval, a league target, still lights Teams as the page itself', () => {
    expect(render('/teams', '/teams')).toContain('aria-current="page"');
    expect(render('/teams', '/teams/leigh')).toContain('aria-current="true"');
  });

  it('a `/` href is active on / only (every path starts with "/")', () => {
    expect(isActive('/', '/')).toBe(true);
    expect(isActive('/teams', '/')).toBe(false);
  });

  it('the tab face is the word alone, and the top face reserves its bold width', () => {
    mockPath = '/';
    const tab = renderToStaticMarkup(createElement(NavLink, { href: '/teams', variant: 'tab', label: 'Teams' }));
    expect(tab).toBe('<a class="sx-tabbar-tab" href="/teams"><span class="sx-indicator leading-none">Teams</span></a>');
    const top = renderToStaticMarkup(createElement(NavLink, { href: '/jv', variant: 'top', label: 'JV', srSuffix: ' (junior varsity)' }));
    expect(top).toBe(
      '<a class="sx-navtop" href="/jv"><span data-label="JV" class="sx-indicator sx-weight-hold leading-5">JV<span class="sr-only"> (junior varsity)</span></span></a>',
    );
  });

  it('the static HTML carries the index href (no hydration mismatch)', () => {
    expect(render('/schedule', '/standings/mcal')).toContain('href="/schedule"');
  });
});

describe('the target: page league, then the remembered league, then the index', () => {
  it('on /standings/mcal with remembered league scval, Scores targets /schedule/mcal', () => {
    expect(
      navTarget({
        href: '/schedule',
        leagueHrefs: HREFS['/schedule'],
        slugLeague: SLUG_LEAGUE,
        pathname: '/standings/mcal',
        effectiveLeague: 'scval',
      }),
    ).toBe('/schedule/mcal');
  });

  it('a team page is about its team’s league', () => {
    const leigh = TEAMS.find((t) => t.slug === 'leigh')!;
    expect(pageLeagueOf('/teams/leigh', LEAGUES, SLUG_LEAGUE)).toBe(leigh.league);
    expect(
      navTarget({
        href: '/teams',
        leagueHrefs: HREFS['/teams'],
        slugLeague: SLUG_LEAGUE,
        pathname: '/teams/leigh',
        effectiveLeague: 'pcal',
      }),
    ).toBe(`/teams#${leigh.league}`);
  });

  it('a page about no league follows the remembered league', () => {
    expect(
      navTarget({
        href: '/playoffs',
        leagueHrefs: HREFS['/playoffs'],
        slugLeague: SLUG_LEAGUE,
        pathname: '/about',
        effectiveLeague: 'mcal',
      }),
    ).toBe('/playoffs/mcal');
    expect(
      navTarget({
        href: '/playoffs',
        leagueHrefs: HREFS['/playoffs'],
        slugLeague: SLUG_LEAGUE,
        pathname: '/',
        effectiveLeague: 'bval',
      }),
    ).toBe('/playoffs#bval');
  });

  it('no league anywhere: the index href', () => {
    expect(
      navTarget({
        href: '/teams',
        leagueHrefs: HREFS['/teams'],
        slugLeague: SLUG_LEAGUE,
        pathname: '/teams',
        effectiveLeague: null,
      }),
    ).toBe('/teams');
  });

  it('unknown path params are not leagues', () => {
    expect(pageLeagueOf('/standings/nope', LEAGUES, SLUG_LEAGUE)).toBeNull();
    expect(pageLeagueOf('/teams/nope', LEAGUES, SLUG_LEAGUE)).toBeNull();
    expect(pageLeagueOf('/scores/2026-09-24', LEAGUES, SLUG_LEAGUE)).toBeNull();
    expect(pageLeagueOf('/teams/constructor', LEAGUES, SLUG_LEAGUE)).toBeNull();
  });

  it('a link with no league hrefs keeps its href', () => {
    expect(
      navTarget({ href: '/leaders', pathname: '/standings/bval', slugLeague: SLUG_LEAGUE, effectiveLeague: 'bval' }),
    ).toBe('/leaders');
  });
});
