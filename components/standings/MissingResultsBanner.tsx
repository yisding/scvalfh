/**
 * The one line above a division's table (SPEC §10.3): `1 official league result missing — listed
 * below the table.`, a link to the rows in the division's notes (`#missing-<division>`). A league
 * with no schedule document (EAL) reads `1 league result missing — …`: nothing there is official.
 *
 * Rendered only when the division has at least one row of kind `'missing'`; a postponed fixture
 * is never counted as missing. The view's text starts with a flag character; it is dropped here:
 * the words say it (DESIGN §33: no decorative marks).
 */
export interface MissingResultsBannerProps {
  /** `missingBannerText(n, { official })` from standings-view, or null for nothing. */
  text: string | null;
  /** `missing-<division>` */
  targetId: string;
  className?: string;
}

export function MissingResultsBanner({ text, targetId, className }: MissingResultsBannerProps) {
  if (!text) return null;
  const words = text.replace(/^⚑\s*/, '');
  return (
    <p className={['sx-note', className].filter(Boolean).join(' ')}>
      <a href={`#${targetId}`} className="sx-link">
        {words}
      </a>
    </p>
  );
}

export default MissingResultsBanner;
