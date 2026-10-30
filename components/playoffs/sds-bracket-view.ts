import { EN_DASH, leagueClockPT, monthDay, renderScore, shortDate } from '../../lib/format';
import { gameHref } from '../../lib/game-id';
import type { LiveBracketCard, LiveBracketDivision, LiveBracketRound, LiveBracketSlot } from '../../lib/sds-bracket';
import { getTeamBySlug } from '../../lib/teams';
import {
  isTbdSide,
  type BracketCardView,
  type BracketDivisionView,
  type BracketRoundView,
  type BracketSideView,
} from '../history/bracket-view';

/**
 * The San Diego Section's published brackets as the shared bracket model (plan final-08, 2026-10-30): lib/sds-bracket.ts
 * LiveBracketDivision → components/history/bracket-view.ts BracketDivisionView, drawn on /playoffs#sds-bracket by
 * components/playoffs/SdsBracket.tsx with the archive's drawer (HistoryBracket.tsx BracketView). Pure, so
 * tests/ui/sds-bracket.test.ts reads every word it prints.
 *
 * The words, all of them SEED_CLAIM-clean (scripts/copy-rules.ts; the ban covers every San Diego surface, and the
 * Section's places print as bare numerals in parentheses, never with the word "seed"), with no "eliminat" and no
 * champion named (DESIGN §24.5):
 *   - a decided card: "Bishop's (1) beat Mission Bay (8) 4–1.", "… 2–1 in overtime.", "Canyon Crest Academy (8)
 *     and Torrey Pines (1) drew 1–1; Canyon Crest Academy won the shootout." (MaxPreps keeps the level score and
 *     marks the shootout's winner W, lib/types.ts Decider 'SO'; it stores no tally), and "Bonita Vista (5) beat
 *     Westview (12); no score was posted." when only a later game shows who came through;
 *   - a card still to come: "Torrey Pines (1) plays Canyon Crest Academy (8), Thu Nov 5." (with the time and the
 *     neutral site when the Section or MaxPreps names them); a place still open reads "the winner of 8 v 9";
 *   - a card whose day has passed with no result: "… and … were to play Thu Nov 5; no result is posted yet."
 * Scores in sentences take an en dash, winner first; the drawn lines carry each side's own goals. "Today" is the
 * caller's getToday() (the snapshot's Pacific day), never Date.now().
 */

export interface SdsBracketDivisionView extends BracketDivisionView {
  id: LiveBracketDivision['id'];
  /** 'Open Division', 'Division I', 'Division II' (the file's labels, the Section's own). */
  label: string;
  /** The field: 8 or 12 teams. */
  size: 8 | 12;
}

function sideView(slot: LiveBracketSlot): BracketSideView {
  if ('tbd' in slot) return { tbd: slot.text };
  return { seed: slot.seed, slug: slot.slug, name: getTeamBySlug(slot.slug)?.name ?? slot.slug };
}

/** "Torrey Pines (1)", "the winner of 8 v 9", "a team to be decided": a side inside a sentence. */
function sideWords(side: BracketSideView): string {
  if (!isTbdSide(side)) return `${side.name} (${side.seed})`;
  if (side.tbd === 'TBD') return 'a team to be decided';
  return `the ${side.tbd.charAt(0).toLowerCase()}${side.tbd.slice(1)}`;
}

const capitalized = (words: string): string => `${words.charAt(0).toUpperCase()}${words.slice(1)}`;

/**
 * Goals, top then bottom, oriented to the card from the joined game; null before a final score. Read through
 * lib/format.ts renderScore, the one place the never-0-0 rule lives (a 0-0 prints only on a real final).
 */
function cardScore(card: LiveBracketCard, top: BracketSideView): readonly [number, number] | null {
  if (!card.game) return null;
  const view = renderScore(card.game);
  if (view.kind !== 'final') return null;
  const topSlug = isTbdSide(top) ? null : top.slug;
  return topSlug === card.game.home.slug ? [view.home, view.away] : [view.away, view.home];
}

function cardStatus(card: LiveBracketCard, today: string): BracketCardView['status'] {
  if (card.winner !== null || card.game?.status === 'final') return 'final';
  if (card.game?.status === 'score-pending' || card.dateKey < today) return 'unreported';
  return 'scheduled';
}

/** "Thu Nov 5 · 4 PM PT", "Thu Nov 5 · time TBA", as the CCS bracket's unplayed cards print their day. */
function whenLine(card: LiveBracketCard): string {
  return `${shortDate(card.dateKey)} · ${card.time ? leagueClockPT(card.time) : 'time TBA'}`;
}

