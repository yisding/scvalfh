/**
 * The og:title rule (views/site/site.ts OG_BASE): every page states its own og:title, the
 * page's own words with no site-name suffix, because og:site_name carries the brand. A page that
 * left `openGraph.title` out would inherit the TEMPLATED `<title>` (`… — NorCal High School
 * Field Hockey`) on the Next build and not on vinext, which is how the suffix once came and went page by
 * page. One page per route family, its metadata read the way Next reads it (`metadata` or
 * `generateMetadata` with a real param), on the corpus snapshot. Then the league list the site's
 * descriptions build from config (leaguesBySectionWords), pinned to the words the literals had.
 *
 * Then the whole object of every route (EXPECTED, captured from the pages as they were written by
 * hand, before views/site/page-metadata.ts built them): the title, description, canonical and every
 * openGraph key, including the unknown-param branches and the superseded-game stub. And the card
 * rule, read off the filesystem: a route whose segment holds an `opengraph-image.tsx` names no root
 * card, every other route names it.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { Metadata } from 'next';
import { beforeAll, describe, expect, it } from 'vitest';

import type { Snapshot } from '@/lib/model/snapshot';
import { CORPUS_HOOK_TIMEOUT, useCorpusModules, withSnapshotModules } from '@/tests/support/corpus-modules';
import { corpusSnapshotPath } from '@/tests/support/corpus-snapshot';
import { loadQueries } from '@/tests/support/queries';
import { tempDir } from '@/tests/support/repo';
import { REPO_ROOT } from '@/tests/support/source-tree';

interface PageModule {
  metadata?: Metadata;
  // Each page's own PageProps<'/route'>; the test hands it `{ params }` and nothing else reads more.
  generateMetadata?: (props: never) => Metadata | Promise<Metadata>;
}

const STUB = 'stub:target';

/** Every route's Metadata for one param, as the pages built it by hand (corpus all-2026-10-02). */
const EXPECTED: Record<string, Metadata> = {
  'app/page.tsx': {
    title: {
      absolute: 'NorCal High School Field Hockey Scores & Standings',
    },
    description: 'Scores, standings and playoff pictures for the 102 girls varsity field hockey teams in SCVAL, BVAL and PCAL (Central Coast Section), MCAL (North Coast Section), EAL (Northern Section), Sunset (Southern Section), City, North and Metro (San Diego Section) and five Southern Section independents. Unofficial, updated twice daily.',
    alternates: {
      canonical: '/',
    },
    openGraph: {
      type: 'website',
      siteName: 'NorCal High School Field Hockey',
      locale: 'en_US',
      title: 'NorCal High School Field Hockey',
      url: '/',
    },
  },
  'app/not-found.tsx': {
    title: 'Page not found',
    openGraph: {
      type: 'website',
      siteName: 'NorCal High School Field Hockey',
      locale: 'en_US',
      title: 'Page not found',
    },
  },
  'app/about/page.tsx': {
    title: 'About & sources',
    description: 'How each league’s standings are computed, where the data comes from, and every disagreement with the sources.',
    alternates: {
      canonical: '/about',
    },
    openGraph: {
      type: 'website',
      siteName: 'NorCal High School Field Hockey',
      locale: 'en_US',
      images: [
        {
          url: '/opengraph-image',
          width: 1200,
          height: 630,
          alt: 'NorCal High School Field Hockey — 2026 standings, scores and playoffs',
          type: 'image/png',
        },
      ],
      title: 'About & sources',
      url: '/about',
    },
  },
  'app/clubs/page.tsx': {
    title: 'Club teams',
    description: 'The youth field hockey clubs that players on the 102 varsity rosters here play for, or played for, with a public source for every tie. Unofficial and incomplete.',
    alternates: {
      canonical: '/clubs',
    },
    openGraph: {
      type: 'website',
      siteName: 'NorCal High School Field Hockey',
      locale: 'en_US',
      images: [
        {
          url: '/opengraph-image',
          width: 1200,
          height: 630,
          alt: 'NorCal High School Field Hockey — 2026 standings, scores and playoffs',
          type: 'image/png',
        },
      ],
      title: 'Club teams',
      url: '/clubs',
    },
  },
  'app/clubs/[slug]/page.tsx': {
    title: 'San Francisco Youth Field Hockey Club',
    description: 'San Francisco Youth Field Hockey Club, San Francisco. San Francisco youth club for boys and girls in grades K-12 that runs fall, winter and spring seasons and summer camps, organized into two-year U06 to U19 age groups. 32 players on this site’s varsity rosters are tied to it, each with a source. Unofficial and incomplete.',
    alternates: {
      canonical: '/clubs/sf-hawks',
    },
    openGraph: {
      type: 'website',
      siteName: 'NorCal High School Field Hockey',
      locale: 'en_US',
      images: [
        {
          url: '/opengraph-image',
          width: 1200,
          height: 630,
          alt: 'NorCal High School Field Hockey — 2026 standings, scores and playoffs',
          type: 'image/png',
        },
      ],
      title: 'SF Hawks',
      description: 'San Francisco Youth Field Hockey Club, San Francisco. San Francisco youth club for boys and girls in grades K-12 that runs fall, winter and spring seasons and summer camps, organized into two-year U06 to U19 age groups. 32 players on this site’s varsity rosters are tied to it, each with a source. Unofficial and incomplete.',
      url: '/clubs/sf-hawks',
    },
  },
  'app/commits/page.tsx': {
    title: 'College commitments',
    description: 'The colleges that players on the 102 varsity rosters here have committed to play for, in field hockey and other sports, with a public source for every one. Unofficial and incomplete.',
    alternates: {
      canonical: '/commits',
    },
    openGraph: {
      type: 'website',
      siteName: 'NorCal High School Field Hockey',
      locale: 'en_US',
      images: [
        {
          url: '/opengraph-image',
          width: 1200,
          height: 630,
          alt: 'NorCal High School Field Hockey — 2026 standings, scores and playoffs',
          type: 'image/png',
        },
      ],
      title: 'College commitments',
      url: '/commits',
    },
  },
  'app/recruiting/page.tsx': {
    title: 'Recruiting',
    description: 'The recruiting profiles, youth clubs and college commitments of players on the 102 varsity rosters here, school by school, with a public source for every one. Unofficial and incomplete.',
    alternates: {
      canonical: '/recruiting',
    },
    openGraph: {
      type: 'website',
      siteName: 'NorCal High School Field Hockey',
      locale: 'en_US',
      images: [
        {
          url: '/opengraph-image',
          width: 1200,
          height: 630,
          alt: 'NorCal High School Field Hockey — 2026 standings, scores and playoffs',
          type: 'image/png',
        },
      ],
      title: 'Recruiting',
      url: '/recruiting',
    },
  },
  'app/game/[id]/page.tsx': {
    title: {
      absolute: 'Homestead 4, Santa Clara 0 — field hockey, Aug 24, 2026',
    },
    description: 'Aug 24, 2026: Homestead won their home non-league game against Santa Clara 4–0. Santa Clara Valley Athletic League girls varsity field hockey, Fall 2026 — unofficial, rebuilt twice daily from MaxPreps.',
    alternates: {
      canonical: '/game/30e15701-fddc-4695-9f1c-148e19f58ca5',
    },
    openGraph: {
      type: 'article',
      siteName: 'NorCal High School Field Hockey',
      locale: 'en_US',
      title: 'Homestead 4, Santa Clara 0 — field hockey, Aug 24, 2026',
      description: 'Aug 24, 2026: Homestead won their home non-league game against Santa Clara 4–0. Santa Clara Valley Athletic League girls varsity field hockey, Fall 2026 — unofficial, rebuilt twice daily from MaxPreps.',
      url: '/game/30e15701-fddc-4695-9f1c-148e19f58ca5',
    },
  },
  'app/history/2025-26/page.tsx': {
    title: '2025-26 final standings',
    description: 'Final SCVAL and BVAL girls field hockey standings and all-league awards from the 2025-26 season, from each league’s own documents, and the CCS and San Diego Section playoff brackets. PCAL, MCAL, EAL, Sunset, City, North and Metro are marked unavailable: we found no official 2025-26 final standings. The LA independents are this site’s grouping, so no table of them was published.',
    alternates: {
      canonical: '/history/2025-26',
    },
    openGraph: {
      type: 'website',
      siteName: 'NorCal High School Field Hockey',
      locale: 'en_US',
      images: [
        {
          url: '/opengraph-image',
          width: 1200,
          height: 630,
          alt: 'NorCal High School Field Hockey — 2026 standings, scores and playoffs',
          type: 'image/png',
        },
      ],
      title: '2025-26 final standings',
      url: '/history/2025-26',
    },
  },
  'app/jv/page.tsx': {
    title: 'JV standings',
    description: 'Girls junior varsity field hockey standings for SCVAL, BVAL, PCAL, MCAL, EAL, Sunset, City, North and Metro, unofficial: computed from MaxPreps’ JV results (si.com filling gaps), shown for each division once enough of its JV league games have a score.',
    alternates: {
      canonical: '/jv',
    },
    openGraph: {
      type: 'website',
      siteName: 'NorCal High School Field Hockey',
      locale: 'en_US',
      images: [
        {
          url: '/opengraph-image',
          width: 1200,
          height: 630,
          alt: 'NorCal High School Field Hockey — 2026 standings, scores and playoffs',
          type: 'image/png',
        },
      ],
      title: 'JV standings',
      url: '/jv',
    },
  },
  'app/leaders/page.tsx': {
    title: 'Season leaders',
    description: 'Girls varsity field hockey leaders across SCVAL, BVAL, PCAL, MCAL, EAL, Sunset, City, North, Metro and the LA independents, unofficial: the schools with the best records, the most goals per game (raw and Elo-adjusted) and the highest Elo ratings, and the players with the most points (raw and Elo-adjusted), assists, saves and clean sheets.',
    alternates: {
      canonical: '/leaders',
    },
    openGraph: {
      type: 'website',
      siteName: 'NorCal High School Field Hockey',
      locale: 'en_US',
      images: [
        {
          url: '/opengraph-image',
          width: 1200,
          height: 630,
          alt: 'NorCal High School Field Hockey — 2026 standings, scores and playoffs',
          type: 'image/png',
        },
      ],
      title: 'Season leaders',
      url: '/leaders',
    },
  },
  'app/playoffs/page.tsx': {
    title: 'Playoffs',
    description: 'The 16-team CCS field: SCVAL 7, BVAL 4, PCAL 2, 3 at-large. Seeding meeting Mon Nov 2; quarterfinals Sat Nov 7, final Sat Nov 14. Projected from league results through Oct 1 — unofficial. Every league’s postseason: the CCS championships (SCVAL, BVAL and PCAL), the MCAL tournament, the EAL’s Super Regional, no playoffs for the Sunset or the LA independents and the San Diego Section playoffs (City, North and Metro).',
    alternates: {
      canonical: '/playoffs',
    },
    openGraph: {
      type: 'website',
      siteName: 'NorCal High School Field Hockey',
      locale: 'en_US',
      images: [
        {
          url: '/opengraph-image',
          width: 1200,
          height: 630,
          alt: 'NorCal High School Field Hockey — 2026 standings, scores and playoffs',
          type: 'image/png',
        },
      ],
      title: 'Playoffs',
      description: 'The 16-team CCS field: SCVAL 7, BVAL 4, PCAL 2, 3 at-large. Seeding meeting Mon Nov 2; quarterfinals Sat Nov 7, final Sat Nov 14. Projected from league results through Oct 1 — unofficial. Every league’s postseason: the CCS championships (SCVAL, BVAL and PCAL), the MCAL tournament, the EAL’s Super Regional, no playoffs for the Sunset or the LA independents and the San Diego Section playoffs (City, North and Metro).',
      url: '/playoffs',
    },
  },
  'app/playoffs/[league]/page.tsx': {
    title: 'MCAL tournament',
    description: 'Marin County Athletic League · 6 teams · Quarterfinals Mon Oct 26 · Final Fri Oct 30. Seeds from the MCAL table, the play-in rule and the bracket, computed from published results; unofficial.',
    alternates: {
      canonical: '/playoffs/mcal',
    },
    openGraph: {
      type: 'website',
      siteName: 'NorCal High School Field Hockey',
      locale: 'en_US',
      title: 'MCAL tournament',
      description: 'Marin County Athletic League · 6 teams · Quarterfinals Mon Oct 26 · Final Fri Oct 30. Seeds from the MCAL table, the play-in rule and the bracket, computed from published results; unofficial.',
      url: '/playoffs/mcal',
    },
  },
  'app/schedule/page.tsx': {
    title: 'Schedule & results',
    description: "364 girls varsity field hockey games in SCVAL, BVAL, PCAL, MCAL, EAL, Sunset, City, North, Metro and the LA independents for Fall 2026: 191 final scores, 168 still to come. Each league's full schedule, plus every game day.",
    alternates: {
      canonical: '/schedule',
    },
    openGraph: {
      type: 'website',
      siteName: 'NorCal High School Field Hockey',
      locale: 'en_US',
      images: [
        {
          url: '/opengraph-image',
          width: 1200,
          height: 630,
          alt: 'NorCal High School Field Hockey — 2026 standings, scores and playoffs',
          type: 'image/png',
        },
      ],
      url: '/schedule',
      title: 'Schedule & results — every league',
      description: "364 girls varsity field hockey games in SCVAL, BVAL, PCAL, MCAL, EAL, Sunset, City, North, Metro and the LA independents for Fall 2026: 191 final scores, 168 still to come. Each league's full schedule, plus every game day.",
    },
  },
  'app/schedule/[league]/page.tsx': {
    title: 'SCVAL field hockey schedule and results',
    description: 'All 158 girls varsity field hockey games involving SCVAL teams for Fall 2026, grouped by date: 80 final scores, 75 still to come. Filter by team, game type or status.',
    alternates: {
      canonical: '/schedule/scval',
    },
    openGraph: {
      type: 'website',
      siteName: 'NorCal High School Field Hockey',
      locale: 'en_US',
      title: 'SCVAL field hockey schedule and results',
      description: 'All 158 girls varsity field hockey games involving SCVAL teams for Fall 2026, grouped by date: 80 final scores, 75 still to come. Filter by team, game type or status.',
      url: '/schedule/scval',
    },
  },
  'app/scores/[date]/page.tsx': {
    title: 'Field hockey scores — Mon Aug 24, 2026',
    description: '3 girls varsity field hockey games on Monday, August 24, 2026. Santa Clara 0, Homestead 4 · Marin Catholic 0, SF University 6 · Marin Academy 0, Convent 1.',
    alternates: {
      canonical: '/scores/2026-08-24',
    },
    openGraph: {
      type: 'website',
      siteName: 'NorCal High School Field Hockey',
      locale: 'en_US',
      title: 'Field hockey scores — Mon Aug 24, 2026',
      description: '3 girls varsity field hockey games on Monday, August 24, 2026. Santa Clara 0, Homestead 4 · Marin Catholic 0, SF University 6 · Marin Academy 0, Convent 1.',
      url: '/scores/2026-08-24',
    },
  },
  'app/standings/page.tsx': {
    title: 'Standings',
    description: 'Every division, ordered on points (3 a win, 1 a tie). SCVAL: De Anza: Saint Francis 12 pts · El Camino: Mitty 15 pts. BVAL: Mt. Hamilton: Christopher 6 pts · Santa Teresa: Prospect & Westmont 6 pts. PCAL: Stevenson 18 pts. MCAL: Tamalpais 31 pts. EAL: No league results yet. Sunset: No league results yet. City: No league results yet. North: No league results yet. Metro: No league results yet. LA: No league results yet. League games through Thu Oct 1. Computed from published results; unofficial.',
    alternates: {
      canonical: '/standings',
    },
    openGraph: {
      type: 'website',
      siteName: 'NorCal High School Field Hockey',
      locale: 'en_US',
      title: 'Standings — every league',
      description: 'Every division, ordered on points (3 a win, 1 a tie). SCVAL: De Anza: Saint Francis 12 pts · El Camino: Mitty 15 pts. BVAL: Mt. Hamilton: Christopher 6 pts · Santa Teresa: Prospect & Westmont 6 pts. PCAL: Stevenson 18 pts. MCAL: Tamalpais 31 pts. EAL: No league results yet. Sunset: No league results yet. City: No league results yet. North: No league results yet. Metro: No league results yet. LA: No league results yet. League games through Thu Oct 1. Computed from published results; unofficial.',
      url: '/standings',
    },
  },
  'app/standings/[league]/page.tsx': {
    title: 'SCVAL field hockey standings',
    description: 'Santa Clara Valley Athletic League girls varsity field hockey standings, ordered on points (3 a win, 1 a tie). De Anza: Saint Francis 12 pts · El Camino: Mitty 15 pts. League games through Mon Sep 28. Computed from published results; unofficial.',
    alternates: {
      canonical: '/standings/scval',
    },
    openGraph: {
      type: 'website',
      siteName: 'NorCal High School Field Hockey',
      locale: 'en_US',
      title: 'SCVAL field hockey standings',
      description: 'Santa Clara Valley Athletic League girls varsity field hockey standings, ordered on points (3 a win, 1 a tie). De Anza: Saint Francis 12 pts · El Camino: Mitty 15 pts. League games through Mon Sep 28. Computed from published results; unofficial.',
      url: '/standings/scval',
    },
  },
  'app/teams/page.tsx': {
    title: 'Teams and standings',
    description: 'All 102 girls varsity field hockey teams in SCVAL, BVAL and PCAL (Central Coast Section), MCAL (North Coast Section), EAL (Northern Section), Sunset (Southern Section), City, North and Metro (San Diego Section) and five Southern Section independents, each in its division’s standings table. Find your school.',
    alternates: {
      canonical: '/teams',
    },
    openGraph: {
      type: 'website',
      siteName: 'NorCal High School Field Hockey',
      locale: 'en_US',
      images: [
        {
          url: '/opengraph-image',
          width: 1200,
          height: 630,
          alt: 'NorCal High School Field Hockey — 2026 standings, scores and playoffs',
          type: 'image/png',
        },
      ],
      title: 'Teams and standings',
      url: '/teams',
    },
  },
  'app/teams/[slug]/page.tsx': {
    title: 'St. Ignatius Wildcats field hockey',
    description: 'St. Ignatius Wildcats girls varsity field hockey (SCVAL), unofficial: 3-0-0 in De Anza (9 pts). Schedule, results, player stats, roster, goal margins and CCS picture.',
    alternates: {
      canonical: '/teams/st-ignatius',
    },
    openGraph: {
      type: 'website',
      siteName: 'NorCal High School Field Hockey',
      locale: 'en_US',
      title: 'St. Ignatius — 3-0-0 in De Anza (9 pts)',
      description: 'Scores, schedule and standings for St. Ignatius girls varsity field hockey.',
      url: '/teams/st-ignatius',
    },
  },
  'unknown:clubs': {
    title: 'Club not found',
  },
  'unknown:game': {
    title: 'Game not found',
    robots: {
      index: false,
      follow: false,
    },
  },
  'unknown:playoffs': {
    title: 'Page not found',
  },
  'unknown:schedule': {
    title: 'League not found',
  },
  'unknown:scores': {
    title: 'Day not found',
  },
  'unknown:standings': {
    title: 'League not found',
  },
  'unknown:teams': {
    title: 'Team not found',
  },
  'stub:target': {
    title: {
      absolute: 'San Francisco University 6, Marin Catholic 0 — field hockey, Aug 24, 2026',
    },
    description: 'MCAL game — this result is now on MaxPreps.',
    alternates: {
      canonical: '/game/52f4d487-2655-485c-b8d6-f6790887cbe3',
    },
    openGraph: {
      type: 'website',
      siteName: 'NorCal High School Field Hockey',
      locale: 'en_US',
      title: 'San Francisco University 6, Marin Catholic 0 — field hockey, Aug 24, 2026',
    },
  },
};

