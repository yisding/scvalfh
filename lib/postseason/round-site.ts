/**
 * A postseason round the Section plays at one named site is at a neutral site, whichever school a feed lists as
 * host. The San Diego Section's three finals are at La Jolla High School (the rounds of `postseason` in
 * lib/league-config/sds.ts); MaxPreps lists the Open final, Canyon Hills v Bishop's (Nov 14), at Bishop's (owner,
 * 2026-11-14: "the final for Bishop's is at La Jolla High School"). Pure.
 */

import { LEAGUES } from '../leagues';
import { getTeamBySlug } from '../teams';
import type { Game } from '../types';

/** The one site every round of the game's date is played at, per its Section's round calendar; null when none or several. */
export function roundSiteOf(game: Pick<Game, 'postseason' | 'dateKey' | 'home' | 'away'>): string | null {
  if (game.postseason?.kind !== 'section-playoffs') return null;
  for (const side of [game.home, game.away]) {
    const team = side.slug ? getTeamBySlug(side.slug) : undefined;
    const ps = team ? LEAGUES.find((l) => l.id === team.league)?.postseason : undefined;
    if (!ps || ps.kind !== 'section-playoffs') continue;
    const rounds = ps.rounds.filter((r) => r.date === game.dateKey);
    const sites = new Set(rounds.map((r) => r.site));
    const [only] = [...sites];
    return rounds.length > 0 && sites.size === 1 && only !== null ? only : null;
  }
  return null;
}

/** The game at its round's site (neutral, the site as the venue); the same object when it already is, or has none. */
export function withRoundSite(game: Game): Game {
  const site = roundSiteOf(game);
  if (site === null || (game.site === 'neutral' && game.venue.text === site && game.venue.name === undefined)) return game;
  // The feed's venue name (the listed host's field) goes: the header and the structured data print a name first.
  const { name: _listed, ...venue } = game.venue;
  void _listed;
  return { ...game, site: 'neutral', venue: { ...venue, text: site } };
}
