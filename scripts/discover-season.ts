#!/usr/bin/env tsx
/**
 * Next-season bootstrap (SPEC §1.1h, §7.13). Run once, by hand, when the season rolls over.
 *
 *   pnpm discover-season
 *   pnpm discover-season --ssid <sportSeasonId>   pin the season explicitly
 *   pnpm discover-season --teams los-altos,mitty  probe these teams instead
 *   pnpm discover-season --help                   print usage, no request
 *
 * What it does:
 *   1. reads `ssid` / `allSeasonId` / `genderSport` / `teamLevel` from the state hub's __NEXT_DATA__
 *   2. resolves one representative team per division (ALL_DIVISIONS) to its `leagueId` + `leagueName`
 *      through `team-context/v1` (or every team named by --teams)
 *   3. asserts `leagues/{leagueId}/v1`'s `sportSeasonId` and `year` agree with step 1
 *   4. matches each division by `maxprepsLeagueId`, guesses by `maxprepsName`, prints a DIFF against
 *      lib/season.ts and lib/leagues.ts and a ready-to-paste block
 *
 * It NEVER writes a file. `lib/season.ts` and `lib/leagues.ts` are edited by a human who has read
 * the diff, because a wrong season id would silently publish last year's table.
 *
 * Cost warning: `team-context/v1` is ~738 KB per team (a school's whole 844-season history), so the
 * default pass (one team per division, 7 divisions) moves ~5.2 MB; probing all 49 teams would move
 * ~36 MB. That is why the daily cron never touches this endpoint.
 */

import { MaxPrepsClient, MaxPrepsError } from '../lib/sources/maxpreps';
import { ALL_DIVISIONS } from '../lib/leagues';
import {
  ALL_SEASON_ID,
  BOOTSTRAP_URL,
  GENDER_SPORT,
  SEASON_LABEL,
  SEASON_YEAR,
  SPORT_SEASON_ID,
  TEAM_LEVEL,
} from '../lib/season';
import { TEAMS, teamsInDivision } from '../lib/teams';
import type { Team } from '../lib/types';
import { runCli } from './cli';

const USAGE = `Usage: pnpm discover-season [--ssid <sportSeasonId>] [--teams <slug,slug,...>] [--help]

Next-season bootstrap: reads the MaxPreps state hub, resolves each division's league through
team-context/v1, asserts leagues/{id}/v1 agrees, and prints a diff plus a paste block. Never writes a file.

  --ssid <id>        pin the sportSeasonId instead of reading it from the hub
  --teams <slugs>    probe exactly these registry teams (default: one representative team per division,
                     about 738 KB each)
  --help, -h         print this text and exit without making any request
`;

interface Args {
  ssid: string | null;
  teams: string[] | null;
  help: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const out: Args = { ssid: null, teams: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) throw new Error(`${arg} needs a value`);
      i += 1;
      return v;
    };
    if (arg === '--help' || arg === '-h') out.help = true;
    else if (arg === '--ssid') out.ssid = next();
    else if (arg === '--teams') out.teams = next().split(',').map((s) => s.trim()).filter(Boolean);
    else throw new Error(`unknown flag: ${arg}`);
  }
  return out;
}

interface Row {
  slug: string;
  name: string;
  teamId: string;
  leagueId: string | null;
  leagueName: string | null;
  year: string | null;
  level: string | null;
  sportSeasonName: string | null;
  error: string | null;
}

const diffs: string[] = [];
function compare(label: string, ours: string | null, theirs: string | null | undefined): void {
  const t = theirs ?? null;
  if (t === null) {
    console.log(`  ${label}: (absent upstream) — ours ${ours ?? 'null'}`);
    return;
  }
  if (t === ours) {
    console.log(`  ${label}: unchanged (${t})`);
    return;
  }
  console.log(`  ${label}: CHANGED — ours ${ours ?? 'null'} → upstream ${t}`);
  diffs.push(`${label}: ${ours ?? 'null'} → ${t}`);
}

