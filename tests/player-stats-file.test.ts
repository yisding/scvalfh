/**
 * data/player-stats.json: the committed file validates, joins to data/rosters.json, and the script
 * builds a valid file from the fixtures.
 *
 * Unlike data/rosters.json there is no byte-for-byte rebuild check: stats move after every game,
 * so the committed file is expected to be newer than the captures in tests/fixtures/maxpreps.
 *
 * The scheduled refresh (.github/workflows/update-data.yml) runs this suite over the file it just
 * wrote, so the checks on the COMMITTED file accept every status the schema allows: a team's first
 * transient failure ('error') or a team no run has covered yet ('pending') is an honest state the
 * script publishes. Coverage (every team read) is asserted on files built from the captures.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { getPlayerStats, getTeamPlayerStats } from '../lib/player-stats';
import {
  FIELD_STAT_KEYS,
  PLAYER_STATS_TEAM_COUNT,
  PlayerStatsFileSchema,
  PlayerStatsPartialSchema,
  countPlayerStats,
  playerStatsContentKey,
  type PlayerStatsFile,
} from '../lib/player-stats-schema';
import { getRosters } from '../lib/rosters';
import { RostersSchema, countRosters, type Rosters } from '../lib/rosters-schema';
import { pendingRoster } from '../lib/sources/maxpreps-roster';
import { pendingPlayerStats } from '../lib/sources/maxpreps-player-stats';
import { TEAMS, teamsInLeague } from '../lib/teams';
import { FIXTURE_DIR, REPO } from './helpers';

const raw = JSON.parse(readFileSync(path.join(REPO, 'data', 'player-stats.json'), 'utf8')) as PlayerStatsFile;

describe('data/player-stats.json', () => {
  it('validates against the contract and is what the read API serves', () => {
    const parsed = PlayerStatsFileSchema.safeParse(raw);
    expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues.slice(0, 5))).toBe(true);
    expect(getPlayerStats().fetchedAt).toBe(raw.fetchedAt);
    for (const team of TEAMS) expect(getTeamPlayerStats(team.slug)?.slug).toBe(team.slug);
    expect(getTeamPlayerStats('not-a-school' as never)).toBeUndefined();
  });

  it('has one entry per registry team, all five leagues, in registry order', () => {
    expect(PLAYER_STATS_TEAM_COUNT).toBe(TEAMS.length);
    expect(TEAMS).toHaveLength(49);
    expect(raw.teams.map((t) => t.slug)).toEqual(TEAMS.map((t) => t.slug));
    expect(raw.teams.map((t) => t.teamId)).toEqual(TEAMS.map((t) => t.id));
  });

  it('refuses a missing team, a stranger, another team\'s id, and a pending team that claims a read', () => {
    const short = structuredClone(raw);
    short.teams.pop();
    short.counts = countPlayerStats(short.teams);
    expect(PlayerStatsFileSchema.safeParse(short).success).toBe(false);
    // ...but an older file (the 15 SCVAL teams) is still readable as the PREVIOUS file of a run.
    expect(PlayerStatsPartialSchema.safeParse(short).success).toBe(true);
    const old = structuredClone(raw);
    old.teams = old.teams.slice(0, 15);
    old.counts = countPlayerStats(old.teams);
    expect(PlayerStatsFileSchema.safeParse(old).success).toBe(false);
    expect(PlayerStatsPartialSchema.safeParse(old).success).toBe(true);
    const stranger = structuredClone(raw);
    stranger.teams[0].slug = 'not-a-school';
    expect(PlayerStatsFileSchema.safeParse(stranger).success).toBe(false);
    const badId = structuredClone(raw);
    badId.teams[0].teamId = TEAMS[20].id;
    expect(PlayerStatsFileSchema.safeParse(badId).success).toBe(false);
    // The committed file has no pending team, so build one: a real file with one team replaced by
    // its claim-free entry.
    const i = 3;
    const base = structuredClone(raw);
    base.teams[i] = pendingPlayerStats(TEAMS[i]);
    base.counts = countPlayerStats(base.teams);
    expect(PlayerStatsFileSchema.safeParse(base).success).toBe(true);
    const stamped = structuredClone(base);
    stamped.teams[i].fetchedAt = raw.fetchedAt;
    expect(PlayerStatsFileSchema.safeParse(stamped).success).toBe(false);
    const withPageId = structuredClone(base);
    withPageId.teams[i].maxprepsTeamId = TEAMS[i].id;
    expect(PlayerStatsFileSchema.safeParse(withPageId).success).toBe(false);
    const withRows = structuredClone(base);
    // Any stat line will do (the committed file may hold none today): a pending team can hold none.
    withRows.teams[i].players = [
      { careerId: null, careerUrl: null, athleteId: null, fullName: 'A. Player', shortName: 'A. Player', jersey: null, onRoster: false, field: null, goalkeeping: null },
    ];
    withRows.counts = countPlayerStats(withRows.teams);
    expect(PlayerStatsFileSchema.safeParse(withRows).success).toBe(false);
  });

  it('tracks a stat only when a player holds some of it (no team total with every player at 0)', () => {
    for (const t of raw.teams.filter((x) => x.players.length)) {
      for (const k of t.tracked.field) {
        expect(t.players.some((p) => (p.field?.[k] ?? 0) > 0), `${t.slug} field ${k}`).toBe(true);
      }
      for (const k of t.tracked.goalkeeping) {
        expect(t.players.some((p) => (p.goalkeeping?.[k] ?? 0) > 0), `${t.slug} goalkeeping ${k}`).toBe(true);
      }
    }
  });

  it('flags where a team\'s rows add up to more than its total (Hollister, Archie Williams)', () => {
    for (const t of raw.teams.filter((x) => x.players.length)) {
      for (const [k, total] of Object.entries(t.totals.field)) {
        if (!['goals', 'assists', 'points', 'shots', 'shotsOnGoal', 'gameWinningGoals', 'steals'].includes(k)) continue;
        const sum = t.players.reduce((n, p) => n + (p.field?.[k as 'goals'] ?? 0), 0);
        if (sum > total) {
          expect(t.warnings.some((w) => w.includes(`field ${k}: players add up to ${sum}`)), `${t.slug} ${k}`).toBe(true);
        }
      }
    }
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

  it('a team with no stats says why, rather than publishing an empty table', () => {
    for (const t of raw.teams) {
      if (t.players.length === 0) expect(['none', 'error', 'pending'], t.slug).toContain(t.status);
      else expect(['ok', 'carried-forward'], t.slug).toContain(t.status);
    }
  });

  it('gives every team a status the schema allows, and a failed or uncovered one says so honestly', () => {
    // error and pending are published states (a new team's first transient failure, a league no
    // run has covered): the scheduled refresh tests this file before committing it, so they must
    // not fail the suite. Coverage is asserted on the fixture builds below.
    for (const t of raw.teams) {
      expect(['ok', 'none', 'carried-forward', 'error', 'pending'], t.slug).toContain(t.status);
      if (t.status === 'error' || t.status === 'carried-forward') expect(t.error, t.slug).toBeTruthy();
      else expect(t.error, t.slug).toBeNull();
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
      '--leagues',
      'scval',
      '--out',
      out,
      '--fetched-at',
      fetchedAt,
      ...extra,
    ],
    { cwd: REPO, stdio: 'pipe', encoding: 'utf8' },
  );
}

/** The same, for runs whose exit code or scope the test sets itself. */
function run(out: string, fetchedAt: string, ...extra: string[]) {
  const res = spawnSync(
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
    { cwd: REPO, encoding: 'utf8' },
  );
  return { code: res.status, stdout: res.stdout, stderr: res.stderr };
}

