/**
 * `assertDoubleRoundRobin` (SPEC §7.8): the structural proof that a division's official fixture
 * list is the league's double round robin. Used by the build script before it writes a bundle, by
 * tests/official-files.test.ts, and by the cron at load (a failure there degrades the file's
 * divisions to contest-type classification; it never aborts the run).
 */

import { createHash } from 'node:crypto';

import { getDivision } from '../leagues';
import { teamsInDivision } from '../teams';
import type { DivisionId, OfficialFixture } from '../types';

export class OfficialValidationError extends Error {
  constructor(
    public readonly division: DivisionId,
    public readonly problems: readonly string[],
  ) {
    super(`official fixtures for ${division} are not a double round robin: ${problems.join('; ')}`);
    this.name = 'OfficialValidationError';
  }
}

/**
 * Every rule, every problem reported at once:
 *  - every fixture is of `division` and both slugs are registry members of it;
 *  - every ordered pair (a@b) appears exactly once, so the list has n·(n−1) fixtures;
 *  - each team plays `gamesPerTeam`;
 *  - no team plays twice on one date;
 *  - every (official, post-change) date is within the division's `leaguePlay`.
 * Throws OfficialValidationError; returns nothing.
 */
export function assertDoubleRoundRobin(fixtures: readonly OfficialFixture[], division: DivisionId): void {
  const config = getDivision(division);
  const members = teamsInDivision(division).map((t) => t.slug);
  const memberSet = new Set(members);
  const n = members.length;
  const problems: string[] = [];

  const ordered = new Map<string, number>();
  const games = new Map<string, number>();
  const busy = new Map<string, number>();

  for (const f of fixtures) {
    if (f.division !== division) {
      problems.push(`${f.id}: division ${f.division}`);
      continue;
    }
    if (f.awaySlug === null || !memberSet.has(f.awaySlug)) {
      problems.push(`${f.id}: away "${f.awaySlug ?? f.awayName}" is not a member of ${division}`);
    }
    if (f.homeSlug === null || !memberSet.has(f.homeSlug)) {
      problems.push(`${f.id}: home "${f.homeSlug ?? f.homeName}" is not a member of ${division}`);
    }
    if (f.awaySlug !== null && f.awaySlug === f.homeSlug) problems.push(`${f.id}: a team plays itself`);
    if (f.dateKey < config.leaguePlay.first || f.dateKey > config.leaguePlay.last) {
      problems.push(`${f.id}: ${f.dateKey} is outside league play ${config.leaguePlay.first}…${config.leaguePlay.last}`);
    }
    const key = `${f.awaySlug ?? f.awayName}@${f.homeSlug ?? f.homeName}`;
    ordered.set(key, (ordered.get(key) ?? 0) + 1);
    for (const side of [f.awaySlug ?? f.awayName, f.homeSlug ?? f.homeName]) {
      games.set(side, (games.get(side) ?? 0) + 1);
      const day = `${side}|${f.dateKey}`;
      busy.set(day, (busy.get(day) ?? 0) + 1);
    }
  }

  const expected = n * (n - 1);
  if (fixtures.length !== expected) problems.push(`${fixtures.length} fixtures, expected ${expected} (${n} teams)`);
  for (const a of members) {
    for (const b of members) {
      if (a === b) continue;
      const count = ordered.get(`${a}@${b}`) ?? 0;
      if (count !== 1) problems.push(`${a}@${b} appears ${count} times`);
    }
  }
  for (const slug of members) {
    const played = games.get(slug) ?? 0;
    if (played !== config.gamesPerTeam) problems.push(`${slug} plays ${played}, expected ${config.gamesPerTeam}`);
  }
  for (const [day, count] of busy) {
    if (count > 1) {
      const [side, date] = day.split('|');
      problems.push(`${side} plays ${count} times on ${date}`);
    }
  }

  if (problems.length > 0) throw new OfficialValidationError(division, problems);
}

// ---------------------------------------------------------------- revision checks (SPEC §2.1, §7.3)

/** Lowercase hex sha256 of a document's bytes (or of a UTF-8 string) — the revision-check body. */
export function sha256Hex(input: string | Uint8Array): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * The `officialChanges` cell (SPEC §2.1): the text of the first `<td>` containing `cellMarker`, with
 * tags turned into spaces, `&nbsp;`/`&amp;` decoded, whitespace collapsed and trimmed. null when no
 * cell holds the marker. LiveTransport hashes this for the `official-changes` resource.
 */
export function officialChangesCellText(html: string, cellMarker: string): string | null {
  for (const m of html.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)) {
    if (!m[1].includes(cellMarker)) continue;
    return m[1]
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/\s+/g, ' ')
      .trim();
  }
  return null;
}

/** sha256 of the `officialChanges` cell, or null when the page has no such cell. */
export function officialChangesHash(html: string, cellMarker: string): string | null {
  const text = officialChangesCellText(html, cellMarker);
  return text === null ? null : sha256Hex(text);
}
