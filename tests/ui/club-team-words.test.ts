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
      "'07 ECNL RL": 'ECNL RL G2007',
      '09 ECNL': 'ECNL G2009',
      '08/09G Blue': 'Blue G2008/09',
      '09 GA': 'GA G2009',
      '09 NPL': 'NPL G2009',
      '09G ECNL': 'ECNL G2009',
      '09G ECNL-RL': 'ECNL RL G2009',
      '09G Girls Academy': 'GA G2009',
      '10g Black': 'Black G2010',
      '11G, GA & NPL': 'GA and NPL G2011',
      '2009/10G ECRL': 'ECNL RL G2009/10',
      '2009G RL-ECNL': 'ECNL RL G2009',
      '2010': 'G2010',
      '2010 Juventus': 'Juventus G2010',
      '2010G ECNL': 'ECNL G2010',
      '2010G ECNL-RL': 'ECNL RL G2010',
      AFC: null,
      'AFC U13 GA': 'GA',
      'AFC U16 GA': 'GA',
      'AFC U17 GA': 'GA',
      'AFC U18 GA': 'GA',
      'Almaden FC 2011 Girls Academy': 'GA G2011',
      'Bay Area Surf - ECNL G2011/12': 'ECNL G2011/12',
      'Bay Area Surf - ECNL RL G2008/09': 'ECNL RL G2008/09',
      'Bay Area Surf - ECNL RL G2009/10': 'ECNL RL G2009/10',
      'Bay Area Surf 09G': 'G2009',
      'Bay Area Surf ECNL': 'ECNL',
      'Bay Area Surf ECNL 2010G': 'ECNL G2010',
      'Bay Area Surf ECNL G2008/09': 'ECNL G2008/09',
      'Bay Area Surf ECNL G2009/10': 'ECNL G2009/10',
      'Bay Area Surf ECNL RL G2010/11': 'ECNL RL G2010/11',
      'Bay Area Surf ECNL G2010/11': 'ECNL G2010/11',
      'Bay Area Surf ECNL RL G2011/12': 'ECNL RL G2011/12',
      Blue: 'Blue',
      'Burlingame SC - ECNL RL G2011/12': 'ECNL RL G2011/12',
      'Burlingame SC 2011G Gold': 'Gold G2011',
      'Burlingame SC ECNL RL G2008/09': 'ECNL RL G2008/09',
      'Burlingame SC ECNL RL G2009/10': 'ECNL RL G2009/10',
      'De Anza Force ECNL-RL 10G': 'ECNL RL G2010',
      DPL: 'DPL',
      ECNL: 'ECNL',
      'ECNL G10': 'ECNL G2010',
      'ECNL Girls 09': 'ECNL G2009',
      'Ecnl rl': 'ECNL RL',
      'ECNL RL': 'ECNL RL',
      'ECNL-RL': 'ECNL RL',
      ECRL: 'ECNL RL',
      Elite: 'Elite',
      'Elite, Girls Academy': 'Elite GA',
      'FC Bay Area Surf 2010G': 'G2010',
      'Force (CA) ECNL G2008/09': 'ECNL G2008/09',
      'Force (CA) ECNL G2009/10': 'ECNL G2009/10',
      'Force (CA) ECNL G2010/11': 'ECNL G2010/11',
      'Force (CA) ECNL G2011/12': 'ECNL G2011/12',
      'Force (CA) ECNL RL G2009/10': 'ECNL RL G2009/10',
      'Force (CA) ECNL RL G2010/11': 'ECNL RL G2010/11',
      'FC Milpitas Pumas 10/11G': 'Pumas G2010/11',
      'Force (CA) ECNL RL G2011/12': 'ECNL RL G2011/12',
      'G2009/10 Elite (CA)': 'Elite G2009/10',
      'G2011/12 Elite (CA)': 'Elite G2011/12',
      'Force (CA) ECNL RL G2012/13': 'ECNL RL G2012/13',
      'Force ECNL RL': 'ECNL RL',
      GA: 'GA',
      'GA & NPL 1': 'GA and NPL 1',
      'GA 08/09': 'GA G2008/09',
      'GA 09/10': 'GA G2009/10',
      'GA 10/11': 'GA G2010/11',
      'GA 11/12': 'GA G2011/12',
      'Girls Academy': 'GA',
      Gold: 'Gold',
      Gunners: 'Gunners',
      Huskies: 'Huskies',
      'Juventus ECNL': 'Juventus ECNL',
      'LGU Girls Academy, ECNL RL': 'GA and ECNL RL',
      'Los Gatos United Soccer Club ECNL RL G2008/09': 'ECNL RL G2008/09',
      'Los Gatos United Soccer Club ECNL RL G2009/10': 'ECNL RL G2009/10',
      'Los Gatos United Soccer Club ECNL RL G2010/11': 'ECNL RL G2010/11',
      'Los Gatos United Soccer Club ECNL RL G2012/13': 'ECNL RL G2012/13',
      'Marin FC ECNL G2008/09': 'ECNL G2008/09',
      'MVLA ECNL G2008/09': 'ECNL G2008/09',
      'MVLA ECNL G2009/10': 'ECNL G2009/10',
      'MVLA ECNL G2010/11': 'ECNL G2010/11',
      'MVLA ECNL G2011/12': 'ECNL G2011/12',
      'MVLA ECNL RL G2008/09': 'ECNL RL G2008/09',
      'MVLA ECNL RL G2009/10': 'ECNL RL G2009/10',
      'MVLA ECNL RL G2010/11': 'ECNL RL G2010/11',
      'MVLA ECNL RL G2011/12': 'ECNL RL G2011/12',
      'MVLA ECNL RL G2012/13': 'ECNL RL G2012/13',
      'MVLA Madrid ECNL': 'Madrid ECNL',
      N1NPL: 'N1',
      'National 1': 'N1',
      'NorCal Gold Level': 'NorCal Gold Level',
      NPL: 'NPL',
      NPL1: 'NPL 1',
      'Palo Alto SC ECNL RL G2008/09': 'ECNL RL G2008/09',
      'Quicksilver green': 'Quicksilver Green',
      'Quicksilver Green 2009': 'Quicksilver Green G2009',
      'Quicksilver Green 2009 and 08/07 GA': 'Quicksilver Green GA G2009 and G2007/08',
      'San Francisco Elite Academy ECNL RL G2011/12': 'ECNL RL G2011/12',
      'Santa Clara Sporting 10G GA': 'GA G2010',
      'Santa Clara Sporting ECNL RL G2008/09': 'ECNL RL G2008/09',
      'Santa Clara Sporting ECNL RL G2009/10': 'ECNL RL G2009/10',
      'Santa Clara Sporting ECNL RL G2010/11': 'ECNL RL G2010/11',
      'Santa Clara Sporting G ECNL-RL U17': 'ECNL RL',
      'Santa Cruz United FC ECNL RL G2008/09': 'ECNL RL G2008/09',
      'Santa Cruz United FC ECNL RL G2010/11': 'ECNL RL G2010/11',
      Silver: 'Silver',
      'Stanford Strikers ECNL RL G2008/09': 'ECNL RL G2008/09',
      'Stanford Strikers ECNL RL G2009/10': 'ECNL RL G2009/10',
      'N1 G2008/09 Gunners Green (CA)': 'Gunners Green N1 G2008/09',
      'N1 G2010/11 Quicksilver Green (CA)': 'Quicksilver Green N1 G2010/11',
      'State Premier': 'State Premier',
      'Sunnyvale U19G Red 08/09': 'Red G2008/09',
      'SVSA Girls Academy II': 'GA II',
      Thunder: 'Thunder',
      'U15G Quicksilver Black': 'Quicksilver Black',
      'U17/U18G Comp I': 'Comp I',
      'U16G Quicksilver Black': 'Quicksilver Black',
      'U19 GA SVSA (Silicon Valley Soccer Academy)': 'GA',
    });
  });

  it('never prints a club name or an age group, and writes every birth year one way, last', () => {
    const printed = [...clubs.affiliations, ...clubs.jvAffiliations].flatMap((a) => {
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
});
