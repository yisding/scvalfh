/**
 * SECONDARY source: SBLive / Scorebook Live, now hosted at si.com/high-school/stats (SPEC §1.2).
 *
 * Role, and the only role: a SCORE CROSS-CHECK against MaxPreps (SPEC §5.7). Three things are
 * never taken from here, because they are demonstrably wrong for 2026-27:
 *   - division membership (its "De Anza" bucket holds 5 teams, two of them El Camino)
 *   - `standing.leagueRecord`
 *   - `gameTypeLabel` (league vs non-league)
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
import { TEAMS, resolveTeam } from '../teams';
import type { TeamSlug } from '../types';
import { CHROME_USER_AGENT, HttpClient, type HttpClientOptions, htmlUnescape } from './http';

export const SBLIVE_WEB = 'https://www.si.com/high-school/stats/california/field-hockey';
export const SBLIVE_HOST = 'https://www.si.com';

export function sbliveTeamGamesUrl(sbliveSlug: string): string {
  return `${SBLIVE_WEB}/teams/${sbliveSlug}/games`;
}

/** The statewide daily scoreboard. `date` is YYYY-MM-DD. */
export function sbliveScoresUrl(date: string): string {
  return `${SBLIVE_WEB}/scores?date=${date}`;
}

export function sbliveLeagueStandingsUrl(leagueSlug: string): string {
  return `${SBLIVE_WEB}/leagues/${leagueSlug}/standings`;
}

/** The two league slugs whose standings pages exist — used ONLY to harvest team web paths. */
export const SBLIVE_LEAGUE_SLUGS = [
  '4242-santa-clara-valley-de-anza',
  '4243-santa-clara-valley-el-camino',
] as const;

// ---------------------------------------------------------------- props extraction

export interface ReactPropsBlock {
  className: string;
  props: unknown;
}

