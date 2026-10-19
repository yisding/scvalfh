/**
 * The naming conventions, as one test: the directory is the layer, the basename is the concept, and
 * the case of a name says what a file holds.
 *
 *  - components/**\/*.tsx are PascalCase (one component, or a component and its private parts); the
 *    only kebab .tsx are the ImageResponse kit under components/og/ and the two part bundles named
 *    in KEBAB_TSX. A PascalCase .tsx exports only PascalCase components, UPPER_SNAKE constants or
 *    tables, or types: a helper function or a hook belongs in a kebab module beside it (the thirteen
 *    helpers that predate the rule are the shrink-only KNOWN_EXCEPTIONS ledger, with its reason).
 *  - components/**\/*.ts are hooks/ and head/ (kebab), plus the explicitly listed non-JSX modules of
 *    COMPONENT_TS: view models do not live in components/ (they are views/), so a new .ts there needs
 *    a reason written down here.
 *  - views/**\/*.ts and lib/**\/*.ts are kebab-case; neither holds a .tsx. A views entry is
 *    <area>-view.ts in the directory <area> (one per directory; the area may be the singular of the
 *    directory, team-view.ts in teams/), a route-parameter module is <name>-route.ts, a client-safe
 *    slice is <name>-client.ts, and the suffixes belong to views/ only.
 *  - No lib basename ends in -schema, -view or -build (the directory says it: lib/schema/, views/,
 *    lib/pipeline/), and no index.ts exists anywhere in the source (no barrels; the three package doors
 *    are named files beside their directories).
 *
 * Every allowance below carries its reason; the tests at the end fail when an allowance names a file
 * that is gone, so a list cannot outlive its entry. The rules are plain functions of a path (or a
 * parsed file), and the last block plants a violation of each to prove they bite.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { REPO_ROOT, expectAtLeast, nodeLine, parse, parseText, sourceFiles } from '@/tests/support/source-tree';

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PASCAL = /^[A-Z][A-Za-z0-9]*$/;
const UPPER_SNAKE = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/;

/**
 * Kebab-case .tsx files in components/, besides everything under components/og/ (the next/og
 * ImageResponse factories and the primitives they share: the metadata routes call them, they are not
 * React components a page renders).
 */
const KEBAB_TSX: Record<string, string> = {
  'components/standings/table/cells.tsx': 'the standings table\'s small cell components and their helpers (rowHref, dash), shared by the phone and desktop tables',
  'components/standings/table/parts.tsx': 'the row-level parts (PinNote, TeamRowLink, TeamNameCell, LadderLineRow) shared by the phone and desktop tables',
};
const OG_ROOT = 'components/og/';

/** The .ts files in components/ outside hooks/ and head/: non-JSX modules that sit beside the components that use them. */
const COMPONENT_TS: Record<string, string> = {
  'components/game-row/game-log-grid.ts': 'the grid template of the game-log row, shared by GameLogRow and its header',
  'components/game-row/parts/sentence-tails.ts': 'the sentence tails of the game row\'s screen-reader summary (strings, no JSX)',
  'components/game-row/props.ts': 'the props contract of the game-row family (types and defaults)',
  'components/og/png.ts': 'the PNG response helper of the ImageResponse kit',
  'components/standings/table/desktop-columns.ts': 'the desktop table\'s column definitions (data, no JSX)',
};
const COMPONENT_TS_DIRS = ['components/hooks/', 'components/head/'];

/** Directories whose -view.ts entry is not named after the directory, and why. */
const VIEW_ENTRY_NAMES: Record<string, string> = {
  'views/site/chrome-view.ts': 'the site chrome (header, footer, nav) is built for every page: views/site is a toolbox, chrome is its one view',
};

const basenameOf = (file: string): string => path.posix.basename(file).replace(/\.(tsx?|mts|mjs|js)$/, '');
const dirOf = (file: string): string => path.posix.dirname(file);

