/**
 * League configuration: every region, section, league, division, rule, tiebreak chain, citation, ladder,
 * pairing, phase, date and official source (SPEC §2; the Southern California amendment, DESIGN-socal §2.1).
 * Nothing else in the codebase names a league, a division or a by-law; teams live in lib/registry/* and
 * are assembled by lib/teams.ts. The configuration's shapes (its types) are lib/model/league-config.ts.
 *
 * Pure data plus small helpers: no fs, no lib/data import, no snapshot. `assertLeagues()` runs at
 * module load and throws `lib/config/leagues.ts: <message>` on any violated invariant (SPEC §2.4).
 *
 * This module is the package's door. The values live in lib/config/leagues/: one file per league (scval,
 * bval, pcal, mcal, eal, sunset, city, north-county, metro, independents), what the San Diego leagues share
 * (sds.ts), the regions and sections, the cited documents, the CCS block and the data-quality table. The
 * door assembles LEAGUES from those very objects (a test that mutates one sees it in every lookup and in
 * the assert), builds the derived lists and the by-id lookups, re-exports the public values, and calls the
 * assert (lib/config/leagues/assert.ts) last. Three parts are public on their own: tiebreak-stages.ts (also
 * re-exported here), and labels.ts (copy words) and official.ts (the official-document lookups), which are
 * built on the door's lookups and so import the door: re-exporting them here would make an import cycle.
 */

import type { DivisionId, LeagueId, RegionId, SectionId, TeamSlug } from '@/lib/model/ids';
import type {
  DivisionConfig, LadderRung, LeagueConfig, LeagueRules, RegionConfig, SectionConfig,
} from '@/lib/model/league-config';
import type { PlayoffStatus, TiebreakStage } from '@/lib/model/standings';

import { failInvariant } from './invariant';
import { checkLeagueConfig } from './leagues/assert';
import { BVAL } from './leagues/bval';
import { CCS } from './leagues/ccs';
import { CITY } from './leagues/city';
import { DATA_QUALITY } from './leagues/data-quality';
import { MP } from './leagues/documents';
import { EAL } from './leagues/eal';
import { INDEPENDENTS } from './leagues/independents';
import { MCAL } from './leagues/mcal';
import { METRO } from './leagues/metro';
import { NORTH_COUNTY } from './leagues/north-county';
import { PCAL } from './leagues/pcal';
import { REGIONS, SECTIONS } from './leagues/regions';
import { SCVAL } from './leagues/scval';
import { SUNSET } from './leagues/sunset';
import { SEASON_YEAR } from './season';

export { CCS } from './leagues/ccs';
export { DATA_QUALITY } from './leagues/data-quality';
export { DEFAULT_REGION, REGIONS, SECTIONS } from './leagues/regions';
export { PLACE_VS_STAGES, UNCOMPUTABLE_STAGES } from './leagues/tiebreak-stages';

// ---------- values (SPEC §2.2, verbatim; each in its part) ----------

/**
 * Config order: NorCal (CCS, NCS, NS) first, then SoCal (the Sunset, then the San Diego leagues, then the Southern
 * Section independents, a group of schools in no league with a table of their games against each other).
 */
export const LEAGUES: readonly LeagueConfig[] = [SCVAL, BVAL, PCAL, MCAL, EAL, SUNSET, CITY, NORTH_COUNTY, METRO, INDEPENDENTS];

// ---------- helpers (the Stage-A API, SPEC §2.3) ----------

export const LEAGUE_IDS: readonly LeagueId[] = LEAGUES.map((l) => l.id);

/** Every division, config order (LEAGUES order, then each league's division order). */
export const ALL_DIVISIONS: readonly DivisionConfig[] = LEAGUES.flatMap((l) => l.divisions);

/** Leagues whose postseason is the CCS ladder. */
export const CCS_LEAGUE_IDS: readonly LeagueId[] = LEAGUES.filter(
  (l) => l.postseason.kind === 'ccs-ladder',
).map((l) => l.id);

/** Leagues that run their own tournament (['mcal']). */
export const TOURNAMENT_LEAGUE_IDS: readonly LeagueId[] = LEAGUES.filter(
  (l) => l.postseason.kind === 'league-tournament',
).map((l) => l.id);

/** Leagues whose postseason is a tournament with no published bracket (['eal']). */
export const UNBRACKETED_LEAGUE_IDS: readonly LeagueId[] = LEAGUES.filter(
  (l) => l.postseason.kind === 'unbracketed-tournament',
).map((l) => l.id);

