/**
 * Writes the bundled official fixture files (SPEC §7.8):
 *
 *   data/official/bval-2026.json   60 fixtures (Mt. Hamilton 30, Santa Teresa 30) + the 10/31 play-in event
 *   data/official/pcal-2026.json   42 fixtures
 *   data/official/mcal-2026.json   72 fixtures (post-change dates, originalDate kept for the 2 approved changes)
 *
 * from the research transcriptions Stage 0 copied to tests/fixtures/official/source/. There is no EAL
 * bundle: the EAL publishes no schedule document (its division's official mode is 'none'). Deterministic:
 * the same inputs always give the same bytes, and every division is checked with
 * assertDoubleRoundRobin before anything is written. Never hand-edit the outputs.
 *
 *   pnpm exec tsx scripts/build-official-fixtures.ts                       write the three files
 *   pnpm exec tsx scripts/build-official-fixtures.ts --check               exit 1 if a file differs
 *   pnpm exec tsx scripts/build-official-fixtures.ts --bval-text A.txt B.txt
 *        BVAL fixtures/events parsed from the two docx texts (Mt. Hamilton, Santa Teresa) instead of
 *        the research JSON — the result must be identical (tests/bval-text.test.ts).
 *   --source-dir <dir>   (default tests/fixtures/official/source)
 *   --out-dir <dir>      (default data/official)
 *
 * No network: the upstream documents are only ever hashed by the cron's revision check.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { plural } from '../lib/format';
import { getDivision, getLeague } from '../lib/leagues';
import { parseBvalScheduleText } from '../lib/official/bval-text';
import {
  OFFICIAL_BUNDLE_SCHEMA,
  bundleToFixtures,
  bundledDivisions,
  compareBundleFixtures,
  officialFixtureId,
  parseOfficialBundle,
  serializeBundle,
  type BundleDocument,
  type BundleEvent,
  type BundleFixture,
  type OfficialBundle,
} from '../lib/official/schema';
import { assertDoubleRoundRobin } from '../lib/official/validate';
import { resolveOfficialName } from '../lib/teams';
import type { LeagueId } from '../lib/types';

const REPO = path.resolve(import.meta.dirname, '..');
const DEFAULT_SOURCE_DIR = path.join(REPO, 'tests', 'fixtures', 'official', 'source');
const DEFAULT_OUT_DIR = path.join(REPO, 'data', 'official');

/** The day the three sources were transcribed and re-checked (the research captures). */
export const TRANSCRIBED_ON = '2026-10-02';

export const SOURCE_FILES = {
  bval: 'bval-official-schedule-2026.json',
  pcal: 'pcal-official-schedule-2026.json',
  mcal: 'mcal-fixtures-2026.json',
} as const;

export type BundledLeague = keyof typeof SOURCE_FILES;
export const BUNDLED_LEAGUES: readonly BundledLeague[] = ['bval', 'pcal', 'mcal'];

// ---------------------------------------------------------------- source shapes (research JSON)

interface BvalSource {
  source: Record<string, { download: string; revisedVerbatim: string; sha256: string }>;
  games: Array<{
    division: string; away: string; home: string; date: string;
    awayName: string; homeName: string; timeOverride: string | null;
    times: { varsity: string };
  }>;
  playIn: { date: string; time: string; verbatim: string };
}

interface PcalSource {
  source: string;
  codes: Record<string, string>;
  games: Array<{ away: string; home: string; date: string }>;
}

interface McalSource {
  source: string;
  teams: Record<string, string>;
  fixtures: Array<{
    originalDate: string; date: string; away: string; home: string;
    awayName: string; homeName: string; time: string; note?: string;
  }>;
}

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

// ---------------------------------------------------------------- helpers

/** One bundle fixture, its id built from the league-scoped resolution of the two tokens. */
function bundleFixture(
  leagueId: LeagueId,
  f: Omit<BundleFixture, 'id'>,
): BundleFixture {
  const away = resolveOfficialName(leagueId, f.away)?.slug ?? null;
  const home = resolveOfficialName(leagueId, f.home)?.slug ?? null;
  if (away === null || home === null) {
    throw new Error(`build-official-fixtures: ${leagueId} ${f.date} ${f.away}@${f.home} does not resolve in league scope`);
  }
  return {
    id: officialFixtureId(f.division, f.date, { slug: away, name: f.awayName }, { slug: home, name: f.homeName }),
    ...f,
  };
}

