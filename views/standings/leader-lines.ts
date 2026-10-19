/**
 * One league's leaders as one clause, for a link preview or a `<title>` (SPEC §8.4).
 */

import type { DivisionId } from '@/lib/model/ids';

/** One table's leaders — what a link preview or a `<title>` can carry. */
export interface LeaderLine {
  division: DivisionId;
  /** Division heading, or null for a single-division league. */
  heading: string | null;
  teams: Array<{ name: string; record: string; pts: number }>;
  /** A tie at the top. */
  tiedAtTop: boolean;
}

/**
 * One league's leaders as a single OG / metadata clause (SPEC §8.4): `De Anza: St. Ignatius 18 pts
 * · El Camino: Los Gatos 21 pts`; co-leaders at most two names joined with " & ", then ` +<n>`;
 * `No league results yet` before any result. The one builder of this row for both OG cards (the
 * root card, app/opengraph-image.tsx, and the /standings card) and the standings metadata.
 */
export function leaderClause(lines: readonly LeaderLine[]): string {
  if (lines.every((line) => line.teams.length === 0)) return 'No league results yet';
  return lines
    .map((line) => {
      const names =
        line.teams.length === 0
          ? 'no results yet'
          : `${line.teams
              .slice(0, 2)
              .map((t) => t.name)
              .join(' & ')}${line.teams.length > 2 ? ` +${line.teams.length - 2}` : ''} ${line.teams[0].pts} pts`;
      return line.heading ? `${line.heading}: ${names}` : names;
    })
    .join(' · ');
}
