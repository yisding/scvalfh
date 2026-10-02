/**
 * data/player-stats.json: the committed file validates, joins to data/rosters.json, and the script
 * builds a valid file from the fixtures.
 *
 * Unlike data/rosters.json there is no byte-for-byte rebuild check: stats move after every game,
 * so the committed file is expected to be newer than the captures in tests/fixtures/maxpreps.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { getPlayerStats, getTeamPlayerStats } from '../lib/player-stats';
import {
  PlayerStatsFileSchema,
  countPlayerStats,
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
    const team = raw.teams.find((t) => t.players.length > 0 && !t.tracked.field.includes('steals'))!;
    const bad = structuredClone(raw);
    const t = bad.teams.find((x) => x.slug === team.slug)!;
    t.players[0].field = { ...t.players[0].field!, steals: 2 };
    expect(PlayerStatsFileSchema.safeParse(bad).success).toBe(false);
  });

  it('a team with no stats says so, rather than publishing an empty table', () => {
    for (const t of raw.teams) {
      if (t.players.length === 0) expect(['none', 'error'], t.slug).toContain(t.status);
      else expect(['ok', 'carried-forward'], t.slug).toContain(t.status);
    }
  });
});

describe('scripts/fetch-player-stats.ts --fixtures', () => {
  it('builds a valid file from the captures', () => {
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
        '2026-10-02T14:00:00.000Z',
      ],
      { cwd: REPO, stdio: 'pipe' },
    );
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
});
