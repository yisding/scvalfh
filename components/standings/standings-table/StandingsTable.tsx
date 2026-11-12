import Link from 'next/link';

import ExternalLink from '../../ui/ExternalLink';
import FormStrip, { toFormEntries } from '../../ui/FormStrip';
import MissingValue from '../../ui/MissingValue';
import { TeamRowLink } from '../../ui/PinNote';
import TeamMonogram from '../../ui/TeamMonogram';
import { EM_DASH, recordString, signedGd, streakString, winPct } from '../../../lib/format';
import { leagueOfDivision } from '../../../lib/leagues';
import { orderHead, orderHeadWords, orderValue, ordersByRecord } from '../../../lib/standings/order';
import { capitalized } from '../../words/capitalized';
import {
  AGAINST_ABBR, AGAINST_WORDS, DIFFERENCE_WORDS, DIFF_ABBR, FOR_ABBR, FOR_WORDS, RECORD_HEAD, RECORD_HEAD_WORDS,
} from '../../words/score-words';

import { Abbr, FlagMark, LeagueRecord, PlaceCell, dash, gpText, gpTitle, isFlagged, rowLabel, tableRows } from './cells';
import { collectStandingsNotes } from './notes';
import type { StandingsRowData, StandingsTableProps, StandingsVariant } from './types';

/**
 * The league table (DESIGN §3.2, §7.3, amended by BYLAWS-ADDENDUM; §33 for the face).
 *
 * ONE `<table className="sx-table">`: no card, no phone/desktop twin. A `face` chooses the columns:
 *
 *   full     # · Team · (GP) · W-L-T · Pts · GD, and from 768px also Pct · Overall · GF · GA · Strk · Last 5
 *            (the wide columns are `hidden md:table-cell`, so a phone gets the five that matter);
 *   mini     # · Team · W-L-T · Pts — the top `limit` rows (default 4), for a rail;
 *   archive  # · Team · League · Overall — final records only.
 *
 * The old `variant` values still work: `phone` and `desktop` are both the full table.
 *
 * A PTS column SHIPS and it is the ordering key: By-Laws Article VI §2 awards 3 points for a win
 * and 1 for a tie, and "the division placement/standings will be the order of team points". It is
 * the ONE bold column (`sx-col-key`); a league ordered on its record (basketball) prints Pct there
 * instead and not again further along. W-L-T is ink (`sx-col-ink`); everything else is ink-2.
 *
 * SHARED PLACES ARE REAL. Two or more teams can carry the same `computed.place` with
 * `tiebreak.shared === true`. Those rows render LEVEL — the same number with the US sports-page `T`
 * prefix ("T7") — and `tiebreak.note` goes into the note. Two teams level on 7th leave no 8th.
 *
 * A row with `hasReportedResults === false` sorts last, renders its rank as an em dash and ONE "No
 * results reported yet" cell across the data columns — never `0-0-0`, never `.000`, never a rank by
 * merit — and it is still a link.
 *
 * The team's name is the team-page link, stretched over the row (`TeamRowLink`); its accessible name
 * is the row's sentence. Every row carries `data-team-slug` FIRST, so the pinned-team script can mark
 * it: the highlighter across the row and a 3px bar (app/globals.css), and the sr-only "Your team."
 *
 * The cut line (`berthRuleAfter`) is `tr.sx-cut`: a 2px ink rule under that row, no separate row.
 * GP is one plain column, only when `columns` asks for it AND some team still has games to play.
 * There is no LEFT or MAX column and no GD bar: GD is the signed number. A row MaxPreps publishes
 * differently carries a † after its name.
 *
 * No client-side sorting: the table has one correct order.
 *
 * Notes: `notes="inline"` (the default, except `mini`) prints at most ONE `.sx-note` paragraph under
 * the table — this table's own facts (shared places, the no-results team, mismatches, `footnotes`) and
 * the two source links. `notes="none"` renders the table alone; `collectStandingsNotes()` hands the
 * caller the same facts to place itself.
 */

type Face = 'full' | 'mini' | 'archive';
const FACE: Record<StandingsVariant, Face> = { phone: 'full', desktop: 'full', mini: 'mini', archive: 'archive' };

/** Shown from 768px only. */
const WIDE = 'hidden md:table-cell';
const NUM = 'sx-num';

