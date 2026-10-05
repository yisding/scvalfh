/**
 * lib/backfill.ts — owner decision D2 (SPEC §7.9): si.com backfills MaxPreps exactly when rules 2-4
 * say, and never otherwise. Every rule needs both si.com sides resolved by si.com id, a si.com Final,
 * integer scores and a non-junk row. Fixtures here are hand-built OfficialFixture objects; the corpus
 * si.com pages are used only as parser/resolver facts (the end-to-end PCAL fills are asserted in the
 * end-to-end suite, tests/pipeline/end-to-end.test.ts).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  BACKFILL_TEAM_PAGE_CAP,
  applyBackfill,
  cleanSbliveRows,
  dayDiff,
  eligibleItems,
  isIdResolved,
  planBackfill,
  scoreboardCoverage,
  shiftDateKey,
  supersededGamesOf,
  type BackfillInput,
} from '../lib/backfill';
import { scoreSentence } from '../lib/format';
import { getDivision } from '../lib/leagues';
import { FixtureMissing, TransportError, resourcePath, type ResourceKey, type RunContext } from '../lib/pipeline/contract';
import { scoreboardDates, stepSblive } from '../lib/pipeline/steps/sblive';
import { parseScoresPage, parseTeamGamesPage, type SbliveGame, type SbliveSide } from '../lib/sources/sblive';
import { loadSnapshot, parseSnapshot } from '../lib/snapshot-schema';
import { getTeamBySlug } from '../lib/teams';
import type { DivisionId, Game, OfficialFixture, Snapshot, SourceStatus } from '../lib/types';
import { game } from './game-builder';
import { REPO, corpusDir } from './helpers';

const TODAY = '2026-10-02';
const AT = '2026-10-02T15:00:00.000Z';

function fixture(division: DivisionId, date: string, away: string, home: string): OfficialFixture {
  const a = getTeamBySlug(away)!;
  const h = getTeamBySlug(home)!;
  const official = getDivision(division).official;
  if (official.mode === 'none') throw new Error(`${division} publishes no official schedule`);
  return {
    id: `${division}:${date}:${away}@${home}`,
    league: getTeamBySlug(home)!.league,
    division,
    dateKey: date,
    time: '16:00',
    awayName: a.name,
    homeName: h.name,
    awaySlug: away,
    homeSlug: home,
    source: official.source,
  };
}

type SideSpec = [slug: string, score: number | null, via?: SbliveSide['via']];

let nextId = 7_000_000;
function sb(date: string, a: SideSpec, b: SideSpec, over: Partial<SbliveGame> = {}): SbliveGame {
  const side = ([slug, score, via = 'team-id']: SideSpec): SbliveSide => {
    const t = getTeamBySlug(slug);
    return {
      name: t?.name ?? slug,
      sbliveTeamId: t?.external.sbliveTeamId ?? null,
      slug: t ? (via === null ? null : slug) : null,
      via: t ? via : null,
      score,
    };
  };
  const sides = [side(a), side(b)].sort((x, y) => (x.slug ?? x.name).localeCompare(y.slug ?? y.name)) as [SbliveSide, SbliveSide];
  const id = over.sbliveGameId ?? String((nextId += 1));
  const scored = sides.every((s) => s.score !== null);
  return {
    sbliveGameId: id,
    dateIso: `${date}T16:00:00.000-07:00`,
    dateKey: date,
    sides,
    isFinal: scored,
    isScored: scored,
    url: `https://www.si.com/high-school/stats/california/field-hockey/games/${id}-x-vs-y`,
    gameTypeLabel: null,
    origin: 'team-games',
    ...over,
  };
}

function input(over: Partial<BackfillInput>): BackfillInput {
  return { games: [], unmatched: [], sblive: [], today: TODAY, previous: null, sbliveFailed: false, fetchedAt: AT, ...over };
}

/** A snapshot carrying only what applyBackfill reads (games, supersededGames). */
function previousWith(games: Game[], supersededGames: Record<string, string> = {}): Snapshot {
  return { games, supersededGames } as unknown as Snapshot;
}

const GRE_AT_CAT = fixture('pcal', '2026-09-04', 'greenfield', 'santa-catalina');
const HOL_AT_GRE = fixture('pcal', '2026-09-30', 'hollister', 'greenfield');

function nonFinalsNeverScored(games: readonly Game[]): void {
  for (const g of games) {
    if (g.status !== 'final') {
      expect(g.home.score, g.contestId).toBeNull();
      expect(g.away.score, g.contestId).toBeNull();
    } else {
      expect(g.home.score, g.contestId).not.toBeNull();
      expect(g.away.score, g.contestId).not.toBeNull();
    }
  }
}

describe('backfill: dates', () => {
  it('counts whole days and shifts date keys', () => {
    expect(dayDiff('2026-09-04', '2026-09-05')).toBe(1);
    expect(dayDiff('2026-09-30', '2026-10-01')).toBe(1);
    expect(dayDiff('2026-10-01', '2026-09-17')).toBe(-14);
    expect(shiftDateKey('2026-10-02', -14)).toBe('2026-09-18');
  });
});

