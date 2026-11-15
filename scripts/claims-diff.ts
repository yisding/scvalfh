#!/usr/bin/env tsx
/**
 * The byte-diff check of the pipeline inversion (dev only, not in CI): every offline corpus, each variant over
 * all-2026-10-02, each base corpus again with its own output (and claims file) as the previous run, and the si.com
 * cases (not read, down and read whole after a run with fills, from that run and from the committed snapshot and
 * claims file; a rule-2 game MaxPreps lists later), through scripts/fetch-data.ts on a revision (default HEAD,
 * checked out as a temporary git worktree) and on the working tree. Prints one line per run and file, and exits 1
 * when any snapshot.json or snapshot.meta.json differs.
 *
 *   pnpm tsx scripts/claims-diff.ts              HEAD against the working tree
 *   pnpm tsx scripts/claims-diff.ts --rev <rev>  another revision against the working tree
 *
 * Reads only the committed corpora: no network.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { runCliIfMain } from './cli';

interface Case {
  name: string;
  sport: string;
  args: string[];
  /** Start from this earlier case's output (snapshot and claims file), or from the tree's committed `data/` ('data'). */
  after?: string;
}

/** The variants the si.com cases read, written into the run's temporary directory (`$V` in a case's args). */
function writeVariants(dir: string): void {
  const write = (name: string, files: Record<string, string | number>, extra: Record<string, string> = {}) => {
    mkdirSync(path.join(dir, name), { recursive: true });
    for (const [rel, body] of Object.entries(extra)) writeFileSync(path.join(dir, name, rel), body, 'utf8');
    writeFileSync(path.join(dir, name, 'manifest.json'), JSON.stringify({ id: name, files }), 'utf8');
  };
  // Every si.com request of the all corpus's run answers 503: si.com is down.
  const down: Record<string, number> = {};
  for (let d = Date.UTC(2026, 8, 16); d <= Date.UTC(2026, 9, 6); d += 86_400_000) down[`sblive/scores/${new Date(d).toISOString().slice(0, 10)}`] = 503;
  for (const team of ['carmel', 'greenfield', 'hollister', 'salinas', 'santa-catalina', 'stevenson']) down[`sblive/team-games/${team}`] = 503;
  write('sblive-down', down);
  // Santa Catalina's feed lists the 9/4 Greenfield game si.com's rule 2 published as sblive:6541425.
  const cat = JSON.parse(readFileSync(`${C}/all-2026-10-02/maxpreps/schedule/santa-catalina.json`, 'utf8')) as { data: unknown[] };
  const row = JSON.parse(readFileSync('tests/fixtures/pipeline/santa-catalina-gre-0904-row.json', 'utf8')) as unknown;
  write('gre-listed', { 'maxpreps/schedule/santa-catalina': 'santa-catalina.json' }, { 'santa-catalina.json': JSON.stringify({ ...cat, data: [...cat.data, row] }) });
}

const C = 'tests/fixtures/corpus';
const VARIANTS = ['bval-meta-wrong-season', 'bval-revised', 'finals-regression', 'leland-feed-503', 'mcal-postseason', 'pcal-standings-empty'];
const BASES: Array<[string, string, string]> = [
  ['all', 'all-2026-10-02', 'field-hockey'],
  ['eal', 'eal-2026-10-04', 'field-hockey'],
  ['socal', 'socal-2026-10-06', 'field-hockey'],
  ['volleyball', 'volleyball-2026-11-14', 'volleyball'],
];

const CASES: Case[] = [
  ...BASES.map(([name, corpus, sport]): Case => ({ name, sport, args: ['--fixtures', `${C}/${corpus}`] })),
  ...VARIANTS.map((v): Case => ({ name: `all+${v}`, sport: 'field-hockey', args: ['--fixtures', `${C}/all-2026-10-02`, '--variant', `${C}/variants/${v}`] })),
  ...BASES.map(([name, corpus, sport]): Case => ({ name: `${name}-again`, sport, args: ['--fixtures', `${C}/${corpus}`], after: name })),
  { name: 'all-leland-again', sport: 'field-hockey', args: ['--fixtures', `${C}/all-2026-10-02`, '--variant', `${C}/variants/leland-feed-503`], after: 'all' },
  ...sbliveCases(),
];

