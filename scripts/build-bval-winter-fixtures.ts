/**
 * Writes data/<sport>/official/bval-2026.json, the BVAL official fixtures of the build's winter sport (boys
 * basketball or girls soccer), from the text of the league's 2026-27 division schedules
 * (tests/fixtures/official/source/bval-<sport>-<gender>-<division>-2026.txt: `pandoc -t plain --wrap=none` of
 * each Google Doc's .docx download, byte for byte).
 *
 *   SCVAL_SPORT=basketball pnpm build-bval-winter-fixtures            write the file
 *   SCVAL_SPORT=soccer pnpm build-bval-winter-fixtures --check        exit 1 if the file differs
 *
 * Each document is the field hockey one's shape (lib/official/bval-text.ts): a header (league, season, sport,
 * `<DIVISION> DIVISION`, the team list, chair, game times, the `BVAL MEETINGS` lines, which contain `@` and are
 * not games), then date headings (`Wednesday, January 6th`) each followed by `Away @ Home [time note]` lines,
 * dated notes (`CCS Sportsmanship Game ONLY`, `CCS Seeding Meeting`), and the footer's revision date (`10/12/26`).
 *
 * Times. A game with no note is played at the document's GAME TIMES (basketball JV 5:30 and varsity 7:00, soccer
 * JV 5:00 and varsity 7:00). A note gives the day's two starts, JV first unless it labels them ("4p/615p",
 * "6/730": JV 4:00 and varsity 6:15, JV 6:00 and varsity 7:30; "V 5p/JV 7p", "JV 4p/V 6p"), or a varsity start
 * alone ("V 6pm", "V 430p", "4p VAR"), which only a game against a team the header marks "(NO JV)" has (soccer's
 * Gunderson): that game has no JV game, nor has any other game of that team. A note this reads no other way
 * throws, so a new form is read by a person first.
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
import { IS_BASKETBALL, SPORT_ID } from '../lib/sports/current';
import { resolveOfficialName } from '../lib/teams';
import type { DivisionId } from '../lib/types';
import { runCliIfMain } from './cli';

const REPO = path.resolve(import.meta.dirname, '..');
const SOURCE_DIR = path.join(REPO, 'tests', 'fixtures', 'official', 'source');

/** The day the documents were read and transcribed. */
export const TRANSCRIBED_ON = '2026-11-13';

export interface WinterSource {
  division: DivisionId;
  file: string;
  /** sha256 of the .docx itself (the division's `bundledSha256`), not of this text. */
  sha256: string;
}

interface WinterSport {
  out: string;
  /** The document's GAME TIMES line, 24h. */
  defaults: { varsity: string; jv: string };
  sources: readonly WinterSource[];
}

export const WINTER: Readonly<Record<'basketball' | 'soccer', WinterSport>> = {
  basketball: {
    out: 'data/basketball/official/bval-2026.json',
    // "GAME TIMES: JV @ 5:30pm / Varsity @ 7:00pm"
    defaults: { varsity: '19:00', jv: '17:30' },
    sources: [
      { division: 'mt-hamilton', file: 'bval-basketball-boys-mt-hamilton-2026.txt', sha256: '6c24b33883200a28ac55acdd0a758ec0ee0eed07d0db80e8b18f918683629b26' },
      { division: 'santa-teresa', file: 'bval-basketball-boys-santa-teresa-2026.txt', sha256: '9c9afaa021a3fea7002d09fe73a3cd5cd1f62e2dae038ee92cd73011e2260506' },
      { division: 'almaden-valley', file: 'bval-basketball-boys-almaden-valley-2026.txt', sha256: '16c96915204856d9f27705ca50b3486dd29528e749e0f22c190ffb83004131df' },
      { division: 'west-valley', file: 'bval-basketball-boys-west-valley-2026.txt', sha256: 'abaf8f4619b0191c93def7bc32499e7c3dcd692c74a61b78e853360686bb84c9' },
    ],
  },
  soccer: {
    out: 'data/soccer/official/bval-2026.json',
    // "GAME TIMES: JV – 5:00pm; VARSITY – 7:00pm (unless stated below)"
    defaults: { varsity: '19:00', jv: '17:00' },
    sources: [
      { division: 'mt-hamilton', file: 'bval-soccer-girls-mt-hamilton-2026.txt', sha256: '5c662a352b2893905f27884e7a763dc0adca93888b5332e3391ca8502932414f' },
      { division: 'santa-teresa', file: 'bval-soccer-girls-santa-teresa-2026.txt', sha256: '270d47692b8eb72215c8a327fa66d8f23c684c79c0aec83cc69fcf4e4971b9ca' },
      { division: 'west-valley', file: 'bval-soccer-girls-west-valley-2026.txt', sha256: '4f0c1c3fd4ef2a4117e680d1e9d0eef7de69db4ef6adb6dae5709a9244ea0849' },
    ],
  },
};

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DATE_HEADING_RE = new RegExp(`^(${WEEKDAYS.join('|')}),\\s+(${MONTHS.join('|')})\\s+(\\d{1,2})(?:st|nd|rd|th)?$`);
const DIVISION_RE = /^([A-Z. ]+) DIVISION$/;
const REVISION_RE = /^(\d{1,2}\/\d{1,2}\/\d{2})$/;
/** `Away @ Home` and an optional time note, which starts at a digit or a `V ` / `JV ` label (and may touch the name). */
const GAME_RE = /^([A-Za-z.' ]+?)\s*@\s*([A-Za-z.' ]+?)\s*((?:J?V\s*)?\d[\w/: ]*)?$/;

