/**
 * The data files as the player registry reads them: each file's rows turned into sightings
 * (lib/players/registry-build.ts), one per row, saying only what that source says.
 *
 * Not sport-bound. Each file is read through a loose schema that takes the handful of fields the
 * registry uses and checks no slug against a team registry, so one run reads all three sports'
 * files whatever SCVAL_SPORT is; every file is still held to its own full contract by its own
 * loader and tests.
 *
 * What each source becomes:
 *
 *   rosters.json / jv-rosters.json   one sighting per MaxPreps row, by career id, with the row's
 *                                    name, grade, number, positions, height and captaincy. A row a
 *                                    person has said is not its career's player (`rowSplits`) drops
 *                                    the id and is known by its name.
 *   rosters-enrichment.json          joined to its varsity-page row by athleteId: each filled field
 *                                    is an observation naming its source, each recorded conflict a
 *                                    rejected one, each recruiting profile a class-year statement,
 *                                    `sourceName` another spelling, and `level` moves the row to the
 *                                    squad the school says it is on.
 *   player-stats.json                the stat sheet's number for the career, filed under varsity
 *                                    unless the player's only row that season is a JV one
 *   prior-players.json               a past season's stat sheet: career id, rebuilt name, class,
 *                                    number
 *   jv-rosters-school-sites.json     one sighting per listed name, with no id
 *   jv-profiles.json                 a class-year statement for a JV player, by name
 *   history-<season>.json            one sighting per all-league row, by name, in that season
 */

import { z } from 'zod';

import { isShortName, nameKey, type Sighting } from './registry-build';
import type { Observation, PlayerIdentity, PlayerLevel } from './registry-schema';
import type { SportId } from '../sports/current';

const text = z.string().min(1);

// ---------------------------------------------------------------- the files, loosely

const RosterRow = z.looseObject({
  athleteId: text.nullable(),
  careerProfileId: text.nullable(),
  careerId: text.nullable(),
  firstName: text.nullable(),
  lastName: text.nullable(),
  fullName: text,
  jersey: text.nullable(),
  grade: z.number().int().min(9).max(12).nullable(),
  positions: z.array(text),
  height: z.string().nullable(),
  isCaptain: z.boolean(),
});

export const RostersInput = z.looseObject({
  season: text,
  teams: z.array(z.looseObject({ slug: text, players: z.array(RosterRow) })),
});

const sourced = { kind: text, source: text };

export const EnrichmentInput = z.looseObject({
  season: text,
  teams: z.array(
    z.looseObject({
      slug: text,
      players: z.array(
        z.looseObject({
          athleteId: text,
          fullName: text,
          sourceName: text.nullable(),
          level: z.enum(['varsity', 'jv']).nullable(),
          grade: z.looseObject({ value: z.number().int().min(9).max(12), derived: z.boolean(), ...sourced }).nullable(),
          positions: z.looseObject({ value: z.array(text).min(1), ...sourced }).nullable(),
          jersey: z.looseObject({ value: text, ...sourced }).nullable(),
          height: z.looseObject({ value: text, ...sourced }).nullable(),
          conflicts: z.array(z.looseObject({ field: z.enum(['jersey', 'grade', 'position', 'height']), other: text, ...sourced })),
          profiles: z.array(z.looseObject({ platform: text, url: text, classOf: z.number().int().nullable() })),
        }),
      ),
    }),
  ),
});

export const PlayerStatsInput = z.looseObject({
  season: text,
  teams: z.array(
    z.looseObject({
      slug: text,
      players: z.array(z.looseObject({ careerId: text.nullable(), fullName: text, shortName: text, jersey: text.nullable(), onRoster: z.boolean() })),
    }),
  ),
});

