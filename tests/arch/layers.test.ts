/**
 * The dependency rule. The directory is the layer: this file is the one place that says which
 * directory may import which, and it reads every import (`import type` and `import('x').T`
 * included, since a type edge couples two modules as surely as a value edge) of every file under
 * SOURCE_ROOTS through tests/support/source-tree.ts.
 *
 * Ranks (a module imports only its own rank or below, plus the LEAVES):
 *
 *   0 lib/model                types only; imports nothing but lib/model
 *   1 lib/shared, lib/format   client-safe pure helpers and copy
 *   2 lib/config               season, base URLs, league config (lib/config/leagues.ts door + lib/config/leagues/)
 *   3 lib/registry             the team registry (lib/registry/teams.ts door)
 *   4 lib/schema               zod schemas
 *   5 lib/engine               standings, classify, postseason, ratings … (pure)
 *   6 lib/snapshot             check, migrate, load
 *   7 lib/datasets             the only importers of data/**
 *   8 lib/queries              the snapshot-bound read API
 *   9 views                    view models
 *  10 components               rendering
 *  11 app                      route files
 *
 * The ingestion side (lib/{sources,official,cli,pipeline}) sits beside the ranks: it
 * builds the snapshot, so it may use everything up to lib/snapshot but never the read side
 * (datasets, queries, views, components, app), and nothing ranked may import it. Within it, the
 * HTTP clients and parsers of lib/sources import neither lib/pipeline nor lib/official.
 *
 * Rules, as printed in a failure line `from → to (rule x)`:
 *   (a) a ranked module imports only ranks <= its own plus LEAVES; lib/model imports only lib/model
 *   (b) a ranked module never imports INGESTION, scripts or tests
 *   (c) INGESTION imports ranks <= 6, INGESTION and LEAVES only
 *   (d) lib/sources never imports lib/pipeline or lib/official
 *   (e) only lib/datasets/** imports data/** (tests exempt)
 *   (f) package doors: a part of lib/config/leagues/, lib/registry/ or lib/engine/standings/ is
 *       imported only through its door or from inside its directory (tests exempt)
 *   (g) no import cycle inside lib/, views/ or components/
 *   (h) a views/**\/*-client.ts module imports only ranks 0-1, LEAVES and other *-client modules
 *   (i) scripts and app never import tests
 *   (j) components never import lib/queries/** or lib/datasets/** (app/** may): a component renders
 *       what its page or view model hands it (views/site/chrome-view.ts for the site chrome), so the
 *       snapshot is read in exactly two layers, views and app
 * The LEAVES themselves import nothing but other LEAVES.
 *
 * tests/arch/client-boundary.test.ts is the runtime half for 'use client' graphs; ESLint
 * (eslint.config.mjs: import/no-restricted-paths, import/no-cycle) repeats only the top-level
 * directions as editor feedback. The ranks are owned here.
 */
import { describe, expect, it } from 'vitest';

import {
  LEAVES,
  SOURCE_ROOTS,
  expectAtLeast,
  importsOf,
  moduleFile,
  moduleOf,
  resolveModule,
  sourceFiles,
} from '@/tests/support/source-tree';

/** Directory prefix → rank. A module belongs to the longest prefix it starts with. */
const LAYERS: ReadonlyArray<readonly [prefix: string, rank: number]> = [
  ['lib/model/', 0],
  ['lib/shared/', 1],
  ['lib/format/', 1],
  ['lib/config/', 2],
  ['lib/registry/', 3],
  ['lib/schema/', 4],
  ['lib/engine/', 5],
  ['lib/snapshot/', 6],
  ['lib/datasets/', 7],
  ['lib/queries/', 8],
  ['views/', 9],
  ['components/', 10],
  ['app/', 11],
];

/** The ingestion side: builds the snapshot, never reads it back through the read API. */
const INGESTION: readonly string[] = ['sources', 'official', 'cli', 'pipeline'].map((dir) => `lib/${dir}/`);

/** The highest rank INGESTION may import (lib/snapshot). */
const INGESTION_MAX_RANK = 6;

