/**
 * Level finals in a sport that cannot end level (lib/jv/jv-level-scores.ts): a MaxPreps JV or freshman final level on
 * the scoreboard, in a sport with no ties, is withheld; another source fills it where it has the game, and the note
 * says what MaxPreps had and what is shown. Over the committed JV and freshman files of this build, no such final is
 * listed with its score.
 */
import { describe, expect, it } from 'vitest';

import { getFreshmanGames } from '../lib/freshman/freshman';
import { getJvGames, getJvLevelScores } from '../lib/jv/jv';
import { isWithheldLevelFinal, levelScoreNote, withholdLevelScores } from '../lib/jv/jv-level-scores';
import { SPORT } from '../lib/sports/current';
import type { Game } from '../lib/types';
import { game } from './game-builder';

// A MaxPreps JV row: the builder's games are 'derived'-scored, which the rule leaves alone.
const jvOf = (g: ReturnType<typeof game>): Game => ({
  ...g,
  countsFor: null,
  postseason: null,
  provenance: { ...g.provenance, scores: 'maxpreps-api' as const },
});
const level = (flags: ['W' | 'L' | 'T' | null, 'W' | 'L' | 'T' | null] = ['T', 'T']) => {
  const g = jvOf(game({ home: 'los-gatos', away: 'santa-clara', date: '2026-11-21', hs: 0, as: 0 }));
  return { ...g, home: { ...g.home, result: flags[0] }, away: { ...g.away, result: flags[1] } };
};

describe('withholdLevelScores', () => {
  it('withholds a level MaxPreps final in a sport with no ties: a played game with no score', () => {
    const g = { ...level(), provenance: { ...level().provenance, resultConflict: 'MaxPreps marks …' } };
    const { games, withheld } = withholdLevelScores([g], false);
    expect(games[0].status).toBe('score-pending');
    expect(games[0].home.score).toBeNull();
    expect(games[0].away.result).toBeNull();
    expect(games[0].decider).toBeNull();
    expect(games[0].provenance.resultConflict).toBeUndefined();
    expect(withheld.get(g.contestId)).toEqual({ score: 0 });
  });

  it('withholds a level score whatever the flags say: T/T, W/L or none', () => {
    const rows = [level(['T', 'T']), level(['W', 'L']), level([null, null])].map((g, i) => ({ ...g, contestId: `c${i}` }));
    expect([...withholdLevelScores(rows, false).withheld.keys()]).toEqual(['c0', 'c1', 'c2']);
  });

  it('leaves alone a sport with ties, a decisive score, a forfeit, a tiebreak win and a score that is not MaxPreps’', () => {
    const decisive = jvOf(game({ home: 'los-gatos', away: 'santa-clara', date: '2026-11-21', hs: 50, as: 48 }));
    const forfeit = { ...level(), contestId: 'f', isForfeit: true, decider: 'FORFEIT' as const };
    const so = { ...level(['W', 'L']), contestId: 's', decider: 'SO' as const };
    const site = { ...level(), contestId: 'x', provenance: { ...level().provenance, scores: 'school-site' as const } };
    const scheduled = jvOf(game({ home: 'los-gatos', away: 'santa-clara', date: '2026-11-21' }));
    expect(withholdLevelScores([level()], true).withheld.size).toBe(0);
    for (const g of [decisive, forfeit, so, site, scheduled]) expect(isWithheldLevelFinal(g, false), g.contestId).toBe(false);
    const { games } = withholdLevelScores([decisive, forfeit, so, site, scheduled], false);
    expect(games).toEqual([decisive, forfeit, so, site, scheduled]);
  });

  it('says what MaxPreps had and what is shown', () => {
    const g = level();
    const { games, withheld } = withholdLevelScores([g], false);
    const entry = withheld.get(g.contestId)!;
    expect(levelScoreNote(games[0], entry, 'basketball')).toBe(
      'MaxPreps lists this game as a 0-0 final, which a basketball game cannot be, and no other source has a score, so none is shown.',
    );
    const filled: Game = {
      ...games[0],
      status: 'final',
      home: { ...games[0].home, score: 52 },
      away: { ...games[0].away, score: 47 },
      provenance: { ...games[0].provenance, scores: 'sblive' },
    };
    expect(levelScoreNote(filled, entry, 'basketball')).toMatch(/^MaxPreps lists this game as a 0-0 final, which a basketball game cannot be; si\.com has .* 47, .* 52, which is shown\.$/);
  });
});

describe('the committed files', () => {
  it('list no level final of this build’s sport with its score when the sport has no ties', () => {
    for (const g of [...getJvGames(), ...getFreshmanGames()]) {
      expect(isWithheldLevelFinal(g, SPORT.scoring.allowsTies), g.contestId).toBe(false);
    }
    if (SPORT.scoring.allowsTies) expect(getJvLevelScores().size).toBe(0);
  });
});
