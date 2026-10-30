/**
 * lib/sources/ccs.ts — the CIF-CCS calendar and the MaxPreps tournament-page read (SPEC §1.4, §5.9).
 *
 * `tests/fixtures/ccs/field-hockey.ics` is the REAL feed from
 * https://cifccs.org/calendar/Field_Hockey?print=ical — including its "CCS Semfinals" typo, which
 * is the whole reason the classifier matches `sem[i]?final`.
 *
 * `tests/fixtures/ccs/tournament-2026-10-29-unpublished.html` is the REAL MaxPreps tournament page
 * (CCS.bracketUrl, GET 2026-10-29 21:41Z, 111,799 bytes): two `<li id="bracket_<GUID>">` blocks, one per
 * CCS division, each still carrying `<div class="not-published">`. `tournament-403.html` is MaxPreps'
 * WAF body (6,967 bytes), which the same URL answered a minute later from this sandbox.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  CCS_POLL_FROM,
  ccsPollingOpen,
  classifyCcsSummary,
  cleanCcsSummary,
  calendarSiteOf,
  configSiteOf,
  confirmKeyDates,
  parseCcsIcal,
  readTournamentPage,
} from '../lib/sources/ccs';
import { CCS } from '../lib/leagues';
import { CcsCalendarEventSchema } from '../lib/snapshot-schema';
import { REPO } from './helpers';

const ics = readFileSync(path.join(REPO, 'tests', 'fixtures', 'ccs', 'field-hockey.ics'), 'utf8');
const events = parseCcsIcal(ics);

describe('ccs: the iCal feed', () => {
  it('drops an event whose summary is only the sport prefix; every event passes the snapshot schema', () => {
    const parsed = parseCcsIcal(
      [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20261107', 'SUMMARY:(Field Hockey)', 'END:VEVENT',
        'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20261108', 'SUMMARY:Field Hockey:', 'DESCRIPTION:Field Hockey:', 'END:VEVENT',
        'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20261114', 'SUMMARY:(Field Hockey) CCS Finals', 'DESCRIPTION:(Field Hockey)', 'END:VEVENT',
        'END:VCALENDAR',
        '',
      ].join('\n'),
    );
    expect(parsed.map((e) => [e.date, e.summary, e.detail])).toEqual([['2026-11-14', 'CCS Finals', null]]);
    for (const e of [...parsed, ...events]) expect(CcsCalendarEventSchema.safeParse(e).success, e.summary).toBe(true);
  });

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
    expect(CCS.keyDates.quarterfinals).toBe('2026-11-07');
    expect(CCS.keyDates.semifinals).toBe('2026-11-11');
    expect(CCS.keyDates.finals).toBe('2026-11-14');
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

  it('checks where each round is played against the calendar’s own words (home sites through the quarterfinals, neutral after)', () => {
    expect(CCS.highSeedHostsThrough).toBe('quarterfinals');
    expect(events.filter((e) => e.kind === 'quarterfinals' || e.kind === 'semifinals' || e.kind === 'finals').map((e) => calendarSiteOf(e.summary)))
      .toEqual(['home', 'neutral', 'neutral']);
    expect(['quarterfinals', 'semifinals', 'finals'].map((r) => configSiteOf(r as 'quarterfinals', 'quarterfinals'))).toEqual(['home', 'neutral', 'neutral']);
    // The site's former wording, "the higher seed hosts through the semifinals", would now be reported as a difference.
    const check = confirmKeyDates(events, CCS.keyDates, 'semifinals');
    expect(check.confirmed).toBe(false);
    expect(check.differences).toEqual(['semifinals: we say the higher seed hosts, CCS calendar says "CCS Semfinals at Neutral Sites"']);
    // A summary that names no site (a future rewording) is not a difference.
    const silent = events.map((e) => (e.kind === 'semifinals' ? { ...e, summary: 'CCS Semifinals' } : e));
    expect(calendarSiteOf('CCS Semifinals')).toBeNull();
    expect(confirmKeyDates(silent).confirmed).toBe(true);
  });
});

describe('ccs: the tournament page, read per division and positively', () => {
  const live = readFileSync(path.join(REPO, 'tests', 'fixtures', 'ccs', 'tournament-2026-10-29-unpublished.html'), 'utf8');
  const forbidden = readFileSync(path.join(REPO, 'tests', 'fixtures', 'ccs', 'tournament-403.html'), 'utf8');
  const MARKER = '<div class="not-published" >This tournament bracket will go live when published.</div>';
  const body = (extra: string) => `<html><body>${'x'.repeat(3000)}${extra}</body></html>`;

  it('recognises the live page and reads both divisions as not published', () => {
    expect(live.length).toBe(111_799);
    const read = readTournamentPage(live);
    expect(read.recognised).toBe(true);
    expect(read.divisions).toEqual([
      { name: 'Division 1', bracketId: CCS.tournament.division1BracketId, published: false },
      { name: 'Division 2', bracketId: CCS.tournament.division2BracketId, published: false },
    ]);
    expect(read.reason).toBe('Division 1 not published · Division 2 not published');
  });

  it('reads a division as published only when ITS block has lost the marker', () => {
    // The first marker on the page is Division 1's; String.replace with a string replaces the first occurrence.
    expect(live.split(MARKER).length - 1).toBe(2);
    const read = readTournamentPage(live.replace(MARKER, ''));
    expect(read.divisions.map((d) => [d.name, d.published])).toEqual([['Division 1', true], ['Division 2', false]]);
    expect(read.reason).toBe('Division 1 PUBLISHED · Division 2 not published');
  });

  it('is not fooled by the links list inside each block’s header (the first </ul> is not the block’s end)', () => {
    // Division 1's block holds `<ul class="links">…</ul>` ahead of its marker: cutting there would call it published.
    const start = live.indexOf(`<li id="bracket_${CCS.tournament.division1BracketId}"`);
    const firstUlClose = live.indexOf('</ul>', start);
    const marker = live.indexOf('not-published', start);
    expect(firstUlClose).toBeLessThan(marker);
    expect(readTournamentPage(live).divisions[0].published).toBe(false);
  });

  it('does not recognise MaxPreps’ 403 body, so the pipeline carries the previous state instead of flipping it', () => {
    expect(forbidden.length).toBe(6967);
    expect(forbidden).toMatch(/403 - Forbidden/);
    const read = readTournamentPage(forbidden);
    expect(read.recognised).toBe(false);
    expect(read.divisions).toEqual([]);
    expect(read.reason).toMatch(/no CCS bracket <li id="bracket_…"> block/);
  });

  it('does not recognise an empty or truncated body, with the byte count in the reason', () => {
    const read = readTournamentPage('');
    expect(read.recognised).toBe(false);
    expect(read.reason).toMatch(/0 bytes/);
  });

  it('does not recognise another tournament’s page (the 2026 San Diego Section shell: a bracket list, no CCS ids, no marker)', () => {
    const shell = body('<ul class="tournament-brackets" ><li id="bracket_494a605b-0000-4000-8000-000000000000" data-size="8" class="bracket-container"></li></ul>');
    const read = readTournamentPage(shell);
    expect(read.recognised).toBe(false);
    // The old absence test would have called this PUBLISHED.
    expect(/not-published/.test(shell)).toBe(false);
  });

  it('does not recognise the old single-marker page shape with no <li id> (what the previous probe matched)', () => {
    const old = body('<div class="Tournament-styles__notPublished not-published" >This tournament bracket will go live when published.</div>');
    expect(readTournamentPage(old).recognised).toBe(false);
  });

  it('reports a division whose block is missing as missing, and still recognises the page', () => {
    const d2 = live.indexOf(`<li id="bracket_${CCS.tournament.division2BracketId}"`);
    const withoutD2 = live.slice(0, d2) + live.slice(live.indexOf('</ul>', live.indexOf('</li>', d2)));
    const read = readTournamentPage(withoutD2);
    expect(read.recognised).toBe(true);
    expect(read.divisions.map((d) => d.name)).toEqual(['Division 1']);
    expect(read.reason).toBe('Division 1 not published · Division 2 block missing');
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
