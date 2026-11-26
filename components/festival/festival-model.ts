import {
  festivalClubOfTeam,
  festivalClubs,
  festivalSlots,
  getFestival,
  type FestivalClub,
  type FestivalDivision,
  type FestivalField,
  type FestivalFile,
  type FestivalGame,
  type FestivalPool,
  type FestivalTeam,
} from '../../lib/festival/festival';
import { EN_DASH, listWords, ordinal, plural, recordString, signedGd } from '../../lib/format';
import { clockET, dayKeyET, dayLabelET, slotHeading, bothClocks, weekdayET, whenET } from './festival-time';

/**
 * The shared half of the /festival view builders (DESIGN §35): one index over the festival file and the resolved
 * clubs, and the pieces every page draws — a pool's table, a game row, a placement game's two sides, a team's
 * own games, its card and its Saturday placement path — as plain view models. Pure: everything comes from the
 * file passed in (the committed one by default), never from the clock. The page-level builders
 * (hub-view.ts, division-view.ts, schedule-view.ts, clubs-view.ts, club-view.ts, team-view.ts) assemble these.
 *
 * Words kept from the feed: team, pool and division names, and the placement games' sources. A placement game
 * is never called a final or a championship (the feed does not say which is which), and a placement game level
 * at the end is "Tied — shoot-out" with no winner: regs D.4 sends it to a shoot-out and the feed has no
 * shoot-out field.
 */

// ---------------------------------------------------------------- the index

export interface FestivalModel {
  file: FestivalFile;
  divisionByKey: ReadonlyMap<number, FestivalDivision>;
  divisionBySlug: ReadonlyMap<string, FestivalDivision>;
  poolById: ReadonlyMap<string, FestivalPool>;
  divisionOfPool: ReadonlyMap<string, FestivalDivision>;
  teamById: ReadonlyMap<string, FestivalTeam>;
  teamBySlug: ReadonlyMap<string, FestivalTeam>;
  fieldById: ReadonlyMap<string, FestivalField>;
  /**
   * Every game a team plays, in file order: its pool games, and a placement game once TourneyMachine names it in a
   * side or once a side's source pool has finished with the team alone at that place (`pool-complete`, sideAt).
   * TourneyMachine may leave a side unfilled through Saturday (it was never seen filling one; DESIGN §35.5), and
   * the team's own pages must still carry that game and its result.
   */
  gamesOfTeam: ReadonlyMap<string, readonly FestivalGame[]>;
  /** A pool's own games. */
  gamesOfPool: ReadonlyMap<string, readonly FestivalGame[]>;
  /** A division's placement games, in file order. */
  placementOfDivision: ReadonlyMap<number, readonly FestivalGame[]>;
  clubs: readonly FestivalClub[];
  clubBySlug: ReadonlyMap<string, FestivalClub>;
  clubOfTeam: ReadonlyMap<string, string>;
}