/** The decided card's sentence, winner first. */
function resultSentence(card: LiveBracketCard, top: BracketSideView, bottom: BracketSideView, score: readonly [number, number] | null): string {
  const sides = { top, bottom };
  if (card.winner === null) {
    // A level final MaxPreps has not marked W and L: the score is true, the shootout's winner is not posted.
    const s = score ? ` ${score[0]}${EN_DASH}${score[1]}` : '';
    return `${capitalized(sideWords(top))} and ${sideWords(bottom)} drew${s}; the shootout winner is not posted.`;
  }
  const loserSide = card.winner === 'top' ? 'bottom' : 'top';
  const w = sides[card.winner];
  const l = sides[loserSide];
  const W = capitalized(sideWords(w));
  if (score === null) return `${W} beat ${sideWords(l)}; no score was posted.`;
  const [wg, lg] = card.winner === 'top' ? score : [score[1], score[0]];
  const s = `${wg}${EN_DASH}${lg}`;
  const decider = card.game?.decider ?? null;
  if (decider === 'SO') return `${W} and ${sideWords(l)} drew ${s}; ${isTbdSide(w) ? W : w.name} won the shootout.`;
  if (decider === 'OT') return `${W} beat ${sideWords(l)} ${s} in overtime.`;
  if (decider === '2OT') return `${W} beat ${sideWords(l)} ${s} in double overtime.`;
  return `${W} beat ${sideWords(l)} ${s}.`;
}

function cardView(card: LiveBracketCard, round: LiveBracketRound, today: string): BracketCardView {
  const top = sideView(card.top);
  const bottom = sideView(card.bottom);
  const score = cardScore(card, top);
  const status = cardStatus(card, today);
  const a = capitalized(sideWords(top));
  const b = sideWords(bottom);
  let sentence: string;
  const notes: string[] = [];
  if (status === 'final') {
    const decider = card.game?.decider ?? null;
    if (decider === 'OT') notes.push('Overtime');
    if (decider === '2OT') notes.push('Double overtime');
    if (decider === 'SO') notes.push('Shootout');
    if (score === null) notes.push('No score posted');
    const tail: string[] = [];
    if (card.dateKey !== round.date) tail.push(`Played ${monthDay(card.dateKey)}`);
    if (card.site) tail.push(`At ${card.site}`);
    notes.push(...tail);
    sentence = `${resultSentence(card, top, bottom, score)}${tail.map((t) => ` ${t}.`).join('')}`;
  } else if (status === 'unreported') {
    notes.push(shortDate(card.dateKey), 'No result posted yet');
    sentence = `${a} and ${b} were to play ${shortDate(card.dateKey)}; no result is posted yet.`;
  } else {
    notes.push(whenLine(card));
    if (card.site) notes.push(`At ${card.site}`);
    const time = card.time ? `, ${leagueClockPT(card.time)}` : '';
    const site = card.site ? `, at ${card.site}` : '';
    sentence = `${a} plays ${b}, ${shortDate(card.dateKey)}${time}${site}.`;
  }
  return {
    key: card.id,
    top,
    bottom,
    winner: card.winner,
    score,
    status,
    time: status === 'scheduled' ? whenLine(card) : null,
    site: card.site,
    href: card.game ? gameHref(card.game.contestId) : null,
    sentence: [sentence],
    note: notes.length > 0 ? notes.join(' · ') : null,
  };
}

/**
 * The teams that skip a round, as the archive's bracket lists them ("Byes: Mt. Carmel (1), …"): those placed in
 * the next round who are on none of this round's cards. A play-in round has none (the other teams were never in it).
 */
function byesOf(division: LiveBracketDivision, roundIndex: number): string | null {
  const round = division.rounds[roundIndex];
  const next = division.rounds[roundIndex + 1];
  if (!next || round.playIn) return null;
  const here = new Set(round.cards.flatMap((c) => [c.top, c.bottom]).flatMap((s) => ('slug' in s ? [s.slug] : [])));
  const skipped = next.cards
    .flatMap((c) => [c.top, c.bottom])
    .flatMap((s) => ('slug' in s && !here.has(s.slug) ? [s] : []))
    .sort((x, y) => x.seed - y.seed);
  if (skipped.length === 0) return null;
  return skipped.map((s) => `${getTeamBySlug(s.slug)?.name ?? s.slug} (${s.seed})`).join(', ');
}

/** One division of the Section's bracket as the shared model; `today` is getToday(). */
export function sdsBracketView(division: LiveBracketDivision, today: string): SdsBracketDivisionView {
  const rounds: BracketRoundView[] = division.rounds.map((round, roundIndex) => ({
    key: `${division.id}-${roundIndex}`,
    name: round.name,
    dateLabel: monthDay(round.date),
    cards: round.cards.map((card) => cardView(card, round, today)),
    byes: byesOf(division, roundIndex),
  }));
  return { id: division.id, label: division.label, size: division.size, rounds };
}

/**
 * The sentence above the brackets, the source's day in it (the sheet's link follows it on the page). The year is
 * the season's (lib/season.ts SEASON_CALENDAR_YEAR), as the Section titles its sheet.
 */
export function sdsBracketIntro(year: string, retrievedOn: string): string {
  return `The Section’s published brackets, from its ${year} Championship Brackets sheet (retrieved ${shortDate(retrievedOn)}); results as MaxPreps posts them.`;
}
