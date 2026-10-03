/**
 * data/rosters.json: the committed file validates (one entry per registry team, all four leagues),
 * the read API serves it, and the script rebuilds every league that has captures from them. A
 * team no run has covered is status 'pending'; failures and `--leagues` scoping are per team.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { LEAGUES } from '../lib/leagues';
import {
  ROSTER_TEAM_COUNT,
  RostersPartialSchema,
  RostersSchema,
  countRosters,
  rostersContentKey,
  type Rosters,
} from '../lib/rosters-schema';
import { getRosters, getTeamRoster, sortedPlayers } from '../lib/rosters';
import { pendingRoster } from '../lib/sources/maxpreps-roster';
import { TEAMS, teamsInLeague } from '../lib/teams';
import { FIXTURE_DIR, REPO } from './helpers';

const FILE = path.join(REPO, 'data', 'rosters.json');
const text = readFileSync(FILE, 'utf8');
const raw = JSON.parse(text) as Rosters;

/**
 * The leagues whose every team has a roster capture in tests/fixtures/maxpreps (SCVAL's 15 today).
 * The rebuild checks cover exactly these; a league joins them when its captures are added.
 */
const FIXTURED = LEAGUES.map((l) => l.id).filter((id) =>
  teamsInLeague(id).every((t) => existsSync(path.join(FIXTURE_DIR, `roster-${t.slug}.html`))),
);

/** Run scripts/fetch-rosters.ts offline over the captures; returns the exit code and the output file. */
function runScript(out: string, ...extra: string[]) {
  const res = spawnSync(
    path.join(REPO, 'node_modules', '.bin', 'tsx'),
    [
      path.join(REPO, 'scripts', 'fetch-rosters.ts'),
      '--fixtures',
      FIXTURE_DIR,
      '--out',
      out,
      '--fetched-at',
      raw.fetchedAt,
      ...extra,
    ],
    { cwd: REPO, encoding: 'utf8' },
  );
  return { code: res.status, stdout: res.stdout, stderr: res.stderr };
}
const tmpOut = () => path.join(mkdtempSync(path.join(tmpdir(), 'scvalfh-rosters-')), 'rosters.json');
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as Rosters;
/** A team's entry without the stamp of when its rows were read. */
const unstamped = <T extends { fetchedAt: string | null }>(t: T) => ({ ...t, fetchedAt: null });