/** The snapshot read API, which views/ and app/ read and components/ never do (rule j). */
const READ_API: readonly string[] = ['lib/queries/', 'lib/datasets/'];

/**
 * Package doors: the parts inside `dir` are imported only by `door` or from inside `dir`, except the
 * `public` parts (module paths). Tests are exempt (they unit-test parts and vi.doMock seeds).
 */
const DOORS: ReadonlyArray<{ door: string; dir: string; public: readonly string[] }> = [
  {
    door: 'lib/config/leagues',
    dir: 'lib/config/leagues/',
    public: ['lib/config/leagues/labels', 'lib/config/leagues/tiebreak-stages', 'lib/config/leagues/official'],
  },
  {
    door: 'lib/registry/teams',
    dir: 'lib/registry/',
    public: ['lib/registry/teams', 'lib/registry/resolve', 'lib/registry/jv-teams'],
  },
  { door: 'lib/engine/standings', dir: 'lib/engine/standings/', public: [] },
];

type Layer =
  | { kind: 'ranked'; rank: number }
  | { kind: 'ingestion' }
  | { kind: 'scripts' }
  | { kind: 'tests' }
  | { kind: 'data' }
  | { kind: 'unclassified' };

/** Which layer a module path (no extension) belongs to. */
function layerOf(mod: string): Layer {
  if (mod === 'data' || mod.startsWith('data/')) return { kind: 'data' };
  if (INGESTION.some((prefix) => mod.startsWith(prefix))) return { kind: 'ingestion' };
  if (mod.startsWith('scripts/')) return { kind: 'scripts' };
  if (mod.startsWith('tests/')) return { kind: 'tests' };
  let best: { prefix: string; rank: number } | null = null;
  for (const [prefix, rank] of LAYERS) {
    if (mod.startsWith(prefix) && (best === null || prefix.length > best.prefix.length)) best = { prefix, rank };
  }
  return best ? { kind: 'ranked', rank: best.rank } : { kind: 'unclassified' };
}

const isLeaf = (mod: string): boolean => LEAVES.includes(mod);
const isViewClient = (mod: string): boolean => mod.startsWith('views/') && mod.endsWith('-client');

/** One import: the importing file and line, and the module it names. */
type Edge = { file: string; line: number; to: string };

/** The rules (a)-(f) and (h)-(j) one import breaks, as letters. Rule (g) is a property of the whole graph. */
function rulesBroken({ file, to }: Edge): string[] {
  const from = moduleOf(file);
  const source = layerOf(from);
  const target = layerOf(to);
  const broken: string[] = [];
  if (source.kind === 'tests') return broken;

  if (source.kind === 'ranked') {
    if (from.startsWith('lib/model/')) {
      if (!to.startsWith('lib/model/')) broken.push('a');
    } else if (target.kind === 'ranked') {
      if (target.rank > source.rank && !isLeaf(to)) broken.push('a');
    } else if (target.kind === 'ingestion' || target.kind === 'scripts' || target.kind === 'tests') {
      broken.push('b');
    } else if (target.kind === 'unclassified') {
      broken.push('a');
    }
  }
  if (source.kind === 'ingestion') {
    const allowed =
      target.kind === 'ingestion' || target.kind === 'data' || (target.kind === 'ranked' && (target.rank <= INGESTION_MAX_RANK || isLeaf(to)));
    if (!allowed) broken.push('c');
  }
  if (from.startsWith('lib/sources/') && (to.startsWith('lib/pipeline/') || to.startsWith('lib/official/'))) broken.push('d');
  if (target.kind === 'data' && !from.startsWith('lib/datasets/')) broken.push('e');
  for (const { door, dir, public: open } of DOORS) {
    if (to.startsWith(dir) && !open.includes(to) && from !== door && !from.startsWith(dir)) broken.push('f');
  }
  if (isViewClient(from)) {
    const allowed = isLeaf(to) || isViewClient(to) || (target.kind === 'ranked' && target.rank <= 1);
    if (!allowed) broken.push('h');
  }
  if ((source.kind === 'scripts' || from.startsWith('app/')) && target.kind === 'tests') broken.push('i');
  if (from.startsWith('components/') && READ_API.some((prefix) => to.startsWith(prefix))) broken.push('j');
  return broken;
}

