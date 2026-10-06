/**
 * The Southern California live corpus (tests/fixtures/corpus/socal-2026-10-06, captured 2026-10-06T02:33Z,
 * the evening of Oct 5 Pacific, with `--leagues sunset,city,north-county,metro --no-official --no-ccs
 * --no-vnn`) through the real cron script: the Sunset and the San Diego Section's three conferences are
 * fetched, the five NorCal leagues are frozen "not fetched in this run" (DESIGN-socal §2.2).
 *
 * What it pins, each against the corpus's own files wherever the value can be read there:
 *  - the nullable MaxPreps league: the San Diego Valley division has no MaxPreps table, so it has no
 *    league-meta or standings request (never `/leagues/null/v1`) and its health says 'skipped';
 *  - the 'membership' classification (lib/classify.ts): a San Diego game counts for a division when both
 *    sides are members, neither row is a tournament or postseason row, and it is dated inside leaguePlay,
 *    whatever MaxPreps' league flag says (Patrick Henry: MaxPreps flags none of its league games);
 *  - the section shootout: a level San Diego final MaxPreps marks W and L is a shootout win (decider 'SO'),
 *    across conferences too; a level Sunset game stays level;
 *  - a league-flagged game between two divisions of one conference counts in neither table, with a note;
 *  - the missing-league-result rows, computed here from the corpus by the membership rule.
 *
 * Assertion messages name the module that produces the value, so a failure is routed to its owner.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { localDateKey, sideOutcome } from '../../lib/format';
import { DATA_QUALITY, LEAGUES, getDivision, getLeague, getSection } from '../../lib/leagues';
import { readManifest } from '../../lib/pipeline/corpus';
import { NO_MAXPREPS_TABLE_REASON } from '../../lib/pipeline/steps/league-meta';
import { loadSnapshot } from '../../lib/snapshot-schema';
import { ScheduleResponseSchema, type ScheduleRow } from '../../lib/sources/maxpreps';
import { parseScoresPage, parseTeamGamesPage } from '../../lib/sources/sblive';
import { divisionGames } from '../../lib/standings';
import { TEAMS, getTeamBySlug, teamsInDivision, teamsInLeague } from '../../lib/teams';
import type { Game, Snapshot } from '../../lib/types';
import { CORPUS_ROOT, SOCAL_CORPUS, corpusSnapshotPath, runFixtureCli, stubCorpusSnapshot } from '../helpers';

/**
 * The freeze reason of a league not in this run (lib/pipeline/steps/guards.ts notInRunReason): '<SHORT> was
 * not fetched in this run.', and for the Southern Section independents, whose short name is an adjective,
 * the group by name with a plural verb (DESIGN §24.9).
 */
function notFetchedReason(id: Parameters<typeof getLeague>[0]): string {
  return id === 'independents'
    ? 'The Southern Section independents were not fetched in this run.'
    : `${getLeague(id).shortName} was not fetched in this run.`;
}

type DataModule = typeof import('../../lib/data');

const SOCAL = ['sunset', 'city', 'north-county', 'metro'] as const;
const NORCAL = ['scval', 'bval', 'pcal', 'mcal', 'eal'] as const;

const dir = path.join(CORPUS_ROOT, SOCAL_CORPUS);
const present = existsSync(path.join(dir, 'manifest.json'));
const manifest = present ? readManifest(dir) : null;

/** The path of a corpus resource (every entry of this corpus is a file, not an HTTP status). */
function fileOf(key: string): string {
  const entry = manifest?.files[key];
  if (typeof entry !== 'string') throw new Error(`tests/fixtures/corpus/socal-*/manifest.json: ${key} is not a file`);
  return path.resolve(dir, entry);
}

/** Every schedule row of the corpus, one per contest (a game between two of ours is in both feeds). */
function contests(): ScheduleRow[] {
  const byId = new Map<string, ScheduleRow>();
  for (const key of Object.keys(manifest?.files ?? {})) {
    if (!key.startsWith('maxpreps/schedule/')) continue;
    const rows = ScheduleResponseSchema.parse(JSON.parse(readFileSync(fileOf(key), 'utf8')) as unknown).data;
    for (const row of rows) byId.set(row.contest.contestId, row);
  }
  return [...byId.values()];
}