/** Everything wrong with the name or location of one source file (empty when it is fine). */
export function nameProblems(file: string): string[] {
  const problems: string[] = [];
  const base = basenameOf(file);

  if (base === 'index') problems.push('no index files: import the module by its own name (no barrels)');

  if (file.startsWith('components/')) {
    if (file.endsWith('.tsx')) {
      const allowed = file.startsWith(OG_ROOT) ? KEBAB.test(base) || PASCAL.test(base) : file in KEBAB_TSX;
      if (!PASCAL.test(base) && !allowed) problems.push('a component file is PascalCase (kebab .tsx only under components/og/ and in KEBAB_TSX)');
    } else if (file.endsWith('.ts')) {
      if (!KEBAB.test(base)) problems.push('a .ts module is kebab-case');
      if (!COMPONENT_TS_DIRS.some((dir) => file.startsWith(dir)) && !(file in COMPONENT_TS))
        problems.push('components/ holds .ts only under hooks/ and head/ (or listed in COMPONENT_TS): view models are views/');
    }
  }

  if (file.startsWith('views/') || file.startsWith('lib/')) {
    if (file.endsWith('.tsx')) problems.push('no .tsx under lib/ or views/: JSX is components/');
    if (!KEBAB.test(base)) problems.push('lib/ and views/ files are kebab-case');
  }

  if (file.startsWith('lib/') && /-(schema|view|build)$/.test(base)) problems.push('a lib basename never ends in -schema, -view or -build (the directory says it)');

  if (/-(view|route|client)$/.test(base) && /^(lib|components|app)\//.test(file)) problems.push('the -view, -route and -client suffixes belong to views/');
  if (file.startsWith('views/') && base.endsWith('-view')) {
    const area = base.slice(0, -'-view'.length);
    const dir = path.posix.basename(dirOf(file));
    if (area !== dir && `${area}s` !== dir && !(file in VIEW_ENTRY_NAMES)) problems.push(`a views entry is <area>-view.ts in the directory <area> (found ${base} in ${dir}/)`);
  }
  return problems;
}

/** Runtime exports of a parsed file whose name is neither PascalCase nor UPPER_SNAKE: [name, line]. */
export function exportProblems(sf: ts.SourceFile): [string, number][] {
  const typeNames = new Set<string>();
  for (const st of sf.statements) if (ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st)) typeNames.add(st.name.text);

  const found: [string, number][] = [];
  const check = (name: string, node: ts.Node) => {
    if (!PASCAL.test(name) && !UPPER_SNAKE.test(name)) found.push([name, nodeLine(sf, node)]);
  };
  const exported = (st: ts.Statement): boolean =>
    ts.canHaveModifiers(st) && (ts.getModifiers(st) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  const isDefault = (st: ts.Statement): boolean =>
    ts.canHaveModifiers(st) && (ts.getModifiers(st) ?? []).some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);

  for (const st of sf.statements) {
    if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st) || ts.isEnumDeclaration(st)) && exported(st)) {
      // `export default function () {}` has no name to judge.
      if (st.name) check(st.name.text, st.name);
      else if (!isDefault(st)) found.push(['(anonymous)', nodeLine(sf, st)]);
    } else if (ts.isVariableStatement(st) && exported(st)) {
      for (const decl of st.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) check(decl.name.text, decl.name);
        else found.push(['(destructured)', nodeLine(sf, decl)]);
      }
    } else if (ts.isExportDeclaration(st) && !st.isTypeOnly && st.exportClause && ts.isNamedExports(st.exportClause)) {
      for (const el of st.exportClause.elements) {
        const local = (el.propertyName ?? el.name).text;
        if (el.isTypeOnly || (!st.moduleSpecifier && typeNames.has(local))) continue;
        check(el.name.text, el);
      }
    } else if (ts.isExportAssignment(st) && !ts.isIdentifier(st.expression)) {
      found.push(['(default expression)', nodeLine(sf, st)]);
    }
  }
  return found;
}

const sources = sourceFiles({ roots: ['app', 'components', 'views', 'lib', 'scripts', 'tests'] });
const componentFiles = sources.filter((f) => f.startsWith('components/'));

describe('file names', () => {
  it('every source file is named by the conventions', () => {
    expectAtLeast(600, sources, 'source files');
    const bad = sources.flatMap((file) => nameProblems(file).map((p) => `${file}: ${p}`));
    expect(bad).toEqual([]);
  });

  it('components/ is PascalCase .tsx, with kebab only where listed', () => {
    const tsx = componentFiles.filter((f) => f.endsWith('.tsx'));
    expectAtLeast(150, tsx, 'component files');
    const kebab = tsx.filter((f) => !PASCAL.test(basenameOf(f)));
    expect(kebab.filter((f) => !f.startsWith(OG_ROOT) && !(f in KEBAB_TSX))).toEqual([]);
  });

  it('views entries, route modules and client slices exist where the suffixes say', () => {
    const views = sources.filter((f) => f.startsWith('views/'));
    expectAtLeast(40, views, 'views files');
    expectAtLeast(10, views.filter((f) => f.endsWith('-view.ts')), 'views entries');
    expectAtLeast(5, views.filter((f) => f.endsWith('-route.ts')), 'route modules');
    expectAtLeast(3, views.filter((f) => f.endsWith('-client.ts')), 'client slices');
    const perDir = new Map<string, string[]>();
    for (const f of views.filter((x) => x.endsWith('-view.ts'))) perDir.set(dirOf(f), [...(perDir.get(dirOf(f)) ?? []), f]);
    expect([...perDir].filter(([, files]) => files.length > 1)).toEqual([]);
  });

  it('no lib or views file lives outside .ts', () => {
    const odd = sources.filter((f) => (f.startsWith('lib/') || f.startsWith('views/')) && !f.endsWith('.ts'));
    expect(odd).toEqual([]);
  });

  it('every allowance still names a file', () => {
    for (const file of [...Object.keys(KEBAB_TSX), ...Object.keys(COMPONENT_TS), ...Object.keys(VIEW_ENTRY_NAMES)]) {
      expect(existsSync(path.join(REPO_ROOT, file)), `${file} is gone: delete its allowance`).toBe(true);
    }
    for (const dir of [OG_ROOT, ...COMPONENT_TS_DIRS]) expectAtLeast(1, sources.filter((f) => f.startsWith(dir)), dir);
  });
});

