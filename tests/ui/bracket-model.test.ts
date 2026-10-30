/**
 * `components/playoffs/bracket-model.ts` — the CCS bracket from `playoffs.games` (which carries MaxPreps'
 * bracket name since 2026-10-29) and the seeds of the owner file (lib/ccs-bracket.ts getCcsSeeds).
 *
 * Two corpora. The first is the real one: the 2025 CCS championship's fourteen rows rebuilt on 2026's dates
 * with 2025's sixteen seeds (tests/fixtures/ccs/bracket-2025.ts) — the first bracket this model has ever been
 * run against (plan final-06, 2026-10-30). The second is synthetic: games with no bracket name and no seed,
 * which pin today's unproven behaviour (connected components, one 'CCS bracket' path). Nothing here reads the
 * bundled snapshot, so live fetches cannot break it.
 */

import { describe, expect, it } from 'vitest';

import {
  buildBrackets,
  ccsDivisionLabels,
  isNamedSide,
  isSeedSide,
  isWinnerOf,
  pendingRounds,
  roundKeyFor,
  type BracketCard,
  type BracketPath,
} from '../../components/playoffs/bracket-model';
import { CCS } from '../../lib/leagues';
import { resolveTeam } from '../../lib/teams';
import type { CcsPlayoffs, Game } from '../../lib/types';
import { ccsGames2025, ccsSeeds2025, unplayed } from '../fixtures/ccs/bracket-2025';
import { game } from '../game-builder';

const MODEL = 'components/playoffs/bracket-model.ts';

const playoffs: CcsPlayoffs = {
  keyDates: { ...CCS.keyDates },
  format: {
    elimination: 'single',
    ccsDivisions: CCS.ccsDivisions.map((d) => ({ name: d.name, seeds: [d.seeds[0], d.seeds[1]] })),
    autoQualifiers: { ...CCS.autoQualifiers },
    highSeedHostsThrough: 'quarterfinals',
  },
  bracketPublished: false,
  bracketUrl: CCS.bracketUrl,
  games: [],
};
const QF = playoffs.keyDates.quarterfinals.slice(0, 10);
const SF = playoffs.keyDates.semifinals.slice(0, 10);
const F = playoffs.keyDates.finals.slice(0, 10);

function withGames(games: Game[]): CcsPlayoffs {
  return { ...playoffs, bracketPublished: true, games };
}

const GAMES_2025 = ccsGames2025();
const SEEDS_2025 = ccsSeeds2025();

/** [home, away] slugs of a game card; a pairing's [bottom, top] (the host, then the visitor). */
function sides(card: BracketCard): [string | null, string | null] {
  if (card.kind === 'game') return [card.game.home.slug, card.game.away.slug];
  const name = (s: typeof card.top) => (isSeedSide(s) ? s.slug : isWinnerOf(s) ? `winner of ${s.winnerOf[0].seed} v ${s.winnerOf[1].seed}` : 'TBD');
  return [name(card.bottom), name(card.top)];
}

function cards(path: BracketPath, round: string): BracketCard[] {
  return path.rounds.find((r) => r.name === round)?.cards ?? [];
}

/** A CCS opponent from outside the registry: no slug or id, only a printed name. */
function vsOutsider(home: string, awayName: string): Game {
  const g = game({ home, away: home === 'fremont' ? 'cupertino' : 'fremont', hs: 3, as: 0, date: QF, league: false });
  return { ...g, away: { ...g.away, teamId: null, slug: null, name: awayName } };
}

/** One 8-team division with no bracket name: 4 quarterfinals, 2 semifinals, 1 final, all won by the top half. */
function oneDivision(teams: string[]): Game[] {
  const [a, b, c, d, e, f, g, h] = teams;
  return [
    resolveTeam(h) ? game({ home: a, away: h, hs: 3, as: 0, date: QF, league: false }) : vsOutsider(a, h),
    game({ home: b, away: g, hs: 2, as: 1, date: QF, league: false }),
    game({ home: c, away: f, hs: 4, as: 0, date: QF, league: false }),
    game({ home: d, away: e, hs: 1, as: 0, date: QF, league: false }),
    game({ home: a, away: d, hs: 2, as: 0, date: SF, league: false }),
    game({ home: b, away: c, hs: 3, as: 2, date: SF, league: false }),
    game({ home: a, away: b, hs: 1, as: 0, date: F, league: false }),
  ];
}

