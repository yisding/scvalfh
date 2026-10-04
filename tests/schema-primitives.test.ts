/**
 * lib/schema-primitives.ts: the id, date-key and URL primitives every data contract shares, and the
 * one schema-failure message every loader throws. The messages are pinned because tests of the
 * contracts (snapshot, clubs, commits, rosters) match on them.
 */

import { describe, expect, it } from 'vitest';

import {
  DATE_PATTERN,
  SLUG_PATTERN,
  dateKey,
  failValidation,
  formatIssues,
  httpUrl,
  httpsUrl,
  isCalendarDate,
  isHttpsUrl,
  slugId,
} from '../lib/schema-primitives';

const messageOf = (schema: { safeParse: (v: unknown) => { success: boolean; error?: { issues: { message: string }[] } } }, v: unknown) =>
  schema.safeParse(v).error?.issues[0]?.message ?? null;

describe('schema primitives', () => {
  it('a lower-case id is hyphen-joined a-z0-9 words', () => {
    expect(SLUG_PATTERN.test('los-altos')).toBe(true);
    expect(SLUG_PATTERN.test('Los-Altos')).toBe(false);
    expect(SLUG_PATTERN.test('los--altos')).toBe(false);
    expect(messageOf(slugId, 'los-altos')).toBeNull();
    expect(messageOf(slugId, 'los_altos')).toBe('expected a lower-case id');
  });

  it('a date key is YYYY-MM-DD by shape; isCalendarDate also wants a real day', () => {
    expect(DATE_PATTERN.test('2026-02-30')).toBe(true);
    expect(messageOf(dateKey, '2026-10-04')).toBeNull();
    expect(messageOf(dateKey, '2026-10-4')).toBe('expected YYYY-MM-DD');
    expect(isCalendarDate('2026-02-28')).toBe(true);
    expect(isCalendarDate('2026-02-30')).toBe(false);
    expect(isCalendarDate('2026-2-28')).toBe(false);
  });

  it('an href URL is http(s); an https URL is https', () => {
    expect(messageOf(httpUrl, 'http://scval.com/')).toBeNull();
    expect(messageOf(httpUrl, 'javascript:alert(1)')).toBe('expected an http(s) URL');
    expect(messageOf(httpsUrl, 'https://scval.com/')).toBeNull();
    expect(messageOf(httpsUrl, 'http://scval.com/')).toBe('expected an https URL');
    expect(isHttpsUrl('https://scval.com/')).toBe(true);
    expect(isHttpsUrl('scval.com')).toBe(false);
  });

  it('a schema failure names its file and lists the first ten issues by path', () => {
    const issues = Array.from({ length: 12 }, (_, i) => ({ path: ['teams', i, 'slug'], message: `bad ${i}` }));
    expect(formatIssues([{ path: [], message: 'not an object' }])).toBe('  (root): not an object');
    expect(formatIssues(issues).split('\n')).toHaveLength(10);
    expect(() => failValidation('rosters', issues)).toThrow(/^rosters failed validation:\n {2}teams\.0\.slug: bad 0\n/);
  });
});
