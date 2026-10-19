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
 *  2. no `/game/${…}`, `/teams/${…}`, `/standings/${…}`, `/schedule/${…}`, `/scores/${…}`, `/playoffs/${…}` or
 *     `/clubs/${…}` template literal: every routed URL goes through a helper (gameHref from lib/shared/game-id.ts;
 *     teamHref, standingsHref, scheduleHref, scoresHref, playoffsHref, clubHref from lib/shared/routes.ts); a
 *     `sblive:` game id would 404 raw, and a route that moves is then edited in one place.
 *
 * And over every SOURCE_ROOTS file: no `SOURCE_LINKS.scval*` access (the league links moved to
 * lib/config/leagues.ts). Each failure names the file and line, so it routes to that file's owner
 * (SPEC §13.2).
 */

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { PAGE_CODE_ROOTS, SOURCE_ROOTS, expectAtLeast, nodeLine, parse, parseText, sourceFiles } from '@/tests/support/source-tree';

/** Route prefixes whose URLs have one builder each (lib/shared/routes.ts; gameHref in lib/shared/game-id.ts). */
const ROUTE_HELPERS: Record<string, string> = {
  game: 'gameHref',
  teams: 'teamHref',
  standings: 'standingsHref',
  schedule: 'scheduleHref',
  scores: 'scoresHref',
  playoffs: 'playoffsHref',
  clubs: 'clubHref',
};
/** Where each helper lives: `gameHref` keeps the sblive grammar it needs out of the import-free routes module. */
const ROUTE_MODULES: Record<string, string> = { gameHref: 'lib/shared/game-id.ts' };
/**
 * The one file allowed a route template: TeamFinder is a client module of /teams, whose first-load JS
 * budget (scripts/ci/assert-budgets.ts) has 42 B of headroom, and the separate lib/shared/routes module
 * that teamHref needs costs 94 B there. Each entry names the prefix it may spell; the test below fails
 * if the exemption stops being needed (the template gone) so it cannot outlive its reason.
 */
const TEMPLATE_EXEMPT: Record<string, string> = { 'components/search/TeamFinder.tsx': 'teams' };
const ROUTE_TEMPLATE = new RegExp(`/(${Object.keys(ROUTE_HELPERS).join('|')})/\\$\\{`);

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
      if (ts.isTemplateExpression(node)) {
        const route = ROUTE_TEMPLATE.exec(node.getText(sf));
        if (route && TEMPLATE_EXEMPT[file] !== route[1]) {
          at(node, `builds a \`/${route[1]}/\${…}\` URL by hand (use ${ROUTE_HELPERS[route[1]]} from ${ROUTE_MODULES[ROUTE_HELPERS[route[1]]] ?? 'lib/shared/routes.ts'})`);
        }
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
    // Allowed: ids in comments, a literal type, a route built by its helper, a static path; a non-page
    // directory's literals.
    const good = [
      "// 'scval' in a comment, and `/game/${id}` too",
      "import { gameHref } from '../lib/shared/game-id';",
      "type Where = Pick<Team, 'city' | 'division'>;",
      'const t = teamHref(slug);',
      "const p = '/teams';",
    ].join('\n');
    expect(scanText('components/probe.tsx', good)).toEqual([]);
    expect(scanText('tests/probe.test.ts', "const l = 'scval';")).toEqual([]);
    expect(scanText('tests/probe.test.ts', 'const h = `/game/${id}`;')).toEqual([]);
    // The deleted SOURCE_LINKS.scval* access is banned everywhere, not only in page code.
    expect(scanText('tests/probe.test.ts', 'const u = SOURCE_LINKS.scvalDeAnza;').map((f) => f.line)).toEqual([1]);
  });

  // One positive and one negative probe per routed prefix (lib/shared/routes.ts has a helper for each).
  describe.each(Object.entries(ROUTE_HELPERS))('/%s/${…} template (use %s)', (prefix, helper) => {
    it('flags it in page code, naming the helper', () => {
      const found = scanText('components/probe.tsx', `const u = \`/${prefix}/\${id}\`;`);
      expect(found.map((f) => f.line)).toEqual([1]);
      expect(found[0].what).toContain(`${helper} from ${ROUTE_MODULES[helper] ?? 'lib/shared/routes.ts'}`);
    });

    it('flags it with a fragment or an inner expression, and passes the helper call, the bare path and non-page code', () => {
      expect(scanText('components/probe.tsx', `const u = \`/${prefix}/\${a.b}#\${c}\`;`).map((f) => f.line)).toEqual([1]);
      expect(scanText('components/probe.tsx', `const u = ${helper}(id);`)).toEqual([]);
      expect(scanText('components/probe.tsx', `const u = \`\${${helper}(id)}#x\`;`)).toEqual([]);
      expect(scanText('components/probe.tsx', `const u = '/${prefix}';`)).toEqual([]);
      expect(scanText('components/probe.tsx', `const u = \`/${prefix}\`;`)).toEqual([]);
      expect(scanText('tests/probe.test.ts', `const u = \`/${prefix}/\${id}\`;`)).toEqual([]);
    });
  });

  it('every exempted route template is still spelled in its file (the exemption cannot go stale)', () => {
    for (const [file, prefix] of Object.entries(TEMPLATE_EXEMPT)) {
      const sf = parse(file);
      const spelled: string[] = [];
      const visit = (node: ts.Node): void => {
        if (ts.isTemplateExpression(node) && node.getText(sf).includes(`/${prefix}/\${`)) spelled.push(node.getText(sf));
        ts.forEachChild(node, visit);
      };
      visit(sf);
      expect(spelled, `${file} spells /${prefix}/\${…}`).not.toEqual([]);
    }
  });

  for (const root of SOURCE_ROOTS) {
    it(`${root}/: no SOURCE_LINKS.scval*${PAGE_CODE_ROOTS.includes(root) ? ', no id literal, no route template' : ''}`, () => {
      const findings = FILES.filter((f) => f.startsWith(`${root}/`)).flatMap((f) => scan(f));
      expect(findings.map((f) => `${f.file}:${f.line}: ${f.what}`)).toEqual([]);
    });
  }
});