describe('backfill rule 2: an official fixture MaxPreps has no contest for', () => {
  it('publishes si.com’s Final as a new sblive: game, oriented by the fixture, and the fixture leaves unmatched', () => {
    const row = sb('2026-09-04', ['greenfield', 0], ['santa-catalina', 1], { sbliveGameId: '6541425', dateIso: '2026-09-04T16:45:00-07:00' });
    const res = applyBackfill(input({ unmatched: [GRE_AT_CAT, HOL_AT_GRE], sblive: [row] }));
    expect(res.unmatched).toEqual([HOL_AT_GRE]);
    expect(res.games).toHaveLength(1);
    const g = res.games[0];
    expect(g).toMatchObject({
      contestId: 'sblive:6541425',
      dateKey: '2026-09-04',
      dateLocal: '2026-09-04T16:45:00',
      dateUtc: '2026-09-04T23:45:00Z',
      isDateTba: false,
      isTimeTba: false,
      status: 'final',
      isLeague: true,
      leagueDivision: 'pcal',
      contestTypes: { home: null, away: null },
      countsFor: null,
      postseason: null,
      decider: 'REG',
      site: 'home',
      official: { scheduledDate: '2026-09-04', division: 'pcal', source: 'pcal-pdf', fixtureId: GRE_AT_CAT.id, pass: 'same-date' },
      urls: { maxpreps: null, sblive: row.url, nfhsStream: null, goFan: null },
      provenance: { scores: 'sblive', schedule: 'sblive', fetchedAt: AT },
    });
    expect(g.home).toMatchObject({ slug: 'santa-catalina', score: 1, result: 'W' });
    expect(g.away).toMatchObject({ slug: 'greenfield', score: 0, result: 'L' });
    expect(g.provenance.backfill).toEqual({
      rule: 'absent-fixture',
      sbliveGameId: '6541425',
      maxpreps: null,
      note: 'MaxPreps has no contest for this PCAL fixture (official date Sep 4), so the score is si.com’s.',
    });
    expect(res.rows).toEqual([
      {
        contestId: 'sblive:6541425',
        dateKey: '2026-09-04',
        label: 'Greenfield at Santa Catalina',
        rule: 'absent-fixture',
        sblive: { home: 1, away: 0 },
        maxpreps: null,
        sbliveUrl: row.url,
        maxprepsUrl: null,
        note: g.provenance.backfill?.note,
      },
    ]);
  });

  it('accepts ±1 day (pass "rescheduled", si.com’s date) and refuses ±2', () => {
    const plus1 = applyBackfill(input({ unmatched: [GRE_AT_CAT], sblive: [sb('2026-09-05', ['greenfield', 0], ['santa-catalina', 1])] }));
    expect(plus1.games).toHaveLength(1);
    expect(plus1.games[0].dateKey).toBe('2026-09-05');
    expect(plus1.games[0].official?.pass).toBe('rescheduled');
    expect(plus1.games[0].official?.scheduledDate).toBe('2026-09-04');

    const minus1 = applyBackfill(input({ unmatched: [GRE_AT_CAT], sblive: [sb('2026-09-03', ['greenfield', 0], ['santa-catalina', 1])] }));
    expect(minus1.games).toHaveLength(1);

    const plus2 = applyBackfill(input({ unmatched: [GRE_AT_CAT], sblive: [sb('2026-09-06', ['greenfield', 0], ['santa-catalina', 1], { sbliveGameId: '61' })] }));
    expect(plus2.games).toEqual([]);
    expect(plus2.unmatched).toEqual([GRE_AT_CAT]);
    expect(plus2.skipped.map((r) => [r.contestId, r.note])).toEqual([['sblive:61', 'Outside ±1 day of the official date.']]);
  });

  it('never fills from a side resolved by name', () => {
    for (const via of ['name', null] as const) {
      const res = applyBackfill(
        input({ unmatched: [GRE_AT_CAT], sblive: [sb('2026-09-04', ['greenfield', 0, via], ['santa-catalina', 1], { sbliveGameId: '62' })] }),
      );
      expect(res.games).toEqual([]);
      expect(res.rows).toEqual([]);
      expect(res.unmatched).toEqual([GRE_AT_CAT]);
      expect(res.skipped.map((r) => r.note)).toEqual(via === 'name' ? ['Resolved by name only.'] : []);
    }
    // School-id resolution is as good as team-id.
    const bySchool = applyBackfill(input({ unmatched: [GRE_AT_CAT], sblive: [sb('2026-09-04', ['greenfield', 0, 'school-id'], ['santa-catalina', 1, 'school-id'])] }));
    expect(bySchool.games).toHaveLength(1);
  });

  it('never fills while any MaxPreps contest of the pair exists within ±14 days — and says why it is not counted', () => {
    const row = sb('2026-09-04', ['greenfield', 0], ['santa-catalina', 1], { sbliveGameId: '63' });
    // A contestType-4 contest of the pair 10 days later (the matcher never let it consume the fixture).
    const ct4 = game({ home: 'santa-catalina', away: 'greenfield', date: '2026-09-14', contestTypes: { home: 4, away: 4 }, official: null });
    const res = applyBackfill(input({ games: [ct4], unmatched: [GRE_AT_CAT], sblive: [row] }));
    expect(res.games).toEqual([ct4]);
    expect(res.unmatched).toEqual([GRE_AT_CAT]);
    expect(res.rows).toEqual([]);
    expect(res.skipped).toHaveLength(1);
    expect(res.skipped[0]).toMatchObject({
      contestId: ct4.contestId,
      sblive: { home: 1, away: 0 },
      status: 'scheduled',
      note: `MaxPreps has this game (${ct4.contestId}) but it is not counted: MaxPreps marks it contestType 4.`,
    });

    // Any status, any type, any tag: a plain final non-league contest 14 days earlier also blocks it.
    for (const spec of [
      { date: '2026-08-21', hs: 2, as: 1, league: false },
      { date: '2026-09-18', status: 'postponed' as const },
      { date: '2026-09-04', status: 'score-pending' as const },
    ]) {
      const c = game({ home: 'greenfield', away: 'santa-catalina', official: null, ...spec });
      const blocked = applyBackfill(input({ games: [c], unmatched: [GRE_AT_CAT], sblive: [row] }));
      expect(blocked.games.filter((g) => g.contestId.startsWith('sblive:')), spec.date).toEqual([]);
    }

    // 15 days away is outside the window: the fixture is absent and si.com fills it.
    const far = game({ home: 'santa-catalina', away: 'greenfield', date: '2026-09-19', hs: 1, as: 0, official: null });
    const filled = applyBackfill(input({ games: [far], unmatched: [GRE_AT_CAT], sblive: [row] }));
    expect(filled.games.map((g) => g.contestId)).toEqual([far.contestId, 'sblive:63']);
  });

  it('the pair’s other leg, matched to its own fixture, does not block a fill (MCAL legs 6 days apart)', () => {
    const leg1 = fixture('marin-county', '2026-09-18', 'marin-academy', 'tamalpais');
    const leg2 = fixture('marin-county', '2026-09-24', 'tamalpais', 'marin-academy');
    const played = game({ home: 'tamalpais', away: 'marin-academy', date: '2026-09-18', hs: 2, as: 0, official: { fixtureId: leg1.id } });
    expect(played.countsFor).toBe('marin-county');
    const rows = [
      sb('2026-09-18', ['marin-academy', 0], ['tamalpais', 2], { sbliveGameId: '81' }),
      sb('2026-09-24', ['marin-academy', 1], ['tamalpais', 1], { sbliveGameId: '82' }),
    ];
    expect(eligibleItems([played], [leg2], TODAY).map((i) => `${i.kind} ${i.date}`)).toEqual(['absent-fixture 2026-09-24']);
    const res = applyBackfill(input({ games: [played], unmatched: [leg2], sblive: rows }));
    expect(res.games.map((g) => g.contestId)).toEqual([played.contestId, 'sblive:82']);
    expect(res.games[1].official?.fixtureId).toBe(leg2.id);
    expect(res.unmatched).toEqual([]);
    // Never a false "MaxPreps has this game … it did not match" row about the other leg.
    expect(res.skipped.filter((r) => r.contestId === played.contestId)).toEqual([]);

    // An UNSTAMPED contest of the pair still blocks, and is the one named.
    const loose = game({ home: 'tamalpais', away: 'marin-academy', date: '2026-09-20', hs: 1, as: 0, official: null, league: false });
    const blocked = applyBackfill(input({ games: [played, loose], unmatched: [leg2], sblive: rows }));
    expect(blocked.games.some((g) => g.contestId.startsWith('sblive:'))).toBe(false);
  });

  it('never fills a leg with the si.com row of the other leg’s MaxPreps game (legs two days apart)', () => {
    const leg1 = fixture('marin-county', '2026-09-22', 'marin-academy', 'tamalpais');
    const leg2 = fixture('marin-county', '2026-09-24', 'tamalpais', 'marin-academy');
    // MaxPreps dates leg 1's contest Sep 23 (matched to leg 1); si.com has that same game on Sep 23.
    const played = game({ home: 'tamalpais', away: 'marin-academy', date: '2026-09-23', hs: 2, as: 0, official: { fixtureId: leg1.id, scheduledDate: leg1.dateKey } });
    const res = applyBackfill(input({ games: [played], unmatched: [leg2], sblive: [sb('2026-09-23', ['marin-academy', 0], ['tamalpais', 2])] }));
    expect(res.games).toEqual([played]);
    expect(res.unmatched).toEqual([leg2]);
  });

  it('names the MCAL cut-off when MaxPreps moved a league game past it', () => {
    const f = fixture('marin-county', '2026-10-22', 'redwood', 'tamalpais');
    const moved = game({ home: 'tamalpais', away: 'redwood', date: '2026-10-23', status: 'score-pending', official: null });
    const res = applyBackfill(
      input({ games: [moved], unmatched: [f], sblive: [sb('2026-10-22', ['redwood', 1], ['tamalpais', 2])], today: '2026-10-28' }),
    );
    // Rule 3 fills the contest itself (si.com within ±1 day of MaxPreps’ date), so no "not counted" row.
    expect(res.games).toHaveLength(1);
    expect(res.games[0].provenance.backfill?.rule).toBe('score-pending');
    expect(res.skipped).toEqual([]);

    const scheduled = { ...moved, status: 'scheduled' as const };
    const res2 = applyBackfill(
      input({ games: [scheduled], unmatched: [f], sblive: [sb('2026-10-22', ['redwood', 1], ['tamalpais', 2])], today: '2026-10-28' }),
    );
    expect(res2.skipped.map((r) => r.note)).toEqual([
      `MaxPreps has this game (${moved.contestId}) but it is not counted: MaxPreps dates it Oct 23, on or after MCAL’s Oct 23 postseason cut-off.`,
    ]);
  });

  it('refuses conflicting si.com candidates', () => {
    const res = applyBackfill(
      input({
        unmatched: [GRE_AT_CAT],
        sblive: [sb('2026-09-04', ['greenfield', 0], ['santa-catalina', 1]), sb('2026-09-05', ['greenfield', 2], ['santa-catalina', 1])],
      }),
    );
    expect(res.games).toEqual([]);
    expect(res.unmatched).toEqual([GRE_AT_CAT]);
    expect(res.warnings.join(' ')).toMatch(/different scores/);
    expect(res.skipped.map((r) => r.note)).toEqual(['si.com has two different scores for this game.']);
    // Two rows with the SAME score are one game seen twice: fill.
    const same = applyBackfill(
      input({ unmatched: [GRE_AT_CAT], sblive: [sb('2026-09-04', ['greenfield', 0], ['santa-catalina', 1]), sb('2026-09-05', ['greenfield', 0], ['santa-catalina', 1])] }),
    );
    expect(same.games).toHaveLength(1);
    expect(same.games[0].dateKey).toBe('2026-09-04');
  });

  it('needs a past fixture, a si.com Final, integer scores and a California game row', () => {
    const cases: Array<[string, Partial<BackfillInput>]> = [
      ['dated today', { unmatched: [fixture('pcal', TODAY, 'greenfield', 'santa-catalina')], sblive: [sb(TODAY, ['greenfield', 0], ['santa-catalina', 1])] }],
      ['not final', { unmatched: [GRE_AT_CAT], sblive: [sb('2026-09-04', ['greenfield', 0], ['santa-catalina', 1], { isFinal: false })] }],
      ['unscored', { unmatched: [GRE_AT_CAT], sblive: [sb('2026-09-04', ['greenfield', null], ['santa-catalina', null])] }],
      [
        'a /new-york/ row',
        {
          unmatched: [GRE_AT_CAT],
          sblive: [sb('2026-09-04', ['greenfield', 0], ['santa-catalina', 1], { url: 'https://www.si.com/high-school/stats/new-york/field-hockey/games/6642005-x' })],
        },
      ],
      ['no url', { unmatched: [GRE_AT_CAT], sblive: [sb('2026-09-04', ['greenfield', 0], ['santa-catalina', 1], { url: null })] }],
      ['another pair', { unmatched: [GRE_AT_CAT], sblive: [sb('2026-09-04', ['greenfield', 0], ['hollister', 1])] }],
    ];
    for (const [why, over] of cases) {
      const res = applyBackfill(input(over));
      expect(res.games, why).toEqual([]);
      expect(res.rows, why).toEqual([]);
      expect(res.unmatched.length, why).toBe(1);
    }
  });

  it('fills an absent fixture in any league, SCVAL included', () => {
    const f = fixture('de-anza', '2026-09-24', 'saint-francis', 'homestead');
    const res = applyBackfill(input({ unmatched: [f], sblive: [sb('2026-09-24', ['saint-francis', 7], ['homestead', 0])] }));
    expect(res.games).toHaveLength(1);
    expect(res.games[0]).toMatchObject({ leagueDivision: 'de-anza', official: { source: 'scval-pdf', division: 'de-anza' } });
    expect(res.games[0].provenance.backfill?.note).toContain('SCVAL fixture');
  });

  it('uses a si.com game once', () => {
    const twin = fixture('pcal', '2026-09-05', 'santa-catalina', 'greenfield');
    const res = applyBackfill(input({ unmatched: [GRE_AT_CAT, twin], sblive: [sb('2026-09-04', ['greenfield', 0], ['santa-catalina', 1])] }));
    expect(res.games).toHaveLength(1);
    expect(res.unmatched).toEqual([twin]);
  });
});