export interface ResolvedClubsInput {
  clubs: readonly FestivalClub[];
  clubOfTeam: ReadonlyMap<string, string>;
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

export function buildFestivalModel(file: FestivalFile, clubs: ResolvedClubsInput): FestivalModel {
  const divisionOfPool = new Map<string, FestivalDivision>();
  const poolById = new Map<string, FestivalPool>();
  for (const d of file.divisions) {
    for (const p of d.pools) {
      poolById.set(p.id, p);
      divisionOfPool.set(p.id, d);
    }
  }
  const gamesOfTeam = new Map<string, FestivalGame[]>();
  const gamesOfPool = new Map<string, FestivalGame[]>();
  const placementOfDivision = new Map<number, FestivalGame[]>();
  for (const g of file.games) {
    if (g.kind === 'pool' && g.poolId) push(gamesOfPool, g.poolId, g);
    if (g.kind === 'placement') push(placementOfDivision, g.divisionKey, g);
  }
  const m: FestivalModel = {
    file,
    divisionByKey: new Map(file.divisions.map((d) => [d.key, d])),
    divisionBySlug: new Map(file.divisions.map((d) => [d.slug, d])),
    poolById,
    divisionOfPool,
    teamById: new Map(file.teams.map((t) => [t.id, t])),
    teamBySlug: new Map(file.teams.map((t) => [t.slug, t])),
    fieldById: new Map(file.fields.map((f) => [f.id, f])),
    gamesOfTeam,
    gamesOfPool,
    placementOfDivision,
    clubs: clubs.clubs,
    clubBySlug: new Map(clubs.clubs.map((c) => [c.slug, c])),
    clubOfTeam: clubs.clubOfTeam,
  };
  // A second pass, once the pools' games are indexed: a placement side resolves from its source pool (sideAt), so
  // a game is listed under the team that plays it, named by TourneyMachine or settled by a final pool table.
  for (const g of file.games) {
    for (const id of new Set(playingTeamIds(m, g))) push(gamesOfTeam, id, g);
  }
  return m;
}

let committed: FestivalModel | null = null;

/** The model of the committed files, built once. */
export function festivalModel(): FestivalModel {
  committed ??= buildFestivalModel(getFestival(), { clubs: festivalClubs(), clubOfTeam: festivalClubOfTeam() });
  return committed;
}

// ---------------------------------------------------------------- hrefs and refs

export const FESTIVAL_HREF = '/festival';
export const divisionHref = (slug: string) => `/festival/${slug}`;
export const teamHref = (slug: string) => `/festival/teams/${slug}`;
export const clubHref = (slug: string) => `/festival/clubs/${slug}`;
/** A placement game's anchor on its division page: 'game-b3' (game numbers are unique within a division). */
export const gameAnchor = (number: string) => `game-${number.toLowerCase()}`;

/** A team as every page names it. */
export interface TeamRef {
  id: string;
  slug: string;
  name: string;
  href: string;
  divisionSlug: string;
  /** 'U19', 'U14 Co-Ed'. */
  divisionShort: string;
  poolName: string;
  clubSlug: string;
  clubName: string;
  clubHref: string;
}

export function teamRef(m: FestivalModel, teamId: string): TeamRef {
  const team = m.teamById.get(teamId);
  if (!team) throw new Error(`festival-model: no team ${teamId}`);
  const division = m.divisionByKey.get(team.divisionKey)!;
  const clubSlug = m.clubOfTeam.get(team.id)!;
  const club = m.clubBySlug.get(clubSlug)!;
  return {
    id: team.id,
    slug: team.slug,
    name: team.name,
    href: teamHref(team.slug),
    divisionSlug: division.slug,
    divisionShort: division.short,
    poolName: m.poolById.get(team.poolId)!.name,
    clubSlug,
    clubName: club.name,
    clubHref: clubHref(clubSlug),
  };
}

export function fieldName(m: FestivalModel, fieldId: string): string {
  return m.fieldById.get(fieldId)?.name ?? 'Field to be announced';
}

// ---------------------------------------------------------------- pools

/** Whether every game of the pool has a final score: its table is then the final one. */
export function poolComplete(m: FestivalModel, poolId: string): boolean {
  const games = m.gamesOfPool.get(poolId) ?? [];
  return games.length > 0 && games.every((g) => g.status === 'final');
}

/** Whether any game of the pool is final: before that, TourneyMachine's order is only the seeding. */
export function poolHasResults(m: FestivalModel, poolId: string): boolean {
  return (m.gamesOfPool.get(poolId) ?? []).some((g) => g.status === 'final');
}

export interface PoolRowModel {
  team: TeamRef;
  /**
   * The place, from TourneyMachine's order; null before any result in the pool. Teams level on every figure the
   * feed carries (points, wins, goal difference, goals for; regs D.2) share the rank of the first of them
   * (`tied`): TourneyMachine lists such teams alphabetically until the event staff fill the placement sides, and
   * the feed has no head-to-head, shoot-out or coin-toss result (regs D.2–D.3) to break them.
   */
  rank: number | null;
  /** Level with a neighbour on (pts, w, gd, gf): the table prints the rank as '=1'. */
  tied: boolean;
  gp: number;
  w: number;
  l: number;
  t: number;
  gf: number;
  ga: number;
  /** Signed: '+3', '−2', '0'. */
  gd: string;
  pts: number;
  /** '2-1-0'. */
  record: string;
  /** The page's own team (a team page, a club's team section). */
  self: boolean;
}

export interface PoolTableModel {
  id: string;
  /** 'Pool K'. */
  name: string;
  /** 'pool-k': the anchor on the division page. */
  anchor: string;
  divisionShort: string;
  divisionSlug: string;
  rows: PoolRowModel[];
  complete: boolean;
  hasResults: boolean;
  /** Pool games without a final score yet. */
  toPlay: number;
  /** 'Pool complete' or '4 games to play'. */
  status: string;
}

export function poolAnchor(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function poolTable(m: FestivalModel, poolId: string, selfIds: readonly string[] = []): PoolTableModel {
  const pool = m.poolById.get(poolId);
  if (!pool) throw new Error(`festival-model: no pool ${poolId}`);
  const division = m.divisionOfPool.get(poolId)!;
  const hasResults = poolHasResults(m, poolId);
  const complete = poolComplete(m, poolId);
  const toPlay = (m.gamesOfPool.get(poolId) ?? []).filter((g) => g.status !== 'final').length;
  return {
    id: pool.id,
    name: pool.name,
    anchor: poolAnchor(pool.name),
    divisionShort: division.short,
    divisionSlug: division.slug,
    rows: pool.teamIds.map((id, i) => {
      const r = m.teamById.get(id)!.record;
      const tie = tieAt(m, pool, i + 1);
      return {
        team: teamRef(m, id),
        rank: hasResults ? tie.first : null,
        tied: hasResults && tie.tied,
        gp: r.w + r.l + r.t,
        w: r.w,
        l: r.l,
        t: r.t,
        gf: r.gf,
        ga: r.ga,
        gd: signedGd(r.gd),
        pts: r.pts,
        record: recordString(r),
        self: selfIds.includes(id),
      };
    }),
    complete,
    hasResults,
    toPlay,
    status: complete ? 'Pool complete' : `${plural(toPlay, 'game')} to play`,
  };
}

/** The key a full tie is level on: the figures of regs D.2 the feed carries (points, wins, goal difference, goals for). */
function recordKey(m: FestivalModel, teamId: string): string {
  const r = m.teamById.get(teamId)!.record;
  return [r.pts, r.w, r.gd, r.gf].join();
}

/**
 * Whether the team at `place` (1-based) in TourneyMachine's order is level on every figure with a neighbour, and the
 * places its tie group spans. TourneyMachine lists fully level teams alphabetically (seen on 2026-11-26: Pool S's
 * "Atlanta FHC U19" over "FHL" at 1-0-0, +1, 2 goals; Pool C's "IFHCK Thunder" over "U12 Gateway Red Stripes", by
 * the raw name). That order is not a result: regs D.2 then goes to the head-to-head result and a shoot-out (a coin
 * toss without time), which the feed does not carry, so a tied place is open until the event staff fill the
 * placement sides (DESIGN §35.5).
 */
export function tieAt(m: FestivalModel, pool: FestivalPool, place: number): { tied: boolean; first: number; last: number } {
  const ids = pool.teamIds;
  const key = recordKey(m, ids[place - 1]);
  let first = place;
  let last = place;
  while (first > 1 && recordKey(m, ids[first - 2]) === key) first--;
  while (last < ids.length && recordKey(m, ids[last]) === key) last++;
  return { tied: last > first, first, last };
}

/** A team's place in its pool ('2nd of 6', 'tied for 1st of 6'), once the pool has a result. */
export interface PlaceModel {
  /** Its line in TourneyMachine's order. */
  place: number;
  of: number;
  /** Level with a neighbour on every figure the feed carries: its place is not settled (tieAt). */
  tied: boolean;
  /** The places a tie spans (`place` alone when not tied). */
  first: number;
  last: number;
  /** '2nd of 6', 'tied for 1st of 6'. */
  words: string;
  /** The pool's table is final and the team is alone at its place. */
  final: boolean;
}

export function placeOf(m: FestivalModel, teamId: string): PlaceModel | null {
  const team = m.teamById.get(teamId)!;
  if (!poolHasResults(m, team.poolId)) return null;
  const pool = m.poolById.get(team.poolId)!;
  const place = pool.teamIds.indexOf(teamId) + 1;
  const of = pool.teamIds.length;
  const { tied, first, last } = tieAt(m, pool, place);
  return {
    place,
    of,
    tied,
    first,
    last,
    words: tied ? `tied for ${ordinal(first)} of ${of}` : `${ordinal(place)} of ${of}`,
    final: poolComplete(m, team.poolId) && !tied,
  };
}

// ---------------------------------------------------------------- game sides

/**
 * Where a side of a game stands (spec §6):
 * - `team`: a pool game's team, or a placement side TourneyMachine has filled;
 * - `pool-complete`: an unfilled placement side whose source pool has played every game, with one team alone at
 *   that place in the final pool table (no full tie with a neighbour: tieAt);
 * - `provisional`: the source pool is under way, or finished with that place tied: the team TourneyMachine lists
 *   there NOW, which can still change (a tie goes to a head-to-head result or a shoot-out the feed lacks);
 * - `placeholder`: the source pool has no result yet: only the slot.
 */
export type SideState = 'team' | 'pool-complete' | 'provisional' | 'placeholder';

export interface SideModel {
  state: SideState;
  /** The team that plays (`team`, `pool-complete`), or that holds the place now (`provisional`). */
  team: TeamRef | null;
  /** A placement side's slot: 'Pool R 1st'; null for a pool game. */
  slot: string | null;
  /** What a line prints first: the team's name, else the slot. */
  name: string;
  /** The score figure for a live or final game; undefined when there is none to print. */
  score?: string;
  result: 'won' | 'lost' | null;
}

export function slotLabel(m: FestivalModel, source: { poolId: string; place: number }): string {
  return `${m.poolById.get(source.poolId)!.name} ${ordinal(source.place)}`;
}

function sideAt(m: FestivalModel, game: FestivalGame, i: 0 | 1): SideModel {
  const side = game.sides[i];
  const slot = side.source ? slotLabel(m, side.source) : null;
  const scored = game.score !== null && game.status !== 'scheduled';
  const score = scored ? String(game.score![i]) : undefined;
  let result: SideModel['result'] = null;
  if (game.status === 'final' && game.score && game.score[0] !== game.score[1]) {
    const mine = game.score[i];
    const theirs = game.score[1 - i];
    result = mine > theirs ? 'won' : 'lost';
  }
  if (side.teamId) {
    const team = teamRef(m, side.teamId);
    return { state: 'team', team, slot, name: team.name, score, result };
  }
  if (!side.source) {
    // A pool game always names its teams (the schema); a placement side always has a source. Neither reaches here.
    return { state: 'placeholder', team: null, slot: null, name: side.label, score, result };
  }
  const pool = m.poolById.get(side.source.poolId)!;
  const holder = pool.teamIds[side.source.place - 1];
  // A complete pool settles the side only when its holder is alone at the place: a full tie is listed
  // alphabetically (tieAt), so that team is shown as "Now: …" until the event staff fill the side.
  if (poolComplete(m, pool.id) && holder && !tieAt(m, pool, side.source.place).tied) {
    const team = teamRef(m, holder);
    return { state: 'pool-complete', team, slot, name: team.name, score, result };
  }
  if (poolHasResults(m, pool.id) && holder) {
    return { state: 'provisional', team: teamRef(m, holder), slot, name: slot!, score, result };
  }
  return { state: 'placeholder', team: null, slot, name: slot!, score, result };
}

export function sidesOf(m: FestivalModel, game: FestivalGame): [SideModel, SideModel] {
  return [sideAt(m, game, 0), sideAt(m, game, 1)];
}

/** A placement game level at the end goes to a shoot-out (regs D.4), which the feed does not report. */
export function isShootoutTie(game: FestivalGame): boolean {
  return game.kind === 'placement' && game.status === 'final' && game.score !== null && game.score[0] === game.score[1];
}

export const SHOOTOUT_WORDS = `Tied ${'—'} shoot-out`;

/** The side is the team that plays: TourneyMachine named it, or a final pool table put it alone at the place. */
export function sidePlays(side: SideModel): boolean {
  return side.state === 'team' || side.state === 'pool-complete';
}

/**
 * Every team slug a game names or (filled from a complete pool, the place untied) will name: the "Only my teams"
 * filter's hook. A tied place is `provisional`, so its alphabetical first team is not filed under the game.
 */
export function gameTeamSlugs(sides: readonly SideModel[]): string[] {
  return sides.filter(sidePlays).map((s) => s.team!.slug);
}

/** The ids of the teams that play `game`, in side order (gamesOfTeam's index, a club's schedule). */
export function playingTeamIds(m: FestivalModel, game: FestivalGame): string[] {
  return sidesOf(m, game)
    .filter(sidePlays)
    .map((s) => s.team!.id);
}

// ---------------------------------------------------------------- a game row (neutral)

export interface GameRowModel {
  key: number;
  /** 'P9', 'B3'. */
  number: string;
  kind: FestivalGame['kind'];
  status: FestivalGame['status'];
  startUtc: string;
  /** '8:00 AM' (ET). */
  time: string;
  /** 'Field 7'. */
  field: string;
  divisionSlug: string;
  divisionShort: string;
  /** 'Pool K', or null for a placement game. */
  poolName: string | null;
  sides: [SideModel, SideModel];
  /** 'Final', 'Live', or '' for a game not started (the slot heading carries its time). */
  statusWords: string;
  /** 'U16 · Pool K · P9', with 'Tied — shoot-out' or 'Exhibition' appended. */
  note: string;
  /** The teams in it, for `data-fest-game`. */
  teamSlugs: string[];
  /** A placement game's place on its division page. */
  bracketHref: string | null;
}

export function gameRow(m: FestivalModel, game: FestivalGame): GameRowModel {
  const division = m.divisionByKey.get(game.divisionKey)!;
  const sides = sidesOf(m, game);
  const poolName = game.poolId ? m.poolById.get(game.poolId)!.name : null;
  const note = [
    division.short,
    poolName ?? finalLabel(game),
    game.number,
    isShootoutTie(game) ? SHOOTOUT_WORDS : null,
    game.exhibition ? 'Exhibition' : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return {
    key: game.key,
    number: game.number,
    kind: game.kind,
    status: game.status,
    startUtc: game.startUtc,
    time: clockET(game.startUtc),
    field: fieldName(m, game.fieldId),
    divisionSlug: division.slug,
    divisionShort: division.short,
    poolName,
    sides,
    statusWords: game.status === 'final' ? 'Final' : game.status === 'live' ? 'Live' : '',
    note,
    teamSlugs: gameTeamSlugs(sides),
    bracketHref: game.kind === 'placement' ? `${divisionHref(division.slug)}#${gameAnchor(game.number)}` : null,
  };
}

// ---------------------------------------------------------------- days and slots

export interface SlotModel<R> {
  /** 't-2026112608': the anchor. */
  id: string;
  startUtc: string;
  /** '8:00 AM ET · 5:00 AM PT'. */
  clocks: string;
  /** 'Thu Nov 26 · 8:00 AM ET · 5:00 AM PT'. */
  heading: string;
  rows: R[];
}

export interface DayModel<R> {
  /** '2026-11-26'. */
  key: string;
  /** 'd-2026-11-26'. */
  id: string;
  /** 'Thu Nov 26'. */
  label: string;
  slots: SlotModel<R>[];
  games: number;
}

/** Games (already in file order: time, then field) grouped by venue day, then start time. */
export function byDayAndSlot<R>(games: readonly FestivalGame[], row: (g: FestivalGame) => R): DayModel<R>[] {
  const days: DayModel<R>[] = [];
  for (const g of games) {
    const key = dayKeyET(g.startUtc);
    let day = days.at(-1);
    if (!day || day.key !== key) {
      day = { key, id: `d-${key}`, label: dayLabelET(g.startUtc), slots: [], games: 0 };
      days.push(day);
    }
    let slot = day.slots.at(-1);
    if (!slot || slot.startUtc !== g.startUtc) {
      slot = {
        id: `t-${g.start.slice(0, 13).replace(/\D/g, '')}`,
        startUtc: g.startUtc,
        clocks: bothClocks(g.startUtc),
        heading: slotHeading(g.startUtc),
        rows: [],
      };
      day.slots.push(slot);
    }
    slot.rows.push(row(g));
    day.games += 1;
  }
  return days;
}

/**
 * The latest time slot with any final game, and the first slot after it with no final and no live game: "Latest
 * results" and "Up next". From the data's statuses, never the clock: a slot played but not yet entered is not
 * "latest", and a slot is "up next" only once nothing after the latest result has started.
 */
export function latestAndNext(file: Pick<FestivalFile, 'games'>): { latest: string | null; next: string | null } {
  const slots = festivalSlots(file);
  const statusOf = new Map<string, { final: boolean; live: boolean }>();
  for (const g of file.games) {
    const s = statusOf.get(g.startUtc) ?? { final: false, live: false };
    if (g.status === 'final') s.final = true;
    if (g.status === 'live') s.live = true;
    statusOf.set(g.startUtc, s);
  }
  let latestIndex = -1;
  slots.forEach((slot, i) => {
    if (statusOf.get(slot.startUtc)?.final) latestIndex = i;
  });
  const next = slots.slice(latestIndex + 1).find((slot) => {
    const s = statusOf.get(slot.startUtc);
    return !s?.final && !s?.live;
  });
  return { latest: latestIndex >= 0 ? slots[latestIndex].startUtc : null, next: next?.startUtc ?? null };
}

// ---------------------------------------------------------------- a team's own games

export type ChipLetter = 'W' | 'L' | 'T';

export interface TeamGameModel {
  key: number;
  number: string;
  kind: FestivalGame['kind'];
  status: FestivalGame['status'];
  startUtc: string;
  /** 'Thu'. */
  day: string;
  /** '8:00 AM'. */
  time: string;
  /** 'Sat 9:00 AM ET'. */
  when: string;
  field: string;
  /** The team this row reads from. */
  team: TeamRef;
  /** The other side: a team, or a placement slot. */
  opponent: SideModel;
  chip: ChipLetter | null;
  /** '2–1', own goals first, for a live or final game. */
  score: string | null;
  /** 'Tied — shoot-out', 'Exhibition', 'Live', '1st-place final · B3'. */
  note: string | null;
  bracketHref: string | null;
}

export function teamGame(m: FestivalModel, game: FestivalGame, teamId: string): TeamGameModel {
  const sides = sidesOf(m, game);
  // The team's side as it resolves, not the raw teamId: an unfilled placement side settled by a final pool table
  // is the team's too, and its score and chip read from it.
  const i = sidePlays(sides[0]) && sides[0].team!.id === teamId ? 0 : 1;
  const own = sides[i];
  const opponent = sides[1 - i];
  let chip: ChipLetter | null = null;
  if (game.status === 'final' && game.score) chip = own.result === 'won' ? 'W' : own.result === 'lost' ? 'L' : 'T';
  const division = m.divisionByKey.get(game.divisionKey)!;
  const note = [
    game.status === 'live' ? 'Live' : null,
    game.kind === 'placement' ? `${finalLabel(game)} · ${game.number}` : null,
    isShootoutTie(game) ? SHOOTOUT_WORDS : null,
    game.exhibition ? 'Exhibition' : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return {
    key: game.key,
    number: game.number,
    kind: game.kind,
    status: game.status,
    startUtc: game.startUtc,
    day: weekdayET(game.startUtc),
    time: clockET(game.startUtc),
    when: whenET(game.startUtc),
    field: fieldName(m, game.fieldId),
    team: teamRef(m, teamId),
    opponent,
    chip,
    score: game.score && game.status !== 'scheduled' ? `${game.score[i]}${EN_DASH}${game.score[1 - i]}` : null,
    note: note || null,
    bracketHref: game.kind === 'placement' ? `${divisionHref(division.slug)}#${gameAnchor(game.number)}` : null,
  };
}

export function teamGames(m: FestivalModel, teamId: string): TeamGameModel[] {
  return (m.gamesOfTeam.get(teamId) ?? []).map((g) => teamGame(m, g, teamId));
}

// ---------------------------------------------------------------- placement games

/**
 * What a Saturday game decides, from the places it draws on (owner decision, 2026-11-26: there is no knockout
 * bracket, only finals between teams that finished in the same place in paired pools, or between neighbouring
 * places of a single pool): the same place of two pools → '1st-place final', '2nd-place final'; 1st v 2nd of one
 * pool → 'Final: 1st v 2nd'; any other pair → '3rd v 4th'.
 */
export function finalLabel(game: Pick<FestivalGame, 'sides'>): string {
  const [a, b] = game.sides.map((s) => s.source?.place ?? 0);
  if (!a || !b) return 'Final';
  if (a === b) return `${ordinal(a)}-place final`;
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return lo === 1 && hi === 2 ? 'Final: 1st v 2nd' : `${ordinal(lo)} v ${ordinal(hi)}`;
}

export interface PlacementGameModel {
  key: number;
  number: string;
  /** 'game-b3'. */
  anchor: string;
  href: string;
  status: FestivalGame['status'];
  /** 'Sat 9:00 AM ET'. */
  when: string;
  field: string;
  sides: [SideModel, SideModel];
  /** '1st-place final', 'Final: 1st v 2nd' (finalLabel). */
  label: string;
  /** 'Tied — shoot-out' for a level final. */
  note: string | null;
}

export function placementGame(m: FestivalModel, game: FestivalGame): PlacementGameModel {
  const division = m.divisionByKey.get(game.divisionKey)!;
  return {
    key: game.key,
    number: game.number,
    anchor: gameAnchor(game.number),
    href: `${divisionHref(division.slug)}#${gameAnchor(game.number)}`,
    status: game.status,
    when: whenET(game.startUtc),
    field: fieldName(m, game.fieldId),
    sides: sidesOf(m, game),
    label: finalLabel(game),
    note: isShootoutTie(game) ? SHOOTOUT_WORDS : game.status === 'live' ? 'Live' : null,
  };
}

export interface BracketColumnModel {
  key: number;
  /** 'Pool R v Pool S' (finals between the two pools' same places), 'Pool A' (finals within one pool). */
  title: string;
  /** The pools the column's finals draw on, in the division's order. */
  pools: string[];
  games: PlacementGameModel[];
}

/** A column's title from its games' source pools: two pools → 'Pool R v Pool S'; one → 'Pool A'; more → 'Pool R, S and T'. */
export function columnTitle(poolNames: readonly string[]): string {
  if (poolNames.length === 2) return `${poolNames[0]} v ${poolNames[1]}`;
  if (poolNames.length === 1) return poolNames[0]!;
  if (poolNames.every((n) => n.startsWith('Pool '))) return `Pool ${listWords(poolNames.map((n) => n.slice('Pool '.length)))}`;
  return listWords(poolNames);
}

/** A division's placement games as TourneyMachine draws them: columns left to right, rows top to bottom. */
export function bracketColumns(m: FestivalModel, divisionKey: number): BracketColumnModel[] {
  const division = m.divisionByKey.get(divisionKey)!;
  const games = [...(m.placementOfDivision.get(divisionKey) ?? [])];
  const columns = new Map<number, FestivalGame[]>();
  for (const g of games) push(columns, g.layout?.column ?? 0, g);
  const poolOrder = division.pools.map((p) => p.id);
  return [...columns.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([column, list]) => {
      list.sort((a, b) => (a.layout?.row ?? 0) - (b.layout?.row ?? 0) || a.startUtc.localeCompare(b.startUtc) || a.key - b.key);
      const pools = [...new Set(list.flatMap((g) => g.sides.map((s) => s.source?.poolId).filter((id): id is string => !!id)))].sort(
        (a, b) => poolOrder.indexOf(a) - poolOrder.indexOf(b),
      );
      return {
        key: column,
        title: columnTitle(pools.map((id) => m.poolById.get(id)!.name)),
        pools: pools.map((id) => m.poolById.get(id)!.name),
        games: list.map((g) => placementGame(m, g)),
      };
    });
}

// ---------------------------------------------------------------- a team's placement path

export interface PathGameModel {
  number: string;
  /** '1st-place final' (finalLabel). */
  label: string;
  href: string;
  when: string;
  field: string;
  /** The other side of the game, as the bracket shows it. */
  opponent: SideModel;
  /** The team is in this game: TourneyMachine filled it, or the pool finished with the team at this place. */
  settled: boolean;
}

export interface PathEntryModel {
  place: number;
  /** '2nd'. */
  placeWord: string;
  /** The team holds this place in the table now (or finished there), or shares it in a full tie (PlaceModel.first … last). */
  current: boolean;
  /** What marks a current entry: 'Now 2nd.', or 'Tied for 1st now.' across a full tie; null for the others. */
  nowWords: string | null;
  games: PathGameModel[];
}

export interface PlacementPathModel {
  poolName: string;
  poolComplete: boolean;
  /** The team's place now, once its pool has a result. */
  place: PlaceModel | null;
  /** One entry per place its pool feeds into a placement game, in place order. Empty: the pool feeds none. */
  entries: PathEntryModel[];
  bracketHref: string;
}

/**
 * "If 2nd in Pool K: plays Pool L 2nd · Sat 9:00 AM ET · Field 3", for every place of the team's pool that feeds a
 * placement game (a 4th place in a five-team pool can feed two). The team's place now is marked; once the pool is
 * complete or TourneyMachine fills the game, that game is `settled`.
 */
export function placementPath(m: FestivalModel, teamId: string): PlacementPathModel {
  const team = m.teamById.get(teamId)!;
  const division = m.divisionByKey.get(team.divisionKey)!;
  const pool = m.poolById.get(team.poolId)!;
  const place = placeOf(m, teamId);
  const complete = poolComplete(m, pool.id);
  const byPlace = new Map<number, PathGameModel[]>();
  for (const g of m.placementOfDivision.get(division.key) ?? []) {
    const sides = sidesOf(m, g);
    g.sides.forEach((side, i) => {
      if (side.source?.poolId !== pool.id) return;
      const own = sides[i];
      const settled = sidePlays(own) && own.team?.id === teamId;
      const opponent = sides[1 - i];
      push(byPlace, side.source.place, {
        number: g.number,
        label: finalLabel(g),
        href: `${divisionHref(division.slug)}#${gameAnchor(g.number)}`,
        when: whenET(g.startUtc),
        field: fieldName(m, g.fieldId),
        // In a one-pool division both sides can draw on the team's own pool, and the slot it would play is one it
        // holds now ("If 1st: plays Pool F 2nd (now <itself>)"), provisionally or from the final table. It cannot
        // hold that place and play against it, and who would is unknown, so the slot is printed alone (its name too:
        // a resolved side carries the team's name there).
        opponent:
          opponent.team?.id === teamId
            ? { ...opponent, state: 'placeholder', team: null, name: opponent.slot ?? opponent.name }
            : opponent,
        settled,
      });
    });
  }
  return {
    poolName: pool.name,
    poolComplete: complete,
    place,
    entries: [...byPlace.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([p, games]) => {
        const current = place !== null && p >= place.first && p <= place.last;
        const nowWords = !current ? null : place.tied ? `Tied for ${ordinal(place.first)} now.` : `Now ${ordinal(p)}.`;
        return { place: p, placeWord: ordinal(p), current, nowWords, games };
      }),
    bracketHref: `${divisionHref(division.slug)}#bracket`,
  };
}

// ---------------------------------------------------------------- a team's card

export interface TeamCardModel {
  team: TeamRef;
  /** '2-1-0', once the team has played. */
  record: string | null;
  pts: number;
  place: PlaceModel | null;
  last: TeamGameModel | null;
  /** The first game without a final score (live or to come). */
  next: TeamGameModel | null;
  /** A curated note on the team (festival-clubs.json teamNotes). */
  note: string | null;
  /** Its pool feeds a placement game TourneyMachine has not put the team in yet. */
  placementAhead: boolean;
}

export function teamCard(m: FestivalModel, teamId: string): TeamCardModel {
  const team = m.teamById.get(teamId)!;
  const games = teamGames(m, teamId);
  const r = team.record;
  const played = r.w + r.l + r.t > 0;
  const club = m.clubBySlug.get(m.clubOfTeam.get(teamId)!)!;
  return {
    team: teamRef(m, teamId),
    record: played ? recordString(r) : null,
    pts: r.pts,
    place: placeOf(m, teamId),
    last: games.filter((g) => g.status === 'final').at(-1) ?? null,
    next: games.find((g) => g.status !== 'final') ?? null,
    note: club.teamNotes[teamId] ?? null,
    placementAhead:
      !games.some((g) => g.kind === 'placement') &&
      (m.placementOfDivision.get(team.divisionKey) ?? []).some((g) => g.sides.some((s) => s.source?.poolId === team.poolId)),
  };
}

/** How many of `games` have a final score. */
export function finalsOf(games: readonly FestivalGame[]): number {
  return games.filter((g) => g.status === 'final').length;
}

/** 'v Pool R 1st' / 'v Texas Pride Red': the opponent as one plain phrase (cards, summaries). */
export function opponentWords(side: SideModel): string {
  if (side.state === 'provisional') return `${side.slot} (now ${side.team!.name})`;
  return side.name;
}
