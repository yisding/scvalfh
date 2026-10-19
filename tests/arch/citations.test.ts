/**
 * The citation-integrity gate. Repo paths are quoted all over this repository (README, docs/, code
 * comments, workflows, package.json, tests), and several committed data files quote module paths too.
 * A move or a rename that leaves one behind is a lie nobody notices, so this test resolves every one:
 *
 *   (A) every `app|components|views|lib|scripts|tests|docs|data|public|patches|.github` path quoted in
 *       a tracked text file names a file or directory that exists;
 *   (C) the string literals that scripts write into committed data files are still byte for byte what
 *       the data records (they are exempt from (A): they cite modules by the names they had then);
 *   (D) every module path quoted inside data/, tests/fixtures/ and tests/golden/ (which cannot be
 *       edited) exists, or has a row in docs/CITATIONS.md's frozen-path table;
 *   (E) every `README "<Heading>"` / `docs/<FILE>.md "<Heading>"` citation names a heading that exists.
 *
 * ((B), the probe paths the tests invent, is ALLOWED_SYNTHETIC below.) A failure prints
 * `file:line cites X (missing)`.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  CITATIONS_DOC,
  REPO_ROOT as REPO,
  frozenTableRows,
  hasExtension,
  lineOf,
  mask,
  maskFrozenTable,
  pathResolves as resolves,
  pathTokens,
  trackedFiles,
} from '@/tests/support/source-tree';

const SELF = 'tests/arch/citations.test.ts';

const TEXT_EXTENSIONS = ['.ts', '.tsx', '.mts', '.mjs', '.js', '.md', '.yml', '.yaml', '.json', '.sh', '.css'];
/** The frozen files also include captured pages and feeds, which can quote module paths too. */
const FROZEN_EXTENSIONS = [...TEXT_EXTENSIONS, '.html', '.htm', '.txt', '.ics', '.csv'];

/** Not scanned for (A): generated, captured, vendored or build output. */
const EXCLUDED_PREFIXES = [
  'data/',
  'public/',
  'patches/',
  'pnpm-lock.yaml',
  'node_modules/',
  'tests/fixtures/',
  'tests/golden/',
  '.next/',
  'dist/',
  '.vinext/',
  '.cloudflare/',
  '.claude/',
];

/** The frozen-file roots of (D), and the source roots whose paths they may quote. */
const FROZEN_PREFIXES = ['data/', 'tests/fixtures/', 'tests/golden/'];
const FROZEN_QUOTED_ROOTS = ['lib/', 'components/', 'scripts/', 'app/'];

/**
 * (B) The probe paths tests invent on purpose; each is a string the named test feeds to a checker,
 * not a file. Everything else that fails to resolve is rot and gets fixed at its source.
 */
const ALLOWED_SYNTHETIC: Record<string, string> = {
  'components/probe.tsx': 'tests/arch/page-code-literals.test.ts: a planted module',
  'tests/probe.test.ts': 'tests/arch/page-code-literals.test.ts: a planted test file',
  'app/x.tsx': 'tests/arch/deleted-names.test.ts: the importer of a resolveModule probe',
  'app/layout.js': 'views/site/site.ts: a quotation from the Next.js docs (the route file here is app/layout.tsx)',
  'scripts/lib/x.ts': 'tests/typecheck-scope.test.ts: a path the glob must not match',
  'lib/dat/.ts': 'tests/typecheck-scope.test.ts: a path the glob must not match',
  'components/home/x.ts': 'tests/arch/deleted-names.test.ts: the importer of a resolveModule probe',
  'tests/ui/a.test.ts': 'tests/arch/deleted-names.test.ts: the importer of a resolveModule probe',
  'data/official/x.json': 'tests/leagues.test.ts: a bundledFile in an invented document config',
  'scripts/lib/data.ts': 'tests/typecheck-scope.test.ts: a path the glob must not match',
  'components/teams/TeamHero.tsx': 'tests/typecheck-scope.test.ts: a path the glob must not match',
  'lib/dataXts': 'tests/typecheck-scope.test.ts: proof that the dot in a glob is escaped',
  'docs/01-app/03-api-reference/03-file-conventions/page.md':
    'components/schedule/ScheduleFilters.tsx: a page of the Next.js docs installed at node_modules/next/dist/docs, cited relative to it',
};

