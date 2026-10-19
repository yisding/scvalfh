/**
 * CCS calendar → our published playoff dates (SPEC §1.4, §5.9): whether the season-gated CCS reads
 * run yet, and the calendar's dates compared with the bylaws-derived `CCS.keyDates`
 * (confirmation only, never a rewrite). lib/sources/ccs.ts parses the feed.
 */

import { CCS } from '@/lib/config/leagues';
import type { CcsCalendarEvent, CcsEventKind } from '@/lib/model/postseason';
import { CCS_POLL_FROM } from '@/lib/sources/ccs';

/** True from `CCS_POLL_FROM` (config `CCS.pollFrom`) on: before it, neither CCS read runs. */
export function ccsPollingOpen(todayKey: string, from = CCS_POLL_FROM): boolean {
  return todayKey >= from;
}

export interface KeyDateCheck {
  /** true when every date we publish is corroborated by the calendar. */
  confirmed: boolean;
  /** One line per date that differs, ready for the run log and /about. */
  differences: string[];
  events: CcsCalendarEvent[];
}

/** Compare the calendar against `CCS.keyDates` — confirmation only, never a rewrite. */
export function confirmKeyDates(
  events: readonly CcsCalendarEvent[],
  expected = CCS.keyDates,
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
