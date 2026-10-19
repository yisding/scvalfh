/**
 * The deleted-names ledger (SPEC §0.4): what Stage A deleted stays deleted.
 *
 * Over every .ts/.tsx/.mts/.mjs/.js file under SOURCE_ROOTS (tests/support/source-tree.ts; the
 * frozen tests/fixtures/** and tests/golden/** are not source), parsed with the TypeScript compiler
 * (so comments and strings in comments never count): no import (or `export … from`, or `import('…')`
 * type) of a §0.4-deleted name FROM ITS OLD MODULE. The `Division` alias among them is gone; use
 * DivisionId.
 *
 * The ledger is keyed by module path PREFIX: a key matches a specifier that resolves to the key
 * itself or to anything under `key/`, so the key moves with the module when it becomes a directory
 * (a refactor that moves a keyed module edits its key in the same commit). The ledger therefore
 * guards the SUCCESSOR modules too: the old types module was split into the files of lib/model/,
 * so the key 'lib/model' bans its deleted names from every one of them.
 *
 * The page-code rules (league ids as string literals, hand-built /game/ URLs, SOURCE_LINKS.scval*)
 * are tests/arch/page-code-literals.test.ts. Each failure names the file and line, so it routes to
 * that file's owner (SPEC §13.2).
 */

import type ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { SOURCE_ROOTS, expectAtLeast, importsOf, parseText, resolveModule, sourceFiles } from '@/tests/support/source-tree';

/** §0.4 "No shims": the old module (repo-relative, no extension) → the names deleted from it. */
const DELETED: Readonly<Record<string, readonly string[]>> = {
  'lib/config/season': [
    'SECTION_ID',
    'SECTION_NAME',
    'DIVISIONS',
    'DIVISION_LABELS',
    'LEAGUE_IDS',
    'LEAGUE_NAMES',
    'leagueStandingsUrl',
    'BYLAW_CITATIONS',
    'PLAYOFF_KEY_DATES',
    'PLAYOFF_FORMAT',
    'buildSeason',
  ],
  'lib/engine/standings': ['crossoverPairings', 'playoffStatus', 'PLAYOFF_STATUS_LABELS'],
  'lib/registry': ['isScvalTeamId', 'WITHDRAWN_SCHOOL_NAMES'],
  'lib/model': ['CrossoverPairing', 'Division', 'PlayoffKeyDates', 'Playoffs'],
};

/** The names the ledger deletes from `module`: its own key, or the key of a directory above it. */
function deletedFrom(mod: string): readonly string[] {
  return Object.entries(DELETED)
    .filter(([key]) => mod === key || mod.startsWith(`${key}/`))
    .flatMap(([, names]) => names);
}

interface Finding {
  file: string;
  line: number;
  what: string;
}

/** The deleted names that `file` imports (`source` is the file, or a parsed synthetic source). */
function scan(file: string, source: string | ts.SourceFile = file): Finding[] {
  const findings: Finding[] = [];
  for (const ref of importsOf(source)) {
    const mod = resolveModule(file, ref.spec);
    if (!mod) continue;
    const deleted = deletedFrom(mod);
    for (const name of ref.names) {
      if (deleted.includes(name)) {
        findings.push({ file, line: ref.line, what: `imports deleted name \`${name}\` from its old module '${ref.spec}' (SPEC §0.4)` });
      }
    }
  }
  return findings;
}

const scanText = (file: string, text: string): Finding[] => scan(file, parseText(file, text));

const FILES = sourceFiles();

describe('deleted names stay deleted (SPEC §0.4)', () => {
  it('scans a non-trivial tree', () => {
    expectAtLeast(11, FILES.filter((f) => f.startsWith('app/')), 'app/ files');
    expectAtLeast(21, FILES.filter((f) => f.startsWith('components/')), 'components/ files');
    expectAtLeast(20, FILES.filter((f) => f.startsWith('lib/')), 'lib/ files');
  });

  it('the scanner itself catches each banned form (synthetic sources)', () => {
    expect(resolveModule('app/teams/page.tsx', '../../lib/config/season')).toBe('lib/config/season');
    expect(resolveModule('components/home/x.ts', '@/lib/registry/teams')).toBe('lib/registry/teams');
    expect(resolveModule('tests/ui/a.test.ts', '../../lib/model/ids.ts')).toBe('lib/model/ids');
    expect(resolveModule('app/x.tsx', 'next/link')).toBeNull();
    const bad = [
      "import { DIVISIONS } from '../lib/config/season';",
      "import { playoffStatus as ps } from '@/lib/engine/standings';",
      "export { isScvalTeamId } from '../lib/registry/teams';",
      "import type { Division } from '../lib/model/ids';",
      "type P = import('@/lib/model/postseason').Playoffs;",
      // A key matches the module AND anything under it (the module became a directory).
      "import { buildSeason } from '@/lib/config/season/build';",
    ].join('\n');
    expect(scanText('components/probe.tsx', bad).map((f) => f.line)).toEqual([1, 2, 3, 4, 5, 6]);
    // Allowed: the new homes of moved names, a name that was never deleted, ids in comments, a sibling key.
    const good = [
      "import { LEAGUE_IDS, leagueStandingsUrl } from '../lib/config/leagues';",
      "import { playoffStatusFor } from '../lib/engine/standings';",
      "// import { DIVISIONS } from '../lib/config/season';",
      "import { gameHref } from '../lib/shared/game-id';",
      "import { SEASON } from '../lib/config/season';",
      "import { DIVISIONS } from '../lib/seasons';",
    ].join('\n');
    expect(scanText('components/probe.tsx', good)).toEqual([]);
  });

  for (const root of SOURCE_ROOTS) {
    it(`${root}/: no deleted name from its old module`, () => {
      const findings = FILES.filter((f) => f.startsWith(`${root}/`)).flatMap((f) => scan(f));
      expect(findings.map((f) => `${f.file}:${f.line}: ${f.what}`)).toEqual([]);
    });
  }
});
