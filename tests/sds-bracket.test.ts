/**
 * lib/sds-bracket.ts — the San Diego Section's brackets from its published sheet, joined to MaxPreps'
 * results (plan final-07, 2026-10-29). Run against last season: the 2025 brackets in this season's file
 * shape and the 26 San Diego playoff rows MaxPreps posted (tests/fixtures/sds/brackets-2025.ts). Every joined
 * card's winner must be the one the Section's sheet records (data/history-brackets-2025-26.json).
 */

import { describe, expect, it } from 'vitest';

import { getHistoryBrackets } from '../lib/history';
import {
  buildSdsBrackets,
  getSdsBrackets,
  getSdsBracketsSource,
  winnerOf,
  type LiveBracketCard,
  type LiveBracketDivision,
  type LiveBracketSlot,
} from '../lib/sds-bracket';
import { SEED_CLAIM } from '../scripts/copy-rules';
import { sdsGames2025, sdsPlayIn2025, seedsFromHistory } from './fixtures/sds/brackets-2025';
import { game } from './game-builder';

const file = seedsFromHistory('sds');
const games = sdsGames2025();
const built = buildSdsBrackets(file, games);

const cards = (divs: LiveBracketDivision[]) => divs.flatMap((d) => d.rounds.flatMap((r) => r.cards));
const slugOf = (s: LiveBracketSlot) => ('slug' in s ? s.slug : null);
const division = (divs: LiveBracketDivision[], id: string) => divs.find((d) => d.id === id)!;
const pairKey = (a: string, b: string) => [a, b].sort().join(' v ');

/** The Section's 2025 winner of each pairing, from the history file. */
const historyWinner = new Map<string, string>(
  getHistoryBrackets()
    .find((b) => b.id === 'sds')!
    .bracket.divisions.flatMap((d) => d.rounds.flatMap((r) => r.games))
    .map((g) => [pairKey(g.top.slug, g.bottom.slug), g[g.winner].slug]),
);
const cardPair = (c: LiveBracketCard) => {
  const a = slugOf(c.top);
  const b = slugOf(c.bottom);
  return a && b ? pairKey(a, b) : null;
};
const cardWinner = (c: LiveBracketCard) => (c.winner ? slugOf(c[c.winner]) : null);
/** Every string a card carries that a page could print. */
const cardTexts = (divs: LiveBracketDivision[]) =>
  [
    ...divs.flatMap((d) => [d.label, ...d.rounds.map((r) => r.name)]),
    ...cards(divs).flatMap((c) => [c.top, c.bottom].flatMap((s) => ('text' in s ? [s.text] : []))),
  ];

const sds = (spec: Parameters<typeof game>[0]) =>
  game({
    league: false,
    contestTypes: { home: 4, away: 4 },
    official: null,
    postseason: { kind: 'section-playoffs', leagueId: null, via: 'section-postseason-window' },
    ...spec,
  });

describe('winnerOf', () => {
  it('reads the higher score, else the side marked W on a level score, else nothing', () => {
    expect(winnerOf(sds({ home: 'fallbrook', away: 'valley-center', hs: 5, as: 2, date: '2025-11-04' }))).toBe('fallbrook');
    expect(winnerOf(sds({ home: 'poway', away: 'university-city', hs: 0, as: 1, date: '2025-11-04' }))).toBe('university-city');
    const so = sds({ home: 'la-costa-canyon', away: 'mt-carmel', hs: 2, as: 2, date: '2025-11-15', results: { home: 'L', away: 'W' } });
    expect(so.decider).toBe('SO');
    expect(winnerOf(so)).toBe('mt-carmel');
    expect(winnerOf(sds({ home: 'la-costa-canyon', away: 'mt-carmel', hs: 2, as: 2, date: '2025-11-15' }))).toBeNull();
    expect(winnerOf(sds({ home: 'la-costa-canyon', away: 'mt-carmel', date: '2025-11-15' }))).toBeNull();
  });
});

