/**
 * The playoff ladder (SPEC §5.7): a place's status, the outcomes a level place straddles, and the
 * ladder's labels, legends and badges. Copy only: it reads config, never the standings engine.
 */

import { dayDiff, shortDate } from '../format';
import type { LadderRung, LeagueConfig, PairingConfig } from '../league-config/shape';
import { ladderFor, ladderRung, leagueOfDivision, pairingWindow } from '../leagues';
import type { DivisionId, PlayoffStatus, Standing } from '../types';

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
  if (!rung) throw new Error(`lib/standings/ladder.ts: no ladder rung ${status} for ${division}`);
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
  const label = rungFor(division, first).label;
  if (rest.length === 0) return label;
  const tail = rest.map((status) => rungFor(division, status).phrase).join(' or ');
  const suffix = leagueOfDivision(division).rules.unresolvedSuffix;
  return suffix ? `${label} or ${tail} ${suffix}` : `${label} or ${tail}`;
}

/** The first pairing date of the league (the `{date}` in ladder legends), if it has pairings. */
function firstPairingDate(league: LeagueConfig): string | null {
  return league.postseason.kind === 'ccs-ladder' ? (league.postseason.pairings[0]?.date ?? null) : null;
}

/**
 * The day, or days, a league's pairings are played, for a sentence ("The SCVAL crossover and the 4th-place
 * play-in are …"): 'Fri Oct 30' when every pairing's window is that one day; 'Thu Oct 29 and Fri Oct 30'
 * across two consecutive days; 'Thu Oct 29 to Sat Oct 31' across more. '' for a league with no pairings.
 */
export function pairingDatesLabel(pairings: readonly PairingConfig[]): string {
  if (pairings.length === 0) return '';
  const windows = pairings.map(pairingWindow);
  const first = [...windows.map((w) => w.first)].sort()[0];
  const last = [...windows.map((w) => w.last)].sort().reverse()[0];
  if (first === last) return shortDate(first);
  return dayDiff(first, last) === 1 ? `${shortDate(first)} and ${shortDate(last)}` : `${shortDate(first)} to ${shortDate(last)}`;
}

/** The rung's legend with '{date}' replaced by shortDate(first pairing date of the league). */
export function statusLegend(division: DivisionId, status: PlayoffStatus): string {
  const legend = rungFor(division, status).legend;
  const date = firstPairingDate(leagueOfDivision(division));
  return date ? legend.replace('{date}', shortDate(date)) : legend;
}

export function statusBadge(division: DivisionId, status: PlayoffStatus): string {
  return rungFor(division, status).badge;
}
