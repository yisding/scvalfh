/**
 * PLAYOFF source: CIF Central Coast Section (SPEC §1.4, §5.9).
 *
 * Two cheap, optional, season-gated reads:
 *   1. `https://cifccs.org/calendar/Field_Hockey?print=ical` — 2 KB, five all-day VEVENTs, the
 *      authoritative dates. ⚠️ The live feed contains a TYPO: the semifinal SUMMARY reads
 *      "CCS Semfinals", not "CCS Semifinals". Matching the correct spelling finds nothing.
 *      Every SUMMARY is also prefixed "(Field Hockey) ".
 *   2. the MaxPreps CCS tournament page (CCS.bracketUrl) — one `<li id="bracket_<GUID>">` block per CCS
 *      division (CCS.tournament.division1BracketId / division2BracketId), each carrying
 *      `<div class="not-published">` until that division's bracket is published (`readTournamentPage`).
 *
 * Deliberately NOT here: cifccs.org document paths (every one returns a 31 KB SPA shell, and the
 * real files sit behind CloudFront hashes that change on re-upload) and the PrestoSports bracket
 * pages (rendered client-side; no bracket content in the server HTML at all).
 */

import { CCS } from '../league-config/sections';
import { SOURCE_LINKS } from '../season';
import { SPORT } from '../sports/current';
import type { CcsCalendarEvent, CcsEventKind } from '../types';
import { icsLine, unfoldIcs } from './http';

export const CCS_ICAL_URL = SOURCE_LINKS.ccsCalendar;

/**
 * Both CCS reads are gated to the run-up to the playoffs: nothing changes before the league season
 * ends, and the bylaws-derived dates already render the section (SPEC §5.9). The date lives in
 * `CCS.pollFrom` (lib/league-config/sections.ts): it opens before the last league games (BVAL Oct 30), the BVAL
 * play-in (Oct 31) and CCS entries (Nov 2).
 */
export const CCS_POLL_FROM: string = CCS.pollFrom;

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
  // Basketball's feed: 'CCS Seeding Meeting', 'D1-D5 1st Round & Open Game #1', 'D1-D5 2nd Round'. The Open
  // Division's own games ('Open Game #2') are no round of the bracket's and stay 'other'.
  if (/seeding/.test(s)) return 'seeding';
  if (/\b(1st|first) round\b/.test(s)) return 'first-round';
  if (/\b(2nd|second) round\b/.test(s)) return 'second-round';
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
const CALENDAR_NAME = SPORT.ccs.calendar.replace(/_/g, ' ').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** This build's sport's prefixes ('Basketball: ', '(Basketball) '), the feed's own calendar name. */
const OWN_PREFIX = new RegExp(`^\\s*${CALENDAR_NAME}:\\s*`, 'i');
const OWN_TAG = new RegExp(`^\\s*\\(${CALENDAR_NAME}\\)\\s*`, 'i');

