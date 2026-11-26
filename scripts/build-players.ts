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
 *   pnpm build-players --review    also list everything left for a person to decide: the
 *                                  questions by pattern with each side's evidence and links, what a
 *                                  rule decided, and official names chosen on a tie
 *                                  (lib/players/review-report.ts)
 *   pnpm build-players --drafts <file>
 *                                  write a draft answer for each question and tie to <file>, as
 *                                  data/player-identity.json entries whose basis says "DRAFT": check
 *                                  each, rewrite its basis, and move it into the curation file
 *   pnpm build-players --no-stamp  leave data/<sport>/rosters-enrichment.json alone (below)
 *
 * One run covers every sport whatever SCVAL_SPORT is: a player is one person in every sport.
 * It reads only files in the repository and fetches nothing, so it is safe to run at any time; run
 * it after `pnpm fetch-rosters`, after editing an overlay, data/player-identity.json or a file filed by
 * person, and BEFORE a season rollover overwrites the rosters (a season this file has seen stays in it; one
 * it has not is gone with the files).
 *
 * Ids are stable: a rebuild keeps every id the previous file gave (lib/players/registry-build.ts).
 *
 * WHAT IT WRITES beside the registry, every run:
 *   - data/<sport>/player-index.json, each sport's row → person index (lib/players/player-index-schema.ts):
 *     what a page finds a person's recruiting pages, club ties and commitment through, and the pages
 *     themselves as the build shows them;
 *   - the files filed by person, keyed to the registry as it now is: data/player-accounts.json, each sport's
 *     clubs.json `memberships` and data/commitments.json. An id the registry has retired (two records found to
 *     be one person) becomes the id that stayed, and every `name` the person's official one. Nothing else in
 *     them is touched.
 *
 * STAMPING (not with --no-stamp). data/<sport>/rosters-enrichment.json names a roster row by team and MaxPreps'
 * per-season athlete id, which a new season makes meaningless. Each record gains a `playerId`, written beside
 * that key and never read by the site. A file is rewritten only when an id in it changes, and then as
 * JSON.stringify writes it (two-space indent, a final newline).
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { AccountsFileSchema, type AccountsFile } from '../lib/players/accounts-schema';
import { buildPlayerIndex, formatPlayerIndex } from '../lib/players/player-index-schema';
import { buildRegistry } from '../lib/players/registry-build';
import { COMMITMENTS_FILE, PLAYER_ACCOUNTS_FILE, PLAYERS_FILE, playerIndexFile, readAccountsFile, readBuildInput, readCareerUrls, sportDataDir } from '../lib/players/registry-file';
import { buildReviewReport, formatReviewReport } from '../lib/players/review-report';
import type { PlayersFile } from '../lib/players/registry-schema';
import { SPORT_IDS, type SportId } from '../lib/sports/current';
import { stableStringify } from '../lib/stable-json';
import { describeDrift } from '../lib/players/roster-drift';
import { runCliIfMain } from './cli';

const USAGE = 'Usage: pnpm build-players [--check | --dry-run] [--review] [--drafts <file>] [--no-stamp]';

