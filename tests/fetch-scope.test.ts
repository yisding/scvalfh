/** lib/fetch-scope.ts — which teams a rosters / player-stats run covers, and how it reports them. */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  describePrevious,
  formatLeagueSummary,
  inScope,
  parseLeaguesFlag,
  readPreviousFile,
  runExitCode,
  stableStringify,
  summarizeByLeague,
  teamsInScope,
} from '../lib/fetch-scope';
import {
  RostersPartialSchema,
  TeamRosterSchema,
  countRosters,
  type Rosters,
} from '../lib/rosters-schema';
import { SEASON_YEAR } from '../lib/season';
import { TEAMS, teamsInLeague } from '../lib/teams';
import { REPO } from './helpers';

describe('parseLeaguesFlag', () => {
  it('reads a comma list, drops blanks and repeats', () => {
    expect(parseLeaguesFlag('scval,bval')).toEqual(['scval', 'bval']);
    expect(parseLeaguesFlag(' mcal , ,mcal')).toEqual(['mcal']);
  });

  it('refuses an unknown league and an empty list, naming the flag', () => {
    expect(() => parseLeaguesFlag('scval,nope')).toThrow(/--leagues: unknown league nope/);
    expect(() => parseLeaguesFlag(' , ', '--x')).toThrow(/--x needs at least one league id/);
  });
});

describe('scope', () => {
  it('covers all 43 teams, in registry order, by default', () => {
    expect(teamsInScope(null)).toEqual(TEAMS);
    expect(TEAMS.every((t) => inScope(t, null))).toBe(true);
  });

  it('narrows to the leagues named, keeping registry order', () => {
    const only = teamsInScope(['pcal', 'scval']);
    expect(only.map((t) => t.slug)).toEqual(TEAMS.filter((t) => t.league === 'scval' || t.league === 'pcal').map((t) => t.slug));
    expect(only).toHaveLength(teamsInLeague('scval').length + teamsInLeague('pcal').length);
  });
});

describe('summarizeByLeague', () => {
  const teams = TEAMS.map((t) => ({ slug: t.slug, status: t.league === 'bval' ? 'error' : 'ok' }));

  it('counts a covered league\'s failures, and none for a league left out of the run', () => {
    const all = summarizeByLeague(teams, null);
    expect(all.map((s) => [s.league, s.teams, s.failed])).toEqual([
      ['scval', 15, 0],
      ['bval', 12, 12],
      ['pcal', 7, 0],
      ['mcal', 9, 0],
    ]);
    // BVAL's rows are failures in the file, but a run that did not cover BVAL did not fail them.
    const scoped = summarizeByLeague(teams, ['scval']);
    expect(scoped.map((s) => s.failed)).toEqual([0, 0, 0, 0]);
    expect(scoped.map((s) => s.outOfScope)).toEqual([0, 12, 7, 9]);
  });

  it('formats one line per league', () => {
    const [scval, bval] = summarizeByLeague(teams, ['scval']);
    expect(formatLeagueSummary(scval)).toBe('SCVAL 15 teams · 15 ok');
    expect(formatLeagueSummary(bval)).toBe('BVAL  12 teams · not in this run (kept as they were)');
    expect(runExitCode(summarizeByLeague(teams, ['scval']))).toBe(0);
    expect(runExitCode(summarizeByLeague(teams, null))).toBe(1);
  });

  it('never calls a team kept as it was when its previous row was dropped, and exits 1 for it', () => {
    const [leigh, delMar] = teamsInLeague('bval');
    const dropped = new Set([leigh.slug, delMar.slug, 'st-ignatius']);
    const byLeague = summarizeByLeague(teams, ['scval'], dropped);
    // A covered team's dropped row is the fetch's business (re-read, or an error): not listed here.
    expect(byLeague.map((s) => s.dropped)).toEqual([[], [leigh.slug, delMar.slug], [], []]);
    expect(formatLeagueSummary(byLeague[1])).toBe(
      `BVAL  12 teams · not in this run · 10 kept as they were · 2 pending, previous row dropped (${leigh.slug}, ${delMar.slug})`,
    );
    expect(formatLeagueSummary(byLeague[2])).toBe('PCAL   7 teams · not in this run (kept as they were)');
    expect(runExitCode(byLeague)).toBe(1);
    // Every row dropped: nothing is said to be kept.
    const all = summarizeByLeague(teams, ['scval'], new Set(teamsInLeague('pcal').map((t) => t.slug)));
    expect(formatLeagueSummary(all[2])).not.toContain('kept as they were');
  });
});

