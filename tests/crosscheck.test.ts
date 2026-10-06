/**
 * lib/crosscheck.ts — MaxPreps ↔ si.com score reconciliation (SPEC §7.9, owner decision D2).
 *
 * The rules under test, in the order they matter:
 *   1. reconcile never writes a si.com score onto a game: publishing one is lib/backfill.ts's job
 *      (D2 rules 2-4, tests/backfill.test.ts), and a game it already published is not compared again.
 *   2. A plain disagreement (D2 rule 5) is published, never averaged and never silently resolved: MaxPreps stays.
 *   3. A si.com score D2 did not publish is listed with a note naming why; the game stays unreported.
 *   4. The join is (local date, unordered team pair), because the si.com scoreboard exposes no
 *      home/away and no web paths.
 */

import { describe, expect, it } from 'vitest';

import { applyBackfill } from '../lib/backfill';
import { NOT_PUBLISHED, carryCrossCheck, emptyCrossCheck, gameJoinKey, gamePairKey, reconcile, withBackfill } from '../lib/crosscheck';
import type { SbliveGame, SbliveSide } from '../lib/sources/sblive';
import { resolveTeam } from '../lib/teams';
import type { BackfillRow, Game, SbliveCrossCheck, SbliveOnlyRow } from '../lib/types';
import { game } from './helpers';

function side(ref: string, score: number | null, via: SbliveSide['via'] = 'team-id'): SbliveSide {
  const team = resolveTeam(ref);
  return {
    name: team ? team.name : ref,
    sbliveTeamId: team?.external.sbliveTeamId ?? null,
    slug: team?.slug ?? null,
    via: team ? via : null,
    score,
  };
}

function sbGame(
  dateKey: string,
  a: SbliveSide,
  b: SbliveSide,
  over: Partial<SbliveGame> = {},
): SbliveGame {
  const sides: [SbliveSide, SbliveSide] =
    (a.slug ?? a.name) <= (b.slug ?? b.name) ? [a, b] : [b, a];
  return {
    sbliveGameId: `sb-${dateKey}-${sides[0].name}`,
    dateIso: `${dateKey}T16:00:00.000-07:00`,
    dateKey,
    sides,
    isFinal: sides.every((s) => s.score !== null),
    isScored: sides.every((s) => s.score !== null),
    url: 'https://www.si.com/high-school/stats/california/field-hockey/games/1-x',
    gameTypeLabel: null,
    origin: 'scoreboard',
    ...over,
  };
}

const AT = '2026-09-29T15:00:00.000Z';

describe('crosscheck: the join key', () => {
  it('is order-independent over the team pair', () => {
    const a = game({ home: 'los-altos', away: 'cupertino', hs: 4, as: 0, date: '2026-09-23' });
    const b = game({ home: 'cupertino', away: 'los-altos', hs: 0, as: 4, date: '2026-09-23' });
    expect(gamePairKey(a)).toBe(gamePairKey(b));
    expect(gameJoinKey(a)).toBe('2026-09-23|cupertino~los-altos');
  });

  it('falls back to a normalized name for an opponent that is not one of our teams', () => {
    const g = game({ home: 'los-altos', away: 'cupertino', hs: 1, as: 0 });
    const outside = {
      ...g,
      // Not one of the 99 (Bishop's, the example here before, is a City Western team now).
      away: { ...g.away, teamId: null, slug: null, name: "St. Margaret's" },
    };
    expect(gamePairKey(outside)).toBe('los-altos~name:stmargarets');
  });
});

