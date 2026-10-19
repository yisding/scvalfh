import type { Metadata } from 'next';

import LeagueJumpLinks from '@/components/layout/LeagueJumpLinks';
import LeagueSwitcher, { RegionSwitcher } from '@/components/layout/LeagueSwitcher';
import PageHeader from '@/components/layout/PageHeader';
import CcsBracket from '@/components/playoffs/CcsBracket';
import CcsField from '@/components/playoffs/CcsField';
import CcsIntro from '@/components/playoffs/CcsIntro';
import CcsLeagueSection from '@/components/playoffs/CcsLeagueSection';
import KeyDates from '@/components/playoffs/KeyDates';
import NoPostseasonCard from '@/components/playoffs/NoPostseasonCard';
import SectionPlayoffsBlock from '@/components/playoffs/SectionPlayoffsBlock';
import TournamentPointer from '@/components/playoffs/TournamentPointer';
import UnbracketedCard from '@/components/playoffs/UnbracketedCard';
import SectionHeader from '@/components/ui/SectionHeader';
import { shortDate } from '@/lib/format/dates';
import { getLastLeagueResultDate } from '@/lib/queries/games';
import { getCcsField, getPlayoffs } from '@/lib/queries/postseason';
import {
  AT_LARGE_PARAGRAPH,
  asOfPhrase,
  buildPlayoffsPageView,
  postseasonWords,
} from '@/views/playoffs/playoffs-view';
import { pageMetadata } from '@/views/site/page-metadata';

/**
 * /playoffs — "Are we in, and who do we play?" (SPEC §6.3, §10.7; DESIGN-socal §2.4): every league's
 * postseason under a neutral "Playoffs" header, one block per region.
 *
 * NorCal (`<div id="norcal" data-region-scope>`): the CCS page for the three Central Coast Section
 * leagues (its description and field line, which used to be the page header's, open the block). The
 * North Coast Section holds no field hockey championship, so an MCAL reader is pointed to
 * /playoffs/mcal and nothing else is about MCAL. The EAL's postseason, the Northern Section's Super
 * Regional, publishes no bracket, so it has no page of its own: its card (`id="<league id>"`, the
 * target of the EAL chip and jump link) states the rule, the dates and the Guidelines, word for word as
 * before the Southern California amendment.
 *
 * SoCal (`<div id="socal" data-region-scope>`): the San Diego Section's playoffs (Green Book 2026-27
 * Bylaw 2000.1), as the config states them: the qualification line, where the round dates come from,
 * the power rankings the Section places teams from, and that the Section publishes its brackets after
 * its seeding meeting. No bracket is drawn and no seed is projected: the Section, not a league table,
 * places teams. One card per conference (`#city`, `#north-county`, `#metro`) gives each division's table
 * leaders and each team's playoff division (I or II, the Section's 2026 Divisions sheet). Then the
 * Sunset's card (`#sunset`): the Southern Section holds no field hockey playoffs (Blue Book 2011.1,
 * 3500.2), with its source; and the LA independents' card (`#independents`, DESIGN §24.9):
 * the three play as independents (the group's note) and the Section holds no playoffs. No SoCal sentence
 * says "at-large", "automatic qualifier" or "seed".
 *
 * The NorCal blocks, in order: the CCS intro (+ the not-seeded state, one sentence), the NCS pointer
 * card and the EAL card, "The field" (one BerthMeter row per CCS league + the at-large line), "Key
 * dates" (CCS dates plus each league's own crossover / play-in, labelled), the `#scval #bval #pcal`
 * sections (per-division ladder projection, the league's pairings, its qualification sentence), the
 * bracket (`#bracket`) once CCS publishes it, and the at-large paragraph. The jump links, the region
 * control and the league chips sit above both blocks.
 *
 * There is no merged 1-16 order: no rule ranks a De Anza team against a Mt. Hamilton team, and the
 * CCS committee seeds by criteria we cannot compute. Everything is derived from the snapshot and
 * config: "today" is `snapshot.fetchedAt` in Pacific, never `Date.now()`.
 */

const PAGE_TITLE = 'Playoffs';

