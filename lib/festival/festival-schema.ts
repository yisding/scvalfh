/**
 * The Zod contract for data/field-hockey/festival.json — the 2026 National Hockey Festival's divisions, pools,
 * teams and games as TourneyMachine publishes them (/festival, DESIGN §35), normalized by
 * lib/sources/tourneymachine.ts and written by scripts/fetch-festival.ts.
 *
 * The feed's own words are kept verbatim (team names, division names, the placement slots' "Pool T 3rd Place"
 * labels); nothing here calls a game a final or a championship. Times: `start` is the venue's wall clock (the feed's
 * naive `S`, Eastern), `startUtc` the same instant in UTC, and `utcOffset` ties the two together.
 *
 * Invariants (one file-level `superRefine`, every failure a named issue with a path):
 *   1. field ids and numbers, division keys and slugs, pool ids, team ids and slugs and game keys are unique; a game
 *      number is unique within its division
 *   2. no division slug is one of the static routes beside /festival/[division] (FESTIVAL_RESERVED_SLUGS)
 *   3. every divisionKey, poolId, teamId and fieldId a record names resolves, within the right division
 *   4. a pool's teamIds are exactly the teams whose poolId is that pool
 *   5. a game's startUtc is its start at utcOffset, and its day is inside the tournament's dates
 *   6. a pool game names its pool and two teams of it, and has no source; a placement game has no pool, a source on
 *      both sides (a pool of its division and a place that pool has), and a layout
 *   7. score is null exactly when the status is 'scheduled'
 *   8. games are in (startUtc, field number, key) order
 */

import { z } from 'zod';

import { contentKey } from '../stable-json';
import { calendarDateKey, httpsUrl, slugId } from '../schema-primitives';
import { FESTIVAL_RESERVED_SLUGS } from './festival-names';

const text = z.string().min(1);
const int = z.number().int();
const count = int.min(0);

/** A venue wall-clock time with no zone: '2026-11-26T08:00:00'. */
const localTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/, 'expected YYYY-MM-DDTHH:MM:SS');
/** A UTC instant: '2026-11-26T13:00:00Z' (fetchedAt may carry milliseconds). */
const utcTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/, 'expected an ISO UTC time');

export const FestivalVenueSchema = z.object({
  name: text,
  address: text,
  city: text,
  state: text,
  zip: text,
  lat: z.number(),
  lng: z.number(),
});

export const FestivalTournamentSchema = z.object({
  /** TourneyMachine's IDTournament. */
  id: text,
  name: text,
  startDate: calendarDateKey,
  endDate: calendarDateKey,
  timeZone: z.literal('America/New_York'),
  /** The venue's offset from UTC on every game day: '-05:00' (EST all three days). */
  utcOffset: z.string().regex(/^[+-]\d{2}:\d{2}$/, 'expected ±HH:MM'),
  venue: FestivalVenueSchema,
  /** TourneyMachine's public results page. */
  resultsUrl: httpsUrl,
  /** USA Field Hockey's event page. */
  infoUrl: httpsUrl,
});

/** A field at the venue: 'Field 7', number 7. */
export const FestivalFieldSchema = z.object({ id: text, name: text, number: int.min(1) });

/**
 * A pool: TourneyMachine's hex IDPool, 'Pool K', and its teams in TourneyMachine's order: the pool's rank, except that
 * teams level on points, wins, goal difference and goals for are listed alphabetically until the event staff fill the
 * placement sides (DESIGN §35.5).
 */
export const FestivalPoolSchema = z.object({ id: text, name: text, teamIds: z.array(text) });

export const FestivalDivisionSchema = z.object({
  /** TourneyMachine's integer division id (1, 3, 5, 9, 14, 16, 22, 29). */
  key: int,
  /** 'u14-11v11' (lib/sources/tourneymachine.ts divisionLabels). */
  slug: slugId,
  /** The feed's name: 'U-19 Girls 11v11'. */
  name: text,
  /** 'U19', 'U14 Co-Ed', 'Adult'. */
  short: text,
  format: z.enum(['11v11', '7v7']),
  /** TourneyMachine's bracket page for the division. */
  bracketUrl: httpsUrl.nullable(),
  pools: z.array(FestivalPoolSchema).min(1),
});

