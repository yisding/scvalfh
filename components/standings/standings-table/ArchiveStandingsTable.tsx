import { StretchedRowLink } from '../../ui/PinNote';
import TeamMonogram from '../../ui/TeamMonogram';
import { EM_DASH, recordString } from '../../../lib/format';

import { PlaceCell, rowLabel, tableRows } from './cells';
import type { StandingsTableProps } from './types';

/**
 * The `archive` face of the league table: final records only — place, team, League, Overall — with
 * no GD bars and no form. StandingsTable renders it inside the card. No page renders this variant
 * today.
 */
export function ArchiveStandingsTable(props: StandingsTableProps) {
  const { hrefOf } = tableRows(props);
  const rows = props.rows;
  return (
    <>
      <thead>
        <tr>
          <th scope="col" className="w-[2.75rem] pl-4 pr-2 md:pl-5">
            #
          </th>
          <th scope="col">Team</th>
          <th scope="col" className="text-right">
            League
          </th>
          <th scope="col" className="pr-4 text-right md:pr-5">
            Overall
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.team.id}
            data-team-slug={row.team.slug}
            className="relative"
            // rem, not px: the row grows with the browser text size.
            style={{ height: 'var(--spacing-row-1)' }}
          >
            <td className="w-[2.75rem] pl-4 pr-2 text-ink-3 md:pl-5">
              <PlaceCell standing={row.standing} />
            </td>
            <th scope="row" aria-label={row.team.name} className="text-left font-normal">
              <StretchedRowLink href={hrefOf(row)} label={rowLabel(row)} />
              <span className="flex items-center gap-2">
                <TeamMonogram team={row.team} size={24} />
                <span className="truncate text-body text-ink">{row.team.name}</span>
              </span>
            </th>
            <td className="sx-num text-right font-medium text-ink">
              {recordString(row.standing.computed)}
            </td>
            <td className="sx-num pr-4 text-right text-ink-2 md:pr-5">
              {row.standing.overall.gp > 0 ? recordString(row.standing.overall) : EM_DASH}
            </td>
          </tr>
        ))}
      </tbody>
    </>
  );
}