/** San Diego division games by the membership rule, read off the corpus rows (not off our snapshot). */
function membershipRows(division: string): ScheduleRow[] {
  const d = getDivision(division);
  const league = getLeague(d.leagueId);
  const members = new Set(teamsInDivision(division).map((t) => t.id));
  return contests().filter((row) => {
    const sides = row.contest.teams;
    const date = row.contest.date.slice(0, 10);
    return (
      row.contest.isDeleted !== true &&
      sides.length === 2 &&
      sides.every((s) => s.teamId !== null && members.has(s.teamId) && !s.isDeleted) &&
      sides.every((s) => s.contestType === null || !league.rules.excludeContestTypes.includes(s.contestType)) &&
      date >= d.leaguePlay.first &&
      date <= d.leaguePlay.last
    );
  });
}

let snapshot: Snapshot;
let data: DataModule;

const describeIfCaptured = present ? describe : describe.skip;

if (present) stubCorpusSnapshot(SOCAL_CORPUS);

beforeAll(async () => {
  if (!present) return;
  snapshot = loadSnapshot(JSON.parse(readFileSync(corpusSnapshotPath(SOCAL_CORPUS), 'utf8')) as unknown);
  data = (await import('../../lib/data')) as DataModule;
}, 600_000);

function gameOf(prefix: string): Game | undefined {
  return snapshot.games.find((g) => g.contestId.startsWith(prefix));
}

