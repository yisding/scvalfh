/**
 * The page-code literal guard (SPEC §12.2): the pages read league and division ids from config
 * instead of spelling them, and link to games through the one URL builder.
 *
 * Over every .ts/.tsx file under PAGE_CODE_ROOTS (tests/support/source-tree.ts: app/,
 * components/ and views/), parsed with the TypeScript compiler (so comments and strings in comments never
 * count):
 *  1. no league or division id as a string literal ('scval', 'bval', 'pcal', 'mcal', 'de-anza',
 *     'el-camino', 'mt-hamilton', 'santa-teresa', 'marin-county', …): ids come from lib/config/leagues.ts or
 *     lib/queries/leagues.ts (lib/datasets/history.ts for which leagues have a 2025-26 archive);
 *  2. no `/game/${…}` template literal: game links go through gameHref (a `sblive:` id would 404).
 *
 * And over every SOURCE_ROOTS file: no `SOURCE_LINKS.scval*` access (the league links moved to
 * lib/config/leagues.ts). Each failure names the file and line, so it routes to that file's owner
 * (SPEC §13.2).
 */

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { PAGE_CODE_ROOTS, SOURCE_ROOTS, expectAtLeast, nodeLine, parse, parseText, sourceFiles } from '@/tests/support/source-tree';

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

interface Finding {
  file: string;
  line: number;
  what: string;
}

const isPageCode = (file: string): boolean => PAGE_CODE_ROOTS.some((root) => file.startsWith(`${root}/`));

function scan(file: string, sf: ts.SourceFile = parse(file)): Finding[] {
  const pageCode = isPageCode(file);
  const findings: Finding[] = [];
  const at = (node: ts.Node, what: string) => findings.push({ file, line: nodeLine(sf, node), what });

  function visit(node: ts.Node): void {
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'SOURCE_LINKS' &&
      /^scval/.test(node.name.text)
    ) {
      at(node, `reads deleted \`SOURCE_LINKS.${node.name.text}\` (league links moved to lib/config/leagues.ts)`);
    }

    if (pageCode) {
      if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && ID_LITERALS.has(node.text)) {
        // A module specifier is not a literal id (no such module exists, but be exact). Nor is a literal TYPE:
        // `Pick<Team, 'city'>` names Team's `city` field, and the league id 'city' only ever arrives as data.
        if (!(node.parent && (ts.isImportDeclaration(node.parent) || ts.isExportDeclaration(node.parent) || ts.isLiteralTypeNode(node.parent)))) {
          at(node, `league/division id literal '${node.text}' (read ids from lib/config/leagues.ts or lib/queries/leagues.ts)`);
        }
      }
      if (ts.isTemplateExpression(node) && /\/game\/\$\{/.test(node.getText(sf))) {
        at(node, 'builds a `/game/${…}` URL by hand (use gameHref from lib/shared/game-id.ts)');
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return findings;
}

const scanText = (file: string, text: string): Finding[] => scan(file, parseText(file, text));

const FILES = sourceFiles();

describe('page code reads ids from config (SPEC §12.2)', () => {
  it('scans a non-trivial tree', () => {
    expectAtLeast(11, FILES.filter((f) => f.startsWith('app/')), 'app/ files');
    expectAtLeast(21, FILES.filter((f) => f.startsWith('components/')), 'components/ files');
    expectAtLeast(40, FILES.filter((f) => f.startsWith('views/')), 'views/ files');
  });

  it('the scanner itself catches each banned form (synthetic sources)', () => {
    const bad = [
      'const u = SOURCE_LINKS.scvalDeAnza;',
      "const l = 'mcal';",
      'const d = <div data-scope="de-anza" />;',
      'const h = `/game/${id}`;',
      "const s = { league: 'north-county' };",
    ].join('\n');
    expect(scanText('components/probe.tsx', bad).map((f) => f.line)).toEqual([1, 2, 3, 4, 5]);
    // Allowed: ids in comments, a literal type, an unrelated template; a non-page directory's literals.
    const good = [
      "// 'scval' in a comment, and `/game/${id}` too",
      "import { gameHref } from '../lib/shared/game-id';",
      "type Where = Pick<Team, 'city' | 'division'>;",
      'const t = `/teams/${slug}`;',
    ].join('\n');
    expect(scanText('components/probe.tsx', good)).toEqual([]);
    expect(scanText('tests/probe.test.ts', "const l = 'scval';")).toEqual([]);
    expect(scanText('tests/probe.test.ts', 'const h = `/game/${id}`;')).toEqual([]);
    // The deleted SOURCE_LINKS.scval* access is banned everywhere, not only in page code.
    expect(scanText('tests/probe.test.ts', 'const u = SOURCE_LINKS.scvalDeAnza;').map((f) => f.line)).toEqual([1]);
  });

  for (const root of SOURCE_ROOTS) {
    it(`${root}/: no SOURCE_LINKS.scval*${PAGE_CODE_ROOTS.includes(root) ? ', no id literal, no /game/${…} template' : ''}`, () => {
      const findings = FILES.filter((f) => f.startsWith(`${root}/`)).flatMap((f) => scan(f));
      expect(findings.map((f) => `${f.file}:${f.line}: ${f.what}`)).toEqual([]);
    });
  }
});
