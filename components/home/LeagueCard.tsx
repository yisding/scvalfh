import Link from 'next/link';

import Arrow from '@/components/ui/Arrow';
import type { LeagueCardView } from './home-types';
import SetLeagueButton from './SetLeagueButton';

/**
 * One league in "Find your team" (SPEC §10.1): the short name large, then the full name, the
 * section, `<n> teams`, the division labels (none for a single-division league) and its cities in
 * plain words (`LeagueConfig.cities`) — e.g. `BVAL · Blossom Valley Athletic League · 12 teams · Mt. Hamilton, Santa Teresa
 * · San Jose, Campbell, Saratoga, Morgan Hill and Gilroy`.
 *
 * Two ways on: `Show <SHORT> here` (remembers the league and swaps the home panels; JS only) and the
 * plain link `<SHORT> standings →`, so the card works with no JavaScript at all. No league hue.
 *
 * `wide` is the card the page stretches over both grid columns (SPEC D25's odd last card). From
 * `lg` its text and its two actions sit in one row, text left and actions right, instead of a
 * stack filling ~35% of a 1000px+ card; below `lg` it is the same stack as every other card.
 *
 * Two cards side by side line up line for line. From 390px (two-up) every other card is a subgrid
 * of five rows, the four text lines and the actions, so each line takes the height of the taller of
 * the pair: where "Sunset field hockey" wrapped and "City Conference" did not, the lines under them
 * started 24px apart and the buttons 16px apart. The wide card is alone in its row and keeps its
 * flex stack (and its `lg` row). The button has one size per breakpoint, not its words' width:
 * full width and 60px (two lines) in a 141px two-up card below 640px, where "Show Sunset here"
 * wrapped and "Show City here" did not (60 against 44px); from 640px a fixed 200px ("Show North
 * County here" is 196px) and the link a fixed 136px ("Sunset standings →" is 132px), so the
 * link sits beside the button in both cards of a row or under it in both, at one x (it moved
 * 165–228px with the button's width).
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
        wide
          ? 'lg:flex-row lg:items-center lg:justify-between lg:gap-8'
          : // `gap-y-0`: a subgrid inherits the card grid's 12–16px row gap between its own rows.
            'min-[390px]:row-span-5 min-[390px]:grid min-[390px]:grid-cols-[minmax(0,1fr)] min-[390px]:grid-rows-subgrid min-[390px]:gap-y-0',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* `contents` in a subgrid card, so each line below is a row of the subgrid. */}
      <div className={wide ? 'min-w-0' : 'min-w-0 min-[390px]:contents'}>
        {/* An h4: the card sits under its region's h3 in "Find your team" (DESIGN-socal §2.4). */}
        <h4 className="m-0 text-title text-ink">
          {card.shortName}
          <span className="sr-only"> · {card.name}</span>
        </h4>
        <p aria-hidden="true" className="mt-1 mb-0 text-body text-ink">
          {card.name}
        </p>
        <p className="mt-1 mb-0 text-meta text-ink-2">
          {card.sectionShort} &middot; {card.teamsLine}
          {card.divisions.length > 0 ? <> &middot; {card.divisions.join(', ')}</> : null}
        </p>
        <p className="mt-1 mb-0 text-meta text-ink-3">{card.cities}</p>
      </div>
      <div
        className={[
          'mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 pt-4',
          wide ? 'lg:mt-0 lg:shrink-0 lg:pt-0' : null,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <SetLeagueButton
          leagueId={card.id}
          shortName={card.showName}
          className={
            wide
              ? 'w-full justify-center sm:w-auto'
              : 'w-full justify-center min-[390px]:min-h-[3.75rem] sm:w-[12.5rem] sm:min-h-11'
          }
        />
        <Link
          href={card.standingsHref}
          prefetch={false}
          className={[
            'inline-flex min-h-11 items-center gap-1 text-meta font-medium text-accent no-underline hover:underline',
            wide ? null : 'sm:w-[8.5rem]',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {card.standingsLabel} <Arrow />
        </Link>
      </div>
    </li>
  );
}

export default LeagueCard;
