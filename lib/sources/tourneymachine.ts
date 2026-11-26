/**
 * TourneyMachine's public JSON for the 2026 National Hockey Festival (DESIGN §35, DATA-SOURCES §1.16): the upstream
 * shape as far as we read it, the two endpoint URLs, and the pure normalization into data/field-hockey/festival.json
 * (lib/festival/festival-schema.ts). scripts/fetch-festival.ts does the HTTP; nothing here touches the network.
 *
 * The feed, as decoded on 2026-11-26 (one tournament, `TournamentResults.aspx?IDTournament=…&nofile=true`):
 *   - Divisions, pools and games share one integer sequence. DivisionDictionary, PoolDictionary and
 *     GameDictionary are keyed by that integer as a string ("1"); TeamDictionary and FacilityDictionary by hex.
 *     A team's and a pool's IDDivision is the integer; a division's own IDDivision is a hex GUID used only in its
 *     bracket page URL.
 *   - A bracket game's BT1S/BT2S name the source pool by its hex IDPool, not its integer key, and BT1SPP/BT2SPP
 *     the place in it as a string. BT*SGN/BT*SS ("winner of game n") are "0" throughout: every placement game is
 *     fed straight from pool places.
 *   - `S` is the venue's naive wall clock (Eastern; Naples, Fla.). S1/S2 are 0/0 before a result, so a score exists
 *     only when F (final) or I (scoring started) is set.
 *   - A pool's IDTeams is pre-sorted by TourneyMachine as results come in, and its public standings print it as
 *     given: that order is the pool's rank, except that teams level on points, wins, goal difference and goals for
 *     are listed alphabetically by raw name (Pool S, 2026-11-26: "Atlanta FHC U19" over "FHL", both 1-0-0, +1, 2
 *     goals; FHL led before Atlanta's win) until the event staff fill the placement sides. The feed carries no
 *     head-to-head, shoot-out or coin-toss result (regs D.2), so the view marks such teams tied (DESIGN §35.5).
 *   - Facilities all have Sort 0 and come in no useful order: fields are ordered by the number in their name.
 *   - TeamDictionary[*].Color is randomized on every request; it is dropped, or every run would commit.
 *
 * Build-only (tests/build-only-boundary.test.ts): app/ and components/ read the normalized file through
 * lib/festival/festival.ts.
 */

import { z } from 'zod';

import { displayTeamName, slugify, uniqueSlug, withoutAgeTokens } from '../festival/festival-names';
import { localToUtc, type FestivalDivision, type FestivalFile, type FestivalGame } from '../festival/festival-schema';

/** The 2026 National Hockey Festival: TourneyMachine's tournament id and USA Field Hockey's event page. */
export const FESTIVAL_TOURNAMENT_ID = 'h20260601141424398b290c0851f3e4c';
export const FESTIVAL_INFO_URL = 'https://www.usafieldhockey.com/events/2026/november/26/festival';

/** The venue's zone: the feed's times carry none (Paradise Coast Sports Complex, Naples, Fla.). */
export const FESTIVAL_TIME_ZONE = 'America/New_York';

const TM = 'https://tourneymachine.com';

/** The whole tournament as JSON (~275 KB; served from Cloudflare's cache, max-age 30). */
export function tournamentResultsUrl(id: string): string {
  return `${TM}/Public/Service/JSON/TournamentResults.aspx?IDTournament=${encodeURIComponent(id)}&nofile=true`;
}

/** A ~30-byte JSON string that changes whenever the tournament does: TourneyMachine's own web app polls it. */
export function lastUpdatedUrl(id: string): string {
  return `${TM}/Public/Service/JSON/TournamentResultsLastUpdated.aspx?IDTournament=${encodeURIComponent(id)}`;
}

/** The public results page a reader can open. */
export function publicResultsUrl(id: string): string {
  return `${TM}/Public/Results/Tournament.aspx?IDTournament=${encodeURIComponent(id)}`;
}

// ---------------------------------------------------------------- upstream shape

const TmDivisionSchema = z.looseObject({
  Name: z.string(),
  IDPools: z.array(z.number().int()),
  IDGames: z.array(z.number().int()),
  BracketWebPage: z.string().nullable().optional(),
});

