/** lib/fetch-scope.ts — which teams a rosters / player-stats run covers, and how it reports them. */

import { describe, expect, it } from 'vitest';

import {
  formatLeagueSummary,
  inScope,
  parseLeaguesFlag,
  stableStringify,
  summarizeByLeague,
  teamsInScope,
} from '../lib/fetch-scope';
import { TEAMS, teamsInLeague } from '../lib/teams';

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
    expect(formatLeagueSummary(bval)).toContain('BVAL  12 teams · not in this run');
  });
});

describe('stableStringify', () => {
  it('sorts keys at every level and ends with a newline', () => {
    expect(stableStringify({ b: [{ z: 1, a: 2 }], a: undefined, c: null })).toBe(
      '{\n  "b": [\n    {\n      "a": 2,\n      "z": 1\n    }\n  ],\n  "c": null\n}\n',
    );
  });
});
