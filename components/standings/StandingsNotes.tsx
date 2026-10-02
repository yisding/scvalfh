import Link from 'next/link';

import ExternalLink from '../ui/ExternalLink';

import type { ComparisonView, MismatchNote, MissingRowView } from './standings-view';

/**
 * The division's Notes block (DESIGN §9, §8; SPEC §10.3): an inset under the table that holds
 * every fact specific to THIS division, always visible.
 *
 *  1. The table's own notes: shared places, the team with no results, any `standing.mismatch`.
 *  2. Missing official results (`id="missing-<division>"`): official fixtures dated before today
 *     with no counted result, each with si.com's score when si.com has one that the site's
 *     backfill rule did not publish (and why); postponed fixtures after them, never counted.
 *  3. The comparison with MaxPreps' own published table: agreement is printed only when the
 *     division's trust is not informational, MaxPreps leaves no one out and no row differs —
 *     otherwise the known cause and each team MaxPreps leaves out, then the differing figures.
 *     ⚑ marks a difference only in a `full` division; elsewhere it is an annotation.
 *  4. Division-specific footnotes (league games played with no score; no league results yet).
 *  5. One row of links: the cross-check log, MaxPreps' table, the official schedule (labelled by
 *     its source: PDF or Google Doc) — `Scheduled per <SHORT>`.
 *
 * It shares an `lg` row with the postseason card, so it takes the card's padding, radius and
 * `text-lead` h3. It sits OUTSIDE the two table variants so it renders once, not once per
 * breakpoint.
 */
export interface StandingsNotesProps {
  /** The division heading, or the league's short name for a single-division league. */
  divisionLabel: string;
  /** `collectStandingsNotes(...).specific` without the footnotes. */
  tableNotes?: React.ReactNode[];
  mismatches: MismatchNote[];
  comparison: ComparisonView;
  missingId: string;
  missingIntro: string;
  missing: MissingRowView[];
  postponed: MissingRowView[];
  /** Division-specific footnotes, printed last. */
  footnotes?: string[];
  /** The MaxPreps league table for this division. */
  sourceUrl?: string;
  officialSchedule: { href: string; label: string };
  /** `Scheduled per <SHORT>` */
  scheduledPer: string;
  className?: string;
}

interface FlagLine {
  slug: string;
  name: string;
  items: Array<Pick<MismatchNote, 'field' | 'ours' | 'theirs'>>;
  urls: string[];
}

/** One line per team, keeping every field's figures and detail. */
function byTeam(mismatches: MismatchNote[]): FlagLine[] {
  const lines = new Map<string, FlagLine>();
  for (const note of mismatches) {
    const line = lines.get(note.slug) ?? { slug: note.slug, name: note.name, items: [], urls: [] };
    line.items.push({ field: note.field, ours: note.ours, theirs: note.theirs });
    if (!line.urls.includes(note.url)) line.urls.push(note.url);
    lines.set(note.slug, line);
  }
  return [...lines.values()];
}

export function StandingsNotes({
  divisionLabel,
  tableNotes = [],
  mismatches,
  comparison,
  missingId,
  missingIntro,
  missing,
  postponed,
  footnotes = [],
  sourceUrl,
  officialSchedule,
  scheduledPer,
  className,
}: StandingsNotesProps) {
  const flags = byTeam(mismatches);
  return (
    <div className={`sx-inset rounded-card-lg p-5 md:p-6${className ? ` ${className}` : ''}`}>
      <h3 className="m-0 text-lead text-ink">
        Notes<span className="sr-only">: {divisionLabel}</span>
      </h3>
      <ul className="mt-3 mb-0 max-w-prose list-none space-y-2 p-0">
        {tableNotes.map((note, i) => (
          <li key={`table-${i}`}>{note}</li>
        ))}
        {missing.length + postponed.length > 0 ? (
          <li id={missingId}>
            {missing.length > 0 ? missingIntro : null}
            <ul className="mt-1 mb-0 list-none space-y-1 p-0">
              {[...missing, ...postponed].map((row) => (
                <li key={row.key}>
                  <time dateTime={row.dateKey} className="sx-num text-ink">
                    {row.date}
                  </time>{' '}
                  {row.matchup}
                  {row.sbliveNote ? <span className="block text-meta text-ink-3">{row.sbliveNote}</span> : null}
                </li>
              ))}
            </ul>
          </li>
        ) : null}
        {comparison.agreement ? <li>{comparison.agreement}</li> : null}
        {comparison.knownCause ? <li>{comparison.knownCause}</li> : null}
        {comparison.leftOut.map((line) => (
          <li key={line}>{line}</li>
        ))}
        {comparison.agreement
          ? null
          : flags.map((line) => (
              <li key={line.slug}>
                {comparison.flag ? (
                  <>
                    <span aria-hidden="true">&#9873;</span>
                    <span className="sr-only">Flagged:</span>{' '}
                  </>
                ) : null}
                <b className="font-semibold text-ink">{line.name}</b>:{' '}
                {line.items.map((item, i) => (
                  <span key={i}>
                    {i > 0 ? '; ' : null}we show <span className="sx-num text-ink">{item.ours}</span>,
                    MaxPreps shows <span className="sx-num text-ink">{item.theirs}</span> &mdash;{' '}
                    {item.field}
                  </span>
                ))}
                . We publish our own computation.
                {/* A per-team MaxPreps link only when it is NOT the division table linked below. */}
                {line.urls
                  .filter((url) => url !== sourceUrl)
                  .map((url) => (
                    <span key={url}>
                      {' '}
                      <ExternalLink href={url}>MaxPreps table</ExternalLink>
                    </span>
                  ))}
              </li>
            ))}
        {footnotes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
      <p className="mt-3 mb-1 text-meta text-ink-3">{scheduledPer}.</p>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <Link
          href="/about#cross-check"
          prefetch={false}
          className="sx-action font-medium text-accent hover:underline"
        >
          Cross-check log
        </Link>
        {sourceUrl ? (
          <ExternalLink href={sourceUrl} className="sx-action gap-1 font-medium">
            {/* Wrapped: `.sx-action` is inline-flex, which trims the spaces around the sr-only
                span if the words are bare flex items ("MaxPrepstable"). */}
            <span>
              MaxPreps <span className="sr-only">{divisionLabel} </span>table
            </span>
          </ExternalLink>
        ) : null}
        <ExternalLink href={officialSchedule.href} className="sx-action gap-1 font-medium">
          <span>
            {officialSchedule.label}
            <span className="sr-only"> for {divisionLabel}</span>
          </span>
        </ExternalLink>
      </div>
    </div>
  );
}

export default StandingsNotes;
