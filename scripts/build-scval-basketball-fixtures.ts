/**
 * Writes data/basketball/official/scval-2026.json, the SCVAL boys basketball official fixtures, from the text
 * of the league's two 2026-27 schedule PDFs (tests/fixtures/official/source/scval-basketball-boys-*.txt:
 * `pdftotext -layout` of each document, byte for byte).
 *
 *   SCVAL_SPORT=basketball pnpm build-scval-basketball-fixtures            write the file
 *   SCVAL_SPORT=basketball pnpm build-scval-basketball-fixtures --check    exit 1 if the file differs
 *
 * Each document is a grid of three date columns. A column head names the day ("WEDNESDAY, JANUARY 6"), the
 * lines under it name that day's games ("HOMESTEAD @ LOS GATOS"), and a `B` or `G` after a column's games
 * marks a quad day (boys and girls, JV and varsity, at one site), where the letter says whose JV team plays
 * the 3:00 game: the schedule's own legend reads "Boys JV 3:00" and "Girls JV 3:00" beside its starting
 * times, and the By-Laws alternate the two week by week (Article IV §5.1.2).
 *
 * Times, from each document's "Starting Times" line and the By-Laws (Article IV §5.1): a night game is JV
 * 5:30 and varsity 7:00; on a quad day the boys varsity plays at 7:45 and the boys JV at 3:00 (`B`) or 4:30
 * (`G`). The last round is split over two days: the "MONDAY, FEBRUARY 15 (GJV 5:30 / BJV 7:00)" column is the
 * JV round of the "TUESDAY, FEBRUARY 16 (GV 5:30 / BV 7:00)" games, so it adds no varsity fixture and gives
 * those fixtures their JV date and time.
 *
 * One date is corrected: both documents head a column "FRIDAY, FEBRUARY 7", and February 7, 2027 is a Sunday,
 * a day the By-Laws allow no game (Article III §1.3). The column sits between Wednesday Feb 3 and Wednesday
 * Feb 10 and its `G` marks a quad Friday, so it is Friday, February 5 (`originalDate` keeps nothing: the
 * document never published another date; DATE_CORRECTIONS says what was read).
 *
 * Deterministic and offline. Every division is checked with assertDoubleRoundRobin before anything is written.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { getDivision } from '../lib/leagues';
import {
  OFFICIAL_BUNDLE_SCHEMA,
  bundleToFixtures,
  compareBundleFixtures,
  hasOfficialDocument,
  officialFixtureId,
  parseOfficialBundle,
  serializeBundle,
  type BundleFixture,
  type OfficialBundle,
} from '../lib/official/schema';
import { assertDoubleRoundRobin } from '../lib/official/validate';
import { IS_BASKETBALL } from '../lib/sports/current';
import { resolveOfficialName } from '../lib/teams';
import type { DivisionId } from '../lib/types';
import { runCliIfMain } from './cli';

const REPO = path.resolve(import.meta.dirname, '..');
const SOURCE_DIR = path.join(REPO, 'tests', 'fixtures', 'official', 'source');
const OUT = path.join(REPO, 'data', 'basketball', 'official', 'scval-2026.json');

/** The day the two documents were read and transcribed. */
export const TRANSCRIBED_ON = '2026-11-10';

export const SOURCES: ReadonlyArray<{ division: DivisionId; file: string; sha256: string }> = [
  {
    division: 'de-anza',
    file: 'scval-basketball-boys-de-anza-2026.txt',
    // sha256 of the PDF itself (lib/league-config/basketball/scval.ts bundledSha256), not of this text.
    sha256: 'b539c6d11939afd4df505e704fbbcdf1d7162c492d78204d5497f40caefcbb17',
  },
  {
    division: 'el-camino',
    file: 'scval-basketball-boys-el-camino-2026.txt',
    sha256: 'c30648939f1c56fd3d39b40a8cb1e8b39f402c4129d113cb35a980419943e7fc',
  },
];

