/** lib/search.ts over the real registry and config (SPEC §9.1-§9.2 regression cases). */

import { describe, expect, it } from 'vitest';

import { DATA_QUALITY, LEAGUES, SECTIONS } from '../lib/leagues';
import { buildSearchIndex, normalizeQuery, searchTeams } from '../lib/search';
import { TEAMS } from '../lib/teams';

const INDEX = buildSearchIndex(
  TEAMS.map((t) => ({
    slug: t.slug, name: t.name, shortName: t.shortName, abbr: t.abbr, city: t.city, mascot: t.mascot,
    aliases: [...t.aliases], leagueId: t.league, division: t.division,
    colors: { primary: t.colors.primary, onPrimary: t.colors.onPrimary },
  })),
  LEAGUES.map((l) => ({
    id: l.id, shortName: l.shortName, name: l.name,
    sectionShort: SECTIONS.find((s) => s.id === l.sectionId)!.shortName,
    ...(l.independents ? { independent: true } : {}),
    divisions: l.divisions.map((d) => ({
      id: d.id, label: d.label, heading: l.divisions.length === 1 ? null : d.label,
      searchAliases: d.searchAliases, teamCount: d.expectedTeams,
    })),
  })),
  DATA_QUALITY.notCovered,
);

const slugs = (q: string) => searchTeams(INDEX, q).teams.map((t) => t.entry.slug);
const groupIds = (q: string) => searchTeams(INDEX, q).groups.map((g) => `${g.kind}:${g.id}`);

describe('normalizeQuery', () => {
  it('normalizes per §9.2', () => {
    expect(normalizeQuery('  St. Francis ')).toEqual({ compact: 'saintfrancis', tokens: ['saint', 'francis'] });
    expect(normalizeQuery('Lick-Wilmerding')).toEqual({ compact: 'lickwilmerding', tokens: ['lick', 'wilmerding'] });
    expect(normalizeQuery('Convent & Stuart Hall').tokens).toEqual(['convent', 'and', 'stuart', 'hall']);
    expect(normalizeQuery('Berkeley High School').tokens).toEqual(['berkeley']);
    expect(normalizeQuery('High School').tokens).toEqual(['high', 'school']);
    expect(normalizeQuery('Tamalpaïs').compact).toBe('tamalpais');
  });
});

