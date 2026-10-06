/**
 * BVAL, PCAL and MCAL read exactly as SCVAL does: the roster page and the player-stats rollup are
 * the same MaxPreps pages in every league. The captures here (2026-10-03, provenance in
 * tests/fixtures/maxpreps/player-captures.json) are a deliberate sample of the other three leagues,
 * not all 28 teams:
 *
 *   rosters   leigh (BVAL) full fields · greenfield (PCAL) sparse · del-mar (BVAL) and monterey
 *             (PCAL) empty · stevenson (PCAL) full fields + a soft-deleted row · university-sf
 *             (MCAL) 3 soft-deleted rows, jersey gaps · marin-catholic (MCAL) half the grades blank
 *   stats     leigh (BVAL), stevenson (PCAL), university-sf and marin-catholic (MCAL): a rollup each
 *             berkeley (MCAL), del-mar (BVAL), monterey (PCAL): the 400 "no data" envelope, for a
 *                 team with a roster and for two with none
 *
 * They are NOT a complete league, so tests/rosters-file.test.ts's rebuild check (which needs every
 * team of a league) leaves these leagues alone. The checks below cover the sample instead: the
 * parsers read the captures, the scripts build exactly what the parsers read (into a temp file
 * pinned to the captures, never the committed data/, which a refresh rewrites), the scripts' offline
 * mode handles a league whose captures are partly missing (per-team failure, carried forward, SCVAL
 * untouched), and the committed files hold only facts that stay true across refreshes. The
 * committed player stats are what the scheduled refresh just wrote and tests before committing, so
 * any status the schema allows passes there ('error' and 'pending' are honest states); coverage is
 * asserted on the files built from the captures.
 */

import { copyFileSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { PlayerStatsFileSchema, type PlayerStatsFile } from '../lib/player-stats-schema';
import { RostersSchema, type Rosters } from '../lib/rosters-schema';
import { parsePlayerStats, joinToRoster } from '../lib/sources/maxpreps-player-stats';
import { parseRosterPage, parseRosterTable } from '../lib/sources/maxpreps-roster';
import { TEAMS, getTeamBySlug } from '../lib/teams';
import { FIXTURE_DIR, REPO, runScript } from './helpers';

const ROSTER_SAMPLE = ['leigh', 'greenfield', 'del-mar', 'stevenson', 'monterey', 'university-sf', 'marin-catholic'];
const STATS_SAMPLE = ['leigh', 'stevenson', 'university-sf', 'marin-catholic', 'berkeley', 'del-mar', 'monterey'];

/** The committed files: only facts that hold across refreshes are asserted against them. */
const rostersFile = JSON.parse(readFileSync(path.join(REPO, 'data', 'rosters.json'), 'utf8')) as Rosters;
const statsFile = JSON.parse(readFileSync(path.join(REPO, 'data', 'player-stats.json'), 'utf8')) as PlayerStatsFile;

const html = (slug: string) => readFileSync(path.join(FIXTURE_DIR, `roster-${slug}.html`), 'utf8');
const statsRaw = (slug: string): unknown =>
  JSON.parse(readFileSync(path.join(FIXTURE_DIR, `stats-${slug}.json`), 'utf8')) as unknown;
const parseRoster = (slug: string) =>
  parseRosterPage(html(slug), { expectedTeamId: getTeamBySlug(slug)!.id, url: slug });
const parseStats = (slug: string) =>
  parsePlayerStats(statsRaw(slug), { expectedTeamId: getTeamBySlug(slug)!.id });
const leagueOf = (slug: string) => getTeamBySlug(slug)!.league;

// The EAL has no sampled capture: its six teams are in the run and fail like any team without one.
const OTHERS = 'bval,pcal,mcal,eal';
/**
 * The leagues these offline runs cover. SCVAL and the four Southern California leagues (added
 * 2026-10-06) are outside them: their rows are kept exactly as the previous file held them, or
 * 'pending' with no previous file.
 */
const IN_RUN = new Set(OTHERS.split(','));
const outsideRun = (slug: string) => !IN_RUN.has(leagueOf(slug));

/** A directory holding only the sampled captures. */
function sampleDir(prefix: 'roster' | 'stats') {
  const dir = mkdtempSync(path.join(tmpdir(), `scvalfh-sample-${prefix}-`));
  const [slugs, ext] = prefix === 'roster' ? [ROSTER_SAMPLE, 'html'] : [STATS_SAMPLE, 'json'];
  for (const s of slugs) copyFileSync(path.join(FIXTURE_DIR, `${prefix}-${s}.${ext}`), path.join(dir, `${prefix}-${s}.${ext}`));
  return dir;
}
const tmpFile = (name: string) => path.join(mkdtempSync(path.join(tmpdir(), 'scvalfh-sample-out-')), name);

/**
 * The two files as the scripts build them from the sampled captures alone (no previous file, so
 * every team without a capture is an error and SCVAL is pending). Both scripts exit 1 for those
 * failed teams and still write the file. Built once; this is what the sampled checks compare to,
 * so none of them depends on what the scheduled refresh last committed.
 */
let pinnedMemo: { rosters: Rosters; rostersPath: string; stats: PlayerStatsFile } | null = null;
function pinned() {
  if (pinnedMemo) return pinnedMemo;
  const rostersPath = tmpFile('rosters.json');
  const r = runScript('scripts/fetch-rosters.ts', ['--fixtures', sampleDir('roster'), '--leagues', OTHERS, '--out', rostersPath, '--fetched-at', '2026-10-04T00:00:00.000Z']);
  if (r.status !== 1) throw new Error(`fetch-rosters: expected exit 1, got ${r.status}: ${r.stderr}`);
  const statsPath = tmpFile('player-stats.json');
  const st = runScript('scripts/fetch-player-stats.ts', ['--fixtures', sampleDir('stats'), '--leagues', OTHERS, '--rosters', rostersPath, '--out', statsPath, '--fetched-at', '2026-10-04T00:00:00.000Z']);
  if (st.status !== 1) throw new Error(`fetch-player-stats: expected exit 1, got ${st.status}: ${st.stderr}`);
  pinnedMemo = {
    rostersPath,
    rosters: RostersSchema.parse(JSON.parse(readFileSync(rostersPath, 'utf8')) as unknown),
    stats: PlayerStatsFileSchema.parse(JSON.parse(readFileSync(statsPath, 'utf8')) as unknown),
  };
  return pinnedMemo;
}
const rosterRow = (slug: string) => pinned().rosters.teams.find((t) => t.slug === slug)!;
const statsRow = (slug: string) => pinned().stats.teams.find((t) => t.slug === slug)!;

describe('the sample covers the three other leagues', () => {
  it('has captures for BVAL, PCAL and MCAL teams only, none of them SCVAL', () => {
    expect(new Set(ROSTER_SAMPLE.map(leagueOf))).toEqual(new Set(['bval', 'pcal', 'mcal']));
    expect(new Set(STATS_SAMPLE.map(leagueOf))).toEqual(new Set(['bval', 'pcal', 'mcal']));
    const files = readdirSync(FIXTURE_DIR);
    for (const s of ROSTER_SAMPLE) expect(files, s).toContain(`roster-${s}.html`);
    for (const s of STATS_SAMPLE) expect(files, s).toContain(`stats-${s}.json`);
  });
});

describe('roster pages of BVAL, PCAL and MCAL teams', () => {
  const PLAYERS: Record<string, { players: number; deleted: number }> = {
    leigh: { players: 20, deleted: 1 },
    greenfield: { players: 12, deleted: 0 },
    'del-mar': { players: 0, deleted: 0 },
    stevenson: { players: 14, deleted: 1 },
    monterey: { players: 0, deleted: 0 },
    'university-sf': { players: 18, deleted: 3 },
    'marin-catholic': { players: 20, deleted: 0 },
  };

  it('parse under the registry team id, with the soft-deleted rows dropped and counted', () => {
    for (const [slug, want] of Object.entries(PLAYERS)) {
      const page = parseRoster(slug);
      expect(page.teamId, slug).toBe(getTeamBySlug(slug)!.id);
      expect(page.players.length, slug).toBe(want.players);
      expect(page.athleteCount, slug).toBe(want.players);
      expect(page.deletedRows, slug).toBe(want.deleted);
      if (want.deleted) {
        expect(page.warnings, slug).toContain(
          `dropped ${want.deleted} soft-deleted row${want.deleted === 1 ? '' : 's'} (isDeleted)`,
        );
      } else {
        expect(page.warnings, slug).toEqual([]);
      }
    }
  });

  it('read an empty roster (Del Mar, Monterey) as no players and no table, not as a failure', () => {
    for (const slug of ['del-mar', 'monterey']) {
      expect(parseRosterTable(html(slug)), slug).toBeNull();
      const page = parseRoster(slug);
      expect(page.players, slug).toEqual([]);
      expect(page.staffCount, slug).not.toBeNull();
    }
  });

  it('agree row by row with the rendered table (the cross-check ran on every page)', () => {
    for (const slug of ROSTER_SAMPLE) {
      const page = parseRoster(slug);
      if (!page.players.length) continue;
      const table = parseRosterTable(html(slug))!;
      expect(table.map((r) => r.name).sort(), slug).toEqual(page.players.map((p) => p.fullName).sort());
    }
  });

  it('keep exactly what the coach entered: blanks are null, never guessed', () => {
    const leigh = parseRoster('leigh').players;
    expect(leigh.every((p) => p.grade !== null && p.position !== null && p.jersey !== null)).toBe(true);
    expect(leigh.every((p) => p.height === null)).toBe(true);

    // Greenfield publishes names, and a jersey for half the team.
    const greenfield = parseRoster('greenfield').players;
    expect(greenfield.every((p) => p.grade === null && p.position === null && p.height === null)).toBe(true);
    expect(greenfield.filter((p) => p.jersey !== null)).toHaveLength(6);

    // Marin Catholic: ten of twenty have a grade, and so a number and a position, never more.
    const mc = parseRoster('marin-catholic').players;
    expect(mc.filter((p) => p.grade !== null)).toHaveLength(10);
    expect(mc.filter((p) => p.jersey !== null)).toHaveLength(10);

    // University SF: grades and positions for all, a number for 16.
    const usf = parseRoster('university-sf').players;
    expect(usf.filter((p) => p.grade !== null)).toHaveLength(18);
    expect(usf.filter((p) => p.jersey !== null)).toHaveLength(16);

    for (const slug of ROSTER_SAMPLE) {
      for (const p of parseRoster(slug).players) {
        expect(p.careerId, `${slug} ${p.fullName}`).not.toBeNull();
        expect(p.careerUrl, `${slug} ${p.fullName}`).toMatch(/^https:\/\/www\.maxpreps\.com\//);
        if (p.grade !== null) expect([9, 10, 11, 12]).toContain(p.grade);
      }
    }
  });
});

describe('data/rosters.json, rebuilt from the sampled captures', () => {
  it('is exactly what the parser reads: the script adds nothing and drops nothing', () => {
    for (const slug of ROSTER_SAMPLE) {
      const page = parseRoster(slug);
      const row = rosterRow(slug);
      expect(row.status, slug).toBe(page.players.length ? 'ok' : 'empty');
      expect(row.players, slug).toEqual(page.players);
      expect(row.athleteCount, slug).toBe(page.athleteCount);
      expect(row.staffCount, slug).toBe(page.staffCount);
      expect(row.deletedRows, slug).toBe(page.deletedRows);
      expect(row.warnings, slug).toEqual(page.warnings);
    }
  });

  it('marks every team without a capture an error, and SCVAL and SoCal (outside the run) pending', () => {
    for (const t of pinned().rosters.teams) {
      if (outsideRun(t.slug)) expect(t.status, t.slug).toBe('pending');
      else if (!ROSTER_SAMPLE.includes(t.slug)) expect(t.status, t.slug).toBe('error');
    }
  });
});

describe('the committed data/rosters.json', () => {
  it('has every other league covered: each team read at least once (ok, empty or carried forward), none pending', () => {
    for (const t of TEAMS.filter((x) => x.league !== 'scval')) {
      const row = rostersFile.teams.find((r) => r.slug === t.slug)!;
      expect(['ok', 'empty', 'carried-forward'], t.slug).toContain(row.status);
      expect(row.maxprepsTeamId, t.slug).toBe(t.id);
    }
    expect(RostersSchema.safeParse(rostersFile).success).toBe(true);
  });
});

describe('player-stats rollups of BVAL, PCAL and MCAL teams', () => {
  it('read a tracked rollup, keep an untracked stat null, and join every row to the roster', () => {
    for (const slug of ['leigh', 'stevenson', 'university-sf', 'marin-catholic']) {
      const page = parseStats(slug)!;
      expect(page, slug).not.toBeNull();
      expect(page.players.length, slug).toBeGreaterThan(0);
      for (const p of page.players) {
        for (const [k, v] of Object.entries(p.field ?? {})) {
          if (!page.tracked.field.includes(k as never)) expect(v, `${slug} ${p.shortName} ${k}`).toBeNull();
        }
      }
      const { lines, warnings } = joinToRoster(page, rosterRow(slug).players);
      expect(warnings, slug).toEqual([]);
      expect(lines.every((l) => l.onRoster), slug).toBe(true);
    }
  });

  it('reads what each coach tracks, which differs from team to team', () => {
    const leigh = parseStats('leigh')!;
    expect(leigh.tracked.field).toEqual(['gamesPlayed', 'goals', 'assists', 'points', 'gameWinningGoals']);
    expect(leigh.tracked.goalkeeping).toEqual(['gamesPlayed', 'minutes', 'shutouts', 'wins']);
    const stevenson = parseStats('stevenson')!;
    expect(stevenson.tracked.field).toContain('shotsOnGoal');
    expect(stevenson.tracked.goalkeeping).toEqual(
      expect.arrayContaining(['saves', 'goalsAgainst', 'shutouts', 'wins', 'losses', 'ties']),
    );
    const mc = parseStats('marin-catholic')!;
    expect(mc.tracked.field).not.toContain('gameWinningGoals');
  });

  it('points are 2 per goal + 1 per assist wherever the team tracks them', () => {
    for (const slug of ['leigh', 'stevenson', 'university-sf', 'marin-catholic']) {
      for (const p of parseStats(slug)!.players) {
        const f = p.field;
        if (f?.points != null && f.goals != null) {
          expect(f.points, `${slug} ${p.shortName}`).toBe(2 * f.goals + (f.assists ?? 0));
        }
      }
    }
  });

  it('reads the 400 "no data" envelope as no stats, for a team with a roster and for one without', () => {
    for (const slug of ['berkeley', 'del-mar', 'monterey']) {
      expect(parseStats(slug), slug).toBeNull();
      expect(statsRow(slug).status, slug).toBe('none');
      expect(statsRow(slug).players, slug).toEqual([]);
    }
    // Del Mar and Monterey also have no roster: both are empty, which is not a failure.
    for (const slug of ['del-mar', 'monterey']) expect(rosterRow(slug).status).toBe('empty');
  });
});

describe('data/player-stats.json, rebuilt from the sampled captures', () => {
  it('is exactly what the parser reads, joined to the rosters the same run was given', () => {
    for (const slug of STATS_SAMPLE) {
      const page = parseStats(slug);
      const row = statsRow(slug);
      if (!page) {
        expect(row.status, slug).toBe('none');
        expect(row.players, slug).toEqual([]);
        continue;
      }
      const { lines, warnings } = joinToRoster(page, rosterRow(slug).players);
      expect(row.status, slug).toBe('ok');
      expect(row.players, slug).toEqual(lines);
      expect(row.tracked, slug).toEqual(page.tracked);
      expect(row.totals, slug).toEqual(page.totals);
      expect(row.warnings, slug).toEqual([...page.warnings, ...warnings]);
    }
  });

  it('covers every sampled team: each read (stats, or MaxPreps says none), nobody pending or failed', () => {
    for (const slug of STATS_SAMPLE) {
      expect(['ok', 'none'], slug).toContain(statsRow(slug).status);
      expect(statsRow(slug).maxprepsTeamId, slug).toBe(getTeamBySlug(slug)!.id);
    }
  });

  it('drops a stat with a team total and no player holding any, and says so (Marin Catholic shots faced)', () => {
    const mc = statsRow('marin-catholic');
    expect(mc.tracked.goalkeeping).not.toContain('opponentShotsOnGoal');
    expect(mc.tracked.goalkeeping).toContain('saves');
    expect(mc.warnings.some((w) => /opponentShotsOnGoal: team total is \d+ but no player has any/.test(w))).toBe(true);
    for (const p of mc.players) expect(p.goalkeeping?.opponentShotsOnGoal ?? null).toBeNull();
  });
});

describe('the committed data/player-stats.json', () => {
  it('holds a row for every other league\'s team, in any status the schema allows, under the registry id', () => {
    // error (a team's first transient failure) and pending (no run covered it yet) are published
    // states, not test failures: the refresh runs this suite before it commits the file.
    expect(PlayerStatsFileSchema.safeParse(statsFile).success).toBe(true);
    for (const t of TEAMS.filter((x) => x.league !== 'scval')) {
      const row = statsFile.teams.find((r) => r.slug === t.slug)!;
      expect(['ok', 'none', 'carried-forward', 'error', 'pending'], t.slug).toContain(row.status);
      if (row.status === 'ok' || row.status === 'none') expect(row.maxprepsTeamId, t.slug).toBe(t.id);
    }
  });
});

describe('scripts offline over a partly captured league', () => {
  const committedRoster = (slug: string) => rostersFile.teams.find((t) => t.slug === slug)!;
  const committedStats = (slug: string) => statsFile.teams.find((t) => t.slug === slug)!;
  /** A row the run could read (ok, empty / none, or itself carried forward) is carried; error and pending are not. */
  const carriable = (status: string) => status !== 'error' && status !== 'pending';

  it('fetch-rosters: reads the captured teams, carries forward the rest, leaves SCVAL and SoCal byte for byte', () => {
    const dir = sampleDir('roster');
    const out = tmpFile('rosters.json');
    copyFileSync(path.join(REPO, 'data', 'rosters.json'), out);
    const res = runScript('scripts/fetch-rosters.ts', ['--fixtures', dir, '--leagues', OTHERS, '--out', out, '--fetched-at', '2026-10-04T00:00:00.000Z']);
    // Teams without a capture failed this run, so the exit code says so; the file is written anyway.
    expect(res.status, res.stderr).toBe(1);
    const built = RostersSchema.parse(JSON.parse(readFileSync(out, 'utf8')) as unknown);
    for (const t of built.teams) {
      const before = committedRoster(t.slug);
      if (outsideRun(t.slug)) {
        expect(t, t.slug).toEqual(before);
      } else if (ROSTER_SAMPLE.includes(t.slug)) {
        // Read from the capture, whatever the committed row held.
        const page = parseRoster(t.slug);
        expect(t.status, t.slug).toBe(page.players.length ? 'ok' : 'empty');
        expect(t.players, t.slug).toEqual(page.players);
        expect(t.fetchedAt, t.slug).toBe('2026-10-04T00:00:00.000Z');
        expect(t.error, t.slug).toBeNull();
      } else if (carriable(before.status)) {
        // The failed fetch keeps the earlier rows (an empty roster stays empty), and its own stamp
        // says when they were read.
        expect(t.status, t.slug).toBe('carried-forward');
        expect(t.players, t.slug).toEqual(before.players);
        expect(t.athleteCount, t.slug).toBe(before.athleteCount);
        expect(t.fetchedAt, t.slug).toBe(before.fetchedAt);
        expect(t.error, t.slug).toMatch(/ENOENT/);
      } else {
        expect(t.status, t.slug).toBe('error');
        expect(t.players, t.slug).toEqual([]);
      }
    }
  });

  it('fetch-player-stats: the same, joined to rosters pinned to the captures', () => {
    const dir = sampleDir('stats');
    const out = tmpFile('player-stats.json');
    copyFileSync(path.join(REPO, 'data', 'player-stats.json'), out);
    const res = runScript('scripts/fetch-player-stats.ts', ['--fixtures', dir, '--leagues', OTHERS, '--rosters', pinned().rostersPath, '--out', out, '--fetched-at', '2026-10-04T00:00:00.000Z']);
    expect(res.status, res.stderr).toBe(1);
    const built = PlayerStatsFileSchema.parse(JSON.parse(readFileSync(out, 'utf8')) as unknown);
    for (const t of built.teams) {
      const before = committedStats(t.slug);
      if (outsideRun(t.slug)) {
        expect(t, t.slug).toEqual(before);
      } else if (STATS_SAMPLE.includes(t.slug)) {
        // Read from the capture, whatever the committed row held.
        const want = statsRow(t.slug);
        expect(t.status, t.slug).toBe(want.status);
        expect({ ...t, fetchedAt: null }, t.slug).toEqual({ ...want, fetchedAt: null });
        expect(t.fetchedAt, t.slug).toBe('2026-10-04T00:00:00.000Z');
      } else if (carriable(before.status)) {
        // A team with no stats stays 'none' (the coach entered none); one with rows keeps them.
        expect(t.status, t.slug).toBe('carried-forward');
        expect(t.players, t.slug).toEqual(before.players);
        expect(t.fetchedAt, t.slug).toBe(before.fetchedAt);
        expect(t.error, t.slug).toMatch(/ENOENT/);
      } else {
        expect(t.status, t.slug).toBe('error');
      }
    }
  });
});