const DIV_A = ['st-ignatius', 'saint-francis', 'christopher', 'stevenson', 'fremont', 'gilroy', 'homestead', 'Menlo-Atherton'];
const DIV_B = ['mitty', 'los-gatos', 'palo-alto', 'leigh', 'hollister', 'santa-clara', 'prospect', 'monta-vista'];

describe('the 2025 CCS championship on 2026’s dates (tests/fixtures/ccs/bracket-2025.ts)', () => {
  it('is fourteen bracket games: eight quarterfinals, four semifinals, two finals, each with its division’s bracket', () => {
    expect(GAMES_2025, 'tests/fixtures/ccs/bracket-2025.ts').toHaveLength(14);
    expect(GAMES_2025.filter((g) => g.dateKey === QF), 'quarterfinals').toHaveLength(8);
    expect(GAMES_2025.filter((g) => g.dateKey === SF), 'semifinals').toHaveLength(4);
    expect(GAMES_2025.filter((g) => g.dateKey === F), 'finals').toHaveLength(2);
    expect(GAMES_2025.every((g) => g.postseason?.kind === 'ccs' && g.bracket?.published === true && g.bracket.tournamentId === CCS.tournament.id)).toBe(true);
    expect(new Set(GAMES_2025.map((g) => g.bracket?.name))).toEqual(new Set(['Division 1', 'Division 2']));
    expect(SEEDS_2025.divisions.map((d) => d.seeds.length)).toEqual([8, 8]);
  });

  it('games + seeds → two paths named by division, seven games each, in the slot order [1, 4, 3, 2]', () => {
    const paths = buildBrackets(withGames(GAMES_2025), SEEDS_2025);
    expect(paths.map((p) => [p.name, p.division]), MODEL).toEqual([
      ['CCS Division 1', 'Division 1'],
      ['CCS Division 2', 'Division 2'],
    ]);
    for (const path of paths) {
      expect(path.rounds.map((r) => r.name), MODEL).toEqual(['Quarterfinals', 'Semifinals', 'Final']);
      expect(path.rounds.map((r) => r.cards.length), MODEL).toEqual([4, 2, 1]);
      expect(path.rounds.flatMap((r) => r.cards).every((c) => c.kind === 'game'), MODEL).toBe(true);
      // Every card seeded on both sides.
      expect(
        path.rounds.flatMap((r) => r.cards).every((c) => c.kind === 'game' && c.seeds.home !== null && c.seeds.away !== null),
        `${MODEL}: seeds on every ${path.name} card`,
      ).toBe(true);
    }
    const [d1, d2] = paths;
    // Division 1 quarterfinals: 1v8, 4v5, 3v6, 2v7 as home v away (the higher seed hosted).
    expect(cards(d1, 'Quarterfinals').map(sides), MODEL).toEqual([
      ['st-ignatius', 'palo-alto'],
      ['saint-francis', 'gilroy'],
      ['leigh', 'mitty'],
      ['los-gatos', 'christopher'],
    ]);
    expect(cards(d1, 'Quarterfinals').map((c) => (c.kind === 'game' ? [c.seeds.home, c.seeds.away] : null)), MODEL).toEqual([
      [1, 8], [4, 5], [3, 6], [2, 7],
    ]);
    // Semifinals: the game holding the lowest of {1, 8, 4, 5} first (St. Ignatius v Saint Francis), then Los Gatos v Mitty.
    expect(cards(d1, 'Semifinals').map(sides), MODEL).toEqual([
      ['st-ignatius', 'saint-francis'],
      ['los-gatos', 'mitty'],
    ]);
    expect(cards(d2, 'Quarterfinals').map(sides), MODEL).toEqual([
      ['los-altos', 'monterey'],
      ['valley-christian', 'saratoga'],
      ['carmel', 'willow-glen'],
      ['stevenson', 'presentation'],
    ]);
    // The finals and their winners: Los Gatos 3-0 (neutral, Los Altos HS) and Valley Christian 1-0 (at Gilroy HS, MaxPreps 'home').
    const finals = paths.map((p) => cards(p, 'Final')[0]);
    expect(finals.map((c) => (c.kind === 'game' ? c.game.site : null)), MODEL).toEqual(['neutral', 'home']);
    expect(finals.map((c) => (c.kind === 'game' ? (c.game.home.score! > c.game.away.score! ? c.game.home.slug : c.game.away.slug) : null))).toEqual([
      'los-gatos',
      'valley-christian',
    ]);
    expect(GAMES_2025.filter((g) => g.site === 'neutral').map((g) => g.contestId), 'only the Division 1 final is neutral').toEqual([
      'e6091e07-0e91-4940-b3e0-5bb538c784bf',
    ]);
    expect(pendingRounds(withGames(GAMES_2025), paths), MODEL).toEqual([]);
  });

  it('seeds alone → the CCS pairing as four quarterfinal pairings, two winners-of semifinals and a TBD final; nothing pending', () => {
    const paths = buildBrackets(playoffs, SEEDS_2025);
    expect(paths.map((p) => p.name), MODEL).toEqual(['CCS Division 1', 'CCS Division 2']);
    const [d1] = paths;
    expect(d1.rounds.map((r) => [r.name, r.dateLabel, r.cards.length]), MODEL).toEqual([
      ['Quarterfinals', 'Sat Nov 7', 4],
      ['Semifinals', 'Wed Nov 11', 2],
      ['Final', 'Sat Nov 14', 1],
    ]);
    expect(d1.rounds.flatMap((r) => r.cards).every((c) => c.kind === 'pairing'), MODEL).toBe(true);
    // The visitor (the lower seed) on top, the host below, as GameRow draws away over home.
    expect(cards(d1, 'Quarterfinals').map(sides), MODEL).toEqual([
      ['st-ignatius', 'palo-alto'],
      ['saint-francis', 'gilroy'],
      ['leigh', 'mitty'],
      ['los-gatos', 'christopher'],
    ]);
    expect(cards(d1, 'Semifinals').map(sides), MODEL).toEqual([
      ['winner of 1 v 8', 'winner of 4 v 5'],
      ['winner of 3 v 6', 'winner of 2 v 7'],
    ]);
    expect(cards(d1, 'Final').map(sides), MODEL).toEqual([['TBD', 'TBD']]);
    // A pairing is a card: no round is pending.
    expect(pendingRounds(playoffs, paths), MODEL).toEqual([]);
  });

  it('quarterfinals played, seeds known → the semifinal sides are the winners; the final is winners-of', () => {
    const quarters = GAMES_2025.filter((g) => g.dateKey === QF);
    const paths = buildBrackets(withGames(quarters), SEEDS_2025);
    const [d1] = paths;
    expect(cards(d1, 'Quarterfinals').every((c) => c.kind === 'game'), MODEL).toBe(true);
    expect(cards(d1, 'Semifinals').map(sides), MODEL).toEqual([
      ['st-ignatius', 'saint-francis'],
      ['los-gatos', 'mitty'],
    ]);
    expect(cards(d1, 'Final').map(sides), MODEL).toEqual([['winner of 1 v 4', 'winner of 2 v 6']]);
    expect(pendingRounds(withGames(quarters), paths), MODEL).toEqual([]);
  });

  it('eight quarterfinals with seeds but no bracket name → two paths from the seed lists', () => {
    const quarters = GAMES_2025.filter((g) => g.dateKey === QF).map((g) => ({ ...g, bracket: undefined }));
    const paths = buildBrackets(withGames(quarters), SEEDS_2025);
    expect(paths.map((p) => [p.name, cards(p, 'Quarterfinals').length]), MODEL).toEqual([
      ['CCS Division 1', 4],
      ['CCS Division 2', 4],
    ]);
  });

  it('eight quarterfinals with a bracket name but no seeds → two paths by name, no seed on any card', () => {
    const quarters = GAMES_2025.filter((g) => g.dateKey === QF);
    const paths = buildBrackets(withGames(quarters), null);
    expect(paths.map((p) => [p.name, p.division]), MODEL).toEqual([
      ['CCS Division 1', 'Division 1'],
      ['CCS Division 2', 'Division 2'],
    ]);
    expect(paths.flatMap((p) => p.rounds.flatMap((r) => r.cards)).every((c) => c.kind === 'game' && c.seeds.home === null && c.seeds.away === null), MODEL).toBe(true);
    // Without seeds no pairing is drawn: the later rounds are pending.
    expect(pendingRounds(withGames(quarters), paths).map((r) => r.name), MODEL).toEqual(['Semifinals', 'Final']);
  });

  it('eight quarterfinals with no seeds and no bracket name → one path "CCS bracket" (today’s behaviour, pinned)', () => {
    const quarters = GAMES_2025.filter((g) => g.dateKey === QF).map((g) => ({ ...g, bracket: undefined }));
    const paths = buildBrackets(withGames(quarters));
    expect(paths.map((p) => [p.name, p.division]), MODEL).toEqual([['CCS bracket', null]]);
    expect(paths[0].rounds.map((r) => [r.name, r.cards.length]), MODEL).toEqual([['Quarterfinals', 8]]);
  });

  it('a quarterfinal moved to Mon Nov 9 is still a quarterfinal; its card carries its own date', () => {
    const quarters = GAMES_2025.filter((g) => g.dateKey === QF);
    const moved = { ...quarters[0], dateKey: '2026-11-09', dateLocal: '2026-11-09T16:00:00', dateUtc: '2026-11-10T00:00:00Z' };
    const paths = buildBrackets(withGames([moved, ...quarters.slice(1)]), SEEDS_2025);
    const card = paths.flatMap((p) => cards(p, 'Quarterfinals')).find((c) => c.kind === 'game' && c.game.contestId === moved.contestId);
    expect(card?.kind === 'game' ? card.when : null, MODEL).toBe('Mon Nov 9 · 4:00 PM PT');
    expect(paths.flatMap((p) => p.rounds.map((r) => r.name))).not.toContain('Mon Nov 9');
    // An unplayed card with no time says so; a card is never dated by the round.
    const tba = unplayed(quarters[1], { timeTba: true });
    const p2 = buildBrackets(withGames([tba]), SEEDS_2025);
    const c2 = p2.flatMap((p) => cards(p, 'Quarterfinals')).find((c) => c.kind === 'game');
    expect(c2?.kind === 'game' ? c2.when : null, MODEL).toBe('Sat Nov 7 · time TBA');
  });

  it('a seeded division whose two sides disagree on the division falls back to one unproven path', () => {
    const mixed = GAMES_2025.map((g) => (g.contestId === 'e6091e07-0e91-4940-b3e0-5bb538c784bf' ? { ...g, bracket: { ...g.bracket!, name: 'Division 2' } } : g));
    const paths = buildBrackets(withGames(mixed), null);
    expect(paths.map((p) => p.name), MODEL).toEqual(['CCS bracket']);
  });
});

