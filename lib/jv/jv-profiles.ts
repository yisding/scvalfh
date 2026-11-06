/**
 * The JV players' own recruiting pages: data/jv-profiles.json, read by hand like the varsity
 * profiles in data/rosters-enrichment.json and linked by the same rule (lib/players/rosters-schema.ts
 * PlayerProfileSchema): a page names the player and a sport, and either names the school or shows a
 * class year that agrees with the grade plus a hometown in the school's own area.
 *
 * A JV player has no join key both JV sources share (a school's own list gives names only), so an
 * entry joins on team slug + the player's name as the team page's JV list spells it
 * (lib/jv/jv-rosters.ts getJvRoster, the varsity players already taken out), compared the way that
 * module compares names across sources (`nameKey`). Asserted at load time, so a bad file fails at
 * import rather than half-way through a render:
 *   - every entry is a player on the JV list the school's team page shows, and not on its varsity
 *     roster (a player who moves up gets her profiles in data/rosters-enrichment.json instead);
 *   - a class year a profile states agrees with the grade the JV list shows;
 *   - no profile is linked twice, in this file or across it and the varsity overlay;
 *   - no `maxpreps` profile: the claimed-page read of 2026-10-13 covered the varsity rows only.
 *
 * Commitments and clubs stay varsity-only (data/commits.json and data/clubs.json join on the varsity
 * rows' MaxPreps ids): this file holds profiles alone.
 */

import { z } from 'zod';

import bundled from '../../data/jv-profiles.json';
import { classOf, getRosterEnrichment } from '../players/rosters';
import { PlayerProfileSchema, type PlayerProfile } from '../players/rosters-schema';
import { dateKey, failValidation } from '../schema-primitives';
import { getTeamBySlug } from '../teams';
import type { TeamSlug } from '../types';
import { getJvRoster, nameKey } from './jv-rosters';

export const JvProfilePlayerSchema = z
  .object({
    /** As the team page's JV list spells the player. */
    name: z.string().min(1),
    /** The player's own recruiting pages, at most one per platform in each sport. */
    profiles: z
      .array(PlayerProfileSchema.refine((p) => p.platform !== 'maxpreps', 'no claimed-MaxPreps profiles for JV players'))
      .min(1),
  })
  .strict()
  .refine(
    (p) => new Set(p.profiles.map((x) => `${x.platform} ${x.sport ?? 'field-hockey'}`)).size === p.profiles.length,
    'one profile per platform in each sport',
  );

export const JvProfileTeamSchema = z
  .object({
    slug: z.string().refine((s) => getTeamBySlug(s) !== undefined, 'not a registry team slug'),
    players: z.array(JvProfilePlayerSchema).min(1),
  })
  .strict()
  .refine((t) => new Set(t.players.map((p) => nameKey(p.name))).size === t.players.length, 'a player is listed twice');

export const JvProfilesFileSchema = z
  .object({
    season: z.string().min(1),
    builtBy: z.string().min(1),
    capturedAt: dateKey,
    notes: z.array(z.string().min(1)),
    /** Only the schools with a JV player who has a profile. */
    teams: z.array(JvProfileTeamSchema),
  })
  .strict()
  .refine((f) => new Set(f.teams.map((t) => t.slug)).size === f.teams.length, 'one entry per school')
  .refine((f) => {
    const urls = f.teams.flatMap((t) => t.players.flatMap((p) => p.profiles.map((x) => x.url)));
    return new Set(urls).size === urls.length;
  }, 'a profile URL is linked to more than one player');

export type JvProfilesFile = z.infer<typeof JvProfilesFileSchema>;

function load(): JvProfilesFile {
  const parsed = JvProfilesFileSchema.safeParse(bundled);
  if (!parsed.success) failValidation('jv-profiles', parsed.error.issues);
  const file = parsed.data;
  const enrichment = getRosterEnrichment();
  if (file.season !== enrichment.season) {
    throw new Error(`jv-profiles is for season ${file.season}, the rosters for ${enrichment.season}`);
  }
  const varsityUrls = new Set(enrichment.teams.flatMap((t) => t.players.flatMap((p) => p.profiles.map((x) => x.url))));
  const fail = (slug: string, who: string, what: string): never => {
    throw new Error(`jv-profiles: ${slug} / ${who}: ${what}`);
  };
  for (const team of file.teams) {
    const roster = getJvRoster(team.slug as TeamSlug);
    const byName = new Map((roster?.players ?? []).map((p) => [nameKey(p.name), p]));
    for (const e of team.players) {
      const p = byName.get(nameKey(e.name));
      if (!p) fail(team.slug, e.name, 'not a player on the JV list the team page shows (or now on the varsity roster)');
      for (const x of e.profiles) {
        if (varsityUrls.has(x.url)) fail(team.slug, e.name, `${x.url} is already linked to a varsity player`);
        if (x.classOf !== null && p!.grade !== null && x.classOf !== classOf(file.season, p!.grade)) {
          fail(team.slug, e.name, `${x.platform} profile says class of ${x.classOf}, the JV list shows grade ${p!.grade}`);
        }
      }
    }
  }
  return file;
}

const file = load();
const BY_TEAM = new Map(
  file.teams.map((t) => [t.slug, new Map(t.players.map((p) => [nameKey(p.name), p.profiles]))]),
);

export function getJvProfilesFile(): JvProfilesFile {
  return file;
}

/** A JV player's own recruiting pages, by the name the team page's JV list gives; [] for most. */
export function getJvPlayerProfiles(slug: TeamSlug, name: string): readonly PlayerProfile[] {
  return BY_TEAM.get(slug)?.get(nameKey(name)) ?? [];
}
