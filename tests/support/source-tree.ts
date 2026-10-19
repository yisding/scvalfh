/**
 * The source-tree scanner every tests/arch/ rule is built on.
 *
 * One definition of "the source" (which directories, which extensions, what is excluded), one parse
 * per file (the TypeScript compiler, so comments and strings never count as code), one import
 * reader and one specifier resolver. The architecture tests differ in WHAT they look for, never in
 * how they walk, parse or resolve, so a new top-level directory or a new import form is taught here
 * once. tests/arch/source-roots.test.ts fails when a directory holding source is in neither
 * SOURCE_ROOTS nor IGNORED_TOP_LEVEL, so a root cannot be forgotten silently.
 *
 * It imports nothing from the app: the arch project runs without the snapshot, the registry or any
 * spawned script (tests/support/repo.ts pulls in the schema layer, so this module finds the repo
 * root itself).
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';
import { expect } from 'vitest';

/** The repository root: tests/support/ is two levels below it. */
export const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');

// ---------------------------------------------------------------- what the source is

/** The directories whose .ts/.tsx/.mts/.mjs/.js files are the repo's own source. */
export const SOURCE_ROOTS: readonly string[] = ['app', 'components', 'views', 'lib', 'scripts', 'tests'];

/** Inside SOURCE_ROOTS, captured and frozen data that is not source. */
export const EXCLUDED: readonly string[] = ['tests/fixtures/', 'tests/golden/'];

/**
 * The directories whose files build or render a page (route files, components, view models): the
 * id-literal and URL-template bans apply here.
 */
export const PAGE_CODE_ROOTS: readonly string[] = ['app', 'components', 'views'];

/**
 * The import-free leaves of lib/config (module paths, no extension): the season constants, the
 * third-party base URLs, the invariant error and the mascot table. Any layer may import them and
 * they import nothing but each other (lib/config/season.ts reads MAXPREPS_WEB from
 * lib/config/source-urls.ts), so they are client-safe as well (tests/arch/layers.test.ts,
 * tests/arch/client-boundary.test.ts).
 */
export const LEAVES: readonly string[] = ['lib/config/season', 'lib/config/source-urls', 'lib/config/invariant', 'lib/config/mascots'];

/**
 * Top-level directories that hold no source of ours (data, docs, vendored code, build output,
 * tooling state). Every other top-level directory containing a .ts/.tsx/.mjs file must be in
 * SOURCE_ROOTS (tests/arch/source-roots.test.ts). `.git` is listed too: it is never scanned.
 */
export const IGNORED_TOP_LEVEL: readonly string[] = [
  'data',
  'docs',
  'public',
  'patches',
  'node_modules',
  '.next',
  'dist',
  '.vinext',
  '.cloudflare',
  '.claude',
  '.github',
  '.git',
];

const DEFAULT_EXT: readonly string[] = ['.ts', '.tsx', '.mts', '.mjs', '.js'];

/** Extensions of the files whose module specifiers resolve to code. */
const CODE_EXT = /\.(ts|tsx|mts|js|mjs|jsx)$/;

export const toPosix = (file: string): string => file.split(path.sep).join('/');

const textOf = new Map<string, string>();

/** The text of a repo-relative file (read once). */
export function readSource(file: string): string {
  let text = textOf.get(file);
  if (text === undefined) {
    text = readFileSync(path.join(REPO_ROOT, file), 'utf8');
    textOf.set(file, text);
  }
  return text;
}

const listed = new Map<string, readonly string[]>();

/** Every file under one directory, repo-relative and posix (symlinks and directories left out). */
function filesIn(root: string): string[] {
  const dir = path.join(REPO_ROOT, root);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => toPosix(path.relative(REPO_ROOT, path.join(entry.parentPath, entry.name))));
}

/** Every source-candidate file under one root, sorted; fixtures, goldens, node_modules and .d.ts out. */
function filesUnder(root: string): readonly string[] {
  let files = listed.get(root);
  if (!files) {
    files = filesIn(root)
      .filter((file) => !file.endsWith('.d.ts') && !file.includes('/node_modules/'))
      .filter((file) => !EXCLUDED.some((x) => file.startsWith(x)))
      .sort();
    listed.set(root, files);
  }
  return files;
}