let SITE_NAME = '';
let SITE_WORDMARK = '';
let pages: Array<{ path: string; load: () => Promise<Metadata> }> = [];
// EXPECTED's keys: the pages above, the unknown-param branches ('unknown:…') and the superseded stub.
let cases: Record<string, () => Promise<Metadata>> = {};

function read(mod: PageModule, params: Record<string, string> = {}): Promise<Metadata> {
  if (mod.metadata) return Promise.resolve(mod.metadata);
  if (!mod.generateMetadata) throw new Error('no metadata export');
  return Promise.resolve(mod.generateMetadata({ params: Promise.resolve(params) } as never));
}

const m = useCorpusModules('all-2026-10-02', {
  site: () => import('@/views/site/site'),
  data: loadQueries,
  clubs: () => import('@/lib/datasets/clubs'),
  gameRoute: () => import('@/views/game/game-route'),
});

beforeAll(async () => {
  ({ SITE_NAME, SITE_WORDMARK } = m.site);
  const { data, clubs, gameRoute } = m;
  const { getClubSlugs } = clubs;
  const { gameStaticParams } = gameRoute;
  const page = (path: string, mod: () => Promise<PageModule>, params?: Record<string, string>) => ({
    path,
    load: async () => read(await mod(), params),
  });
  pages = [
    page('app/page.tsx', () => import('@/app/page')),
    page('app/not-found.tsx', () => import('@/app/not-found')),
    page('app/about/page.tsx', () => import('@/app/about/page')),
    page('app/clubs/page.tsx', () => import('@/app/clubs/page')),
    page('app/clubs/[slug]/page.tsx', () => import('@/app/clubs/[slug]/page'), { slug: getClubSlugs()[0] }),
    page('app/commits/page.tsx', () => import('@/app/commits/page')),
    page('app/recruiting/page.tsx', () => import('@/app/recruiting/page')),
    page('app/game/[id]/page.tsx', () => import('@/app/game/[id]/page'), gameStaticParams()[0]),
    page('app/history/2025-26/page.tsx', () => import('@/app/history/2025-26/page')),
    page('app/jv/page.tsx', () => import('@/app/jv/page')),
    page('app/leaders/page.tsx', () => import('@/app/leaders/page')),
    page('app/playoffs/page.tsx', () => import('@/app/playoffs/page')),
    page('app/playoffs/[league]/page.tsx', () => import('@/app/playoffs/[league]/page'), { league: 'mcal' }),
    page('app/schedule/page.tsx', () => import('@/app/schedule/page')),
    page('app/schedule/[league]/page.tsx', () => import('@/app/schedule/[league]/page'), { league: 'scval' }),
    page('app/scores/[date]/page.tsx', () => import('@/app/scores/[date]/page'), { date: data.getGameDates()[0] }),
    page('app/standings/page.tsx', () => import('@/app/standings/page')),
    page('app/standings/[league]/page.tsx', () => import('@/app/standings/[league]/page'), { league: 'scval' }),
    page('app/teams/page.tsx', () => import('@/app/teams/page')),
    page('app/teams/[slug]/page.tsx', () => import('@/app/teams/[slug]/page'), { slug: data.getTeams()[0].slug }),
  ];
  const unknown = (key: string, mod: () => Promise<PageModule>, params: Record<string, string>) => ({
    [`unknown:${key}`]: async () => read(await mod(), params),
  });
  cases = {
    ...Object.fromEntries(pages.map((p) => [p.path, p.load])),
    ...unknown('clubs', () => import('@/app/clubs/[slug]/page'), { slug: 'nope' }),
    ...unknown('game', () => import('@/app/game/[id]/page'), { id: 'nope' }),
    ...unknown('playoffs', () => import('@/app/playoffs/[league]/page'), { league: 'nope' }),
    ...unknown('schedule', () => import('@/app/schedule/[league]/page'), { league: 'nope' }),
    ...unknown('scores', () => import('@/app/scores/[date]/page'), { date: '2000-01-01' }),
    ...unknown('standings', () => import('@/app/standings/[league]/page'), { league: 'nope' }),
    ...unknown('teams', () => import('@/app/teams/[slug]/page'), { slug: 'nope' }),
  };
}, CORPUS_HOOK_TIMEOUT);

