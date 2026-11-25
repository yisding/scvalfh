/**
 * data/soccer/club-rosters.json (the kept copy of the ECNL and ECNL Regional League team rosters, and of
 * Girls Academy's GotSport rosters) and the league-roster rule that compares it with the high school
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
  clubKey,
  compareClubRosters,
  rosterName,
  type ClubRostersFile,
  type SchoolRow,
} from '../lib/players/club-rosters';
import type { ClubsFile } from '../lib/players/clubs-schema';
import { nameKey } from '../lib/players/name-compare';

const json = (rel: string): unknown => JSON.parse(readFileSync(rel, 'utf8'));
const file = ClubRostersFileSchema.parse(json('data/soccer/club-rosters.json'));
const clubs = json('data/soccer/clubs.json') as ClubsFile;

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
  it('holds the three ECNL leagues and Girls Academy, and only players who can be in high school this season', () => {
    expect(file.leagues.map((l) => l.id)).toEqual(['ecnl', 'ecnl-rl', 'ecnl-rl-golden-state', 'ga']);
    expect(file.season).toBe(clubs.season);
    const last = 2000 + Number(file.season.slice(3)) + 3; // this season's freshmen
    for (const t of file.teams) {
      for (const p of t.players) if (p.gradYear !== null) expect(p.gradYear).toBeLessThanOrEqual(last);
      if (t.birthYears) expect(birthYearClassYears(t.birthYears).first, t.teamName).toBeLessThanOrEqual(last);
    }
  });

  it('compares a Girls Academy team on its birth years: a GotSport roster, no class year', () => {
    const ga = file.teams.filter((t) => t.league === 'ga');
    expect(ga.length).toBeGreaterThan(0);
    for (const t of ga) {
      expect(t.url, t.teamName).toMatch(/^https:\/\/rankings\.gotsport\.com\/teams\/\d+\/roster$/);
      expect(t.birthYears, t.teamName).toBeDefined();
      expect(t.players.every((p) => p.gradYear === null)).toBe(true);
    }
    for (const t of file.teams.filter((x) => x.league !== 'ga')) expect(t.birthYears).toBeUndefined();
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
      const listed = team!.players.some((p) => nameKey(rosterName(p)) === nameKey(a.fullName) && p.gradYear === s.statedClassYear);
      expect(listed, `${label}: the kept roster of ${team!.teamName} does not list her with class year ${s.statedClassYear}`).toBe(true);
      expect(s.statedSchool).toBeNull();
      if (team!.birthYears) {
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
  const club = (slug: string, region: ClubsFile['clubs'][number]['region']) => ({ ...clubs.clubs[0], slug, region });
  const tied = { clubs: [club('near', 'south-bay'), club('near-two', 'peninsula'), club('far', 'sacramento')], affiliations: [] as ClubsFile['affiliations'] };
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

  it('never links on a name alone: no grade, no class year, or a class year that disagrees', () => {
    const teams = [team(1, 10, [['Ann', 'Lee', 2028], ['Bea', 'Roe', null]])];
    expect(outcome(teams, [row('Ann Lee', null), row('Bea Roe', 2028)])).toEqual(['Ann Lee: no-grade', 'Bea Roe: no-class-year']);
    expect(outcome(teams, [row('Ann Lee', 2029)])).toEqual(['Ann Lee: class-year-differs']);
  });

  it('leaves a name two tracked schools carry, or two clubs list at that class year', () => {
    const teams = [team(1, 10, [['Ann', 'Lee', 2028]]), team(3, 30, [['Ann', 'Lee', 2028]])];
    expect(outcome(teams, [row('Ann Lee', 2028)])).toEqual(['Ann Lee: several-clubs']);
    expect(outcome([teams[0]], [row('Ann Lee', 2028), row('Ann Lee', 2027, 'los-altos', 'jv')])).toEqual([
      'Ann Lee: name-at-two-schools',
      'Ann Lee: name-at-two-schools',
    ]);
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

  it('still leaves a GA name two clubs list within the birth years', () => {
    const teams = [gaTeam(1, 10, [2008, 2009], [['Ann', 'Lee']]), gaTeam(7, 70, [2009, 2010], [['Ann', 'Lee']])];
    expect(gaOutcome(teams, [row('Ann Lee', 2028)])).toEqual(['Ann Lee: birth-years several-clubs']);
  });

  it('says how a match stands in clubs.json', () => {
    const teams = [team(1, 10, [['Ann', 'Lee', 2028]])];
    const r = row('Ann Lee', 2028);
    const tie = (kind: string, url = teams[0].url) => ({
      ...tied,
      affiliations: [{ ...clubs.affiliations[0], teamSlug: r.teamSlug, athleteId: r.athleteId, club: 'near', sources: [{ ...clubs.affiliations[0].sources[0], kind, url }] }] as ClubsFile['affiliations'],
    });
    expect(outcome(teams, [r], tie('ncsa'))).toEqual(['Ann Lee: match (tie-without-roster)']);
    expect(outcome(teams, [r], tie(LEAGUE_ROSTER_KIND))).toEqual(['Ann Lee: match (linked)']);
    // A league roster the match does not rest on (another team's page) does not link it.
    expect(outcome(teams, [r], tie(LEAGUE_ROSTER_KIND, 'https://app.athleteone.com/public/event/1/schedules-standings/team/99/1'))).toEqual([
      'Ann Lee: match (tie-without-roster)',
    ]);
  });
});
