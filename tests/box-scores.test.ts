/**
 * Box scores (SPEC §1.1k): MaxPreps' per-game team table (lib/sources/maxpreps-game-stats.ts), one
 * team's box score for one game (lib/sources/maxpreps-box-score.ts), their place in
 * data/player-stats.json (lib/player-stats-schema.ts BoxScoreSchema) and how
 * scripts/fetch-player-stats.ts reads them: only for the team's finals, and again only when the
 * game's row changes.
 *
 * Numbers are asserted on the captures in tests/fixtures/maxpreps (player-captures.json says what
 * each is); the committed file is held only to the contract, since every refresh rewrites it.
 */

import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { getSnapshot } from '../lib/data';
import { getBoxScore, getPlayerStats } from '../lib/player-stats';
import {
  BoxScoreSchema,
  PlayerStatsFileSchema,
  TeamPlayerStatsSchema,
  type PlayerStatsFile,
} from '../lib/player-stats-schema';
import { getTeamRoster } from '../lib/rosters';
import { boxScoreUrl, toBoxScore } from '../lib/sources/maxpreps-box-score';
import { parseGameRows } from '../lib/sources/maxpreps-game-stats';
import { parsePlayerStats } from '../lib/sources/maxpreps-player-stats';
import { getTeamBySlug } from '../lib/teams';
import type { TeamSlug } from '../lib/types';
import { FIXTURE_DIR, runScript } from './helpers';

const readCapture = (name: string) => JSON.parse(readFileSync(path.join(FIXTURE_DIR, name), 'utf8')) as unknown;
const PALO_ALTO = getTeamBySlug('palo-alto')!.id;
const DAVIS = getTeamBySlug('davis')!.id;
const DAVIS_GAME = '3630239d-6398-4033-a398-69af5675f6b5';
/** The three Palo Alto finals with a box score capture. */
const PALO_ALTO_BOXES = [
  '0e514547-6fda-4d35-a6ee-98c47c3a0e34',
  '47015ab4-f9d2-4366-a8f6-cdcd8e131df2',
  '80175ec7-ea39-42d1-a0ab-399100dc1925',
];

describe('parseGameRows', () => {
  const capture = readCapture('game-stats-palo-alto.json');

  it('gives each game a digest of its row, the same on every read', () => {
    const rows = parseGameRows(capture, { expectedTeamId: PALO_ALTO });
    expect(rows.length).toBeGreaterThan(10);
    expect(new Set(rows.map((r) => r.total.contestId)).size).toBe(rows.length);
    for (const r of rows) expect(r.rowKey).toMatch(/^[0-9a-f]{16}$/);
    expect(parseGameRows(capture).map((r) => r.rowKey)).toEqual(rows.map((r) => r.rowKey));
    for (const id of PALO_ALTO_BOXES) expect(rows.find((r) => r.total.contestId === id)?.entered, id).toBe(true);
  });

  it("changes one game's digest, and only that one, when a number in its row moves", () => {
    const edited = structuredClone(capture) as {
      data: { groups: Array<{ subgroups: Array<{ stats: { columns: Array<{ name: string }>; rows: Array<{ columns: Array<{ value: string | null }> }> } }> }> };
    };
    const table = edited.data.groups[0].subgroups[0].stats;
    const goalsAt = table.columns.findIndex((c) => c.name === 'Goals');
    const cell = table.rows[0].columns[goalsAt];
    cell.value = String(Number(cell.value ?? 0) + 1);
    const before = parseGameRows(capture);
    const after = parseGameRows(edited);
    const changed = after.filter((r, i) => r.rowKey !== before[i].rowKey);
    expect(changed).toHaveLength(1);
    expect(changed[0].total.goals).toBe(before.find((r) => r.total.contestId === changed[0].total.contestId)!.total.goals + 1);
  });

  it('marks a row of zeros as nothing entered (Homestead)', () => {
    const rows = parseGameRows(readCapture('game-stats-homestead.json'));
    expect(rows.find((r) => r.total.contestId === 'ed85ac7a-4f01-413a-86a2-7674922b90df')?.entered).toBe(true);
    expect(rows.find((r) => r.total.contestId === '4c02fa58-29a8-46d3-9820-2883a8c9d065')?.entered).toBe(false);
  });
});

