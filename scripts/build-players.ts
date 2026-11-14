#!/usr/bin/env tsx
/**
 * Build data/players.json, the player registry (lib/players/registry-schema.ts): one record per
 * person across every sport and season the repository holds, from every roster, overlay, stat
 * sheet, school list and all-league list in it.
 *
 *   pnpm build-players             rebuild the registry, and write each player's id into the
 *                                  hand-curated files that name players
 *   pnpm build-players --check     build and compare: exit 1 when a run would change a file
 *   pnpm build-players --dry-run   build and report, write nothing
 *   pnpm build-players --review    also list everything left for a person to decide
 *   pnpm build-players --no-stamp  leave the curated files alone
 *
 * One run covers every sport whatever SCVAL_SPORT is: a player is one person in every sport.
 * It reads only files in the repository and fetches nothing, so it is safe to run at any time; run
 * it after `pnpm fetch-rosters`, after editing an overlay or data/player-identity.json, and BEFORE a
 * season rollover overwrites the rosters (a season this file has seen stays in it; one it has not
 * is gone with the files).
 *
 * Ids are stable: a rebuild keeps every id the previous file gave (lib/players/registry-build.ts).
 *
 * STAMPING. data/clubs.json, data/commits.json, data/rosters-enrichment.json and data/jv-profiles.json
 * name a player by team and MaxPreps' per-season athlete id (or, for JV profiles, by team and name),
 * which a new season makes meaningless. Each record gains a `playerId`, written beside that key and
 * never read by the site: the durable half of the join, which is what a rollover re-keys from.
 * Nothing else in those files is touched. A file is rewritten only when an id in it changes, and then
 * as JSON.stringify writes it (two-space indent, a final newline), which is how all four are kept.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { buildRegistry } from '../lib/players/registry-build';
import { PLAYERS_FILE, readBuildInput, sportDataDir } from '../lib/players/registry-file';
import type { PlayersFile } from '../lib/players/registry-schema';
import { SPORT_IDS, type SportId } from '../lib/sports/current';
import { stableStringify } from '../lib/stable-json';
import { runCliIfMain } from './cli';

const USAGE = 'Usage: pnpm build-players [--check | --dry-run] [--review] [--no-stamp]';

interface Args {
  check: boolean;
  dryRun: boolean;
  review: boolean;
  stamp: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = { check: false, dryRun: false, review: false, stamp: true };
  for (const flag of argv) {
    if (flag === '--check') args.check = true;
    else if (flag === '--dry-run') args.dryRun = true;
    else if (flag === '--review') args.review = true;
    else if (flag === '--no-stamp') args.stamp = false;
    else throw new Error(`unknown flag ${flag}\n${USAGE}`);
  }
  return args;
}

type Json = Record<string, unknown>;

/** `record` with `playerId` set right after `after`, every other key in its place. */
function withPlayerId(record: Json, after: string, id: string): Json {
  const out: Json = {};
  for (const [k, v] of Object.entries(record)) {
    if (k === 'playerId') continue;
    out[k] = v;
    if (k === after) out.playerId = id;
  }
  if (!('playerId' in out)) out.playerId = id;
  return out;
}

export interface StampIndex {
  /** `<sport> <season> <team> <athleteId>` → player id. */
  byAthlete: Map<string, string>;
  /** `<sport> <season> <team> <profile url>` → player id. */
  byProfile: Map<string, string>;
}

export function stampIndex(file: PlayersFile): StampIndex {
  const byAthlete = new Map<string, string>();
  const byProfile = new Map<string, string>();
  for (const p of file.players) {
    for (const s of p.stints) {
      for (const o of s.observations) {
        if (o.athleteId) byAthlete.set(`${s.sport} ${s.season} ${s.team} ${o.athleteId}`, p.id);
        if (o.src === 'profile' && o.url) byProfile.set(`${s.sport} ${s.season} ${s.team} ${o.url}`, p.id);
      }
    }
  }
  return { byAthlete, byProfile };
}

/**
 * One sport's curated files with `playerId` set on every record the registry can place. Returns the
 * new text of each file that would change, and what could not be placed.
 */
