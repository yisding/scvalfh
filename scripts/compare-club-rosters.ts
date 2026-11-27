#!/usr/bin/env tsx
/**
 * Compare a sport's kept copy of its club team rosters (data/<sport>/club-rosters.json) with its high school
 * rosters. Girls soccer: the ECNL and ECNL Regional League team rosters, and the Girls Academy
 * rosters kept by hand (`pnpm fetch-club-rosters`); girls volleyball: the NCVA Girls Power League's
 * (`pnpm fetch-club-rosters:volleyball`); boys basketball: The Passport's boys event rosters
 * (`pnpm fetch-club-rosters:basketball`); field hockey: the California clubs' own roster pages
 * (`pnpm fetch-club-rosters:field-hockey`). For soccer, with the high school
 * rosters, varsity and JV, and say which players the league-roster rule matches
 * (lib/players/club-rosters.ts) and how each stands in data/soccer/clubs.json. A Girls Academy GotSport
 * roster gives no class year: its rows are compared on the team's birth years, listed apart
 * ("birth-years"). A GA team kept from Hudl is compared with the ECNL teams, and the GotSport roster it
 * supersedes is not compared.
 *
 *   pnpm compare-club-rosters                  the counts, and every match clubs.json does not cite yet
 *   pnpm compare-club-rosters --all            every row a roster shares a name with, whatever the outcome
 *   pnpm compare-club-rosters --json <path>    also write every compared row to <path>
 *
 * Run it after `pnpm fetch-rosters` or `pnpm fetch-jv` brings a school's roster (and after
 * `pnpm fetch-club-rosters`, which the leagues' season calls for rarely). It reads and reports only:
 * clubs.json is research, so a new match is added there by hand, its page re-read (README, "Club
 * rosters"). The package scripts set SCVAL_SPORT (`compare-club-rosters` soccer's, `:basketball`, `:volleyball`,
 * `:field-hockey`). Rule 5 (a club near enough) is soccer's LOCAL_REGIONS for soccer, basketball and volleyball, whose
 * schools are the same area's; for field hockey, a club in the half of the state (NorCal or SoCal) the
 * school's league is in.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { validateData } from '../lib/data-file';
import { getJvPlayerProfiles } from '../lib/jv/jv-profiles';
import { getJvRostersFile } from '../lib/jv/jv-rosters';
import {
  ClubRostersFileSchema,
  compareClubRosters,
  rosterName,
  type ClubRosterCompareOptions,
  type CompareRow,
  type SchoolRow,
} from '../lib/players/club-rosters';
import { getClubsFile } from '../lib/players/clubs';
import { CLUB_REGION_SITE_REGION, type ClubRegion } from '../lib/players/clubs-schema';
import { regionOf } from '../lib/leagues';
import { getTeamBySlug } from '../lib/teams';
import { nameKey } from '../lib/players/name-compare';
import { classOf, effectiveClassOf, getAllEnrichedRosters, getRosters } from '../lib/players/rosters';
import { DATA_DIR, SPORT_ID } from '../lib/sports/current';
import type { TeamSlug } from '../lib/types';
import { runCliIfMain } from './cli';

const USAGE = 'Usage: pnpm compare-club-rosters[:basketball|:volleyball|:field-hockey] [--all] [--json <path>]';

/** The sports with a kept copy, and what each changes in the comparison. */
const SPORT_OPTIONS: Partial<Record<typeof SPORT_ID, ClubRosterCompareOptions>> = {
  soccer: {},
  basketball: {},
  volleyball: {},
  // Field hockey's schools are the whole state: a club is near when it is in the school's half of it.
  'field-hockey': {
    isLocal: (region: ClubRegion, row: SchoolRow) => {
      const team = getTeamBySlug(row.teamSlug);
      return team !== undefined && CLUB_REGION_SITE_REGION[region] === regionOf(team.league);
    },
  },
};

/** The class years a player's own linked recruiting pages state (lib/players/club-rosters.ts SchoolRow). */
const statedYears = (profiles: readonly { classOf: number | null }[]): number[] =>
  profiles.flatMap((x) => (x.classOf === null ? [] : [x.classOf]));

/** Every tracked high school row: the merged varsity rows, then the JV list's rows that are not also varsity rows. */
function schoolRows(): SchoolRow[] {
  const season = getRosters().season;
  const rows: SchoolRow[] = [];
  const varsity = new Set<string>();
  for (const team of getAllEnrichedRosters()) {
    for (const p of team.players) {
      const level = p.level === 'jv' ? 'jv' : 'varsity';
      if (level === 'varsity') varsity.add(`${team.slug} ${nameKey(p.fullName)}`);
      const stated = statedYears([...p.profiles, ...(level === 'jv' ? getJvPlayerProfiles(team.slug, p.fullName) : [])]);
      rows.push({ level, teamSlug: team.slug, athleteId: p.athleteId, fullName: p.fullName, classYear: effectiveClassOf(season, p), statedClassYears: stated });
    }
  }
  for (const team of getJvRostersFile().teams) {
    for (const p of team.players) {
      if (varsity.has(`${team.slug} ${nameKey(p.fullName)}`)) continue;
      rows.push({
        level: 'jv',
        teamSlug: team.slug,
        athleteId: p.athleteId,
        fullName: p.fullName,
        classYear: p.grade === null ? null : classOf(season, p.grade),
        statedClassYears: statedYears(getJvPlayerProfiles(team.slug as TeamSlug, p.fullName)),
      });
    }
  }
  return rows;
}

