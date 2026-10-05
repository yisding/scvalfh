/**
 * The 49-team membership registry: SCVAL 15, BVAL 12, PCAL 7, MCAL 9, EAL 6 (SPEC §3).
 *
 * THIS is the set of leagues, not the feed: every table is built from this constant and
 * left-joined against the feed. Seeds live in lib/registry/{scval,bval,pcal,mcal,eal}.ts; TEAMS is
 * assembled here in LEAGUES order (lib/leagues.ts).
 *
 * ids are MaxPreps GUIDs. Slugs and 2-letter abbrs are OURS and are never derived by string
 * munging. `assertRegistry()` runs at module load and throws `lib/teams.ts: …` on any violation.
 */

import { LEAGUES, findLeague, getLeague } from './leagues';
import { BVAL_SEEDS } from './registry/bval';
import { EAL_SEEDS } from './registry/eal';
import { MCAL_SEEDS } from './registry/mcal';
import { PCAL_SEEDS } from './registry/pcal';
import { SCVAL_SEEDS } from './registry/scval';
import type { Seed } from './registry/seed';
import { SLUG_PATTERN } from './schema-primitives';
import type { DivisionId, GameSide, LeagueId, Team, TeamId } from './types';

const MP = 'https://www.maxpreps.com';
const SI = 'https://www.si.com/high-school/stats/california/field-hockey';
const VNN = 'https://mmboltapi.azurewebsites.net/api/v2/events/calendar';

