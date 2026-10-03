/**
 * `components/playoffs/bracket-model.ts` — the CCS bracket, recovered from a `Game[]` that
 * carries no seeds and no CCS division label (`format.ccsDivisions`, always "CCS Division 1/2" in
 * copy).
 *
 * The bracket is unpublished until the CCS seeding meeting, so these cases build it from the CCS
 * section block (`CCS` in lib/leagues — the key dates and the two CCS divisions) plus synthetic
 * games. Nothing here reads the bundled snapshot, so live fetches cannot break it.
 */

import { describe, expect, it } from 'vitest';

import {
  buildBrackets,
  ccsDivisionLabels,
  isNamedSide,
  pendingRounds,
  roundKeyFor,
} from '../../components/playoffs/bracket-model';
import { CCS } from '../../lib/leagues';
import { resolveTeam } from '../../lib/teams';
import type { CcsPlayoffs, Game } from '../../lib/types';
import { game } from '../game-builder';

const MODEL = 'components/playoffs/bracket-model.ts';

const playoffs: CcsPlayoffs = {
  keyDates: { ...CCS.keyDates },
  format: {
    elimination: 'single',
    ccsDivisions: CCS.ccsDivisions.map((d) => ({ name: d.name, seeds: [d.seeds[0], d.seeds[1]] })),
    autoQualifiers: { ...CCS.autoQualifiers },
    highSeedHostsThrough: 'semifinals',
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

/** A CCS opponent from outside SCVAL: no registry slug or id, only a printed name. */
function vsOutsider(home: string, awayName: string): Game {
  const g = game({ home, away: home === 'fremont' ? 'cupertino' : 'fremont', hs: 3, as: 0, date: QF, league: false });
  return { ...g, away: { ...g.away, teamId: null, slug: null, name: awayName } };
}

/**
 * One 8-team division: 4 quarterfinals, 2 semifinals, 1 final, all won by the top half. The
 * eighth seed is a non-SCVAL school when it is not a registry slug, as in the real CCS field.
 */
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

// Two CCS divisions drawn from all three CCS leagues; the eighth seed of the first is a school from
// outside the registry (a printed name only), as can happen in the real field.
const DIV_A = ['st-ignatius', 'saint-francis', 'christopher', 'stevenson', 'fremont', 'gilroy', 'homestead', 'Menlo-Atherton'];
const DIV_B = ['mitty', 'los-gatos', 'palo-alto', 'leigh', 'hollister', 'santa-clara', 'prospect', 'monta-vista'];

describe('buildBrackets', () => {
  it('renders nothing at all while the bracket is unpublished', () => {
    expect(buildBrackets(playoffs), MODEL).toEqual([]);
  });

  it('names the two CCS divisions with the CCS prefix, from format.ccsDivisions', () => {
    expect(ccsDivisionLabels(playoffs), MODEL).toEqual(['CCS Division 1 (seeds 1-8)', 'CCS Division 2 (seeds 9-16)']);
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
