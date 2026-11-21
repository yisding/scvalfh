/**
 * data/field-hockey/rosters.json: the committed file validates (one entry per registry team, all nine leagues and the independents),
 * the read API serves it, and the script rebuilds every league that has captures from them. A
 * team no run has covered is status 'pending'; failures and `--leagues` scoping are per team.
 */

import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
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
} from '../lib/players/rosters-schema';
import { getRosters, getTeamRoster, sortedPlayers } from '../lib/players/rosters';
import { pendingRoster } from '../lib/sources/maxpreps-roster';
import { JV_SPORT_SEASON_ID, SPORT_SEASON_ID } from '../lib/season';
import { TEAMS, teamsInLeague } from '../lib/teams';
import { rosterFailureAnnotations } from '../scripts/fetch-rosters';
import { FIXTURE_DIR, REPO, runScript } from './helpers';

const FILE = path.join(REPO, 'data', 'field-hockey', 'rosters.json');
const text = readFileSync(FILE, 'utf8');
const raw = JSON.parse(text) as Rosters;
/**
 * data/field-hockey/rosters.json as it stood when every SCVAL row was the 2026-10-02 captures' (read 2026-10-07): the file
 * the two rebuild checks below hold the script to. The live file has since been re-read (2026-11-13) and will
 * be again, so its SCVAL rows no longer equal the captures; the captures, and this copy, stay as they were.
 */
const golden = JSON.parse(readFileSync(path.join(FIXTURE_DIR, 'rosters-from-captures.json'), 'utf8')) as Rosters;

/**
 * The leagues whose every team has a roster capture in tests/fixtures/maxpreps (SCVAL's 15 today).
 * The rebuild checks cover exactly these; a league joins them when its captures are added.
 */
const FIXTURED = LEAGUES.map((l) => l.id).filter((id) =>
  teamsInLeague(id).every((t) => existsSync(path.join(FIXTURE_DIR, `roster-${t.slug}.html`))),
);

/** Run scripts/fetch-rosters.ts offline over the captures, writing to `out`. */
function fetchRosters(out: string, ...extra: string[]) {
  return runScript('scripts/fetch-rosters.ts', ['--fixtures', FIXTURE_DIR, '--out', out, '--fetched-at', golden.fetchedAt, ...extra]);
}
/** Whether a team belongs to a league whose every team has a capture. */
const fixtured = (t: { slug: string }) => FIXTURED.includes(TEAMS.find((x) => x.slug === t.slug)!.league);
const tmpOut = () => path.join(mkdtempSync(path.join(tmpdir(), 'scvalfh-rosters-')), 'rosters.json');
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as Rosters;
/** A team's entry without the stamp of when its rows were read. */
const unstamped = <T extends { fetchedAt: string | null }>(t: T) => ({ ...t, fetchedAt: null });