describe('data/rosters.json', () => {
  it('validates against the contract', () => {
    const parsed = RostersSchema.safeParse(raw);
    expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues.slice(0, 5))).toBe(true);
  });

  it('has one entry per registry team, all four leagues, in registry order, keyed by the registry id', () => {
    expect(ROSTER_TEAM_COUNT).toBe(TEAMS.length);
    expect(TEAMS).toHaveLength(43);
    expect(raw.teams.map((t) => t.slug)).toEqual(TEAMS.map((t) => t.slug));
    expect(raw.teams.map((t) => t.teamId)).toEqual(TEAMS.map((t) => t.id));
    for (const t of raw.teams) {
      const team = TEAMS.find((x) => x.slug === t.slug)!;
      expect(t.division).toBe(team.division);
      // The id the page itself reported is the registry's: a team that was read has one.
      if (t.status === 'ok' || t.status === 'empty') expect(t.maxprepsTeamId, t.slug).toBe(team.id);
    }
  });

  it('counts are recomputed from the rows, and the schema refuses a file whose counts lie', () => {
    expect(raw.counts).toEqual(countRosters(raw.teams));
    const lying = structuredClone(raw);
    lying.counts.players += 1;
    expect(RostersSchema.safeParse(lying).success).toBe(false);
  });

  it('says what each team is: read, empty, carried forward, failed, or not yet covered', () => {
    for (const t of raw.teams) {
      if (t.status === 'ok') expect(t.players.length, t.slug).toBeGreaterThan(0);
      else expect(t.players, t.slug).toEqual([]);
      if (t.status === 'pending') {
        expect(t.fetchedAt, t.slug).toBeNull();
        expect(t.athleteCount, t.slug).toBeNull();
        expect(t.error, t.slug).toBeNull();
      }
    }
    expect(raw.counts.errors).toBe(raw.teams.filter((t) => t.status === 'error' || t.status === 'carried-forward').length);
  });

  it('every SCVAL team was read, nothing carried forward, nothing failed', () => {
    for (const team of teamsInLeague('scval')) {
      const t = getTeamRoster(team.slug)!;
      expect(['ok', 'empty'], team.slug).toContain(t.status);
    }
  });

  it('is what scripts/fetch-rosters.ts builds from the captures, for every league that has them', () => {
    expect(FIXTURED).toContain('scval');
    const out = tmpOut();
    const { code, stderr } = runScript(out, '--leagues', FIXTURED.join(','));
    expect(code, stderr).toBe(0);
    const built = read(out);
    expect(RostersSchema.safeParse(built).success).toBe(true);
    for (const l of FIXTURED) {
      for (const team of teamsInLeague(l)) {
        const a = built.teams.find((t) => t.slug === team.slug)!;
        const b = raw.teams.find((t) => t.slug === team.slug)!;
        expect(unstamped(a), team.slug).toEqual(unstamped(b));
      }
    }
  });

  it('refuses a team under another team\'s id or division, a missing team, and a stranger', () => {
    const leigh = TEAMS.find((t) => t.slug === 'leigh')!;
    const foreign = structuredClone(raw);
    foreign.teams[0] = { ...foreign.teams[0], slug: leigh.slug };
    expect(RostersSchema.safeParse(foreign).success).toBe(false);
    const badId = structuredClone(raw);
    badId.teams[0].teamId = leigh.id;
    expect(RostersSchema.safeParse(badId).success).toBe(false);
    const badDivision = structuredClone(raw);
    badDivision.teams[0].division = 'mt-hamilton';
    expect(RostersSchema.safeParse(badDivision).success).toBe(false);
    const stranger = structuredClone(raw);
    stranger.teams[0].slug = 'not-a-school';
    expect(RostersSchema.safeParse(stranger).success).toBe(false);
    const short = structuredClone(raw);
    short.teams.pop();
    short.counts = countRosters(short.teams);
    expect(RostersSchema.safeParse(short).success).toBe(false);
    // ...but an older file (the 15 SCVAL teams) is still readable as the PREVIOUS file of a run.
    expect(RostersPartialSchema.safeParse(short).success).toBe(true);
    const old = structuredClone(raw);
    old.teams = old.teams.slice(0, 15);
    old.counts = countRosters(old.teams);
    expect(RostersSchema.safeParse(old).success).toBe(false);
    expect(RostersPartialSchema.safeParse(old).success).toBe(true);
  });

  it('refuses a pending team that claims anything was read', () => {
    // The committed file has no pending team, so build one: a real file with one team replaced by
    // its claim-free entry.
    const i = TEAMS.findIndex((t) => t.slug === 'st-ignatius');
    const base = structuredClone(raw);
    base.teams[i] = pendingRoster(TEAMS[i]);
    base.counts = countRosters(base.teams);
    expect(RostersSchema.safeParse(base).success).toBe(true);
    const withPlayers = structuredClone(base);
    withPlayers.teams[i].players = structuredClone(raw.teams[i].players.slice(0, 1));
    withPlayers.counts = countRosters(withPlayers.teams);
    expect(RostersSchema.safeParse(withPlayers).success).toBe(false);
    const stamped = structuredClone(base);
    stamped.teams[i].fetchedAt = raw.fetchedAt;
    expect(RostersSchema.safeParse(stamped).success).toBe(false);
    const withPageId = structuredClone(base);
    withPageId.teams[i].maxprepsTeamId = TEAMS[i].id;
    expect(RostersSchema.safeParse(withPageId).success).toBe(false);
  });

  it('never stores an invented value: a blank upstream is null', () => {
    for (const p of raw.teams.flatMap((t) => t.players)) {
      expect(p.jersey).not.toBe('');
      expect(p.grade).not.toBe(0);
      expect(p.position).not.toBe('');
      expect(p.height).not.toBe('');
    }
  });

  it('refuses a player whose grade and label disagree', () => {
    const bad = structuredClone(raw);
    const p = bad.teams.find((t) => t.slug === 'st-ignatius')!.players[0];
    p.grade = 9;
    expect(p.gradeClass).toBe('Sr.');
    expect(RostersSchema.safeParse(bad).success).toBe(false);
  });

  it('refuses an unsafe career URL scheme', () => {
    const bad = structuredClone(raw);
    bad.teams.find((t) => t.slug === 'st-ignatius')!.players[0].careerUrl = 'javascript:alert(1)';
    expect(RostersSchema.safeParse(bad).success).toBe(false);
  });
});

