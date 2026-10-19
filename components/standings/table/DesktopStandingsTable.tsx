import FormStrip, { toFormEntries } from '@/components/ui/FormStrip';
import { GoalDiffCell } from '@/components/ui/GoalDiffBar';
import { recordString, streakString, winPct } from '@/lib/format/numbers';
import { EM_DASH } from '@/lib/format/words';
import { gpText, gpTitle, tableName, tableRowLabel } from '@/views/standings/table-notes';

import { Abbr, FlagMark, LeagueRecord, PlaceCell, type StandingsVariantProps, dash, rowFormLabel, rowHref } from './cells';
import { COL, DESKTOP_HEAD, type DesktopCol, desktopCols } from './desktop-columns';
import { TeamNameCell, TeamRowLink } from './parts';

/**
 * The desktop standings table (StandingsTable `variant="desktop"`, from `lg`): one wide row per
 * team under a fixed `<colgroup>` (desktop-columns.ts), the Home / Away / Neutral splits giving
 * way to GP, LEFT and MAX when the caller turns those on. A team with no reported results gets
 * one sentence across the data columns. StandingsTable renders the card, the caption and this
 * colgroup, head and body inside its `<table>`.
 */
export function DesktopStandingsTable({
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
  const cols = desktopCols(showGp, columns.has('left'), columns.has('max'));
  return (
    <>
      <colgroup>
        {cols.map((col) => (
          <col key={col} className={COL[col] || undefined} />
        ))}
      </colgroup>
      <thead>
        <tr>
          {cols.map((col) => {
            const head = DESKTOP_HEAD[col];
            if (col === 'team') {
              // The table's name, not "Team" (see the phone head in PhoneStandingsTable.tsx).
              return (
                <th key={col} scope="col">
                  {tableName(division)}
                  <span className="sr-only"> team</span>
                </th>
              );
            }
            return (
              <th
                key={col}
                scope="col"
                title={col === 'gp' ? gpTitle(fixedSchedule) : head.title}
                className={head.right ? 'text-right' : undefined}
              >
                {head.long ? <Abbr short={head.label} long={head.long} /> : head.label}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => {
          const s = row.standing;
          const has = s.hasReportedResults;
          const c = contextOf(row);
          const cell = (col: DesktopCol): React.ReactNode => {
            switch (col) {
              case 'gp':
                return <td key={col} className="sx-num text-right text-ink-2">{gpText(c)}</td>;
              case 'pts':
                return (
                  <td key={col} className="sx-num text-right text-body font-bold text-ink">
                    {s.computed.pts}
                  </td>
                );
              case 'left':
                return <td key={col} className="sx-num text-right text-ink-2">{c?.remaining ?? EM_DASH}</td>;
              case 'max':
                return <td key={col} className="sx-num text-right text-ink-2">{c?.maxPts ?? EM_DASH}</td>;
              case 'league':
                return (
                  <td key={col} className="sx-num text-right font-medium text-ink">
                    <LeagueRecord record={recordString(s.computed)} context={c} />
                  </td>
                );
              case 'pct':
                return (
                  <td key={col} className="sx-num text-right font-medium text-ink">
                    {winPct(s.computed.winPct)}
                  </td>
                );
              case 'overall':
                return <td key={col} className="sx-num text-right text-ink-2">{recordString(s.overall)}</td>;
              case 'gf':
                return <td key={col} className="sx-num text-right text-ink-2">{dash(s.computed.gf, has)}</td>;
              case 'ga':
                return <td key={col} className="sx-num text-right text-ink-2">{dash(s.computed.ga, has)}</td>;
              case 'gd':
                return (
                  <td key={col} className="text-right">
                    <GoalDiffCell
                      value={s.computed.gd}
                      domain={gdDomain}
                      track={64}
                      thickness={8}
                      numberWidth={28}
                    />
                  </td>
                );
              case 'stk':
                return (
                  <td key={col} className="sx-num text-right text-ink-2">
                    {streakString(s.computed.streak)}
                  </td>
                );
              case 'home':
                return <td key={col} className="sx-num text-right text-ink-2">{recordString(s.computed.homeRecord)}</td>;
              case 'away':
                return <td key={col} className="sx-num text-right text-ink-2">{recordString(s.computed.awayRecord)}</td>;
              case 'neut':
                return <td key={col} className="sx-num text-right text-ink-2">{recordString(s.computed.neutralRecord)}</td>;
              case 'l5':
                return (
                  <td key={col} className="text-right">
                    <FormStrip
                      entries={toFormEntries(s.computed.last5)}
                      size={20}
                      label={rowFormLabel(row)}
                    />
                  </td>
                );
              default:
                return null;
            }
          };
          return (
            <tr
              key={row.team.id}
              data-team-slug={row.team.slug}
              className="relative"
              // rem, not px: the row grows with the browser text size.
              style={{ height: 'var(--spacing-row-1)', ...cut(index) }}
            >
              <td className="text-ink-3">
                <PlaceCell standing={s} />
              </td>
              {/* `aria-label`: the row header is re-announced on every cell, and without
                  it carries the row link's whole sentence (see PhoneStandingsTable). */}
              <th scope="row" aria-label={row.team.name} className="text-left font-normal">
                <TeamRowLink href={rowHref(row)} label={tableRowLabel(row)} />
                <span className="flex items-center gap-3">
                  <TeamNameCell team={row.team} size={24} nameClass="min-w-0 truncate text-body font-medium text-ink" />
                  {isFlagged(row) ? <FlagMark name={row.team.name} /> : null}
                </span>
              </th>
              {has ? (
                cols.slice(2).map(cell)
              ) : (
                /* A team with no reported results gets ONE sentence across the data
                   columns: no fabricated 0-0-0, no row of em dashes. The place cell and
                   the row link already say "not ranked" / "no results reported yet" to a
                   screen reader. GP still reads 0/12 where the column is on: a fact, not
                   a rank. */
                <>
                  {showGp ? cell('gp') : null}
                  <td colSpan={cols.length - (showGp ? 3 : 2)} className="text-ink-3">
                    No results reported yet
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

export default DesktopStandingsTable;