describe('every route’s metadata object (EXPECTED)', () => {
  it('has a case for every route and no other (the stub is the last test of the file)', () => {
    expect(Object.keys(cases).sort()).toEqual(Object.keys(EXPECTED).filter((key) => key !== STUB).sort());
  });

  // EXPECTED's keys, not `cases`' (filled in by beforeAll, after the tests are collected).
  for (const key of Object.keys(EXPECTED).filter((k) => k !== STUB)) {
    it(`${key}`, async () => {
      expect(await cases[key](), `${key}: Metadata`).toEqual(EXPECTED[key]);
    });
  }
});

describe('the card rule (a segment with an opengraph-image.tsx names no root card)', () => {
  // The routes whose metadata names the root card are exactly those whose own segment has no image
  // file: the file-based image would otherwise be swapped for the generic one (views/site/site.ts
  // ROOT_OG_IMAGE). No route needs an exception: /_not-found lives in app/, whose root card is the
  // file-based one.
  it('every route names ROOT_OG_IMAGE if and only if its directory has no opengraph-image.tsx', async () => {
    const { ROOT_OG_IMAGE } = m.site;
    let root = 0;
    let own = 0;
    for (const { path: route, load } of pages) {
      const dir = path.posix.dirname(route);
      const hasOwnCard = existsSync(path.join(REPO_ROOT, dir, 'opengraph-image.tsx'));
      const { openGraph } = await load();
      if (hasOwnCard) {
        own += 1;
        expect(openGraph?.images, `${route}: its ${dir}/opengraph-image.tsx is the card`).toBeUndefined();
      } else {
        root += 1;
        expect(openGraph?.images, `${route}: no ${dir}/opengraph-image.tsx, so the root card`).toEqual(ROOT_OG_IMAGE.images);
      }
    }
    expect(root, 'routes on the root card').toBeGreaterThan(5);
    expect(own, 'routes on their own card').toBeGreaterThan(5);
  });
});

