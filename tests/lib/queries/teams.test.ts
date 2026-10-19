/**
 * lib/queries/teams.ts: teams, the team search index, head-to-head and form, against the committed v1 golden
 * snapshot migrated to v2 (tests/support/golden-queries.ts).
 */

import { describe, expect, it } from 'vitest';

import { getTeamById, getTeamBySlug } from '@/lib/registry/teams';
import { goldenQueries } from '@/tests/support/golden-queries';

describe('data: teams', () => {
  it('returns all 102, one division, or one league', () => {
    expect(goldenQueries.data.getTeams().length).toBe(102);
    expect(goldenQueries.data.getTeams('de-anza').length).toBe(7);
    expect(goldenQueries.data.getTeams({ division: 'el-camino' }).length).toBe(8);
    expect(goldenQueries.data.getTeams({ league: 'bval' }).length).toBe(12);
    expect(goldenQueries.data.getTeams({ league: 'pcal' }).map((t) => t.division)).toEqual(Array(7).fill('pcal'));
    expect(goldenQueries.data.getTeams({ league: 'bval', division: 'santa-teresa' }).length).toBe(6);
    expect(goldenQueries.data.getTeams({ league: 'eal' }).map((t) => t.slug)).toEqual([
      'bella-vista', 'chico', 'corning', 'davis', 'lassen', 'pleasant-valley',
    ]);
    expect(goldenQueries.data.getTeams({ league: 'sunset' })).toHaveLength(8);
    expect(goldenQueries.data.getTeams({ league: 'north-county' })).toHaveLength(19);
    expect(goldenQueries.data.getTeams('valley')).toHaveLength(6);
    expect(goldenQueries.data.getTeams({ league: 'independents' }).map((t) => t.slug)).toEqual(['bonita', 'chaminade', 'glendora', 'harvard-westlake', 'thousand-oaks']);
  });

  it('groups section → league → division', () => {
    const grouped = goldenQueries.data.getTeamsGrouped();
    expect(grouped.map((g) => g.section.id)).toEqual(['ccs', 'ncs', 'ns', 'ss', 'sds']);
    expect(grouped[0].leagues.map((l) => l.league.id)).toEqual(['scval', 'bval', 'pcal']);
    expect(grouped[1].leagues[0].divisions).toHaveLength(1);
    expect(grouped[1].leagues[0].divisions[0].heading).toBeNull();
    expect(grouped[2].leagues.map((l) => l.league.id)).toEqual(['eal']);
    expect(grouped[2].leagues[0].divisions.map((d) => [d.id, d.heading, d.teams.length])).toEqual([['eal', null, 6]]);
    expect(grouped.flatMap((g) => g.leagues.flatMap((l) => l.divisions.flatMap((d) => d.teams)))).toHaveLength(102);
    // One region's sections only.
    const norcal = goldenQueries.data.getTeamsGrouped('norcal');
    expect(norcal.map((g) => g.section.id)).toEqual(['ccs', 'ncs', 'ns']);
    expect(norcal.flatMap((g) => g.leagues.flatMap((l) => l.divisions.flatMap((d) => d.teams)))).toHaveLength(49);
    const socal = goldenQueries.data.getTeamsGrouped('socal');
    expect(socal.map((g) => g.section.id)).toEqual(['ss', 'sds']);
    expect(socal[0].leagues.map((l) => [l.league.id, l.divisions.map((d) => [d.id, d.heading, d.teams.length])])).toEqual([
      ['sunset', [['sunset', null, 8]]],
      ['independents', [['independents', null, 5]]],
    ]);
    expect(socal[1].leagues.map((l) => [l.league.id, l.divisions.map((d) => [d.id, d.heading, d.teams.length])])).toEqual([
      ['city', [['city-western', 'City Western', 6], ['city-eastern', 'City Eastern', 6]]],
      ['north-county', [['avocado', 'Avocado', 6], ['palomar', 'Palomar', 7], ['valley', 'Valley', 6]]],
      ['metro', [['metro-mesa', 'Metro Mesa', 5], ['metro-south-bay', 'Metro South Bay', 4]]],
    ]);
  });

  it('looks a team up by slug or GUID', () => {
    const team = getTeamBySlug('los-altos');
    expect(team?.name).toBe('Los Altos');
    expect(getTeamById(team!.id)?.slug).toBe('los-altos');
    expect(goldenQueries.data.getTeamForm(team!.id)).toBeDefined(); // a GUID resolves as well as a slug
    expect(getTeamBySlug('nope')).toBeUndefined();
    expect(goldenQueries.data.getTeamSlugs()).toHaveLength(102);
  });

  it('builds the search index in LEAGUES then registry order', () => {
    const index = goldenQueries.data.getTeamSearchIndex();
    expect(index.teams).toHaveLength(102);
    expect(index.teams.map((t) => t.slug)).toEqual(goldenQueries.data.getTeams().map((t) => t.slug));
    expect(goldenQueries.data.getTeamSearchIndex()).toBe(index);
  });
});

describe('data: head-to-head and form', () => {
  it('summarises a meeting between two teams', () => {
    const h2h = goldenQueries.data.getHeadToHead('los-altos', 'saint-francis');
    expect(h2h).toBeDefined();
    expect(h2h!.games.length).toBeGreaterThan(0);
    expect(h2h!.aRecord.w + h2h!.aRecord.l + h2h!.aRecord.t).toBeLessThanOrEqual(h2h!.games.length);
    expect(goldenQueries.data.getHeadToHead('los-altos', 'los-altos')).toBeUndefined();
  });

  it('returns a team form strip over counted games only', () => {
    const form = goldenQueries.data.getTeamForm('homestead');
    expect(form).toBeDefined();
    const last5 = goldenQueries.data.getStandingFor('homestead')!.computed.last5;
    expect(last5.length).toBeGreaterThan(0);
    expect(form!.leagueGames.length).toBeGreaterThan(last5.length);
    for (const g of form!.leagueGames) {
      expect(goldenQueries.data.getGameById(g.contestId)!.countsFor).not.toBeNull();
      if (g.status !== 'final') expect(g.margin).toBeNull();
    }
  });

  it('knows nothing of a school that is not fielding a team', () => {
    expect(getTeamBySlug('wilcox')).toBeUndefined();
    expect(goldenQueries.data.getTeamForm('wilcox')).toBeUndefined();
  });
});
