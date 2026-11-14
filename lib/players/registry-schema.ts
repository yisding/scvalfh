/**
 * The Zod contract for data/players.json: the player registry, one record per person across every
 * sport and season this repository holds.
 *
 * Internal data. No page reads it and no module under app/ or components/ may import it
 * (tests/players-registry.test.ts holds that): it is read by scripts and tests through
 * lib/players/registry-file.ts, from disk.
 *
 * Three layers:
 *
 *   Player       a person, under an id this repository mints (`p` + hex). The id never changes
 *                once written: not when MaxPreps reissues its per-season ids, not when a player
 *                changes school, not when two records turn out to be one person (the id that is
 *                retired then moves to `formerIds`, so an old reference still resolves).
 *                `identifiers` are the keys other sources know the player by.
 *   Stint        one player on one team in one season of one sport at one level. A number, a
 *                position and a captaincy belong to a stint, never to the person: a varsity 9 and a
 *                JV 10 in the same autumn are two stints, not a disagreement.
 *   Observation  what one source said about that stint, kept as the source said it. A stint's own
 *                fields (`name`, `grade`, `jersey`, …) are computed from its observations by a fixed
 *                precedence (lib/players/registry-build.ts), and `conflicts` lists every observation
 *                that says something else. Nobody types a conflict in.
 *
 * A class year is the one fact that belongs to the person and is checkable across seasons, so the
 * player carries `classOf` (the graduation year) and each grade is read against it: a source that
 * says grade 10 in 25-26 and one that says grade 12 in 26-27 disagree, and `classOfConflicts` says so.
 *
 * Invariants (checked here):
 *   1. ids are unique, and no id is also somebody's former id
 *   2. an identifier belongs to one player
 *   3. a player has at least one identifier and at least one stint
 *   4. a stint is unique per (season, sport, team, level), has at least one observation, and each
 *      of its fields is the value of one of its observations (or null when none states it)
 *   5. `names` starts with `name` and has no repeats
 *   6. a conflict names a field its stint shows another value for
 */

import { z } from 'zod';

import { playerId } from '../schema-primitives';
import { SPORT_IDS } from '../sports/current';

/** A MaxPreps season year: "26-27". */
export const seasonYear = z.string().regex(/^\d{2}-\d{2}$/, 'expected a season year like 26-27');

export { playerId };

/**
 * The squads a school fields, highest first. Field hockey and soccer have varsity and JV; some
 * basketball programs also field a freshman team. No file in the repository lists a freshman team's
 * players yet, so nothing is filed under 'freshman' today: the level exists so that the first source
 * that does (a MaxPreps freshman roster page, a school's own list) has somewhere to go.
 */
export const PLAYER_LEVELS = ['varsity', 'jv', 'freshman'] as const;
export type PlayerLevel = (typeof PLAYER_LEVELS)[number];

/** Where an observation was read. The order is the precedence a stint's fields are resolved by. */
export const OBSERVATION_SOURCES = [
  /** the school's MaxPreps varsity roster page (data/rosters.json) */
  'maxpreps-roster',
  /** the school's MaxPreps JV roster page (data/jv-rosters.json) */
  'maxpreps-jv-roster',
  /** another public source, recorded in data/rosters-enrichment.json; `kind` and `url` say which */
  'enrichment',
  /** the school's own JV list (data/jv-rosters-school-sites.json) */
  'school-jv-roster',
  /** the team's MaxPreps season stat sheet (data/player-stats.json, data/prior-players.json) */
  'maxpreps-stats',
  /** a league's all-league list (data/history-<season>.json) */
  'all-league',
  /** the player's own recruiting page: states a class year, nothing else */
  'profile',
] as const;
export type ObservationSource = (typeof OBSERVATION_SOURCES)[number];

const text = z.string().min(1);

/**
 * One source's statement. Only what the source states is present: an absent field is "the source
 * did not say", never "the source said none".
 */