/** Leagues with no postseason at all (['sunset', 'independents']): /playoffs gives each a card of its own. */
export const NO_POSTSEASON_LEAGUE_IDS: readonly LeagueId[] = LEAGUES.filter(
  (l) => l.postseason.kind === 'no-postseason',
).map((l) => l.id);

/**
 * Whether the league is a group of independents (LeagueConfig.independents: the Southern Section
 * independents). Every reader that names the group, or counts "leagues", branches on this, never on the id.
 */
export function isIndependentLeague(id: LeagueId): boolean {
  return LEAGUE_BY_ID.get(id)?.independents === true;
}

/** Whether the division belongs to a group of independents (LeagueConfig.independents). */
export function isIndependentDivision(id: DivisionId): boolean {
  const d = DIVISION_BY_ID.get(id);
  return d !== undefined && isIndependentLeague(d.leagueId);
}

/**
 * The leagues proper, config order: every entry of LEAGUES but a group of independents. Copy that counts
 * leagues ("all nine leagues") counts these, and names the independents separately where it matters
 * ("and the Southern Section’s five independents"); it never prints "ten leagues".
 */
export const LEAGUES_PROPER: readonly LeagueConfig[] = LEAGUES.filter((l) => l.independents !== true);

/** The groups of independents, config order (one today: the LA independents). */
export const INDEPENDENT_LEAGUES: readonly LeagueConfig[] = LEAGUES.filter((l) => l.independents === true);

/** Leagues whose postseason is their section's own playoffs (['city', 'north-county', 'metro']). */
export const SECTION_PLAYOFFS_LEAGUE_IDS: readonly LeagueId[] = LEAGUES.filter(
  (l) => l.postseason.kind === 'section-playoffs',
).map((l) => l.id);

const REGION_BY_ID = new Map<string, RegionConfig>(REGIONS.map((r) => [r.id, r]));
const SECTION_BY_ID = new Map<string, SectionConfig>(SECTIONS.map((s) => [s.id, s]));
const LEAGUE_BY_ID = new Map<string, LeagueConfig>(LEAGUES.map((l) => [l.id, l]));
const DIVISION_BY_ID = new Map<string, DivisionConfig>(ALL_DIVISIONS.map((d) => [d.id, d]));

/** Throws on an unknown id. */
export function getRegion(id: RegionId): RegionConfig {
  const r = REGION_BY_ID.get(id);
  if (!r) failInvariant('lib/config/leagues.ts', `unknown region "${id}"`);
  return r;
}

/** A league's region: its section's (never stored). Throws on an unknown league. */
export function regionOf(leagueId: LeagueId): RegionId {
  return sectionOf(leagueId).region;
}

/** The region's sections, config order. */
export function sectionsInRegion(region: RegionId): readonly SectionConfig[] {
  return SECTIONS.filter((s) => s.region === region);
}

/** The region's leagues, config order (LEAGUES lists NorCal first, so each region is one contiguous run). */
export function leaguesInRegion(region: RegionId): readonly LeagueConfig[] {
  return LEAGUES.filter((l) => regionOf(l.id) === region);
}

/** Throws on an unknown id. */
export function getSection(id: SectionId): SectionConfig {
  const s = SECTION_BY_ID.get(id);
  if (!s) failInvariant('lib/config/leagues.ts', `unknown section "${id}"`);
  return s;
}

export function sectionOf(leagueId: LeagueId): SectionConfig {
  return getSection(getLeague(leagueId).sectionId);
}

/** Throws on an unknown id (a build-time bug). */
export function getLeague(id: LeagueId): LeagueConfig {
  const l = LEAGUE_BY_ID.get(id);
  if (!l) failInvariant('lib/config/leagues.ts', `unknown league "${id}"`);
  return l;
}

export function findLeague(id: string): LeagueConfig | undefined {
  return LEAGUE_BY_ID.get(id);
}

export function isLeagueId(id: string): boolean {
  return LEAGUE_BY_ID.has(id);
}

/** Throws on an unknown id. */
export function getDivision(id: DivisionId): DivisionConfig {
  const d = DIVISION_BY_ID.get(id);
  if (!d) failInvariant('lib/config/leagues.ts', `unknown division "${id}"`);
  return d;
}

export function findDivision(id: string): DivisionConfig | undefined {
  return DIVISION_BY_ID.get(id);
}