describe('a box score', () => {
  const page = parsePlayerStats(readCapture(`box-davis-${DAVIS_GAME}.json`), {
    expectedTeamId: DAVIS,
    url: boxScoreUrl(DAVIS, DAVIS_GAME),
  })!;
  const box = toBoxScore(page, getTeamRoster('davis')?.players ?? [], DAVIS_GAME, 'abc')!;

  it("reads with the season rollup's rules: tracked stats, the game's own totals, no per-game columns", () => {
    expect(box.tracked.field).toEqual(['goals', 'assists', 'points', 'shots', 'shotsOnGoal', 'steals']);
    expect(box.tracked.goalkeeping).toEqual(['opponentShotsOnGoal', 'saves', 'goalsAgainst', 'shutouts', 'wins']);
    expect(box.totals.field.goals).toBe(7);
    expect(box.totals.goalkeeping.saves).toBe(4);
    expect(BoxScoreSchema.parse(box)).toEqual(box);
  });

  it('keeps only the numbers each player has, and the two field tables as one line', () => {
    const scorer = box.players.find((p) => p.jersey === '33')!;
    expect(scorer.field).toEqual({ goals: 3, assists: 1, points: 7, shots: 8, shotsOnGoal: 5, steals: 3 });
    const stealer = box.players.find((p) => p.jersey === '18')!;
    expect(stealer.field).toEqual({ steals: 1 });
    const keepers = box.players.filter((p) => p.goalkeeping);
    expect(keepers.map((k) => k.jersey)).toEqual(['3', '28']);
    for (const p of box.players) {
      for (const v of [...Object.values(p.field ?? {}), ...Object.values(p.goalkeeping ?? {})]) expect(v).not.toBeNull();
    }
  });

  it("reads MaxPreps' no-data answer as no box score", () => {
    expect(parsePlayerStats({ status: 400, message: 'No data was found for this request.', data: null })).toBeNull();
  });

  it('refuses a stat the box score does not track, two box scores for one game, and box scores on a team with none', () => {
    const untracked = structuredClone(box);
    untracked.players[0].field = { ...untracked.players[0].field, gameWinningGoals: 1 };
    expect(BoxScoreSchema.safeParse(untracked).success).toBe(false);

    const team = structuredClone(getPlayerStats().teams.find((t) => t.status === 'ok')!);
    expect(TeamPlayerStatsSchema.safeParse({ ...team, games: [box] }).success).toBe(true);
    expect(TeamPlayerStatsSchema.safeParse({ ...team, games: [box, box] }).success).toBe(false);
    const none = { ...team, status: 'none', players: [], games: [box] };
    expect(TeamPlayerStatsSchema.safeParse(none).success).toBe(false);
  });
});

describe('box scores in data/player-stats.json', () => {
  it('are served by contest and team, and hold only a final of that team', () => {
    const games = new Map(getSnapshot().games.map((g) => [g.contestId, g]));
    for (const t of getPlayerStats().teams) {
      for (const box of t.games ?? []) {
        expect(getBoxScore(box.contestId, t.slug as TeamSlug)).toBe(box);
        const game = games.get(box.contestId);
        // A box score is read only for a final in the run's snapshot; a later snapshot can only
        // have dropped the game (a contest MaxPreps deleted), never made it another team's.
        if (game) expect([game.home.slug, game.away.slug], `${t.slug} ${box.contestId}`).toContain(t.slug);
      }
    }
  });
});

