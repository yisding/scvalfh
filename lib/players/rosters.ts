/**
 * The read API for data/field-hockey/rosters.json and data/field-hockey/rosters-enrichment.json — every registry team's
 * roster, all nine leagues and the five independents (SPEC §1.1j).
 *
 * Two files, one view:
 *   - data/field-hockey/rosters.json is the MaxPreps roster, rebuilt by `scripts/fetch-rosters.ts` (by hand or
 *     on a weekly schedule, not by the twice-daily cron).
 *   - data/field-hockey/rosters-enrichment.json is what other public sources add — school athletics sites, a
 *     school roster PDF, school and local papers, MaxPreps career, JV and earlier-season pages — joined on team slug +
 *     MaxPreps athleteId. It only ever fills a blank; where a source disagrees with MaxPreps,
 *     MaxPreps stays and the disagreement is recorded. It also links players' own recruiting
 *     profiles (NCSA and the like, and MaxPreps career pages the player has claimed). `getEnrichedTeamRoster` merges the two and says, per field,
 *     where each value came from. Both files hold one entry per registry team (102); a team no run
 *     has covered yet is status 'pending', and a team nothing was found for has an empty overlay.
 *     A team's entry may also say what other public sources showed for its current roster
 *     (`otherRosters`, below), which is what a team page with no MaxPreps players may claim.
 *
 * Both are imported so the build bundles them, for the reason lib/history/history.ts and lib/data.ts give:
 * a Worker has no project filesystem. Both are validated once at module scope, and the merge rules
 * are asserted at load time too, so a bad file fails at import time rather than half-way through a
 * render. `SCVAL_ROSTERS` / `SCVAL_ROSTERS_ENRICHMENT` swap in other files through node:fs (Node
 * only; never set them on a Worker).
 */

import { z } from 'zod';
import bundledEnrichmentFieldHockey from '../../data/field-hockey/rosters-enrichment.json';
import bundledEnrichmentBasketball from '../../data/basketball/rosters-enrichment.json';
import bundledEnrichmentVolleyball from '../../data/volleyball/rosters-enrichment.json';
import bundledEnrichmentSoccer from '../../data/soccer/rosters-enrichment.json';
import bundledEnrichmentValSoccer from '../../data/val-soccer/rosters-enrichment.json';
import bundledRostersFieldHockey from '../../data/field-hockey/rosters.json';
import bundledRostersBasketball from '../../data/basketball/rosters.json';
import bundledRostersVolleyball from '../../data/volleyball/rosters.json';
import bundledRostersSoccer from '../../data/soccer/rosters.json';
import bundledRostersValSoccer from '../../data/val-soccer/rosters.json';
import { readOverride, validateData } from '../data-file';
import {
  RosterEnrichmentSchema,
  RostersSchema,
  type EnrichedGrade,
  type EnrichedHeight,
  type EnrichedJersey,
  type EnrichedName,
  type EnrichedPlayer,
  type EnrichedPositions,
  type EnrichedTeam,
  type EnrichmentSource,
  type PlayerProfile,
  type RosterCoach,
  type RosterConflict,
  type RosterEnrichment,
  type RosterPlayer,
  type Rosters,
  type TeamRoster,
} from './rosters-schema';
import { isPlaceholderRow } from './placeholder-name';
import { reportDrift } from './roster-drift';
import { dateKey, httpUrl, httpsUrl } from '../schema-primitives';
import type { TeamSlug } from '../types';

/** Names this module in a failed override read. */
const MODULE = 'lib/players/rosters.ts';

/** This build's copy (data/<sport>/: lib/sports/current.ts DATA_DIR). */
const bundledEnrichment = process.env.SCVAL_SPORT === 'basketball' ? bundledEnrichmentBasketball : process.env.SCVAL_SPORT === 'volleyball' ? bundledEnrichmentVolleyball : process.env.SCVAL_SPORT === 'val-soccer' ? bundledEnrichmentValSoccer : process.env.SCVAL_SPORT === 'soccer' ? bundledEnrichmentSoccer : bundledEnrichmentFieldHockey;
/** This build's copy (data/<sport>/: lib/sports/current.ts DATA_DIR). */
const bundledRosters = process.env.SCVAL_SPORT === 'basketball' ? bundledRostersBasketball : process.env.SCVAL_SPORT === 'volleyball' ? bundledRostersVolleyball : process.env.SCVAL_SPORT === 'val-soccer' ? bundledRostersValSoccer : process.env.SCVAL_SPORT === 'soccer' ? bundledRostersSoccer : bundledRostersFieldHockey;