describe('buildBrackets without a bracket name or a seed (synthetic)', () => {
  it('renders nothing at all while nothing is published and no seed is known', () => {
    expect(buildBrackets(playoffs), MODEL).toEqual([]);
    expect(buildBrackets(playoffs, null), MODEL).toEqual([]);
  });

  it('names the two CCS divisions with the CCS prefix, from format.ccsDivisions', () => {
    expect(ccsDivisionLabels(playoffs), MODEL).toEqual(['CCS Division 1', 'CCS Division 2']);
  });

  it('splits two independent 7-game divisions into two unproven paths', () => {
    const paths = buildBrackets(withGames([...oneDivision(DIV_A), ...oneDivision(DIV_B)]));
    expect(paths).toHaveLength(2);
    expect(paths.map((p) => [p.name, p.division])).toEqual([['Bracket 1', null], ['Bracket 2', null]]);
    for (const path of paths) {
      expect(path.rounds.map((r) => r.name)).toEqual(['Quarterfinals', 'Semifinals', 'Final']);
      expect(path.rounds.map((r) => r.cards.length)).toEqual([4, 2, 1]);
      // A seed is never invented (DESIGN §7.11): the file has none.
      expect(path.rounds.flatMap((r) => r.cards).every((c) => c.kind === 'game' && c.seeds.home === null && c.seeds.away === null)).toBe(true);
    }
  });

  it('falls back to ONE bracket rather than guessing when the two halves share a team', () => {
    const games = [...oneDivision(DIV_A), ...oneDivision(DIV_B)];
    games.push(game({ home: 'st-ignatius', away: 'archbishop-mitty', hs: 1, as: 0, date: SF, league: false }));
    const paths = buildBrackets(withGames(games));
    expect(paths).toHaveLength(1);
    expect(paths[0].name).toBe('CCS bracket');
  });

  it('names a round by its date when a published game is dated before the quarterfinals', () => {
    const early = game({ home: 'los-altos', away: 'fremont', hs: 2, as: 1, date: '2026-11-05', league: false });
    const paths = buildBrackets(withGames([...oneDivision(DIV_A), early]));
    const names = paths.flatMap((p) => p.rounds.map((r) => r.name));
    expect(names).toContain('Quarterfinals');
    expect(names).toContain('Thu Nov 5');
    // A game after the final's date is in the final's round (a window, not a date).
    const late = game({ home: 'los-altos', away: 'fremont', hs: 2, as: 1, date: '2026-11-21', league: false });
    const names2 = buildBrackets(withGames([...oneDivision(DIV_A), late])).flatMap((p) => p.rounds.map((r) => r.name));
    expect(names2.filter((n) => n === 'Final')).toHaveLength(1);
    expect(names2.some((n) => /Nov 21/.test(n))).toBe(false);
  });

  it('reports the rounds that have no game and no pairing, by name and date', () => {
    const quartersOnly = oneDivision(DIV_A).filter((g) => g.dateKey === QF);
    const p = withGames(quartersOnly);
    const paths = buildBrackets(p);
    const pending = pendingRounds(p, paths);
    expect(pending.map((r) => r.name)).toEqual(['Semifinals', 'Final']);
    expect(pending.map((r) => r.dateKey)).toEqual([SF, F]);
    expect(pendingRounds(withGames(oneDivision(DIV_A)), buildBrackets(withGames(oneDivision(DIV_A))))).toEqual([]);
  });
});

describe('round and side helpers', () => {
  it('maps a date to its round by WINDOW: before the quarterfinals is `other`, each round runs to the next', () => {
    expect(roundKeyFor('2026-11-05', playoffs.keyDates)).toBe('other');
    expect(roundKeyFor(QF, playoffs.keyDates)).toBe('quarterfinals');
    expect(roundKeyFor('2026-11-09', playoffs.keyDates)).toBe('quarterfinals');
    expect(roundKeyFor(SF, playoffs.keyDates)).toBe('semifinals');
    expect(roundKeyFor('2026-11-13', playoffs.keyDates)).toBe('semifinals');
    expect(roundKeyFor(F, playoffs.keyDates)).toBe('finals');
    expect(roundKeyFor('2026-11-21', playoffs.keyDates)).toBe('finals');
  });

  it('treats an unfilled slot as unnamed', () => {
    const named = { teamId: null, slug: null, name: 'Los Altos', score: null, result: null };
    expect(isNamedSide(named)).toBe(true);
    for (const placeholder of ['TBD', 'TBA', 'Winner of QF1', 'loser of game 2', '  ']) {
      expect(isNamedSide({ ...named, name: placeholder })).toBe(false);
    }
  });
});
