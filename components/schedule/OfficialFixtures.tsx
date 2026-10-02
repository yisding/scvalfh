import { shortDate } from '../../lib/format';
import { DIVISION_LABELS, SOURCE_LINKS } from '../../lib/season';
import { getTeamBySlug } from '../../lib/teams';
import type { OfficialFixture } from '../../lib/types';
import ExternalLink from '../ui/ExternalLink';

/**
 * Fixtures the official SCVAL schedule grids publish and MaxPreps has no contest for
 * (`snapshot.officialFixtures`, SPEC §1.3).
 *
 * Today that is BOTH Homestead–Cupertino legs, which MaxPreps has never published at all even
 * though SBLive has the September one as a played 5-5. So the array is rendered as data, never hard-coded, and the
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
    <ol className="sx-list mt-2">
      {fixtures.map((fixture) => (
        <li
          key={`${fixture.dateKey}-${fixture.awayName}-${fixture.homeName}`}
          className="flex min-h-11 flex-wrap items-center gap-x-2 py-2 text-meta"
        >
          <time dateTime={fixture.dateKey} className="sx-num w-16 shrink-0 text-ink-2">
            {shortDate(fixture.dateKey)}
          </time>
          <span className="text-ink">
            {name(fixture.awaySlug, fixture.awayName)} at {name(fixture.homeSlug, fixture.homeName)}
          </span>
          <span className="text-ink-3">{DIVISION_LABELS[fixture.division]}</span>
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
  const sentence = (
    <>
      Scheduled per SCVAL; no result reported by MaxPreps. We do not copy a score in from another
      source for these, so they carry no result at all. Official grids:{' '}
      <ExternalLink href={SOURCE_LINKS.scvalDeAnzaSchedule}>De Anza</ExternalLink> ·{' '}
      <ExternalLink href={SOURCE_LINKS.scvalElCaminoSchedule}>El Camino</ExternalLink>.
    </>
  );

  if (variant === 'plain') {
    return (
      <div className={className}>
        <p className="m-0 max-w-[62ch] text-meta text-ink-2">{sentence}</p>
        <FixtureRows fixtures={fixtures} />
      </div>
    );
  }

  return (
    <details className={className}>
      <summary className="sx-tap flex min-h-11 cursor-pointer list-none items-center gap-2 text-meta text-ink [&::-webkit-details-marker]:hidden">
        <span className="shrink-0 text-ink-3" aria-hidden="true">
          &#8964;
        </span>
        {fixtures.length} official {fixtures.length === 1 ? 'fixture' : 'fixtures'} with no MaxPreps
        contest
      </summary>
      <p className="mt-1 mb-0 max-w-[62ch] text-meta text-ink-2">{sentence}</p>
      <FixtureRows fixtures={fixtures} />
    </details>
  );
}

export default OfficialFixtures;