export type {
  EnrichedGrade,
  EnrichedHeight,
  EnrichedJersey,
  EnrichedName,
  EnrichedPlayer,
  EnrichedPositions,
  EnrichedTeam,
  EnrichmentSource,
  PlayerProfile,
  ProfilePlatform,
  RosterCoach,
  RosterConflict,
  RosterEnrichment,
  RosterPlayer,
  Rosters,
  TeamRoster,
} from './rosters-schema';

/**
 * What other public sources showed for a team's CURRENT roster — the one claim a team page with
 * no MaxPreps players makes about them, so it is recorded per team rather than inferred:
 *   none         looked, and no other source publishes a current roster (`note`: what was looked at)
 *   partial      a source lists current players, but not in a form that can be joined to MaxPreps
 *                rows (Marin Academy: first name, last initial and class year); `summary` says what
 *                it lists and `source` links it
 *   listed       a source publishes the team's whole current varsity list with full names (Marina's
 *                athletics site, Newport Harbor's team site, 2026-11-26), transcribed as written in
 *                `players`, in the source's order. The page shows it in place of the empty MaxPreps
 *                list; it joins nothing (no athleteId, so no club, commitment or profile line), and once
 *                MaxPreps lists anyone for the team, MaxPreps' rows are shown and this is not
 *   not-checked  nobody looked; the default for a team whose entry does not say
 * It sits beside lib/players/rosters-schema.ts' team record (whose schema ignores unknown keys) and is
 * validated here, at load.
 */
const ListedPlayerSchema = z
  .object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    /** The source's own position text ("GK"), or null where it gives none: shown through positionFromText. */
    position: z.string().min(1).nullable(),
  })
  .strict();
export type ListedPlayer = z.infer<typeof ListedPlayerSchema>;

export const OtherRostersSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('none'), checkedOn: dateKey, note: z.string().min(1) }).strict(),
  z
    .object({ status: z.literal('partial'), checkedOn: dateKey, source: httpsUrl, summary: z.string().min(1) })
    .strict(),
  z
    .object({
      status: z.literal('listed'),
      checkedOn: dateKey,
      /** The page the list was read from (http where the site serves no https). */
      source: httpUrl,
      summary: z.string().min(1),
      players: z
        .array(ListedPlayerSchema)
        .min(1)
        .refine(
          (ps) => new Set(ps.map((p) => `${p.firstName} ${p.lastName}`)).size === ps.length,
          'a listed name appears twice',
        ),
    })
    .strict(),
  z.object({ status: z.literal('not-checked') }).strict(),
]);
export type OtherRosters = z.infer<typeof OtherRostersSchema>;

const NOT_CHECKED: OtherRosters = { status: 'not-checked' };

const OtherRostersFileSchema = z.object({
  teams: z.array(z.object({ slug: z.string(), otherRosters: OtherRostersSchema.optional() })),
});

function loadOtherRosters(): Map<string, OtherRosters> {
  const file = validateData(
    'rosters-enrichment otherRosters',
    OtherRostersFileSchema,
    readOverride(MODULE, 'SCVAL_ROSTERS_ENRICHMENT', bundledEnrichment),
  );
  return new Map(file.teams.map((t) => [t.slug, t.otherRosters ?? NOT_CHECKED]));
}

function loadRosters(): Rosters {
  return validateData('rosters', RostersSchema, readOverride(MODULE, 'SCVAL_ROSTERS', bundledRosters));
}

/**
 * The overlay's rules, checked against the base at load time (the schema alone cannot see both files):
 * every record joins to a MaxPreps row of the same team under the row's own fullName, a filled field
 * was null on MaxPreps, a recorded conflict's `kept` value is MaxPreps' own (and a `rosterBehind` one's
 * is a grade MaxPreps shows), a recruiting profile that states a class year agrees with the grade the
 * row shows (or with the corrected grade of a `rosterBehind` conflict: classYearAgrees), and a claimed
 * MaxPreps profile is the row's own career page.
 *
 * Every one of those rules reads the MaxPreps row, which each roster refresh rewrites, so a record that
 * held when it was written can break with no edit of the overlay. A break is roster drift
 * (lib/players/roster-drift.ts), not a load failure: the part of the record the row no longer supports
 * is left out (the whole record when it no longer joins, else the one field, conflict or profile) and
 * the drift is reported. MaxPreps' value is what the page shows either way. Only a file of another
 * season or a team rosters.json does not hold still throws.
 */