export const JvSchoolSitesInput = z.looseObject({
  teams: z.array(
    z.looseObject({
      slug: text,
      pageUrl: text,
      /** "2026-27". */
      season: text,
      players: z.array(
        z.looseObject({
          name: text,
          jersey: text.nullable(),
          grade: z.number().int().min(9).max(12).nullable(),
          position: text.nullable(),
          height: z.string().nullable(),
          captain: z.boolean(),
        }),
      ),
    }),
  ),
});

export const JvProfilesInput = z.looseObject({
  season: text,
  teams: z.array(
    z.looseObject({
      slug: text,
      players: z.array(
        z.looseObject({ name: text, profiles: z.array(z.looseObject({ platform: text, url: text, classOf: z.number().int().nullable() })) }),
      ),
    }),
  ),
});

const AwardRow = z.looseObject({ player: text, slug: text.nullable().optional(), year: z.number().int().nullable().optional(), position: text.nullable().optional() });
const AwardList = z.looseObject({
  firstTeam: z.array(AwardRow).optional(),
  secondTeam: z.array(AwardRow).optional(),
  honorableMention: z.array(AwardRow).optional(),
});

export const HistoryInput = z.looseObject({
  /** "2025-26". */
  season: text,
  leagues: z.record(
    z.string(),
    z.looseObject({
      divisions: z
        .array(z.looseObject({ awards: z.looseObject({ varsity: AwardList.nullable().optional(), jv: AwardList.nullable().optional() }).nullable().optional() }))
        .optional(),
    }),
  ),
});

export { PriorPlayersSchema as PriorPlayersInput } from './prior-players-schema';
import type { PriorPlayers } from './prior-players-schema';

/** "2026-27" → "26-27". */
export function seasonYearOf(label: string): string {
  const m = /^20(\d{2})-(\d{2})$/.exec(label);
  if (!m) throw new Error(`registry: cannot read the season label "${label}"`);
  return `${m[1]}-${m[2]}`;
}

const HEIGHT = /^\d'\d{1,2}"$/;

// ---------------------------------------------------------------- one season's current files

export interface CurrentSeasonFiles {
  sport: SportId;
  rosters: z.infer<typeof RostersInput>;
  jvRosters: z.infer<typeof RostersInput> | null;
  enrichment: z.infer<typeof EnrichmentInput> | null;
  playerStats: z.infer<typeof PlayerStatsInput> | null;
  jvSchoolSites: z.infer<typeof JvSchoolSitesInput> | null;
  jvProfiles: z.infer<typeof JvProfilesInput> | null;
}

type Row = z.infer<typeof RosterRow>;

function rosterObservation(row: Row, page: PlayerLevel): Observation {
  return {
    src: page === 'jv' ? 'maxpreps-jv-roster' : 'maxpreps-roster',
    name: row.fullName,
    ...(row.grade !== null ? { grade: row.grade } : {}),
    ...(row.jersey !== null ? { jersey: row.jersey } : {}),
    ...(row.positions.length ? { positions: row.positions } : {}),
    ...(row.height !== null && HEIGHT.test(row.height) ? { height: row.height } : {}),
    ...(row.isCaptain ? { captain: true as const } : {}),
    ...(row.athleteId !== null ? { athleteId: row.athleteId } : {}),
  };
}

