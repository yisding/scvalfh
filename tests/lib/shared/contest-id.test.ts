import { describe, expect, it } from 'vitest';

import {
  GUID_RE,
  GUID_RE_ANY_CASE,
  hasSbliveContestPrefix,
  isContestId,
  isSbliveContestId,
  sbliveContestId,
  sbliveGameIdOf,
} from '@/lib/shared/contest-id';

const GUID = '0a1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d';

describe('contest-id grammar', () => {
  it('builds and reads the si.com form', () => {
    expect(sbliveContestId('123')).toBe('sblive:123');
    expect(sbliveGameIdOf('sblive:123')).toBe('123');
    expect(sbliveGameIdOf('sblive:12a')).toBeNull();
    expect(sbliveGameIdOf(GUID)).toBeNull();
  });

  it('keeps the full grammar and the prefix test distinct', () => {
    expect(isSbliveContestId('sblive:123')).toBe(true);
    expect(isSbliveContestId('sblive:')).toBe(false);
    expect(isSbliveContestId('sblive:12x')).toBe(false);
    expect(hasSbliveContestPrefix('sblive:12x')).toBe(true);
    expect(hasSbliveContestPrefix('sblive:')).toBe(true);
    expect(hasSbliveContestPrefix(GUID)).toBe(false);
  });

  it('keeps the two GUID flags distinct', () => {
    expect(GUID_RE.test(GUID)).toBe(true);
    expect(GUID_RE.test(GUID.toUpperCase())).toBe(false);
    expect(GUID_RE_ANY_CASE.test(GUID.toUpperCase())).toBe(true);
  });

  it('accepts a GUID in either case or an si.com id as a contest id, nothing else', () => {
    expect(isContestId(GUID)).toBe(true);
    expect(isContestId(GUID.toUpperCase())).toBe(true);
    expect(isContestId('sblive:9')).toBe(true);
    expect(isContestId('sblive:x')).toBe(false);
    expect(isContestId('')).toBe(false);
  });
});
