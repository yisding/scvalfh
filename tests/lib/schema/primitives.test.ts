/**
 * lib/schema/primitives.ts: the id, date-key and URL primitives every data contract shares, and the
 * one schema-failure message every loader throws. The messages are pinned because tests of the
 * contracts (snapshot, clubs, commits, rosters) match on them.
 */

import { describe, expect, it } from 'vitest';

import { z } from 'zod';

import { TEAMS } from '@/lib/registry/teams';
import { customIssue, dateKey, describeIssues, failValidation, formatIssues, httpUrl, httpsUrl, slugId } from '@/lib/schema/primitives';
import { REGISTRY_TEAM_COUNT, registryTeamSlug } from '@/lib/schema/registry-primitives';
import { dateOnly, httpsSourceUrl, text } from '@/lib/schema/source-url';
import { DATE_PATTERN, SLUG_PATTERN, isCalendarDate, isHttpsUrl } from '@/lib/shared/patterns';

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

  it('describeIssues is every caller of the formatter: limit, empty path, separator, indent, prefix, path join', () => {
    const issues = [
      { path: [], message: 'not an object' },
      { path: ['data', 0, 'schoolId'], message: 'Invalid input' },
      { path: ['data', 1], message: 'Required' },
      { path: ['data', 2], message: 'beyond the limit' },
    ];
    expect(describeIssues(issues, { limit: 3, empty: '(row)', separator: '; ' })).toBe(
      '(row): not an object; data.0.schoolId: Invalid input; data.1: Required',
    );
    expect(describeIssues(issues, { limit: 2, empty: '(root)', separator: '; ', prefix: 'schema drift: ' })).toBe(
      'schema drift: (root): not an object; data.0.schoolId: Invalid input',
    );
    expect(describeIssues(issues, { limit: 2, empty: '-', separator: '|', indent: '> ', pathJoin: '>' })).toBe(
      '> -: not an object|> data>0>schoolId: Invalid input',
    );
    expect(describeIssues([], { limit: 3, empty: '(row)', separator: '; ', prefix: 'p: ' })).toBe('p: ');
  });

  it('customIssue adds a custom issue at its path', () => {
    const schema = z.object({ a: z.number() }).superRefine((v, ctx) => customIssue(ctx, ['a', 0], `bad ${v.a}`));
    const issue = schema.safeParse({ a: 1 }).error?.issues[0];
    expect(issue).toMatchObject({ code: 'custom', path: ['a', 0], message: 'bad 1' });
  });

  it('the registry primitives are the registry: its slugs and its team count', () => {
    expect(REGISTRY_TEAM_COUNT).toBe(TEAMS.length);
    expect(messageOf(registryTeamSlug, TEAMS[0].slug)).toBeNull();
    expect(messageOf(registryTeamSlug, 'not-a-team')).toBe('not a registry team slug');
    expect(messageOf(registryTeamSlug, 'Not A Team')).toBe('expected a lower-case id');
  });

  it('the source-URL primitives refuse a social host under their own message, a non-day, a non-https URL', () => {
    expect(messageOf(httpsSourceUrl, 'https://www.maxpreps.com/')).toBeNull();
    expect(messageOf(httpsSourceUrl, 'https://www.instagram.com/club/')).toBe('social media is not a source');
    expect(messageOf(httpsSourceUrl, 'http://www.maxpreps.com/')).toBe('expected an https URL');
    expect(messageOf(dateOnly, '2026-02-28')).toBeNull();
    expect(messageOf(dateOnly, '2026-02-30')).toBe('expected YYYY-MM-DD');
    expect(messageOf(text, 'x')).toBeNull();
    expect(messageOf(text, '')).not.toBeNull();
  });
});