export function stampCuratedFiles(root: string, sport: SportId, index: StampIndex): { changed: Map<string, string>; unplaced: string[] } {
  const dir = sportDataDir(sport);
  const changed = new Map<string, string>();
  const unplaced: string[] = [];
  const load = (name: string): { rel: string; text: string; json: Json } | null => {
    const rel = `${dir}/${name}`;
    const file = path.join(root, rel);
    if (!existsSync(file)) return null;
    const text = readFileSync(file, 'utf8');
    return { rel, text, json: JSON.parse(text) as Json };
  };
  // A file is rewritten only when an id in it changes: one a person saved with other line endings
  // or escapes is not "changed" by that. When it is rewritten, it is as JSON.stringify writes it.
  const finish = (f: { rel: string; text: string; json: Json }, json: Json) => {
    if (JSON.stringify(json) !== JSON.stringify(f.json)) changed.set(f.rel, `${JSON.stringify(json, null, 2)}\n`);
  };
  const byAthlete = (season: unknown, team: unknown, athleteId: unknown, label: string): string | null => {
    const id = index.byAthlete.get(`${sport} ${String(season)} ${String(team)} ${String(athleteId)}`);
    if (!id) unplaced.push(label);
    return id ?? null;
  };

  for (const [name, lists] of [['clubs.json', ['affiliations', 'jvAffiliations']], ['commits.json', ['commitments']]] as const) {
    const f = load(name);
    if (!f) continue;
    const json = { ...f.json };
    for (const list of lists) {
      if (!Array.isArray(json[list])) continue;
      json[list] = (json[list] as Json[]).map((r) => {
        const id = byAthlete(json.season, r.teamSlug, r.athleteId, `${f.rel} ${list}: ${String(r.teamSlug)} / ${String(r.fullName)}`);
        return id ? withPlayerId(r, 'athleteId', id) : r;
      });
    }
    finish(f, json);
  }

  const overlay = load('rosters-enrichment.json');
  if (overlay && Array.isArray(overlay.json.teams)) {
    const json = {
      ...overlay.json,
      teams: (overlay.json.teams as Json[]).map((t) => ({
        ...t,
        players: ((t.players as Json[] | undefined) ?? []).map((r) => {
          const id = byAthlete(overlay.json.season, t.slug, r.athleteId, `${overlay.rel}: ${String(t.slug)} / ${String(r.fullName)}`);
          return id ? withPlayerId(r, 'athleteId', id) : r;
        }),
      })),
    };
    finish(overlay, json);
  }

  const profiles = load('jv-profiles.json');
  if (profiles && Array.isArray(profiles.json.teams)) {
    const json = {
      ...profiles.json,
      teams: (profiles.json.teams as Json[]).map((t) => ({
        ...t,
        players: ((t.players as Json[] | undefined) ?? []).map((r) => {
          const urls = ((r.profiles as Json[] | undefined) ?? []).map((x) => String(x.url));
          const ids = new Set(urls.flatMap((u) => index.byProfile.get(`${sport} ${String(profiles.json.season)} ${String(t.slug)} ${u}`) ?? []));
          if (ids.size !== 1) {
            unplaced.push(`${profiles.rel}: ${String(t.slug)} / ${String(r.name)}`);
            return r;
          }
          return withPlayerId(r, 'name', [...ids][0]);
        }),
      })),
    };
    finish(profiles, json);
  }
  return { changed, unplaced };
}

export function main(argv: readonly string[]): number {
  const args = parseArgs(argv);
  const root = process.cwd();
  const input = readBuildInput(root, 'scripts/build-players.ts');
  for (const line of input.skipped) console.warn(`WARN ${line}`);
  const file = buildRegistry(input);
  const text = stableStringify(file);
  const out = path.join(root, PLAYERS_FILE);
  const before = existsSync(out) ? readFileSync(out, 'utf8') : null;

  const c = file.counts;
  console.log(
    `build-players: ${input.built.map((b) => `${b.sport} ${b.season}${b.sources ? ' (topped up)' : ''}`).join(', ')}\n` +
      `${c.players} players (${c.withCareer} with a MaxPreps career, ${c.nameOnly} known by name) · ${c.stints} stints · ` +
      `${c.observations} observations · ${c.multiSeason} in more than one season · ${c.multiSport} in more than one sport\n` +
      `${c.stintConflicts} conflicts inside a stint · ${c.classOfConflicts} class-year conflicts · ${c.review} for review`,
  );
  if (input.previous) {
    const had = new Set(input.previous.players.flatMap((p) => [p.id, ...p.formerIds]));
    const has = new Set(file.players.flatMap((p) => [p.id, ...p.formerIds]));
    const gone = [...had].filter((id) => !has.has(id));
    const added = file.players.filter((p) => !had.has(p.id)).length;
    console.log(`${added} new player(s) · ${gone.length} id(s) no source lists any more${gone.length ? `: ${gone.slice(0, 12).join(', ')}${gone.length > 12 ? ', …' : ''}` : ''}`);
  }
  if (args.review) {
    const kinds = new Map<string, number>();
    for (const r of file.review) kinds.set(r.kind, (kinds.get(r.kind) ?? 0) + 1);
    console.log(`\nfor review: ${[...kinds].map(([k, n]) => `${k} ${n}`).join(' · ') || 'nothing'}`);
    for (const r of file.review) console.log(`  ${r.kind.padEnd(22)} ${r.sport} ${r.team}: ${r.names.join(' / ')} — ${r.note}`);
  }

  const writes = new Map<string, string>();
  if (text !== before) writes.set(PLAYERS_FILE, text);
  if (args.stamp) {
    const index = stampIndex(file);
    for (const sport of SPORT_IDS) {
      const { changed, unplaced } = stampCuratedFiles(root, sport, index);
      for (const [rel, body] of changed) writes.set(rel, body);
      for (const u of unplaced) console.warn(`WARN no player for ${u}`);
    }
  }

  if (writes.size === 0) {
    console.log('\nno change: every file is as a build would write it');
    return 0;
  }
  if (args.check) {
    console.error(`\nFAILED: a build would change ${[...writes.keys()].join(', ')}. Run pnpm build-players and commit the result.`);
    return 1;
  }
  if (args.dryRun) {
    console.log(`\ndry run: would write ${[...writes.keys()].join(', ')}`);
    return 0;
  }
  for (const [rel, body] of writes) {
    writeFileSync(path.join(root, rel), body, 'utf8');
    console.log(`wrote ${rel}`);
  }
  return 0;
}

runCliIfMain(import.meta.url, main);
