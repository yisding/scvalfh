/**
 * lib/sources/sds-bracket-sheet.ts — the San Diego Section's bracket sheet, read for its results. Run against
 * the three tabs of both sheets as their CSV exports read on 2026-11-06 (tests/fixtures/sds/sheet-2026/, the
 * live 2026 sheet with the first round and the Open quarterfinals posted; tests/fixtures/sds/sheet-2025/, last
 * season's finished sheet, whose results are checked against data/history-brackets-2025-26.json).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { getHistoryBrackets } from '../lib/history/history';
import { SDS_BRACKETS_FILE, sdsDivisionTeams } from '../lib/postseason/sds-brackets-file';
import {
  headerDate,
  parseScore,
  parseSdsBracketTab,
  type SdsSheetDivision,
  type SdsSheetFixture,
  type SdsSheetResult,
} from '../lib/sources/sds-bracket-sheet';
import { seedsFromHistory } from './fixtures/sds/brackets-2025';
import { REPO } from './helpers';

const csv = (year: 2025 | 2026, division: string) =>
  readFileSync(path.join(REPO, 'tests', 'fixtures', 'sds', `sheet-${year}`, `${division}.csv`), 'utf8');

const divisionsOf = (file: typeof SDS_BRACKETS_FILE): SdsSheetDivision[] =>
  file.divisions.map((d) => ({ id: d.id, label: d.label, teams: sdsDivisionTeams(d) }));

function readAll(year: 2025 | 2026): { results: SdsSheetResult[]; fixtures: SdsSheetFixture[]; warnings: string[] } {
  const divisions = divisionsOf(year === 2026 ? SDS_BRACKETS_FILE : seedsFromHistory('sds'));
  const results: SdsSheetResult[] = [];
  const fixtures: SdsSheetFixture[] = [];
  const warnings: string[] = [];
  for (const d of divisions) {
    const read = parseSdsBracketTab(csv(year, d.id), d);
    if (!read.recognised) throw new Error(`${year} ${d.id}: ${read.reason}`);
    results.push(...read.results);
    fixtures.push(...read.fixtures);
    warnings.push(...read.warnings);
  }
  return { results, fixtures, warnings };
}

const fixtureLine = (f: SdsSheetFixture) =>
  `${f.division} ${f.dateKey} ${f.time ?? '--:--'} ${f.teams.join(' v ')}${f.venue ? ` @ ${f.venue}` : ''}`;

const line = (r: SdsSheetResult) =>
  `${r.division} ${r.dateKey} ${r.time ?? '--:--'} ${r.winner} ${r.winnerGoals}-${r.loserGoals} ${r.loser}` +
  `${r.otPeriods ? ` ${r.otPeriods}OT` : ''}${r.shootout ? ' SO' : ''}`;

describe('cells', () => {
  it('reads the round dates the sheet prints', () => {
    expect(headerDate('Tuesday, November 03, 2026')).toBe('2026-11-03');
    expect(headerDate('Saturday, November 15, 2025')).toBe('2025-11-15');
    expect(headerDate('@ Higher Seed')).toBeNull();
  });

  it('reads every score form the two sheets use, winner first', () => {
    expect(parseScore('3-1')).toMatchObject({ winnerGoals: 3, loserGoals: 1, otPeriods: 0, shootout: false });
    expect(parseScore('3-2(OT)')).toMatchObject({ winnerGoals: 3, loserGoals: 2, otPeriods: 1, shootout: false });
    expect(parseScore('1-0 (2OT)')).toMatchObject({ winnerGoals: 1, loserGoals: 0, otPeriods: 2, shootout: false });
    expect(parseScore('1-1 (2-1 SO)')).toMatchObject({ winnerGoals: 1, loserGoals: 1, otPeriods: 0, shootout: true });
    expect(parseScore('2-2 (SO)')).toMatchObject({ shootout: true });
    expect(parseScore('Game Time: 6:00 PM')).toBeNull();
    expect(parseScore('3:15PM')).toBeNull();
  });
});

describe('the 2026 sheet (read 2026-11-06)', () => {
  const { results, fixtures, warnings } = readAll(2026);

  it('lists every game with both teams known and no score, with its date, time and place', () => {
    expect(fixtures.map(fixtureLine)).toEqual([
      // Played, the winner written with no score under it.
      'open 2026-11-05 15:15 bishops v eastlake',
      'open 2026-11-10 14:30 bishops v scripps-ranch',
      'open 2026-11-10 --:-- torrey-pines v canyon-hills',
      'division-1 2026-11-06 17:00 clairemont v poway',
      'division-1 2026-11-06 18:00 mt-carmel v university-city',
      'division-1 2026-11-06 17:00 rancho-bernardo v san-dieguito-academy',
      'division-1 2026-11-06 18:00 mission-bay v san-marcos',
      'division-2 2026-11-02 17:30 sage-creek v granite-hills',
      'division-2 2026-11-07 13:00 point-loma v helix',
      // "Game Moved to Friday, November 6th".
      'division-2 2026-11-06 16:30 sage-creek v olympian',
      'division-2 2026-11-07 10:00 westview v mission-vista @ Vista High School',
      'division-2 2026-11-06 20:00 san-pasqual v mission-hills',
    ]);
  });

  it('reads every posted result, and nothing it cannot place', () => {
    expect(warnings).toEqual([]);
    expect(results.map(line)).toEqual([
      'open 2026-11-05 18:00 scripps-ranch 2-0 la-jolla',
      'open 2026-11-05 18:00 torrey-pines 4-0 del-norte',
      'open 2026-11-05 17:00 canyon-hills 5-1 la-costa-canyon',
      'division-1 2026-11-03 18:00 poway 3-1 canyon-crest-academy',
      'division-1 2026-11-03 16:30 mt-carmel 2-0 fallbrook',
      // "Game Moved to Wednesday, November 4th" between the two teams.
      'division-1 2026-11-04 17:30 rancho-bernardo 1-0 cathedral-catholic',
      'division-1 2026-11-03 16:00 mission-bay 3-2 la-jolla-country-day 1OT',
      'division-2 2026-11-04 19:00 helix 2-1 hilltop',
      'division-2 2026-11-04 17:30 sage-creek 1-0 otay-ranch 2OT',
      'division-2 2026-11-04 16:00 westview 9-0 patrick-henry',
      'division-2 2026-11-04 18:00 san-pasqual 5-0 mira-mesa',
    ]);
  });

  it('reads no result for a winner the sheet posts without a score (the play-in, Bishop’s over Eastlake)', () => {
    const teams = results.flatMap((r) => [r.winner, r.loser]);
    expect(teams).not.toContain('granite-hills');
    expect(teams).not.toContain('eastlake');
  });

  it('reads a final from the champion written beside it, at the site the round header names', () => {
    // A finished Division I in the sheet's layout: the semifinals in B, the final in C, the champion in D.
    const finished = [
      'Division I,,,',
      ',"Tuesday, November 10, 2026","Saturday, November 14, 2026",',
      ',@ Higher Seed,3:30PM @ La Jolla High School,',
      ',,,',
      '#1,Clairemont HS,,',
      ',,Clairemont HS,',
      '#4,University City HS,2-0,',
      ',,,Clairemont HS',
      '#2,San Marcos HS,,2-1 (OT)',
      ',,San Marcos HS,',
      '#3,San Dieguito Academy,1-0,',
    ].join('\n');
    const read = parseSdsBracketTab(finished, divisionsOf(SDS_BRACKETS_FILE).find((d) => d.id === 'division-1')!);
    expect(read.recognised).toBe(true);
    if (!read.recognised) return;
    expect(read.warnings).toEqual([]);
    expect(read.results.map(line)).toEqual([
      'division-1 2026-11-10 --:-- clairemont 2-0 university-city',
      'division-1 2026-11-10 --:-- san-marcos 1-0 san-dieguito-academy',
      'division-1 2026-11-14 15:30 clairemont 2-1 san-marcos 1OT',
    ]);
    expect(read.results[2].venue).toBe('La Jolla High School');
  });
});

describe('the 2025 sheet', () => {
  const { results, fixtures, warnings } = readAll(2025);

  it('lists the three finals, whose champions it writes with no score, as games without a result', () => {
    expect(fixtures.map((f) => `${f.dateKey} ${f.time}`)).toEqual(['2025-11-15 18:00', '2025-11-15 15:30', '2025-11-15 13:00']);
    expect(fixtures.every((f) => f.venue === 'La Jolla High School')).toBe(true);
  });
  const pair = (a: string, b: string) => [a, b].sort().join(' v ');
  const history = getHistoryBrackets()
    .find((b) => b.id === 'sds')!
    .bracket.divisions.flatMap((d) => d.rounds.flatMap((r) => r.games));

  it('reads every scored game of the three brackets: all but the finals, whose scores the sheet never posted', () => {
    expect(warnings).toEqual([]);
    expect(results).toHaveLength(27);
    expect(history.length - results.length).toBe(3);
  });

  it('agrees with the 2025 Record Book on every winner', () => {
    const winner = new Map(history.map((g) => [pair(g.top.slug, g.bottom.slug), g[g.winner].slug]));
    for (const r of results) expect(winner.get(pair(r.winner, r.loser)), line(r)).toBe(r.winner);
  });

  it('reads the shootout, the overtimes and the moved quarterfinal', () => {
    const lines = results.map(line);
    expect(lines).toContain('open 2025-11-06 18:00 canyon-crest-academy 1-1 torrey-pines SO');
    expect(lines).toContain('division-2 2025-11-08 13:00 rancho-buena-vista 1-0 olympian 2OT');
    expect(lines).toContain('division-1 2025-11-06 18:00 rancho-bernardo 2-0 clairemont');
    expect(lines).toContain('division-2 2025-11-03 18:00 helix 2-1 granite-hills');
  });
});

describe('what is not read', () => {
  const div = divisionsOf(SDS_BRACKETS_FILE).find((d) => d.id === 'division-1')!;

  it('a tab whose title is not the division’s', () => {
    expect(parseSdsBracketTab(csv(2026, 'open'), div)).toMatchObject({ recognised: false });
  });

  it('a tab with no dated rounds', () => {
    const rows = csv(2026, 'division-1').split('\n');
    rows[1] = ',,,,,';
    expect(parseSdsBracketTab(rows.join('\n'), div)).toMatchObject({ recognised: false });
  });

  it('a column with a cell it cannot place, and the games fed from it', () => {
    // "Mission Bay HS" in the first-round column becomes a name no Division I team answers to.
    const text = csv(2026, 'division-1').replace('#7,Mission Bay HS', '#7,Mission Bay Bucs');
    const read = parseSdsBracketTab(text, div);
    expect(read.recognised).toBe(true);
    if (!read.recognised) return;
    expect(read.results).toEqual([]);
    expect(read.warnings).toEqual([expect.stringContaining('column B not read (row 46 reads "Mission Bay Bucs")')]);
  });

  it('a score written loser first', () => {
    const read = parseSdsBracketTab(csv(2026, 'division-1').replace(',,,3-1,,', ',,,1-3,,'), div);
    expect(read.recognised).toBe(true);
    if (!read.recognised) return;
    expect(read.results.map((r) => r.winner)).not.toContain('poway');
    expect(read.warnings).toEqual([expect.stringContaining('poway won')]);
  });
});
