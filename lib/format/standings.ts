/**
 * The standings engine's copy (lib/engine/standings.ts): the uneven-games sentence and the ladder's
 * outcome label, legend and badge, as pure sentence builders over values the engine has already looked
 * up in the league config (lib/engine/standings/uneven.ts and ladder.ts do the lookups and call these).
 * Client-safe: it imports only types and lib/format/dates.ts.
 */

import type { LadderRung, LeagueRules } from '@/lib/model/league-config';

import { shortDate } from './dates';

/**
 * The games-played sentence of the uneven-GP footnote (SPEC §10.3) for a spread of two games or more.
 * `league` null is a fixed schedule (`spread.scheduled` = DivisionConfig.gamesPerTeam): the sentence the
 * standings page has always printed. Otherwise the league has no fixed schedule, and the sentence says
 * what the gap is in, by the league's classification rule (DESIGN-socal §2.1.7).
 */
export function unevenGamesWords(
  spread: { min: number; max: number; scheduled: number | null },
  league: { shortName: string; classification: LeagueRules['classification'] } | null,
): string {
  if (league === null) {
    return `Teams have played between ${spread.min} and ${spread.max} of ${spread.scheduled} league games, so points favour teams that have played more.`;
  }
  // 'membership' with no fixed schedule (the Sunset, the LA independents): every game between two members counts,
  // so the gap is in games played against each other; 'contest-type' with none (no league today): MaxPreps' flag.
  return league.classification === 'membership'
    ? `Teams have played between ${spread.min} and ${spread.max} games against other ${league.shortName} teams, and there is no fixed league schedule, so points favour teams that have played more.`
    : `Teams have played between ${spread.min} and ${spread.max} of the games MaxPreps marks as ${league.shortName} league games, and there is no fixed league schedule, so points favour teams that have played more.`;
}

/**
 * The first rung's label, or '<label> or <phrase> <unresolvedSuffix>' when a level place straddles rungs
 * (the phrases of `restRungs` joined with ' or '; no suffix when the league's is empty).
 */
export function outcomeLabelWords(
  firstRung: LadderRung,
  restRungs: readonly LadderRung[],
  unresolvedSuffix: string,
): string {
  const label = firstRung.label;
  if (restRungs.length === 0) return label;
  const tail = restRungs.map((rung) => rung.phrase).join(' or ');
  return unresolvedSuffix ? `${label} or ${tail} ${unresolvedSuffix}` : `${label} or ${tail}`;
}

/** A rung's legend with '{date}' replaced by shortDate(firstPairingDate); the legend as written without one. */
export function legendWords(legend: string, firstPairingDate: string | null): string {
  return firstPairingDate ? legend.replace('{date}', shortDate(firstPairingDate)) : legend;
}

/** A rung's badge (the short status mark a table row carries). */
export function badgeWords(rung: LadderRung): string {
  return rung.badge;
}
