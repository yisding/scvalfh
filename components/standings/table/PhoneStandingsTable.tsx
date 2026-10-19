import FormStrip, { toFormEntries } from '@/components/ui/FormStrip';
import { GoalDiffCell } from '@/components/ui/GoalDiffBar';
import { recordString, streakString, winPct } from '@/lib/format/numbers';
import { gpText, tableName, tableRowLabel } from '@/views/standings/table-notes';

import { Abbr, FlagMark, LeagueRecord, PlaceCell, type StandingsVariantProps, dash, rowFormLabel, rowHref } from './cells';
import { TeamNameCell, TeamRowLink } from './parts';

/**
 * The phone standings table (StandingsTable `variant="phone"`, below `lg`): a 68px two-line row.
 * Line 1 is place, monogram and short name, PTS, the league record and the GD plot (from `md`
 * four more of the desktop columns: Pct, GF, GA, Stk); line 2 runs the whole row width with the
 * form strip, GP and the overall record. A team with no reported results gets one "No results
 * yet" cell across the data columns. StandingsTable renders the card, the caption and this head
 * and body inside its `<table>`.
 */
export function PhoneStandingsTable({
  division,
  rows,
  gdDomain,
  columns,
  fixedSchedule,
  contextOf,
  isFlagged,
  cut,
}: StandingsVariantProps) {
  const showGp = columns.has('gp');
  return (
    <>
      <thead>
        <tr>
          <th scope="col" className="w-[2.75rem] pl-gutter pr-2">
            #
          </th>
          {/* The sticky head names the TABLE (its division heading, or the league's short
              name for a one-table league), not "Team": once the section heading has
              scrolled away under the chrome, this is the only thing on screen that says
              which table you are in. A screen reader still hears "… team" as the column's
              name. `whitespace-normal`: the head's nowrap made "EL CAMINO" the team
              column's minimum width, which pushed the table 18px past a 390 screen under a
              24px browser font; it wraps there instead. */}
          <th scope="col" className="whitespace-normal">
            {tableName(division)}
            <span className="sr-only"> team</span>
          </th>
          <th scope="col" className="w-8 text-right max-[389px]:pr-1">
            <Abbr short="Pts" long="Points" />
          </th>
          {/* The League head (52px of 12px caps) is wider than its numerals (40px), and
              the numerals carry 8px of right padding so they never run into the GD track
              (or, below 375, into the GD numeral). From 390 there is room for the head to
              take the same 8px; below it the head keeps the cell edge and drops its
              letter-spacing, so it still clears "PTS" by about 7px.
              Below 390 the column is 56 with 1px of left padding, and PTS gives its
              numerals 4px of right padding instead: a six-character record ("10-1-0",
              46.8px of 13px mono) plus 4 + 8 of padding was 58.8, so under auto layout the
              56px column grew to 58.8 in any table holding one (El Camino, MCAL, PCAL)
              and not in the others, and every column right of Team moved 2.8px between
              the tables of one page. Widening the column to fit instead cost Team the
              3px that "Mission Bay" and "Newport Harbor" need at 375. Now 1 + 46.8 + 8
              fits, and the record still clears the points by 5px. */}
          <th
            scope="col"
            className="w-[56px] pl-px text-right max-[389px]:tracking-normal min-[390px]:w-[68px] min-[390px]:px-2"
          >
            League
          </th>
          {/* 768-1023: the phone table spans a 720px card, so it shows four more of the
              desktop columns instead of a 480px team cell with nothing in it. */}
          <th scope="col" className="hidden w-16 pr-2 text-right md:table-cell">
            <Abbr short="Pct" long="Win percentage" />
          </th>
          <th scope="col" className="hidden w-14 pr-2 text-right md:table-cell">
            <Abbr short="GF" long="Goals for" />
          </th>
          <th scope="col" className="hidden w-14 pr-2 text-right md:table-cell">
            <Abbr short="GA" long="Goals against" />
          </th>
          <th scope="col" className="hidden w-16 pr-2 text-right md:table-cell">
            <Abbr short="Stk" long="Streak" />
          </th>
          {/* Column budget at 390: 44 (#) + 158 (Team) + 32 (PTS) + 68 (League: 8 + 52
              + 8) + 88 (GD: 44 track + 4 + 24 numeral, three 13px mono glyphs, + 16
              gutter). The track was 56 until the longest short names ("Lick-Wilmerding"
              125px of 16px semibold, "Valley Christian" 120, "Marin Academy" 119) needed
              the 12px it gave up: at 56 they truncated at 390 to "Lick-Wilmerd…". Below
              390 League is 56 (1 + 47 + 8: it gives up 12px of head padding), and below
              375 GD keeps only its numeral, so a flagged "Monta Vista" stays whole at 320
              and at 375: 44 + 144 (Team) + 32 + 56 + 44 at 320, and 44 + 155 + 32 + 56
              + 88 at 375.
              The GD plot is the one thing that can afford to go. Below 375px the fixed
              columns starved the team cell and long school names truncated to fragments,
              against DESIGN §10.8's "reflow at 320px with no loss of content". The plot is
              dropped there and the signed numeral stays, which is the cell's accessible
              value anyway; the name is what a reader cannot do without.
              The threshold is 23.4375rem, not 375px: 375 at the default text size, 562
              under a 24px browser font, where a px query kept the 100px plot at 390 and
              the table ran 10px past its card ("T4" and "Mt. Hamilton" grow, the plot
              does not). The same unit the line-2 record and the home mini table's query use. */}
          <th
            scope="col"
            className="w-[44px] pr-gutter text-right min-[23.4375rem]:w-[88px]"
          >
            <Abbr short="GD" long="Goal difference" />
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => {
          const s = row.standing;
          const has = s.hasReportedResults;
          return (
            <tr
              key={row.team.id}
              data-team-slug={row.team.slug}
              className="relative"
              // A token in rem, not 68px: the row grows with the reader's browser text
              // size, so the absolutely placed line 2 never rides up over line 1.
              style={{ height: 'var(--spacing-row)', ...cut(index) }}
            >
              {/* Line 1 is top-aligned at 10px; the 13px numerals take 12px so their
                  20px line box centres on the 24px name line. */}
              <td className="w-[2.75rem] pt-3 pl-gutter pr-2 align-top text-ink-3">
                <PlaceCell standing={s} />
              </td>
              {/* An explicit `aria-label`, because a row header is re-announced on every
                  cell the reader moves to and this one otherwise accumulates everything in
                  the row: the row link's full label, the visible short name, the form
                  strip's own sentence and the overall record. The name alone is what a
                  cell announcement needs; the link keeps the full "1st in De Anza, 4-0-0,
                  12 points" and the form sentence is still in the row. */}
              <th
                scope="row"
                aria-label={row.team.name}
                className="max-w-0 pt-2.5 text-left align-top font-normal"
              >
                {/* `scroll-mt-9`: html's scroll-padding clears the 48px top bar and the
                    48px division bar, but not this table's own 36px sticky head, which
                    would otherwise cover half of a row focused by Shift+Tab. */}
                <TeamRowLink href={rowHref(row)} label={tableRowLabel(row)} className="max-md:scroll-mt-9" />
                <span className="flex items-center gap-2">
                  {/* shortName, not name: the phone team cell is ~158px at 390, so
                      "Convent of the Sacred Heart" would truncate mid-word. The row link's
                      accessible name still carries the full school name. */}
                  <TeamNameCell team={row.team} size={24} nameClass="min-w-0 truncate text-body font-semibold text-ink" />
                  {isFlagged(row) ? <FlagMark name={row.team.name} /> : null}
                </span>
                {/* Line 2 runs the FULL row width — 44px indent (under the monogram), the
                    form strip, then the overall record — which a cell in a five-column
                    table cannot do. The <tr> is `position: relative`, so absolute placement
                    here spans the row. It is inert (the chips carry no links in this
                    variant), hence `pointer-events-none`: the row link stays whole.
                    The strip sits in a fixed 116px box (five 20px chips, 4px apart),
                    right-aligned, so a team with fewer than five results still has its
                    NEWEST chip and the overall record at the same x as every other row.
                    The box is in px, not rem, because the chips are: a 7.25rem box grew
                    to 174px under a 24px browser font around the same 116px of chips
                    and squeezed the record onto three lines, up into line 1.
                    Budget at 320: 44 + 116 + 8 + ~95 ("10-1-0" in 13px mono, then
                    " overall" in 13px sans, narrower than mono) = 263 of 304.
                    The League record (in its td) and this record never wrap at their
                    hyphens: under a large browser font (320-375 at 20/24px) a wrapped
                    League cell pushes its tail into line 2, and a wrapped line-2 record
                    grows UP into line 1. Not `truncate`: at 320/24px that clips every
                    row to "9-1-0 ov…", where nowrap lets the word run into the right
                    padding instead. Where GP also leads the line (a caller that passes
                    the `gp` column, as every league page does), the record gives way
                    below 23.4375rem rather than wrap or clip: see the budget there. */}
                {has ? (
                  <span className="pointer-events-none absolute inset-x-0 bottom-2 flex items-center gap-2 pl-[2.75rem] pr-gutter text-meta text-ink-3">
                    <span className="flex w-[116px] shrink-0 justify-end">
                      <FormStrip
                        entries={toFormEntries(s.computed.last5)}
                        size={20}
                        label={rowFormLabel(row)}
                      />
                    </span>
                    {/* GP leads the overall record. Both numbers sit in fixed, right-aligned
                        boxes in `ch` (one 13px mono digit, 7.8px): the GP count in 5ch
                        ("10/12") where the schedule is fixed and 2ch where it is a bare
                        count (the Sunset's "9"), the record in 6ch ("10-1-0"). Sized by
                        their text, "10/12 GP" pushed its row's record 7px right of a
                        "9/12 GP" row's and a bare "9 GP" sat 24px left of both, so the
                        record started at a different x in each row and table; now every
                        row of a fixed-schedule table puts "overall" at one x, and every
                        such table on a page at the same one.
                        Budget at 16px: 44 + 116 + 8 + 62 ("10/12 GP", eight mono glyphs)
                        + 8 + ~90 (6ch + " overall") + 16 right gutter = 344 (measured:
                        "overall" ends at 328), past a 320 row, inside a 375 one.
                        Everything but the 116px strip is in rem and grows with the
                        browser text size (at 24px the same line is ~460), so the
                        threshold is in rem too: 23.4375rem is 375px at 16px, 469 at 20px
                        and 562 at 24px — the unit the GD container query uses. Below it
                        the record gives way rather than run past the card edge and be
                        clipped mid-word ("9-1-0 over"); the team page still carries it. */}
                    {showGp ? (
                      <span className="sx-num shrink-0 whitespace-nowrap text-cell text-ink-3">
                        <span
                          className={`inline-block text-right ${fixedSchedule ? 'min-w-[5ch]' : 'min-w-[2ch]'}`}
                        >
                          {gpText(contextOf(row))}
                        </span>{' '}
                        GP
                      </span>
                    ) : null}
                    {/* Mono for the digits only (they stack down the rows); the word is
                        prose and stays sans. */}
                    <span
                      className={[
                        'whitespace-nowrap text-cell text-ink-3',
                        showGp ? 'max-[23.4375rem]:hidden' : null,
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <span className="sx-num inline-block min-w-[6ch] text-right">{recordString(s.overall)}</span> overall
                    </span>
                  </span>
                ) : null}
              </th>
              {has ? (
                <>
                  <td className="sx-num w-8 pt-2.5 text-right align-top text-body font-bold text-ink max-[389px]:pr-1">
                    {s.computed.pts}
                  </td>
                  <td className="sx-num w-[56px] whitespace-nowrap pt-3 pl-px pr-2 text-right align-top font-medium text-ink min-[390px]:w-[68px] min-[390px]:pl-2">
                    <LeagueRecord record={recordString(s.computed)} context={contextOf(row)} />
                  </td>
                  <td className="sx-num hidden w-16 pt-3 pr-2 text-right align-top font-medium text-ink md:table-cell">
                    {winPct(s.computed.winPct)}
                  </td>
                  <td className="sx-num hidden w-14 pt-3 pr-2 text-right align-top text-ink-2 md:table-cell">
                    {dash(s.computed.gf, has)}
                  </td>
                  <td className="sx-num hidden w-14 pt-3 pr-2 text-right align-top text-ink-2 md:table-cell">
                    {dash(s.computed.ga, has)}
                  </td>
                  <td className="sx-num hidden w-16 pt-3 pr-2 text-right align-top text-ink-2 md:table-cell">
                    {streakString(s.computed.streak)}
                  </td>
                  <td className="w-[44px] pt-3 pr-gutter text-right align-top min-[23.4375rem]:w-[88px]">
                    <GoalDiffCell
                      value={s.computed.gd}
                      domain={gdDomain}
                      track={44}
                      numberWidth={24}
                      numberClassName="text-cell"
                      barClassName="hidden min-[23.4375rem]:block"
                    />
                  </td>
                </>
              ) : (
                /* No results (Wilcox): one sentence across the data columns, as on the
                   desktop table, instead of a row of em dashes and a stray `·`. The span
                   differs at md, where four more columns show; only one of the two cells
                   is ever displayed. The rank cell and the row link already say "not
                   ranked" / "no results reported yet" to a screen reader. */
                <>
                  <td data-twin colSpan={3} className="pt-3 pr-gutter text-right align-top text-meta text-ink-3 md:hidden">
                    No results yet
                  </td>
                  <td data-twin colSpan={7} className="hidden pt-3 pr-gutter text-right align-top text-meta text-ink-3 md:table-cell">
                    No results yet
                  </td>
                </>
              )}
            </tr>
          );
        })}
      </tbody>
    </>
  );
}

export default PhoneStandingsTable;
