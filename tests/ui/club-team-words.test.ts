/**
 * components/words/club-team-words.ts: one shape for the club team a soccer club page prints, over
 * every `clubTeam` in data/soccer/clubs.json's memberships (read from disk, whatever sport the run is for).
 *
 * The table below is every distinct value in the file and what a page prints for it. A tie added by
 * hand in a shape the rules miss shows up here as a new row: read it, and if it reads wrong, fix the
 * rule rather than the data.
 */

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { soccerClubTeamWords } from '../../components/words/club-team-words';
import { clubKey, LEAGUE_ROSTER_KIND, type ClubRostersFile } from '../../lib/players/club-rosters';
import type { ClubsFile } from '../../lib/players/clubs-schema';

const clubs = JSON.parse(readFileSync('data/soccer/clubs.json', 'utf8')) as ClubsFile;
const NAMES = clubs.clubs.flatMap((c) => [c.name, ...(c.shortName !== null ? [c.shortName] : []), ...c.aliases]);
const words = (clubTeam: string) => soccerClubTeamWords(clubTeam, NAMES);
const rosters = JSON.parse(readFileSync('data/soccer/club-rosters.json', 'utf8')) as ClubRostersFile;
const ROSTER_BY_URL = new Map(rosters.teams.map((t) => [t.url, t]));
/**
 * The names a cited roster's team goes by: its own, and, for a Hudl roster ("AFC U17 GA", whose age group
 * is not printed), the name of the GotSport roster of the same team it supersedes ("GA 09/10").
 */
const TEAM_NAMES = new Map<string, string[]>(rosters.teams.map((t) => [t.url, [t.teamName]]));
for (const t of rosters.teams) if (t.supersededBy !== undefined) TEAM_NAMES.get(t.supersededBy)?.push(t.teamName);
// The ties a club page prints: a membership whose person is on no soccer row this season is kept and shown nowhere
// (data/soccer/player-index.json), so the rules below do not read it.
const ON_A_ROW = new Set(
  (JSON.parse(readFileSync('data/soccer/player-index.json', 'utf8')) as { rows: Array<[string, string, string, string | null, string]> }).rows
    .filter((r) => r[3] !== null)
    .map((r) => r[0]),
);
const TIES = clubs.memberships.filter((m) => ON_A_ROW.has(m.playerId));