/** A team's pool record: TourneyMachine's *Pool fields (points 3/1/0, regs D.1). */
export const FestivalRecordSchema = z.object({
  w: count,
  l: count,
  t: count,
  pts: count,
  gf: count,
  ga: count,
  gd: int,
});

export const FestivalTeamSchema = z.object({
  /** TourneyMachine's hex team id. */
  id: text,
  /** `${divisionSlug}-${name without age tokens}`, unique across the festival. */
  slug: slugId,
  /** The feed's name, verbatim. */
  name: text,
  divisionKey: int,
  poolId: text,
  record: FestivalRecordSchema,
});

/** Where a placement game's side comes from: a place in a pool's final table. */
export const FestivalSourceSchema = z.object({ poolId: text, place: int.min(1) });

export const FestivalSideSchema = z.object({
  /** The team, once TourneyMachine names it; null for a placement slot not yet filled. */
  teamId: text.nullable(),
  /** The feed's T1/T2 text verbatim: a team name, or a slot such as 'Pool T 3rd Place'. */
  label: text,
  source: FestivalSourceSchema.nullable(),
});

export const FestivalGameSchema = z.object({
  /** TourneyMachine's GameDictionary key. */
  key: int,
  /** 'P9', 'B3': unique within a division only. */
  number: text,
  divisionKey: int,
  poolId: text.nullable(),
  kind: z.enum(['pool', 'placement']),
  start: localTime,
  startUtc: utcTime,
  fieldId: text,
  /** The feed's T1, T2 order: T1 is listed first. */
  sides: z.tuple([FestivalSideSchema, FestivalSideSchema]),
  score: z.tuple([count, count]).nullable(),
  status: z.enum(['scheduled', 'live', 'final']),
  exhibition: z.boolean(),
  /** A placement game's place in TourneyMachine's bracket drawing: column left to right, row top to bottom (0-based). */
  layout: z.object({ column: int.min(0), row: int.min(0) }).nullable(),
});

const FestivalFileObject = z.object({
  /** When the feed was read: the one key festivalContentKey ignores. */
  fetchedAt: utcTime,
  /** TournamentResultsLastUpdated's value, opaque ('v6_11/26/2026 3:13:00 PM'). */
  sourceVersion: text,
  tournament: FestivalTournamentSchema,
  fields: z.array(FestivalFieldSchema),
  divisions: z.array(FestivalDivisionSchema),
  teams: z.array(FestivalTeamSchema),
  games: z.array(FestivalGameSchema),
});

type Ctx = z.RefinementCtx;
type Path = Array<string | number>;

function issue(ctx: Ctx, path: Path, message: string): void {
  ctx.addIssue({ code: 'custom', path, message });
}

/** Whether every value `key` gives is new; each repeat is an issue at its own path. */
function unique<T>(ctx: Ctx, rows: readonly T[], key: (row: T) => string | number, path: (i: number) => Path, what: string): void {
  const seen = new Set<string | number>();
  rows.forEach((row, i) => {
    const k = key(row);
    if (seen.has(k)) issue(ctx, path(i), `duplicate ${what} ${k}`);
    seen.add(k);
  });
}

/** The UTC instant of a venue wall-clock time at `offset` ('-05:00'), as 'YYYY-MM-DDTHH:MM:SSZ'. */
export function localToUtc(start: string, offset: string): string {
  return new Date(`${start}${offset}`).toISOString().replace('.000Z', 'Z');
}

