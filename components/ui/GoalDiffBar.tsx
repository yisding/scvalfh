import { signedGd } from '../../lib/format';

/**
 * Goal differential as a HUELESS ink bar (DESIGN §5.6, §7.8, R-1).
 *
 * Polarity is POSITION against a shared 1px zero rule — positive extends right, negative left —
 * plus the signed numeral printed beside it. No hue at all: a bar has no adjacent letter to lean
 * on, so a hued bar would make the CVD failure load-bearing, and a blue/red diverging pair would
 * mean "blue = good" on a page where "green = win". One ink, `--sx-bar`, 7.69 light / 8.55 dark.
 *
 * The domain is PER DIVISION (De Anza 32, El Camino 43 on the live snapshot); a shared domain
 * would squash every De Anza bar. Each table's footnote prints its own domain and says the two
 * tables are not comparable (R-2).
 *
 * The bar is aria-hidden: the numeral in the adjacent cell is the accessible value.
 */
export interface GoalDiffBarProps {
  /** null → a `·` on the zero rule (a team with no reported results). */
  value: number | null;
  /** max |gd| for THIS division — never global. */
  domain: number;
  /** phone 72px (36 per arm), desktop 96px (48 per arm). */
  track?: 72 | 96;
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
  const arm = track / 2;
  const safeDomain = Math.max(1, domain);
  const magnitude = value === null ? 0 : Math.min(1, Math.abs(value) / safeDomain);
  const width = Math.round(magnitude * arm);
  return (
    <span
      className={`inline-flex items-center${className ? ` ${className}` : ''}`}
      style={{ width: track, height: thickness + 8 }}
      aria-hidden="true"
    >
      <span className="flex justify-end" style={{ width: arm }}>
        {value !== null && value < 0 ? (
          <span
            className="sx-bar"
            style={{
              width: Math.max(2, width),
              height: thickness,
              borderRadius: '4px 0 0 4px',
            }}
          />
        ) : null}
      </span>
      {/* The zero line is the hairline: solid, neutral, never dashed and never a hue. */}
      <span
        className="sx-zero"
        style={{ width: 1, height: thickness + 8 }}
      />
      <span className="flex items-center" style={{ width: arm }}>
        {value !== null && value > 0 ? (
          <span
            className="sx-bar"
            style={{
              width: Math.max(2, width),
              height: thickness,
              borderRadius: '0 4px 4px 0',
            }}
          />
        ) : null}
        {/* gd === 0 is a 2px square tick on the rule, never an invisible zero-width bar. */}
        {value === 0 ? (
          <span
            className="sx-bar"
            style={{ width: 2, height: thickness }}
          />
        ) : null}
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
 * `barClassName` wraps the PLOT only, so a caller can drop it at a width where the 72px track is
 * the difference between a readable school name and a fragment — the phone table passes
 * `hidden min-[375px]:block`. Nothing announced is lost when it goes: the bar is `aria-hidden` and
 * the signed numeral beside it is the accessible value (DESIGN §7.8).
 */
export function GoalDiffCell({
  value,
  domain,
  track = 72,
  thickness = 8,
  numberWidth = 32,
  barClassName,
}: GoalDiffBarProps & { numberWidth?: number; barClassName?: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={barClassName}>
        <GoalDiffBar value={value} domain={domain} track={track} thickness={thickness} />
      </span>
      <span
        className="sx-num text-meta text-ink text-right"
        style={{ width: numberWidth, display: 'inline-block' }}
      >
        {signedGd(value)}
      </span>
    </span>
  );
}

export default GoalDiffBar;
