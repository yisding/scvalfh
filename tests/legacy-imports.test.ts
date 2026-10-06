/**
 * The legacy-name and literal guard (SPEC §0.4, §12.2): what Stage A deleted stays deleted, and
 * the pages read league and division ids from config instead of spelling them.
 *
 * Over every .ts/.tsx/.mts/.mjs file under app/, components/, scripts/ and tests/ (except
 * tests/fixtures/** and tests/golden/**), parsed with the TypeScript compiler (so comments and
 * strings in comments never count):
 *  1. no import (or `export … from`, or `import('…')` type) of a §0.4-deleted name FROM ITS OLD
 *     MODULE: lib/season, lib/standings, lib/teams, lib/types (the `Division` alias among them; use
 *     DivisionId); no `SOURCE_LINKS.scval*` access;
 * and under app/ and components/ only:
 *  2. no league or division id as a string literal ('scval', 'bval', 'pcal', 'mcal', 'de-anza',
 *     'el-camino', 'mt-hamilton', 'santa-teresa', 'marin-county'): ids come from lib/leagues.ts or
 *     lib/data.ts (lib/history.ts for which leagues have a 2025-26 archive);
 *  3. no `/game/${…}` template literal: game links go through gameHref (a `sblive:` id would 404).
 *
 * Each failure names the file and line, so it routes to that file's owner (SPEC §13.2).
 */

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { REPO } from './helpers';

/** §0.4 "No shims": deleted name → its old module (repo-relative, no extension). */
const DELETED: Readonly<Record<string, readonly string[]>> = {
  'lib/season': [
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
  'lib/standings': ['crossoverPairings', 'playoffStatus', 'PLAYOFF_STATUS_LABELS'],
  'lib/teams': ['isScvalTeamId', 'WITHDRAWN_SCHOOL_NAMES'],
  'lib/types': ['CrossoverPairing', 'Division', 'PlayoffKeyDates', 'Playoffs'],
};

const ID_LITERALS = new Set([
  'scval',
  'bval',
  'pcal',
  'mcal',
  'eal',
  'de-anza',
  'el-camino',
  'mt-hamilton',
  'santa-teresa',
  'marin-county',
  // The Southern California amendment (DESIGN-socal §2.1.8): four leagues, eight divisions ('sunset' is both).
  'sunset',
  'city',
  'north-county',
  'metro',
  'city-western',
  'city-eastern',
  'avocado',
  'palomar',
  'valley',
  'metro-mesa',
  'metro-south-bay',
]);

const ROOTS = ['app', 'components', 'scripts', 'tests'];
const EXCLUDED = ['tests/fixtures/', 'tests/golden/'];
const EXT = /\.(ts|tsx|mts|mjs|js)$/;

function listFiles(root: string): string[] {
  const out: string[] = [];
  for (const rel of readdirSync(path.join(REPO, root), { recursive: true }) as string[]) {
    const file = `${root}/${rel.split(path.sep).join('/')}`;
    if (!EXT.test(file) || file.endsWith('.d.ts')) continue;
    if (file.includes('/node_modules/') || EXCLUDED.some((x) => file.startsWith(x))) continue;
    out.push(file);
  }
  return out.sort();
}

/** A module specifier as a repo-relative path without extension, or null for a package. */
function resolveSpecifier(fromFile: string, spec: string): string | null {
  let target: string;
  if (spec.startsWith('@/')) target = spec.slice(2);
  else if (spec.startsWith('.')) target = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), spec));
  else return null;
  return target.replace(/\.(ts|tsx|js|mjs)$/, '').replace(/\/index$/, '');
}

interface Finding {
  file: string;
  line: number;
  what: string;
}

function scan(file: string): Finding[] {
  return scanSource(file, readFileSync(path.join(REPO, file), 'utf8'));
}

