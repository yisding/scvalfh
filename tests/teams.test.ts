import { describe, expect, it } from 'vitest';

import { FETCHABLE_TEAMS, TEAMS, isWithdrawnSchool, normalizeTeamKey, onPrimaryInk, resolveTeam, teamsInDivision } from '../lib/teams';

describe('teams: the registry is the league', () => {
  it('holds 15 SCVAL members: De Anza 7, El Camino 8', () => {
    expect(TEAMS.length).toBe(15);
    expect(teamsInDivision('de-anza').length).toBe(7);
    expect(teamsInDivision('el-camino').length).toBe(8);
    for (const t of TEAMS) expect(t.isScvalMember).toBe(true);
  });

  it('has unique ids, slugs, acronyms and monogram abbrs', () => {
    for (const key of ['id', 'slug', 'acronym', 'abbr'] as const) {
      const values = TEAMS.map((t) => t[key]);
      expect(new Set(values).size, key).toBe(TEAMS.length);
    }
    // The one collision the design had to resolve by hand.
    expect(resolveTeam('santa-clara')!.abbr).toBe('SC');
    expect(resolveTeam('saratoga')!.abbr).toBe('SG');
  });

  it('carries 15 fetchable teams and no Wilcox, which is not fielding a team', () => {
    expect(FETCHABLE_TEAMS.length).toBe(15);
    for (const name of ['wilcox', 'WILCOX', 'Wilcox High School']) {
      expect(resolveTeam(name), name).toBeUndefined();
      expect(isWithdrawnSchool(name), name).toBe(true);
    }
    expect(isWithdrawnSchool('Fremont')).toBe(false);
  });

  it('keys everything on the MaxPreps GUID, with our own slugs', () => {
    expect(resolveTeam('0279f2de-d5ce-484d-b210-2286ded42058')!.slug).toBe('los-altos');
    expect(resolveTeam('st-ignatius')!.id).toBe('1dc4836b-4daf-4573-b525-27b474bd5366');
    // Slugs are decoupled from MaxPreps slugs (DESIGN §12.9).
    expect(resolveTeam('mitty')!.name).toBe('Archbishop Mitty');
    expect(resolveTeam('st-ignatius')!.name).toBe('St. Ignatius College Preparatory');
  });

  it('resolves every alias spelling in every source (SPEC §2.3)', () => {
    const cases: Array<[string, string]> = [
      ['ST. IGNATIUS', 'st-ignatius'],
      ['Saint Ignatius', 'st-ignatius'],
      ['St Ignatius', 'st-ignatius'],
      ['SICP', 'st-ignatius'],
      ['ST. FRANCIS', 'saint-francis'],
      ['St. Francis', 'saint-francis'],
      ['MITTY', 'mitty'],
      ['Archbishop Mitty', 'mitty'],
      ['Santa Clara High School', 'santa-clara'],
      ['SANTA CLARA', 'santa-clara'],
      ['Paly', 'palo-alto'],
      ['Palo Alto High School', 'palo-alto'],
      ['Los Gatos', 'los-gatos'],
      ['VALLEY CHRISTIAN', 'valley-christian'],
      ['Monta Vista Matadors', 'monta-vista'],
    ];
    for (const [input, slug] of cases) {
      expect(resolveTeam(input)?.slug, input).toBe(slug);
    }
  });

  it('is case- and punctuation-insensitive and strips "High School"', () => {
    expect(normalizeTeamKey('St. Ignatius College Preparatory')).toBe('stignatiuscollegepreparatory');
    expect(normalizeTeamKey('Cupertino High School')).toBe('cupertino');
    expect(resolveTeam('  los   altos  ')?.slug).toBe('los-altos');
  });

  it('does not resolve non-SCVAL opponents — they are names, not Teams', () => {
    for (const name of ['Prospect', 'Leigh', 'Branham', 'Live Oak', 'Chico', 'La Jolla']) {
      expect(resolveTeam(name), name).toBeUndefined();
    }
    expect(resolveTeam(null)).toBeUndefined();
    expect(resolveTeam('')).toBeUndefined();
  });

  it('links out with URLs taken from the source, never string-built', () => {
    const la = resolveTeam('los-altos')!;
    expect(la.external.maxprepsTeamUrl).toBe(
      'https://www.maxpreps.com/ca/los-altos/los-altos-eagles/field-hockey/',
    );
    expect(la.external.maxprepsScheduleUrl).toMatch(/\/schedule\/$/);
    expect(la.external.sbliveGamesUrl).toContain('458850-los-altos-eagles');
    // All 15 si.com slugs were harvested from live payloads on 2026-09-29, never guessed, so
    // SPEC §7.3's TODO is closed. Each URL must carry its own numeric SBLive id.
    for (const t of TEAMS) {
      expect(t.external.sbliveTeamId, t.slug).toBeTruthy();
      expect(t.external.sbliveGamesUrl, t.slug).toContain(`/${t.external.sbliveTeamId}-`);
      expect(t.external.sbliveGamesUrl, t.slug).toMatch(
        /^https:\/\/www\.si\.com\/high-school\/stats\/california\/field-hockey\/teams\/\d+-[a-z0-9-]+\/games$/,
      );
    }
    expect(resolveTeam('homestead')!.external.sbliveGamesUrl).toContain('458667-homestead-mustangs');
    expect(resolveTeam('santa-clara')!.external.sbliveGamesUrl).toContain('496839-santa-clara-bruins');
    // Only the two VERIFIED VNN siteIds exist; the other 14 schools have none (SPEC §1.5).
    expect(resolveTeam('palo-alto')!.external.vnnIcsUrl).toContain('2635290');
    expect(resolveTeam('los-gatos')!.external.vnnIcsUrl).toContain('2634860');
    expect(TEAMS.filter((t) => t.external.vnnIcsUrl)).toHaveLength(2);
  });

  it('never hotlinks a mascot image (DESIGN §12.4)', () => {
    for (const t of TEAMS) expect(t.mascotUrl).toBeNull();
  });

  it('computes monogram ink by measured contrast', () => {
    expect(onPrimaryInk('FFFFFF')).toBe('#0e1116');
    expect(onPrimaryInk('222222')).toBe('#ffffff');
    expect(onPrimaryInk('FFC005')).toBe('#0e1116');
    for (const t of TEAMS) expect(t.colors.onPrimary).toBe(onPrimaryInk(t.colors.primary));
  });
});
