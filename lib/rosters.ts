/**
 * The read API for data/rosters.json and data/rosters-enrichment.json — every SCVAL team's roster
 * (SPEC §1.1j).
 *
 * Two files, one view:
 *   - data/rosters.json is the MaxPreps roster, rebuilt by `scripts/fetch-rosters.ts` (by hand or
 *     on a weekly schedule, not by the twice-daily cron).
 *   - data/rosters-enrichment.json is what other public sources add — school athletics sites, a
 *     school roster PDF, school papers, MaxPreps career and JV pages — joined on team slug +
 *     MaxPreps athleteId. It only ever fills a blank; where a source disagrees with MaxPreps,
 *     MaxPreps stays and the disagreement is recorded. `getEnrichedTeamRoster` merges the two and
 *     says, per field, where each value came from.
 *
 * Both are imported so the build bundles them, for the reason lib/history.ts and lib/data.ts give:
 * a Worker has no project filesystem. Both are validated once at module scope, and the merge rules
 * are asserted at load time too, so a bad file fails at import time rather than half-way through a
 * render. `SCVAL_ROSTERS` / `SCVAL_ROSTERS_ENRICHMENT` swap in other files through node:fs (Node
 * only; never set them on a Worker).
 */

import { readFileSync } from 'node:fs';

import bundledEnrichment from '../data/rosters-enrichment.json';
import bundledRosters from '../data/rosters.json';
import {
  RosterEnrichmentSchema,
  RostersSchema,
  type EnrichedGrade,
  type EnrichedHeight,
  type EnrichedJersey,
  type EnrichedPlayer,
  type EnrichedPositions,
  type EnrichedTeam,
  type EnrichmentSource,
  type RosterCoach,
  type RosterConflict,
  type RosterEnrichment,
  type RosterPlayer,
  type Rosters,
  type TeamRoster,
} from './rosters-schema';
import type { TeamSlug } from './types';

export type {
  EnrichedGrade,
  EnrichedHeight,
  EnrichedJersey,
  EnrichedPlayer,
  EnrichedPositions,
  EnrichedTeam,
  EnrichmentSource,
  RosterCoach,
  RosterConflict,
  RosterEnrichment,
  RosterPlayer,
  Rosters,
  TeamRoster,
} from './rosters-schema';

function readOverride(envName: string, bundled: unknown): unknown {
  const override = process.env[envName];
  if (!override) return bundled;
  let text: string;
  try {
    text = readFileSync(override, 'utf8');
  } catch (err) {
    throw new Error(`lib/rosters.ts: cannot read ${envName}=${override} (${(err as Error).message})`);
  }
  return JSON.parse(text) as unknown;
}

function failValidation(what: string, issues: Array<{ path: PropertyKey[]; message: string }>): never {
  const lines = issues.slice(0, 10).map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`);
  throw new Error(`${what} failed validation:\n${lines.join('\n')}`);
}

function loadRosters(): Rosters {
  const parsed = RostersSchema.safeParse(readOverride('SCVAL_ROSTERS', bundledRosters));
  if (!parsed.success) failValidation('rosters', parsed.error.issues);
  return parsed.data;
}

/**
 * The overlay's three rules, asserted against the base at load time (the schema alone cannot see
 * both files): every record joins to a MaxPreps row of the same team, a filled field was null on
 * MaxPreps, and a recorded conflict's `kept` value is MaxPreps' own.
 */
function loadEnrichment(base: Rosters): RosterEnrichment {
  const parsed = RosterEnrichmentSchema.safeParse(
    readOverride('SCVAL_ROSTERS_ENRICHMENT', bundledEnrichment),
  );
  if (!parsed.success) failValidation('rosters-enrichment', parsed.error.issues);
  const enrichment = parsed.data;
  if (enrichment.season !== base.season) {
    throw new Error(`rosters-enrichment is for season ${enrichment.season}, rosters for ${base.season}`);
  }
  const fail = (slug: string, who: string, what: string): never => {
    throw new Error(`rosters-enrichment: ${slug} / ${who}: ${what}`);
  };
  for (const team of enrichment.teams) {
    const baseTeam = base.teams.find((t) => t.slug === team.slug);
    if (!baseTeam) fail(team.slug, '-', 'no such team in rosters.json');
    const byId = new Map(baseTeam!.players.map((p) => [p.athleteId, p]));
    for (const e of team.players) {
      const p = byId.get(e.athleteId);
      if (!p) fail(team.slug, e.fullName, `athleteId ${e.athleteId} is not a MaxPreps row of this team`);
      if (e.fullName !== p!.fullName) fail(team.slug, e.fullName, `MaxPreps spells this player "${p!.fullName}"`);
      if (e.grade && p!.grade !== null) fail(team.slug, e.fullName, 'grade would overwrite a MaxPreps value');
      if (e.positions && p!.position !== null) fail(team.slug, e.fullName, 'positions would overwrite a MaxPreps value');
      if (e.jersey && p!.jersey !== null) fail(team.slug, e.fullName, 'jersey would overwrite a MaxPreps value');
      if (e.height && p!.height !== null) fail(team.slug, e.fullName, 'height would overwrite a MaxPreps value');
      for (const c of e.conflicts) {
        const own =
          c.field === 'grade' ? (p!.grade === null ? (e.grade ? String(e.grade.value) : null) : String(p!.grade))
          : c.field === 'jersey' ? p!.jersey
          : c.field === 'position' ? p!.position
          : p!.height;
        if (c.kept !== own) {
          fail(team.slug, e.fullName, `conflict on ${c.field} says kept="${c.kept}" but the roster shows "${own}"`);
        }
      }
    }
  }
  return enrichment;
}

const rosters = loadRosters();
const enrichment = loadEnrichment(rosters);
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
    grade: FieldProvenance<EnrichedGrade>;
    positions: FieldProvenance<EnrichedPositions>;
    jersey: FieldProvenance<EnrichedJersey>;
    height: FieldProvenance<EnrichedHeight>;
  };
  /** Sources that disagree with the value shown. */
  conflicts: RosterConflict[];
}

export interface MergedTeamRoster extends Omit<TeamRoster, 'players'> {
  players: MergedPlayer[];
  coaches: RosterCoach[];
  /** The non-MaxPreps sources consulted for this team. */
  sources: EnrichmentSource[];
  /** The enrichment file's notes for this team (what was tried, what was left out). */
  enrichmentNotes: string[];
}

function mergePlayer(p: RosterPlayer, e: EnrichedPlayer | undefined): MergedPlayer {
  const base: MergedPlayer = {
    ...p,
    sourceName: e?.sourceName ?? null,
    level: e?.level ?? null,
    provenance: {
      grade: p.grade !== null ? 'maxpreps' : null,
      positions: p.position !== null ? 'maxpreps' : null,
      jersey: p.jersey !== null ? 'maxpreps' : null,
      height: p.height !== null ? 'maxpreps' : null,
    },
    conflicts: e?.conflicts ?? [],
  };
  if (!e) return base;
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
  };
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
