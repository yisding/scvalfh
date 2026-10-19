import Link from 'next/link';

import ExternalLink from '@/components/ui/ExternalLink';
import SectionHeader from '@/components/ui/SectionHeader';
import { CCS, getLeague, isIndependentLeague } from '@/lib/config/leagues';
import { SOURCE_LINKS } from '@/lib/config/source-urls';
import { dateWithYear, timeOfDayPT } from '@/lib/format/dates';
import type { AboutView } from '@/views/about/about-view';
import { postseasonSourceLink } from '@/views/shared/postseason-source';

/**
 * /about#playoffs: the CCS field and where each league's route to it is, a line per league tournament
 * (MCAL), per unbracketed tournament (the EAL's Super Regional) and per Southern California postseason,
 * then the CCS key dates and whether the CCS office's calendar confirms them.
 */
export type AboutPostseasonProps = Pick<
  AboutView,
  'leagues' | 'sections' | 'field' | 'tournamentLeagues' | 'unbracketed' | 'playoffs' | 'ccsCalendarPolled'
  | 'keyDatesConfirmed'
>;

export function AboutPostseason({
  leagues,
  sections,
  field,
  tournamentLeagues,
  unbracketed,
  playoffs,
  ccsCalendarPolled,
  keyDatesConfirmed,
}: AboutPostseasonProps) {
  return (
    <section id="playoffs" className="mt-16">
      <SectionHeader size="lg" kicker="Postseason" />
      <div className="sx-prose">
        <p>
          The CCS field is {field.total} teams: {field.byLeague.map((l) => `${l.shortName} ${l.auto}`).join(', ')} and{' '}
          {field.atLarge} at-large ({CCS.citations.allocation}; {CCS.citations.change}). Each
          league&rsquo;s own route to its automatic berths is under its rules above; the live,
          team-by-team picture is on the{' '}
          <Link href="/playoffs" className="text-accent hover:underline">
            CCS playoffs
          </Link>{' '}
          page.
        </p>
        {tournamentLeagues.map((l) => {
          const ps = getLeague(l.id).postseason;
          return (
            <p key={l.id}>
              {l.section.name}: {sections.find((s) => s.id === l.section.id)?.noChampionshipNote ?? ''}{' '}
              <Link href={`/playoffs/${l.id}`} prefetch={false} className="sx-action text-accent hover:underline">
                {ps.kind === 'league-tournament' ? ps.name : `${l.shortName} postseason`}
              </Link>
            </p>
          );
        })}
        {unbracketed.map((l) => {
          const ps = getLeague(l.id).postseason;
          const source = postseasonSourceLink(l.id);
          if (ps.kind !== 'unbracketed-tournament' || !source) return null;
          return (
            <p key={l.id}>
              {/* The EAL's link words, byte for byte (tests/ui/eal-views.test.ts), from postseasonSourceLink.
                  The section's name stays a text node of its own, as this paragraph has always rendered it
                  (the built HTML separates the two with an empty comment). */}
              {l.section.name}: {ps.note}{' '}
              <ExternalLink href={source.href}>{l.section.name}{source.text.slice(l.section.name.length)}</ExternalLink>
            </p>
          );
        })}
        {/* The Southern California postseasons, from config: the Sunset's "no playoffs" note and the San
            Diego Section's playoffs, each with its source labelled by postseasonSourceLink (the config's
            `postseason.sourceLabel`). */}
        {[...new Map(
          leagues
            .map((l) => ({ l, ps: getLeague(l.id).postseason, source: postseasonSourceLink(l.id) }))
            .filter(({ ps }) => ps.kind === 'no-postseason' || ps.kind === 'section-playoffs')
            // A group with no table keeps its own paragraph: its note speaks of the independents, the
            // Sunset's of Sunset teams, and the first entry of a key is the one kept.
            .map(({ l, ps, source }) => [isIndependentLeague(l.id) ? l.id : `${l.section.id}:${ps.kind}`, { l, ps, source }] as const)
            .filter(([key], i, all) => all.findIndex(([k]) => k === key) === i),
        ).values()].map(({ l, ps, source }) =>
          (ps.kind === 'no-postseason' || ps.kind === 'section-playoffs') && source ? (
            <p key={isIndependentLeague(l.id) ? l.id : `${l.section.id}-${ps.kind}`}>
              {isIndependentLeague(l.id) ? l.name : l.section.name}: {ps.note}{' '}
              <ExternalLink href={source.href}>{source.text}</ExternalLink>{' '}
              <Link href={`/playoffs#${l.id}`} prefetch={false} className="sx-action text-accent hover:underline">
                Playoffs page
              </Link>
            </p>
          ) : null,
        )}
        <h3>CCS key dates</h3>
        {/* The dates sit inside sentences, so they stay in the prose's sans with tabular
            figures (`tabular-nums`), not mono `sx-num`: mono is for digits that stack in a
            column (DESIGN §4.3), and a mono date mid-line read as a pasted code fragment. */}
        <ul className="list-disc">
          <li>
            Entries due &amp; seeding meeting:{' '}
            <span className="tabular-nums">
              {dateWithYear(playoffs.keyDates.entriesDue)}, {timeOfDayPT(playoffs.keyDates.entriesDue)}
            </span>{' '}
            / <span className="tabular-nums">{timeOfDayPT(playoffs.keyDates.seedingMeeting)}</span>
          </li>
          <li>
            Quarterfinals: <span className="tabular-nums">{dateWithYear(playoffs.keyDates.quarterfinals)}</span>
          </li>
          <li>
            Semifinals: <span className="tabular-nums">{dateWithYear(playoffs.keyDates.semifinals)}</span>
          </li>
          <li>
            Final: <span className="tabular-nums">{dateWithYear(playoffs.keyDates.finals)}</span>
          </li>
          <li>
            Committee evaluation:{' '}
            <span className="tabular-nums">
              {dateWithYear(playoffs.keyDates.evaluationMeeting)}, {timeOfDayPT(playoffs.keyDates.evaluationMeeting)}
            </span>
          </li>
        </ul>
        <p className="text-meta text-ink-3">
          {!ccsCalendarPolled
            ? 'The CCS office also publishes a machine-readable calendar for these dates; this site starts polling it in late October and will note here whether it confirms the dates above.'
            : keyDatesConfirmed
              ? "The CCS office's own calendar confirms every date above."
              : "The CCS office's own calendar shows at least one difference from the dates above — check it directly."}{' '}
          <ExternalLink href={SOURCE_LINKS.ccsCalendar}>CCS calendar</ExternalLink>. Official bracket:{' '}
          <ExternalLink href={playoffs.bracketUrl}>{playoffs.bracketPublished ? 'view it' : 'not yet published'}</ExternalLink>.
        </p>
      </div>
    </section>
  );
}

export default AboutPostseason;
