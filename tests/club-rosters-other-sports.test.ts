/**
 * The kept club rosters of the sports other than girls soccer (README, "Club rosters in the other sports"):
 * data/volleyball/club-rosters.json (the NCVA Girls Power League on TM2Sign), data/basketball/club-rosters.json
 * (The Passport's boys events) and data/field-hockey/club-rosters.json (the California clubs' own pages), and
 * what the league-roster rule does with what they add: a team compared on the classes its age group admits, a
 * file holding two club seasons, and a sport's own idea of a club near enough.
 * Reads the files from disk, whatever sport the run is for.
 */

import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  ClubRostersFileSchema,
  LOCAL_REGIONS,
  VOLLEYBALL_LOCAL_REGIONS,
  clubKey,
  compareClubRosters,
  rosterName,
  rosterSource,
  teamTier,
  type ClubRostersFile,
  type SchoolRow,
} from '../lib/players/club-rosters';
import type { ClubAffiliation, ClubsFile, ClubsView } from '../lib/players/clubs-schema';
import { nameKey } from '../lib/players/name-compare';
import { recaseName } from '../lib/sources/person-name';
import { ageGroupClassYears } from '../scripts/fetch-club-rosters-ncva.mjs';

const json = (rel: string): unknown => JSON.parse(readFileSync(rel, 'utf8'));

/** A sport's clubs.json as its pages read it: each membership on its person's row this season, varsity before JV. */
function clubsOf(sport: string): Pick<ClubsView, 'season' | 'clubs' | 'affiliations' | 'jvAffiliations'> {
  const disk = json(`data/${sport}/clubs.json`) as ClubsFile;
  const index = json(`data/${sport}/player-index.json`) as { season: string; rows: Array<[string, string, 'varsity' | 'jv', string | null, string]> };
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
}

const SPORTS = [
  { sport: 'volleyball', sources: ['tm2'] },
  { sport: 'basketball', sources: ['passport'] },
  { sport: 'field-hockey', sources: ['sportsrecruits', 'club-site'] },
] as const;

for (const { sport, sources } of SPORTS) {
  const at = `data/${sport}/club-rosters.json`;
  describe(at, () => {
    it('exists and passes the contract', () => {
      expect(existsSync(at)).toBe(true);
      expect(ClubRostersFileSchema.safeParse(json(at)).success).toBe(true);
    });
    if (!existsSync(at)) return;
    const file = ClubRostersFileSchema.parse(json(at));
    const clubs = clubsOf(sport);

    it('is for this season, from its own sources, and keeps only players who can be in high school now', () => {
      expect(file.season).toBe(clubs.season);
      expect(file.teams.length).toBeGreaterThan(0);
      expect(new Set(file.teams.map((t) => rosterSource(t)))).toEqual(new Set(sources));
      const first = 2000 + Number(file.season.slice(3));
      for (const t of file.teams) {
        for (const p of t.players) if (p.gradYear !== null) expect(p.gradYear, `${t.teamName}: ${rosterName(p)}`).toBeGreaterThanOrEqual(first);
        for (const p of t.players) if (p.gradYear !== null) expect(p.gradYear, `${t.teamName}: ${rosterName(p)}`).toBeLessThanOrEqual(first + 3);
        for (const y of t.classYears ?? []) expect(y >= first && y <= first + 3, t.teamName).toBe(true);
      }
    });

    it('keeps nothing but a name, a class year, a position and the roster label for a player', () => {
      const keys = new Set(file.teams.flatMap((t) => t.players.flatMap((p) => Object.keys(p))));
      expect([...keys].sort()).toEqual(['firstName', 'gradYear', 'lastName', 'playerType', 'position']);
    });

    it('maps a club only to a record clubs.json has, and only a club the copy holds', () => {
      const slugs = new Set(clubs.clubs.map((c) => c.slug));
      const keys = new Set(file.teams.map((t) => clubKey(t)));
      expect(Object.keys(file.clubSlugs).length).toBeGreaterThan(0);
      for (const [key, slug] of Object.entries(file.clubSlugs)) {
        expect(keys.has(key), `club ${key}`).toBe(true);
        expect(slugs.has(slug), slug).toBe(true);
      }
    });

    it('backs every tie that cites a kept roster: the page is in the copy, at the tie\'s club, and lists the player with that class year', () => {
      const teamByUrl = new Map(file.teams.map((t) => [t.url, t]));
      const cited = [...clubs.affiliations, ...(clubs.jvAffiliations ?? [])].flatMap((a) =>
        a.sources.filter((s) => teamByUrl.has(s.url)).map((s) => ({ a, s, team: teamByUrl.get(s.url)! })),
      );
      for (const { a, s, team } of cited) {
        const label = `${a.teamSlug} / ${a.fullName} (${a.club}) cites ${team.teamName}`;
        expect(file.clubSlugs[clubKey(team)], label).toBe(a.club);
        const named = team.players.filter((p) => nameKey(rosterName(p)) === nameKey(a.fullName));
        if (team.classYears !== undefined) {
          // A TM2Sign roster states no class year: the tie's quote names the team and the age group, then the row as
          // "Last, First". That row is the tied player's (her name as the site spells it, after NAME_SPELLINGS), and
          // the roster lists her: another player on the roster never stands in for her.
          const [last, first] = s.quote.slice(s.quote.indexOf(' | ') + 3).split(', ');
          expect(nameKey(recaseName(`${first} ${last}`)), `${label}: the quote names another player`).toBe(nameKey(a.fullName));
          expect(named.length, `${label}: the roster does not list her`).toBeGreaterThan(0);
          expect(s.statedClassYear, label).toBeNull();
          expect(s.quote.startsWith(`${team.teamName} (${team.division}) | `), label).toBe(true);
        } else if (s.statedClassYear !== null) {
          // A page whose quote is the player's own row (not a club page an older tie quotes in another shape).
          if (s.kind === 'league-roster') expect(named.some((p) => p.gradYear === s.statedClassYear), `${label}: not listed with ${s.statedClassYear}`).toBe(true);
        }
      }
    });
  });
}

