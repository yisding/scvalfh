/**
 * The four drawn icons on the site (DESIGN §33), plus nothing else: everything else is a word. Each
 * is an `aria-hidden` inline SVG that inherits `currentColor`; the control that holds it carries the
 * name. (The external-link arrow is ExternalLink's own.)
 */
export interface GlyphProps {
  /** The drawn size in px. */
  size?: number;
  className?: string;
}

/** The magnifier: the header's team search and the phone "Find a team" link. */
export function SearchGlyph({ size = 18, className }: GlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      aria-hidden="true"
      className={className}
    >
      <circle cx="7.5" cy="7.5" r="5.25" />
      <path d="m11.5 11.5 4.75 4.75" />
    </svg>
  );
}

const CHEVRON = {
  width: 9,
  height: 16,
  viewBox: '0 0 9 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

/** The date bar's "previous" arrow. */
export function ChevronLeft({ className }: Pick<GlyphProps, 'className'>) {
  return (
    <svg {...CHEVRON} className={className}>
      <path d="M7.5 1.5 1.5 8l6 6.5" />
    </svg>
  );
}

/** The date bar's "next" arrow. */
export function ChevronRight({ className }: Pick<GlyphProps, 'className'>) {
  return (
    <svg {...CHEVRON} className={className}>
      <path d="M1.5 1.5 7.5 8l-6 6.5" />
    </svg>
  );
}

/** The calendar: the phone face of the date bar's Calendar button. */
export function CalendarGlyph({ size = 18, className }: GlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <rect x="2" y="3.5" width="14" height="12.5" rx="1.5" />
      <path d="M2 7.5h14M6 1.5v3.5M12 1.5v3.5" />
    </svg>
  );
}