describe('crosscheck: agreement', () => {
  it('counts a match and touches nothing', () => {
    const g = game({ home: 'los-altos', away: 'cupertino', hs: 4, as: 0, date: '2026-09-23' });
    const res = reconcile([g], [sbGame('2026-09-23', side('los-altos', 4), side('cupertino', 0))], {
      sbliveFetchedAt: AT,
    });
    expect(res.report.compared).toBe(1);
    expect(res.report.agreements).toBe(1);
    expect(res.report.conflicts).toHaveLength(0);
    expect(res.games[0].provenance.scoreConflict).toBeUndefined();
    // Same object graph, unchanged values.
    expect(res.games[0].home.score).toBe(4);
  });

  it('agrees with si.com’s 1-1 on an EAL 1 v 1 win (MaxPreps 1-1, decider SO): scores only, no outcome', () => {
    const g = game({ home: 'chico', away: 'davis', hs: 1, as: 1, date: '2026-09-28', results: { home: 'W', away: 'L' } });
    expect(g.decider).toBe('SO');
    const res = reconcile([g], [sbGame('2026-09-28', side('chico', 1), side('davis', 1))], { sbliveFetchedAt: AT });
    expect(res.report.compared).toBe(1);
    expect(res.report.agreements).toBe(1);
    expect(res.report.conflicts).toEqual([]);
    expect(res.report.sbliveOnlyScored).toEqual([]);
    expect(res.games[0]).toBe(g);
  });

  it('ignores an SBLive row on a different date (no match, no conflict)', () => {
    const g = game({ home: 'los-altos', away: 'cupertino', hs: 4, as: 0, date: '2026-09-23' });
    const res = reconcile([g], [sbGame('2026-09-24', side('los-altos', 9), side('cupertino', 9))], {
      sbliveFetchedAt: AT,
    });
    expect(res.report.compared).toBe(0);
    expect(res.report.conflicts).toHaveLength(0);
    expect(res.unmatched).toBe(1);
  });
});

describe('crosscheck: disagreement', () => {
  it('keeps the MaxPreps numbers and records the SBLive ones', () => {
    const g = game({ home: 'homestead', away: 'saint-francis', hs: 0, as: 7, date: '2026-09-24' });
    const res = reconcile(
      [g],
      [sbGame('2026-09-24', side('homestead', 1), side('saint-francis', 7))],
      { sbliveFetchedAt: AT },
    );
    expect(res.report.conflicts).toHaveLength(1);
    expect(res.report.agreements).toBe(0);
    const row = res.report.conflicts[0];
    expect(row.maxpreps).toEqual({ home: 0, away: 7 });
    expect(row.sblive).toEqual({ home: 1, away: 7 });
    expect(row.aligned).toBe(true);
    expect(row.note).toMatch(/MaxPreps’ score stands/);
    // AWAY first, the same orientation the row's own cells use ("<away> at <home>"), so one
    // result is never printed as both "0-7" and "7–0" inside a single row.
    expect(row.note).toContain("we show MaxPreps' 7-0 (Saint Francis–Homestead)");
    expect(row.note).toContain('si.com reports 7-1');
    // 2. A plain disagreement never overwrites MaxPreps (D2 rule 5).
    expect(res.games[0].home.score).toBe(0);
    expect(res.games[0].away.score).toBe(7);
    // 2. The disagreement is on the game, for the UI's "sources disagree" marker.
    expect(res.games[0].provenance.scoreConflict?.sblive).toEqual({ home: 1, away: 7 });
  });

  it('does not report a mere home/away swap as a disagreement', () => {
    const g = game({ home: 'los-altos', away: 'cupertino', hs: 4, as: 0, date: '2026-09-23' });
    // The same numbers, attached to the sides the other way round by identity.
    const res = reconcile([g], [sbGame('2026-09-23', side('cupertino', 0), side('los-altos', 4))], {
      sbliveFetchedAt: AT,
    });
    expect(res.report.agreements).toBe(1);
    expect(res.report.conflicts).toHaveLength(0);
  });
});

