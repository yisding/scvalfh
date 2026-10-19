/**
 * How a postseason contest reads on /game/[id]: its context label ('MCAL semifinal', 'SCVAL
 * crossover', 'CCS'), its "Counts as" line and its notes, from the postseason tag and the league
 * config (the MCAL bracket round when `getLeagueTournament` matched the contest).
 */

import { SHOOTOUT_NOTE } from '@/lib/engine/postseason';
import type { Game } from '@/lib/model/game';
import type { LeagueConfig } from '@/lib/model/league-config';
import type { TournamentGame } from '@/lib/model/postseason';
import { getLeagueTournament } from '@/lib/queries/postseason';
import { postseasonTagOf } from '@/views/shared/describe-game';

import type { CountsAs } from './types';

const ROUND_WORD: Readonly<Record<TournamentGame['round'], string>> = {
  'play-in': 'play-in',
  quarterfinal: 'quarterfinal',
  semifinal: 'semifinal',
  final: 'final',
};

/** The MCAL bracket slot this contest filled, when `getLeagueTournament` matched it. */
function tournamentSlot(game: Game, league: LeagueConfig): TournamentGame | null {
  if (league.postseason.kind !== 'league-tournament') return null;
  const t = getLeagueTournament(league.id);
  const all = [...(t.playIn ? [t.playIn] : []), ...t.games];
  return all.find((tg) => tg.game?.contestId === game.contestId) ?? null;
}

/** A one-goal final: a tournament shootout may be hiding in it (SPEC §6.2). */
function isOneGoalFinal(game: Game): boolean {
  return (
    game.status === 'final' &&
    game.home.score !== null &&
    game.away.score !== null &&
    Math.abs(game.home.score - game.away.score) === 1
  );
}

interface PostseasonView {
  contextLabel: string;
  countsAs: CountsAs;
  notes: string[];
}

export function postseasonView(game: Game, league: LeagueConfig | null): PostseasonView | null {
  const tag = game.postseason;
  if (!tag) return null;
  if (tag.kind === 'mcal-tournament' && league && league.postseason.kind === 'league-tournament') {
    const slot = tournamentSlot(game, league);
    const label = slot ? `${league.shortName} ${ROUND_WORD[slot.round]}` : league.postseason.name;
    const sentence = `${league.postseason.name} game — it does not count in the league table.`;
    const notes = [sentence];
    const shootout = slot?.note ?? (isOneGoalFinal(game) ? SHOOTOUT_NOTE : null);
    if (shootout) notes.push(shootout);
    return {
      contextLabel: label,
      countsAs: { label, detail: sentence, classificationNote: null },
      notes,
    };
  }
  if (tag.kind === 'league-postseason' && league && league.postseason.kind === 'unbracketed-tournament') {
    // The EAL Super Regional: a counted-nowhere game with no bracket slot to name.
    const sentence = `${league.postseason.name} game — it does not count in the league table.`;
    const label = `${league.shortName} ${league.postseason.name}`;
    return {
      contextLabel: label,
      countsAs: { label, detail: sentence, classificationNote: null },
      notes: [sentence],
    };
  }
  if ((tag.kind === 'scval-crossover' || tag.kind === 'bval-play-in') && league) {
    const label = `${league.shortName} ${tag.kind === 'scval-crossover' ? 'crossover' : 'play-in'}`;
    const sentence = `${league.shortName} postseason game — it does not count in the league table.`;
    return {
      contextLabel: label,
      countsAs: { label, detail: sentence, classificationNote: null },
      notes: [sentence],
    };
  }
  if (tag.kind === 'section-playoffs') {
    // The San Diego Section's playoffs (Green Book 2026-27 Bylaw 2000.1): one tournament across the City,
    // North County and Metro conferences, so one label whether or not the two sides share a conference
    // (lib/engine/classify.ts tags it; its leagueId is null across conferences, so the name comes from the sides).
    const name = postseasonTagOf(game);
    if (name) {
      const sentence = `${name} game — it does not count in the league table.`;
      return {
        contextLabel: name,
        countsAs: { label: name, detail: sentence, classificationNote: null },
        notes: [sentence],
      };
    }
  }
  if (tag.kind === 'ccs') {
    const sentence = 'CCS playoff game — it does not count in any league table.';
    return {
      contextLabel: 'CCS',
      countsAs: { label: 'CCS playoff game', detail: sentence, classificationNote: null },
      notes: [sentence],
    };
  }
  const sentence = 'Postseason game — it does not count in any league table.';
  return {
    contextLabel: 'Postseason',
    countsAs: { label: 'Postseason game', detail: sentence, classificationNote: null },
    notes: [sentence],
  };
}
