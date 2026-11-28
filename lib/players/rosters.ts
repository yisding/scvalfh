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
 *     MaxPreps stays and the disagreement is recorded. `getEnrichedTeamRoster` merges the two and says, per field,
 *     where each value came from, and gives each row its player's own recruiting profiles (NCSA and the like, and
 *     MaxPreps career pages the player has claimed): data/player-accounts.json files them under the person, and
 *     data/<sport>/player-index.json (lib/players/player-index.ts) says which person each row is. Both files hold one entry per registry team (102); a team no run
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
import { accountsOfPerson, assertPlayerIndexSeason, homeRow, isCareerPage, personOfName, personOfRow, rowsOfPerson } from './player-index';
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
 *                list. Each listed player is a person in the registry (by her name on the list), so her own
 *                recruiting pages and club ties show on her row (listedPlayerProfiles, lib/players/clubs.ts); once
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

/**
 * Where the school itself publishes the team's varsity roster (owner decision, 2026-11-28): the page on the school's
 * own or official athletics site, whether or not MaxPreps lists the team, saved so the roster can be read from the
 * school the day MaxPreps has none. `season` is the season the page shows ("2026-27", "2025-26", a single year
 * "2026"), or null when it shows none: a page for another season is kept, its season said, and is never a source of
 * players. Only `otherRosters` `listed` puts the school's names on the site. `none`: nothing was found, and `note`
 * says what was looked at. A team with no entry has not been checked. Never rendered.
 */
export const SchoolRosterSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('found'),
      checkedOn: dateKey,
      /** The roster page (http where the site serves no https). */
      url: httpUrl,
      season: z.string().regex(/^\d{4}(-\d{2})?$/, 'a season like 2026-27, or a year').nullable(),
      /** The page's own words for the season and level (its heading), or null where it gives none. */
      seasonEvidence: z.string().min(1).nullable(),
      note: z.string().min(1).optional(),
    })
    .strict(),
  z.object({ status: z.literal('none'), checkedOn: dateKey, note: z.string().min(1) }).strict(),
]);
export type SchoolRoster = z.infer<typeof SchoolRosterSchema>;

const OtherRostersFileSchema = z.object({
  teams: z.array(
    z.object({ slug: z.string(), otherRosters: OtherRostersSchema.optional(), schoolRoster: SchoolRosterSchema.optional() }),
  ),
});

function loadOtherRosters(): Map<string, OtherRosters> {
  const file = validateData(
    'rosters-enrichment otherRosters',
    OtherRostersFileSchema,
    readOverride(MODULE, 'SCVAL_ROSTERS_ENRICHMENT', bundledEnrichment),
  );
  return new Map(file.teams.map((t) => [t.slug, t.otherRosters ?? NOT_CHECKED]));
}

function loadSchoolRosters(): Map<string, SchoolRoster> {
  const file = validateData(
    'rosters-enrichment schoolRoster',
    OtherRostersFileSchema,
    readOverride(MODULE, 'SCVAL_ROSTERS_ENRICHMENT', bundledEnrichment),
  );
  return new Map(file.teams.flatMap((t) => (t.schoolRoster ? [[t.slug, t.schoolRoster] as const] : [])));
}

function loadRosters(): Rosters {
  return validateData('rosters', RostersSchema, readOverride(MODULE, 'SCVAL_ROSTERS', bundledRosters));
}

/**
 * The overlay's rules, checked against the base at load time (the schema alone cannot see both files):
 * every record joins to a MaxPreps row of the same team under the row's own fullName, a filled field
 * was null on MaxPreps, and a recorded conflict's `kept` value is MaxPreps' own (and a `rosterBehind` one's
 * is a grade MaxPreps shows).
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
const SCHOOL_ROSTERS = loadSchoolRosters();

/** The school's own varsity roster page for the team (SchoolRosterSchema), or null when the team has not been checked. */
export function getSchoolRoster(slug: string): SchoolRoster | null {
  return SCHOOL_ROSTERS.get(slug) ?? null;
}
const BASE_BY_SLUG = new Map<string, TeamRoster>(rosters.teams.map((t) => [t.slug, t]));
const ENRICHMENT_BY_SLUG = new Map<string, EnrichedTeam>(enrichment.teams.map((t) => [t.slug, t]));
assertPlayerIndexSeason(rosters.season);

/**
 * Each MaxPreps row's recruiting profiles, by `<slug> <athleteId>`: its person's accounts (lib/players/player-index.ts),
 * on her home row only (homeRow: the row her club ties and commitment show on, so a player MaxPreps lists twice has
 * one row with all of it; a MaxPreps career page goes on its own career's row, the home row when that is it),
 * held to the row as the overlay's profiles always were. A class year a page states must
 * agree with the grade the row shows (MaxPreps', else the overlay's, or the corrected grade of a `rosterBehind`
 * conflict: classYearAgrees), and a MaxPreps page is shown only on a row of its own career. A page that fails the
 * class year is roster drift (the grade is the roster's, which a refresh rewrites): left out of the row and reported.
 */
