import type { Metadata } from 'next';

import AboutBackfills from '@/components/about/AboutBackfills';
import AboutContact from '@/components/about/AboutContact';
import AboutConventions from '@/components/about/AboutConventions';
import AboutCrossCheck from '@/components/about/AboutCrossCheck';
import AboutDropped from '@/components/about/AboutDropped';
import AboutFreshness from '@/components/about/AboutFreshness';
import AboutHealth from '@/components/about/AboutHealth';
import AboutJv from '@/components/about/AboutJv';
import AboutNotAffiliated from '@/components/about/AboutNotAffiliated';
import AboutPostseason from '@/components/about/AboutPostseason';
import AboutPrivacy from '@/components/about/AboutPrivacy';
import AboutSources from '@/components/about/AboutSources';
import AboutStandingsRules from '@/components/about/AboutStandingsRules';
import OnThisPage from '@/components/about/OnThisPage';
import { RegionSwitcher } from '@/components/layout/LeagueSwitcher';
import PageHeader from '@/components/layout/PageHeader';
import { buildAboutView } from '@/views/about/about-view';
import { pageMetadata } from '@/views/site/page-metadata';

/**
 * `/about` (DESIGN §3.10, SPEC §10.8) — where the data comes from for every league, how each
 * league's standings are computed (SCVAL's by-laws quoted verbatim; BVAL, PCAL, MCAL and EAL
 * generated from their config citations), each league's data health, every si.com backfill, every contest
 * dropped on purpose, the published cross-checks, the update cadence, privacy and the
 * not-affiliated disclaimer. Standings footnotes link `#rules-<league>`; the anchors are stable.
 * The sources section ends with a paragraph on the club data (`#clubs-coverage`, DESIGN §17.1),
 * which links /clubs: hand research, not part of the twice-daily update. The college commitments
 * get one after it (`#commits-coverage`, DESIGN §21.4), linking /commits, for the same reason.
 *
 * A league that publishes no schedule document (`official.mode: 'none'`, the EAL) is never said to
 * have one: its source card names the document its rules come from and prints `official.note` (where
 * its league games come from instead) and its `membershipNote`, its health card says it has no
 * official schedule document, and its postseason (an unbracketed tournament: the Super Regional) is
 * the written rule and dates, with no bracket.
 *
 * The Southern California leagues (DESIGN-socal §2.1, §2.4) are documents-free the same way: the Sunset
 * and the three San Diego conferences publish no schedule, standings or points rule, so their source
 * cards name the section document their rules come from (`SectionConfig.rulesSource`: the Southern
 * Section's Blue Book, the San Diego Section's Green Book), their tables are ordered by this site's own
 * 3-1-0 points and every sentence says so, and their postseason is the Sunset's "no playoffs" note or the
 * San Diego Section's playoffs as the Green Book writes them. The EAL's sentences, which name the Northern
 * Section's Guidelines, are unchanged word for word (tests/ui/eal-views.test.ts pins them); a sentence
 * that names a section's rules document reads it from `rulesSource` (`rulesDocument`,
 * views/about/about-view.ts).
 *
 * This file is the grid: `buildAboutView()` (views/about/about-view.ts) computes everything the page
 * prints that is not written prose, OnThisPage renders the jump list in its two twins, and one
 * component per section (components/about/About*.tsx, in page order) takes the slice of the view it
 * prints.
 */
const DESCRIPTION =
  'How each league’s standings are computed, where the data comes from, and every disagreement with the sources.';

const PAGE_TITLE = 'About & sources';

export const metadata: Metadata = pageMetadata({
  path: '/about',
  title: PAGE_TITLE,
  description: DESCRIPTION,
  ogTitle: PAGE_TITLE,
  card: 'root',
});

export default function AboutPage() {
  const view = buildAboutView();
  return (
    // Three grid children, placed explicitly, so ONE DOM order serves both breakpoints
    // (DESIGN §10.5): the title and lede, then the jump list, then the sections. The rail starts at
    // `lg`; below it the "On this page" disclosure carries the jump list instead.
    <div className="pb-section-lg lg:grid lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start lg:gap-x-10">
      <PageHeader
        className="lg:col-start-1 lg:row-start-1"
        title="About & sources"
        description={`${DESCRIPTION} This is an unofficial, fan-built scoreboard for the ${view.counts.teams} girls varsity field hockey teams in ${view.leagueWords}. Every number on it is either read from a public source and shown as-is, or computed from public game results by rules published below. Nothing is guessed, and every disagreement we find with a source is published rather than quietly resolved.`}
      />

      <OnThisPage toc={view.toc} variant="disclosure" />
      <OnThisPage toc={view.toc} variant="rail" />

      <div className="mt-8 md:mt-10 lg:col-start-1 lg:row-start-2">
        {/* The region control (DESIGN-socal §2.4): the first row of the content column, so the page's
            three-child grid keeps its placement. Each league's source card, rules, health card and
            cross-check carry its region's `data-region-scope`; the site-wide sections show for both. */}
        <RegionSwitcher className="mb-8" />
        <AboutSources {...view} />
        <AboutStandingsRules {...view} />
        <AboutHealth {...view} />
        <AboutConventions {...view} />
        <AboutCrossCheck {...view} />
        <AboutBackfills {...view} />
        <AboutJv {...view} />
        <AboutDropped {...view} />
        <AboutFreshness {...view} />
        <AboutPostseason {...view} />
        <AboutPrivacy />
        <AboutContact {...view} />
        <AboutNotAffiliated {...view} />
      </div>
    </div>
  );
}
