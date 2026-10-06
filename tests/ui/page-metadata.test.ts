/**
 * The og:title rule (components/layout/site.ts OG_BASE): every page states its own og:title, the
 * page's own words with no site-name suffix, because og:site_name carries the brand. A page that
 * left `openGraph.title` out would inherit the TEMPLATED `<title>` (`… — NorCal High School
 * Field Hockey`) on the Next build and not on vinext, which is how the suffix once came and went page by
 * page. One page per route family, its metadata read the way Next reads it (`metadata` or
 * `generateMetadata` with a real param), on the corpus snapshot. Then the league list the site's
 * descriptions build from config (leaguesBySectionWords), pinned to the words the literals had.
 */

import type { Metadata } from 'next';
import { beforeAll, describe, expect, it } from 'vitest';

import { stubCorpusSnapshot } from '../helpers';

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

stubCorpusSnapshot('all-2026-10-02');

beforeAll(async () => {
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
    page('app/jv/page.tsx', () => import('../../app/jv/page')),
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
  it('builds both styles from SECTIONS and LEAGUES, in config order, the independents named after the leagues', async () => {
    const { coveredLeagueWords, leaguesBySectionWords } = await import('../../components/layout/site');
    expect(leaguesBySectionWords('name')).toBe(
      'SCVAL, BVAL and PCAL (Central Coast Section), MCAL (North Coast Section), EAL (Northern Section), Sunset (Southern Section), City, North and Metro (San Diego Section) and three Southern Section independents',
    );
    expect(leaguesBySectionWords('short')).toBe(
      'SCVAL, BVAL and PCAL (CCS), MCAL (NCS), EAL (Northern Section), Sunset (Southern Section), City, North and Metro (San Diego Section) and three Southern Section independents',
    );
    // Per region (SITE_DESCRIPTION's two clauses).
    expect(leaguesBySectionWords('short', 'norcal')).toBe('SCVAL, BVAL and PCAL (CCS), MCAL (NCS) and EAL (Northern Section)');
    expect(leaguesBySectionWords('short', 'socal')).toBe(
      'Sunset (Southern Section), City, North and Metro (San Diego Section) and three Southern Section independents',
    );
    expect(coveredLeagueWords()).toBe('SCVAL, BVAL, PCAL, MCAL, EAL, Sunset, City, North, Metro and the Southern Section independents');
  });

  it('SITE_DESCRIPTION (NorCal first, per region) and the scope note name the nine leagues, the independents and five sections from config', async () => {
    const { SITE_DESCRIPTION, SITE_SCOPE_NOTE } = await import('../../components/layout/site');
    expect(SITE_DESCRIPTION, 'components/layout/site.ts SITE_DESCRIPTION').toBe(
      'Scores, standings, schedules and playoff pictures for the 49 NorCal girls varsity field hockey teams in SCVAL, BVAL and PCAL (CCS), MCAL (NCS) and EAL (Northern Section), and for the 53 Southern California teams in Sunset (Southern Section), City, North and Metro (San Diego Section) and three Southern Section independents. Rebuilt twice daily from MaxPreps; unofficial.',
    );
    // The independents are covered (DESIGN §24.9): the note names them as covered, and "Other teams" are
    // the ones that appear only as opponents. Never "ten leagues".
    expect(SITE_SCOPE_NOTE, 'components/layout/site.ts SITE_SCOPE_NOTE').toBe(
      'Covers the CIF Central Coast Section (SCVAL, BVAL, PCAL), the North Coast Section’s MCAL, the Northern Section’s EAL, the Southern Section’s Sunset field hockey league and the San Diego Section’s City, North and Metro conferences, plus the Southern Section’s three independents (Glendora, Harvard-Westlake and Thousand Oaks), which play no league games. Other teams appear only as opponents.',
    );
    expect(`${SITE_DESCRIPTION} ${SITE_SCOPE_NOTE}`).not.toMatch(/\bten leagues\b|\b10 leagues\b/);
  });

  it('the brand stays NorCal (owner decision, 2026-10-06): the name, the wordmark and the short name', async () => {
    const { SITE_NAME, SITE_SHORT_NAME, SITE_WORDMARK } = await import('../../components/layout/site');
    expect(SITE_NAME).toBe('NorCal High School Field Hockey');
    expect(SITE_WORDMARK).toBe('NorCal HS Field Hockey');
    expect(SITE_SHORT_NAME).toBe('NorCal FH');
    expect(SITE_SHORT_NAME.length).toBeLessThanOrEqual(12);
  });

  // The pages' own sentences are app/page.tsx's and app/teams/page.tsx's; this pins only what they
  // take from config: the registry count (home: TEAMS.length; /teams counts the snapshot it is
  // handed, the 49-team corpus here) and the league list.
  it('the home and /teams descriptions carry the league list from config', async () => {
    const { leaguesBySectionWords } = await import('../../components/layout/site');
    const home = (await import('../../app/page')).metadata;
    const teams = (await import('../../app/teams/page')).metadata;
    expect(home.description, 'app/page.tsx description').toContain('102 girls varsity field hockey teams');
    for (const [path, d] of [
      ['app/page.tsx', home.description],
      ['app/teams/page.tsx', teams.description],
    ] as const) {
      expect(d, `${path} description`).toContain(leaguesBySectionWords('name'));
    }
  });
});
