import Link from 'next/link';

import ExternalLink from '@/components/ui/ExternalLink';
import { ordinal } from '@/lib/format/numbers';
import type {
  ComparisonView, FieldItem, FlagLine, MismatchItem, MissingRowView, NoteItem,
} from '@/views/standings/types';

import StandingsNoteItem from './table/StandingsNoteItem';

/**
 * The division's Notes block (DESIGN §9, §8; SPEC §10.3): an inset under the table that holds
 * every fact specific to THIS division, always visible.
 *
 *  1. The table's own notes: shared places, the team with no results, any `standing.mismatch`.
 *  2. Missing official results (`id="missing-<division>"`): official fixtures dated before today
 *     with no counted result, each with si.com's score when si.com has one that the site's
 *     backfill rule did not publish (and why); postponed fixtures after them, never counted. A
 *     league with no schedule document (EAL) lists the past games MaxPreps marks as league games
 *     instead, and its intro never says "official".
 *  3. The comparison with MaxPreps' own published table: agreement is printed only when the
 *     division's trust is not informational, MaxPreps leaves no one out and no row differs —
 *     otherwise the known cause and each team MaxPreps leaves out, then the differing figures.
 *     ⚑ marks a difference only in a `full` division; elsewhere it is an annotation.
 *     The differences are PLAIN SENTENCES, with our figure and theirs. The cross-check log's raw
 *     field names ("place (we order on points, Art. VI §2; MaxPreps orders on win pct)") are for
 *     /about#cross-check; here they are rewritten at render time, without touching lib or the
 *     snapshot (the items, with what each may claim, come from views/standings/footnotes.ts
 *     `mismatchItems`):
 *      - a RECIPROCAL place swap (we have A 1st and B 2nd, MaxPreps the other way round) is ONE
 *        item naming both teams, because it is one fact: MaxPreps ranks by win percentage, the
 *        league ranks by points (`rankRule`, from the league's citations);
 *      - a lone place difference reads "3rd here, 4th on MaxPreps", and only claims the
 *        win-percentage reason when the win percentages involved actually explain it;
 *      - a place we hold LEVEL says so, in the US sports-page words the table's `T` stands for:
 *        "tied for 7th here; MaxPreps puts it 8th". It does not say what settles the tie: the
 *        tied group's own note (`tiebreak.note`, item 1, earlier in this same list) already cites
 *        the league's last step — SCVAL's coin flip, MCAL's play-in — so it is said once.
 *  4. Division-specific footnotes (league games played with no score; no league results yet).
 *  5. `Scheduled per <SHORT>` and one row of links: the cross-check log, MaxPreps' table, the
 *     official schedule (labelled by its source: PDF or Google Doc). They are standalone actions
 *     (`sx-action`, a 24px floor), with no `·` text nodes between them. A league that publishes no
 *     schedule (EAL) gets its own source line and no official-schedule link.
 *
 * It shares an `lg` row with the postseason card, so it takes the card's padding, radius and
 * `text-lead` h3 and the two read as one row; the inset surface stays, because this is commentary.
 * The row stretches both panels to the taller one and this block is a flex column whose link row
 * is pushed down (`mt-auto`), so both link rows end on the same line. It sits OUTSIDE the two table
 * variants so it renders once, not once per breakpoint.
 */
