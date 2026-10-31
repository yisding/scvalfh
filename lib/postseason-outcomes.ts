/**
 * What a CCS league's own postseason games did to a team (plan final-10, 2026-10-30): the SCVAL 4th-place
 * play-in and crossover (Fri Oct 30; two crossovers moved to Thu Oct 29) and the BVAL play-in (Sat Oct 31).
 *
 * Read only from a pairing's MATCHED game (lib/standings.ts leaguePairings: the pairing's tag, inside its window,
 * one seat contender on each side) once that game is final. Until then there is no outcome and every surface keeps
 * the ladder's projected words. The winner is the higher score, else the side MaxPreps marks 'W' (the convention
 * lib/postseason.ts winnerOf and lib/sds-bracket.ts winnerOf follow); a level final with no flag decides nothing,
 * so it is no outcome either.
 *
 * Copy (DESIGN §15.8: never "eliminat…"; CCS words are fine here, these are CCS-ladder surfaces only):
 * - a play-in winner: label 'Won the play-in'; SCVAL 'Won the 4th-place play-in: an automatic CCS qualifier.',
 *   BVAL 'Won the play-in: BVAL’s fourth automatic CCS berth.';
 * - a play-in loser: label 'Lost the play-in'; SCVAL 'Lost the play-in; SCVAL submits the loser for at-large
 *   consideration.' (By-Laws Article VII §2: the play-in loser and both fifth-place teams go to CCS for at-large
 *   consideration), BVAL 'Lost the play-in; no automatic berth remains, and at-large berths are the CCS
 *   committee’s call.' (the BVAL By-Laws submit no one);
 * - a crossover (#1–#3, for CCS seeding, not qualification): no label of its own (the ladder's 'Automatic
 *   qualifier' stands), and a sentence the team line appends: 'Archbishop Mitty beat St. Ignatius 2–0 in the #1 v #1
 *   crossover on Thu Oct 29; CCS uses it when it seeds.'
 *
 * Which wording a league gets is read from its config, never from its id: a play-in between two seats of the SAME
 * place (SCVAL #4 v #4) is the "<n>th-place play-in"; one between different places (BVAL Mt. Hamilton #4 at the
 * Santa Teresa champion) is for the league's `autoBerths`-th berth; a league whose ladder has an 'at-large' rung
 * (SCVAL) submits the loser, one without it (BVAL) does not. The CCS rounds' outcomes (won a quarterfinal…) are P2.
 */

import { EN_DASH, ordinal, ordinalWord, shortDate } from './format';
import { getLeague, type LeagueConfig, type PairingConfig } from './leagues';
import { getTeamBySlug } from './teams';
import type { Game, LeaguePairing, TeamSlug } from './types';

export interface CcsOutcome {
  /** 'play-in': the team's final play-in; 'crossover': a final crossover game (SCVAL #1–#3). */
  kind: 'play-in' | 'crossover';
  result: 'won' | 'lost';
  /** 'Won the play-in' / 'Lost the play-in'; null for a crossover, where the ladder's own label stands. */
  label: string | null;
  /** One whole sentence, closing stop included. */
  sentence: string;
  pairingId: string;
  game: Game;
}

type CcsLadder = Extract<LeagueConfig['postseason'], { kind: 'ccs-ladder' }>;

/**
 * The winning side of a final: the higher score, else the side flagged 'W' alone; null when nothing decides it.
 * Exported for the play-in card's winner line (components/playoffs/PlayInCard.tsx), so card and team line agree.
 */
export function winningSide(game: Game): 'home' | 'away' | null {
  if (game.status !== 'final') return null;
  const h = game.home.score;
  const a = game.away.score;
  if (h === null || a === null) return null;
  if (h > a) return 'home';
  if (a > h) return 'away';
  if (game.home.result === 'W' && game.away.result !== 'W') return 'home';
  if (game.away.result === 'W' && game.home.result !== 'W') return 'away';
  return null;
}

const nameOf = (slug: TeamSlug | null): string => (slug ? (getTeamBySlug(slug)?.name ?? slug) : 'TBD');

/** '2–0', '1–0 in overtime', '1–1 in a shootout': the winner's score first. */
function scoreWords(game: Game, side: 'home' | 'away'): string {
  const w = side === 'home' ? game.home.score : game.away.score;
  const l = side === 'home' ? game.away.score : game.home.score;
  const how =
    game.decider === 'OT' || game.decider === '2OT' ? ' in overtime' : game.decider === 'SO' ? ' in a shootout' : '';
  return `${w}${EN_DASH}${l}${how}`;
}

