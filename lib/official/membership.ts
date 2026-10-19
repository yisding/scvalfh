/**
 * Official membership vs the registry (SPEC §1.3): the SCVAL grid's `Teams:` roster line diffed
 * against the registry's division members. Warnings only — alignment stays the registry's.
 */

import type { DivisionId, TeamSlug } from '@/lib/model/ids';
import { resolveTeam } from '@/lib/registry/resolve';
import { teamsInDivision } from '@/lib/registry/teams';
import type { OfficialSchedule } from '@/lib/sources/scval/grid';

export interface MembershipDiff {
  division: DivisionId;
  /** Official names the registry does not know. */
  unknownOfficialNames: string[];
  /** Registry slugs the official roster line omits. */
  missingFromOfficial: TeamSlug[];
  /** Official slugs the registry puts in the other division. */
  wrongDivision: Array<{ slug: TeamSlug; registryDivision: DivisionId }>;
  warnings: string[];
}

/** (a) of the brief: diff official membership against the registry and WARN — never rewrite it. */
export function diffMembership(schedule: OfficialSchedule): MembershipDiff {
  const warnings: string[] = [];
  const unknownOfficialNames: string[] = [];
  const wrongDivision: Array<{ slug: TeamSlug; registryDivision: DivisionId }> = [];
  const officialSlugs = new Set<TeamSlug>();

  for (const name of schedule.officialTeamNames) {
    const team = resolveTeam(name);
    if (!team) {
      unknownOfficialNames.push(name);
      warnings.push(`${schedule.division}: official roster names "${name}", unknown to the registry`);
      continue;
    }
    officialSlugs.add(team.slug);
    if (team.division !== schedule.division) {
      wrongDivision.push({ slug: team.slug, registryDivision: team.division });
      warnings.push(
        `${schedule.division}: official roster lists ${team.slug}, ` +
          `but the registry has it in ${team.division}`,
      );
    }
  }

  const missingFromOfficial = teamsInDivision(schedule.division)
    .map((t) => t.slug)
    .filter((slug) => !officialSlugs.has(slug));
  for (const slug of missingFromOfficial) {
    warnings.push(
      `${schedule.division}: registry has ${slug} but the official roster line does not`,
    );
  }

  return {
    division: schedule.division,
    unknownOfficialNames,
    missingFromOfficial,
    wrongDivision,
    warnings,
  };
}
