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
import { navLeagueHrefs } from '../../components/layout/TopNav';
import { TEAMS } from '../../lib/teams';

const HREFS = navLeagueHrefs();
const SLUG_LEAGUE = Object.fromEntries(TEAMS.map((t) => [t.slug, t.league]));
const LEAGUES = new Set(Object.keys(HREFS['/standings']));

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
  it('Scores, Table and Playoffs per league; MCAL’s Playoffs is its tournament page', () => {
    expect(HREFS['/schedule']).toEqual({
      scval: '/schedule/scval',
      bval: '/schedule/bval',
      pcal: '/schedule/pcal',
      mcal: '/schedule/mcal',
    });
    expect(HREFS['/standings'].bval).toBe('/standings/bval');
    expect(HREFS['/playoffs']).toEqual({
      scval: '/playoffs#scval',
      bval: '/playoffs#bval',
      pcal: '/playoffs#pcal',
      mcal: '/playoffs/mcal',
    });
    expect(HREFS['/teams']).toBeUndefined();
  });
});

describe('active state comes from the base href only', () => {
  it('base /playoffs with league href /playoffs#scval on /playoffs is active', () => {
    expect(isActive('/playoffs', '/playoffs')).toBe(true);
    expect(render('/playoffs', '/playoffs')).toContain('aria-current="page"');
  });

  it('base /standings on /standings/scval is active', () => {
    expect(isActive('/standings/scval', '/standings')).toBe(true);
    expect(render('/standings', '/standings/scval')).toContain('aria-current="page"');
  });

  it('/playoffs/mcal lights Playoffs; /standings/bval lights Table and not Scores', () => {
    expect(render('/playoffs', '/playoffs/mcal')).toContain('aria-current="page"');
    expect(render('/standings', '/standings/bval')).toContain('aria-current="page"');
    expect(render('/schedule', '/standings/bval')).not.toContain('aria-current');
  });

  it('Home is active on / only', () => {
    expect(isActive('/', '/')).toBe(true);
    expect(isActive('/teams', '/')).toBe(false);
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
        href: '/standings',
        leagueHrefs: HREFS['/standings'],
        slugLeague: SLUG_LEAGUE,
        pathname: '/teams/leigh',
        effectiveLeague: 'pcal',
      }),
    ).toBe(`/standings/${leigh.league}`);
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
        href: '/standings',
        leagueHrefs: HREFS['/standings'],
        slugLeague: SLUG_LEAGUE,
        pathname: '/teams',
        effectiveLeague: null,
      }),
    ).toBe('/standings');
  });

  it('unknown path params are not leagues', () => {
    expect(pageLeagueOf('/standings/nope', LEAGUES, SLUG_LEAGUE)).toBeNull();
    expect(pageLeagueOf('/teams/nope', LEAGUES, SLUG_LEAGUE)).toBeNull();
    expect(pageLeagueOf('/scores/2026-09-24', LEAGUES, SLUG_LEAGUE)).toBeNull();
    expect(pageLeagueOf('/teams/constructor', LEAGUES, SLUG_LEAGUE)).toBeNull();
  });

  it('a link with no league hrefs keeps its href', () => {
    expect(
      navTarget({ href: '/teams', pathname: '/standings/bval', slugLeague: SLUG_LEAGUE, effectiveLeague: 'bval' }),
    ).toBe('/teams');
  });
});