describe('og:title (views/site/site.ts OG_BASE)', () => {
  it('every page states its own og:title, with no site-name suffix, beside og:site_name', async () => {
    expect(pages.length).toBeGreaterThan(0);
    for (const { path, load } of pages) {
      const og = (await load()).openGraph;
      expect(og, `${path}: openGraph`).toBeDefined();
      expect(typeof og?.title, `${path}: openGraph.title is a stated string`).toBe('string');
      expect(og?.title, `${path}: og:title`).not.toBe('');
      expect(og?.title, `${path}: og:title carries no site-name suffix`).not.toMatch(new RegExp(` — ${SITE_NAME}$`));
      expect(og?.title, `${path}: og:title carries no title-template suffix`).not.toMatch(new RegExp(` — ${SITE_WORDMARK}$`));
      expect(og && 'siteName' in og ? og.siteName : undefined, `${path}: og:site_name`).toBe(SITE_NAME);
    }
  });
});

describe('<title> (search results show about 60 characters of it)', () => {
  // The pages whose own words used to leave the sport to the site-name suffix, which a result cuts.
  const SPORT_PAGES = [
    'app/page.tsx',
    'app/game/[id]/page.tsx',
    'app/schedule/[league]/page.tsx',
    'app/scores/[date]/page.tsx',
    'app/standings/[league]/page.tsx',
    'app/teams/[slug]/page.tsx',
  ];

  it('names the sport in the page’s own part of the title', async () => {
    for (const { path, load } of pages.filter((p) => SPORT_PAGES.includes(p.path))) {
      const { title } = await load();
      const text = typeof title === 'string' ? title : title && 'absolute' in title ? title.absolute : '';
      expect(text, `${path}: title`).toMatch(/field hockey/i);
    }
  });
});