export function StandingsTable(props: StandingsTableProps) {
  const { variant, caption, className, id, berthRuleAfter } = props;
  const face = FACE[variant];
  const rows = face === 'mini' ? props.rows.slice(0, props.limit ?? 4) : props.rows;
  const showNotes = face !== 'mini' && (props.notes ?? 'inline') === 'inline';
  const notes = showNotes ? collectStandingsNotes({ ...props, rows }).specific : [];

  const { flagged, columns, ctx, fixedSchedule, hrefOf, formLabel } = tableRows(props);
  const rules = leagueOfDivision(props.division).rules;
  const byRecord = ordersByRecord(rules);
  // GP earns its column only while it differs between teams' futures: once nobody has a game left,
  // W-L-T says it all.
  const showGp = face === 'full' && columns.has('gp') && rows.some((row) => (ctx(row)?.remaining ?? 0) > 0);
  const full = face === 'full';
  // The data columns after the team: a no-results row spans them with one sentence.
  const dataCols = face === 'archive' ? 2 : face === 'mini' ? 2 : (byRecord ? 9 : 10) + (showGp ? 1 : 0);

  const teamCell = (row: StandingsRowData) => (
    // `aria-label`: the row header is re-announced on every cell, and without it would carry the
    // row link's whole sentence.
    <th scope="row" aria-label={row.team.name} className="sx-col-team">
      <span className="flex items-center gap-2">
        {face === 'full' ? <TeamMonogram team={row.team} size={24} className="hidden md:block" /> : null}
        <TeamRowLink href={hrefOf(row)} label={rowLabel(row)}>
          {face === 'archive' ? row.team.name : row.team.shortName}
        </TeamRowLink>
        {face !== 'archive' && isFlagged(row, flagged) ? <FlagMark name={row.team.name} /> : null}
      </span>
    </th>
  );

  return (
    <div className={className} id={id}>
      <table className="sx-table">
        {/* sr-only: "unofficial" and the through-date are in the section's own meta. */}
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="sx-col-rank">
              #
            </th>
            <th scope="col" className="sx-col-team">
              Team
            </th>
            {face === 'archive' ? (
              <>
                <th scope="col">League</th>
                <th scope="col">Overall</th>
              </>
            ) : (
              <>
                {showGp ? (
                  <th scope="col" className="hidden sm:table-cell" title={gpTitle(fixedSchedule)}>
                    GP
                  </th>
                ) : null}
                <th scope="col">
                  <Abbr short={RECORD_HEAD} long={`League record, ${RECORD_HEAD_WORDS}`} />
                </th>
                <th scope="col">
                  <Abbr short={capitalized(orderHead(rules).toLowerCase())} long={orderHeadWords(rules)} />
                </th>
                {full ? (
                  <>
                    {byRecord ? null : (
                      <th scope="col" className={WIDE}>
                        <Abbr short="Pct" long="Win percentage" />
                      </th>
                    )}
                    <th scope="col" className={WIDE}>
                      Overall
                    </th>
                    <th scope="col" className={WIDE}>
                      <Abbr short={FOR_ABBR} long={capitalized(FOR_WORDS)} />
                    </th>
                    <th scope="col" className={WIDE}>
                      <Abbr short={AGAINST_ABBR} long={capitalized(AGAINST_WORDS)} />
                    </th>
                    <th scope="col">
                      <Abbr short={DIFF_ABBR} long={capitalized(DIFFERENCE_WORDS)} />
                    </th>
                    <th scope="col" className={WIDE}>
                      <Abbr short="Strk" long="Streak" />
                    </th>
                    <th scope="col" className={WIDE}>
                      Last 5
                    </th>
                  </>
                ) : null}
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const s = row.standing;
            const has = s.hasReportedResults;
            const c = ctx(row);
            const gp = showGp ? <td className={`${NUM} hidden sm:table-cell`}>{gpText(c)}</td> : null;
            return (
              <tr
                key={row.team.id}
                data-team-slug={row.team.slug}
                className={berthRuleAfter && index + 1 === berthRuleAfter ? 'relative sx-cut' : 'relative'}
              >
                <td className={`${NUM} sx-col-rank`}>
                  <PlaceCell standing={s} />
                </td>
                {teamCell(row)}
                {face === 'archive' ? (
                  <>
                    <td className={`${NUM} sx-col-ink`}>{recordString(s.computed)}</td>
                    <td className={NUM}>{s.overall.gp > 0 ? recordString(s.overall) : EM_DASH}</td>
                  </>
                ) : !has && face === 'full' ? (
                  /* ONE sentence across the data columns: no fabricated 0-0-0, no row of em dashes.
                     GP still reads 0/12 where the column is on: a fact, not a rank. */
                  <>
                    {gp}
                    <td colSpan={dataCols - (showGp ? 1 : 0)} className="text-left">
                      No results reported yet
                    </td>
                  </>
                ) : !has ? (
                  <>
                    <td className={NUM}>
                      <MissingValue words="no results reported yet" />
                    </td>
                    <td className={NUM} aria-hidden="true">
                      {EM_DASH}
                    </td>
                  </>
                ) : (
                  <>
                    {gp}
                    <td className={`${NUM} sx-col-ink`}>
                      <LeagueRecord record={recordString(s.computed)} context={c} />
                    </td>
                    <td className={`${NUM} sx-col-key`}>{orderValue(rules, s.computed)}</td>
                    {full ? (
                      <>
                        {byRecord ? null : <td className={`${NUM} ${WIDE}`}>{winPct(s.computed.winPct)}</td>}
                        <td className={`${NUM} ${WIDE}`}>{recordString(s.overall)}</td>
                        <td className={`${NUM} ${WIDE}`}>{dash(s.computed.gf, has)}</td>
                        <td className={`${NUM} ${WIDE}`}>{dash(s.computed.ga, has)}</td>
                        <td className={NUM}>{signedGd(s.computed.gd)}</td>
                        <td className={`${NUM} ${WIDE}`}>{streakString(s.computed.streak)}</td>
                        <td className={WIDE}>
                          <FormStrip entries={toFormEntries(s.computed.last5)} size={20} label={formLabel(row)} />
                        </td>
                      </>
                    ) : null}
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      {showNotes && (notes.length > 0 || props.sourceUrl) ? (
        // ONE note under the table: this table's own facts as sentences, then the two source links.
        <p className="sx-note">
          {notes.map((note, i) => (
            <span key={i}>{note} </span>
          ))}
          <Link href="/about#standings" prefetch={false} className="sx-link">
            How standings are computed
          </Link>
          {props.sourceUrl ? (
            <>
              {', and the '}
              <ExternalLink href={props.sourceUrl} className="sx-link">
                MaxPreps table
              </ExternalLink>
              .
            </>
          ) : (
            '.'
          )}
        </p>
      ) : null}
    </div>
  );
}

export default StandingsTable;
