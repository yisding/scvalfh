/**
 * SECONDARY source: SBLive / Scorebook Live, now hosted at si.com/high-school/stats (SPEC §1.2).
 *
 * Role: a SCORE CROSS-CHECK against MaxPreps (lib/crosscheck.ts) and, under owner decision D2's
 * mechanical rules only, a BACKFILL for a missing or clearly wrong MaxPreps score (lib/backfill.ts,
 * SPEC §7.9). Three things are never taken from here, because they are demonstrably wrong for 2026-27:
 *   - division membership (its "De Anza" bucket holds 5 teams, two of them El Camino)
 *   - `standing.leagueRecord`
 *   - `gameTypeLabel` (league vs non-league)
 *
 * Identity is ID-FIRST (SPEC §7.9, `resolveSbliveSide`): a si.com side resolves by its si.com team id
 * (web path, raw id or team-logo URL), then by its si.com school id (school-logo URL), and only then by
 * name — and never by name for the statewide namesakes (University, Los Altos, Santa Clara).
 *
 * Extraction facts, all corrected against the live payloads (SPEC §1.2):
 *   - scorebooklive.com 301s to si.com. Redirects MUST be followed or a ~200-byte stub is parsed
 *     as if it were the page.
 *   - the props live in `data-react-props="…"`, HTML-entity-escaped.
 *   - the decoded object's top level is `{query, variables, application}` — there is NO `props` key.
 *   - the statewide scoreboard path is `query.scoreboardDate.games.nodes[]`, one level deeper than
 *     the original claim.
 *   - a Chrome-like User-Agent is required; the polite UA gets 403.
 */

import { z } from 'zod';

import { localDateKey } from '../format';
import { DATA_QUALITY, LEAGUES } from '../leagues';
import { TEAMS, isWithdrawnSchool, normalizeTeamKey, resolveTeam, sideJoinKey } from '../teams';
import type { Team, TeamSlug } from '../types';
import { CHROME_USER_AGENT, type HttpClientOptions, htmlUnescape } from './http';

export const SBLIVE_WEB = 'https://www.si.com/high-school/stats/california/field-hockey';
export const SBLIVE_HOST = 'https://www.si.com';

export function sbliveTeamGamesUrl(sbliveSlug: string): string {
  return `${SBLIVE_WEB}/teams/${sbliveSlug}/games`;
}

/** The statewide daily scoreboard. `date` is YYYY-MM-DD. */
export function sbliveScoresUrl(date: string): string {
  return `${SBLIVE_WEB}/scores?date=${date}`;
}

/**
 * A si.com game page URL from a payload's `webPath`, or null when the path is not a plain URL path
 * (whitespace, a scheme, a query, anything outside RFC 3986's unreserved set plus `%` and `/`). The result
 * always passes the snapshot schema's httpUrl, so one malformed upstream row can never fail a run.
 */
export function sbliveGameUrl(webPath: string | null | undefined): string | null {
  if (!webPath || !/^\/[A-Za-z0-9._~%/-]+$/.test(webPath)) return null;
  return `${SBLIVE_HOST}/high-school/stats${webPath}`;
}

/** A si.com game id as published in `sblive:<id>` contest ids: digits only, else null. */
export function sbliveGameIdOf(id: unknown): string | null {
  const s = String(id ?? '').trim();
  return /^\d+$/.test(s) ? s : null;
}

/** Called once per payload row a parser had to drop (a non-numeric game id). */
export type SbliveParseWarn = (message: string) => void;

/** A si.com league standings page: the page `parseStandingsTeamRefs` harvests team web paths from. */
export function sbliveLeagueStandingsUrl(leagueSlug: string): string {
  return `${SBLIVE_WEB}/leagues/${leagueSlug}/standings`;
}

/**
 * si.com league standings slugs, from config (`LEAGUES[].sblive.leagueSlugs`) — used ONLY to harvest
 * team web paths, never for membership. The harvest (`sbliveLeagueStandingsUrl`, then
 * `parseStandingsTeamRefs` and `harvestTeamWebPaths`) is a manual research path for recovering
 * registry team ids: the cron never runs it (DATA-SOURCES §5.3).
 */
export const SBLIVE_LEAGUE_SLUGS: readonly string[] = LEAGUES.flatMap((l) => l.sblive.leagueSlugs);

