/**
 * A school's girls soccer seed as its boys basketball seed: the same school (id, slug, names, abbr, acronym, mascot,
 * city, colors and aliases), in the basketball build's division, on its MaxPreps boys basketball page and its si.com
 * boys basketball team. `maxprepsPath` is the school's MaxPreps path with `/basketball/` for `/soccer/girls/winter/`,
 * which is each team's `teamCanonicalUrl` on its league's MaxPreps boys basketball standings (read 2026-11-21;
 * tests/basketball.test.ts pins the paths). si.com team ids are per sport, so the si.com team id and slug are the
 * boys basketball team's (`BasketballSblive`), and the school id, which is the school's, must equal the soccer seed's.
 */

import type { Seed } from '../seed';

/** A school's si.com boys basketball team: its varsity games page `<teamId>-<slug>` and the school id in `team.school`. */
export interface BasketballSblive {
  teamId: string;
  slug: string;
  schoolId: string;
}

export function basketballSeedOf(seed: Seed, division: Seed['division'], sblive: BasketballSblive): Seed {
  if (!seed.maxprepsPath?.endsWith('/soccer/girls/winter/')) throw new Error(`${seed.slug}: not a girls soccer seed`);
  if (!sblive.slug.startsWith(`${sblive.teamId}-`)) throw new Error(`${seed.slug}: si.com slug ${sblive.slug} is not team ${sblive.teamId}'s`);
  if (seed.sbliveSchoolId !== undefined && seed.sbliveSchoolId !== sblive.schoolId) {
    throw new Error(`${seed.slug}: si.com school ${sblive.schoolId} is not the soccer seed's ${seed.sbliveSchoolId}`);
  }
  return {
    ...seed,
    division,
    maxprepsPath: seed.maxprepsPath.replace(/soccer\/girls\/winter\/$/, 'basketball/'),
    sbliveTeamId: sblive.teamId,
    sbliveSlug: sblive.slug,
    sbliveSchoolId: sblive.schoolId,
  };
}

/**
 * The seeds of `seeds` named in `teams`, in that order, each in `division` with its si.com boys basketball team;
 * throws on a slug `seeds` lacks.
 */
export function basketballSeedsOf(
  seeds: readonly Seed[],
  division: Seed['division'],
  teams: Readonly<Record<string, BasketballSblive>>,
): Seed[] {
  return Object.entries(teams).map(([slug, sblive]) => {
    const seed = seeds.find((s) => s.slug === slug);
    if (!seed) throw new Error(`${slug}: no such soccer seed`);
    return basketballSeedOf(seed, division, sblive);
  });
}
