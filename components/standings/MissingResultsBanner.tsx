/**
 * The one-line banner above a division's table (SPEC §10.3): `⚑ 1 official league result missing —
 * listed below the table.` linking the rows in the division's notes (`#missing-<division>`).
 *
 * Rendered only when the division has at least one row of kind `'missing'`; a postponed fixture
 * is never counted as missing. The ⚑ is decorative next to the words, so it is aria-hidden: the
 * text alone says it.
 */
export interface MissingResultsBannerProps {
  /** `missingBannerText(n)` from standings-view, or null for nothing. */
  text: string | null;
  /** `missing-<division>` */
  targetId: string;
  className?: string;
}

export function MissingResultsBanner({ text, targetId, className }: MissingResultsBannerProps) {
  if (!text) return null;
  const words = text.replace(/^⚑\s*/, '');
  return (
    <p className={`m-0 text-meta text-ink-2${className ? ` ${className}` : ''}`}>
      <a href={`#${targetId}`} className="sx-action font-medium text-ink no-underline hover:underline">
        <span aria-hidden="true">&#9873;</span> {words}
      </a>
    </p>
  );
}

export default MissingResultsBanner;