/**
 * The HTTP options every si.com request uses (LiveTransport). A Chrome-like UA is
 * required — si.com 403s a non-browser agent (SPEC §1.2) — and the requests are spaced and serial:
 * a run reads at most ~23 si.com pages (SPEC §7.7).
 */
export const SBLIVE_HTTP_OPTIONS: Readonly<HttpClientOptions> = Object.freeze({
  userAgent: CHROME_USER_AGENT,
  concurrency: 1,
  spacingMs: 1000,
});

// ---------------------------------------------------------------- props extraction

export interface ReactPropsBlock {
  className: string;
  props: unknown;
}

const CLASS_ATTR = 'data-react-class="';
const PROPS_ATTR = 'data-react-props="';

/** Every index of `needle` in `hay`, ascending (one linear pass). */
function allIndexes(hay: string, needle: string): number[] {
  const out: number[] = [];
  for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + needle.length)) out.push(i);
  return out;
}

/** The first value of a sorted array that is >= `min`, or -1. */
function firstAtOrAfter(sorted: readonly number[], min: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < min) lo = mid + 1;
    else hi = mid;
  }
  return lo < sorted.length ? sorted[lo] : -1;
}

/**
 * The `[className, rawProps]` pairs `/data-react-class="([^"]+)"[^>]*?data-react-props="([^"]*)"/g` would
 * capture, found in O(n log n): the regex rescans to the next `>` from every class attribute, which is
 * quadratic on a page of class attributes without props or without a closing `>`.
 */
export function reactPropsPairs(html: string): Array<[string, string]> {
  const quotes = allIndexes(html, '"');
  const gts = allIndexes(html, '>');
  const props = allIndexes(html, PROPS_ATTR);
  const out: Array<[string, string]> = [];
  let from = 0;
  for (;;) {
    const p = html.indexOf(CLASS_ATTR, from);
    if (p < 0) return out;
    from = p + 1;
    const classStart = p + CLASS_ATTR.length;
    const classEnd = firstAtOrAfter(quotes, classStart);
    if (classEnd <= classStart) continue; // `[^"]+`: at least one character, then the closing quote
    const marker = firstAtOrAfter(props, classEnd + 1);
    if (marker < 0) continue;
    const gt = firstAtOrAfter(gts, classEnd + 1);
    if (gt >= 0 && gt < marker) continue; // `[^>]*?` never crosses the end of the tag
    const valueStart = marker + PROPS_ATTR.length;
    const valueEnd = firstAtOrAfter(quotes, valueStart);
    if (valueEnd < 0) continue;
    out.push([html.slice(classStart, classEnd), html.slice(valueStart, valueEnd)]);
    from = valueEnd + 1;
  }
}

/**
 * `JSON.parse` of a prefix, the way Python's `JSONDecoder.raw_decode` works: parse the first
 * complete JSON value and ignore whatever follows. The attribute capture is normally exact, so
 * this only matters if a payload ever carries an escaped quote the capture cannot see past.
 */
export function parseJsonPrefix(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    // Walk the string tracking string-literal state and brace/bracket depth.
    const open = trimmed[0];
    if (open !== '{' && open !== '[') throw new Error('not a JSON object or array');
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = 0; i < trimmed.length; i += 1) {
      const ch = trimmed[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '{' || ch === '[') depth += 1;
      else if (ch === '}' || ch === ']') {
        depth -= 1;
        if (depth === 0) return JSON.parse(trimmed.slice(0, i + 1)) as unknown;
      }
    }
    throw new Error('unterminated JSON value in data-react-props');
  }
}

/** Every `data-react-class` / `data-react-props` pair on the page, decoded. */
export function extractReactProps(html: string, className?: string): ReactPropsBlock[] {
  const out: ReactPropsBlock[] = [];
  for (const [name, raw] of reactPropsPairs(html)) {
    if (className && name !== className) continue;
    out.push({ className: name, props: parseJsonPrefix(htmlUnescape(raw)) });
  }
  return out;
}

export class SbliveError extends Error {
  constructor(message: string, readonly url: string) {
    super(message);
    this.name = 'SbliveError';
  }
}

function requireBlock(html: string, className: string, url: string): unknown {
  const blocks = extractReactProps(html, className);
  if (blocks.length === 0) {
    const seen = extractReactProps(html).map((b) => b.className);
    throw new SbliveError(
      `no data-react-props for "${className}" (saw: ${seen.join(', ') || 'none'})`,
      url,
    );
  }
  return blocks[0].props;
}

