import { signedGd } from '../../lib/format';

/**
 * Goal differential as a bar (DESIGN §5.6, §7.8; §33 for the face). No table draws it any more
 * (GD is the signed number); kept until the pages stop importing it.
 *
 * Polarity is POSITION against a shared 1px zero rule (positive extends right, negative left) and
 * the sign's colour, green or red, with the signed numeral printed beside it. Square ends and no
 * track: `--sx-loss` on `--sx-surface-3` is under 3:1, so a red bar never sits on a filled track.
 *
 * The domain is PER DIVISION. The bar is aria-hidden: the numeral beside it is the value.
 */
export interface GoalDiffBarProps {
  /** null → a `·` on the zero rule (a team with no reported results). */
  value: number | null;
  /** max |gd| for THIS division — never global. */
  domain: number;
  /** Phone standings 44px (21 per arm), compact and mini 56px (27), desktop 64px. */
  track?: 44 | 56 | 64;
  thickness?: 8 | 10;
  className?: string;
}

export function GoalDiffBar({
  value,
  domain,
  track = 64,
  thickness = 8,
  className,
}: GoalDiffBarProps) {
  // Two whole-pixel arms and the 1px rule fit INSIDE `track` (64 → 31 + 1 + 31), so the cell
  // budget the tables are measured against is never exceeded by the rule.
  const arm = Math.floor((track - 1) / 2);
  const safeDomain = Math.max(1, domain);
  const magnitude = value === null ? 0 : Math.min(1, Math.abs(value) / safeDomain);
  const width = Math.round(magnitude * arm);
  return (
    <span
      className={['inline-flex items-center', className].filter(Boolean).join(' ')}
      style={{ width: arm * 2 + 1, height: thickness + 8 }}
      aria-hidden="true"
    >
      {/* Left arm: the bar grows leftward from the rule. */}
      <span
        className="flex justify-end"
        style={{ width: arm, height: thickness }}
      >
        {value !== null && value < 0 ? (
          <span
            className="bg-loss"
            style={{
              width: Math.max(2, width),
              height: thickness,
            }}
          />
        ) : null}
      </span>
      {/* The zero line is the hairline: solid, neutral, never dashed and never a hue. */}
      <span className="sx-zero shrink-0" style={{ width: 1, height: thickness + 8 }} />
      <span
        className="flex items-center"
        style={{ width: arm, height: thickness }}
      >
        {value !== null && value > 0 ? (
          <span
            className="bg-win"
            style={{
              width: Math.max(2, width),
              height: thickness,
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
 * `hidden min-[23.4375rem]:block` (rem, so it moves with the browser text size). Nothing
 * announced is lost when it goes: the bar is `aria-hidden` and the signed numeral beside it is
 * the accessible value (DESIGN §7.8).
 *
 * `numberClassName` sets the numeral's size: 14px `text-meta` by default (the desktop table), 13px
 * `text-cell` in the pixel-budgeted phone and mini tables.
 */
export function GoalDiffCell({
  value,
  domain,
  track = 64,
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
