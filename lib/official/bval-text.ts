/**
 * BVAL schedule docx TEXT → bundle fixtures (SPEC §7.8). Used ONLY by
 * `scripts/build-official-fixtures.ts --bval-text <A> <B>` and by tests/bval-text.test.ts, which
 * proves that the two division texts (tests/fixtures/official/bval-sched-{A,B}.txt) reproduce the
 * fixtures of data/official/bval-2026.json exactly. The cron never parses a docx: it reads the
 * bundle and only hashes the upstream document to notice a revision.
 *
 * The text shape: a header (league, `2026 - 2027`, `<DIVISION> DIVISION`, the team list, chair,
 * game times, the `BVAL MEETINGS` lines — which contain `@` and are NOT games), then date headings
 * (`Thursday, September 17th`) each followed by `Away @ Home [time override]` lines, the
 * `CCS Play-in Game` / `4th Place MH @ ST Champion 11am` pair (an event, never a fixture), other
 * dated notes (`Entries Due`), and the footer revision date (`9/20/26`).
 */

import { getDivision } from '../leagues';
import { resolveOfficialName } from '../teams';
import type { DivisionId, TeamSlug } from '../types';
import { officialFixtureId, type BundleEvent, type BundleFixture } from './schema';

/** The default varsity start ("GAME TIMES: VARSITY – 5:00pm"). */
export const BVAL_DEFAULT_VARSITY = '17:00';

/**
 * EXACTLY the five override forms the 2026 documents use, with the VARSITY start each yields.
 * Anything else throws: a new form must be read by a person and added here.
 */
export const BVAL_TIME_OVERRIDES: Readonly<Record<string, string>> = {
  '4pm': '16:00',
  '6:30pm': '18:30',
  'V 4p/JV 515p': '16:00',
  'JV 4p/V 515p': '17:15',
  'JV 5p/ V 615p': '18:15',
};

export interface BvalTextFixture extends BundleFixture {
  /** The verbatim trailing override text, or null for the default time. */
  timeOverride: string | null;
}

export interface BvalScheduleText {
  division: DivisionId;
  /** The footer revision date as printed ("9/20/26"), or null. */
  revisedOn: string | null;
  /** Document order. */
  fixtures: BvalTextFixture[];
  events: BundleEvent[];
}

const WEEKDAY = '(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)';
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DATE_HEADING_RE = new RegExp(`^${WEEKDAY},\\s+(${MONTHS.join('|')})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*$`);
const SEASON_RE = /^(\d{4})\s*-\s*(\d{4})\s*$/;
const MEETINGS_RE = /^(?:BVAL MEETINGS\b|Pre-Season\b|Post-Season\b)/i;
const PLAY_IN_RE = /^CCS Play-in Game\s*$/i;
const REVISION_RE = /^(\d{1,2}\/\d{1,2}\/\d{2})$/;
const CLOCK_RE = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*$/i;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** "11am" → "11:00", "6:30pm" → "18:30" (the trailing clock of an event line). */
function clockOf(text: string): string | null {
  const m = CLOCK_RE.exec(text);
  if (!m) return null;
  let hour = Number(m[1]) % 12;
  if (m[3].toLowerCase() === 'pm') hour += 12;
  return `${pad2(hour)}:${m[2] ?? '00'}`;
}

/** The division's own heading line: `MT. HAMILTON DIVISION`, `SANTA TERESA DIVISION`. */
function divisionHeadingRe(division: DivisionId): RegExp {
  const label = getDivision(division).label.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`^${label}\\s+DIVISION\\s*$`, 'i');
}

/**
 * Split `rest` (the text after `@`) into the home team and the override: the LONGEST word prefix
 * that resolves to a team of the league is the home side; whatever follows is the override.
 */