/** The season the current files are for, and every sighting they hold. */
export function currentSeasonSightings(files: CurrentSeasonFiles, identity: PlayerIdentity): { season: string; sightings: Sighting[] } {
  const { sport } = files;
  const season = files.rosters.season;
  const same = (label: string, other: string | undefined) => {
    if (other !== undefined && other !== season) throw new Error(`registry: ${sport} ${label} is for season ${other}, the rosters for ${season}`);
  };
  same('jv-rosters', files.jvRosters?.season);
  same('rosters-enrichment', files.enrichment?.season);
  same('player-stats', files.playerStats?.season);
  same('jv-profiles', files.jvProfiles?.season);

  const split = new Set(identity.rowSplits.filter((r) => r.sport === sport).map((r) => `${r.team} ${r.page} ${r.careerId} ${nameKey(r.name)}`));
  const sightings: Sighting[] = [];
  const base = (team: string, level: PlayerLevel) => ({ sport, season, team, level });

  const fromPage = (file: z.infer<typeof RostersInput>, page: PlayerLevel, overlay: Map<string, z.infer<typeof EnrichmentInput>['teams'][number]['players'][number]>) => {
    for (const team of file.teams) {
      for (const row of team.players) {
        const extra = row.athleteId !== null ? overlay.get(`${team.slug} ${row.athleteId}`) : undefined;
        const observations: Observation[] = [rosterObservation(row, page)];
        const nameKeys = [nameKey(row.fullName)];
        if (extra) {
          if (extra.sourceName !== null) {
            observations.push({ src: 'enrichment', name: extra.sourceName });
            nameKeys.push(nameKey(extra.sourceName));
          }
          const cite = (e: { kind: string; source: string }) => ({ src: 'enrichment' as const, kind: e.kind, url: e.source });
          if (extra.grade) observations.push({ ...cite(extra.grade), grade: extra.grade.value, ...(extra.grade.derived ? { derived: true as const } : {}) });
          if (extra.positions) observations.push({ ...cite(extra.positions), positions: extra.positions.value });
          if (extra.jersey) observations.push({ ...cite(extra.jersey), jersey: extra.jersey.value });
          if (extra.height && HEIGHT.test(extra.height.value)) observations.push({ ...cite(extra.height), height: extra.height.value });
          for (const c of extra.conflicts) {
            const said: Partial<Observation> | null =
              c.field === 'grade' ? (/^(9|1[0-2])$/.test(c.other) ? { grade: Number(c.other) } : null)
              : c.field === 'jersey' ? { jersey: c.other }
              : c.field === 'position' ? { positions: c.other.split(',').map((p) => p.trim()).filter(Boolean) }
              : HEIGHT.test(c.other) ? { height: c.other } : null;
            if (said) observations.push({ ...cite(c), ...said, rejected: true });
          }
          for (const p of extra.profiles) {
            observations.push({ src: 'profile', kind: p.platform, url: p.url, ...(p.classOf !== null ? { classOf: p.classOf } : {}) });
          }
        }
        const isSplit = row.careerId !== null && split.has(`${team.slug} ${page} ${row.careerId} ${nameKey(row.fullName)}`);
        const careerId = isSplit ? null : row.careerId;
        sightings.push({
          ...base(team.slug, extra?.level ?? page),
          careerIds: careerId ? [careerId] : [],
          ...(careerId && row.careerProfileId ? { careerProfileIds: { [careerId]: row.careerProfileId } } : {}),
          nameKeys: [...new Set(nameKeys)],
          firstName: row.firstName,
          lastName: row.lastName,
          observations,
        });
      }
    }
  };

  const overlay = new Map((files.enrichment?.teams ?? []).flatMap((t) => t.players.map((p) => [`${t.slug} ${p.athleteId}`, p] as const)));
  fromPage(files.rosters, 'varsity', overlay);
  if (files.jvRosters) fromPage(files.jvRosters, 'jv', new Map());

  for (const team of files.playerStats?.teams ?? []) {
    for (const p of team.players) {
      // A line with no career link is an initial and a last name: it identifies nobody.
      if (p.careerId === null) continue;
      sightings.push({
        ...base(team.slug, 'varsity'),
        softLevel: true,
        careerIds: [p.careerId],
        nameKeys: [],
        observations: [{ src: 'maxpreps-stats', name: p.onRoster ? p.shortName : p.fullName, ...(p.jersey !== null ? { jersey: p.jersey } : {}) }],
      });
    }
  }

  for (const team of files.jvSchoolSites?.teams ?? []) {
    if (seasonYearOf(team.season) !== season) {
      throw new Error(`registry: ${sport} jv-rosters-school-sites ${team.slug} is for ${team.season}, the rosters for ${season}`);
    }
    for (const p of team.players) {
      sightings.push({
        ...base(team.slug, 'jv'),
        careerIds: [],
        nameKeys: [nameKey(p.name)],
        observations: [
          {
            src: 'school-jv-roster',
            url: team.pageUrl,
            name: p.name,
            ...(p.grade !== null ? { grade: p.grade } : {}),
            ...(p.jersey !== null ? { jersey: p.jersey } : {}),
            ...(p.position !== null ? { positions: [p.position] } : {}),
            ...(p.height !== null && HEIGHT.test(p.height) ? { height: p.height } : {}),
            ...(p.captain ? { captain: true as const } : {}),
          },
        ],
      });
    }
  }

  for (const team of files.jvProfiles?.teams ?? []) {
    for (const p of team.players) {
      if (p.profiles.length === 0) continue;
      sightings.push({
        ...base(team.slug, 'jv'),
        careerIds: [],
        nameKeys: [nameKey(p.name)],
        observations: p.profiles.map((x) => ({ src: 'profile' as const, kind: x.platform, url: x.url, name: p.name, ...(x.classOf !== null ? { classOf: x.classOf } : {}) })),
      });
    }
  }

  return { season, sightings: sightings.filter((s) => s.careerIds.length > 0 || s.nameKeys.some((k) => k !== '')) };
}

