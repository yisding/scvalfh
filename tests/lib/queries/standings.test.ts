/**
 * lib/queries/standings.ts: standings and the facts derived from them, against the committed v1 golden snapshot
 * migrated to v2 (tests/support/golden-queries.ts); then an EAL table and the Southern California tables with
 * results, read from a second snapshot (the same file plus a few synthetic games, a fresh module instance).
 */

import { writeFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';

import { getLeague } from '@/lib/config/leagues';
import { buildSeason } from '@/lib/engine/season-record';
import { computeStandings } from '@/lib/engine/standings';
import type { Game } from '@/lib/model/game';
import type { Snapshot } from '@/lib/model/snapshot';
import { getTeamBySlug } from '@/lib/registry/teams';
import { loadSnapshot } from '@/lib/snapshot/load';
import { countsOf } from '@/lib/snapshot/migrate';
import { withSnapshotModules } from '@/tests/support/corpus-modules';
import { game } from '@/tests/support/game-builder';
import { loadQueries } from '@/tests/support/queries';
import { tempFile, goldenPath, readJson } from '@/tests/support/repo';
import { goldenQueries, regionPhase } from '@/tests/support/golden-queries';

describe('data: standings and derived facts', () => {
  it('returns a division table in finishing order', () => {
    const table = goldenQueries.data.getStandings('de-anza');
    expect(table.length).toBe(7);
    for (let i = 1; i < table.length; i += 1) {
      expect(table[i].computed.place).toBeGreaterThanOrEqual(table[i - 1].computed.place);
    }
    expect(Object.keys(goldenQueries.data.getAllStandings())).toEqual([
      'de-anza', 'el-camino', 'mt-hamilton', 'santa-teresa', 'pcal', 'marin-county', 'eal',
      'sunset', 'city-western', 'city-eastern', 'avocado', 'palomar', 'valley', 'metro-mesa', 'metro-south-bay',
      'independents',
    ]);
    expect(goldenQueries.data.getStandingFor('leigh')?.hasReportedResults).toBe(false);
  });

  it('exposes a per-division goal-differential domain', () => {
    expect(goldenQueries.data.getGoalDiffDomain('de-anza')).toBeGreaterThan(0);
    expect(goldenQueries.data.getGoalDiffDomain('marin-county')).toBe(1);
  });

  it('derives GP, games left, max points and missing results per row', () => {
    const ctx = goldenQueries.data.getStandingContext('de-anza');
    expect(ctx.size).toBe(7);
    for (const row of goldenQueries.data.getStandings('de-anza')) {
      const c = ctx.get(row.teamId)!;
      expect(c.scheduled).toBe(12);
      expect(c.counted).toBe(row.computed.gp);
      expect(c.remaining).toBe(Math.max(0, 12 - row.computed.gp));
      expect(c.maxPts).toBe(row.computed.pts + 3 * c.remaining!);
      expect(c.backfilled).toBe(0);
    }
    // The Sep 9 Homestead–Cupertino fixture MaxPreps never published is past and missing.
    const cupertino = getTeamBySlug('cupertino')!;
    const homestead = getTeamBySlug('homestead')!;
    expect(ctx.get(cupertino.id)!.missingPast).toBeGreaterThanOrEqual(1);
    expect(ctx.get(homestead.id)!.missingPast).toBeGreaterThanOrEqual(1);
    const mcal = goldenQueries.data.getStandingContext('marin-county');
    for (const c of mcal.values()) {
      expect([c.scheduled, c.counted, c.remaining, c.maxPts]).toEqual([16, 0, 16, 48]);
    }
    // The Sunset has no fixed schedule (gamesPerTeam null): no "of N", no LEFT, no MAX.
    const sunset = goldenQueries.data.getStandingContext('sunset');
    expect(sunset.size).toBe(8);
    for (const c of sunset.values()) expect([c.scheduled, c.counted, c.remaining, c.maxPts]).toEqual([null, 0, null, null]);
    // A San Diego division plays a double round robin: Palomar's seven teams play 12 each.
    for (const c of goldenQueries.data.getStandingContext('palomar').values()) {
      expect([c.scheduled, c.counted, c.remaining, c.maxPts]).toEqual([12, 0, 12, 36]);
    }
  });

  it('lists missing official results with the si.com note slot', () => {
    const missing = goldenQueries.data.getMissingOfficialResults('de-anza');
    expect(missing.length).toBeGreaterThanOrEqual(1);
    expect(missing[0].dateKey).toBe('2026-09-09');
    expect(missing[0].kind).toBe('missing');
    expect(missing[0].game).toBeNull();
    for (const m of missing) expect(m).toHaveProperty('sblive');
    // Before Sep 9 nothing is missing yet.
    expect(goldenQueries.data.getMissingOfficialResults('de-anza', '2026-09-05T19:00:00.000Z')).toEqual([]);
    expect(goldenQueries.data.getMissingOfficialResults('pcal')).toEqual([]);
  });

  it('reports co-leaders only when two teams are level at the top', () => {
    for (const d of ['de-anza', 'el-camino', 'mt-hamilton', 'marin-county']) {
      const co = goldenQueries.data.getCoLeaders(d);
      if (co === null) continue;
      expect(co.teams.length).toBeGreaterThanOrEqual(2);
      expect(co.final).toBe(false);
      expect(co.label).toBe('Level on points at the top');
    }
    expect(goldenQueries.data.getCoLeaders('marin-county')).toBeNull();
  });

  it('measures the games-played spread', () => {
    const spread = goldenQueries.data.getGamesPlayedSpread('el-camino');
    expect(spread.scheduled).toBe(14);
    expect(spread.max).toBeGreaterThanOrEqual(spread.min);
    expect(goldenQueries.data.getGamesPlayedSpread('pcal')).toEqual({ min: 0, max: 0, scheduled: 12 });
    expect(goldenQueries.data.getGamesPlayedSpread('sunset')).toEqual({ min: 0, max: 0, scheduled: null });
  });
});

// ---------------------------------------------------------------- EAL with results

/**
 * The same golden snapshot plus a few synthetic EAL league games (dated around the snapshot's
 * 2026-10-02 stamp), with the EAL standings, window and counts recomputed and the whole file
 * re-validated by loadSnapshot. Chico beat Davis on 1 v 1s (1-1, flagged W/L) and Pleasant Valley
 * beat Lassen, so the two are level on 3 points at the top; Pleasant Valley at Corning (Sep 29) is
 * past with no score, and Davis–Pleasant Valley (Oct 28) is still to come.
 */
describe('data: an EAL table with results', () => {
  let eal: typeof goldenQueries.data;
  let pending: Game;

  beforeAll(async () => {
    const raw = readJson(goldenPath('snapshot-2026-10-02.v1.json')) as unknown;
    const base = loadSnapshot(raw);
    pending = game({ home: 'corning', away: 'pleasant-valley', date: '2026-09-29', status: 'score-pending' });
    const added = [
      game({ home: 'chico', away: 'davis', hs: 1, as: 1, date: '2026-09-28', results: { home: 'W', away: 'L' } }),
      game({ home: 'pleasant-valley', away: 'lassen', hs: 2, as: 0, date: '2026-09-21' }),
      pending,
      game({ home: 'davis', away: 'pleasant-valley', date: '2026-10-28' }),
    ];
    const games = [...base.games, ...added];
    const ealRows = new Map(
      computeStandings(games, { reported: new Map() })
        .filter((r) => r.division === 'eal')
        .map((r) => [r.teamId, r]),
    );
    const standings = base.standings.map((r) => ealRows.get(r.teamId) ?? r);
    const season = buildSeason(games);
    const next: Snapshot = {
      ...base,
      games,
      standings,
      season: {
        ...base.season,
        leagues: base.season.leagues.map((l) => (l.id === 'eal' ? season.leagues.find((x) => x.id === 'eal')! : l)),
        window: season.window,
      },
      counts: countsOf(games, standings),
    };
    const file = tempFile('data-eal', 'snapshot.json');
    writeFileSync(file, JSON.stringify(loadSnapshot(next)));
    eal = (await withSnapshotModules(file, { data: loadQueries })).modules.data;
  });

  it('counts the 1 v 1 win for Chico in the table and in both forms', () => {
    const table = eal.getStandings('eal');
    const rec = (slug: string) => {
      const c = table.find((r) => r.slug === slug)!.computed;
      return [c.w, c.l, c.t, c.pts, c.gf, c.ga];
    };
    expect(rec('chico')).toEqual([1, 0, 0, 3, 1, 1]);
    expect(rec('davis')).toEqual([0, 1, 0, 0, 1, 1]);
    expect(eal.getTeamForm('chico')!.leagueGames.find((g) => g.status === 'final')?.outcome).toBe('W');
    const davis = eal.getTeamForm('davis')!.leagueGames.find((g) => g.status === 'final')!;
    expect([davis.outcome, davis.margin]).toEqual(['L', 0]);
    const h2h = eal.getHeadToHead('chico', 'davis')!;
    expect([h2h.aRecord, h2h.bRecord]).toEqual([{ w: 1, l: 0, t: 0 }, { w: 0, l: 1, t: 0 }]);
  });

  it('lists the past EAL game with no score as a missing league result', () => {
    const missing = eal.getMissingOfficialResults('eal');
    expect(missing.map((m) => [m.kind, m.dateKey, m.game?.contestId, m.homeSlug, m.awaySlug])).toEqual([
      ['missing', '2026-09-29', pending.contestId, 'corning', 'pleasant-valley'],
    ]);
    expect(missing[0].sblive).toBeNull();
    const ctx = eal.getStandingContext('eal');
    expect(ctx.get(getTeamBySlug('corning')!.id)!.missingPast).toBe(1);
    expect(ctx.get(getTeamBySlug('chico')!.id)!.missingPast).toBe(0);
    // Once Oct 28 has passed, the unplayed Davis–Pleasant Valley game is missing too.
    expect(eal.getMissingOfficialResults('eal', '2026-10-29T19:00:00.000Z').map((m) => m.dateKey)).toEqual([
      '2026-09-29', '2026-10-28',
    ]);
  });

  it('never calls co-leaders final while an EAL league result is missing', () => {
    const now = eal.getCoLeaders('eal')!;
    expect(now.teams.map((t) => t.slug)).toEqual(['chico', 'pleasant-valley']);
    expect(now.final).toBe(false);
    // After league play the phase allows it; the missing results still hold it back.
    expect(eal.getSeasonPhase('eal', '2026-10-29T19:00:00.000Z')).toBe('tournament');
    const later = eal.getCoLeaders('eal', '2026-10-29T19:00:00.000Z')!;
    expect(later.final).toBe(false);
    expect(later.label).toBe('Level on points at the top');
  });

  it('writes the Super Regional line for a placed EAL team, and none for one without results', () => {
    expect(eal.getTeamPostseasonLine('chico')).toEqual({
      label: 'Super Regional place',
      sentence: 'The top six schools play the Super Regional, Oct 30–31; its format and site are not published yet.',
      href: '/playoffs#eal',
      linkText: 'Postseason',
    });
    expect(eal.getTeamPostseasonLine('bella-vista')).toBeNull();
  });
});

// ---------------------------------------------------------------- Southern California with results

/**
 * The same golden snapshot plus synthetic Southern California games, the SoCal standings, windows and
 * counts recomputed and the file re-validated by loadSnapshot (DESIGN-socal §2.1.7). City Western:
 * La Jolla beat Scripps Ranch (flagged) and Bishop's beat Canyon Hills in a shootout (0-0 flagged W/L,
 * NOT flagged a league game: membership counts it anyway). City Eastern: Patrick Henry–Point Loma (Sep 29,
 * unflagged, no score) is a missing league result. Mission Bay–Clairemont is flagged between two City
 * divisions: neither table. North County: Mt. Carmel–Poway is an Avocado–Palomar game, no table. Metro South
 * Bay plays its first game Oct 7. The Sunset: Temecula Valley has played three of the eight, Marina, Edison and
 * Chaparral one each, so the spread is 0 to 3 with no fixed schedule. The independents (DESIGN §24.10): Bonita
 * at Great Oak is flagged by MaxPreps but counts for neither table; Harvard-Westlake–Glendora counts for the
 * group's table though MaxPreps marks it non-league.
 */
describe('data: Southern California tables with results', () => {
  let socal: typeof goldenQueries.data;
  let henry: Game;
  let crossDivision: Game;

  beforeAll(async () => {
    const raw = readJson(goldenPath('snapshot-2026-10-02.v1.json')) as unknown;
    const base = loadSnapshot(raw);
    henry = game({ home: 'patrick-henry', away: 'point-loma', date: '2026-09-29', status: 'score-pending', league: false });
    crossDivision = game({ home: 'mission-bay', away: 'clairemont', hs: 1, as: 2, date: '2026-09-16' });
    const added = [
      game({ home: 'la-jolla', away: 'scripps-ranch', hs: 2, as: 1, date: '2026-09-15' }),
      game({ home: 'bishops', away: 'canyon-hills', hs: 0, as: 0, date: '2026-09-22', league: false, results: { home: 'W', away: 'L' } }),
      henry,
      crossDivision,
      game({ home: 'mt-carmel', away: 'poway', hs: 0, as: 0, date: '2026-09-11', results: { home: 'W', away: 'L' } }),
      game({ home: 'hilltop', away: 'southwest', date: '2026-10-07' }),
      game({ home: 'temecula-valley', away: 'marina', hs: 9, as: 0, date: '2026-09-28' }),
      game({ home: 'edison', away: 'temecula-valley', hs: 0, as: 2, date: '2026-10-01' }),
      game({ home: 'temecula-valley', away: 'chaparral', hs: 7, as: 0, date: '2026-10-05' }),
      // The LA independents (DESIGN §24.10): a game between two of the five counts for the group's
      // table whatever MaxPreps' flag says; a flagged game against a Sunset team counts for neither.
      game({ home: 'harvard-westlake', away: 'glendora', hs: 5, as: 0, date: '2026-09-08', league: false }),
      game({ home: 'great-oak', away: 'bonita', hs: 1, as: 0, date: '2026-08-27' }),
    ];
    const games = [...base.games, ...added];
    const socalLeagues = new Set(['sunset', 'city', 'north-county', 'metro', 'independents']);
    const socalDivisions = new Set(
      [...socalLeagues].flatMap((id) => getLeague(id).divisions.map((d) => d.id)),
    );
    const rows = new Map(
      computeStandings(games, { reported: new Map() })
        .filter((r) => socalDivisions.has(r.division))
        .map((r) => [r.teamId, r]),
    );
    const standings = base.standings.map((r) => rows.get(r.teamId) ?? r);
    const season = buildSeason(games);
    const next: Snapshot = {
      ...base,
      games,
      standings,
      season: {
        ...base.season,
        leagues: base.season.leagues.map((l) => (socalLeagues.has(l.id) ? season.leagues.find((x) => x.id === l.id)! : l)),
        window: season.window,
      },
      counts: countsOf(games, standings),
    };
    const file = tempFile('data-socal', 'snapshot.json');
    writeFileSync(file, JSON.stringify(loadSnapshot(next)));
    socal = (await withSnapshotModules(file, { data: loadQueries })).modules.data;
  });

  it('counts both City Western games, flagged or not, and the shootout win as a win', () => {
    const table = socal.getStandings('city-western');
    const rec = (slug: string) => {
      const c = table.find((r) => r.slug === slug)!.computed;
      return [c.gp, c.w, c.l, c.t, c.pts];
    };
    expect(rec('la-jolla')).toEqual([1, 1, 0, 0, 3]);
    expect(rec('bishops')).toEqual([1, 1, 0, 0, 3]);
    expect(rec('canyon-hills')).toEqual([1, 0, 1, 0, 0]);
    expect(rec('mission-bay')).toEqual([0, 0, 0, 0, 0]);
    expect(socal.getGameById(crossDivision.contestId)!.provenance.classificationNote).toBe(
      'MaxPreps marks this as a league game; it is between two divisions of the City Conference, so it counts in neither table.',
    );
    // Avocado v Palomar: two divisions of North County, so neither table.
    expect(socal.getStandings('avocado').find((r) => r.slug === 'mt-carmel')!.computed.gp).toBe(0);
  });

  it('lists an unflagged past San Diego game with no score as a missing league result', () => {
    const missing = socal.getMissingOfficialResults('city-eastern');
    expect(missing.map((m) => [m.kind, m.dateKey, m.game?.contestId])).toEqual([['missing', '2026-09-29', henry.contestId]]);
    const ctx = socal.getStandingContext('city-eastern');
    expect(ctx.get(getTeamBySlug('patrick-henry')!.id)!.missingPast).toBe(1);
    expect(socal.getMissingOfficialResults('city-western')).toEqual([]);
  });

  it('keeps the Sunset free of LEFT and MAX, and measures its spread with no "of N"', () => {
    for (const c of socal.getStandingContext('sunset').values()) {
      expect(c.scheduled).toBeNull();
      expect(c.remaining).toBeNull();
      expect(c.maxPts).toBeNull();
    }
    expect(socal.getStandingContext('sunset').get(getTeamBySlug('temecula-valley')!.id)!.counted).toBe(3);
    // Every member is in the spread, a team with no counted game at 0: the table lists it with GP 0, so a
    // sentence starting from the lowest team with a result ('between 1 and …') would be false under it.
    expect(socal.getStandings('sunset').some((r) => r.computed.gp === 0)).toBe(true);
    expect(socal.getGamesPlayedSpread('sunset')).toEqual({ min: 0, max: 3, scheduled: null });
  });

  it('writes the San Diego postseason line from the qualification line, never a "top N"', () => {
    const city = getLeague('city');
    if (city.postseason.kind !== 'section-playoffs') throw new Error('City plays the San Diego Section playoffs');
    const first = socal.getTeamPostseasonLine('la-jolla')!;
    // Two teams are level on 3 points at the top, so the first place spans 1st and 2nd.
    expect(first.label).toBe('1st: at least a play-in if named league champion or no league route into the playoffs');
    expect(first.sentence).toBe(
      `${city.postseason.qualificationLine} The Section lists La Jolla in Division I; Open Division teams are drawn from Division I at the end of the regular season.`,
    );
    expect(first.href).toBe('/playoffs#city');
    expect(first.linkText).toBe('San Diego Section playoffs');
    const below = socal.getTeamPostseasonLine('canyon-hills')!;
    expect(below.label).toBe('No league route');
    expect(below.sentence).not.toMatch(/\btop (six|\d)/i);
    expect(socal.getTeamPostseasonLine('mission-bay')).toBeNull();
    expect(socal.getTeamPostseasonLine('marina')!.label).toBe('No section playoffs');
  });

  it('holds the site in its regular season while Metro has not started, and completes once every league has', () => {
    // Metro's first game is Oct 7 (Metro South Bay): on Oct 2 Metro is preseason and the rest are not.
    expect(socal.getSeasonPhase('metro', '2026-10-02T19:00:00.000Z')).toBe('preseason');
    expect(socal.getSitePhase('2026-10-02T19:00:00.000Z')).toBe('regular');
    expect(regionPhase(socal, 'socal', '2026-10-02T19:00:00.000Z')).toBe('regular');
    // The San Diego Section playoffs (Nov 2-14) are its leagues' tournament phase; the Sunset is done Oct 31.
    expect(socal.getSeasonPhase('city', '2026-11-05T19:00:00.000Z')).toBe('tournament');
    expect(socal.getSeasonPhase('sunset', '2026-11-05T19:00:00.000Z')).toBe('complete');
    expect(regionPhase(socal, 'socal', '2026-11-05T19:00:00.000Z')).toBe('tournament');
    expect(socal.getSitePhase('2026-12-25T19:00:00.000Z')).toBe('complete');
  });
});