describe('the league-roster rule, as the other sports use it', () => {
  const base: ClubRostersFile = {
    builtBy: 'test',
    fetchedAt: '2026-11-27T00:00:00.000Z',
    season: '26-27',
    notes: [],
    leagues: [
      { id: 'ncva-power-2026', name: '2026', eventId: 2136, url: 'https://tm2sign.com/api/public/events/2136', clubSeason: '2025-26' },
      { id: 'ncva-power-2027', name: '2027', eventId: 2585, url: 'https://tm2sign.com/api/public/events/2585', clubSeason: '2026-27' },
    ],
    clubSlugs: { 'tm2-Near Club': 'near', 'tm2-Other Club': 'near-two', 'tm2-Far Club': 'far' },
    counts: { teams: 0, players: 0, hidden: 0, tooYoung: 0, emptyTeams: 0 },
    teams: [],
  };
  const tm2 = (id: number, league: string, club: string, classYears: number[], names: Array<[string, string]>): ClubRostersFile['teams'][number] => ({
    league,
    division: '16s',
    teamId: id,
    teamName: `${club} 16`,
    clubId: club,
    clubName: club,
    url: `https://tm2sign.com/api/public/scheduler-teams/${id}/roster`,
    classYears,
    hidden: 0,
    tooYoung: 0,
    players: names.map(([firstName, lastName]) => ({ firstName, lastName, gradYear: null, position: null, playerType: null })),
  });
  const withTeams = (teams: ClubRostersFile['teams']): ClubRostersFile => ({
    ...base,
    teams,
    counts: { ...base.counts, teams: teams.length, players: teams.reduce((n, t) => n + t.players.length, 0) },
  });
  const club = (slug: string, region: ClubsView['clubs'][number]['region']) => ({ ...clubsOf('volleyball').clubs[0], slug, region });
  const clubs = { clubs: [club('near', 'south-bay'), club('near-two', 'peninsula'), club('far', 'sacramento')], affiliations: [] as ClubsView['affiliations'] };
  const row = (fullName: string, classYear: number | null, teamSlug = 'gunn'): SchoolRow => ({ level: 'varsity', teamSlug, athleteId: `${teamSlug}-${fullName}`, fullName, classYear });
  const outcomes = (file: ClubRostersFile, rows: SchoolRow[], options = {}) =>
    compareClubRosters(file, rows, clubs, options).map((r) => `${r.row.fullName}: ${r.outcome}${r.tie ? ` (${r.tie})` : ''} ${r.hits.map((h) => h.club).join(',')}`.trim());

  it('reads a USA Volleyball age group as two classes (July 1 age definition, September 1 school cutoff)', () => {
    expect(ageGroupClassYears(16, 2026)).toEqual([2027, 2028]);
    expect(ageGroupClassYears(17, 2026)).toEqual([2026, 2027]);
    expect(ageGroupClassYears(14, 2027)).toEqual([2030, 2031]);
  });

  it('compares a TM2Sign row on its age group\'s classes, in the class-year tier, and never a player playing up', () => {
    const file = withTeams([tm2(1, 'ncva-power-2026', 'Near Club', [2027, 2028], [['Ann', 'Lee'], ['Bea', 'Ray']])]);
    expect(rosterSource(file.teams[0])).toBe('tm2');
    expect(teamTier(file.teams[0])).toBe('class-year');
    expect(clubKey(file.teams[0])).toBe('tm2-Near Club');
    expect(outcomes(file, [row('Ann Lee', 2028), row('Bea Ray', 2029)])).toEqual(['Ann Lee: match (new) near', 'Bea Ray: class-year-differs near']);
  });

  it('matches a player on the latest club season\'s roster when an older season lists her at another club', () => {
    const file = withTeams([
      tm2(1, 'ncva-power-2026', 'Far Club', [2027, 2028], [['Ann', 'Lee']]),
      tm2(2, 'ncva-power-2027', 'Near Club', [2028, 2029], [['Ann', 'Lee']]),
    ]);
    const [r] = compareClubRosters(file, [row('Ann Lee', 2028)], clubs);
    expect([r.outcome, r.hits.map((h) => h.club), r.setAside.map((h) => h.club)]).toEqual(['match', ['near'], ['far']]);
    // Two clubs in the same season are still two clubs.
    const same = withTeams([
      tm2(1, 'ncva-power-2027', 'Other Club', [2028, 2029], [['Ann', 'Lee']]),
      tm2(2, 'ncva-power-2027', 'Near Club', [2028, 2029], [['Ann', 'Lee']]),
    ]);
    expect(compareClubRosters(same, [row('Ann Lee', 2028)], clubs).map((x) => x.outcome)).toEqual(['several-clubs']);
  });

  it('asks the sport which clubs are near enough', () => {
    const file = withTeams([tm2(1, 'ncva-power-2026', 'Far Club', [2027, 2028], [['Ann', 'Lee']])]);
    expect(outcomes(file, [row('Ann Lee', 2028)])).toEqual(['Ann Lee: club-elsewhere far']);
    expect(outcomes(file, [row('Ann Lee', 2028)], { isLocal: () => true })).toEqual(['Ann Lee: match (new) far']);
  });

  it('counts an East Bay club as near the schools in volleyball only (owner decision, 2026-11-27)', () => {
    expect(VOLLEYBALL_LOCAL_REGIONS).toEqual([...LOCAL_REGIONS, 'east-bay']);
    expect(LOCAL_REGIONS).not.toContain('east-bay');
    expect(VOLLEYBALL_LOCAL_REGIONS).not.toContain('marin');
    const file = withTeams([tm2(1, 'ncva-power-2026', 'Far Club', [2027, 2028], [['Ann', 'Lee']])]);
    const eastBay = { ...clubs, clubs: [club('far', 'east-bay')] };
    const volleyball = { isLocal: (region: (typeof LOCAL_REGIONS)[number]) => VOLLEYBALL_LOCAL_REGIONS.includes(region) };
    expect(compareClubRosters(file, [row('Ann Lee', 2028)], eastBay).map((r) => r.outcome)).toEqual(['club-elsewhere']);
    expect(compareClubRosters(file, [row('Ann Lee', 2028)], eastBay, volleyball).map((r) => r.outcome)).toEqual(['match']);
  });

  it('tells each source by its page', () => {
    const at = (url: string) => rosterSource({ url });
    expect(at('https://api.the-passport.com/api/events/11222/teams/40618/roster')).toBe('passport');
    expect(at('https://nfhca.sportsrecruits.com/organization/San_Francisco_Youth_FHC/u16_hawks_blue')).toBe('sportsrecruits');
    expect(at('https://nfhca.sportsrecruits.com/organization/San_Francisco_Youth_FHC/embed/?type=players&teamid=all')).toBe('sportsrecruits');
    expect(at('https://sfyouthfieldhockey.com/current-players/')).toBe('club-site');
    expect(at('https://tm2sign.com/api/public/scheduler-teams/245850/roster')).toBe('tm2');
    expect(at('https://rankings.gotsport.com/teams/145734/roster')).toBe('gotsport');
  });

  it('refuses a TM2Sign roster without its age group\'s classes, or with a class year on a row', () => {
    const t = tm2(1, 'ncva-power-2026', 'Near Club', [2027, 2028], [['Ann', 'Lee']]);
    const parse = (teams: ClubRostersFile['teams']) => ClubRostersFileSchema.safeParse(withTeams(teams)).success;
    expect(parse([t])).toBe(true);
    expect(parse([{ ...t, classYears: undefined }])).toBe(false);
    expect(parse([{ ...t, players: [{ ...t.players[0], gradYear: 2027 }] }])).toBe(false);
    expect(parse([{ ...t, url: 'https://tm2sign.com/app/event/2136/team/1' }])).toBe(false); // a named host, but no team page of it
  });
});
