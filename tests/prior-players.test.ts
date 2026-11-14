/**
 * Last season's players from MaxPreps' stat sheets: the names parser (lib/sources/maxpreps-stats-names.ts)
 * on answers shaped like the rollup's, and each sport's committed data/prior-players.json.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { REPO as ROOT } from './helpers';
import { PriorPlayersSchema, countPriorPlayers } from '../lib/players/prior-players-schema';
import { sportDataDir } from '../lib/players/registry-file';
import { gradeFromCaption, nameFromCareerUrl, parseStatSheetNames } from '../lib/sources/maxpreps-stats-names';
import { SPORT_IDS } from '../lib/sports/current';

const career = (slug: string, id: string) => `https://www.maxpreps.com/ca/town/school-mascots/athletes/${slug}/?careerid=${id}`;
const cell = (value: string | null, href: string | null = null, caption: string | null = null) => ({ value, href, caption });

/** A rollup answer: each table is [columns, rows], a row being jersey, name cell, then counts. */
function sheet(groups: Array<{ name: string; tables: Array<{ columns: string[]; rows: Array<Array<ReturnType<typeof cell>>> }> }>, over: Record<string, unknown> = {}) {
  return {
    status: 200,
    message: null,
    data: {
      teamId: 'team-1',
      sportSeasonId: 'season-1',
      groups: groups.map((g) => ({
        name: g.name,
        subgroups: g.tables.map((t, i) => ({
          name: i === 0 ? '' : `(${i + 1})`,
          stats: { columns: t.columns.map((name) => ({ name })), rows: t.rows.map((columns) => ({ columns })) },
        })),
      })),
      ...over,
    },
  };
}

const OPTS = { expectedTeamId: 'team-1', expectedSeasonId: 'season-1' };

describe('nameFromCareerUrl', () => {
  it('takes the first name from the link and the last name from the sheet', () => {
    expect(nameFromCareerUrl(career('storey-lewis', 'a'), 'S. Lewis')).toBe('Storey Lewis');
    expect(nameFromCareerUrl(career('olivia-van-de-braak', 'a'), 'O. Van De Braak')).toBe('Olivia Van De Braak');
    expect(nameFromCareerUrl(career('mary-kate-oneil', 'a'), "M. O'Neil")).toBe("Mary Kate O'Neil");
    expect(nameFromCareerUrl(career('linnea-boublik-whiteley', 'a'), 'L. Boublik-Whiteley')).toBe('Linnea Boublik-Whiteley');
  });

  it('falls back to the link\'s own words when the two disagree, and to nothing without a readable link', () => {
    expect(nameFromCareerUrl(career('ayva-garcia', 'a'), 'A. Yam')).toBe('Ayva Garcia');
    expect(nameFromCareerUrl(career('soland039%3be-campos', 'a'), 'S. Campos')).toBeNull();
    expect(nameFromCareerUrl(career('sofía-durazo', 'a'), 'S. Durazo')).toBe('Sofía Durazo');
    expect(nameFromCareerUrl(career('sof%C3%ADa-durazo', 'a'), 'S. Durazo')).toBe('Sofía Durazo');
    expect(nameFromCareerUrl(null, 'S. Lewis')).toBeNull();
    expect(nameFromCareerUrl('https://www.maxpreps.com/ca/town/school/', 'S. Lewis')).toBeNull();
  });
});

describe('gradeFromCaption', () => {
  it('reads the four classes and a blank', () => {
    expect(['(Fr)', '(So)', '(Jr)', '(Sr)', '', null].map((c) => gradeFromCaption(c, 'u'))).toEqual([9, 10, 11, 12, null, null]);
  });
  it('throws on anything else', () => {
    expect(() => gradeFromCaption('(8th)', 'u')).toThrow(/class caption/);
  });
});

