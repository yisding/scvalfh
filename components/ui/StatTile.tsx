import MissingValue from './MissingValue';

/**
 * A headline number (DESIGN §7.7, modernization brief §4.17). No sparkline anywhere on this site
 * (§6.2, R-13). A `null` renders an em dash and the tile keeps its full footprint, so the row
 * never reflows.
 *
 * The team page's eight stat tiles (components/teams/TeamStatTiles.tsx), a `<dl>` of label/value
 * groups, 2-up below 768px and 4-up above. Each tile is unboxed: a hairline rule over label over
 * value over sub, a box-score line rather than eight floating cards, and the DOM is in that same order ("Place, 4th, of 8 in De Anza"). It used to pull the
 * label up with `order-first`, which brief §1 vetoes: the reading and caret order must match what
 * is on screen. Below 768px it is compact (a 24px value, a 12px sub).
 *
 * A screen reader announces "list, 8 items" and pairs each label with its number instead of
 * reading 24 loose lines. The card's wrapper div is the `<dl>`'s group div, with `<dt>` (the
 * label) and `<dd>` (the value, then the sub) as its DIRECT children, which is the only shape a
 * `<dl>` group may take (axe `dlitem` / `definition-list`).
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
  /** Spoken in place of `label`; the visible label is then hidden from assistive tech. */
  srLabel?: string;
  /** Spoken in place of `value`; the visible value is then hidden from assistive tech. */
  srValue?: string;
  className?: string;
}

export function StatTile({ label, value, sub, emphasis = 'default', srLabel, srValue, className }: StatTileProps) {
  const valueClass =
    emphasis === 'hero'
      ? 'text-[1.75rem] leading-7 tracking-[-0.02em] md:text-figure md:leading-none'
      : 'text-[1.5rem] leading-7 tracking-[-0.02em] md:text-[1.75rem] md:leading-8';
  const valueText =
    value === null ? (
      <MissingValue words="not reported" />
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
  // NB: no literal sits immediately before `${`. Tailwind v4's scanner does not extract a
  // candidate that runs straight into an interpolation, so written that way this tile silently
  // lost its min-height in the built CSS (DESIGN §7.7). Hence the array join (`m-0` cancels the
  // UA's 40px dd indent).
  return (
    <div className={['flex flex-col border-t border-rule pt-2 md:pt-3', className].filter(Boolean).join(' ')}>
      <dt className="mb-0.5 block text-meta font-medium text-ink-3 md:mb-1">{labelText}</dt>
      <dd className={['m-0 sx-figure block font-semibold text-ink', valueClass].join(' ')}>{valueText}</dd>
      {sub ? (
        <dd className="m-0 mt-0.5 block text-micro font-normal text-ink-2 text-balance md:mt-1 md:text-meta">{sub}</dd>
      ) : null}
    </div>
  );
}

export default StatTile;