function scanSource(file: string, text: string): Finding[] {
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : file.endsWith('.ts') || file.endsWith('.mts') ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const pageCode = file.startsWith('app/') || file.startsWith('components/');
  const findings: Finding[] = [];
  const at = (node: ts.Node, what: string) =>
    findings.push({ file, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, what });

  /** Named bindings imported/re-exported from `spec`: check against the deleted list. */
  function checkNames(node: ts.Node, spec: string, names: readonly string[]): void {
    const mod = resolveSpecifier(file, spec);
    for (const name of names) {
      if (mod && DELETED[mod]?.includes(name)) at(node, `imports deleted name \`${name}\` from its old module '${spec}' (SPEC §0.4)`);
    }
  }

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const names: string[] = [];
      if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const el of clause.namedBindings.elements) names.push((el.propertyName ?? el.name).text);
      }
      checkNames(node, node.moduleSpecifier.text, names);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const names: string[] = [];
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const el of node.exportClause.elements) names.push((el.propertyName ?? el.name).text);
      }
      checkNames(node, node.moduleSpecifier.text, names);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      const q = node.qualifier;
      const first = q ? (ts.isIdentifier(q) ? q.text : ts.isQualifiedName(q) ? leftmost(q) : '') : '';
      if (first) checkNames(node, node.argument.literal.text, [first]);
    } else if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'SOURCE_LINKS' &&
      /^scval/.test(node.name.text)
    ) {
      at(node, `reads deleted \`SOURCE_LINKS.${node.name.text}\` (league links moved to lib/leagues.ts)`);
    }

    if (pageCode) {
      if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && ID_LITERALS.has(node.text)) {
        // A module specifier is not a literal id (no such module exists, but be exact). Nor is a literal TYPE:
        // `Pick<Team, 'city'>` names Team's `city` field, and the league id 'city' only ever arrives as data.
        if (!(node.parent && (ts.isImportDeclaration(node.parent) || ts.isExportDeclaration(node.parent) || ts.isLiteralTypeNode(node.parent)))) {
          at(node, `league/division id literal '${node.text}' (read ids from lib/leagues.ts or lib/data.ts)`);
        }
      }
      if (ts.isTemplateExpression(node) && /\/game\/\$\{/.test(node.getText(sf))) {
        at(node, 'builds a `/game/${…}` URL by hand (use gameHref from lib/game-id.ts)');
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return findings;
}

function leftmost(q: ts.QualifiedName): string {
  let left: ts.EntityName = q.left;
  while (ts.isQualifiedName(left)) left = left.left;
  return left.text;
}

const FILES = ROOTS.flatMap(listFiles);

describe('legacy imports and literals (SPEC §0.4, §12.2)', () => {
  it('scans a non-trivial tree', () => {
    expect(FILES.filter((f) => f.startsWith('app/')).length).toBeGreaterThan(10);
    expect(FILES.filter((f) => f.startsWith('components/')).length).toBeGreaterThan(20);
  });

  it('the scanner itself catches each banned form (synthetic sources)', () => {
    expect(resolveSpecifier('app/teams/page.tsx', '../../lib/season')).toBe('lib/season');
    expect(resolveSpecifier('components/home/x.ts', '@/lib/teams')).toBe('lib/teams');
    expect(resolveSpecifier('tests/ui/a.test.ts', '../../lib/types.ts')).toBe('lib/types');
    expect(resolveSpecifier('app/x.tsx', 'next/link')).toBeNull();
    const bad = [
      "import { DIVISIONS } from '../lib/season';",
      "import { playoffStatus as ps } from '@/lib/standings';",
      "export { isScvalTeamId } from '../lib/teams';",
      "import type { Division } from '../lib/types';",
      "type P = import('../lib/types').Playoffs;",
      'const u = SOURCE_LINKS.scvalDeAnza;',
      "const l = 'mcal';",
      'const d = <div data-scope="de-anza" />;',
      'const h = `/game/${id}`;',
      "const s = { league: 'north-county' };",
    ].join('\n');
    const found = scanSource('components/probe.tsx', bad).map((f) => f.line);
    expect(found).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    // Allowed: the new homes of moved names, ids in comments, a non-page directory's literals.
    const good = [
      "import { LEAGUE_IDS, leagueStandingsUrl } from '../lib/leagues';",
      "import { playoffStatusFor } from '../lib/standings';",
      "// 'scval' in a comment, and `/game/${id}` too",
      "import { gameHref } from '../lib/game-id';",
      "type Where = Pick<Team, 'city' | 'division'>;",
    ].join('\n');
    expect(scanSource('components/probe.tsx', good)).toEqual([]);
    expect(scanSource('tests/probe.test.ts', "const l = 'scval';")).toEqual([]);
  });

  for (const root of ROOTS) {
    it(`${root}/: no deleted name from its old module${root === 'app' || root === 'components' ? ', no id literal, no /game/${…} template' : ''}`, () => {
      const findings = FILES.filter((f) => f.startsWith(`${root}/`)).flatMap(scan);
      expect(findings.map((f) => `${f.file}:${f.line}: ${f.what}`)).toEqual([]);
    });
  }
});
