/**
 * A CCS league's crossover or play-in game, named for what it is (2026-10-31, postseason consistency pass).
 *
 * lib/classify.ts tags every SCVAL crossover-day game 'scval-crossover', the 4th-place play-in included: the tag
 * says which league's postseason a game is, not which of its games. The pairings say which (lib/data.ts
 * getLeaguePairings: config seats resolved against today's tables, matched to the game MaxPreps lists), so this
 * module is the one place a chip, a game page or a home card learns that the Fri Oct 30 Santa Clara at Los Altos
 * game is the SCVAL play-in, not a crossover. Server-only (it reads the snapshot through lib/data).
 *
 * `/playoffs`' "This week" strip has its own, longer words for the same games (components/playoffs/
 * this-week-inputs.ts postseasonLabels: 'SCVAL play-in for the 7th CCS berth', 'SCVAL crossover · #2 v #2'); this
 * module gives the short form every other surface prints.
 */

import { getLeaguePairings } from './data';
import { CCS_LEAGUE_IDS, getLeague } from './leagues';
import type { ContestId, Game, LeagueId } from './types';

export interface PairingRound {
  leagueId: LeagueId;
  /** 'SCVAL play-in' | 'SCVAL crossover' | 'BVAL play-in' */
  label: string;
  isPlayIn: boolean;
}

let byContest: Map<ContestId, PairingRound> | null = null;

function index(): Map<ContestId, PairingRound> {
  if (byContest) return byContest;
  const map = new Map<ContestId, PairingRound>();
  for (const leagueId of CCS_LEAGUE_IDS) {
    const short = getLeague(leagueId).shortName;
    for (const p of getLeaguePairings(leagueId)) {
      if (!p.game) continue;
      map.set(p.game.contestId, {
        leagueId,
        label: `${short} ${p.isPlayIn ? 'play-in' : 'crossover'}`,
        isPlayIn: p.isPlayIn,
      });
    }
  }
  byContest = map;
  return map;
}

/** The crossover or play-in a game is, from the league's pairings; null for any other game. */
export function pairingRoundOf(game: Pick<Game, 'contestId' | 'postseason'>): PairingRound | null {
  const kind = game.postseason?.kind;
  if (kind !== 'scval-crossover' && kind !== 'bval-play-in') return null;
  return index().get(game.contestId) ?? null;
}
