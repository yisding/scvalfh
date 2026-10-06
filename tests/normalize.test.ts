import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { sideOutcome } from '../lib/format';
import { DATA_QUALITY, type DataQualityConfig } from '../lib/leagues';
import {
  applyDateOverride,
  applyExclusions,
  cleanRecap,
  dateKeyOf,
  dedupePhantomPairs,
  normalizeGames,
  pacificMidnightUtc,
  seasonWindowOf,
  splitLocation,
  toUtcIso,
} from '../lib/normalize';
import { ScheduleResponseSchema, splitTbaRows, type ScheduleRow } from '../lib/sources/maxpreps';
import { getTeamBySlug, resolveTeam } from '../lib/teams';
import type { Game } from '../lib/types';
import { allScheduleRows, corpusDir } from './helpers';

const rows = allScheduleRows();
const result = normalizeGames(rows, { fetchedAt: '2026-09-29T15:00:00.000Z' });
const { games } = result;
const byId = new Map(games.map((g) => [g.contestId, g]));

describe('normalize: dedupe and drops (SPEC §5.5.1-2)', () => {
  it('reads all 293 team rows from the 15 captured feeds', () => {
    expect(rows.length).toBe(293);
  });

  it('collapses them to 174 distinct contests before the Deleted filter', () => {
    expect(new Set(rows.map((r) => r.contest.contestId)).size).toBe(174);
  });

  it('drops every contestState === 1 row and keeps the rest', () => {
    const deletedIds = new Set(
      rows.filter((r) => r.calculatedFields.contestState === 1).map((r) => r.contest.contestId),
    );
    expect(deletedIds.size).toBeGreaterThan(0);
    for (const id of deletedIds) expect(byId.has(id)).toBe(false);
    expect(games.length).toBe(174 - deletedIds.size);
    expect(result.stats.dropped.deleted).toBeGreaterThan(0);
  });

  it('never publishes the scrimmage that hides behind a Deleted row', () => {
    // vc.json's 2026-08-25 row is a scrimmage with a real 0-4 score and contestState 1.
    const scrimmage = rows.find(
      (r) => r.calculatedFields.contestState === 1 && r.contest.teams.some((t) => t.score !== null),
    );
    expect(scrimmage).toBeDefined();
    expect(byId.has(scrimmage!.contest.contestId)).toBe(false);
  });

  it('emits one game per contestId', () => {
    expect(new Set(games.map((g) => g.contestId)).size).toBe(games.length);
  });
});

describe('normalize: scores are never invented (SPEC §5.5.3)', () => {
  it('gives every non-final game two null scores', () => {
    for (const g of games) {
      if (g.status === 'final') continue;
      expect(g.home.score, g.contestId).toBeNull();
      expect(g.away.score, g.contestId).toBeNull();
    }
  });

  it('gives every final game two numbers', () => {
    for (const g of games.filter((x) => x.status === 'final')) {
      expect(typeof g.home.score).toBe('number');
      expect(typeof g.away.score).toBe('number');
    }
  });

  it('keeps score-pending games pending rather than 0-0', () => {
    const pending = games.filter((g) => g.status === 'score-pending');
    expect(pending.length).toBe(3);
    for (const g of pending) {
      expect(g.home.score).toBeNull();
      expect(g.away.score).toBeNull();
      expect(g.decider).toBeNull();
    }
  });

  it('keeps a genuine 0-0 final as a real 0-0 tie', () => {
    const draws = games.filter(
      (g) => g.status === 'final' && g.home.score === 0 && g.away.score === 0,
    );
    expect(draws.length).toBe(3);
    for (const g of draws) {
      expect(g.home.result).toBe('T');
      expect(g.away.result).toBe('T');
    }
  });
});

describe('normalize: home/away and site (SPEC §5.5.4)', () => {
  it('maps homeAwayType 0 to home and 1 to away', () => {
    // Leigh @ Los Altos, 2026-08-28: Los Altos is homeAwayType 0 and lost 1-2. Leigh is a registry
    // member now (BVAL Mt. Hamilton), so the side carries its slug — but it is still not a league
    // game: the two schools are in different divisions.
    const g = byId.get('e5110a4c-40e5-4d3d-8c69-409de720f633');
    expect(g).toBeDefined();
    expect(g!.home.slug).toBe('los-altos');
    expect(g!.home.score).toBe(1);
    expect(g!.away.name).toBe('Leigh');
    expect(g!.away.slug).toBe('leigh');
    expect(g!.away.teamId).toBe(getTeamBySlug('leigh')!.id);
    expect(g!.away.score).toBe(2);
    expect(g!.site).toBe('home');
    expect(g!.isLeague).toBe(false);
    expect(g!.leagueDivision).toBeNull();
    expect(g!.contestTypes).toEqual({ home: 1, away: 1 });
  });

  it('marks a 2/2 pair as a neutral site instead of guessing a host', () => {
    const neutral = games.filter((g) => g.site === 'neutral');
    expect(neutral.length).toBeGreaterThan(0);
    for (const g of neutral) expect(g.leagueDivision === null || g.isLeague).toBeTruthy();
  });

  it('agrees with every row of the source on which side was home', () => {
    for (const row of rows) {
      if (row.calculatedFields.contestState === 1) continue;
      const g = byId.get(row.contest.contestId);
      if (!g || g.site === 'neutral') continue;
      const homeRow = row.contest.teams.find((t) => t.homeAwayType === 0)!;
      const expected = resolveTeam(homeRow.teamId)?.name ?? homeRow.name;
      expect(g.home.name).toBe(expected);
    }
  });
});

describe('normalize: league flag and division (SPEC §5.5.5)', () => {
  it('flags a conference game and names its division', () => {
    // Saint Francis @ Los Altos, 2026-09-16 — contestType 0 on both rows.
    const g = games.find(
      (x) =>
        x.dateKey === '2026-09-16' &&
        [x.home.slug, x.away.slug].includes('los-altos') &&
        [x.home.slug, x.away.slug].includes('saint-francis'),
    );
    expect(g).toBeDefined();
    expect(g!.isLeague).toBe(true);
    expect(g!.leagueDivision).toBe('de-anza');
  });

  it('never sets leagueDivision for a non-member opponent', () => {
    for (const g of games) {
      if (g.home.slug && g.away.slug) continue;
      expect(g.leagueDivision).toBeNull();
    }
  });

  it('never sets leagueDivision across divisions', () => {
    for (const g of games.filter((x) => x.leagueDivision !== null)) {
      expect(g.home.slug).not.toBeNull();
      expect(g.away.slug).not.toBeNull();
    }
  });

  it('counts a plausible number of league games', () => {
    // 15 MaxPreps teams in a double round robin, part-way through the season.
    expect(result.stats.league).toBeGreaterThan(80);
    expect(result.stats.league).toBeLessThan(120);
  });
});