// ---------------------------------------------------------------- schemas

/** Permissive about unknown fields, strict about ours — same rule as the MaxPreps client. */
const teamRef = z.looseObject({
  id: z.union([z.string(), z.number()]).optional(),
  name: z.string(),
  webPath: z.string().nullable().optional(),
  /** Logo URL: `/uploads/production/school/{schoolId}/…` or `/uploads/production/team/{teamId}-v3/…`. */
  image: z.string().nullable().optional(),
});

const teamGameNode = z.looseObject({
  id: z.union([z.string(), z.number()]),
  /** ISO WITH offset, e.g. "2026-09-23T16:00:00.000-07:00" — better than MaxPreps' naive local. */
  date: z.string(),
  statusId: z.number().nullable().optional(),
  shortStatusText: z.string().nullable().optional(),
  longStatusText: z.string().nullable().optional(),
  gameTypeLabel: z.string().nullable().optional(),
  locationText: z.string().nullable().optional(),
  webPath: z.string().nullable().optional(),
  titleText: z.string().nullable().optional(),
  featured: z.looseObject({
    isHome: z.boolean().nullable().optional(),
    locationDescriptor: z.string().nullable().optional(),
    result: z.string().nullable().optional(),
    scoreText: z.string().nullable().optional(),
    team: teamRef.optional(),
  }),
  opponent: z.looseObject({
    isHome: z.boolean().nullable().optional(),
    scoreText: z.string().nullable().optional(),
    team: teamRef,
  }),
});

export const TeamGamesPropsSchema = z.looseObject({
  query: z.looseObject({
    team: z.looseObject({
      id: z.union([z.string(), z.number()]).optional(),
      name: z.string().optional(),
      webPath: z.string().nullable().optional(),
      image: z.string().nullable().optional(),
      games: z.looseObject({ nodes: z.array(teamGameNode) }),
    }),
  }),
});

const scoreboardGameTeam = z.looseObject({
  scoreText: z.string().nullable().optional(),
  isWinner: z.boolean().nullable().optional(),
  isLoser: z.boolean().nullable().optional(),
  isTbd: z.boolean().nullable().optional(),
  team: teamRef,
});

export const ScoreboardPropsSchema = z.looseObject({
  query: z.looseObject({
    scoreboardDate: z.looseObject({
      date: z.string(),
      games: z.looseObject({
        totalCount: z.number().nullable().optional(),
        /** si.com serves the first 24 games of a day in the page; the rest load in the browser (see parseScoresPage). */
        pageInfo: z
          .looseObject({ hasNextPage: z.boolean().nullable().optional(), endCursor: z.string().nullable().optional() })
          .nullable()
          .optional(),
        nodes: z.array(
          z.looseObject({
            id: z.union([z.string(), z.number()]),
            date: z.string(),
            statusId: z.number().nullable().optional(),
            longStatusText: z.string().nullable().optional(),
            titleText: z.string().nullable().optional(),
            webPath: z.string().nullable().optional(),
            gameTeams: z.array(scoreboardGameTeam),
          }),
        ),
      }),
    }),
  }),
});

export const StandingsPropsSchema = z.looseObject({
  query: z.looseObject({
    organization: z.looseObject({
      teamStandings: z.array(z.looseObject({ team: teamRef })),
    }),
  }),
});

// ---------------------------------------------------------------- normalized shape

export interface SbliveSide {
  /** si.com's display name, verbatim. */
  name: string;
  /** Numeric si.com TEAM id when the payload exposes one (web path, raw id or team-logo URL). */
  sbliveTeamId: string | null;
  /** Numeric si.com SCHOOL id from a school-logo URL, when present. */
  sbliveSchoolId?: string | null;
  /** Our slug (resolveSbliveSide); null for a school that is not one of our teams or cannot be told apart. */
  slug: TeamSlug | null;
  /** How `slug` was resolved. D2 backfill accepts only 'team-id' and 'school-id' (SPEC §7.9). */
  via: SbliveResolution['via'];
  /** Why the side did not resolve, when it did not. */
  refused?: SbliveResolution['refused'];
  score: number | null;
}