const tmpOut = () => path.join(mkdtempSync(path.join(tmpdir(), 'scvalfh-stats-')), 'player-stats.json');
const read = (file: string) => PlayerStatsFileSchema.parse(JSON.parse(readFileSync(file, 'utf8')) as unknown);

describe('playerStatsContentKey', () => {
  it('ignores a failure\'s message text, which can carry a duration, but not the status', () => {
    const failed = (msg: string) => {
      const f = structuredClone(raw);
      // A team with rows when the file has one; any team otherwise (carried-forward may hold none).
      const t = f.teams.find((x) => x.players.length) ?? f.teams[0];
      Object.assign(t, { status: 'carried-forward', error: msg });
      f.counts = countPlayerStats(f.teams);
      return f;
    };
    expect(playerStatsContentKey(failed('timeout after 15003 ms'))).toBe(playerStatsContentKey(failed('timeout after 15011 ms')));
    expect(playerStatsContentKey(failed('HTTP 503'))).not.toBe(playerStatsContentKey(raw));
  });

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
    // Every SCVAL team was covered: its coach published stats or MaxPreps says none.
    for (const team of teamsInLeague('scval')) {
      expect(['ok', 'none'], team.slug).toContain(built.teams.find((t) => t.slug === team.slug)!.status);
    }
    // Everything but SCVAL is outside this run and, with no previous file, pending.
    expect(built.teams).toHaveLength(49);
    for (const t of built.teams.filter((x) => !teamsInLeague('scval').some((s) => s.slug === x.slug))) {
      expect(t.status, t.slug).toBe('pending');
    }
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

describe('scripts/fetch-player-stats.ts --leagues, and failures scoped to a team', () => {
  it('leaves a league outside the run exactly as the previous file had it', () => {
    const out = tmpOut();
    writeFileSync(out, readFileSync(path.join(REPO, 'data', 'player-stats.json'), 'utf8'), 'utf8');
    const log = buildFromFixtures(out, '2026-10-02T14:00:00.000Z');
    expect(log).toContain('BVAL  12 teams · not in this run');
    const built = read(out);
    for (const team of TEAMS.filter((t) => t.league !== 'scval')) {
      expect(built.teams.find((t) => t.slug === team.slug), team.slug).toEqual(
        raw.teams.find((t) => t.slug === team.slug),
      );
    }
  });

  it('a league that fails never stops another, and a failed team carries its own rows forward', () => {
    // Only some BVAL teams have captures (a sample, not a league): the rest fail offline. One of
    // those has a previous file's rows.
    const captured = (slug: string) => existsSync(path.join(FIXTURE_DIR, `stats-${slug}.json`));
    const bvalAll = teamsInLeague('bval');
    const bval = bvalAll.filter((t) => !captured(t.slug));
    expect(bval.length).toBeGreaterThan(1);
    const out = tmpOut();
    buildFromFixtures(out, '2026-10-02T14:00:00.000Z');
    const donor = read(out);
    const source = donor.teams.find((t) => t.status === 'ok')!;
    const previous = structuredClone(donor);
    Object.assign(previous.teams.find((t) => t.slug === bval[0].slug)!, {
      status: 'ok',
      maxprepsTeamId: bval[0].id,
      lastUpdated: source.lastUpdated,
      tracked: source.tracked,
      totals: source.totals,
      players: source.players,
      fetchedAt: '2026-10-01T00:00:00.000Z',
    });
    previous.counts = countPlayerStats(previous.teams);
    expect(PlayerStatsFileSchema.safeParse(previous).success).toBe(true);
    writeFileSync(out, JSON.stringify(previous), 'utf8');

    const { code, stdout } = run(out, '2026-10-03T05:00:00.000Z', '--leagues', 'scval,bval');
    expect(code).toBe(1); // a team the run covered failed: the scheduler is told
    expect(stdout).toContain('PCAL   7 teams · not in this run');
    const built = read(out);
    for (const team of teamsInLeague('scval')) {
      const t = built.teams.find((x) => x.slug === team.slug)!;
      expect(['ok', 'none'], team.slug).toContain(t.status);
      expect(t.fetchedAt, team.slug).toBe('2026-10-03T05:00:00.000Z');
    }
    const carried = built.teams.find((t) => t.slug === bval[0].slug)!;
    expect(carried.status).toBe('carried-forward');
    expect(carried.players).toEqual(source.players);
    expect(carried.fetchedAt).toBe('2026-10-01T00:00:00.000Z');
    expect(carried.error).toBeTruthy();
    for (const team of bval.slice(1)) {
      expect(built.teams.find((x) => x.slug === team.slug)!.status, team.slug).toBe('error');
    }
    for (const team of bvalAll.filter((t) => captured(t.slug))) {
      expect(['ok', 'none'], team.slug).toContain(built.teams.find((x) => x.slug === team.slug)!.status);
    }
  });

  it('a failed fetch keeps a team with no stats as none: the coach entered none is still what was read', () => {
    const none = TEAMS.find((t) => t.league === 'bval' && !existsSync(path.join(FIXTURE_DIR, `stats-${t.slug}.json`)))!;
    const out = tmpOut();
    buildFromFixtures(out, '2026-10-02T14:00:00.000Z');
    const previous = structuredClone(read(out));
    Object.assign(previous.teams.find((t) => t.slug === none.slug)!, {
      status: 'none',
      maxprepsTeamId: none.id,
      fetchedAt: '2026-10-01T00:00:00.000Z',
    });
    writeFileSync(out, JSON.stringify(previous), 'utf8');
    const { code } = run(out, '2026-10-03T05:00:00.000Z', '--leagues', 'bval');
    expect(code).toBe(1);
    const kept = read(out).teams.find((t) => t.slug === none.slug)!;
    expect(kept.status).toBe('carried-forward');
    expect(kept.players).toEqual([]);
    expect(kept.fetchedAt).toBe('2026-10-01T00:00:00.000Z');
    expect(kept.error).toMatch(/ENOENT/);
  });

  it('reads a team on its registry id when its roster has no page id yet', () => {
    // Leigh's roster was never read (pending: no page id, no players), but its stats capture is
    // there. The registry id is MaxPreps' own team GUID, so the team is still read on it, and the
    // response's teamId is checked against it; every row is then "not on the roster".
    const leigh = TEAMS.find((t) => t.slug === 'leigh')!;
    expect(existsSync(path.join(FIXTURE_DIR, 'stats-leigh.json'))).toBe(true);
    const rosters = JSON.parse(readFileSync(path.join(REPO, 'data', 'rosters.json'), 'utf8')) as Rosters;
    rosters.teams[rosters.teams.findIndex((t) => t.slug === leigh.slug)] = pendingRoster(leigh);
    rosters.counts = countRosters(rosters.teams);
    expect(RostersSchema.safeParse(rosters).success).toBe(true);
    const rostersPath = path.join(mkdtempSync(path.join(tmpdir(), 'scvalfh-stats-rosters-')), 'rosters.json');
    writeFileSync(rostersPath, JSON.stringify(rosters), 'utf8');

    const out = tmpOut();
    const { stderr } = run(out, '2026-10-03T05:00:00.000Z', '--leagues', 'bval', '--rosters', rostersPath);
    expect(stderr).not.toContain('no MaxPreps team id');
    const row = read(out).teams.find((t) => t.slug === leigh.slug)!;
    expect(row.status, stderr).toBe('ok');
    expect(row.maxprepsTeamId).toBe(leigh.id);
    expect(row.players.length).toBeGreaterThan(0);
    for (const line of row.players) {
      expect(line.onRoster, line.shortName).toBe(false);
      expect(line.athleteId, line.shortName).toBeNull();
      expect(line.fullName, line.shortName).toBe(line.shortName);
    }
    expect(row.warnings.filter((w) => w.endsWith('has stats but is not on the MaxPreps roster'))).toHaveLength(row.players.length);
  });

  it('drops only a stale previous row (a team under another team\'s id), names it, and keeps the rest', () => {
    // Before: the whole file was refused and every row outside the run went to pending, exit 0.
    const previous = structuredClone(raw);
    const i = previous.teams.findIndex((t) => t.slug === 'leigh');
    previous.teams[i].teamId = TEAMS[0].id;
    const out = tmpOut();
    writeFileSync(out, JSON.stringify(previous), 'utf8');
    const { code, stdout, stderr } = run(out, '2026-10-03T05:00:00.000Z', '--leagues', 'scval');
    expect(code, stderr).toBe(1); // an uncovered team lost its row: the scheduler is told
    expect(stderr).toMatch(/WARN previous .*: 1 row\(s\) do not validate and are dropped/);
    expect(stderr).toMatch(/WARN {3}leigh: .*teamId is not the registry team's/);
    expect(stdout).toContain('BVAL  12 teams · not in this run · 11 kept as they were · 1 pending, previous row dropped (leigh)');
    expect(stdout).not.toMatch(/BVAL .*\(kept as they were\)/);
    const built = read(out);
    for (const team of TEAMS.filter((t) => t.league !== 'scval')) {
      const row = built.teams.find((t) => t.slug === team.slug)!;
      if (team.slug === 'leigh') expect(row, team.slug).toEqual(pendingPlayerStats(team));
      else expect(row, team.slug).toEqual(raw.teams.find((t) => t.slug === team.slug));
    }
  });

  it('a team whose previous row was dropped has nothing to carry: a failed fetch is an error', () => {
    const victim = TEAMS.find((t) => t.league === 'bval' && !existsSync(path.join(FIXTURE_DIR, `stats-${t.slug}.json`)))!;
    const out = tmpOut();
    buildFromFixtures(out, '2026-10-02T14:00:00.000Z');
    const previous = structuredClone(read(out)) as PlayerStatsFile;
    // A row that was read (none), but under another team's id: it does not validate, so it is dropped.
    Object.assign(previous.teams.find((t) => t.slug === victim.slug)!, { status: 'none', maxprepsTeamId: victim.id, fetchedAt: '2026-10-01T00:00:00.000Z', teamId: TEAMS[0].id });
    writeFileSync(out, JSON.stringify(previous), 'utf8');
    const { code, stderr } = run(out, '2026-10-03T05:00:00.000Z', '--leagues', 'bval');
    expect(code).toBe(1);
    expect(stderr).toMatch(new RegExp(`WARN ${victim.slug}: .*ENOENT.*\\(its previous row was dropped: nothing to carry forward\\)`));
    expect(read(out).teams.find((t) => t.slug === victim.slug)!.status).toBe('error');
  });

  it('stops without writing when the previous file is not JSON', () => {
    const out = tmpOut();
    writeFileSync(out, '{"teams": [', 'utf8');
    const { code, stderr } = run(out, '2026-10-03T05:00:00.000Z', '--leagues', 'scval');
    expect(code).toBe(1);
    expect(stderr).toMatch(/FAILED: the previous .* cannot be read: not JSON/);
    expect(readFileSync(out, 'utf8')).toBe('{"teams": [');
  });

  it('ignores a previous file from another season: nothing kept, nothing carried', () => {
    const previous = { ...structuredClone(raw), season: '25-26' };
    const out = tmpOut();
    writeFileSync(out, JSON.stringify(previous), 'utf8');
    const scoped = run(out, '2026-10-03T05:00:00.000Z', '--leagues', 'scval');
    expect(scoped.code).toBe(1); // the uncovered leagues lost their rows
    expect(scoped.stderr).toMatch(/WARN previous .* is season 25-26: its 49 row\(s\) are ignored, as if absent/);
    expect(scoped.stdout).not.toContain('kept as they were');
    const built = read(out);
    expect(built.season).toBe(raw.season);
    for (const team of TEAMS.filter((t) => t.league !== 'scval')) {
      expect(built.teams.find((t) => t.slug === team.slug), team.slug).toEqual(pendingPlayerStats(team));
    }
    // A failed fetch never carries last season's stats into this one.
    const last = structuredClone(read(out)) as PlayerStatsFile;
    const victim = TEAMS.find((t) => t.league === 'bval' && !existsSync(path.join(FIXTURE_DIR, `stats-${t.slug}.json`)))!;
    Object.assign(last.teams.find((t) => t.slug === victim.slug)!, { status: 'none', maxprepsTeamId: victim.id, fetchedAt: '2025-10-01T00:00:00.000Z' });
    last.season = '25-26';
    writeFileSync(out, JSON.stringify(last), 'utf8');
    const failed = run(out, '2026-10-03T05:00:00.000Z', '--leagues', 'bval');
    expect(failed.code).toBe(1);
    expect(read(out).teams.find((t) => t.slug === victim.slug)!.status).toBe('error');
  });

  it('rejects an unknown league, and --capture together with --fixtures', () => {
    const out = tmpOut();
    expect(run(out, '2026-10-03T05:00:00.000Z', '--leagues', 'nope').stderr).toContain('unknown league nope');
    const both = run(out, '2026-10-03T05:00:00.000Z', '--capture', path.dirname(out));
    expect(both.code).toBe(1);
    expect(both.stderr).toContain('cannot be combined with --fixtures');
  });
});