function sbliveCases(): Case[] {
  const all = ['--fixtures', `${C}/all-2026-10-02`];
  const accept = ['--accept-regression', 'scval,bval,pcal,mcal,eal,sunset,city,north-county,metro,independents'];
  const fh = (name: string, args: string[], after: string): Case => ({ name, sport: 'field-hockey', args: [...all, ...args, ...accept], after });
  return [
    fh('all-nosblive', ['--no-sblive'], 'all'),
    fh('all-sblive-down', ['--variant', '$V/sblive-down'], 'all'),
    fh('all-nosblive-again', ['--no-sblive', '--leagues', 'pcal,scval'], 'all-nosblive'),
    fh('all-sblive-full', ['--sblive-full'], 'all'),
    fh('all-gre-listed', ['--variant', '$V/gre-listed'], 'all'),
    fh('data-all', [], 'data'),
    fh('data-all-nosblive', ['--no-sblive'], 'data'),
    fh('data-all-sblive-down', ['--variant', '$V/sblive-down'], 'data'),
  ];
}

function runAll(tree: string, out: string, variants: string): void {
  for (const c of CASES) {
    const dir = path.join(out, c.name);
    mkdirSync(dir, { recursive: true });
    const snapshot = path.join(dir, 'snapshot.json');
    if (c.after) {
      const from = c.after === 'data' ? path.join(tree, 'data') : path.join(out, c.after);
      copyFileSync(path.join(from, 'snapshot.json'), snapshot);
      const claims = path.join(from, 'claims.json');
      if (existsSync(claims)) copyFileSync(claims, path.join(dir, 'claims.json'));
    }
    const args = c.args.map((a) => a.replace('$V', variants));
    const res = spawnSync(path.join(tree, 'node_modules', '.bin', 'tsx'), ['scripts/fetch-data.ts', ...args, '--out', snapshot], {
      cwd: tree,
      encoding: 'utf8',
      env: { ...process.env, SCVAL_SPORT: c.sport },
    });
    if (res.status !== 0) throw new Error(`${c.name} in ${tree} exited ${res.status}: ${res.stderr.slice(-500)}`);
  }
}

export async function main(argv: readonly string[]): Promise<number> {
  let rev = 'HEAD';
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--rev' && argv[i + 1] !== undefined) rev = argv[(i += 1)];
    else throw new Error(`unknown flag: ${argv[i]}`);
  }
  const repo = process.cwd();
  const work = mkdtempSync(path.join(tmpdir(), 'scvalfh-claims-diff-'));
  const base = path.join(work, 'base');
  execFileSync('git', ['worktree', 'add', '--detach', base, rev], { cwd: repo, stdio: 'ignore' });
  let differ = -1;
  try {
    symlinkSync(path.join(repo, 'node_modules'), path.join(base, 'node_modules'), 'dir');
    const variants = path.join(work, 'variants');
    writeVariants(variants);
    runAll(base, path.join(work, 'out-base'), variants);
    runAll(repo, path.join(work, 'out-tree'), variants);
    differ = 0;
    for (const c of CASES) {
      for (const f of ['snapshot.json', 'snapshot.meta.json']) {
        const same = readFileSync(path.join(work, 'out-base', c.name, f)).equals(readFileSync(path.join(work, 'out-tree', c.name, f)));
        if (!same) differ += 1;
        console.log(`${same ? 'identical' : 'DIFFERENT'}  ${c.name}/${f}`);
      }
    }
    console.log(`claims-diff: ${rev} against the working tree, ${CASES.length} runs: ${differ === 0 ? 'every snapshot and meta file identical' : `${differ} files differ (outputs kept in ${work})`}`);
    return differ === 0 ? 0 : 1;
  } finally {
    execFileSync('git', ['worktree', 'remove', '--force', base], { cwd: repo, stdio: 'ignore' });
    if (differ === 0) rmSync(work, { recursive: true, force: true });
  }
}

runCliIfMain(import.meta.url, main);