describe('component exports', () => {
  // The names a component file exports are what other files import: PascalCase for a component, UPPER_SNAKE for a
  // constant or a class table; anything else is a helper that does not belong in a component file. These thirteen
  // lowercase helpers predate the rule. Each is either exported only so its test can reach it (the client modules
  // NavLink and TeamFinder, whose first-load JS has about 36 B of headroom on /teams, so moving their helpers into a
  // sibling module is a budget measurement of its own), or is read by a sibling component. The ledger may only shrink:
  // a helper that moves to a kebab module (components/hooks/, views/, lib/shared/) loses its entry, and a new entry
  // needs a reason here.
  const KNOWN_EXCEPTIONS: Record<string, string[]> = {
    'components/game-row/parts/GameClockOrStatus.tsx': ['clockWords'],
    'components/layout/NavLink.tsx': ['isActive', 'pageLeagueOf', 'navTarget'],
    'components/og/LeagueStandingsCard.tsx': ['leagueStandingsImage'],
    'components/search/TeamFinder.tsx': ['pinResultDetail', 'resultDetail', 'finderView'],
    'components/teams/TeamIdentity.tsx': ['pinSelfCss'],
    'components/ui/FormStrip.tsx': ['toFormEntries'],
    'components/ui/GridRowFiller.tsx': ['fillerClasses'],
    'components/ui/ScoreGlyph.tsx': ['nameClass'],
    'components/ui/TeamMonogram.tsx': ['monogramRadius'],
  };

  it('a PascalCase .tsx exports only components, UPPER_SNAKE constants and types', () => {
    const files = componentFiles.filter((f) => f.endsWith('.tsx') && PASCAL.test(basenameOf(f)));
    expectAtLeast(120, files, 'PascalCase component files');
    const bad = files.flatMap((file) =>
      exportProblems(parse(file))
        .filter(([name]) => !(KNOWN_EXCEPTIONS[file] ?? []).includes(name))
        .map(([name, line]) => `${file}:${line} exports ${name}`),
    );
    expect(bad).toEqual([]);
  });

  it('every exception still exports its helper', () => {
    const stale = Object.entries(KNOWN_EXCEPTIONS).flatMap(([file, names]) => {
      const exported = existsSync(path.join(REPO_ROOT, file)) ? exportProblems(parse(file)).map(([name]) => name) : [];
      return names.filter((name) => !exported.includes(name)).map((name) => `${file}: ${name}`);
    });
    expect(stale, 'delete the exception: the helper moved or is no longer exported').toEqual([]);
  });
});

describe('the rules bite', () => {
  // Paths are assembled from parts so that tests/arch/citations.test.ts does not read the planted names as citations.
  const at = (...parts: string[]): string => parts.join('/');

  it('names', () => {
    const planted: [string, RegExp][] = [
      [at('components', 'ui', 'pill-group.tsx'), /PascalCase/],
      [at('components', 'ui', 'helpers.ts'), /hooks\/ and head\//],
      [at('components', 'ui', 'Foo.ts'), /hooks\/ and head\//],
      [at('views', 'home', 'HomeView.ts'), /kebab/],
      [at('views', 'home', 'panel.tsx'), /no \.tsx/],
      [at('lib', 'shared', 'thing-schema.ts'), /-schema, -view or -build/],
      [at('lib', 'shared', 'thing-build.ts'), /-schema, -view or -build/],
      [at('lib', 'shared', 'index.ts'), /no index/],
      [at('lib', 'shared', 'other-view.ts'), /-view, -route and -client/],
      [at('components', 'ui', 'Foo-route.ts'), /hooks\/ and head\/|belong to views\b/],
      [at('views', 'home', 'team-view.ts'), /<area>-view\.ts/],
    ];
    for (const [file, expected] of planted) expect(nameProblems(file).join('; '), file).toMatch(expected);
    for (const fine of [
      at('components', 'ui', 'PillGroup.tsx'),
      at('components', 'og', 'primitives.tsx'),
      at('components', 'hooks', 'use-league.ts'),
      at('views', 'teams', 'team-view.ts'),
      at('views', 'clubs', 'club-view.ts'),
      at('views', 'schedule', 'rail-client.ts'),
      at('lib', 'schema', 'snapshot.ts'),
    ])
      expect(nameProblems(fine), fine).toEqual([]);
  });

  it('exports', () => {
    const names = (text: string) => exportProblems(parseText(at('components', 'ui', 'Probe.tsx'), text)).map(([name]) => name);
    expect(names('export function helper() {}\nexport const Fine = 1;\nexport const LIMIT = 2;\nexport class Table {}')).toEqual(['helper']);
    expect(names('export const dash = 1;\nconst Local = 1;\nexport { Local as local };')).toEqual(['dash', 'local']);
    expect(names('export interface props {}\nexport type kind = 1;\ninterface shape {}\nexport { type shape };\nexport { shape as ok };')).toEqual([]);
    expect(names('export default function Thing() {}')).toEqual([]);
    expect(names('export const { a } = obj;')).toEqual(['(destructured)']);
  });
});
