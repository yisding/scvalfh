/**
 * The EAL-only live corpus (tests/fixtures/corpus/eal-2026-10-04) through the real cron script: the
 * Eastern Athletic League alone is fetched, so the other four leagues are frozen "not fetched in
 * this run". Every expected value is read from the corpus's own files (the schedule and standings
 * JSON), never written here, so the suite follows a re-capture.
 *
 * Assertion messages name the module that produces the value, so a failure is routed to its owner.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { localDateKey, sideOutcome } from '../../lib/format';
import { DATA_QUALITY, LEAGUES } from '../../lib/leagues';
import { readManifest } from '../../lib/pipeline/corpus';
import { loadSnapshot } from '../../lib/snapshot-schema';
import type { ScheduleRow } from '../../lib/sources/maxpreps';
import { parseScoresPage, parseTeamGamesPage, type SbliveGame } from '../../lib/sources/sblive';
import { divisionGames } from '../../lib/standings';
import { TEAMS, teamsInLeague } from '../../lib/teams';
import type { Game, Snapshot } from '../../lib/types';
import { EAL_CORPUS, corpusDir, corpusRows, corpusSnapshotPath, runFixtureCli } from '../helpers';

type DataModule = typeof import('../../lib/data');

const LEAGUE = 'eal';
const DIVISION = 'eal';
/** si.com ids that are never an EAL team: Red Bluff (varsity bucket, JV) and the CANC placeholder. */
const IGNORED_SBLIVE_IDS = ['490259', '490260', '635037'];

const dir = corpusDir(EAL_CORPUS);
const manifest = readManifest(dir);

/** The path of a corpus resource (every entry of this corpus is a file, not an HTTP status). */
function fileOf(key: string): string {
  const entry = manifest.files[key];
  if (typeof entry !== 'string') throw new Error(`tests/fixtures/corpus/eal-*/manifest.json: ${key} is not a file`);
  return path.resolve(dir, entry);
}
const members = new Map(teamsInLeague(LEAGUE).map((t) => [t.id, t]));

const priorEnv = process.env.SCVAL_SNAPSHOT;
let file: string;
let snapshot: Snapshot;
let data: DataModule;

beforeAll(async () => {
  file = corpusSnapshotPath(EAL_CORPUS);
  snapshot = loadSnapshot(JSON.parse(readFileSync(file, 'utf8')) as unknown);
  process.env.SCVAL_SNAPSHOT = file;
  vi.resetModules();
  data = (await import('../../lib/data')) as DataModule;
});

afterAll(() => {
  if (priorEnv === undefined) delete process.env.SCVAL_SNAPSHOT;
  else process.env.SCVAL_SNAPSHOT = priorEnv;
  vi.resetModules();
});

/** The corpus's schedule rows, one per contest (every game is in both teams' feeds). */
function contests(): ScheduleRow[] {
  const byId = new Map<string, ScheduleRow>();
  for (const row of corpusRows(EAL_CORPUS)) byId.set(row.contest.contestId, row);
  return [...byId.values()];
}

/** League games between two EAL teams that MaxPreps flags, dated before the run's day, not final. */
function missingFromCorpus(): ScheduleRow[] {
  const today = localDateKey(manifest.fetchedAt);
  return contests().filter((row) => {
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

function gameOf(prefix: string): Game | undefined {
  return snapshot.games.find((g) => g.contestId.startsWith(prefix));
}

function corpusHas(prefix: string): boolean {
  return contests().some((row) => row.contest.contestId.startsWith(prefix));
}

describe('the EAL corpus run', () => {
  it('names the EAL alone in its manifest', () => {
    expect(manifest.leagues, 'tests/fixtures/corpus/eal-*/manifest.json').toEqual([LEAGUE]);
  });

  it('publishes five leagues: the EAL fresh, the other four frozen "not fetched in this run"', () => {
    expect(snapshot.season.leagues.map((l) => l.id), 'lib/season-build.ts').toEqual(LEAGUES.map((l) => l.id));
    expect(snapshot.season.leagues, 'lib/season-build.ts').toHaveLength(5);
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
    const standings = JSON.parse(readFileSync(fileOf(`maxpreps/standings/${DIVISION}`), 'utf8')) as {
      data: Array<{ schoolId: string }>;
    };
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
    expect(cli.status, cli.output).toBe(0);
    expect(cli.output, 'lib/pipeline/steps/reported.ts: unknown-school warning').not.toMatch(/unknown school/);
  });

  it("computes every team's league W-L-T as MaxPreps' conference W-L-T", () => {
    const standings = JSON.parse(readFileSync(fileOf(`maxpreps/standings/${DIVISION}`), 'utf8')) as {
      data: Array<{
        schoolId: string;
        conferenceWins: number;
        conferenceLosses: number;
        conferenceTies: number;
      }>;
    };
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
    expect(corpusHas('9afebd05'), 'tests/fixtures/corpus/eal-*: the 9/28 Chico-Davis 1 v 1 game').toBe(true);
    const g = gameOf('9afebd05');
    expect(g, 'lib/normalize.ts: game present').toBeDefined();
    expect(g!.decider, 'lib/normalize.ts: decider').toBe('SO');
    expect(g!.shootout, 'lib/normalize.ts: no tally stored').toBeNull();
    expect(g!.provenance.resultConflict, 'lib/normalize.ts: resultConflict').toBeUndefined();
    expect(g!.countsFor, 'lib/classify.ts').toBe(DIVISION);
    expect(divisionGames(snapshot.games, DIVISION).map((x) => x.contestId)).toContain(g!.contestId);
    const chico = g!.home.slug === 'chico' ? 'home' : 'away';
    expect(g![chico].slug).toBe('chico');
    expect(sideOutcome(g!, chico), 'lib/format.ts sideOutcome').toBe('W');
    expect(g!.home.score, 'level on goals').toBe(g!.away.score);
  });

  it('keeps MaxPreps three overtime periods on the 9/2 game as it has them (8a4d7c70)', () => {
    expect(corpusHas('8a4d7c70'), 'tests/fixtures/corpus/eal-*: the 9/2 PV @ Chico 3-overtime game').toBe(true);
    const g = gameOf('8a4d7c70');
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
      expect(DATA_QUALITY.sbliveIgnoredTeamIds, `lib/leagues.ts: ${id}`).toHaveProperty(id);
      expect(
        TEAMS.some((t) => t.external.sbliveTeamId === id),
        `lib/teams.ts: ${id} is not a registry team`,
      ).toBe(false);
    }
    const sides: SbliveGame['sides'][number][] = [];
    for (const key of Object.keys(manifest.files)) {
      if (!key.startsWith('sblive/')) continue;
      const html = readFileSync(fileOf(key), 'utf8');
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
    const listed = data
      .getMissingOfficialResults(DIVISION)
      .filter((r) => r.kind === 'missing')
      .map((r) => r.game?.contestId ?? '')
      .sort();
    expect(listed, 'lib/standings.ts missingOfficialResults').toEqual(expected);
  });

  it('names no co-leaders on this corpus (Pleasant Valley is alone at the top)', () => {
    // The gating rule (co-leaders are never final while an EAL league result is missing) is tested on a
    // level-top table in tests/data.test.ts ("never calls co-leaders final while an EAL league result is missing").
    expect(data.getCoLeaders(DIVISION), 'lib/data.ts getCoLeaders').toBeNull();
  });
});