describe('crosscheck: si.com scores D2 did not publish', () => {
  it('lists a si.com score on a contest MaxPreps left unscored, says why, and fills nothing', () => {
    // Resolved by name only: D2 never fills from such a row (lib/backfill.ts did not), so reconcile reports it.
    const g = game({ home: 'los-gatos', away: 'saratoga', status: 'score-pending', date: '2026-09-28' });
    const res = reconcile(
      [g],
      [sbGame('2026-09-28', side('los-gatos', 3, 'name'), side('saratoga', 1))],
      { sbliveFetchedAt: AT, today: '2026-10-02' },
    );
    expect(res.report.sbliveOnlyScored).toHaveLength(1);
    expect(res.report.conflicts).toHaveLength(0);
    expect(res.report.agreements).toBe(0);
    const row = res.report.sbliveOnlyScored[0];
    expect(row.sblive).toEqual({ home: 3, away: 1 });
    expect(row.status).toBe('score-pending');
    expect(row.note).toBe(NOT_PUBLISHED.nameOnly);
    // 3. The scoreline stays null — reconcile never fills a missing score, and never as 0-0.
    expect(res.games[0].home.score).toBeNull();
    expect(res.games[0].away.score).toBeNull();
    expect(res.games[0].status).toBe('score-pending');
    expect(res.games[0].provenance.scores).not.toBe('sblive');
    expect(res.games[0].provenance.scoreConflict?.sblive).toEqual({ home: 3, away: 1 });
    expect(res.games[0].provenance.scoreConflict?.note).toMatch(/stays unreported\. Resolved by name only\.$/);
  });

  it('names the reason: not our team, not final, dated today, not marked played', () => {
    const outside = game({ home: 'los-altos', away: 'cupertino', status: 'score-pending', date: '2026-09-28' });
    const notOurs = { ...outside, away: { ...outside.away, teamId: null, slug: null, name: 'Woodbridge' } };
    const cases: Array<[ReturnType<typeof game>, SbliveGame, string]> = [
      [notOurs, sbGame('2026-09-28', side('los-altos', 2), side('Woodbridge', 1)), NOT_PUBLISHED.notOurTeam],
      [
        game({ home: 'fremont', away: 'homestead', status: 'score-pending', date: '2026-09-28' }),
        sbGame('2026-09-28', side('fremont', 2), side('homestead', 1), { isFinal: false }),
        NOT_PUBLISHED.notFinal,
      ],
      [
        game({ home: 'palo-alto', away: 'lynbrook', status: 'score-pending', date: '2026-10-02' }),
        sbGame('2026-10-02', side('palo-alto', 2), side('lynbrook', 1)),
        NOT_PUBLISHED.notPast,
      ],
      [
        game({ home: 'saint-francis', away: 'valley-christian', status: 'scheduled', date: '2026-09-30' }),
        sbGame('2026-09-30', side('saint-francis', 7), side('valley-christian', 0)),
        NOT_PUBLISHED.notPending,
      ],
    ];
    for (const [g, sb, note] of cases) {
      const res = reconcile([g], [sb], { sbliveFetchedAt: AT, today: '2026-10-02' });
      expect(res.report.sbliveOnlyScored.map((r) => r.note), note).toEqual([note]);
      expect(res.games[0].home.score).toBeNull();
    }
  });

  it('lists a si.com Final MaxPreps has no contest for, without claiming a host', () => {
    const res = reconcile(
      [game({ home: 'los-altos', away: 'cupertino', hs: 4, as: 0, date: '2026-09-23' })],
      [
        sbGame('2026-09-25', side('fremont', 2), side('homestead', 1), { sbliveGameId: '6600001' }),
        sbGame('2026-09-26', side('palo-alto', 3), side('Woodbridge', 0), { sbliveGameId: '6600002' }),
        // Same pair as a MaxPreps contest two days away: a date difference, not a si.com-only score.
        sbGame('2026-09-25', side('los-altos', 4), side('cupertino', 0), { sbliveGameId: '6600003' }),
        // Not one of our teams on either side: never listed.
        sbGame('2026-09-25', side('Woodbridge', 1), side('Irvine', 0), { sbliveGameId: '6600004' }),
      ],
      { sbliveFetchedAt: AT, today: '2026-10-02' },
    );
    expect(res.report.sbliveOnlyScored.map((r) => [r.contestId, r.note, r.aligned, r.maxprepsUrl])).toEqual([
      ['sblive:6600001', NOT_PUBLISHED.notOfficial, false, null],
      ['sblive:6600002', NOT_PUBLISHED.notOurTeam, false, null],
    ]);
    expect(res.report.sbliveOnlyScored[0].label).toBe('Fremont vs Homestead');
    expect(res.unmatched).toBe(4);
  });

  it('ignores a si.com row that is itself unscored', () => {
    const g = game({ home: 'los-gatos', away: 'saratoga', status: 'scheduled', date: '2026-10-27' });
    const res = reconcile(
      [g],
      [sbGame('2026-10-27', side('los-gatos', null), side('saratoga', null))],
      { sbliveFetchedAt: AT },
    );
    expect(res.report.compared).toBe(1);
    expect(res.report.sbliveOnlyScored).toHaveLength(0);
    expect(res.games[0].provenance.scoreConflict).toBeUndefined();
  });

  it('does not compare a game D2 already published from si.com', () => {
    const g = game({ home: 'stevenson', away: 'carmel', hs: 9, as: 0, date: '2026-09-29' });
    const filled = {
      ...g,
      provenance: {
        ...g.provenance,
        scores: 'sblive' as const,
        backfill: { rule: 'score-pending' as const, sbliveGameId: '6499423', maxpreps: null, note: 'x' },
      },
    };
    const res = reconcile([filled], [sbGame('2026-09-29', side('stevenson', 9), side('carmel', 0))], { sbliveFetchedAt: AT });
    expect(res.report.compared).toBe(0);
    expect(res.report.agreements).toBe(0);
    expect(res.report.sbliveOnlyScored).toEqual([]);
    expect(res.unmatched).toBe(0);
    expect(res.games[0]).toBe(filled);
  });
});

