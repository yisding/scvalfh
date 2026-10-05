import Link from 'next/link';

import Arrow from '../ui/Arrow';
import type { LeagueCardView } from './home-types';
import SetLeagueButton from './SetLeagueButton';

/**
 * One league in "Find your team" (SPEC §10.1): the short name large, then the full name, the
 * section, `<n> teams`, the division labels (none for a single-division league) and the region in
 * plain words — e.g. `BVAL · Blossom Valley Athletic League · 12 teams · Mt. Hamilton, Santa Teresa
 * · San Jose, Campbell, Saratoga, Morgan Hill and Gilroy`.
 *
 * Two ways on: `Show <SHORT> here` (remembers the league and swaps the home panels; JS only) and the
 * plain link `<SHORT> standings →`, so the card works with no JavaScript at all. No league hue.
 *
 * `wide` is the card the page stretches over both grid columns (SPEC D25's odd last card). From
 * `lg` its text and its two actions sit in one row, text left and actions right, instead of a
 * stack filling ~35% of a 1000px+ card; below `lg` it is the same stack as every other card.
 */
export interface LeagueCardProps {
  card: LeagueCardView;
  className?: string;
  wide?: boolean;
}

export function LeagueCard({ card, className, wide }: LeagueCardProps) {
  return (
    <li
      className={[
        'sx-card flex min-w-0 flex-col p-4 md:p-5',
        wide ? 'lg:flex-row lg:items-center lg:justify-between lg:gap-8' : null,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="min-w-0">
        <h3 className="m-0 text-title text-ink">
          {card.shortName}
          <span className="sr-only"> · {card.name}</span>
        </h3>
        <p aria-hidden="true" className="mt-1 mb-0 text-body text-ink">
          {card.name}
        </p>
        <p className="mt-1 mb-0 text-meta text-ink-2">
          {card.sectionShort} &middot; {card.teamsLine}
          {card.divisions.length > 0 ? <> &middot; {card.divisions.join(', ')}</> : null}
        </p>
        <p className="mt-1 mb-0 text-meta text-ink-3">{card.region}</p>
      </div>
      <div
        className={[
          'mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 pt-4',
          wide ? 'lg:mt-0 lg:shrink-0 lg:pt-0' : null,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <SetLeagueButton leagueId={card.id} shortName={card.shortName} />
        <Link
          href={card.standingsHref}
          prefetch={false}
          className="inline-flex min-h-11 items-center text-meta font-medium text-accent no-underline hover:underline"
        >
          {card.shortName} standings <Arrow />
        </Link>
      </div>
    </li>
  );
}

export default LeagueCard;
