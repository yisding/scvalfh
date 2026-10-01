/**
 * data/history-2025-26.json and the two prior-season PDF parsers behind it.
 *
 * Fixtures are the REAL `pdftotext -layout` output of
 *   https://www.scval.com/standings/2025-26%20Field%20Hockey%20standings.pdf
 *   https://www.scval.com/standings/SCVAL%202025-26%20Field%20Hockey%20all%20league.pdf
 *
 * The verified values these must reproduce (SPEC §1.3) are asserted literally, because this file is
 * committed data: if a parser drifts, the numbers on /history/2025-26 drift with it.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  parseAllLeaguePdfText,
  parseStandingsPdfText,
  SCVAL_HISTORY_PDFS,
} from '../lib/sources/scval-pdf';
import { getTeamBySlug } from '../lib/teams';
import { REPO } from './helpers';

const FIX = path.join(REPO, 'tests', 'fixtures', 'scval');
const standingsText = readFileSync(path.join(FIX, 'standings-2025-26.txt'), 'utf8');
const allLeagueText = readFileSync(path.join(FIX, 'all-league-2025-26.txt'), 'utf8');

const blocks = parseStandingsPdfText(standingsText);
const awards = parseAllLeaguePdfText(allLeagueText);

interface HistoryFile {
  season: string;
  provenance: { standingsPdf: string; allLeaguePdf: string; source: string; notes: string[] };
  divisions: Array<{
    division: 'de-anza' | 'el-camino';
    label: string;
    standings: {
      varsity: Array<{ place: number; name: string; slug: string | null; leagueRecord: string; w: number; l: number; t: number; overallRecord: null }>;
      jv: Array<{ place: number; name: string; slug: string | null; leagueRecord: string }>;
    };
    awards: {
      varsity: { overall: Array<{ award: string; value: string }>; firstTeam: unknown[]; secondTeam: unknown[]; honorableMention: unknown[] } | null;
      jv: { firstTeam: unknown[]; secondTeam: unknown[]; honorableMention: unknown[] } | null;
    };
  }>;
}

const history = JSON.parse(
  readFileSync(path.join(REPO, 'data', 'history-2025-26.json'), 'utf8'),
) as HistoryFile;

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

  it('resolves every PDF spelling to a registry slug', () => {
    for (const row of blocks.flatMap((b) => b.rows)) {
      expect(row.slug, `unresolved: ${row.name}`).not.toBeNull();
      expect(getTeamBySlug(row.slug as string)).toBeDefined();
    }
  });

  it('records the 7-team 2025-26 De Anza — Wilcox is new to the 2026-27 grid', () => {
    expect(blocks[0].rows).toHaveLength(7);
    expect(blocks[0].rows.some((r) => r.slug === 'wilcox')).toBe(false);
    expect(getTeamBySlug('wilcox')?.division).toBe('de-anza');
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
    expect(history.season).toBe('2025-26');
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
    const keys = Object.keys(history);
    expect(keys).toEqual([...keys].sort());
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
    expect(h.getHistoryChampions().map((c) => [c.division, c.row.slug, c.row.leagueRecord])).toEqual([
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
    // Valley Christian played varsity but not JV, and Wilcox played neither.
    expect(h.getHistoryFor('valley-christian').map((x) => x.level)).toEqual(['varsity']);
    expect(h.getHistoryFor('wilcox')).toEqual([]);
  });

  it('exposes the awards and the two source PDFs for the page credit', async () => {
    const h = await import('../lib/history');
    expect(h.getHistoryAwards('de-anza')?.overall).toHaveLength(7);
    expect(h.getHistoryAwards('el-camino', 'jv')?.overall).toEqual([]);
    const sources = h.getHistorySources();
    expect(sources.standingsPdf).toMatch(/scval\.com/);
    expect(sources.allLeaguePdf).toMatch(/all%20league\.pdf$/);
  });
});
