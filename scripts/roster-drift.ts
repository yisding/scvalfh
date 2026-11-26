#!/usr/bin/env tsx
/**
 * Prints the roster drift of one sport's overlay files (lib/players/roster-drift.ts): the records of its
 * rosters-enrichment.json and clubs.json, and of data/player-accounts.json and data/commitments.json as its rows
 * show them, that the current MaxPreps rosters no longer support, which the loaders leave out of the build instead
 * of failing it.
 *
 *   SCVAL_SPORT=soccer pnpm roster-drift              one line per drift; exit 0
 *   pnpm roster-drift --all                           every sport that lists players, one after another, then
 *                                                     data/player-identity.json
 *   pnpm roster-drift --identity                      data/player-identity.json alone: the curation the registry
 *                                                     build no longer finds in any source (scripts/build-players.ts)
 *   pnpm roster-drift --github                        also a `::warning` annotation per drift (the refreshes)
 *   pnpm roster-drift --json                          the drift as a JSON array, nothing else (the tests)
 *   pnpm roster-drift --base origin/main              exit 1 on drift the change itself made (CI on a pull request)
 *
 * With `--base <ref>`, drift on a player whose records in that file are exactly what <ref> has is inherited: a
 * roster refresh made it, and it is only reported. Drift on a player whose records the change added or edited
 * is the change's own (a mistyped athleteId, a grade filled over MaxPreps' own) and fails the run, as the
 * loaders' throw used to. A file <ref> does not have counts as empty.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { runCliIfMain } from './cli';
import { driftFilePath, isPersonKeyed, type DriftFile, type RosterDrift } from '../lib/players/roster-drift';
import { SPORT_IDS } from '../lib/sports/current';

interface Options {
  all: boolean;
  identity: boolean;
  github: boolean;
  json: boolean;
  base: string | null;
}

function parse(argv: readonly string[]): Options {
  const o: Options = { all: false, identity: false, github: false, json: false, base: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') o.all = true;
    else if (a === '--identity') o.identity = true;
    else if (a === '--github') o.github = true;
    else if (a === '--json') o.json = true;
    else if (a === '--base') {
      const ref = argv[++i];
      if (!ref || ref.startsWith('--')) throw new Error('--base needs a git ref');
      o.base = ref;
    } else throw new Error(`unknown argument ${a}`);
  }
  if (o.all && o.json) throw new Error('--json reads one sport: set SCVAL_SPORT instead of --all');
  if (o.all && o.identity) throw new Error('--all already reads data/player-identity.json');
  return o;
}

/** Stable JSON: the same object always prints the same, whatever order its keys were written in. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v !== null && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

type Raw = Record<string, unknown>;

/**
 * What a record of a file filed by person says, as stable JSON, without the keys it is filed under (the id and the
 * name build-players rewrites): what decides whether a drift on it is the change's own. A recruiting page is its
 * URL and the class year it states, which is all the loaders check it by.
 */
function personContent(file: DriftFile, r: Record<string, unknown>): string[] {
  if (file === 'player-accounts') return ((r.accounts ?? []) as Array<{ url: string; classOf: number | null }>).map((a) => `${a.url} ${a.classOf}`);
  const keys = new Set(['playerId', 'name', 'teamSlug', 'athleteId', 'fullName']);
  return [stable(Object.fromEntries(Object.entries(r).filter(([k]) => !keys.has(k))))];
}

/**
 * Each player's records in one overlay file, as stable JSON, keyed as RosterDrift.key is: `<team> <athleteId>` for
 * the roster overlay, which names rows; the person's registry id for the files filed by person (isPersonKeyed). An
 * overlay record is read without `profiles`, which it held until 2026-11-26 (data/player-accounts.json since).
 */
function recordsByPlayer(file: DriftFile, raw: Raw | null): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const add = (key: string, r: string[]) => out.set(key, [...(out.get(key) ?? []), ...r]);
  if (raw === null) return out;
  const list = (name: string) => (Array.isArray(raw[name]) ? (raw[name] as Array<Record<string, unknown>>) : []);
  if (file === 'rosters-enrichment') {
    for (const t of list('teams')) {
      for (const p of (t.players ?? []) as Array<Record<string, unknown>>) {
        add(`${String(t.slug)} ${String(p.athleteId ?? '')}`, [stable(Object.fromEntries(Object.entries(p).filter(([k]) => k !== 'profiles')))]);
      }
    }
  } else {
    const records = file === 'player-accounts' ? list('players') : file === 'clubs' ? list('memberships') : list('commitments');
    for (const r of records) add(String(r.playerId), personContent(file, r));
  }
  return out;
}