describeIfCaptured('the SoCal corpus run', () => {
  it('names the four Southern California leagues in its manifest, and holds no Valley table', () => {
    expect(manifest?.leagues, 'tests/fixtures/corpus/socal-*/manifest.json').toEqual([...SOCAL]);
    const keys = Object.keys(manifest?.files ?? {});
    expect(keys.filter((k) => k.startsWith('maxpreps/league-meta/')).sort()).toEqual(
      LEAGUES.filter((l) => (SOCAL as readonly string[]).includes(l.id))
        .flatMap((l) => l.divisions)
        .filter((d) => d.maxprepsLeagueId !== null)
        .map((d) => `maxpreps/league-meta/${d.id}`)
        .sort(),
    );
    expect(keys).not.toContain('maxpreps/league-meta/valley');
    expect(keys).not.toContain('maxpreps/standings/valley');
    expect(keys.filter((k) => k.startsWith('maxpreps/schedule/'))).toHaveLength(50);
  });

  it('publishes the four SoCal leagues fresh with every feed read, the five NorCal leagues and the independents frozen', () => {
    expect(snapshot.teams, 'lib/pipeline/steps/assemble.ts').toHaveLength(TEAMS.length);
    // The corpus was captured before the Southern Section independents joined the registry (DESIGN §24.9): it
    // has no feed of theirs, so the group is "not fetched in this run" here.
    expect(snapshot.leagueHealth.map((h) => `${h.leagueId}:${h.state}`), 'lib/pipeline/steps/standings.ts').toEqual([
      ...NORCAL.map((id) => `${id}:frozen`),
      ...SOCAL.map((id) => `${id}:fresh`),
      'independents:frozen',
    ]);
    for (const h of snapshot.leagueHealth) {
      if ((NORCAL as readonly string[]).includes(h.leagueId) || h.leagueId === 'independents') {
        expect(h.reasons, `lib/pipeline/ledger.ts: ${h.leagueId}`).toEqual([notFetchedReason(h.leagueId)]);
        continue;
      }
      const n = teamsInLeague(h.leagueId).length;
      expect(h.reasons, `lib/pipeline/steps/standings.ts: ${h.leagueId}`).toEqual([]);
      expect(h.teamFeeds, `lib/pipeline/steps/schedules.ts: ${h.leagueId}`).toEqual({ total: n, ok: n, carried: 0, failed: 0 });
    }
  });

  it('asks MaxPreps for 1 + 2 × 7 division tables + 48 schedules = 63 resources, never /leagues/null/', () => {
    const cli = runFixtureCli({ corpus: SOCAL_CORPUS });
    expect(cli.status, cli.output).toBe(0);
    const urls = cli.output.split('\n').filter((l) => l.startsWith('maxpreps GET '));
    const withTable = LEAGUES.filter((l) => (SOCAL as readonly string[]).includes(l.id))
      .flatMap((l) => l.divisions)
      .filter((d) => d.maxprepsLeagueId !== null);
    expect(withTable).toHaveLength(7);
    // 48 schedules: the four leagues' teams. Bonita and Chaminade are independents (DESIGN §24.10), a league not in
    // this run, so their captured schedules are not read; their games reach the snapshot from their opponents' feeds.
    expect(urls, 'lib/pipeline/transport.ts').toHaveLength(1 + 2 * withTable.length + 48);
    expect(cli.output, 'lib/pipeline/transport.ts').not.toContain('/leagues/null/');
    expect(cli.output, 'lib/pipeline/steps/league-meta.ts').toContain(`league metadata valley: skipped (${NO_MAXPREPS_TABLE_REASON})`);
    expect(cli.output, 'lib/pipeline/steps/reported.ts').toContain(`standings valley: skipped (${NO_MAXPREPS_TABLE_REASON})`);
    expect(cli.stdout).toMatch(/ · leagues scval:frozen bval:frozen pcal:frozen mcal:frozen eal:frozen sunset:fresh city:fresh north-county:fresh metro:fresh independents:frozen$/m);
    expect(cli.output, 'lib/pipeline/steps/reported.ts: unknown-school warning').not.toMatch(/unknown school/);
  });

  it('publishes per-league counts (the frozen NorCal leagues hold only the SoCal feeds’ games against them)', () => {
    expect(snapshot.counts.byLeague, 'lib/snapshot-migrate.ts countsOf').toEqual({
      scval: { teams: 15, games: 10, leagueGames: 0, finals: 5, backfilled: 0 },
      bval: { teams: 12, games: 0, leagueGames: 0, finals: 0, backfilled: 0 },
      pcal: { teams: 7, games: 0, leagueGames: 0, finals: 0, backfilled: 0 },
      mcal: { teams: 9, games: 4, leagueGames: 0, finals: 2, backfilled: 0 },
      eal: { teams: 6, games: 1, leagueGames: 0, finals: 0, backfilled: 0 },
      sunset: { teams: 8, games: 99, leagueGames: 15, finals: 83, backfilled: 0 },
      city: { teams: 12, games: 164, leagueGames: 60, finals: 111, backfilled: 0 },
      'north-county': { teams: 19, games: 244, leagueGames: 102, finals: 159, backfilled: 0 },
      metro: { teams: 9, games: 93, leagueGames: 31, finals: 59, backfilled: 0 },
      // Not in the run: the Sunset and San Diego feeds' 34 games against the five independents (32 final), none
      // counted for the group's table (which counts games between two of the five: Bonita–Chaminade is in neither
      // team's feed here, both being out of the run, and the frozen league keeps no counted games).
      independents: { teams: 5, games: 34, leagueGames: 0, finals: 32, backfilled: 0 },
    });
  });
});