const PROFILES_BY_ROW: ReadonlyMap<string, PlayerProfile[]> = (() => {
  const out = new Map<string, PlayerProfile[]>();
  for (const team of rosters.teams) {
    const extra = new Map((ENRICHMENT_BY_SLUG.get(team.slug)?.players ?? []).map((e) => [e.athleteId, e]));
    for (const p of team.players) {
      if (p.athleteId === null) continue;
      const person = personOfRow(team.slug, p.athleteId);
      const home = person === null ? null : homeRow(person);
      if (home === null) continue;
      const isHome = home.team === team.slug && home.athleteId === p.athleteId;
      // The home row's career, when it is a MaxPreps row of a team rosters.json holds: a MaxPreps page of another of
      // her careers (she was listed twice under two) shows on that career's row instead.
      const homeCareer = home.athleteId === null ? null : (BASE_BY_SLUG.get(home.team)?.players.find((x) => x.athleteId === home.athleteId)?.careerId ?? null);
      const e = extra.get(p.athleteId);
      const row = { grade: p.grade ?? e?.grade?.value ?? null, conflicts: e?.conflicts ?? [] };
      const profiles = accountsOfPerson(person).filter((x) => {
        if (x.platform !== 'maxpreps' && !isHome) return false;
        if (x.platform === 'maxpreps' && (!isCareerPage(x.url, p.careerId) || (!isHome && isCareerPage(x.url, homeCareer)))) return false;
        if (x.classOf !== null && !classYearAgrees(rosters.season, row, x.classOf)) {
          reportDrift({
            file: 'player-accounts',
            teamSlug: team.slug,
            who: p.fullName,
            key: person as string,
            what: `${x.platform} profile says class of ${x.classOf}, the roster shows grade ${row.grade}`,
            leftOut: 'field',
          });
          return false;
        }
        return true;
      });
      if (profiles.length > 0) out.set(`${team.slug} ${p.athleteId}`, profiles);
    }
  }
  return out;
})();

/**
 * Whether a person's varsity roster row shows the page `url`: lib/jv/jv-profiles.ts leaves it off her JV list row. A
 * row of the varsity page a school source marks JV is her JV row, so its pages show on the JV list as well.
 */
export function shownOnVarsityRow(playerId: string, url: string): boolean {
  return rowsOfPerson(playerId).some(
    (r) =>
      r.level === 'varsity' &&
      r.athleteId !== null &&
      (PROFILES_BY_ROW.get(`${r.team} ${r.athleteId}`) ?? []).some((x) => x.url === url),
  );
}

/**
 * A listed player's recruiting profiles (otherRosters `listed`): her person's accounts, found by her name on the
 * school's list. The list gives no grade to check a class year against, and she has no MaxPreps page to link.
 */
export function listedPlayerProfiles(slug: string, fullName: string): PlayerProfile[] {
  return accountsOfPerson(personOfName(slug, 'varsity', fullName)).filter((x) => x.platform !== 'maxpreps');
}

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
  /** The player's own recruiting pages (NCSA and the like), in data/player-accounts.json's order. */
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

function mergePlayer(p: RosterPlayer, e: EnrichedPlayer | undefined, profiles: PlayerProfile[] = []): MergedPlayer {
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
    profiles,
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

/**
 * The key a listed player (otherRosters `listed`) is joined by where a MaxPreps row would give an athleteId:
 * "listed:Anna Schwab". Never a MaxPreps id, never written to a file: lib/players/clubs.ts gives it to the ties
 * in data/<sport>/clubs.json `listedAffiliations`, which name the player by team and name.
 */
export function listedPlayerKey(fullName: string): string {
  return `listed:${fullName}`;
}

/**
 * A team's listed players as merged rows, while the page shows them (the team's otherRosters is `listed` and
 * MaxPreps lists no varsity player): what a listed player's club tie joins (lib/players/clubs.ts). Each has
 * the source's name, no grade and no MaxPreps id ([] for any other team).
 */
export function mergedListedRows(team: Pick<MergedTeamRoster, 'slug' | 'players' | 'otherRosters'>): MergedPlayer[] {
  const other = team.otherRosters;
  if (other.status !== 'listed' || team.players.some((p) => p.level !== 'jv')) return [];
  return other.players.map((l) => {
    const fullName = `${l.firstName} ${l.lastName}`;
    const row: RosterPlayer = {
      athleteId: listedPlayerKey(fullName),
      rosterId: null,
      careerProfileId: null,
      careerId: null,
      firstName: l.firstName,
      lastName: l.lastName,
      fullName,
      jersey: null,
      grade: null,
      gradeClass: null,
      positions: [],
      position: null,
      height: null,
      heightInches: null,
      isCaptain: false,
      careerUrl: null,
      createdOn: null,
    };
    return { ...mergePlayer(row, undefined, listedPlayerProfiles(team.slug, fullName)), provenance: { name: null, grade: null, positions: null, jersey: null, height: null } };
  });
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
    players: players.map((p) =>
      p.athleteId === null ? mergePlayer(p, undefined) : mergePlayer(p, byId.get(p.athleteId), PROFILES_BY_ROW.get(`${slug} ${p.athleteId}`) ?? []),
    ),
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
