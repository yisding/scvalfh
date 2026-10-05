import { ordinal } from '../../lib/format';

import MissingValue from './MissingValue';

/**
 * A team's place, in the site's two notations (DESIGN §7.3, §5.3): a table cell's `1` / `T7`, and
 * a pill's or a tile's `1st` / `T-7th`. A shared place's `T` mark is aria-hidden and paired with
 * a visually hidden "tied for 7th", so a screen reader never says "T seven"; a team with no
 * reported results gets an em dash and "not ranked" (`ranked={false}`), never a place it has not
 * earned. lib/format's `placeMark` and `placeWords` spell the same notation as strings, for the
 * sentences and the stat tile that cannot take markup.
 *
 * `form="table"`: a shared mark never breaks into a "T" over a "7" (`whitespace-nowrap`, added
 * after `className` and before `tone`). `form="pill"`: the mark is bare, and the caller's wrapper
 * decides how it wraps. The wrapper classes stay the caller's: `className` (`sx-num`, or nothing
 * for the compact table's bare cell) and `tone`, the colour, which a caller may set per state
 * (the playoff tables' ink and ink-3). With no class at all the mark is rendered bare, with no
 * wrapper span.
 */
export interface PlaceMarkProps {
  place: number;
  shared: boolean;
  /** false: the team has no reported results, so the dash and "not ranked". Default true. */
  ranked?: boolean;
  /** Default 'table'. */
  form?: 'table' | 'pill';
  className?: string;
  /** The colour class, written after the no-break rule. */
  tone?: string;
}

export function PlaceMark({ place, shared, ranked = true, form = 'table', className, tone }: PlaceMarkProps) {
  const classes = [className, ranked && shared && form === 'table' ? 'whitespace-nowrap' : null, tone]
    .filter(Boolean)
    .join(' ');
  // Written as JSX text (`T{place}`, `tied for {ordinal}`) so the server HTML keeps one text node
  // per part, as every place cell has always rendered.
  const mark = !ranked ? (
    <MissingValue words="not ranked" />
  ) : shared ? (
    <>
      <span aria-hidden="true">{form === 'table' ? <>T{place}</> : <>T-{ordinal(place)}</>}</span>
      <span className="sr-only">tied for {ordinal(place)}</span>
    </>
  ) : form === 'table' ? (
    place
  ) : (
    ordinal(place)
  );
  return classes ? <span className={classes}>{mark}</span> : <>{mark}</>;
}

export default PlaceMark;
