import { getTeamBySlug } from '../../lib/data';
import type { HistoryBracketDivision } from '../../lib/history/history';
import Bracket, { type BracketRoundModel, type TieLineModel, type TieModel } from '../playoffs/Bracket';
import MissingValue from '../ui/MissingValue';

import {
  historyBracketView,
  isTbdSide,
  type BracketCardView,
  type BracketDivisionView,
  type BracketSideView,
} from './bracket-view';

/**
 * One division of a 2025 section bracket on /history/2025-26, and (through `BracketView`) one division
 * of the San Diego Section's live bracket on /playoffs (components/playoffs/SdsBracket.tsx). Both are a
 * `BracketDivisionView` (components/history/bracket-view.ts) drawn by the site's one bracket drawer
 * (components/playoffs/Bracket.tsx): round columns joined by connectors from 1024px, one round at a
 * time below that; the winner's line bold, the other grey.
 *
 * The archive has no game pages: every card is final, and a registry team's name is a pointer-only
 * link to its team page. The live bracket adds three things: a side still to be decided ("Poway or
 * University City", in grey, no number), a card still to play (its start time in the score position,
 * its site under the lines), and a joined card, which is one link to its game page. A decided card
 * with no posted score prints the missing-score dash. Under the bracket, one line names the teams
 * that skipped a round ("Byes: …").
 */
export interface HistoryBracketProps {
  division: HistoryBracketDivision;
  /** Names the bracket for a screen reader: "CCS Division 1 bracket, 2025". */
  label: string;
}

export interface BracketViewProps {
  division: BracketDivisionView;
  /** Names the bracket for a screen reader: "CCS Division 1 bracket, 2025". */
  label: string;
  /**
   * Gives each card an id, this prefix plus its key (`sds-division-2-0-1`): the San Diego bracket's cards are the
   * targets of its games' links (components/playoffs/bracket-link.ts). The archive passes none.
   */
  anchorPrefix?: string;
}

function line(side: BracketSideView, goals: number | null, card: BracketCardView, which: 'top' | 'bottom'): TieLineModel {
  // A place still to be decided: no number and no school, its words in grey, never a blank box.
  const result = card.winner === null ? null : card.winner === which ? 'won' : 'lost';
  if (isTbdSide(side)) return { name: side.tbd, open: true, result };
  const team = getTeamBySlug(side.slug);
  const final = card.status === 'final';
  return {
    slug: team?.slug ?? null,
    // The registry's short name, as the live bracket draws it; the sentence keeps the full name.
    name: team?.shortName ?? side.name,
    seed: side.seed,
    score: !final ? undefined : goals === null ? <MissingValue words="score not posted" /> : goals,
    result,
  };
}

function tie(card: BracketCardView, anchorPrefix: string | undefined): TieModel {
  const scheduled = card.status === 'scheduled';
  // A scheduled card's note opens with its day and time, which the heading and the score position carry.
  const note = scheduled ? (card.site ? `At ${card.site}` : null) : card.note;
  return {
    key: card.key,
    id: anchorPrefix ? `${anchorPrefix}${card.key}` : undefined,
    state: card.status === 'final' ? 'final' : scheduled ? 'upcoming' : null,
    lines: [line(card.top, card.score?.[0] ?? null, card, 'top'), line(card.bottom, card.score?.[1] ?? null, card, 'bottom')],
    time: scheduled ? (card.clock ?? 'TBD') : null,
    // The view joins a note's parts with a middle dot; the cell lists them.
    note: note ? note.split(' · ').join(', ') : null,
    href: card.href,
    sentence: card.sentence,
  };
}

/**
 * A division as the shared drawer's rounds. A fifth round that is a play-in (the San Diego Section's
 * Division II: one game two days before the first round) is drawn at the head of the first round's column,
 * its own round and day in its note: five columns leave a name about 60px at 1024px ("Granit…"), four leave
 * it room.
 */
export function bracketRounds(division: BracketDivisionView, anchorPrefix?: string): BracketRoundModel[] {
  const rounds: BracketRoundModel[] = division.rounds.map((round) => ({
    key: round.key,
    name: round.name,
    dateLabel: round.dateLabel,
    ties: round.cards.map((card) => tie(card, anchorPrefix)),
    byes: round.byes,
    extra: round.extra?.map((e) => ({ key: e.name, name: e.name, ties: e.cards.map((card) => tie(card, anchorPrefix)) })),
  }));
  const [first, second, ...rest] = rounds;
  if (rounds.length < 5 || !/^play-in$/i.test(first.name)) return rounds;
  const playIn = first.ties.map((t) => ({
    ...t,
    note: [`${first.name}, ${first.dateLabel}`, t.note].filter(Boolean).join(', '),
  }));
  return [{ ...second, ties: [...playIn, ...second.ties], byes: [first.byes, second.byes].filter(Boolean).join('; ') || null }, ...rest];
}

export function BracketView({ division, label, anchorPrefix }: BracketViewProps) {
  return <Bracket rounds={bracketRounds(division, anchorPrefix)} label={label} />;
}

/** A 2025 archive division (/history/2025-26), through the shared model. */
export function HistoryBracket({ division, label }: HistoryBracketProps) {
  return <BracketView division={historyBracketView(division)} label={label} />;
}

export default HistoryBracket;
