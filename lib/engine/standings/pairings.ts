/**
 * The league's crossover and play-in pairings (SPEC §5.7) of the standings engine
 * (lib/engine/standings.ts), seated from the computed table.
 */

import { getLeague } from '@/lib/config/leagues';
import type { Game } from '@/lib/model/game';
import type { DivisionId, LeagueId } from '@/lib/model/ids';
import type { CrossoverSeat, LeaguePairing } from '@/lib/model/postseason';
import type { Standing } from '@/lib/model/standings';

/**
 * Generalized crossoverPairings(): the league's config pairings (SCVAL crossover ×4, BVAL play-in),
 * each seat filled by the team whose cluster COVERS that slot, not by an exact `place ===` match:
 * with two teams level on 3rd nobody carries place 4, and an exact match would quietly render the
 * play-in pairing as empty. Such a seat returns every contender for it, and the UI says in words
 * that the tie has not been decided. `game` is the matched contest once MaxPreps has it.
 */
export function leaguePairings(
  standings: readonly Standing[],
  games: readonly Game[],
  leagueId: LeagueId,
): LeaguePairing[] {
  const league = getLeague(leagueId);
  if (league.postseason.kind !== 'ccs-ladder') return [];
  const at = (division: DivisionId, seed: number): CrossoverSeat =>
    standings
      .filter(
        (row) =>
          row.division === division &&
          row.hasReportedResults &&
          row.computed.place <= seed &&
          seed < row.computed.place + row.tiebreak.tiedWith.length + 1,
      )
      .map((row) => ({ teamId: row.teamId, slug: row.slug }));
  return league.postseason.pairings.map((p) => {
    const seats: [CrossoverSeat, CrossoverSeat] = [
      at(p.seats[0].division, p.seats[0].place),
      at(p.seats[1].division, p.seats[1].place),
    ];
    const ids0 = new Set(seats[0].map((s) => s.teamId));
    const ids1 = new Set(seats[1].map((s) => s.teamId));
    const game =
      games.find((g) => {
        if (g.postseason?.kind !== p.tag || g.dateKey !== p.date) return false;
        const h = g.home.teamId ?? '';
        const a = g.away.teamId ?? '';
        return (ids0.has(h) && ids1.has(a)) || (ids0.has(a) && ids1.has(h));
      }) ?? null;
    return {
      id: p.id,
      leagueId,
      date: p.date,
      time: p.time,
      seats,
      seatLabels: [p.seatLabels[0], p.seatLabels[1]],
      host: p.host,
      isPlayIn: p.isPlayIn,
      label: p.label,
      game,
    };
  });
}
