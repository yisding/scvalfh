/**
 * data/soccer/club-rosters.json (the kept copy of the ECNL and ECNL Regional League team rosters, and of
 * Girls Academy's GotSport and Hudl rosters) and the league-roster rule that compares it with the high school
 * rosters (lib/players/club-rosters.ts).
 * Reads the soccer files from disk, whatever sport the run is for.
 */

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  ClubRostersFileSchema,
  LEAGUE_ROSTER_KIND,
  birthYearClassYears,
  birthYearsAdmit,
  birthYearsFromTeamName,
  clubKey,
  compareClubRosters,
  rosterName,
  rosterSource,
  teamTier,
  type ClubRostersFile,
  type SchoolRow,
} from '../lib/players/club-rosters';
import type { ClubAffiliation, ClubsFile, ClubsView } from '../lib/players/clubs-schema';
import { nameKey, nameTokens } from '../lib/players/name-compare';
import { givenForms } from '../lib/players/nicknames';

const json = (rel: string): unknown => JSON.parse(readFileSync(rel, 'utf8'));
const file = ClubRostersFileSchema.parse(json('data/soccer/club-rosters.json'));

/**
 * data/soccer/clubs.json as the soccer pages read it (lib/players/clubs.ts): each membership on its person's MaxPreps
 * row this season (data/soccer/player-index.json), varsity before JV. Built here because this run may be any sport's.
 */
const clubs: Pick<ClubsView, 'season' | 'clubs' | 'affiliations' | 'jvAffiliations'> = (() => {
  const disk = json('data/soccer/clubs.json') as ClubsFile;
  const index = json('data/soccer/player-index.json') as { season: string; rows: Array<[string, string, 'varsity' | 'jv', string | null, string]> };
  const rowsOf = new Map<string, Array<{ team: string; level: string; athleteId: string; name: string }>>();
  for (const [id, team, level, athleteId, name] of index.rows) {
    if (athleteId !== null) rowsOf.set(id, [...(rowsOf.get(id) ?? []), { team, level, athleteId, name }]);
  }
  const affiliations: ClubAffiliation[] = [];
  const jvAffiliations: ClubAffiliation[] = [];
  for (const { playerId, name, ...tie } of disk.memberships) {
    void name;
    const rows = rowsOf.get(playerId) ?? [];
    const row = rows.find((r) => r.level === 'varsity') ?? rows.find((r) => r.level === 'jv');
    if (!row) continue;
    (row.level === 'varsity' ? affiliations : jvAffiliations).push({ teamSlug: row.team, athleteId: row.athleteId, playerId, fullName: row.name, ...tie });
  }
  return { season: index.season, clubs: disk.clubs, affiliations, jvAffiliations };
})();

/** The class year a soccer row's grade gives this season, and the one a `rosterBehind` conflict corrects it to, by team and athlete. */
function soccerClassYears(): Map<string, number[]> {
  type Row = { athleteId: string | null; grade: number | null };
  const end = 2000 + Number(file.season.slice(3));
  const out = new Map<string, number[]>();
  const add = (slug: string, id: string | null, grade: number | null) => {
    if (id === null || grade === null) return;
    const key = `${slug} ${id}`;
    out.set(key, [...(out.get(key) ?? []), end + 12 - grade]);
  };
  for (const f of ['data/soccer/rosters.json', 'data/soccer/jv-rosters.json']) {
    for (const t of (json(f) as { teams: Array<{ slug: string; players: Row[] }> }).teams) for (const p of t.players) add(t.slug, p.athleteId, p.grade);
  }
  const overlay = json('data/soccer/rosters-enrichment.json') as {
    teams: Array<{ slug: string; players: Array<{ athleteId: string; conflicts: Array<{ field: string; rosterBehind?: boolean; other: unknown }> }> }>;
  };
  for (const t of overlay.teams) {
    for (const p of t.players) for (const c of p.conflicts) if (c.field === 'grade' && c.rosterBehind) add(t.slug, p.athleteId, Number(c.other));
  }
  return out;
}

