import type { Team } from '../../lib/types';

/**
 * A school's color square (DESIGN §7.1, §12.4).
 *
 * School colors are decoration with a guardrail, never a data encoding: one uncontrolled brand
 * hue per registry school blows past every categorical ceiling, so they appear ONLY here. The
 * letters use `colors.onPrimary`, which the cron computed by measured WCAG contrast on
 * `colors.primary` — never picked by eye. No third-party image request is ever made: the source's mascot URL is
 * read and discarded (see /about#sources).
 */
export interface TeamMonogramProps {
  team: Pick<Team, 'abbr' | 'name' | 'colors'>;
  /** 20/24 = rows, 28/32 = compact cards, 40/48 = tiles, 56/64 = heroes. */
  size?: 20 | 24 | 28 | 32 | 40 | 48 | 56 | 64;
  /** Default true → aria-hidden, because the school name is adjacent. */
  decorative?: boolean;
  className?: string;
}

/**
 * Initials are decorative and aria-hidden beside the name, so they are exempt from the 12px floor.
 * Exported with the radius below so GhostMonogram (a school we do not track) is the same tile at
 * every size without restating either number.
 */
export const LETTER_SIZE: Record<NonNullable<TeamMonogramProps['size']>, number> = {
  20: 10,
  24: 11,
  28: 12,
  32: 12,
  40: 15,
  48: 17,
  56: 20,
  64: 22,
};

/** The tile's corner: a quarter of its side, so a 24px row tile is 6px and a 56px hero is 14px. */
export function monogramRadius(size: number): number {
  return Math.round(size / 4);
}

export function TeamMonogram({
  team,
  size = 24,
  decorative = true,
  className,
}: TeamMonogramProps) {
  const { primary, secondary, onPrimary } = team.colors;
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center border border-hairline font-sans font-semibold leading-none${
        className ? ` ${className}` : ''
      }`}
      style={{
        width: size,
        height: size,
        borderRadius: monogramRadius(size),
        background: `#${primary}`,
        color: onPrimary,
        fontSize: LETTER_SIZE[size],
        // The second school color gets a place to live without touching legibility.
        boxShadow: size >= 40 ? `inset 0 0 0 2px #${secondary}` : undefined,
      }}
      aria-hidden={decorative ? 'true' : undefined}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : team.name}
    >
      {team.abbr}
    </span>
  );
}

export default TeamMonogram;