/** The source files under `roots` with one of `ext`: repo-relative, posix, sorted, memoized walk. */
export function sourceFiles({
  roots = SOURCE_ROOTS,
  ext = DEFAULT_EXT,
}: { roots?: readonly string[]; ext?: readonly string[] } = {}): readonly string[] {
  return roots.flatMap(filesUnder).filter((file) => ext.some((e) => file.endsWith(e))).sort();
}

/** The top-level directories (outside IGNORED_TOP_LEVEL) that hold at least one .ts/.tsx/.mts/.mjs file. */
export function topLevelSourceDirs(): string[] {
  const dirs: string[] = [];
  for (const entry of readdirSync(REPO_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory() || IGNORED_TOP_LEVEL.includes(entry.name)) continue;
    const holdsSource = filesIn(entry.name).some((f) => !f.includes('/node_modules/') && !f.endsWith('.d.ts') && /\.(ts|tsx|mts|mjs)$/.test(f));
    if (holdsSource) dirs.push(entry.name);
  }
  return dirs.sort();
}

// ---------------------------------------------------------------- parsing

function scriptKind(file: string): ts.ScriptKind {
  if (file.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (file.endsWith('.ts') || file.endsWith('.mts')) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

/** Parses `text` as if it were the file `file` (synthetic sources for a rule's own self-tests). */
export function parseText(file: string, text: string): ts.SourceFile {
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind(file));
}

const parsed = new Map<string, ts.SourceFile>();

/** The parsed source of a repo-relative file (parsed once). */
export function parse(file: string): ts.SourceFile {
  let sf = parsed.get(file);
  if (!sf) {
    sf = parseText(file, readSource(file));
    parsed.set(file, sf);
  }
  return sf;
}

/** The 1-based line of a node. */
export function nodeLine(sf: ts.SourceFile, node: ts.Node): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

/** True when the file's directive prologue holds `'use client'`. */
export function isUseClient(sf: ts.SourceFile): boolean {
  for (const statement of sf.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) return false;
    if (statement.expression.text === 'use client') return true;
  }
  return false;
}

// ---------------------------------------------------------------- imports

export type ImportForm = 'import' | 'export' | 'dynamic' | 'require' | 'type';

export interface ImportRef {
  /** The module specifier exactly as written. */
  spec: string;
  line: number;
  /** True when the import vanishes at compile time: `import type`, an all-`type` specifier list, `import('x').T`. */
  typeOnly: boolean;
  form: ImportForm;
  /** The bindings named from the module (`import { a as b }` names `a`; `import('x').T.U` names `T`). */
  names: readonly string[];
}

function leftmost(q: ts.EntityName): string {
  let left: ts.EntityName = q;
  while (ts.isQualifiedName(left)) left = left.left;
  return left.text;
}

/**
 * Every module reference in a file: `import`, `export … from`, dynamic `import('…')`, `require('…')`,
 * `import x = require('…')` and `import('…')` TYPES (always type-only). A declaration is type-only
 * when it is `import type` / `export type`, or when its braces name at least one binding and every
 * one is `type`-prefixed (and no default or namespace binding rides along).
 */
