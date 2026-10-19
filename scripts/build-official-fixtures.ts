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
 *   pnpm build-official-fixtures                       write the three files
 *   pnpm build-official-fixtures --check               exit 1 if a file differs
 *   pnpm build-official-fixtures --bval-text A.txt B.txt
 *        BVAL fixtures/events parsed from the two docx texts (Mt. Hamilton, Santa Teresa) instead of
 *        the research JSON — the result must be identical (tests/bval-text.test.ts).
 *   --source-dir <dir>   (default tests/fixtures/official/source)
 *   --out-dir <dir>      (default data/official)
 *
 * No network: the upstream documents are only ever hashed by the cron's revision check.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import { type FlagSpec, parseFlags } from '@/lib/cli/flags';
import { getDivision, getLeague } from '@/lib/config/leagues';
import { bundledDivisions } from '@/lib/config/leagues/official';
import { plural } from '@/lib/format/words';
import { serializeBundle } from '@/lib/official/bundle';
import {
  BUNDLED_LEAGUES,
  DEFAULT_OUT_DIR,
  DEFAULT_SOURCE_DIR,
  buildBundles,
  outputFileOf,
} from '@/lib/official/build';
import { runCliIfMain } from './lib/cli';

const REPO = path.resolve(import.meta.dirname, '..');

// ---------------------------------------------------------------- CLI

interface Args {
  sourceDir: string;
  outDir: string;
  bvalTexts: string[] | null;
  check: boolean;
}

const FLAGS: FlagSpec<Args> = [
  { flags: '--check', toggle: (a) => { a.check = true; } },
  { flags: '--source-dir', value: 'path', set: (a, v) => { a.sourceDir = v; } },
  { flags: '--out-dir', value: 'path', set: (a, v) => { a.outDir = v; } },
  {
    flags: '--bval-text',
    value: 'words',
    count: 2,
    missing: () => '--bval-text needs two files: <Mt. Hamilton> <Santa Teresa>',
    set: (a, files) => { a.bvalTexts = files.map((f) => readFileSync(path.resolve(f), 'utf8')); },
  },
];

function main(argv: readonly string[]): number {
  const { sourceDir, outDir, bvalTexts, check } = parseFlags(argv, FLAGS, {
    init: () => ({ sourceDir: DEFAULT_SOURCE_DIR, outDir: DEFAULT_OUT_DIR, bvalTexts: null, check: false }),
    allowEmptyValue: true,
    unknown: (flag) => `unknown argument: ${flag}`,
  });

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

runCliIfMain(import.meta.url, main);
