/**
 * Every off-site link: an `↗`, `rel="noopener noreferrer"`, and a visually-hidden
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
      className={['text-accent hover:underline', className].filter(Boolean).join(' ')}
    >
      {children}
      {arrow ? (
        <>
          {' '}
          <span aria-hidden="true">&#8599;</span>
        </>
      ) : null}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

export default ExternalLink;
