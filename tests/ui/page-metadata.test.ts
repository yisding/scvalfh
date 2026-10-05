/**
 * The og:title rule (components/layout/site.ts OG_BASE): every page states its own og:title, the
 * page's own words with no site-name suffix, because og:site_name carries the brand. A page that
 * left `openGraph.title` out would inherit the TEMPLATED `<title>` (`… — NorCal High School Field
 * Hockey`) on the Next build and not on vinext, which is how the suffix once came and went page by
 * page. One page per route family, its metadata read the way Next reads it (`metadata` or
 * `generateMetadata` with a real param), on the corpus snapshot. Then the league list the site's
 * descriptions build from config (leaguesBySectionWords), pinned to the words the literals had.
 */

import type { Metadata } from 'next';
import { beforeAll, describe, expect, it } from 'vitest';

import { corpusSnapshotPath } from '../helpers';

interface PageModule {
  metadata?: Metadata;
  // Each page's own PageProps<'/route'>; the test hands it `{ params }` and nothing else reads more.
  generateMetadata?: (props: never) => Metadata | Promise<Metadata>;
}

let SITE_NAME = '';
let pages: Array<{ path: string; load: () => Promise<Metadata> }> = [];

function read(mod: PageModule, params: Record<string, string> = {}): Promise<Metadata> {
  if (mod.metadata) return Promise.resolve(mod.metadata);
  if (!mod.generateMetadata) throw new Error('no metadata export');
  return Promise.resolve(mod.generateMetadata({ params: Promise.resolve(params) } as never));
}

beforeAll(async () => {
  process.env.SCVAL_SNAPSHOT = corpusSnapshotPath('all-2026-10-02');
  ({ SITE_NAME } = await import('../../components/layout/site'));
  const data = await import('../../lib/data');
  const { getClubSlugs } = await import('../../lib/clubs');
  const { gameStaticParams } = await import('../../components/game/game-view');
  const page = (path: string, mod: () => Promise<PageModule>, params?: Record<string, string>) => ({
    path,
    load: async () => read(await mod(), params),
  });
  pages = [
    page('app/page.tsx', () => import('../../app/page')),
    page('app/not-found.tsx', () => import('../../app/not-found')),
    page('app/about/page.tsx', () => import('../../app/about/page')),
    page('app/clubs/page.tsx', () => import('../../app/clubs/page')),
    page('app/clubs/[slug]/page.tsx', () => import('../../app/clubs/[slug]/page'), { slug: getClubSlugs()[0] }),
    page('app/commits/page.tsx', () => import('../../app/commits/page')),
    page('app/game/[id]/page.tsx', () => import('../../app/game/[id]/page'), gameStaticParams()[0]),
    page('app/history/2025-26/page.tsx', () => import('../../app/history/2025-26/page')),
    page('app/leaders/page.tsx', () => import('../../app/leaders/page')),
    page('app/playoffs/page.tsx', () => import('../../app/playoffs/page')),
    page('app/playoffs/[league]/page.tsx', () => import('../../app/playoffs/[league]/page'), { league: 'mcal' }),
    page('app/schedule/page.tsx', () => import('../../app/schedule/page')),
    page('app/schedule/[league]/page.tsx', () => import('../../app/schedule/[league]/page'), { league: 'scval' }),
    page('app/scores/[date]/page.tsx', () => import('../../app/scores/[date]/page'), { date: data.getGameDates()[0] }),
    page('app/standings/page.tsx', () => import('../../app/standings/page')),
    page('app/standings/[league]/page.tsx', () => import('../../app/standings/[league]/page'), { league: 'scval' }),
    page('app/teams/page.tsx', () => import('../../app/teams/page')),
    page('app/teams/[slug]/page.tsx', () => import('../../app/teams/[slug]/page'), { slug: data.getTeams()[0].slug }),
  ];
}, 600_000);

describe('og:title (components/layout/site.ts OG_BASE)', () => {
  it('every page states its own og:title, with no site-name suffix, beside og:site_name', async () => {
    expect(pages.length).toBeGreaterThan(0);
    for (const { path, load } of pages) {
      const og = (await load()).openGraph;
      expect(og, `${path}: openGraph`).toBeDefined();
      expect(typeof og?.title, `${path}: openGraph.title is a stated string`).toBe('string');
      expect(og?.title, `${path}: og:title`).not.toBe('');
      expect(og?.title, `${path}: og:title carries no site-name suffix`).not.toMatch(new RegExp(` — ${SITE_NAME}$`));
      expect(og && 'siteName' in og ? og.siteName : undefined, `${path}: og:site_name`).toBe(SITE_NAME);
    }
  });
});

describe('the league list in the site descriptions (components/layout/site.ts leaguesBySectionWords)', () => {
  it('builds both styles from SECTIONS and LEAGUES, in config order', async () => {
    const { leaguesBySectionWords } = await import('../../components/layout/site');
    expect(leaguesBySectionWords('name')).toBe(
      'SCVAL, BVAL and PCAL (Central Coast Section), MCAL (North Coast Section) and EAL (Northern Section)',
    );
    expect(leaguesBySectionWords('short')).toBe('SCVAL, BVAL and PCAL (CCS), MCAL (NCS) and EAL (Northern Section)');
  });

  it('SITE_DESCRIPTION and the home and /teams descriptions read as they did when they were literals', async () => {
    const { SITE_DESCRIPTION } = await import('../../components/layout/site');
    const home = (await import('../../app/page')).metadata;
    const teams = (await import('../../app/teams/page')).metadata;
    expect(SITE_DESCRIPTION, 'components/layout/site.ts SITE_DESCRIPTION').toBe(
      'Scores, standings, schedules and playoff pictures for 49 girls varsity field hockey teams in SCVAL, BVAL and PCAL (CCS), MCAL (NCS) and EAL (Northern Section). Rebuilt twice daily from MaxPreps; unofficial.',
    );
    expect(home.description, 'app/page.tsx description').toBe(
      'Scores, standings and playoff pictures for the 49 girls varsity field hockey teams in SCVAL, BVAL and PCAL (Central Coast Section), MCAL (North Coast Section) and EAL (Northern Section). Unofficial, updated twice daily.',
    );
    expect(teams.description, 'app/teams/page.tsx description').toBe(
      'All 49 girls varsity field hockey teams in SCVAL, BVAL and PCAL (Central Coast Section), MCAL (North Coast Section) and EAL (Northern Section), each in its division’s standings table. Find your school.',
    );
  });
});
