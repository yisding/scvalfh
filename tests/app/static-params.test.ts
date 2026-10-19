/**
 * The dynamic route families and their params (views/site/route-contract.ts): a page and the
 * opengraph-image beside it prerender EXACTLY the same params, so the og:image URL a page carries
 * always exists and no image is built for a page that does not. The page's `generateStaticParams`
 * is the family's `<area>StaticParams()` module function, the page stays `dynamicParams = false`,
 * and the OG route (whose own `dynamicParams` Next ignores) answers the same set.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { useCorpusModules } from '@/tests/support/corpus-modules';

type Params = Array<Record<string, string>>;
type Family = {
  family: string;
  segment: string;
  page: { generateStaticParams: () => Params; dynamicParams: boolean };
  og: { generateStaticParams: () => Params };
  fromRoute: () => Params;
};

const m = useCorpusModules('all-2026-10-02', {
  teamsPage: () => import('@/app/teams/[slug]/page'),
  teamsOg: () => import('@/app/teams/[slug]/opengraph-image'),
  teamRoute: () => import('@/views/teams/team-route'),
  gamePage: () => import('@/app/game/[id]/page'),
  gameOg: () => import('@/app/game/[id]/opengraph-image'),
  gameRoute: () => import('@/views/game/game-route'),
  scoresPage: () => import('@/app/scores/[date]/page'),
  scoresOg: () => import('@/app/scores/[date]/opengraph-image'),
  scoresRoute: () => import('@/views/scores/scores-route'),
  standingsPage: () => import('@/app/standings/[league]/page'),
  standingsOg: () => import('@/app/standings/[league]/opengraph-image'),
  schedulePage: () => import('@/app/schedule/[league]/page'),
  scheduleOg: () => import('@/app/schedule/[league]/opengraph-image'),
  leagueRoute: () => import('@/views/site/league-route'),
  playoffsPage: () => import('@/app/playoffs/[league]/page'),
  playoffsOg: () => import('@/app/playoffs/[league]/opengraph-image'),
  tournamentRoute: () => import('@/views/playoffs/tournament-route'),
  clubsPage: () => import('@/app/clubs/[slug]/page'),
  clubRoute: () => import('@/views/clubs/club-route'),
});

let families: Family[] = [];

beforeAll(() => {
  families = [
    { family: 'teams', segment: 'slug', page: m.teamsPage, og: m.teamsOg, fromRoute: m.teamRoute.teamStaticParams },
    { family: 'game', segment: 'id', page: m.gamePage, og: m.gameOg, fromRoute: m.gameRoute.gameStaticParams },
    { family: 'scores', segment: 'date', page: m.scoresPage, og: m.scoresOg, fromRoute: m.scoresRoute.scoresStaticParams },
    { family: 'standings', segment: 'league', page: m.standingsPage, og: m.standingsOg, fromRoute: m.leagueRoute.leagueStaticParams },
    { family: 'schedule', segment: 'league', page: m.schedulePage, og: m.scheduleOg, fromRoute: m.leagueRoute.leagueStaticParams },
    { family: 'playoffs', segment: 'league', page: m.playoffsPage, og: m.playoffsOg, fromRoute: m.tournamentRoute.tournamentStaticParams },
  ];
});

describe('static params (app/**/page.tsx and app/**/opengraph-image.tsx)', () => {
  it('covers the six families that have an OG image', () => {
    expect(families.map((f) => f.family)).toEqual(['teams', 'game', 'scores', 'standings', 'schedule', 'playoffs']);
  });

  it.each(['teams', 'game', 'scores', 'standings', 'schedule', 'playoffs'])(
    '%s: the OG image prerenders exactly the page\'s params, which are the route module\'s',
    (family) => {
      const f = families.find((x) => x.family === family)!;
      const page = f.page.generateStaticParams();
      expect(page.length, `app/${family}: the page prerenders something`).toBeGreaterThan(0);
      expect(f.og.generateStaticParams(), `app/${family}/opengraph-image.tsx generateStaticParams`).toEqual(page);
      expect(page, `app/${family}/page.tsx generateStaticParams === its route module's`).toEqual(f.fromRoute());
      for (const p of page) expect(Object.keys(p), `app/${family}: one segment`).toEqual([f.segment]);
      expect(f.page.dynamicParams, `app/${family}/page.tsx dynamicParams`).toBe(false);
    },
  );

  it('clubs (no OG image): the page prerenders the club route module\'s params', () => {
    const page = m.clubsPage.generateStaticParams();
    expect(page.length).toBeGreaterThan(0);
    expect(page, 'app/clubs/[slug]/page.tsx generateStaticParams').toEqual(m.clubRoute.clubStaticParams());
    expect(m.clubsPage.dynamicParams, 'app/clubs/[slug]/page.tsx dynamicParams').toBe(false);
  });

  it('a param guard answers null for a segment that names nothing, and never throws', () => {
    const { teamParam } = m.teamRoute;
    const { gameParam } = m.gameRoute;
    const { scoresParam } = m.scoresRoute;
    const { leagueParam } = m.leagueRoute;
    const { tournamentParam } = m.tournamentRoute;
    const { clubParam } = m.clubRoute;
    for (const raw of ['nope', '', '__proto__', 'constructor']) {
      expect(teamParam(raw), `teamParam(${raw})`).toBeNull();
      expect(gameParam(raw), `gameParam(${raw})`).toBeNull();
      expect(scoresParam(raw), `scoresParam(${raw})`).toBeNull();
      expect(leagueParam(raw), `leagueParam(${raw})`).toBeNull();
      expect(tournamentParam(raw), `tournamentParam(${raw})`).toBeNull();
      expect(clubParam(raw), `clubParam(${raw})`).toBeNull();
    }
    // And the first param of each family resolves to a value.
    expect(teamParam(m.teamRoute.teamStaticParams()[0]!.slug)?.slug).toBe(m.teamRoute.teamStaticParams()[0]!.slug);
    expect(gameParam(m.gameRoute.gameStaticParams().find((p) => !p.id.startsWith('sblive-'))!.id)).not.toBeNull();
    const date = m.scoresRoute.scoresStaticParams()[0]!.date;
    expect(scoresParam(date)).toBe(date);
    const league = m.leagueRoute.leagueStaticParams()[0]!.league;
    expect(leagueParam(league)?.id).toBe(league);
    expect(tournamentParam('mcal')?.summary.id).toBe('mcal');
    const club = m.clubRoute.clubStaticParams()[0]!.slug;
    expect(clubParam(club)?.slug).toBe(club);
  });
});
