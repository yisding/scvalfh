import type { Metadata } from 'next';

import CrossLeagueLatest from '../components/home/CrossLeagueLatest';
import FindYourTeam from '../components/home/FindYourTeam';
import LeagueCard from '../components/home/LeagueCard';
import LeaguePanel from '../components/home/LeaguePanel';
import MyTeamCard from '../components/home/MyTeamCard';
import { buildHomeView } from '../components/home/home-view';
import LeagueSwitcher from '../components/layout/LeagueSwitcher';
import PageHeader from '../components/layout/PageHeader';
import { OG_BASE, SITE_NAME, leaguesBySectionWords } from '../components/layout/site';
import { listWords, shortDate } from '../lib/format';
import { LEAGUES } from '../lib/leagues';
import { TEAMS } from '../lib/teams';

/**
 * `/` — "What just happened in MY league, and when's my team's next game?" (SPEC §10.1, §8.2)
 *
 * Every league's panel is in the static HTML. The remembered league (`localStorage`, stamped on
 * `<html data-league>` by the prefs script before first paint) and the scope stylesheet decide
 * which `data-scope` blocks show: `all` always, `none` only when no league is effective (the
 * first-visit view: Find your team + the latest from every league), `<id>` only for that league.
 * No CSS reordering anywhere: DOM order is the reading order (WCAG 1.3.2 / 2.4.3), and a hidden
 * block is `display: none`, out of the accessibility tree. JS off or storage blocked → no stamp →
 * the first-visit view with every link working.
 *
 * Imports are relative, never `@/` (README, "Local development"): tests/ui/home-view.test.ts renders
 * this page with `react-dom/server` under Vitest, which has no path alias.
 *
 * Everything is read through `components/home/home-view.ts` (which reads only `lib/data.ts`) and
 * formatted in America/Los_Angeles from `snapshot.fetchedAt`; no page calls `Date.now()`, and
 * there is no `searchParams` in this signature, which is what keeps the route static.
 */
export const metadata: Metadata = {
  description: `Scores, standings and playoff pictures for the ${TEAMS.length} girls varsity field hockey teams in ${leaguesBySectionWords('name')}. Unofficial, updated twice daily.`,
  alternates: { canonical: '/' },
  openGraph: { ...OG_BASE, title: SITE_NAME, url: '/' },
};

/** 'SCVAL, BVAL, PCAL, MCAL and EAL', from the config (never a literal list), as app/not-found.tsx builds it. */
const LEAGUE_LIST = listWords(LEAGUES.map((l) => l.shortName));

export default function HomePage() {
  const data = buildHomeView();
  const { status } = data;

  return (
    <div className="pb-section-lg">
      <div data-scope="all">
        <PageHeader
          title="NorCal High School Field Hockey Teams"
          srTitle={` — girls varsity scores, standings and playoff pictures for ${LEAGUE_LIST}`}
          meta={
            /* One line at 390: the league list wrapped onto a second line there, and the leagues
               are named by the switcher chips right below. From 640px it fits and comes back; the
               text stays in the DOM either way. */
            <p className="m-0 text-meta text-ink-2">
              {status.resultsThrough ? `Results through ${shortDate(status.resultsThrough)}` : 'No results yet'}{' '}
              &middot; {status.teamCount} teams
              <span className="hidden sm:inline"> &middot; {status.leagueShorts.join(' · ')}</span>
            </p>
          }
        />
      </div>

      {/* My team: hidden (with its heading) when there is no pin, no league and no stale pin. */}
      <section data-scope="all" className="sx-myteam-slot mt-8 md:mt-10" aria-labelledby="my-team-heading">
        <MyTeamCard views={data.teamViews} index={data.searchIndex} />
      </section>

      <div data-scope="all" className="mt-6">
        <LeagueSwitcher mode="scope" includeAll label="Your league" leagues={data.leagueChips} />
      </div>

      <FindYourTeam index={data.searchIndex} className="mt-8 md:mt-10">
        {data.leagueCards.map((card, i, cards) => (
          <LeagueCard
            key={card.id}
            card={card}
            wide={cards.length % 2 === 1 && i === cards.length - 1}
            // The last card of an odd count spans both columns of the two-up grid, so five cards
            // read 2 + 2 + 1 full-width rather than ending on an orphan half-card.
            className={cards.length % 2 === 1 && i === cards.length - 1 ? 'min-[390px]:col-span-2' : undefined}
          />
        ))}
      </FindYourTeam>

      {data.panels.map((panel) => (
        <LeaguePanel key={panel.id} panel={panel} />
      ))}

      <CrossLeagueLatest view={data.crossLeagueLatest} className="mt-section md:mt-section-lg" />
    </div>
  );
}
