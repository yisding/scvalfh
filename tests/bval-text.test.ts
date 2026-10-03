/**
 * lib/official/bval-text.ts (SPEC §7.8): the two BVAL docx texts reproduce the fixtures of
 * data/official/bval-2026.json exactly; the five time-override forms and their varsity times; any
 * other override throws; the `BVAL MEETINGS` lines (which contain `@`) are ignored; the play-in
 * line is an event.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { BVAL_DEFAULT_VARSITY, BVAL_TIME_OVERRIDES, parseBvalScheduleText } from '../lib/official/bval-text';
import { compareBundleFixtures, readOfficialBundle, serializeBundle } from '../lib/official/schema';
import { buildBval, buildBvalFromText } from '../scripts/build-official-fixtures';
import { REPO } from './helpers';

const FIX = path.join(REPO, 'tests', 'fixtures', 'official');
const textA = readFileSync(path.join(FIX, 'bval-sched-A.txt'), 'utf8');
const textB = readFileSync(path.join(FIX, 'bval-sched-B.txt'), 'utf8');
const mh = parseBvalScheduleText(textA, 'mt-hamilton');
const st = parseBvalScheduleText(textB, 'santa-teresa');
const parsed = [...mh.fixtures, ...st.fixtures];

describe('bval-text: the two documents reproduce the bundle', () => {
  it('parses 30 fixtures per division', () => {
    expect(mh.fixtures).toHaveLength(30);
    expect(st.fixtures).toHaveLength(30);
    expect(mh.revisedOn).toBe('9/20/26');
    expect(st.revisedOn).toBe('9/22/26');
  });

  it('equals data/official/bval-2026.json fixtures exactly', () => {
    const bundle = readOfficialBundle('bval');
    const fromText = parsed
      .map((f) => {
        const { timeOverride, ...fixture } = f;
        void timeOverride;
        return fixture;
      })
      .sort(compareBundleFixtures);
    expect(fromText).toEqual(bundle.fixtures);
  });

  it('builds the identical file through --bval-text', () => {
    expect(serializeBundle(buildBvalFromText([textA, textB]))).toBe(serializeBundle(buildBval()));
    expect(serializeBundle(buildBvalFromText([textA, textB]))).toBe(
      readFileSync(path.join(REPO, 'data', 'official', 'bval-2026.json'), 'utf8'),
    );
  });

  it('reads WG as Willow Glen through the league codes and keeps the grid spelling', () => {
    const wg = parsed.find((f) => f.id === 'mt-hamilton:2026-10-08:willow-glen@christopher');
    expect(wg).toMatchObject({ away: 'willow-glen', awayName: 'WG', home: 'christopher', homeName: 'Christopher' });
    expect(parsed.find((f) => f.away === 'sobrato')?.awayName).toBe('Sobrato');
  });
});

describe('bval-text: time overrides', () => {
  it('knows exactly five override forms', () => {
    expect(BVAL_TIME_OVERRIDES).toEqual({
      '4pm': '16:00',
      '6:30pm': '18:30',
      'V 4p/JV 515p': '16:00',
      'JV 4p/V 515p': '17:15',
      'JV 5p/ V 615p': '18:15',
    });
    expect(BVAL_DEFAULT_VARSITY).toBe('17:00');
  });

  it('reads each form with its varsity time and its 2026 count', () => {
    const count = (override: string | null) => parsed.filter((f) => f.timeOverride === override);
    expect(count(null)).toHaveLength(35);
    expect(count(null).every((f) => f.time === '17:00')).toBe(true);
    for (const [override, n] of [['4pm', 14], ['6:30pm', 5], ['V 4p/JV 515p', 4], ['JV 4p/V 515p', 1], ['JV 5p/ V 615p', 1]] as const) {
      const rows = count(override);
      expect(rows).toHaveLength(n);
      expect(rows.every((f) => f.time === BVAL_TIME_OVERRIDES[override])).toBe(true);
    }
    expect(count('JV 4p/V 515p').map((f) => f.id)).toEqual(['mt-hamilton:2026-10-30:branham@christopher']);
    expect(count('JV 5p/ V 615p').map((f) => f.id)).toEqual(['santa-teresa:2026-10-27:silver-creek@prospect']);
  });

  it('throws on any other override text', () => {
    const changed = textA.replace('Leland @ Willow Glen 6:30pm', 'Leland @ Willow Glen 7pm');
    expect(() => parseBvalScheduleText(changed, 'mt-hamilton')).toThrow(/unknown time override "7pm"/);
    const spaced = textB.replace('JV 5p/ V 615p', 'JV 5p/V 615p');
    expect(() => parseBvalScheduleText(spaced, 'santa-teresa')).toThrow(/unknown time override "JV 5p\/V 615p"/);
  });

  it('throws on a side that is not a BVAL team', () => {
    const changed = textA.replace('Leigh @ Gilroy', 'Leigh @ Cupertino');
    expect(() => parseBvalScheduleText(changed, 'mt-hamilton')).toThrow(/no bval home team/);
  });
});

describe('bval-text: lines that are not games', () => {
  it('ignores the BVAL MEETINGS lines, which contain "@"', () => {
    expect(textA).toMatch(/BVAL MEETINGS:.*@ Pioneer HS/);
    expect(textA).toMatch(/Post-Season – 11\/10 @ Pioneer HS/);
    expect(parsed.some((f) => /Pioneer|Season/i.test(`${f.awayName} ${f.homeName}`))).toBe(false);
    // …even when a meetings block sits under a date heading.
    const moved = textA.replace(
      'Thursday, September 17th\nLeigh @ Gilroy',
      'Thursday, September 17th\nBVAL MEETINGS: \tPre-Season – 8/11 @ Pioneer HS 6pm\nPost-Season – 11/10 @ Pioneer HS 6pm\nLeigh @ Gilroy',
    );
    expect(moved).not.toBe(textA);
    expect(parseBvalScheduleText(moved, 'mt-hamilton').fixtures).toEqual(mh.fixtures);
  });

  it('turns the CCS play-in lines into an event, never a fixture', () => {
    const event = { kind: 'play-in', date: '2026-10-31', time: '11:00', verbatim: 'CCS Play-in Game / 4th Place MH @ ST Champion 11am' };
    expect(mh.events).toEqual([event]);
    expect(st.events).toEqual([event]);
    expect(parsed.some((f) => f.date === '2026-10-31')).toBe(false);
  });

  it('ignores dated notes (Entries Due, CCS Playoffs Begin) and the header block', () => {
    expect(parsed.some((f) => f.date >= '2026-10-31')).toBe(false);
    expect(parsed.map((f) => f.date).sort()[0]).toBe('2026-09-17');
  });

  it('refuses the other division’s document', () => {
    expect(() => parseBvalScheduleText(textB, 'mt-hamilton')).toThrow(/MT\. HAMILTON DIVISION/);
  });
});