describeIfCaptured('the San Diego Valley division: MaxPreps publishes no table', () => {
  it('has meta and reported table skipped, no reported rows, and no MaxPreps source row', () => {
    expect(getDivision('valley').maxprepsLeagueId, 'lib/leagues.ts').toBeNull();
    const valley = snapshot.leagueHealth.flatMap((h) => h.divisions).find((d) => d.divisionId === 'valley');
    expect(valley, 'lib/pipeline/steps/standings.ts').toMatchObject({
      meta: 'skipped',
      reportedTable: 'skipped',
      reportedRows: null,
      classification: 'membership',
      official: null,
    });
    const valleySources = snapshot.sources.filter((s) => s.scope?.division === 'valley');
    expect(valleySources.length, 'its six team schedules').toBe(6);
    expect(
      valleySources.filter((s) => s.kind === 'league-meta' || s.kind === 'reported-standings'),
      'lib/pipeline/steps/reported.ts',
    ).toEqual([]);
    expect(snapshot.standings.filter((s) => s.division === 'valley').every((s) => s.reported === null)).toBe(true);
    expect(snapshot.crossCheck.filter((r) => getTeamBySlug(r.slug)?.division === 'valley'), 'lib/standings.ts buildCrossCheck').toEqual(
      [],
    );
  });

  it('reads every other SoCal table, members only (known extra rows skipped)', () => {
    for (const d of LEAGUES.filter((l) => (SOCAL as readonly string[]).includes(l.id)).flatMap((l) => l.divisions)) {
      if (d.maxprepsLeagueId === null) continue;
      const table = JSON.parse(readFileSync(fileOf(`maxpreps/standings/${d.id}`), 'utf8')) as { data: Array<{ schoolId: string }> };
      const members = new Set(teamsInDivision(d.id).map((t) => t.id));
      const health = snapshot.leagueHealth.flatMap((h) => h.divisions).find((x) => x.divisionId === d.id)!;
      expect(health.meta, `lib/pipeline/steps/league-meta.ts: ${d.id}`).toBe('ok');
      expect(health.reportedTable, `lib/pipeline/steps/reported.ts: ${d.id}`).toBe('ok');
      expect(health.reportedRows, `lib/pipeline/steps/reported.ts: ${d.id}`).toBe(
        table.data.filter((r) => members.has(r.schoolId)).length,
      );
      expect(table.data.length, `the corpus standings file vs maxprepsTeamCount: ${d.id}`).toBe(d.maxprepsTeamCount);
    }
  });
});

describeIfCaptured('the membership classification (the San Diego divisions)', () => {
  // The Southern Section independents are a membership division too (DESIGN §24.10), but not in this run.
  const SDS_DIVISIONS = LEAGUES.filter((l) => l.rules.classification === 'membership' && (SOCAL as readonly string[]).includes(l.id)).flatMap(
    (l) => l.divisions,
  );

  it('reports membership for every San Diego division and contest-type for the Sunset', () => {
    for (const h of snapshot.leagueHealth.filter((x) => (SOCAL as readonly string[]).includes(x.leagueId))) {
      for (const d of h.divisions) {
        expect(d.classification, `lib/pipeline/steps/guards.ts: ${d.divisionId}`).toBe(h.leagueId === 'sunset' ? 'contest-type' : 'membership');
        expect(d.official, d.divisionId).toBeNull();
      }
    }
    expect(SDS_DIVISIONS.map((d) => d.id)).toEqual([
      'city-western',
      'city-eastern',
      'avocado',
      'palomar',
      'valley',
      'metro-mesa',
      'metro-south-bay',
    ]);
  });

  it('counts exactly the games between two members inside leaguePlay, whatever MaxPreps’ league flag says', () => {
    for (const d of SDS_DIVISIONS) {
      const expected = membershipRows(d.id)
        .map((r) => r.contest.contestId)
        // The duplicate scheduled rows config excludes (Fallbrook–Poway c7dbdbcc, Fallbrook–Mission Vista 9c027452).
        .filter((id) => !Object.hasOwn(DATA_QUALITY.excludedContestIds, id))
        .sort();
      const counted = snapshot.games
        .filter((g) => g.countsFor === d.id)
        .map((g) => g.contestId)
        .sort();
      expect(counted, `lib/classify.ts: ${d.id}`).toEqual(expected);
    }
  });

  it('is a double round robin on MaxPreps’ schedules, except Metro Mesa’s one Bonita Vista–Helix game', () => {
    const shape = SDS_DIVISIONS.map((d) => {
      const n = teamsInDivision(d.id).length;
      return `${d.id}:${snapshot.games.filter((g) => g.countsFor === d.id).length}/${n * (n - 1)}`;
    });
    // On Oct 5 MaxPreps schedules Bonita Vista and Helix once (Oct 23, b9d43b5d): 19 of 20.
    expect(shape, 'lib/classify.ts').toEqual([
      'city-western:30/30',
      'city-eastern:30/30',
      'avocado:30/30',
      'palomar:42/42',
      'valley:30/30',
      'metro-mesa:19/20',
      'metro-south-bay:12/12',
    ]);
  });

  it('counts all ten of Patrick Henry’s City Eastern games although MaxPreps flags none as a league game', () => {
    const ph = getTeamBySlug('patrick-henry')!;
    const eastern = new Set(teamsInDivision('city-eastern').map((t) => t.slug));
    const games = snapshot.games.filter((g) => g.home.slug === ph.slug || g.away.slug === ph.slug);
    const divisionGamesOfPh = games.filter((g) => eastern.has(g.home.slug!) && eastern.has(g.away.slug!));
    expect(divisionGamesOfPh, 'lib/normalize.ts').toHaveLength(10);
    for (const g of divisionGamesOfPh) {
      expect(g.isLeague, `MaxPreps' flag: ${g.contestId}`).toBe(false);
      expect(g.countsFor, `lib/classify.ts: ${g.contestId}`).toBe('city-eastern');
    }
    for (const g of games.filter((x) => !divisionGamesOfPh.includes(x))) {
      expect(g.countsFor, `lib/classify.ts: ${g.contestId}`).toBeNull();
    }
    // MaxPreps' City Eastern table leaves Patrick Henry out (config: maxprepsMissing), so it has no reported row.
    expect(getDivision('city-eastern').maxprepsMissing).toContain('patrick-henry');
    expect(snapshot.standings.find((s) => s.slug === 'patrick-henry')?.reported, 'lib/pipeline/steps/reported.ts').toBeNull();
  });

  it('counts a league-flagged game between City Western and City Eastern in neither table, and says why', () => {
    const note = 'MaxPreps marks this as a league game; it is between two divisions of the City Conference, so it counts in neither table.';
    const mb = snapshot.games.filter(
      (g) =>
        (g.home.slug === 'mission-bay' || g.away.slug === 'mission-bay') &&
        [g.home.slug, g.away.slug].some((s) => getTeamBySlug(s ?? '')?.division === 'city-eastern'),
    );
    const flagged = mb.filter((g) => g.isLeague);
    expect(flagged, 'lib/normalize.ts: Mission Bay’s league-flagged City Eastern games').toHaveLength(5);
    for (const g of flagged) {
      expect(g.countsFor, `lib/classify.ts: ${g.contestId}`).toBeNull();
      expect(g.provenance.classificationNote, `lib/classify.ts crossDivisionNote: ${g.contestId}`).toBe(note);
    }
  });
});

