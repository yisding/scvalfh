/**
 * The per-kind facts every view re-derived from a league's postseason kind: where its postseason lives on
 * /playoffs, and which config citation states its qualification rule. Pure and config-only (no snapshot), so
 * the standings, home and team views share one answer; each view keeps its own headings and link words.
 */

import type { LeagueConfig } from '../league-config/shape';

/**
 * A league tournament has a bracket page of its own (`/playoffs/<league>`); every other kind (the CCS ladder,
 * an unbracketed tournament, the section's playoffs, no postseason at all) is a card on /playoffs (`#<league>`).
 */
export function postseasonHref(league: LeagueConfig): string {
  return league.postseason.kind === 'league-tournament' ? `/playoffs/${league.id}` : `/playoffs#${league.id}`;
}

/** A CCS-ladder league's pairing cards on /playoffs (`#<league>-pairings`), where the team pages' postseason link lands. */
export function pairingsHref(leagueId: string): string {
  return `/playoffs#${leagueId}-pairings`;
}

/** The league's qualification rule, cited once in the standings legend (by postseason kind). */
export function postseasonCitation(league: LeagueConfig): string {
  const ps = league.postseason;
  switch (ps.kind) {
    case 'ccs-ladder':
      return ps.citation;
    case 'league-tournament':
      return ps.citations.format;
    case 'unbracketed-tournament':
      return ps.citations.qualification;
    case 'no-postseason':
      return ps.citations.noPlayoffs;
    case 'section-playoffs':
      return ps.citations.qualification;
  }
}

/**
 * Where a league tournament's final is played, as the words after a date: ' at Redwood' for a fixed site (MCAL), or
 * ' (site to be set)' where the league has published none (the VAL's "TBD Field").
 */
export function atFinalSite(ps: Extract<LeagueConfig['postseason'], { kind: 'league-tournament' }>): string {
  return ps.finalSite === null ? ' (site to be set)' : ` at ${ps.finalSite.label}`;
}
