/**
 * Empty trailing cells that finish a short last row of a card's row-major grid list (the roster,
 * /clubs, /commits, /recruiting, the all-league lists on /history). Each row cell draws its own
 * `border-t` rule, so a last row with fewer cells than columns ended its rule part-way across the
 * card, a stub. A filler carries the same single hairline on the card's surface and nothing else,
 * so the rule runs the card's full width; it is `aria-hidden` and holds no content, so a list's
 * item count and reading order are unchanged.
 *
 * `columns` names the breakpoints where the grid's column count changes, as the list's own
 * `sm:grid-cols-2 lg:grid-cols-3` does (one column below the first). A filler is shown only at the
 * breakpoints where `count % cols` leaves the last row short, and never where the list fits in one
 * row: the first row has no rule to finish.
 */
type Breakpoint = 'sm' | 'md' | 'lg';

const ORDER: Breakpoint[] = ['sm', 'md', 'lg'];

// Spelled out whole so Tailwind's scanner generates each one.
const SHOW: Record<Breakpoint, { block: string; hidden: string }> = {
  sm: { block: 'sm:block', hidden: 'sm:hidden' },
  md: { block: 'md:block', hidden: 'md:hidden' },
  lg: { block: 'lg:block', hidden: 'lg:hidden' },
};

/** How many fillers the last row needs at `cols` columns: none when it is full or the only row. */
function missing(count: number, cols: number): number {
  if (cols <= 1 || count <= cols) return 0;
  const rest = count % cols;
  return rest === 0 ? 0 : cols - rest;
}

/** The display classes for the k-th filler (1-based), or null when it is never shown. */
export function fillerClasses(count: number, columns: Partial<Record<Breakpoint, number>>, k: number): string | null {
  const classes = ['hidden'];
  let shown = false;
  let any = false;
  let cols = 1;
  for (const bp of ORDER) {
    cols = columns[bp] ?? cols;
    const show = k <= missing(count, cols);
    if (show !== shown) classes.push(show ? SHOW[bp].block : SHOW[bp].hidden);
    shown = show;
    any ||= show;
  }
  return any ? classes.join(' ') : null;
}

export interface GridRowFillerProps {
  /** How many real cells the grid holds. */
  count: number;
  /** The column count from each breakpoint where it changes, e.g. `{ sm: 2, lg: 3 }`. */
  columns: Partial<Record<Breakpoint, number>>;
  /** The cells' element: `li` in a list, `div` in AwardsBlock's `<dd>`. */
  as?: 'li' | 'div';
}

export function GridRowFiller({ count, columns, as: Tag = 'li' }: GridRowFillerProps) {
  const most = Math.max(0, ...Object.values(columns).map((cols) => (cols ?? 1) - 1));
  const fillers: { k: number; className: string }[] = [];
  for (let k = 1; k <= most; k++) {
    const display = fillerClasses(count, columns, k);
    if (display) fillers.push({ k, className: display });
  }
  return (
    <>
      {fillers.map(({ k, className }) => (
        <Tag key={`filler-${k}`} aria-hidden="true" className={`${className} border-t border-divider bg-surface`} />
      ))}
    </>
  );
}

export default GridRowFiller;
