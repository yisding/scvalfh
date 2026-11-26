#!/usr/bin/env tsx
/**
 * Read the 2026 National Hockey Festival from TourneyMachine into data/field-hockey/festival.json (/festival,
 * DESIGN §35; DATA-SOURCES §1.16): divisions, pools, standings, every game with its field, time and score, and the
 * Saturday placement games with the pool places that feed them.
 *
 *   pnpm fetch-festival                       check, and read the feed when it changed
 *   pnpm fetch-festival --force               read the feed even when its version is the committed one
 *   pnpm fetch-festival --dry-run             fetch and report, write nothing
 *   pnpm fetch-festival --out <path>          write somewhere else
 *   pnpm fetch-festival --fetched-at <iso>    stamp the file with this time (tests)
 *   pnpm fetch-festival --capture <dir>       also save the raw bodies (tests/fixtures/tourneymachine)
 *
 * Run by .github/workflows/update-data-festival.yml after every game slot during the event. Cost: one ~30-byte read
 * of TournamentResultsLastUpdated, the version string TourneyMachine's own web app polls; when it equals the
 * committed file's `sourceVersion` the run stops there ("unchanged upstream"). Otherwise one ~275 KB read of the
 * whole tournament, through lib/sources/http.ts (descriptive User-Agent, 15 s timeout, retries on 429/5xx only).
 * Cloudflare caches the whole feed (max-age 30; a copy was seen served at age 82) and the endpoint refuses any extra
 * query parameter, so a read can be older than the version just checked. Stored under that version, the older
 * content would never be read again (every later run would find the version unchanged), so a read whose
 * Last-Modified is before the version's own time keeps the committed `sourceVersion`, and the next run reads again.
 *
 * The normalized file (lib/sources/tourneymachine.ts) is held to lib/festival/festival-schema.ts and written only
 * when its content key (everything but `fetchedAt`) differs from the committed file's, so a run that finds nothing
 * new leaves nothing to commit. A feed the normalizer cannot read faithfully fails the run (exit 1) and the
 * committed file stays as it was.
 *
 * Field hockey's alone: another sport's build has no festival, so the script says so and stops (exit 0).
 * Node's built-in fetch ignores HTTPS_PROXY; behind a proxy run it with NODE_USE_ENV_PROXY=1 (Node 22.21+).
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { parseFetchedAtFlag } from '../lib/cli-flags';
import { FestivalFileSchema, festivalContentKey, type FestivalFile } from '../lib/festival/festival-schema';
import { HttpClient } from '../lib/sources/http';
import { IS_FIELD_HOCKEY, SPORT_ID } from '../lib/sports/current';
import {
  FESTIVAL_TOURNAMENT_ID,
  feedIsCurrent,
  festivalCounts,
  lastUpdatedUrl,
  normalizeFestival,
  parseLastUpdated,
  tournamentResultsUrl,
} from '../lib/sources/tourneymachine';
import { runCliIfMain } from './cli';
import { prepareCapture, saveCapture, validateAssembled, writeIfChanged } from './lib/team-file';

const USAGE =
  'Usage: pnpm fetch-festival [--force] [--dry-run] [--out <path>] [--fetched-at <iso>] [--capture <dir>]';

interface Args {
  out: string;
  force: boolean;
  dryRun: boolean;
  fetchedAt: string | null;
  capture: string | null;
  help: boolean;
}

/** The command line (see USAGE). */
function parseArgs(argv: readonly string[]): Args {
  const args: Args = {
    out: path.resolve(import.meta.dirname, '..', 'data', 'field-hockey', 'festival.json'),
    force: false,
    dryRun: false,
    fetchedAt: null,
    capture: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new Error(`${flag} needs a value\n${USAGE}`);
      return v;
    };
    if (flag === '--out') args.out = path.resolve(value());
    else if (flag === '--force') args.force = true;
    else if (flag === '--dry-run') args.dryRun = true;
    else if (flag === '--fetched-at') args.fetchedAt = parseFetchedAtFlag(value());
    else if (flag === '--capture') args.capture = path.resolve(value());
    else if (flag === '--help') args.help = true;
    else throw new Error(`unknown flag ${flag}\n${USAGE}`);
  }
  return args;
}

