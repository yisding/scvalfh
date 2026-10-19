/**
 * lib/queries/postseason.ts: the postseason read API, against the committed v1 golden snapshot migrated to v2
 * (tests/support/golden-queries.ts).
 */

import { describe, expect, it } from 'vitest';

import { getLeague } from '@/lib/config/leagues';
import { goldenQueries } from '@/tests/support/golden-queries';

describe('data: postseason', () => {
  it('projects SCVAL with written labels and the four crossover pairings', () => {
    const projection = goldenQueries.data.getPlayoffProjection('scval');
    expect(projection.leagueId).toBe('scval');
    expect(projection.berths).toEqual({ auto: 7, total: 16 });
    expect(projection.pairings.map((p) => p.id)).toEqual([
      'scval-crossover-1', 'scval-crossover-2', 'scval-crossover-3', 'scval-crossover-4',
    ]);
    const deAnza = projection.byDivision['de-anza'];
    expect(deAnza.length).toBe(7);
    expect(deAnza[0].status).toBe('aq');
    expect(deAnza.map((r) => r.label)).not.toContain('No results reported');
  });

  it('projects BVAL with every team unplaced, and its play-in pairing with empty seats', () => {
    const bval = goldenQueries.data.getPlayoffProjection('bval');
    expect(bval.berths).toEqual({ auto: 4, total: 16 });
    expect(Object.keys(bval.byDivision)).toEqual(['mt-hamilton', 'santa-teresa']);
    for (const r of bval.byDivision['mt-hamilton']) expect(r.label).toBe('No results reported');
    expect(bval.pairings).toHaveLength(1);
    expect(bval.pairings[0].seats).toEqual([[], []]);
    expect(goldenQueries.data.getLeaguePairings('pcal')).toEqual([]);
  });

  it('refuses a CCS projection for MCAL and a tournament for a CCS league', () => {
    expect(() => goldenQueries.data.getPlayoffProjection('mcal')).toThrow(/no CCS ladder/);
    expect(() => goldenQueries.data.getLeagueTournament('scval')).toThrow(/runs no league tournament/);
  });

  it('draws neither a CCS projection nor a bracket for the EAL', () => {
    expect(() => goldenQueries.data.getPlayoffProjection('eal')).toThrow(/no CCS ladder/);
    expect(() => goldenQueries.data.getLeagueTournament('eal')).toThrow(/runs no league tournament/);
    expect(goldenQueries.data.getLeaguePairings('eal')).toEqual([]);
  });

  it('builds the MCAL tournament on an empty table', () => {
    const t = goldenQueries.data.getLeagueTournament('mcal');
    expect(t.leagueId).toBe('mcal');
    expect(t.status).toBe('projected');
    expect(t.games.map((g) => g.id)).toEqual(['qf-1', 'qf-2', 'sf-1', 'sf-2', 'final']);
  });

  it('describes the CCS field in numbers only', () => {
    expect(goldenQueries.data.getCcsField()).toEqual({
      byLeague: [
        { leagueId: 'scval', shortName: 'SCVAL', auto: 7 },
        { leagueId: 'bval', shortName: 'BVAL', auto: 4 },
        { leagueId: 'pcal', shortName: 'PCAL', auto: 2 },
      ],
      atLarge: 3,
      total: 16,
    });
    expect(goldenQueries.data.getPlayoffs().format.autoQualifiers.total).toBe(16);
  });

  it('writes a team postseason line, and none for a team without results', () => {
    const sf = goldenQueries.data.getTeamPostseasonLine('saint-francis')!;
    expect(sf.label).toBe('Automatic qualifier');
    expect(sf.sentence).toBe('The SCVAL crossover and the 4th-place play-in are Fri Oct 30.');
    expect(sf.href).toBe('/playoffs#scval');
    expect(sf.linkText).toBe('CCS playoffs');
    expect(goldenQueries.data.getTeamPostseasonLine('leigh')).toBeNull();
    expect(goldenQueries.data.getTeamPostseasonLine('tamalpais')).toBeNull();
    expect(goldenQueries.data.getTeamPostseasonLine('chico')).toBeNull();
    expect(goldenQueries.data.getTeamPostseasonLine('nope')).toBeNull();
    // A San Diego team with no league game yet: no place, no line (never placed by merit).
    expect(goldenQueries.data.getTeamPostseasonLine('la-jolla')).toBeNull();
  });

  it('writes the Sunset’s no-postseason note for every Sunset team, played or not', () => {
    const sunset = getLeague('sunset');
    if (sunset.postseason.kind !== 'no-postseason') throw new Error('the Sunset has no postseason');
    expect(goldenQueries.data.getTeamPostseasonLine('edison')).toEqual({
      label: 'No section playoffs',
      sentence: sunset.postseason.note,
      href: '/playoffs#sunset',
      linkText: 'Postseason',
    });
    expect(goldenQueries.data.getTeamPostseasonLine('edison')!.sentence).not.toMatch(/\btop\b/i);
  });

  it('draws neither a projection nor a bracket for the Sunset or a San Diego league', () => {
    for (const id of ['sunset', 'city', 'north-county', 'metro']) {
      expect(() => goldenQueries.data.getPlayoffProjection(id), id).toThrow(/no CCS ladder/);
      expect(() => goldenQueries.data.getLeagueTournament(id), id).toThrow(/runs no league tournament/);
      expect(goldenQueries.data.getLeaguePairings(id)).toEqual([]);
    }
  });

  it('writes the play-in clause from the config, its berth ordinal from autoBerths', () => {
    const bval = getLeague('bval');
    if (bval.postseason.kind !== 'ccs-ladder') throw new Error('BVAL is a CCS ladder league');
    const ps = bval.postseason;
    const playIn = ps.pairings.find((p) => p.tag === 'bval-play-in')!;
    expect(goldenQueries.data.playInClause(bval, ps, playIn)).toBe(
      'Mt. Hamilton #4 plays at the Santa Teresa champion Sat Oct 31, 11 AM, for BVAL’s fourth automatic CCS berth',
    );
    expect(goldenQueries.data.playInClause(bval, { ...ps, autoBerths: 5 }, playIn)).toMatch(/for BVAL’s fifth automatic CCS berth$/);
  });
});
