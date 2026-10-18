/**
 * The EAL-only live corpus (tests/fixtures/corpus/eal-2026-10-04) through the real cron script: the
 * Eastern Athletic League alone is fetched, so the other four leagues are frozen "not fetched in
 * this run". Every expected value is read from the corpus's own files (the schedule and standings
 * JSON), never written here, so the suite follows a re-capture.
 *
 * Assertion messages name the module that produces the value, so a failure is routed to its owner.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { DATA_QUALITY, LEAGUES } from '@/lib/config/leagues';
import type { Snapshot } from '@/lib/model/snapshot';
import { TEAMS, teamsInLeague } from '@/lib/registry/teams';
import { localDateKey } from '@/lib/shared/dates';
import { sideOutcome } from '@/lib/shared/game';
import type { ScheduleRow } from '@/lib/sources/maxpreps';
import { parseScoresPage, parseTeamGamesPage, type SbliveGame } from '@/lib/sources/sblive';
import { divisionGames } from '@/lib/standings';
import { CorpusReader, EAL_CORPUS, gameOf } from '@/tests/support/corpus';
import { useCorpusModules } from '@/tests/support/corpus-modules';
import { corpusSnapshotPath } from '@/tests/support/corpus-snapshot';
import { expectOk, runFixtureCli } from '@/tests/support/cli';
import { readSnapshot } from '@/tests/support/repo';

const LEAGUE = 'eal';
const DIVISION = 'eal';
/** si.com ids that are never an EAL team: Red Bluff (varsity bucket, JV) and the CANC placeholder. */
const IGNORED_SBLIVE_IDS = ['490259', '490260', '635037'];

const corpus = new CorpusReader(EAL_CORPUS);
const manifest = corpus.manifest;
const members = new Map(teamsInLeague(LEAGUE).map((t) => [t.id, t]));

const m = useCorpusModules(EAL_CORPUS, { data: () => import('@/lib/data') });
let file: string;
let snapshot: Snapshot;

beforeAll(() => {
  file = corpusSnapshotPath(EAL_CORPUS);
  snapshot = readSnapshot(file);
});

/** League games between two EAL teams that MaxPreps flags, dated before the run's day, not final. */
function missingFromCorpus(): ScheduleRow[] {
  const today = localDateKey(manifest.fetchedAt);
  return corpus.scheduleRows().filter((row) => {
    const sides = row.contest.teams;
    return (
      row.contest.isDeleted !== true &&
      sides.length === 2 &&
      sides.every((s) => s.teamId !== null && members.has(s.teamId) && s.contestType === 0) &&
      row.contest.date.slice(0, 10) < today &&
      row.calculatedFields.contestState !== 4
    );
  });
}

