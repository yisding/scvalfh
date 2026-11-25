/**
 * data/basketball/history-2025-26.json: the WCAL's, the WBAL's and the PAL's 2025-26 boys basketball standings, from
 * each league's own documents (data/basketball/official/<league>-2025-26.json, transcribed 2026-11-21), and the
 * SCCAL's card, which has none to show. Its own file because it reads the basketball registry (SCVAL_SPORT is set
 * before anything that reads it is imported).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { beforeAll, describe, expect, it, vi } from 'vitest';

import { REPO } from './helpers';

type Modules = {
  history: typeof import('../lib/history/history');
  documents: typeof import('../scripts/lib/history-league-documents');
};
type Row = { place: number; slug: string | null; leagueRecord: string; overallRecord: string | null };
type Entry = { status: string; divisions: Array<{ division: string; standings: { varsity: Row[]; jv: Row[] } }> };

let m: Modules;

beforeAll(async () => {
  vi.stubEnv('SCVAL_SPORT', 'basketball');
  vi.resetModules();
  m = {
    history: await import('../lib/history/history'),
    documents: await import('../scripts/lib/history-league-documents'),
  };
});

const leagues = () =>
  (JSON.parse(readFileSync(path.join(REPO, 'data', 'basketball', 'history-2025-26.json'), 'utf8')) as { leagues: Record<string, Entry> }).leagues;
const table = (league: string, division: string, level: 'varsity' | 'jv') =>
  leagues()[league].divisions.find((d) => d.division === division)!.standings[level].map((r) => `${r.place} ${r.slug} ${r.leagueRecord}`);

describe('data/basketball/history-2025-26.json: the WCAL, the WBAL and the PAL', () => {
  it('has the three leagues from their own documents, and the SCCAL, the PCAL and the PSAL unavailable', () => {
    expect(m.history.getAvailableHistoryLeagues().map((l) => l.id)).toEqual(['scval', 'bval', 'wcal', 'wbal', 'pal']);
    expect(m.history.getUnavailableHistoryLeagues().map((l) => l.id)).toEqual(['sccal', 'pcal', 'psal']);
    for (const id of ['wcal', 'wbal', 'pal']) {
      const tr = m.documents.readLeagueTranscription('data/basketball', id);
      expect(m.documents.buildLeagueDocumentsHistory(id, tr, '2025-26').problems, id).toEqual([]);
    }
  });

  it('has the WCAL’s tables in the archive’s order, with the season record as Overall', () => {
    expect(table('wcal', 'wcal', 'varsity')).toEqual([
      '1 riordan 14-0', '2 st-ignatius 12-2', '3 mitty 9-5', '4 bellarmine 8-6', '5 valley-christian 6-8', '6 serra 5-9',
      '7 sacred-heart-cathedral 1-13', '8 saint-francis 1-13',
    ]);
    expect(leagues().wcal.divisions[0].standings.varsity[0].overallRecord).toBe('23-1');
    expect(table('wcal', 'wcal', 'jv')).toHaveLength(8);
  });

  it('has the WBAL’s table, a blank place taking the one above it', () => {
    expect(table('wbal', 'wbal', 'varsity')).toEqual([
      '1 kings-academy 10-0', '2 priory 8-2', '3 sacred-heart-prep 6-4', '4 crystal-springs 5-5', '5 menlo 4-6',
      '5 pinewood 4-6', '7 eastside 3-7', '8 harker 0-10',
    ]);
    expect(table('wbal', 'wbal', 'jv').slice(-2)).toEqual(['5 crystal-springs 1-5', '5 harker 1-5']);
  });

  it('has the PAL’s 2025-26 divisions, not this season’s, with Oceana (a PSAL team now) a former member', () => {
    expect(table('pal', 'bay', 'varsity')).toEqual([
      '1 menlo-atherton 12-0', '2 carlmont 8-4', '2 half-moon-bay 8-4', '4 burlingame 7-5', '5 sequoia 5-7',
      '6 jefferson 1-11', '6 terra-nova 1-11',
    ]);
    expect(table('pal', 'ocean', 'varsity')).toEqual([
      '1 aragon 11-1', '2 hillsdale 10-2', '3 woodside 9-3', '4 el-camino-ssf 8-4', '5 mills 7-5', '6 capuchino 4-8',
      '6 san-mateo 4-8', '6 south-san-francisco 4-8', '9 westmoor 3-9', '10 oceana 0-12',
    ]);
    expect(table('pal', 'ocean', 'jv')).toHaveLength(10);
  });
});
