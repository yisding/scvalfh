/**
 * The alias index and its acronym rule: the resolver's keys (`normalizeTeamKey`), the acronyms two or
 * more teams share (never keys), and the index itself, built at module load, which throws
 * `lib/registry/teams.ts: alias … maps to both …` on any other collision. Private to the package:
 * lib/registry/resolve.ts reads ALIAS_INDEX; the door (lib/registry/teams.ts) re-exports normalizeTeamKey
 * and ACRONYM_COLLISIONS, and its assert (lib/registry/assert.ts) checks ACRONYM_COLLISIONS.
 */

import { failInvariant } from '@/lib/config/invariant';
import type { Team } from '@/lib/model/team';

import { TEAMS } from './team-list';

/** Case-, punctuation- and "High School"-insensitive key. */
export function normalizeTeamKey(input: string): string {
  const flat = input.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return flat.endsWith('highschool') ? flat.slice(0, -'highschool'.length) : flat;
}

/** Normalized acronyms carried by two or more teams. */
function collidingAcronymKeys(): Set<string> {
  const counts = new Map<string, number>();
  for (const t of TEAMS) {
    const key = normalizeTeamKey(t.acronym);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, n]) => n > 1).map(([key]) => key));
}

const COLLIDING_ACRONYM_KEYS = collidingAcronymKeys();

/** Acronyms shared by ≥ 2 teams. Display only: they are NOT indexed for resolution. Sorted. */
export const ACRONYM_COLLISIONS: readonly string[] = [
  ...new Set(
    TEAMS.filter((t) => COLLIDING_ACRONYM_KEYS.has(normalizeTeamKey(t.acronym))).map((t) => t.acronym),
  ),
].sort();

/**
 * The alias index: [id, slug, name, ...aliases] plus `acronym` ONLY when no other team has the
 * same normalized acronym. Any other collision throws at module load. `shortName` is display only
 * and not a key: it is whole words of `name` or already an alias, and a bare word of a name can be
 * a statewide namesake that is deliberately not an alias ('University': San Francisco's, and
 * Irvine's on si.com), so choosing a short name never adds a matching spelling.
 */
const BY_KEY = new Map<string, Team>();
for (const t of TEAMS) {
  const spellings = [t.id, t.slug, t.name, ...t.aliases];
  if (!COLLIDING_ACRONYM_KEYS.has(normalizeTeamKey(t.acronym))) spellings.push(t.acronym);
  for (const raw of spellings) {
    const key = normalizeTeamKey(raw);
    if (!key) continue;
    const prior = BY_KEY.get(key);
    if (prior && prior.id !== t.id) {
      failInvariant(
        'lib/registry/teams.ts',
        `alias "${raw}" (${key}) maps to both ${prior.slug} and ${t.slug}`,
      );
    }
    BY_KEY.set(key, t);
  }
}

/** The alias index (above): a normalized key → its one team. */
export const ALIAS_INDEX: ReadonlyMap<string, Team> = BY_KEY;
