/**
 * The WCAL's and the WBAL's 2025-26 archive in the soccer and volleyball builds (added 2026-11-16): each league's own
 * final standings and all-league teams, transcribed into data/<sport>/official/<league>-2025-26.json and built by
 * scripts/lib/history-league-documents.ts into data/<sport>/history-2025-26.json (tests/history-other-sports.test.ts
 * rebuilds both files byte for byte). The soccer build's modules are loaded with the switch set, as
 * tests/volleyball.test.ts loads volleyball's; the volleyball file is read as JSON.
 *
 * The values a reader sees first are asserted literally: this is committed data, and the page prints it.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { beforeAll, describe, expect, it, vi } from 'vitest';

import { REPO } from './helpers';

type Modules = {
  history: typeof import('../lib/history/history');
  documents: typeof import('../scripts/lib/history-league-documents');
};

let m: Modules;

beforeAll(async () => {
  vi.stubEnv('SCVAL_SPORT', 'soccer');
  vi.resetModules();
  m = {
    history: await import('../lib/history/history'),
    documents: await import('../scripts/lib/history-league-documents'),
  };
});

interface Row { place: number; slug: string | null; leagueRecord: string; t: number | null; overallRecord: string | null }
interface Player { player: string; school: string; slug: string | null; position: string | null; year: number | null }
interface Division {
  division: string;
  standings: { varsity: Row[]; jv: Row[] };
  awards: { varsity: { overall: Array<{ award: string; value: string }>; firstTeam: Player[]; secondTeam: Player[]; honorableMention: Player[] } | null; jv: unknown };
}
type Entry = { status: string; provenance: { source: string; publisher: string }; divisions: Division[] };

const readFile = (sport: 'soccer' | 'volleyball') =>
  JSON.parse(readFileSync(path.join(REPO, 'data', sport, 'history-2025-26.json'), 'utf8')) as {
    leagues: Record<string, Entry>;
  };
const division = (sport: 'soccer' | 'volleyball', league: string, id: string) =>
  readFile(sport).leagues[league].divisions.find((d) => d.division === id)!;
const order = (rows: Row[]) => rows.map((r) => `${r.place} ${r.slug} ${r.leagueRecord}`);

describe('data/soccer/history-2025-26.json: the WCAL and the WBAL', () => {
  it('has both leagues available, from their own documents, beside SCVAL and BVAL', () => {
    // BVAL from its standings sheet (2026-11-16: tests/history-other-sports.test.ts).
    expect(m.history.getAvailableHistoryLeagues().map((l) => l.id)).toEqual(['scval', 'bval', 'wcal', 'wbal']);
    expect(m.history.getUnavailableHistoryLeagues().map((l) => l.id)).toEqual([]);
    const f = readFile('soccer');
    expect([f.leagues.wcal.provenance, f.leagues.wbal.provenance].map((p) => [p.source, p.publisher])).toEqual([
      ['league-documents', 'wcalsports.org'],
      ['league-documents', 'hs.wbalsports.org'],
    ]);
  });

  it('has the WCAL’s final tables, Presentation among them, with the season record as Overall', () => {
    expect(order(division('soccer', 'wcal', 'wcal').standings.varsity)).toEqual([
      '1 saint-francis 11-0-1', '2 mitty 9-2-1', '3 st-ignatius 8-2-2', '4 sacred-heart-cathedral 5-7-0',
      '5 valley-christian 3-8-1', '6 presentation 2-8-2', '7 riordan 1-11-1',
    ]);
    expect(division('soccer', 'wcal', 'wcal').standings.varsity[0].overallRecord).toBe('17-0-1');
    expect(division('soccer', 'wcal', 'wcal').standings.jv.map((r) => r.slug)).toEqual([
      'saint-francis', 'st-ignatius', 'sacred-heart-cathedral', 'mitty', 'valley-christian', 'presentation', 'riordan',
    ]);
  });

  it('has the WBAL’s 2025-26 divisions, with the places it shares between level teams', () => {
    expect(order(division('soccer', 'wbal', 'foothill').standings.varsity)).toEqual([
      '1 kings-academy 6-1-5', '2 menlo 5-2-5', '2 sacred-heart-prep 5-2-5', '4 crystal-springs 5-3-4',
      '5 castilleja 5-4-3', '6 notre-dame-belmont 3-6-3', '7 notre-dame-san-jose 0-11-1',
    ]);
    expect(order(division('soccer', 'wbal', 'skyline').standings.varsity)).toEqual([
      '1 harker 7-0-1', '2 mercy-burlingame 5-1-2', '3 priory 4-3-1', '4 pinewood 2-6-0', '5 eastside 0-8-0',
    ]);
    // Only Foothill had a JV table; the page comments out Skyline's.
    expect(order(division('soccer', 'wbal', 'foothill').standings.jv)).toEqual([
      '1 menlo 5-1-0', '1 sacred-heart-prep 5-1-0', '3 notre-dame-belmont 1-4-1', '4 notre-dame-san-jose 0-5-1',
    ]);
    expect(division('soccer', 'wbal', 'skyline').standings.jv).toEqual([]);
    const foothill = m.history.getHistoryStandings('foothill');
    expect(foothill.filter((r) => m.history.historyPlaceShared(foothill, r)).map((r) => r.slug)).toEqual([
      'menlo', 'sacred-heart-prep',
    ]);
  });

  it('says which teams moved, Presentation from one league to the other', () => {
    expect(m.history.getHistoryDivisionChanges('wcal')).toEqual([
      {
        slug: 'presentation', name: 'Presentation', historyDivision: 'wcal', historyLabel: 'WCAL',
        registryDivision: 'foothill', registryLabel: 'Foothill', registryLeague: 'wbal',
      },
    ]);
    expect(m.history.getHistoryDivisionChanges('wbal').map((c) => `${c.slug} ${c.historyDivision}>${c.registryDivision}`)).toEqual([
      'notre-dame-san-jose foothill>skyline',
    ]);
    // Presentation's team page reads its WCAL row.
    expect(m.history.getHistoryFor('presentation')).toMatchObject([
      { division: 'wcal', level: 'varsity', row: { place: 6, leagueRecord: '2-8-2' } },
      { division: 'wcal', level: 'jv', row: { place: 6, leagueRecord: '2-10-0' } },
    ]);
  });

  it('has each league’s all-league teams, every school keyed', () => {
    const wcal = division('soccer', 'wcal', 'wcal').awards.varsity!;
    expect(wcal.overall.map((o) => `${o.award}: ${o.value}`)).toEqual([
      'Goalkeeper of the Year: Layla Tucakovic, Archbishop Mitty, 11',
      'Defender of the Year: Caitlin Motil, Saint Francis, 12',
      'Midfielder of the Year: Kylee Po, Sacred Heart Cathedral, 12',
      'Forward of the Year: Penelope Correa, Saint Francis, 12',
      'Player of the Year: Caitlin Motil, Saint Francis, 12',
    ]);
    expect([wcal.firstTeam.length, wcal.secondTeam.length, wcal.honorableMention.length]).toEqual([14, 13, 7]);
    expect(wcal.firstTeam.find((p) => p.player === 'Ella Claveran')).toMatchObject({
      slug: 'presentation', position: 'Goalkeeper', year: 10,
    });
    const foothill = division('soccer', 'wbal', 'foothill').awards.varsity!;
    const skyline = division('soccer', 'wbal', 'skyline').awards.varsity!;
    expect([foothill, skyline].map((a) => [a.firstTeam.length, a.secondTeam.length, a.honorableMention.length])).toEqual([
      [12, 12, 12], [11, 11, 10],
    ]);
    // The WBAL prints no year or position; "Mercy" is Mercy Burlingame; one row has no comma before its school.
    expect(skyline.overall.filter((o) => o.award === 'Co-Defenders of the Year').map((o) => o.value)).toEqual([
      'Liliana Bronzoni, Mercy', 'Addison Parenti, Pinewood',
    ]);
    expect(skyline.firstTeam.find((p) => p.player === 'Alyssa Rodriguez')).toEqual({
      player: 'Alyssa Rodriguez', school: 'Mercy', slug: 'mercy-burlingame', position: null, year: null,
    });
    expect(foothill.honorableMention.find((p) => p.player === 'Brooklyn Denegri')).toMatchObject({ slug: 'notre-dame-belmont' });
  });
});

describe('scripts/lib/history-league-documents.ts', () => {
  const transcription = () => m.documents.readLeagueTranscription('data/soccer', 'wbal');

  it('builds the WBAL entry with no problem', () => {
    expect(m.documents.buildLeagueDocumentsHistory('wbal', transcription(), '2025-26').problems).toEqual([]);
  });

  it('names a school it cannot key, a team missing from every table, and a soccer record with no ties field', () => {
    const tr = transcription();
    tr.divisions[1].standings.varsity[4].name = 'Eastside Prep Academy';
    tr.divisions[1].standings.varsity[3].league = '2-6';
    tr.joinedSince = [];
    expect(m.documents.buildLeagueDocumentsHistory('wbal', tr, '2025-26').problems).toEqual([
      'wbal: league record "2-6" of Pinewood (skyline/varsity) has no ties field',
      'wbal: standings name "Eastside Prep Academy" (skyline/varsity) resolves to no team of the league or its former members',
      'wbal: team presentation is in no 2025-26 varsity table and is not listed as joinedSince',
      'wbal: team eastside is in no 2025-26 varsity table and is not listed as joinedSince',
    ]);
  });

  it('keys a school of another league only when the transcription names it a former member', () => {
    const tr = m.documents.readLeagueTranscription('data/soccer', 'wcal');
    tr.formerMembers = [];
    expect(m.documents.buildLeagueDocumentsHistory('wcal', tr, '2025-26').problems).toContain(
      'wcal: standings name "Presentation" (wcal/varsity) resolves to no team of the league or its former members',
    );
  });
});

describe('data/volleyball/history-2025-26.json: the WCAL and the WBAL', () => {
  it('has the WCAL’s final tables, W-L with no ties to leave out', () => {
    const wcal = division('volleyball', 'wcal', 'wcal');
    expect(order(wcal.standings.varsity)).toEqual([
      '1 mitty 12-0', '2 st-ignatius 10-2', '3 saint-francis 7-5', '4 valley-christian 6-6',
      '5 sacred-heart-cathedral 4-8', '6 riordan 3-9', '7 presentation 0-12',
    ]);
    for (const r of [...wcal.standings.varsity, ...wcal.standings.jv]) expect(r.t).toBe(0);
    expect(wcal.awards.varsity!.overall).toEqual([{ award: 'Player of the Year', value: 'Makenna Crosson, Archbishop Mitty' }]);
  });

  it('has the WBAL’s 2025 divisions, not this season’s', () => {
    expect(order(division('volleyball', 'wbal', 'foothill').standings.varsity)).toEqual([
      '1 sacred-heart-prep 12-0', '2 notre-dame-belmont 9-3', '3 menlo 8-4', '4 harker 6-6', '5 mercy-burlingame 5-7',
      '6 crystal-springs 1-11', '6 notre-dame-san-jose 1-11',
    ]);
    expect(order(division('volleyball', 'wbal', 'skyline').standings.varsity)).toEqual([
      '1 kings-academy 8-0', '2 castilleja 5-3', '3 pinewood 4-4', '4 priory 3-5', '5 eastside 0-8',
    ]);
    expect(division('volleyball', 'wbal', 'foothill').standings.jv.map((r) => r.place)).toEqual([1, 2, 3, 4, 4, 6, 7]);
    expect(division('volleyball', 'wbal', 'foothill').awards.varsity!.overall.map((o) => o.value)).toEqual([
      'Leilah Abrams, Sacred Heart Prep', 'Gia Rivera, Notre Dame Belmont',
    ]);
  });
});
