/**
 * Reading the player registry and everything it is built from, from disk.
 *
 * For scripts and tests only. The registry is internal: it is never imported into a bundle, so
 * nothing here is `import`ed JSON, and no module under app/ or components/ may reach this file
 * (tests/players-registry.test.ts holds that). Every sport's files are read in one go, whatever
 * SCVAL_SPORT is, because a person is one person in every sport.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import type { ZodType } from 'zod';

import type { BuildInput, Sighting } from './registry-build';
import {
  PlayerIdentitySchema,
  PlayersFileSchema,
  type ObservationSource,
  type PlayerIdentity,
  type PlayersFile,
} from './registry-schema';
import {
  EnrichmentInput,
  HistoryInput,
  JvProfilesInput,
  JvSchoolSitesInput,
  PlayerStatsInput,
  PriorPlayersInput,
  RostersInput,
  currentSeasonSightings,
  pastSeasonSightings,
  seasonYearOf,
} from './registry-sources';
import { SPORT_IDS, type SportId } from '../sports/current';

export const PLAYERS_FILE = 'data/players.json';
export const PLAYER_IDENTITY_FILE = 'data/player-identity.json';

/** A sport's data directory, relative to the repository: data/ for field hockey, data/<sport>/ otherwise. */
export function sportDataDir(sport: SportId): string {
  return sport === 'field-hockey' ? 'data' : `data/${sport}`;
}

function readJson<T>(root: string, rel: string, schema: ZodType<T>): T | null {
  const file = path.join(root, rel);
  if (!existsSync(file)) return null;
  const parsed = schema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
  if (!parsed.success) {
    throw new Error(
      `${rel} does not read as the registry expects:\n${parsed.error.issues.slice(0, 8).map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n')}`,
    );
  }
  return parsed.data;
}

export function readPlayersFile(root: string): PlayersFile | null {
  return readJson(root, PLAYERS_FILE, PlayersFileSchema);
}

export function readPlayerIdentity(root: string): PlayerIdentity {
  return readJson(root, PLAYER_IDENTITY_FILE, PlayerIdentitySchema) ?? { notes: [], sameAs: [], rowSplits: [], distinct: [], notSame: [] };
}

/** The sources only a season's live files carry: a past season that has them was seen live. */
const LIVE_SOURCES: ReadonlySet<ObservationSource> = new Set(['maxpreps-roster', 'maxpreps-jv-roster', 'enrichment', 'school-jv-roster']);

/**
 * Everything the build needs, read from the repository at `root`: each sport's current files in
 * full, and each past season its files still describe (last season's stat sheets, a season's
 * all-league lists). A past season the previous registry already holds from its live files is only
 * topped up from those, never rebuilt from them.
 */
export function readBuildInput(root: string, builtBy: string): BuildInput & { skipped: string[] } {
  const previous = readPlayersFile(root);
  const identity = readPlayerIdentity(root);
  const built: Array<BuildInput['built'][number]> = [];
  const sightings: Sighting[] = [];
  const skipped: string[] = [];

  for (const sport of SPORT_IDS) {
    const dir = sportDataDir(sport);
    const rosters = readJson(root, `${dir}/rosters.json`, RostersInput);
    let current: string | null = null;
    if (rosters) {
      const now = currentSeasonSightings(
        {
          sport,
          rosters,
          jvRosters: readJson(root, `${dir}/jv-rosters.json`, RostersInput),
          enrichment: readJson(root, `${dir}/rosters-enrichment.json`, EnrichmentInput),
          playerStats: readJson(root, `${dir}/player-stats.json`, PlayerStatsInput),
          jvSchoolSites: readJson(root, `${dir}/jv-rosters-school-sites.json`, JvSchoolSitesInput),
          jvProfiles: readJson(root, `${dir}/jv-profiles.json`, JvProfilesInput),
        },
        identity,
      );
      current = now.season;
      skipped.push(...now.skipped);
      built.push({ sport, season: now.season });
      sightings.push(...now.sightings);
    }

    const prior = readJson(root, `${dir}/prior-players.json`, PriorPlayersInput);
    const histories = (existsSync(path.join(root, dir)) ? readdirSync(path.join(root, dir)) : [])
      .filter((f) => /^history-20\d{2}-\d{2}\.json$/.test(f))
      .sort()
      .map((f) => readJson(root, `${dir}/${f}`, HistoryInput))
      .filter((h) => h !== null);
    const pastSeasons = new Set<string>([...(prior ? [prior.season] : []), ...histories.map((h) => seasonYearOf(h.season))]);
    for (const season of [...pastSeasons].sort()) {
      // The current season's own files are the fuller account of it.
      if (season === current) continue;
      const priorPlayers = prior && prior.season === season ? prior : null;
      const history = histories.find((h) => seasonYearOf(h.season) === season) ?? null;
      const sawLive = (previous?.players ?? []).some((p) =>
        p.stints.some((s) => s.sport === sport && s.season === season && s.observations.some((o) => LIVE_SOURCES.has(o.src))),
      );
      const sources: ObservationSource[] = [...(priorPlayers ? (['maxpreps-stats'] as const) : []), ...(history ? (['all-league'] as const) : [])];
      built.push(sawLive ? { sport, season, sources } : { sport, season });
      sightings.push(...pastSeasonSightings({ sport, season, priorPlayers, history }));
    }
  }
  return { previous, identity, built, sightings, builtBy, skipped };
}
