/**
 * data/history-2025-26.json and the two prior-season PDF parsers behind it.
 *
 * Fixtures are the REAL `pdftotext -layout` output of
 *   https://www.scval.com/standings/2025-26%20Field%20Hockey%20standings.pdf
 *   https://www.scval.com/standings/SCVAL%202025-26%20Field%20Hockey%20all%20league.pdf
 *
 * BVAL's fixtures are the real 2025-26 files too: the standings Google Sheet's CSV export and the
 * HTML export of the two all-league Google Docs, all linked from bval.org (read 2026-10-03).
 *
 * The verified values these must reproduce (SPEC §1.3) are asserted literally, because this file is
 * committed data: if a parser drifts, the numbers on /history/2025-26 drift with it.
 */

import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { HistorySchema } from '../lib/history-schema';
import {
  parseAllLeaguePdfText,
  parseStandingsPdfText,
  SCVAL_HISTORY_PDFS,
} from '../lib/sources/scval-pdf';
import {
  BVAL_HISTORY_SOURCES,
  bvalDocExportUrl,
  htmlTableRows,
  parseAllLeagueHtml,
  parseCsv,
  parseGradeYear,
  parseStandingsCsv,
} from '../lib/sources/bval-sheet';
import { getTeamBySlug, teamsInLeague } from '../lib/teams';
import { REPO, runScript } from './helpers';

const FIX = path.join(REPO, 'tests', 'fixtures', 'scval');
const standingsText = readFileSync(path.join(FIX, 'standings-2025-26.txt'), 'utf8');
const allLeagueText = readFileSync(path.join(FIX, 'all-league-2025-26.txt'), 'utf8');

const BVAL_FIX = path.join(REPO, 'tests', 'fixtures', 'bval');
const bvalCsv = readFileSync(path.join(BVAL_FIX, 'standings-2025-26.csv'), 'utf8');
const bvalMh = readFileSync(path.join(BVAL_FIX, 'all-league-mt-hamilton-2025-26.html'), 'utf8');
const bvalSt = readFileSync(path.join(BVAL_FIX, 'all-league-santa-teresa-2025-26.html'), 'utf8');

const blocks = parseStandingsPdfText(standingsText);
const awards = parseAllLeaguePdfText(allLeagueText);

interface FileRow {
  place: number;
  name: string;
  slug: string | null;
  leagueRecord: string;
  w: number;
  l: number;
  t: number | null;
  overallRecord: string | null;
}
interface FileDivision {
  division: string;
  label: string;
  standings: { varsity: FileRow[]; jv: FileRow[] };
  awards: {
    varsity: { overall: Array<{ award: string; value: string }>; firstTeam: unknown[]; secondTeam: unknown[]; honorableMention: unknown[] } | null;
    jv: { firstTeam: unknown[]; secondTeam: unknown[]; honorableMention: unknown[] } | null;
  };
}
interface HistoryFile {
  season: string;
  sport: string;
  leagues: {
    scval: {
      status: 'available';
      provenance: { standingsPdf: string; allLeaguePdf: string; source: string; notes: string[] };
      divisions: FileDivision[];
    };
    bval: {
      status: 'available';
      provenance: {
        source: string;
        standingsSheet: string;
        standingsSheetView: string;
        standingsIndex: string;
        allLeagueDocs: Record<string, string | null>;
        retrievedOn: string;
        notes: string[];
      };
      divisions: FileDivision[];
    };
    pcal: { status: 'unavailable'; reason: string; checkedOn: string; checked: string[]; alsoPublished?: unknown };
    mcal: {
      status: 'unavailable';
      reason: string;
      checkedOn: string;
      checked: string[];
      alsoPublished?: Array<{ label: string; url: string }>;
    };
    eal: { status: 'unavailable'; league: string; reason: string; checkedOn: string; checked: string[]; alsoPublished?: unknown };
  };
}

const file = JSON.parse(
  readFileSync(path.join(REPO, 'data', 'history-2025-26.json'), 'utf8'),
) as HistoryFile;
/** SCVAL's entry: every SCVAL assertion below is unchanged from the SCVAL-only file. */
const history = file.leagues.scval;
const bval = file.leagues.bval;