describe('readPreviousFile: the previous file, salvaged row by row', () => {
  const committed = readFileSync(path.join(REPO, 'data', 'rosters.json'), 'utf8');
  const raw = JSON.parse(committed) as Rosters;
  const read = (file: unknown) =>
    readPreviousFile(typeof file === 'string' ? file : JSON.stringify(file), {
      season: SEASON_YEAR,
      row: TeamRosterSchema,
      file: RostersPartialSchema,
    });
  const rowsOf = (p: ReturnType<typeof read>) => {
    if (!p.readable) throw new Error(p.reason);
    return p;
  };

  it('keeps every row of a valid file, and the whole file for the no-change check', () => {
    const p = rowsOf(read(committed));
    expect(p.dropped).toEqual([]);
    expect(p.problems).toEqual([]);
    expect(p.otherSeason).toBeNull();
    expect([...p.rows.keys()]).toEqual(TEAMS.map((t) => t.slug));
    expect(p.rows.get('leigh')).toEqual(raw.teams.find((t) => t.slug === 'leigh'));
    expect(p.whole).toEqual(raw);
    expect(describePrevious(p, 'data/rosters.json')).toEqual([]);
  });

  it('drops only the rows that fail on their own, naming each, and keeps the rest', () => {
    const file = structuredClone(raw);
    const at = (slug: string) => file.teams.findIndex((t) => t.slug === slug);
    // A BVAL team whose division no longer matches the registry, a slug no longer in it, a team
    // under another team's id, and a status that breaks its own invariant.
    file.teams[at('leigh')].division = 'de-anza';
    file.teams[at('del-mar')].slug = 'not-a-school';
    file.teams[at('greenfield')].teamId = TEAMS[0].id;
    Object.assign(file.teams[at('stevenson')], { status: 'carried-forward', error: null });
    const p = rowsOf(read(file));
    expect(p.dropped.map((d) => d.slug)).toEqual(['leigh', 'not-a-school', 'greenfield', 'stevenson']);
    expect(p.dropped.find((d) => d.slug === 'leigh')!.reason).toMatch(/registry/);
    expect(p.dropped.find((d) => d.slug === 'not-a-school')!.reason).toMatch(/not a registry team slug/);
    expect(p.dropped.find((d) => d.slug === 'stevenson')!.reason).toMatch(/error is set exactly when/);
    expect(p.rows.size).toBe(TEAMS.length - 4);
    for (const slug of ['leigh', 'del-mar', 'greenfield', 'stevenson']) expect(p.rows.has(slug), slug).toBe(false);
    expect(p.rows.get('st-ignatius')).toEqual(raw.teams.find((t) => t.slug === 'st-ignatius'));
    // A file that lost a row is never "unchanged".
    expect(p.whole).toBeNull();
    const log = describePrevious(p, 'data/rosters.json');
    expect(log[0]).toMatch(/^WARN previous data\/rosters\.json: 4 row\(s\) do not validate and are dropped/);
    for (const slug of ['leigh', 'not-a-school', 'greenfield', 'stevenson']) {
      expect(log.some((l) => l.startsWith(`WARN   ${slug}`)), slug).toBe(true);
    }
  });

  it('ties a dropped row to its registry team by MaxPreps id when its slug is broken', () => {
    const file = structuredClone(raw);
    file.teams[file.teams.findIndex((t) => t.slug === 'del-mar')].slug = 'not-a-school';
    const p = rowsOf(read(file));
    expect(p.dropped).toEqual([expect.objectContaining({ slug: 'not-a-school', team: 'del-mar' })]);
    expect(describePrevious(p, 'data/rosters.json')).toContain(
      `WARN   not-a-school (del-mar): ${p.dropped[0].reason}`,
    );
    // An SCVAL-only run must not report Del Mar (BVAL) as kept: it lost its row.
    const teams = TEAMS.map((t) => ({ slug: t.slug, status: t.slug === 'del-mar' ? 'pending' : 'ok' }));
    const byLeague = summarizeByLeague(teams, ['scval'], new Set(p.dropped.flatMap((d) => (d.team ? [d.team] : []))));
    expect(byLeague.find((l) => l.league === 'bval')!.dropped).toEqual(['del-mar']);
    expect(runExitCode(byLeague, p.dropped)).toBe(1);
  });

  it('fails the run when a dropped row names no registry team at all', () => {
    const file = structuredClone(raw) as unknown as { teams: Array<Record<string, unknown>> };
    const i = file.teams.findIndex((t) => t.slug === 'del-mar');
    delete file.teams[i].slug;
    file.teams[i].teamId = 'not-a-maxpreps-id';
    const p = rowsOf(read(file));
    expect(p.dropped).toEqual([expect.objectContaining({ slug: `teams[${i}]`, team: null })]);
    expect(describePrevious(p, 'data/rosters.json').some((l) => /names no registry team; the run fails/.test(l))).toBe(true);
    // No league can claim the lost team, so only the unattributed drop fails the run.
    const teams = TEAMS.map((t) => ({ slug: t.slug, status: t.slug === 'del-mar' ? 'pending' : 'ok' }));
    const byLeague = summarizeByLeague(teams, ['scval'], new Set());
    expect(runExitCode(byLeague)).toBe(0);
    expect(runExitCode(byLeague, p.dropped)).toBe(1);
  });

  it('keeps every row when only the counts lie, and says the file is not valid whole', () => {
    const file = structuredClone(raw);
    file.counts.players += 1;
    const p = rowsOf(read(file));
    expect(p.dropped).toEqual([]);
    expect(p.rows.size).toBe(TEAMS.length);
    expect(p.whole).toBeNull();
    expect(p.problems).toEqual([expect.stringMatching(/counts do not match the rows/)]);
    expect(describePrevious(p, 'x.json')).toEqual([expect.stringMatching(/^WARN previous x\.json does not validate as a whole/)]);
  });

  it('drops both rows of a team that appears twice', () => {
    const file = structuredClone(raw);
    file.teams.push(structuredClone(file.teams[0]));
    file.counts = countRosters(file.teams);
    const p = rowsOf(read(file));
    expect(p.dropped).toEqual([{ slug: raw.teams[0].slug, team: raw.teams[0].slug, reason: '2 rows claim this team; none is kept' }]);
    expect(p.rows.has(raw.teams[0].slug)).toBe(false);
    expect(p.rows.size).toBe(TEAMS.length - 1);
  });

  it('names a row with no slug by its index', () => {
    const file = structuredClone(raw) as unknown as { teams: unknown[] };
    file.teams[2] = 42;
    const p = rowsOf(read(file));
    expect(p.dropped.map((d) => d.slug)).toEqual(['teams[2]']);
  });

  it('ignores every row of a file from another season, as if absent', () => {
    for (const season of ['25-26', undefined]) {
      const file = { ...structuredClone(raw), season };
      const p = rowsOf(read(file));
      expect(p.rows.size).toBe(0);
      expect(p.whole).toBeNull();
      expect(p.otherSeason).toBe(season ?? '(none)');
      expect(p.dropped).toHaveLength(TEAMS.length);
      expect(p.dropped[0]).toEqual({ slug: raw.teams[0].slug, team: raw.teams[0].slug, reason: `season ${season ?? '(none)'}, not ${SEASON_YEAR}` });
      const log = describePrevious(p, 'data/rosters.json');
      expect(log).toHaveLength(1);
      expect(log[0].startsWith(`WARN previous data/rosters.json is season ${season ?? '(none)'}: its 43 row(s) are ignored, as if absent`)).toBe(true);
    }
  });

  it('is unreadable only when the text is not JSON or holds no teams[]', () => {
    for (const text of ['', '{"teams": [', 'not json at all']) {
      const p = read(text);
      expect(p.readable, text).toBe(false);
      if (!p.readable) expect(p.reason, text).toMatch(/^not JSON/);
    }
    for (const value of [null, [], {}, { teams: 'x' }]) {
      const p = read(JSON.stringify(value));
      expect(p.readable, JSON.stringify(value)).toBe(false);
      if (!p.readable) expect(p.reason).toBe('no teams[] array');
    }
    // An empty teams[] is a readable file with nothing in it.
    const empty = rowsOf(read({ ...raw, teams: [], counts: countRosters([]) }));
    expect(empty.rows.size).toBe(0);
    expect(empty.dropped).toEqual([]);
  });
});

describe('stableStringify', () => {
  it('sorts keys at every level and ends with a newline', () => {
    expect(stableStringify({ b: [{ z: 1, a: 2 }], a: undefined, c: null })).toBe(
      '{\n  "b": [\n    {\n      "a": 2,\n      "z": 1\n    }\n  ],\n  "c": null\n}\n',
    );
  });
});
