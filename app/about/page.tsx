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
import SourcesSection from '../../components/about/sections/SourcesSection';
import StandingsSection from '../../components/about/sections/StandingsSection';
import { RegionSwitcher } from '../../components/prefs/LeagueSwitcher';
import PageHeader from '../../components/layout/PageHeader';
import { OG_BASE, ROOT_OG_IMAGE } from '../../components/layout/site';

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
 * that names a section's rules document reads it from `rulesSource` (`rulesDocument`).
 *
 * The page is a composition: components/about/about-view.ts reads the data once (`buildAboutView()`, in
 * the order the page always read it) and works out the sentences more than one section shares; each
 * `<section>` is a server component under components/about/sections/, in page order, taking its slice of
 * the view; a league's rules block is components/about/LeagueRules.tsx and the jump list AboutJumpList.
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
    // Three grid children, placed explicitly, so ONE DOM order serves both breakpoints
    // (DESIGN §10.5): the title and lede, then the jump list, then the sections. The rail starts at
    // `lg`; below it the "On this page" disclosure carries the jump list instead.
    <div className="pb-section-lg lg:grid lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start lg:gap-x-10">
      <PageHeader
        className="lg:col-start-1 lg:row-start-1"
        title="About & sources"
        description={`${DESCRIPTION} This is an unofficial, fan-built scoreboard for the ${teams} girls varsity field hockey teams in ${leagueWords}. Every number on it is either read from a public source and shown as-is, or computed from public game results by rules published below. Nothing is guessed, and every disagreement we find with a source is published rather than quietly resolved.`}
      />

      <AboutJumpList variant="disclosure" items={view.jumpList} />

      <AboutJumpList variant="rail" items={view.jumpList} />

      <div className="mt-8 md:mt-10 lg:col-start-1 lg:row-start-2">
        {/* The region control (DESIGN-socal §2.4): the first row of the content column, so the page's
            three-child grid keeps its placement. Each league's source card, rules, health card and
            cross-check carry its region's `data-region-scope`; the site-wide sections show for both. */}
        <RegionSwitcher className="mb-8" />
        <SourcesSection sources={view.sources} />
        <StandingsSection standings={view.standings} />
        <HealthSection leagues={view.health} />
        <ConventionsSection shootoutSections={view.shootoutSections} />
        <CrossCheckSection crossCheck={view.crossCheck} />
        <BackfillsSection backfilled={view.backfilled} shootoutSections={view.shootoutSections} />
        <JvSection jv={view.jv} />
        <DroppedSection dropped={view.dropped} />
        <FreshnessSection freshness={view.freshness} />
        <PostseasonSection postseason={view.postseason} />
        <PrivacySection />
        <ContactSection noDocument={view.noDocument} />
        <NotAffiliatedSection disclaimer={view.disclaimer} noDocument={view.noDocument} />
      </div>
    </div>
  );
}
