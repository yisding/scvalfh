import { shortDate } from '../../lib/format';
import { DIVISION_LABELS, SOURCE_LINKS } from '../../lib/season';
import { getTeamBySlug } from '../../lib/teams';
import type { OfficialFixture } from '../../lib/types';
import ExternalLink from '../ui/ExternalLink';

/**
 * Fixtures the official SCVAL schedule grids publish and MaxPreps has no contest for
 * (`snapshot.officialFixtures`, SPEC §1.3).
 *
 * This is not "the Wilcox list" — it is 16 rows today: Wilcox's whole 14-game De Anza slate plus
 * BOTH Homestead–Cupertino legs, which MaxPreps has never published at all even though SBLive has
 * the September one as a played 5-5. So the array is rendered as data, never hard-coded, and the
 * sentence says exactly what is true: SCVAL scheduled it, MaxPreps reported nothing, and we do not
 * invent a score for it (SPEC §5.7 forbids backfilling from a secondary source).
 *
 * Each division's official grid PDF is linked, because these rows are SCVAL's claim, not ours.
 */
export interface OfficialFixturesProps {
  fixtures: readonly OfficialFixture[];
  /** 'details' collapses the list behind a summary; 'plain' always shows it. */
  variant?: 'details' | 'plain';
  className?: string;
}

function name(slug: string | null, fallback: string): string {
  const team = slug ? getTeamBySlug(slug) : undefined;
  return team ? team.name : fallback;
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
          <span className="min-w-0 flex-1 text-body text-ink">
            {name(fixture.awaySlug, fixture.awayName)} at {name(fixture.homeSlug, fixture.homeName)}
          </span>
          <span className="shrink-0 text-meta text-ink-3">{DIVISION_LABELS[fixture.division]}</span>
        </li>
      ))}
    </ol>
  );
}

export function OfficialFixtures({
  fixtures,
  variant = 'details',
  className,
}: OfficialFixturesProps) {
  if (fixtures.length === 0) return null;
  // Always visible, above the list: what these rows are and where SCVAL publishes them.
  const sentence = (
    <p className="m-0 mb-4 max-w-prose text-meta text-ink-2">
      Scheduled per SCVAL; no result reported by MaxPreps. We do not copy a score in from another
      source for these, so they carry no result at all. Official grids:{' '}
      <ExternalLink href={SOURCE_LINKS.scvalDeAnzaSchedule}>De Anza</ExternalLink> ·{' '}
      <ExternalLink href={SOURCE_LINKS.scvalElCaminoSchedule}>El Camino</ExternalLink>.
    </p>
  );

  if (variant === 'plain') {
    return (
      <div className={className}>
        {sentence}
        <div className="sx-card sx-flush sx-bleed">
          <FixtureRows fixtures={fixtures} />
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      {sentence}
      <details className="sx-card sx-flush sx-bleed">
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
          {fixtures.length} official {fixtures.length === 1 ? 'fixture' : 'fixtures'} with no MaxPreps
          contest
        </summary>
        <div className="border-t border-divider">
          <FixtureRows fixtures={fixtures} />
        </div>
      </details>
    </div>
  );
}

export default OfficialFixtures;