export function importsOf(source: string | ts.SourceFile, { runtimeOnly = false } = {}): ImportRef[] {
  const sf = typeof source === 'string' ? parse(source) : source;
  const refs: ImportRef[] = [];
  const add = (node: ts.Node, ref: Omit<ImportRef, 'line'>) => {
    if (runtimeOnly && ref.typeOnly) return;
    refs.push({ ...ref, line: nodeLine(sf, node) });
  };

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const named = clause?.namedBindings && ts.isNamedImports(clause.namedBindings) ? clause.namedBindings.elements : [];
      // A default binding riding along with the braces is a runtime import, whatever the braces say.
      const allTypeBraces = clause?.name === undefined && named.length > 0 && named.every((el) => el.isTypeOnly);
      add(node, {
        spec: node.moduleSpecifier.text,
        typeOnly: clause?.isTypeOnly === true || allTypeBraces,
        form: 'import',
        names: named.map((el) => (el.propertyName ?? el.name).text),
      });
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const named = node.exportClause && ts.isNamedExports(node.exportClause) ? node.exportClause.elements : [];
      add(node, {
        spec: node.moduleSpecifier.text,
        typeOnly: node.isTypeOnly || (named.length > 0 && named.every((el) => el.isTypeOnly)),
        form: 'export',
        names: named.map((el) => (el.propertyName ?? el.name).text),
      });
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      ts.isStringLiteral(node.moduleReference.expression)
    ) {
      add(node, { spec: node.moduleReference.expression.text, typeOnly: node.isTypeOnly, form: 'require', names: [] });
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      add(node, {
        spec: node.argument.literal.text,
        typeOnly: true,
        form: 'type',
        names: node.qualifier ? [leftmost(node.qualifier)] : [],
      });
    } else if (ts.isCallExpression(node) && node.arguments.length > 0 && ts.isStringLiteralLike(node.arguments[0])) {
      const callee = node.expression;
      if (callee.kind === ts.SyntaxKind.ImportKeyword) {
        add(node, { spec: node.arguments[0].text, typeOnly: false, form: 'dynamic', names: [] });
      } else if (ts.isIdentifier(callee) && callee.text === 'require') {
        add(node, { spec: node.arguments[0].text, typeOnly: false, form: 'require', names: [] });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return refs;
}

/**
 * A module specifier as a repo-relative module path: `@/lib/x` and `../x` resolved from `fromFile`,
 * a code extension and a trailing `/index` dropped (`.json` stays). Null for a package.
 */
export function resolveModule(fromFile: string, spec: string): string | null {
  let target: string;
  if (spec.startsWith('@/')) target = spec.slice(2);
  else if (spec.startsWith('.')) target = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), spec));
  else return null;
  return target.replace(CODE_EXT, '').replace(/\/index$/, '');
}

/** The module path of a repo-relative file: its code extension and a trailing `/index` dropped. */
export function moduleOf(file: string): string {
  return file.replace(CODE_EXT, '').replace(/\/index$/, '');
}

/** The repo-relative file a module path (from resolveModule) names on disk, or null. */
export function moduleFile(module: string): string | null {
  const isFile = (rel: string) => existsSync(path.join(REPO_ROOT, rel)) && statSync(path.join(REPO_ROOT, rel)).isFile();
  if (isFile(module)) return module;
  for (const ext of ['.ts', '.tsx', '.mts', '.js', '.mjs', '.jsx']) if (isFile(module + ext)) return module + ext;
  for (const ext of ['.ts', '.tsx', '.mts', '.js', '.mjs', '.jsx']) if (isFile(`${module}/index${ext}`)) return `${module}/index${ext}`;
  return null;
}

// ---------------------------------------------------------------- lexing

/**
 * The source with every comment and string literal replaced by spaces of the same length.
 *
 * Positions are preserved, so a span computed here indexes the ORIGINAL text. Blanking is what
 * makes the paren matching of a text scan safe — and it is also why the prose of a comment
 * explaining `prefetch={false}` can never be mistaken for the prop itself.
 */
export function blank(src: string): string {
  const out = src.split('');
  const blankRange = (from: number, to: number) => {
    for (let i = from; i < to && i < out.length; i += 1) if (out[i] !== '\n') out[i] = ' ';
  };
  let i = 0;
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === '//') {
      const end = src.indexOf('\n', i);
      blankRange(i, end === -1 ? src.length : end);
      i = end === -1 ? src.length : end;
    } else if (two === '/*') {
      const end = src.indexOf('*/', i + 2);
      blankRange(i, end === -1 ? src.length : end + 2);
      i = end === -1 ? src.length : end + 2;
    } else if (src[i] === "'" || src[i] === '"' || src[i] === '`') {
      const quote = src[i];
      let j = i + 1;
      while (j < src.length && src[j] !== quote) j += src[j] === '\\' ? 2 : 1;
      blankRange(i + 1, j);
      i = j + 1;
    } else {
      i += 1;
    }
  }
  return out.join('');
}

// ---------------------------------------------------------------- vacuity

/**
 * A scan that silently matched nothing would pass for ever: every rule states how much it must have
 * seen. `found` is a count or the list that was found.
 */
export function expectAtLeast(n: number, found: number | readonly unknown[], what: string): void {
  const count = typeof found === 'number' ? found : found.length;
  expect(count, `${what}: found ${count}, expected at least ${n} (the scan went vacuous)`).toBeGreaterThanOrEqual(n);
}

