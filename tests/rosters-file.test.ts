/**
 * data/rosters.json: the committed file validates, the read API serves it, and the script rebuilds
 * it byte for byte from the fixtures it was built from.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { ROSTER_TEAM_COUNT, RostersSchema, countRosters, type Rosters } from '../lib/rosters-schema';
import { getRosters, getTeamRoster, sortedPlayers } from '../lib/rosters';
import { TEAMS, teamsInLeague } from '../lib/teams';

/** Rosters stay SCVAL-only (SPEC §0.2 #12, §4.2). */
const SCVAL_TEAMS = teamsInLeague('scval');
import { FIXTURE_DIR, REPO } from './helpers';

const FILE = path.join(REPO, 'data', 'rosters.json');
const text = readFileSync(FILE, 'utf8');
const raw = JSON.parse(text) as Rosters;

describe('data/rosters.json', () => {
  it('validates against the contract', () => {
    const parsed = RostersSchema.safeParse(raw);
    expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues.slice(0, 5))).toBe(true);
  });

  it('has one entry per SCVAL registry team, in registry order, keyed by the registry id', () => {
    expect(raw.teams.map((t) => t.slug)).toEqual(SCVAL_TEAMS.map((t) => t.slug));
    expect(raw.teams.map((t) => t.teamId)).toEqual(SCVAL_TEAMS.map((t) => t.id));
    for (const t of raw.teams) {
      const team = SCVAL_TEAMS.find((x) => x.slug === t.slug)!;
      expect(t.division).toBe(team.division);
      if (team.dataCoverage !== 'none') expect(t.maxprepsTeamId).toBe(team.id);
    }
  });

  it('counts are recomputed from the rows, and the schema refuses a file whose counts lie', () => {
    expect(raw.counts).toEqual(countRosters(raw.teams));
    const lying = structuredClone(raw);
    lying.counts.players += 1;
    expect(RostersSchema.safeParse(lying).success).toBe(false);
  });

  it('is byte for byte what scripts/fetch-rosters.ts builds from the fixtures', () => {
    const out = path.join(mkdtempSync(path.join(tmpdir(), 'scvalfh-rosters-')), 'rosters.json');
    execFileSync(
      path.join(REPO, 'node_modules', '.bin', 'tsx'),
      [
        path.join(REPO, 'scripts', 'fetch-rosters.ts'),
        '--fixtures',
        FIXTURE_DIR,
        '--out',
        out,
        '--fetched-at',
        raw.fetchedAt,
      ],
      { cwd: REPO, stdio: 'pipe' },
    );
    expect(readFileSync(out, 'utf8')).toBe(text);
  });

  it('every team was read this run — nothing carried forward, nothing failed', () => {
    expect(raw.teams.every((t) => t.status === 'ok' || t.status === 'empty')).toBe(true);
    expect(raw.counts.errors).toBe(0);
    expect(raw.teams).toHaveLength(SCVAL_TEAMS.length);
  });

  it('is SCVAL-scoped: 15 teams, and refuses a team of another league or division', () => {
    expect(SCVAL_TEAMS).toHaveLength(15);
    expect(ROSTER_TEAM_COUNT).toBe(SCVAL_TEAMS.length);
    expect(TEAMS.length).toBeGreaterThan(SCVAL_TEAMS.length);
    const leigh = TEAMS.find((t) => t.slug === 'leigh')!;
    const foreign = structuredClone(raw);
    foreign.teams[0] = { ...foreign.teams[0], slug: leigh.slug, teamId: leigh.id };
    expect(RostersSchema.safeParse(foreign).success).toBe(false);
    const badDivision = structuredClone(raw);
    badDivision.teams[0].division = 'mt-hamilton';
    expect(RostersSchema.safeParse(badDivision).success).toBe(false);
    const short = structuredClone(raw);
    short.teams.pop();
    short.counts = countRosters(short.teams);
    expect(RostersSchema.safeParse(short).success).toBe(false);
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