/** One compared row: its hits by team name, and, with `urls`, each team's page (two clubs' GA teams share a name). */
function line(r: CompareRow, urls = false): string {
  const year = (h: CompareRow['hits'][number]) =>
    h.player.gradYear ??
    (h.team.classYears ? `${h.team.division}, classes ${h.team.classYears.join('/')}` : h.team.birthYears ? `born ${h.team.birthYears.join('/')}` : 'no class year');
  const hits = r.hits.map(
    (h) => `${h.team.teamName} (${rosterName(h.player)}, ${year(h)}, ${h.player.playerType ?? 'no label'}${urls ? `; ${h.team.url}` : ''})`,
  );
  const graded = r.row.classYear ?? (r.classYearFrom === null ? 'no grade' : `no grade; ${r.classYear} from the ${r.classYearFrom}`);
  return `  ${r.row.level.padEnd(7)} ${r.row.teamSlug} / ${r.row.fullName} (${graded}): ${hits.join('; ')}`;
}

/** A match rule 4 resolved by another page's tie names the other clubs' rows it leaves unlinked. */
const setAsideNote = (r: CompareRow): string =>
  r.setAside.length === 0 ? '' : `; set aside: ${r.setAside.map((h) => `${h.team.teamName} (${h.player.playerType ?? 'no label'})`).join('; ')}`;

/** The outcome as the report groups it: a match by how it stands in clubs.json, a birth-years row marked apart. */
const kindOf = (r: CompareRow): string =>
  `${r.tier === 'birth-years' ? 'birth-years ' : ''}${r.outcome === 'match' ? `match: ${r.tie}${r.classYearFrom === 'grade' ? '' : ` (class year from the ${r.classYearFrom})`}` : r.outcome}`;

export function main(argv: readonly string[] = process.argv.slice(2)): number {
  const all = argv.includes('--all');
  const jsonAt = argv.indexOf('--json');
  const jsonPath = jsonAt === -1 ? null : argv[jsonAt + 1];
  if (argv.some((a, i) => a !== '--all' && a !== '--json' && i !== jsonAt + 1) || (jsonAt !== -1 && !jsonPath)) {
    console.error(USAGE);
    return 2;
  }
  const options = SPORT_OPTIONS[SPORT_ID];
  if (options === undefined) {
    console.error(`compare-club-rosters: ${SPORT_ID} keeps no club rosters (soccer, basketball, volleyball and field hockey do)`);
    return 2;
  }
  const file = validateData('club-rosters', ClubRostersFileSchema, JSON.parse(readFileSync(path.join(DATA_DIR, 'club-rosters.json'), 'utf8')));
  const rows = schoolRows();
  const compared = compareClubRosters(file, rows, getClubsFile(), options);

  console.log(`club rosters read ${file.fetchedAt}: ${file.counts.teams} teams, ${file.counts.players} players`);
  // A row can have a result in each tier (an ECNL and a GA roster): counted once here, once per tier below.
  const named = new Set(compared.map((r) => r.row)).size;
  console.log(`high school rows: ${rows.filter((r) => r.level === 'varsity').length} varsity, ${rows.filter((r) => r.level === 'jv').length} JV; ${named} share a name with a roster row`);
  const count = (level: string, what: string) => compared.filter((r) => r.row.level === level && kindOf(r) === what).length;
  const kinds = [...new Set(compared.map(kindOf))].sort();
  for (const k of kinds) console.log(`  ${k.padEnd(40)} varsity ${String(count('varsity', k)).padStart(3)}   JV ${String(count('jv', k)).padStart(3)}`);

  const open = compared.filter((r) => r.outcome === 'match' && r.tie !== 'linked');
  console.log(`\nMatches clubs.json does not cite yet (${open.length}; a varsity row's tie goes in affiliations, a JV row's in jvAffiliations):`);
  for (const r of open) console.log(`${line(r, true)} [${r.tie}${r.tier === 'birth-years' ? ', on birth years' : ''}]${setAsideNote(r)}`);
  if (all) {
    for (const k of kinds) {
      console.log(`\n${k}:`);
      for (const r of compared) if (kindOf(r) === k) console.log(`${line(r)}${setAsideNote(r)}`);
    }
  }
  if (jsonPath) writeFileSync(jsonPath, `${JSON.stringify(compared, null, 1)}\n`);
  return 0;
}

runCliIfMain(import.meta.url, main);