export interface StandingsNotesProps {
  /** The division heading, or the league's short name for a single-division league. */
  divisionLabel: string;
  /** `collectStandingsNotes(...)` (views/standings/table-notes.ts) without the footnotes. */
  tableNotes?: readonly NoteItem[];
  /**
   * The comparison list (`DivisionView.noteItems`, views/standings/footnotes.ts `mismatchItems`): one
   * item per team or reciprocal place swap, with whether the place is shared and whether MaxPreps'
   * win-percentage order explains it already decided.
   */
  items: readonly MismatchItem[];
  comparison: ComparisonView;
  missingId: string;
  missingIntro: string;
  missing: MissingRowView[];
  postponed: MissingRowView[];
  /** Division-specific footnotes, printed last. */
  footnotes?: string[];
  /** The MaxPreps league table for this division; absent when MaxPreps publishes none (the San Diego Section's Valley). */
  sourceUrl?: string;
  /**
   * Why there is no MaxPreps table to link (`crossCheckSkipReason`: 'MaxPreps publishes no table for this
   * division'), printed as a note in place of the link, so a missing link is said, not silent.
   */
  sourceSkipped?: string | null;
  /** The league's schedule document; null when it publishes none (EAL): no link is drawn. */
  officialSchedule: { href: string; label: string } | null;
  /** `Scheduled per <SHORT>`, or `League games as MaxPreps marks them (<SHORT> publishes no schedule)`. */
  scheduledPer: string;
  /** `<SHORT> ranks by points (<citation>), and so do we.` or the EAL's title-only wording (standings-view `rankRule`). */
  rankRule: string;
  className?: string;
}

/** The log's terse field names, in words. Anything unknown is printed as it comes. */
const FIELD_WORDS: Record<string, string> = {
  'league record': 'league record',
  'overall record': 'overall record',
  'league goals for': 'league goals scored',
  'league goals against': 'league goals conceded',
  'win pct': 'league win percentage',
};

/** "league record 1-3-2 here, 1-4-2 on MaxPreps; …" */
function FieldPhrases({ items }: { items: FieldItem[] }) {
  return (
    <>
      {items.map((item, i) => (
        <span key={i}>
          {i > 0 ? '; ' : null}
          {FIELD_WORDS[item.field] ?? item.field} <span className="sx-num text-ink">{item.ours}</span>{' '}
          here, <span className="sx-num text-ink">{item.theirs}</span> on MaxPreps
        </span>
      ))}
    </>
  );
}

function Flag() {
  return (
    <>
      <span aria-hidden="true">&#9873;</span>
      <span className="sr-only">Flagged:</span>{' '}
    </>
  );
}

const Name = ({ children }: { children: React.ReactNode }) => (
  <b className="font-semibold text-ink">{children}</b>
);

/** A lone team: its place sentence (if any), then any other fields. */
function TeamSentence({
  line,
  shared,
  byWinPct,
  rankRule,
}: {
  line: FlagLine;
  shared: boolean;
  byWinPct: boolean;
  rankRule: string;
}) {
  const p = line.place;
  return (
    <>
      <Name>{line.name}</Name>:{' '}
      {p ? (
        shared ? (
          <>
            tied for {ordinal(p.ours)} here
            {p.theirs === null ? '; MaxPreps gives no place' : `; MaxPreps puts it ${ordinal(p.theirs)}`}
            .
          </>
        ) : (
          <>
            {ordinal(p.ours)} here,{' '}
            {p.theirs === null ? 'no place on MaxPreps' : `${ordinal(p.theirs)} on MaxPreps`}.
          </>
        )
      ) : null}
      {p && byWinPct ? <> MaxPreps ranks by win percentage. {rankRule}</> : null}
      {line.items.length > 0 ? (
        <>
          {p ? ' Also ' : null}
          <FieldPhrases items={line.items} />. We publish our own computation.
        </>
      ) : null}
    </>
  );
}

/** "Saint Francis (1st) and St. Ignatius (2nd): MaxPreps lists them the other way round because …" */
function SwapSentence({
  a,
  b,
  byWinPct,
  rankRule,
}: {
  a: FlagLine;
  b: FlagLine;
  byWinPct: boolean;
  rankRule: string;
}) {
  return (
    <>
      <Name>{a.name}</Name> ({ordinal(a.place!.ours)}) and <Name>{b.name}</Name> (
      {ordinal(b.place!.ours)}): MaxPreps lists them the other way round
      {byWinPct ? ' because it ranks by win percentage' : null}. {rankRule}
      {[a, b]
        .filter((line) => line.items.length > 0)
        .map((line) => (
          <span key={line.slug}>
            {' '}
            {line.name}: <FieldPhrases items={line.items} />.
          </span>
        ))}
    </>
  );
}