describe('the league list in the site descriptions (views/site/site.ts leaguesBySectionWords)', () => {
  it('builds both styles from SECTIONS and LEAGUES, in config order, the independents named after the leagues', async () => {
    const { coveredLeagueWords, leaguesBySectionWords } = await import('@/views/site/site');
    expect(leaguesBySectionWords('name')).toBe(
      'SCVAL, BVAL and PCAL (Central Coast Section), MCAL (North Coast Section), EAL (Northern Section), Sunset (Southern Section), City, North and Metro (San Diego Section) and five Southern Section independents',
    );
    expect(leaguesBySectionWords('short')).toBe(
      'SCVAL, BVAL and PCAL (CCS), MCAL (NCS), EAL (Northern Section), Sunset (Southern Section), City, North and Metro (San Diego Section) and five Southern Section independents',
    );
    // Per region (SITE_DESCRIPTION's two clauses).
    expect(leaguesBySectionWords('short', 'norcal')).toBe('SCVAL, BVAL and PCAL (CCS), MCAL (NCS) and EAL (Northern Section)');
    expect(leaguesBySectionWords('short', 'socal')).toBe(
      'Sunset (Southern Section), City, North and Metro (San Diego Section) and five Southern Section independents',
    );
    expect(coveredLeagueWords()).toBe('SCVAL, BVAL, PCAL, MCAL, EAL, Sunset, City, North, Metro and the LA independents');
  });

  it('SITE_DESCRIPTION (NorCal first, per region) and the scope note name the nine leagues, the independents and five sections from config', async () => {
    const { SITE_DESCRIPTION, SITE_SCOPE_NOTE } = await import('@/views/site/site');
    expect(SITE_DESCRIPTION, 'views/site/site.ts SITE_DESCRIPTION').toBe(
      'Scores, standings, schedules and playoff pictures for the 49 NorCal girls varsity field hockey teams in SCVAL, BVAL and PCAL (CCS), MCAL (NCS) and EAL (Northern Section), and for the 53 Southern California teams in Sunset (Southern Section), City, North and Metro (San Diego Section) and five Southern Section independents. Rebuilt twice daily from MaxPreps; unofficial.',
    );
    // The independents are covered (DESIGN §24.9): the note names them as covered, and "Other teams" are
    // the ones that appear only as opponents. Never "ten leagues".
    expect(SITE_SCOPE_NOTE, 'views/site/site.ts SITE_SCOPE_NOTE').toBe(
      'Covers the CIF Central Coast Section (SCVAL, BVAL, PCAL), the North Coast Section’s MCAL, the Northern Section’s EAL, the Southern Section’s Sunset field hockey league and the San Diego Section’s City, North and Metro conferences, plus the Southern Section’s five independents (Bonita, Chaminade, Glendora, Harvard-Westlake and Thousand Oaks), schools in no field hockey league. Other teams appear only as opponents.',
    );
    expect(`${SITE_DESCRIPTION} ${SITE_SCOPE_NOTE}`).not.toMatch(/\bten leagues\b|\b10 leagues\b/);
  });

  it('the brand stays NorCal (owner decision, 2026-10-06): the name, the wordmark and the short name', async () => {
    const { SITE_NAME, SITE_SHORT_NAME, SITE_WORDMARK } = await import('@/views/site/site');
    expect(SITE_NAME).toBe('NorCal High School Field Hockey');
    expect(SITE_WORDMARK).toBe('NorCal HS Field Hockey');
    expect(SITE_SHORT_NAME).toBe('NorCal FH');
    expect(SITE_SHORT_NAME.length).toBeLessThanOrEqual(12);
  });

  // The pages' own sentences are app/page.tsx's and app/teams/page.tsx's; this pins only what they
  // take from config: the registry count (home: TEAMS.length; /teams counts the snapshot it is
  // handed, the 49-team corpus here) and the league list.
  it('the home and /teams descriptions carry the league list from config', async () => {
    const { leaguesBySectionWords } = await import('@/views/site/site');
    const home = (await import('@/app/page')).metadata;
    const teams = (await import('@/app/teams/page')).metadata;
    expect(home.description, 'app/page.tsx description').toContain('102 girls varsity field hockey teams');
    for (const [path, d] of [
      ['app/page.tsx', home.description],
      ['app/teams/page.tsx', teams.description],
    ] as const) {
      expect(d, `${path} description`).toContain(leaguesBySectionWords('name'));
    }
  });
});

describe('a superseded si.com game (app/game/[id]/page.tsx stub)', () => {
  // Last in the file: it points SCVAL_SNAPSHOT at a corpus copy (withSnapshotModules), and the
  // file-wide afterAll of useCorpusModules unstubs it.
  it('is titled for its target, canonical to the MaxPreps game, with no og:url', async () => {
    const snap = JSON.parse(readFileSync(corpusSnapshotPath('all-2026-10-02'), 'utf8')) as Snapshot;
    const target = snap.games.find((g) => g.countsFor !== null && !g.contestId.startsWith('sblive:'))!;
    snap.supersededGames = { 'sblive:999999': target.contestId };
    const file = path.join(tempDir('page-metadata'), 'snapshot.json');
    writeFileSync(file, JSON.stringify(snap));
    const { page } = (await withSnapshotModules(file, { page: () => import('@/app/game/[id]/page') })).modules;
    expect(await read(page, { id: 'sblive-999999' }), `${STUB}: Metadata`).toEqual(EXPECTED[STUB]);
  });
});
