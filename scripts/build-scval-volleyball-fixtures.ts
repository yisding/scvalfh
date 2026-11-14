/**
 * Writes data/volleyball/official/scval-2026.json, the SCVAL girls volleyball official fixtures, from the text
 * of the league's two 2026-27 schedule PDFs (tests/fixtures/official/source/scval-volleyball-girls-*.txt:
 * `pdftotext -layout` of each document, byte for byte).
 *
 *   SCVAL_SPORT=volleyball pnpm build-scval-volleyball-fixtures            write the file
 *   SCVAL_SPORT=volleyball pnpm build-scval-volleyball-fixtures --check    exit 1 if the file differs
 *
 * Each document is a grid of three date columns. A column head names the day ("THURSDAY SEPTEMBER 10", no
 * comma), and the lines under it name that day's matches ("MONTA VISTA @ MILPITAS"). De Anza has seven teams,
 * so each of its columns opens with the team that sits out ("BYE - CUPERTINO"), which is no match and is
 * checked instead: the team on a bye plays nobody that day.
 *
 * Times, from each document's "Starting Times" line and the By-Laws (Article IV §3.1.1): JV at 5:30 pm and
 * varsity at 6:45 pm, the JV match the same day at the same site (Article III §3.4: a double round robin at
 * both levels).
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
import { IS_VOLLEYBALL } from '../lib/sports/current';
import { resolveOfficialName } from '../lib/teams';
import type { DivisionId } from '../lib/types';
import { runCliIfMain } from './cli';

const REPO = path.resolve(import.meta.dirname, '..');
const SOURCE_DIR = path.join(REPO, 'tests', 'fixtures', 'official', 'source');
const OUT = path.join(REPO, 'data', 'volleyball', 'official', 'scval-2026.json');

/** The day the two documents were read and transcribed. */
export const TRANSCRIBED_ON = '2026-11-14';

export const SOURCES: ReadonlyArray<{ division: DivisionId; file: string; sha256: string }> = [
  {
    division: 'de-anza',
    file: 'scval-volleyball-girls-de-anza-2026.txt',
    // sha256 of the PDF itself (lib/league-config/volleyball/scval.ts bundledSha256), not of this text.
    sha256: '89c48a6f9a6cbc3b326fd9d38bffe948a0084113ac5acfa4e84c4da4922f15b8',
  },
  {
    division: 'el-camino',
    file: 'scval-volleyball-girls-el-camino-2026.txt',
    sha256: '2e552d95a3e029ac4100bdf171c0108593421a94763105cb4274ca4342df4148',
  },
];

const YEAR = 2026;
const MONTHS: Readonly<Record<string, number>> = { SEPTEMBER: 9, OCTOBER: 10 };
const WEEKDAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

/** "Starting Times 5:30 pm (JV) 6:45 pm (V)". */
const TIMES = { varsity: '18:45', jv: '17:30' } as const;

const HEAD_RE = /(SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY) +(SEPTEMBER|OCTOBER) +(\d{1,2})/g;
const NAME = '[A-Z][A-Z.]*(?: [A-Z][A-Z.]*)*';
/** One cell of a grid line: a match, or the team on a bye. */
const CELL_RE = new RegExp(`(?:(BYE)\\s+-\\s+(${NAME}))|(?:(${NAME})\\s+@\\s+(${NAME}))`, 'g');

interface Column {
  head: string;
  dateKey: string;
  bye: string | null;
  games: Array<{ away: string; home: string }>;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** The grid's columns in reading order, each with its matches. Throws on anything the grid's shape does not explain. */
export function parseGrid(text: string): Column[] {
  const columns: Column[] = [];
  let block: Column[] = [];
  for (const line of text.split('\n')) {
    const heads = [...line.matchAll(HEAD_RE)];
    if (heads.length > 0) {
      block = heads.map((m) => {
        const head = `${m[1]} ${m[2]} ${m[3]}`;
        const dateKey = `${YEAR}-${pad(MONTHS[m[2]])}-${pad(Number(m[3]))}`;
        const weekday = WEEKDAYS[new Date(`${dateKey}T12:00:00Z`).getUTCDay()];
        if (weekday !== m[1]) throw new Error(`"${head}": ${dateKey} is a ${weekday}`);
        return { head, dateKey, bye: null, games: [] };
      });
      columns.push(...block);
      continue;
    }
    if (block.length === 0) continue; // the header's "Teams:" line and title, before the first column heads
    const cells = [...line.matchAll(CELL_RE)];
    if (cells.length === 0) continue;
    if (cells.length !== block.length) {
      throw new Error(`a line has ${cells.length} cells under ${block.length} column heads: "${line.trim()}"`);
    }
    cells.forEach((m, i) => {
      if (m[1] === 'BYE') {
        if (block[i].bye !== null) throw new Error(`"${block[i].head}" names two teams on a bye`);
        block[i].bye = m[2];
      } else {
        block[i].games.push({ away: m[3], home: m[4] });
      }
    });
  }
  return columns;
}

/** The division's fixtures: every column's matches, each with its JV match. */
export function fixturesOf(division: DivisionId, text: string): BundleFixture[] {
  const out: BundleFixture[] = [];
  for (const column of parseGrid(text)) {
    for (const g of column.games) {
      if (column.bye !== null && (g.away === column.bye || g.home === column.bye)) {
        throw new Error(`${division} ${column.head}: ${column.bye} is on a bye and plays ${g.away} @ ${g.home}`);
      }
      const away = resolveOfficialName('scval', g.away);
      const home = resolveOfficialName('scval', g.home);
      if (!away || !home) throw new Error(`${division} ${column.head}: cannot resolve "${g.away}" @ "${g.home}"`);
      out.push({
        id: officialFixtureId(division, column.dateKey, { slug: away.slug, name: away.name }, { slug: home.slug, name: home.name }),
        division,
        date: column.dateKey,
        originalDate: null,
        time: TIMES.varsity,
        away: g.away,
        home: g.home,
        awayName: away.name,
        homeName: home.name,
        jv: { date: column.dateKey, time: TIMES.jv },
      });
    }
  }
  return out;
}

export function buildBundle(readSource: (file: string) => string = (f) => readFileSync(path.join(SOURCE_DIR, f), 'utf8')): OfficialBundle {
  const fixtures: BundleFixture[] = [];
  const documents: OfficialBundle['documents'] = [];
  for (const src of SOURCES) {
    const config = getDivision(src.division);
    if (!hasOfficialDocument(config)) throw new Error(`${src.division} has no official document`);
    if (config.official.bundledSha256 !== src.sha256) throw new Error(`${src.division}: bundledSha256 is not the document's`);
    documents.push({ division: src.division, url: config.official.scheduleUrl, sha256: src.sha256, revisionMarker: null });
    fixtures.push(...fixturesOf(src.division, readSource(src.file)));
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
  if (!IS_VOLLEYBALL) {
    console.error('build-scval-volleyball-fixtures: run with SCVAL_SPORT=volleyball (the registry and league config are the build\'s sport\'s)');
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
      console.error(`${path.relative(REPO, OUT)} differs from the transcription (${sha}); run pnpm build-scval-volleyball-fixtures`);
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