describe('backfill rule 3: MaxPreps has the contest but no score', () => {
  const pending = game({ home: 'stevenson', away: 'carmel', date: '2026-09-29', status: 'score-pending', contestId: 'f06f9d76-c8a1-4358-b7a9-1c97c2d686f0' });
  const row = sb('2026-09-29', ['carmel', 0], ['stevenson', 9], { sbliveGameId: '6499423' });

  it('writes si.com’s Final onto the MaxPreps contest (contestId kept) and it becomes final', () => {
    const res = applyBackfill(input({ games: [pending], sblive: [row] }));
    const g = res.games[0];
    expect(g.contestId).toBe(pending.contestId);
    expect(g.status).toBe('final');
    expect(g.decider).toBe('REG');
    expect(g.home).toMatchObject({ slug: 'stevenson', score: 9, result: 'W' });
    expect(g.away).toMatchObject({ slug: 'carmel', score: 0, result: 'L' });
    expect(g.official).toEqual(pending.official);
    expect(g.urls.sblive).toBe(row.url);
    expect(g.provenance.scores).toBe('sblive');
    expect(g.provenance.scoreConflict).toBeUndefined();
    expect(g.provenance.backfill).toEqual({
      rule: 'score-pending',
      sbliveGameId: '6499423',
      maxpreps: null,
      note: 'MaxPreps lists this game without a score, so the score is si.com’s.',
    });
    expect(res.rows).toEqual([expect.objectContaining({ contestId: pending.contestId, rule: 'score-pending', sblive: { home: 9, away: 0 }, maxpreps: null })]);
  });

  it('accepts ±1 day and refuses ±2', () => {
    expect(applyBackfill(input({ games: [pending], sblive: [sb('2026-09-30', ['carmel', 0], ['stevenson', 9])] })).games[0].status).toBe('final');
    expect(applyBackfill(input({ games: [pending], sblive: [sb('2026-10-01', ['carmel', 0], ['stevenson', 9])] })).games[0]).toBe(pending);
  });

  it('never fills a game dated today, a name-only side, a conflict, or a pair MaxPreps already scored', () => {
    const today = { ...pending, dateKey: TODAY, dateLocal: `${TODAY}T16:00:00` };
    expect(applyBackfill(input({ games: [today], sblive: [sb(TODAY, ['carmel', 0], ['stevenson', 9])] })).games[0]).toBe(today);

    const nameOnly = applyBackfill(input({ games: [pending], sblive: [sb('2026-09-29', ['carmel', 0], ['stevenson', 9, 'name'])] }));
    expect(nameOnly.games[0]).toBe(pending);
    expect(nameOnly.skipped.map((r) => [r.contestId, r.note])).toEqual([[pending.contestId, 'Resolved by name only.']]);

    const conflict = applyBackfill(
      input({ games: [pending], sblive: [sb('2026-09-29', ['carmel', 0], ['stevenson', 9]), sb('2026-09-29', ['carmel', 1], ['stevenson', 9])] }),
    );
    expect(conflict.games[0]).toBe(pending);
    expect(conflict.skipped.map((r) => r.note)).toEqual(['si.com has two different scores for this game.']);

    const scored = game({ home: 'stevenson', away: 'carmel', date: '2026-09-30', hs: 9, as: 0, official: null });
    const twin = applyBackfill(input({ games: [pending, scored], sblive: [row] }));
    expect(twin.games[0]).toBe(pending);
    expect(twin.rows).toEqual([]);
  });

  it('needs both sides to be our teams', () => {
    const outside = { ...pending, away: { ...pending.away, teamId: null, slug: null, name: "Bishop's" } };
    expect(applyBackfill(input({ games: [outside], sblive: [row] })).games[0]).toBe(outside);
  });
});

