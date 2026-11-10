/**
 * Where one postseason game stands in its bracket, in words, for its game page (2026-11-03): the round it is ('CCS
 * Division 2 quarterfinal', 'Division II first round'), what comes of it ('The winner plays Willow Glen or Homestead
 * in the semifinal, Wed Nov 11.'; once it is decided, 'Leigh plays …'), and the link to its card
 * (bracket-link.ts). The CCS bracket (components/playoffs/bracket-model.ts) and the San Diego Section's
 * (lib/postseason/sds-bracket.ts) are read; every other postseason game gets its link alone.
 *
 * Copy: no seed word (SEED_CLAIM; the San Diego places print as nothing at all here, the CCS ones as a bare "8 v 1"),
 * never "eliminat", and a CCS word only on a CCS game. Reads lib/data, like bracket-link.ts.
 */

import { getCcsSeeds } from '../../lib/postseason/ccs-bracket';
import { getPlayoffs } from '../../lib/data';
import { shortDate } from '../../lib/format';
import { winnerOf } from '../../lib/postseason/game-winner';
import { getSdsBrackets, type LiveBracketSlot } from '../../lib/postseason/sds-bracket';
import { getTeamBySlug } from '../../lib/teams';
import type { Game, TeamSlug } from '../../lib/types';

import { getBracketLink, type BracketLink } from './bracket-link';
import { buildBrackets, isSeedSide, isWinnerOf, type BracketRound, type PairingSide } from './bracket-model';

export interface BracketPlace {
  /** 'CCS Division 2 quarterfinal · 8 v 1', 'Division II first round'; null when the game's round is not known. */
  round: string | null;
  /** 'The winner plays Willow Glen or Homestead in the semifinal, Wed Nov 11.'; null when there is nothing to say. */
  next: string | null;
  link: BracketLink;
}

const nameOf = (slug: TeamSlug | null): string | null => (slug ? (getTeamBySlug(slug)?.name ?? null) : null);

/** 'quarterfinal' from 'Quarterfinals', 'first round' from 'First round', 'final' from 'Final'. */
function singular(roundName: string): string {
  return roundName.replace(/s$/, '').toLowerCase();
}

/** 'Leigh plays X in the semifinal, Wed Nov 11.' or 'The winner plays …' before a result. */
function nextSentence(winner: TeamSlug | null, opponent: string | null, roundWord: string, date: string): string {
  const who = winner ? (nameOf(winner) ?? 'The winner') : 'The winner';
  return opponent
    ? `${who} plays ${opponent} in the ${roundWord}, ${date}.`
    : `${who} goes on to the ${roundWord}, ${date}.`;
}

// ---------------------------------------------------------------- CCS


/** The words for the side of a later CCS card that is not this game's: 'Leigh', 'Willow Glen or Homestead'. */
function ccsSideWords(side: PairingSide): string | null {
  if (isSeedSide(side)) return side.name;
  if (isWinnerOf(side)) return `${side.winnerOf[0].name} or ${side.winnerOf[1].name}`;
  return null;
}

function ccsPlace(game: Game, link: BracketLink): BracketPlace | null {
  for (const path of buildBrackets(getPlayoffs(), getCcsSeeds())) {
    const r = path.rounds.findIndex((round) => round.cards.some((c) => c.kind === 'game' && c.game.contestId === game.contestId));
    if (r < 0) continue;
    const round = path.rounds[r];
    const card = round.cards.find((c) => c.kind === 'game' && c.game.contestId === game.contestId);
    const seeds = card?.kind === 'game' && card.seeds.away !== null && card.seeds.home !== null ? ` · ${card.seeds.away} v ${card.seeds.home}` : '';
    const label = round.key === 'other' ? path.name : `${path.name} ${singular(round.name)}${seeds}`;
    // Score first, then a lone W (lib/postseason/game-winner.ts winnerOf), so the words agree with the side the bracket advances.
    const winner = winnerOf(game);
    const later: BracketRound | undefined = path.rounds[r + 1];
    if (!later) {
      // Only the final names a division winner: without the seed file a bracket has only the rounds MaxPreps lists,
      // so a quarterfinal can be the last round drawn for a day or two.
      const final = round.key === 'finals';
      return { round: label, next: final && winner ? `${nameOf(winner)} won ${path.name}.` : null, link };
    }
    // A decided game's winner alone goes on; before a result, either side may.
    const teams = new Set((winner ? [winner] : [game.home.slug, game.away.slug]).filter((s): s is TeamSlug => s !== null));
    let opponent: string | null = null;
    for (const c of later.cards) {
      if (c.kind === 'game') {
        const sides = [c.game.home.slug, c.game.away.slug];
        const mine = sides.findIndex((s) => s !== null && teams.has(s));
        if (mine >= 0) opponent = nameOf(sides[1 - mine]);
        if (mine >= 0) break;
        continue;
      }
      const holds = (side: PairingSide) =>
        (isSeedSide(side) && side.slug !== null && teams.has(side.slug)) ||
        (isWinnerOf(side) && side.winnerOf.some((s) => s.slug !== null && teams.has(s.slug)));
      if (holds(c.top)) { opponent = ccsSideWords(c.bottom); break; }
      if (holds(c.bottom)) { opponent = ccsSideWords(c.top); break; }
    }
    return { round: label, next: nextSentence(winner, opponent, singular(later.name), later.dateLabel), link };
  }
  return null;
}

// ---------------------------------------------------------------- San Diego Section

/** 'Mt. Carmel', 'the winner of Poway v Canyon Crest', 'the winner of 1 v 8/9'; null for an unknown place. */
function sdsSideWords(slot: LiveBracketSlot): string | null {
  if (!('tbd' in slot)) return nameOf(slot.slug);
  if (slot.text === 'TBD') return null;
  if (!/^Winner\b/.test(slot.text)) return `the winner of ${slot.text.replace(' or ', ' v ')}`;
  return `the ${slot.text.charAt(0).toLowerCase()}${slot.text.slice(1)}`;
}

function sdsPlace(game: Game, link: BracketLink): BracketPlace | null {
  for (const division of getSdsBrackets() ?? []) {
    const cards = division.rounds.flatMap((round) => round.cards.map((card) => ({ round, card })));
    const at = cards.find(({ card }) => card.game?.contestId === game.contestId);
    if (!at) continue;
    const label = `${division.label} ${singular(at.round.name)}`;
    const winner = winnerOf(game);
    if (!at.card.next) {
      return { round: label, next: winner ? `${nameOf(winner)} won the ${division.label} final.` : null, link };
    }
    const target = cards.find(({ card }) => card.id === at.card.next?.id);
    if (!target) return { round: label, next: null, link };
    const other = at.card.next.side === 'top' ? target.card.bottom : target.card.top;
    // A later round's game already listed gives the day; else the round's own date.
    return {
      round: label,
      next: nextSentence(winner, sdsSideWords(other), singular(target.round.name), shortDate(target.card.dateKey)),
      link,
    };
  }
  return null;
}

/** The game's place in its bracket, or null for a game that is no postseason game. */
export function getBracketPlace(game: Game): BracketPlace | null {
  const link = getBracketLink(game);
  if (!link) return null;
  const kind = game.postseason?.kind;
  const place = kind === 'ccs' ? ccsPlace(game, link) : kind === 'section-playoffs' ? sdsPlace(game, link) : null;
  return place ?? { round: null, next: null, link };
}
