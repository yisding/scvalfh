import { leagueOfDivision } from '../../../lib/leagues';
import type { TeamSlug } from '../../../lib/types';

import ExternalLink from '../../ui/ExternalLink';
import { articleFor, membershipSource } from '../../words/membership-words';
import { biggestGoalDiff } from '../standings-view';

import { tableName } from './cells';
import type { StandingsTableProps } from './types';

/**
 * The table's notes, split by where they belong (brief §4.22):
 *  - `legend`: the GD paragraph and the PTS paragraph — generic, and verbatim the same under every
 *    table, so a page may print them once;
 *  - `specific`: shared-place notes, the no-results team, `standing.mismatch` flags and the
 *    caller's `footnotes` — facts about THIS division, which always stay visible.
 *
 * `statedElsewhere`: teams whose MaxPreps difference the caller's Notes block already states in
 * its comparison list (StandingsNotes). Their `standing.mismatch` note is left out, so one fact is
 * not said twice in one list in two wordings.
 */
export function collectStandingsNotes(
  props: Pick<StandingsTableProps, 'rows' | 'gdDomain' | 'division' | 'variant' | 'footnotes'> & {
    statedElsewhere?: readonly TeamSlug[];
  },
): { legend: React.ReactNode[]; specific: React.ReactNode[] } {
  const legend: React.ReactNode[] = [];
  const specific: React.ReactNode[] = [];
  const { rows, gdDomain, division, variant } = props;
  if (variant !== 'archive') {
    // The scale names the division's biggest goal difference only when there is one: `gdDomain` is
    // floored at 1 for the bar arithmetic, and "(1)" printed for a division where every |GD| is 0
    // (Metro South Bay before its first game) stated a goal difference nobody has (review 2026-10-06).
    const scale =
      biggestGoalDiff(rows.map((r) => r.standing.computed.gd)) > 0
        ? `, to ${tableName(division)}’s biggest goal difference (${gdDomain})`
        : '';
    legend.push(
      `GD = league goals for minus goals against. Bars are scaled per division${scale}, so bars in different divisions are not comparable to each other. A real 0 shows as 0; a score we do not have shows as an em dash. Forfeits count in the win-loss-tie record, not in the goal columns.`,
    );
    legend.push(`PTS: ${leagueOfDivision(division).rules.citations.points}.`);
  }
  // One note per TIED GROUP, not one per team: Cupertino's note and Homestead's note describe
  // the same coin flip. The note already cites Article VI §7, so it renders verbatim.
  const sharedGroups = new Map<string, React.ReactNode>();
  for (const row of rows) {
    if (!row.standing.tiebreak.shared) continue;
    const key = [row.standing.teamId, ...row.standing.tiebreak.tiedWith].sort().join('|');
    if (sharedGroups.has(key)) continue;
    sharedGroups.set(
      key,
      <>
        <b className="font-semibold text-ink">{row.team.name}</b>: {row.standing.tiebreak.note}
      </>,
    );
  }
  for (const note of sharedGroups.values()) specific.push(note);
  for (const row of rows) {
    if (!row.standing.hasReportedResults) {
      // A league with no documents of its own (`official.mode: 'none'`) publishes no alignment, so
      // nothing says "official". "As MaxPreps lists it" only where MaxPreps' table for this division
      // lists the team (the EAL); otherwise the league's membership source is named (Newport
      // Harbor, Hilltop, Southwest: components/words/membership-words.ts).
      const table = tableName(row.team.division);
      const source = membershipSource(row.team.division, [row.team.slug]);
      const is =
        source.kind === 'maxpreps'
          ? `is in the ${table} table as MaxPreps lists it`
          : source.kind === 'official'
            ? `is in the official ${table} alignment`
            : `is ${articleFor(table)} ${table} team (${source.source})`;
      specific.push(
        `${row.team.name} ${is} but has no results in the source table — no record is invented for them.`,
      );
    }
    if (row.standing.mismatch && !props.statedElsewhere?.includes(row.team.slug)) {
      // The pipeline's detail ("overall record 3-2-3 vs MaxPreps 3-3-2") has no full stop.
      const detail = row.standing.mismatchDetail?.replace(/\.?$/, '.');
      specific.push(
        <>
          <span aria-hidden="true">&#9873;</span>
          <span className="sr-only">Flagged:</span> {row.team.name}:{' '}
          {detail ?? 'our computation differs from MaxPreps.'} We show our own
          computation.{' '}
          {row.team.external.maxprepsTeamUrl ? (
            <ExternalLink href={row.team.external.maxprepsTeamUrl}>MaxPreps</ExternalLink>
          ) : null}
        </>,
      );
    }
  }
  for (const extra of props.footnotes ?? []) specific.push(extra);
  return { legend, specific };
}
