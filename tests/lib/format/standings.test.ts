/**
 * lib/format/standings.ts: the standings engine's copy, pinned on literal inputs. The engine wrappers
 * (lib/engine/standings/uneven.ts, ladder.ts) only look the values up in config, so tests/lib/engine/standings/ladder.test.ts
 * and tests/lib/engine/standings/uneven.test.ts pin what the pages print through them.
 */
import { describe, expect, it } from 'vitest';

import { badgeWords, legendWords, outcomeLabelWords, unevenGamesWords } from '@/lib/format/standings';
import type { LadderRung } from '@/lib/model/league-config';

const AQ: LadderRung = {
  divisions: '*',
  places: [1, 3],
  status: 'aq',
  label: 'Automatic qualifier',
  phrase: 'an automatic berth',
  badge: 'AQ',
  legend: 'Automatic CCS qualifier',
};
const PLAY_IN: LadderRung = {
  divisions: '*',
  places: [4, 4],
  status: 'play-in',
  label: 'Play-in',
  phrase: 'the {date} play-in',
  badge: 'PI',
  legend: 'Plays in on {date} for the last automatic berth',
};
const AT_LARGE: LadderRung = {
  divisions: '*',
  places: [5, 5],
  status: 'at-large',
  label: 'At-large consideration',
  phrase: 'at-large consideration',
  badge: 'AL',
  legend: 'Goes to CCS for at-large consideration',
};

describe('unevenGamesWords', () => {
  const spread = { min: 9, max: 12, scheduled: 16 };

  it('says the fixed-schedule sentence when there is no league to name', () => {
    expect(unevenGamesWords(spread, null)).toBe(
      'Teams have played between 9 and 12 of 16 league games, so points favour teams that have played more.',
    );
  });

  it("says games against members under the 'membership' rule", () => {
    expect(unevenGamesWords({ min: 1, max: 5, scheduled: null }, { shortName: 'Sunset', classification: 'membership' })).toBe(
      'Teams have played between 1 and 5 games against other Sunset teams, and there is no fixed league schedule, so points favour teams that have played more.',
    );
  });

  it("says MaxPreps' league flag under the 'contest-type' rule", () => {
    expect(unevenGamesWords({ min: 2, max: 6, scheduled: null }, { shortName: 'EAL', classification: 'contest-type' })).toBe(
      'Teams have played between 2 and 6 of the games MaxPreps marks as EAL league games, and there is no fixed league schedule, so points favour teams that have played more.',
    );
  });
});

describe('outcomeLabelWords', () => {
  it('is the first rung label alone when no other rung is open', () => {
    expect(outcomeLabelWords(AQ, [], '— Article VI §7 decides it with a coin flip')).toBe('Automatic qualifier');
  });

  it("joins the other rungs' phrases with ' or ' and appends the suffix", () => {
    expect(outcomeLabelWords(AQ, [PLAY_IN, AT_LARGE], '— Article VI §7 decides it with a coin flip')).toBe(
      'Automatic qualifier or the {date} play-in or at-large consideration — Article VI §7 decides it with a coin flip',
    );
  });

  it('appends nothing when the suffix is empty', () => {
    expect(outcomeLabelWords(PLAY_IN, [AT_LARGE], '')).toBe('Play-in or at-large consideration');
  });
});

describe('legendWords', () => {
  it("replaces '{date}' with the short date of the first pairing", () => {
    expect(legendWords(PLAY_IN.legend, '2026-10-30')).toBe('Plays in on Fri Oct 30 for the last automatic berth');
  });

  it('keeps the legend as written without a pairing date', () => {
    expect(legendWords(PLAY_IN.legend, null)).toBe('Plays in on {date} for the last automatic berth');
    expect(legendWords(AQ.legend, '2026-10-30')).toBe('Automatic CCS qualifier');
  });
});

describe('badgeWords', () => {
  it("is the rung's badge", () => {
    expect(badgeWords(AT_LARGE)).toBe('AL');
  });
});
