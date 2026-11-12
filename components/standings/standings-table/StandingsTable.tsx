import Link from 'next/link';
import { Fragment } from 'react';

import ExternalLink from '../../ui/ExternalLink';
import FormStrip, { toFormEntries } from '../../ui/FormStrip';
import MissingValue from '../../ui/MissingValue';
import { TeamRowLink } from '../../ui/PinNote';
import TeamMonogram from '../../ui/TeamMonogram';
import { EM_DASH, recordString, signedGd } from '../../../lib/format';
import { findDivision, leagueOfDivision } from '../../../lib/leagues';
import { orderHead, orderHeadWords, orderValue } from '../../../lib/standings/order';
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
 * ONE `<div className="sx-tablewrap"><table className="sx-table">`: no card, no phone/desktop twin.
 * Which columns show is decided by the TABLE's own width (container queries on `.sx-tablewrap`,
 * app/globals.css), never by the viewport. A `face` chooses the set:
 *
 *   mini     # · Team · W-L-T · Pts · Last 5 (`sx-col-wide`: from 24rem of table width; a 21rem rail
 *            does not show it) — the top `limit` rows when one is given;
 *   full     the wrapper carries `data-full` (capped at 47rem). Under 20rem: # · Team · W-L-T · Pts.
 *            From 20rem: + GD (`sx-col-mid`). From 40rem, four groups:
 *            # · Team · W · L · T · Pts ‖ GF · GA · GD ‖ Overall ‖ Last 5
 *            (W, L, T are `sx-col-full sx-col-split` and replace the combined `sx-col-rec` cell; a
 *            group starts with `sx-col-gap`, a wider gutter, not a rule). BOTH the combined record
 *            cell and the three split cells are in every row; CSS shows one or the other;
 *   archive  # · Team · League · Overall — final records only.
 *
 * The old `variant` values still work: `phone` and `desktop` are both the full table.
 *
 * THE SORT KEY is the one strong column (`sx-col-key`, 19px/700): Pts (By-Laws Article VI §2: 3 for
 * a win, 1 for a tie, "the division placement/standings will be the order of team points"). There
 * is no Pct column beside Pts: it restates W-L-T. A league ordered on its record (basketball)
 * prints Pct in the key column instead, and no Pts. After it: the name (500), W / L / T and GD
 * (ink), GF / GA / Overall (`sx-col-quiet`), and Last 5 as five 16px chips (W solid, L and T
 * outlined), oldest left.
 *
 * SHARED PLACES ARE REAL. Two or more teams can carry the same `computed.place` with
 * `tiebreak.shared === true`. Those rows render LEVEL — the same number with the US sports-page `T`
 * prefix ("T7") — and `tiebreak.note` goes into the note. Two teams level on 7th leave no 8th.
 *
 * A row with `hasReportedResults === false` sorts last, renders its rank as an em dash and ONE "No
 * results reported yet" cell across the data columns — never `0-0-0`, never `.000`, never a rank by
 * merit — and it is still a link.
 *
 * The team cell is the logo (24px, every face, every width) and the name, which is the team-page
 * link stretched over the row (`TeamRowLink`; its accessible name is the row's sentence). Every row
 * carries `data-team-slug` FIRST, so the pinned-team script can mark it: the reader's team gets a
 * bold name and the star (`.sx-pin-note`; aria-hidden here, because the row link already says
 * "Your team."). `self` (the team whose page this is) is `tr.sx-self`: a bold name. No row
 * background, bar or tint.
 *
 * THE QUALIFICATION LINE (`berthRuleAfter`): directly after the last qualifying row, ONE extra row,
 * `tr.sx-cutline`, a 2px green line with its label set on it at the right end (`berthLabel`, else
 * the division's own line label from the league config). It has no `data-team-slug`. Omitted when
 * every listed team is above it.
 *
 * GP is one plain column, only when `columns` asks for it AND some team still has games to play.
 * No LEFT or MAX column, no GD bar, no streak column. A row MaxPreps publishes differently carries a
 * † after its name.
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

const NUM = 'sx-num';
/** The full table's columns that appear from 40rem of table width. */
const FULL = 'sx-col-full';
const SPLIT = `${FULL} sx-col-split`;
/** `W`, `L`, `T` (no `T` in a sport without ties) and their words, for the split record columns. */
const SPLIT_HEADS = RECORD_HEAD.split('-');
const SPLIT_WORDS = RECORD_HEAD_WORDS.split('-');

export function StandingsTable(props: StandingsTableProps) {
  const { variant, caption, className, id, berthRuleAfter } = props;
  const face = FACE[variant];
  const rows = face === 'mini' && props.limit !== undefined ? props.rows.slice(0, props.limit) : props.rows;
  const showNotes = face !== 'mini' && (props.notes ?? 'inline') === 'inline';
  const notes = showNotes ? collectStandingsNotes({ ...props, rows }).specific : [];

  const { flagged, columns, ctx, fixedSchedule, hrefOf, formLabel } = tableRows(props);
  const rules = leagueOfDivision(props.division).rules;
  // GP earns its column only while it differs between teams' futures: once nobody has a game left,
  // W-L-T says it all.
  const showGp = face === 'full' && columns.has('gp') && rows.some((row) => (ctx(row)?.remaining ?? 0) > 0);
  const full = face === 'full';
  // Every rendered cell of a row (the qualification line spans them all): 12 in the full table, 5 in `mini`.
  const cols = face === 'archive' ? 4 : full ? 9 + SPLIT_HEADS.length + (showGp ? 1 : 0) : 5;
  // The data columns after the team (and GP): a no-results row spans them with one sentence.
  const dataCols = full ? 7 + SPLIT_HEADS.length : 2;
  const cutAfter = berthRuleAfter && face !== 'archive' && berthRuleAfter < rows.length ? berthRuleAfter : null;
  const cutLabel = props.berthLabel ?? findDivision(props.division)?.ladderLine?.label ?? null;
  const keyHead = capitalized(orderHead(rules).toLowerCase());

  const teamCell = (row: StandingsRowData) => (
    // `aria-label`: the row header is re-announced on every cell, and without it would carry the
    // row link's whole sentence.
    <th scope="row" aria-label={row.team.name} className="sx-col-team">
      <span className="sx-teamcell">
        <TeamMonogram team={row.team} size={24} />
        <span>
          <TeamRowLink href={hrefOf(row)} label={rowLabel(row)}>
            {face === 'archive' ? row.team.name : row.team.shortName}
          </TeamRowLink>
          {/* The star. aria-hidden: the row link's own sentence already starts "Your team." */}
          <span className="sx-pin-note" aria-hidden="true" hidden>
            Your team
          </span>
          {face !== 'archive' && isFlagged(row, flagged) ? <FlagMark name={row.team.name} /> : null}
        </span>
      </span>
    </th>
  );

  return (
    <div className={['sx-tablewrap', className].filter(Boolean).join(' ')} id={id} data-full={full ? '' : undefined}>
      <table className="sx-table" data-sticky-head={full ? '' : undefined}>
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
                  <th scope="col" className="sx-col-mid" title={gpTitle(fixedSchedule)}>
                    GP
                  </th>
                ) : null}
                <th scope="col" className={full ? 'sx-col-rec' : undefined}>
                  <Abbr short={RECORD_HEAD} long={`League record, ${RECORD_HEAD_WORDS}`} />
                </th>
                {full
                  ? SPLIT_HEADS.map((letter, i) => (
                      <th key={letter} scope="col" className={SPLIT}>
                        <Abbr short={letter} long={capitalized(SPLIT_WORDS[i] ?? letter)} />
                      </th>
                    ))
                  : null}
                <th scope="col" className="sx-col-key">
                  <Abbr short={keyHead} long={orderHeadWords(rules)} />
                </th>
                {full ? (
                  <>
                    <th scope="col" className={`${FULL} sx-col-gap`}>
                      <Abbr short={FOR_ABBR} long={capitalized(FOR_WORDS)} />
                    </th>
                    <th scope="col" className={FULL}>
                      <Abbr short={AGAINST_ABBR} long={capitalized(AGAINST_WORDS)} />
                    </th>
                    <th scope="col" className="sx-col-mid">
                      <Abbr short={DIFF_ABBR} long={capitalized(DIFFERENCE_WORDS)} />
                    </th>
                    <th scope="col" className={`${FULL} sx-col-gap`}>
                      Overall
                    </th>
                    <th scope="col" className={`${FULL} sx-col-gap`}>
                      Last 5
                    </th>
                  </>
                ) : (
                  <th scope="col" className="sx-col-wide">
                    Last 5
                  </th>
                )}
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const s = row.standing;
            const has = s.hasReportedResults;
            const c = ctx(row);
            const gp = showGp ? <td className={`${NUM} sx-col-mid sx-col-quiet`}>{gpText(c)}</td> : null;
            const record = s.computed;
            const last5 = <FormStrip entries={toFormEntries(record.last5)} size={16} label={formLabel(row)} />;
            return (
              <Fragment key={row.team.id}>
                <tr data-team-slug={row.team.slug} className={props.self === row.team.slug ? 'relative sx-self' : 'relative'}>
                  <td className={`${NUM} sx-col-rank`}>
                    <PlaceCell standing={s} />
                  </td>
                  {teamCell(row)}
                  {face === 'archive' ? (
                    <>
                      <td className={NUM}>{recordString(record)}</td>
                      <td className={`${NUM} sx-col-quiet`}>{s.overall.gp > 0 ? recordString(s.overall) : EM_DASH}</td>
                    </>
                  ) : !has && full ? (
                    /* ONE sentence across the data columns: no fabricated 0-0-0, no row of em dashes.
                       GP still reads 0/12 where the column is on: a fact, not a rank. */
                    <>
                      {gp}
                      <td colSpan={dataCols} className="sx-col-quiet">
                        No results reported yet
                      </td>
                    </>
                  ) : !has ? (
                    <>
                      <td className={NUM}>
                        <MissingValue words="no results reported yet" />
                      </td>
                      <td className={`${NUM} sx-col-key`} aria-hidden="true">
                        {EM_DASH}
                      </td>
                      <td className="sx-col-wide" />
                    </>
                  ) : (
                    <>
                      {gp}
                      <td className={full ? `${NUM} sx-col-rec` : NUM}>
                        <LeagueRecord record={recordString(record)} context={c} />
                      </td>
                      {full ? (
                        <>
                          {[record.w, record.l, record.t].slice(0, SPLIT_HEADS.length).map((value, i) => (
                            <td key={SPLIT_HEADS[i]} className={`${NUM} ${SPLIT}`}>
                              {/* The † of a record that includes a si.com score hangs off the last figure. */}
                              {i === SPLIT_HEADS.length - 1 ? <LeagueRecord record={String(value)} context={c} /> : value}
                            </td>
                          ))}
                        </>
                      ) : null}
                      <td className={`${NUM} sx-col-key`}>{orderValue(rules, record)}</td>
                      {full ? (
                        <>
                          <td className={`${NUM} ${FULL} sx-col-gap sx-col-quiet`}>{dash(record.gf, has)}</td>
                          <td className={`${NUM} ${FULL} sx-col-quiet`}>{dash(record.ga, has)}</td>
                          <td className={`${NUM} sx-col-mid`}>{signedGd(record.gd)}</td>
                          <td className={`${NUM} ${FULL} sx-col-gap sx-col-quiet`}>{recordString(s.overall)}</td>
                          <td className={`${FULL} sx-col-gap`}>{last5}</td>
                        </>
                      ) : (
                        <td className="sx-col-wide">{last5}</td>
                      )}
                    </>
                  )}
                </tr>
                {cutAfter === index + 1 && cutLabel ? (
                  // The qualification line: its label sits ON the line. `data-hide-while-searching`:
                  // it means nothing between filtered rows (components/search/TeamFinder.tsx).
                  <tr className="sx-cutline" data-hide-while-searching="">
                    <td colSpan={cols}>
                      <span>{cutLabel}</span>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
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
