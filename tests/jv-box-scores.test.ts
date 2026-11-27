/**
 * JV box scores: scripts/fetch-jv.ts reading each school's per-game JV stats table and box scores (the varsity
 * reader, scripts/lib/box-scores.ts, with the JV season id) offline over Monta Vista's captures in
 * tests/fixtures/jv-stats (README there), the JV file's schema for them, the JV lookup (lib/jv/jv.ts
 * getJvGameStatsEntry), and the JV game page's Game stats section over the committed file.
 *
 * The scheduled refresh runs this suite over the file it just wrote, so the checks on the COMMITTED file hold for
 * any number of box scores, none included.
 */

import { copyFileSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { buildGameStatsView } from '../components/game/game-stats-view';
import { JvGameStats } from '../components/jv/JvGameSections';
import { buildJvGameView } from '../components/jv/jv-game-view';
import { getJvFile, getJvGameSlug, getJvGameStatsEntry, getJvGames } from '../lib/jv/jv';
import { JvFileSchema, JvTeamSchema } from '../lib/jv/jv-schema';
import { IS_FIELD_HOCKEY } from '../lib/sports/current';
import { REPO, runScript } from './helpers';

const FIXTURES = path.join(REPO, 'tests', 'fixtures', 'jv-stats');
const fetchedAt = '2026-11-27T12:00:00.000Z';

describe.runIf(IS_FIELD_HOCKEY)('scripts/fetch-jv.ts JV box scores, offline over Monta Vista’s captures', () => {
  const run = (fixtures: string, out: string) =>
    runScript('scripts/fetch-jv.ts', ['--fixtures', fixtures, '--leagues', 'scval', '--no-sblive', '--out', out, '--fetched-at', fetchedAt]);
  const boxFiles = readdirSync(FIXTURES).filter((f) => f.startsWith('jv-box-monta-vista-'));
  const team = (out: string) => JvFileSchema.parse(JSON.parse(readFileSync(out, 'utf8'))).teams.find((t) => t.slug === 'monta-vista')!;

  it('reads the per-game table and every captured box score, joined to the rosters on the career id', () => {
    const out = path.join(mkdtempSync(path.join(tmpdir(), 'scvalfh-jv-box-')), 'jv.json');
    // The other SCVAL schools have no capture, so their feeds fail and the run exits 1; Monta Vista is read.
    const r = run(FIXTURES, out);
    expect(r.status, r.output).toBe(1);
    const mv = team(out);
    expect(mv.maxpreps.status).toBe('ok');
    expect(mv.stats?.status).toBe('ok');
    expect(mv.stats?.rowCount).toBeGreaterThanOrEqual(boxFiles.length);
    // Offline, a game with no box capture is simply not read: neither kept nor unread.
    expect(mv.boxScores?.map((b) => `jv-box-monta-vista-${b.contestId}.json`).sort()).toEqual([...boxFiles].sort());
    expect(mv.unreadBoxScores).toBeUndefined();
    for (const box of mv.boxScores ?? []) {
      expect(box.players.length).toBeGreaterThan(0);
      // Every line is a roster's full name or the stats sheet's short form ("G. Mathew").
      for (const p of box.players) expect(p.name).toMatch(/\S/);
    }
    // Every box score is for one of the school's MaxPreps JV finals in the same file.
    const file = JvFileSchema.parse(JSON.parse(readFileSync(out, 'utf8')));
    const finals = new Set(file.games.filter((g) => g.status === 'final').map((g) => g.contestId));
    for (const box of mv.boxScores ?? []) expect(finals.has(box.contestId)).toBe(true);
    expect(r.stdout).toMatch(/monta-vista .* · 2 box scores/);
  });

  it('keeps the previous box scores when the table is missing or cannot be read', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'scvalfh-jv-box-'));
    const out = path.join(dir, 'jv.json');
    run(FIXTURES, out);
    const first = team(out);

    // No per-game capture: the school keeps what the previous file had, as it had it.
    const noTable = mkdtempSync(path.join(tmpdir(), 'scvalfh-jv-box-fx-'));
    copyFileSync(path.join(FIXTURES, 'jv-sched-monta-vista.json'), path.join(noTable, 'jv-sched-monta-vista.json'));
    run(noTable, out);
    expect(team(out).boxScores).toEqual(first.boxScores);
    expect(team(out).stats).toEqual(first.stats);

    // A table that does not parse: carried forward, box scores kept.
    const broken = mkdtempSync(path.join(tmpdir(), 'scvalfh-jv-box-fx-'));
    copyFileSync(path.join(FIXTURES, 'jv-sched-monta-vista.json'), path.join(broken, 'jv-sched-monta-vista.json'));
    writeFileSync(path.join(broken, 'jv-game-stats-monta-vista.json'), '{"status":200,"data":{"teamId":"x"}}');
    const r = run(broken, out);
    expect(r.output).toMatch(/WARN monta-vista JV stats:/);
    const after = team(out);
    expect(after.stats?.status).toBe('carried-forward');
    expect(after.stats?.fetchedAt).toBe(first.stats?.fetchedAt);
    expect(after.boxScores).toEqual(first.boxScores);
  });
});

