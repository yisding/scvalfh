/**
 * lib/queries/leagues.ts: sections, leagues, tournaments and the region summaries, against the committed v1 golden
 * snapshot migrated to v2 (tests/support/golden-queries.ts).
 */

import { describe, expect, it } from 'vitest';

import { LEAGUE_IDS, SECTIONS, TOURNAMENT_LEAGUE_IDS } from '@/lib/config/leagues';
import { goldenQueries } from '@/tests/support/golden-queries';

describe('lib/queries/leagues: sections and leagues', () => {
  it('summarises the nine leagues and the independents in config order, each with its region and its cities', () => {
    const leagues = goldenQueries.data.getLeagueSummaries();
    expect(leagues.map((l) => l.id)).toEqual(['scval', 'bval', 'pcal', 'mcal', 'eal', 'sunset', 'city', 'north-county', 'metro', 'independents']);
    expect(leagues.map((l) => l.teamCount)).toEqual([15, 12, 7, 9, 6, 8, 12, 19, 9, 5]);
    // `region` is NorCal/SoCal (from the section); the card's place words moved to `cities`, unchanged for NorCal.
    expect(leagues.map((l) => l.region)).toEqual([...Array(5).fill('norcal'), ...Array(5).fill('socal')]);
    expect(leagues.map((l) => l.cities)).toEqual([
      'Santa Clara County and San Francisco', 'San Jose, Campbell, Saratoga, Morgan Hill and Gilroy',
      'Monterey County and Hollister', 'Marin County, San Francisco and Berkeley', 'Chico, Corning, Susanville, Davis and Fair Oaks',
      'Huntington Beach, Newport Beach, Fountain Valley and Temecula', 'San Diego and La Jolla',
      'Carlsbad, Encinitas, Escondido, Fallbrook, Oceanside, Poway, San Marcos, Valley Center, Vista and north San Diego',
      'Chula Vista, La Mesa, Lakeside, El Cajon and San Diego', 'Glendora, La Verne, Studio City, Thousand Oaks and West Hills',
    ]);
    expect(goldenQueries.data.getLeagueSummary('sunset')!.section).toEqual({ id: 'ss', name: 'Southern Section', shortName: 'SS' });
    expect(goldenQueries.data.getLeagueSummary('north-county')!.divisions.map((d) => [d.id, d.heading, d.teamCount])).toEqual([
      ['avocado', 'Avocado', 6], ['palomar', 'Palomar', 7], ['valley', 'Valley', 6],
    ]);
    expect(goldenQueries.data.getLeagueSummary('sunset')!.singleDivision).toBe(true);
    const bval = goldenQueries.data.getLeagueSummary('bval')!;
    expect(bval.section).toEqual({ id: 'ccs', name: 'Central Coast Section', shortName: 'CCS' });
    expect(bval.singleDivision).toBe(false);
    expect(bval.divisions.map((d) => [d.id, d.heading, d.teamCount])).toEqual([
      ['mt-hamilton', 'Mt. Hamilton', 6],
      ['santa-teresa', 'Santa Teresa', 6],
    ]);
    const mcal = goldenQueries.data.getLeagueSummary('mcal')!;
    expect(mcal.section.shortName).toBe('NCS');
    expect(mcal.singleDivision).toBe(true);
    expect(mcal.divisions[0].heading).toBeNull();
    const eal = goldenQueries.data.getLeagueSummary('eal')!;
    expect(eal.section).toEqual({ id: 'ns', name: 'Northern Section', shortName: 'NS' });
    expect(eal.singleDivision).toBe(true);
    expect(eal.divisions.map((d) => [d.id, d.heading, d.teamCount])).toEqual([['eal', null, 6]]);
    expect(goldenQueries.data.getLeagueSummary('nope')).toBeUndefined();
  });

  it('lists route params', () => {
    expect(LEAGUE_IDS).toEqual(['scval', 'bval', 'pcal', 'mcal', 'eal', 'sunset', 'city', 'north-county', 'metro', 'independents']);
    expect(TOURNAMENT_LEAGUE_IDS).toEqual(['mcal']);
    expect(SECTIONS.map((s) => s.id)).toEqual(['ccs', 'ncs', 'ns', 'ss', 'sds']);
  });

  it('summarises each region: its sections, their leagues, its team count', () => {
    const regions = goldenQueries.data.getRegionSummaries();
    expect(regions.map((r) => [r.region.id, r.region.shortName, r.teamCount])).toEqual([
      ['norcal', 'NorCal', 49],
      ['socal', 'SoCal', 53],
    ]);
    expect(regions.map((r) => r.sections.map((s) => [s.section.id, s.leagues.map((l) => l.id)]))).toEqual([
      [['ccs', ['scval', 'bval', 'pcal']], ['ncs', ['mcal']], ['ns', ['eal']]],
      [['ss', ['sunset', 'independents']], ['sds', ['city', 'north-county', 'metro']]],
    ]);
    expect(goldenQueries.data.getLeagueSummaries('socal').map((l) => l.id)).toEqual(['sunset', 'city', 'north-county', 'metro', 'independents']);
    expect(goldenQueries.data.getLeagueSummaries('norcal').map((l) => l.id)).toEqual(['scval', 'bval', 'pcal', 'mcal', 'eal']);
    expect(goldenQueries.data.getLeagueSummaries()).toHaveLength(10);
  });

  it('exposes league health', () => {
    expect(goldenQueries.data.getLeagueHealth('scval').state).toBe('fresh');
    expect(goldenQueries.data.getLeagueHealth('mcal').state).toBe('degraded');
    expect(goldenQueries.data.getLeagueHealth('eal').state).toBe('degraded');
    expect(() => goldenQueries.data.getLeagueHealth('nope')).toThrow();
  });
});