export interface SbliveGame {
  sbliveGameId: string;
  /** ISO with offset, exactly as si.com published it. */
  dateIso: string;
  /** YYYY-MM-DD in America/Los_Angeles. */
  dateKey: string;
  /** UNORDERED pair, sorted so the join key is stable; home/away is never taken from here. */
  sides: [SbliveSide, SbliveSide];
  /** statusId 3 === final (`shortStatusText` "F"). */
  isFinal: boolean;
  /** true only when BOTH sides carry a number. */
  isScored: boolean;
  url: string | null;
  /** Kept for the log only. NEVER used to decide isLeague (SPEC §1.2 caveat 2). */
  gameTypeLabel: string | null;
  origin: 'team-games' | 'scoreboard';
}

function toScore(text: string | null | undefined): number | null {
  if (text === null || text === undefined) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/** `/california/field-hockey/teams/458850-los-altos-eagles` → `458850`. */
export function sbliveIdFromWebPath(webPath: string | null | undefined): string | null {
  if (!webPath) return null;
  const m = /\/teams\/(\d+)-/.exec(webPath);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------- id-first identity (SPEC §7.9)

/**
 * `normalizeTeamKey` values that more than one California si.com team uses (University: Irvine and
 * San Francisco; Los Altos: Hacienda Heights and Los Altos; Santa Clara: Oxnard and Santa Clara;
 * Davis: 458605 Davis of Davis and 458828 Davis of Modesto). si.com's team search for the other EAL
 * names (Bella Vista, Chico, Corning, Lassen, Pleasant Valley) found one team of that name each (Chico
 * and Corning also list fuzzy matches under other names), checked 2026-10-04.
 *
 * The same search (`/high-school/stats/california/field-hockey/teams?name=…`, browser User-Agent, one
 * request at a time at least 600 ms apart) was run on 2026-10-06 for the 50 Southern California
 * names, plus the spellings Southwest SD, Mt Carmel, Bishops, Canyon Crest, San Dieguito, LJCD and
 * RBV (tests/fixtures/seeds/registry-seed-ss.json and registry-seed-sds.json,
 * sbliveIdentity.nameSearch). Seven names have a second California team on si.com, so they joined
 * the list:
 *   - Westview: ours is 458949 (San Diego); 464882 is the Westview Wildcats of West Los Angeles, which
 *     si.com shows playing Sage Creek on Sep 30 and Oct 28.
 *   - Del Norte: ours is 458937 (San Diego); 458609 is Crescent City's (the MaxPreps ghost in
 *     DATA_QUALITY.ghostTeamIds), which si.com shows playing Tamalpais and Davis on Oct 16.
 *   - Marina: ours is 458748 (Huntington Beach); 500865 is Marina's own (Monterey County, no games).
 *   - San Marcos: ours is 459066; 459073 is Santa Barbara's.
 *   - Mission Vista: ours is 464852 (Oceanside, with the games); 480754 is a second entry located
 *     "Vista, CA" whose games page serves si.com's index.
 *   - Granite Hills: ours is 458713 (El Cajon); 554634 (Porterville) and 458466 (Apple Valley).
 *   - Southwest: 583246 is El Centro's (no games); si.com names ours "Southwest SD" (459138), which
 *     still resolves by name.
 * Every other name returned one team of that name (some also list fuzzy matches under other names,
 * e.g. Bonita Vista for Bonita and Claremont for Clairemont, which are different keys).
 *
 * A side with one of these names resolves ONLY by a si.com id, never by name.
 */
export const STATEWIDE_AMBIGUOUS: ReadonlySet<string> = new Set(
  [
    'University', 'Los Altos', 'Santa Clara', 'Davis',
    'Westview', 'Del Norte', 'Marina', 'San Marcos', 'Mission Vista', 'Granite Hills', 'Southwest',
  ].map(normalizeTeamKey),
);

/** Everything si.com exposes about one side of a game or one standings row. */
export interface SbliveSideRef {
  name: string | null;
  webPath?: string | null;
  rawId?: string | number | null;
  image?: string | null;
}

export interface SbliveResolution {
  slug: TeamSlug | null;
  via: 'team-id' | 'school-id' | 'name' | null;
  refused?: 'ignored-team' | 'ambiguous-name' | 'id-contradicts-name' | 'unknown';
}

/**
 * teamId: `/teams/(\d+)-` on webPath, else rawId, else `/uploads/production/team/(\d+)-v\d+/` on image.
 * schoolId: `/uploads/production/school/(\d+)/` on image.
 */
export function sbliveIdsFrom(ref: SbliveSideRef): { teamId: string | null; schoolId: string | null } {
  const raw = ref.rawId === null || ref.rawId === undefined ? '' : String(ref.rawId).trim();
  const teamId =
    sbliveIdFromWebPath(ref.webPath) ??
    (raw ? raw : null) ??
    (ref.image ? (/\/uploads\/production\/team\/(\d+)-v\d+\//.exec(ref.image)?.[1] ?? null) : null);
  const schoolId = ref.image ? (/\/uploads\/production\/school\/(\d+)\//.exec(ref.image)?.[1] ?? null) : null;
  return { teamId, schoolId };
}

/** Reverse indexes over Team.external.sbliveTeamId / sbliveSchoolId. */
const BY_SBLIVE_TEAM_ID = new Map<string, Team>();
const BY_SBLIVE_SCHOOL_ID = new Map<string, Team>();
for (const t of TEAMS) {
  if (t.external.sbliveTeamId) BY_SBLIVE_TEAM_ID.set(t.external.sbliveTeamId, t);
  if (t.external.sbliveSchoolId) BY_SBLIVE_SCHOOL_ID.set(t.external.sbliveSchoolId, t);
}

function isIgnoredSbliveTeamId(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(DATA_QUALITY.sbliveIgnoredTeamIds, id);
}

/**
 * Resolve one si.com side to a registry team, id first (SPEC §7.9, steps 0-6):
 *   0. teamId ∈ DATA_QUALITY.sbliveIgnoredTeamIds                 → null, 'ignored-team'
 *   1. teamId === some Team.external.sbliveTeamId                 → that team, via 'team-id'
 *   2. schoolId === some Team.external.sbliveSchoolId             → that team, via 'school-id'
 *   3. normalizeTeamKey(name) ∈ STATEWIDE_AMBIGUOUS               → null, 'ambiguous-name'
 *   4. resolveTeam(name) hit whose recorded si.com id contradicts a PRESENT id → null, 'id-contradicts-name'
 *   5. resolveTeam(name) hit                                      → that team, via 'name'
 *   6. null, 'unknown'
 */
export function resolveSbliveSide(ref: SbliveSideRef): SbliveResolution {
  const { teamId, schoolId } = sbliveIdsFrom(ref);
  if (teamId && isIgnoredSbliveTeamId(teamId)) return { slug: null, via: null, refused: 'ignored-team' };
  const byTeam = teamId ? BY_SBLIVE_TEAM_ID.get(teamId) : undefined;
  if (byTeam) return { slug: byTeam.slug, via: 'team-id' };
  const bySchool = schoolId ? BY_SBLIVE_SCHOOL_ID.get(schoolId) : undefined;
  if (bySchool) return { slug: bySchool.slug, via: 'school-id' };
  const name = ref.name?.trim() ?? '';
  if (!name) return { slug: null, via: null, refused: 'unknown' };
  if (STATEWIDE_AMBIGUOUS.has(normalizeTeamKey(name))) return { slug: null, via: null, refused: 'ambiguous-name' };
  const byName = resolveTeam(name);
  if (!byName) return { slug: null, via: null, refused: 'unknown' };
  const recordedTeam = byName.external.sbliveTeamId;
  const recordedSchool = byName.external.sbliveSchoolId;
  if ((teamId && recordedTeam && teamId !== recordedTeam) || (schoolId && recordedSchool && schoolId !== recordedSchool)) {
    return { slug: null, via: null, refused: 'id-contradicts-name' };
  }
  return { slug: byName.slug, via: 'name' };
}

function makeSide(ref: SbliveSideRef & { name: string }, score: number | null): SbliveSide {
  const { teamId, schoolId } = sbliveIdsFrom(ref);
  const r = resolveSbliveSide(ref);
  return {
    name: ref.name,
    sbliveTeamId: teamId,
    sbliveSchoolId: schoolId,
    slug: r.slug,
    via: r.via,
    ...(r.refused ? { refused: r.refused } : {}),
    score,
  };
}

/** Sorted so `pairKey` is order-independent. */
function orderSides(a: SbliveSide, b: SbliveSide): [SbliveSide, SbliveSide] {
  const ka = a.slug ?? a.name.toLowerCase();
  const kb = b.slug ?? b.name.toLowerCase();
  return ka <= kb ? [a, b] : [b, a];
}

/** The unordered-pair half of the cross-check join key (SPEC §5.7). */
export function sblivePairKey(sides: readonly SbliveSide[]): string {
  return sides.map(sideJoinKey).sort().join('~');
}

export function sbliveGameKey(game: Pick<SbliveGame, 'dateKey' | 'sides'>): string {
  return `${game.dateKey}|${sblivePairKey(game.sides)}`;
}

// ---------------------------------------------------------------- parsers

/** Parse a team `/games` page. Featured side is the team whose page it is. */
export function parseTeamGamesPage(html: string, url = sbliveTeamGamesUrl(''), warn?: SbliveParseWarn): SbliveGame[] {
  const props = TeamGamesPropsSchema.parse(requireBlock(html, 'teams/Games', url));
  const team = props.query.team;
  const out: SbliveGame[] = [];
  for (const node of team.games.nodes) {
    const featuredName = node.featured.team?.name ?? team.name ?? null;
    if (!featuredName) continue;
    const gameId = sbliveGameIdOf(node.id);
    if (gameId === null) {
      warn?.(`si.com row with a non-numeric game id ${JSON.stringify(String(node.id))} ignored (${url})`);
      continue;
    }
    const mine = makeSide(
      {
        name: featuredName,
        webPath: node.featured.team?.webPath ?? team.webPath ?? null,
        rawId: node.featured.team?.id ?? team.id,
        image: node.featured.team?.image ?? team.image ?? null,
      },
      toScore(node.featured.scoreText),
    );
    const theirs = makeSide(
      {
        name: node.opponent.team.name,
        webPath: node.opponent.team.webPath,
        rawId: node.opponent.team.id,
        image: node.opponent.team.image,
      },
      toScore(node.opponent.scoreText),
    );
    const sides = orderSides(mine, theirs);
    out.push({
      sbliveGameId: gameId,
      dateIso: node.date,
      dateKey: localDateKey(node.date),
      sides,
      isFinal: node.statusId === 3,
      isScored: sides[0].score !== null && sides[1].score !== null,
      url: sbliveGameUrl(node.webPath),
      gameTypeLabel: node.gameTypeLabel ?? null,
      origin: 'team-games',
    });
  }
  return out;
}

/**
 * Parse the statewide `?date=` scoreboard. Its `gameTeams[]` carry a name, a score and a logo URL
 * but no webPath and no isHome, which is exactly why the cross-check joins on an UNORDERED pair and
 * why identity comes from the logo URL's si.com team or school id (SPEC §7.9).
 */
export function parseScoresPage(html: string, url = sbliveScoresUrl(''), warn?: SbliveParseWarn): SbliveGame[] {
  const props = ScoreboardPropsSchema.parse(requireBlock(html, 'games/GenderSportIndex', url));
  const games = props.query.scoreboardDate.games;
  // Pagination (checked 2026-10-06): the page server-renders the day's first 24 games
  // (`pageInfo: { endCursor: 'MjQ', hasNextPage: true }`, totalCount 29 that day) and the browser loads
  // the rest through si.com's own GraphQL client. The URL takes no page or cursor parameter (`&after=`,
  // `&page=2` and `&cursor=` all return the same first 24), so a later page cannot be read from here.
  // With the Southern California teams a busy day passes 24, so a truncated day is said, never silently
  // taken for the whole day: it only lowers coverage (an uncovered game is planned for a team page, or
  // waits for a later run; lib/backfill.ts scoreboardCoverage is positive-only), never a conclusion.
  const total = games.totalCount ?? null;
  if (games.pageInfo?.hasNextPage || (total !== null && total > games.nodes.length)) {
    warn?.(
      `si.com scoreboard lists ${games.nodes.length} of ${total ?? 'more'} games; the rest load in the browser and are not read (${url})`,
    );
  }
  const out: SbliveGame[] = [];
  for (const node of games.nodes) {
    if (node.gameTeams.length !== 2) continue;
    const gameId = sbliveGameIdOf(node.id);
    if (gameId === null) {
      warn?.(`si.com row with a non-numeric game id ${JSON.stringify(String(node.id))} ignored (${url})`);
      continue;
    }
    const [a, b] = node.gameTeams.map((gt) =>
      makeSide(
        { name: gt.team.name, webPath: gt.team.webPath, rawId: gt.team.id, image: gt.team.image },
        toScore(gt.scoreText),
      ),
    );
    const sides = orderSides(a, b);
    out.push({
      sbliveGameId: gameId,
      dateIso: node.date,
      dateKey: localDateKey(node.date),
      sides,
      isFinal: node.statusId === 3,
      isScored: sides[0].score !== null && sides[1].score !== null,
      url: sbliveGameUrl(node.webPath),
      gameTypeLabel: null,
      origin: 'scoreboard',
    });
  }
  return out;
}

export interface SbliveTeamRef {
  sbliveTeamId: string;
  name: string;
  webPath: string;
  slug: TeamSlug | null;
  via?: SbliveResolution['via'];
}

/**
 * Harvest `{id, name, webPath}` from a league standings page. The RECORDS on that page are
 * deliberately ignored — only the web paths are usable, because SBLive's league buckets are wrong
 * (SPEC §1.2 caveat 1). This is how the si.com team slugs are recovered instead of guessed.
 */
export function parseStandingsTeamRefs(html: string, url = ''): SbliveTeamRef[] {
  const props = StandingsPropsSchema.parse(requireBlock(html, 'organizations/Standings', url));
  const out: SbliveTeamRef[] = [];
  for (const row of props.query.organization.teamStandings) {
    const webPath = row.team.webPath ?? null;
    const id = sbliveIdFromWebPath(webPath) ?? (row.team.id === undefined ? null : String(row.team.id));
    if (!id || !webPath) continue;
    const r = resolveSbliveSide({ name: row.team.name, webPath, rawId: row.team.id, image: row.team.image });
    out.push({ sbliveTeamId: id, name: row.team.name, webPath, slug: r.slug, via: r.via });
  }
  return out;
}

/** Every opponent web path a team page mentions — the other half of the slug harvest. */
export function harvestTeamWebPaths(html: string, url = ''): SbliveTeamRef[] {
  const props = TeamGamesPropsSchema.parse(requireBlock(html, 'teams/Games', url));
  const seen = new Map<string, SbliveTeamRef>();
  const add = (name: string | undefined, webPath: string | null | undefined, image: string | null | undefined) => {
    const id = sbliveIdFromWebPath(webPath);
    if (!id || !name || !webPath) return;
    if (!seen.has(id)) {
      const r = resolveSbliveSide({ name, webPath, image });
      seen.set(id, { sbliveTeamId: id, name, webPath, slug: r.slug, via: r.via });
    }
  };
  add(props.query.team.name, props.query.team.webPath, props.query.team.image);
  for (const node of props.query.team.games.nodes) {
    add(node.featured.team?.name, node.featured.team?.webPath, node.featured.team?.image);
    add(node.opponent.team.name, node.opponent.team.webPath, node.opponent.team.image);
  }
  return [...seen.values()];
}

/** Dedupe on the (date, unordered pair) key, preferring the row that actually carries scores. */
export function dedupeSbliveGames(games: readonly SbliveGame[]): SbliveGame[] {
  const best = new Map<string, SbliveGame>();
  for (const g of games) {
    const key = sbliveGameKey(g);
    const prior = best.get(key);
    const rank = (x: SbliveGame) => (x.isScored ? 2 : 0) + (x.isFinal ? 1 : 0);
    if (!prior || rank(g) > rank(prior)) best.set(key, g);
  }
  return [...best.values()].sort((a, b) =>
    a.dateKey === b.dateKey ? sblivePairKey(a.sides).localeCompare(sblivePairKey(b.sides)) : a.dateKey.localeCompare(b.dateKey),
  );
}

// ---------------------------------------------------------------- junk-row guards (D2 rule 7)

/** A real California field hockey game page. Anything else (e.g. a `/new-york/` duplicate) is junk. */
export const SBLIVE_GAME_PATH_PREFIX = '/california/field-hockey/games/';

/** True when the row links a `/california/field-hockey/games/…` page (D2 rule 7). */
export function isCaliforniaGameRow(game: Pick<SbliveGame, 'url'>): boolean {
  return game.url !== null && game.url.startsWith(`${SBLIVE_HOST}/high-school/stats${SBLIVE_GAME_PATH_PREFIX}`);
}

/** A side of a JV-only or withdrawn team (DATA_QUALITY.sbliveIgnoredTeamIds or a league's withdrawnNames). */
export function isIgnoredSbliveSide(side: Pick<SbliveSide, 'refused' | 'name'>): boolean {
  return side.refused === 'ignored-team' || isWithdrawnSchool(side.name);
}
