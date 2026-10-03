import { shortDate } from '../../lib/format';
import { divisionHeading, getLeague } from '../../lib/leagues';
import { getTeamBySlug } from '../../lib/teams';
import type { LeagueId, OfficialFixture } from '../../lib/types';
import ExternalLink from '../ui/ExternalLink';
import { plural } from '../ui/plural';
import { officialScheduleLabel } from '../standings/standings-view';

/**
 * Fixtures a league's official schedule publishes and no source has a contest for
 * (`snapshot.officialFixtures`, SPEC §7.8): `Scheduled by <SHORT>, not reported`.
 *
 * Rendered as data, never hard-coded, one block per league; the sentence says exactly what is true:
 * the league scheduled it, no result was published (MaxPreps has no contest, and si.com's score —
 * if it has one — did not meet the site's backfill rule), and we do not invent a result for it.
 * Each row names its division through `divisionHeading()` (nothing for PCAL and MCAL), and the
 * league's official schedule(s) are linked from config, labelled by source (PDF / Google Doc),
 * because these rows are the league's claim, not ours.
 *
 * Each row's status is "No result" once its day has passed and "Upcoming" before — never "not
 * reported", which on a future day page claimed a game that had not been played yet was missing a
 * score. The sr-only line says whose schedule it is on, in the same words as the team page's list
 * (TeamOfficialFixtures).
 */
export interface OfficialFixturesProps {
  fixtures: readonly OfficialFixture[];
  /** The league whose fixtures these are (its schedule links and short name). */
  leagueId: LeagueId;
  /** 'YYYY-MM-DD', the snapshot's day: a fixture before it is "No result", on or after "Upcoming". */
  today: string;
  /** 'details' collapses the list behind a summary; 'plain' always shows it. */
  variant?: 'details' | 'plain';
  /**
   * Replaces the note above the list with a lead-in sentence (a future day page's "Also on
   * <SHORT>’s schedule for this day…"); the note's explanation and schedule links then follow the
   * list.
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

/** The league's official schedule documents, deduped by URL, labelled by division where there are several. */
function scheduleLinks(leagueId: LeagueId): Array<{ href: string; label: string }> {
  const league = getLeague(leagueId);
  const seen = new Map<string, { href: string; label: string }>();
  for (const d of league.divisions) {
    const href = d.official.scheduleUrl;
    if (seen.has(href)) continue;
    const kind = officialScheduleLabel(d.official.source);
    const heading = divisionHeading(d.id);
    seen.set(href, { href, label: heading ? `${heading} ${kind.replace('Official schedule ', '')}` : kind });
  }
  return [...seen.values()];
}

function FixtureRows({
  fixtures,
  today,
  showDate,
  short,
}: {
  fixtures: readonly OfficialFixture[];
  today: string;
  showDate: boolean;
  /** The league's short name, for the sr-only "On <SHORT>’s schedule only". */
  short: string;
}) {
  return (
    <ol className="sx-list">
      {fixtures.map((fixture) => {
        const past = fixture.dateKey < today;
        const heading = divisionHeading(fixture.division);
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
            {heading ? <span className="shrink-0 text-meta text-ink-3">{heading}</span> : null}
            {/* The status reads as a label, never a score slot. Visible as one word; the
                sr-only line says whose schedule it is on, the same words as the team page. */}
            <span
              className="ml-auto text-right text-micro font-semibold uppercase tracking-[0.04em] text-ink-3"
              aria-hidden="true"
            >
              {past ? 'No result' : 'Upcoming'}
            </span>
            <span className="sr-only">
              {`On ${short}’s schedule only, ${past ? 'no result' : 'not played yet'}`}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function OfficialFixtures({
  fixtures,
  leagueId,
  today,
  variant = 'details',
  lead,
  showDate = true,
  className,
}: OfficialFixturesProps) {
  if (fixtures.length === 0) return null;
  const short = getLeague(leagueId).shortName;
  const links = scheduleLinks(leagueId);
  // What these rows are and where the league publishes them.
  const note = (
    <>
      Scheduled per {short}; no result has been published for these, so they carry no result at
      all here.{' '}
      {links.map((link, i) => (
        <span key={link.href}>
          {i > 0 ? ' · ' : null}
          <ExternalLink href={link.href}>
            {link.label}
            <span className="sr-only"> ({short})</span>
          </ExternalLink>
        </span>
      ))}
      .
    </>
  );
  const rows = <FixtureRows fixtures={fixtures} today={today} showDate={showDate} short={short} />;

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
      {/* Always visible, above the list: what these rows are and where the league publishes them. */}
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
          {`${plural(fixtures.length, `official ${short} fixture`, `official ${short} fixtures`)} with no published result`}
        </summary>
        <div className="border-t border-divider">{rows}</div>
      </details>
    </div>
  );
}

export default OfficialFixtures;