/**
 * A person's records as a base from before 2026-11-26 held them, when the files filed by person did not exist yet:
 * her recruiting pages on the rows every sport's overlay and JV profiles stamped with her id, her club ties in the
 * sport's affiliations and JV affiliations, her commitment in any sport's commits.json. So the change that moved
 * them is not taken for one that made what they say.
 */
function legacyRecords(file: DriftFile, dataDir: string, base: string, playerId: string): string[] {
  const mine = (r: Record<string, unknown>) => r.playerId === playerId;
  const rows = (raw: Raw | null, name: string) => (raw && Array.isArray(raw[name]) ? (raw[name] as Array<Record<string, unknown>>) : []);
  if (file === 'clubs') {
    const raw = readAt(base, `${dataDir}/clubs.json`);
    return [...rows(raw, 'affiliations'), ...rows(raw, 'jvAffiliations')].filter(mine).flatMap((r) => personContent(file, r));
  }
  const out: string[] = [];
  for (const sport of SPORT_IDS) {
    if (file === 'commitments') {
      out.push(...rows(readAt(base, `data/${sport}/commits.json`), 'commitments').filter(mine).flatMap((r) => personContent(file, r)));
      continue;
    }
    for (const name of ['rosters-enrichment.json', 'jv-profiles.json']) {
      for (const t of rows(readAt(base, `data/${sport}/${name}`), 'teams')) {
        for (const p of ((t.players ?? []) as Array<Record<string, unknown>>).filter(mine)) out.push(...personContent(file, { accounts: p.profiles ?? [] }));
      }
    }
  }
  return out;
}

/** The file at `rel` as `ref` has it, or as the working tree has it (ref null), or null when there is none. */
function readAt(ref: string | null, rel: string): Raw | null {
  try {
    const text = ref === null ? readFileSync(rel, 'utf8') : execFileSync('git', ['show', `${ref}:${rel}`], { encoding: 'utf8', maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'ignore'] });
    return JSON.parse(text) as Raw;
  } catch {
    return null;
  }
}

/** Whether `d` is on a player whose records in its file are as `base` has them. */
function inherited(d: RosterDrift, dataDir: string, base: string): boolean {
  const rel = driftFilePath(d.file, dataDir);
  const key = isPersonKeyed(d.file) ? d.key : `${d.teamSlug} ${d.key}`;
  // The overlay the loader read: lib/players/rosters.ts honours SCVAL_ROSTERS_ENRICHMENT (the tests swap a file in).
  const current = d.file === 'rosters-enrichment' && process.env.SCVAL_ROSTERS_ENRICHMENT ? process.env.SCVAL_ROSTERS_ENRICHMENT : rel;
  const now = recordsByPlayer(d.file, readAt(null, current)).get(key) ?? [];
  const baseRaw = readAt(base, rel);
  // A base from before the person-filed files (no such file, or a clubs.json with no memberships) held them elsewhere.
  const legacy = isPersonKeyed(d.file) && (baseRaw === null || (d.file === 'clubs' && !Array.isArray(baseRaw.memberships)));
  const then = legacy ? legacyRecords(d.file, dataDir, base, d.key) : (recordsByPlayer(d.file, baseRaw).get(key) ?? []);
  const set = (xs: string[]) => [...new Set(xs)].sort().join('\n');
  return isPersonKeyed(d.file) ? set(now) === set(then) : now.length === then.length && [...now].sort().join('\n') === [...then].sort().join('\n');
}

/** The children `--all` runs: every sport whose build lists players; then the curation file, here. */
async function allSports(o: Options, argv: readonly string[]): Promise<number> {
  const { SPORT_IDS, SPORT_LISTS_PLAYERS } = await import('../lib/sports/current');
  const self = fileURLToPath(import.meta.url);
  let code = 0;
  for (const sport of SPORT_IDS.filter((s) => SPORT_LISTS_PLAYERS[s])) {
    const run = spawnSync(process.execPath, [...process.execArgv, self, ...argv.filter((a) => a !== '--all')], {
      env: { ...process.env, SCVAL_SPORT: sport },
      stdio: 'inherit',
    });
    if (run.status !== 0) code = 1;
  }
  return Math.max(code, await identity(o));
}

