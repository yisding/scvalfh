import type { Metadata } from 'next';

import AboutJumpList from '../../components/about/AboutJumpList';
import { buildAboutView } from '../../components/about/about-view';
import BackfillsSection from '../../components/about/sections/BackfillsSection';
import ContactSection from '../../components/about/sections/ContactSection';
import ConventionsSection from '../../components/about/sections/ConventionsSection';
import CrossCheckSection from '../../components/about/sections/CrossCheckSection';
import DroppedSection from '../../components/about/sections/DroppedSection';
import FreshnessSection from '../../components/about/sections/FreshnessSection';
import HealthSection from '../../components/about/sections/HealthSection';
import JvSection from '../../components/about/sections/JvSection';
import NotAffiliatedSection from '../../components/about/sections/NotAffiliatedSection';
import PostseasonSection from '../../components/about/sections/PostseasonSection';
import PrivacySection from '../../components/about/sections/PrivacySection';
import RatingsSection from '../../components/about/sections/RatingsSection';
import RecruitingSection from '../../components/about/sections/RecruitingSection';
import SourcesSection from '../../components/about/sections/SourcesSection';
import StandingsSection from '../../components/about/sections/StandingsSection';
import PageHeader from '../../components/layout/PageHeader';
import { DATA_CORRECTIONS_URL, OG_BASE, ROOT_OG_IMAGE } from '../../components/layout/site';
import ExternalLink from '../../components/ui/ExternalLink';
import { SPORT_AUDIENCE } from '../../lib/sports/current';

/**
 * `/about` (DESIGN §3.10, SPEC §10.8) — where the data comes from for every league, how each
 * league's standings are computed (SCVAL's by-laws quoted verbatim; BVAL, PCAL, MCAL and EAL
 * generated from their config citations), each league's data health, every si.com backfill, every contest
 * dropped on purpose, the published cross-checks, the update cadence, privacy and the
 * not-affiliated disclaimer. Standings footnotes link `#rules-<league>`; the anchors are stable.
 * /about is the ONE home of method text (DESIGN §33): the other pages link its anchors
 * (`#standings`, `#ratings`, `#playoffs`, `#updates`, `#corrections`, `#sources`, `#jv`,
 * `#recruiting` and its `#clubs-matched` / `#commits-matched`) and say none of it themselves. The
 * club and commitment research is under `#recruiting` (`#clubs-coverage`, `#commits-coverage`,
 * DESIGN §17.1, §21.4): hand research, not part of the twice-daily update.
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
 * that names a section's rules document reads it from `rulesSource` (`rulesDocument`).
 *
 * The page is a composition: components/about/about-view.ts reads the data once (`buildAboutView()`, in
 * the order the page always read it) and works out the sentences more than one section shares; each
 * `<section>` is a server component under components/about/sections/, in page order, taking its slice of
 * the view; a league's rules block is components/about/LeagueRules.tsx and the section index AboutJumpList.
 *
 * Layout (DESIGN §33): the title with the long Updated line under it (the one page that shows it
 * there), a three-sentence summary, then, from 1024, the sections beside a rail that holds the
 * section index; below 1024 the index is a row of links between the summary and the first section.
 * One index in the DOM, placed by the grid. Prose is capped at the reading measure. The page has no
 * region control of its own: each league's source, rules, health and cross-check block carries its
 * region's `data-region-scope`, and the footer and the More sheet switch it.
 */

const DESCRIPTION =
  'How each league’s standings are computed, where the data comes from, and every disagreement with the sources.';

/** The page's title, and its og:title too: og:title never carries the site-name suffix (OG_BASE). */
const PAGE_TITLE = 'About & sources';

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/about' },
  openGraph: { ...OG_BASE, ...ROOT_OG_IMAGE, title: PAGE_TITLE, url: '/about' },
};

export default function AboutPage() {
  const view = buildAboutView();
  const { teams, leagueWords } = view.lede;

  return (
    <div className="pb-section-lg">
      <PageHeader title="About" stamp />

      {/* What it is, where the scores come from, how to report a mistake. */}
      <p className="mt-2 mb-0 max-w-prose text-body text-ink">
        This is an unofficial, fan-built scoreboard for the {teams} {SPORT_AUDIENCE} teams in {leagueWords}. Scores,
        schedules and rosters come from MaxPreps, checked against si.com, cifsshome.org and each league&rsquo;s own
        documents, and every disagreement between them is published below. To report a mistake, post it in the{' '}
        <ExternalLink href={DATA_CORRECTIONS_URL}>Data errors thread on our forum</ExternalLink>.
      </p>

      {/* Main + rail from 1024 (one column below it: the 400px main column `.sx-cols` gives at 768 is
          too narrow for the source rows). DOM order is the phone's: the index, then the sections. */}
      <div className="sx-cols max-lg:block">
        <AboutJumpList items={view.jumpList} className="mt-4 lg:col-start-2 lg:row-start-1 lg:mt-5" />

        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          <SourcesSection sources={view.sources} />
          <StandingsSection standings={view.standings} />
          <RatingsSection />
          <HealthSection leagues={view.health} />
          <ConventionsSection shootoutSections={view.shootoutSections} />
          <CrossCheckSection crossCheck={view.crossCheck} />
          <BackfillsSection backfilled={view.backfilled} shootoutSections={view.shootoutSections} />
          <JvSection jv={view.jv} />
          <DroppedSection dropped={view.dropped} />
          <FreshnessSection freshness={view.freshness} />
          <PostseasonSection postseason={view.postseason} />
          <RecruitingSection commitCount={view.sources.commitCount} />
          <PrivacySection />
          <ContactSection noDocument={view.noDocument} />
          <NotAffiliatedSection disclaimer={view.disclaimer} noDocument={view.noDocument} />
        </div>
      </div>
    </div>
  );
}