describe('the 2025 brackets joined to the 26 MaxPreps rows', () => {
  it('has the 26 San Diego playoff rows', () => {
    expect(games).toHaveLength(26);
    expect(games.every((g) => g.postseason?.kind === 'section-playoffs')).toBe(true);
  });

  it('draws the template: 7, 11 and 12 cards, Division II with its play-in round first', () => {
    expect(built.map((d) => [d.id, d.rounds.map((r) => r.cards.length)])).toEqual([
      ['open', [4, 2, 1]],
      ['division-1', [4, 4, 2, 1]],
      ['division-2', [1, 4, 4, 2, 1]],
    ]);
    expect(division(built, 'division-2').rounds[0]).toMatchObject({ name: 'Play-in', date: '2025-11-03', playIn: true });
  });

  it('joins every card MaxPreps has a row for, 26 of 30, each with the Section’s winner', () => {
    const joined = cards(built).filter((c) => c.game !== null);
    expect(joined).toHaveLength(26);
    expect(new Set(joined.map((c) => c.game!.contestId))).toEqual(new Set(games.map((g) => g.contestId)));
    for (const c of joined) {
      const pair = cardPair(c)!;
      expect(pairKey(c.game!.home.slug!, c.game!.away.slug!)).toBe(pair);
      expect(cardWinner(c), pair).toBe(historyWinner.get(pair));
    }
  });

  it('leaves the four cards with no row unscored, naming who came through only where a later game shows it', () => {
    const open = cards(built).filter((c) => c.game === null);
    expect(open.map((c) => c.id)).toEqual(['division-2-0-0', 'division-2-1-0', 'division-2-1-2', 'division-2-2-2']);
    const [playIn, bvWestview, rbvPlayIn, olympianRbv] = open;
    // No later game says who won the play-in: both teams stand, nobody is marked through.
    expect([slugOf(playIn.top), slugOf(playIn.bottom), playIn.winner]).toEqual(['helix', 'granite-hills', null]);
    // Del Norte v Bonita Vista (Nov 8) shows Bonita Vista came through; Eastlake v Rancho Buena Vista (Nov 12)
    // shows Rancho Buena Vista came through both of its earlier cards.
    expect(cardWinner(bvWestview)).toBe('bonita-vista');
    expect(cardWinner(rbvPlayIn)).toBe('rancho-buena-vista');
    expect(rbvPlayIn.bottom).toEqual({ tbd: true, text: 'Winner of the play-in' });
    expect(cardWinner(olympianRbv)).toBe('rancho-buena-vista');
    for (const c of [bvWestview, olympianRbv]) expect(cardWinner(c)).toBe(historyWinner.get(cardPair(c)!));
  });

  it('gives Division I places 1-4 no first-round card and puts them in the quarterfinals', () => {
    const d1 = division(built, 'division-1');
    const firstRound = d1.rounds[0].cards.flatMap((c) => [c.top, c.bottom]).map((s) => ('seed' in s ? s.seed : null));
    expect(firstRound).toEqual([8, 9, 5, 12, 6, 11, 7, 10]);
    expect(d1.rounds[1].cards.map((c) => ('seed' in c.top ? c.top.seed : null))).toEqual([1, 4, 3, 2]);
    expect(d1.rounds[1].cards.map((c) => slugOf(c.top))).toEqual(['mt-carmel', 'cathedral-catholic', 'san-dieguito-academy', 'rancho-bernardo']);
    // The first-round winners filled the other places: 9 University City, 5 Fallbrook, 6 La Costa Canyon, 7 Clairemont.
    expect(d1.rounds[1].cards.map((c) => c.bottom)).toEqual([
      { seed: 9, slug: 'university-city' },
      { seed: 5, slug: 'fallbrook' },
      { seed: 6, slug: 'la-costa-canyon' },
      { seed: 7, slug: 'clairemont' },
    ]);
  });

  it('joins a game the Section moved a day early (Clairemont v Rancho Bernardo, Thu Nov 6)', () => {
    const c = division(built, 'division-1').rounds[1].cards[3];
    expect(c.game?.contestId).toBe('babdc9ec-2d98-4da4-b878-eec96cc94e6b');
    expect(c.dateKey).toBe('2025-11-06');
  });

  it('carries the file’s final site and the shootout winner of a level final', () => {
    const final = division(built, 'division-1').rounds[3].cards[0];
    expect(final.site).toBe('La Jolla HS');
    expect(final.game?.decider).toBe('SO');
    expect(cardWinner(final)).toBe('mt-carmel');
  });

  it('puts the Division II play-in winner in the 11th place once the play-in is posted', () => {
    const withPlayIn = buildSdsBrackets(file, [...games, sdsPlayIn2025()]);
    const d2 = division(withPlayIn, 'division-2');
    expect(d2.rounds[0].cards[0].winner).toBe('top');
    expect(d2.rounds[1].cards[2].top).toEqual({ seed: 6, slug: 'rancho-buena-vista' });
    expect(d2.rounds[1].cards[2].bottom).toEqual({ seed: 11, slug: 'helix' });
    expect(cards(withPlayIn).filter((c) => c.game !== null)).toHaveLength(27);
  });
});