describe('backfill rule 4: a clearly wrong MaxPreps final', () => {
  it('4a: result flags contradict the score → si.com’s score, MaxPreps’ value kept as the conflict', () => {
    const base = game({ home: 'salinas', away: 'monterey', date: '2026-09-09', hs: 1, as: 2 });
    const bad = { ...base, provenance: { ...base.provenance, resultConflict: 'the side with more goals is marked L' } };
    const res = applyBackfill(input({ games: [bad], sblive: [sb('2026-09-09', ['monterey', 1], ['salinas', 2], { sbliveGameId: '64' })] }));
    const g = res.games[0];
    expect(g.home).toMatchObject({ score: 2, result: 'W' });
    expect(g.away).toMatchObject({ score: 1, result: 'L' });
    expect(g.provenance.scores).toBe('sblive');
    expect(g.provenance.backfill).toMatchObject({ rule: 'contradictory-result', sbliveGameId: '64', maxpreps: { home: 1, away: 2 } });
    expect(g.provenance.scoreConflict?.sblive).toEqual({ home: 1, away: 2 });
    expect(g.provenance.scoreConflict?.note).toMatch(/MaxPreps reported 2-1 \(Monterey–Salinas\)\.$/);
    expect(res.rows[0]).toMatchObject({ rule: 'contradictory-result', sblive: { home: 2, away: 1 }, maxpreps: { home: 1, away: 2 } });

    // The same si.com score as MaxPreps: nothing to override.
    const agree = applyBackfill(input({ games: [bad], sblive: [sb('2026-09-09', ['monterey', 2], ['salinas', 1])] }));
    expect(agree.games[0]).toBe(bad);
    // Without the contradiction it is a plain disagreement (rule 5): MaxPreps stays.
    expect(applyBackfill(input({ games: [base], sblive: [sb('2026-09-09', ['monterey', 1], ['salinas', 2])] })).games[0]).toBe(base);
  });

  it('4b: matched only in pass 3, > 7 days from the official date, si.com Final on the official date', () => {
    const late = game({
      home: 'hollister',
      away: 'monterey',
      date: '2026-09-30',
      hs: 3,
      as: 3,
      official: { pass: 'rescheduled', scheduledDate: '2026-09-21' },
    });
    const res = applyBackfill(input({ games: [late], sblive: [sb('2026-09-21', ['hollister', 7], ['monterey', 0], { sbliveGameId: '65' })] }));
    const g = res.games[0];
    expect(g.dateKey).toBe('2026-09-30');
    expect(g.home.score).toBe(7);
    expect(g.provenance.backfill?.rule).toBe('off-schedule-date');
    expect(g.provenance.backfill?.note).toContain('Sep 30');
    expect(g.provenance.backfill?.note).toContain('Sep 21');

    // 7 days is not "more than 7".
    const seven = { ...late, official: { ...late.official!, scheduledDate: '2026-09-23' } };
    expect(applyBackfill(input({ games: [seven], sblive: [sb('2026-09-23', ['hollister', 7], ['monterey', 0])] })).games[0]).toBe(seven);
    // si.com on MaxPreps’ date rather than the official date: no.
    expect(applyBackfill(input({ games: [late], sblive: [sb('2026-09-30', ['hollister', 7], ['monterey', 0])] })).games[0]).toBe(late);
    // A same-date or swapped match never qualifies.
    const sameDate = { ...late, official: { ...late.official!, pass: 'same-date' as const } };
    expect(applyBackfill(input({ games: [sameDate], sblive: [sb('2026-09-21', ['hollister', 7], ['monterey', 0])] })).games[0]).toBe(sameDate);
  });

  it('4c: a 0-0 tie in PCAL or MCAL with si.com decided the same day → si.com’s score', () => {
    for (const [home, away] of [
      ['carmel', 'salinas'],
      ['redwood', 'tamalpais'],
    ] as const) {
      const tie = game({ home, away, date: '2026-09-23', hs: 0, as: 0 });
      const res = applyBackfill(input({ games: [tie], sblive: [sb('2026-09-23', [home, 2], [away, 0])] }));
      expect(res.games[0].provenance.backfill?.rule, home).toBe('phantom-tie');
      expect(res.games[0].home.score).toBe(2);
      expect(res.games[0].provenance.scoreConflict?.sblive).toEqual({ home: 0, away: 0 });
    }
  });

  it('4c never applies in SCVAL or BVAL (sudden victory), on another day, or when si.com also has a tie', () => {
    const cases: Array<[Game, SbliveGame]> = [
      [game({ home: 'los-altos', away: 'cupertino', date: '2026-09-23', hs: 0, as: 0 }), sb('2026-09-23', ['los-altos', 1], ['cupertino', 0])],
      [game({ home: 'leigh', away: 'gilroy', date: '2026-09-23', hs: 0, as: 0 }), sb('2026-09-23', ['leigh', 1], ['gilroy', 0])],
      [game({ home: 'carmel', away: 'salinas', date: '2026-09-23', hs: 0, as: 0 }), sb('2026-09-24', ['carmel', 1], ['salinas', 0])],
      [game({ home: 'carmel', away: 'salinas', date: '2026-09-23', hs: 0, as: 0 }), sb('2026-09-23', ['carmel', 1], ['salinas', 1])],
      // A 1-1 tie is not a phantom 0-0.
      [game({ home: 'carmel', away: 'salinas', date: '2026-09-23', hs: 1, as: 1 }), sb('2026-09-23', ['carmel', 2], ['salinas', 1])],
    ];
    for (const [g, row] of cases) {
      const res = applyBackfill(input({ games: [g], sblive: [row] }));
      expect(res.games[0], `${g.home.slug} ${g.away.slug}`).toBe(g);
      expect(res.rows).toEqual([]);
    }
  });
});

