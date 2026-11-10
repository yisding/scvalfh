import { GoalDiffCell } from '../../ui/GoalDiffBar';
import { StretchedRowLink } from '../../ui/PinNote';
import TeamMonogram from '../../ui/TeamMonogram';
import { EM_DASH, recordString } from '../../../lib/format';

import { Abbr, LeagueRecord, NoGoalDiff, PlaceCell, gpText, gpTitle, rowLabel, tableRows } from './cells';
import type { StandingsTableProps } from './types';

/**
 * The `mini` face of the league table: the top `limit` rows (default 4) under a visible static
 * head. StandingsTable renders it inside the card. No page renders this variant today; the home
 * page's top-of-table is components/home/MiniStandings.tsx.
 */
export function MiniStandingsTable(props: StandingsTableProps) {
  const { gdDomain } = props;
  const { columns, ctx, fixedSchedule, hrefOf } = tableRows(props);
  const showGp = columns.has('gp');
  const rows = props.rows.slice(0, props.limit ?? 4);
  return (
    <>
      {/* A VISIBLE head, static (`[&_th]:static`): the mini table is four rows on the home
          page, too short for a sticky head to earn its keep. A head holding an `Abbr`
          takes `relative` back, for its sr-only long form.
          Columns run # · Team · (GP) · Pts · League · GD, the full table's order, so the
          ordering key sits next to the name. Pts is 32px; League is 68px with 8px a side,
          so its 52px head never touches "PTS". Fixed columns: 44 + 32 + 68 + 100 = 244,
          which leaves 146px for the team in a 390 card (less the 36px GP column where it
          shows).
          The GD plot keys off the CARD's width (`@container` on the card), not the
          viewport. The query is in rem (23.4375rem = 375px at the default 16px), so under
          a larger browser text size the plot drops out earlier and the name keeps the room
          it needs; the name also wraps to two lines rather than truncating. Below that
          card width only the signed numeral shows. */}
      <thead className="[&_th]:static">
        <tr>
          <th scope="col" className="w-[2.75rem] pl-gutter pr-2">
            #
          </th>
          <th scope="col">Team</th>
          {showGp ? (
            <th scope="col" className="w-9 text-right" title={gpTitle(fixedSchedule)}>
              GP
            </th>
          ) : null}
          <th scope="col" className="relative w-8 text-right">
            <Abbr short="Pts" long="Points" />
          </th>
          <th scope="col" className="w-[68px] px-2 text-right">
            League
          </th>
          <th
            scope="col"
            className="relative w-[44px] pr-gutter text-right @min-[23.4375rem]:w-[100px]"
          >
            <Abbr short="GD" long="Goal difference" />
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const s = row.standing;
          const has = s.hasReportedResults;
          return (
            <tr
              key={row.team.id}
              data-team-slug={row.team.slug}
              className="relative"
              // rem, not px: the row grows with the browser text size.
              style={{ height: 'var(--spacing-row-1)' }}
            >
              <td className="w-[2.75rem] pl-gutter pr-2 text-ink-3">
                <PlaceCell standing={s} />
              </td>
              <th scope="row" aria-label={row.team.name} className="max-w-0 text-left font-normal">
                <StretchedRowLink href={hrefOf(row)} label={rowLabel(row)} />
                <span className="flex items-center gap-2">
                  <TeamMonogram team={row.team} size={24} />
                  {/* Two lines, broken at a space (no `break-words`, which split a name
                      per letter in a narrow cell): under a large browser text size the
                      name wraps inside the row instead of losing its second word. */}
                  <span className="min-w-0 line-clamp-2 text-ellipsis text-body text-ink">
                    {row.team.shortName}
                  </span>
                </span>
              </th>
              {showGp ? (
                // Mono 11px: "12/16" fits the 36px column with its padding.
                <td className="sx-num w-9 text-right text-[0.6875rem] text-ink-3">
                  {gpText(ctx(row))}
                </td>
              ) : null}
              <td className="sx-num w-8 text-right text-body font-bold text-ink">
                {has ? s.computed.pts : EM_DASH}
              </td>
              <td className="sx-num w-[68px] px-2 text-right font-medium text-ink">
                {has ? <LeagueRecord record={recordString(s.computed)} context={ctx(row)} /> : EM_DASH}
              </td>
              <td className="w-[44px] pr-gutter text-right @min-[23.4375rem]:w-[100px]">
                {has ? (
                  <GoalDiffCell
                    value={s.computed.gd}
                    domain={gdDomain}
                    track={56}
                    numberWidth={24}
                    numberClassName="text-cell"
                    barClassName="hidden @min-[23.4375rem]:block"
                  />
                ) : (
                  <NoGoalDiff />
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </>
  );
}