export const ObservationSchema = z
  .object({
    src: z.enum(OBSERVATION_SOURCES),
    /** For `enrichment`: the overlay's source kind ("school-site", "news", …). For `profile`: the platform. */
    kind: text.optional(),
    /** The page the statement was read on, where the source file records one per statement. */
    url: text.optional(),
    /** The name as this source spells it. */
    name: text.optional(),
    /** 9–12 in this stint's season. */
    grade: z.number().int().min(9).max(12).optional(),
    /** A graduation year the source states outright. */
    classOf: z.number().int().min(2020).max(2040).optional(),
    jersey: text.optional(),
    /** As the source writes them: MaxPreps' codes ("F", "M") or a school's words ("Midfield"). */
    positions: z.array(text).min(1).optional(),
    /** `5'7"`. */
    height: z.string().regex(/^\d'\d{1,2}"$/).optional(),
    /** Present only when the source marks a captain. */
    captain: z.literal(true).optional(),
    /** MaxPreps' per-season athlete id for the row this was read from: the join other files use. */
    athleteId: text.optional(),
    /** The honour, for `all-league`: "firstTeam", "secondTeam", "thirdTeam", "honorableMention". */
    award: text.optional(),
    /** True when the grade was computed from another season's class year, not read for this one. */
    derived: z.literal(true).optional(),
    /**
     * True for a statement the overlay recorded as a disagreement and did not take
     * (data/rosters-enrichment.json `conflicts`). It never decides a field, and is always a conflict.
     */
    rejected: z.literal(true).optional(),
  })
  .strict();

/** The observations that may decide a field: every one the overlay did not record as rejected. */
function accepted<O extends { rejected?: true }>(s: { observations: O[] }): O[] {
  return s.observations.filter((o) => o.rejected !== true);
}

export const STINT_FIELDS = ['name', 'grade', 'jersey', 'positions', 'height'] as const;
export type StintField = (typeof STINT_FIELDS)[number];

/** An observation that disagrees with the value its stint shows. */
export const StintConflictSchema = z
  .object({
    field: z.enum(['grade', 'jersey', 'positions', 'height']),
    /** What the stint shows, as text; null when it shows nothing for the field. */
    kept: text.nullable(),
    /** What the other source says, as text. */
    other: text,
    src: z.enum(OBSERVATION_SOURCES),
    kind: text.optional(),
    url: text.optional(),
  })
  .strict();

export const StintSchema = z
  .object({
    season: seasonYear,
    sport: z.enum(SPORT_IDS),
    /** The registry team slug (lib/teams.ts, in that sport's registry). */
    team: text,
    level: z.enum(PLAYER_LEVELS),
    /** The name as this stint's best source spells it. */
    name: text,
    grade: z.number().int().min(9).max(12).nullable(),
    jersey: text.nullable(),
    positions: z.array(text),
    height: z.string().nullable(),
    captain: z.boolean(),
    observations: z.array(ObservationSchema).min(1),
    conflicts: z.array(StintConflictSchema),
    /**
     * True when no source lists this stint any more: a build read the season's files and the player
     * was not in them, so the stint is kept as an earlier build left it (a player who left the team
     * in October was still on it in September).
     */
    gone: z.literal(true).optional(),
  })
  .strict()
  .refine((s) => s.observations.some((o) => o.name === s.name), 'name is not one of the observations\'')
  .refine((s) => s.grade === null || accepted(s).some((o) => o.grade === s.grade), 'grade is not one of the observations\'')
  .refine((s) => s.jersey === null || accepted(s).some((o) => o.jersey === s.jersey), 'jersey is not one of the observations\'')
  .refine((s) => s.height === null || accepted(s).some((o) => o.height === s.height), 'height is not one of the observations\'')
  .refine(
    (s) => s.positions.length === 0 || accepted(s).some((o) => o.positions?.join('|') === s.positions.join('|')),
    'positions are not one of the observations\'',
  )
  .refine((s) => s.captain === s.observations.some((o) => o.captain === true), 'captain disagrees with the observations');

/**
 * A key another source knows the player by.
 *   maxpreps-career  MaxPreps' career id (the `?careerid=` key; `careerProfileId` is the same
 *                    record's GUID, known once a roster page has listed the player)
 *   name             a name on one team's lists in one sport, for a player no MaxPreps career has
 *                    been tied to. `name` is the comparison key (lib/players/registry-build.ts
 *                    nameKey), not a spelling.
 */
export const PlayerIdentifierSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('maxpreps-career'), careerId: text, careerProfileId: text.nullable() }).strict(),
  z.object({ kind: z.literal('name'), sport: z.enum(SPORT_IDS), team: text, name: text }).strict(),
]);
export type PlayerIdentifier = z.infer<typeof PlayerIdentifierSchema>;

/** One string per identifier: what "belongs to one player" is checked on, and what curation names. */
export function identifierKey(i: PlayerIdentifier): string {
  return i.kind === 'maxpreps-career' ? `mp:${i.careerId}` : `name:${i.sport}:${i.team}:${i.name}`;
}

export const ClassOfConflictSchema = z
  .object({
    classOf: z.number().int(),
    season: seasonYear,
    sport: z.enum(SPORT_IDS),
    team: text,
    level: z.enum(PLAYER_LEVELS),
    src: z.enum(OBSERVATION_SOURCES),
    kind: text.optional(),
    url: text.optional(),
  })
  .strict();

