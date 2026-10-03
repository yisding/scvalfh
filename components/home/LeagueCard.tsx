import Link from 'next/link';

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
 */
export interface LeagueCardProps {
  card: LeagueCardView;
  className?: string;
}

export function LeagueCard({ card, className }: LeagueCardProps) {
  return (
    <li className={`sx-card flex min-w-0 flex-col p-4 md:p-5${className ? ` ${className}` : ''}`}>
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
      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 pt-4">
        <SetLeagueButton leagueId={card.id} shortName={card.shortName} />
        <Link
          href={card.standingsHref}
          prefetch={false}
          className="inline-flex min-h-11 items-center text-meta font-medium text-accent no-underline hover:underline"
        >
          {card.shortName} standings <span aria-hidden="true">&nbsp;&rarr;</span>
        </Link>
      </div>
    </li>
  );
}

export default LeagueCard;