const pad = (n: number) => String(n).padStart(2, '0');

/** "615p", "6:30pm", "4", "730" → 24h; every start on these schedules is an afternoon or evening one. */
export function clock(token: string): string {
  const m = /^(\d{1,4})(?::(\d{2}))?\s*(?:p|pm)?$/i.exec(token.trim());
  if (!m) throw new Error(`unreadable time "${token}"`);
  let hour: number;
  let minute: number;
  if (m[2] !== undefined) {
    hour = Number(m[1]);
    minute = Number(m[2]);
  } else if (m[1].length <= 2) {
    hour = Number(m[1]);
    minute = 0;
  } else {
    hour = Number(m[1].slice(0, -2));
    minute = Number(m[1].slice(-2));
  }
  if (hour < 1 || hour > 12 || minute > 59) throw new Error(`unreadable time "${token}"`);
  return `${pad(hour < 12 ? hour + 12 : hour)}:${pad(minute)}`;
}

/** A game's time note → its varsity start and its JV start (null: the note gives none). */
export function readTimeNote(note: string): { varsity: string; jv: string | null } {
  const parts = note.split('/').map((p) => p.trim()).filter((p) => p.length > 0);
  const labelled = parts.map((p) => {
    const pre = /^(JV|V)\s*(.+)$/.exec(p);
    if (pre) return { level: pre[1] as 'V' | 'JV', time: clock(pre[2]) };
    const post = /^(.+?)\s+VAR$/.exec(p);
    if (post) return { level: 'V' as const, time: clock(post[1]) };
    return { level: null, time: clock(p) };
  });
  if (labelled.length === 2) {
    const [a, b] = labelled;
    if (a.level === null && b.level === null) return { jv: a.time, varsity: b.time };
    const v = labelled.find((x) => x.level === 'V');
    const jv = labelled.find((x) => x.level === 'JV');
    if (v && jv) return { varsity: v.time, jv: jv.time };
  }
  if (labelled.length === 1 && labelled[0].level === 'V') return { varsity: labelled[0].time, jv: null };
  throw new Error(`unreadable time note "${note}"`);
}

export interface ParsedDivision {
  division: DivisionId;
  /** The header's team list, verbatim minus a trailing `*` or "(NO JV)". */
  teams: string[];
  /** Teams the header marks "(NO JV)". */
  noJv: string[];
  revisedOn: string | null;
  games: Array<{ date: string; away: string; home: string; note: string | null }>;
}

export function parseDivisionText(division: DivisionId, text: string): ParsedDivision {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  const out: ParsedDivision = { division, teams: [], noJv: [], revisedOn: null, games: [] };
  let state: 'preamble' | 'teams' | 'header' | 'body' = 'preamble';
  let date: string | null = null;
  for (const line of lines) {
    if (state === 'preamble') {
      if (DIVISION_RE.test(line)) state = 'teams';
      continue;
    }
    if (state === 'teams') {
      if (/^CHAIRPERSON:/i.test(line)) {
        state = 'header';
        continue;
      }
      const noJv = /\(NO JV\)/i.test(line);
      const name = line.replace(/\(NO JV\)/i, '').replace(/\*+$/, '').trim();
      out.teams.push(name);
      if (noJv) out.noJv.push(name);
      continue;
    }
    const heading = DATE_HEADING_RE.exec(line);
    if (heading) {
      state = 'body';
      const month = MONTHS.indexOf(heading[2]) + 1;
      const year = month >= 7 ? 2026 : 2027;
      date = `${year}-${pad(month)}-${pad(Number(heading[3]))}`;
      const weekday = WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()];
      if (weekday !== heading[1]) throw new Error(`${division}: "${line}" — ${date} is a ${weekday}`);
      continue;
    }
    if (state !== 'body') continue;
    const rev = REVISION_RE.exec(line);
    if (rev) {
      out.revisedOn = rev[1];
      continue;
    }
    if (!line.includes('@')) continue; // dated notes: "CCS Seeding Meeting", "(must be approved by CCS)", footnotes
    const game = GAME_RE.exec(line);
    if (!game || date === null) throw new Error(`${division}: unreadable game line "${line}"`);
    out.games.push({ date, away: game[1].trim(), home: game[2].trim(), note: game[3]?.trim() || null });
  }
  return out;
}