describe('data/field-hockey/rosters.json', () => {
  it('validates against the contract', () => {
    const parsed = RostersSchema.safeParse(raw);
    expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues.slice(0, 5))).toBe(true);
  });

  it('has one entry per registry team, all nine leagues and the independents, in registry order, keyed by the registry id', () => {
    expect(ROSTER_TEAM_COUNT).toBe(TEAMS.length);
    expect(TEAMS).toHaveLength(102);
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
    const { status, stderr } = fetchRosters(out, '--leagues', FIXTURED.join(','));
    expect(status, stderr).toBe(0);
    const built = read(out);
    expect(RostersSchema.safeParse(built).success).toBe(true);
    for (const l of FIXTURED) {
      for (const team of teamsInLeague(l)) {
        const a = built.teams.find((t) => t.slug === team.slug)!;
        const b = golden.teams.find((t) => t.slug === team.slug)!;
        expect(unstamped(a), team.slug).toEqual(unstamped(b));
      }
    }
    // The file around the rows: the same season and source (notes included), and the same
    // counts over the fixtured leagues' teams. The other leagues are pending in a build with no
    // previous file, so the file-wide counts are compared by the build below.
    expect(built.season).toBe(golden.season);
    expect(built.source).toEqual(golden.source);
    expect(countRosters(built.teams.filter(fixtured))).toEqual(countRosters(golden.teams.filter(fixtured)));
  });

  it('is, top level and counts included, what the script rebuilds over the committed file', () => {
    // The file built from the captures as the previous one, with a fixtured team's row edited so the run
    // cannot leave the file as it was: the rebuild re-reads that team from its capture, keeps every other
    // league's rows, and must come out as that file apart from when it was read.
    const out = tmpOut();
    const previous = structuredClone(golden);
    const edited = previous.teams.find((t) => fixtured(t) && t.players.length)!;
    edited.players[0].jersey = edited.players[0].jersey === '99' ? '98' : '99';
    writeFileSync(out, JSON.stringify(previous), 'utf8');
    const { status, stderr, stdout } = fetchRosters(out, '--leagues', FIXTURED.join(','), '--fetched-at', '2030-01-01T00:00:00.000Z');
    expect(status, stderr).toBe(0);
    expect(stdout).toContain('wrote ');
    const built = read(out);
    const withoutStamps = (f: Rosters) => ({ ...f, fetchedAt: null, teams: f.teams.map(unstamped) });
    expect(withoutStamps(built)).toEqual(withoutStamps(golden));
    expect(built.counts).toEqual(golden.counts);
    expect(built.fetchedAt).toBe('2030-01-01T00:00:00.000Z');
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
    const { status, stderr, stdout } = fetchRosters(out, '--leagues', 'scval');
    expect(status, stderr).toBe(0);
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
    const { status, stderr } = fetchRosters(out, '--leagues', 'scval');
    expect(status, stderr).toBe(0);
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
    for (const team of [...bvalTeams.slice(1), ...teamsInLeague('pcal'), ...teamsInLeague('mcal'), ...teamsInLeague('eal')]) {
      const i = previous.teams.findIndex((t) => t.slug === team.slug);
      previous.teams[i] = pendingRoster(team);
    }
    previous.counts = countRosters(previous.teams);
    expect(RostersSchema.safeParse(previous).success).toBe(true);
    writeFileSync(out, JSON.stringify(previous), 'utf8');

    const { status, stdout } = fetchRosters(out, '--leagues', 'scval,bval');
    expect(status).toBe(1); // a team the run covered failed: the scheduler is told
    expect(stdout).toContain('SCVAL 15 teams · 15 ok');
    expect(stdout).toContain('PCAL   7 teams · not in this run');
    expect(stdout).toContain('EAL    6 teams · not in this run');
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
    for (const team of [...teamsInLeague('pcal'), ...teamsInLeague('mcal'), ...teamsInLeague('eal')]) {
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
    const res = runScript('scripts/fetch-rosters.ts', ['--fixtures', none, '--leagues', 'bval', '--out', out, '--fetched-at', '2026-10-04T00:00:00.000Z']);
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

  describe("a page MaxPreps serves for another season (Castilleja girls JV soccer, 2026-11-16 on)", () => {
    const team = teamsInLeague('scval').find((t) => t.slug === 'palo-alto')!;
    /**
     * The captures, with this team's page (its count and every row) for another sport season. For the JV
     * level they are saved as JV captures, every other page moved to the JV season.
     */
    function otherSeasonFixtures(level: 'varsity' | 'jv'): string {
      const dir = mkdtempSync(path.join(tmpdir(), 'scvalfh-rosters-other-season-'));
      const prefix = level === 'jv' ? 'jv-roster' : 'roster';
      for (const f of readdirSync(FIXTURE_DIR).filter((n) => /^roster-.*\.html$/.test(n))) {
        const html = readFileSync(path.join(FIXTURE_DIR, f), 'utf8');
        const out = path.join(dir, f.replace(/^roster/, prefix));
        if (level === 'jv') writeFileSync(out, html.split(SPORT_SEASON_ID).join(JV_SPORT_SEASON_ID), 'utf8');
        else copyFileSync(path.join(FIXTURE_DIR, f), out);
      }
      const file = path.join(dir, `${prefix}-${team.slug}.html`);
      const season = level === 'jv' ? JV_SPORT_SEASON_ID : SPORT_SEASON_ID;
      expect(readFileSync(file, 'utf8')).toContain(season);
      writeFileSync(file, readFileSync(file, 'utf8').split(season).join('another-season'), 'utf8');
      return dir;
    }
    function runWith(previousRow: unknown, level: 'varsity' | 'jv' = 'varsity') {
      const out = tmpOut();
      const previous = structuredClone(golden) as unknown as { teams: unknown[]; counts: unknown };
      const teams = previous.teams as Rosters['teams'];
      teams[teams.findIndex((t) => t.slug === team.slug)] = previousRow as Rosters['teams'][number];
      previous.counts = countRosters(teams);
      writeFileSync(out, JSON.stringify(previous), 'utf8');
      const res = runScript('scripts/fetch-rosters.ts', [
        '--fixtures', otherSeasonFixtures(level), '--leagues', 'scval', '--out', out,
        '--fetched-at', '2026-11-21T00:00:00.000Z', ...(level === 'jv' ? ['--level', 'jv'] : []),
      ]);
      const built = read(out);
      expect(RostersSchema.safeParse(built).success).toBe(true);
      return { res, row: built.teams.find((t) => t.slug === team.slug)! };
    }

    it('is an empty roster with a warning, not a failure, when nothing was read for this season', () => {
      const { res, row } = runWith(pendingRoster(team));
      expect(res.status, res.stdout + res.stderr).toBe(0);
      expect(row.status).toBe('empty');
      expect(row.players).toEqual([]);
      expect(row.error).toBeNull();
      expect(row.maxprepsTeamId).toBe(team.id);
      expect(row.fetchedAt).toBe('2026-11-21T00:00:00.000Z');
      expect(row.warnings).toEqual(['MaxPreps has no roster page for this season (the URL serves sportSeasonId another-season)']);
    });

    it('says JV in the warning on a JV run', () => {
      const { res, row } = runWith(pendingRoster(team), 'jv');
      expect(res.status, res.stdout + res.stderr).toBe(0);
      expect(row.status).toBe('empty');
      expect(row.warnings).toEqual(['MaxPreps has no JV roster page for this season (the URL serves sportSeasonId another-season)']);
    });

    it("still fails, carrying this season's players forward, when they were read before", () => {
      const before = golden.teams.find((t) => t.slug === team.slug)!;
      expect(before.players.length).toBeGreaterThan(0);
      const { res, row } = runWith(before);
      expect(res.status).toBe(1);
      expect(row.status).toBe('carried-forward');
      expect(row.players).toEqual(before.players);
      expect(row.error).toMatch(/sportSeasonId another-season, expected/);
    });

    it('still fails when the previous row was dropped as invalid: what it held is unknown', () => {
      const before = golden.teams.find((t) => t.slug === team.slug)!;
      // Another registry division: the row no longer validates, so the salvage drops it.
      const stale = { ...before, division: 'santa-teresa' };
      const { res, row } = runWith(stale);
      expect(res.status).toBe(1);
      expect(row.status).toBe('error');
      expect(row.players).toEqual([]);
      expect(row.error).toMatch(/sportSeasonId another-season, expected/);
    });
  });

  it('leaves the file as it was when only fetchedAt (and failure text) would change', () => {
    const out = tmpOut();
    const first = fetchRosters(out, '--leagues', 'scval', '--fetched-at', '2026-10-04T00:00:00.000Z');
    expect(first.status, first.stderr).toBe(0);
    const bytes = readFileSync(out, 'utf8');
    const second = fetchRosters(out, '--leagues', 'scval', '--fetched-at', '2026-10-05T00:00:00.000Z');
    expect(second.status, second.stderr).toBe(0);
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
    const unknown = fetchRosters(out, '--leagues', 'nope');
    expect(unknown.status).toBe(1);
    expect(unknown.stderr).toContain('unknown league nope');
    const both = fetchRosters(out, '--capture', path.dirname(out));
    expect(both.status).toBe(1);
    expect(both.stderr).toContain('cannot be combined with --fixtures');
  });
});

describe('scripts/fetch-rosters.ts over a previous file that is not valid whole', () => {
  /** The script offline over `fixtures` (default: the captures), with `previous` as the file it updates. */
  function runOver(previous: string, leagues: string, fixtures = FIXTURE_DIR) {
    const out = tmpOut();
    writeFileSync(out, previous, 'utf8');
    const res = runScript('scripts/fetch-rosters.ts', ['--fixtures', fixtures, '--leagues', leagues, '--out', out, '--fetched-at', '2026-10-04T00:00:00.000Z']);
    return { ...res, out };
  }
  const emptyDir = () => mkdtempSync(path.join(tmpdir(), 'scvalfh-rosters-none-'));
  const at = (file: Rosters, slug: string) => file.teams.findIndex((t) => t.slug === slug);

  it('drops only the stale row (one BVAL division flipped), names it, and keeps every other team', () => {
    // Before: the whole file was refused and all 28 rows outside the run went to pending.
    const previous = structuredClone(raw);
    previous.teams[at(previous, 'leigh')].division = 'santa-teresa';
    const { status, stdout, stderr, out } = runOver(JSON.stringify(previous), 'scval');
    // An uncovered team lost its row: the scheduler is told, and the file is still written.
    expect(status, stderr).toBe(1);
    expect(stderr).toMatch(/WARN previous .*: 1 row\(s\) do not validate and are dropped/);
    expect(stderr).toMatch(/WARN {3}leigh: .*not the registry team's/);
    expect(stdout).toContain('BVAL  12 teams · not in this run · 11 kept as they were · 1 pending, previous row dropped (leigh)');
    expect(stdout).not.toMatch(/BVAL .*\(kept as they were\)/);
    expect(stdout).toContain('PCAL   7 teams · not in this run (kept as they were)');
    const built = read(out);
    expect(RostersSchema.safeParse(built).success).toBe(true);
    for (const team of TEAMS.filter((t) => t.league !== 'scval')) {
      const row = built.teams.find((t) => t.slug === team.slug)!;
      if (team.slug === 'leigh') expect(row, team.slug).toEqual(pendingRoster(team));
      else expect(row, team.slug).toEqual(raw.teams.find((t) => t.slug === team.slug));
    }
  });

  it('a team whose previous row was dropped has nothing to carry: a failed fetch is an error, the others carry', () => {
    const previous = structuredClone(raw);
    previous.teams[at(previous, 'leigh')].teamId = TEAMS[0].id;
    // Every BVAL team fails to read (no captures at all).
    const { status, stderr, out } = runOver(JSON.stringify(previous), 'bval', emptyDir());
    expect(status).toBe(1);
    expect(stderr).toMatch(/WARN leigh: .*ENOENT.*\(its previous row was dropped: nothing to carry forward\)/);
    const built = read(out);
    expect(built.teams[at(built, 'leigh')].status).toBe('error');
    for (const team of teamsInLeague('bval').filter((t) => t.slug !== 'leigh')) {
      expect(built.teams[at(built, team.slug)].status, team.slug).toBe('carried-forward');
    }
  });

  it('keeps every row when only the counts lie, says so, and rewrites the file with true counts', () => {
    // Over the file built from the captures, so the SCVAL rows the run re-reads are the ones it holds.
    const previous = structuredClone(golden);
    previous.counts.players += 1;
    const { status, stderr, out } = runOver(JSON.stringify(previous), 'scval');
    expect(status, stderr).toBe(0);
    expect(stderr).toMatch(/does not validate as a whole \(.*counts do not match the rows/);
    const built = read(out);
    expect(built.counts).toEqual(golden.counts);
    for (const team of TEAMS.filter((t) => t.league !== 'scval')) {
      expect(built.teams[at(built, team.slug)], team.slug).toEqual(golden.teams[at(golden, team.slug)]);
    }
  });

  it('stops without writing when the previous file is not JSON', () => {
    for (const text of ['{"teams": [', '<!doctype html>']) {
      const { status, stdout, stderr, out } = runOver(text, 'scval');
      expect(status, stdout).toBe(1);
      expect(stderr).toMatch(/FAILED: the previous .* cannot be read: not JSON/);
      expect(stderr).toContain('Nothing written');
      expect(readFileSync(out, 'utf8')).toBe(text);
    }
  });

  it('ignores a previous file from another season: nothing kept, nothing carried', () => {
    const previous = { ...structuredClone(raw), season: '25-26' };
    const scoped = runOver(JSON.stringify(previous), 'scval');
    expect(scoped.status).toBe(1); // the uncovered leagues lost their rows
    expect(scoped.stderr).toMatch(/WARN previous .* is season 25-26: its 102 row\(s\) are ignored, as if absent/);
    expect(scoped.stdout).not.toContain('kept as they were');
    const built = read(scoped.out);
    expect(built.season).toBe(raw.season);
    for (const team of TEAMS.filter((t) => t.league !== 'scval')) {
      expect(built.teams[at(built, team.slug)], team.slug).toEqual(pendingRoster(team));
    }
    // A failed fetch never carries last season's roster into this one.
    const failed = runOver(JSON.stringify(previous), 'bval', emptyDir());
    expect(failed.status).toBe(1);
    for (const team of teamsInLeague('bval')) {
      expect(read(failed.out).teams[at(raw, team.slug)].status, team.slug).toBe('error');
    }
  });
});

describe('lib/players/rosters.ts', () => {
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

describe('scripts/fetch-rosters.ts in a GitHub Actions run: one warning annotation per team that failed', () => {
  const team = (slug: string) => TEAMS.find((t) => t.slug === slug)!;
  const row = (slug: string, status: 'ok' | 'carried-forward' | 'error', error: string | null) => ({
    ...pendingRoster(team(slug)),
    status,
    error,
  });

  it('names each failed team the run covered, escaped as a workflow command, and nothing else', () => {
    const scval = teamsInLeague('scval');
    const other = TEAMS.find((t) => t.league !== 'scval')!;
    const lines = rosterFailureAnnotations(
      [
        row(scval[0].slug, 'carried-forward', 'Layla T: height is "6\'0"" in athleteData:\nbut "6\'0" in the table'),
        row(scval[1].slug, 'error', 'HTTP 403 (100%)'),
        row(scval[2].slug, 'ok', null),
        // Outside a --leagues run: its previous failure is not this run's.
        row(other.slug, 'error', 'an earlier failure'),
      ] as never,
      ['scval'],
      false,
    );
    expect(lines).toEqual([
      `::warning title=${scval[0].name} roster not read::${scval[0].slug}: Layla T: height is "6'0"" in athleteData:%0Abut "6'0" in the table (its previous rows are kept)`,
      `::warning title=${scval[1].name} roster not read::${scval[1].slug}: HTTP 403 (100%25) (it has no roster)`,
    ]);
    expect(rosterFailureAnnotations([row(scval[1].slug, 'error', 'x')] as never, null, true)[0]).toContain('JV roster not read');
  });

  it('prints them only under GITHUB_ACTIONS, one per failed team', () => {
    const out = tmpOut();
    writeFileSync(out, JSON.stringify(golden), 'utf8');
    // An empty fixtures directory: every PCAL team fails to read.
    const none = mkdtempSync(path.join(tmpdir(), 'scvalfh-rosters-none-'));
    const args = ['--fixtures', none, '--leagues', 'pcal', '--out', out, '--fetched-at', '2026-11-21T00:00:00.000Z', '--dry-run'];
    const inActions = runScript('scripts/fetch-rosters.ts', args, { env: { ...process.env, GITHUB_ACTIONS: 'true' } });
    const warnings = inActions.stdout.split('\n').filter((l) => l.startsWith('::warning '));
    expect(warnings).toHaveLength(teamsInLeague('pcal').length);
    for (const w of warnings) expect(w).toMatch(/^::warning title=[^:]+ roster not read::[a-z0-9-]+: /);
    const local = runScript('scripts/fetch-rosters.ts', args, { env: { ...process.env, GITHUB_ACTIONS: '' } });
    expect(local.stdout).not.toContain('::warning');
  });
});