const TmPoolSchema = z.looseObject({
  IDPool: z.string().min(1),
  IDDivision: z.number().int(),
  Name: z.string().min(1),
  IDTeams: z.array(z.string()),
});

const TmTeamSchema = z.looseObject({
  IDDivision: z.number().int(),
  Name: z.string().min(1),
  WinsPool: z.number().int(),
  LossesPool: z.number().int(),
  TiesPool: z.number().int(),
  PointsPool: z.number().int(),
  ScoreForPool: z.number().int(),
  ScoreAgainstPool: z.number().int(),
  ScoreDifferentialPool: z.number().int(),
});

const TmFacilitySchema = z.looseObject({ IDFacility: z.string().min(1), Name: z.string().min(1) });

const TmComplexSchema = z.looseObject({
  Name: z.string(),
  Address: z.string(),
  City: z.string(),
  State: z.string(),
  Zip: z.string(),
  Lat: z.number(),
  Long: z.number(),
});

const TmGameSchema = z.looseObject({
  GN: z.string().min(1),
  IDT1: z.string(),
  T1: z.string(),
  IDT2: z.string(),
  T2: z.string(),
  S: z.string(),
  IDF: z.string(),
  S1: z.number().int(),
  S2: z.number().int(),
  F: z.boolean(),
  I: z.boolean(),
  BR: z.boolean(),
  BT1S: z.string(),
  BT1SPP: z.string(),
  BT2S: z.string(),
  BT2SPP: z.string(),
  LP: z.number(),
  TP: z.number(),
  Team1Exhibition: z.boolean(),
  Team2Exhibition: z.boolean(),
});

export const TmTournamentSchema = z.looseObject({
  IDTournament: z.string().min(1),
  Name: z.string().min(1),
  StartDate: z.string(),
  EndDate: z.string(),
  IDDivisions: z.array(z.number().int()),
  IDComplexes: z.array(z.string()).min(1),
  DivisionDictionary: z.record(z.string(), TmDivisionSchema),
  PoolDictionary: z.record(z.string(), TmPoolSchema),
  TeamDictionary: z.record(z.string(), TmTeamSchema),
  ComplexDictionary: z.record(z.string(), TmComplexSchema),
  FacilityDictionary: z.record(z.string(), TmFacilitySchema),
  GameDictionary: z.record(z.string(), TmGameSchema),
});
export type TmTournament = z.infer<typeof TmTournamentSchema>;

/** TournamentResultsLastUpdated's body: a JSON string such as "v6_11/26/2026 3:13:00 PM", kept opaque. */
export function parseLastUpdated(body: string): string {
  return z.string().min(1).parse(JSON.parse(body));
}

/**
 * The instant a TournamentResultsLastUpdated value names, in ms: its clock is UTC (on 2026-11-26 the value read
 * '3:13:00 PM' at 15:13 UTC, when four scores posted). null when it does not look like 'v6_M/D/YYYY h:mm:ss AM'.
 * The space before AM/PM is a narrow no-break space (U+202F) in the live value, so any whitespace is accepted.
 */
export function versionInstant(version: string): number | null {
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*([AP]M)$/i.exec(version.trim());
  if (!m) return null;
  const hour = (Number(m[4]) % 12) + (m[7].toUpperCase() === 'PM' ? 12 : 0);
  return Date.UTC(Number(m[3]), Number(m[1]) - 1, Number(m[2]), hour, Number(m[5]), Number(m[6]));
}

/**
 * Seconds of slack between TourneyMachine's clock and Cloudflare's: a copy must be made more than this after the
 * version's instant to count as holding it.
 */
export const FEED_CLOCK_MARGIN_MS = 2_000;

/**
 * Whether a whole-feed response is newer than `version`: its Last-Modified (when Cloudflare's copy was made; the
 * feed is cached with max-age 30 and was seen served at age 82) is strictly after the version's instant, by more
 * than FEED_CLOCK_MARGIN_MS. Both are cut to the second, so a copy made earlier in the very second a score was
 * entered carries the same stamp as the version; read as current, it would be stored under the new
 * `sourceVersion` with the old content, and every later run's change check would skip until TourneyMachine changed
 * again (after a day's last score, never). The margin covers the two servers' clocks drifting apart. A false
 * "stale" costs one more read on the next run; a false "current" loses a score. Unknowable (no header, a version
 * of another shape) counts as current.
 */