describe('buildSearchIndex', () => {
  it('holds the 102 teams in LEAGUES then registry order, with no league or division labels in team keys', () => {
    expect(INDEX.teams.map((t) => t.slug)).toEqual(TEAMS.map((t) => t.slug));
    expect(INDEX.teams).toHaveLength(102);
    const labels = new Set(
      LEAGUES.flatMap((l) => [l.shortName, l.name, ...l.divisions.flatMap((d) => [d.label, ...d.searchAliases])])
        .map((s) => normalizeQuery(s).compact),
    );
    for (const t of INDEX.teams) {
      for (const k of t.keys.whole) expect(labels.has(k), `${t.slug}: ${k}`).toBe(false);
      for (const tok of [...t.keys.nameTokens, ...t.keys.cityTokens, ...t.keys.mascotTokens]) {
        // 'city' and 'metro' are not in this list: 'University City' is a school's own name, not the City Conference.
        expect(['scval', 'bval', 'pcal', 'mcal', 'eal', 'sunset', 'gabilan'], `${t.slug}: ${tok}`).not.toContain(tok);
      }
    }
    expect(INDEX.teams.find((t) => t.slug === 'leigh')!.divisionLabel).toBe('Mt. Hamilton');
    expect(INDEX.teams.find((t) => t.slug === 'tamalpais')!.divisionLabel).toBeNull();
  });

  it('builds league and division groups', () => {
    expect(INDEX.groups.map((g) => `${g.kind}:${g.id}`)).toEqual([
      'league:scval', 'division:de-anza', 'division:el-camino',
      'league:bval', 'division:mt-hamilton', 'division:santa-teresa',
      'league:pcal', 'league:mcal', 'league:eal',
      'league:sunset',
      'league:city', 'division:city-western', 'division:city-eastern',
      'league:north-county', 'division:avocado', 'division:palomar', 'division:valley',
      'league:metro', 'division:metro-mesa', 'division:metro-south-bay',
      'league:independents',
    ]);
    expect(INDEX.groups.find((g) => g.kind === 'league' && g.id === 'sunset')).toMatchObject({
      label: 'Sunset', detail: 'Sunset field hockey league · SS · 8 teams', href: '/standings/sunset',
    });
    expect(INDEX.groups.find((g) => g.id === 'palomar')).toMatchObject({
      label: 'Palomar', detail: 'North division · 7 teams', href: '/standings/north-county#palomar',
    });
    // The North County Conference's short name is 'North' (2026-10-06); its full name still finds it.
    expect(INDEX.groups.find((g) => g.kind === 'league' && g.id === 'north-county')).toMatchObject({
      label: 'North', detail: 'North County Conference · SDS · 19 teams', href: '/standings/north-county',
    });
    expect(INDEX.groups.find((g) => g.kind === 'league' && g.id === 'independents')).toMatchObject({
      label: 'LA', detail: 'LA independents · SS · 5 teams', href: '/standings/independents',
    });
    expect(INDEX.groups.find((g) => g.kind === 'league' && g.id === 'metro')).toMatchObject({
      label: 'Metro', detail: 'Metro Conference · SDS · 9 teams', href: '/standings/metro',
    });
    const st = INDEX.groups.find((g) => g.id === 'santa-teresa')!;
    expect(st).toMatchObject({ label: 'Santa Teresa', detail: 'BVAL division · 6 teams', href: '/standings/bval#santa-teresa' });
    const mcal = INDEX.groups.find((g) => g.id === 'mcal')!;
    expect(mcal).toMatchObject({
      label: 'MCAL', detail: 'Marin County Athletic League · NCS · 9 teams', href: '/standings/mcal',
    });
    const eal = INDEX.groups.find((g) => g.kind === 'league' && g.id === 'eal')!;
    expect(eal).toMatchObject({
      label: 'EAL', detail: 'Eastern Athletic League · NS · 6 teams', href: '/standings/eal',
    });
    expect(INDEX.teams.find((t) => t.slug === 'davis')!.divisionLabel).toBeNull();
    expect(JSON.stringify(INDEX).toLowerCase()).not.toContain('gabilan');
  });
});