describe('before any game is posted', () => {
  const empty = buildSdsBrackets(file, []);

  it('draws every first card as a pairing and every later place as the card that fills it', () => {
    expect(cards(empty).every((c) => c.game === null && c.winner === null)).toBe(true);
    const open = division(empty, 'open');
    expect(open.rounds[0].cards.map((c) => [slugOf(c.top), slugOf(c.bottom)].every(Boolean))).toEqual([true, true, true, true]);
    expect(open.rounds[1].cards.map((c) => [c.top, c.bottom])).toEqual([
      [{ tbd: true, text: 'Winner of 1 v 8' }, { tbd: true, text: 'Winner of 4 v 5' }],
      [{ tbd: true, text: 'Winner of 3 v 6' }, { tbd: true, text: 'Winner of 2 v 7' }],
    ]);
    expect([open.rounds[2].cards[0].top, open.rounds[2].cards[0].bottom]).toEqual([
      { tbd: true, text: 'Winner of 1/8 v 4/5' },
      { tbd: true, text: 'Winner of 3/6 v 2/7' },
    ]);

    const d2 = division(empty, 'division-2');
    expect(d2.rounds[1].cards[2].bottom).toEqual({ tbd: true, text: 'Winner of the play-in' });
    expect(d2.rounds[2].cards.map((c) => c.bottom)).toEqual([
      { tbd: true, text: 'Winner of 8 v 9' },
      { tbd: true, text: 'Winner of 5 v 12' },
      { tbd: true, text: 'Winner of 6 v 11' },
      { tbd: true, text: 'Winner of 7 v 10' },
    ]);
    expect([d2.rounds[3].cards[0].top, d2.rounds[3].cards[0].bottom]).toEqual([
      { tbd: true, text: 'Winner of 1 v 8/9' },
      { tbd: true, text: 'Winner of 4 v 5/12' },
    ]);
    expect([d2.rounds[4].cards[0].top, d2.rounds[4].cards[0].bottom]).toEqual([
      { tbd: true, text: 'Winner of the top half' },
      { tbd: true, text: 'Winner of the bottom half' },
    ]);
  });

  it('dates each card from the file, with the finals’ site', () => {
    const d1 = division(empty, 'division-1');
    expect(d1.rounds.map((r) => r.cards[0].dateKey)).toEqual(['2025-11-04', '2025-11-07', '2025-11-11', '2025-11-15']);
    expect(d1.rounds[3].cards[0]).toMatchObject({ site: 'La Jolla HS', time: null });
  });

  it('writes no seed word and no "eliminat" anywhere', () => {
    for (const divs of [empty, built]) {
      for (const text of cardTexts(divs)) {
        expect(text).not.toMatch(SEED_CLAIM);
        expect(text).not.toMatch(/\bseed|eliminat/i);
      }
    }
  });
});

describe('what never joins', () => {
  it('a date-TBA row, an untagged row, or a row outside its round’s window', () => {
    const base = { home: 'fallbrook', away: 'valley-center', hs: 5, as: 2 };
    const tba = { ...sds({ ...base, date: '2025-11-04' }), isDateTba: true };
    const untagged = sds({ ...base, date: '2025-11-04', postseason: null });
    const early = sds({ ...base, date: '2025-11-02' });
    const late = sds({ ...base, date: '2025-11-07' });
    for (const g of [tba, untagged, early, late]) {
      const card = division(buildSdsBrackets(file, [g]), 'division-1').rounds[0].cards[1];
      expect(card.game).toBeNull();
    }
    const dayEarly = sds({ ...base, date: '2025-11-03' });
    expect(division(buildSdsBrackets(file, [dayEarly]), 'division-1').rounds[0].cards[1].game).not.toBeNull();
  });

  it('a scheduled game joins with no winner, and its time comes from MaxPreps', () => {
    const g = sds({ home: 'fallbrook', away: 'valley-center', date: '2025-11-04' });
    const card = division(buildSdsBrackets(file, [g]), 'division-1').rounds[0].cards[1];
    expect(card.game?.contestId).toBe(g.contestId);
    expect(card.winner).toBeNull();
    expect(card.time).toBe('16:00');
    // Its winner's place in the next round is still open.
    expect(division(buildSdsBrackets(file, [g]), 'division-1').rounds[1].cards[1].bottom).toEqual({ tbd: true, text: 'Winner of 5 v 12' });
  });
});

describe('the committed placeholder', () => {
  it('draws no San Diego bracket today', () => {
    expect(getSdsBrackets()).toBeNull();
    expect(getSdsBracketsSource()).toBeNull();
  });
});