describeIfCaptured('the section shootout and level games', () => {
  /** Finals between two San Diego Section teams with a level score that MaxPreps marks W and L. */
  function levelWithResult(): Game[] {
    return snapshot.games.filter((g) => {
      const [h, a] = [getTeamBySlug(g.home.slug ?? ''), getTeamBySlug(g.away.slug ?? '')];
      return (
        g.status === 'final' &&
        h?.section === 'sds' &&
        a?.section === 'sds' &&
        g.home.score === g.away.score &&
        g.home.result !== null &&
        g.home.result !== 'T'
      );
    });
  }

  it('decides a level San Diego final MaxPreps marks W and L as a shootout win, across conferences too', () => {
    expect(getSection('sds').shootout, 'lib/leagues.ts').not.toBeNull();
    const games = levelWithResult();
    // The eight in the design inventory (Clairemont–Eastlake 9/1 … Westview–San Pasqual 10/2).
    expect(games.map((g) => g.contestId.slice(0, 8)).sort(), 'lib/normalize.ts').toEqual(
      ['f99ce5ed', '7551a71d', 'ce29e835', 'd8aad805', 'ae312fa8', 'e6488575', '829af66a', 'fb944ba7'].sort(),
    );
    for (const g of games) {
      expect(g.decider, `lib/normalize.ts: ${g.contestId}`).toBe('SO');
      expect(g.shootout, `lib/normalize.ts: no tally stored: ${g.contestId}`).toBeNull();
      expect(g.provenance.resultConflict, `lib/normalize.ts: ${g.contestId}`).toBeUndefined();
      const winner = g.home.result === 'W' ? 'home' : 'away';
      expect(sideOutcome(g, winner), `lib/format.ts sideOutcome: ${g.contestId}`).toBe('W');
      expect(sideOutcome(g, winner === 'home' ? 'away' : 'home'), `lib/format.ts sideOutcome: ${g.contestId}`).toBe('L');
    }
    // Clairemont (City) – Eastlake (Metro), Sep 1: two conferences, one section.
    expect(gameOf('f99ce5ed')).toMatchObject({ decider: 'SO', home: { slug: 'clairemont' }, away: { slug: 'eastlake' } });
    // Westview–San Pasqual, Oct 2: a Valley game, counted as San Pasqual's win.
    const valley = gameOf('fb944ba7')!;
    expect(valley.countsFor, 'lib/classify.ts').toBe('valley');
    expect(divisionGames(snapshot.games, 'valley').map((g) => g.contestId)).toContain(valley.contestId);
    expect(sideOutcome(valley, valley.home.slug === 'san-pasqual' ? 'home' : 'away')).toBe('W');
  });

  it('never decides a level Sunset game by shootout: the Southern Section has no shootout rule', () => {
    expect(getSection('ss').shootout, 'lib/leagues.ts').toBeNull();
    const sunset = new Set(teamsInLeague('sunset').map((t) => t.slug));
    const level = snapshot.games.filter(
      (g) => g.status === 'final' && sunset.has(g.home.slug ?? '') && sunset.has(g.away.slug ?? '') && g.home.score === g.away.score,
    );
    expect(level.length, 'the corpus: Sunset games that ended level').toBeGreaterThan(0);
    for (const g of level) expect(g.decider, `lib/normalize.ts: ${g.contestId}`).not.toBe('SO');
  });
});