export function leagueOfDivision(id: DivisionId): LeagueConfig {
  return getLeague(getDivision(id).leagueId);
}

export function divisionsOf(leagueId: LeagueId): readonly DivisionConfig[] {
  return getLeague(leagueId).divisions;
}

export function isSingleDivision(leagueId: LeagueId): boolean {
  return getLeague(leagueId).divisions.length === 1;
}

/**
 * MaxPreps league standings page — the deep link on every standings table. The double hyphen in
 * the slug is the league name's " - " joiner; dropping ?leagueid= hard-404s. null for a division
 * MaxPreps has no table for (the San Diego Section's Valley): never '/league/null/'.
 */
export function leagueStandingsUrl(id: DivisionId): string | null {
  const d = getDivision(id);
  if (d.maxprepsLeagueId === null || d.maxprepsSlug === null) return null;
  return `${MP}/ca/field-hockey/${SEASON_YEAR}/league/${d.maxprepsSlug}/?leagueid=${d.maxprepsLeagueId}`;
}

/** The rungs of the division's league ladder that apply to this division, in ladder order. */
export function ladderFor(id: DivisionId): readonly LadderRung[] {
  const d = getDivision(id);
  return getLeague(d.leagueId).postseason.ladder.filter(
    (r) => r.divisions === '*' || r.divisions.includes(d.id),
  );
}

/** The rung covering `place` (1-based; anything past 99 reads as 99). Throws when none does. */
export function ladderRung(id: DivisionId, place: number): LadderRung {
  const p = Math.min(Math.max(place, 1), 99);
  const rung = ladderFor(id).find((r) => r.places[0] <= p && p <= r.places[1]);
  if (!rung) failInvariant('lib/config/leagues.ts', `no ladder rung for ${id} place ${place}`);
  return rung;
}

/** The chain for a points bucket that starts at `bucketStartPlace` (byBucketStart entry, else default). */
export function tiebreakChainFor(id: DivisionId, bucketStartPlace: number): readonly TiebreakStage[] {
  const { tiebreaks } = leagueOfDivision(id).rules;
  return tiebreaks.byBucketStart?.[bucketStartPlace] ?? tiebreaks.default;
}

/**
 * A team's draw number (MCAL's spring draw: lower wins a `draw-number` stage). Takes a slug, so this
 * module never reads the registry; lib/teams.ts fails at import unless a league's `drawNumbers` keys are
 * exactly its slugs, so a miss here is a caller's bug and throws instead of falling back.
 */
export function drawNumberOf(rules: LeagueRules, slug: TeamSlug): number {
  const n = rules.drawNumbers?.[slug];
  if (n === undefined) failInvariant('lib/config/leagues.ts', `no draw number for ${slug}`);
  return n;
}

/** Every status the league's ladder can give, in ladder order, deduped. */
export function statusesOf(leagueId: LeagueId): readonly PlayoffStatus[] {
  return [...new Set(getLeague(leagueId).postseason.ladder.map((r) => r.status))];
}

/**
 * The first official league date of the league (min over its divisions): the date the home
 * PhaseLead and the /standings preseason notice both say league play starts.
 */
export function leaguePlayStarts(leagueId: LeagueId): string {
  return getLeague(leagueId)
    .divisions.map((d) => d.leaguePlay.first)
    .reduce((a, b) => (b < a ? b : a));
}

/** The last official league date of the league (max over its divisions). */
export function leaguePlayEnds(leagueId: LeagueId): string {
  return getLeague(leagueId)
    .divisions.map((d) => d.leaguePlay.last)
    .reduce((a, b) => (b > a ? b : a));
}

/** Union of every section's season window (the fetch season-window guard). */
export function seasonWindowBounds(): { start: string; end: string } {
  let start = SECTIONS[0].seasonWindow.start as string;
  let end = SECTIONS[0].seasonWindow.end as string;
  for (const s of SECTIONS) {
    if (s.seasonWindow.start < start) start = s.seasonWindow.start;
    if (s.seasonWindow.end > end) end = s.seasonWindow.end;
  }
  return { start, end };
}

// ---------- assertLeagues (SPEC §2.4) ----------

/** Runs at import. Throws `lib/config/leagues.ts: <message>` on the first violated invariant. */
export function assertLeagues(): void {
  checkLeagueConfig({ leagues: LEAGUES, regions: REGIONS, sections: SECTIONS, ccs: CCS, dataQuality: DATA_QUALITY });
}

assertLeagues();