/**
 * The committed file, when it exists and validates whole; null otherwise (a file that does not validate is
 * replaced, never compared against, and said so).
 */
function readPrevious(out: string): FestivalFile | null {
  if (!existsSync(out)) return null;
  const label = path.relative(process.cwd(), out);
  try {
    const parsed = FestivalFileSchema.safeParse(JSON.parse(readFileSync(out, 'utf8')));
    if (parsed.success) return parsed.data;
    console.warn(`fetch-festival: the previous ${label} does not validate; it will be replaced`);
  } catch (err) {
    console.warn(`fetch-festival: the previous ${label} cannot be read (${(err as Error).message}); it will be replaced`);
  }
  return null;
}

/**
 * Check the version, read the feed when it changed, normalize, validate, write when the content changed.
 * `fetchImpl` is the test seam (HttpClient's).
 */
export async function main(argv: readonly string[], fetchImpl: typeof fetch = globalThis.fetch): Promise<number> {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(USAGE);
    return 0;
  }
  if (!IS_FIELD_HOCKEY) {
    console.log(`fetch-festival: SCVAL_SPORT=${SPORT_ID} has no festival (field hockey's alone), so there is nothing to fetch. Nothing written.`);
    return 0;
  }
  const capture = prepareCapture(args);
  const previous = readPrevious(args.out);
  // HttpClient returns no headers; the feed's Last-Modified is read on the way through.
  const lastModified = new Map<string, string | null>();
  const http = new HttpClient({
    onLog: (line) => console.log(line),
    fetchImpl: async (input, init) => {
      const res = await fetchImpl(input, init);
      lastModified.set(String(input), res.headers.get('last-modified'));
      return res;
    },
  });

  const check = await http.text(lastUpdatedUrl(FESTIVAL_TOURNAMENT_ID), 'application/json');
  if (capture) saveCapture(capture, 'last-updated.json', check.body);
  const version = parseLastUpdated(check.body);
  if (!args.force && previous !== null && previous.sourceVersion === version) {
    console.log(`fetch-festival: unchanged upstream (${version}, as of ${previous.fetchedAt}); nothing fetched, nothing written`);
    return 0;
  }
  console.log(`fetch-festival: upstream version ${version}${previous ? ` (committed: ${previous.sourceVersion})` : ''}`);

  const url = tournamentResultsUrl(FESTIVAL_TOURNAMENT_ID);
  const feed = await http.text(url, 'application/json');
  if (capture) saveCapture(capture, 'tournament-results.json', feed.body);
  const made = lastModified.get(url) ?? null;
  const current = feedIsCurrent(made, version);
  if (!current) {
    // A copy older than the version may still be newer than the committed file: then it is written, under the
    // committed version, so the next run reads the feed again. A copy no newer than the committed version cannot
    // add anything and could take results away (a --force run would otherwise write older results under the
    // committed version, which later runs then skip), so the committed file is kept whole.
    if (previous && !feedIsCurrent(made, previous.sourceVersion)) {
      console.log(
        `fetch-festival: the feed read is a cached copy from ${made}, no newer than the committed ` +
          `${previous.sourceVersion}; the committed file is kept as it is, and the next run reads the feed again`,
      );
      return 0;
    }
    console.log(
      `fetch-festival: the feed read is a cached copy from ${made}, older than ${version}; ` +
        'the file keeps the committed version, so the next run reads it again',
    );
  }
  const file = normalizeFestival(JSON.parse(feed.body) as unknown, {
    fetchedAt: args.fetchedAt ?? new Date().toISOString(),
    sourceVersion: current ? version : (previous?.sourceVersion ?? 'unverified'),
  });
  const validated = validateAssembled(FestivalFileSchema, file);
  if (validated === null) return 1;

  const { games, finals } = festivalCounts(validated);
  const live = validated.games.filter((g) => g.status === 'live').length;
  console.log(
    `fetch-festival: ${validated.divisions.length} divisions, ${validated.teams.length} teams, ` +
      `${finals} of ${games} games final${live ? `, ${live} live` : ''}`,
  );
  return writeIfChanged({
    out: args.out,
    dryRun: args.dryRun,
    whole: previous,
    contentKey: festivalContentKey,
    validated,
    file: validated,
    exitCode: 0,
  });
}

runCliIfMain(import.meta.url, (argv) => main(argv));
