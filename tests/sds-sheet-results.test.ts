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
import { keepUnread } from '../lib/pipeline/steps/sds-sheet';
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

describe('the sheet’s games with no score yet', () => {
  const at = (date: string, time: string | null) => ({ division: 'division-2', dateKey: date, time, venue: null });
  it('lists a game MaxPreps has not posted, with the sheet’s time, the better place hosting', () => {
    const out = apply(maxpreps, []);
    expect(out.listed).toEqual([]);
    const listed = applySdsSheetResults({
      games: maxpreps,
      results: [],
      fixtures: [{ ...at('2025-11-12', '19:00'), teams: ['mira-mesa', 'del-norte'] }],
      today: '2025-11-10',
      file,
      windowFirst: SDS_2025_WINDOW.first,
      sheetUrl: SHEET,
      fetchedAt: AT,
    });
    // MaxPreps has Del Norte v Mira Mesa on Nov 12: nothing is listed and its time stays MaxPreps'.
    expect(listed.listed).toEqual([]);
    expect(listed.timed).toEqual([]);

    const without = maxpreps.filter((g) => !(g.home.slug === 'del-norte' && g.away.slug === 'mira-mesa'));
    const fresh = applySdsSheetResults({
      games: without,
      results: [],
      fixtures: [{ ...at('2025-11-12', '19:00'), teams: ['mira-mesa', 'del-norte'] }],
      today: '2025-11-10',
      file,
      windowFirst: SDS_2025_WINDOW.first,
      sheetUrl: SHEET,
      fetchedAt: AT,
    });
    expect(fresh.listed).toHaveLength(1);
    const g = fresh.listed[0];
    expect(GameSchema.safeParse(g).success).toBe(true);
    expect(g).toMatchObject({
      contestId: 'cifsds:mira-mesa-at-del-norte',
      dateLocal: '2025-11-12T19:00:00',
      isTimeTba: false,
      status: 'scheduled',
      home: { slug: 'del-norte', score: null },
      away: { slug: 'mira-mesa', score: null },
      urls: { maxpreps: null, cifsds: SHEET },
      provenance: { scores: 'cifsds-sheet', schedule: 'cifsds-sheet', sectionSheet: { rule: 'absent-game' } },
    });
    // Its day passed with no score posted: score pending.
    const later = applySdsSheetResults({
      games: without,
      results: [],
      fixtures: [{ ...at('2025-11-12', '19:00'), teams: ['mira-mesa', 'del-norte'] }],
      today: '2025-11-13',
      file,
      windowFirst: SDS_2025_WINDOW.first,
      sheetUrl: SHEET,
      fetchedAt: AT,
    });
    expect(later.listed[0].status).toBe('score-pending');
  });

  it('times a MaxPreps contest that has none, on the same date, and only that', () => {
    const target = maxpreps.find((g) => g.home.slug === 'del-norte' && g.away.slug === 'mira-mesa')!;
    const tba: Game = {
      ...target,
      status: 'scheduled',
      isTimeTba: true,
      dateLocal: `${target.dateKey}T16:00:00`,
      home: { ...target.home, score: null, result: null },
      away: { ...target.away, score: null, result: null },
      decider: null,
      otPeriods: 0,
      isOt: false,
    };
    const games = maxpreps.map((g) => (g.contestId === target.contestId ? tba : g));
    const run = (date: string) =>
      applySdsSheetResults({
        games,
        results: [],
        fixtures: [{ ...at(date, '19:00'), teams: ['del-norte', 'mira-mesa'] }],
        file,
        windowFirst: SDS_2025_WINDOW.first,
        sheetUrl: SHEET,
        fetchedAt: AT,
      });
    const timed = run(target.dateKey);
    expect(timed.timed.map((g) => g.contestId)).toEqual([target.contestId]);
    expect(timed.games.find((g) => g.contestId === target.contestId)).toMatchObject({
      dateLocal: `${target.dateKey}T19:00:00`,
      isTimeTba: false,
      provenance: { scores: tba.provenance.scores, schedule: 'cifsds-sheet' },
    });
    expect(timed.listed).toEqual([]);
    // A different date on the sheet: MaxPreps' date stands and the time is not guessed.
    expect(run('2025-11-11').timed).toEqual([]);
  });

  it('turns a listed game final with the same id once its result is posted', () => {
    const without = maxpreps.filter((g) => !(g.home.slug === 'del-norte' && g.away.slug === 'mira-mesa'));
    const result = results.find((r) => r.winner === 'del-norte' && r.loser === 'mira-mesa')!;
    const out = apply(without, [result]);
    expect(out.added.map((g) => g.contestId)).toEqual(['cifsds:mira-mesa-at-del-norte']);
    expect(out.added[0].status).toBe('final');
  });
});

describe('a corrected sheet score', () => {
  it('replaces the score an earlier run wrote onto a carried MaxPreps contest, even when the winner changes', () => {
    const target = maxpreps.find((g) => g.home.slug === 'del-norte' && g.away.slug === 'mira-mesa')!;
    const pending: Game = { ...target, status: 'scheduled', home: { ...target.home, score: null, result: null }, away: { ...target.away, score: null, result: null }, decider: null, otPeriods: 0, isOt: false };
    const first = apply(maxpreps.map((g) => (g.contestId === target.contestId ? pending : g)));
    // The contest comes back carried with the sheet's 1-0 Del Norte; the sheet now says Mira Mesa won 2-1.
    const corrected = results.map((r) =>
      r.winner === 'del-norte' && r.loser === 'mira-mesa'
        ? { ...r, winner: 'mira-mesa', loser: 'del-norte', winnerGoals: 2, loserGoals: 1, otPeriods: 0, scoreText: '2-1' }
        : r,
    );
    const second = apply(first.games, corrected);
    expect(second.games.find((g) => g.contestId === target.contestId)).toMatchObject({
      home: { slug: 'del-norte', score: 1, result: 'L' },
      away: { slug: 'mira-mesa', score: 2, result: 'W' },
      decider: 'REG',
      provenance: { scores: 'cifsds-sheet' },
    });
    expect(second.disagreements).toEqual([]);
  });
});

describe('carry-forward and supersede', () => {
  it('keeps the earlier results of the pairs a partly unreadable tab did not give', () => {
    const d2 = results.filter((r) => r.division === 'division-2');
    const freshPart = d2.slice(0, 3);
    expect(keepUnread(d2, freshPart)).toEqual(d2.slice(3));
    expect(keepUnread(d2, d2)).toEqual([]);
  });

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
