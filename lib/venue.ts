/**
 * Where a game is, as a street address: the one answer the game page's WHERE line, every Directions link
 * (the game page, an expanded game row, a team's and the home page's Next card) and the game's JSON-LD
 * `location` share, so no two of them can disagree.
 *
 * MaxPreps gives a game no address in the sweep (`venue.address` is a lazy game-page fetch; 0 of 945 games
 * carry one on 2026-11-03), but the registry knows where every school is (data/schools.json). In order:
 *
 * 1. `game`: the game's own address, when a source gave one.
 * 2. `final-site`: a league tournament's final at its fixed site (the MCAL final at Tamalpais), the site
 *    school's address: the league says where the final is, whoever MaxPreps lists as home.
 * 3. `venue-school`: a named venue that is a registry school ("Archbishop Mitty High School", from a
 *    school's calendar), that school's address. A named venue that is not a registry school has no
 *    address here: the host's would be the wrong place.
 * 4. `host-school`: otherwise the home team's school, when it is a registry team. Not on a neutral site
 *    (nobody hosts), and not when the sources disagree about the host (`provenance.hostConflict`): the
 *    page prints that disagreement, and a Directions link to one of the two schools would settle it.
 *
 * 2-4 are a school's campus, not necessarily the field (a school can play off campus): a page that prints
 * one says whose address it is. Server-only: step 2 reads the tournament through lib/data.
 */

import { getLeagueTournament } from './data';
import { getLeague } from './leagues';
import { schoolAddress } from './schools';
import { getTeamBySlug, resolveTeam, teamOfSide } from './teams';
import type { Game, StreetAddress, Team } from './types';

export interface GameAddress {
  address: StreetAddress;
  source: 'game' | 'final-site' | 'venue-school' | 'host-school';
  /** The school whose campus `address` is; null for the game's own address. */
  school: Team | null;
}

/** The league's fixed final site, when `game` is that final (config `finalSite.slug`). */
function fixedFinalSite(game: Game): Team | null {
  if (game.postseason?.kind !== 'mcal-tournament' || !game.postseason.leagueId) return null;
  const league = getLeague(game.postseason.leagueId);
  if (league.postseason.kind !== 'league-tournament') return null;
  const final = getLeagueTournament(league.id).games.find((tg) => tg.round === 'final');
  if (final?.game?.contestId !== game.contestId) return null;
  return getTeamBySlug(league.postseason.finalSite.slug) ?? null;
}

export function gameAddress(game: Game): GameAddress | null {
  if (game.venue.address) return { address: game.venue.address, source: 'game', school: null };
  const site = fixedFinalSite(game);
  if (site) return { address: schoolAddress(site.slug), source: 'final-site', school: site };
  if (game.venue.name) {
    const venue = resolveTeam(game.venue.name);
    return venue ? { address: schoolAddress(venue.slug), source: 'venue-school', school: venue } : null;
  }
  if (game.site === 'neutral' || game.provenance.hostConflict) return null;
  const host = teamOfSide(game.home);
  return host ? { address: schoolAddress(host.slug), source: 'host-school', school: host } : null;
}

/** The one-line form the pages print: "575 W. Fremont Avenue, Sunnyvale, CA 94087". */
export function addressLine(a: StreetAddress): string {
  return `${a.street}, ${a.city}, ${a.region} ${a.postalCode}`;
}