describe('soccerClubTeamWords', () => {
  it('prints every club team in data/soccer/clubs.json in one shape', () => {
    const values = [...new Set(clubs.memberships.flatMap((a) => (a.clubTeam !== null ? [a.clubTeam] : [])))];
    const table = Object.fromEntries(values.sort((x, y) => x.localeCompare(y)).map((v) => [v, words(v)]));
    expect(table).toEqual({
      "'07 ECNL RL": 'ECNL RL G2007',
      '08/09G Blue': 'Blue G2008/09',
      '09 ECNL': 'ECNL G2009',
      '09 NPL': 'NPL G2009',
      '09G ECNL': 'ECNL G2009',
      '09G ECNL-RL': 'ECNL RL G2009',
      '09G Girls Academy': 'GA G2009',
      '10g Black': 'Black G2010',
      '11-10G - PSG': 'PSG G2011 and G2010',
      '11G, GA & NPL': 'GA and NPL G2011',
      '2009/10G ECRL': 'ECNL RL G2009/10',
      '2009G RL-ECNL': 'ECNL RL G2009',
      '2010 Juventus': 'Juventus G2010',
      '2010G ECNL-RL': 'ECNL RL G2010',
      '2011/2012 Girls Blue': 'Blue G2011/12',
      'AFC U13 GA': 'GA',
      'AFC U16 GA': 'GA',
      'AFC U18 GA': 'GA',
      'Alum Rock FC N1 G2008/09 Stingrays (CA)': 'Stingrays N1 G2008/09',
      'Bay Area Surf - ECNL G2011/12': 'ECNL G2011/12',
      'Bay Area Surf - ECNL G2012/13': 'ECNL G2012/13',
      'Bay Area Surf - ECNL RL G2008/09': 'ECNL RL G2008/09',
      'Bay Area Surf - ECNL RL G2009/10': 'ECNL RL G2009/10',
      'Bay Area Surf 09G': 'G2009',
      'Bay Area Surf ECNL': 'ECNL',
      'Bay Area Surf ECNL G2008/09': 'ECNL G2008/09',
      'Bay Area Surf ECNL G2009/10': 'ECNL G2009/10',
      'Bay Area Surf ECNL G2010/11': 'ECNL G2010/11',
      'Bay Area Surf ECNL RL G2010/11': 'ECNL RL G2010/11',
      'Bay Area Surf ECNL RL G2011/12': 'ECNL RL G2011/12',
      Blue: 'Blue',
      'Burlingame SC - ECNL RL G2010/11': 'ECNL RL G2010/11',
      'Burlingame SC - ECNL RL G2011/12': 'ECNL RL G2011/12',
      'Burlingame SC 2011G Gold': 'Gold G2011',
      'Burlingame SC ECNL RL G2008/09': 'ECNL RL G2008/09',
      'Burlingame SC ECNL RL G2009/10': 'ECNL RL G2009/10',
      'Central Valley San Jose N1 G2011/12 Cobras (CA)': 'Cobras N1 G2011/12',
      'Cosmos 11/12G': 'Cosmos G2011/12',
      DPL: 'DPL',
      ECNL: 'ECNL',
      'ECNL G10': 'ECNL G2010',
      'ECNL-RL': 'ECNL RL',
      ECRL: 'ECNL RL',
      'El Camino FC Salinas - ECNL RL G2009/10': 'ECNL RL G2009/10',
      Elite: 'Elite',
      'Elite, Girls Academy': 'Elite GA',
      'FC Milpitas Pumas 10/11G': 'Pumas G2010/11',
      'Force (CA) ECNL G2008/09': 'ECNL G2008/09',
      'Force (CA) ECNL G2009/10': 'ECNL G2009/10',
      'Force (CA) ECNL G2010/11': 'ECNL G2010/11',
      'Force (CA) ECNL G2011/12': 'ECNL G2011/12',
      'Force (CA) ECNL RL G2008/09': 'ECNL RL G2008/09',
      'Force (CA) ECNL RL G2009/10': 'ECNL RL G2009/10',
      'Force (CA) ECNL RL G2010/11': 'ECNL RL G2010/11',
      'Force (CA) ECNL RL G2011/12': 'ECNL RL G2011/12',
      'Force (CA) ECNL RL G2012/13': 'ECNL RL G2012/13',
      'G2009/10 Elite (CA)': 'Elite G2009/10',
      'G2011/12 Elite (CA)': 'Elite G2011/12',
      GA: 'GA',
      'GA & NPL 1': 'GA and NPL 1',
      'GA 08/09': 'GA G2008/09',
      'GA 09/10': 'GA G2009/10',
      'GA 10/11': 'GA G2010/11',
      'GA 11/12': 'GA G2011/12',
      'Girls Academy': 'GA',
      Gold: 'Gold',
      Gunners: 'Gunners',
      'High School Girls': 'High School',
      Huskies: 'Huskies',
      'Los Gatos United Soccer Club ECNL RL G2008/09': 'ECNL RL G2008/09',
      'Los Gatos United Soccer Club ECNL RL G2009/10': 'ECNL RL G2009/10',
      'Los Gatos United Soccer Club ECNL RL G2010/11': 'ECNL RL G2010/11',
      'Los Gatos United Soccer Club ECNL RL G2011/12': 'ECNL RL G2011/12',
      'Los Gatos United Soccer Club ECNL RL G2012/13': 'ECNL RL G2012/13',
      'Marin FC ECNL G2008/09': 'ECNL G2008/09',
      'Monterey Surf N1 G2008/09 (CA)': 'N1 G2008/09',
      'Monterey Surf N1 G2009/10 (CA)': 'N1 G2009/10',
      'Mustang SC ECNL G2010/11': 'ECNL G2010/11',
      'MVLA ECNL G2008/09': 'ECNL G2008/09',
      'MVLA ECNL G2009/10': 'ECNL G2009/10',
      'MVLA ECNL G2010/11': 'ECNL G2010/11',
      'MVLA ECNL G2011/12': 'ECNL G2011/12',
      'MVLA ECNL RL G2008/09': 'ECNL RL G2008/09',
      'MVLA ECNL RL G2009/10': 'ECNL RL G2009/10',
      'MVLA ECNL RL G2010/11': 'ECNL RL G2010/11',
      'MVLA ECNL RL G2011/12': 'ECNL RL G2011/12',
      'MVLA ECNL RL G2012/13': 'ECNL RL G2012/13',
      'N1 G2008 White (CA)': 'White N1 G2008',
      'N1 G2008/09 (CA)': 'N1 G2008/09',
      'N1 G2008/09 Academy (CA)': 'Academy N1 G2008/09',
      'N1 G2008/09 Gunners Green (CA)': 'Gunners Green N1 G2008/09',
      'N1 G2008/09 Quicksilver Green (CA)': 'Quicksilver Green N1 G2008/09',
      'N1 G2010/11 Academy (CA)': 'Academy N1 G2010/11',
      'N1 G2010/11 Quicksilver Green (CA)': 'Quicksilver Green N1 G2010/11',
      N1NPL: 'N1',
      'NV/SJ United 2009/10G Storm': 'Storm G2009/10',
      'National 1': 'N1',
      NPL: 'NPL',
      NPL1: 'NPL 1',
      'Palo Alto SC ECNL RL G2008/09': 'ECNL RL G2008/09',
      'Panthers Black U17G': 'Panthers Black',
      'Pleasanton RAGE ECNL G2008/09': 'ECNL G2008/09',
      'Pleasanton RAGE ECNL G2009/10': 'ECNL G2009/10',
      'Quicksilver Green 2009': 'Quicksilver Green G2009',
      'San Francisco Elite Academy ECNL RL G2011/12': 'ECNL RL G2011/12',
      'Santa Clara Sporting 10G GA': 'GA G2010',
      'Santa Clara Sporting ECNL RL G2008/09': 'ECNL RL G2008/09',
      'Santa Clara Sporting ECNL RL G2009/10': 'ECNL RL G2009/10',
      'Santa Clara Sporting ECNL RL G2010/11': 'ECNL RL G2010/11',
      'Santa Cruz United FC ECNL RL G2008/09': 'ECNL RL G2008/09',
      'Santa Cruz United FC ECNL RL G2010/11': 'ECNL RL G2010/11',
      Silver: 'Silver',
      'Stanford Strikers ECNL RL G2008/09': 'ECNL RL G2008/09',
      'Stanford Strikers ECNL RL G2009/10': 'ECNL RL G2009/10',
      'Stanford Strikers ECNL RL G2010/11': 'ECNL RL G2010/11',
      'Sunnyvale U19G Red 08/09': 'Red G2008/09',
      Thunder: 'Thunder',
      'U15G Black': 'Black',
      'U15G Quicksilver Black': 'Quicksilver Black',
      'U16G Quicksilver Black': 'Quicksilver Black',
      'U17/U18G Comp I': 'Comp I',
    });
  });

  it('never prints a club name or an age group, and writes every birth year one way, last', () => {
    const printed = clubs.memberships.flatMap((a) => {
      const w = a.clubTeam !== null ? words(a.clubTeam) : null;
      return w !== null ? [w] : [];
    });
    for (const w of printed) {
      // Digits only in a birth year (G2009, G2008/09) or a league's own number (N1, NPL 1).
      const years = w.replace(/\b(?:N1|NPL 1)\b/g, '');
      for (const token of years.match(/\S*\d\S*/g) ?? []) expect(token).toMatch(/^G20\d{2}(?:\/\d{2})?$/);
      const at = w.search(/\bG20\d{2}/);
      if (at >= 0) expect(w.slice(at)).toMatch(/^G20\d{2}(?:\/\d{2})?(?: and G20\d{2}(?:\/\d{2})?)*$/); // years come last
      expect(w).not.toMatch(/\bU-?\d/i);
      expect(w).not.toMatch(/\bGirls\b/);
      for (const name of NAMES) expect(` ${w} `.toLowerCase()).not.toContain(` ${name.toLowerCase()} `);
    }
  });

  it('writes a birth year as G and the year, a pair earlier first, whatever shape the source used', () => {
    for (const raw of ['2009', '2009G', 'G2009', '09G', '09g', '09', 'G09', "'09", 'Girls 09']) expect(words(`ECNL ${raw}`)).toBe('ECNL G2009');
    for (const raw of ['G2008/09', '2008/09', '2008/09G', '08/09', '2009/08', '09/08']) expect(words(`ECNL RL ${raw}`)).toBe('ECNL RL G2008/09');
    for (const raw of ['U17', 'U-16', '16u', 'U15G', 'U17/U18G']) expect(words(`ECNL RL ${raw}`)).toBe('ECNL RL'); // an age group is not a birth year
  });

  it('keeps a team name and drops a club name or an age group, in wordings the file no longer holds', () => {
    // Wordings ties carried before 2026-11-25, when the ties that cite a league roster took the roster's team name.
    expect(words('MVLA Madrid ECNL')).toBe('Madrid ECNL');
    expect(words('Juventus ECNL')).toBe('Juventus ECNL');
    expect(words('LGU Girls Academy, ECNL RL')).toBe('GA and ECNL RL');
    expect(words('Santa Clara Sporting G ECNL-RL U17')).toBe('ECNL RL');
    expect(words('U19 GA SVSA (Silicon Valley Soccer Academy)')).toBe('GA');
    expect(words('SVSA Girls Academy II')).toBe('GA II');
    expect(words('Quicksilver Green 2009 and 08/07 GA')).toBe('Quicksilver Green GA G2009 and G2007/08');
  });

  it('names the National 1 League N1, however the source writes it', () => {
    for (const raw of ['N1', 'N1NPL', 'National 1', 'National 1 League']) expect(words(raw)).toBe('N1');
  });

  it('spells each league one way, and keeps the order the source gives two in', () => {
    for (const raw of ['ECNL-RL', 'ECNL RL', 'Ecnl rl', 'ECRL', 'RL-ECNL', 'RL ECNL']) expect(words(raw)).toBe('ECNL RL');
    for (const raw of ['GA', 'Girls Academy', 'girls academy']) expect(words(raw)).toBe('GA');
    expect(words('Girls Academy, ECNL RL')).toBe('GA and ECNL RL');
    expect(words('ECNL RL & GA')).toBe('ECNL RL and GA');
    expect(words('ECNL RL G2009 and ECNL RL G2010')).toBe('ECNL RL G2009 and G2010'); // one league, read twice
  });

  // Where a league roster shows the team, the page prints that team, in the leagues' own shape, not an older
  // profile's "ECNL" or "2010G ECNL" (owner's request, 2026-11-25; clubs.json's notes say how the team is chosen).
  it('prints, for a tie that cites a league roster, a team on one of those rosters', () => {
    const off: string[] = [];
    for (const a of TIES) {
      const teams = a.sources.filter((s) => s.kind === LEAGUE_ROSTER_KIND).map((s) => ROSTER_BY_URL.get(s.url));
      if (teams.length === 0) continue;
      expect(teams.every((t) => t !== undefined), `${a.name}: a cited roster is not in club-rosters.json`).toBe(true);
      const printed = a.clubTeam !== null ? words(a.clubTeam) : null;
      if (!teams.some((t) => t !== undefined && TEAM_NAMES.get(t.url)!.some((n) => words(n) === printed))) off.push(`${a.name} (${a.club}): ${a.clubTeam}`);
    }
    expect(off).toEqual([]);
  });

  it('prints the team the league marks her First Team Player on, when one cited roster does', () => {
    // ECNL's rosters label each row (the quote ends with it); GotSport's carry no label, so they never decide.
    const off: string[] = [];
    for (const a of TIES) {
      const first = [
        ...new Set(
          a.sources
            .filter((s) => s.kind === LEAGUE_ROSTER_KIND && /\|\s*First Team Player\s*$/.test(s.quote))
            .map((s) => ROSTER_BY_URL.get(s.url)?.teamName),
        ),
      ];
      if (first.length !== 1 || first[0] === undefined) continue;
      const printed = a.clubTeam !== null ? words(a.clubTeam) : null;
      if (printed !== words(first[0])) off.push(`${a.name} (${a.club}): ${a.clubTeam}, First Team on ${first[0]}`);
    }
    expect(off).toEqual([]);
  });

  it("never prints a current tie's team in an ECNL league its club has no team in", () => {
    // ECNL's three Northern California leagues were read whole, so a club's ECNL and ECNL RL teams are all known.
    const ecnlLeagues = new Map<string, Set<string>>();
    for (const t of rosters.teams) {
      const slug = rosters.clubSlugs[clubKey(t)];
      const league = t.league === 'ecnl' ? 'ECNL' : t.league.startsWith('ecnl-rl') ? 'ECNL RL' : null;
      if (slug === undefined || league === null) continue;
      if (!ecnlLeagues.has(slug)) ecnlLeagues.set(slug, new Set());
      ecnlLeagues.get(slug)!.add(league);
    }
    const off: string[] = [];
    for (const a of TIES) {
      const has = ecnlLeagues.get(a.club);
      const printed = a.clubTeam !== null ? words(a.clubTeam) : null;
      if (a.status !== 'current' || has === undefined || printed === null) continue;
      for (const league of printed.match(/\bECNL(?: RL)?\b/g) ?? []) if (!has.has(league)) off.push(`${a.name} (${a.club}): ${printed}`);
    }
    expect(off).toEqual([]);
  });
});