export const PlayerSchema = z
  .object({
    id: playerId,
    /** Ids this player was once filed under, after two records were found to be one person. */
    formerIds: z.array(playerId),
    /** The name to show: the latest season's best source's spelling. */
    name: text,
    /** Every spelling any source uses, `name` first. */
    names: z.array(text).min(1),
    /** Graduation year, from the latest season's best source; null when no source gives a grade. */
    classOf: z.number().int().min(2020).max(2040).nullable(),
    /** Every statement that implies another graduation year. */
    classOfConflicts: z.array(ClassOfConflictSchema),
    identifiers: z.array(PlayerIdentifierSchema).min(1),
    stints: z.array(StintSchema).min(1),
  })
  .strict()
  .refine((p) => p.names[0] === p.name, 'names must start with name')
  .refine((p) => new Set(p.names).size === p.names.length, 'names has a repeat')
  .refine(
    (p) => new Set(p.stints.map((s) => `${s.season} ${s.sport} ${s.team} ${s.level}`)).size === p.stints.length,
    'two stints for one season, sport, team and level',
  )
  .refine((p) => p.classOfConflicts.every((c) => c.classOf !== p.classOf), 'a classOf conflict agrees with classOf');

/**
 * Something the resolver would not decide alone. Each is a question for a person; the answer goes
 * in data/player-identity.json, never into this file by hand.
 *   same-name-two-careers  two MaxPreps careers on one team share a name. `merged` says whether the
 *                          resolver treated them as one player (their class years do not contradict)
 *   name-ambiguous         a name with no id matches more than one player of its team
 *   name-class-mismatch    a name with no id matches one player whose class year is two or more
 *                          years off, so it was kept apart
 *   possible-match         two players of one team whose names look like one person's (a nickname,
 *                          a middle name, a slip of the pen) and whose class years do not
 *                          contradict: not joined, only suggested
 *   same-name-other-sport  the same name at the same school in two sports, with class years that
 *                          do not contradict and no MaxPreps career id in common: names are never
 *                          joined across sports, so this is only a suggestion
 *   career-two-names       one MaxPreps career id is listed under two unrelated names
 */
export const REVIEW_KINDS = [
  'same-name-two-careers',
  'name-ambiguous',
  'name-class-mismatch',
  'possible-match',
  'same-name-other-sport',
  'career-two-names',
] as const;

export const ReviewItemSchema = z
  .object({
    kind: z.enum(REVIEW_KINDS),
    sport: z.enum(SPORT_IDS),
    team: text,
    /** The seasons of the rows involved: an item about seasons a later build no longer reads is kept as it was. */
    seasons: z.array(seasonYear).min(1),
    /** The spellings involved. */
    names: z.array(text).min(1),
    /** The players involved, by id. */
    players: z.array(playerId).min(1),
    note: text,
  })
  .strict();

export const PlayerCountsSchema = z
  .object({
    players: z.number().int(),
    /** Players with a MaxPreps career id. */
    withCareer: z.number().int(),
    /** Players known by a name alone. */
    nameOnly: z.number().int(),
    stints: z.number().int(),
    observations: z.number().int(),
    /** Players with stints in more than one season. */
    multiSeason: z.number().int(),
    /** Players with stints in more than one sport. */
    multiSport: z.number().int(),
    stintConflicts: z.number().int(),
    classOfConflicts: z.number().int(),
    review: z.number().int(),
  })
  .strict();

export const PlayersFileSchema = z
  .object({
    builtBy: text,
    notes: z.array(text),
    /**
     * The (sport, season) pairs whose source files this build read; every other stint is carried
     * forward. A pair with `sources` was only topped up: those sources' observations were read
     * afresh and everything else in the pair carried forward (a season the registry saw live, whose
     * rosters have since been overwritten, still gains its all-league lists).
     */
    built: z.array(
      z.object({ sport: z.enum(SPORT_IDS), season: seasonYear, sources: z.array(z.enum(OBSERVATION_SOURCES)).min(1).optional() }).strict(),
    ),
    counts: PlayerCountsSchema,
    review: z.array(ReviewItemSchema),
    players: z.array(PlayerSchema),
  })
  .strict()
  .superRefine((f, ctx) => {
    const ids = new Set<string>();
    const keys = new Map<string, string>();
    for (const p of f.players) {
      if (ids.has(p.id)) ctx.addIssue({ code: 'custom', message: `player id ${p.id} appears twice` });
      ids.add(p.id);
      for (const i of p.identifiers) {
        const k = identifierKey(i);
        const owner = keys.get(k);
        if (owner) ctx.addIssue({ code: 'custom', message: `identifier ${k} belongs to ${owner} and ${p.id}` });
        keys.set(k, p.id);
      }
    }
    const former = new Map<string, string>();
    for (const p of f.players) {
      for (const old of p.formerIds) {
        if (ids.has(old)) ctx.addIssue({ code: 'custom', message: `${old} is a player id and a former id of ${p.id}` });
        const owner = former.get(old);
        if (owner) ctx.addIssue({ code: 'custom', message: `former id ${old} is on ${owner} and ${p.id}` });
        former.set(old, p.id);
      }
    }
    for (const r of f.review) {
      for (const id of r.players) {
        if (!ids.has(id)) ctx.addIssue({ code: 'custom', message: `review item names ${id}, which is not a player` });
      }
    }
    const counts = countPlayers(f.players, f.review.length);
    for (const k of Object.keys(counts) as Array<keyof typeof counts>) {
      if (counts[k] !== f.counts[k]) {
        ctx.addIssue({ code: 'custom', message: `counts.${k} is ${f.counts[k]}, the rows give ${counts[k]}` });
      }
    }
  });