describe('data/soccer/club-rosters.json', () => {
  it('holds the three ECNL leagues, Girls Academy and NorCal Premier\'s two, and only players who can be in high school this season', () => {
    expect(file.leagues.map((l) => l.id)).toEqual(['ecnl', 'ecnl-rl', 'ecnl-rl-golden-state', 'ga', 'n1', 'norcal-fall']);
    expect(file.season).toBe(clubs.season);
    const last = 2000 + Number(file.season.slice(3)) + 3; // this season's freshmen
    for (const t of file.teams) {
      for (const p of t.players) if (p.gradYear !== null) expect(p.gradYear).toBeLessThanOrEqual(last);
      if (t.birthYears) expect(birthYearClassYears(t.birthYears).first, t.teamName).toBeLessThanOrEqual(last);
    }
  });

  it('compares a GotSport team (Girls Academy, NorCal Premier) on its birth years: a Rankings roster, no class year', () => {
    const gotsport = new Set(['ga', 'n1', 'norcal-fall']);
    for (const id of gotsport) expect(file.teams.some((t) => t.league === id && rosterSource(t) === 'gotsport'), id).toBe(true);
    for (const t of file.teams.filter((x) => gotsport.has(x.league) && rosterSource(x) !== 'hudl')) {
      expect(t.url, t.teamName).toMatch(/^https:\/\/rankings\.gotsport\.com\/teams\/\d+\/roster$/);
      expect(teamTier(t), t.teamName).toBe('birth-years');
      expect(t.birthYears, t.teamName).toBeDefined();
      expect(t.players.every((p) => p.gradYear === null)).toBe(true);
    }
    for (const t of file.teams.filter((x) => !gotsport.has(x.league))) expect(t.birthYears).toBeUndefined();
  });

  it('keeps a team from Hudl where the club keeps it there, and the GotSport roster it replaces as superseded (2026-11-26)', () => {
    const hudl = file.teams.filter((t) => rosterSource(t) === 'hudl');
    expect(hudl.map((t) => `${t.league} ${t.teamName}`)).toEqual([
      'ga AFC U18 GA',
      'ga AFC U17 GA',
      'ga AFC U16 GA',
      'ga AFC U15 GA',
      'ga AFC U14 GA',
      'norcal-fall OV Toros FC U15G Black',
    ]);
    for (const t of hudl) {
      expect(teamTier(t)).toBe('class-year');
      expect(t.birthYears, t.teamName).toBeDefined();
      expect(file.clubSlugs[clubKey(t)]).toBe(t.clubName === 'Almaden FC' ? 'almaden-fc' : 'ov-toros-fc');
      // Each replaces the club's GotSport roster of the same age group, which says so.
      const replaced = file.teams.filter((g) => g.supersededBy === t.url);
      expect(replaced.map((g) => [rosterSource(g), g.clubName, g.division, g.birthYears]), t.teamName).toEqual([['gotsport', t.clubName, t.division, t.birthYears]]);
    }
    expect(file.teams.filter((t) => t.supersededBy !== undefined)).toHaveLength(hudl.length);
    // Rebecca Guting (Los Altos, class of 2028) is on the U17 team with her class year.
    const u17 = hudl.find((t) => t.teamName === 'AFC U17 GA')!;
    expect(u17.players.find((p) => rosterName(p) === 'Rebecca Guting')?.gradYear).toBe(2028);
  });

  it('keeps nothing but a name, a class year, a position and the roster label for a player', () => {
    const keys = new Set(file.teams.flatMap((t) => t.players.flatMap((p) => Object.keys(p))));
    expect([...keys].sort()).toEqual(['firstName', 'gradYear', 'lastName', 'playerType', 'position']);
  });

  it('maps a league club only to a club clubs.json has a record for', () => {
    const slugs = new Set(clubs.clubs.map((c) => c.slug));
    const clubIds = new Set(file.teams.map((t) => clubKey(t)));
    for (const [id, slug] of Object.entries(file.clubSlugs)) {
      expect(clubIds.has(id), `club id ${id}`).toBe(true);
      expect(slugs.has(slug), slug).toBe(true);
    }
  });

  it('backs every league-roster source in clubs.json, varsity and JV: the team page is in the copy and lists the player with that class year (or, on a GA team, one its birth years admit)', () => {
    const tieByUrl = (url: string) => [...clubs.affiliations, ...(clubs.jvAffiliations ?? [])].filter((a) => a.sources.some((s) => s.url === url));
    // A superseded GotSport roster is not the season's: a tie still citing it is not current on it.
    for (const t of file.teams.filter((x) => x.supersededBy !== undefined)) {
      for (const a of tieByUrl(t.url)) expect(a.status, `${a.teamSlug} / ${a.fullName} cites ${t.teamName} (${t.url}), superseded by ${t.supersededBy}`).not.toBe('current');
    }
    const teamByUrl = new Map(file.teams.map((t) => [t.url, t]));
    const classYears = soccerClassYears();
    const cited = [...clubs.affiliations, ...(clubs.jvAffiliations ?? [])].flatMap((a) =>
      a.sources.filter((s) => s.kind === LEAGUE_ROSTER_KIND).map((s) => ({ a, s })),
    );
    expect(cited.length).toBeGreaterThan(0);
    expect(cited.some(({ a }) => (clubs.jvAffiliations ?? []).includes(a))).toBe(true);
    for (const { a, s } of cited) {
      const label = `${a.teamSlug} / ${a.fullName} (${a.club})`;
      const team = teamByUrl.get(s.url);
      expect(team, `${label}: ${s.url} is not a team in the kept copy`).toBeDefined();
      expect(file.clubSlugs[clubKey(team!)], label).toBe(a.club);
      // A roster that lists her under her given name where the row has its short form (or the reverse) is named on the source.
      if (s.rosterName !== undefined) {
        const [rowFirst, ...rowLast] = nameTokens(a.fullName);
        const [rosterFirst, ...rosterLast] = nameTokens(s.rosterName);
        expect(rosterLast.join(' '), `${label}: ${s.rosterName} has another last name`).toBe(rowLast.join(' '));
        expect(givenForms(rowFirst).has(rosterFirst), `${label}: ${s.rosterName} is not a given form of ${a.fullName}`).toBe(true);
      }
      const listedAs = s.rosterName ?? a.fullName;
      const listed = team!.players.some((p) => nameKey(rosterName(p)) === nameKey(listedAs) && p.gradYear === s.statedClassYear);
      expect(listed, `${label}: the kept roster of ${team!.teamName} does not list her with class year ${s.statedClassYear}`).toBe(true);
      expect(s.statedSchool).toBeNull();
      if (rosterSource(team!) === 'hudl') {
        // The season's roster: its quote names the team and the season, and a row with no class year is one the team's birth years admit.
        expect(s.quote.startsWith(team!.teamName) && s.quote.includes('Season 2026-2027 | '), label).toBe(true);
        expect(s.sourceDate, label).toBe('2026-27');
        const years = classYears.get(`${a.teamSlug} ${a.athleteId}`);
        if (s.statedClassYear === null && years !== undefined) {
          expect(years.some((y) => birthYearsAdmit(team!.birthYears!, y)), `${label}: ${team!.teamName} admits no class of ${years.join(' or ')}`).toBe(true);
        }
      } else if (team!.birthYears) {
        // The GotSport page states no class year; the tie's player's must be one the team's birth years admit.
        expect(s.statedClassYear, label).toBeNull();
        expect(s.quote.startsWith(`${team!.teamName} | `), label).toBe(true);
        expect(a.confidence === 'medium' || a.sources.some((x) => x.kind !== LEAGUE_ROSTER_KIND), label).toBe(true);
        // A row MaxPreps no longer lists is roster drift (left out, kept on purpose): it has no grade to check.
        const years = classYears.get(`${a.teamSlug} ${a.athleteId}`);
        if (years !== undefined) {
          expect(years.some((y) => birthYearsAdmit(team!.birthYears!, y)), `${label}: ${team!.teamName} (born ${team!.birthYears!.join('/')}) admits no class of ${years.join(' or ')}`).toBe(true);
        }
      }
    }
  });
});