const YEAR = 2027;
const MONTHS: Readonly<Record<string, number>> = { JANUARY: 1, FEBRUARY: 2 };
const WEEKDAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

/** A printed date whose weekday is not that date's: what the column is read as, and why (the header comment). */
export const DATE_CORRECTIONS: Readonly<Record<string, string>> = {
  'FRIDAY, FEBRUARY 7': '2027-02-05',
};

const NIGHT = { varsity: '19:00', jv: '17:30' } as const;
const QUAD_VARSITY = '19:45';
const QUAD_JV = { B: '15:00', G: '16:30' } as const;
/** The JV round of the last varsity day: the column whose head gives JV times only. */
const JV_ROUND_HEAD = /\(GJV [\d:]+ \/ BJV ([\d:]+)\)/;

const HEAD_RE = /(SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY), (JANUARY|FEBRUARY) +(\d{1,2})(?: \(([^)]*)\))?/g;
const NAME = '[A-Z][A-Z.]*(?: [A-Z][A-Z.]*)*';
const GAME_RE = new RegExp(`(${NAME})\\s+@\\s+(${NAME})(?:\\s{2,}([BG])(?![A-Z.]))?`, 'g');

interface Column {
  head: string;
  dateKey: string;
  /** The JV start the head gives when the column is a JV-only round ('19:00'), else null. */
  jvRoundTime: string | null;
  games: Array<{ away: string; home: string }>;
  quad: 'B' | 'G' | null;
}

const pad = (n: number) => String(n).padStart(2, '0');

function to24h(clock: string): string {
  const [h, m] = clock.split(':').map(Number);
  // Every time on these schedules is an afternoon or evening start.
  return `${pad(h < 12 ? h + 12 : h)}:${pad(m)}`;
}

/** The grid's columns in reading order, each with its games. Throws on anything the grid's shape does not explain. */
export function parseGrid(text: string): Column[] {
  const columns: Column[] = [];
  let block: Column[] = [];
  for (const line of text.split('\n')) {
    const heads = [...line.matchAll(HEAD_RE)];
    if (heads.length > 0) {
      block = heads.map((m) => {
        const head = `${m[1]}, ${m[2]} ${m[3]}`;
        const printed = `${YEAR}-${pad(MONTHS[m[2]])}-${pad(Number(m[3]))}`;
        const dateKey = DATE_CORRECTIONS[head] ?? printed;
        const weekday = WEEKDAYS[new Date(`${dateKey}T12:00:00Z`).getUTCDay()];
        if (weekday !== m[1]) throw new Error(`"${head}": ${dateKey} is a ${weekday}; add it to DATE_CORRECTIONS with its evidence`);
        const jv = m[4] ? JV_ROUND_HEAD.exec(`(${m[4]})`) : null;
        return { head, dateKey, jvRoundTime: jv ? to24h(jv[1]) : null, games: [], quad: null };
      });
      columns.push(...block);
      continue;
    }
    const games = [...line.matchAll(GAME_RE)];
    if (games.length === 0) continue;
    if (games.length !== block.length) {
      throw new Error(`a line has ${games.length} games under ${block.length} column heads: "${line.trim()}"`);
    }
    games.forEach((m, i) => {
      block[i].games.push({ away: m[1], home: m[2] });
      if (m[3] === 'B' || m[3] === 'G') {
        if (block[i].quad !== null && block[i].quad !== m[3]) throw new Error(`"${block[i].head}" is marked both B and G`);
        block[i].quad = m[3];
      }
    });
  }
  // The quad letter is printed once per line, after the line's last quad column: every game of a quad column
  // carries it, so a column with one unmarked game is a misread.
  return columns;
}

