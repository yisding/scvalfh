import Link from 'next/link';

import { EM_DASH } from '../../lib/format';

/**
 * A headline number (DESIGN §7.7, modernization brief §4.17). No sparkline anywhere on this site
 * (§6.2, R-13). A `null` renders an em dash and the tile keeps its full footprint, so the row
 * never reflows.
 *
 * - `plain` (default; History, the playoffs KeyDates): no surface of its own, the value over a
 *   14px sans label and an optional sub line.
 * - `card` (the team page): its own `.sx-card`, label over value over sub, and the DOM is in that
 *   same order ("Place, 4th, of 8 in De Anza"). It used to pull the label up with `order-first`,
 *   which brief §1 vetoes: the reading and caret order must match what is on screen. Below 768px
 *   the card is compact (12px padding, a 24px value, a 12px sub, no 96px floor) so the six tiles
 *   take three short rows and the Last result still reaches the first phone screen.
 */
export interface StatTileProps {
  label: string;
  value: string | number | null;
  /** "league games only", "7th of 8" */
  sub?: string;
  /** 'hero' = the top of the text-figure clamp. ONE per view. */
  emphasis?: 'default' | 'hero';
  /** Default `plain`. */
  variant?: 'plain' | 'card';
  href?: string;
  className?: string;
}

export function StatTile({
  label,
  value,
  sub,
  emphasis = 'default',
  variant = 'plain',
  href,
  className,
}: StatTileProps) {
  const isCard = variant === 'card';
  const valueClass =
    emphasis === 'hero'
      ? isCard
        ? 'text-[1.75rem] leading-7 tracking-[-0.02em] md:text-figure md:leading-none'
        : 'text-figure'
      : isCard
        ? 'text-[1.5rem] leading-7 tracking-[-0.02em] md:text-[1.75rem] md:leading-8'
        : 'text-[1.75rem] leading-none tracking-[-0.02em]';
  const valueEl = (
    <span className={`sx-figure block font-semibold text-ink ${valueClass}`}>
      {value === null ? <span aria-label="not reported">{EM_DASH}</span> : value}
    </span>
  );
  const labelEl = (
    <span
      className={
        isCard
          ? 'mb-0.5 block text-meta font-medium text-ink-3 md:mb-1'
          : 'mt-1.5 block text-meta font-medium text-ink-3'
      }
    >
      {label}
    </span>
  );
  const body = (
    <>
      {isCard ? labelEl : valueEl}
      {isCard ? valueEl : labelEl}
      {sub ? (
        <span
          className={
            isCard
              ? 'mt-0.5 block text-micro font-normal text-ink-2 text-balance md:mt-1 md:text-meta'
              : 'mt-1 block text-meta text-ink-2'
          }
        >
          {sub}
        </span>
      ) : null}
    </>
  );
  // NB: the literal must not sit immediately before `${`. Tailwind v4's scanner does not extract
  // a candidate that runs straight into an interpolation, so written that way this tile silently
  // lost its min-height in the built CSS (DESIGN §7.7). Hence the array join.
  const wrapper = isCard
    ? ['sx-card flex flex-col p-3 md:min-h-[6rem] md:p-4', href ? 'sx-lift' : null, className]
    : ['min-h-[4.75rem]', className];
  const inner = isCard ? 'flex flex-1 flex-col' : 'block';
  return (
    <div className={wrapper.filter(Boolean).join(' ')}>
      {/* `prefetch={false}` for the reason the nav and the standings rows carry it
          (components/layout/NavLink.tsx, components/ui/StandingsTable.tsx): every route here is
          STATIC, so Next 16's `auto` downloads the whole linked route the moment the link scrolls
          into view, and tiles come in rows of five. Navigation still fetches on click. */}
      {href ? (
        <Link href={href} prefetch={false} className={`${inner} no-underline hover:underline`}>
          {body}
        </Link>
      ) : isCard ? (
        <div className={inner}>{body}</div>
      ) : (
        body
      )}
    </div>
  );
}

export default StatTile;