describe('the EAL corpus run', () => {
  it('names the EAL alone in its manifest', () => {
    expect(manifest.leagues, 'tests/fixtures/corpus/eal-*/manifest.json').toEqual([LEAGUE]);
  });

  it('publishes nine leagues and the independents: the EAL fresh, the other nine frozen "not fetched in this run"', () => {
    expect(snapshot.season.leagues.map((l) => l.id), 'lib/season-build.ts').toEqual(LEAGUES.map((l) => l.id));
    expect(snapshot.season.leagues, 'lib/season-build.ts').toHaveLength(10);
    for (const h of snapshot.leagueHealth) {
      if (h.leagueId === LEAGUE) {
        expect(h.state, 'lib/pipeline/steps/standings.ts: EAL health').toBe('fresh');
        expect(h.reasons, 'lib/pipeline/steps/standings.ts: EAL reasons').toEqual([]);
        expect(h.teamFeeds, 'lib/pipeline/steps/standings.ts: EAL feeds').toEqual({
          total: members.size,
          ok: members.size,
          carried: 0,
          failed: 0,
        });
      } else {
        expect(h.state, `lib/pipeline/ledger.ts: ${h.leagueId}`).toBe('frozen');
        expect(h.reasons.join(' '), `lib/pipeline/ledger.ts: ${h.leagueId}`).toContain('not fetched in this run');
      }
    }
  });

  it('keeps the EAL division classified from the contest flag, with no official schedule', () => {
    const health = snapshot.leagueHealth.find((h) => h.leagueId === LEAGUE)!;
    expect(health.divisions).toHaveLength(1);
    const d = health.divisions[0];
    expect(d.divisionId).toBe(DIVISION);
    expect(d.official, 'lib/pipeline/steps/standings.ts: official').toBeNull();
    expect(d.classification, 'lib/pipeline/steps/classify.ts').toBe('contest-type');
    expect(d.countedFinals, 'lib/pipeline/steps/standings.ts').toBe(divisionGames(snapshot.games, DIVISION).length);
    expect(d.missingLeaguePast, 'lib/standings.ts missingOfficialResults').toBe(missingFromCorpus().length);
  });

  it('read the reported table (members plus the known extra row) and logged no unknown school', () => {
    const standings = corpus.json<{
      data: Array<{ schoolId: string }>;
    }>(`maxpreps/standings/${DIVISION}`);
    const division = LEAGUES.find((l) => l.id === LEAGUE)!.divisions[0];
    const memberRows = standings.data.filter((r) => !Object.hasOwn(division.maxprepsExtraRows, r.schoolId));
    const health = snapshot.leagueHealth.find((h) => h.leagueId === LEAGUE)!.divisions[0];
    expect(health.reportedTable, 'lib/pipeline/steps/reported.ts').toBe('ok');
    // Member rows only, as a carried table counts them; the source row keeps the table as read.
    expect(health.reportedRows, 'lib/pipeline/steps/reported.ts').toBe(memberRows.length);
    expect(memberRows.length, 'lib/pipeline/steps/reported.ts: the table less its extra rows').toBe(
      standings.data.length - Object.keys(division.maxprepsExtraRows).length,
    );
    expect(standings.data.length, 'the corpus standings file').toBe(division.maxprepsTeamCount);
    const source = snapshot.sources.find((s) => s.kind === 'reported-standings');
    expect(source?.status, 'lib/pipeline/steps/reported.ts: source row').toBe('ok');
    expect(source?.rowCount, 'lib/pipeline/steps/reported.ts: source row').toBe(standings.data.length);

    const cli = runFixtureCli({ corpus: EAL_CORPUS });
    expectOk(cli);
    expect(cli.output, 'lib/pipeline/steps/reported.ts: unknown-school warning').not.toMatch(/unknown school/);
  });

  it("computes every team's league W-L-T as MaxPreps' conference W-L-T", () => {
    const standings = corpus.json<{
      data: Array<{
        schoolId: string;
        conferenceWins: number;
        conferenceLosses: number;
        conferenceTies: number;
      }>;
    }>(`maxpreps/standings/${DIVISION}`);
    let checked = 0;
    for (const row of standings.data) {
      const team = members.get(row.schoolId);
      if (!team) continue; // a school in MaxPreps' table that is not a registry team (Red Bluff)
      const s = snapshot.standings.find((x) => x.teamId === team.id);
      expect(s, `lib/standings.ts: no row for ${team.slug}`).toBeDefined();
      expect(
        [s!.computed.w, s!.computed.l, s!.computed.t],
        `lib/standings.ts: ${team.slug} league W-L-T`,
      ).toEqual([row.conferenceWins, row.conferenceLosses, row.conferenceTies]);
      checked += 1;
    }
    expect(checked, 'every registry team has a MaxPreps row').toBe(members.size);
  });
});