interface Args {
  check: boolean;
  dryRun: boolean;
  review: boolean;
  drafts: string | null;
  stamp: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = { check: false, dryRun: false, review: false, drafts: null, stamp: true };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--check') args.check = true;
    else if (flag === '--dry-run') args.dryRun = true;
    else if (flag === '--review') args.review = true;
    else if (flag === '--drafts') {
      const file = argv[i + 1];
      if (!file || file.startsWith('--')) throw new Error(`--drafts needs a file\n${USAGE}`);
      args.drafts = file;
      i += 1;
    } else if (flag === '--no-stamp') args.stamp = false;
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

/** Every id the registry has given a player, current or former → the player now. */
export function currentPlayers(file: PlayersFile): Map<string, PlayersFile['players'][number]> {
  return new Map(file.players.flatMap((p) => [p.id, ...p.formerIds].map((id) => [id, p] as const)));
}

type PersonRecord = { playerId: string; name: string };

/**
 * Records filed by person (a club membership, a commitment) keyed to the registry as it now is: an id the registry
 * has since retired becomes the id that stayed, and `name` the person's official name. Two records that become one
 * person's under one `same` key (one club; a commitment) are one: the first, with the other's sources it lacks.
 * Throws on an id the registry never gave, and on two that cannot be one (two colleges for one person).
 */
export function rekeyRecords<R extends PersonRecord & { sources: ReadonlyArray<{ url: string }> }>(
  records: readonly R[],
  file: PlayersFile,
  label: string,
  same: (r: R) => string,
): R[] {
  const now = currentPlayers(file);
  const out = new Map<string, R>();
  for (const r of records) {
    const p = now.get(r.playerId);
    if (!p) throw new Error(`${label}: ${r.playerId} (${r.name}) is no player of the registry`);
    const rec = { ...r, playerId: p.id, name: p.name };
    const key = `${p.id} ${same(rec)}`;
    const had = out.get(key);
    if (!had) {
      out.set(key, rec);
      continue;
    }
    out.set(key, { ...had, sources: [...had.sources, ...rec.sources.filter((x) => !had.sources.some((y) => y.url === x.url))] });
  }
  return [...out.values()];
}

/**
 * data/player-accounts.json keyed to the registry as it now is: a person filed under an id the registry has
 * since retired is filed under the id that stayed (her pages merged with any already there, a page once), and
 * every `name` is the person's official one. Throws on an id the registry never gave.
 */
export function rekeyAccounts(accounts: AccountsFile, file: PlayersFile): AccountsFile {
  const now = currentPlayers(file);
  const merged = new Map<string, AccountsFile['players'][number]>();
  for (const person of accounts.players) {
    const p = now.get(person.playerId);
    if (!p) throw new Error(`${PLAYER_ACCOUNTS_FILE}: ${person.playerId} (${person.name}) is no player of the registry`);
    const had = merged.get(p.id);
    const list = had ? [...had.accounts, ...person.accounts.filter((a) => !had.accounts.some((b) => b.url === a.url))] : person.accounts;
    merged.set(p.id, { playerId: p.id, name: p.name, accounts: list });
  }
  const out = { ...accounts, players: [...merged.values()].sort((a, b) => (a.playerId < b.playerId ? -1 : 1)) };
  return AccountsFileSchema.parse(out);
}

export interface StampIndex {
  /** `<sport> <season> <team> <athleteId>` → player id. */
  byAthlete: Map<string, string>;
}

export function stampIndex(file: PlayersFile): StampIndex {
  const byAthlete = new Map<string, string>();
  for (const p of file.players) {
    for (const s of p.stints) {
      // A stint no source lists any more is a row somebody else's now (a career passed on, a row respelled): the
      // row's player is the one a source still lists it under.
      if (s.gone) continue;
      for (const o of s.observations) {
        if (o.athleteId) byAthlete.set(`${s.sport} ${s.season} ${s.team} ${o.athleteId}`, p.id);
      }
    }
  }
  return { byAthlete };
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

  return { changed, unplaced };
}

export function main(argv: readonly string[]): number {
  const args = parseArgs(argv);
  const root = process.cwd();
  const input = readBuildInput(root, 'scripts/build-players.ts');
  for (const line of input.skipped) console.warn(`WARN ${line}`);
  // Curation the sources no longer support (a roster refresh dropped a career): a warning, on a refresh's run page
  // an annotation, never a failed build (lib/players/roster-drift.ts; `pnpm roster-drift` fails a change that made it).
  const file = buildRegistry(input, {
    onDrift: (d) => {
      const line = describeDrift(d);
      console.warn(process.env.GITHUB_ACTIONS === 'true' ? `::warning title=Player registry curation drift::${line}` : `WARN ${line}`);
    },
  });
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
  if (args.review || args.drafts) {
    const report = buildReviewReport(file, input.identity, { careerUrls: readCareerUrls(root), today: new Date().toISOString().slice(0, 10) });
    if (args.review) console.log(`\n${formatReviewReport(report)}`);
    if (args.drafts) {
      const d = report.drafts;
      writeFileSync(path.resolve(root, args.drafts), `${JSON.stringify(d, null, 2)}\n`, 'utf8');
      console.log(`\nwrote ${d.sameAs.length} sameAs, ${d.notSame.length} notSame and ${d.names.length} names draft(s) to ${args.drafts}`);
    }
  }

  const writes = new Map<string, string>();
  if (text !== before) writes.set(PLAYERS_FILE, text);
  // The person-keyed files follow the registry's ids and official names. Part of the registry, so written with
  // it, --no-stamp or not: an id a merge retired would otherwise name nobody.
  const accountsBefore = readAccountsFile(root);
  const accounts = accountsBefore ? rekeyAccounts(accountsBefore, file) : null;
  if (accounts && accountsBefore && JSON.stringify(accounts) !== JSON.stringify(accountsBefore)) {
    writes.set(PLAYER_ACCOUNTS_FILE, `${JSON.stringify(accounts, null, 2)}\n`);
  }
  // Each sport's club memberships and the commitments, the same way (lib/players/clubs-schema.ts, commits-schema.ts).
  const rekeyFile = <R extends PersonRecord & { sources: ReadonlyArray<{ url: string }> }>(rel: string, list: string, same: (r: R) => string, check?: (records: R[]) => void) => {
    const at = path.join(root, rel);
    if (!existsSync(at)) return;
    const raw = readFileSync(at, 'utf8');
    const json = JSON.parse(raw) as Json;
    const records = rekeyRecords(json[list] as R[], file, rel, same);
    check?.(records);
    const next = { ...json, [list]: records };
    if (JSON.stringify(next) !== JSON.stringify(json)) writes.set(rel, `${JSON.stringify(next, null, 2)}\n`);
  };
  for (const sport of SPORT_IDS) rekeyFile<PersonRecord & { club: string; sources: { url: string }[] }>(`${sportDataDir(sport)}/clubs.json`, 'memberships', (r) => r.club);
  rekeyFile<PersonRecord & { college: string; sport: string; sources: { url: string }[] }>(COMMITMENTS_FILE, 'commitments', () => 'commitment', (records) => {
    // A person has one commitment: two records that became one person's must already agree on it.
    const seen = new Map<string, string>();
    for (const r of records) {
      const what = `${r.college} ${r.sport}`;
      if (seen.has(r.playerId) && seen.get(r.playerId) !== what) throw new Error(`${COMMITMENTS_FILE}: ${r.name} (${r.playerId}) would have two commitments`);
      seen.set(r.playerId, what);
    }
  });
  // Each sport's row → person index (lib/players/player-index-schema.ts): what the pages find a person's
  // accounts, club ties and commitment through.
  for (const sport of SPORT_IDS) {
    const rel = playerIndexFile(sport);
    const body = formatPlayerIndex(buildPlayerIndex(file, sport, 'scripts/build-players.ts', accounts));
    const had = existsSync(path.join(root, rel)) ? readFileSync(path.join(root, rel), 'utf8') : null;
    if (body !== had) writes.set(rel, body);
  }
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
