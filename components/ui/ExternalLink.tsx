/**
 * Every off-site link: one drawn 10px arrow (it inherits `currentColor`), `rel="noopener noreferrer"`, and a visually-hidden
 * "opens in a new tab" (DESIGN §7.16). Deep links back to the source sit on every row, which
 * is part of the attribution posture in SPEC §6.
 */
export interface ExternalLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
  /** false drops the arrow, for a link inside a longer sentence. */
  arrow?: boolean;
}

export function ExternalLink({ href, children, className, arrow = true }: ExternalLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={['hover:underline', className].filter(Boolean).join(' ')}
    >
      {children}
      {arrow ? (
        // The one external-link glyph: a 10px drawn arrow, never the `↗` character (whose width and
        // weight came from whatever font the reader's system had).
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="ml-[0.25em] inline-block shrink-0 align-baseline"
        >
          <path d="M3 1.5h5.5V7M8.5 1.5 1.5 8.5" />
        </svg>
      ) : null}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

export default ExternalLink;