// ---------------------------------------------------------------- citations (tests/arch/citations.test.ts)

export type Citation = { file: string; line: number; token: string };

export const PATH_TOKEN =
  /(?<![\w@./-])(?:app|components|views|lib|scripts|tests|docs|data|public|patches|\.github)\/[A-Za-z0-9_.@[\]()/-]*[A-Za-z0-9_\]]/g;

/** A token cut short by a glob, a placeholder or an ellipsis is a pattern, not a citation. */
const PATTERN_AFTER = /^(?:\/|-)?(?:[*?{}<>$|]|\.\.\.|…)/;
const PATTERN_BEFORE = /(?:\.\.\.|…)$/;

const RESOLVE_SUFFIXES = ['', '.ts', '.tsx', '.mts', '.mjs', '.md', '.json', '.yml', '.test.ts', '/index.ts'];

/** The frozen-path table of docs/CITATIONS.md: where it lives. */
export const CITATIONS_DOC = 'docs/CITATIONS.md';

/** Every tracked file that exists in the working tree. */
export function trackedFiles(): string[] {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return out.split('\0').filter((f) => f !== '' && existsSync(path.join(REPO_ROOT, f)));
}

export const hasExtension = (file: string, extensions: readonly string[]): boolean =>
  extensions.some((ext) => file.endsWith(ext));

/** Blank `needle` wherever it occurs, keeping the newlines so line numbers hold. */
export function mask(text: string, needle: string): string {
  return text.split(needle).join(needle.replace(/[^\n]/g, ' '));
}

/** The 1-based line of the character at `index` in `text`. */
export function lineOf(text: string, index: number): number {
  let line = 1;
  for (let i = text.indexOf('\n'); i !== -1 && i < index; i = text.indexOf('\n', i + 1)) line += 1;
  return line;
}

/** Every path token in `text`, patterns (globs, placeholders, ellipses) skipped. */
export function pathTokens(file: string, text: string): Citation[] {
  const found: Citation[] = [];
  for (const m of text.matchAll(PATH_TOKEN)) {
    const end = m.index + m[0].length;
    if (PATTERN_AFTER.test(text.slice(end, end + 4))) continue;
    if (PATTERN_BEFORE.test(text.slice(Math.max(0, m.index - 3), m.index))) continue;
    // `lib/data.ts(12,3)` (a tsc diagnostic) cites lib/data.ts; an unclosed `(layout|search)` is a pattern.
    const token = m[0].replace(/\(\d[^)]*\)?$/, '');
    if ((token.match(/\(/g) ?? []).length !== (token.match(/\)/g) ?? []).length) continue;
    found.push({ file, line: lineOf(text, m.index), token });
  }
  return found;
}

/** True when a quoted path names a file or directory (with the extensions a citation may drop). */
export function pathResolves(token: string): boolean {
  return RESOLVE_SUFFIXES.some((suffix) => existsSync(path.join(REPO_ROOT, token + suffix)));
}

/** The first column of docs/CITATIONS.md's frozen-path table (the rows, not the header). */
export function frozenTableRows(): Set<string> {
  const rows = new Set<string>();
  let inTable = false;
  for (const line of readSource(CITATIONS_DOC).split('\n')) {
    if (/^\|\s*Quoted path\s*\|\s*Current home\s*\|\s*Item\s*\|/.test(line)) {
      inTable = true;
      continue;
    }
    if (!inTable) continue;
    if (!line.startsWith('|')) break;
    const first = line.split('|')[1]?.trim().replace(/^`|`$/g, '') ?? '';
    if (first === '' || /^:?-+:?$/.test(first)) continue;
    rows.add(first);
  }
  return rows;
}

/** docs/CITATIONS.md quotes the OLD path of every row; those cells are the table, not citations. */
export function maskFrozenTable(text: string): string {
  let inTable = false;
  return text
    .split('\n')
    .map((line) => {
      if (/^\|\s*Quoted path\s*\|/.test(line)) {
        inTable = true;
        return line;
      }
      if (!inTable) return line;
      if (!line.startsWith('|')) {
        inTable = false;
        return line;
      }
      const cells = line.split('|');
      cells[1] = (cells[1] ?? '').replace(/[^\n]/g, ' ');
      return cells.join('|');
    })
    .join('\n');
}
