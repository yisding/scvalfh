/**
 * The 2025-26 archive of the soccer, basketball and volleyball builds: data/<sport>/history-2025-26.json. BVAL's
 * entry is its official 2025-26 standings sheet for the sport (tests/fixtures/<sport>/bval-history/standings-2025-26.csv,
 * the sheet's CSV export, read 2026-11-16; tested at the end of this file). SCVAL's is built from its standings
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

/** The offline BVAL flags: the sheet's CSV as saved on 2026-11-16 (tests/fixtures/<sport>/bval-history). */
const bvalFlags = (sport: string) => ['--bval-from', `tests/fixtures/${sport}/bval-history`, '--retrieved-on', '2026-11-16'];

describe('scripts/build-history.ts for the soccer, basketball and volleyball builds', () => {
  for (const sport of [...SPORTS, 'volleyball'] as const) {
    it(`rebuilds data/${sport}/history-2025-26.json byte for byte from the fixtures`, () => {
      const out = path.join(mkdtempSync(path.join(tmpdir(), `scvalfh-history-${sport}-`)), 'history.json');
      const r = runScript(
        'scripts/build-history.ts',
        ['--from', `tests/fixtures/${sport}/scval-history`, ...bvalFlags(sport), '--out', out],
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
    const r = runScript('scripts/build-history.ts', ['--from', dir, ...bvalFlags('soccer'), '--out', out], {
      env: { ...process.env, SCVAL_SPORT: 'soccer' },
    });
    expect(r.status).toBe(1);
    expect(r.output).toMatch(/"Santa Clarx" resolves to no registry team/);
    expect(r.output).toMatch(/nothing written/);
  }, 60_000);

  it('writes nothing, and exits 1, when a BVAL sheet name does not resolve or a division block is missing', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'scvalfh-history-bval-bad-'));
    const csv = readFileSync(path.join(REPO, 'tests/fixtures/basketball/bval-history/standings-2025-26.csv'), 'utf8');
    writeFileSync(
      path.join(dir, 'standings-2025-26.csv'),
      csv.replace('Overfelt,', 'Overfeld,').replace('Santa Teresa - South,', 'Santa Teresa South,'),
    );
    const out = path.join(dir, 'history.json');
    const r = runScript(
      'scripts/build-history.ts',
      ['--from', 'tests/fixtures/basketball/scval-history', '--bval-from', dir, '--retrieved-on', '2026-11-16', '--out', out],
      { env: { ...process.env, SCVAL_SPORT: 'basketball' } },
    );
    expect(r.status).toBe(1);
    expect(r.output).toMatch(/"Overfeld" resolves to no registry team/);
    expect(r.output).toMatch(/has 0 "Santa Teresa - South" blocks, expected 1/);
    expect(r.output).toMatch(/nothing written/);
  }, 60_000);

  it('needs --retrieved-on with --bval-from: only the person who saved the sheet knows the day', () => {
    const r = runScript('scripts/build-history.ts', ['--bval-from', 'tests/fixtures/basketball/bval-history', '--dry-run'], {
      env: { ...process.env, SCVAL_SPORT: 'basketball' },
    });
    expect(r.status).not.toBe(0);
    expect(r.output).toMatch(/--bval-from needs --retrieved-on/);
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

// ------------------------------------------------------------------------------ BVAL, from its standings sheets

interface BvalEntry {
  status: string;
  provenance: { source: string; retrievedOn: string; jvNote: string; standingsSheetView: string; allLeagueDocs: object };
  seasonAlignment?: { pastDivisions: string[] };
  divisions: Array<Division & { label: string }>;
}
const bval = (sport: 'soccer' | 'basketball' | 'volleyball') =>
  (JSON.parse(readFileSync(path.join(REPO, 'data', sport, 'history-2025-26.json'), 'utf8')) as { leagues: { bval: BvalEntry } })
    .leagues.bval;
/** "2 westmont 9-3": place, slug, league record. */
const placed = (rows: Row[]) => rows.map((r) => `${r.place} ${r.slug} ${r.leagueRecord}`);

describe('BVAL’s 2025-26 standings in the soccer, basketball and volleyball builds', () => {
  it('is the official sheet for each sport, read 2026-11-16, with no all-league awards', () => {
    for (const [sport, sheet] of [
      ['soccer', '1KdPgTSbacBwGPtTHFIUqab6-BP3EPD68'],
      ['basketball', '1FsWvfXTqA87Qunf_5-5z0zYmDOJTYsqw'],
      ['volleyball', '1XsFPR7woftHNAJFQl8OQUNgjBs9_Z6PS'],
    ] as const) {
      const b = bval(sport);
      expect([b.status, b.provenance.source, b.provenance.retrievedOn]).toEqual(['available', 'bval-sheet', '2026-11-16']);
      expect(b.provenance.standingsSheetView).toContain(sheet);
      expect(b.provenance.allLeagueDocs).toEqual({});
      expect(b.divisions.every((d) => d.awards.varsity === null && d.awards.jv === null)).toBe(true);
    }
  });

  it('girls soccer: the sheet’s three divisions, W-L-T, and no JV (three JV places only)', () => {
    const b = bval('soccer');
    expect(b.divisions.map((d) => [d.division, d.standings.varsity.length])).toEqual([
      ['mt-hamilton', 8], ['santa-teresa', 8], ['west-valley', 10],
    ]);
    expect(b.seasonAlignment).toEqual({ pastDivisions: [] });
    expect(placed(b.divisions[0].standings.varsity).slice(0, 3)).toEqual(['1 leigh 12-1-1', '2 leland 10-1-3', '3 pioneer 6-3-5']);
    expect(placed(b.divisions[2].standings.varsity)[0]).toBe('1 oak-grove 14-2-2');
    expect(b.divisions.every((d) => d.standings.jv.length === 0)).toBe(true);
    expect(b.provenance.jvNote).toBe('JV is not shown: the sheet lists JV records but gives a JV place for three schools only.');
  });

  it('boys basketball: Santa Teresa North and South, divisions BVAL no longer has, and the sheet’s tied places', () => {
    const b = bval('basketball');
    expect(b.divisions.map((d) => [d.division, d.label])).toEqual([
      ['mt-hamilton', 'Mt. Hamilton'],
      ['santa-teresa-north', 'Santa Teresa North'],
      ['santa-teresa-south', 'Santa Teresa South'],
      ['west-valley', 'West Valley'],
    ]);
    expect(b.seasonAlignment).toEqual({ pastDivisions: ['santa-teresa-north', 'santa-teresa-south'] });
    expect(placed(b.divisions[0].standings.varsity)).toEqual([
      '1 willow-glen 11-1', '2 christopher 9-3', '2 westmont 9-3', '4 evergreen-valley 6-6', '5 pioneer 3-9', '5 leigh 3-9',
      '7 santa-teresa 1-11',
    ]);
    // No game ends level: a W-L record has zero ties, never unpublished ones.
    for (const d of b.divisions) {
      for (const r of [...d.standings.varsity, ...d.standings.jv]) expect([r.t, r.leagueRecord]).toEqual([0, `${r.w}-${r.l}`]);
    }
    // JV in JV-place order; James Lick prints "n/a" and has no JV row.
    expect(placed(b.divisions[3].standings.jv)).toEqual([
      '1 overfelt 10-0', '2 yerba-buena 8-2', '3 gunderson 5-5', '3 andrew-hill 5-5', '5 del-mar 2-8', '6 san-jose 0-10',
    ]);
    expect(b.provenance.jvNote).toMatch(/James Lick has no JV row/);
  });

  it('girls volleyball: three divisions where 2026-27 has four, co-champions, and a missing Overall', () => {
    const b = bval('volleyball');
    expect(b.divisions.map((d) => d.division)).toEqual(['mt-hamilton', 'santa-teresa', 'west-valley']);
    expect(b.seasonAlignment).toEqual({ pastDivisions: [] });
    const st = b.divisions[1].standings;
    expect(placed(st.varsity).slice(0, 4)).toEqual(['1 lincoln 13-1', '1 pioneer 13-1', '3 prospect 8-6', '3 gilroy 8-6']);
    expect((st.varsity[5] as Row & { overallRecord: string | null }).overallRecord).toBeNull();
    expect(placed(b.divisions[0].standings.jv).slice(0, 2)).toEqual(['1 branham 12-4', '1 silver-creek 12-4']);
  });
});
