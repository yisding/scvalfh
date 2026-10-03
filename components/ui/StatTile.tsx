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
 *   take three short rows.
 *
 * `inList` (the team page's eight tiles): the tiles are a `<dl>`, one name/value group per tile,
 * so a screen reader announces "list, 8 items" and pairs each label with its number instead of
 * reading 24 loose lines. The card's wrapper div becomes the `<dl>`'s group div, with `<dt>` (the
 * label) and `<dd>` (the value, then the sub) as its DIRECT children, which is the only shape a
 * `<dl>` group may take (axe `dlitem` / `definition-list`). Only a card without an `href` can do
 * that: a linked tile's children sit inside the `<Link>`, and the label must come first, which the
 * plain variant's value-first order does not.
 *
 * `srLabel` / `srValue` replace what a screen reader hears for a label or value that only reads
 * well to the eye: "L5" is "5 losses in a row", "0 / 52" is "0 for, 52 against".
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
  /** Render as one `<dt>` / `<dd>` group of a parent `<dl>` (card variant, no `href` only). */
  inList?: boolean;
  /** Spoken in place of `label`; the visible label is then hidden from assistive tech. */
  srLabel?: string;
  /** Spoken in place of `value`; the visible value is then hidden from assistive tech. */
  srValue?: string;
  className?: string;
}

export function StatTile({
  label,
  value,
  sub,
  emphasis = 'default',
  variant = 'plain',
  href,
  inList = false,
  srLabel,
  srValue,
  className,
}: StatTileProps) {
  const isCard = variant === 'card';
  const asList = inList && isCard && !href;
  const valueClass =
    emphasis === 'hero'
      ? isCard
        ? 'text-[1.75rem] leading-7 tracking-[-0.02em] md:text-figure md:leading-none'
        : 'text-figure'
      : isCard
        ? 'text-[1.5rem] leading-7 tracking-[-0.02em] md:text-[1.75rem] md:leading-8'
        : 'text-[1.75rem] leading-none tracking-[-0.02em]';
  const valueText =
    value === null ? (
      <span aria-label="not reported">{EM_DASH}</span>
    ) : srValue ? (
      <>
        <span aria-hidden="true">{value}</span>
        <span className="sr-only">{srValue}</span>
      </>
    ) : (
      value
    );
  const labelText = srLabel ? (
    <>
      <span aria-hidden="true">{label}</span>
      <span className="sr-only">{srLabel}</span>
    </>
  ) : (
    label
  );
  // The same three boxes in either shape; `asList` only swaps the elements for dt / dd (`m-0`
  // cancels the UA's 40px dd indent), so a tile is pixel-identical in and out of a <dl>.
  const valueClassName = `sx-figure block font-semibold text-ink ${valueClass}`;
  const valueEl = asList ? (
    <dd className={`m-0 ${valueClassName}`}>{valueText}</dd>
  ) : (
    <span className={valueClassName}>{valueText}</span>
  );
  const labelClassName = isCard
    ? 'mb-0.5 block text-meta font-medium text-ink-3 md:mb-1'
    : 'mt-1.5 block text-meta font-medium text-ink-3';
  const labelEl = asList ? (
    <dt className={labelClassName}>{labelText}</dt>
  ) : (
    <span className={labelClassName}>{labelText}</span>
  );
  const subClassName = isCard
    ? 'mt-0.5 block text-micro font-normal text-ink-2 text-balance md:mt-1 md:text-meta'
    : 'mt-1 block text-meta text-ink-2';
  const body = (
    <>
      {isCard ? labelEl : valueEl}
      {isCard ? valueEl : labelEl}
      {sub ? (
        asList ? (
          <dd className={`m-0 ${subClassName}`}>{sub}</dd>
        ) : (
          <span className={subClassName}>{sub}</span>
        )
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
      ) : asList ? (
        body
      ) : isCard ? (
        <div className={inner}>{body}</div>
      ) : (
        body
      )}
    </div>
  );
}

export default StatTile;
