/**
 * data/soccer/club-rosters.json (the kept copy of the ECNL and ECNL Regional League team rosters) and the
 * league-roster rule that compares it with the high school rosters (lib/players/club-rosters.ts).
 * Reads the soccer files from disk, whatever sport the run is for.
 */

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  ClubRostersFileSchema,
  LEAGUE_ROSTER_KIND,
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

describe('data/soccer/club-rosters.json', () => {
  it('holds the three leagues, and only players who can be in high school this season', () => {
    expect(file.leagues.map((l) => l.id)).toEqual(['ecnl', 'ecnl-rl', 'ecnl-rl-golden-state']);
    expect(file.season).toBe(clubs.season);
    const last = 2000 + Number(file.season.slice(3)) + 3; // this season's freshmen
    for (const t of file.teams) {
      for (const p of t.players) if (p.gradYear !== null) expect(p.gradYear).toBeLessThanOrEqual(last);
    }
  });

  it('keeps nothing but a name, a class year, a position and the roster label for a player', () => {
    const keys = new Set(file.teams.flatMap((t) => t.players.flatMap((p) => Object.keys(p))));
    expect([...keys].sort()).toEqual(['firstName', 'gradYear', 'lastName', 'playerType', 'position']);
  });

  it('maps a league club only to a club clubs.json has a record for', () => {
    const slugs = new Set(clubs.clubs.map((c) => c.slug));
    const clubIds = new Set(file.teams.map((t) => String(t.clubId)));
    for (const [id, slug] of Object.entries(file.clubSlugs)) {
      expect(clubIds.has(id), `club id ${id}`).toBe(true);
      expect(slugs.has(slug), slug).toBe(true);
    }
  });

  it('backs every league-roster source in clubs.json: the team page is in the copy and lists the player with that class year', () => {
    const teamByUrl = new Map(file.teams.map((t) => [t.url, t]));
    const cited = clubs.affiliations.flatMap((a) => a.sources.filter((s) => s.kind === LEAGUE_ROSTER_KIND).map((s) => ({ a, s })));
    expect(cited.length).toBeGreaterThan(0);
    for (const { a, s } of cited) {
      const label = `${a.teamSlug} / ${a.fullName} (${a.club})`;
      const team = teamByUrl.get(s.url);
      expect(team, `${label}: ${s.url} is not a team in the kept copy`).toBeDefined();
      expect(file.clubSlugs[String(team!.clubId)], label).toBe(a.club);
      const listed = team!.players.some((p) => nameKey(rosterName(p)) === nameKey(a.fullName) && p.gradYear === s.statedClassYear);
      expect(listed, `${label}: the kept roster of ${team!.teamName} does not list her with class year ${s.statedClassYear}`).toBe(true);
      expect(s.statedSchool).toBeNull();
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

  it('says how a match stands in clubs.json', () => {
    const teams = [team(1, 10, [['Ann', 'Lee', 2028]])];
    const r = row('Ann Lee', 2028);
    const tie = (kind: string) => ({
      ...tied,
      affiliations: [{ ...clubs.affiliations[0], teamSlug: r.teamSlug, athleteId: r.athleteId, club: 'near', sources: [{ ...clubs.affiliations[0].sources[0], kind }] }] as ClubsFile['affiliations'],
    });
    expect(outcome(teams, [r], tie('ncsa'))).toEqual(['Ann Lee: match (tie-without-roster)']);
    expect(outcome(teams, [r], tie(LEAGUE_ROSTER_KIND))).toEqual(['Ann Lee: match (linked)']);
  });
});
