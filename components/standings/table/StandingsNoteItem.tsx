import ExternalLink from '@/components/ui/ExternalLink';
import type { NoteItem } from '@/views/standings/types';

/**
 * One table-specific note (views/standings/table-notes.ts `collectStandingsNotes`), as the Notes
 * inset under a standings table prints it (StandingsNotes). The caller supplies the `<li>`.
 *
 * A shared place leads with the first team's name in bold; the tiebreak note already cites the
 * league's rule, so it renders verbatim. A mismatch flag pairs the aria-hidden ⚑ with an sr-only
 * "Flagged:", because the glyph alone means nothing read aloud.
 */
export function StandingsNoteItem({ item }: { item: NoteItem }) {
  switch (item.kind) {
    case 'shared':
      return (
        <>
          <b className="font-semibold text-ink">{item.team}</b>: {item.note}
        </>
      );
    case 'mismatch':
      return (
        <>
          <span aria-hidden="true">&#9873;</span>
          <span className="sr-only">Flagged:</span> {item.team}:{' '}
          {item.detail} We show our own
          computation.{' '}
          {item.maxprepsUrl ? <ExternalLink href={item.maxprepsUrl}>MaxPreps</ExternalLink> : null}
        </>
      );
    case 'no-results':
    case 'footnote':
      return <>{item.text}</>;
  }
}

export default StandingsNoteItem;
