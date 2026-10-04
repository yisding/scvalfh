import { describe, expect, it } from 'vitest';

import { ALL_DIVISIONS, LEAGUES } from '../lib/leagues';
import {
  ACRONYM_COLLISIONS, FETCHABLE_TEAMS, TEAMS, getTeamById, getTeamBySlug, isRegistryTeamId,
  isWithdrawnSchool, normalizeTeamKey, onPrimaryInk, resolveOfficialName, resolveTeam,
  teamsInDivision, teamsInLeague,
} from '../lib/teams';

/**
 * FROZEN (SPEC §0.3): the 15 SCVAL slugs, abbrs, MaxPreps ids, names and division memberships.
 * localStorage pins, /teams/<slug> URLs, fixture names and the goldens depend on them.
 */
const SCVAL_FROZEN: ReadonlyArray<[slug: string, abbr: string, id: string, name: string, division: string]> = [
  ['st-ignatius', 'SI', '1dc4836b-4daf-4573-b525-27b474bd5366', 'St. Ignatius College Preparatory', 'de-anza'],
  ['saint-francis', 'SF', 'de6d3780-e8f6-4a2a-93f2-b5d89499f9b0', 'Saint Francis', 'de-anza'],
  ['los-altos', 'LA', '0279f2de-d5ce-484d-b210-2286ded42058', 'Los Altos', 'de-anza'],
  ['valley-christian', 'VC', '8a8c04d2-5606-44cf-9993-34db55474240', 'Valley Christian', 'de-anza'],
  ['fremont', 'FR', 'a97c219c-2fbe-4fa4-9a0c-cc18502a8d24', 'Fremont', 'de-anza'],
  ['cupertino', 'CU', '97ffffbe-54ba-4c25-86bb-41332627f64e', 'Cupertino', 'de-anza'],
  ['homestead', 'HM', '738a2432-7acb-4ad6-b041-115ec0f331c2', 'Homestead', 'de-anza'],
  ['mitty', 'MI', '0f63870a-34f3-4d5b-9dbf-653c8410f969', 'Archbishop Mitty', 'el-camino'],
  ['los-gatos', 'LG', 'bdb0b593-ef7f-4c69-8c2a-e0a48c934ca7', 'Los Gatos', 'el-camino'],
  ['palo-alto', 'PA', 'a38a628c-c65f-487f-a65e-7264b6804ce0', 'Palo Alto', 'el-camino'],
  ['presentation', 'PR', 'e1db3a4f-3bcf-4281-a574-d313212296a1', 'Presentation', 'el-camino'],
  ['santa-clara', 'SC', '17fad4fb-c82b-4b5a-8a31-3ce13c0ede13', 'Santa Clara', 'el-camino'],
  ['saratoga', 'SG', '12a470ab-e17d-4e5a-b74b-055d1f46d46b', 'Saratoga', 'el-camino'],
  ['lynbrook', 'LY', 'd7c7f7a1-06be-44fb-a4a2-64599519aa4c', 'Lynbrook', 'el-camino'],
  ['monta-vista', 'MV', '405614ad-a015-4270-b527-18e899c90824', 'Monta Vista', 'el-camino'],
];

