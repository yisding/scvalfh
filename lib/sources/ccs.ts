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
 * Gating the reads (`ccsPollingOpen`) and checking the calendar against config (`confirmKeyDates`)
 * is lib/pipeline/merge/ccs.ts.
 *
 * Deliberately NOT here: cifccs.org document paths (every one returns a 31 KB SPA shell, and the
 * real files sit behind CloudFront hashes that change on re-upload) and the PrestoSports bracket
 * pages (rendered client-side; no bracket content in the server HTML at all).
 */

import { CCS } from '@/lib/config/leagues';
import type { CcsCalendarEvent, CcsEventKind } from '@/lib/model/postseason';

import { icsLine, unfoldIcs } from './ics';

export const CCS_ICAL_URL = 'https://cifccs.org/calendar/Field_Hockey?print=ical';

/**
 * Both CCS reads are gated to the run-up to the playoffs: nothing changes before the league season
 * ends, and the bylaws-derived dates already render the section (SPEC §5.9). The date lives in
 * `CCS.pollFrom` (lib/config/leagues.ts): it opens before the last league games (BVAL Oct 30), the BVAL
 * play-in (Oct 31) and CCS entries (Nov 2).
 */
export const CCS_POLL_FROM: string = CCS.pollFrom;

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
      // The label is checked AFTER cleaning: a SUMMARY of only "(Field Hockey)" cleans to '' and is no event.
      const label = current ? cleanCcsSummary(current.summary) : '';
      if (current && current.dateKey && label) {
        events.push({
          date: current.dateKey,
          summary: label,
          kind: classifyCcsSummary(current.summary),
          uid: current.uid || null,
          detail: cleanCcsSummary(current.description) || null,
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
