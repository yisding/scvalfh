/**
 * data/player-stats.json: the committed file validates, joins to data/rosters.json, and the script
 * builds a valid file from the fixtures.
 *
 * Unlike data/rosters.json there is no byte-for-byte rebuild check: stats move after every game,
 * so the committed file is expected to be newer than the captures in tests/fixtures/maxpreps.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { getPlayerStats, getTeamPlayerStats } from '../lib/player-stats';
import {
  FIELD_STAT_KEYS,
  PlayerStatsFileSchema,
  countPlayerStats,
  playerStatsContentKey,
  type PlayerStatsFile,
} from '../lib/player-stats-schema';
import { getRosters } from '../lib/rosters';
import { TEAMS } from '../lib/teams';
import { FIXTURE_DIR, REPO } from './helpers';

const raw = JSON.parse(readFileSync(path.join(REPO, 'data', 'player-stats.json'), 'utf8')) as PlayerStatsFile;

describe('data/player-stats.json', () => {
  it('validates against the contract and is what the read API serves', () => {
    const parsed = PlayerStatsFileSchema.safeParse(raw);
    expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues.slice(0, 5))).toBe(true);
    expect(getPlayerStats().fetchedAt).toBe(raw.fetchedAt);
    for (const team of TEAMS) expect(getTeamPlayerStats(team.slug)?.slug).toBe(team.slug);
  });

  it('has one entry per registry team, in registry order', () => {
    expect(raw.teams.map((t) => t.slug)).toEqual(TEAMS.map((t) => t.slug));
    expect(raw.teams.map((t) => t.teamId)).toEqual(TEAMS.map((t) => t.id));
  });

  it('joins every published line to the same team on data/rosters.json', () => {
    for (const t of raw.teams) {
      const roster = getRosters().teams.find((r) => r.slug === t.slug)!;
      const byCareer = new Map(roster.players.map((p) => [p.careerId, p]));
      for (const line of t.players) {
        if (!line.onRoster) continue;
        const p = byCareer.get(line.careerId);
        expect(p, `${t.slug} ${line.fullName}`).toBeDefined();
        expect(line.fullName).toBe(p!.fullName);
        expect(line.athleteId).toBe(p!.athleteId);
      }
    }
  });

  it('counts are recomputed from the rows, and the schema refuses a file whose counts lie', () => {
    expect(raw.counts).toEqual(countPlayerStats(raw.teams));
    const lying = structuredClone(raw);
    lying.counts.players += 1;
    expect(PlayerStatsFileSchema.safeParse(lying).success).toBe(false);
  });

  it('refuses a number in a column the team does not track', () => {
    // Any team with a field player and any stat it leaves untracked; there is always one today
    // (field minutes, steals), and the case is skipped only if every coach tracks everything.
    const bad = structuredClone(raw);
    const team = bad.teams.find(
      (t) => t.players.some((p) => p.field) && FIELD_STAT_KEYS.some((k) => !t.tracked.field.includes(k)),
    );
    if (!team) return;
    const key = FIELD_STAT_KEYS.find((k) => !team.tracked.field.includes(k))!;
    const player = team.players.find((p) => p.field)!;
    player.field = { ...player.field!, [key]: 2 };
    expect(PlayerStatsFileSchema.safeParse(bad).success).toBe(false);
  });

  it('a team with no stats says so, rather than publishing an empty table', () => {
    for (const t of raw.teams) {
      if (t.players.length === 0) expect(['none', 'error'], t.slug).toContain(t.status);
      else expect(['ok', 'carried-forward'], t.slug).toContain(t.status);
    }
  });
});

/** Run the script offline against the captures, writing to `out`; returns its stdout. */
function buildFromFixtures(out: string, fetchedAt: string, ...extra: string[]): string {
  return execFileSync(
    path.join(REPO, 'node_modules', '.bin', 'tsx'),
    [
      path.join(REPO, 'scripts', 'fetch-player-stats.ts'),
      '--fixtures',
      FIXTURE_DIR,
      '--out',
      out,
      '--fetched-at',
      fetchedAt,
      ...extra,
    ],
    { cwd: REPO, stdio: 'pipe', encoding: 'utf8' },
  );
}

const tmpOut = () => path.join(mkdtempSync(path.join(tmpdir(), 'scvalfh-stats-')), 'player-stats.json');

describe('playerStatsContentKey', () => {
  it('ignores every fetchedAt and nothing else', () => {
    const later = structuredClone(raw);
    later.fetchedAt = '2030-01-01T00:00:00.000Z';
    for (const t of later.teams) t.fetchedAt = '2030-01-01T00:00:00.000Z';
    expect(playerStatsContentKey(later)).toBe(playerStatsContentKey(raw));
    // Any field but a stamp changes the key. Not a player's number: this reads the committed file,
    // which a valid refresh can leave with no goal counts at all, and the scheduled refresh runs
    // this suite before it commits ("rewrites the file when a number moved" covers that case on
    // the fixture build).
    const moved = structuredClone(raw);
    moved.season = `${moved.season}-changed`;
    expect(playerStatsContentKey(moved)).not.toBe(playerStatsContentKey(raw));
  });
});

describe('scripts/fetch-player-stats.ts --fixtures', () => {
  it('builds a valid file from the captures', () => {
    const out = tmpOut();
    buildFromFixtures(out, '2026-10-02T14:00:00.000Z');
    const built = PlayerStatsFileSchema.parse(JSON.parse(readFileSync(out, 'utf8')) as unknown);
    expect(built.counts.teamsWithStats).toBe(10);
    expect(built.counts.errors).toBe(0);
    expect(built.teams.filter((t) => t.status === 'none').map((t) => t.slug).sort()).toEqual([
      'cupertino',
      'los-altos',
      'los-gatos',
      'lynbrook',
      'saratoga',
    ]);
  });

  it('leaves the file byte for byte as it was when only the stamp would change', () => {
    const out = tmpOut();
    buildFromFixtures(out, '2026-10-02T14:00:00.000Z');
    const first = readFileSync(out, 'utf8');
    const log = buildFromFixtures(out, '2026-10-03T05:00:00.000Z');
    expect(log).toContain('no change since 2026-10-02T14:00:00.000Z');
    expect(readFileSync(out, 'utf8')).toBe(first);
  });

  it('rewrites the file when a number moved', () => {
    const out = tmpOut();
    buildFromFixtures(out, '2026-10-02T14:00:00.000Z');
    // Make the previous file disagree with the captures, as yesterday's would after a game.
    const prev = JSON.parse(readFileSync(out, 'utf8')) as PlayerStatsFile;
    const line = prev.teams.flatMap((t) => t.players).find((p) => p.field?.goals != null)!;
    line.field!.goals! += 1;
    writeFileSync(out, JSON.stringify(prev), 'utf8');
    buildFromFixtures(out, '2026-10-03T05:00:00.000Z');
    const next = JSON.parse(readFileSync(out, 'utf8')) as PlayerStatsFile;
    expect(next.fetchedAt).toBe('2026-10-03T05:00:00.000Z');
    expect(playerStatsContentKey(next)).not.toBe(playerStatsContentKey(prev));
  });

  it('writes nothing outside the season window unless forced', () => {
    const out = tmpOut();
    // 2026-07-15 noon Pacific: July, outside Aug 1 – Nov 30.
    const log = buildFromFixtures(out, '2026-07-15T19:00:00.000Z');
    expect(log).toContain('out of season: 2026-07-15');
    expect(existsSync(out)).toBe(false);
    buildFromFixtures(out, '2026-07-15T19:00:00.000Z', '--force');
    expect(existsSync(out)).toBe(true);
  });
});