describe('teams: the registry is the five leagues', () => {
  it('holds 49 teams, with per-division counts from the config', () => {
    expect(TEAMS).toHaveLength(49);
    expect(FETCHABLE_TEAMS).toHaveLength(TEAMS.length);
    for (const d of ALL_DIVISIONS) expect(teamsInDivision(d.id), d.id).toHaveLength(d.expectedTeams);
    expect(ALL_DIVISIONS.reduce((n, d) => n + d.expectedTeams, 0)).toBe(49);
    expect(LEAGUES.map((l) => [l.id, teamsInLeague(l.id).length])).toEqual([
      ['scval', 15], ['bval', 12], ['pcal', 7], ['mcal', 9], ['eal', 6],
    ]);
    // The EAL closes the registry, in alphabetical seed order.
    expect(TEAMS.slice(-6).map((t) => t.slug)).toEqual([
      'bella-vista', 'chico', 'corning', 'davis', 'lassen', 'pleasant-valley',
    ]);
  });

  it('freezes the 15 SCVAL slugs, abbrs, ids, names and divisions', () => {
    expect(
      teamsInLeague('scval').map((t) => [t.slug, t.abbr, t.id, t.name, t.division]),
    ).toEqual(SCVAL_FROZEN);
    // SCVAL keeps today's order and leads the registry.
    expect(TEAMS.slice(0, 15).map((t) => t.slug)).toEqual(SCVAL_FROZEN.map((r) => r[0]));
  });

  it('orders TEAMS by LEAGUES, and each team agrees with its league config', () => {
    const order = LEAGUES.map((l) => l.id);
    const leagueIndex = TEAMS.map((t) => order.indexOf(t.league));
    expect(leagueIndex).toEqual([...leagueIndex].sort((a, b) => a - b));
    for (const t of TEAMS) {
      const league = LEAGUES.find((l) => l.id === t.league)!;
      expect(league, t.slug).toBeDefined();
      expect(league.divisions.map((d) => d.id), t.slug).toContain(t.division);
      expect(t.section, t.slug).toBe(league.sectionId);
    }
  });

  it('has unique ids, slugs and abbrs across all 49, and well-formed slugs', () => {
    for (const key of ['id', 'slug', 'abbr'] as const) {
      const values = TEAMS.map((t) => t[key]);
      expect(new Set(values).size, key).toBe(TEAMS.length);
    }
    for (const t of TEAMS) {
      expect(t.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(t.abbr).toMatch(/^[A-Z]{2}$/);
      expect(t.shortName.length, t.slug).toBeLessThanOrEqual(14);
    }
    expect(resolveTeam('santa-clara')!.abbr).toBe('SC');
    expect(resolveTeam('saratoga')!.abbr).toBe('SG');
  });

  it('does not index acronyms that two teams share', () => {
    expect(ACRONYM_COLLISIONS).toEqual(['BHS', 'CHS', 'GHS', 'HHS', 'LHS', 'PHS', 'SCHS', 'SHS']);
    for (const acronym of ACRONYM_COLLISIONS) expect(resolveTeam(acronym), acronym).toBeUndefined();
    // A unique acronym still resolves.
    expect(resolveTeam('LAHS')?.slug).toBe('los-altos');
    expect(resolveTeam('SICP')?.slug).toBe('st-ignatius');
  });

  it('never carries a bare "University" alias (ambiguous statewide)', () => {
    for (const t of TEAMS) {
      for (const a of t.aliases) expect(normalizeTeamKey(a), `${t.slug}: ${a}`).not.toBe('university');
    }
    expect(resolveTeam('University')).toBeUndefined();
    expect(resolveTeam('San Francisco University High School')?.slug).toBe('university-sf');
  });

  it('resolves the new members, which were plain opponents before', () => {
    expect(resolveTeam('Leigh')?.slug).toBe('leigh');
    expect(resolveTeam('Prospect')?.slug).toBe('prospect');
    expect(resolveTeam('Ann Sobrato')?.slug).toBe('sobrato');
    expect(resolveTeam('San Benito')?.slug).toBe('hollister');
    expect(resolveTeam('Tamalpais High School')?.slug).toBe('tamalpais');
    expect(isRegistryTeamId('bd6662e8-a2ee-45ca-b0e8-dd03dec005c9')).toBe(true);
    expect(isRegistryTeamId('8396a0d3-8021-458d-b592-a5cb2c4a366d')).toBe(false);
    expect(isRegistryTeamId(null)).toBe(false);
  });

  it('resolves the EAL teams, including MaxPreps’ "Davis Sr." spelling', () => {
    expect(resolveTeam('Chico')?.slug).toBe('chico');
    expect(resolveTeam('Davis Sr.')?.slug).toBe('davis');
    expect(resolveTeam('Davis Senior High School')?.slug).toBe('davis');
    expect(resolveTeam('Pleasant Valley')?.slug).toBe('pleasant-valley');
    expect(resolveTeam('Bella Vista (Fair Oaks)')?.slug).toBe('bella-vista');
    expect(resolveTeam('Lassen Grizzlies')?.slug).toBe('lassen');
    expect(resolveTeam('Corning Cardinals')?.slug).toBe('corning');
    expect(resolveTeam('288ca10d-8448-41e9-b26e-463df226b8c8')?.slug).toBe('davis');
    // PVHS, DSHS and BVHS are unique acronyms; CHS (Chico, Corning) and LHS (Lassen) are shared.
    expect(resolveTeam('PVHS')?.slug).toBe('pleasant-valley');
    expect(resolveTeam('DSHS')?.slug).toBe('davis');
    expect(resolveTeam('BVHS')?.slug).toBe('bella-vista');
    for (const t of teamsInLeague('eal')) {
      expect([t.section, t.division], t.slug).toEqual(['ns', 'eal']);
    }
  });

  it('resolves official-grid tokens only inside their own league', () => {
    expect(resolveOfficialName('pcal', 'CAT/YOR')?.slug).toBe('santa-catalina');
    expect(resolveOfficialName('pcal', 'SCAT')?.slug).toBe('santa-catalina');
    expect(resolveOfficialName('pcal', 'CAR')?.slug).toBe('carmel');
    expect(resolveOfficialName('bval', 'WG')?.slug).toBe('willow-glen');
    expect(resolveOfficialName('mcal', 'U')?.slug).toBe('university-sf');
    expect(resolveOfficialName('mcal', 'UNIVERSITY')?.slug).toBe('university-sf');
    expect(resolveOfficialName('mcal', 'Convent & Stuart Hall')?.slug).toBe('convent-sacred-heart');
    expect(resolveOfficialName('mcal', 'Marin Catholic')?.slug).toBe('marin-catholic');
    // Grid codes never enter the global resolver, and a league never resolves another's team.
    expect(resolveTeam('CAR')).toBeUndefined();
    expect(resolveTeam('WG')).toBeUndefined();
    expect(resolveOfficialName('bval', 'CAR')).toBeUndefined();
    expect(resolveOfficialName('pcal', 'Los Altos')).toBeUndefined();
    expect(resolveOfficialName('nope', 'CAR')).toBeUndefined();
  });

  it('knows the withdrawn schools per league, and they never resolve', () => {
    expect(isWithdrawnSchool('York', 'pcal')).toBe(true);
    expect(isWithdrawnSchool('York', 'scval')).toBe(false);
    expect(isWithdrawnSchool('York')).toBe(true);
    for (const name of ['wilcox', 'WILCOX', 'Wilcox High School']) {
      expect(resolveTeam(name), name).toBeUndefined();
      expect(isWithdrawnSchool(name, 'scval'), name).toBe(true);
      expect(isWithdrawnSchool(name), name).toBe(true);
    }
    expect(resolveTeam('York')).toBeUndefined();
    // Red Bluff: a 0-0-0 row in MaxPreps' EAL table, not fielding a varsity team in 2026.
    expect(resolveTeam('Red Bluff')).toBeUndefined();
    expect(isWithdrawnSchool('Red Bluff')).toBe(true);
    expect(isWithdrawnSchool('Red Bluff Union High School', 'eal')).toBe(true);
    expect(isWithdrawnSchool('Red Bluff', 'mcal')).toBe(false);
    expect(isRegistryTeamId('4d3da788-bbe2-4ab9-b854-d95aa9786cda')).toBe(false);
    expect(isWithdrawnSchool('Fremont')).toBe(false);
    expect(isWithdrawnSchool(null)).toBe(false);
  });

  it('keys everything on the MaxPreps GUID, with our own slugs', () => {
    expect(resolveTeam('0279f2de-d5ce-484d-b210-2286ded42058')!.slug).toBe('los-altos');
    expect(resolveTeam('st-ignatius')!.id).toBe('1dc4836b-4daf-4573-b525-27b474bd5366');
    expect(resolveTeam('mitty')!.name).toBe('Archbishop Mitty');
    expect(getTeamById('7298608f-2310-4399-aa07-d6bc50df3f4e')?.slug).toBe('tamalpais');
    expect(getTeamBySlug('marin-academy')?.league).toBe('mcal');
  });

  it('resolves every alias spelling in every source', () => {
    const cases: Array<[string, string]> = [
      ['ST. IGNATIUS', 'st-ignatius'],
      ['Saint Ignatius', 'st-ignatius'],
      ['St Ignatius', 'st-ignatius'],
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
    // Division and league names are never team spellings.
    for (const name of ['Mt. Hamilton', 'Santa Teresa', 'Marin County', 'De Anza', 'El Camino']) {
      expect(resolveTeam(name), name).toBeUndefined();
    }
  });

  it('is case- and punctuation-insensitive and strips "High School"', () => {
    expect(normalizeTeamKey('St. Ignatius College Preparatory')).toBe('stignatiuscollegepreparatory');
    expect(normalizeTeamKey('Cupertino High School')).toBe('cupertino');
    expect(resolveTeam('  los   altos  ')?.slug).toBe('los-altos');
  });

  it('does not resolve schools outside the five leagues', () => {
    for (const name of ['Yuba City', 'La Jolla', 'Del Norte', 'Gunn', 'Irvington']) {
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
    expect(la.external.sbliveSchoolId).toBe('12174');
    // si.com ids and slugs are never guessed: Marin Academy has none observed.
    for (const t of TEAMS) {
      if (t.slug === 'marin-academy') {
        expect(t.external.sbliveTeamId).toBeUndefined();
        expect(t.external.sbliveGamesUrl).toBeUndefined();
        continue;
      }
      expect(t.external.sbliveTeamId, t.slug).toBeTruthy();
      expect(t.external.sbliveGamesUrl, t.slug).toContain(`/${t.external.sbliveTeamId}-`);
      expect(t.external.sbliveGamesUrl, t.slug).toMatch(
        /^https:\/\/www\.si\.com\/high-school\/stats\/california\/field-hockey\/teams\/\d+-[a-z0-9-]+\/games$/,
      );
      if (t.external.sbliveSchoolId !== undefined) expect(t.external.sbliveSchoolId).toMatch(/^\d+$/);
    }
    expect(resolveTeam('homestead')!.external.sbliveGamesUrl).toContain('458667-homestead-mustangs');
    expect(resolveTeam('santa-clara')!.external.sbliveGamesUrl).toContain('496839-santa-clara-bruins');
    // Only the two VERIFIED VNN siteIds exist.
    expect(resolveTeam('palo-alto')!.external.vnnIcsUrl).toContain('2635290');
    expect(resolveTeam('los-gatos')!.external.vnnIcsUrl).toContain('2634860');
    expect(TEAMS.filter((t) => t.external.vnnIcsUrl)).toHaveLength(2);
    // The six EAL teams carry si.com team ids, slugs and school ids (never their JV/FR ids).
    expect(teamsInLeague('eal').map((t) => [t.slug, t.external.sbliveTeamId, t.external.sbliveSchoolId])).toEqual([
      ['bella-vista', '459060', '12991'],
      ['chico', '458564', '10335'],
      ['corning', '458585', '10501'],
      ['davis', '458605', '10575'],
      ['lassen', '458783', '11554'],
      ['pleasant-valley', '458566', '10337'],
    ]);
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