describeIfCaptured('missing league results and the si.com sides', () => {
  it('lists exactly the league games dated before the run’s day with no result, per division', () => {
    const today = localDateKey(manifest!.fetchedAt);
    for (const l of LEAGUES.filter((x) => (SOCAL as readonly string[]).includes(x.id))) {
      for (const d of l.divisions) {
        const rows =
          l.rules.classification === 'membership'
            ? membershipRows(d.id)
            : contests().filter((row) => {
                const members = new Set(teamsInDivision(d.id).map((t) => t.id));
                return (
                  row.contest.isDeleted !== true &&
                  row.contest.teams.length === 2 &&
                  row.contest.teams.every((s) => s.teamId !== null && members.has(s.teamId) && s.contestType === 0)
                );
              });
        const expected = rows
          .filter((r) => r.contest.date.slice(0, 10) < today && r.calculatedFields.contestState !== 4)
          .map((r) => r.contest.contestId)
          .sort();
        const listed = data
          .getMissingOfficialResults(d.id)
          .filter((r) => r.kind === 'missing')
          .map((r) => r.game?.contestId ?? '')
          .sort();
        expect(listed, `lib/standings.ts missingOfficialResults: ${d.id}`).toEqual(expected);
        const health = data.getLeagueHealth(l.id).divisions.find((x) => x.divisionId === d.id)!;
        expect(health.missingLeaguePast, `lib/pipeline/steps/standings.ts: ${d.id}`).toBe(listed.length);
      }
    }
  });

  it('resolves no si.com side to a school outside the registry; the unresolved ones are the independents', () => {
    const unresolved = new Set<string>();
    for (const key of Object.keys(manifest!.files)) {
      if (!key.startsWith('sblive/')) continue;
      const html = readFileSync(fileOf(key), 'utf8');
      const rows = key.startsWith('sblive/scores/') ? parseScoresPage(html) : parseTeamGamesPage(html);
      for (const row of rows) {
        for (const s of row.sides) {
          if (s.slug) expect(getTeamBySlug(s.slug), `lib/sources/sblive.ts: ${s.name}`).toBeDefined();
          else unresolved.add(s.name);
        }
      }
    }
    // York (JV only) and the EAL's si.com placeholder: none of the si.com phantoms of the league buckets
    // (Westlake, Los Alamitos, Madison, Santana, Castle Park, Chula Vista, …) appears on a captured scoreboard or
    // team page. Glendora, Harvard-Westlake and Thousand Oaks resolve now: they are the registry's independents.
    expect([...unresolved].sort(), 'lib/sources/sblive.ts').toEqual(['Educational Outreach Academy', 'York'].sort());
  });
});

