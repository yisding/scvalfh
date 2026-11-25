#!/usr/bin/env tsx
/**
 * Compare the kept copy of the ECNL and ECNL Regional League team rosters, and of the Girls Academy
 * rosters kept by hand (data/soccer/club-rosters.json, `pnpm fetch-club-rosters`), with the high school
 * rosters, varsity and JV, and say which players the league-roster rule matches
 * (lib/players/club-rosters.ts) and how each stands in data/soccer/clubs.json. A Girls Academy roster
 * gives no class year: its rows are compared on the team's birth years, listed apart ("birth-years").
 *
 *   pnpm compare-club-rosters                  the counts, and every match clubs.json does not cite yet
 *   pnpm compare-club-rosters --all            every row a roster shares a name with, whatever the outcome
 *   pnpm compare-club-rosters --json <path>    also write every compared row to <path>
 *
 * Run it after `pnpm fetch-rosters` or `pnpm fetch-jv` brings a school's roster (and after
 * `pnpm fetch-club-rosters`, which the leagues' season calls for rarely). It reads and reports only:
 * clubs.json is research, so a new match is added there by hand, its page re-read (README, "Club
 * rosters"). Girls soccer only; the package script sets SCVAL_SPORT.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { validateData } from '../lib/data-file';
import { getJvRostersFile } from '../lib/jv/jv-rosters';
import { ClubRostersFileSchema, compareClubRosters, rosterName, type CompareRow, type SchoolRow } from '../lib/players/club-rosters';
import { getClubsFile } from '../lib/players/clubs';
import { nameKey } from '../lib/players/name-compare';
import { classOf, effectiveClassOf, getAllEnrichedRosters, getRosters } from '../lib/players/rosters';
import { DATA_DIR, SPORT_ID } from '../lib/sports/current';
import { runCliIfMain } from './cli';

const USAGE = 'Usage: pnpm compare-club-rosters [--all] [--json <path>]';

/** Every tracked high school row: the merged varsity rows, then the JV list's rows that are not also varsity rows. */
function schoolRows(): SchoolRow[] {
  const season = getRosters().season;
  const rows: SchoolRow[] = [];
  const varsity = new Set<string>();
  for (const team of getAllEnrichedRosters()) {
    for (const p of team.players) {
      const level = p.level === 'jv' ? 'jv' : 'varsity';
      if (level === 'varsity') varsity.add(`${team.slug} ${nameKey(p.fullName)}`);
      rows.push({ level, teamSlug: team.slug, athleteId: p.athleteId, fullName: p.fullName, classYear: effectiveClassOf(season, p) });
    }
  }
  for (const team of getJvRostersFile().teams) {
    for (const p of team.players) {
      if (varsity.has(`${team.slug} ${nameKey(p.fullName)}`)) continue;
      rows.push({ level: 'jv', teamSlug: team.slug, athleteId: p.athleteId, fullName: p.fullName, classYear: p.grade === null ? null : classOf(season, p.grade) });
    }
  }
  return rows;
}

/** One compared row: its hits by team name, and, with `urls`, each team's page (two clubs' GA teams share a name). */
function line(r: CompareRow, urls = false): string {
  const year = (h: CompareRow['hits'][number]) =>
    h.team.birthYears ? `born ${h.team.birthYears.join('/')}` : (h.player.gradYear ?? 'no class year');
  const hits = r.hits.map(
    (h) => `${h.team.teamName} (${rosterName(h.player)}, ${year(h)}, ${h.player.playerType ?? 'no label'}${urls ? `; ${h.team.url}` : ''})`,
  );
  return `  ${r.row.level.padEnd(7)} ${r.row.teamSlug} / ${r.row.fullName} (${r.row.classYear ?? 'no grade'}): ${hits.join('; ')}`;
}

/** The outcome as the report groups it: a match by how it stands in clubs.json, a birth-years row marked apart. */
const kindOf = (r: CompareRow): string => `${r.tier === 'birth-years' ? 'birth-years ' : ''}${r.outcome === 'match' ? `match: ${r.tie}` : r.outcome}`;

export function main(argv: readonly string[] = process.argv.slice(2)): number {
  const all = argv.includes('--all');
  const jsonAt = argv.indexOf('--json');
  const jsonPath = jsonAt === -1 ? null : argv[jsonAt + 1];
  if (argv.some((a, i) => a !== '--all' && a !== '--json' && i !== jsonAt + 1) || (jsonAt !== -1 && !jsonPath)) {
    console.error(USAGE);
    return 2;
  }
  if (SPORT_ID !== 'soccer') {
    console.error('compare-club-rosters: the kept rosters are girls soccer only (SCVAL_SPORT=soccer)');
    return 2;
  }
  const file = validateData('club-rosters', ClubRostersFileSchema, JSON.parse(readFileSync(path.join(DATA_DIR, 'club-rosters.json'), 'utf8')));
  const rows = schoolRows();
  const compared = compareClubRosters(file, rows, getClubsFile());

  console.log(`club rosters read ${file.fetchedAt}: ${file.counts.teams} teams, ${file.counts.players} players`);
  // A row can have a result in each tier (an ECNL and a GA roster): counted once here, once per tier below.
  const named = new Set(compared.map((r) => r.row)).size;
  console.log(`high school rows: ${rows.filter((r) => r.level === 'varsity').length} varsity, ${rows.filter((r) => r.level === 'jv').length} JV; ${named} share a name with a roster row`);
  const count = (level: string, what: string) => compared.filter((r) => r.row.level === level && kindOf(r) === what).length;
  const kinds = [...new Set(compared.map(kindOf))].sort();
  for (const k of kinds) console.log(`  ${k.padEnd(40)} varsity ${String(count('varsity', k)).padStart(3)}   JV ${String(count('jv', k)).padStart(3)}`);

  const open = compared.filter((r) => r.outcome === 'match' && r.tie !== 'linked');
  console.log(`\nMatches clubs.json does not cite yet (${open.length}; a varsity row's tie goes in affiliations, a JV row's in jvAffiliations):`);
  for (const r of open) console.log(`${line(r, true)} [${r.tie}${r.tier === 'birth-years' ? ', on birth years' : ''}]`);
  if (all) {
    for (const k of kinds) {
      console.log(`\n${k}:`);
      for (const r of compared) if (kindOf(r) === k) console.log(line(r));
    }
  }
  if (jsonPath) writeFileSync(jsonPath, `${JSON.stringify(compared, null, 1)}\n`);
  return 0;
}

runCliIfMain(import.meta.url, main);