/** Prints one label's drift; returns how many the change itself made (`mine`). */
function report(o: Options, label: string, drift: readonly RosterDrift[], mine: (d: RosterDrift) => boolean, describe: (d: RosterDrift) => string): number {
  let own = 0;
  for (const d of drift) {
    const made = o.base !== null && mine(d);
    if (made) own++;
    const line = `${label} ${describe(d)}${made ? ` — not in ${o.base}: this change made it` : ''}`;
    console.log(line);
    if (o.github) console.log(`::${made ? 'error' : 'warning'} title=Roster drift (${label})::${line}`);
  }
  console.log(`${label}: ${drift.length} roster drift${drift.length === 1 ? '' : 's'}${o.base !== null ? `, ${own} this change made` : ''}`);
  return own;
}

const IDENTITY_FILE = 'data/player-identity.json';

/**
 * data/player-identity.json's drift: what the registry build (lib/players/registry-build.ts) finds no source for.
 * An entry is the change's own unless the base has it exactly as it is.
 */
async function identity(o: Options): Promise<number> {
  const { readBuildInput } = await import('../lib/players/registry-file');
  const { buildRegistry, identityDriftKey } = await import('../lib/players/registry-build');
  const { describeDrift } = await import('../lib/players/roster-drift');
  const drift: RosterDrift[] = [];
  buildRegistry(readBuildInput(process.cwd(), 'scripts/roster-drift.ts'), { onDrift: (d) => drift.push(d) });
  type Entry = { sport: string; team: string; name?: string; careerIds?: string[] };
  const entriesByKey = (raw: Raw | null): Map<string, string[]> => {
    const out = new Map<string, string[]>();
    for (const section of ['sameAs', 'rowSplits', 'distinct', 'names']) {
      for (const e of (raw?.[section] ?? []) as Entry[]) {
        const key = `${e.team} ${identityDriftKey(section, e.sport, e.name ?? (e.careerIds ?? []).join(' / '))}`;
        out.set(key, [...(out.get(key) ?? []), stable(e)]);
      }
    }
    return out;
  };
  const now = entriesByKey(readAt(null, IDENTITY_FILE));
  const then = o.base === null ? new Map<string, string[]>() : entriesByKey(readAt(o.base, IDENTITY_FILE));
  const same = (a: string[] = [], b: string[] = []) => a.length === b.length && [...a].sort().join('\n') === [...b].sort().join('\n');
  const mine = (d: RosterDrift) => !same(now.get(`${d.teamSlug} ${d.key}`), then.get(`${d.teamSlug} ${d.key}`));
  if (o.json) {
    process.stdout.write(`${JSON.stringify(drift)}\n`);
    return o.base !== null && drift.some(mine) ? 1 : 0;
  }
  return report(o, 'registry', drift, mine, describeDrift) > 0 ? 1 : 0;
}

export async function main(argv: readonly string[]): Promise<number> {
  const o = parse(argv);
  if (o.all) return allSports(o, argv);
  if (o.identity) return identity(o);
  const { DATA_DIR, SPORT_ID, HAS_RECRUITING } = await import('../lib/sports/current');
  await import('../lib/players/rosters');
  // The clubs and commitments are joined only by the builds with recruiting pages; a build without them serves neither.
  if (HAS_RECRUITING) {
    await import('../lib/players/clubs');
    await import('../lib/players/commits');
  }
  await import('../lib/jv/jv-profiles');
  const { describeDrift, getRosterDrift } = await import('../lib/players/roster-drift');
  const drift = getRosterDrift();
  // The verdict does not depend on the output: --json --base still fails on drift the change made.
  const made = drift.map((d) => o.base !== null && !inherited(d, DATA_DIR, o.base));
  if (o.json) {
    process.stdout.write(`${JSON.stringify(drift)}\n`);
    return made.some(Boolean) ? 1 : 0;
  }
  const own = report(o, SPORT_ID, drift, (d) => made[drift.indexOf(d)], describeDrift);
  return own > 0 ? 1 : 0;
}

runCliIfMain(import.meta.url, main);