describe('history: the standings PDF', () => {
  it('yields four blocks in the order DeAnza V, El Camino V, DeAnza JV, El Camino JV', () => {
    expect(blocks.map((b) => `${b.division}/${b.level}`)).toEqual([
      'de-anza/varsity',
      'el-camino/varsity',
      'de-anza/jv',
      'el-camino/jv',
    ]);
  });

  it('reproduces the verified 2025-26 varsity tables exactly', () => {
    const da = blocks[0].rows.map((r) => `${r.name} ${r.leagueRecord}`);
    expect(da).toEqual([
      'St. Ignatius 11-0-1',
      'St. Francis 10-1-1',
      'Los Altos 6-4-2',
      'Valley Christian 6-5-1',
      'Homestead 2-9-1',
      'Fremont 2-10',
      'Cupertino 1-9-2',
    ]);
    const ec = blocks[1].rows.map((r) => `${r.name} ${r.leagueRecord}`);
    expect(ec).toEqual([
      'Los Gatos 14-0',
      'Mitty 11-2-1',
      'Palo Alto 8-5-1',
      'Saratoga 7-5-2',
      'Presentation 7-6-1',
      'Santa Clara 4-9-1',
      'Lynbrook 1-13',
      'Monta Vista 1-13',
    ]);
  });

  it('parses a two-part record as W-L with zero ties', () => {
    const fremont = blocks[0].rows.find((r) => r.slug === 'fremont');
    expect(fremont).toMatchObject({ w: 2, l: 10, t: 0, leagueRecord: '2-10' });
  });

  it('keeps the PDF\'s finish order as `place` and does not recompute a ranking', () => {
    expect(blocks[0].rows.map((r) => r.place)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(blocks[1].rows.map((r) => r.place)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('leaves overallRecord null, because that PDF column is empty', () => {
    expect(blocks.flatMap((b) => b.rows).every((r) => r.overallRecord === null)).toBe(true);
  });

  it('resolves every PDF spelling to a registry slug of SCVAL', () => {
    for (const row of blocks.flatMap((b) => b.rows)) {
      expect(row.slug, `unresolved: ${row.name}`).not.toBeNull();
      expect(getTeamBySlug(row.slug as string)?.league).toBe('scval');
    }
  });

  it('records the 7-team 2025-26 De Anza', () => {
    expect(blocks[0].rows).toHaveLength(7);
    expect(blocks[0].rows.every((r) => r.slug !== null)).toBe(true);
  });

  it('keeps JV membership separate from varsity', () => {
    const daJv = blocks[2].rows.map((r) => r.slug);
    expect(daJv).toHaveLength(6);
    expect(daJv).not.toContain('valley-christian');
    const ecJv = blocks[3].rows.map((r) => r.slug);
    expect(ecJv).toHaveLength(6);
    expect(ecJv).not.toContain('saratoga');
    expect(ecJv).not.toContain('presentation');
  });
});

describe('history: the all-league PDF', () => {
  it('yields the four blocks', () => {
    expect(awards.map((b) => `${b.division}/${b.level}`)).toEqual([
      'de-anza/varsity',
      'de-anza/jv',
      'el-camino/varsity',
      'el-camino/jv',
    ]);
  });

  it('reads the seven De Anza overall awards in the "School- Player" shape', () => {
    const overall = awards[0].overall;
    expect(overall).toHaveLength(7);
    expect(overall[0]).toEqual({
      award: 'Offensive Player',
      value: 'St Ignatius- Olivia Van de Braak',
    });
    expect(overall.map((a) => a.award)).toEqual([
      'Offensive Player',
      'Defensive Player',
      'Senior of the Year',
      'Junior of the Year',
      'Sophomore of the Year',
      'Freshman of the Year',
      'GK of the Year',
    ]);
  });

  it('keeps El Camino\'s three different award shapes verbatim rather than guessing', () => {
    const overall = awards[2].overall;
    expect(overall).toHaveLength(7);
    expect(overall[0].value).toBe('Leaya Cleary Los Gatos 12');
    expect(overall[2].value).toBe('Monisha Preetham, Monta Vista');
    expect(overall[3].value).toBe('Trishna Sinha, Goalie, Lynbrook');
  });

  it('drops the blank "Coach of the Year" line rather than inventing a winner', () => {
    expect(allLeagueText).toMatch(/Coach of the Year:/);
    expect(awards.flatMap((b) => b.overall).some((a) => /coach/i.test(a.award))).toBe(false);
  });

  it('publishes no overall awards for JV, because the PDF has none', () => {
    expect(awards[1].overall).toEqual([]);
    expect(awards[3].overall).toEqual([]);
  });

  it('reads the player tables at both indent levels used in one table', () => {
    // De Anza varsity second team: 5 rows deeply indented, then 11 at a shallower indent.
    expect(awards[0].secondTeam).toHaveLength(16);
    expect(awards[0].firstTeam).toHaveLength(16);
    expect(awards[0].honorableMention).toHaveLength(7);
    expect(awards[0].firstTeam[0]).toEqual({
      player: 'Sophie Ghosh',
      school: 'Saint Ignatius',
      slug: 'st-ignatius',
      position: 'Midfield',
      year: 12,
    });
    // El Camino JV HM runs to column 0 for its last three rows.
    expect(awards[3].honorableMention).toHaveLength(5);
    expect(awards[3].honorableMention.at(-1)).toEqual({
      player: 'Anh Nguyenle',
      school: 'Lynbrook',
      slug: 'lynbrook',
      position: 'Defense',
      year: 11,
    });
  });

  it('skips a row whose player cell is blank (a school that submitted no name)', () => {
    // "Cupertino" appears alone on several De Anza JV lines.
    expect(allLeagueText).toMatch(/\n\s+Cupertino\s*\n/);
    const players = awards.flatMap((b) => [...b.firstTeam, ...b.secondTeam, ...b.honorableMention]);
    expect(players.every((p) => p.player.length > 2)).toBe(true);
    expect(players.every((p) => p.year >= 9 && p.year <= 12)).toBe(true);
  });

  it('resolves every school spelling, including the PDF\'s inconsistent ones', () => {
    const players = awards.flatMap((b) => [...b.firstTeam, ...b.secondTeam, ...b.honorableMention]);
    const unresolved = players.filter((p) => p.slug === null).map((p) => p.school);
    // "St Ignatius" / "Saint Ignatius", "St. Francis" / "Saint Francis", "MItty", "Presentation HS".
    expect(unresolved).toEqual([]);
  });
});

describe('history: the committed JSON file', () => {
  it('names the season and both source PDFs', () => {
    expect(file.season).toBe('2025-26');
    expect(history.provenance.source).toBe('scval-pdf');
    expect(history.provenance.standingsPdf).toBe(SCVAL_HISTORY_PDFS.standings);
    expect(history.provenance.allLeaguePdf).toBe(SCVAL_HISTORY_PDFS.allLeague);
    expect(history.provenance.notes.length).toBeGreaterThan(3);
  });

  it('carries both divisions, both levels, and the awards', () => {
    expect(history.divisions.map((d) => d.division)).toEqual(['de-anza', 'el-camino']);
    const da = history.divisions[0];
    expect(da.label).toBe('De Anza');
    expect(da.standings.varsity).toHaveLength(7);
    expect(da.standings.jv).toHaveLength(6);
    expect(da.awards.varsity?.overall).toHaveLength(7);
    expect(da.awards.jv?.firstTeam).toHaveLength(14);
    const ec = history.divisions[1];
    expect(ec.standings.varsity).toHaveLength(8);
    expect(ec.standings.jv).toHaveLength(6);
  });

  it('matches what the parsers produce from the fixtures, byte for byte in the rows', () => {
    expect(history.divisions[0].standings.varsity).toEqual(blocks[0].rows);
    expect(history.divisions[1].standings.varsity).toEqual(blocks[1].rows);
    expect(history.divisions[0].standings.jv).toEqual(blocks[2].rows);
    expect(history.divisions[1].standings.jv).toEqual(blocks[3].rows);
  });

  it('has a champion in each division and no recomputed points column', () => {
    expect(history.divisions[0].standings.varsity[0]).toMatchObject({
      place: 1,
      slug: 'st-ignatius',
      leagueRecord: '11-0-1',
    });
    expect(history.divisions[1].standings.varsity[0]).toMatchObject({
      place: 1,
      slug: 'los-gatos',
      leagueRecord: '14-0',
    });
    const rows = history.divisions.flatMap((d) => [...d.standings.varsity, ...d.standings.jv]);
    expect(rows.every((r) => !('pts' in r))).toBe(true);
  });

  it('is key-sorted, so a rebuild produces no spurious diff', () => {
    const keys = Object.keys(file);
    expect(keys).toEqual([...keys].sort());
    expect(Object.keys(file.leagues)).toEqual([...Object.keys(file.leagues)].sort());
    expect(Object.keys(history)).toEqual([...Object.keys(history)].sort());
    expect(Object.keys(bval)).toEqual([...Object.keys(bval)].sort());
  });
});

describe('history: the SCVAL entry is scoped to SCVAL (SPEC §0.2 #12, §4.2)', () => {
  it('names only the 15 SCVAL registry teams and the two SCVAL divisions', () => {
    const scval = teamsInLeague('scval');
    expect(scval).toHaveLength(15);
    const slugs = new Set(scval.map((t) => t.slug));
    const rows = history.divisions.flatMap((d) => [...d.standings.varsity, ...d.standings.jv]);
    for (const r of rows) if (r.slug !== null) expect(slugs.has(r.slug), r.slug).toBe(true);
    // Every SCVAL team that played varsity in 2025-26 appears exactly once in a varsity table.
    const varsity = history.divisions.flatMap((d) => d.standings.varsity.map((r) => r.slug));
    expect(new Set(varsity).size).toBe(varsity.length);
    expect(varsity.length).toBe(scval.length);
  });

  it('refuses a slug or a division from another league', () => {
    expect(HistorySchema.safeParse(file).success).toBe(true);
    const foreign = structuredClone(file);
    foreign.leagues.scval.divisions[0].standings.varsity[0].slug = 'leigh';
    expect(HistorySchema.safeParse(foreign).success).toBe(false);
    const badDivision = structuredClone(file);
    badDivision.leagues.scval.divisions[0].division = 'mt-hamilton';
    expect(HistorySchema.safeParse(badDivision).success).toBe(false);
    const oneDivision = structuredClone(file);
    oneDivision.leagues.scval.divisions.pop();
    expect(HistorySchema.safeParse(oneDivision).success).toBe(false);
  });
});

describe('history: the read API', () => {
  it('validates the file at import time and exposes both divisions', async () => {
    const h = await import('../lib/history');
    expect(h.getHistorySeason()).toBe('2025-26');
    expect(h.getHistoryStandings('de-anza')).toHaveLength(7);
    expect(h.getHistoryStandings('el-camino')).toHaveLength(8);
    expect(h.getHistoryStandings('de-anza', 'jv')).toHaveLength(6);
    expect(h.getHistoryStandings('el-camino', 'jv')).toHaveLength(6);
  });

  it('names the champions', async () => {
    const h = await import('../lib/history');
    expect(h.getHistoryChampions('scval').map((c) => [c.division, c.row.slug, c.row.leagueRecord])).toEqual([
      ['de-anza', 'st-ignatius', '11-0-1'],
      ['el-camino', 'los-gatos', '14-0'],
    ]);
  });

  it('finds every 2025-26 row for one school, across levels', async () => {
    const h = await import('../lib/history');
    const si = h.getHistoryFor('st-ignatius');
    expect(si.map((x) => [x.level, x.row.place])).toEqual([
      ['varsity', 1],
      ['jv', 2],
    ]);
    // Valley Christian played varsity but not JV.
    expect(h.getHistoryFor('valley-christian').map((x) => x.level)).toEqual(['varsity']);
  });

  it('exposes the awards and the two source PDFs for the page credit', async () => {
    const h = await import('../lib/history');
    expect(h.getHistoryAwards('de-anza')?.overall).toHaveLength(7);
    expect(h.getHistoryAwards('el-camino', 'jv')?.overall).toEqual([]);
    const sources = h.getHistoryProvenance('scval');
    if (sources?.source !== 'scval-pdf') throw new Error('scval provenance should be scval-pdf');
    expect(sources.standingsPdf).toMatch(/scval\.com/);
    expect(sources.allLeaguePdf).toMatch(/all%20league\.pdf$/);
  });
});

// ------------------------------------------------------------------------------------------ BVAL

describe('history: the BVAL sheet', () => {
  const bvalBlocks = parseStandingsCsv(bvalCsv);

  it('is the live sheet\'s own CSV: two stacked divisions, no points or goals columns', () => {
    expect(bvalBlocks.map((b) => b.division)).toEqual(['mt-hamilton', 'santa-teresa']);
    expect(parseCsv(bvalCsv)[4]).toEqual(['Place', 'School', 'Overall', 'League Record', 'JV Place', 'JV Record']);
  });

  it('reproduces the verified 2025-26 varsity tables exactly (league record, overall)', () => {
    expect(bvalBlocks[0].rows.map((r) => `${r.place} ${r.name} ${r.leagueRecord} (${r.overallRecord})`)).toEqual([
      '1 Leigh 8-1-1 (13-2-1)',
      '2 Gilroy 7-1-2 (13-3-5)',
      '3 Christopher 7-2-1 (12-4-2)',
      '4 Willow Glen 3-6-1 (6-7-1)',
      '5 Branham 2-7-1 (4-12-2)',
      '6 Prospect 0-10-0 (3-13-1)',
    ]);
    expect(bvalBlocks[1].rows.map((r) => `${r.place} ${r.name} ${r.leagueRecord} (${r.overallRecord})`)).toEqual([
      '1 Leland 8-1-1 (9-6-1)',
      '2 Westmont 8-2-0 (9-3-1)',
      '3 Live Oak 7-2-1 (7-3-1)',
      '4 Sobrato 4-6 (4-6)',
      '5 Silver Creek 1-8-1 (1-14-1)',
      '6 Del Mar 0-9-1 (0-9-1)',
    ]);
  });

  it('records Sobrato\'s "4 - 6" as published, with ties null rather than an assumed 0', () => {
    const sobrato = bvalBlocks[1].rows.find((r) => r.slug === 'sobrato');
    expect(sobrato).toMatchObject({ leagueRecord: '4-6', w: 4, l: 6, t: null, overallRecord: '4-6' });
    // Every other row prints three parts, so its ties are a real number.
    expect(bvalBlocks.flatMap((b) => b.rows).filter((r) => r.t === null).map((r) => r.name)).toEqual(['Sobrato']);
  });

  it('keeps the sheet\'s divisions: Leland in Santa Teresa, Prospect in Mt. Hamilton (the registry swaps them)', () => {
    expect(bvalBlocks[1].rows[0]).toMatchObject({ name: 'Leland', slug: 'leland' });
    expect(getTeamBySlug('leland')?.division).toBe('mt-hamilton');
    expect(bvalBlocks[0].rows[5]).toMatchObject({ name: 'Prospect', slug: 'prospect' });
    expect(getTeamBySlug('prospect')?.division).toBe('santa-teresa');
  });

  it('resolves every school to a registry slug of BVAL, and every BVAL team appears once', () => {
    const rows = bvalBlocks.flatMap((b) => b.rows);
    expect(rows.every((r) => r.slug !== null)).toBe(true);
    for (const r of rows) expect(getTeamBySlug(r.slug as string)?.league, r.name).toBe('bval');
    expect(new Set(rows.map((r) => r.slug)).size).toBe(teamsInLeague('bval').length);
    expect(rows).toHaveLength(12);
  });

  it('has contiguous places and no JV table (the sheet gives one JV place, for Leigh)', () => {
    for (const b of bvalBlocks) expect(b.rows.map((r) => r.place)).toEqual([1, 2, 3, 4, 5, 6]);
    const jvPlaces = parseCsv(bvalCsv).filter((r) => /^\d+$/.test(r[0]) && r[4] !== '');
    expect(jvPlaces).toHaveLength(1);
  });
});

describe('history: the BVAL all-league documents', () => {
  const mh = parseAllLeagueHtml(bvalMh, 'mt-hamilton');
  const st = parseAllLeagueHtml(bvalSt, 'santa-teresa');

  it('reads the Mt. Hamilton awards and both teams', () => {
    expect(mh.overall.map((a) => `${a.award}: ${a.value}`)).toEqual([
      'MVP: Elle Obenour, Leigh, Midfield',
      'Co-Senior of the Year: Kamryn Krejovsky, Gilroy, Midfield',
      'Co-Senior of the Year: Danica Lopez, Christopher, Midfield',
      'Junior of the Year: Alyssa Montejano, Christopher, Defender',
      'Sophomore of the Year: Lexie Osaki, Gilroy, Midfield',
      'Goalie of the Year: Keana Wong, Leigh, Goalkeeper',
    ]);
    expect(mh.firstTeam).toHaveLength(13);
    expect(mh.secondTeam).toHaveLength(13);
    expect(mh.honorableMention).toEqual([]);
    expect(mh.firstTeam[0]).toEqual({ player: 'Cora Thomas', school: 'Leigh', slug: 'leigh', position: 'Midfield', year: 12 });
  });

  it('stores a blank position cell as null, not as a guess', () => {
    const solis = mh.secondTeam.find((p) => p.player === 'Lalita Solis');
    const rhodas = mh.secondTeam.find((p) => p.player === 'Stella Rhodas');
    expect(solis).toMatchObject({ position: null, year: 11, slug: 'gilroy' });
    expect(rhodas).toMatchObject({ position: null, year: 10 });
  });

  it('reads the Santa Teresa awards, converts the year words, and skips the placeholder rows', () => {
    expect(st.overall.map((a) => `${a.award}: ${a.value}`)).toEqual([
      'MVP: Carolyn Salverson, Leland, Forward',
      'Co-Senior of the Year: Eden Svboda, Live Oak, Mid Center',
      'Co-Senior of the Year: Kayla Tulowitzki, Live Oak, Mid Center',
      'Junior of the Year: Sophie Tuan, Westmont, Mid Center',
      'Freshman of the Year: Teya Halali, Westmont, Center Left',
      'Goalie of the Year: Mira Kapadia, Leland, Goalie',
    ]);
    expect(st.firstTeam).toHaveLength(9);
    expect(st.secondTeam).toHaveLength(8);
    expect(st.emptyRows).toHaveLength(9);
    expect(st.emptyRows.every((e) => ['Sobrato', 'Silver Creek', 'Del Mar'].includes(e.school))).toBe(true);
    expect(st.firstTeam.find((p) => p.player === 'Kaia Costa')).toMatchObject({ year: 10 });
    expect(st.firstTeam.find((p) => p.player === 'Eleanor Graham')).toMatchObject({ year: 11 });
    expect([...st.firstTeam, ...st.secondTeam].every((p) => p.slug !== null)).toBe(true);
  });

  it("decodes each cell's entities in one pass, folding the typographic quotes", () => {
    const html = '<body><table><tr><td>O&rsquo;Neil&nbsp;&amp; Co</td><td>&amp;lt;b&amp;gt; &#39;x&#x27;</td></tr></table>';
    // `&amp;lt;` is the text `&lt;`, never `<`.
    expect(htmlTableRows(html)).toEqual([["O'Neil & Co", "&lt;b&gt; 'x'"]]);
  });

  it('maps grade words and numbers, and nothing else', () => {
    expect(['Freshman', 'Sophmore', 'Sophomore', 'Junior', 'Senior', '12', '9'].map(parseGradeYear)).toEqual([
      9, 10, 10, 11, 12, 12, 9,
    ]);
    expect(parseGradeYear('')).toBeNull();
    expect(parseGradeYear('13')).toBeNull();
    expect(parseGradeYear('Super senior')).toBeNull();
  });

  it('links the export of the documents bval.org lists for Fall 2025 field hockey', () => {
    expect(BVAL_HISTORY_SOURCES.allLeagueDocs['mt-hamilton']).toMatch(/1VWcZOzF2S_3SxvdfbphzmVSnKKiSWA7Q/);
    expect(bvalDocExportUrl(BVAL_HISTORY_SOURCES.allLeagueDocs['santa-teresa'])).toBe(
      'https://docs.google.com/document/d/198L-AgFIkPY1XX06I9tZjGv38g5fk_a3/export?format=html',
    );
  });
});

describe('history: the committed BVAL entry', () => {
  it('is the parsers\' output for both divisions, with the awards, and no JV', () => {
    const blocks2 = parseStandingsCsv(bvalCsv);
    expect(bval.divisions.map((d) => d.division)).toEqual(['mt-hamilton', 'santa-teresa']);
    expect(bval.divisions.map((d) => d.standings.varsity)).toEqual(blocks2.map((b) => b.rows));
    expect(bval.divisions.every((d) => d.standings.jv.length === 0 && d.awards.jv === null)).toBe(true);
    expect(bval.divisions.map((d) => d.awards.varsity?.overall.length)).toEqual([6, 6]);
    expect(bval.divisions.map((d) => d.awards.varsity?.firstTeam.length)).toEqual([13, 9]);
  });

  it('names its provenance: the official sheet, the index page, both documents and the day it was read', () => {
    expect(bval.provenance.source).toBe('bval-sheet');
    expect(bval.provenance.standingsSheet).toBe(BVAL_HISTORY_SOURCES.standingsSheet);
    // The page links the sheet a reader opens, not the CSV export the build reads.
    expect(bval.provenance.standingsSheetView).toBe(BVAL_HISTORY_SOURCES.standingsSheetView);
    expect(bval.provenance.standingsSheetView).toMatch(/\/edit$/);
    expect(bval.provenance.standingsIndex).toBe('https://bval.org/standings/');
    expect(bval.provenance.allLeagueDocs).toEqual(BVAL_HISTORY_SOURCES.allLeagueDocs);
    expect(bval.provenance.retrievedOn).toBe('2026-10-03');
    expect(bval.provenance.notes.join(' ')).toMatch(/Leland/);
    expect(bval.provenance.notes.join(' ')).toMatch(/Prospect/);
    expect(bval.provenance.notes.join(' ')).toMatch(/Sobrato/);
  });

  it('carries no points, goals or recomputed ranking', () => {
    const rows = bval.divisions.flatMap((d) => d.standings.varsity);
    expect(rows.every((r) => !('pts' in r) && !('gf' in r) && !('ga' in r))).toBe(true);
  });
});

describe('history: PCAL and MCAL are explicitly unavailable', () => {
  it('says so, with a reason and what was checked, and carries no standings or awards', () => {
    for (const league of [file.leagues.pcal, file.leagues.mcal]) {
      expect(league.status).toBe('unavailable');
      expect(league.reason).toMatch(/third-party/);
      expect(league.checkedOn).toBe('2026-10-03');
      expect(league.checked.length).toBeGreaterThan(0);
      expect('divisions' in league).toBe(false);
    }
    expect(file.leagues.pcal.reason).toMatch(/^No official 2025-26 final standings were reachable\./);
    expect(file.leagues.pcal.alsoPublished).toBeUndefined();
  });

  it('says MCAL posts no standings of its own, not that its site is unreachable', () => {
    const mcal = file.leagues.mcal;
    expect(mcal.reason).toMatch(/^MCAL published no 2025-26 final standings of its own\./);
    expect(mcal.reason).toMatch(/MaxPreps' current-season table/);
    expect(JSON.stringify(mcal)).not.toMatch(/bot (check|challenge)|cannot pass/i);
    // The playoff sheet that was looked for is named the way the league names its 2026 one.
    expect(mcal.checked.join(' ')).toContain('Playoffs/FieldHockeyPlayoffs_25.pdf (404');
  });

  it('links MCAL\'s official 2025 all-league team without storing any of it', () => {
    expect(file.leagues.mcal.alsoPublished).toEqual([
      { label: '2025 All-MCAL Field Hockey Team', url: 'https://www.mcalsports.org/FieldHockey.htm#FH25' },
    ]);
    // A link is all it may be: an awards block on an unavailable league is not part of the schema.
    const withAwards = structuredClone(file) as unknown as { leagues: { mcal: Record<string, unknown> } };
    withAwards.leagues.mcal.alsoPublished = [{ label: 'x', url: 'not a url' }];
    expect(HistorySchema.safeParse(withAwards).success).toBe(false);
  });

  it('does not name a champion or a winner anywhere', () => {
    const text = JSON.stringify([file.leagues.pcal, file.leagues.mcal]);
    expect(text).not.toMatch(/Stevenson|Tamalpais|Redwood|Carmel|Santa Catalina|Marin Catholic|\bwon\b/i);
  });
});

describe('history: the EAL is explicitly unavailable', () => {
  const eal = file.leagues.eal;

  it('says so, with a reason, the day it was checked and what was checked, and carries no standings or awards', () => {
    expect(eal.status).toBe('unavailable');
    expect(eal.league).toBe('Eastern Athletic League');
    expect(eal.reason.length).toBeGreaterThanOrEqual(20);
    expect(eal.reason).toMatch(/^The EAL published no 2025-26 final standings of its own\./);
    expect(eal.reason).toMatch(/third-party/);
    expect(eal.checkedOn).toBe('2026-10-04');
    expect(eal.checked).toHaveLength(3);
    expect('divisions' in eal).toBe(false);
    expect(eal.alsoPublished).toBeUndefined();
  });

  it('names no champion, winner or award', () => {
    expect(JSON.stringify(eal)).not.toMatch(/champion|winner|all-league|MVP|first team/i);
  });
});

describe('history: the league-aware schema', () => {
  it('refuses a file with a league missing, or a league that is neither available nor unavailable', () => {
    const missing = structuredClone(file) as unknown as { leagues: Record<string, unknown> };
    delete missing.leagues.mcal;
    expect(HistorySchema.safeParse(missing).success).toBe(false);
    const noEal = structuredClone(file) as unknown as { leagues: Record<string, unknown> };
    delete noEal.leagues.eal;
    expect(HistorySchema.safeParse(noEal).success).toBe(false);
    const odd = structuredClone(file) as unknown as { leagues: Record<string, { status: string }> };
    odd.leagues.pcal.status = 'pending';
    expect(HistorySchema.safeParse(odd).success).toBe(false);
  });

  it('refuses a BVAL slug or division that belongs to SCVAL, and SCVAL ones in BVAL', () => {
    const a = structuredClone(file);
    a.leagues.bval.divisions[0].standings.varsity[0].slug = 'los-gatos';
    expect(HistorySchema.safeParse(a).success).toBe(false);
    const b = structuredClone(file);
    b.leagues.bval.divisions[0].division = 'de-anza';
    expect(HistorySchema.safeParse(b).success).toBe(false);
  });

  it('refuses a place gap and a record that disagrees with its w/l/t', () => {
    const gap = structuredClone(file);
    gap.leagues.bval.divisions[0].standings.varsity[2].place = 4;
    expect(HistorySchema.safeParse(gap).success).toBe(false);
    const drift = structuredClone(file);
    drift.leagues.bval.divisions[1].standings.varsity[3].t = 0; // "4-6" is not "4-6-0"
    expect(HistorySchema.safeParse(drift).success).toBe(false);
  });

  it('refuses an unavailable league without a reason, and an unknown provenance source', () => {
    const noReason = structuredClone(file);
    noReason.leagues.pcal.reason = '';
    expect(HistorySchema.safeParse(noReason).success).toBe(false);
    const source = structuredClone(file) as unknown as { leagues: { bval: { provenance: { source: string } } } };
    source.leagues.bval.provenance.source = 'maxpreps';
    expect(HistorySchema.safeParse(source).success).toBe(false);
  });
});

describe('history: the league-aware read API', () => {
  it('lists every league in config order, and splits available from unavailable', async () => {
    const h = await import('../lib/history');
    expect(h.getHistoryLeagues().map((l) => [l.id, l.entry.status])).toEqual([
      ['scval', 'available'],
      ['bval', 'available'],
      ['pcal', 'unavailable'],
      ['mcal', 'unavailable'],
      ['eal', 'unavailable'],
      ['sunset', 'unavailable'],
      ['city', 'unavailable'],
      ['north-county', 'unavailable'],
      ['metro', 'unavailable'],
    ]);
    expect(h.getHistoryLeagues()).toHaveLength(9);
    expect(h.getAvailableHistoryLeagues().map((l) => l.id)).toEqual(['scval', 'bval']);
    expect(h.getUnavailableHistoryLeagues().map((l) => l.id)).toEqual([
      'pcal', 'mcal', 'eal', 'sunset', 'city', 'north-county', 'metro',
    ]);
    expect(h.hasHistory('eal')).toBe(false);
    expect(h.getHistoryChampions('eal')).toEqual([]);
    expect(h.hasHistory('bval')).toBe(true);
    expect(h.hasHistory('pcal')).toBe(false);
    expect(h.getHistoryProvenance('mcal')).toBeNull();
    expect(h.getHistoryChampions('pcal')).toEqual([]);
  });

  it('says why each Southern California league has no 2025-26 table, and what was checked (DESIGN-socal §2.2)', async () => {
    const h = await import('../lib/history');
    const sunset = h.getHistoryLeagues().find((l) => l.id === 'sunset')!.entry;
    if (sunset.status !== 'unavailable') throw new Error('sunset should be unavailable');
    // The design's reason, verbatim: no league document, no playoffs, and the scores site's table is SBLive's.
    expect(sunset.reason).toBe(
      'We found no Sunset league website or standings document for 2025-26. The Southern Section holds no field hockey playoffs, and the Sunset table on its scores site (scores.cifss.org) is SBLive’s, built from game labels coaches enter. We do not show standings from third-party sites.',
    );
    expect(sunset.checkedOn).toBe('2026-10-06');
    expect(sunset.checked.some((c) => c.startsWith('https://cifss.org/sports/field-hockey/'))).toBe(true);
    expect(sunset.checked.some((c) => c.startsWith('https://scores.cifss.org/brackets'))).toBe(true);
    expect(sunset.alsoPublished).toBeUndefined();
    for (const id of ['city', 'north-county', 'metro'] as const) {
      const entry = h.getHistoryLeagues().find((l) => l.id === id)!.entry;
      if (entry.status !== 'unavailable') throw new Error(`${id} should be unavailable`);
      expect(entry.reason).toBe(
        'No 2025-26 final league standings were published. The Section’s power rankings list results and each school’s league record from game-type labels its schools enter, not league standings. We do not show standings from third-party sites.',
      );
      expect(entry.checkedOn).toBe('2026-10-06');
      // The power rankings checked are 2025-26's (year_id 175 on the cifsdshome widget), not this season's.
      expect(entry.checked.some((c) => c.includes('cifsdshome.org/widget/power-rankings') && c.includes('year_id=175'))).toBe(true);
      expect(entry.checked.some((c) => c.startsWith('https://www.cifsds.org/sports/fh/index'))).toBe(true);
      // The bracket sheet is linked, labelled without the words an unavailable card may not print.
      expect(entry.alsoPublished).toEqual([
        {
          label: '2025 CIFSDS playoff brackets (Google Sheet)',
          url: 'https://docs.google.com/spreadsheets/d/1P9J_VFYljarF0IxnE4SP8zHey9T6y97IHz6NZZbaBWg/edit?usp=sharing',
        },
      ]);
      expect(entry.alsoPublished![0].label).not.toMatch(/champion/i);
      expect(h.hasHistory(id)).toBe(false);
      expect(h.getHistoryChampions(id)).toEqual([]);
    }
    expect(h.hasHistory('sunset')).toBe(false);
  });

  it('serves BVAL tables and champions by division', async () => {
    const h = await import('../lib/history');
    expect(h.getHistoryStandings('mt-hamilton')).toHaveLength(6);
    expect(h.getHistoryStandings('santa-teresa', 'jv')).toEqual([]);
    expect(h.getHistoryChampions('bval').map((c) => [c.division, c.row.slug, c.row.leagueRecord])).toEqual([
      ['mt-hamilton', 'leigh', '8-1-1'],
      ['santa-teresa', 'leland', '8-1-1'],
    ]);
    expect(h.getHistoryAwards('santa-teresa')?.overall).toHaveLength(6);
    expect(h.getHistoryAwards('mt-hamilton', 'jv')).toBeNull();
    expect(h.getHistoryFor('leland').map((x) => [x.division, x.level, x.row.place])).toEqual([
      ['santa-teresa', 'varsity', 1],
    ]);
  });

  it('flags Leland and Prospect as moved and Sobrato as having unpublished ties, and nothing else', async () => {
    const h = await import('../lib/history');
    // Two teams swapped divisions between the 2025-26 sheet and the registry's 2026-27 alignment.
    expect(h.getHistoryDivisionChanges('bval')).toEqual([
      { slug: 'prospect', name: 'Prospect', historyDivision: 'mt-hamilton', registryDivision: 'santa-teresa' },
      { slug: 'leland', name: 'Leland', historyDivision: 'santa-teresa', registryDivision: 'mt-hamilton' },
    ]);
    expect(h.getHistoryDivisionChanges('scval')).toEqual([]);
    expect(h.getHistoryUnpublishedTies('bval').map((r) => r.name)).toEqual(['Sobrato']);
    // SCVAL's "2-10" rows are stored with t: 0 by its parser (unchanged); only BVAL carries null.
    expect(h.getHistoryUnpublishedTies('scval')).toEqual([]);
  });

  it('names every school by its registry name, whatever the source wrote', async () => {
    const h = await import('../lib/history');
    expect(h.historySchoolName('mitty', 'MItty')).toBe('Archbishop Mitty');
    expect(h.historySchoolName('presentation', 'Presentation HS')).toBe('Presentation');
    expect(h.historySchoolName('saint-francis', 'St. Francis')).toBe('Saint Francis');
    expect(h.historySchoolName('sobrato', 'Sobrato')).toBe('Ann Sobrato');
    expect(h.historySchoolName(null, 'Wilcox')).toBe('Wilcox');
  });
});

// ------------------------------------------------------------------------------ the build script

describe('scripts/build-history.ts', () => {
  /** Run the script; returns its exit code and everything it printed. */
  const run = (args: string[]) => runScript('scripts/build-history.ts', args);
  const offline = ['--from', 'tests/fixtures/scval', '--bval-from', 'tests/fixtures/bval'];

  it('rebuilds the committed file byte for byte from the fixtures (the file is generated, never hand-edited)', () => {
    const out = path.join(mkdtempSync(path.join(tmpdir(), 'scvalfh-history-')), 'history.json');
    const r = run([...offline, '--retrieved-on', '2026-10-03', '--out', out]);
    expect(r.status, r.output).toBe(0);
    expect(readFileSync(out, 'utf8')).toBe(readFileSync(path.join(REPO, 'data', 'history-2025-26.json'), 'utf8'));
  }, 30_000);

  it('requires a valid --retrieved-on with --bval-from, rather than stamping today on old files', () => {
    const missing = run([...offline, '--dry-run']);
    expect(missing.status).toBe(1);
    expect(missing.output).toMatch(/--bval-from needs --retrieved-on YYYY-MM-DD/);
    const bad = run([...offline, '--retrieved-on', '2026-02-30', '--dry-run']);
    expect(bad.status).toBe(1);
    expect(bad.output).toMatch(/--retrieved-on must be a date written YYYY-MM-DD/);
  }, 30_000);

  it('refuses a flag where a value belongs, rather than writing a file named after it', () => {
    const r = run([...offline, '--retrieved-on', '2026-10-03', '--out', '--dry-run']);
    expect(r.status).toBe(1);
    expect(r.output).toMatch(/--out needs a value/);
    expect(existsSync(path.join(REPO, '--dry-run'))).toBe(false);
  }, 30_000);

  it('writes nothing, and exits 1, when a school does not resolve', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'scvalfh-bval-'));
    for (const f of readdirSync(BVAL_FIX)) {
      const text = readFileSync(path.join(BVAL_FIX, f), 'utf8');
      writeFileSync(path.join(dir, f), f.startsWith('standings') ? text.replace('2,Gilroy,', '2,Gilroyx,') : text);
    }
    const out = path.join(dir, 'history.json');
    const r = run(['--from', 'tests/fixtures/scval', '--bval-from', dir, '--retrieved-on', '2026-10-03', '--out', out]);
    expect(r.status).toBe(1);
    expect(r.output).toMatch(/nothing written/);
    expect(r.output).toMatch(/"Gilroyx" resolves to no registry team/);
    expect(existsSync(out)).toBe(false);
  }, 30_000);
});
