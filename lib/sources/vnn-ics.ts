/**
 * SCHEDULE-DETAIL source: VNN / PlayOn "Mascot Media Bolt" whole-school `.ics` feeds (SPEC §1.5).
 *
 * Two schools only — Palo Alto 2635290 and Los Gatos 2634860 — because those are the two siteIds
 * that are verified. Los Altos's newer PlayOn build exposes no ICS at all, and the other 13 schools'
 * ids were never discovered. This feed carries **no scores**: venue and exact start time only.
 *
 * Extraction facts:
 *   - the `/0/` (whole-school) path is the only usable form; team-scoped paths return an empty
 *     VCALENDAR.
 *   - RFC 5545 line UNFOLDING is required before parsing — some LOCATION/URL lines are folded.
 *   - 🚨 the SUMMARY text uses **`JV`**, not `Junior Varsity`. The original regex matched 11 of 19
 *     Paly events and silently dropped 42 % of the data. The corrected regex below is verified
 *     19/19.
 *   - `DTSTART`/`DTEND` are UTC Zulu: `DTSTART:20260929T230000Z` is Sep 29, 4:00 PM PDT.
 *   - opponent-name formatting differs per school: Paly writes "Santa Clara High School",
 *     Los Gatos writes bare "Santa Clara". Both go through the registry alias table.
 *
 * Applying the events to MaxPreps' games, and the per-school carry-forward, is
 * lib/pipeline/merge/vnn.ts.
 */

import type { TeamSlug } from '@/lib/model/ids';
import { resolveTeam } from '@/lib/registry/resolve';
import { localDateKey, toLocalTimestamp } from '@/lib/shared/dates';
import { icsLine, unfoldIcs } from './ics';

/** [V] the only two verified siteIds (SPEC §1.5). */
export const VNN_SITE_IDS: ReadonlyArray<{ slug: TeamSlug; siteId: string; school: string }> = [
  { slug: 'palo-alto', siteId: '2635290', school: 'Palo Alto High School' },
  { slug: 'los-gatos', siteId: '2634860', school: 'Los Gatos High School' },
];

export function vnnIcsUrl(siteId: string): string {
  return `https://mmboltapi.azurewebsites.net/api/v2/events/calendar/${siteId}/0/calendar.ics`;
}

/** Group 2 = Varsity | JV · group 3 = vs (home) | at (away) · group 4 = opponent. Verified 19/19. */
export const VNN_SUMMARY_RE = /^(Girls (Varsity|JV) Field Hockey) (vs|at) (.+)$/;

export interface VnnEvent {
  uid: string | null;
  /** The school whose calendar this is. */
  schoolSlug: TeamSlug;
  level: 'Varsity' | 'JV';
  /** From `vs` / `at`, i.e. relative to the calendar's own school. */
  site: 'home' | 'away';
  opponentName: string;
  opponentSlug: TeamSlug | null;
  /** ISO UTC, from the Zulu DTSTART. */
  startUtc: string;
  /** Naive America/Los_Angeles timestamp for that instant. */
  startLocal: string;
  dateKey: string;
  /** LOCATION — a real venue here, unlike MaxPreps' `contest.location` note field. */
  venue: string | null;
}

/** `20260929T230000Z` → `2026-09-29T23:00:00.000Z`. Returns null for a date-only DTSTART. */
export function icsInstant(value: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value.trim());
  if (!m) return null;
  return new Date(
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6])),
  ).toISOString();
}

export function parseVnnIcs(text: string, schoolSlug: TeamSlug): VnnEvent[] {
  const lines = unfoldIcs(text);
  const out: VnnEvent[] = [];
  let inEvent = false;
  let fields: { uid: string; dtstart: string; summary: string; location: string } | null = null;

  for (const raw of lines) {
    const upper = raw.trim().toUpperCase();
    if (upper === 'BEGIN:VEVENT') {
      inEvent = true;
      fields = { uid: '', dtstart: '', summary: '', location: '' };
      continue;
    }
    if (upper === 'END:VEVENT') {
      if (fields) {
        // The regex is applied to the PARSED SUMMARY VALUE, never to a raw `SUMMARY:` line.
        const m = VNN_SUMMARY_RE.exec(fields.summary.trim());
        const startUtc = icsInstant(fields.dtstart);
        if (m && startUtc) {
          const opponentName = m[4].trim();
          const opponent = resolveTeam(opponentName);
          out.push({
            uid: fields.uid || null,
            schoolSlug,
            level: m[2] === 'JV' ? 'JV' : 'Varsity',
            site: m[3] === 'vs' ? 'home' : 'away',
            opponentName,
            opponentSlug: opponent?.slug ?? null,
            startUtc,
            startLocal: toLocalTimestamp(startUtc),
            dateKey: localDateKey(startUtc),
            venue: fields.location.trim() || null,
          });
        }
      }
      inEvent = false;
      fields = null;
      continue;
    }
    if (!inEvent || !fields) continue;
    const field = icsLine(raw);
    if (!field) continue;
    if (field.name === 'DTSTART') fields.dtstart = field.value;
    else if (field.name === 'SUMMARY') fields.summary = field.value;
    else if (field.name === 'LOCATION') fields.location = field.value;
    else if (field.name === 'UID') fields.uid = field.value;
  }

  return out.sort((a, b) => (a.startUtc === b.startUtc ? a.level.localeCompare(b.level) : a.startUtc.localeCompare(b.startUtc)));
}
