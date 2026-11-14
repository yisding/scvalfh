/**
 * The resolver behind data/players.json (lib/players/registry-schema.ts): every source's rows in,
 * one record per person out.
 *
 * Pure. It is handed `sightings` (one per row of one source: lib/players/registry-sources.ts turns
 * the data files into them), the curation file and the previous registry, and returns the file. It
 * reads nothing itself, so it runs the same on three made-up rows as on the committed data.
 *
 * WHO IS WHO, in the order the rules run:
 *
 *   1. A MaxPreps career id is a person: every row carrying one career id is one player, in any
 *      season, sport, school or level — as long as the rows' names could be one person's
 *      (`namesCompatible`: a shared last name, or the same first name and a slip in the last). An id
 *      listed under names that share nothing is carrying two people: a coach retyped a new player
 *      over last year's row (Piedmont Hills boys basketball, 2026-11: one id is "Nicolas Finuliar"
 *      on the 25-26 stat sheet and "Andrew Duong" on the 26-27 roster). The id then stays with the
 *      name it carries latest (the varsity roster's, within one season), the other rows are known by
 *      their names, and the id is listed for review. A row a person has said does not belong to its
 *      career (`rowSplits`) arrives here already without the id.
 *   2. Two careers on one team in one sport that share a name are one player when their class years
 *      do not contradict (the same year, a year apart, or one side giving none): MaxPreps keeps some
 *      players under two career records. They are joined, and listed for review. A pair whose class
 *      years are two or more apart, or that `distinct` names, stays two players.
 *   3. A row with no id (a school's own JV list, an all-league list) is matched by its name, and
 *      only inside its own team and sport: to the one player of that team with that name, when the
 *      class years do not contradict. No match makes a player known by name alone; two possible
 *      matches make one too, and a review item. `sameAs` settles what a rule cannot.
 *   4. Nothing is ever joined on a nickname or a near spelling. Those are only suggested
 *      (`possible-match`), by the rule lib/players/note-stats.ts already uses to read a coach's note.
 *
 * A "name" here is `nameKey`: letters only, case and accents folded, so "O'Brien-Smith",
 * "Obrien Smith" and "O’BRIEN SMITH" are one name. A stat sheet's "S. Lewis" is not a name and
 * matches nothing.
 *
 * IDS. A new player's id is `p` and the first ten hex digits of the SHA-256 of its first identifier
 * (a career id before a name), so a build from nothing gives the same ids every time. An id once in
 * the previous registry stays with the identifiers it had: a player who gains a career id keeps the
 * id she had under her name, and when two previous players become one, the id that founded the
 * larger claim stays and the other moves to `formerIds`.
 *
 * WHAT IS REBUILT. `built` names the (sport, season) pairs whose source files were read. Every
 * stint of those pairs comes from the sightings alone; every other stint is carried forward from the
 * previous registry untouched. That is how a season survives its files being overwritten by the
 * next one: the registry is rebuilt before the rollover, and keeps it after.
 *
 * WHAT A STINT SHOWS. Its observations are ordered by source (OBSERVATION_SOURCES, the level's own
 * MaxPreps page first), and each field is the first observation's that states it. Every other
 * observation that states something else is a conflict. A statement the overlay recorded as
 * rejected never decides anything. Positions disagree only when they share nothing once "Midfield"
 * and "M" are read as the same thing.
 */

import { createHash } from 'node:crypto';

import { resolveName, type NoteRosterPlayer } from './note-stats';
import {
  OBSERVATION_SOURCES,
  PLAYER_LEVELS,
  PlayersFileSchema,
  countPlayers,
  identifierKey,
  type ClassOfConflict,
  type Observation,
  type ObservationSource,
  type Player,
  type PlayerIdentifier,
  type PlayerIdentity,
  type PlayerLevel,
  type PlayersFile,
  type ReviewItem,
  type Stint,
  type StintConflict,
} from './registry-schema';
import type { SportId } from '../sports/current';
import type { TeamSlug } from '../types';

// ---------------------------------------------------------------- names and class years

/** "Zoë  O'Brien-Smith" → "zoeobriensmith": a name compared across sources' spellings. */
export function nameKey(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

/** Words a roster types beside a name that are not part of it: "(GK)", "Jr.", a grade. */
const NOT_A_NAME = new Set(['gk', 'jr', 'sr', 'ii', 'iii', 'iv', 'slug']);

/** "Sienna Steele (GK) 10" → ["sienna", "steele"]. */
export function nameTokens(name: string): string[] {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .split(/[^a-z]+/)
    .filter((w) => w.length > 1 && !NOT_A_NAME.has(w));
}

function editDistance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const next = [i];
    for (let j = 1; j <= b.length; j += 1) {
      next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    row = next;
  }
  return row[b.length];
}