/** One document per bundled division, from config (url = the revision-check URL, sha256 = bundledSha256). */
function documentsFor(leagueId: LeagueId, markers: Readonly<Record<string, string | null>> = {}): BundleDocument[] {
  return bundledDivisions(leagueId).map((d) => ({
    division: d.id,
    url: d.official.revisionCheckUrl ?? d.official.scheduleUrl,
    sha256: d.official.bundledSha256 ?? '',
    revisionMarker: markers[d.id] ?? null,
  }));
}

function dedupeEvents(events: readonly BundleEvent[]): BundleEvent[] {
  const seen = new Set<string>();
  const out: BundleEvent[] = [];
  for (const e of events) {
    const key = `${e.kind}|${e.date}|${e.verbatim}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

function finish(leagueId: LeagueId, partial: Omit<OfficialBundle, 'schema' | 'league' | 'source' | 'transcribedOn'>): OfficialBundle {
  const source = bundledDivisions(leagueId)[0].official.source;
  const bundle: OfficialBundle = {
    schema: OFFICIAL_BUNDLE_SCHEMA,
    league: leagueId,
    source,
    transcribedOn: TRANSCRIBED_ON,
    documents: partial.documents,
    fixtures: [...partial.fixtures].sort(compareBundleFixtures),
    events: partial.events,
  };
  // The same checks the cron runs at load: schema + config, then the double round robin.
  const parsed = parseOfficialBundle(bundle, leagueId);
  const fixtures = bundleToFixtures(parsed);
  for (const d of bundledDivisions(leagueId)) {
    assertDoubleRoundRobin(fixtures.filter((f) => f.division === d.id), d.id);
  }
  return parsed;
}

// ---------------------------------------------------------------- per league

/** BVAL from the research JSON (`time` = `times.varsity`; the 10/31 play-in is an event). */
export function buildBval(sourceDir = DEFAULT_SOURCE_DIR): OfficialBundle {
  const src = readJson<BvalSource>(path.join(sourceDir, SOURCE_FILES.bval));
  const markers: Record<string, string> = {};
  for (const d of bundledDivisions('bval')) {
    const s = src.source[d.id];
    if (!s) throw new Error(`build-official-fixtures: bval source has no document for ${d.id}`);
    if (s.sha256 !== d.official.bundledSha256) {
      throw new Error(`build-official-fixtures: bval ${d.id} source sha256 ≠ config bundledSha256`);
    }
    markers[d.id] = `Revised ${s.revisedVerbatim}`;
  }
  const fixtures = src.games.map((g) =>
    bundleFixture('bval', {
      division: g.division,
      date: g.date,
      originalDate: null,
      time: g.times.varsity,
      away: g.away,
      home: g.home,
      awayName: g.awayName,
      homeName: g.homeName,
    }),
  );
  const events = dedupeEvents([
    { kind: 'play-in', date: src.playIn.date, time: src.playIn.time, verbatim: src.playIn.verbatim },
  ]);
  return finish('bval', { documents: documentsFor('bval', markers), fixtures, events });
}

/** BVAL from the two docx texts (Mt. Hamilton first, then Santa Teresa). */
export function buildBvalFromText(texts: readonly string[]): OfficialBundle {
  const divisions = bundledDivisions('bval');
  if (texts.length !== divisions.length) {
    throw new Error(`build-official-fixtures: --bval-text needs ${divisions.length} files (${divisions.map((d) => d.id).join(', ')})`);
  }
  const markers: Record<string, string | null> = {};
  const fixtures: BundleFixture[] = [];
  const events: BundleEvent[] = [];
  divisions.forEach((d, i) => {
    const parsed = parseBvalScheduleText(texts[i], d.id);
    markers[d.id] = parsed.revisedOn === null ? null : `Revised ${parsed.revisedOn}`;
    for (const f of parsed.fixtures) {
      const { timeOverride, ...fixture } = f;
      void timeOverride;
      fixtures.push(fixture);
    }
    events.push(...parsed.events);
  });
  return finish('bval', { documents: documentsFor('bval', markers), fixtures, events: dedupeEvents(events) });
}

/** PCAL: codes through LEAGUES.pcal.officialCodes; varsity 16:00; names from the source's `codes`. */
function buildPcal(sourceDir = DEFAULT_SOURCE_DIR): OfficialBundle {
  const src = readJson<PcalSource>(path.join(sourceDir, SOURCE_FILES.pcal));
  const [division] = bundledDivisions('pcal');
  const name = (code: string) => {
    const n = src.codes[code];
    if (!n) throw new Error(`build-official-fixtures: pcal code ${code} has no name in the source`);
    return n;
  };
  const fixtures = src.games.map((g) =>
    bundleFixture('pcal', {
      division: division.id,
      date: g.date,
      originalDate: null,
      time: '16:00',
      away: g.away,
      home: g.home,
      awayName: name(g.away),
      homeName: name(g.home),
    }),
  );
  return finish('pcal', { documents: documentsFor('pcal'), fixtures, events: [] });
}

/** "Varsity 4:30pm" in an approved-adjustment note → "16:30". */
function adjustedVarsityTime(note: string | undefined): string | null {
  const m = note ? /Varsity\s+(\d{1,2}):(\d{2})\s*pm/i.exec(note) : null;
  if (!m) return null;
  const hour = (Number(m[1]) % 12) + 12;
  return `${hour}:${m[2]}`;
}

/**
 * MCAL: the post-change `date`, `originalDate` only when it differs, `time` = the source's time
 * except where an approved-adjustment note states the varsity start (B@LW 9/29, LW@MC 10/15 → 16:30).
 */
function buildMcal(sourceDir = DEFAULT_SOURCE_DIR): OfficialBundle {
  const src = readJson<McalSource>(path.join(sourceDir, SOURCE_FILES.mcal));
  const [division] = bundledDivisions('mcal');
  const fixtures = src.fixtures.map((f) =>
    bundleFixture('mcal', {
      division: division.id,
      date: f.date,
      originalDate: f.originalDate !== f.date ? f.originalDate : null,
      time: adjustedVarsityTime(f.note) ?? f.time,
      away: f.away,
      home: f.home,
      awayName: f.awayName,
      homeName: f.homeName,
    }),
  );
  return finish('mcal', { documents: documentsFor('mcal'), fixtures, events: [] });
}

export interface BuildOptions {
  sourceDir?: string;
  /** The two BVAL docx texts (Mt. Hamilton, Santa Teresa); null = the research JSON. */
  bvalTexts?: readonly string[] | null;
}

export function buildBundles(opts: BuildOptions = {}): Record<BundledLeague, OfficialBundle> {
  const sourceDir = opts.sourceDir ?? DEFAULT_SOURCE_DIR;
  return {
    bval: opts.bvalTexts ? buildBvalFromText(opts.bvalTexts) : buildBval(sourceDir),
    pcal: buildPcal(sourceDir),
    mcal: buildMcal(sourceDir),
  };
}

/** The repo-relative output file of a league (config's `bundledFile`). */
export function outputFileOf(leagueId: BundledLeague, outDir = DEFAULT_OUT_DIR): string {
  const file = bundledDivisions(leagueId)[0].official.bundledFile;
  if (!file) throw new Error(`build-official-fixtures: ${leagueId} has no bundledFile`);
  return path.join(outDir, path.basename(file));
}

// ---------------------------------------------------------------- CLI

function main(argv: readonly string[]): number {
  let sourceDir = DEFAULT_SOURCE_DIR;
  let outDir = DEFAULT_OUT_DIR;
  let bvalTexts: string[] | null = null;
  let check = false;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--check') check = true;
    else if (a === '--source-dir') sourceDir = path.resolve(argv[++i] ?? '');
    else if (a === '--out-dir') outDir = path.resolve(argv[++i] ?? '');
    else if (a === '--bval-text') {
      const files = [argv[++i], argv[++i]];
      if (files.some((f) => !f)) throw new Error('--bval-text needs two files: <Mt. Hamilton> <Santa Teresa>');
      bvalTexts = files.map((f) => readFileSync(path.resolve(f as string), 'utf8'));
    } else throw new Error(`unknown argument: ${a}`);
  }

  const bundles = buildBundles({ sourceDir, bvalTexts });
  let differs = 0;
  for (const leagueId of BUNDLED_LEAGUES) {
    const file = outputFileOf(leagueId, outDir);
    const text = serializeBundle(bundles[leagueId]);
    const counts = bundledDivisions(leagueId)
      .map((d) => `${getDivision(d.id).label} ${bundles[leagueId].fixtures.filter((f) => f.division === d.id).length}`)
      .join(', ');
    const summary = `${getLeague(leagueId).shortName}: ${bundles[leagueId].fixtures.length} fixtures (${counts}), ${plural(bundles[leagueId].events.length, 'event', 'events')}`;
    if (check) {
      let current = '';
      try {
        current = readFileSync(file, 'utf8');
      } catch {
        current = '';
      }
      const same = current === text;
      if (!same) differs += 1;
      console.log(`${same ? 'ok     ' : 'DIFFERS'} ${path.relative(REPO, file)} — ${summary}`);
    } else {
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, text);
      console.log(`wrote ${path.relative(REPO, file)} — ${summary}`);
    }
  }
  return differs > 0 ? 1 : 0;
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
  }
}