describe('the JV file’s box scores', () => {
  const base = getJvFile().teams[0];
  const box = { contestId: 'c1', rowKey: 'abcd1234', tracked: { field: [], goalkeeping: [] }, players: [{ name: 'A. Player', jersey: '1', field: {}, goalkeeping: null }], warnings: [] };
  const stats = { status: 'ok' as const, rowCount: 1, fetchedAt, error: null };

  it('needs a stats read, one box score per contest, and no contest both kept and unread', () => {
    const strip = { ...base, stats: undefined, boxScores: undefined, unreadBoxScores: undefined };
    expect(JvTeamSchema.safeParse({ ...strip, stats, boxScores: [box] }).success).toBe(true);
    expect(JvTeamSchema.safeParse({ ...strip, boxScores: [box] }).success).toBe(false);
    expect(JvTeamSchema.safeParse({ ...strip, stats, boxScores: [box, box] }).success).toBe(false);
    expect(JvTeamSchema.safeParse({ ...strip, stats, boxScores: [box], unreadBoxScores: ['c1'] }).success).toBe(false);
  });

  it('serves every stored box score to its side of the game, and calls a school with no stats read unread', () => {
    for (const t of getJvFile().teams) {
      for (const b of t.boxScores ?? []) {
        expect(getJvGameStatsEntry(b.contestId, t.slug).box).toBe(b);
        expect(getJvGameStatsEntry(b.contestId, t.slug).credits).toEqual([]);
      }
      if (t.stats?.status !== 'ok') expect(getJvGameStatsEntry('no-such-contest', t.slug)).toMatchObject({ box: undefined, unread: true });
      else expect(getJvGameStatsEntry('no-such-contest', t.slug).unread).toBe(false);
    }
  });

  it('shows a Game stats section on the JV game page of every listed final a side has a table for', () => {
    const listed = new Map(getJvGames().map((g) => [g.contestId, g]));
    for (const t of getJvFile().teams) {
      for (const b of t.boxScores ?? []) {
        const game = listed.get(b.contestId);
        const slug = getJvGameSlug(b.contestId);
        if (!game || !slug || game.status !== 'final') continue;
        if (game.home.slug !== t.slug && game.away.slug !== t.slug) continue;
        const model = buildJvGameView(slug)!;
        const view = buildGameStatsView(model, getJvGameStatsEntry);
        const html = renderToStaticMarkup(createElement(JvGameStats, { model }));
        if (model.scoreWithheld || !view) {
          if (model.scoreWithheld) expect(html).toBe('');
          continue;
        }
        expect(view.sides.map((s) => s.key)).toContain(t.slug);
        expect(html).toContain('Game stats');
        // A side's strip links the school's JV games, never its varsity season stats.
        expect(html).toContain(`/teams/${t.slug}#jv`);
        expect(html).not.toContain('#player-stats');
      }
    }
  });
});
