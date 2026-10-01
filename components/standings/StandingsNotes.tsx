import Link from 'next/link';

import ExternalLink from '../ui/ExternalLink';

import type { MismatchNote, UnreportedFixtures } from './standings-view';

/**
 * The credibility block under each table (DESIGN §9, §8).
 *
 * Three things live here, and they all exist so the reader never has to trust us blind:
 *
 *  1. Every disagreement with MaxPreps' own published table, with our number, theirs, a link to
 *     the full cross-check log and a deep link to their page. We show OUR computation and say so.
 *     AGREEMENT is published too — silence would be indistinguishable from not checking.
 *  2. Official SCVAL fixtures that MaxPreps has never published a contest for. Those games are
 *     scheduled and may well have been played; we do not invent a result for them, and we do not
 *     let the absence read as a team that did not play.
 *  3. Both links land on real primary sources: the cross-check page and the official PDF grid.
 *
 * It sits OUTSIDE the two table variants so it renders once, not once per breakpoint.
 */
export interface StandingsNotesProps {
  divisionLabel: string;
  mismatches: MismatchNote[];
  unreported: UnreportedFixtures;
  /** The official SCVAL schedule-grid PDF for this division. */
  scheduleUrl: string;
  className?: string;
}

export function StandingsNotes({
  divisionLabel,
  mismatches,
  unreported,
  scheduleUrl,
  className,
}: StandingsNotesProps) {
  return (
    // 62ch (DESIGN §4.3): these are sentences under a full-bleed table, not table content.
    <ul className={`m-0 max-w-[62ch] list-none space-y-1.5 p-0 text-meta text-ink-2${className ? ` ${className}` : ''}`}>
      {mismatches.length === 0 ? (
        <li>
          Our computed records match MaxPreps&rsquo; published {divisionLabel} table for every team.{' '}
          <Link href="/about#cross-check" className="text-accent hover:underline">
            Cross-check log <span aria-hidden="true">&rarr;</span>
          </Link>
        </li>
      ) : (
        mismatches.map((note) => (
          <li key={`${note.slug}-${note.field}`}>
            <span aria-hidden="true">&#9873;</span>
            <span className="sr-only">Flagged:</span>{' '}
            <b className="font-semibold text-ink">{note.name}</b>: we show{' '}
            <span className="sx-num text-ink">{note.ours}</span>, MaxPreps shows{' '}
            <span className="sx-num text-ink">{note.theirs}</span> &mdash; {note.field}. We publish
            our own computation.{' '}
            {/* One note per flagged team, so `prefetch={false}` like every other per-row link
                (components/layout/NavLink.tsx has the reasoning). */}
            <Link href="/about#cross-check" prefetch={false} className="text-accent hover:underline">
              Cross-check log <span aria-hidden="true">&rarr;</span>
            </Link>{' '}
            <span aria-hidden="true">&middot;</span>{' '}
            <ExternalLink href={note.url}>MaxPreps table</ExternalLink>
          </li>
        ))
      )}
      {unreported.total > 0 ? (
        <li>
          Scheduled per SCVAL, no result reported by MaxPreps: {unreported.total}{' '}
          {divisionLabel} {unreported.total === 1 ? 'fixture' : 'fixtures'}
          {unreported.noDataTotal > 0 ? (
            <>
              {' '}
              &mdash; {unreported.noDataTotal} of them {unreported.noDataTeams.join(' and ')}
              &rsquo;s
            </>
          ) : null}
          {unreported.otherMatchups.length > 0 ? (
            <>
              {unreported.noDataTotal > 0 ? ', plus ' : ' — '}
              {unreported.otherMatchups.join(' and ')}
            </>
          ) : null}
          . They are in the official grid and count for nothing here.{' '}
          <ExternalLink href={scheduleUrl}>Official {divisionLabel} schedule (PDF)</ExternalLink>
        </li>
      ) : null}
    </ul>
  );
}

export default StandingsNotes;
