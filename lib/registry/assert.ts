/**
 * The registry's import-time invariants (SPEC §3): unique ids, slugs and abbrs, slug and short-name
 * shape, league/division/section agreement with the config, the team counts, the config values that
 * name slugs, and the acronym rule. The door (lib/registry/teams.ts) calls it as assertRegistry() at
 * module load with the teams it exports; it throws `lib/registry/teams.ts: <message>` on any violation.
 * It derives its own lookups from those teams and never imports the team list.
 */

import { failInvariant } from '@/lib/config/invariant';
import { LEAGUES, findLeague, getLeague } from '@/lib/config/leagues';
import type { DivisionId, LeagueId } from '@/lib/model/ids';
import type { Team } from '@/lib/model/team';
import { SLUG_PATTERN } from '@/lib/shared/patterns';

/** True when `part` is `whole`, or a run of whole words of it ('Mitty' of 'Archbishop Mitty'). */
function isWholeWordsOf(part: string, whole: string): boolean {
  return ` ${whole} `.includes(` ${part} `);
}

/**
 * Acronyms (MaxPreps `schoolNameAcronym`, copied verbatim) that two or more of the 102 teams share,
 * so none of them is a resolver key. The Southern California seeds added BVHS, EHS, FHS, MCHS, MHS,
 * MVHS, VCHS and WHS to the 49-team list (BHS CHS GHS HHS LHS PHS SCHS SHS). As a result seven NorCal
 * acronyms that used to resolve no longer do: BVHS (Bella Vista, now shared with Bonita Vista), FHS
 * (Fremont / Fallbrook), MCHS (Marin Catholic / Mt. Carmel), MHS (Monterey / Marina), MVHS (Monta
 * Vista / Mission Vista), VCHS (Valley Christian / Valley Center) and WHS (Westmont / Westview).
 * That is acceptable: an acronym is display only and is indexed only while it names one school; no
 * league document, schedule or feed this site reads keys a team on it (official-grid codes are
 * league-scoped in LeagueConfig.officialCodes), and every one of the seven keeps its name, aliases,
 * slug and MaxPreps GUID as keys. Recomputed by running lib/registry/acronyms.ts over the 102 seeds.
 */
const EXPECTED_ACRONYM_COLLISIONS = [
  'BHS', 'BVHS', 'CHS', 'EHS', 'FHS', 'GHS', 'HHS', 'LHS', 'MCHS', 'MHS', 'MVHS', 'PHS', 'SCHS', 'SHS', 'VCHS', 'WHS',
];

/** The registry as the door exports it. */
export interface RegistryParts {
  teams: readonly Team[];
  fetchable: readonly Team[];
  acronymCollisions: readonly string[];
}

