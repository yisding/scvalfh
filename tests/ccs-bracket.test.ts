/**
 * lib/ccs-bracket.ts — which games are the CCS bracket (`playoffs.games`), and the seed switch.
 *
 * `ccsBracketGames` is the one derivation of `playoffs.games`: lib/pipeline/steps/assemble.ts writes it,
 * lib/snapshot-migrate.ts rebuilds a committed file with it, tests/snapshot-file.test.ts holds the committed
 * file to it. A game is in the bracket when it is tagged 'ccs' and either falls on or after the quarterfinal
 * date or MaxPreps' feed marks it published (`Game.bracket.published`); a crossover or play-in never is.
 */

import { describe, expect, it } from 'vitest';

import { CCS } from '../lib/leagues';
import { ccsBracketGames, ccsSeedOf, getCcsSeeds, playoffGamesStale } from '../lib/ccs-bracket';
import type { Game, GameBracket } from '../lib/types';
import { game } from './game-builder';

const BRACKET: GameBracket = {
  tournamentId: CCS.tournament.id,
  bracketId: CCS.tournament.division1BracketId,
  tournament: '2026 Central Coast Section Field Hockey Championship',
  name: 'Division 1',
  published: true,
  matchupId: null,
  url: CCS.bracketUrl,
};

describe('ccsBracketGames: the derivation of playoffs.games', () => {
  // Saint Francis (SCVAL) v Leigh (BVAL): two CCS leagues, so only the window or the feed can make it a CCS game.
  const nov7 = game({ home: 'saint-francis', away: 'leigh', date: '2026-11-07', league: false });
  const nov3 = game({ home: 'saint-francis', away: 'leigh', date: '2026-11-03', league: false });
  const crossover = game({ home: 'saint-francis', away: 'mitty', hs: 1, as: 0, date: '2026-10-30', league: false });

  it('includes a ccs game on the quarterfinal date and after', () => {
    expect(nov7.postseason).toEqual({ kind: 'ccs', leagueId: null, via: 'ccs-window' });
    expect(ccsBracketGames([nov7], CCS.keyDates)).toEqual([nov7]);
    const final = game({ home: 'saint-francis', away: 'leigh', date: '2026-11-14', league: false });
    expect(ccsBracketGames([final, nov7], CCS.keyDates).map((g) => g.dateKey)).toEqual(['2026-11-07', '2026-11-14']);
  });

  it('excludes a game before the quarterfinals unless MaxPreps’ feed marks its bracket published', () => {
    expect(nov3.postseason).toBeNull();
    expect(ccsBracketGames([nov3], CCS.keyDates)).toEqual([]);
    const tagged: Game = { ...nov3, postseason: { kind: 'ccs', leagueId: null, via: 'contest-type-4' } };
    expect(ccsBracketGames([tagged], CCS.keyDates)).toEqual([]);
    const published: Game = { ...tagged, bracket: BRACKET };
    expect(ccsBracketGames([published], CCS.keyDates)).toEqual([published]);
    const unpublished: Game = { ...tagged, bracket: { ...BRACKET, published: false } };
    expect(ccsBracketGames([unpublished], CCS.keyDates)).toEqual([]);
  });

  it('never includes a crossover or play-in, whatever its date or bracket fields', () => {
    expect(crossover.postseason?.kind).toBe('scval-crossover');
    expect(ccsBracketGames([crossover], CCS.keyDates)).toEqual([]);
    expect(ccsBracketGames([{ ...crossover, bracket: BRACKET }], CCS.keyDates)).toEqual([]);
    const late: Game = { ...crossover, dateKey: '2026-11-07', dateLocal: '2026-11-07T16:00:00' };
    expect(ccsBracketGames([late], CCS.keyDates)).toEqual([]);
  });

  it('returns the SAME objects as the input, sorted by date then id', () => {
    const a = game({ home: 'saint-francis', away: 'leigh', date: '2026-11-11', league: false });
    const b = game({ home: 'los-gatos', away: 'carmel', date: '2026-11-07', league: false });
    const out = ccsBracketGames([a, b, crossover], CCS.keyDates);
    expect(out[0]).toBe(b);
    expect(out[1]).toBe(a);
  });

  it('playoffGamesStale compares by contestId and order', () => {
    expect(playoffGamesStale([nov7, crossover], [], CCS.keyDates)).toBe(true);
    expect(playoffGamesStale([nov7, crossover], [nov7], CCS.keyDates)).toBe(false);
    expect(playoffGamesStale([nov3, crossover], [], CCS.keyDates)).toBe(false);
    const a = game({ home: 'saint-francis', away: 'leigh', date: '2026-11-11', league: false });
    expect(playoffGamesStale([a, nov7], [a, nov7], CCS.keyDates)).toBe(true);
    expect(playoffGamesStale([a, nov7], [nov7, a], CCS.keyDates)).toBe(false);
  });
});

describe('getCcsSeeds: the owner-file switch', () => {
  it('is null while data/ccs-bracket-2026.json is the placeholder, so no seed is printed', () => {
    expect(getCcsSeeds()).toBeNull();
    expect(ccsSeedOf(null, 'Division 1', 'los-gatos')).toBeNull();
  });

  it('reads a filled file as owner-file seeds', () => {
    const seeds = getCcsSeeds({
      season: '2026-27',
      retrievedOn: '2026-11-02',
      source: { label: 'CCS field hockey brackets (MaxPreps tournament page)', url: CCS.bracketUrl },
      divisions: [
        { name: 'Division 1', seeds: [{ seed: 1, slug: 'st-ignatius' }, { seed: 8, slug: 'palo-alto' }] },
        { name: 'Division 2', seeds: [{ seed: 1, slug: 'los-altos' }] },
      ],
    });
    expect(seeds?.provenance).toBe('owner-file');
    expect(seeds?.retrievedOn).toBe('2026-11-02');
    expect(ccsSeedOf(seeds, 'Division 1', 'palo-alto')).toBe(8);
    expect(ccsSeedOf(seeds, 'Division 2', 'los-altos')).toBe(1);
    expect(ccsSeedOf(seeds, 'Division 2', 'palo-alto')).toBeNull();
    expect(ccsSeedOf(seeds, 'Division 1', null)).toBeNull();
  });
});
