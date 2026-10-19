/**
 * lib/engine/standings/maxpreps-crosscheck.ts: the MaxPreps cross-check trust levels (SPEC §5.8) and the
 * division it skips.
 */

import { describe, expect, it } from 'vitest';

import { buildCrossCheck, computeStandings, crossCheckSkipReason } from '@/lib/engine/standings';
import type { ReportedRecord } from '@/lib/model/standings';
import { finals } from '@/tests/support/standings';

describe('cross-check trust levels (§5.8)', () => {
  const reported = (over: Partial<ReportedRecord>): ReportedRecord => ({
    conferenceWins: 9, conferenceLosses: 9, conferenceTies: 9,
    overallWins: 9, overallLosses: 9, overallTies: 9,
    conferencePoints: 99, conferencePointsAgainst: 99, points: 0, pointsAgainst: 0,
    conferenceContestsPlayed: 0, overallContestsPlayed: 0,
    conferenceStandingPlacement: 9, conferenceWinningPercentage: 0.999, winningPercentage: 0,
    streak: 0, streakResult: null,
    homeWins: 0, homeLosses: 0, homeTies: 0, awayWins: 0, awayLosses: 0, awayTies: 0,
    neutralWins: 0, neutralLosses: 0, neutralTies: 0,
    modifiedOn: '2026-10-01T00:00:00', ...over,
  });

  it('compares six, four or one field by the division’s trust level, with its known cause', () => {
    const games = finals([
      ['saint-francis', 'fremont', 1, 0], ['live-oak', 'prospect', 1, 0],
      ['tamalpais', 'redwood', 1, 0], ['carmel', 'salinas', 1, 0],
    ]);
    const ids = ['saint-francis', 'live-oak', 'tamalpais', 'carmel'].map(
      (slug) => computeStandings(games).find((r) => r.slug === slug)!.teamId,
    );
    const rows = computeStandings(games, { reported: new Map(ids.map((id) => [id, reported({})])) });
    const check = buildCrossCheck(rows);
    const fields = (slug: string) => check.filter((r) => r.slug === slug).map((r) => r.field);
    expect(fields('saint-francis')).toHaveLength(6); // full
    expect(fields('live-oak')).toEqual(['league record', 'overall record', 'league goals for', 'league goals against']);
    expect(fields('tamalpais')).toHaveLength(4); // records-only
    expect(fields('carmel')).toEqual(['league record']); // informational
    expect(check.find((r) => r.slug === 'saint-francis')?.knownCause).toBeUndefined();
    expect(check.find((r) => r.slug === 'live-oak')?.knownCause).toMatch(/leaves out Prospect/);
    expect(check.find((r) => r.slug === 'carmel')?.url).toMatch(/leagueid=50ac53cd/);
  });

  it('the place row cites each league’s own points rule (SCVAL Art. VI §2 verbatim; BVAL §6a)', () => {
    const games = finals([
      ['saint-francis', 'fremont', 1, 0], ['leigh', 'branham', 1, 0],
    ]);
    const ids = ['saint-francis', 'leigh'].map((slug) => computeStandings(games).find((r) => r.slug === slug)!.teamId);
    const rows = computeStandings(games, { reported: new Map(ids.map((id) => [id, reported({})])) });
    const place = (slug: string) =>
      buildCrossCheck(rows).find((r) => r.slug === slug && r.field.startsWith('place'))?.field;
    expect(place('saint-francis')).toBe('place (we order on points, Art. VI §2; MaxPreps orders on win pct)');
    expect(place('leigh')).toBe('place (we order on points, BVAL by-laws §6a; MaxPreps orders on win pct)');
    expect(place('leigh')).not.toMatch(/Art\. VI/);
  });
});

describe('Southern California: ladders, the cross-check skip, uneven games (DESIGN-socal §2.1.7)', () => {
  it('skips the MaxPreps comparison for Valley, which has no MaxPreps table, and says why', () => {
    expect(crossCheckSkipReason('valley')).toBe('MaxPreps publishes no table for this division');
    expect(crossCheckSkipReason('palomar')).toBeNull();
    expect(crossCheckSkipReason('de-anza')).toBeNull();
    const games = finals([['escondido', 'vista', 1, 0], ['del-norte', 'poway', 1, 0]]);
    const ids = ['escondido', 'del-norte'].map((slug) => computeStandings(games).find((r) => r.slug === slug)!.teamId);
    const rows = computeStandings(games, { reported: new Map(ids.map((id) => [id, {
      conferenceWins: 9, conferenceLosses: 9, conferenceTies: 9, overallWins: 9, overallLosses: 9, overallTies: 9,
      conferencePoints: 99, conferencePointsAgainst: 99, points: 0, pointsAgainst: 0,
      conferenceContestsPlayed: 0, overallContestsPlayed: 0, conferenceStandingPlacement: 9,
      conferenceWinningPercentage: 0.999, winningPercentage: 0, streak: 0, streakResult: null,
      homeWins: 0, homeLosses: 0, homeTies: 0, awayWins: 0, awayLosses: 0, awayTies: 0,
      neutralWins: 0, neutralLosses: 0, neutralTies: 0, modifiedOn: '2026-10-01T00:00:00',
    }])) });
    const check = buildCrossCheck(rows);
    expect(check.filter((r) => r.slug === 'escondido')).toEqual([]);
    // Palomar is 'informational': its league record only, with its known cause and its MaxPreps page.
    const palomar = check.filter((r) => r.slug === 'del-norte');
    expect(palomar.map((r) => r.field)).toEqual(['league record']);
    expect(palomar[0].url).toMatch(/leagueid=e4a7e9c3/);
    expect(palomar[0].knownCause).toMatch(/Rancho Buena Vista/);
  });
});