describe('searchTeams — §9.2 regression cases', () => {
  it('"st" → Stevenson (abbr, raw query), then Saint Francis and St Ignatius', () => {
    const r = searchTeams(INDEX, 'st');
    expect(r.teams[0]).toMatchObject({ score: 90, why: 'abbr' });
    expect(r.teams[0].entry.slug).toBe('stevenson');
    expect(r.teams.slice(1).map((t) => t.entry.slug).sort()).toEqual(['saint-francis', 'st-ignatius']);
    expect(r.teams).toHaveLength(3);
  });

  it('"Santa Teresa" → 0 teams + 1 division', () => {
    const r = searchTeams(INDEX, 'Santa Teresa');
    expect(r.teams).toEqual([]);
    expect(r.groups.map((g) => g.id)).toEqual(['santa-teresa']);
  });

  it('"santa" → Santa Clara and Santa Catalina + the Santa Teresa division (+ the SCVAL league by its name)', () => {
    expect(slugs('santa')).toEqual(['santa-clara', 'santa-catalina']);
    expect(groupIds('santa')).toContain('division:santa-teresa');
  });

  it('"Carmel" → Carmel first (score 100), then Mt. Carmel on a name word', () => {
    const r = searchTeams(INDEX, 'Carmel');
    expect(r.teams.map((t) => [t.entry.slug, t.score])).toEqual([['carmel', 100], ['mt-carmel', 70]]);
    expect(slugs('Mt. Carmel')[0]).toBe('mt-carmel');
    expect(slugs('Mount Carmel')[0]).toBe('mt-carmel');
  });

  it('"University" → San Francisco University, then University City', () => {
    expect(slugs('University')[0]).toBe('university-sf');
    expect(slugs('university')).toEqual(['university-sf', 'university-city']);
    expect(slugs('University City')).toEqual(['university-city']);
  });

  it('"Del Norte" → the San Diego school (the Crescent City ghost is MaxPreps data only)', () => {
    expect(searchTeams(INDEX, 'Del Norte')).toMatchObject({ groups: [], notCovered: [] });
    expect(slugs('Del Norte')).toEqual(['del-norte']);
  });

  it('"York" and "Wilcox" → not covered, exact keys only', () => {
    const r = searchTeams(INDEX, 'York');
    expect(r.teams).toEqual([]);
    expect(r.notCovered.map((n) => n.reason)).toEqual(['York plays JV field hockey only, so it has no varsity results here.']);
    expect(searchTeams(INDEX, 'wilcox').notCovered.map((n) => n.reason)).toEqual(['Wilcox is not fielding a varsity team in 2026.']);
    expect(searchTeams(INDEX, 'yor').notCovered).toEqual([]);
    expect(searchTeams(INDEX, 'York School').notCovered).toHaveLength(1);
  });

  it('"Red Bluff" → not covered (not fielding a varsity team), exact keys only', () => {
    const r = searchTeams(INDEX, 'Red Bluff');
    expect(r.teams).toEqual([]);
    expect(r.notCovered.map((n) => n.reason)).toEqual(['Red Bluff is not fielding a varsity team in 2026.']);
    expect(searchTeams(INDEX, 'Red Bluff Spartans').notCovered).toHaveLength(1);
    expect(searchTeams(INDEX, 'Red Bl').notCovered).toEqual([]);
  });

  it('"Eastern Athletic" / "EAL" → the EAL league group, no team; "chico" → Chico, then Pleasant Valley (Chico)', () => {
    for (const q of ['EAL', 'Eastern Athletic', 'eastern athletic league']) {
      expect(groupIds(q), q).toEqual(['league:eal']);
      expect(slugs(q), q).toEqual([]);
    }
    expect(slugs('chico')).toEqual(['chico', 'pleasant-valley']);
    expect(slugs('Davis Sr.')[0]).toBe('davis');
    // The EAL's two-letter abbrs win on the abbr rule, like 'MC' and 'SF'.
    for (const [q, slug] of [['PV', 'pleasant-valley'], ['CI', 'chico'], ['CR', 'corning'], ['DV', 'davis'], ['LS', 'lassen'], ['BV', 'bella-vista']]) {
      expect(searchTeams(INDEX, q).teams[0], q).toMatchObject({ score: 90, why: 'abbr', entry: { slug } });
    }
  });

  it('"Wildcats" → 4 teams', () => {
    expect(slugs('Wildcats').sort()).toEqual(['los-gatos', 'marin-academy', 'marin-catholic', 'st-ignatius']);
    expect(slugs('wildcat').sort()).toEqual(['los-gatos', 'marin-academy', 'marin-catholic', 'st-ignatius']);
  });

  it('"MC" → Marin Catholic; "SF" → Saint Francis; "LW" → Lick-Wilmerding (abbr wins)', () => {
    expect(slugs('MC')[0]).toBe('marin-catholic');
    expect(slugs('SF')[0]).toBe('saint-francis');
    expect(searchTeams(INDEX, 'SF').teams[0]).toMatchObject({ score: 90, why: 'abbr' });
    expect(slugs('lw')[0]).toBe('lick-wilmerding');
  });

  it('"st francis" / "Saint Francis" / "st. francis" → Saint Francis first', () => {
    for (const q of ['st francis', 'Saint Francis', 'st. francis', 'ST. FRANCIS']) {
      const r = searchTeams(INDEX, q);
      expect(r.teams[0].entry.slug, q).toBe('saint-francis');
      expect(r.teams[0].score, q).toBe(100);
    }
  });

  it('"Mount Hamilton" / "mt ham" → the Mt. Hamilton division, no team', () => {
    for (const q of ['Mount Hamilton', 'mt ham', 'Mt. Hamilton']) {
      const r = searchTeams(INDEX, q);
      expect(r.teams, q).toEqual([]);
      expect(r.groups.map((g) => g.id), q).toEqual(['mt-hamilton']);
    }
  });

  it('"BVAL" → the BVAL league group, no team', () => {
    const r = searchTeams(INDEX, 'BVAL');
    expect(r.teams).toEqual([]);
    expect(r.groups.map((g) => `${g.kind}:${g.id}`)).toEqual(['league:bval']);
  });

  it('"mcal" / "marin county" → the MCAL league group; "marin" also finds the Marin schools by name', () => {
    expect(groupIds('mcal')).toEqual(['league:mcal']);
    expect(slugs('mcal')).toEqual([]);
    expect(groupIds('marin county')).toEqual(['league:mcal']);
    expect(slugs('marin county')).toEqual([]);
    expect(groupIds('marin')).toEqual(['league:mcal']);
    // Marina (Huntington Beach) starts with "marin" too: a whole-key prefix (80) below the two name-word matches.
    expect(slugs('marin')).toEqual(['marin-catholic', 'marin-academy', 'marina']);
  });

  it('"Gabilan" → nothing at all', () => {
    expect(searchTeams(INDEX, 'Gabilan')).toEqual({ teams: [], groups: [], notCovered: [] });
  });

  it('"los a" → Los Altos, not Los Gatos; "lyn" → Lynbrook', () => {
    expect(slugs('los a')).toEqual(['los-altos']);
    expect(slugs('lyn')).toEqual(['lynbrook']);
  });

  it('"san jose" → the San Jose schools on city; "monterey" → Monterey, then Santa Catalina', () => {
    const sj = searchTeams(INDEX, 'san jose');
    // Two San Jose schools carry '(San Jose)' in an alias, so they rank on name tokens (70) above the city rule (40).
    expect(sj.teams.every((t) => t.entry.city === 'San Jose' && t.score >= 40)).toBe(true);
    expect(sj.teams.map((t) => t.entry.slug).sort()).toEqual(TEAMS.filter((t) => t.city === 'San Jose').map((t) => t.slug).sort());
    expect(sj.teams.filter((t) => t.why === 'city').map((t) => t.score)).not.toContain(70);
    expect(slugs('monterey')).toEqual(['monterey', 'santa-catalina']);
  });

  it('every one of the 99 names returns that team first', () => {
    for (const t of TEAMS) expect(slugs(t.name)[0], t.name).toBe(t.slug);
  });

  it('every alias returns its team in the top 3', () => {
    for (const t of TEAMS) {
      for (const a of t.aliases) expect(slugs(a).slice(0, 3), `${t.slug}: ${a}`).toContain(t.slug);
    }
  });

  it('a 1-character query returns nothing', () => {
    for (const q of ['s', 'M', ' a ', '', '&']) {
      expect(searchTeams(INDEX, q), q).toEqual({ teams: [], groups: [], notCovered: [] });
    }
  });

  it('applies the limit to teams only, keeping relevance then index order', () => {
    const all = searchTeams(INDEX, 'san jose').teams;
    const top = searchTeams(INDEX, 'san jose', { limit: 8 }).teams;
    expect(all.length).toBeGreaterThan(8);
    expect(top).toEqual(all.slice(0, 8));
  });
});

