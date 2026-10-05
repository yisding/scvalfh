import { EM_DASH } from '../../lib/format';

/**
 * A value that is not there: a dash for the eye and words for a screen reader (DESIGN §5.3, §8).
 * The glyph is aria-hidden and the words are visually hidden, so a screen reader says "not
 * recorded", never "em dash". An `aria-label` on a plain span is not the same thing: ARIA does
 * not allow a name on a generic element, and screen readers commonly read the dash instead.
 *
 * It renders a bare fragment, so a caller keeps its own wrapper (`sx-num`, `text-ink-3`) and the
 * markup inside stays `<span aria-hidden="true">—</span><span class="sr-only">…</span>`. The
 * words are the caller's, and they differ on purpose: "not recorded" for a stat, "not published"
 * for a record the source left out, "not ranked" for a place, "no goal differential" for GD.
 */
export interface MissingValueProps {
  /** What a screen reader says in the dash's place, e.g. "not recorded". */
  words: string;
  /** Default an em dash; the goal-difference cells use `· —`, a dot on the zero rule. */
  glyph?: string;
}

export function MissingValue({ words, glyph }: MissingValueProps) {
  return (
    <>
      <span aria-hidden="true">{glyph ?? EM_DASH}</span>
      <span className="sr-only">{words}</span>
    </>
  );
}

export default MissingValue;
