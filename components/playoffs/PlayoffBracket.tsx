import Link from 'next/link';

import { shortDate } from '../../lib/format';
import { gameHref } from '../../lib/game-id';
import ExternalLink from '../ui/ExternalLink';
import { rowState, statusWords } from '../game-row/summary';
import { describeGame, type SideView } from '../ui/describe-game';

import Bracket, { type BracketRoundModel, type TieLineModel, type TieModel } from './Bracket';
import {
  isNamedSide,
  isSeedSide,
  isWinnerOf,
  type BracketGame,
  type BracketPairing,
  type BracketPath,
  type BracketRound,
  type PairingSide,
} from './bracket-model';

/**
 * One published CCS bracket path (spec §5.6), drawn by the shared drawer (Bracket.tsx): round columns
 * joined by connectors from 1024px, one round at a time below that.
 *
 * Every cell carries its seeds once the owner file names them (bracket-model.ts). A cell always shows
 * where its game stands: a final its two scores, a game in progress its two scores and "Live", a game
 * to come its start time (with the weekday when it is not on the round's day); under an unplayed
 * game, where it is played (MaxPreps' location without its leading "@ ") and the `Tickets` and
 * `NFHS stream` links from the game's own urls, outside the cell's game link because an anchor cannot
 * hold another. A place no game fills yet names its seeds, or the two teams that can reach it
 * ("Willow Glen or Homestead"), or `TBD`; it has no link, since there is no game yet. The winner's
 * line is bold and the other grey; there is no winner bar and no star.
 */
export interface PlayoffBracketProps {
  path: BracketPath;
  /** @deprecated A round's heading is an h3 (the drawer's). Ignored. */
  headingLevel?: 'h3' | 'h4';
  className?: string;
}

/** 'Quarterfinal' from 'Quarterfinals'; a dated round keeps its date. */
function roundWord(round: BracketRound): string {
  return round.key === 'other' ? `${round.name} game` : round.name.replace(/s$/, '');
}

function sideLabel(side: SideView): string {
  const name = side.shortName.trim();
  return name || 'TBD';
}

/**
 * 'Palo Alto', 'Willow Glen or Homestead', 'TBD'. A place a game will fill names its two teams (2026-11-03): "Winner of
 * 4 v 5" sent the reader back up the bracket to turn numbers into schools.
 */
function pairingSideLabel(side: PairingSide): string {
  if (isSeedSide(side)) return side.name;
  if (isWinnerOf(side)) return `${side.winnerOf[0].name} or ${side.winnerOf[1].name}`;
  return 'TBD';
}

/** '8 Palo Alto', 'the winner of 5 Willow Glen v 4 Homestead', 'a team to be decided' — for the card's sentence. */
function pairingSideWords(side: PairingSide): string {
  if (isSeedSide(side)) return `${side.seed} ${side.name}`;
  if (isWinnerOf(side)) {
    const [a, b] = side.winnerOf;
    return `the winner of ${a.seed} ${a.name} v ${b.seed} ${b.name}`;
  }
  return 'a team to be decided';
}

/** MaxPreps writes a location as '@ Los Gatos HS'; the cell has already said who is home. */
function venueWords(text: string | null): string | null {
  const words = (text ?? '').replace(/^@\s*/, '').trim();
  return words.length > 0 ? words : null;
}

function gameLine(side: SideView, seed: number | null, scored: boolean, decided: boolean): TieLineModel {
  return {
    slug: side.slug,
    name: sideLabel(side),
    seed,
    score: scored ? side.glyph : undefined,
    result: !decided ? null : side.weight === 'winner' ? 'won' : side.weight === 'loser' ? 'lost' : null,
  };
}

function gameTie(entry: BracketGame, round: BracketRound): TieModel {
  const { game, seeds } = entry;
  const display = describeGame(game);
  const named = isNamedSide(game.home) || isNamedSide(game.away);
  const state = rowState(game, display);
  const scored = named && display.showScores && display.away.hasScore && display.home.hasScore;
  const unplayed = state === 'upcoming';
  const venue = unplayed ? venueWords(game.venue.text) : null;
  const links: Array<{ href: string; label: string }> = [];
  if (unplayed && game.urls.goFan) links.push({ href: game.urls.goFan, label: 'Tickets' });
  if (unplayed && game.urls.nfhsStream) links.push({ href: game.urls.nfhsStream, label: 'NFHS stream' });
  const clock = game.isTimeTba ? 'TBD' : statusWords(display);
  // A final nobody reported, a postponed game: its status in words, in the note row.
  const off = state === 'off' ? statusWords(display) : null;
  return {
    key: game.contestId,
    state: state === 'off' ? null : state,
    lines: [
      gameLine(display.away, seeds.away, scored, state === 'final'),
      gameLine(display.home, seeds.home, scored, state === 'final'),
    ],
    // The round's heading carries its day; a game moved off it says which day.
    time: game.dateLocal.slice(0, 10) === round.dateKey ? clock : `${shortDate(game.dateLocal).split(' ')[0]} ${clock}`,
    note: off ?? (display.deciderTag && state === 'final' ? display.deciderTag : venue ? `At ${venue}` : null),
    links:
      links.length > 0
        ? links.map((l) => (
            <ExternalLink key={l.href} href={l.href} className="sx-link inline-flex min-h-6 items-center">
              {l.label}
            </ExternalLink>
          ))
        : undefined,
    // `prefetch={false}`: every route here is STATIC, so Next 16's `auto` downloads the whole linked route the
    // moment the link scrolls into view, and a full bracket is fourteen game pages. Navigation still fetches on click.
    link: named ? (
      <Link href={gameHref(game.contestId)} prefetch={false} className="absolute inset-0">
        <span className="sr-only">{display.sentence}</span>
      </Link>
    ) : undefined,
    sentence: [display.sentence],
  };
}

function pairingLine(side: PairingSide): TieLineModel {
  return {
    slug: isSeedSide(side) ? side.slug : null,
    name: pairingSideLabel(side),
    seed: isSeedSide(side) ? side.seed : null,
    open: !isSeedSide(side),
  };
}

/**
 * A place no game fills yet: both seeds and names when the CCS pairing is known from the seeds, else the two
 * teams that can reach each side. No link (there is no game page) and one sentence for a screen reader.
 */
function pairingTie(card: BracketPairing, round: BracketRound): TieModel {
  return {
    key: card.id,
    state: null,
    lines: [pairingLine(card.top), pairingLine(card.bottom)],
    sentence: [`${roundWord(round)}: ${pairingSideWords(card.top)} v ${pairingSideWords(card.bottom)}. Not listed on MaxPreps yet.`],
  };
}

/** A CCS path as the shared drawer's rounds. */
export function playoffBracketRounds(path: BracketPath): BracketRoundModel[] {
  return path.rounds.map((round) => ({
    key: round.dateKey,
    name: round.name,
    dateLabel: round.key === 'other' ? null : round.dateLabel,
    ties: round.cards.map((card) => (card.kind === 'game' ? gameTie(card, round) : pairingTie(card, round))),
  }));
}

export function PlayoffBracket({ path, className }: PlayoffBracketProps) {
  if (path.rounds.length === 0) return null;
  return <Bracket rounds={playoffBracketRounds(path)} label={`${path.name} bracket`} className={className} />;
}

export default PlayoffBracket;