function ladderOf(pairing: LeaguePairing): { league: LeagueConfig; ps: CcsLadder; config: PairingConfig } | null {
  const league = getLeague(pairing.leagueId);
  if (league.postseason.kind !== 'ccs-ladder') return null;
  const config = league.postseason.pairings.find((p) => p.id === pairing.id);
  return config ? { league, ps: league.postseason, config } : null;
}

function playInWords(
  league: LeagueConfig,
  ps: CcsLadder,
  config: PairingConfig,
  won: boolean,
): { label: string; sentence: string } {
  const [a, b] = config.seats;
  if (won) {
    return {
      label: 'Won the play-in',
      sentence:
        a.place === b.place
          ? `Won the ${ordinal(a.place)}-place play-in: an automatic CCS qualifier.`
          : `Won the play-in: ${league.shortName}’s ${ordinalWord(ps.autoBerths)} automatic CCS berth.`,
    };
  }
  const submitsLoser = ps.ladder.some((r) => r.status === 'at-large');
  return {
    label: 'Lost the play-in',
    sentence: submitsLoser
      ? `Lost the play-in; ${league.shortName} submits the loser for at-large consideration.`
      : 'Lost the play-in; no automatic berth remains, and at-large berths are the CCS committee’s call.',
  };
}

/**
 * The team's outcome from its league's matched, final postseason pairings (lib/data getLeaguePairings), or null:
 * no pairing of its league names it, its game is not final yet, or a level final carries no W flag. A play-in
 * outcome wins over a crossover one (a team plays only one of them).
 */
export function ccsOutcomeFor(slug: TeamSlug, { pairings }: { pairings: readonly LeaguePairing[] }): CcsOutcome | null {
  let crossover: CcsOutcome | null = null;
  for (const pairing of pairings) {
    const game = pairing.game;
    if (!game || (game.home.slug !== slug && game.away.slug !== slug)) continue;
    const side = winningSide(game);
    if (!side) continue;
    const found = ladderOf(pairing);
    if (!found) continue;
    const mine = game.home.slug === slug ? 'home' : 'away';
    const won = side === mine;
    if (pairing.isPlayIn) {
      return { kind: 'play-in', result: won ? 'won' : 'lost', ...playInWords(found.league, found.ps, found.config, won), pairingId: pairing.id, game };
    }
    const winner = side === 'home' ? game.home.slug : game.away.slug;
    const loser = side === 'home' ? game.away.slug : game.home.slug;
    const [a, b] = found.config.seats;
    crossover = {
      kind: 'crossover',
      result: won ? 'won' : 'lost',
      label: null,
      sentence:
        `${nameOf(winner)} beat ${nameOf(loser)} ${scoreWords(game, side)} in the #${a.place} v #${b.place} crossover ` +
        `on ${shortDate(game.dateKey)}; CCS uses it when it seeds.`,
      pairingId: pairing.id,
      game,
    };
  }
  return crossover;
}

/**
 * The play-in card's 'Winner: <team> — <purpose>' purpose, from the pairing's config label or the card's purpose
 * sentence derived from it (components/playoffs/LeaguePairings.tsx purposeOf): 'De Anza #4 vs El Camino #4 —
 * play-in for the SCVAL 7th automatic qualifier' or 'For the SCVAL 7th automatic qualifier.' → 'SCVAL’s 7th
 * automatic qualifier'; '… — play-in for BVAL’s 4th automatic CCS berth' → 'BVAL’s 4th automatic CCS berth'.
 * Null for anything that is not a play-in for an automatic berth (a crossover's 'For CCS seeding, not
 * qualification.', the MCAL play-in's rule), so the card prints no winner line there.
 */
export function playInWinnerPurpose(text: string): string | null {
  const tail = text.includes(' — ') ? text.slice(text.indexOf(' — ') + 3) : text;
  const m = /^(?:play-in )?for (?:the )?(.*\bautomatic\b.*?)\.?$/i.exec(tail.trim());
  if (!m) return null;
  // 'SCVAL 7th automatic qualifier' → 'SCVAL’s 7th …'; a label already possessive ('BVAL’s 4th') is kept.
  return m[1].replace(/^([A-Z]{2,})(?!’s)\s/, '$1’s ');
}
