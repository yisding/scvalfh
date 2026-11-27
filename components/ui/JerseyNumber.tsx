/**
 * A jersey number beside a player's name, as the rosters and stat tables print it, that reads and copies as words.
 *
 * The number sits in its own box (a flex item, or a span with a margin), so no space separates it from the name in
 * the text: a screen reader heard "Number5" and a copy on a phone gave "5Lauren McLinden". Two things fix that, and
 * neither moves anything on the screen:
 *   - the screen-reader label ends in a no-break space ("Number 5"), which is never collapsed the way an ordinary
 *     trailing space inside the hidden label is;
 *   - a real space follows the number in a zero-width box (`CopySpace`), kept by `white-space: pre`, so a selection
 *     copies "5 Lauren McLinden".
 *
 * Renders a fragment: the caller keeps its own wrapper (`sx-num`, the column width, the margin).
 */

import type { ReactNode } from 'react';

import { MissingValue } from './MissingValue';

/** A space a copy keeps and the eye never sees: zero wide, so the number's right edge stays where it was. */
export function CopySpace() {
  return (
    <span aria-hidden="true" className="inline-block w-0 whitespace-pre">
      {' '}
    </span>
  );
}

export interface JerseyNumberProps {
  /** The number as the source prints it ("5", "21/88"); null when it lists none. */
  number: string | null;
  /** Marks printed right after the number (the † of a number from another source). */
  after?: ReactNode;
  /** What a screen reader says when there is no number; default "No number listed". */
  missingWords?: string;
}

export function JerseyNumber({ number, after, missingWords = 'No number listed' }: JerseyNumberProps) {
  return (
    <>
      {number ? (
        <>
          <span className="sr-only">Number{' '}</span>
          {number}
          {after}
        </>
      ) : (
        <MissingValue words={missingWords} />
      )}
      <CopySpace />
    </>
  );
}

export default JerseyNumber;