/** Relative luminance per WCAG 2.x, on a 6-digit hex without '#'. */
function relativeLuminance(hex: string): number {
  const v = hex.replace(/[^0-9a-f]/gi, '').padEnd(6, '0').slice(0, 6);
  const ch = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
  const lin = ch.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function contrast(l1: number, l2: number): number {
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Ink for a monogram filled with `hex`, computed at build (DESIGN §12.4) — never eyeballed.
 * Picks whichever of the two site inks has the greater contrast on the fill.
 */
export function onPrimaryInk(hex: string): '#0e1116' | '#ffffff' {
  const l = relativeLuminance(hex);
  const dark = contrast(l, relativeLuminance('0e1116'));
  const light = contrast(l, relativeLuminance('ffffff'));
  return dark >= light ? '#0e1116' : '#ffffff';
}

function toTeam(s: Seed): Team {
  return {
    id: s.id,
    slug: s.slug,
    name: s.name,
    shortName: s.shortName,
    abbr: s.abbr,
    acronym: s.acronym,
    mascot: s.mascot,
    city: s.city,
    aliases: s.aliases,
    section: s.section,
    league: s.league,
    division: s.division,
    dataCoverage: s.dataCoverage,
    colors: {
      primary: s.colors[0],
      secondary: s.colors[1],
      onPrimary: onPrimaryInk(s.colors[0]),
      source: s.colorSource,
    },
    // The mascot gif is deliberately not read: no hotlinking (DESIGN §12.4).
    mascotUrl: null,
    external: {
      maxprepsTeamId: s.id,
      maxprepsTeamUrl: s.maxprepsPath ? MP + s.maxprepsPath : null,
      maxprepsScheduleUrl: s.maxprepsPath ? `${MP + s.maxprepsPath}schedule/` : null,
      ...(s.sbliveTeamId ? { sbliveTeamId: s.sbliveTeamId } : {}),
      ...(s.sbliveSchoolId ? { sbliveSchoolId: s.sbliveSchoolId } : {}),
      ...(s.sbliveSlug ? { sbliveGamesUrl: `${SI}/teams/${s.sbliveSlug}/games` } : {}),
      ...(s.vnnSiteId
        ? { vnnSiteId: s.vnnSiteId, vnnIcsUrl: `${VNN}/${s.vnnSiteId}/0/calendar.ics` }
        : {}),
    },
  };
}

const SEEDS_BY_LEAGUE: Readonly<Record<LeagueId, readonly Seed[]>> = {
  scval: SCVAL_SEEDS,
  bval: BVAL_SEEDS,
  pcal: PCAL_SEEDS,
  mcal: MCAL_SEEDS,
  eal: EAL_SEEDS,
};

/** The registry (49), in LEAGUES order; within a league, the seed file's order. */
export const TEAMS: readonly Team[] = LEAGUES.flatMap((l) => SEEDS_BY_LEAGUE[l.id] ?? []).map(toTeam);

/** Teams whose games MaxPreps actually publishes — one schedule request each (all 49 today). */
export const FETCHABLE_TEAMS: readonly Team[] = TEAMS.filter(
  (t) => t.dataCoverage !== 'none',
);

// ---------- lookups ----------

/** Case-, punctuation- and "High School"-insensitive key. */
export function normalizeTeamKey(input: string): string {
  const flat = input.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return flat.endsWith('highschool') ? flat.slice(0, -'highschool'.length) : flat;
}

/**
 * One side of a game as the cross-source join key (SPEC §5.7): its registry slug, else `name:` and
 * the name lower-cased with everything but a-z and 0-9 removed. Every source joined to MaxPreps
 * (si.com in lib/crosscheck.ts and lib/sources/sblive.ts, the official schedules in
 * lib/official/match.ts, the school calendars in lib/sources/vnn-ics.ts) keys a side with this, so
 * the two halves of a join agree exactly.
 */
export function sideJoinKey(side: { slug: string | null; name: string }): string {
  return side.slug ?? `name:${side.name.toLowerCase().replace(/[^a-z0-9]+/g, '')}`;
}

/** Two side keys as one order-independent pair key, `a~b` sorted: the pair half of the cross-source join key (SPEC §5.7). */
export function unorderedPairKey(a: string, b: string): string {
  return [a, b].sort().join('~');
}

const BY_ID = new Map<string, Team>(TEAMS.map((t) => [t.id, t]));
const BY_SLUG = new Map<string, Team>(TEAMS.map((t) => [t.slug, t]));

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
 * The alias index: [id, slug, name, shortName, ...aliases] plus `acronym` ONLY when no other
 * team has the same normalized acronym. Any other collision throws at module load.
 */
const BY_KEY = new Map<string, Team>();
for (const t of TEAMS) {
  const spellings = [t.id, t.slug, t.name, t.shortName, ...t.aliases];
  if (!COLLIDING_ACRONYM_KEYS.has(normalizeTeamKey(t.acronym))) spellings.push(t.acronym);
  for (const raw of spellings) {
    const key = normalizeTeamKey(raw);
    if (!key) continue;
    const prior = BY_KEY.get(key);
    if (prior && prior.id !== t.id) {
      throw new Error(
        `lib/teams.ts: alias "${raw}" (${key}) maps to both ${prior.slug} and ${t.slug}`,
      );
    }
    BY_KEY.set(key, t);
  }
}

export function getTeamById(id: TeamId): Team | undefined {
  return BY_ID.get(id);
}

export function getTeamBySlug(slug: string): Team | undefined {
  return BY_SLUG.get(slug);
}

/** The registry team on one side of a game: by MaxPreps GUID first, then by slug. */
export function teamOfSide(side: Pick<GameSide, 'teamId' | 'slug'>): Team | undefined {
  return (side.teamId ? BY_ID.get(side.teamId) : undefined) ?? (side.slug ? BY_SLUG.get(side.slug) : undefined);
}

/**
 * Resolve a MaxPreps GUID, our slug, a name, a shortName, an alias, or an acronym that is
 * globally unique, to a Team.
 */
export function resolveTeam(nameOrId: string | null | undefined): Team | undefined {
  if (!nameOrId) return undefined;
  return BY_ID.get(nameOrId) ?? BY_KEY.get(normalizeTeamKey(nameOrId));
}

/**
 * League-scoped official-grid token or spelling: the league's `officialCodes` (exact token, then
 * case-insensitive), its `officialNames`, then the global resolver restricted to that league.
 * Grid codes never enter the global resolver.
 */
export function resolveOfficialName(leagueId: LeagueId, token: string): Team | undefined {
  const league = findLeague(leagueId);
  const raw = token.trim();
  if (!league || !raw) return undefined;
  const scoped = (slug: string | undefined): Team | undefined => {
    const t = slug ? BY_SLUG.get(slug) : undefined;
    return t && t.league === league.id ? t : undefined;
  };
  const exact = scoped(league.officialCodes[raw] ?? league.officialNames[raw]);
  if (exact) return exact;
  const upper = raw.toUpperCase();
  for (const [code, slug] of Object.entries(league.officialCodes)) {
    if (code.toUpperCase() === upper) return scoped(slug);
  }
  const key = normalizeTeamKey(raw);
  for (const [name, slug] of Object.entries(league.officialNames)) {
    if (normalizeTeamKey(name) === key) return scoped(slug);
  }
  const t = resolveTeam(raw);
  return t && t.league === league.id ? t : undefined;
}

/** True for a MaxPreps GUID of any registry team (replaces isScvalTeamId). */
export function isRegistryTeamId(id: string | null | undefined): boolean {
  return !!id && BY_ID.has(id);
}

const WITHDRAWN_KEYS: ReadonlyMap<LeagueId, ReadonlySet<string>> = new Map(
  LEAGUES.map((l) => [l.id, new Set(l.withdrawnNames.map(normalizeTeamKey))]),
);

/**
 * Schools a league's official grid still lists that are NOT fielding a varsity team (Wilcox in
 * SCVAL, York in PCAL, Red Bluff in the EAL, which MaxPreps' table still lists). Their grid fixtures are dropped at parse time; they are not in the
 * registry, so they appear nowhere on the site. Reads every league's `withdrawnNames` when
 * `leagueId` is omitted.
 */
export function isWithdrawnSchool(name: string | null | undefined, leagueId?: LeagueId): boolean {
  if (!name) return false;
  const key = normalizeTeamKey(name);
  if (!key) return false;
  if (leagueId !== undefined) return WITHDRAWN_KEYS.get(leagueId)?.has(key) ?? false;
  for (const keys of WITHDRAWN_KEYS.values()) if (keys.has(key)) return true;
  return false;
}

export function teamsInDivision(division: DivisionId): readonly Team[] {
  return TEAMS.filter((t) => t.division === division);
}

export function teamsInLeague(leagueId: LeagueId): readonly Team[] {
  return TEAMS.filter((t) => t.league === leagueId);
}

// ---------- build-time asserts ----------

const EXPECTED_ACRONYM_COLLISIONS = ['BHS', 'CHS', 'GHS', 'HHS', 'LHS', 'PHS', 'SCHS', 'SHS'];

function assertRegistry(): void {
  const fail = (m: string): never => {
    throw new Error(`lib/teams.ts: ${m}`);
  };

  // 1. unique ids, slugs, abbrs; slug shape
  const columns: Array<[string, string[]]> = [
    ['id', TEAMS.map((t) => t.id)],
    ['slug', TEAMS.map((t) => t.slug)],
    ['abbr', TEAMS.map((t) => t.abbr)],
  ];
  for (const [label, values] of columns) {
    const dupes = values.filter((v, i) => values.indexOf(v) !== i);
    if (dupes.length) fail(`duplicate ${label}: ${[...new Set(dupes)].join(', ')}`);
  }
  for (const t of TEAMS) {
    if (!SLUG_PATTERN.test(t.slug)) fail(`bad slug "${t.slug}"`);
    if (!/^[A-Z]{2}$/.test(t.abbr)) fail(`${t.slug}: abbr "${t.abbr}" is not 2 capital letters`);
    if (t.shortName.length > 14) fail(`${t.slug}: shortName longer than 14 characters`);
  }

  // 2. league, division and section agree with the config
  for (const t of TEAMS) {
    const league = findLeague(t.league);
    if (!league) fail(`${t.slug}: unknown league ${t.league}`);
    else {
      if (!league.divisions.some((d) => d.id === t.division)) {
        fail(`${t.slug}: division ${t.division} is not in ${t.league}`);
      }
      if (t.section !== league.sectionId) fail(`${t.slug}: section ${t.section}, league ${t.league} is ${league.sectionId}`);
    }
  }

  // 3. counts
  for (const l of LEAGUES) {
    for (const d of l.divisions) {
      const n = teamsInDivision(d.id).length;
      if (n !== d.expectedTeams) fail(`${d.id} has ${n} teams, expected ${d.expectedTeams}`);
    }
  }
  const expectedTotal = LEAGUES.reduce((n, l) => n + l.divisions.reduce((m, d) => m + d.expectedTeams, 0), 0);
  if (TEAMS.length !== expectedTotal || TEAMS.length !== 49) {
    fail(`expected 49 teams, got ${TEAMS.length}`);
  }
  if (FETCHABLE_TEAMS.length !== TEAMS.length) {
    fail(`expected ${TEAMS.length} fetchable teams, got ${FETCHABLE_TEAMS.length}`);
  }

  // 4. config values that name slugs (lib/leagues.ts invariants 5 and 7, checked here to avoid a cycle)
  for (const l of LEAGUES) {
    const slugs = new Set(teamsInLeague(l.id).map((t) => t.slug));
    for (const [field, map] of [['officialCodes', l.officialCodes], ['officialNames', l.officialNames]] as const) {
      for (const [token, slug] of Object.entries(map)) {
        if (!slugs.has(slug)) fail(`${l.id}.${field}["${token}"] = ${slug} is not a ${l.id} slug`);
      }
    }
    const draw = getLeague(l.id).rules.drawNumbers;
    if (draw) {
      const keys = Object.keys(draw).sort();
      if (keys.join() !== [...slugs].sort().join()) fail(`${l.id}.drawNumbers keys do not equal its slugs`);
    }
    if (l.postseason.kind === 'league-tournament' && !slugs.has(l.postseason.finalSite.slug)) {
      fail(`${l.id}: finalSite ${l.postseason.finalSite.slug} is not a ${l.id} slug`);
    }
    for (const d of l.divisions) {
      for (const slug of d.maxprepsMissing) {
        if (BY_SLUG.get(slug)?.division !== d.id) fail(`${d.id}.maxprepsMissing: ${slug} is not a member`);
      }
      // A known non-member row (EAL: Red Bluff) is never a registry team.
      for (const id of Object.keys(d.maxprepsExtraRows)) {
        if (BY_ID.has(id)) fail(`${d.id}.maxprepsExtraRows: ${id} is a registry team (${BY_ID.get(id)!.slug})`);
      }
    }
  }

  // 5. the alias index (built above; collisions already throw) and the acronym rule
  if (ACRONYM_COLLISIONS.join() !== EXPECTED_ACRONYM_COLLISIONS.join()) {
    fail(`ACRONYM_COLLISIONS is [${ACRONYM_COLLISIONS.join(', ')}], expected [${EXPECTED_ACRONYM_COLLISIONS.join(', ')}]`);
  }
}
assertRegistry();
