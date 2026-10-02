import { shortDate } from '../../lib/format';
import { divisionHeading, getLeague } from '../../lib/leagues';
import { getTeamBySlug } from '../../lib/teams';
import type { LeagueId, OfficialFixture } from '../../lib/types';
import ExternalLink from '../ui/ExternalLink';
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
 */
export interface OfficialFixturesProps {
  fixtures: readonly OfficialFixture[];
  /** The league whose fixtures these are (its schedule links and short name). */
  leagueId: LeagueId;
  /** 'details' collapses the list behind a summary; 'plain' always shows it. */
  variant?: 'details' | 'plain';
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

function FixtureRows({ fixtures }: { fixtures: readonly OfficialFixture[] }) {
  return (
    <ol className="sx-list">
      {fixtures.map((fixture) => (
        <li
          key={`${fixture.dateKey}-${fixture.awayName}-${fixture.homeName}`}
          className="flex min-h-row-1 flex-wrap items-center gap-x-3 gap-y-0.5 px-gutter py-2"
        >
          <time dateTime={fixture.dateKey} className="sx-num w-[5.25rem] shrink-0 text-cell text-ink-2">
            {shortDate(fixture.dateKey)}
          </time>
          {/* The division follows the matchup instead of sitting flush right, where it was
              ~800px from it on a 1280 row. */}
          <span className="min-w-0 text-body text-ink">
            {name(fixture.awaySlug, fixture.awayName)} at {name(fixture.homeSlug, fixture.homeName)}
          </span>
          {divisionHeading(fixture.division) ? (
            <span className="shrink-0 text-meta text-ink-3">{divisionHeading(fixture.division)}</span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

export function OfficialFixtures({
  fixtures,
  leagueId,
  variant = 'details',
  className,
}: OfficialFixturesProps) {
  if (fixtures.length === 0) return null;
  const short = getLeague(leagueId).shortName;
  const links = scheduleLinks(leagueId);
  // Always visible, above the list: what these rows are and where the league publishes them.
  const sentence = (
    <p className="m-0 mb-4 max-w-prose text-meta text-ink-2">
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
    </p>
  );

  if (variant === 'plain') {
    return (
      <div className={className}>
        {sentence}
        {/* Full content width: on /scores/[date] it shares the right edge of the day's cards,
            the pager and the disclosure. */}
        <div className="sx-card sx-flush sx-bleed">
          <FixtureRows fixtures={fixtures} />
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      {sentence}
      {/* Capped at the width of the "How to read" disclosure that follows it. */}
      <details className="sx-card sx-flush sx-bleed md:max-w-3xl">
        <summary className="sx-tap flex min-h-row-1 cursor-pointer list-none items-center gap-2.5 px-gutter py-2 text-body font-medium text-ink [&::-webkit-details-marker]:hidden">
          <svg
            className="sx-chevron shrink-0 text-ink-3"
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
          {fixtures.length} official {short} {fixtures.length === 1 ? 'fixture' : 'fixtures'} with no
          published result
        </summary>
        <div className="border-t border-divider">
          <FixtureRows fixtures={fixtures} />
        </div>
      </details>
    </div>
  );
}

export default OfficialFixtures;
