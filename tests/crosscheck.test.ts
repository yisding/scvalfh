/**
 * lib/crosscheck.ts — MaxPreps ↔ SBLive score reconciliation (SPEC §5.7).
 *
 * The rules under test, in the order they matter:
 *   1. MaxPreps is NEVER overwritten.
 *   2. A disagreement is published, never averaged and never silently resolved.
 *   3. A score that exists only on SBLive is NOT backfilled — the game stays unreported.
 *   4. The join is (local date, unordered team pair), because the SBLive scoreboard exposes no
 *      home/away and no team ids.
 */

import { describe, expect, it } from 'vitest';

import { gameJoinKey, gamePairKey, reconcile, emptyCrossCheck } from '../lib/crosscheck';
import type { SbliveGame, SbliveSide } from '../lib/sources/sblive';
import { resolveTeam } from '../lib/teams';
import { game } from './helpers';

function side(ref: string, score: number | null): SbliveSide {
  const team = resolveTeam(ref);
  return {
    name: team ? team.name : ref,
    sbliveTeamId: team?.external.sbliveTeamId ?? null,
    slug: team?.slug ?? null,
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

  it('falls back to a normalized name for a non-SCVAL opponent', () => {
    const g = game({ home: 'los-altos', away: 'cupertino', hs: 1, as: 0 });
    const outside = {
      ...g,
      away: { ...g.away, teamId: null, slug: null, name: 'Leigh (San Jose)' },
    };
    expect(gamePairKey(outside)).toBe('los-altos~name:leighsanjose');
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
    expect(row.note).toMatch(/never overwritten/);
    // AWAY first, the same orientation the row's own cells use ("<away> at <home>"), so one
    // result is never printed as both "0-7" and "7–0" inside a single row.
    expect(row.note).toContain("we show MaxPreps' 7-0 (Saint Francis–Homestead)");
    expect(row.note).toContain('SBLive reports 7-1');
    // 1. MaxPreps is never overwritten.
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

describe('crosscheck: SBLive-only scores are never backfilled', () => {
  it('leaves the game unreported and publishes the SBLive value as a disagreement', () => {
    const g = game({
      home: 'los-gatos',
      away: 'saratoga',
      status: 'score-pending',
      date: '2026-09-28',
    });
    const res = reconcile([g], [sbGame('2026-09-28', side('los-gatos', 3), side('saratoga', 1))], {
      sbliveFetchedAt: AT,
    });
    expect(res.report.sbliveOnlyScored).toHaveLength(1);
    expect(res.report.conflicts).toHaveLength(0);
    expect(res.report.agreements).toBe(0);
    const row = res.report.sbliveOnlyScored[0];
    expect(row.sblive).toEqual({ home: 3, away: 1 });
    expect(row.status).toBe('score-pending');
    expect(row.note).toMatch(/stays unreported/);
    // 3. The scoreline stays null — a missing score is never filled from a secondary source.
    expect(res.games[0].home.score).toBeNull();
    expect(res.games[0].away.score).toBeNull();
    expect(res.games[0].status).toBe('score-pending');
    expect(res.games[0].provenance.scoreConflict?.sblive).toEqual({ home: 3, away: 1 });
  });

  it('ignores an SBLive row that is itself unscored', () => {
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
    });
  });
});