/** Invariants 1-8: what one field cannot see. */
function checkFestivalFile(f: z.infer<typeof FestivalFileObject>, ctx: Ctx): void {
  const t = f.tournament;
  if (t.endDate < t.startDate) issue(ctx, ['tournament', 'endDate'], `endDate ${t.endDate} is before startDate ${t.startDate}`);

  unique(ctx, f.fields, (x) => x.id, (i) => ['fields', i, 'id'], 'field id');
  unique(ctx, f.fields, (x) => x.number, (i) => ['fields', i, 'number'], 'field number');
  unique(ctx, f.divisions, (x) => x.key, (i) => ['divisions', i, 'key'], 'division key');
  unique(ctx, f.divisions, (x) => x.slug, (i) => ['divisions', i, 'slug'], 'division slug');
  unique(ctx, f.teams, (x) => x.id, (i) => ['teams', i, 'id'], 'team id');
  unique(ctx, f.teams, (x) => x.slug, (i) => ['teams', i, 'slug'], 'team slug');
  unique(ctx, f.games, (x) => x.key, (i) => ['games', i, 'key'], 'game key');
  unique(ctx, f.games, (x) => `${x.divisionKey}/${x.number}`, (i) => ['games', i, 'number'], 'division/game number');

  const fieldNumber = new Map(f.fields.map((x) => [x.id, x.number]));
  const divisionKeys = new Set(f.divisions.map((d) => d.key));
  /** pool id → its division's key and its teams. */
  const pools = new Map<string, { divisionKey: number; teamIds: readonly string[] }>();
  f.divisions.forEach((d, i) => {
    if (FESTIVAL_RESERVED_SLUGS.includes(d.slug)) {
      issue(ctx, ['divisions', i, 'slug'], `${d.slug} is a /festival route of its own, not a division slug`);
    }
    d.pools.forEach((p, j) => {
      if (pools.has(p.id)) issue(ctx, ['divisions', i, 'pools', j, 'id'], `duplicate pool id ${p.id}`);
      pools.set(p.id, { divisionKey: d.key, teamIds: p.teamIds });
    });
  });

  const teams = new Map(f.teams.map((x) => [x.id, x]));
  f.teams.forEach((x, i) => {
    if (!divisionKeys.has(x.divisionKey)) issue(ctx, ['teams', i, 'divisionKey'], `no division ${x.divisionKey}`);
    const pool = pools.get(x.poolId);
    if (!pool) issue(ctx, ['teams', i, 'poolId'], `no pool ${x.poolId}`);
    else if (pool.divisionKey !== x.divisionKey) issue(ctx, ['teams', i, 'poolId'], `pool ${x.poolId} is not in division ${x.divisionKey}`);
    else if (!pool.teamIds.includes(x.id)) issue(ctx, ['teams', i, 'poolId'], `pool ${x.poolId} does not list ${x.id}`);
  });
  f.divisions.forEach((d, i) =>
    d.pools.forEach((p, j) => {
      const members = f.teams.filter((x) => x.poolId === p.id).map((x) => x.id);
      if (p.teamIds.length !== new Set(p.teamIds).size) issue(ctx, ['divisions', i, 'pools', j, 'teamIds'], 'a team is listed twice');
      if (members.length !== p.teamIds.length || p.teamIds.some((id) => !members.includes(id))) {
        issue(ctx, ['divisions', i, 'pools', j, 'teamIds'], `${p.name}'s teamIds are not exactly the teams in it`);
      }
    }),
  );

  f.games.forEach((g, i) => {
    const at = (...rest: Path): Path => ['games', i, ...rest];
    if (!divisionKeys.has(g.divisionKey)) issue(ctx, at('divisionKey'), `no division ${g.divisionKey}`);
    if (!fieldNumber.has(g.fieldId)) issue(ctx, at('fieldId'), `no field ${g.fieldId}`);
    if (localToUtc(g.start, t.utcOffset) !== g.startUtc) {
      issue(ctx, at('startUtc'), `${g.startUtc} is not ${g.start} at ${t.utcOffset}`);
    }
    const day = g.start.slice(0, 10);
    if (day < t.startDate || day > t.endDate) issue(ctx, at('start'), `${day} is outside ${t.startDate}..${t.endDate}`);
    if ((g.score === null) !== (g.status === 'scheduled')) {
      issue(ctx, at('score'), g.score === null ? `a ${g.status} game has a score` : 'a scheduled game has no score');
    }
    g.sides.forEach((s, k) => {
      if (s.teamId === null) return;
      const team = teams.get(s.teamId);
      if (!team) issue(ctx, at('sides', k, 'teamId'), `no team ${s.teamId}`);
      else if (team.divisionKey !== g.divisionKey) issue(ctx, at('sides', k, 'teamId'), `${s.teamId} is not in division ${g.divisionKey}`);
    });
    if (g.kind === 'pool') {
      const pool = g.poolId === null ? undefined : pools.get(g.poolId);
      if (!pool) issue(ctx, at('poolId'), `a pool game names a pool of the file (${g.poolId})`);
      else if (pool.divisionKey !== g.divisionKey) issue(ctx, at('poolId'), `pool ${g.poolId} is not in division ${g.divisionKey}`);
      g.sides.forEach((s, k) => {
        if (s.source !== null) issue(ctx, at('sides', k, 'source'), 'a pool game side has no source');
        if (s.teamId === null) issue(ctx, at('sides', k, 'teamId'), 'a pool game side names its team');
        else if (pool && !pool.teamIds.includes(s.teamId)) issue(ctx, at('sides', k, 'teamId'), `${s.teamId} is not in pool ${g.poolId}`);
      });
      if (g.layout !== null) issue(ctx, at('layout'), 'a pool game has no bracket layout');
    } else {
      if (g.poolId !== null) issue(ctx, at('poolId'), 'a placement game has no pool');
      if (g.layout === null) issue(ctx, at('layout'), 'a placement game has a bracket layout');
      g.sides.forEach((s, k) => {
        if (s.source === null) {
          issue(ctx, at('sides', k, 'source'), 'a placement game side has a source');
          return;
        }
        const pool = pools.get(s.source.poolId);
        if (!pool) issue(ctx, at('sides', k, 'source', 'poolId'), `no pool ${s.source.poolId}`);
        else if (pool.divisionKey !== g.divisionKey) issue(ctx, at('sides', k, 'source', 'poolId'), `pool ${s.source.poolId} is not in division ${g.divisionKey}`);
        else if (s.source.place > pool.teamIds.length) issue(ctx, at('sides', k, 'source', 'place'), `pool ${s.source.poolId} has no place ${s.source.place}`);
      });
    }
    if (i > 0) {
      const p = f.games[i - 1];
      const order =
        p.startUtc.localeCompare(g.startUtc) ||
        (fieldNumber.get(p.fieldId) ?? 0) - (fieldNumber.get(g.fieldId) ?? 0) ||
        p.key - g.key;
      if (order > 0) issue(ctx, at('key'), 'games are in (startUtc, field number, key) order');
    }
  });
}