/**
 * Whether two spellings could be one person's: the same name, a shared last name ("Cammie Pearce",
 * "Cameron Pearce"), or the same first name with last names a slip apart ("Kate Keenan", "Kate
 * Kennan"). "Andrew Duong" and "Nicolas Finuliar" could not. Used only to notice that one MaxPreps
 * career id is carrying two people; it never joins anything.
 */
export function namesCompatible(a: string, b: string): boolean {
  if (nameKey(a) === nameKey(b)) return true;
  const x = nameTokens(a);
  const y = nameTokens(b);
  if (x.length === 0 || y.length === 0) return true;
  const lastX = x[x.length - 1];
  const lastY = y[y.length - 1];
  if (x.includes(lastY) || y.includes(lastX)) return true;
  return x[0] === y[0] && editDistance(lastX, lastY) <= 2;
}

/** "S. Lewis", "A. dawson": a stat sheet's initial-and-last-name, which identifies nobody. */
export function isShortName(name: string): boolean {
  return /^\p{L}\.\s/u.test(name);
}

/** The graduation year of a player in `grade` during `season`: in "26-27" a senior is class of 2027. */
export function classOfFor(season: string, grade: number): number {
  const m = /^(\d{2})-(\d{2})$/.exec(season);
  if (!m) throw new Error(`registry: cannot read season "${season}"`);
  return 2000 + Number(m[2]) + (12 - grade);
}

// ---------------------------------------------------------------- sightings

/** One row of one source: who it says it is, and what it says. */
export interface Sighting {
  sport: SportId;
  season: string;
  team: string;
  level: PlayerLevel;
  /** True when `level` is only where the source is filed (a stat sheet is a varsity sheet). */
  softLevel?: boolean;
  /** The MaxPreps career ids the row carries; empty for a row known by name alone. */
  careerIds: string[];
  /** careerId → MaxPreps' GUID for the same career, where the row gives it. */
  careerProfileIds?: Record<string, string>;
  /** `nameKey`s the row can be matched by. Empty when its only name is a short one. */
  nameKeys: string[];
  /** The roster's own name parts, for the suggestion rule. */
  firstName?: string | null;
  lastName?: string | null;
  observations: Observation[];
}

export interface BuildInput {
  previous: PlayersFile | null;
  identity: PlayerIdentity;
  /**
   * The (sport, season) pairs `sightings` covers: in full, or, with `sources`, only for those
   * sources (every other observation of the pair is carried forward from `previous`).
   */
  built: ReadonlyArray<{ sport: SportId; season: string; sources?: ObservationSource[] }>;
  sightings: readonly Sighting[];
  builtBy: string;
}

const pairKey = (sport: string, season: string) => `${sport} ${season}`;
const teamKey = (s: { sport: string; team: string }) => `${s.sport} ${s.team}`;
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
/** Varsity before JV before the freshman team. */
const byLevel = (a: PlayerLevel, b: PlayerLevel) => PLAYER_LEVELS.indexOf(a) - PLAYER_LEVELS.indexOf(b);

// ---------------------------------------------------------------- stints from observations

const SOURCE_RANK = new Map<ObservationSource, number>(OBSERVATION_SOURCES.map((s, i) => [s, i]));

/** A stint's observations in the order its fields are read: the level's own MaxPreps page first. */
function inPrecedence(observations: readonly Observation[], level: PlayerLevel): Observation[] {
  const rank = (o: Observation) => {
    if (level !== 'varsity' && o.src === 'maxpreps-jv-roster') return -1;
    return SOURCE_RANK.get(o.src) ?? OBSERVATION_SOURCES.length;
  };
  return observations
    .map((o, i) => ({ o, i }))
    .sort((a, b) => rank(a.o) - rank(b.o) || a.i - b.i)
    .map((x) => x.o);
}

const POSITION_WORDS: Readonly<Record<string, string>> = {
  goalkeeper: 'G', goalie: 'G', keeper: 'G', goal: 'G', gk: 'G', pg: 'G', sg: 'G', guard: 'G',
  forward: 'F', attack: 'F', attacker: 'F', striker: 'F', st: 'F', cf: 'F', sf: 'F', pf: 'F', wing: 'F',
  midfield: 'M', midfielder: 'M', mid: 'M', cm: 'M', dm: 'M', am: 'M',
  defense: 'D', defence: 'D', defender: 'D', back: 'D', fullback: 'D', sweeper: 'D', cb: 'D', lb: 'D', rb: 'D', fb: 'D',
  center: 'C', centre: 'C',
};

/** "Midfield/Defense" → {M, D}; "F, M" → {F, M}: what two sources' position words are compared as. */
export function positionCodes(positions: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const p of positions) {
    for (const part of p.split(/[/,&]|\bor\b|\band\b/i)) {
      const w = part.trim().toLowerCase();
      if (!w) continue;
      out.add(POSITION_WORDS[w] ?? (w.length <= 2 ? w.toUpperCase() : w[0].toUpperCase()));
    }
  }
  return out;
}