function loadEnrichment(base: Rosters): RosterEnrichment {
  const enrichment = validateData(
    'rosters-enrichment',
    RosterEnrichmentSchema,
    readOverride(MODULE, 'SCVAL_ROSTERS_ENRICHMENT', bundledEnrichment),
  );
  if (enrichment.season !== base.season) {
    throw new Error(`rosters-enrichment is for season ${enrichment.season}, rosters for ${base.season}`);
  }
  for (const team of enrichment.teams) {
    const baseTeam = base.teams.find((t) => t.slug === team.slug);
    if (!baseTeam) throw new Error(`rosters-enrichment: ${team.slug} / -: no such team in rosters.json`);
    const byId = new Map(baseTeam.players.map((p) => [p.athleteId, p]));
    team.players = team.players.filter((e) => {
      const drift = (what: string, leftOut: 'record' | 'field') =>
        reportDrift({ file: 'rosters-enrichment', teamSlug: team.slug, who: e.fullName, key: e.athleteId, what, leftOut });
      const p = byId.get(e.athleteId);
      if (!p) {
        drift(`athleteId ${e.athleteId} is not a MaxPreps row of this team`, 'record');
        return false;
      }
      if (e.fullName !== p.fullName) {
        // A record whose name no longer matches may name someone else now: leave it all out, never misattribute it.
        drift(`MaxPreps spells this player "${p.fullName}"`, 'record');
        return false;
      }
      // A name fills only the one blank MaxPreps leaves in a name: its stand-in for a bare number.
      if (e.name && !isPlaceholderRow(p)) {
        drift('name would overwrite a MaxPreps name', 'field');
        e.name = null;
      }
      if (e.name && p.jersey === null) {
        drift('a name is tied to a number, and this row has none', 'field');
        e.name = null;
      }
      if (e.grade && p.grade !== null) {
        drift('grade would overwrite a MaxPreps value', 'field');
        e.grade = null;
      }
      if (e.positions && p.position !== null) {
        drift('positions would overwrite a MaxPreps value', 'field');
        e.positions = null;
      }
      if (e.jersey && p.jersey !== null) {
        drift('jersey would overwrite a MaxPreps value', 'field');
        e.jersey = null;
      }
      if (e.height && p.height !== null) {
        drift('height would overwrite a MaxPreps value', 'field');
        e.height = null;
      }
      // MaxPreps catching up ends a `rosterBehind` conflict: once the roster shows the grade the conflict's page
      // gave (`other`), the record is settled, not broken, and it is dropped here without a report.
      e.conflicts = e.conflicts.filter((c) => !(c.rosterBehind && p.grade !== null && String(p.grade) === c.other));
      e.conflicts = e.conflicts.filter((c) => {
        const own =
          c.field === 'grade' ? (p.grade === null ? (e.grade ? String(e.grade.value) : null) : String(p.grade))
          : c.field === 'jersey' ? p.jersey
          : c.field === 'position' ? p.position
          : p.height;
        if (c.kept !== own) {
          drift(`conflict on ${c.field} says kept="${c.kept}" but the roster shows "${own}"`, 'field');
          return false;
        }
        // A stale grade is MaxPreps' own: a grade the overlay filled is not "the roster's last season".
        if (c.rosterBehind && p.grade === null) {
          drift("rosterBehind says MaxPreps shows last season's grade, but MaxPreps shows no grade", 'field');
          return false;
        }
        return true;
      });
      const row = { grade: p.grade ?? e.grade?.value ?? null, conflicts: e.conflicts };
      e.profiles = e.profiles.filter((x) => {
        if (x.platform === 'maxpreps' && x.url !== p.careerUrl) {
          drift(`maxpreps profile ${x.url} is not this row's career page (${p.careerUrl})`, 'field');
          return false;
        }
        if (x.classOf !== null && !classYearAgrees(base.season, row, x.classOf)) {
          drift(`${x.platform} profile says class of ${x.classOf}, the roster shows grade ${row.grade}`, 'field');
          return false;
        }
        return true;
      });
      return true;
    });
  }
  return enrichment;
}

/** The graduation year of a player in `grade` during `season`: in "26-27" a senior is class of 2027. */
export function classOf(season: string, grade: number): number {
  const m = /^(\d{2})-(\d{2})$/.exec(season);
  if (!m) throw new Error(`lib/players/rosters.ts: cannot read season "${season}"`);
  return 2000 + Number(m[2]) + (12 - grade);
}

