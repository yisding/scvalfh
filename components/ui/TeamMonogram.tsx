import type { Team } from '../../lib/types';

/**
 * A school's color square (DESIGN §7.1, §12.4).
 *
 * School colors are decoration with a guardrail, never a data encoding: sixteen uncontrolled
 * brand hues blow past every categorical ceiling, so they appear ONLY here. The letters use
 * `colors.onPrimary`, which the cron computed by measured WCAG contrast on `colors.primary`
 * — never picked by eye. No third-party image request is ever made: the source's mascot URL is
 * read and discarded (see /about#sources).
 */
export interface TeamMonogramProps {
  team: Pick<Team, 'abbr' | 'name' | 'colors'>;
  /** 24 = table row, 40 = teams tile, 56 = team page. */
  size?: 20 | 24 | 40 | 56;
  /** Default true → aria-hidden, because the school name is adjacent. */
  decorative?: boolean;
  className?: string;
}

const LETTER_SIZE: Record<number, number> = { 20: 10, 24: 11, 40: 15, 56: 20 };

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
        borderRadius: size <= 20 ? 'var(--sx-r-tag)' : 'var(--sx-r-chip)',
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
