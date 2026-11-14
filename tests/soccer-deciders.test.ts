/**
 * Overtime and level finals in the soccer build (`SCVAL_SPORT=soccer`): overtime is two full halves, never counted, and a level playoff
 * game is settled on penalty kicks (lib/sports/soccer.ts `scoring.overtime`, `scoring.tiebreak`).
 * The modules read the sport at import, so they are imported after the switch (as tests/soccer.test.ts does).
 */

import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { ScheduleRow } from '../lib/sources/maxpreps';
import type { Game, PostseasonTag } from '../lib/types';

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
  vi.stubEnv('SCVAL_SPORT', 'soccer');
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

const CCS_TAG: PostseasonTag = { kind: 'ccs', leagueId: null, via: 'contest-type-4' };

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

describe('soccer: the sport’s words', () => {
  it('mirrors the sport definition in lib/format', () => {
    const { scoring } = m.current.SPORT;
    expect(scoring).toMatchObject({ allowsTies: true, overtime: 'two-halves', tiebreak: { words: 'penalty kicks', tag: 'PK' } });
    expect(m.format.SPORT_TIEBREAK_WORDS).toBe(scoring.tiebreak?.words);
    expect(m.format.SPORT_TIEBREAK_TAG).toBe(scoring.tiebreak?.tag);
    expect(m.format.SPORT_OVERTIME_IS_SUDDEN_VICTORY).toBe(false);
    expect(m.format.SPORT_COUNTS_OVERTIMES).toBe(false);
    expect(m.format.shootoutPhrases('penalty kicks')).toMatchObject({
      noun: 'penalty kick', onPhrase: 'on penalty kicks', wonOn: 'won on penalty kicks', decidedOn: 'decided on penalty kicks', pronoun: 'them',
    });
  });
});

describe('soccer: overtime is one stage of two full halves', () => {
  it('reads OT whatever count MaxPreps holds, and never "double overtime"', () => {
    for (const ot of [1, 2]) {
      const g = final(3, 1, {}, ot);
      const d = m.describe.describeGame(g);
      expect(d.deciderTag, `${ot} periods`).toBe('OT');
      expect(d.sentence).toBe('Homestead 3, Cupertino 1, final after overtime.');
      expect(m.describe.resultSentence(g)).toBe('Homestead won their home non-league game against Cupertino 3–1 in overtime.');
    }
  });

  it('never doubts a two-goal margin out of overtime', () => {
    expect(m.describe.overtimeDoubtOf(final(3, 1, {}, 2))).toBeNull();
  });

  it('believes a coach’s overtime note on any score', () => {
    const res = m.normalize.normalizeGames([finalRow(3, 1, 'Won in OT')], { fetchedAt: '2027-01-10T12:00:00.000Z' });
    expect([res.games[0].otPeriods, res.games[0].decider]).toEqual([1, 'OT']);
    expect(res.warnings.join('\n')).not.toMatch(/sudden victory/);
  });
});

describe('soccer: a level playoff final with the winner marked', () => {
  it('is the marked side’s win, with no claim about how the tie was broken', () => {
    const raw = final(1, 1, { postseason: CCS_TAG, home: { ...final(1, 1).home, result: 'L' }, away: { ...final(1, 1).away, result: 'W' } }, 2);
    expect(m.format.sideOutcome(raw, 'away')).toBe('T');
    const g = m.level.settleLevelFinal(raw);
    expect(g.decider).toBe('SO');
    expect(m.format.sideOutcome(g, 'away')).toBe('W');
    expect(m.describe.tiebreakRuleOf(g)).toEqual({ words: 'penalty kicks', inference: 'unverified', section: null });
    const d = m.describe.describeGame(g);
    expect(d.deciderTag).toBeNull();
    expect(d.sentence).toBe('Homestead 1, Cupertino 1, final; Cupertino credited with the win (MaxPreps lists 1–1 with no tally).');
  });

  it('says penalty kicks, PK, once a tally is stored', () => {
    const g: Game = { ...final(1, 1, { postseason: CCS_TAG }), decider: 'SO', shootout: { home: 4, away: 3 } };
    const d = m.describe.describeGame(g);
    expect(d.shootoutText).toBe('(4–3 PK)');
    expect(m.describe.resultSentence(g)).toBe('Homestead won their home CCS playoff game against Cupertino on penalty kicks (4–3) after a 1–1 tie.');
  });

  it('leaves a level league or non-league game a tie, marked or not', () => {
    const marked = final(1, 1, { home: { ...final(1, 1).home, result: 'W' }, away: { ...final(1, 1).away, result: 'L' } });
    expect(m.level.settleLevelFinal(marked)).toBe(marked);
    expect(m.format.sideOutcome(marked, 'home')).toBe('T');
  });
});
