import { shortDate } from '../../lib/format';
import { DIVISION_LABELS, SOURCE_LINKS } from '../../lib/season';
import { getTeamBySlug } from '../../lib/teams';
import type { OfficialFixture } from '../../lib/types';
import ExternalLink from '../ui/ExternalLink';

/**
 * Fixtures the official SCVAL schedule grids publish and no data source lists
 * (`snapshot.officialFixtures`, SPEC §1.3).
 *
 * Today that is BOTH Homestead–Cupertino legs, which MaxPreps has never published at all even
 * though SBLive has the September one as a played 5-5. So the array is rendered as data, never
 * hard-coded, and the sentence says exactly what is true: SCVAL scheduled it, none of our sources
 * lists it, and we do not invent a score for it (SPEC §5.7 forbids backfilling from a secondary
 * source).
 *
 * Each row's status is "No result" once its day has passed and "Upcoming" before — never "not
 * reported", which on Oct 5's day page claimed a game that had not been played yet was missing a
 * score. The wording, the "On SCVAL's schedule only" kicker the pages put above this and the note
 * sentence are the same as the team page's list (TeamOfficialFixtures, F-28a).
 *
 * Each division's official grid PDF is linked, because these rows are SCVAL's claim, not ours.
 */
export interface OfficialFixturesProps {
  fixtures: readonly OfficialFixture[];
  /** 'YYYY-MM-DD', the snapshot's day: a fixture before it is "No result", on or after "Upcoming". */
  today: string;
  /** 'details' collapses the list behind a summary; 'plain' always shows it. */
  variant?: 'details' | 'plain';
  /**
   * Replaces the note above the list with a lead-in sentence (a day page's "Also on SCVAL's
   * schedule for this day…"); the note's explanation and grid links then follow the list.
   */
  lead?: React.ReactNode;
  /** false drops the date column, for a list that is all one day (a /scores/[date] page). */
  showDate?: boolean;
  className?: string;
}

function name(slug: string | null, fallback: string): string {
  const team = slug ? getTeamBySlug(slug) : undefined;
  return team ? team.name : fallback;
}

function FixtureRows({
  fixtures,
  today,
  showDate,
}: {
  fixtures: readonly OfficialFixture[];
  today: string;
  showDate: boolean;
}) {
  return (
    <ol className="sx-list">
      {fixtures.map((fixture) => {
        const past = fixture.dateKey < today;
        return (
          <li
            key={`${fixture.dateKey}-${fixture.awayName}-${fixture.homeName}`}
            className="flex min-h-row-1 flex-wrap items-center gap-x-3 gap-y-0.5 px-gutter py-2"
          >
            {showDate ? (
              <time
                dateTime={fixture.dateKey}
                className="sx-num w-[5.25rem] shrink-0 text-cell text-ink-2"
              >
                {shortDate(fixture.dateKey)}
              </time>
            ) : null}
            {/* The division follows the matchup instead of sitting flush right, where it was
                ~800px from it on a 1280 row. */}
            <span className="min-w-0 text-body text-ink">
              {name(fixture.awaySlug, fixture.awayName)} at{' '}
              {name(fixture.homeSlug, fixture.homeName)}
            </span>
            <span className="shrink-0 text-meta text-ink-3">
              {DIVISION_LABELS[fixture.division]}
            </span>
            {/* The status reads as a label, never a score slot. Visible as one word; the
                sr-only line says whose schedule it is on, the same words as the team page. */}
            <span
              className="ml-auto text-right text-micro font-semibold uppercase tracking-[0.04em] text-ink-3"
              aria-hidden="true"
            >
              {past ? 'No result' : 'Upcoming'}
            </span>
            <span className="sr-only">
              On SCVAL&rsquo;s schedule only, {past ? 'no result' : 'not played yet'}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function OfficialFixtures({
  fixtures,
  today,
  variant = 'details',
  lead,
  showDate = true,
  className,
}: OfficialFixturesProps) {
  if (fixtures.length === 0) return null;
  // What these rows are and where SCVAL publishes them (the same note as the team page's list).
  const note = (
    <>
      SCVAL&rsquo;s official schedule lists these games, but none of our sources (MaxPreps,
      SBLive/SI) do, so there is no start time or score for them and they count in no record here.
      Official grids: <ExternalLink href={SOURCE_LINKS.scvalDeAnzaSchedule}>De Anza</ExternalLink>{' '}
      · <ExternalLink href={SOURCE_LINKS.scvalElCaminoSchedule}>El Camino</ExternalLink>.
    </>
  );
  const rows = <FixtureRows fixtures={fixtures} today={today} showDate={showDate} />;

  if (variant === 'plain') {
    return (
      <div className={className}>
        {lead ? (
          <p className="m-0 mb-4 max-w-prose text-body text-ink-2">{lead}</p>
        ) : (
          <p className="m-0 mb-4 max-w-prose text-meta text-ink-2">{note}</p>
        )}
        {/* Full content width: on /scores/[date] it shares the right edge of the day's cards,
            the pager and the line under it. */}
        <div className="sx-card sx-flush sx-bleed">{rows}</div>
        {lead ? <p className="mt-3 mb-0 max-w-prose text-meta text-ink-3">{note}</p> : null}
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Always visible, above the list: what these rows are and where SCVAL publishes them. */}
      <p className="m-0 mb-4 max-w-prose text-meta text-ink-2">{note}</p>
      {/* Capped at the width of the "How to read" disclosure that follows it. */}
      <details className="sx-card sx-flush sx-bleed md:max-w-3xl">
        <summary className="sx-tap flex min-h-row-1 cursor-pointer list-none items-center gap-2.5 px-gutter py-2 text-body font-medium text-ink [&::-webkit-details-marker]:hidden">
          {/* A LEADING chevron points right at rest and down when open (`.sx-chevron-lead`,
              globals.css), like the CSS chevron on every `.sx-disclosure`; a trailing one points
              down and flips up. */}
          <svg
            className="sx-chevron sx-chevron-lead shrink-0 text-ink-3"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m4 6 4 4 4-4" />
          </svg>
          {fixtures.length} {fixtures.length === 1 ? 'game' : 'games'} not listed by any source
        </summary>
        <div className="border-t border-divider">{rows}</div>
      </details>
    </div>
  );
}

export default OfficialFixtures;
