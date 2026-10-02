import { LETTER_SIZE, monogramRadius, type TeamMonogramProps } from './TeamMonogram';

/**
 * The tile for a school this site does not track (DESIGN §8): the same square as TeamMonogram —
 * same sizes, same quarter-radius corner, same letter sizes, all imported from it — but on the
 * inset surface with a hairline and muted letters, because nothing may pretend to be a school's
 * colours that the registry never recorded.
 *
 * Server-only by intent: no consumer of it is a client component, and TeamMonogram (which IS in
 * the pinned-team card's client bundle) does not import it back, so it costs the client nothing.
 *
 * Decorative and aria-hidden: the school's name always sits beside it.
 */
export interface GhostMonogramProps {
  /** The source name, as the snapshot spells it. */
  name: string;
  size?: NonNullable<TeamMonogramProps['size']>;
  className?: string;
}

/** Words that never start a school's name in the sense a reader means it. */
const FILLER = /^(high|school|hs|the|of)$/i;

/**
 * Two letters, MIXED case, from the first significant word: "Tamalpais" → "Ta", "Westmont" →
 * "We", "Sierra Canyon" → "Si", "Scripps Ranch" → "Sc".
 *
 * Not two capitals. A two-capital ghost beside a result chip read as a second chip — a row
 * "W [W] Westmont" or "L [T] Tamalpais" — and initials from two words ("SC") look like one of
 * the registry's own abbreviations, which are ours and never derived by munging. A capital and a
 * lowercase letter reads as the start of the name printed next to it, which is all it is.
 */
export function ghostInitials(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .split(/[\s-]+/)
    .filter((w) => w && !FILLER.test(w));
  const first = words[0] ?? name.trim();
  if (!first) return '';
  // By code point, not UTF-16 unit: a name starting with an astral letter would otherwise split
  // its surrogate pair into two broken glyphs.
  const [a = '', b = ''] = Array.from(first);
  return `${a.toUpperCase()}${b.toLowerCase()}`;
}

export function GhostMonogram({ name, size = 24, className }: GhostMonogramProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center border border-hairline bg-surface-2 font-sans font-semibold leading-none text-ink-3${
        className ? ` ${className}` : ''
      }`}
      style={{
        width: size,
        height: size,
        borderRadius: monogramRadius(size),
        fontSize: LETTER_SIZE[size],
      }}
      aria-hidden="true"
    >
      {ghostInitials(name)}
    </span>
  );
}

export default GhostMonogram;