// ---------------------------------------------------------------- a past season

export interface PastSeasonFiles {
  sport: SportId;
  /** "25-26". */
  season: string;
  priorPlayers: PriorPlayers | null;
  history: z.infer<typeof HistoryInput> | null;
}

const AWARDS = ['firstTeam', 'secondTeam', 'honorableMention'] as const;

export function pastSeasonSightings(files: PastSeasonFiles): Sighting[] {
  const { sport, season } = files;
  const sightings: Sighting[] = [];
  if (files.priorPlayers) {
    if (files.priorPlayers.season !== season || files.priorPlayers.sport !== sport) {
      throw new Error(`registry: prior-players is for ${files.priorPlayers.sport} ${files.priorPlayers.season}, not ${sport} ${season}`);
    }
    for (const team of files.priorPlayers.teams) {
      for (const p of team.players) {
        // No link and only an initial: nobody to follow.
        if (p.careerId === null && p.nameFrom === 'short-name') continue;
        sightings.push({
          sport,
          season,
          team: team.slug,
          level: 'varsity',
          softLevel: true,
          careerIds: p.careerId ? [p.careerId] : [],
          nameKeys: isShortName(p.name) ? [] : [nameKey(p.name)],
          observations: [
            { src: 'maxpreps-stats', name: p.name, ...(p.grade !== null ? { grade: p.grade } : {}), ...(p.jersey !== null ? { jersey: p.jersey } : {}) },
          ],
        });
      }
    }
  }
  if (files.history) {
    if (seasonYearOf(files.history.season) !== season) {
      throw new Error(`registry: the ${sport} history file is for ${files.history.season}, not ${season}`);
    }
    for (const league of Object.values(files.history.leagues)) {
      for (const division of league.divisions ?? []) {
        for (const level of ['varsity', 'jv'] as const) {
          const lists = division.awards?.[level];
          if (!lists) continue;
          for (const award of AWARDS) {
            for (const row of lists[award] ?? []) {
              // A row with no registry team (a school outside the registry) cannot be placed.
              if (!row.slug || nameKey(row.player) === '') continue;
              const grade = row.year !== null && row.year !== undefined && row.year >= 9 && row.year <= 12 ? row.year : null;
              sightings.push({
                sport,
                season,
                team: row.slug,
                level,
                careerIds: [],
                nameKeys: [nameKey(row.player)],
                observations: [
                  { src: 'all-league', name: row.player, award, ...(grade !== null ? { grade } : {}), ...(row.position ? { positions: [row.position] } : {}) },
                ],
              });
            }
          }
        }
      }
    }
  }
  return sightings;
}
