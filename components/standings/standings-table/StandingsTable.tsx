import Link from 'next/link';

import ExternalLink from '../../ui/ExternalLink';

import { ArchiveStandingsTable } from './ArchiveStandingsTable';
import { DesktopStandingsTable } from './DesktopStandingsTable';
import { MiniStandingsTable } from './MiniStandingsTable';
import { collectStandingsNotes } from './notes';
import { PhoneStandingsTable } from './PhoneStandingsTable';
import type { StandingsTableProps } from './types';

/**
 * The league table (DESIGN §3.2, §7.3), amended by BYLAWS-ADDENDUM.
 *
 * A PTS column SHIPS and it is the ordering key: By-Laws Article VI §2 awards 3 points for a win
 * and 1 for a tie, and "the division placement/standings will be the order of team points".
 * DESIGN §1.2's "no PTS column" and §11.8's win-percentage sort predate the by-laws PDF and are
 * superseded by it.
 *
 * SHARED PLACES ARE REAL. Every league's chain ends in a step we cannot compute (a coin flip, a
 * blind draw, a play-in), so two or more teams can carry the same `computed.place` with
 * `tiebreak.shared === true`. Those rows render LEVEL — the same number with the US sports-page
 * `T` prefix ("T7", never the British "7=") — and `tiebreak.note` (which already cites the rule)
 * goes into the footnotes. Two teams level on 7th leave no 8th.
 *
 * A row with `hasReportedResults === false` sorts last, renders its rank as an em dash
 * and, in the phone and desktop tables, ONE "No results yet" cell across the data columns (the
 * mini table, which only ever shows the top four, keeps em dashes and a `·` on the zero rule) —
 * never `0-0-0`, never `.000`, never a rank by merit — and it is still a link.
 *
 * No client-side sorting: the table has one correct order and re-sorting it is a coach's
 * affordance that costs a client component and a whole `aria-sort` surface.
 *
 * Every variant renders its OWN card (`.sx-card.sx-flush`, plus `.sx-bleed` for the phone and mini
 * tables, which run edge to edge below 768px), so callers never wrap it. `sx-flush` clips with
 * `overflow: clip`, never `hidden`, so the sticky `<thead>` still sticks under the chrome.
 *
 * The notes are separable: `notes="none"` renders the table alone, and `collectStandingsNotes()`
 * hands the caller the generic legend (GD, PTS) and the table-specific notes (shared places, the
 * no-results team, mismatch flags, `footnotes`) so a page can place each where it belongs.
 *
 * Multi-league (SPEC §10.3, §13.3 — additive only): `context` (`getStandingContext(division)`) and
 * `columns` add a GP column (every variant but archive; the phone row prints `<counted>/<scheduled>
 * GP` on its second line) and, on the desktop table, LEFT and MAX after PTS. LEFT is league games
 * with no counted result yet; MAX the most points a team could still reach — a ceiling, never a
 * projection. With the two new columns the desktop table drops its Home / Away / Neutral splits,
 * which the team page carries, so the team column keeps its width. A `†` follows W-L-T for a team
 * with a counted si.com score (`context.backfilled > 0`); the caller prints the footnote. Without
 * `context` and `columns` the table renders exactly today's columns.
 */
export function StandingsTable(props: StandingsTableProps) {
  const { variant, caption, className, id } = props;
  const rows = variant === 'mini' ? props.rows.slice(0, props.limit ?? 4) : props.rows;
  const showNotes = variant !== 'mini' && (props.notes ?? 'inline') === 'inline';
  const notes = showNotes ? collectStandingsNotes({ ...props, rows }) : null;

  const bleed = variant === 'phone' || variant === 'mini';

  return (
    <div className={className} id={id}>
      {/* `sx-flush` is `overflow: clip`, NOT `hidden`: `hidden` makes the card a scroll container,
          and a sticky `<thead>` then resolves its `top` against the card instead of the viewport
          — the head floated between rows 1 and 2 at rest and scrolled away entirely. */}
      <div
        className={['sx-card sx-flush', bleed ? 'sx-bleed' : null, variant === 'mini' ? '@container' : null]
          .filter(Boolean)
          .join(' ')}
      >
        <table
          className={
            variant === 'desktop'
              ? 'sx-table sx-table-wide text-cell xl:text-meta'
              : variant === 'archive'
                ? 'sx-table text-meta'
                : 'sx-table text-cell'
          }
        >
          {/* sr-only in every variant: "unofficial" and the through-date are in the section meta. */}
          <caption className="sr-only">{caption}</caption>

          {/* Each variant's head and body (PhoneStandingsTable, DesktopStandingsTable,
              MiniStandingsTable, ArchiveStandingsTable). */}
          {variant === 'phone' ? <PhoneStandingsTable {...props} /> : null}
          {variant === 'desktop' ? <DesktopStandingsTable {...props} /> : null}
          {variant === 'mini' ? <MiniStandingsTable {...props} /> : null}
          {variant === 'archive' ? <ArchiveStandingsTable {...props} /> : null}
        </table>
      </div>

      {notes && notes.legend.length + notes.specific.length > 0 ? (
        // `flex-col gap-2`, not `space-y-2`: the list carries `m-0`, which outranks v4's
        // zero-specificity space-y rule and would leave no gap above the link row.
        <div className="mt-3 flex max-w-prose flex-col gap-2 text-meta text-ink-3">
          <ul className="m-0 list-none space-y-1.5 p-0">
            {[...notes.specific, ...notes.legend].map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
          {/* Standalone actions, not prose: each carries its own 24px box (WCAG 2.5.8). */}
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <Link
              href="/about#standings"
              prefetch={false}
              className="sx-action text-accent hover:underline"
            >
              How standings are computed
            </Link>
            {props.sourceUrl ? (
              <ExternalLink href={props.sourceUrl} className="sx-action gap-1">
                MaxPreps table
              </ExternalLink>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default StandingsTable;