describe('backfill: a level si.com score in a 1 v 1 league (EAL)', () => {
  const LEVEL_NOTE =
    'si.com has a level score, but a varsity EAL game is decided on 1 v 1s and si.com does not say who won them, so it is not used.';
  const pending = game({ home: 'corning', away: 'pleasant-valley', date: '2026-09-29', status: 'score-pending' });

  it('rule 3 does not fill a score-pending EAL game from a level si.com score, and says why', () => {
    const row = sb('2026-09-29', ['corning', 1], ['pleasant-valley', 1]);
    const res = applyBackfill(input({ games: [pending], sblive: [row] }));
    expect(res.games[0]).toBe(pending);
    expect(res.rows).toEqual([]);
    expect(res.skipped).toEqual([
      expect.objectContaining({ contestId: pending.contestId, sblive: { home: 1, away: 1 }, sbliveUrl: row.url, note: LEVEL_NOTE }),
    ]);
  });

  it('rule 3 fills it from a decisive si.com score, as for any league', () => {
    const res = applyBackfill(input({ games: [pending], sblive: [sb('2026-09-29', ['corning', 0], ['pleasant-valley', 3])] }));
    const g = res.games[0];
    expect(g.status).toBe('final');
    expect(g.home).toMatchObject({ slug: 'corning', score: 0, result: 'L' });
    expect(g.away).toMatchObject({ slug: 'pleasant-valley', score: 3, result: 'W' });
    expect(g.provenance.backfill?.rule).toBe('score-pending');
    expect(res.skipped).toEqual([]);
  });

  it('a level si.com score still fills a league that ends level games as ties (PCAL)', () => {
    const pcal = game({ home: 'carmel', away: 'salinas', date: '2026-09-29', status: 'score-pending' });
    const g = applyBackfill(input({ games: [pcal], sblive: [sb('2026-09-29', ['carmel', 1], ['salinas', 1])] })).games[0];
    expect(g.status).toBe('final');
    expect([g.home.result, g.away.result]).toEqual(['T', 'T']);
  });

  it('rules 4a and 4b never override an EAL final with a level si.com score; a decisive one still does', () => {
    const base = game({ home: 'chico', away: 'davis', date: '2026-09-28', hs: 2, as: 1 });
    const bad = { ...base, provenance: { ...base.provenance, resultConflict: 'the side with more goals is marked L' } };
    expect(applyBackfill(input({ games: [bad], sblive: [sb('2026-09-28', ['chico', 1], ['davis', 1])] })).games[0]).toBe(bad);
    const decisive = applyBackfill(input({ games: [bad], sblive: [sb('2026-09-28', ['chico', 0], ['davis', 1])] })).games[0];
    expect(decisive.provenance.backfill?.rule).toBe('contradictory-result');

    // 4b needs an official stamp, which no EAL game carries; a stamped one still meets the guard.
    const late = game({
      home: 'lassen', away: 'bella-vista', date: '2026-09-30', hs: 3, as: 0,
      official: { source: 'scval-pdf', pass: 'rescheduled', scheduledDate: '2026-09-21' },
    });
    expect(applyBackfill(input({ games: [late], sblive: [sb('2026-09-21', ['lassen', 2], ['bella-vista', 2])] })).games[0]).toBe(late);
    const moved = applyBackfill(input({ games: [late], sblive: [sb('2026-09-21', ['lassen', 2], ['bella-vista', 1])] })).games[0];
    expect(moved.provenance.backfill?.rule).toBe('off-schedule-date');
  });

  it('a decisive si.com score over a 1 v 1 win (SO) drops the SO decider, and the snapshot stays valid', () => {
    // One team feed has Chico 1 W, Davis 1 L (a 1 v 1 win); the other Chico 2, Davis 1. Normalize keeps
    // the level copy as 'SO' and the feed-disagreement note, which is rule 4a evidence.
    const so = game({ home: 'chico', away: 'davis', date: '2026-09-28', hs: 1, as: 1, results: { home: 'W', away: 'L' } });
    expect(so.decider).toBe('SO');
    const split = {
      ...so,
      provenance: {
        ...so.provenance,
        resultConflict: "MaxPreps' two team feeds disagree on the score (Chico 1, Davis 1 in one; Chico 2, Davis 1 in the other).",
      },
    };
    const g = applyBackfill(input({ games: [split], sblive: [sb('2026-09-28', ['chico', 2], ['davis', 1])] })).games[0];
    expect(g.provenance.backfill?.rule).toBe('contradictory-result');
    expect(g).toMatchObject({ decider: 'REG', shootout: null });
    expect(g.home).toMatchObject({ score: 2, result: 'W' });
    expect(g.away).toMatchObject({ score: 1, result: 'L' });
    expect(scoreSentence(g)).not.toMatch(/1 v 1/);
    const s = loadSnapshot(JSON.parse(readFileSync(path.join(import.meta.dirname, 'golden', 'snapshot-2026-10-02.v1.json'), 'utf8')));
    expect(() => parseSnapshot({ ...s, games: [...s.games, g], counts: { ...s.counts, games: s.games.length + 1 } })).not.toThrow();

    // Rule 4b (stamped, as above): the decider follows MaxPreps' overtime count.
    const lateSo = game({
      home: 'lassen', away: 'bella-vista', date: '2026-09-30', hs: 2, as: 2, ot: 1, results: { home: 'L', away: 'W' },
      official: { source: 'scval-pdf', pass: 'rescheduled', scheduledDate: '2026-09-21' },
    });
    expect(lateSo.decider).toBe('SO');
    const moved = applyBackfill(input({ games: [lateSo], sblive: [sb('2026-09-21', ['lassen', 2], ['bella-vista', 3])] })).games[0];
    expect(moved.provenance.backfill?.rule).toBe('off-schedule-date');
    expect(moved).toMatchObject({ decider: 'OT', shootout: null });
  });
});

describe('backfill rule 5 and the never-0-0 rule', () => {
  it('leaves a plain disagreement alone (MaxPreps stays)', () => {
    const g = game({ home: 'greenfield', away: 'stevenson', date: '2026-09-21', hs: 0, as: 8 });
    const res = applyBackfill(input({ games: [g], sblive: [sb('2026-09-21', ['greenfield', 0], ['stevenson', 7])] }));
    expect(res.games[0]).toBe(g);
    expect(res.rows).toEqual([]);
    expect(res.skipped).toEqual([]);
  });

  it('never gives a non-final game a score, whatever si.com says', () => {
    const games = [
      game({ home: 'stevenson', away: 'carmel', date: '2026-09-29', status: 'score-pending' }),
      game({ home: 'salinas', away: 'monterey', date: '2026-09-30', status: 'scheduled' }),
      game({ home: 'hollister', away: 'greenfield', date: '2026-10-08', status: 'scheduled' }),
      game({ home: 'carmel', away: 'monterey', date: TODAY, status: 'score-pending' }),
      game({ home: 'tamalpais', away: 'redwood', date: '2026-09-25', status: 'postponed' }),
    ];
    const res = applyBackfill(
      input({
        games,
        unmatched: [GRE_AT_CAT, fixture('pcal', '2026-10-06', 'santa-catalina', 'greenfield')],
        sblive: [
          sb('2026-09-29', ['carmel', 0], ['stevenson', 9]),
          sb('2026-09-30', ['salinas', 1], ['monterey', 0], { isFinal: false }),
          sb('2026-10-08', ['hollister', null], ['greenfield', null]),
          sb(TODAY, ['carmel', 1], ['monterey', 0]),
          sb('2026-09-25', ['tamalpais', 1], ['redwood', 0], { isFinal: false }),
          sb('2026-09-04', ['greenfield', 0], ['santa-catalina', 1]),
        ],
      }),
    );
    nonFinalsNeverScored(res.games);
    expect(res.games.filter((g) => g.status === 'final').map((g) => g.provenance.backfill?.rule).sort()).toEqual(['absent-fixture', 'score-pending']);
  });
});

