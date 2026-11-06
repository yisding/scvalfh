/**
 * lib/postseason/sds-sheet-results.ts — the San Diego Section's bracket sheet as a source of playoff results,
 * MaxPreps first. Run against last season: the 2025 sheet's 27 results (tests/fixtures/sds/sheet-2025/) over the
 * 26 San Diego playoff rows MaxPreps posted in 2025 (tests/fixtures/sds/brackets-2025.ts), which lack four of
 * the bracket's games: the Division II play-in, two Division II first-round games and a quarterfinal.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { supersededGamesOf } from '../lib/pipeline/steps/assemble';
import { buildSdsBrackets } from '../lib/postseason/sds-bracket';
import { sdsDivisionTeams } from '../lib/postseason/sds-brackets-file';
import { applySdsSheetResults, sheetResultsFromGames } from '../lib/postseason/sds-sheet-results';
import { GameSchema } from '../lib/snapshot/snapshot-schema';
import { parseSdsBracketTab, type SdsSheetResult } from '../lib/sources/sds-bracket-sheet';
import type { Game, Snapshot } from '../lib/types';
import { SDS_2025_WINDOW, sdsGames2025, seedsFromHistory } from './fixtures/sds/brackets-2025';
import { REPO } from './helpers';

const file = seedsFromHistory('sds');
const SHEET = 'https://docs.google.com/spreadsheets/d/1P9J_VFYljarF0IxnE4SP8zHey9T6y97IHz6NZZbaBWg/edit';
const AT = '2025-11-13T15:00:00Z';

const results: SdsSheetResult[] = file.divisions.flatMap((d) => {
  const text = readFileSync(path.join(REPO, 'tests', 'fixtures', 'sds', 'sheet-2025', `${d.id}.csv`), 'utf8');
  const read = parseSdsBracketTab(text, { id: d.id, label: d.label, teams: sdsDivisionTeams(d) });
  if (!read.recognised) throw new Error(read.reason);
  return read.results;
});

const apply = (games: readonly Game[], rs: readonly SdsSheetResult[] = results) =>
  applySdsSheetResults({ games, results: rs, file, windowFirst: SDS_2025_WINDOW.first, sheetUrl: SHEET, fetchedAt: AT });

const maxpreps = sdsGames2025();
const applied = apply(maxpreps);

describe('the 2025 playoffs', () => {
  it('adds the four games MaxPreps never posted, and agrees with it on the other 23', () => {
    expect(applied.added.map((g) => g.contestId).sort()).toEqual([
      'cifsds:granite-hills-at-helix',
      'cifsds:helix-at-rancho-buena-vista',
      'cifsds:rancho-buena-vista-at-olympian',
      'cifsds:westview-at-bonita-vista',
    ]);
    expect(applied.agreed).toBe(23);
    expect(applied.filled).toEqual([]);
    expect(applied.disagreements).toEqual([]);
    expect(applied.games).toHaveLength(maxpreps.length + 4);
  });

  it('writes a sheet game as a valid snapshot game, the better place hosting, with its overtime and its source', () => {
    // Olympian (3) hosted Rancho Buena Vista (6): "1PM @ Higher Seed".
    const rbv = applied.added.find((g) => g.contestId === 'cifsds:rancho-buena-vista-at-olympian')!;
    expect(GameSchema.safeParse(rbv).success).toBe(true);
    expect(rbv).toMatchObject({
      dateLocal: '2025-11-08T13:00:00',
      dateUtc: '2025-11-08T21:00:00Z',
      home: { slug: 'olympian', score: 0, result: 'L' },
      away: { slug: 'rancho-buena-vista', score: 1, result: 'W' },
      site: 'home',
      status: 'final',
      decider: '2OT',
      otPeriods: 2,
      isOt: true,
      urls: { maxpreps: null, cifsds: SHEET },
      provenance: { scores: 'cifsds-sheet', schedule: 'cifsds-sheet', sectionSheet: { rule: 'absent-game' } },
    });
    for (const g of applied.added) expect(GameSchema.safeParse(g).success, g.contestId).toBe(true);
    // The play-in is hosted by the file's `home`.
    expect(applied.added.find((g) => g.contestId === 'cifsds:granite-hills-at-helix')).toMatchObject({
      home: { slug: 'helix', score: 2 },
      away: { slug: 'granite-hills', score: 1 },
    });
  });

  it('completes the Division II bracket: every card up to the final has its game', () => {
    // Step 10 (lib/classify.ts) tags a sheet game as it tags MaxPreps' rows; its window is 2026's, so the tag is passed here.
    const tagged = applied.games.map((g) =>
      g.postseason ? g : { ...g, postseason: { kind: 'section-playoffs' as const, leagueId: null, via: 'section-postseason-window' as const } },
    );
    const d2 = buildSdsBrackets(file, tagged).find((d) => d.id === 'division-2')!;
    const cards = d2.rounds.slice(0, -1).flatMap((r) => r.cards);
    const before = buildSdsBrackets(file, maxpreps).find((d) => d.id === 'division-2')!;
    expect(before.rounds.slice(0, -1).flatMap((r) => r.cards).filter((c) => c.game === null && c.top && 'slug' in c.top && 'slug' in c.bottom)).not.toHaveLength(0);
    for (const c of cards) {
      if ('slug' in c.top && 'slug' in c.bottom) expect(c.game, c.id).not.toBeNull();
    }
  });

  it('is idempotent: applying the sheet again changes nothing', () => {
    const again = apply(applied.games);
    expect(again.games).toEqual(applied.games);
    expect(again.added).toHaveLength(4);
  });
});

describe('MaxPreps first', () => {
  it('writes the sheet’s score onto a MaxPreps contest that has none (rule 2), keeping its id', () => {
    const target = maxpreps.find((g) => g.home.slug === 'del-norte' && g.away.slug === 'mira-mesa')!;
    const pending: Game = { ...target, status: 'scheduled', home: { ...target.home, score: null, result: null }, away: { ...target.away, score: null, result: null }, decider: null, otPeriods: 0, isOt: false };
    const out = apply(maxpreps.map((g) => (g.contestId === target.contestId ? pending : g)));
    expect(out.filled.map((g) => g.contestId)).toEqual([target.contestId]);
    const filled = out.games.find((g) => g.contestId === target.contestId)!;
    expect(filled).toMatchObject({
      status: 'final',
      home: { slug: 'del-norte', score: 1, result: 'W' },
      away: { slug: 'mira-mesa', score: 0, result: 'L' },
      decider: 'OT',
      urls: { cifsds: SHEET },
      provenance: { scores: 'cifsds-sheet', sectionSheet: { rule: 'score-pending' } },
    });
    expect(filled.urls.maxpreps).toBe(target.urls.maxpreps);
    expect(GameSchema.safeParse(filled).success).toBe(true);
  });

  it('keeps a MaxPreps final the sheet disagrees with, and says so (rule 1)', () => {
    const target = maxpreps.find((g) => g.home.slug === 'point-loma' && g.away.slug === 'otay-ranch')!;
    const off: Game = { ...target, home: { ...target.home, score: 6 } };
    const out = apply(maxpreps.map((g) => (g.contestId === target.contestId ? off : g)));
    expect(out.games.find((g) => g.contestId === target.contestId)).toEqual(off);
    expect(out.disagreements).toEqual([expect.stringContaining(`${target.contestId} (2025-11-05): MaxPreps has Otay Ranch 0, Point Loma 6`)]);
  });

  it('never joins a regular-season meeting before the playoffs, nor a postponed row', () => {
    const helixGames = applied.added.filter((g) => g.contestId.includes('helix'));
    expect(helixGames).toHaveLength(2);
    const target = maxpreps.find((g) => g.home.slug === 'del-norte' && g.away.slug === 'bonita-vista')!;
    const postponed: Game = { ...target, status: 'postponed', home: { ...target.home, score: null, result: null }, away: { ...target.away, score: null, result: null }, decider: null };
    const out = apply(maxpreps.map((g) => (g.contestId === target.contestId ? postponed : g)));
    expect(out.added.map((g) => g.contestId)).toContain('cifsds:bonita-vista-at-del-norte');
  });
});

describe('carry-forward and supersede', () => {
  it('reads the results back from the games, so a run that cannot read the sheet publishes the same games', () => {
    const back = sheetResultsFromGames(applied.games, file);
    expect(back).toHaveLength(4);
    expect(apply(maxpreps, back).games).toEqual(applied.games);
  });

  it('maps a sheet game MaxPreps has posted since to its contest', () => {
    const sheetGame = applied.added.find((g) => g.contestId === 'cifsds:westview-at-bonita-vista')!;
    const posted: Game = { ...sheetGame, contestId: '0b7a9c3e-1111-4222-8333-944455556666', dateLocal: '2025-11-06T19:30:00', dateKey: '2025-11-06' };
    const previous = { games: applied.games, supersededGames: {} } as unknown as Snapshot;
    const now = apply([...maxpreps, posted]);
    expect(now.added.map((g) => g.contestId)).not.toContain(sheetGame.contestId);
    expect(supersededGamesOf(now.games, previous)).toEqual({ [sheetGame.contestId]: posted.contestId });
  });
});