describe('the EAL games', () => {
  it('counts the 1 v 1 win as a 1 v 1 win, not a conflict (9afebd05)', () => {
    // A played final does not leave a re-capture: a missing contest is a failure, never a silent pass.
    expect(corpus.hasContest('9afebd05'), 'tests/fixtures/corpus/eal-*: the 9/28 Chico-Davis 1 v 1 game').toBe(true);
    const g = gameOf(snapshot, '9afebd05');
    expect(g, 'lib/normalize.ts: game present').toBeDefined();
    expect(g!.decider, 'lib/normalize.ts: decider').toBe('SO');
    expect(g!.shootout, 'lib/normalize.ts: no tally stored').toBeNull();
    expect(g!.provenance.resultConflict, 'lib/normalize.ts: resultConflict').toBeUndefined();
    expect(g!.countsFor, 'lib/classify.ts').toBe(DIVISION);
    expect(divisionGames(snapshot.games, DIVISION).map((x) => x.contestId)).toContain(g!.contestId);
    const chico = g!.home.slug === 'chico' ? 'home' : 'away';
    expect(g![chico].slug).toBe('chico');
    expect(sideOutcome(g!, chico), 'lib/shared/game.ts sideOutcome').toBe('W');
    expect(g!.home.score, 'level on goals').toBe(g!.away.score);
  });

  it('keeps MaxPreps three overtime periods on the 9/2 game as it has them (8a4d7c70)', () => {
    expect(corpus.hasContest('8a4d7c70'), 'tests/fixtures/corpus/eal-*: the 9/2 PV @ Chico 3-overtime game').toBe(true);
    const g = gameOf(snapshot, '8a4d7c70');
    expect(g, 'lib/normalize.ts: game present').toBeDefined();
    expect(g!.otPeriods, 'lib/normalize.ts: otPeriods').toBe(3);
    expect(g!.decider, 'lib/normalize.ts: decider').toBe('2OT');
  });

  it('counts no game of contestType 2, 4 or 5 in the EAL table', () => {
    const counted = snapshot.games.filter((g) => g.countsFor === DIVISION);
    expect(counted.length).toBeGreaterThan(0);
    for (const g of counted) {
      for (const type of [g.contestTypes.home, g.contestTypes.away]) {
        expect([2, 4, 5], `lib/classify.ts: ${g.contestId}`).not.toContain(type);
      }
    }
  });

  it('never resolves a si.com side to Red Bluff or its placeholder', () => {
    for (const id of IGNORED_SBLIVE_IDS) {
      expect(DATA_QUALITY.sbliveIgnoredTeamIds, `lib/config/leagues.ts: ${id}`).toHaveProperty(id);
      expect(
        TEAMS.some((t) => t.external.sbliveTeamId === id),
        `lib/registry/teams.ts: ${id} is not a registry team`,
      ).toBe(false);
    }
    const sides: SbliveGame['sides'][number][] = [];
    for (const key of Object.keys(manifest.files)) {
      if (!key.startsWith('sblive/')) continue;
      const html = corpus.text(key);
      const rows = key.startsWith('sblive/scores/') ? parseScoresPage(html) : parseTeamGamesPage(html);
      for (const row of rows) sides.push(...row.sides);
    }
    const ignored = sides.filter((s) => s.sbliveTeamId !== null && IGNORED_SBLIVE_IDS.includes(s.sbliveTeamId));
    for (const s of ignored) {
      expect(s.slug, `lib/sources/sblive.ts: ${s.sbliveTeamId}`).toBeNull();
      expect(s.refused, `lib/sources/sblive.ts: ${s.sbliveTeamId}`).toBe('ignored-team');
    }
    expect(JSON.stringify(snapshot.sbliveCrossCheck ?? null), 'lib/backfill.ts: cross-check rows').not.toMatch(
      /Red Bluff|Educational Outreach/,
    );
    expect(
      snapshot.games.some((g) => [g.home, g.away].some((s) => /Red Bluff|Educational Outreach/.test(s.name))),
      'lib/normalize.ts: games',
    ).toBe(false);
  });
});

describe('the EAL through the site read API (lib/data.ts)', () => {
  it('lists exactly the missing league games', () => {
    const expected = missingFromCorpus()
      .map((row) => row.contest.contestId)
      .sort();
    const listed = m.data
      .getMissingOfficialResults(DIVISION)
      .filter((r) => r.kind === 'missing')
      .map((r) => r.game?.contestId ?? '')
      .sort();
    expect(listed, 'lib/standings.ts missingOfficialResults').toEqual(expected);
  });

  it('names no co-leaders on this corpus (Pleasant Valley is alone at the top)', () => {
    // The gating rule (co-leaders are never final while an EAL league result is missing) is tested on a
    // level-top table in tests/data.test.ts ("never calls co-leaders final while an EAL league result is missing").
    expect(m.data.getCoLeaders(DIVISION), 'lib/data.ts getCoLeaders').toBeNull();
  });
});
