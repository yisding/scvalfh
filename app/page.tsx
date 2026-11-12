import type { Metadata } from 'next';

import FindYourTeam from '../components/home/FindYourTeam';
import { OG_BASE, SITE_NAME, leaguesBySectionWords } from '../components/layout/site';
import JsonLd from '../components/metadata/JsonLd';
import { websiteJsonLd } from '../components/metadata/structured-data';
import { ScoreDay } from '../components/schedule/ScoreDay';
import { getTeamSearchIndex, getToday } from '../lib/data';
import { SPORT_AUDIENCE } from '../lib/sports/current';
import { TEAMS } from '../lib/teams';

/**
 * `/` is the Scores page (DESIGN §33, "Home is Scores"): the score day view opened on today's
 * Pacific date, the same view `/schedule` and `/scores/[date]` print
 * (components/schedule/ScoreDay.tsx). There is no separate home layout. `home` tells the view this is
 * `/`: the visually hidden h1 starts with the site name.
 *
 * The one thing this page adds is the first-visit block, "Find your team", which the view prints at
 * the top of its main column; the scope stylesheet shows it only while no league is remembered.
 *
 * Imports are relative, never `@/` (README, "Local development"): tests/ui/home-view.test.ts renders
 * this page with `react-dom/server` under Vitest, which has no path alias.
 *
 * Static: "today" is the snapshot's own Pacific day (`getToday()`), never `Date.now()`, and there is
 * no `searchParams` in this signature.
 */
export const metadata: Metadata = {
  // Absolute, so the layout's suffix does not repeat the brand.
  title: { absolute: `${SITE_NAME} Scores & Standings` },
  description: `Scores, standings and playoff pictures for the ${TEAMS.length} ${SPORT_AUDIENCE} teams in ${leaguesBySectionWords('name')}. Unofficial, updated twice daily.`,
  alternates: { canonical: '/' },
  openGraph: { ...OG_BASE, title: SITE_NAME, url: '/' },
};

export default function Home() {
  return (
    <>
      <JsonLd data={websiteJsonLd()} />
      <ScoreDay date={getToday()} home before={<FindYourTeam index={getTeamSearchIndex()} />} />
    </>
  );
}