export function feedIsCurrent(lastModified: string | null, version: string): boolean {
  const changed = versionInstant(version);
  const made = lastModified === null ? NaN : Date.parse(lastModified);
  return changed === null || Number.isNaN(made) || made > changed + FEED_CLOCK_MARGIN_MS;
}

// ---------------------------------------------------------------- pieces

/** '11/26/2026' → '2026-11-26'. */
export function tmDate(value: string): string {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (!m) throw new Error(`tourneymachine: not a M/D/YYYY date: ${value}`);
  return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

/** The offset from UTC of `zone` at a wall-clock time there ('2026-11-26T08:00:00' → '-05:00'). */
export function zoneOffset(local: string, zone: string): string {
  // Read the wall clock back at a guess of the instant; the difference is the offset (exact away from a DST switch,
  // and no game is scheduled in one).
  const guess = new Date(`${local}Z`);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(guess)
      .map((p) => [p.type, p.value]),
  );
  const wall = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  const minutes = Math.round((wall - guess.getTime()) / 60_000);
  const abs = Math.abs(minutes);
  return `${minutes < 0 ? '-' : '+'}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

/** What a division's slug, short label and display order are made of. */
interface DivisionFacts {
  key: number;
  name: string;
  /** The age in its name (U-14 → 14); null for an adult division. */
  age: number | null;
  format: FestivalDivision['format'];
  coed: boolean;
}

function divisionFacts(key: number, name: string): DivisionFacts {
  const age = /\bu-?(\d+)\b/i.exec(name);
  const format = /\b(\d+)\s*v\s*(\d+)\b/i.exec(name);
  if (!format || !['11v11', '7v7'].includes(`${format[1]}v${format[2]}`)) {
    throw new Error(`tourneymachine: division ${key} (${name}) names no 11v11 or 7v7 format`);
  }
  if (!age && !/\badult/i.test(name)) throw new Error(`tourneymachine: division ${key} (${name}) names no age group`);
  return {
    key,
    name,
    age: age ? Number(age[1]) : null,
    format: `${format[1]}v${format[2]}` as DivisionFacts['format'],
    coed: /\bco-?ed\b/i.test(name),
  };
}

/** A division's qualifier when its age group has more than one: Co-Ed, else the format. */
const qualifier = (d: DivisionFacts): { slug: string; label: string } =>
  d.coed ? { slug: 'coed', label: 'Co-Ed' } : { slug: d.format, label: d.format };

/** Display order: youngest first and adults last; within an age, Co-Ed, then 7v7, then 11v11. */
function byDivisionOrder(a: DivisionFacts, b: DivisionFacts): number {
  const rank = (d: DivisionFacts) => (d.coed ? 0 : d.format === '7v7' ? 1 : 2);
  return (a.age ?? Infinity) - (b.age ?? Infinity) || rank(a) - rank(b) || a.key - b.key;
}

/**
 * Each division's slug and short label, deterministically from the feed's names: 'u16' and 'U16' when the age group
 * has one division, 'u14-coed' / 'U14 Co-Ed', 'u14-7v7' / 'U14 7v7' and 'u14-11v11' / 'U14 11v11' when it has
 * several, 'adult' / 'Adult'. Returned in display order.
 */
export function divisionLabels(divisions: ReadonlyArray<{ key: number; name: string }>): Array<DivisionFacts & { slug: string; short: string }> {
  const facts = divisions.map((d) => divisionFacts(d.key, d.name)).sort(byDivisionOrder);
  const perAge = new Map<number | null, number>();
  for (const d of facts) perAge.set(d.age, (perAge.get(d.age) ?? 0) + 1);
  const taken = new Set<string>();
  return facts.map((d) => {
    const base = d.age === null ? 'adult' : `u${d.age}`;
    const shortBase = d.age === null ? 'Adult' : `U${d.age}`;
    const shared = (perAge.get(d.age) ?? 0) > 1;
    const q = qualifier(d);
    return {
      ...d,
      slug: uniqueSlug(shared ? `${base}-${q.slug}` : base, taken),
      short: shared ? `${shortBase} ${q.label}` : shortBase,
    };
  });
}

/** Numbers in a name compared as numbers: 'Field 2' before 'Field 10'. */
const naturalCompare = (a: string, b: string): number => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });

/** A field's number: the one its name ends with ('Field 7' → 7). */
function fieldNumber(name: string): number | null {
  const m = /(\d+)\s*$/.exec(name);
  return m ? Number(m[1]) : null;
}

/**
 * Bracket columns from TourneyMachine's drawing: the left offsets of the game boxes (LP) clustered into columns,
 * left to right (the feed jitters a column by a few pixels: 330 and 335), and each game's row its rank by top
 * offset (TP) within its column. Boxes are 200 px wide, so offsets closer than 100 px are one column.
 */
export function bracketLayout(games: ReadonlyArray<{ key: number; lp: number; tp: number }>): Map<number, { column: number; row: number }> {
  const lefts = [...new Set(games.map((g) => g.lp))].sort((a, b) => a - b);
  const columnOf = new Map<number, number>();
  let column = -1;
  let previous = -Infinity;
  for (const lp of lefts) {
    if (lp - previous >= 100) column += 1;
    columnOf.set(lp, column);
    previous = lp;
  }
  const out = new Map<number, { column: number; row: number }>();
  const byColumn = new Map<number, Array<{ key: number; tp: number }>>();
  for (const g of games) {
    const c = columnOf.get(g.lp)!;
    byColumn.set(c, [...(byColumn.get(c) ?? []), g]);
  }
  for (const [c, list] of byColumn) {
    list.sort((a, b) => a.tp - b.tp || a.key - b.key).forEach((g, row) => out.set(g.key, { column: c, row }));
  }
  return out;
}

// ---------------------------------------------------------------- the file

export interface NormalizeOptions {
  /** When the feed was read (ISO UTC). */
  fetchedAt: string;
  /** TournamentResultsLastUpdated's value when it was read. */
  sourceVersion: string;
  /** USA Field Hockey's event page (FESTIVAL_INFO_URL). */
  infoUrl?: string;
}

/**
 * The feed (`TournamentResults.aspx` JSON, parsed) as data/field-hockey/festival.json's shape. Pure; throws a
 * `tourneymachine: …` error on a feed it cannot read faithfully (a game whose teams are in no one pool, a placement
 * game not fed from pool places), so a refresh fails and the committed file stays as it was rather than carrying a
 * guess. The result is not yet held to FestivalFileSchema: the caller validates it.
 */
export function normalizeFestival(raw: unknown, opts: NormalizeOptions): FestivalFile {
  const tm = TmTournamentSchema.parse(raw);
  const fail = (message: string): never => {
    throw new Error(`tourneymachine: ${message}`);
  };

  const complex = tm.ComplexDictionary[tm.IDComplexes[0]] ?? fail(`complex ${tm.IDComplexes[0]} is not in ComplexDictionary`);

  const fields = Object.values(tm.FacilityDictionary)
    .map((f) => ({ id: f.IDFacility, name: f.Name.trim(), number: fieldNumber(f.Name) ?? fail(`field ${f.Name} has no number`) }))
    .sort((a, b) => a.number - b.number || naturalCompare(a.name, b.name));
  const fieldById = new Map(fields.map((f) => [f.id, f]));

  const divisionOf = (key: number) => tm.DivisionDictionary[String(key)] ?? fail(`division ${key} is not in DivisionDictionary`);
  const labels = divisionLabels(tm.IDDivisions.map((key) => ({ key, name: divisionOf(key).Name.trim() })));
  const slugOf = new Map(labels.map((d) => [d.key, d.slug]));

  // Pools by integer key and by the hex IDPool the bracket sources use; each team's pool from pool membership
  // (TeamDictionary carries no pool).
  const poolByHex = new Map<string, { id: string; divisionKey: number; name: string; teamIds: string[] }>();
  const poolOfTeam = new Map<string, string>();
  const divisions: FestivalDivision[] = labels.map((d) => {
    const dv = divisionOf(d.key);
    const pools = dv.IDPools.map((pk) => {
      const p = tm.PoolDictionary[String(pk)] ?? fail(`pool ${pk} is not in PoolDictionary`);
      if (p.IDDivision !== d.key) fail(`pool ${p.Name} is listed by division ${d.key} but names division ${p.IDDivision}`);
      for (const teamId of p.IDTeams) {
        if (!tm.TeamDictionary[teamId]) fail(`${p.Name} lists team ${teamId}, which is not in TeamDictionary`);
        if (poolOfTeam.has(teamId)) fail(`team ${teamId} is in two pools`);
        poolOfTeam.set(teamId, p.IDPool);
      }
      const pool = { id: p.IDPool, divisionKey: d.key, name: p.Name.trim(), teamIds: [...p.IDTeams] };
      poolByHex.set(p.IDPool, pool);
      return pool;
    }).sort((a, b) => naturalCompare(a.name, b.name));
    return {
      key: d.key,
      slug: d.slug,
      name: d.name,
      short: d.short,
      format: d.format,
      bracketUrl: dv.BracketWebPage && dv.BracketWebPage.startsWith('https://') ? dv.BracketWebPage : null,
      pools: pools.map(({ id, name, teamIds }) => ({ id, name, teamIds })),
    };
  });
  const divisionRank = new Map(divisions.map((d, i) => [d.key, i]));

  // Team slugs: division slug + the name without age tokens; a collision takes -2, -3 … in team id order.
  const takenSlugs = new Set<string>();
  const teams = Object.entries(tm.TeamDictionary)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([id, t]) => {
      const divisionSlug = slugOf.get(t.IDDivision) ?? fail(`team ${t.Name} names division ${t.IDDivision}, which is not in IDDivisions`);
      const poolId = poolOfTeam.get(id) ?? fail(`team ${t.Name} (${id}) is in no pool`);
      if (poolByHex.get(poolId)!.divisionKey !== t.IDDivision) fail(`team ${t.Name} is in a pool of another division`);
      const words = slugify(withoutAgeTokens(t.Name)) || slugify(t.Name) || 'team';
      return {
        id,
        slug: uniqueSlug(`${divisionSlug}-${words}`, takenSlugs),
        name: displayTeamName(t.Name),
        divisionKey: t.IDDivision,
        poolId,
        record: {
          w: t.WinsPool,
          l: t.LossesPool,
          t: t.TiesPool,
          pts: t.PointsPool,
          gf: t.ScoreForPool,
          ga: t.ScoreAgainstPool,
          gd: t.ScoreDifferentialPool,
        },
      };
    })
    // A–Z within a division by the name a reader scans for ('U14 Gateway White' under G).
    .sort(
      (a, b) =>
        divisionRank.get(a.divisionKey)! - divisionRank.get(b.divisionKey)! ||
        naturalCompare(withoutAgeTokens(a.name), withoutAgeTokens(b.name)) ||
        naturalCompare(a.name, b.name) ||
        (a.id < b.id ? -1 : 1),
    );

  // A game's division: the division whose IDGames lists it (each game is in exactly one).
  const divisionOfGame = new Map<number, number>();
  for (const d of labels) {
    for (const gk of divisionOf(d.key).IDGames) {
      // A listed game the dictionary lacks is a partial response: refuse it rather than publish a schedule with the
      // game silently missing under a version the next run would then skip.
      if (!tm.GameDictionary[String(gk)]) fail(`game ${gk} is listed by division ${d.key} but is not in GameDictionary`);
      if (divisionOfGame.has(gk)) fail(`game ${gk} is listed by two divisions`);
      divisionOfGame.set(gk, d.key);
    }
  }

  const startDate = tmDate(tm.StartDate);
  const utcOffset = zoneOffset(`${startDate}T12:00:00`, FESTIVAL_TIME_ZONE);

  const entries = Object.entries(tm.GameDictionary).map(([k, g]) => {
    const key = Number(k);
    if (!Number.isInteger(key)) fail(`game key ${k} is not an integer`);
    return { key, g };
  });
  const layouts = new Map<number, Map<number, { column: number; row: number }>>();
  for (const d of labels) {
    const placement = entries.filter((e) => e.g.BR && divisionOfGame.get(e.key) === d.key);
    layouts.set(d.key, bracketLayout(placement.map((e) => ({ key: e.key, lp: e.g.LP, tp: e.g.TP }))));
  }

  const games: FestivalGame[] = entries.map(({ key, g }) => {
    const divisionKey = divisionOfGame.get(key) ?? fail(`game ${key} (${g.GN}) is in no division's IDGames`);
    const where = `game ${key} (${g.GN})`;
    const start = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(g.S) ? g.S : fail(`${where} starts at ${g.S}`);
    if (zoneOffset(start, FESTIVAL_TIME_ZONE) !== utcOffset) fail(`${where} is not at the tournament's UTC offset ${utcOffset}`);
    if (!fieldById.has(g.IDF)) fail(`${where} is on field ${g.IDF}, which is not in FacilityDictionary`);
    const status: FestivalGame['status'] = g.F ? 'final' : g.I ? 'live' : 'scheduled';
    const common = {
      key,
      number: g.GN.trim(),
      divisionKey,
      start,
      startUtc: localToUtc(start, utcOffset),
      fieldId: g.IDF,
      score: g.F || g.I ? ([g.S1, g.S2] as [number, number]) : null,
      status,
      exhibition: g.Team1Exhibition || g.Team2Exhibition,
    };
    const team = (id: string) => (id === '' ? null : id);
    if (!g.BR) {
      const [a, b] = [team(g.IDT1), team(g.IDT2)];
      const poolId = a && b ? poolOfTeam.get(a) : undefined;
      if (!a || !b || !poolId || poolOfTeam.get(b) !== poolId) fail(`${where} is not between two teams of one pool`);
      return {
        ...common,
        poolId: poolId!,
        kind: 'pool' as const,
        sides: [
          { teamId: a, label: displayTeamName(g.T1), source: null },
          { teamId: b, label: displayTeamName(g.T2), source: null },
        ] as FestivalGame['sides'],
        layout: null,
      };
    }
    const source = (pool: string, place: string) => {
      const p = poolByHex.get(pool);
      const n = Number(place);
      if (!p || !Number.isInteger(n) || n < 1) fail(`${where} is not fed from a pool place (${pool || '-'} ${place})`);
      return { poolId: pool, place: n };
    };
    return {
      ...common,
      poolId: null,
      kind: 'placement' as const,
      sides: [
        { teamId: team(g.IDT1), label: displayTeamName(g.T1), source: source(g.BT1S, g.BT1SPP) },
        { teamId: team(g.IDT2), label: displayTeamName(g.T2), source: source(g.BT2S, g.BT2SPP) },
      ] as FestivalGame['sides'],
      layout: layouts.get(divisionKey)!.get(key)!,
    };
  });
  games.sort(
    (a, b) =>
      a.startUtc.localeCompare(b.startUtc) || fieldById.get(a.fieldId)!.number - fieldById.get(b.fieldId)!.number || a.key - b.key,
  );

  return {
    fetchedAt: opts.fetchedAt,
    sourceVersion: opts.sourceVersion,
    tournament: {
      id: tm.IDTournament,
      name: tm.Name.trim(),
      startDate,
      endDate: tmDate(tm.EndDate),
      timeZone: FESTIVAL_TIME_ZONE,
      utcOffset,
      venue: {
        name: complex.Name.trim(),
        address: complex.Address.trim(),
        city: complex.City.trim(),
        state: complex.State.trim(),
        zip: complex.Zip.trim(),
        lat: complex.Lat,
        lng: complex.Long,
      },
      resultsUrl: publicResultsUrl(tm.IDTournament),
      infoUrl: opts.infoUrl ?? FESTIVAL_INFO_URL,
    },
    fields,
    divisions,
    teams,
    games,
  };
}

/** How many games the file has and how many are final: the refresh's commit message and log line. */
export function festivalCounts(file: Pick<FestivalFile, 'games'>): { games: number; finals: number } {
  return { games: file.games.length, finals: file.games.filter((g) => g.status === 'final').length };
}
