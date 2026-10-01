#!/usr/bin/env tsx
/**
 * Next-season bootstrap (SPEC §1.1h). Run once, by hand, when the season rolls over.
 *
 *   pnpm exec tsx scripts/discover-season.ts
 *   pnpm exec tsx scripts/discover-season.ts --ssid <sportSeasonId>   pin the season explicitly
 *   pnpm exec tsx scripts/discover-season.ts --teams los-altos,mitty  probe fewer teams
 *
 * What it does:
 *   1. reads `ssid` / `allSeasonId` / `genderSport` / `teamLevel` from the state hub's __NEXT_DATA__
 *   2. resolves every registry team's `leagueId` + `leagueName` through `team-context/v1`
 *   3. asserts `leagues/{leagueId}/v1`'s `sportSeasonId` and `year` agree with step 1
 *   4. prints a DIFF against lib/season.ts and a ready-to-paste constants block
 *
 * It NEVER writes a file. `lib/season.ts` is edited by a human who has read the diff, because a
 * wrong season id would silently publish last year's table.
 *
 * Cost warning: `team-context/v1` is ~738 KB per team (a school's whole 844-season history), so a
 * full pass moves ~11 MB. That is why the daily cron never touches this endpoint.
 */

import { MaxPrepsClient, MaxPrepsError } from '../lib/sources/maxpreps';
import {
  ALL_SEASON_ID,
  BOOTSTRAP_URL,
  GENDER_SPORT,
  LEAGUE_IDS,
  LEAGUE_NAMES,
  SEASON_LABEL,
  SEASON_YEAR,
  SECTION_ID,
  SECTION_NAME,
  SPORT_SEASON_ID,
  TEAM_LEVEL,
} from '../lib/season';
import { TEAMS } from '../lib/teams';
import type { Division } from '../lib/types';

interface Args {
  ssid: string | null;
  teams: string[] | null;
}

function parseArgs(argv: readonly string[]): Args {
  const out: Args = { ssid: null, teams: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (!v) throw new Error(`${arg} needs a value`);
      i += 1;
      return v;
    };
    if (arg === '--ssid') out.ssid = next();
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

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
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
  const wanted = args.teams
    ? TEAMS.filter((t) => args.teams?.includes(t.slug))
    : TEAMS.filter((t) => t.dataCoverage !== 'none');
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

  // ---- 4. the diff against lib/season.ts, then the paste block
  console.log('\ndiff against lib/season.ts:');
  for (const division of ['de-anza', 'el-camino'] as Division[]) {
    const ours = LEAGUE_IDS[division];
    const match = resolved.find((r) => r.leagueId === ours);
    if (match) {
      console.log(`  ${division}: leagueId unchanged (${ours}) — ${match.slugs.length} teams this season`);
      if (match.name !== LEAGUE_NAMES[division]) {
        diffs.push(`LEAGUE_NAMES['${division}']: ${LEAGUE_NAMES[division]} → ${match.name}`);
        console.log(`    name CHANGED: ${LEAGUE_NAMES[division]} → ${match.name}`);
      }
    } else if (!wanted.some((t) => t.division === division)) {
      // A --teams probe that skipped this division says nothing about its leagueId.
      console.log(`  ${division}: not probed (no --teams member is in this division)`);
    } else {
      const guess = resolved.find((r) =>
        r.name.toLowerCase().includes(division === 'de-anza' ? 'de anza' : 'el camino'),
      );
      diffs.push(
        `LEAGUE_IDS['${division}']: ${ours} → ${guess ? guess.leagueId : 'NOT FOUND — look it up by hand'}`,
      );
      console.log(
        `  ${division}: leagueId CHANGED — ours ${ours}, upstream ${guess ? `${guess.leagueId} (${guess.name})` : 'not found'}`,
      );
    }
  }

  const deAnza = resolved.find((r) => r.name.toLowerCase().includes('de anza'));
  const elCamino = resolved.find((r) => r.name.toLowerCase().includes('el camino'));

  console.log('\n--- paste into lib/season.ts (after checking every line) ---');
  console.log(`export const SEASON_YEAR = '${rows.find((r) => r.year)?.year ?? SEASON_YEAR}';`);
  console.log(`export const SEASON_LABEL = '${sportSeasonName ?? SEASON_LABEL}';`);
  console.log(`export const SPORT_SEASON_ID = '${ssid}';`);
  console.log(`export const ALL_SEASON_ID = '${boot.data.allSeasonId ?? ALL_SEASON_ID}';`);
  console.log(`export const GENDER_SPORT = '${boot.data.genderSport ?? GENDER_SPORT}' as const;`);
  console.log(`export const TEAM_LEVEL = '${boot.data.teamLevel ?? TEAM_LEVEL}' as const;`);
  console.log(`export const SECTION_ID = '${SECTION_ID}'; // team-context .sectionId`);
  console.log(`export const SECTION_NAME = '${SECTION_NAME}';`);
  console.log('export const LEAGUE_IDS: Record<Division, string> = {');
  console.log(`  'de-anza': '${deAnza?.leagueId ?? LEAGUE_IDS['de-anza']}',`);
  console.log(`  'el-camino': '${elCamino?.leagueId ?? LEAGUE_IDS['el-camino']}',`);
  console.log('};');
  console.log('export const LEAGUE_NAMES: Record<Division, string> = {');
  console.log(`  'de-anza': '${deAnza?.name ?? LEAGUE_NAMES['de-anza']}',`);
  console.log(`  'el-camino': '${elCamino?.name ?? LEAGUE_NAMES['el-camino']}',`);
  console.log('};');
  console.log('--- end paste block ---');

  console.log(
    `\n${diffs.length === 0 ? 'NO CHANGES: lib/season.ts still matches upstream.' : `${diffs.length} change(s) to apply:`}`,
  );
  for (const d of diffs) console.log(`  - ${d}`);
  console.log(
    '\nAlso check by hand: the registry in lib/teams.ts (division membership comes from the two ' +
      'scval.com PDFs, not from these leagueIds), PLAYOFF_KEY_DATES, and the crossover date.',
  );
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(`FAILED: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