/** The division's fixtures, each with its JV game where the schedule has one. */
export function fixturesOf(sport: WinterSport, parsed: ParsedDivision): BundleFixture[] {
  const resolve = (name: string) => {
    const t = resolveOfficialName('bval', name);
    if (!t) throw new Error(`${parsed.division}: cannot resolve "${name}"`);
    if (t.division !== parsed.division) throw new Error(`${parsed.division}: "${name}" is ${t.slug}, a ${t.division} team`);
    return t;
  };
  // The header's team list is the division's membership: every member, and nothing else.
  const listed = parsed.teams.map((n) => resolve(n).slug).sort();
  const registry = [...new Set(parsed.games.flatMap((g) => [resolve(g.away).slug, resolve(g.home).slug]))].sort();
  if (listed.join() !== registry.join()) throw new Error(`${parsed.division}: the header lists ${listed.join(', ')}, the games ${registry.join(', ')}`);
  const noJv = new Set(parsed.noJv.map((n) => resolve(n).slug));
  return parsed.games.map((g) => {
    const away = resolve(g.away);
    const home = resolve(g.home);
    const times = g.note === null ? { ...sport.defaults } : readTimeNote(g.note);
    const jvGame = !noJv.has(away.slug) && !noJv.has(home.slug);
    if (jvGame && times.jv === null) throw new Error(`${parsed.division} ${g.date}: "${g.note}" gives no JV start for ${away.slug} @ ${home.slug}`);
    return {
      id: officialFixtureId(parsed.division, g.date, { slug: away.slug, name: away.name }, { slug: home.slug, name: home.name }),
      division: parsed.division,
      date: g.date,
      originalDate: null,
      time: times.varsity,
      away: away.slug,
      home: home.slug,
      awayName: g.away,
      homeName: g.home,
      ...(jvGame ? { jv: { date: g.date, time: times.jv } } : {}),
    };
  });
}

function sportOfBuild(): WinterSport {
  if (IS_BASKETBALL) return WINTER.basketball;
  if (SPORT_ID === 'soccer') return WINTER.soccer;
  throw new Error('build-bval-winter-fixtures: run with SCVAL_SPORT=basketball or SCVAL_SPORT=soccer');
}

export function buildBundle(
  sport: WinterSport = sportOfBuild(),
  readSource: (file: string) => string = (f) => readFileSync(path.join(SOURCE_DIR, f), 'utf8'),
): OfficialBundle {
  const fixtures: BundleFixture[] = [];
  const documents: OfficialBundle['documents'] = [];
  for (const src of sport.sources) {
    const config = getDivision(src.division);
    if (!hasOfficialDocument(config)) throw new Error(`${src.division} has no official document`);
    const parsed = parseDivisionText(src.division, readSource(src.file));
    if (config.official.bundledSha256 !== src.sha256) throw new Error(`${src.division}: bundledSha256 is not the document's`);
    if (config.official.revisedOn !== parsed.revisedOn) {
      throw new Error(`${src.division}: revisedOn is ${config.official.revisedOn}, the document says ${parsed.revisedOn}`);
    }
    documents.push({
      division: src.division,
      url: config.official.revisionCheckUrl ?? config.official.scheduleUrl,
      sha256: src.sha256,
      revisionMarker: parsed.revisedOn === null ? null : `Revised ${parsed.revisedOn}`,
    });
    fixtures.push(...fixturesOf(sport, parsed));
  }
  const bundle: OfficialBundle = {
    schema: OFFICIAL_BUNDLE_SCHEMA,
    league: 'bval',
    source: 'bval-docx',
    transcribedOn: TRANSCRIBED_ON,
    documents,
    fixtures: fixtures.sort(compareBundleFixtures),
    events: [],
  };
  const parsed = parseOfficialBundle(bundle, 'bval');
  const rows = bundleToFixtures(parsed);
  for (const src of sport.sources) assertDoubleRoundRobin(rows.filter((f) => f.division === src.division), src.division);
  return parsed;
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  let sport: WinterSport;
  try {
    sport = sportOfBuild();
  } catch (e) {
    console.error((e as Error).message);
    return 1;
  }
  const out = path.join(REPO, sport.out);
  const text = serializeBundle(buildBundle(sport));
  const sha = createHash('sha256').update(text).digest('hex').slice(0, 12);
  if (argv.includes('--check')) {
    let current: string | null = null;
    try {
      current = readFileSync(out, 'utf8');
    } catch {
      current = null;
    }
    if (current !== text) {
      console.error(`${sport.out} differs from the transcription (${sha}); run pnpm build-bval-winter-fixtures`);
      return 1;
    }
    console.log(`${sport.out} is up to date (${sha})`);
    return 0;
  }
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, text);
  console.log(`wrote ${sport.out} (${sha})`);
  return 0;
}

runCliIfMain(import.meta.url, main);