describe('normalize: details', () => {
  it('records overtime from overtimePeriodsPlayed', () => {
    const ot = games.filter((g) => g.isOt);
    expect(ot.length).toBe(4);
    for (const g of ot) {
      expect(g.otPeriods).toBeGreaterThan(0);
      expect(g.decider === 'OT' || g.decider === '2OT').toBe(true);
    }
  });

  it('stores both date forms and a matching date key', () => {
    for (const g of games) {
      expect(g.dateKey).toBe(dateKeyOf(g.dateLocal));
      expect(g.dateUtc.endsWith('Z')).toBe(true);
    }
  });

  it('keeps location text as a note, never as a venue name', () => {
    const noted = games.filter((g) => g.venue.text !== null);
    expect(noted.length).toBeGreaterThan(0);
    for (const g of noted) expect(g.venue.name).toBeUndefined();
  });

  it('carries the MaxPreps deep link on every published contest', () => {
    for (const g of games.filter((x) => x.status === 'final')) {
      expect(g.urls.maxpreps).toMatch(/^https:\/\/www\.maxpreps\.com\//);
    }
  });

  it('drops a third-party URL that is not http(s), with a warning', () => {
    // React does not filter a URL scheme, so a hostile `canonicalUrl` upstream would otherwise be
    // emitted verbatim into an `href` on a prerendered page. One bad row is dropped, not fatal.
    const one = rows.find((r) => r.calculatedFields.canonicalUrl)!;
    const poisoned = {
      ...one,
      calculatedFields: { ...one.calculatedFields, canonicalUrl: 'javascript:alert(1)' },
      goFanUrl: 'data:text/html,<script>x()</script>',
    };
    const res = normalizeGames([poisoned], { fetchedAt: '2026-09-29T15:00:00.000Z' });
    expect(res.games).toHaveLength(1);
    expect(res.games[0].urls.maxpreps).toBeNull();
    expect(res.games[0].urls.goFan).toBeNull();
    expect(res.warnings.some((w) => /canonicalUrl is not an http\(s\) URL/.test(w))).toBe(true);
    expect(res.warnings.some((w) => /goFanUrl is not an http\(s\) URL/.test(w))).toBe(true);
  });

  it('cleans the recap sentence (DESIGN §5.8)', () => {
    expect(
      cleanRecap(
        'On 9/24, the Saratoga varsity field hockey team lost their home conference game against Santa Clara (CA) by a score of 3-2.',
      ),
    ).toBe('Saratoga lost their home conference game against Santa Clara by a score of 3-2.');
    expect(cleanRecap('')).toBeNull();
    expect(cleanRecap(null)).toBeNull();
  });

  it('only keeps a recap on a final', () => {
    for (const g of games) if (g.status !== 'final') expect(g.recap).toBeNull();
  });

  it('computes the season window from the games, not a constant', () => {
    const w = seasonWindowOf(games);
    expect(w.firstGame!.slice(0, 10)).toBe('2026-08-24');
    expect(w.lastGame!.slice(0, 10)).toBe('2026-10-28');
    expect(w.lastLeagueGame!.slice(0, 10)).toBe('2026-10-28');
  });

  it('normalizes an unsuffixed GMT stamp exactly once', () => {
    expect(toUtcIso('2026-09-16T23:00:00')).toBe('2026-09-16T23:00:00Z');
    expect(toUtcIso('2026-09-16T23:00:00Z')).toBe('2026-09-16T23:00:00Z');
  });
});

describe('normalize: contest.location is a 50-char free-text field', () => {
  it('reads an explicit "Location:" prefix as the venue, not as a note', () => {
    expect(splitLocation('Location: Archbishop Mitty High School')).toEqual({
      name: 'Archbishop Mitty High School',
      text: null,
    });
    expect(splitLocation('  location :  Wilcox HS  ')).toEqual({ name: 'Wilcox HS', text: null });
  });

  it('marks a note that the source cut off at its field limit', () => {
    // 49 characters, cut mid-word by MaxPreps — shipped verbatim it reads as our bug.
    expect(splitLocation('Lacey played 3Q had 7 saves. Noa played last quart')).toEqual({
      text: 'Lacey played 3Q had 7 saves. Noa played last…',
    });
  });

  it('leaves a short note, and a complete sentence at the limit, exactly as published', () => {
    for (const note of ['Senior Night', 'Scrimmage', 'Too be rescheduled']) {
      expect(splitLocation(note)).toEqual({ text: note });
    }
    const full = `${'a'.repeat(48)}.`;
    expect(splitLocation(full)).toEqual({ text: full });
    expect(splitLocation(null)).toEqual({ text: null });
    expect(splitLocation('   ')).toEqual({ text: null });
  });

  it('is what the fixture corpus carries', () => {
    for (const game of games) {
      if (game.venue.text) expect(game.venue.text).not.toMatch(/^Location\s*:/i);
    }
  });
});

// ---------------------------------------------------------------- SPEC §7.6 (multi-league corpus)

const CORPUS_SCHEDULES = path.join(corpusDir('all-2026-10-02'), 'maxpreps', 'schedule');
const FETCHED_AT = '2026-10-02T15:00:00.000Z';

/** Every row of the 43 all-2026-10-02 schedule feeds, keyed by our slug (the file stem). */
function corpusFeeds(): Map<string, ScheduleRow[]> {
  const feeds = new Map<string, ScheduleRow[]>();
  for (const file of readdirSync(CORPUS_SCHEDULES).filter((f) => f.endsWith('.json')).sort()) {
    const raw = JSON.parse(readFileSync(path.join(CORPUS_SCHEDULES, file), 'utf8')) as unknown;
    feeds.set(file.replace(/\.json$/, ''), ScheduleResponseSchema.parse(raw).data);
  }
  return feeds;
}

const feeds = corpusFeeds();
const corpusRows = [...feeds.values()].flat();
const corpus = normalizeGames(corpusRows, { fetchedAt: FETCHED_AT });
const corpusById = new Map(corpus.games.map((g) => [g.contestId, g]));

/**
 * DATA_QUALITY.excludedContestIds' two duplicate Palomar rows (Poway vs Fallbrook Oct 9, Mission Vista vs
 * Fallbrook Oct 30: lib/leagues.ts), in config order. Neither is in the 2026-10-02 NorCal corpus, so
 * applyExclusions reports both as unused there.
 */
const SDS_DUPLICATE_ROWS = ['c7dbdbcc-5f41-4192-b8b2-eb79cca2523a', '9c027452-e21e-4e47-9eac-d2e800bfb42c'];

const TBA_CONTESTS = [
  '64c8188b-db94-44ff-8477-d60b4e3db218', // Ann Sobrato, 2026-09-12
  '55207683-8dd2-41c6-aa1b-02919d6bb261', // Stevenson, 2026-10-03
  '64e0b2e5-abef-4db0-97e9-54c8c4bb9af0', // University, 2026-10-03
];

/** A copy of a game with some fields replaced (the copy's provenance is its own object). */
function variant(g: Game, patch: Partial<Game> & { modifiedOn?: string }): Game {
  const { modifiedOn, ...rest } = patch;
  return {
    ...g,
    ...rest,
    provenance: {
      ...g.provenance,
      ...(modifiedOn !== undefined ? { maxprepsModifiedOn: modifiedOn } : {}),
    },
  };
}

/** A row copy whose contest.teams are rebuilt by `edit`. */
function editTeams(
  row: ScheduleRow,
  edit: (t: ScheduleRow['contest']['teams'][number], i: number) => Partial<ScheduleRow['contest']['teams'][number]>,
): ScheduleRow {
  return {
    ...row,
    contest: { ...row.contest, teams: row.contest.teams.map((t, i) => ({ ...t, ...edit(t, i) })) },
  };
}

describe('normalize: the 43-feed corpus (SPEC §7.6)', () => {
  it('reads all 43 feeds, including the three that carry a TBA row', () => {
    expect(feeds.size).toBe(43);
    for (const slug of ['sobrato', 'stevenson', 'university-sf']) {
      expect(feeds.get(slug)!.length).toBeGreaterThan(0);
    }
  });

  it('drops exactly the TBA rows, each recorded once as tba-opponent', () => {
    const tbaRows = corpusRows.filter((r) => r.contest.teams.some((t) => t.teamId === null || t.name === null));
    expect(tbaRows.map((r) => r.contest.contestId).sort()).toEqual([...TBA_CONTESTS].sort());
    expect(corpus.dropped.map((d) => d.contestId).sort()).toEqual([...TBA_CONTESTS].sort());
    expect(corpus.stats.dropped.tba).toBe(3);
    for (const d of corpus.dropped) {
      expect(d.reason).toBe('tba-opponent');
      expect(d.teams).toHaveLength(1);
      expect(corpusById.has(d.contestId)).toBe(false);
    }
    expect(corpus.dropped.find((d) => d.contestId === TBA_CONTESTS[0])).toEqual({
      contestId: TBA_CONTESTS[0],
      reason: 'tba-opponent',
      note: 'MaxPreps lists Ann Sobrato against an opponent it has not named yet (TBA).',
      dateKey: '2026-09-12',
      teams: ['Ann Sobrato'],
    });
  });

  it('drops nothing else: every other non-deleted contest becomes one game', () => {
    const live = new Set(
      corpusRows
        .filter((r) => r.calculatedFields.contestState !== 1)
        .map((r) => r.contest.contestId)
        .filter((id) => !TBA_CONTESTS.includes(id)),
    );
    expect(corpus.stats.dropped.malformed).toBe(0);
    expect(new Set(corpus.games.map((g) => g.contestId))).toEqual(live);
  });

  it('records nothing when the caller already split the TBA rows off per feed', () => {
    const perFeed = [...feeds.values()].map((rows) => splitTbaRows(rows));
    expect(perFeed.flatMap((s) => s.dropped)).toHaveLength(3);
    const again = normalizeGames(perFeed.flatMap((s) => s.rows), { fetchedAt: FETCHED_AT });
    expect(again.dropped).toEqual([]);
    expect(again.stats.dropped.tba).toBe(0);
    expect(again.games).toEqual(corpus.games);
  });

  it('does not list a contest as dropped when another feed names both sides', () => {
    const row = corpusRows.find((r) => corpusById.get(r.contest.contestId)?.status === 'final')!;
    const tbaCopy = editTeams(row, (_t, i) => (i === 1 ? { teamId: null, name: null } : {}));
    const res = normalizeGames([tbaCopy, row], { fetchedAt: FETCHED_AT });
    expect(res.games.map((g) => g.contestId)).toEqual([row.contest.contestId]);
    expect(res.dropped).toEqual([]);
    expect(res.warnings.some((w) => w.includes('TBA copy was ignored'))).toBe(true);
  });

  it('gives every game the countsFor and postseason placeholders for lib/classify.ts', () => {
    for (const g of [...corpus.games, ...games]) {
      expect(g.countsFor, g.contestId).toBeNull();
      expect(g.postseason, g.contestId).toBeNull();
    }
  });

  it('copies contestTypes from the two team rows, in the home/away slots', () => {
    for (const row of corpusRows) {
      const g = corpusById.get(row.contest.contestId);
      if (!g || g.site === 'neutral') continue;
      const home = row.contest.teams.find((t) => t.homeAwayType === 0)!;
      const away = row.contest.teams.find((t) => t.homeAwayType === 1)!;
      expect(g.contestTypes, g.contestId).toEqual({ home: home.contestType, away: away.contestType });
    }
    const kinds = new Set(corpus.games.map((g) => `${g.contestTypes.home},${g.contestTypes.away}`));
    expect(kinds).toEqual(new Set(['0,0', '1,1', '2,2']));
  });

  it('keeps isLeague exactly "contestType 0 on either row"', () => {
    for (const g of corpus.games) {
      expect(g.isLeague).toBe(g.contestTypes.home === 0 || g.contestTypes.away === 0);
    }
  });

  it('sets leagueDivision for same-division registry pairs in every league', () => {
    const divisions = new Set(corpus.games.map((g) => g.leagueDivision).filter((d) => d !== null));
    expect(divisions).toEqual(
      new Set(['de-anza', 'el-camino', 'mt-hamilton', 'santa-teresa', 'pcal', 'marin-county']),
    );
    for (const g of corpus.games) {
      const h = g.home.slug ? getTeamBySlug(g.home.slug) : undefined;
      const a = g.away.slug ? getTeamBySlug(g.away.slug) : undefined;
      expect(g.leagueDivision).toBe(h && a && h.division === a.division ? h.division : null);
    }
  });
});

describe('normalize: provenance.resultConflict (D2 rule 4a evidence)', () => {
  const finalRow = allScheduleRows().find(
    (r) =>
      r.calculatedFields.contestState === 4 &&
      r.contest.teams.every((t) => t.score !== null) &&
      r.contest.teams[0].score !== r.contest.teams[1].score,
  )!;
  const [a, b] = finalRow.contest.teams;
  const winnerIdx = a.score! > b.score! ? 0 : 1;

  it('is absent on every consistent final of the SCVAL captures', () => {
    expect(games.filter((g) => g.provenance.resultConflict)).toEqual([]);
  });

  it('flags the one corpus final whose flags contradict its 0-0 score', () => {
    // University v Gilroy, 9/12 tournament: 0-0 with University marked W and Gilroy L in both feeds.
    const flagged = corpus.games.filter((g) => g.provenance.resultConflict);
    expect(flagged.map((g) => g.contestId)).toEqual(['747082fd-259d-4fb8-8837-ece21a945993']);
    expect(flagged[0].provenance.resultConflict).toMatch(/W and Gilroy L on a 0-0 score/);
    // The score is still published as MaxPreps has it; lib/backfill decides whether si.com overrides.
    expect(flagged[0].status).toBe('final');
    expect([flagged[0].home.score, flagged[0].away.score]).toEqual([0, 0]);
  });

  it('flags a final whose winner is marked L', () => {
    const flipped = editTeams(finalRow, (t, i) => ({ result: i === winnerIdx ? 'L' : 'W' }));
    const [g] = normalizeGames([flipped], { fetchedAt: FETCHED_AT }).games;
    expect(g.status).toBe('final');
    expect(g.provenance.resultConflict).toMatch(/^MaxPreps marks .+ on a \d+-\d+ score\.$/);
  });

  it('flags two team feeds that disagree on the score', () => {
    const other = editTeams(finalRow, (t, i) => (i === winnerIdx ? { score: t.score! + 3 } : {}));
    const [g] = normalizeGames([finalRow, other], { fetchedAt: FETCHED_AT }).games;
    expect(g.provenance.resultConflict).toMatch(/two team feeds disagree on the score/);
  });

  it('never flags a non-final, a final with no flags, or two agreeing copies', () => {
    const pending = {
      ...editTeams(finalRow, (t, i) => ({ result: i === winnerIdx ? 'L' : 'W' })),
      calculatedFields: { ...finalRow.calculatedFields, contestState: 5 },
    };
    const unflagged = editTeams(finalRow, () => ({ result: null }));
    for (const rows of [[pending], [unflagged], [finalRow, finalRow]]) {
      const [g] = normalizeGames(rows, { fetchedAt: FETCHED_AT }).games;
      expect(g.provenance.resultConflict).toBeUndefined();
    }
  });
});

describe('applyExclusions (SPEC §7.6 step 3)', () => {
  const res = applyExclusions(corpus.games, DATA_QUALITY);

  it('drops the Del Norte (Crescent City) ghost contest as ghost-team', () => {
    const ghost = res.dropped.find((d) => d.reason === 'ghost-team');
    expect(ghost).toMatchObject({
      contestId: '5b9ff911-a640-4947-b9fd-8a629e775b33',
      dateKey: '2026-10-16',
      teams: ['Tamalpais', 'Del Norte'],
    });
    expect(ghost!.note).toBe(DATA_QUALITY.ghostTeamIds['8396a0d3-8021-458d-b592-a5cb2c4a366d']);
  });

  it('drops 5cf5e3df (Archie Williams at Marin Academy, Aug 18) as excluded-by-config', () => {
    const excluded = res.dropped.filter((d) => d.reason === 'excluded-by-config');
    expect(excluded).toEqual([
      {
        contestId: '5cf5e3df-6e72-4f44-9b8d-e69da30b85c5',
        reason: 'excluded-by-config',
        note: DATA_QUALITY.excludedContestIds['5cf5e3df-6e72-4f44-9b8d-e69da30b85c5'],
        dateKey: '2026-08-18',
        teams: ['Marin Academy', 'Archie Williams'],
      },
    ]);
  });

  it('records a contest that is both ghost and excluded once, and drops nothing else', () => {
    expect(res.dropped).toHaveLength(2);
    expect(res.games).toHaveLength(corpus.games.length - 2);
    expect(res.games).toEqual(corpus.games.filter((g) => !res.dropped.some((d) => d.contestId === g.contestId)));
    // The two duplicate Palomar rows (San Diego, inventory 2026-10-06) are not in this NorCal corpus.
    expect(res.unused).toEqual(SDS_DUPLICATE_ROWS);
  });

  it('reports an excluded id that no longer appears, and leaves the input alone', () => {
    const dq: DataQualityConfig = {
      ...DATA_QUALITY,
      ghostTeamIds: {},
      excludedContestIds: { ...DATA_QUALITY.excludedContestIds, 'gone-0000': 'a contest MaxPreps deleted' },
    };
    const before = corpus.games.length;
    const r = applyExclusions(corpus.games, dq);
    // Config order: the San Diego duplicates (absent from this NorCal corpus), then the added id.
    expect(r.unused).toEqual([...SDS_DUPLICATE_ROWS, 'gone-0000']);
    // Without the ghost list, 5b9ff911 is caught by its own exclusion entry.
    expect(r.dropped.map((d) => [d.contestId.slice(0, 8), d.reason])).toEqual([
      ['5cf5e3df', 'excluded-by-config'],
      ['5b9ff911', 'excluded-by-config'],
    ]);
    expect(corpus.games.length).toBe(before);
  });
});

describe('dedupePhantomPairs (SPEC §7.6 step 4)', () => {
  const clean = applyExclusions(corpus.games, DATA_QUALITY).games;
  // A Mt. Hamilton league game and a non-league game, both from the corpus.
  const league = clean.find((g) => g.leagueDivision === 'mt-hamilton' && g.status === 'final')!;
  const crossDivision = clean.find(
    (g) => g.home.slug && g.away.slug && g.leagueDivision === null && g.status === 'final',
  )!;
  // Every opponent in the 2026-10-02 corpus that was not one of the 49 is a San Diego school, and all of
  // them are registry teams now (99), so the non-member game is the cross-division one with its away side
  // swapped for a school outside the registry.
  const nonMember =
    clean.find((g) => !g.home.slug || !g.away.slug) ??
    variant(crossDivision, {
      away: { teamId: 'eeeeeeee-0000-4000-8000-00000000000e', slug: null, name: 'Outside School', score: crossDivision.away.score, result: crossDivision.away.result },
      leagueDivision: null,
    });

  it('drops nothing on the 2026-10-02 corpus', () => {
    const res = dedupePhantomPairs(clean);
    expect(res.dropped).toEqual([]);
    expect(res.games).toEqual(clean);
  });

  it('keeps the final over a same-day, same-division phantom and records the phantom', () => {
    const phantom = variant(league, {
      contestId: 'ffffffff-0000-4000-8000-000000000001',
      status: 'scheduled',
      home: { ...league.away, score: null, result: null },
      away: { ...league.home, score: null, result: null },
      decider: null,
    });
    const res = dedupePhantomPairs([phantom, ...clean]);
    expect(res.games).toEqual(clean);
    expect(res.dropped).toEqual([
      {
        contestId: phantom.contestId,
        reason: 'phantom-duplicate',
        note: `MaxPreps lists ${phantom.home.name} and ${phantom.away.name} twice on ${league.dateKey}; kept contest ${league.contestId}.`,
        dateKey: league.dateKey,
        teams: [phantom.home.name, phantom.away.name],
      },
    ]);
  });

  it('prefers score-pending over scheduled, then contestType 0, then the later modifiedOn, then the smaller id', () => {
    const base = variant(league, {
      status: 'scheduled',
      home: { ...league.home, score: null, result: null },
      away: { ...league.away, score: null, result: null },
      contestTypes: { home: 1, away: 1 },
      modifiedOn: '2026-09-01T00:00:00',
    });
    const id = (n: number) => `eeeeeeee-0000-4000-8000-00000000000${n}`;
    const keep = (list: Game[]) => dedupePhantomPairs(list).games.map((g) => g.contestId);

    const pending = variant(base, { contestId: id(2), status: 'score-pending' });
    expect(keep([variant(base, { contestId: id(1) }), pending])).toEqual([id(2)]);

    const typed = variant(base, { contestId: id(4), contestTypes: { home: 0, away: 1 } });
    expect(keep([variant(base, { contestId: id(3) }), typed])).toEqual([id(4)]);

    const newer = variant(base, { contestId: id(6), modifiedOn: '2026-09-02T00:00:00' });
    expect(keep([variant(base, { contestId: id(5) }), newer])).toEqual([id(6)]);

    expect(keep([variant(base, { contestId: id(8) }), variant(base, { contestId: id(7) })])).toEqual([id(7)]);
  });

  it('never touches a non-league double-header or the same pair on another day', () => {
    const twins = [crossDivision, nonMember].map((g, i) =>
      variant(g, { contestId: `dddddddd-0000-4000-8000-00000000000${i}` }),
    );
    const otherDay = variant(league, {
      contestId: 'dddddddd-0000-4000-8000-000000000009',
      dateKey: '2026-12-31',
      dateLocal: '2026-12-31T16:00:00',
    });
    const input = [...clean, ...twins, otherDay];
    const res = dedupePhantomPairs(input);
    expect(res.dropped).toEqual([]);
    expect(res.games).toEqual(input);
  });
});

describe('normalize: a level final in a 1 v 1 league (EAL)', () => {
  // A home/away final from the captures, re-pointed at two registry teams with a given score,
  // result flags and overtime count. Only the fields normalize reads change.
  const template = allScheduleRows().find(
    (r) =>
      r.calculatedFields.contestState === 4 &&
      r.contest.teams.length === 2 &&
      r.contest.teams.some((t) => t.homeAwayType === 0) &&
      r.contest.teams.some((t) => t.homeAwayType === 1) &&
      r.contest.teams.every((t) => !t.isForfeit),
  )!;
  function pairRow(
    contestId: string,
    home: [slug: string, score: number, result: string | null],
    away: [slug: string, score: number, result: string | null],
    ot = 0,
    contestTypes: { home: number; away: number } = { home: 0, away: 0 },
  ): ScheduleRow {
    const row = editTeams(template, (t) => {
      const [slug, score, result] = t.homeAwayType === 0 ? home : away;
      const team = getTeamBySlug(slug)!;
      return { teamId: team.id, name: team.name, score, result, contestType: t.homeAwayType === 0 ? contestTypes.home : contestTypes.away };
    });
    return {
      ...row,
      contest: { ...row.contest, contestId },
      calculatedFields: { ...row.calculatedFields, overtimePeriodsPlayed: ot },
    };
  }
  const one = (rows: ScheduleRow[]) => normalizeGames(rows, { fetchedAt: FETCHED_AT });

  it('reads Chico 1, Davis 1 flagged W/L as a 1 v 1 win: decider SO, no tally, no conflict', () => {
    // 2026-09-28 Chico 1, Davis Sr. 1 (9afebd05…): MaxPreps marks Chico W and Davis L, 0 overtime periods.
    const id = '9afebd05-777b-4c8a-82d5-c41b556788bb';
    const res = one([pairRow(id, ['chico', 1, 'W'], ['davis', 1, 'L'])]);
    const [g] = res.games;
    expect(g.decider).toBe('SO');
    expect(g.shootout).toBeNull();
    expect([g.home.score, g.away.score]).toEqual([1, 1]);
    expect([g.home.result, g.away.result]).toEqual(['W', 'L']);
    expect(g.provenance.resultConflict).toBeUndefined();
    expect(res.warnings.filter((w) => w.startsWith(`contest ${id}`))).toEqual([]);
    // Either order of the flags.
    const [flipped] = one([pairRow(id, ['chico', 1, 'L'], ['davis', 1, 'W'])]).games;
    expect(flipped.decider).toBe('SO');
    expect(flipped.provenance.resultConflict).toBeUndefined();
  });

  it('still notes two EAL feeds that disagree on the score', () => {
    const id = 'eeeeeeee-0000-4000-8000-000000000001';
    const a = pairRow(id, ['chico', 1, 'W'], ['davis', 1, 'L']);
    const b = pairRow(id, ['chico', 2, 'W'], ['davis', 1, 'L']);
    const [g] = one([a, b]).games;
    expect(g.provenance.resultConflict).toMatch(/two team feeds disagree on the score/);
    expect(g.provenance.resultConflict).not.toMatch(/^MaxPreps marks/);
  });

  it('keeps the same score and flags between two MCAL teams a contradiction, as before', () => {
    const [g] = one([pairRow('eeeeeeee-0000-4000-8000-000000000002', ['redwood', 1, 'W'], ['tamalpais', 1, 'L'])]).games;
    expect(g.decider).toBe('REG');
    expect(g.provenance.resultConflict).toBe('MaxPreps marks Redwood W and Tamalpais L on a 1-1 score.');
  });

  it('does not treat an EAL team against a team of another league as a 1 v 1 win', () => {
    const [g] = one([pairRow('eeeeeeee-0000-4000-8000-000000000003', ['chico', 1, 'W'], ['tamalpais', 1, 'L'])]).games;
    expect(g.decider).toBe('REG');
    expect(g.provenance.resultConflict).toMatch(/^MaxPreps marks Chico W and Tamalpais L on a 1-1 score\.$/);
  });

  // The 'SO' rule is keyed on the SECTION (SectionConfig.shootout), not one shared league (DESIGN-socal
  // §2.1.3): the San Diego Section's shootout covers its three conferences, the Southern Section has no rule.
  it('reads a San Diego cross-conference 0-0 flagged W/L as a shootout win (Clairemont–Eastlake, Sep 1)', () => {
    // City Eastern v Metro Mesa: two conferences, one section whose rule ends a level game with a shootout.
    const id = 'eeeeeeee-0000-4000-8000-0000000000a1';
    const res = one([pairRow(id, ['clairemont', 0, 'L'], ['eastlake', 0, 'W'])]);
    const [g] = res.games;
    expect(g.decider).toBe('SO');
    expect(g.shootout).toBeNull();
    expect(g.leagueDivision).toBeNull();
    expect(g.provenance.resultConflict).toBeUndefined();
    expect(res.warnings.filter((w) => w.startsWith(`contest ${id}`))).toEqual([]);
    // Within one conference too (Mt. Carmel–Poway, Sep 11: Avocado v Palomar of North County).
    const [nc] = one([pairRow(id, ['mt-carmel', 0, 'W'], ['poway', 0, 'L'])]).games;
    expect(nc.decider).toBe('SO');
  });

  // A JV game is never a shootout win (NormalizeOptions.level): the San Diego procedure ends a level JV
  // game at the end of regulation ("JV—No overtime"), and §VII.E.4 is a varsity rule.
  it('never reads a level JV final flagged W/L as a shootout win, in either section with a shootout rule', () => {
    const jv = (rows: ScheduleRow[]) => normalizeGames(rows, { fetchedAt: FETCHED_AT, level: 'jv' });
    const id = 'eeeeeeee-0000-4000-8000-0000000000a9';
    const res = jv([pairRow(id, ['clairemont', 0, 'L'], ['eastlake', 0, 'W'])]);
    const [g] = res.games;
    expect(g.decider, 'lib/normalize.ts level jv').toBe('REG');
    expect(g.provenance.resultConflict).toBe('MaxPreps marks Clairemont L and Eastlake W on a 0-0 score.');
    expect(sideOutcome(g, 'home'), 'a JV tie stands').toBe('T');
    expect(res.warnings.filter((w) => w.startsWith(`contest ${id}`))).toEqual([
      `contest ${id}: MaxPreps marks Clairemont L and Eastlake W on a 0-0 score.`,
      `contest ${id}: a level JV final marked W/L between two San Diego Section teams; the Section's shootout rule is a varsity rule, so the flags are left as a contradiction and the game counts as a tie`,
    ]);
    // The EAL: the same, in the Northern Section's words.
    const ns = jv([pairRow(id, ['chico', 1, 'W'], ['davis', 1, 'L'])]);
    expect(ns.games[0].decider).toBe('REG');
    expect(ns.warnings).toContain(
      `contest ${id}: a level JV final marked W/L between two Northern Section teams; the Section's 1 v 1 rule is a varsity rule, so the flags are left as a contradiction and the game counts as a tie`,
    );
    // A level JV final with no winner flagged is an ordinary JV tie: no warning at all.
    const tie = jv([pairRow(id, ['escondido', 1, 'T'], ['el-capitan', 1, 'T'])]);
    expect(tie.games[0].decider).toBe('REG');
    expect(tie.warnings.filter((w) => w.startsWith(`contest ${id}`))).toEqual([]);
    // The varsity default is unchanged.
    expect(one([pairRow(id, ['clairemont', 0, 'L'], ['eastlake', 0, 'W'])]).games[0].decider).toBe('SO');
  });

  it('logs a level San Diego final with no shootout winner by the section when the sides span two conferences', () => {
    const id = 'eeeeeeee-0000-4000-8000-0000000000a2';
    const res = one([pairRow(id, ['escondido', 1, 'T'], ['el-capitan', 1, 'T'])]);
    expect(res.games[0].decider).toBe('REG');
    expect(res.warnings).toContain(`contest ${id}: a level San Diego Section final with no shootout winner flagged`);
    const same = one([pairRow(id, ['escondido', 1, 'T'], ['vista', 1, 'T'])]);
    expect(same.warnings).toContain(`contest ${id}: a level North final with no shootout winner flagged`);
  });

  // The SDFHOA procedures cover the regular season and the playoffs, not invitational tournaments
  // (SectionConfig.shootout.coversTournaments false): seven SDS-v-SDS tournament games are recorded 0-0, T and T.
  it('reads nothing into a level San Diego tournament final (contestType 2 on either row): no SO, no warning', () => {
    const id = 'eeeeeeee-0000-4000-8000-0000000000b1';
    // Eastlake 0, La Costa Canyon 0, Aug 21 (16947736…): a tie, and no "no shootout winner flagged" line.
    const tie = one([pairRow(id, ['eastlake', 0, 'T'], ['la-costa-canyon', 0, 'T'], 0, { home: 2, away: 2 })]);
    expect(tie.games[0].decider).toBe('REG');
    expect(tie.games[0].provenance.resultConflict).toBeUndefined();
    expect(tie.warnings.filter((w) => w.startsWith(`contest ${id}`))).toEqual([]);
    // Either row's type is enough.
    const half = one([pairRow(id, ['canyon-crest-academy', 0, 'T'], ['san-pasqual', 0, 'T'], 0, { home: 1, away: 2 })]);
    expect(half.warnings.filter((w) => w.startsWith(`contest ${id}`))).toEqual([]);
    // A level tournament final flagged W/L is not read as a shootout win the procedures do not provide for:
    // the flags stay a contradiction and the score's tie stands.
    const flagged = one([pairRow(id, ['mt-carmel', 0, 'W'], ['poway', 0, 'L'], 0, { home: 2, away: 2 })]);
    expect(flagged.games[0].decider).toBe('REG');
    expect(flagged.games[0].provenance.resultConflict).toBe('MaxPreps marks Mt. Carmel W and Poway L on a 0-0 score.');
    expect(sideOutcome(flagged.games[0], 'home')).toBe('T');
    // The same pair outside a tournament is unchanged: SO, and the level warning without a flag.
    expect(one([pairRow(id, ['mt-carmel', 0, 'W'], ['poway', 0, 'L'], 0, { home: 1, away: 1 })]).games[0].decider).toBe('SO');
    expect(one([pairRow(id, ['eastlake', 0, 'T'], ['la-costa-canyon', 0, 'T'], 0, { home: 1, away: 1 })]).warnings).toContain(
      `contest ${id}: a level San Diego Section final with no shootout winner flagged`,
    );
  });

  it('keeps reading an EAL tournament final flagged W/L as a 1 v 1 win (§VII.E.4 makes no tournament exception)', () => {
    const [g] = one([pairRow('eeeeeeee-0000-4000-8000-0000000000b2', ['chico', 1, 'W'], ['davis', 1, 'L'], 0, { home: 2, away: 2 })]).games;
    expect(g.decider).toBe('SO');
    expect(g.provenance.resultConflict).toBeUndefined();
  });

  it('keeps a level Sunset final a tie, and a level Sunset final flagged W/L a contradiction (no Southern Section rule)', () => {
    // Bonita 1-1 Marina, Aug 18: recorded as reported.
    const tie = one([pairRow('eeeeeeee-0000-4000-8000-0000000000a3', ['bonita', 1, 'T'], ['marina', 1, 'T'])]);
    expect(tie.games[0].decider).toBe('REG');
    expect(tie.games[0].provenance.resultConflict).toBeUndefined();
    expect(tie.warnings.filter((w) => w.includes('level'))).toEqual([]);
    const [flagged] = one([pairRow('eeeeeeee-0000-4000-8000-0000000000a4', ['bonita', 1, 'W'], ['marina', 1, 'L'])]).games;
    expect(flagged.decider).toBe('REG');
    expect(flagged.provenance.resultConflict).toBe('MaxPreps marks Bonita W and Marina L on a 1-1 score.');
  });

  it('never reads a Sunset team against a San Diego team, level and flagged W/L, as a shootout win (two sections)', () => {
    const [g] = one([pairRow('eeeeeeee-0000-4000-8000-0000000000a5', ['great-oak', 0, 'W'], ['torrey-pines', 0, 'L'])]).games;
    expect(g.decider).toBe('REG');
    expect(g.provenance.resultConflict).toMatch(/^MaxPreps marks Great Oak W and Torrey Pines L on a 0-0 score\.$/);
  });

  it('keeps MaxPreps’ overtime count on a decided EAL game, never clamped', () => {
    // 2026-09-02 PV @ Chico (8a4d7c70…): 1-0 Pleasant Valley with overtimePeriodsPlayed 3.
    const [g] = one([pairRow('eeeeeeee-0000-4000-8000-000000000004', ['chico', 0, 'L'], ['pleasant-valley', 1, 'W'], 3)]).games;
    expect(g.decider).toBe('2OT');
    expect(g.otPeriods).toBe(3);
    expect(g.isOt).toBe(true);
    expect(g.provenance.resultConflict).toBeUndefined();
  });

  it('keeps a level EAL final without a 1 v 1 winner a tie, and logs it', () => {
    const id = 'eeeeeeee-0000-4000-8000-000000000005';
    const res = one([pairRow(id, ['lassen', 2, 'T'], ['corning', 2, 'T'], 1)]);
    const [g] = res.games;
    expect(g.decider).toBe('OT');
    expect([g.home.result, g.away.result]).toEqual(['T', 'T']);
    expect(g.provenance.resultConflict).toBeUndefined();
    expect(res.warnings).toContain(`contest ${id}: a level EAL final with no 1 v 1 winner flagged`);
    const unflagged = one([pairRow(id, ['lassen', 0, null], ['corning', 0, null])]);
    expect(unflagged.games[0].decider).toBe('REG');
    expect(unflagged.warnings).toContain(`contest ${id}: a level EAL final with no 1 v 1 winner flagged`);
  });

  it('keeps a level EAL forfeit flagged W/L a contradiction, as between two MCAL teams (D7.1: not a 1 v 1 win)', () => {
    const forfeitBy = (row: ScheduleRow, slug: string): ScheduleRow => ({
      ...row,
      contest: {
        ...row.contest,
        teams: row.contest.teams.map((t) => ({ ...t, isForfeit: t.teamId === getTeamBySlug(slug)!.id })),
      },
    });
    const id = 'eeeeeeee-0000-4000-8000-000000000006';
    const res = one([forfeitBy(pairRow(id, ['chico', 0, 'W'], ['davis', 0, 'L']), 'davis')]);
    const [g] = res.games;
    expect(g.decider).toBe('FORFEIT');
    expect(g.provenance.resultConflict).toBe('MaxPreps marks Chico W and Davis L on a 0-0 score.');
    expect(res.warnings).toContain(`contest ${id}: MaxPreps marks Chico W and Davis L on a 0-0 score.`);
    const [mcal] = one([forfeitBy(pairRow(id, ['redwood', 0, 'W'], ['tamalpais', 0, 'L']), 'tamalpais')]).games;
    expect(mcal.provenance.resultConflict).toBe('MaxPreps marks Redwood W and Tamalpais L on a 0-0 score.');
  });

  it('never reads a level EAL forfeit as a 1 v 1 win, nor logs it as a level final without one (D7.1)', () => {
    // D7.1: 'SO' is for "a FINAL that is not a forfeit". The forfeit check comes first, so a level
    // forfeit flagged W/L stays 'FORFEIT' (never "won on 1 v 1s"), with no tally and no 1 v 1 note.
    const withForfeit = (row: ScheduleRow, side: 0 | 1): ScheduleRow => ({
      ...row,
      contest: {
        ...row.contest,
        teams: row.contest.teams.map((t) => ({ ...t, isForfeit: t.homeAwayType === side })),
      },
    });
    const noWinnerNote = (id: string) => `contest ${id}: a level EAL final with no 1 v 1 winner flagged`;
    const id = 'eeeeeeee-0000-4000-8000-000000000007';
    for (const [side, by] of [[1, 'away'], [0, 'home']] as const) {
      const res = one([withForfeit(pairRow(id, ['chico', 1, 'W'], ['davis', 1, 'L']), side)]);
      const [g] = res.games;
      expect(g.decider, `forfeit by ${by}`).toBe('FORFEIT');
      expect(g.forfeitBy).toBe(by);
      expect(g.shootout).toBeNull();
      expect(res.warnings).not.toContain(noWinnerNote(id));
    }
    // A level forfeit flagged T/T or unflagged is no "level EAL final with no 1 v 1 winner" either.
    for (const flag of ['T', null]) {
      const res = one([withForfeit(pairRow(id, ['lassen', 0, flag], ['corning', 0, flag]), 1)]);
      expect(res.games[0].decider, `flag ${flag}`).toBe('FORFEIT');
      expect(res.warnings).not.toContain(noWinnerNote(id));
    }
  });
});

describe('normalize: a sourced per-contest date correction (DATA_QUALITY.contestDateOverrides)', () => {
  // Valley Center 0 @ Fallbrook 11: MaxPreps dates it Sep 25 at 4:00 PM, Fallbrook's slot against Rancho
  // Buena Vista; the Section's power-rankings details for both schools list it on 09/29 with no time.
  const id = 'fc8be1f8-e3e6-48dc-8b7a-eebc0f1f2ce0';
  const dir = path.join(corpusDir('socal-2026-10-06'), 'maxpreps', 'schedule');
  const rowsOf = (slug: string) =>
    ScheduleResponseSchema.parse(JSON.parse(readFileSync(path.join(dir, `${slug}.json`), 'utf8')) as unknown).data;
  const rows = [...rowsOf('fallbrook'), ...rowsOf('valley-center')];
  const at = '2026-10-06T03:19:11.008Z';

  it('is configured for the one contest, with its source', () => {
    expect(Object.keys(DATA_QUALITY.contestDateOverrides)).toEqual([id]);
    expect(DATA_QUALITY.contestDateOverrides[id]).toEqual({
      dateKey: '2026-09-29',
      timeTba: true,
      source: 'CIF-SDS power-rankings details, school_id 662 (Fallbrook) and 746 (Valley Center): both list the game on 09/29/2026 with no time; MaxPreps dates it 09/25 at 4:00 PM, the same slot as Fallbrook’s game against Rancho Buena Vista',
    });
  });

  it('moves the game to Sep 29 with no time, before the sort, and records what MaxPreps had', () => {
    const raw = normalizeGames(rows, { fetchedAt: at, dateOverrides: {} }).games.find((g) => g.contestId === id)!;
    expect([raw.dateLocal, raw.dateKey, raw.isTimeTba]).toEqual(['2026-09-25T16:00:00', '2026-09-25', false]);
    const { games } = normalizeGames(rows, { fetchedAt: at });
    const g = games.find((x) => x.contestId === id)!;
    expect(g.dateLocal).toBe('2026-09-29T00:00:00');
    expect(g.dateUtc).toBe('2026-09-29T07:00:00Z');
    expect(g.dateKey).toBe('2026-09-29');
    expect([g.isTimeTba, g.isDateTba]).toEqual([true, false]);
    expect(g.provenance.dateCorrection).toEqual({
      maxprepsDateLocal: '2026-09-25T16:00:00',
      maxprepsTimeTba: false,
      source: DATA_QUALITY.contestDateOverrides[id].source,
    });
    // Everything but the date is MaxPreps' as before.
    expect({ ...g, dateLocal: raw.dateLocal, dateUtc: raw.dateUtc, dateKey: raw.dateKey, isTimeTba: raw.isTimeTba, provenance: raw.provenance }).toEqual(raw);
    // Sorted by the corrected date: after every Sep 25-28 game of the two schools, before Sep 30.
    expect(games.map((x) => x.contestId)).toEqual([...games].sort((a, b) => a.dateLocal.localeCompare(b.dateLocal) || a.contestId.localeCompare(b.contestId)).map((x) => x.contestId));
    const i = games.indexOf(g);
    expect(games.slice(0, i).every((x) => x.dateKey <= '2026-09-29')).toBe(true);
    expect(games.slice(i + 1).every((x) => x.dateKey >= '2026-09-29')).toBe(true);
    // Fallbrook no longer hosts two games in the same Sep 25 slot.
    expect(games.filter((x) => x.dateLocal === '2026-09-25T16:00:00' && x.home.name === 'Fallbrook')).toHaveLength(1);
  });

  it('leaves every other contest alone, and applies nothing to a game with no override', () => {
    const plain = normalizeGames(rows, { fetchedAt: at, dateOverrides: {} }).games;
    const fixed = normalizeGames(rows, { fetchedAt: at }).games;
    expect(fixed.filter((g) => g.contestId !== id)).toEqual(plain.filter((g) => g.contestId !== id));
    expect(applyDateOverride(plain[0], undefined)).toBe(plain[0]);
  });

  it('puts a time-TBA date at Pacific midnight, in daylight and in standard time', () => {
    expect(pacificMidnightUtc('2026-09-29')).toBe('2026-09-29T07:00:00Z');
    expect(pacificMidnightUtc('2026-11-02')).toBe('2026-11-02T08:00:00Z');
    expect(pacificMidnightUtc('2026-11-01')).toBe('2026-11-01T07:00:00Z');
  });
});
