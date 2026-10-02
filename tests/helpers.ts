/** Shared test helpers: the offline fixture corpus and a synthetic Game builder. */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { PlayerStatsFileSchema, type PlayerStatsFile } from '../lib/player-stats-schema';
import { ScheduleResponseSchema, type ScheduleRow } from '../lib/sources/maxpreps';
import { resolveTeam } from '../lib/teams';
import type { Division, Game, GameStatus } from '../lib/types';

export const REPO = path.resolve(import.meta.dirname, '..');
export const FIXTURE_DIR = path.join(REPO, 'tests', 'fixtures', 'maxpreps');

/** Every captured schedule row, exactly as the 15 live requests would return them. */
export function allScheduleRows(): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  for (const file of readdirSync(FIXTURE_DIR).filter((f) => f.startsWith('sched-')).sort()) {
    const raw = JSON.parse(readFileSync(path.join(FIXTURE_DIR, file), 'utf8')) as unknown;
    rows.push(...ScheduleResponseSchema.parse(raw).data);
  }
  return rows;
}

export function standingsFixture(which: 'da' | 'ec') {
  const raw = JSON.parse(
    readFileSync(path.join(FIXTURE_DIR, `${which}.json`), 'utf8'),
  ) as unknown;
  return raw;
}

/** Build a snapshot from the fixtures by running the real cron script. Returns its path. */
export function buildFixtureSnapshot(fetchedAt = '2026-09-29T15:00:00.000Z'): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'scvalfh-'));
  const out = path.join(dir, 'snapshot.json');
  execFileSync(
    path.join(REPO, 'node_modules', '.bin', 'tsx'),
    [
      path.join(REPO, 'scripts', 'fetch-data.ts'),
      '--fixtures',
      FIXTURE_DIR,
      '--out',
      out,
      '--fetched-at',
      fetchedAt,
    ],
    { cwd: REPO, stdio: 'pipe' },
  );
  return out;
}

/**
 * Build data/player-stats.json from the 2026-10-02 stats captures by running the real script, and
 * return it. Tests that assert specific numbers read this, never the committed file, which the
 * scheduled refresh rewrites whenever a coach enters a game.
 */
export function buildFixturePlayerStats(fetchedAt = '2026-10-02T14:00:00.000Z'): PlayerStatsFile {
  const out = path.join(mkdtempSync(path.join(tmpdir(), 'scvalfh-stats-')), 'player-stats.json');
  execFileSync(
    path.join(REPO, 'node_modules', '.bin', 'tsx'),
    [
      path.join(REPO, 'scripts', 'fetch-player-stats.ts'),
      '--fixtures',
      FIXTURE_DIR,
      '--out',
      out,
      '--fetched-at',
      fetchedAt,
    ],
    { cwd: REPO, stdio: 'pipe' },
  );
  return PlayerStatsFileSchema.parse(JSON.parse(readFileSync(out, 'utf8')) as unknown);
}

// ---------------------------------------------------------------- synthetic games

let seq = 0;

export interface GameSpec {
  home: string;
  away: string;
  hs?: number | null;
  as?: number | null;
  date?: string;
  status?: GameStatus;
  league?: boolean;
  division?: Division | null;
  forfeit?: boolean;
  ot?: number;
}

/** A minimal, schema-valid Game between two registry teams. */
export function game(spec: GameSpec): Game {
  const home = resolveTeam(spec.home);
  const away = resolveTeam(spec.away);
  if (!home || !away) throw new Error(`unknown team in spec: ${spec.home} / ${spec.away}`);
  seq += 1;
  const status = spec.status ?? (spec.hs === undefined ? 'scheduled' : 'final');
  const final = status === 'final';
  const dateLocal = `${spec.date ?? '2026-09-09'}T16:00:00`;
  const league = spec.league ?? true;
  const division =
    spec.division === undefined
      ? home.division === away.division
        ? home.division
        : null
      : spec.division;
  const hs = final ? (spec.hs ?? 0) : null;
  const as = final ? (spec.as ?? 0) : null;
  const ot = spec.ot ?? 0;
  return {
    contestId: `test-${String(seq).padStart(4, '0')}`,
    dateLocal,
    dateUtc: `${spec.date ?? '2026-09-09'}T23:00:00Z`,
    dateKey: spec.date ?? '2026-09-09',
    isDateTba: false,
    isTimeTba: false,
    home: {
      teamId: home.id,
      slug: home.slug,
      name: home.name,
      score: hs,
      result: final ? (hs! > as! ? 'W' : hs! < as! ? 'L' : 'T') : null,
    },
    away: {
      teamId: away.id,
      slug: away.slug,
      name: away.name,
      score: as,
      result: final ? (as! > hs! ? 'W' : as! < hs! ? 'L' : 'T') : null,
    },
    site: 'home',
    status,
    isLeague: league,
    leagueDivision: division,
    otPeriods: ot,
    isOt: ot > 0,
    isForfeit: spec.forfeit ?? false,
    forfeitBy: spec.forfeit ? 'away' : null,
    decider: final ? (spec.forfeit ? 'FORFEIT' : ot > 0 ? 'OT' : 'REG') : null,
    shootout: null,
    venue: { text: null },
    recap: null,
    urls: { maxpreps: null, nfhsStream: null, goFan: null },
    provenance: {
      scores: 'derived',
      schedule: 'derived',
      fetchedAt: '2026-09-29T15:00:00.000Z',
    },
  };
}