describe('compareClubRosters (the league-roster rule)', () => {
  const team = (clubId: number, teamId: number, players: Array<[string, string, number | null]>): ClubRostersFile['teams'][number] => ({
    league: 'ecnl',
    division: 'GU17',
    teamId,
    teamName: `Team ${teamId}`,
    clubId,
    clubName: `Club ${clubId}`,
    url: `https://app.athleteone.com/public/event/1/schedules-standings/team/${teamId}/1`,
    hidden: 0,
    tooYoung: 0,
    players: players.map(([firstName, lastName, gradYear]) => ({ firstName, lastName, gradYear, position: null, playerType: 'First Team Player' })),
  });
  const rosters = (teams: ClubRostersFile['teams']): ClubRostersFile => ({
    ...file,
    clubSlugs: { '1': 'near', '2': 'far', '3': 'near-two' },
    counts: { ...file.counts, teams: teams.length, players: teams.reduce((n, t) => n + t.players.length, 0) },
    teams,
  });
  const club = (slug: string, region: ClubsView['clubs'][number]['region']) => ({ ...clubs.clubs[0], slug, region });
  const tied = { clubs: [club('near', 'south-bay'), club('near-two', 'peninsula'), club('far', 'sacramento')], affiliations: [] as ClubsView['affiliations'] };
  const row = (fullName: string, classYear: number | null, teamSlug = 'gunn', level: SchoolRow['level'] = 'varsity'): SchoolRow => ({
    level,
    teamSlug,
    athleteId: `${teamSlug}-${fullName}`,
    fullName,
    classYear,
  });
  const outcome = (teams: ClubRostersFile['teams'], rows: SchoolRow[], c: typeof tied = tied) =>
    compareClubRosters(rosters(teams), rows, c).map((r) => `${r.row.fullName}: ${r.outcome}${r.tie ? ` (${r.tie})` : ''}`);

  it('matches a folded name whose class year agrees, at a club based near the schools', () => {
    expect(outcome([team(1, 10, [['Zoë', "O'Brien", 2028]])], [row('Zoe OBrien', 2028), row('Somebody Else', 2028)])).toEqual(['Zoe OBrien: match (new)']);
  });

  it('never links on a name alone: no class year anywhere, or a class year that disagrees', () => {
    const teams = [team(1, 10, [['Ann', 'Lee', 2028], ['Bea', 'Roe', null]])];
    expect(outcome(teams, [row('Bea Roe', null)])).toEqual(['Bea Roe: no-grade']);
    expect(outcome(teams, [row('Bea Roe', 2028)])).toEqual(['Bea Roe: no-class-year']);
    expect(outcome(teams, [row('Ann Lee', 2029)])).toEqual(['Ann Lee: class-year-differs']);
  });

  it('takes a row with no grade at the class year its own pages state, else the roster\'s (loosened 2026-11-25)', () => {
    const compare = (teams: ClubRostersFile['teams'], rows: SchoolRow[]) =>
      compareClubRosters(rosters(teams), rows, tied).map((r) => `${r.row.fullName}: ${r.outcome} ${r.classYear ?? '-'} ${r.classYearFrom ?? '-'}`);
    const teams = [team(1, 10, [['Ann', 'Lee', 2028], ['Bea', 'Roe', null], ['Cat', 'Fox', 2026]])];
    // The roster's class year, when no linked page states one.
    expect(compare(teams, [row('Ann Lee', null)])).toEqual(['Ann Lee: match 2028 roster']);
    // A linked page's class year comes first, and must agree with the roster's.
    expect(compare(teams, [{ ...row('Ann Lee', null), statedClassYears: [2028] }])).toEqual(['Ann Lee: match 2028 profile']);
    expect(compare(teams, [{ ...row('Ann Lee', null), statedClassYears: [2029] }])).toEqual(['Ann Lee: class-year-differs 2029 profile']);
    // So does the grade: a page that disagrees with it rules the match out.
    expect(compare(teams, [{ ...row('Ann Lee', 2028), statedClassYears: [2029] }])).toEqual(['Ann Lee: class-year-differs 2028 grade']);
    // The roster gives no class year: the name is all there is.
    expect(compare(teams, [row('Bea Roe', null)])).toEqual(['Bea Roe: no-grade - -']);
    // A class no high school player has in 2026-27 (the file's season) disagrees.
    expect(compare(teams, [row('Cat Fox', null)])).toEqual(['Cat Fox: class-year-differs 2026 roster']);
    // Two class years under the name: neither is taken.
    const two = [team(1, 10, [['Ann', 'Lee', 2028]]), team(1, 11, [['Ann', 'Lee', 2029]])];
    expect(compare(two, [row('Ann Lee', null)])).toEqual(['Ann Lee: no-grade - -']);
    // Rules 3-5 still hold.
    expect(compare([team(2, 20, [['Ann', 'Lee', 2028]])], [row('Ann Lee', null)])).toEqual(['Ann Lee: club-elsewhere 2028 roster']);
    expect(compare(teams, [row('Ann Lee', null), row('Ann Lee', null, 'los-altos')])).toEqual([
      'Ann Lee: name-at-two-schools - -',
      'Ann Lee: name-at-two-schools - -',
    ]);
  });

  it('leaves a name two tracked schools carry, or two clubs list at that class year', () => {
    const teams = [team(1, 10, [['Ann', 'Lee', 2028]]), team(3, 30, [['Ann', 'Lee', 2028]])];
    expect(outcome(teams, [row('Ann Lee', 2028)])).toEqual(['Ann Lee: several-clubs']);
    expect(outcome([teams[0]], [row('Ann Lee', 2028), row('Ann Lee', 2027, 'los-altos', 'jv')])).toEqual([
      'Ann Lee: name-at-two-schools',
      'Ann Lee: name-at-two-schools',
    ]);
  });

  it('compares a roster row with no class year on the birth years its team\'s name gives (2026-11-26)', () => {
    expect(birthYearsFromTeamName('Bay Area Surf ECNL G2009/10')).toEqual([2009, 2010]);
    expect(birthYearsFromTeamName('Union FC ECNL RL G 2008/09')).toEqual([2008, 2009]);
    expect(birthYearsFromTeamName('Diablo Valley Futbol Club ECNL RL G07/08')).toEqual([2007, 2008]);
    expect(birthYearsFromTeamName('Bay Area Surf - ECNL G2012')).toEqual([2012]);
    expect(birthYearsFromTeamName('MVLA N1 Gunners Green')).toBeNull();
    expect(birthYearsFromTeamName('Team G2009/12')).toBeNull();
    const named = (clubId: number, teamId: number, name: string, players: Array<[string, string, number | null]>) => ({ ...team(clubId, teamId, players), teamName: name });
    const teams = [named(1, 10, 'Near ECNL G2010/11', [['Bea', 'Roe', null], ['Ann', 'Lee', 2028]]), named(1, 11, 'Near ECNL G2008/09', [['Bea', 'Roe', null]])];
    // The class of 2029 fits 2010/11, not 2008/09: the one agreeing row is enough.
    expect(outcome(teams, [row('Bea Roe', 2029)])).toEqual(['Bea Roe: match (new)']);
    expect(compareClubRosters(rosters(teams), [row('Bea Roe', 2029)], tied)[0].hits.map((h) => h.team.teamName)).toEqual(['Near ECNL G2010/11']);
    // Neither team's birth years admit 2031; a class year the row's do not give still disagrees.
    expect(outcome(teams, [row('Bea Roe', 2031)])).toEqual(['Bea Roe: class-year-differs']);
    // A row with a class year is still compared on it, not on the name's birth years.
    expect(outcome(teams, [row('Ann Lee', 2029)])).toEqual(['Ann Lee: class-year-differs']);
    // With no grade and no class year anywhere, the name is all there is.
    expect(outcome(teams, [row('Bea Roe', null)])).toEqual(['Bea Roe: no-grade']);
    // Rules 3-5 hold: the birth years can agree at two clubs.
    expect(outcome([...teams, named(3, 30, 'Other ECNL G2009/10', [['Bea', 'Roe', null]])], [row('Bea Roe', 2029)])).toEqual(['Bea Roe: several-clubs']);
  });

  it('takes, of several clubs, the one a page other than a league roster ties the row to (2026-11-26)', () => {
    const teams = [team(1, 10, [['Ann', 'Lee', 2028]]), team(3, 30, [['Ann', 'Lee', 2028]]), team(3, 31, [['Ann', 'Lee', 2028]])];
    const r = row('Ann Lee', 2028);
    const tieTo = (club: string, kind: string) => ({ ...clubs.affiliations[0], teamSlug: r.teamSlug, athleteId: r.athleteId, club, sources: [{ ...clubs.affiliations[0].sources[0], kind }] });
    const withTies = (...ties: ReturnType<typeof tieTo>[]) => ({ ...tied, affiliations: ties as ClubsView['affiliations'] });
    const one = compareClubRosters(rosters(teams), [r], withTies(tieTo('near', 'ncsa')));
    expect(one.map((x) => [x.outcome, x.tie, x.hits.map((h) => h.team.teamId), x.setAside.map((h) => h.team.teamId)])).toEqual([['match', 'tie-without-roster', [10], [30, 31]]]);
    // A tie resting on a league roster alone picks nothing out; nor do ties to two of the clubs.
    expect(outcome(teams, [r], withTies(tieTo('near', LEAGUE_ROSTER_KIND)))).toEqual(['Ann Lee: several-clubs']);
    expect(outcome(teams, [r], withTies(tieTo('near', 'ncsa'), tieTo('near-two', 'hudl')))).toEqual(['Ann Lee: several-clubs']);
    // A tie to a club none of the agreeing rows is at picks nothing out either.
    expect(outcome(teams, [r], withTies(tieTo('far', 'ncsa')))).toEqual(['Ann Lee: several-clubs']);
    // Rule 5 still holds for the club picked out.
    expect(outcome([team(2, 20, [['Ann', 'Lee', 2028]]), teams[1]], [r], withTies(tieTo('far', 'ncsa')))).toEqual(['Ann Lee: club-elsewhere']);
    // Not in the birth-year tier: a GotSport roster is undated, so a second club there says nothing.
    const ga = [gaTeam(1, 10, [2009, 2010], [['Ann', 'Lee']]), gaTeam(7, 70, [2009, 2010], [['Ann', 'Lee']])];
    expect(compareClubRosters(withGa(ga), [r], withTies(tieTo('near', 'ncsa'))).map((x) => x.outcome)).toEqual(['several-clubs']);
  });

  it('leaves a club with no record, and one based away from the schools', () => {
    const teams = [team(2, 20, [['Ann', 'Lee', 2028]]), team(9, 90, [['Bea', 'Roe', 2028]])];
    expect(outcome(teams, [row('Ann Lee', 2028), row('Bea Roe', 2028)])).toEqual(['Ann Lee: club-elsewhere', 'Bea Roe: no-club-record']);
  });

  const gaTeam = (clubId: number, teamId: number, birthYears: number[], players: Array<[string, string]>): ClubRostersFile['teams'][number] => ({
    league: 'ga',
    division: 'U19',
    teamId,
    teamName: `GA ${teamId}`,
    clubId,
    clubName: `Club ${clubId}`,
    url: `https://rankings.gotsport.com/teams/${teamId}/roster`,
    birthYears,
    hidden: 0,
    tooYoung: 0,
    players: players.map(([firstName, lastName]) => ({ firstName, lastName, gradYear: null, position: null, playerType: null })),
  });
  const withGa = (teams: ClubRostersFile['teams']): ClubRostersFile => ({
    ...rosters(teams),
    clubSlugs: { '1': 'near', '2': 'far', '3': 'near-two', 'gotsport-1': 'near-two', 'gotsport-7': 'near' },
  });
  const gaOutcome = (teams: ClubRostersFile['teams'], rows: SchoolRow[]) =>
    compareClubRosters(withGa(teams), rows, tied).map((r) => `${r.row.fullName}: ${r.tier} ${r.outcome}${r.tie ? ` (${r.tie})` : ''}`);

  it('reads a birth-year team as the classes the September 1 cutoff admits, each listed year on its own', () => {
    expect(birthYearClassYears([2008, 2009])).toEqual({ first: 2026, last: 2028 });
    expect(birthYearClassYears([2012])).toEqual({ first: 2030, last: 2031 });
    expect([2025, 2026, 2027, 2028, 2029].filter((c) => birthYearsAdmit([2008, 2009], c))).toEqual([2026, 2027, 2028]);
    // Not consecutive: 2008 gives 2026-2027 and 2011 gives 2029-2030; no listed year gives 2028.
    expect([2026, 2027, 2028, 2029, 2030].filter((c) => birthYearsAdmit([2008, 2011], c))).toEqual([2026, 2027, 2029, 2030]);
    expect(gaOutcome([gaTeam(7, 70, [2008, 2011], [['Ann', 'Lee']])], [row('Ann Lee', 2028)])).toEqual(['Ann Lee: birth-years class-year-differs']);
  });

  it('counts two league clubs mapped to one clubs.json record as one club, and two unmapped clubs as two', () => {
    const withMap = (map: Record<string, string>) => ({ ...withGa([]), clubSlugs: { ...withGa([]).clubSlugs, ...map } });
    const teams = [gaTeam(7, 70, [2008, 2009], [['Ann', 'Lee']]), gaTeam(8, 80, [2008, 2009], [['Ann', 'Lee']])];
    const run = (map: Record<string, string>) => {
      const f = withMap(map);
      return compareClubRosters({ ...f, teams, counts: { ...f.counts, teams: teams.length, players: 2 } }, [row('Ann Lee', 2027)], tied).map((r) => r.outcome);
    };
    expect(run({ 'gotsport-8': 'near' })).toEqual(['match']); // gotsport-7 is 'near' too
    const unmapped = withGa([]).clubSlugs;
    expect(Object.keys(unmapped)).not.toContain('gotsport-9');
    const two = [gaTeam(9, 90, [2008, 2009], [['Ann', 'Lee']]), gaTeam(10, 100, [2008, 2009], [['Ann', 'Lee']])];
    const f = withGa([]);
    expect(compareClubRosters({ ...f, teams: two, counts: { ...f.counts, teams: 2, players: 2 } }, [row('Ann Lee', 2027)], tied).map((r) => r.outcome)).toEqual(['several-clubs']);
  });

  it('matches a GA row whose class year the team\'s birth years admit, and no other', () => {
    const teams = [gaTeam(7, 70, [2008, 2009], [['Ann', 'Lee'], ['Bea', 'Roe'], ['Cy', 'Poe']])];
    expect(gaOutcome(teams, [row('Ann Lee', 2027), row('Bea Roe', 2029), row('Cy Poe', null)])).toEqual([
      'Ann Lee: birth-years match (new)',
      'Bea Roe: birth-years class-year-differs',
      'Cy Poe: birth-years no-grade',
    ]);
  });

  it('keys GotSport clubs apart from Athlete One clubs of the same id', () => {
    // gotsport-1 maps to near-two (peninsula); Athlete One club 1 is near (south-bay).
    const r = compareClubRosters(withGa([gaTeam(1, 10, [2008, 2009], [['Ann', 'Lee']])]), [row('Ann Lee', 2027)], tied);
    expect(r.map((x) => [x.outcome, x.hits[0].club])).toEqual([['match', 'near-two']]);
  });

  it('judges each tier apart: an ECNL row at one club and a GA row at another each match', () => {
    const teams = [team(1, 10, [['Ann', 'Lee', 2027]]), gaTeam(1, 11, [2008, 2009], [['Ann', 'Lee']])];
    expect(gaOutcome(teams, [row('Ann Lee', 2027)])).toEqual(['Ann Lee: class-year match (new)', 'Ann Lee: birth-years match (new)']);
  });

  const hudlTeam = (clubId: number, teamId: number, birthYears: number[], players: Array<[string, string, number | null]>): ClubRostersFile['teams'][number] => ({
    league: 'ga',
    division: 'U17',
    teamId,
    teamName: `AFC U${teamId} GA`,
    clubId,
    clubName: `Club ${clubId}`,
    url: `https://fan.hudl.com/usa/ca/san-jose/organization/${clubId}/club/team/${teamId}/afc-u${teamId}-ga/roster`,
    birthYears,
    hidden: 0,
    tooYoung: 0,
    players: players.map(([firstName, lastName, gradYear]) => ({ firstName, lastName, gradYear, position: null, playerType: null })),
  });
  const withHudl = (teams: ClubRostersFile['teams']): ClubRostersFile => ({ ...withGa(teams), clubSlugs: { ...withGa(teams).clubSlugs, 'hudl-1': 'near' } });

  it('compares a Hudl GA roster in the class-year tier: a row\'s class year, else the team\'s birth years (2026-11-26)', () => {
    const t = hudlTeam(1, 17, [2009, 2010], [['Ann', 'Lee', 2028], ['Bea', 'Roe', null]]);
    expect(clubKey(t)).toBe('hudl-1');
    const run = (rows: SchoolRow[]) => compareClubRosters(withHudl([t]), rows, tied).map((r) => `${r.row.fullName}: ${r.tier} ${r.outcome}`);
    expect(run([row('Ann Lee', 2028), row('Bea Roe', 2029)])).toEqual(['Ann Lee: class-year match', 'Bea Roe: class-year match']);
    // The row's own class year rules, not the birth years (which admit 2027-2029).
    expect(run([row('Ann Lee', 2027)])).toEqual(['Ann Lee: class-year class-year-differs']);
    expect(run([row('Bea Roe', 2030)])).toEqual(['Bea Roe: class-year class-year-differs']);
    // A row with no grade takes the Hudl roster's class year, as it takes an ECNL roster's.
    expect(compareClubRosters(withHudl([t]), [row('Ann Lee', null)], tied).map((r) => [r.outcome, r.classYear, r.classYearFrom])).toEqual([['match', 2028, 'roster']]);
    // An ECNL row at another club at that class year is in the same tier: two clubs.
    expect(compareClubRosters(withHudl([t, team(3, 30, [['Ann', 'Lee', 2028]])]), [row('Ann Lee', 2028)], tied).map((r) => r.outcome)).toEqual(['several-clubs']);
  });

  it('leaves a GotSport roster a Hudl roster supersedes out of the comparison', () => {
    const h = hudlTeam(1, 17, [2009, 2010], [['Ann', 'Lee', 2028]]);
    const plain = gaTeam(1, 70, [2009, 2010], [['Ann', 'Lee'], ['Cy', 'Poe']]);
    const g = { ...plain, supersededBy: h.url };
    const r = compareClubRosters(withHudl([h, g]), [row('Ann Lee', 2028), row('Cy Poe', 2028)], tied);
    // Cy Poe is on the GotSport roster only: no longer compared. Ann Lee is compared on Hudl's alone.
    expect(r.map((x) => `${x.row.fullName}: ${x.tier} ${x.outcome} ${x.hits.map((h2) => h2.team.url === h.url ? 'hudl' : 'gotsport').join(',')}`)).toEqual(['Ann Lee: class-year match hudl']);
    expect(compareClubRosters(withHudl([h, plain]), [row('Cy Poe', 2028)], tied).map((x) => x.outcome)).toEqual(['match']);
  });

  it('accepts supersededBy only on a GotSport roster, naming a Hudl roster of the same league in the file', () => {
    const h = hudlTeam(1, 17, [2009, 2010], [['Ann', 'Lee', 2028]]);
    const g = gaTeam(1, 70, [2009, 2010], [['Ann', 'Lee']]);
    const parse = (teams: ClubRostersFile['teams']) => ClubRostersFileSchema.safeParse({ ...withHudl(teams), counts: { ...file.counts, teams: teams.length, players: teams.reduce((n, t) => n + t.players.length, 0) } }).success;
    expect(parse([h, { ...g, supersededBy: h.url }])).toBe(true);
    expect(parse([{ ...g, supersededBy: h.url }])).toBe(false); // not in the file
    expect(parse([h, { ...g, supersededBy: h.url }, { ...team(1, 10, []), supersededBy: h.url }])).toBe(false); // not a GotSport roster
    expect(parse([h, { ...g, supersededBy: g.url }])).toBe(false); // not a Hudl roster
    expect(parse([{ ...h, birthYears: undefined }])).toBe(false); // a Hudl GA team keeps its birth years
  });

  it('still leaves a GA name two clubs list within the birth years', () => {
    const teams = [gaTeam(1, 10, [2008, 2009], [['Ann', 'Lee']]), gaTeam(7, 70, [2009, 2010], [['Ann', 'Lee']])];
    expect(gaOutcome(teams, [row('Ann Lee', 2028)])).toEqual(['Ann Lee: birth-years several-clubs']);
  });

  it('says how a match stands in clubs.json', () => {
    const teams = [team(1, 10, [['Ann', 'Lee', 2028]])];
    const r = row('Ann Lee', 2028);
    const tie = (kind: string, url = teams[0].url) => ({
      ...tied,
      affiliations: [{ ...clubs.affiliations[0], teamSlug: r.teamSlug, athleteId: r.athleteId, club: 'near', sources: [{ ...clubs.affiliations[0].sources[0], kind, url }] }] as ClubsView['affiliations'],
    });
    expect(outcome(teams, [r], tie('ncsa', 'https://www.ncsasports.org/womens-soccer-recruiting/california/x/ann-lee'))).toEqual(['Ann Lee: match (tie-without-roster)']);
    expect(outcome(teams, [r], tie(LEAGUE_ROSTER_KIND))).toEqual(['Ann Lee: match (linked)']);
    // A source citing the page links it whatever its kind (a field hockey club's roster is a `club-site` source).
    expect(outcome(teams, [r], tie('club-site'))).toEqual(['Ann Lee: match (linked)']);
    // A league roster the match does not rest on (another team's page) does not link it.
    expect(outcome(teams, [r], tie(LEAGUE_ROSTER_KIND, 'https://app.athleteone.com/public/event/1/schedules-standings/team/99/1'))).toEqual([
      'Ann Lee: match (tie-without-roster)',
    ]);
  });
});
