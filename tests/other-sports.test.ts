/**
 * The links between the sport sites (lib/sports/sites.ts, lib/schools/other-sports.ts): the footer names every
 * other sport's site, and a team page links the same school's page on exactly the other sites whose registry holds
 * it, by that registry's slug.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SEEDS_BY_SPORT, otherSportTeams } from '../lib/schools/other-sports';
import { SPORT_IDS } from '../lib/sports/current';
import { OTHER_SPORT_SITES, SPORT_SITE_ORIGINS, programTitle } from '../lib/sports/sites';
import { SITE_NAME } from '../components/layout/site';
import { TEAMS } from '../lib/teams';

describe('the sport sites', () => {
  it('names each program as its site does', () => {
    expect(SPORT_IDS.map(programTitle)).toEqual(['Field Hockey', 'Girls Soccer', 'Boys Basketball', 'Girls Volleyball']);
    expect(SITE_NAME).toBe('NorCal High School Field Hockey');
  });

  it('lists every site but this build’s own, at its production origin', () => {
    expect(OTHER_SPORT_SITES).toEqual([
      { id: 'soccer', title: 'Girls Soccer', href: 'https://soccer.ncfh.net/' },
      { id: 'basketball', title: 'Boys Basketball', href: 'https://basketball.ncfh.net/' },
      { id: 'volleyball', title: 'Girls Volleyball', href: 'https://volleyball.ncfh.net/' },
    ]);
  });
});

describe('a school’s other sports', () => {
  it('links exactly the other registries that hold the school, never this build’s sport', () => {
    for (const team of TEAMS) {
      const expected = SPORT_IDS.filter((s) => s !== 'field-hockey').flatMap((sport) => {
        const seed = SEEDS_BY_SPORT[sport].find((s) => s.id === team.id);
        return seed ? [`${SPORT_SITE_ORIGINS[sport]}/teams/${seed.slug}`] : [];
      });
      expect(otherSportTeams(team.id).map((o) => o.href)).toEqual(expected);
    }
  });

  it('gives an SCVAL school all three, a PCAL or SoCal school none, and a soccer-only school no basketball link', () => {
    const lynbrook = TEAMS.find((t) => t.slug === 'lynbrook')!;
    expect(otherSportTeams(lynbrook.id)).toEqual([
      { sport: 'soccer', title: 'Girls Soccer', href: 'https://soccer.ncfh.net/teams/lynbrook' },
      { sport: 'basketball', title: 'Boys Basketball', href: 'https://basketball.ncfh.net/teams/lynbrook' },
      { sport: 'volleyball', title: 'Girls Volleyball', href: 'https://volleyball.ncfh.net/teams/lynbrook' },
    ]);
    for (const t of TEAMS.filter((t) => t.league !== 'scval' && t.league !== 'bval')) {
      expect(otherSportTeams(t.id), t.slug).toEqual([]);
    }
    // A WCAL school is in soccer and volleyball, never basketball.
    const wcal = SEEDS_BY_SPORT.soccer.find((s) => s.league === 'wcal')!;
    expect(SEEDS_BY_SPORT.basketball.some((s) => s.id === wcal.id)).toBe(false);
    expect(otherSportTeams(wcal.id).map((o) => o.sport)).toEqual(['soccer', 'volleyball']);
  });

  it('is the same school under the same slug in every registry', () => {
    const slugs = new Map<string, string>();
    for (const sport of SPORT_IDS) {
      for (const s of SEEDS_BY_SPORT[sport]) {
        expect(slugs.get(s.id) ?? s.slug, `${sport} ${s.id}`).toBe(s.slug);
        slugs.set(s.id, s.slug);
      }
    }
  });
});

describe('in another sport’s build', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('links field hockey and the other two, not itself', async () => {
    vi.stubEnv('SCVAL_SPORT', 'basketball');
    vi.resetModules();
    const sites = await import('../lib/sports/sites');
    const others = await import('../lib/schools/other-sports');
    expect(sites.OTHER_SPORT_SITES.map((s) => s.href)).toEqual([
      'https://ncfh.net/',
      'https://soccer.ncfh.net/',
      'https://volleyball.ncfh.net/',
    ]);
    const gunn = others.SEEDS_BY_SPORT.basketball.find((s) => s.slug === 'gunn')!;
    // Gunn plays no field hockey in this registry: soccer and volleyball only.
    expect(others.otherSportTeams(gunn.id).map((o) => o.sport)).toEqual(['soccer', 'volleyball']);
  });
});
