/**
 * lib/sources/ccs.ts — the CIF-CCS calendar and the MaxPreps bracket-state probe (SPEC §1.4, §5.9).
 *
 * `tests/fixtures/ccs/field-hockey.ics` is the REAL feed from
 * https://cifccs.org/calendar/Field_Hockey?print=ical — including its "CCS Semfinals" typo, which
 * is the whole reason the classifier matches `sem[i]?final`.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  CCS_POLL_FROM,
  ccsPollingOpen,
  classifyCcsSummary,
  cleanCcsSummary,
  confirmKeyDates,
  parseCcsIcal,
  readBracketPublished,
} from '../lib/sources/ccs';
import { PLAYOFF_KEY_DATES } from '../lib/season';
import { REPO } from './helpers';

const ics = readFileSync(path.join(REPO, 'tests', 'fixtures', 'ccs', 'field-hockey.ics'), 'utf8');
const events = parseCcsIcal(ics);

describe('ccs: the iCal feed', () => {
  it('reads exactly the five all-day VEVENTs', () => {
    expect(events.map((e) => e.date)).toEqual([
      '2026-11-02',
      '2026-11-07',
      '2026-11-11',
      '2026-11-14',
      '2026-11-19',
    ]);
    expect(events.every((e) => e.uid?.endsWith('@prestosports.com'))).toBe(true);
  });

  it('tolerates the live feed\'s "Semfinals" typo', () => {
    const semi = events.find((e) => e.kind === 'semifinals');
    // Verbatim from the feed — the typo is upstream's, and we match it rather than "correcting" it.
    expect(semi?.summary).toBe('CCS Semfinals at Neutral Sites');
    expect(semi?.date).toBe('2026-11-11');
    // The naive spelling finds nothing, which is exactly the bug this guards.
    expect(ics.includes('CCS Semifinals')).toBe(false);
  });

  it('classifies every event, none falling through to "other"', () => {
    expect(events.map((e) => e.kind)).toEqual([
      'entries-due',
      'quarterfinals',
      'semifinals',
      'finals',
      'evaluation',
    ]);
  });

  it('strips the "(Field Hockey)" SUMMARY prefix and keeps DESCRIPTION detail', () => {
    const entries = events[0];
    expect(entries.summary).toBe('CCS Playoff Entry Forms Due at CCS Office');
    // DESCRIPTION carries BOTH prefixes: "Field Hockey: (Field Hockey) …".
    expect(entries.detail).toBe('CCS Playoff Entry Forms Due at CCS Office, 12:00 noon');
    expect(cleanCcsSummary('(Field Hockey) CCS Finals')).toBe('CCS Finals');
    expect(cleanCcsSummary('Field Hockey: (Field Hockey) CCS Finals')).toBe('CCS Finals');
  });

  it('classifies by keyword, both spellings', () => {
    expect(classifyCcsSummary('(Field Hockey) CCS Semfinals at Neutral Sites')).toBe('semifinals');
    expect(classifyCcsSummary('(Field Hockey) CCS Semifinals')).toBe('semifinals');
    expect(classifyCcsSummary('(Field Hockey) CCS Quarterfinals at Home Sites')).toBe('quarterfinals');
    expect(classifyCcsSummary('(Field Hockey) CCS Finals at Neutral Site')).toBe('finals');
    expect(classifyCcsSummary('CCS Playoff Entry Forms Due')).toBe('entries-due');
    expect(classifyCcsSummary('CCS Committee Evaluation Meeting')).toBe('evaluation');
    expect(classifyCcsSummary('Something else entirely')).toBe('other');
  });

  it('unfolds RFC 5545 continuation lines before parsing', () => {
    const folded = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'DTSTART;VALUE=DATE:20261107',
      'SUMMARY:(Field Hockey) CCS Quarterfi',
      ' nals at Home Sites',
      'UID:abc@prestosports.com',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const parsed = parseCcsIcal(folded);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].summary).toBe('CCS Quarterfinals at Home Sites');
    expect(parsed[0].kind).toBe('quarterfinals');
  });

  it('ignores an event with no DTSTART rather than inventing a date', () => {
    const bad = 'BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:CCS Finals\nEND:VEVENT\nEND:VCALENDAR';
    expect(parseCcsIcal(bad)).toEqual([]);
  });
});

describe('ccs: key-date confirmation', () => {
  it('confirms every date we publish', () => {
    const check = confirmKeyDates(events);
    expect(check.differences).toEqual([]);
    expect(check.confirmed).toBe(true);
    expect(PLAYOFF_KEY_DATES.quarterfinals).toBe('2026-11-07');
    expect(PLAYOFF_KEY_DATES.semifinals).toBe('2026-11-11');
    expect(PLAYOFF_KEY_DATES.finals).toBe('2026-11-14');
  });

  it('reports a difference instead of silently adopting the feed', () => {
    const moved = events.map((e) => (e.kind === 'finals' ? { ...e, date: '2026-11-15' } : e));
    const check = confirmKeyDates(moved);
    expect(check.confirmed).toBe(false);
    expect(check.differences).toEqual(['finals: we publish 2026-11-14, CCS calendar says 2026-11-15']);
  });

  it('reports a missing event', () => {
    const check = confirmKeyDates(events.filter((e) => e.kind !== 'evaluation'));
    expect(check.differences).toEqual(['CCS calendar has no evaluation meeting event']);
  });
});

describe('ccs: bracket state', () => {
  const body = (extra: string) => `<html><body>${'x'.repeat(3000)}${extra}</body></html>`;

  it('reads the live unpublished marker as NOT published', () => {
    const html = body('<div class="Tournament-styles__notPublished not-published" >This tournament bracket will go live when published.</div>');
    expect(readBracketPublished(html).published).toBe(false);
  });

  it('flips only when the marker is gone', () => {
    expect(readBracketPublished(body('<ol class="bracket"></ol>')).published).toBe(true);
  });

  it('treats a truncated or empty body as unpublished, never as published', () => {
    const res = readBracketPublished('');
    expect(res.published).toBe(false);
    expect(res.reason).toMatch(/0 bytes/);
  });
});

describe('ccs: season gate', () => {
  it('stays closed through the league season and opens Oct 25', () => {
    expect(CCS_POLL_FROM).toBe('2026-10-25');
    expect(ccsPollingOpen('2026-09-29')).toBe(false);
    expect(ccsPollingOpen('2026-10-24')).toBe(false);
    expect(ccsPollingOpen('2026-10-25')).toBe(true);
    expect(ccsPollingOpen('2026-11-07')).toBe(true);
  });
});