describe('searchTeams — the Southern California amendment', () => {
  it('"Harvard-Westlake", "Thousand Oaks", "Glendora" → their team pages: the LA independents (DESIGN §24.9)', () => {
    for (const [q, slug] of [
      ['Harvard-Westlake', 'harvard-westlake'], ['harvard westlake', 'harvard-westlake'], ['Harvard', 'harvard-westlake'],
      ['Thousand Oaks', 'thousand-oaks'], ['Thousand Oaks Lancers', 'thousand-oaks'],
      ['Glendora', 'glendora'], ['glendora tartans', 'glendora'],
    ] as const) {
      const r = searchTeams(INDEX, q);
      expect(r.teams[0]?.entry.slug, q).toBe(slug);
      expect(r.teams[0]?.entry.leagueShort, q).toBe('LA');
      expect(r.notCovered, q).toEqual([]);
    }
    // The group finds its block by its name and by "independent(s)".
    for (const q of ['independent', 'Independents', 'LA independents']) {
      expect(searchTeams(INDEX, q).groups.map((g) => `${g.kind}:${g.id}`), q).toEqual(['league:independents']);
    }
  });

  it('"River Valley", "North Salinas", "Notre Dame" → not covered: no 2026 varsity game', () => {
    expect(searchTeams(INDEX, 'River Valley').notCovered.map((n) => n.reason)).toEqual([
      'River Valley (Yuba City, Sac-Joaquin Section) has no 2026 varsity game on MaxPreps, so it has no page here.',
    ]);
    expect(searchTeams(INDEX, 'North Salinas').notCovered.map((n) => n.reason)).toEqual([
      'North Salinas has no 2026 varsity game on MaxPreps, so it has no page here.',
    ]);
    expect(searchTeams(INDEX, 'Notre Dame').notCovered.map((n) => n.reason)).toEqual([
      'Notre Dame (Salinas) has no 2026 varsity game on MaxPreps, so it has no page here.',
    ]);
  });

  it('"Madison", "Santana", "Mayfair" → not covered: no 2026 varsity game', () => {
    expect(searchTeams(INDEX, 'Madison').notCovered.map((n) => n.reason)).toEqual([
      'Madison has no 2026 varsity game on MaxPreps or in the San Diego Section’s power rankings, so it has no page here.',
    ]);
    expect(searchTeams(INDEX, 'Santana Sultans').notCovered.map((n) => n.name)).toEqual(['Santana']);
    expect(searchTeams(INDEX, 'Mayfair').notCovered.map((n) => n.reason)).toEqual([
      'Mayfair has no 2026 varsity game on MaxPreps and is not on the Southern Section’s list of participating schools.',
    ]);
    for (const q of ['Madison', 'Santana', 'Mayfair', 'Castle Park', 'Montgomery', 'Sweetwater']) expect(slugs(q), q).toEqual([]);
  });

  it('"Chula Vista" → the five Chula Vista teams on city, and the note that Chula Vista High has no game', () => {
    const r = searchTeams(INDEX, 'Chula Vista');
    expect(r.teams.map((t) => t.entry.slug).sort()).toEqual(
      TEAMS.filter((t) => t.city === 'Chula Vista').map((t) => t.slug).sort(),
    );
    expect(r.notCovered.map((n) => n.name)).toEqual(['Chula Vista']);
  });

  it('finds the SoCal leagues and divisions as groups, never as teams', () => {
    expect(groupIds('Sunset')).toEqual(['league:sunset']);
    expect(slugs('Sunset')).toEqual([]);
    expect(groupIds('North County')).toEqual(['league:north-county']);
    expect(groupIds('City Western')).toEqual(['division:city-western']);
    expect(groupIds('metro')).toEqual(['league:metro', 'division:metro-mesa', 'division:metro-south-bay']);
    expect(groupIds('Avocado')).toEqual(['division:avocado']);
  });

  it('"LJCD" and "RBV" resolve as aliases; two-letter abbrs win for the new teams too', () => {
    expect(slugs('LJCD')[0]).toBe('la-jolla-country-day');
    expect(slugs('RBV')[0]).toBe('rancho-buena-vista');
    for (const [q, slug] of [['HB', 'huntington-beach'], ['TP', 'torrey-pines'], ['EL', 'eastlake']]) {
      expect(searchTeams(INDEX, q).teams[0], q).toMatchObject({ score: 90, why: 'abbr', entry: { slug } });
    }
  });
});
