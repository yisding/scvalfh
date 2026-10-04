/**
 * MaxPreps team ROSTER page — `https://www.maxpreps.com/<team path>/roster/` (SPEC §1.1j).
 *
 * There is no ghost-API roster endpoint (`team-roster/v1`, `roster/v1`, `team-roster/v2` all 404),
 * so the roster comes from the page's `__NEXT_DATA__`: `props.pageProps.athleteData` is an array of
 * 37-element POSITIONAL arrays — the same tuple encoding the schedule page uses (SPEC §1.1i), with
 * the same hazard: a column added upstream silently shifts every index after it, and a shifted
 * grade column would print the wrong year next to a player's name.
 *
 * The column names are MaxPreps' own. The page component (build 77480dfe, chunk 1x2mehrsrg-g8.js,
 * served from asset.maxpreps.io) does `deserializeArray(GSSP_ROSTER_SERIALIZE_KEYS, athleteData)`,
 * where the helper is `for (i…) obj[KEYS[i]] = row[i]` and KEYS is the literal list reproduced in
 * `ROSTER_KEYS` below (recovered 2026-10-02; see docs/DATA-SOURCES.md §1.1j). So this adapter is
 * pinned behind loud assertions, exactly as SPEC §1.1i prescribes for positional payloads: the row
 * length, the per-row school / season ids, and a row-by-row cross-check against the page's own
 * server-rendered `<table>` (`#`, `Player`, `Grade`, `Position`, `Height`) — the human-facing
 * rendering of the same rows. Any disagreement THROWS; nothing is ever written from a row this file
 * cannot prove it read correctly.
 *
 * Rows with `isDeleted === true` are dropped before anything else: the public table filters them
 * (`useRosterAthletes` → `.filter(a => !a.isDeleted)`) and `countData.athleteCount` excludes them.
 * One such row exists in the 2026-10-02 captures (Santa Clara, 17 rows / 16 shown).
 */

import { z } from 'zod';

import { htmlUnescape } from './http';
import { MaxPrepsError, NEXT_DATA_RE } from './maxpreps';
import { SPORT_SEASON_ID } from '../season';
import { GRADE_CLASSES, type RosterPlayer, type TeamRoster } from '../rosters-schema';
import type { Team } from '../types';

// ---------------------------------------------------------------- the positional map

/**
 * MaxPreps' `GSSP_ROSTER_SERIALIZE_KEYS`, verbatim and in order. Index i of an athleteData row is
 * the value of key i. The first 32 are the roster record's own fields; 32–36 are server-computed
 * display strings the table renders directly.
 */
export const ROSTER_KEYS = [
  'linkedAthlete', // 0
  'linkedParents', // 1
  'canStartChat', // 2
  'accountInformation', // 3
  'athleteId', // 4   per-SEASON athlete GUID (a player gets a new one each season)
  'firstName', // 5
  'lastName', // 6
  'classYear', // 7   grade: 9–12 (5–8 exist for middle school), null when blank
  'jersey', // 8   string: "00" and "21/88" occur
  'heightInches', // 9
  'heightFeet', // 10
  'weight', // 11
  'position1', // 12  F / M / D / G observed
  'position2', // 13
  'position3', // 14
  'hasStats', // 15
  'isCaptain', // 16  renders the Captain badge on the player's mugshot
  'isDeleted', // 17  soft-deleted: hidden from the public table, excluded from athleteCount
  'photoUrl', // 18
  'secondaryPhotoUrl', // 19
  'weightClass', // 20
  'isPlayerOfTheGame', // 21
  'isFemale', // 22  false even on girls' rosters — carries no meaning
  'bio', // 23
  'hasPhoto', // 24
  'rosterId', // 25  per-season roster-membership GUID
  'schoolId', // 26  == countData.teamId (MaxPreps keys a team by its school GUID)
  'sportSeasonId', // 27  == lib/season SPORT_SEASON_ID
  'sportSeasonName', // 28
  'careerProfileId', // 29  the STABLE person id; `?careerid=` in the URL is its short form
  'createdOn', // 30  when the roster row was created (naive local time) — not a modified stamp
  'canonicalUrl', // 31  absolute career URL
  'formattedPositions', // 32  position1..3 joined with ", " — exactly what the table prints
  'formattedName', // 33  `${firstName} ${lastName}`
  'formattedHeight', // 34  `5' 7"` (with a space) or ""
  'calculatedHeight', // 35  total inches, or null
  'formattedClassYear', // 36  "Fr." / "So." / "Jr." / "Sr." / ""
] as const;

export const ROSTER_ROW_LENGTH = ROSTER_KEYS.length; // 37

type RosterKey = (typeof ROSTER_KEYS)[number];