export function checkRegistry({ teams, fetchable, acronymCollisions }: RegistryParts): void {
  const fail = (m: string): never => failInvariant('lib/registry/teams.ts', m);
  const byId = new Map<string, Team>(teams.map((t) => [t.id, t]));
  const bySlug = new Map<string, Team>(teams.map((t) => [t.slug, t]));
  const inDivision = (division: DivisionId): readonly Team[] => teams.filter((t) => t.division === division);
  const inLeague = (leagueId: LeagueId): readonly Team[] => teams.filter((t) => t.league === leagueId);


  // 1. unique ids, slugs, abbrs; slug shape
  const columns: Array<[string, string[]]> = [
    ['id', teams.map((t) => t.id)],
    ['slug', teams.map((t) => t.slug)],
    ['abbr', teams.map((t) => t.abbr)],
  ];
  for (const [label, values] of columns) {
    const dupes = values.filter((v, i) => values.indexOf(v) !== i);
    if (dupes.length) fail(`duplicate ${label}: ${[...new Set(dupes)].join(', ')}`);
  }
  for (const t of teams) {
    if (!SLUG_PATTERN.test(t.slug)) fail(`bad slug "${t.slug}"`);
    if (!/^[A-Z]{2}$/.test(t.abbr)) fail(`${t.slug}: abbr "${t.abbr}" is not 2 capital letters`);
    if (t.shortName.length > 16) fail(`${t.slug}: shortName longer than 16 characters`);
    // One full name and one short name per school. The short name is the name the school goes by
    // ('Mitty', 'Sobrato', 'Convent'): the full name itself, whole words of it, or a spelling a
    // source uses (an alias: 'SF University'), never an abbreviation made up for width ('Valley Chr.').
    if (!isWholeWordsOf(t.shortName, t.name) && !t.aliases.includes(t.shortName)) {
      fail(`${t.slug}: shortName "${t.shortName}" is not "${t.name}", whole words of it, or an alias`);
    }
  }

  // 2. league, division and section agree with the config
  for (const t of teams) {
    const league = findLeague(t.league);
    if (!league) fail(`${t.slug}: unknown league ${t.league}`);
    else {
      if (!league.divisions.some((d) => d.id === t.division)) {
        fail(`${t.slug}: division ${t.division} is not in ${t.league}`);
      }
      if (t.section !== league.sectionId) fail(`${t.slug}: section ${t.section}, league ${t.league} is ${league.sectionId}`);
    }
  }

  // 3. counts
  for (const l of LEAGUES) {
    for (const d of l.divisions) {
      const n = inDivision(d.id).length;
      if (n !== d.expectedTeams) fail(`${d.id} has ${n} teams, expected ${d.expectedTeams}`);
    }
  }
  const expectedTotal = LEAGUES.reduce((n, l) => n + l.divisions.reduce((m, d) => m + d.expectedTeams, 0), 0);
  if (teams.length !== expectedTotal || teams.length !== 102) {
    fail(`expected 102 teams, got ${teams.length}`);
  }
  if (fetchable.length !== teams.length) {
    fail(`expected ${teams.length} fetchable teams, got ${fetchable.length}`);
  }

  // 4. config values that name slugs (lib/config/leagues.ts invariants 5 and 7, checked here to avoid a cycle)
  for (const l of LEAGUES) {
    const slugs = new Set(inLeague(l.id).map((t) => t.slug));
    for (const [field, map] of [['officialCodes', l.officialCodes], ['officialNames', l.officialNames]] as const) {
      for (const [token, slug] of Object.entries(map)) {
        if (!slugs.has(slug)) fail(`${l.id}.${field}["${token}"] = ${slug} is not a ${l.id} slug`);
      }
    }
    const draw = getLeague(l.id).rules.drawNumbers;
    if (draw) {
      const keys = Object.keys(draw).sort();
      if (keys.join() !== [...slugs].sort().join()) fail(`${l.id}.drawNumbers keys do not equal its slugs`);
    }
    if (l.postseason.kind === 'league-tournament' && !slugs.has(l.postseason.finalSite.slug)) {
      fail(`${l.id}: finalSite ${l.postseason.finalSite.slug} is not a ${l.id} slug`);
    }
    for (const d of l.divisions) {
      for (const slug of d.maxprepsMissing) {
        if (bySlug.get(slug)?.division !== d.id) fail(`${d.id}.maxprepsMissing: ${slug} is not a member`);
      }
      // A known non-member row is never a member of this division: a school outside the registry (EAL: Red
      // Bluff), or a registry team of another division (Sunset: Bonita and Chaminade, MaxPreps' Sunset rows
      // this site lists with the LA independents, DESIGN §24.10).
      for (const id of Object.keys(d.maxprepsExtraRows)) {
        const team = byId.get(id);
        if (team && team.division === d.id) fail(`${d.id}.maxprepsExtraRows: ${id} is a member (${team.slug})`);
      }
    }
  }

  // 5. the alias index (built above; collisions already throw) and the acronym rule
  if (acronymCollisions.join() !== EXPECTED_ACRONYM_COLLISIONS.join()) {
    fail(`ACRONYM_COLLISIONS is [${acronymCollisions.join(', ')}], expected [${EXPECTED_ACRONYM_COLLISIONS.join(', ')}]`);
  }
}
