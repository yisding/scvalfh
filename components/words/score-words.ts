/**
 * The sport's scoring words (lib/sports/shape.ts `SportScoring`), for server-rendered copy: what a team
 * scores, the three column heads, and how a record reads. Field hockey and soccer score goals and may end
 * level ('GF', 'W-L-T'); basketball scores points and cannot ('PF', 'W-L').
 *
 * SERVER-SIDE BY CONVENTION: this reads lib/sports/current, and Turbopack keeps a whole sport definition
 * once a client bundle reads one field of it (docs/MULTI-SPORT.md, "Guards"). A 'use client' component takes
 * these strings as props from the server component that renders it. lib/format's `recordString` and
 * `recordWords` already print a record the sport's way and are client-safe.
 */

import { capitalized } from './capitalized';
import { SPORT } from '../../lib/sports/current';

const S = SPORT.scoring;

/** Whether a game may end level (false: basketball). */
export const ALLOWS_TIES: boolean = S.allowsTies;
/** 'goal' / 'point', and the plural. */
export const SCORE_UNIT: string = S.unit;
export const SCORE_UNITS: string = S.units;
/** 'Goals' / 'Points'. */
export const SCORE_UNITS_TITLE: string = capitalized(S.units);
/** 'GF' / 'PF', 'GA' / 'PA', 'GD' / 'PD'. */
export const FOR_ABBR: string = S.forAbbr;
export const AGAINST_ABBR: string = S.againstAbbr;
export const DIFF_ABBR: string = S.diffAbbr;
/** 'goals for', 'goals against', 'goal differential' (or the points words), lower case. */
export const FOR_WORDS: string = S.forWords;
export const AGAINST_WORDS: string = S.againstWords;
export const DIFF_WORDS: string = S.diffWords;
/** 'goal difference' / 'point difference': the shorter noun some legends use. */
export const DIFFERENCE_WORDS = `${S.unit} difference`;
/** The record column's head: 'W-L-T', or 'W-L' where no game ends level. */
export const RECORD_HEAD = S.allowsTies ? 'W-L-T' : 'W-L';
/** The same in words: 'won-lost-tied' / 'won-lost', 'win-loss-tie' / 'win-loss', 'win/loss/tie' / 'win/loss'. */
export const RECORD_HEAD_WORDS = S.allowsTies ? 'won-lost-tied' : 'won-lost';
export const RECORD_NOUN_WORDS = S.allowsTies ? 'win-loss-tie' : 'win-loss';
export const RECORD_SLASH_WORDS = S.allowsTies ? 'win/loss/tie' : 'win/loss';
/** A record with nothing played yet: '0-0-0' / '0-0'. */
export const EMPTY_RECORD = S.allowsTies ? '0-0-0' : '0-0';

/** `n` of what a team scores: '1 goal', '3 points'. */
export function scoreCount(n: number): string {
  return `${n} ${n === 1 ? S.unit : S.units}`;
}