function positionsDisagree(a: readonly string[], b: readonly string[]): boolean {
  const x = positionCodes(a);
  const y = positionCodes(b);
  if (x.size === 0 || y.size === 0) return false;
  return ![...x].some((c) => y.has(c));
}

/** One stint from the observations filed under it. */
function resolveStint(
  key: { season: string; sport: SportId; team: string; level: PlayerLevel },
  raw: readonly Observation[],
): Stint {
  const observations = inPrecedence(dedupe(raw), key.level);
  const deciding = observations.filter((o) => o.rejected !== true);
  // A stat sheet's name is rebuilt or abbreviated: any other source's spelling is read first.
  const named = [...observations.filter((o) => o.src !== 'maxpreps-stats'), ...observations.filter((o) => o.src === 'maxpreps-stats')];
  const name = named.find((o) => o.name !== undefined)?.name;
  if (name === undefined) {
    throw new Error(`registry: a stint of ${key.team} (${key.sport} ${key.season} ${key.level}) has no named observation`);
  }
  const grade = deciding.find((o) => o.grade !== undefined)?.grade ?? null;
  const jersey = deciding.find((o) => o.jersey !== undefined)?.jersey ?? null;
  const positions = deciding.find((o) => o.positions !== undefined)?.positions ?? [];
  const height = deciding.find((o) => o.height !== undefined)?.height ?? null;

  const conflicts: StintConflict[] = [];
  const seen = new Set<string>();
  const add = (field: StintConflict['field'], kept: string | null, other: string, o: Observation) => {
    const c: StintConflict = { field, kept, other, src: o.src, ...(o.kind ? { kind: o.kind } : {}), ...(o.url ? { url: o.url } : {}) };
    const k = JSON.stringify(c);
    if (seen.has(k)) return;
    seen.add(k);
    conflicts.push(c);
  };
  for (const o of observations) {
    const forced = o.rejected === true;
    if (o.grade !== undefined && (forced || o.grade !== grade)) add('grade', grade === null ? null : String(grade), String(o.grade), o);
    if (o.jersey !== undefined && (forced || o.jersey !== jersey)) add('jersey', jersey, o.jersey, o);
    if (o.height !== undefined && (forced || o.height !== height)) add('height', height, o.height, o);
    if (o.positions !== undefined && (forced || positionsDisagree(o.positions, positions))) {
      add('positions', positions.length ? positions.join(', ') : null, o.positions.join(', '), o);
    }
  }
  return {
    ...key,
    name,
    grade,
    jersey,
    positions: [...positions],
    height,
    captain: observations.some((o) => o.captain === true),
    observations,
    conflicts,
  };
}