describe('crosscheck: withBackfill', () => {
  const published: BackfillRow = {
    contestId: 'c-1',
    dateKey: '2026-09-29',
    label: 'Carmel at Stevenson',
    rule: 'score-pending',
    sblive: { home: 9, away: 0 },
    maxpreps: null,
    sbliveUrl: 'https://www.si.com/high-school/stats/california/field-hockey/games/6499423-carmel-vs-stevenson',
    maxprepsUrl: null,
    note: 'MaxPreps lists this game without a score, so the score is si.com’s.',
  };
  const only = (contestId: string, note: string, dateKey = '2026-09-20'): SbliveOnlyRow => ({
    contestId,
    dateKey,
    label: 'A at B',
    sblive: { home: 1, away: 0 },
    aligned: true,
    sbliveUrl: null,
    maxprepsUrl: null,
    status: 'score-pending',
    note,
  });

  it('adds the published rows, lets D2’s precise reasons win, and never lists a published game as unpublished', () => {
    const report = {
      ...emptyCrossCheck(AT),
      sbliveOnlyScored: [only('c-1', NOT_PUBLISHED.other), only('c-2', NOT_PUBLISHED.other)],
    };
    const merged = withBackfill(report, {
      rows: [published],
      skipped: [only('c-2', 'si.com has two different scores for this game.'), only('sblive:7', 'Resolved by name only.', '2026-09-01')],
    });
    expect(merged.backfilled).toEqual([published]);
    // The same si.com game, already explained by D2 under a MaxPreps contest id, is not listed again.
    const dup = withBackfill(
      { ...emptyCrossCheck(AT), sbliveOnlyScored: [{ ...only('sblive:9', NOT_PUBLISHED.notOfficial), sbliveUrl: 'https://www.si.com/g/9' }] },
      { rows: [], skipped: [{ ...only('c-9', 'MaxPreps has this game (c-9) but it is not counted: MaxPreps marks it contestType 4.'), sbliveUrl: 'https://www.si.com/g/9' }] },
    );
    expect(dup.sbliveOnlyScored.map((r) => r.contestId)).toEqual(['c-9']);
    expect(merged.sbliveOnlyScored.map((r) => [r.contestId, r.note])).toEqual([
      ['sblive:7', 'Resolved by name only.'],
      ['c-2', 'si.com has two different scores for this game.'],
    ]);
  });
});

describe('crosscheck: a game D2 explained gives the same reason on the game and in the list', () => {
  it('a level si.com score on a score-pending EAL game (D24): the game note ends with the list row’s note', () => {
    const g = game({ home: 'corning', away: 'pleasant-valley', date: '2026-09-29', status: 'score-pending' });
    const rows = [sbGame('2026-09-29', side('corning', 1), side('pleasant-valley', 1), { sbliveGameId: '6600010' })];
    const bf = applyBackfill({ games: [g], unmatched: [], sblive: rows, today: '2026-10-04', previous: null, sbliveFailed: false, fetchedAt: AT });
    expect(bf.games[0]).toBe(g);
    expect(bf.skipped).toHaveLength(1);
    const d24 = bf.skipped[0].note;
    expect(d24).toMatch(/decided on 1 v 1s/);

    const rec = reconcile(bf.games, rows, { sbliveFetchedAt: AT, today: '2026-10-04', skipped: bf.skipped });
    const merged = withBackfill(rec.report, bf);
    expect(merged.sbliveOnlyScored.map((r) => [r.contestId, r.note])).toEqual([[g.contestId, d24]]);
    const note = rec.games[0].provenance.scoreConflict?.note;
    expect(note?.endsWith(`stays unreported. ${d24}`)).toBe(true);
    expect(note).not.toContain(NOT_PUBLISHED.other);
    expect(rec.games[0].home.score).toBeNull();

    // Without D2's rows reconcile falls back to its own reasons, as before.
    const bare = reconcile(bf.games, rows, { sbliveFetchedAt: AT, today: '2026-10-04' });
    expect(bare.report.sbliveOnlyScored.map((r) => r.note)).toEqual([NOT_PUBLISHED.other]);
  });
});

