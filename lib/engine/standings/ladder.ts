/**
 * The playoff ladder of the standings engine (SPEC §5.7; lib/engine/standings.ts): the status a place
 * takes, every status a level place could still take, and the config lookups behind the label, legend and
 * badge a page prints. The words themselves are lib/format/standings.ts.
 */

import { ladderFor, ladderRung, leagueOfDivision } from '@/lib/config/leagues';
import { badgeWords, legendWords, outcomeLabelWords } from '@/lib/format/standings';
import type { DivisionId } from '@/lib/model/ids';
import type { LadderRung, LeagueConfig } from '@/lib/model/league-config';
import type { PlayoffStatus, Standing } from '@/lib/model/standings';

/** The rung of `ladderFor(division)` whose places cover `place`. */
export function playoffStatusFor(division: DivisionId, place: number): PlayoffStatus {
  return ladderRung(division, place).status;
}

/**
 * Every status a team could still take, best first.
 *
 * Places use standard competition ranking, so `place` is the team's 1-based finishing SLOT and a
 * cluster left level by an uncomputable step spans as many slots as it has teams. Two SCVAL teams
 * level on 3rd therefore hold the third automatic berth AND the 4th-place play-in spot between
 * them: reading `place` alone would label both of them "AQ" and make the play-in slot — and the
 * Oct 30 pairing built from it — disappear from the division. Neither slot is ever dropped here;
 * the tied teams carry both possibilities until the league decides.
 */
export function playoffOutcomes(division: DivisionId, place: number, clusterSize = 1): PlayoffStatus[] {
  const size = Math.max(1, clusterSize);
  const out: PlayoffStatus[] = [];
  for (let slot = place; slot < place + size; slot += 1) {
    const status = playoffStatusFor(division, slot);
    if (!out.includes(status)) out.push(status);
  }
  return out;
}

/** `playoffOutcomes` for a ranked row: the cluster size is the tied group it belongs to. */
export function outcomesFor(row: Standing): PlayoffStatus[] {
  return playoffOutcomes(row.division, row.computed.place, row.tiebreak.tiedWith.length + 1);
}

/** The division's rung for a status (falling back to the league's ladder); throws when none exists. */
function rungFor(division: DivisionId, status: PlayoffStatus): LadderRung {
  const rung =
    ladderFor(division).find((r) => r.status === status) ??
    leagueOfDivision(division).postseason.ladder.find((r) => r.status === status);
  if (!rung) throw new Error(`lib/engine/standings/ladder.ts: no ladder rung ${status} for ${division}`);
  return rung;
}

/**
 * 'Automatic qualifier', or '<label> or <phrase> <unresolvedSuffix>' when a level place straddles
 * rungs (SCVAL: 'Automatic qualifier or the Oct 30 play-in — Article VI §7 decides it with a coin flip').
 */
export function playoffOutcomeLabel(division: DivisionId, outcomes: readonly PlayoffStatus[]): string {
  const [first, ...rest] = outcomes;
  if (first === undefined) {
    const ladder = ladderFor(division);
    return ladder[ladder.length - 1].label;
  }
  return outcomeLabelWords(
    rungFor(division, first),
    rest.map((status) => rungFor(division, status)),
    leagueOfDivision(division).rules.unresolvedSuffix,
  );
}

/** The first pairing date of the league (the `{date}` in ladder legends), if it has pairings. */
function firstPairingDate(league: LeagueConfig): string | null {
  return league.postseason.kind === 'ccs-ladder' ? (league.postseason.pairings[0]?.date ?? null) : null;
}

/** The rung's legend with '{date}' replaced by shortDate(first pairing date of the league). */
export function statusLegend(division: DivisionId, status: PlayoffStatus): string {
  return legendWords(rungFor(division, status).legend, firstPairingDate(leagueOfDivision(division)));
}

export function statusBadge(division: DivisionId, status: PlayoffStatus): string {
  return badgeWords(rungFor(division, status));
}
