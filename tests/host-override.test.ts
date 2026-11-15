/**
 * DATA_QUALITY.contestHostOverrides (lib/results/host-override.ts): a contest played at the school MaxPreps lists as
 * the visitor has its sides swapped, in the pipeline and in the snapshot loader, with MaxPreps' host kept.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { getSnapshot } from '../lib/data';
import { DATA_QUALITY } from '../lib/league-config/data-quality';
import { applyHostOverride, swapSides } from '../lib/results/host-override';
import { gameAddress } from '../lib/schools/venue';
import type { Game } from '../lib/types';
import { game } from './game-builder';

const FINAL = '8f8d3fe5-f112-4d22-a5a6-44e027ada681';

describe('swapSides', () => {
  it('mirrors every side-keyed fact and is its own inverse', () => {
    const g: Game = {
      ...game({ home: 'tamalpais', away: 'redwood', hs: 1, as: 2, date: '2026-10-30', status: 'final' }),
      contestTypes: { home: 0, away: 4 },
      forfeitBy: null,
      shootout: { home: 3, away: 2 },
      result: { winner: 'away', ending: 'regulation', certainty: 'reported' },
    };
    const withEvidence: Game = {
      ...g,
      provenance: {
        ...g.provenance,
        cifssScore: { home: 1, away: 3, url: 'https://example.org/' },
        adjudicated: { maxpreps: { home: 0, away: 2, homeResult: 'L', awayResult: 'W' }, by: ['si.com'] },
        resultCorrection: { maxpreps: { home: 1, away: 0, otPeriods: 1 }, source: 'a report', url: null },
      },
    };
    const s = swapSides(withEvidence);
    expect([s.home.slug, s.away.slug]).toEqual(['redwood', 'tamalpais']);
    expect([s.home.score, s.away.score]).toEqual([2, 1]);
    expect(s.site).toBe('home');
    expect(s.contestTypes).toEqual({ home: 4, away: 0 });
    expect(s.shootout).toEqual({ home: 2, away: 3 });
    expect(s.result?.winner).toBe('home');
    expect(s.provenance.cifssScore).toEqual({ home: 3, away: 1, url: 'https://example.org/' });
    expect(s.provenance.adjudicated?.maxpreps).toEqual({ home: 2, away: 0, homeResult: 'W', awayResult: 'L' });
    expect(s.provenance.resultCorrection?.maxpreps).toEqual({ home: 0, away: 1, otPeriods: 1 });
    expect(swapSides(s)).toEqual(withEvidence);
  });
});

describe('applyHostOverride', () => {
  const listed = { ...game({ home: 'tamalpais', away: 'redwood', hs: 1, as: 2, date: '2026-10-30', status: 'final' }), contestId: FINAL };
  const overrides = { [FINAL]: { home: 'redwood', source: 'Moved to Redwood', url: null } };

  it('puts the game at the named school and records MaxPreps’ host and the citation', () => {
    const g = applyHostOverride(listed, overrides);
    expect([g.home.slug, g.away.slug, g.home.score, g.away.score]).toEqual(['redwood', 'tamalpais', 2, 1]);
    expect(g.provenance.hostCorrection).toEqual({ maxprepsHome: 'tamalpais', source: 'Moved to Redwood', url: null });
  });

  it('changes nothing a second time, without an override, or when the named school is neither side', () => {
    const once = applyHostOverride(listed, overrides);
    expect(applyHostOverride(once, overrides)).toBe(once);
    expect(applyHostOverride(listed, {})).toBe(listed);
    expect(applyHostOverride(listed, { [FINAL]: { home: 'marin-catholic', source: 'x', url: null } })).toBe(listed);
  });
});

describe('the configured overrides, against the committed snapshot', () => {
  const raw = JSON.parse(readFileSync(path.join(__dirname, '..', 'data', 'snapshot.json'), 'utf8')) as { games: Game[] };

  it('each names a stored contest and one of its two schools', () => {
    for (const [id, o] of Object.entries(DATA_QUALITY.contestHostOverrides)) {
      const g = raw.games.find((x) => x.contestId === id);
      expect(g, id).toBeDefined();
      expect([g!.home.slug, g!.away.slug], id).toContain(o.home);
    }
  });

  it('the 2026 MCAL final loads at Redwood: Tamalpais 1 at Redwood 2, with its address and MaxPreps’ host kept', () => {
    const g = getSnapshot().games.find((x) => x.contestId === FINAL)!;
    expect([g.away.slug, g.away.score, g.home.slug, g.home.score, g.site]).toEqual(['tamalpais', 1, 'redwood', 2, 'home']);
    expect(g.result?.winner).toBe('home');
    expect(g.provenance.hostCorrection?.maxprepsHome).toBe('tamalpais');
    expect(gameAddress(g)?.address.city).toBe('Larkspur');
  });
});
