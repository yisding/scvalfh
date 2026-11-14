/**
 * WHO is on a MaxPreps season stat sheet, not what they did: the same rollup
 * lib/sources/maxpreps-player-stats.ts reads (`team-season-player-stats/rollup/v1?teamId=&sportSeasonId=`),
 * read for a PAST season, where it is the one list of that season's players this repository can
 * still reach (scripts/fetch-prior-players.ts; the roster page of a past season was never captured).
 *
 * Every table of every group carries a `Name` column whose cell holds the short name ("S. Lewis"),
 * the player's career link (`…/athletes/storey-lewis/?careerid=…`) and the class as a caption
 * ("(Jr)"), and most carry `Jersey`. That is all this reads, from every group whatever the sport
 * calls it, so it needs no stat column list and is not tied to this build's sport.
 *
 * What it cannot give: the season's full roster (a player the coach entered no line for is not on
 * the sheet), a position, a height, or the full name as the roster spelled it. The full name is
 * rebuilt from the career link's own words and the sheet's last name (`nameFromCareerUrl`), which
 * loses an apostrophe or a capital inside a first name; the registry prefers any other source's
 * spelling (lib/players/registry-build.ts). A link whose name segment is not plain words gives no
 * name at all, and the row keeps the sheet's short one.
 *
 * Loud on drift like its neighbours: a table with no Name column, a row whose cells do not line up
 * with its columns, or one career listed under two classes or two short names throws.
 */

import { z } from 'zod';

import { MaxPrepsError } from './maxpreps';
import { careerIdFromUrl } from './maxpreps-roster';
import { recaseName } from './person-name';

const CellSchema = z.looseObject({
  value: z.string().nullable(),
  href: z.string().nullable().optional(),
  caption: z.string().nullable().optional(),
});

const ResponseSchema = z.looseObject({
  status: z.union([z.number(), z.string()]).optional(),
  message: z.unknown().optional(),
  data: z
    .looseObject({
      teamId: z.string(),
      sportSeasonId: z.string(),
      groups: z.array(
        z.looseObject({
          name: z.string(),
          subgroups: z.array(
            z.looseObject({
              name: z.string(),
              stats: z.looseObject({
                columns: z.array(z.looseObject({ name: z.string() })),
                rows: z.array(z.looseObject({ columns: z.array(CellSchema) })),
              }),
            }),
          ),
        }),
      ),
    })
    .nullable(),
});

export interface StatSheetName {
  /** The `?careerid=` key of the Name cell's link; null when the cell links nothing. */
  careerId: string | null;
  careerUrl: string | null;
  /** As the sheet prints it, recased: "S. Lewis". */
  shortName: string;
  /** The full name rebuilt from the career link, or the short name when there is no link. */
  name: string;
  /** 'career-url' when `name` was rebuilt from the link, 'short-name' when it is only the sheet's own. */
  nameFrom: 'career-url' | 'short-name';
  jersey: string | null;
  /** 9–12 from the caption ("(Fr)" … "(Sr)"); null when the sheet gives none. */
  grade: number | null;
}

const CLASS_GRADE: Readonly<Record<string, number>> = { fr: 9, so: 10, jr: 11, sr: 12 };

/** "(Jr)" → 11; "" or null → null. Anything else is drift. */
export function gradeFromCaption(caption: string | null | undefined, url: string): number | null {
  const c = (caption ?? '').trim();
  if (c === '') return null;
  const m = /^\((Fr|So|Jr|Sr)\.?\)$/i.exec(c);
  if (!m) throw new MaxPrepsError(`stat sheet names: class caption "${c}" is not (Fr) / (So) / (Jr) / (Sr)`, { url });
  return CLASS_GRADE[m[1].toLowerCase()];
}

const slugify = (s: string): string =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’.]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** The segment with its percent-escapes read ("sof%C3%ADa" → "sofía"); as it is when they do not decode. */
function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

const capitalizeWords = (words: readonly string[]): string =>
  words.map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');

/**
 * A full name from the career link and the sheet's short name. The link's athlete segment is the
 * name in lowercase with hyphens for everything else ("olivia-van-de-braak"); the short name is an
 * initial and the last name as the roster cased it ("O. Van De Braak"). Where the segment ends in
 * the last name's own words, the words before it are the first name and the last name keeps the
 * sheet's casing; otherwise every word of the segment is capitalized. Null when there is no link
 * to read.
 */