describe('backfill rule 7: junk-row guards', () => {
  it('drops non-California rows and JV-only/withdrawn sides, collapses ids then (date, pair) keeping the scored row', () => {
    const scored = sb('2026-09-11', ['salinas', 1], ['stevenson', 2], { sbliveGameId: '6499419' });
    const unscoredDup = sb('2026-09-11', ['salinas', null], ['stevenson', null], { sbliveGameId: '6641765' });
    const sameIdWorse = { ...scored, isFinal: false, isScored: false, sides: scored.sides.map((s) => ({ ...s, score: null })) as typeof scored.sides };
    const ny = sb('2026-10-12', ['salinas', null], ['stevenson', null], { sbliveGameId: '6642005', url: 'https://www.si.com/high-school/stats/new-york/field-hockey/games/6642005-salinas-vs-stevenson' });
    const york: SbliveGame = {
      ...sb('2026-09-30', ['salinas', 1], ['stevenson', 1], { sbliveGameId: '6641900' }),
    };
    york.sides = [york.sides[0], { name: 'York', sbliveTeamId: '456851', slug: null, via: null, refused: 'ignored-team', score: 1 }];
    const wilcox: SbliveGame = { ...sb('2026-09-30', ['los-altos', 3], ['cupertino', 0], { sbliveGameId: '6528223' }) };
    wilcox.sides = [wilcox.sides[0], { name: 'Wilcox', sbliveTeamId: null, slug: null, via: null, refused: 'unknown', score: 0 }];

    const out = cleanSbliveRows([sameIdWorse, unscoredDup, scored, ny, york, wilcox]);
    expect(out.rows.map((g) => g.sbliveGameId)).toEqual(['6499419']);
    expect(out.rows[0].isScored).toBe(true);
    expect(out.junkPath.map((g) => g.sbliveGameId)).toEqual(['6642005']);
    expect(out.ignored.map((g) => g.sbliveGameId).sort()).toEqual(['6528223', '6641900']);
  });

  it('only id-resolved sides count', () => {
    expect(isIdResolved({ slug: 'carmel', via: 'team-id' })).toBe(true);
    expect(isIdResolved({ slug: 'carmel', via: 'school-id' })).toBe(true);
    expect(isIdResolved({ slug: 'carmel', via: 'name' })).toBe(false);
    expect(isIdResolved({ slug: null, via: null })).toBe(false);
  });
});

describe('backfill rule 8: planBackfill', () => {
  it('lists every eligible item with the date si.com must have it on', () => {
    const pending = game({ home: 'stevenson', away: 'carmel', date: '2026-09-29', status: 'score-pending' });
    const late = game({ home: 'hollister', away: 'monterey', date: '2026-09-30', hs: 3, as: 3, official: { pass: 'rescheduled', scheduledDate: '2026-09-21' } });
    const tie = game({ home: 'carmel', away: 'salinas', date: '2026-09-23', hs: 0, as: 0 });
    const fine = game({ home: 'greenfield', away: 'stevenson', date: '2026-09-21', hs: 0, as: 8 });
    const items = eligibleItems([pending, late, tie, fine], [GRE_AT_CAT, fixture('pcal', '2026-10-06', 'santa-catalina', 'greenfield')], TODAY);
    expect(items.map((i) => [i.kind, i.pairKey, i.date])).toEqual([
      ['score-pending', 'carmel~stevenson', '2026-09-29'],
      ['clearly-wrong', 'hollister~monterey', '2026-09-21'],
      ['clearly-wrong', 'carmel~salinas', '2026-09-23'],
      ['absent-fixture', 'greenfield~santa-catalina', '2026-09-04'],
    ]);
  });

  it('covers what the scoreboard did not with the fewest team pages, ties by slug', () => {
    const unmatched = [
      GRE_AT_CAT,
      HOL_AT_GRE,
      fixture('pcal', '2026-09-08', 'monterey', 'greenfield'),
      fixture('pcal', '2026-09-10', 'salinas', 'carmel'),
    ];
    const pending = game({ home: 'stevenson', away: 'carmel', date: '2026-09-29', status: 'score-pending' });
    const covers = scoreboardCoverage([sb('2026-09-30', ['hollister', 3], ['greenfield', 1])]);
    const plan = planBackfill({ games: [pending], unmatched, today: TODAY }, covers);
    expect(plan.eligible).toHaveLength(5);
    // HOL@GRE is on the scoreboard. carmel (SAL@CAR, CAR@STE) and greenfield (GRE@CAT, MON@GRE) each cover
    // two of the four left: the tie goes to the slug, and the second page covers the rest.
    expect(plan.teamPagesNeeded).toEqual(['carmel', 'greenfield']);
    // One page that covers three beats any page that covers two.
    const three = planBackfill({ games: [pending], unmatched: [...unmatched, fixture('pcal', '2026-09-12', 'greenfield', 'hollister')], today: TODAY }, covers);
    expect(three.teamPagesNeeded).toEqual(['greenfield', 'carmel']);
    expect(plan.deferred).toEqual([]);
  });

  it('a scoreboard row resolved only by name does not cover an item', () => {
    const covers = scoreboardCoverage([sb('2026-09-04', ['greenfield', 0, 'name'], ['santa-catalina', 1])]);
    expect(covers('greenfield~santa-catalina', '2026-09-04')).toBe(false);
    expect(scoreboardCoverage([sb('2026-09-05', ['greenfield', 0], ['santa-catalina', 1])])('greenfield~santa-catalina', '2026-09-04')).toBe(true);
  });

  it('stops at the cap of 8 pages; the rest wait for the next run', () => {
    expect(BACKFILL_TEAM_PAGE_CAP).toBe(8);
    // Ten disjoint score-pending pairs across leagues: ten pages would be needed.
    const pairs: Array<[string, string]> = [
      ['branham', 'christopher'], ['gilroy', 'leigh'], ['leland', 'willow-glen'], ['del-mar', 'live-oak'], ['prospect', 'silver-creek'],
      ['sobrato', 'westmont'], ['archie-williams', 'redwood'], ['berkeley', 'lick-wilmerding'], ['university-sf', 'marin-catholic'], ['carmel', 'stevenson'],
    ];
    const games = pairs.map(([home, away]) => game({ home, away, date: '2026-09-29', status: 'score-pending' }));
    const plan = planBackfill({ games, unmatched: [], today: TODAY }, () => false);
    expect(plan.teamPagesNeeded).toHaveLength(8);
    expect(plan.deferred).toHaveLength(2);
    expect(planBackfill({ games, unmatched: [], today: TODAY }, () => false, 3).teamPagesNeeded).toHaveLength(3);
    // Everything on the scoreboard: no pages at all.
    expect(planBackfill({ games, unmatched: [], today: TODAY }, () => true).teamPagesNeeded).toEqual([]);
  });
});