function dedupe(observations: readonly Observation[]): Observation[] {
  const seen = new Set<string>();
  return observations.filter((o) => {
    const k = JSON.stringify(o, Object.keys(o).sort());
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ---------------------------------------------------------------- class years

interface ClassClaim {
  classOf: number;
  rejected: boolean;
  stint: Stint;
  o: Observation;
}

/** Every class year a player's observations imply, latest season first, varsity before JV. */
function classClaims(stints: readonly Stint[]): ClassClaim[] {
  const ordered = [...stints].sort(
    (a, b) => byText(b.season, a.season) || byLevel(a.level, b.level) || byText(a.sport, b.sport) || byText(a.team, b.team),
  );
  const claims: ClassClaim[] = [];
  for (const stint of ordered) {
    for (const o of stint.observations) {
      const rejected = o.rejected === true;
      if (o.grade !== undefined) claims.push({ classOf: classOfFor(stint.season, o.grade), rejected, stint, o });
      if (o.classOf !== undefined) claims.push({ classOf: o.classOf, rejected, stint, o });
    }
  }
  return claims;
}

// ---------------------------------------------------------------- the build

/** Union-find over sighting indices, keeping each cluster's members. */
class Clusters {
  private readonly parent: number[];
  /** root → its members, in index order. */
  readonly members: Map<number, number[]>;
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.members = new Map(this.parent.map((i) => [i, [i]]));
  }
  find(i: number): number {
    let r = i;
    while (this.parent[r] !== r) r = this.parent[r];
    while (this.parent[i] !== r) [i, this.parent[i]] = [this.parent[i], r];
    return r;
  }
  /** Joins two clusters; the smaller index stays the root, so the result does not depend on call order. */
  union(a: number, b: number): void {
    const x = this.find(a);
    const y = this.find(b);
    if (x === y) return;
    const [keep, drop] = x < y ? [x, y] : [y, x];
    this.parent[drop] = keep;
    const merged = [...(this.members.get(keep) as number[]), ...(this.members.get(drop) as number[])].sort((p, q) => p - q);
    this.members.set(keep, merged);
    this.members.delete(drop);
  }
}

function mintId(key: string, taken: ReadonlySet<string>): string {
  for (let n = 0; ; n += 1) {
    const id = `p${createHash('sha256').update(n === 0 ? key : `${key}#${n}`).digest('hex').slice(0, 10)}`;
    if (!taken.has(id)) return id;
  }
}

/** Career ids first, then names: the order a player's identifiers are listed and its id is founded in. */
function compareIdentifiers(a: PlayerIdentifier, b: PlayerIdentifier): number {
  if (a.kind !== b.kind) return a.kind === 'maxpreps-career' ? -1 : 1;
  return byText(identifierKey(a), identifierKey(b));
}

export function buildRegistry(input: BuildInput): PlayersFile {
  const { previous, identity } = input;
  const builtPairs = new Set(input.built.map((b) => pairKey(b.sport, b.season)));
  if (builtPairs.size !== input.built.length) throw new Error('registry: a (sport, season) pair is listed twice under built');
  /** pair → the sources read afresh for it; absent for a pair rebuilt in full. */
  const toppedUp = new Map(input.built.flatMap((b) => (b.sources ? [[pairKey(b.sport, b.season), new Set(b.sources)] as const] : [])));
  const distinct = new Set(
    identity.distinct.flatMap((d) => [`${d.careerIds[0]}|${d.careerIds[1]}`, `${d.careerIds[1]}|${d.careerIds[0]}`]),
  );
  for (const s of input.sightings) {
    const pair = pairKey(s.sport, s.season);
    if (!builtPairs.has(pair)) {
      throw new Error(`registry: a sighting is for ${s.sport} ${s.season}, which is not one of the pairs being built`);
    }
    const only = toppedUp.get(pair);
    const stray = only ? s.observations.find((o) => !only.has(o.src)) : undefined;
    if (stray) throw new Error(`registry: ${s.sport} ${s.season} is only topped up, but a sighting carries a ${stray.src} observation`);
  }

  // ---- 0. what the previous registry holds for the pairs this build does not rebuild
  const carried: Sighting[] = [];
  for (const p of previous?.players ?? []) {
    const careers = p.identifiers.flatMap((i) => (i.kind === 'maxpreps-career' ? [i] : []));
    const names = p.identifiers.flatMap((i) => (i.kind === 'name' ? [i] : []));
    for (const stint of p.stints) {
      const pair = pairKey(stint.sport, stint.season);
      const afresh = toppedUp.get(pair);
      if (builtPairs.has(pair) && !afresh) continue;
      const observations = afresh ? stint.observations.filter((o) => !afresh.has(o.src)) : stint.observations;
      if (observations.length === 0) continue;
      const own = names.filter((n) => n.sport === stint.sport && n.team === stint.team).map((n) => n.name);
      const spelled = observations.flatMap((o) => (o.name && !isShortName(o.name) ? [nameKey(o.name)] : []));
      // Two careers a person has since said are two people: the stint stays with the first.
      const ids = careers.map((c) => c.careerId);
      const kept = ids.filter((id, i) => !ids.slice(0, i).some((earlier) => distinct.has(`${earlier}|${id}`)));
      carried.push({
        sport: stint.sport,
        season: stint.season,
        team: stint.team,
        level: stint.level,
        careerIds: kept,
        careerProfileIds: Object.fromEntries(careers.flatMap((c) => (c.careerProfileId ? [[c.careerId, c.careerProfileId]] : []))),
        nameKeys: [...new Set([...own, ...spelled])],
        observations,
      });
    }
  }

  // ---- 1. curation: a name a person has tied to a career, or to another name
  const sameAs = new Map(identity.sameAs.map((e) => [`${e.sport} ${e.team} ${nameKey(e.name)}`, e]));
  const all: Sighting[] = [...carried, ...input.sightings].map((s) => {
    if (s.careerIds.length > 0) return s;
    const hit = s.nameKeys.map((k) => sameAs.get(`${s.sport} ${s.team} ${k}`)).find((e) => e !== undefined);
    if (!hit) return s;
    return hit.careerId !== undefined ? { ...s, careerIds: [hit.careerId] } : { ...s, nameKeys: [nameKey(hit.isName as string)] };
  });

  // ---- 2. one career id, one player — unless the id is carrying two people
  type PendingReview = Omit<ReviewItem, 'players'> & { sightings: number[] };
  const reviews: PendingReview[] = [];
  const fullNames = (s: Sighting): string[] => [...new Set(s.observations.flatMap((o) => (o.name && !isShortName(o.name) ? [o.name] : [])))];
  const withCareer = new Map<string, number[]>();
  all.forEach((s, i) => {
    for (const id of s.careerIds) withCareer.set(id, [...(withCareer.get(id) ?? []), i]);
  });
  /** Rows taken off a career id: index → the id they no longer carry. */
  const takenOff = new Map<number, string>();
  /** Named rows a career's unnamed rows (a stat sheet's short names) go with: careerId → group → indices. */
  const groupsOf = new Map<string, number[][]>();
  for (const careerId of [...withCareer.keys()].sort()) {
    const indices = withCareer.get(careerId) as number[];
    const namedRows = indices.filter((i) => fullNames(all[i]).length > 0);
    // Rows whose names could be one person's are one group.
    const groups: number[][] = [];
    for (const i of namedRows) {
      const joins = groups.filter((g) => g.some((j) => fullNames(all[i]).some((a) => fullNames(all[j]).some((b) => namesCompatible(a, b)))));
      const merged = [...joins.flat(), i].sort((p, q) => p - q);
      for (const g of joins) groups.splice(groups.indexOf(g), 1);
      groups.push(merged);
    }
    if (groups.length <= 1) continue;
    // MaxPreps' record under this id is whoever it lists latest; on a tie, the varsity roster's row.
    const latest = (g: number[]) => g.map((i) => all[i].season).sort().at(-1) as string;
    const onVarsityPage = (g: number[]) => g.some((i) => all[i].observations.some((o) => o.src === 'maxpreps-roster'));
    const label = (g: number[]) => fullNames(all[g[0]])[0];
    groups.sort((a, b) => byText(latest(b), latest(a)) || Number(onVarsityPage(b)) - Number(onVarsityPage(a)) || byText(nameKey(label(a)), nameKey(label(b))));
    groupsOf.set(careerId, groups);
    for (const g of groups.slice(1)) for (const i of g) takenOff.set(i, careerId);
    const first = all[groups[0][0]];
    reviews.push({
      kind: 'career-two-names',
      sport: first.sport,
      team: first.team,
      names: groups.map(label),
      sightings: groups.map((g) => g[0]),
      note:
        `MaxPreps career ${careerId} is listed as ${groups.map((g) => `${label(g)} (${[...new Set(g.map((i) => all[i].season))].sort().join(', ')})`).join(' and as ')}, ` +
        `names that share nothing: read as ${groups.length} players, and the career id stays with ${label(groups[0])}. A coach who retypes a name over last year's row leaves this behind.`,
    });
  }
  // A row with only a short name goes with the named rows of its own season, else with the id's keeper.
  for (const [careerId, groups] of groupsOf) {
    for (const i of withCareer.get(careerId) as number[]) {
      if (fullNames(all[i]).length > 0) continue;
      const s = all[i];
      const sameSeason = groups.filter((g) => g.some((j) => all[j].sport === s.sport && all[j].season === s.season));
      const short = s.observations.find((o) => o.name)?.name;
      const lastWord = short ? nameTokens(short).at(-1) : undefined;
      const byLast = sameSeason.filter((g) => lastWord !== undefined && g.some((j) => fullNames(all[j]).some((n) => nameTokens(n).includes(lastWord))));
      const home = sameSeason.length === 1 ? sameSeason[0] : byLast.length === 1 ? byLast[0] : groups[0];
      if (home !== groups[0]) takenOff.set(i, careerId);
      home.push(i);
    }
  }
  for (const [i, careerId] of takenOff) {
    const s = all[i];
    all[i] = {
      ...s,
      careerIds: s.careerIds.filter((id) => id !== careerId),
      careerProfileIds: Object.fromEntries(Object.entries(s.careerProfileIds ?? {}).filter(([id]) => id !== careerId)),
      // A short-name row has no name of its own to be found by: it borrows its group's.
      nameKeys: s.nameKeys,
    };
  }

  const clusters = new Clusters(all.length);
  const firstWithCareer = new Map<string, number>();
  all.forEach((s, i) => {
    for (const id of s.careerIds) {
      const first = firstWithCareer.get(id);
      if (first === undefined) firstWithCareer.set(id, i);
      else clusters.union(first, i);
    }
  });
  // The rows taken off an id stay together, group by group.
  for (const groups of groupsOf.values()) for (const g of groups.slice(1)) for (const i of g.slice(1)) clusters.union(g[0], i);

  const members = clusters.members;
  /** The class years a set of sightings implies, rejected statements left out. */
  const classYears = (indices: readonly number[]): Set<number> => {
    const out = new Set<number>();
    for (const i of indices) {
      for (const o of all[i].observations) {
        if (o.rejected === true) continue;
        if (o.grade !== undefined) out.add(classOfFor(all[i].season, o.grade));
        if (o.classOf !== undefined) out.add(o.classOf);
      }
    }
    return out;
  };
  /** The smallest gap between two sets of class years; 0 when either gives none. */
  const classGap = (a: ReadonlySet<number>, b: ReadonlySet<number>): number => {
    if (a.size === 0 || b.size === 0) return 0;
    let gap = Number.POSITIVE_INFINITY;
    for (const x of a) for (const y of b) gap = Math.min(gap, Math.abs(x - y));
    return gap;
  };

  const spelling = (i: number): string => all[i].observations.find((o) => o.name && !isShortName(o.name))?.name ?? all[i].observations.find((o) => o.name)?.name ?? '?';

  // ---- 3. names, one team at a time
  const byTeamName = new Map<string, number[]>();
  all.forEach((s, i) => {
    for (const k of s.nameKeys) {
      const key = `${teamKey(s)} ${k}`;
      byTeamName.set(key, [...(byTeamName.get(key) ?? []), i]);
    }
  });
  for (const key of [...byTeamName.keys()].sort()) {
    const indices = byTeamName.get(key) as number[];
    const { sport, team } = all[indices[0]];
    const hasCareer = (root: number) => (members.get(root) as number[]).some((i) => all[i].careerIds.length > 0);
    const careersOf = (root: number) => [...new Set((members.get(root) as number[]).flatMap((i) => all[i].careerIds))].sort();
    const careerRoots = () => [...new Set(indices.map((i) => clusters.find(i)))].filter(hasCareer).sort((a, b) => a - b);

    // Two careers under one name on one team.
    const roots = careerRoots();
    for (const other of roots.slice(1)) {
      const base = clusters.find(roots[0]);
      if (clusters.find(other) === base) continue;
      const a = careersOf(base);
      const b = careersOf(other);
      if (a.some((x) => b.some((y) => distinct.has(`${x}|${y}`)))) continue;
      const gap = classGap(classYears(members.get(base) as number[]), classYears(members.get(other) as number[]));
      const merged = gap <= 1;
      reviews.push({
        kind: 'same-name-two-careers',
        sport,
        team,
        names: [...new Set([spelling(roots[0]), spelling(other)])],
        sightings: [roots[0], other],
        note: merged
          ? `MaxPreps careers ${a.join(', ')} and ${b.join(', ')} share this name on this team and their class years do not contradict: treated as one player.`
          : `MaxPreps careers ${a.join(', ')} and ${b.join(', ')} share this name on this team, but their class years are ${gap} apart: kept as two players.`,
      });
      if (merged) clusters.union(base, other);
    }

    // Rows with no id.
    const loose = indices.filter((i) => !hasCareer(clusters.find(i)));
    for (const i of loose) {
      const own = classYears([i]);
      const candidates = careerRoots();
      const fits = candidates.filter((r) => classGap(classYears(members.get(r) as number[]), own) <= 1);
      if (fits.length === 1) {
        clusters.union(fits[0], i);
      } else if (candidates.length === 1) {
        reviews.push({
          kind: 'name-class-mismatch',
          sport,
          team,
          names: [spelling(i)],
          sightings: [i, candidates[0]],
          note: `A ${all[i].observations[0].src} row of ${all[i].season} with this name gives a class year two or more years from this team's player of the same name: kept apart.`,
        });
      } else if (candidates.length > 1) {
        reviews.push({
          kind: 'name-ambiguous',
          sport,
          team,
          names: [spelling(i)],
          sightings: [i, ...candidates],
          note: `A ${all[i].observations[0].src} row of ${all[i].season} with this name fits ${fits.length} of this team's ${candidates.length} players of that name: not joined to any.`,
        });
      }
    }
    // What is left under this name with no id is one player known by name.
    const left = indices.filter((i) => !hasCareer(clusters.find(i)));
    for (const i of left.slice(1)) clusters.union(left[0], i);
  }

  // ---- 4. players
  interface Draft {
    root: number;
    identifiers: PlayerIdentifier[];
    /** Every key the cluster answers to, a name key included even once a career is known. */
    keys: string[];
    stints: Stint[];
  }
  const drafts: Draft[] = [];
  for (const [root, indices] of [...members]) {
    const careerIds = [...new Set(indices.flatMap((i) => all[i].careerIds))].sort();
    const profileOf = (id: string) => indices.map((i) => all[i].careerProfileIds?.[id]).find((v) => v !== undefined) ?? null;
    const careers: PlayerIdentifier[] = careerIds.map((careerId) => ({ kind: 'maxpreps-career', careerId, careerProfileId: profileOf(careerId) }));
    const nameIds = new Map<string, PlayerIdentifier>();
    for (const i of indices) {
      if (all[i].careerIds.length > 0) continue;
      for (const k of all[i].nameKeys) {
        const id: PlayerIdentifier = { kind: 'name', sport: all[i].sport, team: all[i].team, name: k };
        nameIds.set(identifierKey(id), id);
      }
    }
    const names = [...nameIds.values()].sort(compareIdentifiers);
    const identifiers = careers.length > 0 ? careers : names;
    if (identifiers.length === 0) {
      throw new Error(`registry: ${spelling(indices[0])} (${all[indices[0]].team}) has neither a career id nor a name to be known by`);
    }

    // A soft level (a stat sheet is filed under varsity) gives way to where the player's own rows put
    // her on that team that season: the highest squad she is really listed on.
    const hard = new Set(indices.filter((i) => !all[i].softLevel).map((i) => `${pairKey(all[i].sport, all[i].season)} ${all[i].team} ${all[i].level}`));
    const levelOf = (s: Sighting): PlayerLevel => {
      if (!s.softLevel) return s.level;
      const at = (level: PlayerLevel) => hard.has(`${pairKey(s.sport, s.season)} ${s.team} ${level}`);
      return at(s.level) ? s.level : (PLAYER_LEVELS.find(at) ?? s.level);
    };
    const grouped = new Map<string, { key: Parameters<typeof resolveStint>[0]; observations: Observation[] }>();
    for (const i of indices) {
      const s = all[i];
      const key = { season: s.season, sport: s.sport, team: s.team, level: levelOf(s) };
      const k = `${key.season} ${key.sport} ${key.team} ${key.level}`;
      const entry = grouped.get(k) ?? { key, observations: [] };
      entry.observations.push(...s.observations);
      grouped.set(k, entry);
    }
    const stints = [...grouped.keys()].sort().map((k) => {
      const { key, observations } = grouped.get(k) as { key: Parameters<typeof resolveStint>[0]; observations: Observation[] };
      return resolveStint(key, observations);
    });
    drafts.push({ root, identifiers, keys: [...careers, ...names].map(identifierKey), stints });
  }
  drafts.sort((a, b) => compareIdentifiers(a.identifiers[0], b.identifiers[0]));

  // ---- 5. ids: an id stays with the identifiers it had
  const prevOwner = new Map<string, Player>();
  for (const p of previous?.players ?? []) for (const i of p.identifiers) prevOwner.set(identifierKey(i), p);
  const claims = new Map<string, Draft[]>();
  for (const d of drafts) {
    for (const p of new Set(d.keys.flatMap((k) => (prevOwner.has(k) ? [prevOwner.get(k) as Player] : [])))) {
      claims.set(p.id, [...(claims.get(p.id) ?? []), d]);
    }
  }
  const idOf = new Map<Draft, string>();
  const formerOf = new Map<Draft, Set<string>>();
  const taken = new Set<string>();
  // A previous player split across clusters goes to the one holding her first identifier.
  const prevById = new Map((previous?.players ?? []).map((p) => [p.id, p]));
  for (const prevId of [...claims.keys()].sort()) {
    const p = prevById.get(prevId) as Player;
    const claimants = claims.get(prevId) as Draft[];
    const first = identifierKey([...p.identifiers].sort(compareIdentifiers)[0]);
    const winner = claimants.find((d) => d.keys.includes(first)) ?? claimants[0];
    const former = formerOf.get(winner) ?? new Set<string>();
    formerOf.set(winner, former);
    if (!idOf.has(winner)) idOf.set(winner, prevId);
    else former.add(prevId);
    for (const old of p.formerIds) former.add(old);
    taken.add(prevId);
    for (const old of p.formerIds) taken.add(old);
  }
  for (const d of drafts) {
    if (idOf.has(d)) continue;
    const id = mintId(identifierKey(d.identifiers[0]), taken);
    taken.add(id);
    idOf.set(d, id);
  }

  // ---- 6. the records
  const players: Player[] = drafts.map((d) => {
    const ordered = [...d.stints].sort(
      (a, b) => byText(b.season, a.season) || byLevel(a.level, b.level) || byText(a.sport, b.sport) || byText(a.team, b.team),
    );
    const spelledBy = (s: Stint) => s.observations.find((o) => o.name === s.name)?.src;
    const name = (ordered.find((s) => spelledBy(s) !== 'maxpreps-stats') ?? ordered[0]).name;
    const names = [name];
    const keys = new Set([nameKey(name)]);
    const offer = (candidate: string, onlyIfNewKey: boolean) => {
      if (names.includes(candidate)) return;
      if (onlyIfNewKey && keys.has(nameKey(candidate))) return;
      names.push(candidate);
      keys.add(nameKey(candidate));
    };
    for (const s of ordered) for (const o of s.observations) if (o.name && o.src !== 'maxpreps-stats') offer(o.name, false);
    // A stat sheet's rebuilt or abbreviated name is listed only when no other source spells that name.
    for (const s of ordered) for (const o of s.observations) if (o.name && o.src === 'maxpreps-stats' && !isShortName(o.name)) offer(o.name, true);

    const all_claims = classClaims(d.stints);
    const classOf = all_claims.find((c) => !c.rejected)?.classOf ?? null;
    const classOfConflicts: ClassOfConflict[] = [];
    const seen = new Set<string>();
    for (const c of all_claims) {
      if (c.classOf === classOf) continue;
      const conflict: ClassOfConflict = {
        classOf: c.classOf,
        season: c.stint.season,
        sport: c.stint.sport,
        team: c.stint.team,
        level: c.stint.level,
        src: c.o.src,
        ...(c.o.kind ? { kind: c.o.kind } : {}),
        ...(c.o.url ? { url: c.o.url } : {}),
      };
      const k = JSON.stringify(conflict);
      if (seen.has(k)) continue;
      seen.add(k);
      classOfConflicts.push(conflict);
    }
    return {
      id: idOf.get(d) as string,
      formerIds: [...(formerOf.get(d) ?? [])].sort(),
      name,
      names,
      classOf,
      classOfConflicts,
      identifiers: d.identifiers,
      stints: d.stints,
    };
  });
  const idOfRoot = new Map(drafts.map((d) => [d.root, idOf.get(d) as string]));
  const idOfSighting = (i: number) => idOfRoot.get(clusters.find(i)) as string;

  // ---- 7. what a person should look at
  const review: ReviewItem[] = reviews.map(({ sightings, ...r }) => ({ ...r, players: [...new Set(sightings.map(idOfSighting))] }));
  review.push(...possibleMatches(all, members, clusters, idOfSighting, classYears, classGap));
  review.sort((a, b) => byText(a.kind, b.kind) || byText(a.sport, b.sport) || byText(a.team, b.team) || byText(a.names.join('|'), b.names.join('|')) || byText(a.players.join('|'), b.players.join('|')));
  const unique = review.filter((r, i) => i === 0 || JSON.stringify(r) !== JSON.stringify(review[i - 1]));

  players.sort((a, b) => byText(a.id, b.id));
  const file: PlayersFile = {
    builtBy: input.builtBy,
    notes: NOTES,
    built: [...input.built].map((b) => ({ sport: b.sport, season: b.season, ...(b.sources ? { sources: [...b.sources].sort() } : {}) })).sort((a, b) => byText(a.sport, b.sport) || byText(a.season, b.season)),
    counts: countPlayers(players, unique.length),
    review: unique,
    players,
  };
  const checked = PlayersFileSchema.safeParse(file);
  if (!checked.success) {
    throw new Error(
      `registry: the built file does not validate:\n${checked.error.issues.slice(0, 12).map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n')}`,
    );
  }
  return checked.data;
}

/** A player known by name alone whom a nickname or a near spelling ties to exactly one rostered player of the team. */
function possibleMatches(
  all: readonly Sighting[],
  members: ReadonlyMap<number, number[]>,
  clusters: Clusters,
  idOfSighting: (i: number) => string,
  classYears: (indices: readonly number[]) => Set<number>,
  classGap: (a: ReadonlySet<number>, b: ReadonlySet<number>) => number,
): ReviewItem[] {
  /** team → one entry per rostered career cluster, under the roster's own name parts. */
  const rostered = new Map<string, Array<NoteRosterPlayer & { root: number }>>();
  all.forEach((s, i) => {
    if (s.careerIds.length === 0 || !s.firstName || !s.lastName) return;
    const root = clusters.find(i);
    const list = rostered.get(teamKey(s)) ?? [];
    const fullName = s.observations.find((o) => o.name)?.name;
    if (fullName && !list.some((p) => p.root === root && p.fullName === fullName)) {
      list.push({ root, athleteId: null, careerId: s.careerIds[0], careerUrl: null, fullName, firstName: s.firstName, lastName: s.lastName, jersey: null });
    }
    rostered.set(teamKey(s), list);
  });
  const out: ReviewItem[] = [];
  for (const [root, indices] of members) {
    if (indices.some((i) => all[i].careerIds.length > 0)) continue;
    const s = all[indices[0]];
    const written = s.observations.find((o) => o.name && !isShortName(o.name))?.name;
    const candidates = rostered.get(teamKey(s));
    if (!written || !candidates) continue;
    const hit = resolveName(written, s.team as TeamSlug, candidates, []);
    if (!hit || hit.via === 'roster') continue;
    const other = (hit.player as NoteRosterPlayer & { root: number }).root;
    if (other === root) continue;
    if (classGap(classYears(indices), classYears(members.get(other) as number[])) > 1) continue;
    out.push({
      kind: 'possible-match',
      sport: s.sport,
      team: s.team,
      names: [written, hit.player.fullName],
      players: [idOfSighting(indices[0]), idOfSighting((members.get(other) as number[])[0])],
      note: `"${written}" (${s.observations[0].src}, ${s.season}) may be this team's ${hit.player.fullName} (${hit.via}): not joined. If they are one player, say so in data/player-identity.json sameAs.`,
    });
  }
  return out;
}

const NOTES = [
  'One record per person across every sport and season this repository holds. Internal: no page reads this file.',
  'A player is identified by a MaxPreps career id where one is known, otherwise by a name on one team\'s lists. Rows are joined on a career id, or on an identical name inside one team and sport when their class years do not contradict; never on a nickname or a near spelling (those are listed under review as possible-match).',
  'A stint is one player on one team in one season of one sport at one level; its fields are the first of its observations to state them, in the order MaxPreps roster page, overlay, school JV list, stat sheet, all-league list, recruiting profile. Every other statement that differs is listed under conflicts.',
  'classOf is the graduation year implied by the latest season\'s best source; classOfConflicts lists every statement implying another year.',
  'Stints of a (sport, season) not named under built are carried forward from the previous build as they were. What a person has decided about who is who lives in data/player-identity.json; this file is never edited by hand.',
];