export function nameFromCareerUrl(careerUrl: string | null, shortName: string): string | null {
  const segment = careerUrl ? /\/athletes\/([^/?#]+)\//.exec(careerUrl)?.[1] : undefined;
  if (!segment) return null;
  // MaxPreps builds the segment from the name; one holding anything but letters and hyphens was built
  // from a name with a mangled character ("soland039%3be" for "Solan&#039;e") and cannot be read back.
  if (!/^\p{L}+(-\p{L}+)*$/u.test(decodeSegment(segment))) return null;
  const words = decodeSegment(segment).toLowerCase().split('-').filter(Boolean);
  if (words.length === 0) return null;
  const last = /^\p{L}\.\s+(.+)$/u.exec(shortName)?.[1] ?? null;
  if (last) {
    const lastWords = slugify(last).split('-').filter(Boolean);
    const n = lastWords.length;
    if (n > 0 && n < words.length && words.slice(-n).join('-') === lastWords.join('-')) {
      return recaseName(`${capitalizeWords(words.slice(0, -n))} ${last}`);
    }
  }
  return recaseName(capitalizeWords(words));
}

export interface ParseStatSheetNamesOptions {
  expectedTeamId?: string;
  expectedSeasonId: string;
  url?: string;
}

const NO_DATA = /^no data was found for this request\.?$/i;

/**
 * The rollup response → one entry per player on the sheet, in the sheet's order, or null when
 * MaxPreps has no stats for the team that season (its 400 "No data was found" envelope). A player in
 * several tables is one entry; a row with no career link is keyed by its short name and number.
 */
export function parseStatSheetNames(raw: unknown, opts: ParseStatSheetNamesOptions): StatSheetName[] | null {
  const url = opts.url ?? '(player stats)';
  const fail = (what: string): never => {
    throw new MaxPrepsError(`stat sheet names: ${what}`, { url });
  };
  const parsed = ResponseSchema.safeParse(raw);
  if (!parsed.success) {
    return fail(`schema drift: ${parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')}`);
  }
  const { data } = parsed.data;
  const status = String(parsed.data.status);
  if (data === null || status === '400') {
    const message = typeof parsed.data.message === 'string' ? parsed.data.message.trim() : '';
    if (status === '400' && data === null && NO_DATA.test(message)) return null;
    return fail(`no data and status ${status}: ${message || '(no message)'}`);
  }
  if (data.sportSeasonId !== opts.expectedSeasonId) {
    fail(`sportSeasonId ${data.sportSeasonId}, expected ${opts.expectedSeasonId}`);
  }
  if (opts.expectedTeamId && data.teamId !== opts.expectedTeamId) {
    fail(`teamId ${data.teamId}, expected ${opts.expectedTeamId}`);
  }

  const byKey = new Map<string, StatSheetName>();
  for (const group of data.groups) {
    for (const sub of group.subgroups) {
      const where = `${group.name}${sub.name ? ` / ${sub.name}` : ''}`;
      const cols = sub.stats.columns;
      const nameAt = cols.findIndex((c) => c.name === 'Name');
      const jerseyAt = cols.findIndex((c) => c.name === 'Jersey');
      if (nameAt < 0) fail(`${where}: no Name column`);
      for (const row of sub.stats.rows) {
        if (row.columns.length !== cols.length) {
          fail(`${where}: a row has ${row.columns.length} cells for ${cols.length} columns`);
        }
        const cell = row.columns[nameAt];
        const shortName = recaseName(cell.value?.trim() ?? '');
        if (!shortName) fail(`${where}: a row has no player name`);
        const careerUrl = cell.href?.trim() || null;
        const careerId = careerIdFromUrl(careerUrl);
        const rawJersey = jerseyAt >= 0 ? row.columns[jerseyAt].value?.trim() || null : null;
        const jersey = rawJersey === '-' ? null : rawJersey;
        const grade = gradeFromCaption(cell.caption, url);
        const key = careerId ?? `${shortName}|${jersey ?? ''}`;
        const seen = byKey.get(key);
        if (!seen) {
          const rebuilt = nameFromCareerUrl(careerUrl, shortName);
          byKey.set(key, {
            careerId,
            careerUrl,
            shortName,
            name: rebuilt ?? shortName,
            nameFrom: rebuilt ? 'career-url' : 'short-name',
            jersey,
            grade,
          });
          continue;
        }
        // The same person in another table: the tables must agree on who she is. A number or a class
        // one table leaves blank is filled from the one that gives it.
        if (seen.shortName !== shortName) fail(`${where}: career ${key} is "${seen.shortName}" in one table and "${shortName}" in another`);
        if (seen.grade !== null && grade !== null && seen.grade !== grade) {
          fail(`${where}: ${shortName} is grade ${seen.grade} in one table and ${grade} in another`);
        }
        seen.grade ??= grade;
        seen.jersey ??= jersey;
      }
    }
  }
  return [...byKey.values()];
}