/** The item's per-team MaxPreps links: only those that are NOT the division table linked below. */
function TeamLinks({ urls }: { urls: readonly string[] }) {
  return (
    <>
      {urls.map((url) => (
        <span key={url}>
          {' '}
          <ExternalLink href={url}>MaxPreps table</ExternalLink>
        </span>
      ))}
    </>
  );
}

export function StandingsNotes({
  divisionLabel,
  tableNotes = [],
  items,
  comparison,
  missingId,
  missingIntro,
  missing,
  postponed,
  footnotes = [],
  sourceUrl,
  sourceSkipped = null,
  officialSchedule,
  scheduledPer,
  rankRule,
  className,
}: StandingsNotesProps) {
  return (
    <div
      className={['sx-inset flex flex-col rounded-card-lg p-5 md:p-6', className].filter(Boolean).join(' ')}
    >
      <h3 className="m-0 text-lead text-ink">
        Notes<span className="sr-only">: {divisionLabel}</span>
      </h3>
      <ul className="mt-3 mb-0 max-w-prose list-none space-y-2 p-0">
        {tableNotes.map((note, i) => (
          <li key={`table-${i}`}>
            <StandingsNoteItem item={note} />
          </li>
        ))}
        {missing.length + postponed.length > 0 ? (
          <li id={missingId}>
            {missing.length > 0 ? missingIntro : null}
            <ul className="mt-1 mb-0 list-none space-y-1 p-0">
              {[...missing, ...postponed].map((row) => (
                <li key={row.key}>
                  <time dateTime={row.dateKey} className="sx-num text-ink">
                    {row.dateLabel}
                  </time>{' '}
                  {row.matchup}
                  {row.sbliveNote ? <span className="block text-meta text-ink-3">{row.sbliveNote}</span> : null}
                </li>
              ))}
            </ul>
          </li>
        ) : null}
        {/* Agreement comes ONLY from the view's comparison (SPEC §10.3): an empty mismatch list
            is not agreement where MaxPreps leaves a team out or is informational only. */}
        {comparison.agreement ? <li>{comparison.agreement}</li> : null}
        {comparison.knownCause ? <li>{comparison.knownCause}</li> : null}
        {comparison.leftOut.map((line) => (
          <li key={line}>{line}</li>
        ))}
        {comparison.agreement
          ? null
          : items.map((item) => (
              <li key={item.key}>
                {/* ⚑ only in a `full` division; elsewhere a difference is an annotation. */}
                {comparison.flag ? <Flag /> : null}
                {item.kind === 'swap' ? (
                  <>
                    <SwapSentence a={item.a} b={item.b} byWinPct={item.byWinPct} rankRule={rankRule} />
                    <TeamLinks urls={item.links} />
                  </>
                ) : (
                  <>
                    <TeamSentence line={item.line} shared={item.shared} byWinPct={item.byWinPct} rankRule={rankRule} />
                    <TeamLinks urls={item.links} />
                  </>
                )}
              </li>
            ))}
        {footnotes.map((note) => (
          <li key={note}>{note}</li>
        ))}
        {sourceSkipped ? <li>{sourceSkipped}, so there is nothing to compare these records with.</li> : null}
      </ul>
      {/* `mt-auto pt-3`: the 12px gap the inset's own `* + *` rule gave, and from lg (where the
          row stretches this block to the postseason card's height) the push to the bottom edge,
          the source line and the link row together. */}
      <div className="mt-auto pt-3">
        <p className="mt-0 mb-1 text-meta text-ink-3">{scheduledPer}.</p>
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
          {/* The division name is in the accessible name only: the block already sits under its
              heading, but a links list read out of context would show two identical names. */}
          {officialSchedule ? (
            <ExternalLink href={officialSchedule.href} className="sx-action gap-1 font-medium">
              <span>
                {officialSchedule.label}
                <span className="sr-only"> for {divisionLabel}</span>
              </span>
            </ExternalLink>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default StandingsNotes;
