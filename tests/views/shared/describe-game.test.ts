/**
 * The site's own result sentence (views/shared/describe-game.ts `resultSentence`): winner first,
 * from the score, the venue and the site's own classification. MaxPreps' recap is not stored.
 */

import { describe, expect, it } from 'vitest';

import { game } from '@/tests/support/game-builder';
import { resultSentence } from '@/views/shared/describe-game';

const LEAGUE_DAY = '2026-09-16';

describe('resultSentence', () => {
  it('leads with the winner, at home or away', () => {
    expect(resultSentence(game({ home: 'fremont', away: 'homestead', hs: 3, as: 1, date: LEAGUE_DAY }))).toBe(
      'Fremont won their home De Anza Division league game against Homestead 3–1.',
    );
    expect(resultSentence(game({ home: 'fremont', away: 'homestead', hs: 1, as: 4, date: LEAGUE_DAY }))).toBe(
      'Homestead won their away De Anza Division league game against Fremont 4–1.',
    );
  });

  it('leads a tie with the home team, and says neutral-site where there is no host', () => {
    const tie = game({ home: 'fremont', away: 'homestead', hs: 2, as: 2, date: LEAGUE_DAY });
    expect(resultSentence(tie)).toBe('Fremont tied their home De Anza Division league game against Homestead 2–2.');
    expect(resultSentence({ ...tie, site: 'neutral' })).toBe(
      'Fremont tied their neutral-site De Anza Division league game against Homestead 2–2.',
    );
  });

  it('names a non-league game by the site’s own classification', () => {
    expect(resultSentence(game({ home: 'fremont', away: 'homestead', hs: 3, as: 1, date: '2026-08-20', league: false }))).toBe(
      'Fremont won their home non-league game against Homestead 3–1.',
    );
    // MaxPreps flags this Valley game non-league; the membership rule counts it, and so does the sentence.
    expect(resultSentence(game({ home: 'westview', away: 'san-pasqual', hs: 0, as: 1, date: '2026-09-30', league: false }))).toBe(
      'San Pasqual won their away Valley league game against Westview 1–0.',
    );
  });

  it('says overtime and forfeits', () => {
    expect(resultSentence(game({ home: 'fremont', away: 'homestead', hs: 2, as: 1, ot: 1, date: LEAGUE_DAY }))).toBe(
      'Fremont won their home De Anza Division league game against Homestead 2–1 in overtime.',
    );
    expect(resultSentence(game({ home: 'fremont', away: 'homestead', hs: 0, as: 1, forfeit: true, date: LEAGUE_DAY }))).toBe(
      'Homestead won their away De Anza Division league game against Fremont by forfeit.',
    );
  });

  it('says a shootout win in the section’s words, and only a credited win where shootouts are unverified', () => {
    expect(
      resultSentence(game({ home: 'chico', away: 'davis', hs: 1, as: 1, results: { home: 'W', away: 'L' }, date: LEAGUE_DAY })),
    ).toBe('Chico won their home EAL league game against Davis on 1 v 1s after a 1–1 tie.');
    expect(
      resultSentence(
        game({ home: 'westview', away: 'san-pasqual', hs: 0, as: 0, results: { home: 'L', away: 'W' }, date: '2026-09-30', league: false }),
      ),
    ).toBe('MaxPreps credits San Pasqual with the win in their away Valley league game against Westview, level at 0–0.');
  });

  it('is null for anything but a final', () => {
    expect(resultSentence(game({ home: 'fremont', away: 'homestead' }))).toBeNull();
    expect(resultSentence(game({ home: 'fremont', away: 'homestead', status: 'score-pending', date: LEAGUE_DAY }))).toBeNull();
  });
});