const REACT_PROPS_RE = /data-react-class="([^"]+)"[^>]*?data-react-props="([^"]*)"/g;

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
  REACT_PROPS_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = REACT_PROPS_RE.exec(html)) !== null) {
    if (className && m[1] !== className) continue;
    out.push({ className: m[1], props: parseJsonPrefix(htmlUnescape(m[2])) });
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
  /** Numeric SBLive team id when the payload exposes one. */
  sbliveTeamId: string | null;
  /** Our slug, resolved through the registry aliases; null for a non-SCVAL school. */
  slug: TeamSlug | null;
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

function makeSide(
  name: string,
  score: number | null,
  webPath: string | null | undefined,
  rawId: string | number | null | undefined,
): SbliveSide {
  const fromPath = sbliveIdFromWebPath(webPath);
  const sbliveTeamId = fromPath ?? (rawId === null || rawId === undefined ? null : String(rawId));
  // Identity by our alias table first, then by the SBLive numeric id recorded in the registry.
  const byName = resolveTeam(name);
  const byId = sbliveTeamId ? findBySbliveId(sbliveTeamId) : undefined;
  const team = byName ?? byId;
  return { name, sbliveTeamId, slug: team ? team.slug : null, score };
}

/** Reverse index over Team.external.sbliveTeamId. */
const BY_SBLIVE_ID = new Map<string, TeamSlug>();
for (const t of TEAMS) {
  if (t.external.sbliveTeamId) BY_SBLIVE_ID.set(t.external.sbliveTeamId, t.slug);
}

function findBySbliveId(id: string): { slug: TeamSlug } | undefined {
  const slug = BY_SBLIVE_ID.get(id);
  return slug ? { slug } : undefined;
}

/** Sorted so `pairKey` is order-independent. */
function orderSides(a: SbliveSide, b: SbliveSide): [SbliveSide, SbliveSide] {
  const ka = a.slug ?? a.name.toLowerCase();
  const kb = b.slug ?? b.name.toLowerCase();
  return ka <= kb ? [a, b] : [b, a];
}

/** The unordered-pair half of the cross-check join key (SPEC §5.7). */
export function sblivePairKey(sides: readonly SbliveSide[]): string {
  return sides
    .map((s) => s.slug ?? `name:${s.name.toLowerCase().replace(/[^a-z0-9]+/g, '')}`)
    .sort()
    .join('~');
}

export function sbliveGameKey(game: Pick<SbliveGame, 'dateKey' | 'sides'>): string {
  return `${game.dateKey}|${sblivePairKey(game.sides)}`;
}

// ---------------------------------------------------------------- parsers

/** Parse a team `/games` page. Featured side is the team whose page it is. */
export function parseTeamGamesPage(html: string, url = sbliveTeamGamesUrl('')): SbliveGame[] {
  const props = TeamGamesPropsSchema.parse(requireBlock(html, 'teams/Games', url));
  const team = props.query.team;
  const out: SbliveGame[] = [];
  for (const node of team.games.nodes) {
    const featuredName = node.featured.team?.name ?? team.name ?? null;
    if (!featuredName) continue;
    const mine = makeSide(
      featuredName,
      toScore(node.featured.scoreText),
      node.featured.team?.webPath ?? team.webPath ?? null,
      node.featured.team?.id ?? team.id,
    );
    const theirs = makeSide(
      node.opponent.team.name,
      toScore(node.opponent.scoreText),
      node.opponent.team.webPath,
      node.opponent.team.id,
    );
    const sides = orderSides(mine, theirs);
    out.push({
      sbliveGameId: String(node.id),
      dateIso: node.date,
      dateKey: localDateKey(node.date),
      sides,
      isFinal: node.statusId === 3,
      isScored: sides[0].score !== null && sides[1].score !== null,
      url: node.webPath ? SBLIVE_HOST + '/high-school/stats' + node.webPath : null,
      gameTypeLabel: node.gameTypeLabel ?? null,
      origin: 'team-games',
    });
  }
  return out;
}

/**
 * Parse the statewide `?date=` scoreboard. Its `gameTeams[]` carry a name and a score but no
 * webPath and no isHome, which is exactly why the cross-check joins on an UNORDERED pair.
 */
export function parseScoresPage(html: string, url = sbliveScoresUrl('')): SbliveGame[] {
  const props = ScoreboardPropsSchema.parse(requireBlock(html, 'games/GenderSportIndex', url));
  const out: SbliveGame[] = [];
  for (const node of props.query.scoreboardDate.games.nodes) {
    if (node.gameTeams.length !== 2) continue;
    const [a, b] = node.gameTeams.map((gt) =>
      makeSide(gt.team.name, toScore(gt.scoreText), gt.team.webPath, gt.team.id),
    );
    const sides = orderSides(a, b);
    out.push({
      sbliveGameId: String(node.id),
      dateIso: node.date,
      dateKey: localDateKey(node.date),
      sides,
      isFinal: node.statusId === 3,
      isScored: sides[0].score !== null && sides[1].score !== null,
      url: node.webPath ? SBLIVE_HOST + '/high-school/stats' + node.webPath : null,
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
    const team = resolveTeam(row.team.name) ?? findBySbliveId(id);
    out.push({ sbliveTeamId: id, name: row.team.name, webPath, slug: team ? team.slug : null });
  }
  return out;
}

/** Every opponent web path a team page mentions — the other half of the slug harvest. */
export function harvestTeamWebPaths(html: string, url = ''): SbliveTeamRef[] {
  const props = TeamGamesPropsSchema.parse(requireBlock(html, 'teams/Games', url));
  const seen = new Map<string, SbliveTeamRef>();
  const add = (name: string | undefined, webPath: string | null | undefined) => {
    const id = sbliveIdFromWebPath(webPath);
    if (!id || !name || !webPath) return;
    const team = resolveTeam(name) ?? findBySbliveId(id);
    if (!seen.has(id)) {
      seen.set(id, { sbliveTeamId: id, name, webPath, slug: team ? team.slug : null });
    }
  };
  add(props.query.team.name, props.query.team.webPath);
  for (const node of props.query.team.games.nodes) {
    add(node.featured.team?.name, node.featured.team?.webPath);
    add(node.opponent.team.name, node.opponent.team.webPath);
  }
  return [...seen.values()];
}

// ---------------------------------------------------------------- client

export interface SbliveFetchResult {
  games: SbliveGame[];
  /** One entry per request actually made. */
  requests: Array<{ url: string; httpStatus: number; rowCount: number }>;
  /** Non-fatal notes for the run log. */
  warnings: string[];
}

export class SbliveClient {
  private readonly http: HttpClient;

  constructor(opts: HttpClientOptions = {}) {
    // The Chrome-like UA is required: si.com 403s a non-browser agent (SPEC §1.2).
    this.http = new HttpClient({ userAgent: CHROME_USER_AGENT, ...opts });
  }

  async getTeamGames(sbliveSlug: string): Promise<{ games: SbliveGame[]; url: string; httpStatus: number }> {
    const url = sbliveTeamGamesUrl(sbliveSlug);
    const res = await this.http.text(url);
    return { games: parseTeamGamesPage(res.body, url), url, httpStatus: res.httpStatus };
  }

  async getScores(date: string): Promise<{ games: SbliveGame[]; url: string; httpStatus: number }> {
    const url = sbliveScoresUrl(date);
    const res = await this.http.text(url);
    return { games: parseScoresPage(res.body, url), url, httpStatus: res.httpStatus };
  }

  async getLeagueTeamRefs(leagueSlug: string): Promise<{ refs: SbliveTeamRef[]; url: string; httpStatus: number }> {
    const url = sbliveLeagueStandingsUrl(leagueSlug);
    const res = await this.http.text(url);
    return { refs: parseStandingsTeamRefs(res.body, url), url, httpStatus: res.httpStatus };
  }
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