/** Every cycle of the module graph `edges` spans, one representative path per strongly connected component. */
function cyclesOf(edges: ReadonlyArray<readonly [from: string, to: string]>): string[][] {
  const next = new Map<string, Set<string>>();
  for (const [from, to] of edges) {
    if (!next.has(from)) next.set(from, new Set());
    next.get(from)!.add(to);
  }
  // Tarjan's strongly connected components.
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const components: string[][] = [];
  let counter = 0;
  const visit = (node: string): void => {
    index.set(node, counter);
    low.set(node, counter);
    counter += 1;
    stack.push(node);
    onStack.add(node);
    for (const to of next.get(node) ?? []) {
      if (!index.has(to)) {
        visit(to);
        low.set(node, Math.min(low.get(node)!, low.get(to)!));
      } else if (onStack.has(to)) {
        low.set(node, Math.min(low.get(node)!, index.get(to)!));
      }
    }
    if (low.get(node) === index.get(node)) {
      const component: string[] = [];
      let member: string;
      do {
        member = stack.pop()!;
        onStack.delete(member);
        component.push(member);
      } while (member !== node);
      if (component.length > 1 || next.get(node)?.has(node)) components.push(component.sort());
    }
  };
  for (const node of [...next.keys()].sort()) if (!index.has(node)) visit(node);

  // One shortest cycle through the first member of each component (breadth-first inside it).
  return components.map((component) => {
    const members = new Set(component);
    const start = component[0];
    const parent = new Map<string, string>();
    const queue = [start];
    while (queue.length > 0) {
      const node = queue.shift()!;
      for (const to of next.get(node) ?? []) {
        if (!members.has(to)) continue;
        if (to === start) {
          const path = [start];
          for (let at = node; at !== start; at = parent.get(at)!) path.splice(1, 0, at);
          return [...path, start];
        }
        if (!parent.has(to)) {
          parent.set(to, node);
          queue.push(to);
        }
      }
    }
    return [...component, start];
  });
}

const FILES = sourceFiles({ roots: SOURCE_ROOTS, ext: ['.ts', '.tsx', '.mts', '.mjs', '.js'] });

/** Every import of every source file that names a repo module (packages left out). */
const EDGES: readonly Edge[] = FILES.flatMap((file) =>
  importsOf(file).flatMap(({ spec, line }) => {
    const to = resolveModule(file, spec);
    return to === null ? [] : [{ file, line, to }];
  }),
);

/** The roots rule (g) checks for cycles (an edge between two of them can only point down, rule a). */
const CYCLE_ROOTS: readonly string[] = ['lib/', 'views/', 'components/'];

const inCycleRoots = (mod: string): boolean => CYCLE_ROOTS.some((root) => mod.startsWith(root));

const CYCLE_EDGES = EDGES.filter(({ file, to }) => inCycleRoots(file) && inCycleRoots(to)).map(
  ({ file, to }) => [moduleOf(file), to] as const,
);

const lineOf = ({ file, line, to }: Edge, rule: string) => `${file}:${line} → ${to} (rule ${rule})`;

