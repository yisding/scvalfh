/**
 * Girls soccer's JV corrections (lib/jv/jv-corrections.ts SOCCER_JV_CORRECTIONS, SCVAL_SPORT=soccer), from Piedmont
 * Hills' own 2026-27 schedule: its Nov 17 row against "Non JV Opponent" is the Milpitas scrimmage and is left out, and
 * its Jan 30 JV game with Leland starts at 5:00, not MaxPreps' 5:30.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

let jv: typeof import('../lib/jv/jv');

beforeAll(async () => {
  vi.stubEnv('SCVAL_SPORT', 'soccer');
  vi.resetModules();
  jv = await import('../lib/jv/jv');
});

afterAll(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('Piedmont Hills’ JV games, by its own schedule', () => {
  it('every soccer correction matched a row', () => {
    expect(jv.getJvCorrections().unused).toEqual([]);
  });

  it('leaves out the Nov 17 scrimmage with Milpitas', () => {
    const ids = jv.getJvGames().map((g) => g.contestId);
    expect(ids).not.toContain('25928dc0-6d17-4dc5-a075-ad3f7a0d9ad0');
    expect(jv.getJvCorrections().excluded.map((e) => e.game.contestId)).toContain('25928dc0-6d17-4dc5-a075-ad3f7a0d9ad0');
    expect(jv.getJvGamesForTeam('piedmont-hills').filter((g) => g.dateKey === '2026-11-17')).toEqual([]);
  });

  it('starts the Jan 30 JV game with Leland at 5:00, confirmed', () => {
    const g = jv.getJvGames().find((x) => x.contestId === 'd31f9684-2c9f-497b-b549-dd48663448e9')!;
    expect(g.dateLocal).toBe('2027-01-30T17:00:00');
    expect(g.dateUtc).toBe('2027-01-31T01:00:00Z');
    expect(g.timeConfirmed).toBe(true);
  });
});