export const FestivalFileSchema = FestivalFileObject.superRefine(checkFestivalFile);

/**
 * The file's content without `fetchedAt`, keys sorted: two reads with the same key differ only in when they were
 * made, so scripts/fetch-festival.ts leaves the committed file in place and the refresh job has nothing to commit.
 * `sourceVersion` is content: a version bump that comes with new content commits with it.
 */
export function festivalContentKey(file: FestivalFile): string {
  return contentKey(file, ['fetchedAt']);
}

export type FestivalVenue = z.infer<typeof FestivalVenueSchema>;
export type FestivalTournament = z.infer<typeof FestivalTournamentSchema>;
export type FestivalField = z.infer<typeof FestivalFieldSchema>;
export type FestivalPool = z.infer<typeof FestivalPoolSchema>;
export type FestivalDivision = z.infer<typeof FestivalDivisionSchema>;
export type FestivalFormat = FestivalDivision['format'];
export type FestivalRecord = z.infer<typeof FestivalRecordSchema>;
export type FestivalTeam = z.infer<typeof FestivalTeamSchema>;
export type FestivalSource = z.infer<typeof FestivalSourceSchema>;
export type FestivalSide = z.infer<typeof FestivalSideSchema>;
export type FestivalGame = z.infer<typeof FestivalGameSchema>;
export type FestivalGameStatus = FestivalGame['status'];
export type FestivalFile = z.infer<typeof FestivalFileSchema>;
