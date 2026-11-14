/**
 * Overtime and level finals in the basketball build (`SCVAL_SPORT=basketball`): overtime periods are played until one team
 * leads, so every period is counted and no game ends level (lib/sports/basketball.ts `scoring`).
 * The modules read the sport at import, so they are imported after the switch (as tests/basketball.test.ts does).
 */

import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { ScheduleRow } from '../lib/sources/maxpreps';
import type { Game } from '../lib/types';

interface Modules {
  current: typeof import('../lib/sports/current');
  format: typeof import('../lib/format');
  describe: typeof import('../components/ui/describe-game');
  level: typeof import('../lib/postseason/level-final');
  normalize: typeof import('../lib/pipeline/normalize');
  teams: typeof import('../lib/teams');
  builder: typeof import('./game-builder');
  helpers: typeof import('./helpers');
}

let m: Modules;

beforeAll(async () => {
  vi.stubEnv('SCVAL_SPORT', 'basketball');
  vi.resetModules();
  m = {
    current: await import('../lib/sports/current'),
    format: await import('../lib/format'),
    describe: await import('../components/ui/describe-game'),
    level: await import('../lib/postseason/level-final'),
    normalize: await import('../lib/pipeline/normalize'),
    teams: await import('../lib/teams'),
    builder: await import('./game-builder'),
    helpers: await import('./helpers'),
  };
});

/** Homestead v Cupertino, final, as the builder classifies it; `over` on top. */
function final(hs: number, as: number, over: Partial<Game> = {}, ot = 0): Game {
  return { ...m.builder.game({ home: 'homestead', away: 'cupertino', hs, as, ot, league: false, postseason: null }), ...over };
}

/** A MaxPreps final row between the same two schools (a field hockey capture, re-pointed: the row shape is the sport's too). */
function finalRow(home: number, away: number, location: string | null): ScheduleRow {
  const template = m.helpers.allScheduleRows().find(
    (r) =>
      r.calculatedFields.contestState === 4 &&
      r.contest.teams.length === 2 &&
      r.contest.teams.some((t) => t.homeAwayType === 0) &&
      r.contest.teams.some((t) => t.homeAwayType === 1) &&
      r.contest.teams.every((t) => !t.isForfeit),
  )!;
  return {
    ...template,
    contest: {
      ...template.contest,
      contestId: 'fd403fcf-68d7-4105-b68e-cc19df94e580',
      location,
      teams: template.contest.teams.map((t) => {
        const team = m.teams.getTeamBySlug(t.homeAwayType === 0 ? 'homestead' : 'cupertino')!;
        const score = t.homeAwayType === 0 ? home : away;
        const result = home === away ? 'T' : (t.homeAwayType === 0) === home > away ? 'W' : 'L';
        return { ...t, teamId: team.id, name: team.name, score, result, contestType: 1 };
      }),
    },
    calculatedFields: { ...template.calculatedFields, overtimePeriodsPlayed: 0 },
  };
}

describe('basketball: the sport’s words', () => {
  it('mirrors the sport definition in lib/format', () => {
    const { scoring } = m.current.SPORT;
    expect(scoring).toMatchObject({ allowsTies: false, overtime: 'until-decided', tiebreak: null });
    expect(m.format.SPORT_OVERTIME_IS_SUDDEN_VICTORY).toBe(false);
    expect(m.format.SPORT_COUNTS_OVERTIMES).toBe(true);
  });
});

describe('basketball: overtime runs until one team leads', () => {
  it('names every period it took, on any margin', () => {
    const cases: Array<[number, string, string]> = [
      [1, 'OT', ' in overtime'],
      [2, '2 OT', ' in double overtime'],
      [3, '3 OT', ' in triple overtime'],
      [4, '4 OT', ' after 4 overtime periods'],
    ];
    for (const [ot, tag, words] of cases) {
      const g = final(71, 64, {}, ot);
      expect(m.describe.describeGame(g).deciderTag, `${ot} periods`).toBe(tag);
      expect(m.describe.resultSentence(g)).toBe(`Homestead won their home non-league game against Cupertino 71–64${words}.`);
      expect(m.describe.overtimeDoubtOf(g)).toBeNull();
    }
  });

  it('believes a coach’s overtime note on any score, with the count it names', () => {
    const res = m.normalize.normalizeGames([finalRow(71, 64, 'Won in 3OT')], { fetchedAt: '2027-01-10T12:00:00.000Z' });
    expect([res.games[0].otPeriods, res.games[0].decider]).toEqual([3, '2OT']);
    expect(m.describe.describeGame(res.games[0]).deciderTag).toBe('3 OT');
    expect(res.warnings.join('\n')).not.toMatch(/sudden victory/);
  });
});

describe('basketball: a level final is a score entered wrong', () => {
  it('counts the marked side’s win in any game, league games included, and prints no tie', () => {
    const base = final(60, 60);
    const raw: Game = { ...base, home: { ...base.home, result: 'W' }, away: { ...base.away, result: 'L' } };
    expect(m.level.mustHaveWinner(raw)).toBe(true);
    const g = m.level.settleLevelFinal(raw);
    expect(g.decider).toBe('SO');
    expect(m.format.sideOutcome(g, 'home')).toBe('W');
    const d = m.describe.describeGame(g);
    expect([d.home.chip, d.away.chip]).toEqual(['W', 'L']);
    expect(d.deciderTag).toBeNull();
    // No tally exists to miss in basketball: the level score is the error.
    expect(d.sentence).toBe('Homestead 60, Cupertino 60, final; Homestead credited with the win (MaxPreps lists 60–60).');
  });

  it('leaves a level final with no winner marked as it is: nothing says who won', () => {
    const unmarked = final(60, 60);
    expect(m.level.settleLevelFinal(unmarked)).toBe(unmarked);
  });
});
