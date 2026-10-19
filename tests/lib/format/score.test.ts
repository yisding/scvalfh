/** lib/format/score.ts: the one reader of a score (DESIGN §5.2) and the shootout phrases. */

import { describe, expect, it } from 'vitest';

import { matchupJoiner, renderScore, scoreSentence, shootoutPhrases } from '@/lib/format/score';
import { EN_DASH } from '@/lib/format/words';
import { game } from '@/tests/support/game-builder';

describe('format: renderScore is the only place scores are read (DESIGN §5.2)', () => {
  it('returns a final with the outcome relative to the home side', () => {
    const view = renderScore(game({ home: 'saint-francis', away: 'homestead', hs: 7, as: 0 }));
    expect(view).toEqual({
      kind: 'final',
      home: 7,
      away: 0,
      outcome: 'W',
      decider: 'REG',
      shootout: null,
    });
  });

  it('returns a genuine 0-0 final as a tie, not as an empty state', () => {
    const view = renderScore(game({ home: 'cupertino', away: 'fremont', hs: 0, as: 0 }));
    expect(view.kind).toBe('final');
    if (view.kind === 'final') {
      expect([view.home, view.away]).toEqual([0, 0]);
      expect(view.outcome).toBe('T');
    }
  });

  it('marks an overtime final', () => {
    const view = renderScore(game({ home: 'los-gatos', away: 'mitty', hs: 2, as: 1, ot: 1 }));
    expect(view.kind === 'final' && view.decider).toBe('OT');
  });

  it('marks a forfeit', () => {
    const view = renderScore(
      game({ home: 'cupertino', away: 'fremont', hs: 1, as: 0, forfeit: true }),
    );
    expect(view.kind === 'final' && view.decider).toBe('FORFEIT');
  });

  it('never returns numbers for a scheduled, pending, live or postponed game', () => {
    for (const status of ['scheduled', 'score-pending', 'live', 'postponed'] as const) {
      const view = renderScore(game({ home: 'cupertino', away: 'fremont', status }));
      expect(view.kind).not.toBe('final');
      expect(JSON.stringify(view)).not.toMatch(/"home":0/);
    }
    const scheduled = renderScore(game({ home: 'cupertino', away: 'fremont', status: 'scheduled' }));
    expect(scheduled).toEqual({ kind: 'scheduled', time: '4:00 PM' });
    expect(renderScore(game({ home: 'cupertino', away: 'fremont', status: 'score-pending' }))).toEqual(
      { kind: 'unreported' },
    );
  });

  it('writes a screen-reader sentence for every state', () => {
    expect(scoreSentence(game({ home: 'saint-francis', away: 'homestead', hs: 7, as: 0 }))).toBe(
      'Saint Francis 7, Homestead 0, final.',
    );
    expect(
      scoreSentence(game({ home: 'cupertino', away: 'fremont', status: 'score-pending' })),
    ).toMatch(/score not reported/);
    expect(scoreSentence(game({ home: 'cupertino', away: 'fremont', status: 'scheduled' }))).toMatch(
      /4:00 PM PT/,
    );
  });

  it('joins away and home with at, or vs at a neutral site', () => {
    const g = game({ home: 'cupertino', away: 'fremont', hs: 1, as: 0 });
    expect(matchupJoiner(g)).toBe('at');
    expect(matchupJoiner({ ...g, site: 'neutral' })).toBe('vs');
  });
});

describe('shootoutPhrases', () => {
  it('words the Northern Section’s 1 v 1s exactly as every EAL string has always read', () => {
    expect(shootoutPhrases('1 v 1s')).toEqual({
      noun: '1 v 1',
      onPhrase: 'on 1 v 1s',
      wonOn: 'won on 1 v 1s',
      decidedOn: 'decided on 1 v 1s',
      decidedIt: '1 v 1s decided it',
      win: 'a 1 v 1 win',
      tally: 'the 1 v 1 tally',
      pronoun: 'them',
    });
  });

  it('words the San Diego Section’s shootout as one event', () => {
    expect(shootoutPhrases('a shootout')).toEqual({
      noun: 'shootout',
      onPhrase: 'in a shootout',
      wonOn: 'won in a shootout',
      decidedOn: 'decided by a shootout',
      decidedIt: 'a shootout decided it',
      win: 'a shootout win',
      tally: 'the shootout tally',
      pronoun: 'it',
    });
  });
});

describe('shootoutPhrases: an unverified section (San Diego)', () => {
  it('describes one game without claiming a shootout decided it; the rule words stay the rule’s', () => {
    expect(shootoutPhrases('a shootout', 'unverified')).toEqual({
      noun: 'shootout',
      onPhrase: 'on a level score',
      wonOn: 'credited with the win',
      decidedOn: 'credited as a win on a level score',
      decidedIt: 'MaxPreps credits the win on a level score',
      win: 'a shootout win',
      tally: 'the shootout tally',
      pronoun: 'it',
    });
    // The default is 'verified': every existing caller, and every EAL string, unchanged.
    expect(shootoutPhrases('1 v 1s')).toEqual(shootoutPhrases('1 v 1s', 'verified'));
    expect(shootoutPhrases('a shootout').decidedOn).toBe('decided by a shootout');
  });

  it('says in the score sentence what MaxPreps lists instead of naming a shootout', () => {
    const g = game({ home: 'mt-carmel', away: 'poway', hs: 0, as: 0, league: false, date: '2026-09-11', results: { home: 'W', away: 'L' } });
    expect(g.decider).toBe('SO');
    expect(scoreSentence(g, { shootoutWords: 'a shootout', shootoutInference: 'unverified' })).toBe(
      `Mt. Carmel 0, Poway 0, final; Mt. Carmel credited with the win (MaxPreps lists 0${EN_DASH}0 with no tally).`,
    );
    expect(scoreSentence(g, { shootoutWords: 'a shootout' })).toBe('Mt. Carmel 0, Poway 0, final; Mt. Carmel won in a shootout.');
  });
});