/** The division's fixtures: every varsity column's games, each with its JV game. */
export function fixturesOf(division: DivisionId, text: string): BundleFixture[] {
  const columns = parseGrid(text);
  const jvRounds = columns.filter((c) => c.jvRoundTime !== null);
  const varsity = columns.filter((c) => c.jvRoundTime === null);
  const pairKey = (g: { away: string; home: string }) => `${g.away}@${g.home}`;
  const out: BundleFixture[] = [];
  for (const column of varsity) {
    // A JV-only column is the JV round of the varsity column that lists the same games.
    const jvRound = jvRounds.find(
      (r) => r.games.length === column.games.length && r.games.every((g) => column.games.some((v) => pairKey(v) === pairKey(g))),
    );
    for (const g of column.games) {
      const away = resolveOfficialName('scval', g.away);
      const home = resolveOfficialName('scval', g.home);
      if (!away || !home) throw new Error(`${division} ${column.head}: cannot resolve "${g.away}" @ "${g.home}"`);
      out.push({
        id: officialFixtureId(division, column.dateKey, { slug: away.slug, name: away.name }, { slug: home.slug, name: home.name }),
        division,
        date: column.dateKey,
        originalDate: null,
        time: column.quad ? QUAD_VARSITY : NIGHT.varsity,
        away: g.away,
        home: g.home,
        awayName: away.name,
        homeName: home.name,
        jv: jvRound
          ? { date: jvRound.dateKey, time: jvRound.jvRoundTime }
          : { date: column.dateKey, time: column.quad ? QUAD_JV[column.quad] : NIGHT.jv },
      });
    }
  }
  const unused = jvRounds.filter((r) => !varsity.some((c) => r.games.every((g) => c.games.some((v) => pairKey(v) === pairKey(g)))));
  if (unused.length > 0) throw new Error(`${division}: JV round ${unused.map((r) => r.head).join(', ')} matches no varsity column`);
  return out;
}

export function buildBundle(readSource: (file: string) => string = (f) => readFileSync(path.join(SOURCE_DIR, f), 'utf8')): OfficialBundle {
  const fixtures: BundleFixture[] = [];
  const documents: OfficialBundle['documents'] = [];
  for (const src of SOURCES) {
    const config = getDivision(src.division);
    if (!hasOfficialDocument(config)) throw new Error(`${src.division} has no official document`);
    const text = readSource(src.file);
    const marker = /Revised\s+[^\n]*\n\s*(\d{1,2}\/\d{1,2}\/\d{4})/.exec(text)?.[1] ?? null;
    documents.push({
      division: src.division,
      url: config.official.scheduleUrl,
      sha256: src.sha256,
      revisionMarker: marker === null ? null : `Revised ${marker}`,
    });
    fixtures.push(...fixturesOf(src.division, text));
  }
  const bundle: OfficialBundle = {
    schema: OFFICIAL_BUNDLE_SCHEMA,
    league: 'scval',
    source: 'scval-pdf',
    transcribedOn: TRANSCRIBED_ON,
    documents,
    fixtures: fixtures.sort(compareBundleFixtures),
    events: [],
  };
  const parsed = parseOfficialBundle(bundle, 'scval');
  const rows = bundleToFixtures(parsed);
  for (const src of SOURCES) assertDoubleRoundRobin(rows.filter((f) => f.division === src.division), src.division);
  return parsed;
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  if (!IS_BASKETBALL) {
    console.error('build-scval-basketball-fixtures: run with SCVAL_SPORT=basketball (the registry and league config are the build\'s sport\'s)');
    return 1;
  }
  const text = serializeBundle(buildBundle());
  const sha = createHash('sha256').update(text).digest('hex').slice(0, 12);
  if (argv.includes('--check')) {
    const current = (() => {
      try {
        return readFileSync(OUT, 'utf8');
      } catch {
        return null;
      }
    })();
    if (current !== text) {
      console.error(`${path.relative(REPO, OUT)} differs from the transcription (${sha}); run pnpm build-scval-basketball-fixtures`);
      return 1;
    }
    console.log(`${path.relative(REPO, OUT)} is up to date (${sha})`);
    return 0;
  }
  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, text);
  console.log(`wrote ${path.relative(REPO, OUT)} (${sha})`);
  return 0;
}

runCliIfMain(import.meta.url, main);