export type Observation = z.infer<typeof ObservationSchema>;
export type StintConflict = z.infer<typeof StintConflictSchema>;
export type Stint = z.infer<typeof StintSchema>;
export type ClassOfConflict = z.infer<typeof ClassOfConflictSchema>;
export type Player = z.infer<typeof PlayerSchema>;
export type ReviewItem = z.infer<typeof ReviewItemSchema>;
export type PlayerCounts = z.infer<typeof PlayerCountsSchema>;
export type PlayersFile = z.infer<typeof PlayersFileSchema>;

/** The one place the summary numbers are computed; the schema refuses a file that disagrees. */
export function countPlayers(players: readonly Player[], review: number): PlayerCounts {
  const stints = players.flatMap((p) => p.stints);
  return {
    players: players.length,
    withCareer: players.filter((p) => p.identifiers.some((i) => i.kind === 'maxpreps-career')).length,
    nameOnly: players.filter((p) => p.identifiers.every((i) => i.kind === 'name')).length,
    stints: stints.length,
    observations: stints.reduce((n, s) => n + s.observations.length, 0),
    multiSeason: players.filter((p) => new Set(p.stints.map((s) => s.season)).size > 1).length,
    multiSport: players.filter((p) => new Set(p.stints.map((s) => s.sport)).size > 1).length,
    stintConflicts: stints.reduce((n, s) => n + s.conflicts.length, 0),
    classOfConflicts: players.reduce((n, p) => n + p.classOfConflicts.length, 0),
    review,
  };
}

// ---------------------------------------------------------------- the curation file

/**
 * data/player-identity.json: what a person has decided about who is who. Curated, never guessed:
 * every entry says why.
 *
 *   sameAs     the name `name` on `team`'s lists in `sport` is the player with MaxPreps career
 *              `careerId`, or the player its lists call `isName`. For a spelling no rule may join
 *              alone (a nickname, a misspelling).
 *   rowSplits  the MaxPreps row named `name` on `team`'s `page` roster carries `careerId` but is not
 *              that career's player: it is resolved by its name instead.
 *   distinct   the two MaxPreps careers on `team` are two people, though they share a name: the
 *              resolver never joins them, and a bare name that fits both is left for review.
 *   notSame    the two names at `team` are two people (sisters, namesakes), though they look like
 *              one: the pair is no longer listed for review. Two different names are a pair of
 *              `sport`'s team; one name given twice is that name at the school in two sports. It
 *              only settles the question: two MaxPreps careers under ONE name on one team are kept
 *              apart by `distinct`.
 */
export const PlayerIdentitySchema = z
  .object({
    notes: z.array(text),
    sameAs: z.array(
      z
        .object({
          sport: z.enum(SPORT_IDS),
          team: text,
          name: text,
          careerId: text.optional(),
          isName: text.optional(),
          basis: text,
        })
        .strict()
        .refine((e) => (e.careerId === undefined) !== (e.isName === undefined), 'give exactly one of careerId and isName'),
    ),
    rowSplits: z.array(
      z.object({ sport: z.enum(SPORT_IDS), team: text, page: z.enum(PLAYER_LEVELS), name: text, careerId: text, basis: text }).strict(),
    ),
    distinct: z.array(z.object({ sport: z.enum(SPORT_IDS), team: text, careerIds: z.tuple([text, text]), basis: text }).strict()),
    notSame: z.array(z.object({ sport: z.enum(SPORT_IDS), team: text, names: z.tuple([text, text]), basis: text }).strict()),
  })
  .strict();
export type PlayerIdentity = z.infer<typeof PlayerIdentitySchema>;