export function cleanCcsSummary(summary: string): string {
  return summary
    .replace(/^\s*field hockey:\s*/i, '')
    .replace(/^\s*\(field hockey\)\s*/i, '')
    .replace(OWN_PREFIX, '')
    .replace(OWN_TAG, '')
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

export interface KeyDateCheck {
  /** true when every date we publish, and the site of every round, is corroborated by the calendar. */
  confirmed: boolean;
  /** One line per date or site that differs, ready for the run log and /about. */
  differences: string[];
  events: CcsCalendarEvent[];
}

const ROUND_KINDS = ['quarterfinals', 'semifinals', 'finals'] as const;

/**
 * Where the calendar says a round is played, from its SUMMARY ('… at Home Sites' / '… at Neutral Site(s)'); null
 * when the words say neither.
 */
export function calendarSiteOf(summary: string): 'home' | 'neutral' | null {
  if (/\bhome sites?\b/i.test(summary)) return 'home';
  if (/\bneutral sites?\b/i.test(summary)) return 'neutral';
  return null;
}

/** Where config says a round is played: the higher seed's field through `highSeedHostsThrough`, neutral after. */
export function configSiteOf(round: (typeof ROUND_KINDS)[number], hostsThrough = CCS.highSeedHostsThrough): 'home' | 'neutral' | null {
  // null: the config does not say who hosts (soccer: the CCS bylaws are unread).
  if (hostsThrough === null) return null;
  return ROUND_KINDS.indexOf(round) <= ROUND_KINDS.indexOf(hostsThrough) ? 'home' : 'neutral';
}

/**
 * Compare the calendar against `CCS.keyDates` and `CCS.highSeedHostsThrough` — confirmation only, never a rewrite.
 * A round whose calendar words name a site the config does not (the 2026 feed says 'Semfinals at Neutral Sites')
 * is a difference too, so a copy line about who hosts is never left contradicting the feed the page cites.
 */
export function confirmKeyDates(
  events: readonly CcsCalendarEvent[],
  expected = CCS.keyDates,
  hostsThrough = CCS.highSeedHostsThrough,
): KeyDateCheck {
  const byKind = new Map<CcsEventKind, string>();
  const summaryByKind = new Map<CcsEventKind, string>();
  for (const e of events) {
    if (!byKind.has(e.kind)) byKind.set(e.kind, e.date);
    if (!summaryByKind.has(e.kind)) summaryByKind.set(e.kind, e.summary);
  }

  const pairs: Array<[CcsEventKind, string, string]> = [
    ['entries-due', expected.entriesDue.slice(0, 10), 'entries due'],
    ['quarterfinals', expected.quarterfinals, 'quarterfinals'],
    ['semifinals', expected.semifinals, 'semifinals'],
    ['finals', expected.finals, 'finals'],
    ['evaluation', expected.evaluationMeeting.slice(0, 10), 'evaluation meeting'],
  ];

  // The rounds before the quarterfinals, where config has them (basketball).
  if (expected.firstRound) pairs.splice(1, 0, ['first-round', expected.firstRound, 'first round']);
  if (expected.secondRound) pairs.splice(2, 0, ['second-round', expected.secondRound, 'second round']);

  const differences: string[] = [];
  for (const [kind, ours, label] of pairs) {
    // A feed that lists the seeding meeting and no entries event (basketball) confirms the entries day when
    // config puts both on one day.
    const theirs =
      byKind.get(kind) ??
      (kind === 'entries-due' && expected.seedingMeeting.slice(0, 10) === ours ? byKind.get('seeding') : undefined);
    if (!theirs) differences.push(`CCS calendar has no ${label} event`);
    else if (theirs !== ours) differences.push(`${label}: we publish ${ours}, CCS calendar says ${theirs}`);
  }
  for (const round of ROUND_KINDS) {
    const summary = summaryByKind.get(round);
    const theirs = summary ? calendarSiteOf(summary) : null;
    const ours = configSiteOf(round, hostsThrough);
    if (ours !== null && theirs !== null && theirs !== ours) {
      differences.push(`${round}: we say ${ours === 'home' ? 'the higher seed hosts' : 'a neutral site'}, CCS calendar says "${summary}"`);
    }
  }
  return { confirmed: differences.length === 0, differences, events: [...events] };
}

// ---------------------------------------------------------------- bracket page

export interface TournamentPageRead {
  /** true when the page carried at least one of the configured CCS bracket blocks; false = NOT READ, carry the previous state. */
  recognised: boolean;
  /** One entry per CCS division whose `<li id="bracket_<GUID>">` block the page carried, in config order. */
  divisions: Array<{ name: string; bracketId: string; published: boolean }>;
  /** One line for the run log. */
  reason: string;
}

/**
 * The published state of each CCS division's bracket on the MaxPreps tournament page, read POSITIVELY
 * (replaces `readBracketPublished`, 2026-10-29).
 *
 * The live page (captured 2026-10-29 21:41Z, tests/fixtures/ccs/tournament-2026-10-29-unpublished.html) is
 * `<ul class="tournament-brackets">` holding one `<li id="bracket_<GUID>" …>` per division, each with
 * `<h2 class="bracket-name">Division N</h2>` and, while unpublished, `<div class="not-published">This tournament
 * bracket will go live when published.</div>`. The `<li id>` is what MaxPreps' own widget script keys on
 * (asset.maxpreps.io tournament_renderer…js reads `.bracket-container[data-id]`), the most stable hook there is.
 *
 * A division is published when its block carries no `not-published` substring. The block runs from its `<li id>`
 * to the next bracket `<li id>` or to the `</ul>` that CLOSES THE LIST: the header inside each block holds its
 * own `<ul class="links">…</ul>` ("Add to My Site") ahead of the marker, so cutting at the first `</ul>` would
 * have called Division 1 published on the unpublished page.
 *
 * Why positive: the old rule ("published when the marker is gone") read a 403 body, an interstitial, a redesign
 * or the wrong tournament (MaxPreps' 2026 San Diego Section shell has no CCS block and no marker) as PUBLISHED.
 * Here a body under 2000 bytes, or one with none of the configured bracket ids, is `recognised: false`, and the
 * pipeline (lib/pipeline/steps/secondary.ts) treats the bracket part as not read and carries the previous
 * snapshot's state.
 */
export function readTournamentPage(html: string, tournament = CCS.tournament): TournamentPageRead {
  if (html.length < 2000) {
    return { recognised: false, divisions: [], reason: `page body is only ${html.length} bytes — not recognised` };
  }
  const configured: Array<[string, string]> = tournament === null ? [] : [
    ['Division 1', tournament.division1BracketId],
    ['Division 2', tournament.division2BracketId],
    ...(tournament.otherBrackets ?? []).map((b): [string, string] => [b.name, b.id]),
  ];
  const divisions: TournamentPageRead['divisions'] = [];
  for (const [name, bracketId] of configured) {
    const start = html.indexOf(`<li id="bracket_${bracketId}"`);
    if (start < 0) continue;
    const block = html.slice(start, bracketBlockEnd(html, start));
    divisions.push({ name, bracketId, published: !/not-published/.test(block) });
  }
  if (divisions.length === 0) {
    return { recognised: false, divisions, reason: 'no CCS bracket <li id="bracket_…"> block on the page — not recognised' };
  }
  const missing = configured.filter(([name]) => !divisions.some((d) => d.name === name)).map(([name]) => name);
  const words = divisions.map((d) => `${d.name} ${d.published ? 'PUBLISHED' : 'not published'}`);
  if (missing.length) words.push(`${missing.join(', ')} block missing`);
  return { recognised: true, divisions, reason: words.join(' · ') };
}

/**
 * Where the bracket block that starts at `start` ends: the next `<li id="bracket_` or the `</ul>` that closes
 * the enclosing list, counting the `<ul>`s opened inside the block (the header's links list) so an inner
 * `</ul>` does not end it. The end of the document when neither is found.
 */
function bracketBlockEnd(html: string, start: number): number {
  const re = /<ul\b|<\/ul>|<li id="bracket_/g;
  re.lastIndex = start + 1;
  let depth = 0;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    if (m[0] === '<li id="bracket_') return m.index;
    if (m[0] === '</ul>') {
      if (depth === 0) return m.index;
      depth -= 1;
    } else {
      depth += 1;
    }
  }
  return html.length;
}