function splitHome(rest: string, leagueId: string): { slug: TeamSlug; name: string; override: string | null } | null {
  const words = [...rest.matchAll(/\S+/g)].map((m) => ({ text: m[0], end: (m.index ?? 0) + m[0].length }));
  for (let k = words.length; k >= 1; k -= 1) {
    const name = words.slice(0, k).map((w) => w.text).join(' ');
    const team = resolveOfficialName(leagueId, name);
    if (team) {
      // The override is read from the ORIGINAL text so its internal spacing stays verbatim
      // ('JV 5p/ V 615p' has a space after the slash).
      const override = rest.slice(words[k - 1].end).trim();
      return { slug: team.slug, name, override: override === '' ? null : override };
    }
  }
  return null;
}

/**
 * Parse one division's schedule text. Throws on: no season line, no matching division heading,
 * a game line before any date heading, a side that resolves to no team of the league, or an
 * override that is not one of the five known forms.
 */
export function parseBvalScheduleText(text: string, division: DivisionId): BvalScheduleText {
  const config = getDivision(division);
  const leagueId = config.leagueId;
  const lines = text.replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/\t/g, ' ').trim());

  const season = lines.map((l) => SEASON_RE.exec(l)).find((m) => m !== null);
  if (!season) throw new Error(`bval-text ${division}: no "YYYY - YYYY" season line`);
  const startYear = Number(season[1]);
  const endYear = Number(season[2]);
  if (!lines.some((l) => divisionHeadingRe(division).test(l))) {
    throw new Error(`bval-text ${division}: no "${config.label.toUpperCase()} DIVISION" heading — is this the right document?`);
  }

  const fixtures: BvalTextFixture[] = [];
  const events: BundleEvent[] = [];
  let date: string | null = null;
  let playInPending = false;
  let revisedOn: string | null = null;

  for (const line of lines) {
    if (line === '') continue;
    if (MEETINGS_RE.test(line)) continue;

    const heading = DATE_HEADING_RE.exec(line);
    if (heading) {
      const month = MONTHS.indexOf(heading[1]) + 1;
      // A season runs late summer → spring: Aug-Dec belong to the first year, Jan-Jul to the second.
      const year = month >= 8 ? startYear : endYear;
      date = `${year}-${pad2(month)}-${pad2(Number(heading[2]))}`;
      playInPending = false;
      continue;
    }

    const revision = REVISION_RE.exec(line);
    if (revision) {
      revisedOn = revision[1];
      continue;
    }

    if (date === null) continue; // the header block (team list, chair, game times, …)

    if (PLAY_IN_RE.test(line)) {
      playInPending = true;
      continue;
    }

    if (playInPending) {
      events.push({ kind: 'play-in', date, time: clockOf(line), verbatim: `CCS Play-in Game / ${line}` });
      playInPending = false;
      continue;
    }

    const at = line.indexOf('@');
    if (at < 0) continue; // a dated note: "Entries Due", "CCS Playoffs Begin"

    const awayName = line.slice(0, at).trim();
    const away = resolveOfficialName(leagueId, awayName);
    if (!away) throw new Error(`bval-text ${division} ${date}: "${awayName}" resolves to no ${leagueId} team (line "${line}")`);
    const home = splitHome(line.slice(at + 1), leagueId);
    if (!home) throw new Error(`bval-text ${division} ${date}: no ${leagueId} home team in "${line}"`);
    let time = BVAL_DEFAULT_VARSITY;
    if (home.override !== null) {
      const t = BVAL_TIME_OVERRIDES[home.override];
      if (t === undefined) {
        throw new Error(`bval-text ${division} ${date}: unknown time override "${home.override}" in "${line}"`);
      }
      time = t;
    }
    fixtures.push({
      id: officialFixtureId(division, date, { slug: away.slug, name: awayName }, { slug: home.slug, name: home.name }),
      division,
      date,
      originalDate: null,
      time,
      away: away.slug,
      home: home.slug,
      awayName,
      homeName: home.name,
      timeOverride: home.override,
    });
  }

  if (playInPending) throw new Error(`bval-text ${division}: "CCS Play-in Game" with no matchup line after it`);
  return { division, revisedOn, fixtures, events };
}