describe('backfill rule 10: supersede and carry-forward', () => {
  const filled = applyBackfill(input({ unmatched: [GRE_AT_CAT], sblive: [sb('2026-09-04', ['greenfield', 0], ['santa-catalina', 1], { sbliveGameId: '6541425' })] })).games[0];

  it('a MaxPreps contest that now matches the filled fixture wins; the sblive: id maps to it', () => {
    const contest = game({ home: 'santa-catalina', away: 'greenfield', date: '2026-09-04', hs: 1, as: 0, official: { fixtureId: GRE_AT_CAT.id } });
    const res = applyBackfill(
      input({ games: [contest], unmatched: [], sblive: [sb('2026-09-04', ['greenfield', 0], ['santa-catalina', 1], { sbliveGameId: '6541425' })], previous: previousWith([filled]) }),
    );
    expect(res.games).toEqual([contest]);
    expect(res.rows).toEqual([]);
    expect(res.supersededGames).toEqual({ 'sblive:6541425': contest.contestId });
    expect(supersededGamesOf(res.games, previousWith([filled]))).toEqual(res.supersededGames);
  });

  it('carries the previous map while both ends hold', () => {
    const contest = game({ home: 'santa-catalina', away: 'greenfield', date: '2026-09-04', hs: 1, as: 0 });
    const prev = previousWith([], { 'sblive:6541425': contest.contestId, 'sblive:1': 'gone' });
    expect(applyBackfill(input({ games: [contest], previous: prev })).supersededGames).toEqual({ 'sblive:6541425': contest.contestId });
  });

  it('when every si.com request failed, re-applies earlier fills that are still eligible', () => {
    const pending = game({ home: 'stevenson', away: 'carmel', date: '2026-09-29', status: 'score-pending' });
    const pendingFilled = applyBackfill(input({ games: [pending], sblive: [sb('2026-09-29', ['carmel', 0], ['stevenson', 9])] })).games[0];
    const base = game({ home: 'salinas', away: 'monterey', date: '2026-09-09', hs: 1, as: 2 });
    const bad = { ...base, provenance: { ...base.provenance, resultConflict: 'flags contradict' } };
    const badFixed = applyBackfill(input({ games: [bad], sblive: [sb('2026-09-09', ['monterey', 1], ['salinas', 2])] })).games[0];
    const previous = previousWith([filled, pendingFilled, badFixed]);

    const res = applyBackfill(input({ games: [pending, bad], unmatched: [GRE_AT_CAT], previous, sbliveFailed: true }));
    expect(res.unmatched).toEqual([]);
    expect(res.games.map((g) => [g.contestId, g.status, g.home.score, g.away.score, g.provenance.backfill?.rule])).toEqual([
      [pending.contestId, 'final', 9, 0, 'score-pending'],
      [bad.contestId, 'final', 2, 1, 'contradictory-result'],
      ['sblive:6541425', 'final', 1, 0, 'absent-fixture'],
    ]);
    expect(res.rows.map((r) => r.rule).sort()).toEqual(['absent-fixture', 'contradictory-result', 'score-pending']);
    nonFinalsNeverScored(res.games);
  });

  it('…but not once MaxPreps has caught up', () => {
    const pending = game({ home: 'stevenson', away: 'carmel', date: '2026-09-29', status: 'score-pending' });
    const pendingFilled = applyBackfill(input({ games: [pending], sblive: [sb('2026-09-29', ['carmel', 0], ['stevenson', 9])] })).games[0];
    const nowScored = { ...pending, status: 'final' as const, home: { ...pending.home, score: 9, result: 'W' as const }, away: { ...pending.away, score: 0, result: 'L' as const } };
    const contest = game({ home: 'greenfield', away: 'santa-catalina', date: '2026-09-11', status: 'scheduled', official: null });
    const res = applyBackfill(
      input({ games: [nowScored, contest], unmatched: [GRE_AT_CAT], previous: previousWith([filled, pendingFilled]), sbliveFailed: true }),
    );
    expect(res.games).toEqual([nowScored, contest]);
    expect(res.unmatched).toEqual([GRE_AT_CAT]);
    expect(res.rows).toEqual([]);
  });

  it('a run that read si.com but not the page an earlier fill came from carries that fill; a consulted item is decided afresh', () => {
    const pending = game({ home: 'stevenson', away: 'carmel', date: '2026-09-29', status: 'score-pending' });
    const pendingFilled = applyBackfill(input({ games: [pending], sblive: [sb('2026-09-29', ['carmel', 0], ['stevenson', 9])] })).games[0];
    const previous = previousWith([filled, pendingFilled]);
    const notRead = applyBackfill(input({ games: [pending], unmatched: [GRE_AT_CAT], previous, consulted: () => false }));
    expect(notRead.games.map((g) => [g.contestId, g.status, g.provenance.backfill?.rule])).toEqual([
      [pending.contestId, 'final', 'score-pending'],
      ['sblive:6541425', 'final', 'absent-fixture'],
    ]);
    expect(notRead.carried.sort()).toEqual([pending.contestId, 'sblive:6541425'].sort());
    expect(notRead.unmatched).toEqual([]);
    // Only the Greenfield/Santa Catalina item was read (and si.com no longer has it): only the other is carried.
    const partly = applyBackfill(
      input({ games: [pending], unmatched: [GRE_AT_CAT], previous, consulted: (pairKey) => pairKey.includes('greenfield') }),
    );
    expect(partly.carried).toEqual([pending.contestId]);
    expect(partly.unmatched).toEqual([GRE_AT_CAT]);
    // Read and filled afresh: never carried on top.
    const fresh = applyBackfill(
      input({ games: [pending], previous, sblive: [sb('2026-09-29', ['carmel', 0], ['stevenson', 9])], consulted: () => true }),
    );
    expect(fresh.carried).toEqual([]);
    expect(fresh.games).toHaveLength(1);
  });

  it('applies nothing new from si.com when it failed, and nothing at all without a previous snapshot', () => {
    const res = applyBackfill(input({ unmatched: [GRE_AT_CAT], sblive: [sb('2026-09-04', ['greenfield', 0], ['santa-catalina', 1])], sbliveFailed: true }));
    expect(res.games).toEqual([]);
    expect(res.unmatched).toEqual([GRE_AT_CAT]);
  });
});