/** Named indices, derived from the key list so the two can never disagree. */
export const COL = Object.fromEntries(ROSTER_KEYS.map((k, i) => [k, i])) as Record<RosterKey, number>;

/** The table header the cross-check expects, in order. Anything else is a redesign: stop. */
export const ROSTER_TABLE_HEADERS = ['#', 'Player', 'Grade', 'Position', 'Height'] as const;

export type GradeClass = (typeof GRADE_CLASSES)[number];

/** `classYear` ↔ `formattedClassYear`, as rendered (from lib/rosters-schema.ts GRADE_CLASSES). A 2026-27 senior is grade 12. */
export const GRADE_LABELS: Readonly<Record<number, GradeClass>> = Object.fromEntries(
  GRADE_CLASSES.map((label, i) => [i + 9, label]),
);

// ---------------------------------------------------------------- types

export interface RosterPage {
  teamId: string;
  canonicalUrl: string | null;
  /** MaxPreps' own count, which excludes soft-deleted rows. */
  athleteCount: number;
  staffCount: number;
  /** Soft-deleted rows already removed. */
  players: RosterPlayer[];
  /** How many `isDeleted` rows were dropped. */
  deletedRows: number;
  warnings: string[];
}

/** One row of the server-rendered table, used only for the cross-check. */
export interface RosterTableRow {
  jersey: string | null;
  name: string;
  href: string | null;
  gradeClass: string | null;
  position: string | null;
  height: string | null;
}

// ---------------------------------------------------------------- schemas

const CountDataSchema = z.looseObject({
  teamId: z.string(),
  sportSeasonId: z.string().nullable().optional(),
  athleteCount: z.number().int(),
  staffCount: z.number().int(),
});

const RosterPagePropsSchema = z.looseObject({
  canonicalUrl: z.string().nullable().optional(),
  schoolId: z.string().nullable().optional(),
  countData: CountDataSchema,
  athleteData: z.array(z.array(z.unknown())),
});

const RosterNextDataSchema = z.looseObject({
  props: z.looseObject({ pageProps: RosterPagePropsSchema }),
});

// ---------------------------------------------------------------- helpers

export function rosterUrl(team: Team): string | null {
  const base = team.external.maxprepsTeamUrl;
  if (!base) return null;
  return `${base.replace(/\/+$/, '')}/roster/`;
}

/**
 * The entry for a team no run has covered yet: nothing fetched, so nothing claimed (status
 * 'pending', no players, no counts). Built by scripts/fetch-rosters.ts for a team its `--leagues`
 * scope leaves out when the previous file held no row for it.
 */
export function pendingRoster(team: Team): TeamRoster {
  return {
    slug: team.slug,
    teamId: team.id,
    maxprepsTeamId: null,
    name: team.name,
    division: team.division,
    rosterUrl: rosterUrl(team),
    status: 'pending',
    athleteCount: null,
    staffCount: null,
    players: [],
    deletedRows: 0,
    warnings: [],
    fetchedAt: null,
    error: null,
  };
}