async function main(argv: readonly string[]): Promise<number> {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(USAGE);
    return 0;
  }
  const client = new MaxPrepsClient({ onLog: (l) => console.log(`  ${l}`) });

  // ---- 1. the state hub
  console.log(`discover-season: reading ${BOOTSTRAP_URL}`);
  const boot = await client.getBootstrap();
  const ssid = args.ssid ?? boot.data.sportSeasonId;
  if (!ssid) {
    console.error(
      'FAILED: the hub page exposed no sportSeasonId. Pass one with --ssid after reading ' +
        '__NEXT_DATA__.query.ssid by hand.',
    );
    return 1;
  }
  console.log('\nseason keys from the hub:');
  compare('sportSeasonId', SPORT_SEASON_ID, boot.data.sportSeasonId);
  compare('allSeasonId', ALL_SEASON_ID, boot.data.allSeasonId);
  compare('genderSport', GENDER_SPORT, boot.data.genderSport);
  compare('teamLevel', TEAM_LEVEL, boot.data.teamLevel);
  if (args.ssid) console.log(`  (using --ssid ${args.ssid})`);

  // ---- 2. per-team league resolution
  const wanted: Team[] = args.teams
    ? TEAMS.filter((t) => args.teams?.includes(t.slug))
    : ALL_DIVISIONS.flatMap((d) => {
        const members = teamsInDivision(d.id);
        const rep = members.find((t) => t.dataCoverage !== 'none') ?? members[0];
        return rep ? [rep] : [];
      });
  if (wanted.length === 0) {
    console.error('FAILED: --teams matched no registry team.');
    return 1;
  }
  console.log(`\nresolving ${wanted.length} team context(s) at ~738 KB each — this is slow`);

  const rows: Row[] = [];
  for (const team of wanted) {
    try {
      const res = await client.getTeamContext(team.id, ssid);
      const d = res.data.teamData;
      rows.push({
        slug: team.slug,
        name: team.name,
        teamId: team.id,
        leagueId: d.leagueId ?? null,
        leagueName: d.leagueName ?? null,
        year: d.year ?? null,
        level: d.level ?? null,
        sportSeasonName: d.sportSeasonName ?? null,
        error: null,
      });
      console.log(
        `  ${team.slug.padEnd(18)} ${d.leagueName || '(no league)'} · ${d.year ?? '?'} · ${d.level ?? '?'}`,
      );
    } catch (err) {
      const message = err instanceof MaxPrepsError ? `${err.message} (${err.httpStatus ?? '-'})` : (err as Error).message;
      rows.push({
        slug: team.slug,
        name: team.name,
        teamId: team.id,
        leagueId: null,
        leagueName: null,
        year: null,
        level: null,
        sportSeasonName: null,
        error: message,
      });
      console.log(`  ${team.slug.padEnd(18)} ERROR ${message}`);
    }
  }

  // ---- 3. group by leagueId and assert each league's own metadata
  const byLeague = new Map<string, { name: string; slugs: string[] }>();
  for (const row of rows) {
    if (!row.leagueId) continue;
    const entry = byLeague.get(row.leagueId) ?? { name: row.leagueName ?? '', slugs: [] };
    entry.slugs.push(row.slug);
    if (!entry.name && row.leagueName) entry.name = row.leagueName;
    byLeague.set(row.leagueId, entry);
  }

  console.log('\nleagues discovered:');
  const resolved: Array<{ leagueId: string; name: string; slugs: string[]; ok: boolean }> = [];
  // SEASON_LABEL comes from `leagues/{id}/v1`.sportSeasonName, NOT from team-context, which spells
  // the same season differently ("Girls Field Hockey Varsity Fall 26-27").
  let sportSeasonName: string | null = null;
  for (const [leagueId, entry] of [...byLeague.entries()].sort((a, b) => b[1].slugs.length - a[1].slugs.length)) {
    let ok = false;
    let detail = '';
    try {
      const meta = await client.getLeagueMeta(leagueId);
      if (!sportSeasonName && meta.data.sportSeasonName) sportSeasonName = meta.data.sportSeasonName;
      ok = meta.data.sportSeasonId === ssid;
      detail = `year ${meta.data.year} · ssid ${ok ? 'matches' : `MISMATCH (${meta.data.sportSeasonId})`}`;
    } catch (err) {
      detail = `league metadata unreadable: ${(err as Error).message}`;
    }
    console.log(`  ${leagueId}  ${entry.name}  (${entry.slugs.length} teams) — ${detail}`);
    console.log(`      ${entry.slugs.join(', ')}`);
    resolved.push({ leagueId, name: entry.name, slugs: entry.slugs, ok });
  }

  const noLeague = rows.filter((r) => !r.leagueId && !r.error).map((r) => r.slug);
  if (noLeague.length) console.log(`  (no leagueName — independents or not fielding: ${noLeague.join(', ')})`);
  const failed = rows.filter((r) => r.error);
  if (failed.length) console.log(`  (failed: ${failed.map((r) => r.slug).join(', ')})`);

  // ---- 4. the diff against lib/leagues.ts (match by maxprepsLeagueId, guess by maxprepsName)
  console.log('\ndiff against lib/leagues.ts divisions:');
  const guesses = new Map<string, { leagueId: string; name: string } | null>();
  for (const division of ALL_DIVISIONS) {
    const probed = wanted.some((t) => t.division === division.id);
    const match = resolved.find((r) => r.leagueId === division.maxprepsLeagueId);
    if (match) {
      console.log(`  ${division.id}: maxprepsLeagueId unchanged (${division.maxprepsLeagueId}) — ${match.slugs.length} probed team(s)`);
      if (match.name !== division.maxprepsName) {
        diffs.push(`${division.id} maxprepsName: ${division.maxprepsName} → ${match.name}`);
        console.log(`    name CHANGED: ${division.maxprepsName} → ${match.name}`);
      }
      guesses.set(division.id, { leagueId: match.leagueId, name: match.name });
    } else if (!probed) {
      // A --teams probe that skipped this division says nothing about its league id.
      console.log(`  ${division.id}: not probed (no --teams member is in this division)`);
      guesses.set(division.id, null);
    } else {
      const guess = resolved.find((r) => r.name.toLowerCase() === division.maxprepsName.toLowerCase());
      diffs.push(
        `${division.id} maxprepsLeagueId: ${division.maxprepsLeagueId} → ${guess ? guess.leagueId : 'NOT FOUND — look it up by hand'}`,
      );
      console.log(
        `  ${division.id}: maxprepsLeagueId CHANGED — ours ${division.maxprepsLeagueId}, upstream ${guess ? `${guess.leagueId} (${guess.name})` : 'not found'}`,
      );
      guesses.set(division.id, guess ? { leagueId: guess.leagueId, name: guess.name } : null);
    }
  }

  console.log('\n--- paste into lib/season.ts (after checking every line) ---');
  console.log(`export const SEASON_YEAR = '${rows.find((r) => r.year)?.year ?? SEASON_YEAR}';`);
  console.log(`export const SEASON_LABEL = '${sportSeasonName ?? SEASON_LABEL}';`);
  console.log(`export const SPORT_SEASON_ID = '${ssid}';`);
  console.log(`export const ALL_SEASON_ID = '${boot.data.allSeasonId ?? ALL_SEASON_ID}';`);
  console.log(`export const GENDER_SPORT = '${boot.data.genderSport ?? GENDER_SPORT}' as const;`);
  console.log(`export const TEAM_LEVEL = '${boot.data.teamLevel ?? TEAM_LEVEL}' as const;`);
  console.log('--- end paste block ---');

  console.log('\n--- divisions block for lib/leagues.ts (only the two MaxPreps fields per division) ---');
  for (const division of ALL_DIVISIONS) {
    const g = guesses.get(division.id) ?? null;
    console.log(`  // ${division.id}`);
    console.log(`  maxprepsLeagueId: '${g?.leagueId ?? division.maxprepsLeagueId}',${g ? '' : ' // unchanged: not resolved this run'}`);
    console.log(`  maxprepsName: '${g?.name ?? division.maxprepsName}',`);
  }
  console.log('--- end divisions block ---');

  console.log(
    `\n${diffs.length === 0 ? 'NO CHANGES: lib/season.ts still matches upstream.' : `${diffs.length} change(s) to apply:`}`,
  );
  for (const d of diffs) console.log(`  - ${d}`);
  console.log(
    '\nAlso check by hand: the registry in lib/registry/* (membership comes from each league\'s own ' +
      'official schedule, not from these leagueIds), CCS.keyDates, each league\'s keyDates and the postseason dates. ' +
      'Provenance by league: SCVAL from the two scval.com PDFs, BVAL/PCAL/MCAL from their bundled official documents.',
  );
  return 0;
}

runCli(main);
