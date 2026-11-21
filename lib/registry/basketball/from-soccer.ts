/**
 * A school's girls soccer seed as its boys basketball seed: the same school (id, slug, names, abbr, acronym, mascot,
 * city, colors and aliases), in the basketball build's division, on its MaxPreps boys basketball page. `maxprepsPath`
 * is the school's MaxPreps path with `/basketball/` for `/soccer/girls/winter/`, which is each team's
 * `teamCanonicalUrl` on its league's MaxPreps boys basketball standings (read 2026-11-21; tests/basketball.test.ts
 * pins the paths).
 */

import type { Seed } from '../seed';

export function basketballSeedOf(seed: Seed, division: Seed['division']): Seed {
  if (!seed.maxprepsPath?.endsWith('/soccer/girls/winter/')) throw new Error(`${seed.slug}: not a girls soccer seed`);
  return { ...seed, division, maxprepsPath: seed.maxprepsPath.replace(/soccer\/girls\/winter\/$/, 'basketball/') };
}

/** The seeds of `seeds` named in `slugs`, in that order, each in `division`; throws on a slug `seeds` lacks. */
export function basketballSeedsOf(seeds: readonly Seed[], division: Seed['division'], slugs: readonly string[]): Seed[] {
  return slugs.map((slug) => {
    const seed = seeds.find((s) => s.slug === slug);
    if (!seed) throw new Error(`${slug}: no such soccer seed`);
    return basketballSeedOf(seed, division);
  });
}
