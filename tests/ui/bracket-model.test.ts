/**
 * `components/playoffs/bracket-model.ts` — the CCS bracket, recovered from a `Game[]` that
 * carries no seeds and no CCS division label.
 *
 * This code cannot run against real data yet: the 2026 bracket is unpublished, so
 * `playoffs.games` is `[]` and /playoffs is in its not-seeded mode. The /playoffs stage exercised
 * it by pointing `SCVAL_SNAPSHOT` at synthetic snapshots and asked for the cases to be committed
 * (scratchpad/notes/page-playoffs.md, request 2). Building them here from the real `playoffs`
 * record plus synthetic games keeps the key dates honest.
 */

import { describe, expect, it } from 'vitest';

import { buildBrackets, isNamedSide, pendingRounds, roundKeyFor } from '../../components/playoffs/bracket-model';
import { getPlayoffs } from '../../lib/data';
import type { Game, Playoffs } from '../../lib/types';
import { game } from '../helpers';

const playoffs = getPlayoffs();
const QF = playoffs.keyDates.quarterfinals.slice(0, 10);
const SF = playoffs.keyDates.semifinals.slice(0, 10);
const F = playoffs.keyDates.finals.slice(0, 10);

function withGames(games: Game[]): Playoffs {
  return { ...playoffs, bracketPublished: true, games };
}

/** One 8-team division: 4 quarterfinals, 2 semifinals, 1 final, all won by the top half. */
function oneDivision(teams: string[]): Game[] {
  const [a, b, c, d, e, f, g, h] = teams;
  return [
    game({ home: a, away: h, hs: 3, as: 0, date: QF, league: false }),
    game({ home: b, away: g, hs: 2, as: 1, date: QF, league: false }),
    game({ home: c, away: f, hs: 4, as: 0, date: QF, league: false }),
    game({ home: d, away: e, hs: 1, as: 0, date: QF, league: false }),
    game({ home: a, away: d, hs: 2, as: 0, date: SF, league: false }),
    game({ home: b, away: c, hs: 3, as: 2, date: SF, league: false }),
    game({ home: a, away: b, hs: 1, as: 0, date: F, league: false }),
  ];
}

const DIV_A = ['st-ignatius', 'saint-francis', 'valley-christian', 'los-altos', 'fremont', 'cupertino', 'homestead', 'wilcox'];
const DIV_B = ['archbishop-mitty', 'los-gatos', 'palo-alto', 'saratoga', 'presentation', 'santa-clara', 'lynbrook', 'monta-vista'];

describe('buildBrackets', () => {
  it('renders nothing at all while the bracket is unpublished — the live case', () => {
    expect(playoffs.bracketPublished).toBe(false);
    expect(playoffs.games).toEqual([]);
    expect(buildBrackets(playoffs)).toEqual([]);
  });

  it('splits two independent 7-game divisions into two named paths', () => {
    const paths = buildBrackets(withGames([...oneDivision(DIV_A), ...oneDivision(DIV_B)]));
    expect(paths).toHaveLength(2);
    expect(paths.map((p) => p.name)).toEqual(['Bracket 1', 'Bracket 2']);
    for (const path of paths) {
      expect(path.rounds.map((r) => r.name)).toEqual(['Quarterfinals', 'Semifinals', 'Final']);
      expect(path.rounds.map((r) => r.games.length)).toEqual([4, 2, 1]);
      // A seed is never invented (DESIGN §7.11): nothing upstream publishes one.
      expect(path.rounds.flatMap((r) => r.games).every((g) => g.seeds.home === null && g.seeds.away === null)).toBe(true);
    }
  });

  it('falls back to ONE bracket rather than guessing when the two halves share a team', () => {
    const games = [...oneDivision(DIV_A), ...oneDivision(DIV_B)];
    // One cross-division game joins the components — the split can no longer be trusted.
    games.push(game({ home: 'st-ignatius', away: 'archbishop-mitty', hs: 1, as: 0, date: SF, league: false }));
    const paths = buildBrackets(withGames(games));
    expect(paths).toHaveLength(1);
    expect(paths[0].name).toBe('CCS bracket');
  });

  it('names a round by its date when the date is not a published key date', () => {
    const extra = game({ home: 'los-altos', away: 'fremont', hs: 2, as: 1, date: '2026-11-21', league: false });
    const paths = buildBrackets(withGames([...oneDivision(DIV_A), extra]));
    const names = paths.flatMap((p) => p.rounds.map((r) => r.name));
    expect(names).toContain('Quarterfinals');
    expect(names.some((n) => /Nov 21/.test(n))).toBe(true);
  });

  it('reports the rounds that have no games yet, by name and date', () => {
    const quartersOnly = oneDivision(DIV_A).filter((g) => g.dateKey === QF);
    const p = withGames(quartersOnly);
    const paths = buildBrackets(p);
    const pending = pendingRounds(p, paths);
    expect(pending.map((r) => r.name)).toEqual(['Semifinals', 'Final']);
    expect(pending.map((r) => r.dateKey)).toEqual([SF, F]);
    // Nothing is pending once every round has games.
    expect(pendingRounds(withGames(oneDivision(DIV_A)), buildBrackets(withGames(oneDivision(DIV_A))))).toEqual([]);
  });
});

describe('round and side helpers', () => {
  it('maps the three published key dates to their rounds and everything else to `other`', () => {
    expect(roundKeyFor(QF, playoffs.keyDates)).toBe('quarterfinals');
    expect(roundKeyFor(SF, playoffs.keyDates)).toBe('semifinals');
    expect(roundKeyFor(F, playoffs.keyDates)).toBe('finals');
    expect(roundKeyFor('2026-11-21', playoffs.keyDates)).toBe('other');
  });

  it('treats an unfilled slot as unnamed', () => {
    const named = { teamId: null, slug: null, name: 'Los Altos', score: null, result: null };
    expect(isNamedSide(named)).toBe(true);
    for (const placeholder of ['TBD', 'TBA', 'Winner of QF1', 'loser of game 2', '  ']) {
      expect(isNamedSide({ ...named, name: placeholder })).toBe(false);
    }
  });
});
