/** A league's postseason pairings (SPEC §5.7), seated from the computed standings. */

import { getLeague, inPairingWindow } from '../leagues';
import type { CrossoverSeat, DivisionId, Game, LeagueId, LeaguePairing, Standing } from '../types';

/**
 * Generalized crossoverPairings(): the league's config pairings (SCVAL crossover ×4, BVAL play-in),
 * each seat filled by the team whose cluster COVERS that slot, not by an exact `place ===` match:
 * with two teams level on 3rd nobody carries place 4, and an exact match would quietly render the
 * play-in pairing as empty. Such a seat returns every contender for it, and the UI says in words
 * that the tie has not been decided. `game` is the matched contest once MaxPreps has it: a game
 * carrying the pairing's tag, dated inside the pairing's window (`PairingConfig.window`, else its
 * date), with one seat's contender on each side. A matched game SETTLES its seats: the league has
 * paired the teams, so a seat two level teams spanned narrows to the one that played (El Camino
 * co-leaders Mitty and Los Gatos: Mitty v St. Ignatius is #1 v #1, Los Gatos v Saint Francis #2 v
 * #2), and `date` becomes the day the game is actually played (two 2026 crossovers moved to Oct 29).
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
        if (g.postseason?.kind !== p.tag || !inPairingWindow(p, g.dateKey)) return false;
        const h = g.home.teamId ?? '';
        const a = g.away.teamId ?? '';
        return (ids0.has(h) && ids1.has(a)) || (ids0.has(a) && ids1.has(h));
      }) ?? null;
    // The league's own pairing settles a seat the table left level: keep the contender that played.
    const played = game ? new Set([game.home.teamId ?? '', game.away.teamId ?? '']) : null;
    const settled = (seat: CrossoverSeat): CrossoverSeat => {
      if (!played || seat.length < 2) return seat;
      const hit = seat.filter((s) => played.has(s.teamId));
      return hit.length === 1 ? hit : seat;
    };
    return {
      id: p.id,
      leagueId,
      date: game ? game.dateKey : p.date,
      time: p.time,
      seats: [settled(seats[0]), settled(seats[1])],
      seatLabels: [p.seatLabels[0], p.seatLabels[1]],
      host: p.host,
      isPlayIn: p.isPlayIn,
      label: p.label,
      game,
    };
  });
}
