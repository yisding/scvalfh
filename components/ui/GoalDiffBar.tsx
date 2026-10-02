import { signedGd } from '../../lib/format';

/**
 * Goal differential as a HUELESS ink bar (DESIGN §5.6, §7.8, R-1).
 *
 * Polarity is POSITION against a shared 1px zero rule — positive extends right, negative left —
 * plus the signed numeral printed beside it. No hue at all: a bar has no adjacent letter to lean
 * on, so a hued bar would make the CVD failure load-bearing, and a blue/red diverging pair would
 * mean "blue = good" on a page where "green = win". One ink, `--sx-bar`, 7.69 light / 8.55 dark.
 *
 * Each arm sits on a faint `surface-2` track with a rounded outer cap, so a short bar still reads
 * as a share of a fixed length rather than as a stray tick. The track is decoration only: it is
 * not `.sx-bar`/`.sx-zero`, so forced colours (which rewrite backgrounds to Canvas) simply drop it
 * while the bar and the zero rule keep their own CanvasText fallback from app/globals.css.
 *
 * The domain is PER DIVISION (De Anza 32, El Camino 43 on the live snapshot); a shared domain
 * would squash every De Anza bar. Each table's legend prints its own domain and the page says the
 * two tables are not comparable (R-2).
 *
 * The bar is aria-hidden: the numeral in the adjacent cell is the accessible value.
 */
export interface GoalDiffBarProps {
  /** null → a `·` on the zero rule (a team with no reported results). */
  value: number | null;
  /** max |gd| for THIS division — never global. */
  domain: number;
  /** Phone and mini 56px (28 per arm), desktop 64px; 72 and 96 are kept for compatibility. */
  track?: 56 | 64 | 72 | 96;
  thickness?: 8 | 10;
  className?: string;
}

export function GoalDiffBar({
  value,
  domain,
  track = 72,
  thickness = 8,
  className,
}: GoalDiffBarProps) {
  // Two whole-pixel arms and the 1px rule fit INSIDE `track` (64 → 31 + 1 + 31), so the cell
  // budget the tables are measured against is never exceeded by the rule.
  const arm = Math.floor((track - 1) / 2);
  const safeDomain = Math.max(1, domain);
  const magnitude = value === null ? 0 : Math.min(1, Math.abs(value) / safeDomain);
  const width = Math.round(magnitude * arm);
  const cap = thickness / 2;
  return (
    <span
      className={`inline-flex items-center${className ? ` ${className}` : ''}`}
      style={{ width: arm * 2 + 1, height: thickness + 8 }}
      aria-hidden="true"
    >
      {/* Left arm: the track's rounded cap is on the OUTER (left) end; the bar grows from the rule. */}
      <span
        className="flex justify-end bg-surface-2"
        style={{ width: arm, height: thickness, borderRadius: `${cap}px 0 0 ${cap}px` }}
      >
        {value !== null && value < 0 ? (
          <span
            className="sx-bar"
            style={{
              width: Math.max(2, width),
              height: thickness,
              borderRadius: `${cap}px 0 0 ${cap}px`,
            }}
          />
        ) : null}
      </span>
      {/* The zero line is the hairline: solid, neutral, never dashed and never a hue. */}
      <span className="sx-zero shrink-0" style={{ width: 1, height: thickness + 8 }} />
      <span
        className="flex items-center bg-surface-2"
        style={{ width: arm, height: thickness, borderRadius: `0 ${cap}px ${cap}px 0` }}
      >
        {value !== null && value > 0 ? (
          <span
            className="sx-bar"
            style={{
              width: Math.max(2, width),
              height: thickness,
              borderRadius: `0 ${cap}px ${cap}px 0`,
            }}
          />
        ) : null}
        {/* gd === 0 is a 2px square tick on the rule, never an invisible zero-width bar. */}
        {value === 0 ? <span className="sx-bar" style={{ width: 2, height: thickness }} /> : null}
        {/* gd === null is a round `·` on the rule — a different SHAPE from the square zero tick,
            so "no data" and "a real zero" are told apart without reading the numeral. */}
        {value === null ? (
          <span
            style={{
              width: 3,
              height: 3,
              borderRadius: 999,
              marginLeft: 1,
              background: 'var(--sx-text-3)',
            }}
          />
        ) : null}
      </span>
    </span>
  );
}

/**
 * The bar and its signed numeral, the pairing every standings row uses.
 *
 * `barClassName` wraps the PLOT only, so a caller can drop it at a width where the track is the
 * difference between a readable school name and a fragment — the phone table passes
 * `hidden min-[375px]:block`. Nothing announced is lost when it goes: the bar is `aria-hidden` and
 * the signed numeral beside it is the accessible value (DESIGN §7.8).
 *
 * `numberClassName` sets the numeral's size: 14px `text-meta` by default (the desktop table), 13px
 * `text-cell` in the pixel-budgeted phone and mini tables.
 */
export function GoalDiffCell({
  value,
  domain,
  track = 72,
  thickness = 8,
  numberWidth = 32,
  barClassName,
  numberClassName = 'text-meta',
}: GoalDiffBarProps & { numberWidth?: number; barClassName?: string; numberClassName?: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={barClassName}>
        <GoalDiffBar value={value} domain={domain} track={track} thickness={thickness} />
      </span>
      <span
        className={`sx-num ${numberClassName} text-ink text-right`}
        style={{ width: numberWidth, display: 'inline-block' }}
      >
        {signedGd(value)}
      </span>
    </span>
  );
}

export default GoalDiffBar;
