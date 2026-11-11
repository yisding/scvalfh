/**
 * The 2025-26 archive of the soccer and basketball builds: data/soccer/history-2025-26.json and
 * data/basketball/history-2025-26.json, SCVAL alone, built by scripts/build-history.ts from SCVAL's standings
 * PDF (tests/fixtures/<sport>/scval-history/standings-2025-26.txt, the real `pdftotext -layout` output of
 * scval.com's "SCVAL 2025-26 Girls' Soccer Standings.pdf" and "SCVAL 2025-26 Boys' Basketball standings.pdf",
 * read 2026-11-11) and the hand transcription of the all-league PDFs (data/<sport>/official/
 * scval-all-league-2025-26.json).
 *
 * The values a reader sees first are asserted literally: this is committed data, and the page prints it.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { gradeOf } from '../scripts/lib/history-scval-documents';
import { REPO, runScript } from './helpers';

const SPORTS = ['soccer', 'basketball'] as const;
type SportId = (typeof SPORTS)[number];

interface Row { place: number; slug: string; leagueRecord: string; w: number; l: number; t: number | null }
interface Player { player: string; slug: string; year: number }
interface Awards {
  overall: Array<{ award: string; value: string }>;
  firstTeam: Player[];
  secondTeam: Player[];
  thirdTeam?: Player[];
  honorableMention: Player[];
}
interface Division {
  division: string;
  standings: { varsity: Row[]; jv: Row[] };
  awards: { varsity: Awards | null; jv: Awards | null };
}
interface File {
  season: string;
  sport: string;
  leagues: { scval: { status: string; provenance: { source: string; retrievedOn: string }; divisions: Division[] } };
}

const read = (sport: SportId): File =>
  JSON.parse(readFileSync(path.join(REPO, 'data', sport, 'history-2025-26.json'), 'utf8')) as File;
const division = (sport: SportId, id: string) => read(sport).leagues.scval.divisions.find((d) => d.division === id)!;
const order = (rows: Row[]) => rows.map((r) => `${r.slug} ${r.leagueRecord}`);

describe('scripts/build-history.ts for the soccer and basketball builds', () => {
  for (const sport of SPORTS) {
    it(`rebuilds data/${sport}/history-2025-26.json byte for byte from the fixtures`, () => {
      const out = path.join(mkdtempSync(path.join(tmpdir(), `scvalfh-history-${sport}-`)), 'history.json');
      const r = runScript(
        'scripts/build-history.ts',
        ['--from', `tests/fixtures/${sport}/scval-history`, '--out', out],
        { env: { ...process.env, SCVAL_SPORT: sport } },
      );
      expect(r.status, r.output).toBe(0);
      expect(readFileSync(out, 'utf8')).toBe(
        readFileSync(path.join(REPO, 'data', sport, 'history-2025-26.json'), 'utf8'),
      );
    }, 60_000);
  }

  it('writes nothing, and exits 1, when a standings name does not resolve', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'scvalfh-history-bad-'));
    const text = readFileSync(path.join(REPO, 'tests/fixtures/soccer/scval-history/standings-2025-26.txt'), 'utf8');
    writeFileSync(path.join(dir, 'standings-2025-26.txt'), text.replace('Santa Clara ', 'Santa Clarx '));
    const out = path.join(dir, 'history.json');
    const r = runScript('scripts/build-history.ts', ['--from', dir, '--out', out], {
      env: { ...process.env, SCVAL_SPORT: 'soccer' },
    });
    expect(r.status).toBe(1);
    expect(r.output).toMatch(/"Santa Clarx" resolves to no registry team/);
    expect(r.output).toMatch(/nothing written/);
  }, 60_000);

  it('refuses --bval-from, which is field hockey’s', () => {
    const r = runScript('scripts/build-history.ts', ['--bval-from', 'tests/fixtures/bval', '--retrieved-on', '2026-10-03', '--dry-run'], {
      env: { ...process.env, SCVAL_SPORT: 'basketball' },
    });
    expect(r.status).toBe(1);
    expect(r.output).toMatch(/--bval-from is field hockey's/);
  }, 60_000);

  it('reads every year cell the documents print as a grade', () => {
    expect(['Fr', 'Frosh', 'Fresh', 'So', 'SO', 'Soph', 'Jr', 'Junior', 'Sr', 'Senior', '9', '12'].map(gradeOf)).toEqual([
      9, 9, 9, 10, 10, 10, 11, 11, 12, 12, 9, 12,
    ]);
    expect(gradeOf('8')).toBeNull();
    expect(gradeOf('')).toBeNull();
  });
});

describe('data/soccer/history-2025-26.json', () => {
  it('is SCVAL girls soccer, 2025-26, from SCVAL’s own documents', () => {
    const f = read('soccer');
    expect([f.season, f.sport, f.leagues.scval.status, f.leagues.scval.provenance.source]).toEqual([
      '2025-26', 'Girls Soccer', 'available', 'scval-documents',
    ]);
  });

  it('has the PDF’s final tables, in its order', () => {
    expect(order(division('soccer', 'de-anza').standings.varsity)).toEqual([
      'los-gatos 11-0-1', 'mountain-view 8-3-1', 'los-altos 7-5-0', 'homestead 6-4-2', 'palo-alto 5-5-2',
      'santa-clara 2-10-0', 'fremont 0-12-0',
    ]);
    expect(order(division('soccer', 'el-camino').standings.varsity)).toEqual([
      'gunn 11-1-2', 'saratoga 9-2-3', 'monta-vista 9-2-3', 'milpitas 7-3-4', 'wilcox 5-8-1', 'macdonald 4-7-1',
      'cupertino 1-12-1', 'lynbrook 1-12-1',
    ]);
    // El Camino JV had six teams: no Saratoga, no Lynbrook.
    expect(division('soccer', 'el-camino').standings.jv.map((r) => r.slug)).toEqual([
      'milpitas', 'wilcox', 'gunn', 'cupertino', 'monta-vista', 'macdonald',
    ]);
    expect(division('soccer', 'de-anza').standings.jv[0]).toMatchObject({ slug: 'los-gatos', leagueRecord: '10-0-2' });
  });

  it('has each division’s all-league teams, every school keyed', () => {
    const da = division('soccer', 'de-anza').awards;
    const ec = division('soccer', 'el-camino').awards;
    expect(da.varsity!.overall[0]).toEqual({ award: 'Most Valuable Player', value: 'Abby Nelson, Los Gatos, M, 11' });
    expect(ec.varsity!.overall[0]).toEqual({ award: 'Most Valuable Player', value: 'Deborah Romero, Gunn, M, 11' });
    expect([da.varsity, da.jv, ec.varsity, ec.jv].map((a) => [a!.firstTeam.length, a!.secondTeam.length])).toEqual([
      [20, 12], [20, 12], [21, 12], [19, 11],
    ]);
    // "Mt. View" in the De Anza document is Mountain View.
    expect(da.varsity!.firstTeam.find((p) => p.player === 'Sarah Stone')).toMatchObject({ slug: 'mountain-view', year: 12 });
  });
});

describe('data/basketball/history-2025-26.json', () => {
  it('is SCVAL boys basketball, 2025-26, from SCVAL’s own documents', () => {
    const f = read('basketball');
    expect([f.season, f.sport, f.leagues.scval.status, f.leagues.scval.provenance.source]).toEqual([
      '2025-26', 'Boys Basketball', 'available', 'scval-documents',
    ]);
  });

  it('has the PDF’s final tables, W-L, in its order', () => {
    expect(order(division('basketball', 'de-anza').standings.varsity)).toEqual([
      'milpitas 12-0', 'los-gatos 10-2', 'palo-alto 7-5', 'homestead 5-7', 'mountain-view 4-8', 'monta-vista 4-8',
      'wilcox 0-12',
    ]);
    expect(order(division('basketball', 'el-camino').standings.varsity)).toEqual([
      'gunn 11-3', 'lynbrook 11-3', 'los-altos 10-4', 'saratoga 10-4', 'fremont 8-6', 'cupertino 3-11',
      'macdonald 2-12', 'santa-clara 1-13',
    ]);
    // No game ends level: every row is W-L with no ties.
    for (const d of read('basketball').leagues.scval.divisions) {
      for (const r of [...d.standings.varsity, ...d.standings.jv]) expect([r.t, r.leagueRecord]).toEqual([0, `${r.w}-${r.l}`]);
    }
  });

  it('has an MVP and a first, second and third team for each division and level', () => {
    const da = division('basketball', 'de-anza').awards;
    const ec = division('basketball', 'el-camino').awards;
    expect([da.varsity, da.jv, ec.varsity, ec.jv].map((a) => a!.overall.map((o) => o.value))).toEqual([
      ['Dylan Nguyen, Milpitas, G, 12'],
      ['Jack Shapiro, Los Gatos, G, 9'],
      ['Mrinal Dwivedi, Lynbrook, F, 12'],
      ['Albert Li, Los Altos, G, 10'],
    ]);
    expect(
      [da.varsity, da.jv, ec.varsity, ec.jv].map((a) => [a!.firstTeam.length, a!.secondTeam.length, a!.thirdTeam!.length]),
    ).toEqual([
      [7, 7, 7], [7, 8, 7], [7, 7, 8], [7, 9, 8],
    ]);
  });
});