export async function generateMetadata(): Promise<Metadata> {
  const { keyDates, bracketPublished, games } = getPlayoffs();
  const field = getCcsField();
  const seeded = bracketPublished && games.length > 0;
  const shares = field.byLeague.map((l) => `${l.shortName} ${l.auto}`).join(', ');
  const description = seeded
    ? `The CCS field hockey bracket: quarterfinals ${shortDate(keyDates.quarterfinals)}, semifinals ${shortDate(
        keyDates.semifinals,
      )}, final ${shortDate(keyDates.finals)}. Unofficial, computed from published results.`
    : `The ${field.total}-team CCS field: ${shares}, ${field.atLarge} at-large. Seeding meeting ${shortDate(
        keyDates.seedingMeeting,
      )}; quarterfinals ${shortDate(keyDates.quarterfinals)}, final ${shortDate(
        keyDates.finals,
      )}. Projected from league results ${asOfPhrase(getLastLeagueResultDate())} — unofficial.`;
  const all = `${description} Every league’s postseason: ${postseasonWords()}.`;
  return pageMetadata({
    path: '/playoffs',
    title: PAGE_TITLE,
    description: all,
    ogTitle: PAGE_TITLE,
    ogDescription: all,
    card: 'root',
  });
}

export default function PlayoffsPage() {
  const view = buildPlayoffsPageView();
  const { playoffs, field, summaries, chips, hrefs, tournamentIds } = view;
  const { keyDates } = playoffs;

  return (
    <div className="pb-section-lg">
      {/* 1. The neutral header: every league's postseason, from config. */}
      <PageHeader title={PAGE_TITLE} description={`Where each league’s season leads: ${view.postseasonWords}.`} />

      {/* 2. The region control, its own row under the header (DESIGN-socal §2.4). */}
      <RegionSwitcher className="mt-4" />

      {/* 3. Jump links (shown pre-paint only for the remembered league) and the league chips. */}
      {/* A tournament league's pill leads to its own page; every other league's card is below. */}
      <LeagueJumpLinks
        leagues={summaries}
        hrefs={hrefs}
        arrow={(id) => (tournamentIds.includes(id) ? 'right' : 'down')}
      />
      <LeagueSwitcher mode="anchor" label="Leagues" leagues={chips} hrefs={hrefs} className="mt-4" />

      <div id="norcal" data-region-scope="norcal">
        {/* The CCS intro and the not-seeded state. */}
        <CcsIntro keyDates={keyDates} fieldMeta={view.fieldMeta} seeded={view.seeded} />

        {/* 2. The NCS pointer card: always present, one per league tournament. */}
        {view.tournamentPointers.map((pointer) => (
          <TournamentPointer key={pointer.id} pointer={pointer} />
        ))}

        {/* 2b. One card per unbracketed league (EAL). */}
        {view.unbracketed.map((card) => (
          <UnbracketedCard key={card.id} card={card} />
        ))}

        {/* 4. The field. */}
        <CcsField field={field} />

        {/* 5. Key dates. */}
        {/* The section rule spans the column like its siblings; only the list is capped. */}
        <section id="key-dates" className="mt-section md:mt-section-lg">
          <span id="dates" className="block" />
          <SectionHeader kicker="Key dates" meta="all times PT" />
          <KeyDates
            keyDates={keyDates}
            leagueDates={view.leagueDates}
            confirmed={view.keyDatesConfirmed}
            className="max-w-3xl"
          />
        </section>

        {/* 6. One section per CCS league, config order. */}
        {view.blocks.map((block) => (
          <CcsLeagueSection key={block.summary.id} block={block} field={field} keyDates={keyDates} />
        ))}

        {/* 7. The bracket, once published. */}
        <CcsBracket
          seeded={view.seeded}
          paths={view.paths}
          pending={view.pending}
          divisionLabels={view.divisionLabels}
          playoffs={playoffs}
        />

        {/* 8. The at-large paragraph (verbatim). */}
        <section id="at-large" className="mt-section md:mt-section-lg">
          <SectionHeader kicker="At-large berths" />
          <p className="m-0 max-w-prose text-body text-ink-2">{AT_LARGE_PARAGRAPH}</p>
        </section>
      </div>

      <div id="socal" data-region-scope="socal">
        {view.sds ? <SectionPlayoffsBlock {...view.sds} /> : null}
        {view.noPostseason.map((card) => (
          <NoPostseasonCard key={card.id} card={card} />
        ))}
      </div>
    </div>
  );
}
