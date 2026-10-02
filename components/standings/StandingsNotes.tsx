import Link from 'next/link';

import ExternalLink from '../ui/ExternalLink';

import type { MismatchNote, UnreportedFixtures } from './standings-view';

/**
 * The division's Notes block (DESIGN §9, §8; brief §4.22): an inset under the table that holds
 * every fact specific to THIS division, always visible.
 *
 *  1. The table's own notes: shared places (Article VI §7), the team with no results, any
 *     `standing.mismatch` flag.
 *  2. Every disagreement with MaxPreps' own published table, ONE line per team (a team flagged on
 *     two fields is still one ⚑), with our figure and theirs. We show OUR computation and say so.
 *     AGREEMENT is published too — silence would be indistinguishable from not checking.
 *  3. Official SCVAL fixtures that MaxPreps has never published a contest for. We do not invent a
 *     result for them, and we do not let the absence read as a team that did not play.
 *  4. Division-specific footnotes (league games played with no score; no league results yet).
 *  5. One row of links: the cross-check log and the primary sources. They are standalone actions
 *     (`sx-action`, a 24px floor), with no `·` text nodes between them. "How standings are
 *     computed" is NOT repeated here: the page foot carries it once, as a pill.
 *
 * It shares an `lg` row with the CCS card, so it takes the card's padding, radius and `text-lead`
 * h3 and the two read as one row; the inset surface stays, because this is commentary.
 *
 * It sits OUTSIDE the two table variants so it renders once, not once per breakpoint.
 */
export interface StandingsNotesProps {
  divisionLabel: string;
  /** `collectStandingsNotes(...).specific` without the footnotes. */
  tableNotes?: React.ReactNode[];
  mismatches: MismatchNote[];
  unreported: UnreportedFixtures;
  /** Division-specific footnotes, printed last. */
  footnotes?: string[];
  /** The MaxPreps league table for this division. */
  sourceUrl?: string;
  /** The official SCVAL schedule-grid PDF for this division. */
  scheduleUrl: string;
  className?: string;
}

/** The in-site explanation every division's notes point at. */
const ABOUT_LINKS = [{ href: '/about#cross-check', label: 'Cross-check log' }] as const;

interface FlagLine {
  slug: string;
  name: string;
  items: Array<Pick<MismatchNote, 'field' | 'ours' | 'theirs'>>;
  urls: string[];
}

/** One ⚑ per team, keeping every field's figures and detail. */
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
  unreported,
  footnotes = [],
  sourceUrl,
  scheduleUrl,
  className,
}: StandingsNotesProps) {
  const flags = byTeam(mismatches);
  return (
    <div className={`sx-inset rounded-card-lg p-5 md:p-6${className ? ` ${className}` : ''}`}>
      <h3 className="m-0 text-lead text-ink">Notes</h3>
      <ul className="mt-3 mb-0 max-w-prose list-none space-y-2 p-0">
        {tableNotes.map((note, i) => (
          <li key={`table-${i}`}>{note}</li>
        ))}
        {flags.length === 0 ? (
          <li>
            Our computed records match MaxPreps&rsquo; published {divisionLabel} table for every
            team.
          </li>
        ) : (
          flags.map((line) => (
            <li key={line.slug}>
              <span aria-hidden="true">&#9873;</span>
              <span className="sr-only">Flagged:</span>{' '}
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
            . They are in the official grid and count for nothing here.
          </li>
        ) : null}
        {footnotes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {ABOUT_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            prefetch={false}
            className="sx-action font-medium text-accent hover:underline"
          >
            {link.label}
          </Link>
        ))}
        {sourceUrl ? (
          <ExternalLink href={sourceUrl} className="sx-action gap-1 font-medium">
            {/* Wrapped: `.sx-action` is inline-flex, which trims the spaces around the sr-only
                span if the words are bare flex items ("MaxPrepstable"). */}
            <span>
              MaxPreps <span className="sr-only">{divisionLabel} </span>table
            </span>
          </ExternalLink>
        ) : null}
        {/* The division name is in the accessible name only: the block already sits under its
            heading, but a links list read out of context would show two identical names. */}
        <ExternalLink href={scheduleUrl} className="sx-action gap-1 font-medium">
          <span>
            Official <span className="sr-only">{divisionLabel} </span>schedule (PDF)
          </span>
        </ExternalLink>
      </div>
    </div>
  );
}

export default StandingsNotes;