/** What the class-year helpers read from a row: its grade and its recorded conflicts. */
type GradedRow = { grade: number | null; conflicts: readonly RosterConflict[] };

/**
 * The grade a `rosterBehind` conflict gives a row — the player's real one, a grade above the stale
 * grade MaxPreps' roster still shows (lib/players/rosters-schema.ts RosterConflictSchema) — or null.
 */
export function rosterBehindGrade(p: Pick<GradedRow, 'conflicts'>): number | null {
  const c = p.conflicts.find((x) => x.field === 'grade' && x.rosterBehind === true);
  return c ? Number(c.other) : null;
}

/**
 * The grade the recruiting pages read a row's class year from: a `rosterBehind` conflict's, else the
 * grade the roster shows. The roster table itself keeps showing MaxPreps' grade.
 */
export function effectiveGrade(p: GradedRow): number | null {
  return rosterBehindGrade(p) ?? p.grade;
}

/** The class a row's player graduates with, by effectiveGrade; null without a grade. */
export function effectiveClassOf(season: string, p: GradedRow): number | null {
  const grade = effectiveGrade(p);
  return grade === null ? null : classOf(season, grade);
}

/**
 * Whether a class year a source states agrees with a row: true for a row with no grade, else when it
 * is the roster grade's class or, for a row with a `rosterBehind` conflict, the corrected grade's.
 * The one test profiles (above), club ties and commitments (lib/players/roster-join.ts) share.
 */
export function classYearAgrees(season: string, p: GradedRow, stated: number): boolean {
  if (p.grade === null) return true;
  if (stated === classOf(season, p.grade)) return true;
  const behind = rosterBehindGrade(p);
  return behind !== null && stated === classOf(season, behind);
}

const rosters = loadRosters();
const enrichment = loadEnrichment(rosters);
const OTHER_ROSTERS = loadOtherRosters();
const BASE_BY_SLUG = new Map<string, TeamRoster>(rosters.teams.map((t) => [t.slug, t]));
const ENRICHMENT_BY_SLUG = new Map<string, EnrichedTeam>(enrichment.teams.map((t) => [t.slug, t]));

export function getRosters(): Rosters {
  return rosters;
}

export function getRosterEnrichment(): RosterEnrichment {
  return enrichment;
}

/** The MaxPreps roster alone, as fetched. */
export function getTeamRoster(slug: TeamSlug): TeamRoster | undefined {
  return BASE_BY_SLUG.get(slug);
}

// ---------------------------------------------------------------- the merged view

/** Where a merged value came from: MaxPreps, an enrichment record, or nowhere. */
export type FieldProvenance<E> = 'maxpreps' | E | null;

export interface MergedPlayer extends RosterPlayer {
  /** As a non-MaxPreps source spells the name, when it differs. */
  sourceName: string | null;
  /** Only where a school source says which squad the row belongs to (Los Gatos). */
  level: 'varsity' | 'jv' | null;
  provenance: {
    /** 'maxpreps' for every row MaxPreps names; null on its "Player #11" stand-in until a source names it. */
    name: FieldProvenance<EnrichedName>;
    grade: FieldProvenance<EnrichedGrade>;
    positions: FieldProvenance<EnrichedPositions>;
    jersey: FieldProvenance<EnrichedJersey>;
    height: FieldProvenance<EnrichedHeight>;
  };
  /** Sources that disagree with the value shown. */
  conflicts: RosterConflict[];
  /** The player's own recruiting pages (NCSA and the like), in the enrichment file's order. */
  profiles: PlayerProfile[];
}

export interface MergedTeamRoster extends Omit<TeamRoster, 'players'> {
  players: MergedPlayer[];
  coaches: RosterCoach[];
  /** The non-MaxPreps sources consulted for this team. */
  sources: EnrichmentSource[];
  /** The enrichment file's notes for this team (what was tried, what was left out). */
  enrichmentNotes: string[];
  /** What other public sources showed for the current roster ('not-checked' unless the file says). */
  otherRosters: OtherRosters;
}

