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

// ---------------------------------------------------------------- names and class years

/** Letters NFKD leaves whole: folded by hand so "Đỗ" and "Do", "Søren" and "Soren" are one name. */
const FOLD: Readonly<Record<string, string>> = { đ: 'd', ø: 'o', ł: 'l', æ: 'ae', œ: 'oe', ß: 'ss', þ: 'th', ð: 'd', ı: 'i' };

function fold(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[đøłæœßþðı]/g, (c) => FOLD[c] ?? c);
}

/**
 * "Zoë  O'Brien-Smith" → "zoeobriensmith": a name compared across sources' spellings. Empty for a
 * name with no Latin letter at all, which therefore matches nothing.
 */
export function nameKey(name: string): string {
  return fold(name).replace(/[^a-z]/g, '');
}

/** Words a roster types beside a name that are not part of it: "(GK)", "Jr.", a grade. */
const NOT_A_NAME = new Set(['gk', 'jr', 'sr', 'ii', 'iii', 'iv', 'slug']);

/** "Sienna Steele (GK) 10" → ["sienna", "steele"]. */
export function nameTokens(name: string): string[] {
  return fold(name)
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

/** A slip of the pen: two letters in a long word, one in a middling one, none in a short one. */
function slipApart(a: string, b: string): boolean {
  const shorter = Math.min(a.length, b.length);
  return editDistance(a, b) <= (shorter >= 6 ? 2 : shorter >= 4 ? 1 : 0);
}

/**
 * Whether two spellings could be one person's: the same name, a shared last name ("Cammie Pearce",
 * "Cameron Pearce"; a last name is never the other's first: "James Taylor" is not "Taylor Swift"),
 * or first names that start alike with last names a slip apart ("Katie Keenan", "Kate Kennan").
 * "Andrew Duong" and "Nicolas Finuliar" could not. Used to notice that one MaxPreps career id is
 * carrying two people, and to keep an id from passing to another person; it never joins anything.
 */
export function namesCompatible(a: string, b: string): boolean {
  const ka = nameKey(a);
  const kb = nameKey(b);
  if (ka === '' || kb === '') return a.trim() === b.trim();
  if (ka === kb) return true;
  const x = nameTokens(a);
  const y = nameTokens(b);
  if (x.length === 0 || y.length === 0) return false;
  const lastX = x[x.length - 1];
  const lastY = y[y.length - 1];
  if (lastX === lastY) return true;
  // A multi-word last name written whole by one source and in part by another.
  if ((lastY.length >= 3 && x.slice(1).includes(lastY)) || (lastX.length >= 3 && y.slice(1).includes(lastX))) return true;
  return x[0].slice(0, 2) === y[0].slice(0, 2) && lastX.length >= 4 && lastY.length >= 4 && slipApart(lastX, lastY);
}

/**
 * Whether two spellings LOOK like one person's, for the review list only: more generous than
 * `namesCompatible`. The same words in another order, one name inside the other ("Paula Neira",
 * "Paula Neira Munoz"; "Wenhe (Angela) Zhang", "Wenhe Zhang"), a shared last name under first names
 * with the same initial ("Abby Martin", "Abigail Martin"), or a slip of the pen anywhere
 * ("Caityln Hughes", "Caitlyn Hughes").
 */
export function namesLookAlike(a: string, b: string): boolean {
  const ka = nameKey(a);
  const kb = nameKey(b);
  if (ka === '' || kb === '') return false;
  if (ka === kb) return true;
  const x = nameTokens(a);
  const y = nameTokens(b);
  if (x.length === 0 || y.length === 0) return false;
  const [small, large] = x.length <= y.length ? [x, y] : [y, x];
  if (small.length >= 2 && small.every((w) => large.includes(w))) return true;
  const lastX = x[x.length - 1];
  const lastY = y[y.length - 1];
  if (lastX === lastY && x[0][0] === y[0][0]) return true;
  if (x[0] === y[0] && lastX.length >= 4 && lastY.length >= 4 && slipApart(lastX, lastY)) return true;
  return Math.min(ka.length, kb.length) >= 8 && editDistance(ka, kb) <= 2;
}

/** "S. Lewis", "A. dawson", "S.Lewis": a stat sheet's initial-and-last-name, which identifies nobody. */
export function isShortName(name: string): boolean {
  return /^\p{L}\.\s*\p{L}/u.test(name);
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
  /** The roster's own name parts (kept for callers; the resolver reads the observations' names). */
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

/** What a position word means, by what it contains: the first match wins. */
const POSITION_RULES: ReadonlyArray<[RegExp, string]> = [
  [/keep|goal|^gk$|^g$|guard|^pg$|^sg$/, 'G'],
  [/mid|^m$|^mf$|^cm$|^dm$|^am$|^cam$|^cdm$/, 'M'],
  [/def|back|sweep|^d$|^cb$|^lb$|^rb$|^fb$/, 'D'],
  [/forw|attack|strik|wing|^f$|^st$|^cf$|^sf$|^pf$|^lw$|^rw$|^w$|^a$/, 'F'],
  [/^cent(er|re)$|^c$/, 'C'],
];

/** "Midfield/Defense" → {M, D}; "F, M" → {F, M}: what two sources' position words are compared as. */
export function positionCodes(positions: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const p of positions) {
    for (const part of p.split(/[/,&]|\bor\b|\band\b/i)) {
      const w = part.trim().toLowerCase();
      if (!w) continue;
      out.add(POSITION_RULES.find(([rule]) => rule.test(w))?.[1] ?? w.toUpperCase());
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
    if (o.grade !== undefined && o.grade !== grade) add('grade', grade === null ? null : String(grade), String(o.grade), o);
    if (o.jersey !== undefined && o.jersey !== jersey) add('jersey', jersey, o.jersey, o);
    if (o.height !== undefined && o.height !== height) add('height', height, o.height, o);
    // A rejected statement is a conflict whenever it is not word for word what the stint shows.
    const differs = o.rejected === true ? o.positions?.join(', ') !== positions.join(', ') : o.positions !== undefined && positionsDisagree(o.positions, positions);
    if (o.positions !== undefined && differs) add('positions', positions.length ? positions.join(', ') : null, o.positions.join(', '), o);
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

/**
 * The graduation year most of a player's sources agree on. Each (season, sport, source) counts
 * once, so a roster page and its overlay are two voices and two rows of one page are one. A tie
 * goes to the latest season's best source. One stale roster (a coach who copied last year's grades
 * into this year's rows) is thus outvoted by last year's stat sheet and all-league list.
 */
function resolveClassOf(claims: readonly ClassClaim[]): number | null {
  const voices = new Map<number, Set<string>>();
  for (const c of claims) {
    if (c.rejected) continue;
    const who = `${c.stint.season} ${c.stint.sport} ${c.o.src} ${c.o.kind ?? ''}`;
    voices.set(c.classOf, (voices.get(c.classOf) ?? new Set()).add(who));
  }
  let best: number | null = null;
  for (const c of claims) {
    if (c.rejected) continue;
    if (best === null || (voices.get(c.classOf) as Set<string>).size > (voices.get(best) as Set<string>).size) best = c.classOf;
  }
  return best;
}

// ---------------------------------------------------------------- the build

/** Union-find over row indices, keeping each cluster's members. */
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
  /** Joins two clusters; the smaller index stays the root. */
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

const hashId = (key: string, n: number): string => `p${createHash('sha256').update(n === 0 ? key : `${key}#${n}`).digest('hex').slice(0, 10)}`;

function mintId(key: string, taken: ReadonlySet<string>): string {
  for (let n = 0; ; n += 1) {
    const id = hashId(key, n);
    if (!taken.has(id)) return id;
  }
}

/** Career ids first, then names: the order a player's identifiers are listed and its id is founded in. */
function compareIdentifiers(a: PlayerIdentifier, b: PlayerIdentifier): number {
  if (a.kind !== b.kind) return a.kind === 'maxpreps-career' ? -1 : 1;
  return byText(identifierKey(a), identifierKey(b));
}

/** A sighting as the build works on it. */
interface Row extends Sighting {
  /** The previous player a carried stint belonged to. */
  prev?: string;
  /** True when a person's `sameAs` decided who this row is: no rule second-guesses it. */
  curated?: boolean;
  /** Keys the row answered to before curation or the career guard changed them: only for keeping an id. */
  formerKeys: string[];
  /** True for a carried stint an earlier build already marked `gone`. */
  gone?: boolean;
}

const ROSTER_SOURCES: ReadonlySet<ObservationSource> = new Set(['maxpreps-roster', 'maxpreps-jv-roster', 'school-jv-roster']);

export function buildRegistry(input: BuildInput): PlayersFile {
  const { previous, identity } = input;
  const builtPairs = new Set(input.built.map((b) => pairKey(b.sport, b.season)));
  if (builtPairs.size !== input.built.length) throw new Error('registry: a (sport, season) pair is listed twice under built');
  /** pair → the sources read afresh for it; absent for a pair rebuilt in full. */
  const toppedUp = new Map(input.built.flatMap((b) => (b.sources ? [[pairKey(b.sport, b.season), new Set(b.sources)] as const] : [])));
  const fullyBuilt = (sport: string, season: string) => builtPairs.has(pairKey(sport, season)) && !toppedUp.has(pairKey(sport, season));
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
  const carried: Row[] = [];
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
        prev: p.id,
        formerKeys: [],
        ...(stint.gone ? { gone: true } : {}),
      });
    }
  }

  // ---- 1. curation, then one fixed order: nothing below depends on the order rows arrived in
  const sameAs = new Map(identity.sameAs.map((e) => [`${e.sport} ${e.team} ${nameKey(e.name)}`, e]));
  const all: Row[] = [...carried, ...input.sightings.map((s): Row => ({ ...s, formerKeys: [] }))]
    .map((s): Row => ({ ...s, nameKeys: [...new Set(s.nameKeys.filter((k) => k !== ''))].sort(), careerIds: [...new Set(s.careerIds)].sort() }))
    // A row with neither an id nor a usable name (a name with no Latin letter) names nobody.
    .filter((s) => s.careerIds.length > 0 || s.nameKeys.length > 0)
    .map((s): Row => {
      // A row with a career of its own is joined after the careers are (below), not rewritten here.
      if (s.careerIds.length > 0) return s;
      const hit = s.nameKeys.map((k) => sameAs.get(`${s.sport} ${s.team} ${k}`)).find((e) => e !== undefined);
      if (!hit) return s;
      const formerKeys = s.nameKeys.map((k) => `name:${s.sport}:${s.team}:${k}`);
      return hit.careerId !== undefined
        ? { ...s, careerIds: [hit.careerId], curated: true, formerKeys }
        : { ...s, nameKeys: [nameKey(hit.isName as string)], curated: true, formerKeys };
    });
  const orderKey = (s: Row) =>
    [s.sport, s.season, s.team, PLAYER_LEVELS.indexOf(s.level), s.careerIds.join(','), s.nameKeys.join(','), JSON.stringify(s.observations), s.prev ?? ''].join('\u0001');
  all.sort((a, b) => byText(orderKey(a), orderKey(b)));
  const knownCareers = new Set(all.flatMap((s) => (s.curated ? [] : s.careerIds)));
  for (const e of identity.sameAs) {
    if (e.careerId !== undefined && !knownCareers.has(e.careerId)) {
      throw new Error(`registry: data/player-identity.json sameAs ties "${e.name}" (${e.team}) to MaxPreps career ${e.careerId}, which no source lists`);
    }
  }

  // ---- 2. one career id, one player — unless the id is carrying two people
  type PendingReview = Omit<ReviewItem, 'players' | 'seasons'> & { rows: number[] };
  const reviews: PendingReview[] = [];
  const fullNames = (s: Sighting): string[] => [...new Set(s.observations.flatMap((o) => (o.name && !isShortName(o.name) ? [o.name] : [])))];
  const spelling = (i: number): string => fullNames(all[i])[0] ?? all[i].observations.find((o) => o.name)?.name ?? '?';
  const withCareer = new Map<string, number[]>();
  all.forEach((s, i) => {
    for (const id of s.careerIds) withCareer.set(id, [...(withCareer.get(id) ?? []), i]);
  });
  /** Rows taken off career ids: index → the ids they no longer carry. */
  const takenOff = new Map<number, Set<string>>();
  const takeOff = (i: number, careerId: string) => takenOff.set(i, (takenOff.get(i) ?? new Set()).add(careerId));
  /** careerId → its rows by person, the id's keeper first. */
  const groupsOf = new Map<string, number[][]>();
  for (const careerId of [...withCareer.keys()].sort()) {
    const indices = withCareer.get(careerId) as number[];
    // What a person decided is not second-guessed: a curated row goes with the id's keeper.
    const namedRows = indices.filter((i) => !all[i].curated && fullNames(all[i]).length > 0);
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
    const label = (g: number[]) => g.flatMap((i) => fullNames(all[i])).sort((a, b) => byText(nameKey(a), nameKey(b)) || byText(a, b))[0];
    groups.sort((a, b) => byText(latest(b), latest(a)) || Number(onVarsityPage(b)) - Number(onVarsityPage(a)) || byText(nameKey(label(a)), nameKey(label(b))));
    groupsOf.set(careerId, groups);
    for (const g of groups.slice(1)) for (const i of g) takeOff(i, careerId);
    const first = all[groups[0][0]];
    reviews.push({
      kind: 'career-two-names',
      sport: first.sport,
      team: first.team,
      names: groups.map(label),
      rows: groups.map((g) => g[0]),
      note:
        `MaxPreps career ${careerId} is listed as ${groups.map((g) => `${label(g)} (${[...new Set(g.map((i) => all[i].season))].sort().join(', ')})`).join(' and as ')}, ` +
        `names that share nothing: read as ${groups.length} players, and the career id stays with ${label(groups[0])}. A coach who retypes a name over last year's row leaves this behind.`,
    });
  }
  // A row with only a short name goes with the named rows of its own season, else with the id's
  // keeper; a curated row goes with the keeper.
  for (const [careerId, groups] of groupsOf) {
    for (const i of withCareer.get(careerId) as number[]) {
      if (groups.some((g) => g.includes(i))) continue;
      const s = all[i];
      const sameSeason = groups.filter((g) => g.some((j) => all[j].sport === s.sport && all[j].season === s.season));
      const short = s.observations.find((o) => o.name)?.name;
      const lastWord = short ? nameTokens(short).at(-1) : undefined;
      const byLast = sameSeason.filter((g) => lastWord !== undefined && g.some((j) => fullNames(all[j]).some((n) => nameTokens(n).includes(lastWord))));
      const home = s.curated ? groups[0] : sameSeason.length === 1 ? sameSeason[0] : byLast.length === 1 ? byLast[0] : groups[0];
      if (home !== groups[0]) takeOff(i, careerId);
      home.push(i);
    }
  }
  for (const [i, ids] of takenOff) {
    const s = all[i];
    all[i] = {
      ...s,
      careerIds: s.careerIds.filter((id) => !ids.has(id)),
      careerProfileIds: Object.fromEntries(Object.entries(s.careerProfileIds ?? {}).filter(([id]) => !ids.has(id))),
      // Known from here on by the names it carries.
      nameKeys: [...new Set([...s.nameKeys, ...fullNames(s).map(nameKey)].filter((k) => k !== ''))].sort(),
      // …and still answering, for its id's sake, to the career it was read under.
      formerKeys: [...s.formerKeys, ...[...ids].map((id) => `mp:${id}`)],
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
  // The rows taken off an id stay together, person by person.
  for (const groups of groupsOf.values()) for (const g of groups.slice(1)) for (const i of g.slice(1)) clusters.union(g[0], i);
  // What a person decided about a name whose rows have a career of their own ("Addy Paradiso",
  // under this year's id, is last year's "Addison Paradiso"): the two records are joined whole.
  for (const e of identity.sameAs) {
    const named = (name: string) => all.flatMap((s, i) => (s.sport === e.sport && s.team === e.team && s.nameKeys.includes(nameKey(name)) ? [i] : []));
    const from = named(e.name);
    const to = e.careerId !== undefined ? [firstWithCareer.get(e.careerId)].flatMap((i) => (i === undefined ? [] : [i])) : named(e.isName as string);
    if (to.length === 0) continue;
    for (const i of from) clusters.union(to[0], i);
  }
  // A previous player known by name alone stays one player, whatever teams her stints were on.
  const nameOnlyBefore = new Set((previous?.players ?? []).filter((p) => p.identifiers.every((i) => i.kind === 'name')).map((p) => p.id));
  const firstOfPrev = new Map<string, number>();
  all.forEach((s, i) => {
    if (s.prev === undefined || !nameOnlyBefore.has(s.prev) || s.careerIds.length > 0) return;
    const first = firstOfPrev.get(s.prev);
    if (first === undefined) firstOfPrev.set(s.prev, i);
    else clusters.union(first, i);
  });

  const members = clusters.members;
  /** The class years a set of rows implies, rejected statements left out. */
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
  /**
   * The widest gap between two sets of class years; 0 when either gives none. Widest, not
   * narrowest: three careers a year apart each are not one player spanning three classes.
   */
  const classGap = (a: ReadonlySet<number>, b: ReadonlySet<number>): number => {
    let gap = 0;
    for (const x of a) for (const y of b) gap = Math.max(gap, Math.abs(x - y));
    return gap;
  };

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

    // Two careers under one name on one team: each joins the first earlier one it does not contradict.
    const settled: number[] = [];
    for (const start of careerRoots()) {
      const root = clusters.find(start);
      if (settled.some((r) => clusters.find(r) === root)) continue;
      let joined = false;
      for (const earlier of settled) {
        const base = clusters.find(earlier);
        const a = careersOf(base);
        const b = careersOf(root);
        if (a.some((x) => b.some((y) => distinct.has(`${x}|${y}`)))) continue;
        const gap = classGap(classYears(members.get(base) as number[]), classYears(members.get(root) as number[]));
        const merged = gap <= 1;
        reviews.push({
          kind: 'same-name-two-careers',
          sport,
          team,
          names: [...new Set([spelling(earlier), spelling(start)])],
          rows: [earlier, start],
          note: merged
            ? `MaxPreps careers ${a.join(', ')} and ${b.join(', ')} are listed under one name on this team (one of the spellings may be the overlay's) and their class years do not contradict: treated as one player.`
            : `MaxPreps careers ${a.join(', ')} and ${b.join(', ')} are listed under one name on this team, but their class years are ${gap} apart: kept as two players.`,
        });
        if (merged) {
          clusters.union(base, root);
          joined = true;
          break;
        }
      }
      if (!joined) settled.push(start);
    }

    // Rows with no id.
    const loose = indices.filter((i) => !hasCareer(clusters.find(i)));
    for (const i of loose) {
      if (hasCareer(clusters.find(i))) continue;
      const own = classYears(members.get(clusters.find(i)) as number[]);
      const candidates = careerRoots();
      // A row a person tied to this name is not held to the class years.
      const fits = all[i].curated ? candidates : candidates.filter((r) => classGap(classYears(members.get(r) as number[]), own) <= 1);
      if (fits.length === 1) {
        clusters.union(fits[0], i);
      } else if (candidates.length === 1) {
        reviews.push({
          kind: 'name-class-mismatch',
          sport,
          team,
          names: [spelling(i)],
          rows: [i, candidates[0]],
          note: `A ${all[i].observations[0].src} row of ${all[i].season} with this name gives a class year two or more years from this team's player of the same name: kept apart.`,
        });
      } else if (candidates.length > 1) {
        reviews.push({
          kind: 'name-ambiguous',
          sport,
          team,
          names: [spelling(i)],
          rows: [i, ...candidates],
          note: `A ${all[i].observations[0].src} row of ${all[i].season} with this name fits ${fits.length} of this team's ${candidates.length} players of that name: not joined to any.`,
        });
      }
    }
    // What is left under this name with no id is one player known by name.
    const left = indices.filter((i) => !hasCareer(clusters.find(i)));
    for (const i of left.slice(1)) clusters.union(left[0], i);
    if (left.length > 1) {
      const years = [...classYears(members.get(clusters.find(left[0])) as number[])];
      if (years.length > 0 && Math.max(...years) - Math.min(...years) >= 2) {
        reviews.push({
          kind: 'name-class-mismatch',
          sport,
          team,
          names: [spelling(left[0])],
          rows: [left[0]],
          note: `Rows with this name and no id give class years ${Math.min(...years)} to ${Math.max(...years)}: filed as one player known by name, who may be two.`,
        });
      }
    }
  }

  // ---- 4. players
  interface Draft {
    root: number | null;
    identifiers: PlayerIdentifier[];
    /** The identifiers' keys: what the player is known by. */
    primary: string[];
    /** Every other key its rows answer or answered to: only for keeping an id. */
    secondary: string[];
    /** Every full spelling its rows carry. */
    spellings: string[];
    stints: Stint[];
  }
  const drafts: Draft[] = [];
  for (const [root, indices] of [...members]) {
    const careerIds = [...new Set(indices.flatMap((i) => all[i].careerIds))].sort();
    const profileOf = (id: string) => indices.flatMap((i) => (all[i].careerProfileIds?.[id] ? [all[i].careerProfileIds?.[id] as string] : [])).sort()[0] ?? null;
    const careers: PlayerIdentifier[] = careerIds.map((careerId) => ({ kind: 'maxpreps-career', careerId, careerProfileId: profileOf(careerId) }));
    const nameIds = new Map<string, PlayerIdentifier>();
    const everyName = new Set<string>();
    for (const i of indices) {
      for (const k of all[i].nameKeys) {
        const id: PlayerIdentifier = { kind: 'name', sport: all[i].sport, team: all[i].team, name: k };
        everyName.add(identifierKey(id));
        if (all[i].careerIds.length === 0) nameIds.set(identifierKey(id), id);
      }
    }
    const names = [...nameIds.values()].sort(compareIdentifiers);
    const identifiers = careers.length > 0 ? careers : names;
    if (identifiers.length === 0) {
      throw new Error(`registry: ${spelling(indices[0])} (${all[indices[0]].team}) has neither a career id nor a name to be known by`);
    }
    const primary = identifiers.map(identifierKey);

    // A soft level (a stat sheet is filed under varsity) gives way to the squad a roster lists the
    // player on that team that season: the highest one, when her own level's roster does not.
    const listed = new Set(
      indices
        .filter((i) => !all[i].softLevel && all[i].observations.some((o) => ROSTER_SOURCES.has(o.src)))
        .map((i) => `${pairKey(all[i].sport, all[i].season)} ${all[i].team} ${all[i].level}`),
    );
    const levelOf = (s: Sighting): PlayerLevel => {
      if (!s.softLevel) return s.level;
      const at = (level: PlayerLevel) => listed.has(`${pairKey(s.sport, s.season)} ${s.team} ${level}`);
      return at(s.level) ? s.level : (PLAYER_LEVELS.find(at) ?? s.level);
    };
    const grouped = new Map<string, { key: Parameters<typeof resolveStint>[0]; observations: Observation[]; gone: boolean }>();
    for (const i of indices) {
      const s = all[i];
      const key = { season: s.season, sport: s.sport, team: s.team, level: levelOf(s) };
      const k = `${key.season} ${key.sport} ${key.team} ${PLAYER_LEVELS.indexOf(key.level)}`;
      const entry = grouped.get(k) ?? { key, observations: [], gone: true };
      entry.observations.push(...s.observations);
      // A stint stays `gone` only while nothing but its own carried row speaks for it.
      entry.gone = entry.gone && s.gone === true;
      grouped.set(k, entry);
    }
    const stints = [...grouped.keys()].sort().map((k): Stint => {
      const { key, observations, gone } = grouped.get(k) as { key: Parameters<typeof resolveStint>[0]; observations: Observation[]; gone: boolean };
      return { ...resolveStint(key, observations), ...(gone ? { gone: true as const } : {}) };
    });
    drafts.push({
      root,
      identifiers,
      primary,
      secondary: [...new Set([...everyName, ...indices.flatMap((i) => all[i].formerKeys)])].filter((k) => !primary.includes(k)).sort(),
      spellings: [...new Set(indices.flatMap((i) => fullNames(all[i])))],
      stints,
    });
  }
  drafts.sort((a, b) => compareIdentifiers(a.identifiers[0], b.identifiers[0]));

  // ---- 5. ids: an id stays with the person it named
  const prevPlayers = previous?.players ?? [];
  const owner = new Map<string, Draft>();
  for (const d of drafts) for (const k of d.primary) owner.set(k, d);
  const couldBe = (d: Draft, p: Player) => d.spellings.length === 0 || d.spellings.some((a) => p.names.some((b) => namesCompatible(a, b)));
  const sharesName = (d: Draft, p: Player) => d.spellings.some((a) => p.names.some((b) => nameKey(a) === nameKey(b)));
  /** Each previous player → the one draft that is still her. */
  const heirOf = new Map<string, Draft>();
  for (const p of prevPlayers) {
    const keys = p.identifiers.map(identifierKey);
    const first = identifierKey([...p.identifiers].sort(compareIdentifiers)[0]);
    const claimants = drafts.filter(
      (d) =>
        (d.primary.some((k) => keys.includes(k)) ||
          // A name the draft only used to answer to counts while nobody else is known by it; a career
          // id its rows were taken off always does (the id's new holder is somebody else by definition).
          d.secondary.some((k) => keys.includes(k) && (k.startsWith('mp:') || owner.get(k) === undefined || owner.get(k) === d))) &&
        // An id never passes to a row that could not be the same person (a retyped roster slot).
        couldBe(d, p),
    );
    if (claimants.length === 0) continue;
    const rank = (d: Draft) => [sharesName(d, p) ? 0 : 1, d.primary.includes(first) ? 0 : 1, d.primary.some((k) => keys.includes(k)) ? 0 : 1];
    claimants.sort((a, b) => {
      const [x, y] = [rank(a), rank(b)];
      return x[0] - y[0] || x[1] - y[1] || x[2] - y[2] || b.stints.length - a.stints.length || compareIdentifiers(a.identifiers[0], b.identifiers[0]);
    });
    heirOf.set(p.id, claimants[0]);
  }
  const inherited = new Map<Draft, Player[]>();
  for (const p of prevPlayers) {
    const d = heirOf.get(p.id);
    if (d) inherited.set(d, [...(inherited.get(d) ?? []), p]);
  }
  const idOf = new Map<Draft, string>();
  const formerOf = new Map<Draft, Set<string>>();
  const taken = new Set(prevPlayers.flatMap((p) => [p.id, ...p.formerIds]));
  for (const [d, ps] of inherited) {
    // The record with the most behind it keeps its id; the others' become former ids.
    const [keep, ...rest] = [...ps].sort(
      (a, b) => b.stints.length - a.stints.length || Number(b.identifiers[0].kind === 'maxpreps-career') - Number(a.identifiers[0].kind === 'maxpreps-career') || byText(a.id, b.id),
    );
    idOf.set(d, keep.id);
    formerOf.set(d, new Set([...keep.formerIds, ...rest.flatMap((p) => [p.id, ...p.formerIds])]));
  }
  for (const d of drafts) {
    if (idOf.has(d)) continue;
    // A player split back out of a merged record takes back the id she was founded under.
    const natural = hashId(d.primary[0], 0);
    const holder = [...formerOf].find(([, former]) => former.has(natural));
    const splitFrom = prevPlayers.some((p) => p.formerIds.includes(natural) && p.identifiers.some((i) => d.primary.includes(identifierKey(i))));
    if (holder && splitFrom) {
      holder[1].delete(natural);
      idOf.set(d, natural);
      continue;
    }
    const id = mintId(d.primary[0], taken);
    taken.add(id);
    idOf.set(d, id);
  }

  // ---- 5b. a season being rebuilt does not forget who was in it
  // A stint a previous build held for a pair this build reads in full, and that no source lists any
  // more, is kept as it was and marked `gone`. A player with nothing else left is kept whole.
  const stintKey = (s: Stint) => `${s.season} ${s.sport} ${s.team} ${s.level}`;
  for (const p of prevPlayers) {
    const lost = p.stints.filter((s) => fullyBuilt(s.sport, s.season));
    if (lost.length === 0) continue;
    const heir = heirOf.get(p.id);
    if (heir) {
      const has = new Set(heir.stints.map(stintKey));
      for (const s of lost) if (!has.has(stintKey(s))) heir.stints.push({ ...s, gone: true });
      heir.stints.sort((a, b) => byText(a.season, b.season) || byText(a.sport, b.sport) || byText(a.team, b.team) || byLevel(a.level, b.level));
      continue;
    }
    // Nobody is her any more. She keeps her identifiers if they are free; if somebody else now holds
    // one (a coach retyped another player over her row, and she is in no file to be told apart by),
    // she is known from here on by her name on the teams she was on.
    const own = p.identifiers.map(identifierKey);
    const byName = [...new Map(
      lost
        .flatMap((s) => p.names.filter((n) => !isShortName(n) && nameKey(n) !== '').map((n): PlayerIdentifier => ({ kind: 'name', sport: s.sport, team: s.team, name: nameKey(n) })))
        .map((i) => [identifierKey(i), i] as const),
    ).values()].sort(compareIdentifiers);
    const identifiers = own.some((k) => owner.has(k)) ? byName.filter((i) => !owner.has(identifierKey(i))) : p.identifiers;
    if (identifiers.length === 0) continue;
    const primary = identifiers.map(identifierKey);
    const ghost: Draft = {
      root: null,
      identifiers,
      primary,
      secondary: [],
      spellings: p.names,
      stints: lost.map((s) => ({ ...s, gone: true as const })),
    };
    for (const k of primary) owner.set(k, ghost);
    drafts.push(ghost);
    idOf.set(ghost, p.id);
    formerOf.set(ghost, new Set(p.formerIds));
  }

  // ---- 6. the records
  const players: Player[] = drafts.map((d) => {
    const ordered = [...d.stints].sort(
      (a, b) => byText(b.season, a.season) || byLevel(a.level, b.level) || byText(a.sport, b.sport) || byText(a.team, b.team),
    );
    // A stint's name is a stat sheet's only when no other source of the stint spells one.
    const fromSheetOnly = (s: Stint) => s.observations.every((o) => o.name === undefined || o.src === 'maxpreps-stats');
    const name = (ordered.find((s) => !fromSheetOnly(s)) ?? ordered[0]).name;
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

    const claims = classClaims(d.stints);
    const classOf = resolveClassOf(claims);
    const classOfConflicts: ClassOfConflict[] = [];
    const seen = new Set<string>();
    for (const c of claims) {
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
  const idOfRoot = new Map(drafts.flatMap((d) => (d.root === null ? [] : [[d.root, idOf.get(d) as string] as const])));
  const idOfRow = (i: number) => idOfRoot.get(clusters.find(i)) as string;

  // ---- 7. what a person should look at
  const seasonsOf = (ids: readonly string[]) => {
    const byId = new Map(players.map((p) => [p.id, p]));
    return [...new Set(ids.flatMap((id) => byId.get(id)?.stints.map((s) => s.season) ?? []))].sort();
  };
  const review: ReviewItem[] = reviews.map(({ rows, ...r }) => {
    const ids = [...new Set(rows.map(idOfRow))];
    return { ...r, seasons: [...new Set(rows.flatMap((i) => (members.get(clusters.find(i)) as number[]).map((j) => all[j].season)))].sort(), players: ids };
  });
  const settledPairs = new Set(identity.notSame.map((e) => `${e.team} ${[nameKey(e.names[0]), nameKey(e.names[1])].sort().join(' ')}`));
  review.push(...lookAlikes(players, seasonsOf, identity));
  // An item about seasons this build did not read cannot be found again: it is kept, for the players still here.
  const sameItem = (a: ReviewItem, b: ReviewItem) => a.kind === b.kind && a.sport === b.sport && a.team === b.team && [...a.names].sort().join('|') === [...b.names].sort().join('|');
  const nowId = new Map(players.flatMap((p) => [p.id, ...p.formerIds].map((id) => [id, p.id] as const)));
  for (const old of previous?.review ?? []) {
    if (old.seasons.every((season) => fullyBuilt(old.sport, season))) continue;
    if (review.some((r) => sameItem(r, old))) continue;
    // A pair a person has since said is two people is settled, whichever season it was found in.
    const pairKinds: ReadonlyArray<ReviewItem['kind']> = ['possible-match', 'same-name-other-sport'];
    const [first, second = first] = old.names;
    if (pairKinds.includes(old.kind) && settledPairs.has(`${old.team} ${[nameKey(first), nameKey(second)].sort().join(' ')}`)) continue;
    const ids = [...new Set(old.players.flatMap((id) => (nowId.has(id) ? [nowId.get(id) as string] : [])))];
    // Two players since found to be one, or gone: nothing left to decide.
    if (ids.length !== new Set(old.players).size) continue;
    review.push({ ...old, players: ids });
  }
  review.sort(
    (a, b) =>
      byText(a.kind, b.kind) || byText(a.sport, b.sport) || byText(a.team, b.team) || byText(a.names.join('|'), b.names.join('|')) ||
      byText(a.players.join('|'), b.players.join('|')) || byText(a.note, b.note),
  );
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

/** The class years a player's accepted observations imply. */
function classYearsOf(p: Player): Set<number> {
  return new Set(classClaims(p.stints).flatMap((c) => (c.rejected ? [] : [c.classOf])));
}

/**
 * Pairs of players a person should look at: two players of one team whose names look like one
 * person's, and one name at one school in two sports. Never joined here.
 *
 * A pair one list names side by side (two rows of one roster page, two lines of one stat sheet) is
 * two people unless they wear the same number there, so those are left out: sisters are not a
 * question.
 */
function lookAlikes(players: readonly Player[], seasonsOf: (ids: readonly string[]) => string[], identity: PlayerIdentity): ReviewItem[] {
  const out: ReviewItem[] = [];
  /** Pairs a person has said are two people: `<team> <name key> <name key>`, keys in order. */
  const settled = new Set(identity.notSame.map((e) => `${e.team} ${[nameKey(e.names[0]), nameKey(e.names[1])].sort().join(' ')}`));
  const isSettled = (team: string, a: Player, b: Player) =>
    a.names.some((x) => b.names.some((y) => settled.has(`${team} ${[nameKey(x), nameKey(y)].sort().join(' ')}`)));
  const gap = (a: Player, b: Player) => {
    let g = 0;
    for (const x of classYearsOf(a)) for (const y of classYearsOf(b)) g = Math.max(g, Math.abs(x - y));
    return g;
  };
  const careers = (p: Player) => p.identifiers.flatMap((i) => (i.kind === 'maxpreps-career' ? [i.careerId] : []));
  const lists = (p: Player, sport: string, team: string) =>
    new Map(p.stints.filter((s) => s.sport === sport && s.team === team).flatMap((s) => s.observations.map((o) => [`${s.season} ${s.level} ${o.src}`, o.jersey] as const)));
  const fullOf = (p: Player) => p.names.filter((n) => !isShortName(n));

  const byTeam = new Map<string, Player[]>();
  const bySchoolName = new Map<string, Player[]>();
  for (const p of players) {
    for (const t of new Set(p.stints.map((s) => `${s.sport} ${s.team}`))) byTeam.set(t, [...(byTeam.get(t) ?? []), p]);
    for (const team of new Set(p.stints.map((s) => s.team))) {
      for (const k of new Set(fullOf(p).map(nameKey))) if (k) bySchoolName.set(`${team} ${k}`, [...(bySchoolName.get(`${team} ${k}`) ?? []), p]);
    }
  }
  for (const t of [...byTeam.keys()].sort()) {
    const [sport, team] = t.split(' ') as [SportId, string];
    const roster = byTeam.get(t) as Player[];
    for (let i = 0; i < roster.length; i += 1) {
      for (let j = i + 1; j < roster.length; j += 1) {
        const [a, b] = [roster[i], roster[j]];
        // One name outright is the name rules' business (they joined it, or listed why not).
        const keysA = new Set(fullOf(a).map(nameKey));
        if (fullOf(b).some((y) => keysA.has(nameKey(y)))) continue;
        const pair = fullOf(a).flatMap((x) => fullOf(b).map((y) => [x, y] as const)).find(([x, y]) => namesLookAlike(x, y));
        if (!pair || gap(a, b) > 1 || isSettled(team, a, b)) continue;
        const [la, lb] = [lists(a, sport, team), lists(b, sport, team)];
        const together = [...la.keys()].filter((k) => lb.has(k));
        const sameNumber = together.some((k) => la.get(k) !== undefined && la.get(k) === lb.get(k));
        if (together.length > 0 && !sameNumber) continue;
        const numbers = (p: Player) => new Set(p.stints.filter((s) => s.sport === sport && s.team === team && s.jersey).map((s) => s.jersey as string));
        const shared = [...numbers(a)].filter((n) => numbers(b).has(n));
        out.push({
          kind: 'possible-match',
          sport,
          team,
          seasons: seasonsOf([a.id, b.id]),
          names: [pair[0], pair[1]],
          players: [a.id, b.id],
          note:
            `"${pair[0]}" (${seasonsOf([a.id]).join(', ')}) and "${pair[1]}" (${seasonsOf([b.id]).join(', ')}) may be one player of this team` +
            (shared.length ? `; both wear #${shared.sort().join(', #')}` : '') +
            (careers(a).length && careers(b).length ? '; each has its own MaxPreps career id' : '') +
            `: not joined. If they are one, say so in data/player-identity.json sameAs.`,
        });
      }
    }
  }
  for (const k of [...bySchoolName.keys()].sort()) {
    const same = bySchoolName.get(k) as Player[];
    for (let i = 0; i < same.length; i += 1) {
      for (let j = i + 1; j < same.length; j += 1) {
        const [a, b] = [same[i], same[j]];
        const team = k.slice(0, k.indexOf(' '));
        const sportsA = new Set(a.stints.filter((s) => s.team === team).map((s) => s.sport));
        const sportsB = new Set(b.stints.filter((s) => s.team === team).map((s) => s.sport));
        if ([...sportsA].some((s) => sportsB.has(s)) || gap(a, b) > 1 || isSettled(team, a, b)) continue;
        out.push({
          kind: 'same-name-other-sport',
          sport: [...sportsA].sort()[0],
          team,
          seasons: seasonsOf([a.id, b.id]),
          names: [...new Set([a.name, b.name])],
          players: [a.id, b.id],
          note: `${a.name} (${[...sportsA].sort().join(', ')}) and ${b.name} (${[...sportsB].sort().join(', ')}) share a name at this school and no MaxPreps career id: a name is never joined across sports, so they are two records.`,
        });
      }
    }
  }
  return out;
}

const NOTES = [
  'One record per person across every sport and season this repository holds. Internal: no page reads this file.',
  'A player is identified by a MaxPreps career id where one is known, otherwise by a name on one team\'s lists. Rows are joined on a career id (unless it is listed under names that could not be one person\'s), or on an identical name inside one team and sport when their class years do not contradict; never on a nickname or a near spelling (those are listed under review as possible-match).',
  'A stint is one player on one team in one season of one sport at one level; its fields are the first of its observations to state them, in the order MaxPreps roster page, overlay, school JV list, stat sheet, all-league list, recruiting profile. Every other statement that differs is listed under conflicts. A stint marked gone is one no source lists any more, kept as an earlier build left it.',
  'classOf is the graduation year most of the player\'s sources imply (a tie goes to the latest season\'s best source); classOfConflicts lists every statement implying another year.',
  'Stints of a (sport, season) not named under built are carried forward from the previous build as they were. What a person has decided about who is who lives in data/player-identity.json; this file is never edited by hand.',
];