describe('backfill: the corpus si.com pages as parser/resolver facts', () => {
  const CORPUS = path.join(corpusDir('all-2026-10-02'), 'sblive');
  const PCAL = path.join(REPO, 'tests', 'fixtures', 'sblive', 'pcal-1002');
  const read = (file: string) => readFileSync(file, 'utf8');
  const teamPages = ['carmel', 'greenfield', 'hollister', 'salinas', 'santa-catalina', 'stevenson'].flatMap((slug) =>
    parseTeamGamesPage(read(path.join(CORPUS, 'team-games', `${slug}.html`))),
  );
  const scoreboards = ['2026-09-23', '2026-09-30'].flatMap((d) => parseScoresPage(read(path.join(CORPUS, 'scores', `${d}.html`))));
  const york = parseTeamGamesPage(read(path.join(PCAL, 'team-456851-york-falcons.html')));
  const cleaned = cleanSbliveRows([...scoreboards, ...teamPages, ...york]);
  const byId = (id: string) => cleaned.rows.find((g) => g.sbliveGameId === id);

  it('the three PCAL fill candidates are id-resolved si.com Finals with the verified scores', () => {
    const expected: Array<[string, string, Record<string, number>]> = [
      ['6541425', '2026-09-04', { greenfield: 0, 'santa-catalina': 1 }],
      ['6543072', '2026-09-30', { hollister: 3, greenfield: 1 }],
      ['6499423', '2026-09-29', { carmel: 0, stevenson: 9 }],
    ];
    for (const [id, date, scores] of expected) {
      const g = byId(id);
      expect(g, id).toBeDefined();
      expect(g?.dateKey).toBe(date);
      expect(g?.isFinal).toBe(true);
      expect(g?.sides.every(isIdResolved)).toBe(true);
      expect(Object.fromEntries(g!.sides.map((s) => [s.slug, s.score]))).toEqual(scores);
    }
  });

  it('the York JV row, the /new-york/ duplicate and the double 9/11 Stevenson-Salinas rows never reach a fill', () => {
    expect(cleaned.ignored.map((g) => g.sbliveGameId)).toContain('6641900');
    expect(cleaned.junkPath.map((g) => g.sbliveGameId)).toContain('6642005');
    expect(byId('6641900')).toBeUndefined();
    expect(byId('6642005')).toBeUndefined();
    // 6641765 names a Stevenson whose si.com id is not ours, so it is not the same pair as 6499419.
    const sept11 = cleaned.rows.filter((g) => g.dateKey === '2026-09-11');
    expect(sept11.map((g) => g.sbliveGameId).sort()).toEqual(['6499419', '6641765']);
    expect(sept11.find((g) => g.sbliveGameId === '6641765')?.sides.some((s) => s.name === 'Stevenson' && s.slug === null)).toBe(true);
    expect(sept11.every((g) => !g.isScored)).toBe(true);
  });

  it('scoreboard rows of our teams resolve through logo ids', () => {
    const row = scoreboards.find((g) => g.sbliveGameId === '6543072');
    expect(row?.sides.map((s) => [s.slug, s.via])).toEqual([
      ['greenfield', 'school-id'],
      ['hollister', 'school-id'],
    ]);
  });
});

describe('stepSblive (SPEC §7.9): scoreboards, targeted team pages, D2, reconcile', () => {
  const CORPUS = path.join(corpusDir('all-2026-10-02'), 'sblive');
  const files: Record<string, string> = {
    'sblive/scores/2026-09-30': path.join(CORPUS, 'scores/2026-09-30.html'),
    'sblive/team-games/greenfield': path.join(CORPUS, 'team-games/greenfield.html'),
    'sblive/team-games/carmel': path.join(CORPUS, 'team-games/carmel.html'),
  };

  function ctxWith(get: (key: ResourceKey) => Promise<{ url: string; httpStatus: number; body: string }>, over: Partial<RunContext> = {}) {
    const sources: SourceStatus[] = [];
    const lines: string[] = [];
    const ctx = {
      args: { sblive: true, sbliveFull: false },
      fetchedAt: AT,
      today: TODAY,
      previous: null,
      transport: { mode: 'fixture' as const, get },
      source: (r: SourceStatus) => sources.push(r),
      log: (l: string) => lines.push(l),
      warn: (l: string) => lines.push(`warn ${l}`),
      degrade: () => {},
      drop: () => {},
      leaguesInRun: () => ['pcal'],
      ...over,
    } as unknown as RunContext;
    return { ctx, sources, lines };
  }

  const corpusGet = async (key: ResourceKey) => {
    const file = files[resourcePath(key)];
    if (!file) throw new FixtureMissing(key);
    return { url: `https://www.si.com/${resourcePath(key)}`, httpStatus: 200, body: readFileSync(file, 'utf8') };
  };

  const pending = game({ home: 'stevenson', away: 'carmel', date: '2026-09-29', status: 'score-pending' });
  const played = game({ home: 'greenfield', away: 'carmel', date: '2026-09-30', status: 'scheduled' });

  it('reads the trailing-14-day scoreboards with a game, then only the team pages D2 needs, and publishes the fills', async () => {
    expect(scoreboardDates([pending, played], ['2026-09-04', '2026-10-06'], TODAY)).toEqual(['2026-09-29', '2026-09-30']);
    const { ctx, sources } = ctxWith(corpusGet);
    const res = await stepSblive(ctx, { games: [pending, played], unmatched: [GRE_AT_CAT, HOL_AT_GRE] });
    // HOL@GRE (9/30) is on the 9/30 scoreboard; GRE@CAT (9/4) and CAR@STE (9/29) need team pages.
    expect(sources.map((r) => [r.kind, r.label, r.status])).toEqual([
      ['sblive-scoreboard', 'sblive scoreboard 2026-09-29', 'skipped'],
      ['sblive-scoreboard', 'sblive scoreboard 2026-09-30', 'ok'],
      ['sblive-team-games', 'sblive carmel games', 'ok'],
      ['sblive-team-games', 'sblive greenfield games', 'ok'],
    ]);
    expect(res.unmatched).toEqual([]);
    expect(res.sbliveCrossCheck?.backfilled.map((r) => [r.contestId, r.rule, r.sblive])).toEqual([
      ['sblive:6541425', 'absent-fixture', { home: 1, away: 0 }],
      [pending.contestId, 'score-pending', { home: 9, away: 0 }],
      ['sblive:6543072', 'absent-fixture', { home: 1, away: 3 }],
    ]);
    nonFinalsNeverScored(res.games);
  });

  it('skips everything with --no-sblive', async () => {
    const { ctx, sources } = ctxWith(corpusGet, { args: { sblive: false } as RunContext['args'] });
    const res = await stepSblive(ctx, { games: [pending], unmatched: [GRE_AT_CAT] });
    expect(res).toEqual({ games: [pending], unmatched: [GRE_AT_CAT], sbliveCrossCheck: undefined });
    expect(sources).toEqual([]);
  });

  it('when every si.com request fails: rows stale, earlier fills re-applied, the previous report carried', async () => {
    const filledPending = applyBackfill(input({ games: [pending], sblive: [sb('2026-09-29', ['carmel', 0], ['stevenson', 9])] })).games[0];
    const previous = {
      fetchedAt: '2026-10-01T15:00:00.000Z',
      games: [filledPending],
      supersededGames: {},
      sources: [
        { id: 'sblive', kind: 'sblive-scoreboard', label: 'sblive scoreboard 2026-09-29', url: 'https://www.si.com/high-school/stats/california/field-hockey/scores?date=2026-09-29', status: 'ok', fetchedAt: '2026-10-01T15:00:00.000Z' },
      ],
      sbliveCrossCheck: { sbliveFetchedAt: '2026-10-01T15:00:00.000Z', compared: 4, agreements: 4, conflicts: [], sbliveOnlyScored: [], backfilled: [] },
    } as unknown as Snapshot;
    const fail = async (key: ResourceKey): Promise<never> => {
      throw new TransportError('HTTP 503', `https://www.si.com/${resourcePath(key)}`, 503);
    };
    const { ctx, sources } = ctxWith(fail, { previous });
    const res = await stepSblive(ctx, { games: [pending], unmatched: [] });
    expect(sources.length).toBeGreaterThan(0);
    expect(sources.every((r) => r.status === 'stale' && r.httpStatus === 503)).toBe(true);
    expect(sources[0].carriedFrom).toBe('2026-10-01T15:00:00.000Z');
    expect(res.games[0]).toMatchObject({ status: 'final', home: { score: 9 }, provenance: { scores: 'sblive' } });
    expect(res.sbliveCrossCheck?.compared).toBe(4);
    expect(res.sbliveCrossCheck?.backfilled.map((r) => r.contestId)).toEqual([pending.contestId]);
  });
});