function mergePlayer(p: RosterPlayer, e: EnrichedPlayer | undefined): MergedPlayer {
  const base: MergedPlayer = {
    ...p,
    sourceName: e?.sourceName ?? null,
    level: e?.level ?? null,
    provenance: {
      name: isPlaceholderRow(p) ? null : 'maxpreps',
      grade: p.grade !== null ? 'maxpreps' : null,
      positions: p.position !== null ? 'maxpreps' : null,
      jersey: p.jersey !== null ? 'maxpreps' : null,
      height: p.height !== null ? 'maxpreps' : null,
    },
    conflicts: e?.conflicts ?? [],
    profiles: e?.profiles ?? [],
  };
  if (!e) return base;
  if (e.name) {
    base.firstName = e.name.firstName;
    base.lastName = e.name.lastName;
    base.fullName = e.name.value;
    base.provenance.name = e.name;
  }
  if (e.grade) {
    base.grade = e.grade.value;
    base.gradeClass = (['Fr.', 'So.', 'Jr.', 'Sr.'] as const)[e.grade.value - 9];
    base.provenance.grade = e.grade;
  }
  if (e.positions) {
    base.positions = [...e.positions.value];
    base.position = e.positions.value.join(', ');
    base.provenance.positions = e.positions;
  }
  if (e.jersey) {
    base.jersey = e.jersey.value;
    base.provenance.jersey = e.jersey;
  }
  if (e.height) {
    base.height = e.height.value;
    base.heightInches = e.height.inches;
    base.provenance.height = e.height;
  }
  return base;
}

/**
 * A row of the team's MaxPreps JV roster (data/<sport>/jv-rosters.json), in the merged shape, as a JV
 * row the overlay says nothing about: what a JV club tie joins when the player has no row here
 * (lib/players/clubs.ts).
 */
export function mergedJvListRow(p: RosterPlayer): MergedPlayer {
  return { ...mergePlayer(p, undefined), level: 'jv' };
}

/** The MaxPreps roster with every blank the enrichment file can fill, each value tagged. */
export function getEnrichedTeamRoster(slug: TeamSlug): MergedTeamRoster | undefined {
  const team = BASE_BY_SLUG.get(slug);
  if (!team) return undefined;
  const extra = ENRICHMENT_BY_SLUG.get(slug);
  const byId = new Map((extra?.players ?? []).map((e) => [e.athleteId, e]));
  const { players, ...rest } = team;
  return {
    ...rest,
    players: players.map((p) => mergePlayer(p, p.athleteId === null ? undefined : byId.get(p.athleteId))),
    coaches: extra?.coaches ?? [],
    sources: extra?.sources ?? [],
    enrichmentNotes: extra?.notes ?? [],
    otherRosters: OTHER_ROSTERS.get(slug) ?? NOT_CHECKED,
  };
}

/**
 * The names other sources give a team's "Player #11" rows, keyed by the MaxPreps name they replace:
 * what the stats read API (lib/players/player-stats.ts) shows on the stat lines and box scores the
 * stats run joined to those rows under MaxPreps' name.
 */
export function placeholderNames(slug: TeamSlug): ReadonlyMap<string, string> {
  const base = BASE_BY_SLUG.get(slug);
  const names = new Map<string, string>();
  for (const e of ENRICHMENT_BY_SLUG.get(slug)?.players ?? []) {
    const row = e.name ? base?.players.find((p) => p.athleteId === e.athleteId) : undefined;
    if (e.name && row) names.set(row.fullName, e.name.value);
  }
  return names;
}

export function getAllEnrichedRosters(): MergedTeamRoster[] {
  return rosters.teams.map((t) => getEnrichedTeamRoster(t.slug)!);
}

/**
 * Display order: by jersey number when at least half the roster has one (numeric part first, so
 * "00" < "1" < "21/88"; blanks last), otherwise by last name. The files keep MaxPreps' own order.
 */
export function sortedPlayers<P extends RosterPlayer>(team: { players: P[] }): P[] {
  const players = [...team.players];
  const numbered = players.filter((p) => p.jersey !== null).length;
  const byName = (a: P, b: P) =>
    (a.lastName ?? a.fullName).localeCompare(b.lastName ?? b.fullName) ||
    a.fullName.localeCompare(b.fullName);
  if (numbered * 2 < players.length) return players.sort(byName);
  const num = (j: string | null) => {
    const m = j === null ? null : /^\d+/.exec(j);
    return m ? Number(m[0]) : Number.POSITIVE_INFINITY;
  };
  return players.sort(
    (a, b) => num(a.jersey) - num(b.jersey) || (a.jersey ?? '').localeCompare(b.jersey ?? '') || byName(a, b),
  );
}