describe('scripts/fetch-rosters.ts --leagues, and failures scoped to a team', () => {
  it('leaves a league outside the run exactly as the previous file had it', () => {
    const out = tmpOut();
    writeFileSync(out, text, 'utf8');
    const { code, stderr, stdout } = runScript(out, '--leagues', 'scval');
    expect(code, stderr).toBe(0);
    expect(stdout).toContain('BVAL  12 teams · not in this run');
    const built = read(out);
    for (const team of TEAMS.filter((t) => t.league !== 'scval')) {
      expect(built.teams.find((t) => t.slug === team.slug), team.slug).toEqual(
        raw.teams.find((t) => t.slug === team.slug),
      );
    }
  });

  it('reads a file with no row for a team as pending, and writes the file anyway', () => {
    const out = tmpOut();
    const { code, stderr } = runScript(out, '--leagues', 'scval');
    expect(code, stderr).toBe(0);
    const built = read(out);
    expect(built.teams).toHaveLength(ROSTER_TEAM_COUNT);
    for (const team of TEAMS.filter((t) => t.league !== 'scval')) {
      expect(built.teams.find((t) => t.slug === team.slug)!.status, team.slug).toBe('pending');
    }
  });

  it('a league that fails never stops another, and a failed team carries its own rows forward', () => {
    // Only two BVAL teams have captures (a sample, not a league): the rest fail in this offline run.
    // Give one of those a previous roster so it carries forward and the others have nothing to carry.
    const captured = (slug: string) => existsSync(path.join(FIXTURE_DIR, `roster-${slug}.html`));
    const bvalAll = teamsInLeague('bval');
    const bvalTeams = bvalAll.filter((t) => !captured(t.slug));
    expect(bvalTeams.length).toBeGreaterThan(1);
    const out = tmpOut();
    const previous = structuredClone(raw);
    const donor = previous.teams.find((t) => t.slug === 'st-ignatius')!;
    const target = previous.teams.find((t) => t.slug === bvalTeams[0].slug)!;
    Object.assign(target, {
      maxprepsTeamId: target.teamId,
      status: 'ok',
      athleteCount: donor.athleteCount,
      staffCount: donor.staffCount,
      players: donor.players,
      fetchedAt: '2026-10-01T00:00:00.000Z',
    });
    // The committed file holds real rows for every team; the ones this test checks start from nothing.
    for (const team of [...bvalTeams.slice(1), ...teamsInLeague('pcal'), ...teamsInLeague('mcal')]) {
      const i = previous.teams.findIndex((t) => t.slug === team.slug);
      previous.teams[i] = pendingRoster(team);
    }
    previous.counts = countRosters(previous.teams);
    expect(RostersSchema.safeParse(previous).success).toBe(true);
    writeFileSync(out, JSON.stringify(previous), 'utf8');

    const { code, stdout } = runScript(out, '--leagues', 'scval,bval');
    expect(code).toBe(1); // a team the run covered failed: the scheduler is told
    expect(stdout).toContain('SCVAL 15 teams · 15 ok');
    expect(stdout).toContain('PCAL   7 teams · not in this run');
    const built = read(out);
    expect(RostersSchema.safeParse(built).success).toBe(true);
    // SCVAL was read in full, in the same run.
    for (const team of teamsInLeague('scval')) {
      expect(['ok', 'empty'], team.slug).toContain(built.teams.find((t) => t.slug === team.slug)!.status);
    }
    const carried = built.teams.find((t) => t.slug === target.slug)!;
    expect(carried.status).toBe('carried-forward');
    expect(carried.players).toEqual(donor.players);
    expect(carried.fetchedAt).toBe('2026-10-01T00:00:00.000Z');
    expect(carried.error).toBeTruthy();
    for (const team of bvalTeams.slice(1)) {
      const t = built.teams.find((x) => x.slug === team.slug)!;
      expect(t.status, team.slug).toBe('error');
      expect(t.players, team.slug).toEqual([]);
    }
    // A BVAL team that does have a capture is read in the same run.
    for (const team of bvalAll.filter((t) => captured(t.slug))) {
      expect(['ok', 'empty'], team.slug).toContain(built.teams.find((x) => x.slug === team.slug)!.status);
    }
    for (const team of [...teamsInLeague('pcal'), ...teamsInLeague('mcal')]) {
      expect(built.teams.find((x) => x.slug === team.slug)!.status, team.slug).toBe('pending');
    }
  });

  it('a failed fetch keeps an empty roster as empty: MaxPreps lists no players is still what was read', () => {
    const out = tmpOut();
    const previous = structuredClone(raw);
    // A team whose last read was empty (no players), and one never read at all (error).
    const empty = TEAMS.find((t) => t.slug === 'del-mar')!;
    const never = TEAMS.find((t) => t.slug === 'sobrato')!;
    const at = (slug: string) => previous.teams.findIndex((t) => t.slug === slug);
    previous.teams[at(empty.slug)] = {
      ...pendingRoster(empty),
      maxprepsTeamId: empty.id,
      status: 'empty',
      athleteCount: 0,
      staffCount: 1,
      fetchedAt: '2026-10-01T00:00:00.000Z',
    };
    previous.teams[at(never.slug)] = {
      ...pendingRoster(never),
      status: 'error',
      error: 'earlier failure',
    };
    previous.counts = countRosters(previous.teams);
    writeFileSync(out, JSON.stringify(previous), 'utf8');

    // An empty fixtures directory: every team of the run fails to read.
    const none = mkdtempSync(path.join(tmpdir(), 'scvalfh-rosters-none-'));
    const res = spawnSync(
      path.join(REPO, 'node_modules', '.bin', 'tsx'),
      [path.join(REPO, 'scripts', 'fetch-rosters.ts'), '--fixtures', none, '--leagues', 'bval', '--out', out, '--fetched-at', '2026-10-04T00:00:00.000Z'],
      { cwd: REPO, encoding: 'utf8' },
    );
    expect(res.status, res.stderr).toBe(1);
    const built = read(out);
    const kept = built.teams.find((t) => t.slug === empty.slug)!;
    const before = previous.teams[at(empty.slug)];
    expect(kept.status).toBe('carried-forward');
    expect(kept.players).toEqual([]);
    expect(kept.athleteCount).toBe(before.athleteCount);
    expect(kept.fetchedAt).toBe(before.fetchedAt);
    expect(kept.error).toMatch(/ENOENT/);
    // Nothing to carry: still an error.
    expect(built.teams.find((t) => t.slug === never.slug)!.status).toBe('error');
  });

  it('leaves the file as it was when only fetchedAt (and failure text) would change', () => {
    const out = tmpOut();
    const first = runScript(out, '--leagues', 'scval', '--fetched-at', '2026-10-04T00:00:00.000Z');
    expect(first.code, first.stderr).toBe(0);
    const bytes = readFileSync(out, 'utf8');
    const second = runScript(out, '--leagues', 'scval', '--fetched-at', '2026-10-05T00:00:00.000Z');
    expect(second.code, second.stderr).toBe(0);
    expect(second.stdout).toContain('left as it was');
    expect(readFileSync(out, 'utf8')).toBe(bytes);
  });

  it('rostersContentKey ignores fetchedAt and error text, but not status or rows', () => {
    const a = structuredClone(raw);
    const b = structuredClone(raw);
    b.fetchedAt = '2030-01-01T00:00:00.000Z';
    for (const t of b.teams) if (t.fetchedAt) t.fetchedAt = '2030-01-01T00:00:00.000Z';
    expect(rostersContentKey(a)).toBe(rostersContentKey(b));
    const failed = (msg: string) => {
      const f = structuredClone(raw);
      Object.assign(f.teams[0], { status: 'carried-forward', error: msg });
      return f;
    };
    expect(rostersContentKey(failed('timeout after 15003 ms'))).toBe(rostersContentKey(failed('timeout after 15011 ms')));
    expect(rostersContentKey(failed('x'))).not.toBe(rostersContentKey(a));
    const edited = structuredClone(raw);
    edited.teams[0].players[0].jersey = '99';
    expect(rostersContentKey(edited)).not.toBe(rostersContentKey(a));
  });

  it('rejects an unknown league, and --capture together with --fixtures', () => {
    const out = tmpOut();
    const unknown = runScript(out, '--leagues', 'nope');
    expect(unknown.code).toBe(1);
    expect(unknown.stderr).toContain('unknown league nope');
    const both = runScript(out, '--capture', path.dirname(out));
    expect(both.code).toBe(1);
    expect(both.stderr).toContain('cannot be combined with --fixtures');
  });
});

describe('lib/rosters.ts', () => {
  it('serves the bundled file', () => {
    expect(getRosters().counts).toEqual(raw.counts);
    expect(getTeamRoster('st-ignatius')!.players.length).toBe(23);
  });

  it('sorts a numbered roster by jersey, blanks last, and a names-only roster by last name', () => {
    const si = sortedPlayers(getTeamRoster('st-ignatius')!).map((p) => p.jersey);
    expect(si.slice(0, 3)).toEqual(['1', '2', '3']);
    const mitty = sortedPlayers(getTeamRoster('mitty')!);
    expect(mitty.at(-1)!.jersey).toBeNull();
    expect(mitty[0].jersey).not.toBeNull();
    const lg = sortedPlayers(getTeamRoster('los-gatos')!).map((p) => p.lastName ?? p.fullName);
    expect([...lg].sort((a, b) => a.localeCompare(b))).toEqual(lg);
  });
});