/** Dead for good, and still quoted by committed data files; they need no row in the table. */
const KNOWN_DEAD = ['lib/sblive.ts', 'lib/mcal-bracket.ts'];

/**
 * (C) String literals that scripts write into committed data files. The data records them forever (a
 * content key ignores only fetchedAt and error), so they stay byte for byte, module names and all, and
 * their path tokens are not citations. Each entry is `[file, exact substring of that file]`; the
 * substring is also masked wherever else it appears (this file included).
 */
const FROZEN_DATA_TEXT: ReadonlyArray<readonly [string, string]> = [
  // scripts/fetch-jv.ts NOTES
  ['scripts/fetch-jv.ts', 'games are MaxPreps’ JV contests (the schedule feed read with the JV season id), built exactly as a varsity game is; sblive are si.com’s scored JV finals from each school’s JV team page.'],
  ['scripts/fetch-jv.ts', 'The site shows lib/jv-merge.ts over these two lists: MaxPreps first; si.com fills a score MaxPreps lacks, adds a game MaxPreps does not list, and is noted beside a MaxPreps score it disagrees with.'],
  ['scripts/fetch-jv.ts', 'A si.com JV side is one of ours only by its si.com JV team id (lib/jv-teams.ts), never by name.'],
  ['scripts/fetch-jv.ts', 'JV games are kept apart from varsity: no varsity standings, leaders, ratings or postseason read them. games are stored unclassified; lib/jv-standings.ts decides at load which JV table each counts for, from its varsity counterpart.'],
  ['scripts/fetch-jv.ts', 'A source with status carried-forward kept the previous file’s rows after a failed fetch; its own fetchedAt says when those rows were read.'],
  // scripts/fetch-player-stats.ts NOTES
  ['scripts/fetch-player-stats.ts', 'read the same way. A team with status pending has not been covered by any run yet: nothing was fetched and nothing is claimed for it.'],
  ['scripts/fetch-player-stats.ts', 'are joined to data/rosters.json on the career id in each row'],
  ['scripts/fetch-player-stats.ts', 'for all of this season'],
  ['scripts/fetch-player-stats.ts', 'varsity games, league and non-league alike. Coverage is the coach'],
  ['scripts/fetch-player-stats.ts', 'only then are its cells read, so a tracked 0 is a real zero and an untracked stat is null for every player.'],
  ['scripts/fetch-player-stats.ts', 'Per-game and percentage columns are dropped: they are arithmetic on the counts.'],
  ['scripts/fetch-player-stats.ts', 'its own fetchedAt says when those rows were read.'],
  ['scripts/fetch-player-stats.ts', 'read only for a team a game note on one of its finals credits with goals, assists or saves (lib/note-stats.ts), so a noted stat the coach also entered is not counted twice.'],
  // scripts/build-history.ts notes
  ['scripts/build-history.ts', 'The page splits them around the one school spelling in each (components/history/history-view.ts); the file keeps the text as written.'],
  ['scripts/build-history.ts', 'although lib/registry/bval.ts lists leland under mt-hamilton and prospect under santa-teresa (the 2026-27 alignment).'],
  ['scripts/build-history.ts', 'The registry is not changed; the page says both teams moved.'],
  // every builtBy literal
  ['scripts/build-history.ts', "builtBy: 'scripts/build-history.ts'"],
  ['scripts/fetch-jv.ts', "builtBy: 'scripts/fetch-jv.ts'"],
  ['scripts/fetch-player-stats.ts', "builtBy: 'scripts/fetch-player-stats.ts'"],
  ['scripts/fetch-rosters.ts', "builtBy: 'scripts/fetch-rosters.ts'"],
];

const read = (rel: string): string => readFileSync(path.join(REPO, rel), 'utf8');

const FILES = trackedFiles();
const SOURCE_FILES = FILES.filter(
  (f) => hasExtension(f, TEXT_EXTENSIONS) && !EXCLUDED_PREFIXES.some((p) => f === p || f.startsWith(p)),
);
const FROZEN_FILES = FILES.filter((f) => FROZEN_PREFIXES.some((p) => f.startsWith(p)) && hasExtension(f, FROZEN_EXTENSIONS));