describe('parseStatSheetNames', () => {
  it('lists each player once, from every table of every group', () => {
    const names = parseStatSheetNames(
      sheet([
        {
          name: 'Field Stats',
          tables: [
            { columns: ['Jersey', 'Name', 'Goals'], rows: [[cell('17'), cell('S. Lewis', career('storey-lewis', 'c1'), '(Jr)'), cell('3')], [cell(''), cell('A. PARK', career('ana-park', 'c2'), ''), cell('0')]] },
            { columns: ['Jersey', 'Name', 'Steals'], rows: [[cell('17'), cell('S. Lewis', career('storey-lewis', 'c1'), '(Jr)'), cell('1')]] },
          ],
        },
        { name: 'Goaltending', tables: [{ columns: ['Jersey', 'Name', 'Saves'], rows: [[cell('1'), cell('A. Park', career('ana-park', 'c2'), '(Sr)'), cell('9')], [cell('-'), cell('N. Link'), cell('2')]] }] },
      ]),
      OPTS,
    );
    expect(names).toEqual([
      { careerId: 'c1', careerUrl: career('storey-lewis', 'c1'), shortName: 'S. Lewis', name: 'Storey Lewis', nameFrom: 'career-url', jersey: '17', grade: 11 },
      // A number and a class one table leaves blank come from the table that gives them.
      { careerId: 'c2', careerUrl: career('ana-park', 'c2'), shortName: 'A. Park', name: 'Ana Park', nameFrom: 'career-url', jersey: '1', grade: 12 },
      { careerId: null, careerUrl: null, shortName: 'N. Link', name: 'N. Link', nameFrom: 'short-name', jersey: null, grade: null },
    ]);
  });

  it('reads MaxPreps\' "no data" answer as no sheet, and nothing else that way', () => {
    expect(parseStatSheetNames({ status: 400, message: 'No data was found for this request.', data: null }, OPTS)).toBeNull();
    expect(() => parseStatSheetNames({ status: 400, message: 'Bad team id', data: null }, OPTS)).toThrow(/no data and status 400/);
    expect(() => parseStatSheetNames({ status: 200, data: null }, OPTS)).toThrow(/no data and status 200/);
  });

  it('refuses another season\'s or another team\'s sheet', () => {
    const table = [{ name: 'Field Stats', tables: [{ columns: ['Name'], rows: [[cell('S. Lewis', career('storey-lewis', 'c1'), '(Jr)')]] }] }];
    expect(() => parseStatSheetNames(sheet(table, { sportSeasonId: 'season-2' }), OPTS)).toThrow(/sportSeasonId season-2, expected season-1/);
    expect(() => parseStatSheetNames(sheet(table, { teamId: 'team-2' }), OPTS)).toThrow(/teamId team-2, expected team-1/);
  });

  it('throws on drift: no Name column, a short row, one career under two classes', () => {
    expect(() => parseStatSheetNames(sheet([{ name: 'Field Stats', tables: [{ columns: ['Jersey', 'Goals'], rows: [] }] }]), OPTS)).toThrow(/no Name column/);
    expect(() => parseStatSheetNames(sheet([{ name: 'Field Stats', tables: [{ columns: ['Jersey', 'Name'], rows: [[cell('S. Lewis')]] }] }]), OPTS)).toThrow(/1 cells for 2 columns/);
    expect(() =>
      parseStatSheetNames(
        sheet([
          { name: 'A', tables: [{ columns: ['Name'], rows: [[cell('S. Lewis', career('storey-lewis', 'c1'), '(Jr)')]] }] },
          { name: 'B', tables: [{ columns: ['Name'], rows: [[cell('S. Lewis', career('storey-lewis', 'c1'), '(Sr)')]] }] },
        ]),
        OPTS,
      ),
    ).toThrow(/grade 11 in one table and 12 in another/);
    expect(() => parseStatSheetNames({ data: { teamId: 1 } }, OPTS)).toThrow(/schema drift/);
  });
});

describe('data/prior-players.json', () => {
  for (const sport of SPORT_IDS) {
    const rel = `${sportDataDir(sport)}/prior-players.json`;
    it.skipIf(!existsSync(path.join(ROOT, rel)))(`${rel} validates, is this sport's, and matches its prior-season file`, () => {
      const file = PriorPlayersSchema.parse(JSON.parse(readFileSync(path.join(ROOT, rel), 'utf8')));
      expect(file.sport).toBe(sport);
      expect(file.counts).toEqual(countPriorPlayers(file.teams));
      const prior = JSON.parse(readFileSync(path.join(ROOT, sportDataDir(sport), 'prior-season.json'), 'utf8')) as { maxprepsYear: string; sportSeasonId: string };
      expect(file.season).toBe(prior.maxprepsYear);
      expect(file.sportSeasonId).toBe(prior.sportSeasonId);
      // Teams of this sport's registry (a team added since is simply not in it yet).
      const rosters = JSON.parse(readFileSync(path.join(ROOT, sportDataDir(sport), 'rosters.json'), 'utf8')) as { teams: Array<{ slug: string }> };
      const known = new Set(rosters.teams.map((t) => t.slug));
      expect(file.teams.map((t) => t.slug).filter((slug) => !known.has(slug))).toEqual([]);
    });
  }
});
