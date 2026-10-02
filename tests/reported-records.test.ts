/**
 * Cross-check: our computed records against MaxPreps' own published table, for all 15 teams that
 * MaxPreps carries (DESIGN §9, SPEC §7.7).
 *
 * A disagreement is NOT a test failure — MaxPreps' De Anza arithmetic is known to be suspect and
 * the site's whole credibility mechanism is publishing the difference. What IS asserted is that
 * any disagreement sets the `mismatch` flag and produces a cross-check row.
 */

import { describe, expect, it } from 'vitest';

import { normalizeGames } from '../lib/normalize';
import { StandingsResponseSchema } from '../lib/sources/maxpreps';
import { buildCrossCheck, computeStandings, toReportedRecord } from '../lib/standings';
import { resolveTeam } from '../lib/teams';
import type { ReportedRecord, TeamId } from '../lib/types';
import { allScheduleRows, standingsFixture } from './helpers';

const reported = new Map<TeamId, ReportedRecord>();
for (const which of ['da', 'ec'] as const) {
  for (const row of StandingsResponseSchema.parse(standingsFixture(which)).data) {
    const team = resolveTeam(row.schoolId);
    expect(team, `${row.schoolName} should be a registry team`).toBeDefined();
    reported.set(team!.id, toReportedRecord(row));
  }
}

const games = normalizeGames(allScheduleRows(), { fetchedAt: '2026-09-29T15:00:00.000Z' }).games;
const standings = computeStandings(games, { reported });
const crossCheck = buildCrossCheck(standings);

describe('computed vs reported', () => {
  it('has a reported row for all 15 MaxPreps teams', () => {
    expect(reported.size).toBe(15);
    expect(standings.filter((s) => s.reported !== null).length).toBe(15);
  });

  it('reproduces every MaxPreps league record, or flags the difference', () => {
    const diffs: string[] = [];
    for (const s of standings) {
      const r = s.reported;
      if (!r) continue;
      const ours = `${s.computed.w}-${s.computed.l}-${s.computed.t}`;
      const theirs = `${r.conferenceWins}-${r.conferenceLosses}-${r.conferenceTies}`;
      const oursGoals = `${s.computed.gf}-${s.computed.ga}`;
      const theirsGoals = `${r.conferencePoints}-${r.conferencePointsAgainst}`;
      if (ours !== theirs || oursGoals !== theirsGoals) {
        diffs.push(`${s.slug}: ours ${ours} ${oursGoals} · MaxPreps ${theirs} ${theirsGoals}`);
        // The known-suspect rows (Fremont / Homestead / Cupertino in earlier captures) must be
        // surfaced, not silently absorbed.
        expect(s.mismatch, `${s.slug} must carry the mismatch flag`).toBe(true);
        expect(s.mismatchDetail, `${s.slug} must explain the mismatch`).toBeTruthy();
        expect(crossCheck.some((row) => row.slug === s.slug)).toBe(true);
      } else {
        expect(s.mismatch, `${s.slug} agrees with MaxPreps, so it must not be flagged`).toBe(false);
      }
    }
    if (diffs.length) {
      console.log(`record differences vs MaxPreps (${diffs.length}):\n  ${diffs.join('\n  ')}`);
    }
  });

  it('reproduces MaxPreps win percentage with the tie-as-half-a-win formula (SPEC §5.6)', () => {
    const off: string[] = [];
    for (const s of standings) {
      if (!s.reported || s.computed.gp === 0) continue;
      const ours = Number(s.computed.winPct.toFixed(3));
      const theirs = Number(s.reported.conferenceWinningPercentage.toFixed(3));
      if (Math.abs(ours - theirs) > 0.001) off.push(`${s.slug}: ${ours} vs ${theirs}`);
    }
    if (off.length) {
      console.log(`win pct differences: ${off.join(', ')}`);
    }
    // With matching records the formula must agree; a difference would mean the formula is wrong.
    const withMatchingRecords = standings.filter((s) => s.reported && !s.mismatch);
    for (const s of withMatchingRecords) {
      if (s.computed.gp === 0) continue;
      expect(Number(s.computed.winPct.toFixed(3))).toBeCloseTo(
        Number(s.reported!.conferenceWinningPercentage.toFixed(3)),
        3,
      );
    }
  });

  it('publishes the ordering difference rather than hiding it', () => {
    // We order on points (Article VI §2); MaxPreps orders on win percentage. Where the two differ
    // there must be a cross-check row naming both numbers.
    for (const s of standings) {
      const r = s.reported;
      if (!r || r.conferenceStandingPlacement === null) continue;
      if (r.conferenceStandingPlacement !== s.computed.place) {
        expect(
          crossCheck.some((row) => row.slug === s.slug && row.field.startsWith('place')),
        ).toBe(true);
      }
    }
    // Every cross-check row carries a deep link back to the source table.
    for (const row of crossCheck) expect(row.url).toMatch(/^https:\/\/www\.maxpreps\.com\//);
  });

  it('keeps the reported freshness stamp so a stale upstream row is visible', () => {
    for (const s of standings) {
      if (!s.reported) continue;
      expect(s.reported.modifiedOn).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });
});
