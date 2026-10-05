/**
 * Cross-check: our computed records against MaxPreps' own published table, for all 15 teams that
 * MaxPreps carries (DESIGN §9, SPEC §7.7).
 *
 * A disagreement is NOT a test failure — MaxPreps' De Anza arithmetic is known to be suspect and
 * the site's whole credibility mechanism is publishing the difference. What IS asserted is that
 * any disagreement sets the `mismatch` flag and produces a cross-check row.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { classifyGames } from '../lib/classify';
import { ALL_DIVISIONS, getDivision } from '../lib/leagues';
import { normalizeGames } from '../lib/normalize';
import { readManifest } from '../lib/pipeline/corpus';
import { StandingsResponseSchema } from '../lib/sources/maxpreps';
import { buildCrossCheck, computeStandings, toReportedRecord } from '../lib/standings';
import { getTeamById, resolveTeam, teamsInDivision } from '../lib/teams';
import type { ReportedRecord, TeamId } from '../lib/types';
import { REPO, allScheduleRows, corpusDir, standingsFixture } from './helpers';
import { runCorpus, writeTempVariant } from './pipeline/support/run-corpus';

const reported = new Map<TeamId, ReportedRecord>();
for (const which of ['da', 'ec'] as const) {
  for (const row of StandingsResponseSchema.parse(standingsFixture(which)).data) {
    const team = resolveTeam(row.schoolId);
    expect(team, `${row.schoolName} should be a registry team`).toBeDefined();
    reported.set(team!.id, toReportedRecord(row));
  }
}

// Standings read the persisted classification (`countsFor`), so the normalized games are
// classified first, exactly as the pipeline's step 10 does (SPEC §7.6).
const games = classifyGames(
  normalizeGames(allScheduleRows(), { fetchedAt: '2026-09-29T15:00:00.000Z' }).games,
);
const standings = computeStandings(games, { reported });
const crossCheck = buildCrossCheck(standings);

describe('computed vs reported', () => {
  it('classifies the SCVAL captures exactly by contest type (isLeague within one division)', () => {
    for (const g of games) {
      expect(g.countsFor, g.contestId).toBe(g.isLeague ? g.leagueDivision : null);
    }
    expect(games.filter((g) => g.countsFor !== null).length).toBeGreaterThan(80);
  });

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

describe('reported tables of the corpus divisions (all-2026-10-02 corpus)', () => {
  const STANDINGS_DIR = path.join(corpusDir('all-2026-10-02'), 'maxpreps', 'standings');
  // The divisions of the leagues the corpus was captured for (its manifest): the EAL came later.
  const leagues: readonly string[] = readManifest(corpusDir('all-2026-10-02')).leagues;

  it('covers the six divisions of its four leagues', () => {
    expect(ALL_DIVISIONS.filter((d) => leagues.includes(d.leagueId)).length).toBe(6);
  });

  for (const division of ALL_DIVISIONS.filter((d) => leagues.includes(d.leagueId))) {
    it(`${division.id}: every MaxPreps row resolves by GUID to a member of that division`, () => {
      const raw = JSON.parse(readFileSync(path.join(STANDINGS_DIR, `${division.id}.json`), 'utf8')) as unknown;
      const rows = StandingsResponseSchema.parse(raw).data;
      expect(rows.length).toBe(division.maxprepsTeamCount);
      const resolved = rows.map((row) => getTeamById(row.schoolId));
      for (const [i, team] of resolved.entries()) {
        expect(team, rows[i].schoolName).toBeDefined();
        expect(team!.division).toBe(division.id);
      }
      // The members MaxPreps leaves out of its table are exactly the configured ones (Prospect).
      const present = new Set(resolved.map((t) => t!.slug));
      const missing = teamsInDivision(division.id).filter((t) => !present.has(t.slug)).map((t) => t.slug);
      expect(missing).toEqual([...division.maxprepsMissing]);
      // Each row converts to a ReportedRecord without loss of the league numbers.
      for (const row of rows) {
        const r = toReportedRecord(row);
        expect([r.conferenceWins, r.conferenceLosses, r.conferenceTies]).toEqual([
          row.conferenceWins,
          row.conferenceLosses,
          row.conferenceTies,
        ]);
      }
    });
  }
});

describe('the EAL reported table (tests/fixtures/maxpreps/standings-eal-2026-10-04.json)', () => {
  const FILE = path.join(REPO, 'tests', 'fixtures', 'maxpreps', 'standings-eal-2026-10-04.json');
  const body = readFileSync(FILE, 'utf8');
  const rows = StandingsResponseSchema.parse(JSON.parse(body) as unknown).data;
  const eal = getDivision('eal');
  const extra = Object.keys(eal.maxprepsExtraRows);

  it('holds maxprepsTeamCount rows: the six members by GUID, and the one known non-member row', () => {
    expect(rows.length).toBe(eal.maxprepsTeamCount);
    expect(extra).toHaveLength(1);
    const members = rows.filter((r) => !extra.includes(r.schoolId));
    expect(members.map((r) => getTeamById(r.schoolId)?.slug).sort()).toEqual(teamsInDivision('eal').map((t) => t.slug).sort());
    for (const r of members) expect(getTeamById(r.schoolId)?.division, r.schoolName).toBe('eal');
    const [nonMember] = rows.filter((r) => extra.includes(r.schoolId));
    expect(getTeamById(nonMember.schoolId)).toBeUndefined();
    // MaxPreps leaves that row undated (modifiedOn null), which parses as ''.
    expect(nonMember.modifiedOn).toBe('');
    for (const r of members) expect(r.modifiedOn, r.schoolName).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('the reported step reads it with no unknown-school warning, and dates the table by its member rows', async () => {
    const variant = writeTempVariant({ 'maxpreps/standings/eal': { rel: 'maxpreps/standings/eal.json', body } });
    const { result, ctx } = await runCorpus({ variants: [variant], extraArgs: ['--leagues', 'eal'] });
    expect(ctx.logLines.filter((l) => l.startsWith('WARN ') && l.includes('eal standings'))).toEqual([]);
    const source = result!.snapshot.sources.find((r) => r.kind === 'reported-standings' && r.scope?.division === 'eal');
    const newest = rows.map((r) => r.modifiedOn).filter(Boolean).sort().at(-1);
    expect(source).toMatchObject({ status: 'ok', rowCount: eal.maxprepsTeamCount, upstreamModifiedOn: newest });
    // The health counts member rows only (the source row keeps the table as read), so it matches a carried table.
    const health = result!.snapshot.leagueHealth.find((h) => h.leagueId === 'eal')!;
    expect(health.divisions[0]).toMatchObject({ reportedTable: 'ok', reportedRows: rows.length - extra.length });
    // Every member gets its reported row; the non-member row reaches no standing.
    const reportedSlugs = result!.snapshot.standings.filter((st) => st.division === 'eal' && st.reported).map((st) => st.slug);
    expect(reportedSlugs.sort()).toEqual(teamsInDivision('eal').map((t) => t.slug).sort());
    expect(health.divisions[0].reportedRows).toBe(reportedSlugs.length);
  });

  it('a fresh read and a carried copy of the table report the same row count', async () => {
    const variant = writeTempVariant({ 'maxpreps/standings/eal': { rel: 'maxpreps/standings/eal.json', body } });
    const fresh = (await runCorpus({ variants: [variant], extraArgs: ['--leagues', 'eal'] })).result!.snapshot;
    const failed = writeTempVariant({ 'maxpreps/standings/eal': 503 });
    const { result } = await runCorpus({ variants: [failed], extraArgs: ['--leagues', 'eal'], previous: fresh });
    const freshEal = fresh.leagueHealth.find((h) => h.leagueId === 'eal')!.divisions[0];
    const carriedEal = result!.snapshot.leagueHealth.find((h) => h.leagueId === 'eal')!.divisions[0];
    expect(freshEal.reportedTable).toBe('ok');
    expect(carriedEal.reportedTable).toBe('carried');
    expect(carriedEal.reportedRows).toBe(freshEal.reportedRows);
  });
});