describe('scripts/fetch-player-stats.ts and box scores', () => {
  const tmp = () => mkdtempSync(path.join(tmpdir(), 'scvalfh-box-'));
  function build(fixtures: string, out: string, fetchedAt: string): PlayerStatsFile {
    const res = runScript('scripts/fetch-player-stats.ts', [
      '--fixtures', fixtures, '--leagues', 'scval', '--out', out, '--fetched-at', fetchedAt,
    ]);
    expect(res.status, res.output).toBe(0);
    return PlayerStatsFileSchema.parse(JSON.parse(readFileSync(out, 'utf8')) as unknown);
  }
  const paloAlto = (f: PlayerStatsFile) => f.teams.find((t) => t.slug === 'palo-alto')!;

  it("reads a box score for each of the team's captured finals, against its row's digest", () => {
    const built = build(FIXTURE_DIR, path.join(tmp(), 'player-stats.json'), '2026-10-24T21:00:00.000Z');
    const rows = parseGameRows(readCapture('game-stats-palo-alto.json'));
    const games = paloAlto(built).games!;
    expect(games.map((g) => g.contestId)).toEqual(PALO_ALTO_BOXES);
    for (const g of games) expect(g.rowKey).toBe(rows.find((r) => r.total.contestId === g.contestId)!.rowKey);
    // A team with no per-game capture is simply not read offline: no box scores, no warning.
    const fremont = built.teams.find((t) => t.slug === 'fremont')!;
    expect(fremont.games).toBeUndefined();
    expect(fremont.warnings.filter((w) => w.includes('box score'))).toEqual([]);
  });

  it('keeps a stored box score while its row is unchanged, and reads it again once the row moves', () => {
    const dir = tmp();
    const fixtures = path.join(dir, 'fixtures');
    cpSync(FIXTURE_DIR, fixtures, { recursive: true });
    const out = path.join(dir, 'player-stats.json');
    const first = paloAlto(build(fixtures, out, '2026-10-24T21:00:00.000Z')).games!;

    // The box score changes upstream but its row does not: the stored one is kept, with no call.
    const id = PALO_ALTO_BOXES[2];
    const boxFile = path.join(fixtures, `box-palo-alto-${id}.json`);
    const doubled = readFileSync(boxFile, 'utf8').replaceAll('"overallValue":"3"', '"overallValue":"30"');
    expect(doubled).not.toBe(readFileSync(boxFile, 'utf8'));
    writeFileSync(boxFile, doubled);
    const kept = paloAlto(build(fixtures, out, '2026-10-24T22:00:00.000Z')).games!;
    expect(kept).toEqual(first);

    // Its row moves: the box score is read again.
    const tableFile = path.join(fixtures, 'game-stats-palo-alto.json');
    const table = JSON.parse(readFileSync(tableFile, 'utf8')) as {
      data: { groups: Array<{ subgroups: Array<{ stats: { rows: Array<{ columns: Array<{ value: string | null; href?: string | null }> }> } }> }> };
    };
    const row = table.data.groups[0].subgroups[0].stats.rows.find((r) => r.columns[1].href?.includes(id))!;
    row.columns[0].value = `${row.columns[0].value ?? ''}Z`;
    writeFileSync(tableFile, JSON.stringify(table));
    const reread = paloAlto(build(fixtures, out, '2026-10-24T23:00:00.000Z')).games!;
    const before = first.find((g) => g.contestId === id)!;
    const after = reread.find((g) => g.contestId === id)!;
    expect(after.rowKey).not.toBe(before.rowKey);
    expect(after.totals).not.toEqual(before.totals);
    // The others were left alone.
    expect(reread.filter((g) => g.contestId !== id)).toEqual(first.filter((g) => g.contestId !== id));

    // A box score that can no longer be read keeps the stored one, with a warning.
    writeFileSync(boxFile, '{"status":500}');
    row.columns[0].value = `${row.columns[0].value ?? ''}Z`;
    writeFileSync(tableFile, JSON.stringify(table));
    const failed = paloAlto(build(fixtures, out, '2026-10-25T00:00:00.000Z'));
    expect(failed.games!.find((g) => g.contestId === id)).toEqual(after);
    expect(failed.warnings.some((w) => w.startsWith(`box score ${id} not read`) && w.endsWith('the previous one is kept'))).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });
});