let checked = 0;

describe('citation integrity', () => {
  it('(A) every path quoted in a tracked text file exists', () => {
    const missing: string[] = [];
    const usedSynthetic = new Set<string>();
    for (const file of SOURCE_FILES) {
      let text = read(file);
      for (const [, needle] of FROZEN_DATA_TEXT) text = mask(text, needle);
      if (file === CITATIONS_DOC) text = maskFrozenTable(text);
      for (const { line, token } of pathTokens(file, text)) {
        if (token in ALLOWED_SYNTHETIC) {
          if (file !== SELF) usedSynthetic.add(token);
          continue;
        }
        if (file === SELF && KNOWN_DEAD.includes(token)) continue;
        checked += 1;
        if (!resolves(token)) missing.push(`${file}:${line} cites ${token} (missing)`);
      }
    }
    for (const token of Object.keys(ALLOWED_SYNTHETIC)) {
      if (!usedSynthetic.has(token)) missing.push(`${SELF} allows ${token}, which nothing cites any more (remove it)`);
    }
    expect(missing).toEqual([]);
  });

  it('(C) the literals scripts write into committed data are still byte for byte', () => {
    const changed: string[] = [];
    for (const [file, needle] of FROZEN_DATA_TEXT) {
      if (!read(file).includes(needle)) changed.push(`${file} no longer contains ${JSON.stringify(needle.slice(0, 70))}`);
    }
    expect(changed).toEqual([]);
  });

  it('(D) every module path the frozen files quote exists or has a docs/CITATIONS.md row', () => {
    const rows = frozenTableRows();
    const missing: string[] = [];
    for (const file of FROZEN_FILES) {
      for (const { line, token } of pathTokens(file, read(file))) {
        if (!FROZEN_QUOTED_ROOTS.some((root) => token.startsWith(root))) continue;
        if (/^(?:\/tmp|\/home)\b/.test(token)) continue;
        checked += 1;
        if (resolves(token) || rows.has(token) || KNOWN_DEAD.includes(token)) continue;
        missing.push(`${file}:${line} cites ${token} (missing; add a row to the frozen-path table in ${CITATIONS_DOC})`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('(E) every quoted README / docs heading exists', () => {
    const QUOTED_HEADING = /(README(?:\.md)?|docs\/[A-Za-z0-9-]+\.md)\s+(?:describes\s+\()?\\?["“]([^"“”\\]+?)\\?["”]/g;
    const headingsOf = new Map<string, Set<string>>();
    const headings = (target: string): Set<string> => {
      let set = headingsOf.get(target);
      if (!set) {
        set = new Set(
          read(target)
            .split('\n')
            .map((l) => /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(l)?.[1])
            .filter((h): h is string => h !== undefined),
        );
        headingsOf.set(target, set);
      }
      return set;
    };
    const missing: string[] = [];
    for (const file of SOURCE_FILES) {
      const text = read(file);
      for (const m of text.matchAll(QUOTED_HEADING)) {
        const target = m[1].startsWith('README') ? 'README.md' : m[1];
        // A heading cited across a wrapped comment line: "College\n * commitments".
        const heading = m[2].replace(/\s*\n\s*(?:\*|\/\/|#)?\s*/g, ' ');
        // `README "<Heading>"` is the citation form spelled out in prose (this file's header), not a citation.
        if (/^<[^>]*>$/.test(heading)) continue;
        checked += 1;
        if (!existsSync(path.join(REPO, target))) {
          missing.push(`${file}:${lineOf(text, m.index)} cites ${target} (missing)`);
        } else if (!headings(target).has(heading)) {
          missing.push(`${file}:${lineOf(text, m.index)} cites ${target} "${heading}" (missing heading)`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('checked enough citations to mean something', () => {
    // Runs after the four scans above (tests in a file run in order); a scanner that silently matched
    // nothing would otherwise pass for ever.
    expect(checked).toBeGreaterThan(2000);
  });
});