describe('layers: the dependency rule', () => {
  it('reads the whole import graph', () => {
    expectAtLeast(500, EDGES, 'import edges');
    expectAtLeast(1000, CYCLE_EDGES, 'lib/, views/ and components/ import edges');
  });

  it('every lib/, views/, components/ and app/ module has a layer', () => {
    const unclassified = FILES.map(moduleOf).filter((mod) => !mod.startsWith('scripts/') && !mod.startsWith('tests/') && layerOf(mod).kind === 'unclassified');
    expect(unclassified, 'add the directory to LAYERS or INGESTION in tests/arch/layers.test.ts').toEqual([]);
  });

  it('every LEAF exists and imports nothing but other LEAVES', () => {
    for (const leaf of LEAVES) {
      const file = moduleFile(leaf);
      expect(file, `${leaf} is listed in LEAVES but does not exist`).not.toBeNull();
      const imports = importsOf(file!).map(({ spec }) => resolveModule(file!, spec) ?? spec);
      expect(imports.filter((mod) => !isLeaf(mod)), `${leaf} must stay import-free`).toEqual([]);
    }
  });

  it('no import breaks rules (a)-(f) or (h)-(j)', () => {
    const failures = EDGES.flatMap((edge) => rulesBroken(edge).map((rule) => lineOf(edge, rule)));
    expect(failures).toEqual([]);
  });

  it('only the package doors re-export (no barrels, no shims)', () => {
    const doors = DOORS.map(({ door }) => door);
    const reexports = FILES.filter((file) => !doors.includes(moduleOf(file))).flatMap((file) =>
      importsOf(file)
        .filter(({ form }) => form === 'export')
        .map(({ spec, line }) => `${file}:${line} re-exports from ${spec}`),
    );
    expect(reexports, 'import the name where it is used; only DOORS re-export').toEqual([]);
  });

  it('no import cycle inside lib/, views/ or components/ (rule g)', () => {
    const cycles = cyclesOf(CYCLE_EDGES).map((cycle) => `${cycle.join(' → ')} (rule g)`);
    expect(cycles).toEqual([]);
  });

  // ---------------------------------------------------------------- the rules catch what they claim to

  describe('self-tests on synthetic imports (real module paths, so a probe is a real-looking edge)', () => {
    const broken = (file: string, to: string) => rulesBroken({ file, line: 1, to });
    const views = (...parts: string[]) => ['views', ...parts].join('/');

    it('(a) upward imports and lib/model importing out', () => {
      expect(broken('lib/engine/classify.ts', 'lib/queries/games')).toEqual(['a']);
      expect(broken('lib/config/leagues.ts', 'lib/registry/teams')).toEqual(['a']);
      expect(broken('lib/model/game.ts', 'lib/config/season')).toEqual(['a']);
      expect(broken('lib/model/game.ts', 'lib/model/ids')).toEqual([]);
      expect(broken('lib/shared/game-id.ts', 'lib/config/season')).toEqual([]);
      expect(broken('lib/queries/games.ts', 'lib/engine/classify')).toEqual([]);
      expect(broken('components/game-row/GameRow.tsx', 'views/shared/describe-game')).toEqual([]);
      expect(broken('components/game-row/GameRow.tsx', 'app/page')).toEqual(['a']);
    });

    it('(b) ranked modules never reach ingestion, scripts or tests', () => {
      expect(broken('lib/registry/resolve.ts', 'lib/sources/cifss')).toEqual(['b']);
      expect(broken('lib/engine/classify.ts', 'lib/pipeline/contract')).toEqual(['b']);
      expect(broken('app/page.tsx', 'scripts/lib/cli')).toEqual(['b']);
      expect(broken('components/game-row/GameRow.tsx', 'tests/support/repo')).toEqual(['b']);
    });

    it('(c) ingestion stays below the read side', () => {
      expect(broken('lib/pipeline/run.ts', 'lib/queries/games')).toEqual(['c']);
      expect(broken('lib/pipeline/run.ts', 'lib/datasets/snapshot')).toEqual(['c']);
      expect(broken('lib/official/match.ts', 'components/game-row/GameRow')).toEqual(['c']);
      expect(broken('lib/pipeline/run.ts', 'scripts/lib/cli')).toEqual(['c']);
      expect(broken('lib/pipeline/run.ts', 'lib/snapshot/check')).toEqual([]);
      expect(broken('lib/pipeline/run.ts', 'lib/sources/http/client')).toEqual([]);
    });

    it('(d) sources import neither the pipeline nor lib/official', () => {
      expect(broken('lib/sources/maxpreps/client.ts', 'lib/pipeline/contract')).toEqual(['d']);
      expect(broken('lib/sources/scval/grid.ts', 'lib/official/bundle')).toEqual(['d']);
      expect(broken('lib/pipeline/contract.ts', 'lib/sources/http/raw-response')).toEqual([]);
    });

    it('(e) only lib/datasets imports data/**', () => {
      expect(broken('lib/queries/games.ts', 'data/snapshot.json')).toEqual(['e']);
      expect(broken('lib/pipeline/run.ts', 'data/snapshot.json')).toEqual(['e']);
      expect(broken('scripts/fetch-data.ts', 'data/snapshot.json')).toEqual(['e']);
      expect(broken('lib/datasets/snapshot.ts', 'data/snapshot.json')).toEqual([]);
      expect(broken('tests/lib/queries/standings.test.ts', 'data/snapshot.json')).toEqual([]);
    });

    it('(f) package parts only through their doors', () => {
      expect(broken('components/game-row/GameRow.tsx', 'lib/registry/team-list')).toEqual(['f']);
      expect(broken('lib/queries/standings.ts', 'lib/engine/standings/ladder')).toEqual(['f']);
      expect(broken('lib/registry/resolve.ts', 'lib/config/leagues/scval')).toEqual(['f']);
      expect(broken('lib/registry/teams.ts', 'lib/registry/team-list')).toEqual([]);
      expect(broken('lib/engine/standings.ts', 'lib/engine/standings/ladder')).toEqual([]);
      expect(broken('lib/config/leagues.ts', 'lib/config/leagues/scval')).toEqual([]);
      expect(broken('lib/queries/standings.ts', 'lib/config/leagues/labels')).toEqual([]);
      expect(broken('lib/sources/cifss.ts', 'lib/registry/resolve')).toEqual([]);
      expect(broken('tests/lib/registry/teams.test.ts', 'lib/registry/scval')).toEqual([]);
    });

    it('(g) a cycle is found, with its path', () => {
      expect(
        cyclesOf([
          ['lib/engine/classify', 'lib/engine/postseason'],
          ['lib/engine/postseason', 'lib/engine/season-record'],
          ['lib/engine/season-record', 'lib/engine/classify'],
          ['lib/engine/classify', 'lib/model/game'],
        ]),
      ).toEqual([['lib/engine/classify', 'lib/engine/postseason', 'lib/engine/season-record', 'lib/engine/classify']]);
      expect(cyclesOf([['lib/engine/classify', 'lib/model/game']])).toEqual([]);
    });

    it('(h) a views *-client module stays client-safe', () => {
      const client = `${views('home', 'home-client')}.ts`;
      expect(broken(client, 'lib/format/words')).toEqual([]);
      expect(broken(client, 'lib/config/mascots')).toEqual([]);
      expect(broken(client, views('shared', 'game-display-client'))).toEqual([]);
      expect(broken(client, 'lib/config/leagues')).toEqual(['h']);
      expect(broken(client, views('home', 'home-view'))).toEqual(['h']);
    });

    it('(i) scripts and app never import tests', () => {
      expect(broken('scripts/fetch-data.ts', 'tests/support/repo')).toEqual(['i']);
      expect(broken('app/page.tsx', 'tests/support/repo')).toEqual(['b', 'i']);
      expect(broken('tests/lib/queries/standings.test.ts', 'scripts/lib/cli')).toEqual([]);
    });

    it('(j) components never read the snapshot; views and app do', () => {
      expect(broken('components/game-row/GameRow.tsx', 'lib/queries/games')).toEqual(['j']);
      expect(broken('components/layout/SiteHeader.tsx', 'lib/queries/phase')).toEqual(['j']);
      expect(broken('components/history/AwardsBlock.tsx', 'lib/datasets/history')).toEqual(['j']);
      expect(broken('views/site/chrome-view.ts', 'lib/queries/phase')).toEqual([]);
      expect(broken('app/layout.tsx', 'lib/datasets/snapshot')).toEqual([]);
      expect(broken('components/standings/table/cells.tsx', 'lib/model/standings')).toEqual([]);
    });

    it('the LEAVES are importable from every rank', () => {
      expect(broken('lib/model/game.ts', 'lib/config/invariant')).toEqual(['a']);
      expect(broken('lib/format/words.ts', 'lib/config/source-urls')).toEqual([]);
      expect(broken('lib/sources/maxpreps/client.ts', 'lib/config/season')).toEqual([]);
    });
  });
});
