/**
 * components/words/club-team-words.ts: one shape for the club team a soccer club page prints, over
 * every `clubTeam` in data/soccer/clubs.json (read from disk, whatever sport the run is for).
 *
 * The table below is every distinct value in the file and what a page prints for it. A tie added by
 * hand in a shape the rules miss shows up here as a new row: read it, and if it reads wrong, fix the
 * rule rather than the data.
 */

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { soccerClubTeamWords } from '../../components/words/club-team-words';
import type { ClubsFile } from '../../lib/players/clubs-schema';

const clubs = JSON.parse(readFileSync('data/soccer/clubs.json', 'utf8')) as ClubsFile;
const NAMES = clubs.clubs.flatMap((c) => [c.name, ...(c.shortName !== null ? [c.shortName] : []), ...c.aliases]);
const words = (clubTeam: string) => soccerClubTeamWords(clubTeam, NAMES);

describe('soccerClubTeamWords', () => {
  it('prints every club team in data/soccer/clubs.json in one shape', () => {
    const values = [...new Set([...clubs.affiliations, ...clubs.jvAffiliations].flatMap((a) => (a.clubTeam !== null ? [a.clubTeam] : [])))];
    const table = Object.fromEntries(values.sort((x, y) => x.localeCompare(y)).map((v) => [v, words(v)]));
    expect(table).toEqual({
      "'07 ECNL RL": 'ECNL RL',
      '09 ECNL': 'ECNL',
      '09 GA': 'GA',
      '09 NPL': 'NPL',
      '09G ECNL': 'ECNL',
      '09G ECNL-RL': 'ECNL RL',
      '09G Girls Academy': 'GA',
      '10g Black': 'Black',
      '11G, GA & NPL': 'GA and NPL',
      '2009/10G ECRL': 'ECNL RL',
      '2009G': null,
      '2009G RL-ECNL': 'ECNL RL',
      '2010': null,
      '2010 Juventus': 'Juventus',
      '2010G ECNL': 'ECNL',
      '2010G ECNL-RL': 'ECNL RL',
      AFC: null,
      'AFC U13 GA': 'GA',
      'AFC U16 GA': 'GA',
      'AFC U17 GA': 'GA',
      'AFC U18 GA': 'GA',
      'Almaden FC 2011 Girls Academy': 'GA',
      'Bay Area Surf - ECNL G2011/12': 'ECNL',
      'Bay Area Surf 09G': null,
      'Bay Area Surf ECNL': 'ECNL',
      'Bay Area Surf ECNL 2010G': 'ECNL',
      'Bay Area Surf ECNL G2008/09': 'ECNL',
      'Bay Area Surf ECNL G2009/10': 'ECNL',
      Blue: 'Blue',
      'Burlingame SC - ECNL RL G2011/12': 'ECNL RL',
      'Burlingame SC 2011G Gold': 'Gold',
      'Burlingame SC ECNL RL G2008/09': 'ECNL RL',
      'Burlingame SC ECNL RL G2009/10': 'ECNL RL',
      'De Anza Force ECNL-RL 10G': 'ECNL RL',
      DPL: 'DPL',
      ECNL: 'ECNL',
      'ECNL G10': 'ECNL',
      'ECNL Girls 09': 'ECNL',
      'ECNL RL': 'ECNL RL',
      'Ecnl rl': 'ECNL RL',
      'ECNL-RL': 'ECNL RL',
      ECRL: 'ECNL RL',
      Elite: 'Elite',
      'Elite, Girls Academy': 'Elite GA',
      'FC Bay Area Surf 2010G': null,
      'Force (CA) ECNL G2008/09': 'ECNL',
      'Force (CA) ECNL G2009/10': 'ECNL',
      'Force (CA) ECNL G2010/11': 'ECNL',
      'Force (CA) ECNL G2011/12': 'ECNL',
      'Force ECNL RL': 'ECNL RL',
      GA: 'GA',
      'GA & NPL 1': 'GA and NPL 1',
      'Girls Academy': 'GA',
      Gold: 'Gold',
      Gunners: 'Gunners',
      Huskies: 'Huskies',
      'Juventus ECNL': 'Juventus ECNL',
      'LGU Girls Academy, ECNL RL': 'GA and ECNL RL',
      'Los Gatos United Soccer Club ECNL RL G2008/09': 'ECNL RL',
      'Los Gatos United Soccer Club ECNL RL G2009/10': 'ECNL RL',
      'Los Gatos United Soccer Club ECNL RL G2010/11': 'ECNL RL',
      'Marin FC ECNL G2008/09': 'ECNL',
      'MVLA ECNL G2008/09': 'ECNL',
      'MVLA ECNL G2009/10': 'ECNL',
      'MVLA ECNL G2010/11': 'ECNL',
      'MVLA ECNL G2011/12': 'ECNL',
      'MVLA Madrid ECNL': 'Madrid ECNL',
      'N1NPL': 'N1 NPL',
      'National 1': 'National 1',
      'NorCal Gold Level': 'NorCal Gold Level',
      NPL: 'NPL',
      NPL1: 'NPL 1',
      'Palo Alto SC ECNL RL G2008/09': 'ECNL RL',
      Premier: 'Premier',
      'Quicksilver Green 2009': 'Quicksilver Green',
      'Quicksilver Green 2009 and 08/07 GA': 'Quicksilver Green GA',
      'Quicksilver green': 'Quicksilver Green',
      'San Francisco Elite Academy ECNL RL G2011/12': 'ECNL RL',
      'Santa Clara Sporting 10G GA': 'GA',
      'Santa Clara Sporting ECNL RL G2008/09': 'ECNL RL',
      'Santa Clara Sporting ECNL RL G2009/10': 'ECNL RL',
      'Santa Clara Sporting ECNL RL G2010/11': 'ECNL RL',
      'Santa Clara Sporting G ECNL-RL U17': 'ECNL RL',
      'Santa Cruz United FC ECNL RL G2008/09': 'ECNL RL',
      'Santa Cruz United FC ECNL RL G2010/11': 'ECNL RL',
      Silver: 'Silver',
      'Stanford Strikers ECNL RL G2008/09': 'ECNL RL',
      'Stanford Strikers ECNL RL G2009/10': 'ECNL RL',
      'State Premier': 'State Premier',
      'SVSA Girls Academy II': 'GA II',
      Thunder: 'Thunder',
      'U19 GA SVSA (Silicon Valley Soccer Academy)': 'GA',
    });
  });

  it('never prints a club name, a birth year or an age group', () => {
    const printed = [...clubs.affiliations, ...clubs.jvAffiliations].flatMap((a) => {
      const w = a.clubTeam !== null ? words(a.clubTeam) : null;
      return w !== null ? [w] : [];
    });
    for (const w of printed) {
      expect(w).not.toMatch(/\d{2}/);
      expect(w).not.toMatch(/\bU-?\d/i);
      expect(w).not.toMatch(/\bGirls\b/);
      for (const name of NAMES) expect(` ${w} `.toLowerCase()).not.toContain(` ${name.toLowerCase()} `);
    }
  });

  it('spells each league one way, and keeps the order the source gives two in', () => {
    for (const raw of ['ECNL-RL', 'ECNL RL', 'Ecnl rl', 'ECRL', 'RL-ECNL', 'RL ECNL']) expect(words(raw)).toBe('ECNL RL');
    for (const raw of ['GA', 'Girls Academy', 'girls academy']) expect(words(raw)).toBe('GA');
    expect(words('Girls Academy, ECNL RL')).toBe('GA and ECNL RL');
    expect(words('ECNL RL & GA')).toBe('ECNL RL and GA');
  });
});
