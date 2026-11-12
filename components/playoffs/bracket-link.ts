/**
 * Where a postseason game sits on /playoffs (2026-11-03): one link per game to its card in the bracket that holds
 * it, so a reader on a game row, a game page, the "This week" strip or a team page can see where things stand.
 * Every surface asks `getBracketLink(game)`; nothing else knows the anchors.
 *
 * The anchors, each drawn once on /playoffs (a card drawn twice, once per breakpoint, cannot be a fragment
 * target: the hidden twin never scrolls, so the CCS links land on the division):
 *   - a CCS game: its division's path, `#ccs-division-1` (app/playoffs/page.tsx; `#bracket-1` while a path's
 *     division is unproven), 'CCS bracket';
 *   - a San Diego Section game: its card, `#sds-<division>-<round>-<card>` (components/history/HistoryBracket.tsx
 *     BracketView `idPrefix`), 'Section bracket';
 *   - a league tournament's game (MCAL): its slot, `#mcal-qf-1` (components/playoffs/LeagueTournament.tsx), 'MCAL
 *     bracket';
 *   - a CCS league's crossover or play-in: its pairing card, `#scval-crossover-1`, `#bval-play-in`
 *     (components/playoffs/LeaguePairings.tsx), 'SCVAL crossovers' / 'BVAL play-in';
 *   - an unbracketed league's game (the EAL's Super Regional): its day, `#eal-results-2026-10-31`, 'Super Regional
 *     results' (the Section publishes no bracket, so the word is never used for it);
 *   - the outside tournament's game (the Tournament of Champions): its day, `#toc-2026-10-29`, 'Tournament of
 *     Champions games' (no bracket is published for it either).
 * A game the index does not hold yet (a bracket card MaxPreps has not joined) falls back to the bracket's section.
 * No label carries a seed word (SEED_CLAIM) or a CCS word on a non-CCS game (assert-copy forbidCcs): only a 'ccs'
 * game's link says CCS.
 *
 * Reads lib/data once and memoizes the index for the build, like the other *-inputs modules; it imports nothing from
 * components/ui or components/game, so GameRow and the game page may call it without a cycle.
 */

import { getCcsSeeds } from '../../lib/postseason/ccs-bracket';
import { getLeaguePairings, getLeagueTournament, getPlayoffs, getTournamentLeagueIds } from '../../lib/data';
import { CCS_LEAGUE_IDS, getLeague, getSection } from '../../lib/leagues';
import { getSdsBrackets } from '../../lib/postseason/sds-bracket';
import { getTeamBySlug } from '../../lib/teams';
import type { ContestId, Game } from '../../lib/types';

import { buildBrackets } from './bracket-model';

export interface BracketLink {
  /** '/playoffs#ccs-division-2' */
  href: string;
  /** 'CCS bracket', 'Section bracket', 'MCAL bracket', 'SCVAL crossovers', 'Super Regional results'. */
  label: string;
  /** A CCS game's division path, 'CCS Division 2' (or 'Bracket 1' while unproven); absent for any other game. */
  division?: string;
  /** The game's round as its bracket heads it, 'Semifinals', 'Final'; absent when the bracket names none. */
  round?: string;
  /** A CCS game's seeds from the bracket (the owner file); absent for any other game. */
  seeds?: { away: number | null; home: number | null };
}

let index: Map<ContestId, BracketLink> | null = null;

function buildIndex(): Map<ContestId, BracketLink> {
  const out = new Map<ContestId, BracketLink>();
  for (const path of buildBrackets(getPlayoffs(), getCcsSeeds())) {
    for (const round of path.rounds) {
      for (const card of round.cards) {
        if (card.kind === 'game') {
          out.set(card.game.contestId, {
            href: `/playoffs#${path.id}`,
            label: 'CCS bracket',
            division: path.name,
            round: round.key === 'other' ? undefined : round.name,
            seeds: card.seeds,
          });
        }
      }
    }
  }
  for (const division of getSdsBrackets() ?? []) {
    for (const round of division.rounds) {
      for (const card of round.cards) {
        if (card.game) out.set(card.game.contestId, { href: `/playoffs#sds-${card.id}`, label: 'Section bracket', round: round.name });
      }
    }
  }
  for (const id of getTournamentLeagueIds()) {
    const t = getLeagueTournament(id);
    const short = getLeague(id).shortName;
    for (const tg of [...(t.playIn ? [t.playIn] : []), ...t.games]) {
      if (tg.game) out.set(tg.game.contestId, { href: `/playoffs#${id}-${tg.id}`, label: `${short} bracket` });
    }
  }
  for (const id of CCS_LEAGUE_IDS) {
    const short = getLeague(id).shortName;
    for (const p of getLeaguePairings(id)) {
      if (p.game) out.set(p.game.contestId, { href: `/playoffs#${p.id}`, label: p.isPlayIn ? `${short} play-in` : `${short} crossovers` });
    }
  }
  return out;
}

/** The section's outside tournament a game belongs to, from its registry sides (describe-game.ts does the same). */
function outsideEvent(game: Pick<Game, 'home' | 'away'>) {
  for (const side of [game.home, game.away]) {
    const team = side.slug ? getTeamBySlug(side.slug) : undefined;
    const event = team ? getSection(team.section).outsideTournament : null;
    if (event) return event;
  }
  return null;
}

/**
 * The game's place on /playoffs, or null for a game that is no postseason game (or an 'other' tag, which names no
 * event the site draws).
 */
export function getBracketLink(game: Pick<Game, 'contestId' | 'postseason' | 'dateKey' | 'home' | 'away'>): BracketLink | null {
  const tag = game.postseason;
  if (!tag || tag.kind === 'other') return null;
  index ??= buildIndex();
  const known = index.get(game.contestId);
  if (known) return known;
  switch (tag.kind) {
    case 'ccs':
      return { href: '/playoffs#bracket', label: 'CCS bracket' };
    case 'section-playoffs':
      return getSdsBrackets() ? { href: '/playoffs#sds-bracket', label: 'Section bracket' } : { href: '/playoffs#sds-playoffs', label: 'Section playoffs' };
    case 'mcal-tournament':
      return tag.leagueId ? { href: `/playoffs#${tag.leagueId}-bracket`, label: `${getLeague(tag.leagueId).shortName} bracket` } : null;
    case 'scval-crossover':
    case 'bval-play-in':
      return tag.leagueId ? { href: `/playoffs#${tag.leagueId}-pairings`, label: `${getLeague(tag.leagueId).shortName} pairings` } : null;
    case 'league-postseason': {
      if (!tag.leagueId) return null;
      const ps = getLeague(tag.leagueId).postseason;
      if (ps.kind !== 'unbracketed-tournament') return null;
      return { href: `/playoffs#${tag.leagueId}-results-${game.dateKey}`, label: `${ps.name} results` };
    }
    case 'outside-tournament': {
      const event = outsideEvent(game);
      return event ? { href: `/playoffs#${event.id}-${game.dateKey}`, label: `${event.name} games` } : null;
    }
  }
  return null;
}