describe('crosscheck: report shape', () => {
  it('sorts both lists by date and carries the stamp', () => {
    const games = [
      game({ home: 'homestead', away: 'saint-francis', hs: 0, as: 7, date: '2026-09-24' }),
      game({ home: 'fremont', away: 'cupertino', hs: 2, as: 1, date: '2026-09-16' }),
    ];
    const res = reconcile(
      games,
      [
        sbGame('2026-09-24', side('homestead', 1), side('saint-francis', 7)),
        sbGame('2026-09-16', side('fremont', 3), side('cupertino', 1)),
      ],
      { sbliveFetchedAt: AT },
    );
    expect(res.report.conflicts.map((c) => c.dateKey)).toEqual(['2026-09-16', '2026-09-24']);
    expect(res.report.sbliveFetchedAt).toBe(AT);
  });

  it('has an empty form for a skipped or failed run', () => {
    expect(emptyCrossCheck(AT)).toEqual({
      sbliveFetchedAt: AT,
      compared: 0,
      agreements: 0,
      conflicts: [],
      sbliveOnlyScored: [],
      backfilled: [],
    });
  });
});

describe('carryCrossCheck: a carried report keeps only rows still true of this run’s games', () => {
  it('drops conflict rows whose game changed or vanished, and si.com-only rows no longer accurate', () => {
    const kept = game({ home: 'stevenson', away: 'greenfield', hs: 8, as: 0, date: '2026-09-21' });
    const corrected = game({ home: 'carmel', away: 'salinas', hs: 2, as: 0, date: '2026-09-22' });
    const pending = game({ home: 'hollister', away: 'monterey', date: '2026-09-23', status: 'score-pending' });
    const nowFinal = game({ home: 'hollister', away: 'salinas', hs: 1, as: 0, date: '2026-09-24' });
    const conflict = (g: Game, maxpreps: { home: number; away: number }) => ({
      contestId: g.contestId, dateKey: g.dateKey, label: 'x', maxpreps, sblive: { home: 7, away: 0 },
      aligned: true, maxprepsUrl: null, sbliveUrl: null, note: 'n',
    });
    const only = (contestId: string, status: Game['status']): SbliveOnlyRow => ({
      contestId, dateKey: '2026-09-23', label: 'x', sblive: { home: 1, away: 0 }, aligned: true,
      sbliveUrl: `https://www.si.com/high-school/stats/california/field-hockey/games/${contestId.replace(/\D/g, '').slice(0, 7) || '1'}-x`,
      maxprepsUrl: null, status, note: 'n',
    });
    const prior: SbliveCrossCheck = {
      sbliveFetchedAt: '2026-10-01T15:00:00.000Z', compared: 5, agreements: 2,
      conflicts: [
        conflict(kept, { home: 8, away: 0 }),
        conflict(corrected, { home: 3, away: 0 }), // MaxPreps now says 2-0
        { ...conflict(kept, { home: 1, away: 1 }), contestId: '00000000-0000-4000-8000-00000000dead' }, // deleted
      ],
      sbliveOnlyScored: [
        only(pending.contestId, 'score-pending'),
        only(nowFinal.contestId, 'score-pending'), // MaxPreps has posted it since
        only('sblive:7777777', 'scheduled'),
      ],
      backfilled: [],
    };
    const out = carryCrossCheck(prior, [kept, corrected, pending, nowFinal], []);
    expect(out.conflicts.map((r) => r.contestId)).toEqual([kept.contestId]);
    expect(out.sbliveOnlyScored.map((r) => r.contestId).sort()).toEqual([pending.contestId, 'sblive:7777777'].sort());
    expect(out.compared).toBeGreaterThanOrEqual(out.agreements + out.conflicts.length);
    expect(out.sbliveFetchedAt).toBe(prior.sbliveFetchedAt);
  });
});