/** `?careerid=6jijuu90hc0o8` → `6jijuu90hc0o8`. */
export function careerIdFromUrl(url: string | null): string | null {
  if (!url) return null;
  const m = /[?&]careerid=([^&#]+)/i.exec(url);
  return m ? m[1] : null;
}

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
const int = (v: unknown): number | null =>
  typeof v === 'number' && Number.isInteger(v) ? v : null;
const collapse = (s: string): string =>
  htmlUnescape(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
/** The table's own empty markers: "" for a blank jersey / position, "-" for an unknown grade / height. */
const cell = (s: string): string | null => {
  const v = collapse(s);
  return v === '' || v === '-' ? null : v;
};
const urlPath = (u: string): string => u.replace(/^https?:\/\/[^/]+/i, '');

// ---------------------------------------------------------------- the rendered table

/**
 * The page's server-rendered roster table. Selectors are structural only (`th`, `td`, and the
 * `name` anchor class) — never the styled-components hashes (SPEC §1.1i).
 *
 * Returns null when the page has no table at all, which is what an empty roster renders.
 */
export function parseRosterTable(html: string): RosterTableRow[] | null {
  const table = /<table[\s>][\s\S]*?<\/table>/.exec(html);
  if (!table) return null;
  const headers = [...table[0].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => collapse(m[1]));
  if (headers.join('|') !== ROSTER_TABLE_HEADERS.join('|')) {
    throw new MaxPrepsError(
      `roster table headers changed: [${headers.join(', ')}] — expected [${ROSTER_TABLE_HEADERS.join(', ')}]`,
      { url: 'roster-table' },
    );
  }
  const body = /<tbody[^>]*>([\s\S]*?)<\/tbody>/.exec(table[0]);
  const rows: RosterTableRow[] = [];
  for (const tr of (body ? body[1] : table[0]).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const tds = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
    if (tds.length === 0) continue; // the header row, when there is no <tbody>
    if (tds.length !== ROSTER_TABLE_HEADERS.length) {
      throw new MaxPrepsError(
        `roster table row has ${tds.length} cells, expected ${ROSTER_TABLE_HEADERS.length}`,
        { url: 'roster-table' },
      );
    }
    const anchor = /<a[^>]*class="[^"]*\bname\b[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/.exec(tds[1]);
    rows.push({
      jersey: cell(tds[0]),
      name: anchor ? collapse(anchor[2]) : collapse(tds[1]),
      href: anchor ? htmlUnescape(anchor[1]) : null,
      gradeClass: cell(tds[2]),
      position: cell(tds[3]),
      height: cell(tds[4]),
    });
  }
  return rows;
}

// ---------------------------------------------------------------- the page

export interface ParseRosterOptions {
  /** The registry team's MaxPreps GUID; the page's own ids must agree. */
  expectedTeamId?: string;
  /** For error messages. */
  url?: string;
}

/**
 * Decode one roster page. Throws `MaxPrepsError` on any sign of schema drift (row length, ids,
 * table header, or a table/array disagreement); returns warnings for the things that are merely
 * odd (a count that does not match, a duplicate id, a grade outside 9–12).
 */
export function parseRosterPage(html: string, opts: ParseRosterOptions = {}): RosterPage {
  const url = opts.url ?? 'roster-page';
  const fail = (message: string): never => {
    throw new MaxPrepsError(message, { url });
  };

  const m = NEXT_DATA_RE.exec(html);
  if (!m) fail('__NEXT_DATA__ script tag not found');
  let raw: unknown;
  try {
    raw = JSON.parse(m![1]) as unknown;
  } catch (err) {
    fail(`__NEXT_DATA__ is not JSON: ${(err as Error).message}`);
  }
  const parsed = RosterNextDataSchema.safeParse(raw);
  if (!parsed.success) fail(`roster pageProps changed shape: ${parsed.error.issues[0]?.message ?? 'unknown'}`);
  const pp = parsed.data!.props.pageProps;
  const { countData, athleteData } = pp;

  const teamId = countData.teamId;
  if (pp.schoolId && pp.schoolId !== teamId) fail(`schoolId ${pp.schoolId} ≠ countData.teamId ${teamId}`);
  if (opts.expectedTeamId && teamId !== opts.expectedTeamId) {
    // The Presentation URL once served Los Gatos (SPEC §2.1): a wrong team here is the same bug.
    fail(`page is for team ${teamId}, expected ${opts.expectedTeamId}`);
  }
  if (countData.sportSeasonId && countData.sportSeasonId !== SPORT_SEASON_ID) {
    fail(`page is for sportSeasonId ${countData.sportSeasonId}, expected ${SPORT_SEASON_ID}`);
  }

  const warnings: string[] = [];
  const players: RosterPlayer[] = [];
  let deletedRows = 0;
  athleteData.forEach((row, i) => {
    if (row.length !== ROSTER_ROW_LENGTH) {
      fail(`athleteData[${i}] has ${row.length} columns, expected ${ROSTER_ROW_LENGTH} — the positional schema drifted`);
    }
    if (row[COL.schoolId] !== teamId) fail(`athleteData[${i}].schoolId is not the page's teamId`);
    if (row[COL.sportSeasonId] !== SPORT_SEASON_ID) fail(`athleteData[${i}].sportSeasonId is not the current sportSeasonId`);
    if (typeof row[COL.isDeleted] !== 'boolean') fail(`athleteData[${i}].isDeleted is not a boolean`);
    if (row[COL.isDeleted] === true) {
      deletedRows += 1;
      return;
    }

    const firstName = str(row[COL.firstName]);
    const lastName = str(row[COL.lastName]);
    const fullName = str(row[COL.formattedName]) ?? [firstName, lastName].filter(Boolean).join(' ');
    if (!fullName) fail(`athleteData[${i}] has no name`);

    const gradeRaw = row[COL.classYear];
    let grade: number | null = null;
    if (typeof gradeRaw === 'number') {
      if (Number.isInteger(gradeRaw) && gradeRaw >= 9 && gradeRaw <= 12) grade = gradeRaw;
      else warnings.push(`${fullName}: classYear ${gradeRaw} is outside 9–12, stored as null`);
    } else if (gradeRaw !== null && gradeRaw !== undefined && gradeRaw !== '') {
      fail(`athleteData[${i}].classYear is not a number: ${JSON.stringify(gradeRaw)}`);
    }
    const label = str(row[COL.formattedClassYear]);
    if ((grade === null) !== (label === null) || (grade !== null && GRADE_LABELS[grade] !== label)) {
      fail(`${fullName}: classYear ${grade} and formattedClassYear "${label}" disagree`);
    }
    const gradeClass: GradeClass | null = grade === null ? null : GRADE_LABELS[grade];

    const positions = [row[COL.position1], row[COL.position2], row[COL.position3]]
      .map(str)
      .filter((p): p is string => p !== null);
    const position = positions.length ? positions.join(', ') : null;
    const formatted = str(row[COL.formattedPositions]);
    if (formatted !== position) fail(`${fullName}: positions ${JSON.stringify(positions)} but formattedPositions "${formatted}"`);

    const feet = int(row[COL.heightFeet]);
    const inches = int(row[COL.heightInches]);
    const height = feet === null ? null : `${feet}'${inches ?? 0}"`;
    const heightInches = feet === null ? null : feet * 12 + (inches ?? 0);
    const calculated = int(row[COL.calculatedHeight]);
    if (calculated !== null && calculated !== heightInches) {
      fail(`${fullName}: calculatedHeight ${calculated} but heightFeet/heightInches give ${heightInches}`);
    }

    if (typeof row[COL.isCaptain] !== 'boolean') fail(`${fullName}: isCaptain is not a boolean`);
    const careerUrl = str(row[COL.canonicalUrl]);
    players.push({
      athleteId: str(row[COL.athleteId]),
      rosterId: str(row[COL.rosterId]),
      careerProfileId: str(row[COL.careerProfileId]),
      careerId: careerIdFromUrl(careerUrl),
      firstName,
      lastName,
      fullName,
      jersey: str(row[COL.jersey]),
      grade,
      gradeClass,
      positions,
      position,
      height,
      heightInches,
      isCaptain: row[COL.isCaptain] as boolean,
      careerUrl,
      createdOn: str(row[COL.createdOn]),
    });
  });

  // ---- the cross-check: the table is what a reader sees; the array must say the same thing.
  // Matched by career link, not by position: the table sorts by jersey (blanks first), so its
  // order differs from athleteData's on some teams (Mitty, 2026-10-02).
  const table = parseRosterTable(html);
  if (table === null) {
    if (players.length > 0) fail(`${players.length} athleteData rows but no rendered roster table`);
  } else {
    if (table.length !== players.length) {
      fail(`rendered table has ${table.length} rows, athleteData has ${players.length} undeleted rows`);
    }
    const byHref = new Map<string, RosterTableRow>();
    const byName = new Map<string, RosterTableRow[]>();
    for (const t of table) {
      if (t.href) byHref.set(urlPath(t.href), t);
      byName.set(t.name, [...(byName.get(t.name) ?? []), t]);
    }
    const used = new Set<RosterTableRow>();
    for (const p of players) {
      let t = p.careerUrl ? byHref.get(urlPath(p.careerUrl)) : undefined;
      if (!t) t = (byName.get(p.fullName) ?? []).find((row) => !used.has(row));
      if (!t) fail(`${p.fullName} (${p.careerUrl ?? 'no link'}) is in athleteData but not in the rendered table`);
      if (used.has(t!)) fail(`${p.fullName}: two athleteData rows map to one table row`);
      used.add(t!);
      const mismatch = (what: string, a: string | null, b: string | null) =>
        fail(`${p.fullName}: ${what} is "${a}" in athleteData but "${b}" in the rendered table`);
      if (t!.name !== p.fullName) mismatch('name', p.fullName, t!.name);
      if (t!.jersey !== p.jersey) mismatch('jersey', p.jersey, t!.jersey);
      if (t!.gradeClass !== p.gradeClass) mismatch('grade', p.gradeClass, t!.gradeClass);
      if (t!.position !== p.position) mismatch('position', p.position, t!.position);
      if (t!.height !== p.height) mismatch('height', p.height, t!.height);
    }
  }

  if (deletedRows > 0) warnings.push(`dropped ${deletedRows} soft-deleted row${deletedRows === 1 ? '' : 's'} (isDeleted)`);
  if (countData.athleteCount !== players.length) {
    warnings.push(`MaxPreps counts ${countData.athleteCount} athletes but publishes ${players.length} rows`);
  }
  const seen = new Map<string, string>();
  for (const p of players) {
    const key = p.careerProfileId ?? p.careerId ?? p.athleteId;
    if (!key) continue;
    const prior = seen.get(key);
    if (prior) warnings.push(`duplicate career id ${key}: "${prior}" and "${p.fullName}"`);
    else seen.set(key, p.fullName);
  }

  return {
    teamId,
    canonicalUrl: pp.canonicalUrl ?? null,
    athleteCount: countData.athleteCount,
    staffCount: countData.staffCount,
    players,
    deletedRows,
    warnings,
  };
}
