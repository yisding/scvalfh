/**
 * PLAYOFF source: CIF Central Coast Section (SPEC §1.4, §5.9).
 *
 * Two cheap, optional, season-gated reads:
 *   1. `https://cifccs.org/calendar/Field_Hockey?print=ical` — 2 KB, five all-day VEVENTs, the
 *      authoritative dates. ⚠️ The live feed contains a TYPO: the semifinal SUMMARY reads
 *      "CCS Semfinals", not "CCS Semifinals". Matching the correct spelling finds nothing.
 *      Every SUMMARY is also prefixed "(Field Hockey) ".
 *   2. the MaxPreps CCS tournament page — `bracketPublished` flips when
 *      `<div class="not-published">` disappears.
 *
 * Deliberately NOT here: cifccs.org document paths (every one returns a 31 KB SPA shell, and the
 * real files sit behind CloudFront hashes that change on re-upload) and the PrestoSports bracket
 * pages (rendered client-side; no bracket content in the server HTML at all).
 */

import { PLAYOFF_KEY_DATES } from '../season';
import type { CcsCalendarEvent, CcsEventKind } from '../types';
import { HttpClient, type HttpClientOptions, icsLine, unfoldIcs } from './http';

export const CCS_ICAL_URL = 'https://cifccs.org/calendar/Field_Hockey?print=ical';
export const CCS_SPORT_HUB = 'https://cifccs.org/sports/fh/index';

/**
 * Both CCS reads are gated to the run-up to the playoffs: nothing changes before the league season
 * ends, and the bylaws-derived dates already render the section (SPEC §5.9). Oct 25 is two days
 * before the last league game and five before the Oct 30 crossover.
 */
export const CCS_POLL_FROM = '2026-10-25';

export function ccsPollingOpen(todayKey: string, from = CCS_POLL_FROM): boolean {
  return todayKey >= from;
}

// ---------------------------------------------------------------- ical

/** `20261107` → `2026-11-07`. */
function icsDateKey(value: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(value.trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/**
 * Classify a SUMMARY. The `sem[i]?finals` alternation is the whole point: the live feed says
 * "Semfinals" and a parser that insists on "Semifinals" silently drops the date.
 */
export function classifyCcsSummary(summary: string): CcsEventKind {
  const s = summary.toLowerCase();
  if (/entry|entries/.test(s)) return 'entries-due';
  if (/quarterfinal/.test(s)) return 'quarterfinals';
  if (/sem[i]?final/.test(s)) return 'semifinals';
  if (/\bfinals?\b/.test(s)) return 'finals';
  if (/evaluation/.test(s)) return 'evaluation';
  return 'other';
}

/**
 * Strip the feed's own prefixes so the text reads as a label. SUMMARY is
 * `(Field Hockey) CCS Finals…` and DESCRIPTION is `Field Hockey: (Field Hockey) CCS Finals…`.
 */
export function cleanCcsSummary(summary: string): string {
  return summary
    .replace(/^\s*field hockey:\s*/i, '')
    .replace(/^\s*\(field hockey\)\s*/i, '')
    .trim();
}

export function parseCcsIcal(text: string): CcsCalendarEvent[] {
  const lines = unfoldIcs(text);
  const events: CcsCalendarEvent[] = [];
  let inEvent = false;
  let current: { dateKey: string | null; summary: string; description: string; uid: string } | null = null;

  for (const raw of lines) {
    const upper = raw.trim().toUpperCase();
    if (upper === 'BEGIN:VEVENT') {
      inEvent = true;
      current = { dateKey: null, summary: '', description: '', uid: '' };
      continue;
    }
    if (upper === 'END:VEVENT') {
      if (current && current.dateKey && current.summary) {
        events.push({
          date: current.dateKey,
          summary: cleanCcsSummary(current.summary),
          kind: classifyCcsSummary(current.summary),
          uid: current.uid || null,
          detail: current.description ? cleanCcsSummary(current.description) : null,
        });
      }
      inEvent = false;
      current = null;
      continue;
    }
    if (!inEvent || !current) continue;
    const field = icsLine(raw);
    if (!field) continue;
    if (field.name === 'DTSTART') current.dateKey = icsDateKey(field.value);
    else if (field.name === 'SUMMARY') current.summary = field.value;
    else if (field.name === 'DESCRIPTION') current.description = field.value;
    else if (field.name === 'UID') current.uid = field.value;
  }
  return events.sort((a, b) => (a.date === b.date ? a.summary.localeCompare(b.summary) : a.date.localeCompare(b.date)));
}

export interface KeyDateCheck {
  /** true when every date we publish is corroborated by the calendar. */
  confirmed: boolean;
  /** One line per date that differs, ready for the run log and /about. */
  differences: string[];
  events: CcsCalendarEvent[];
}

/** Compare the calendar against `PLAYOFF_KEY_DATES` — confirmation only, never a rewrite. */
export function confirmKeyDates(
  events: readonly CcsCalendarEvent[],
  expected = PLAYOFF_KEY_DATES,
): KeyDateCheck {
  const byKind = new Map<CcsEventKind, string>();
  for (const e of events) if (!byKind.has(e.kind)) byKind.set(e.kind, e.date);

  const pairs: Array<[CcsEventKind, string, string]> = [
    ['entries-due', expected.entriesDue.slice(0, 10), 'entries due'],
    ['quarterfinals', expected.quarterfinals, 'quarterfinals'],
    ['semifinals', expected.semifinals, 'semifinals'],
    ['finals', expected.finals, 'finals'],
    ['evaluation', expected.evaluationMeeting.slice(0, 10), 'evaluation meeting'],
  ];

  const differences: string[] = [];
  for (const [kind, ours, label] of pairs) {
    const theirs = byKind.get(kind);
    if (!theirs) differences.push(`CCS calendar has no ${label} event`);
    else if (theirs !== ours) differences.push(`${label}: we publish ${ours}, CCS calendar says ${theirs}`);
  }
  return { confirmed: differences.length === 0, differences, events: [...events] };
}

// ---------------------------------------------------------------- bracket page

/**
 * `<div class="not-published">This tournament bracket will go live when published.</div>` is the
 * unpublished state. Its DISAPPEARANCE is the signal, so an empty or truncated body must NOT read
 * as published — hence the length guard.
 */
export function readBracketPublished(html: string): { published: boolean; reason: string } {
  if (html.length < 2000) {
    return { published: false, reason: `page body is only ${html.length} bytes — treated as unpublished` };
  }
  if (/not-published/.test(html)) {
    return { published: false, reason: 'page still carries class="not-published"' };
  }
  return { published: true, reason: 'the not-published marker is gone' };
}

// ---------------------------------------------------------------- client

export class CcsClient {
  private readonly http: HttpClient;

  constructor(opts: HttpClientOptions = {}) {
    this.http = new HttpClient(opts);
  }

  async getCalendar(): Promise<{ events: CcsCalendarEvent[]; url: string; httpStatus: number }> {
    const res = await this.http.text(CCS_ICAL_URL, 'text/calendar,text/plain,*/*');
    return { events: parseCcsIcal(res.body), url: CCS_ICAL_URL, httpStatus: res.httpStatus };
  }

  async getBracketState(
    url: string,
  ): Promise<{ published: boolean; reason: string; url: string; httpStatus: number }> {
    const res = await this.http.text(url);
    return { ...readBracketPublished(res.body), url, httpStatus: res.httpStatus };
  }
}
