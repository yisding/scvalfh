/**
 * The site-facing read API (SPEC §13.3). Every page and component reads the snapshot through this
 * module.
 *
 * The snapshot is loaded and validated ONCE at module scope: bundled into the server code at build
 * time, and a schema failure surfaces at import time rather than half-way through a render. A v1
 * file (written before the multi-league schema) is upgraded in memory by `loadSnapshot`.
 *
 * "Today" is ALWAYS derived from `snapshot.fetchedAt` in America/Los_Angeles — never from
 * Date.now() — so a build is reproducible and every "as of" label is honest (BUILD-BRIEF).
 */

import { readFileSync } from 'node:fs';

import bundledSnapshot from '../data/snapshot.json';

import {
  dateSpan,
  hoursBetween,
  isoDateKey,
  localDateKey,
  numberWord,
  recordString,
  shortDate,
  sideOutcome,
} from './format';
import {
  ALL_DIVISIONS,
  CCS,
  CCS_LEAGUE_IDS,
  DATA_QUALITY,
  LEAGUES,
  SECTIONS,
  TOURNAMENT_LEAGUE_IDS,
  divisionHeading,
  findDivision,
  findLeague,
  getDivision,
  getLeague,
  leagueOfDivision,
  leaguePlayEnds,
} from './leagues';
import type { LeagueConfig, SectionConfig } from './leagues';
import { buildLeagueTournament } from './postseason';
import { buildSearchIndex } from './search';
import type { SearchIndex } from './search';
import { loadSnapshot } from './snapshot-schema';
import {
  divisionGames,
  leaguePairings,
  missingOfficialResults,
  outcomesFor,
  playoffOutcomeLabel,
  sortStandings,
} from './standings';
import type { MissingOfficialRow } from './standings';
import { getTeamById, getTeamBySlug } from './teams';
import type {
  CcsCalendarEvent,
  CcsPlayoffs,
  ContestId,
  CrossCheckRow,
  Division,
  DivisionId,
  DroppedContest,
  Game,
  GameStatus,
  LadderRow,
  LeagueHealth,
  LeagueId,
  LeaguePairing,
  LeagueTournamentProjection,
  OfficialFixture,
  Outcome,
  PlayoffProjection,
  Record3,
  SbliveCrossCheck,
  Season,
  SeasonPhase,
  SectionId,
  Snapshot,
  SourceKind,
  SourceStatus,
  Standing,
  Team,
  TeamId,
  TeamSlug,
} from './types';

/**
 * data/snapshot.json is IMPORTED, so every toolchain bundles it into the server code at build time:
 * Turbopack for `next build`, Vite/Rolldown for vinext's Node server and its Cloudflare Worker.
 * Nothing reads data/ from disk at run time. That is what lets the Worker start at all: workerd's
 * node:fs sees only /bundle, /tmp and /dev, and this module runs as a Worker instance starts (the
 * root layout and the dynamic metadata routes import it), so the old
 * `readFileSync(path.join(process.cwd(), 'data', 'snapshot.json'))` threw before any request was
 * served. A missing file is now a build error (the import does not resolve): run `pnpm fetch-data`
 * first.
 *
 * SCVAL_SNAPSHOT still swaps in another file (tests, a --out build), read with node:fs when this
 * module loads. It needs a real filesystem: next start, vinext start, vitest and tsx, never a
 * Worker. Both paths go through `loadSnapshot`, so a v1 file is migrated in memory (SPEC §4.3).
 */
function load(): Snapshot {
  const override = process.env.SCVAL_SNAPSHOT;
  if (!override) return loadSnapshot(bundledSnapshot as unknown);
  let raw: string;
  try {
    raw = readFileSync(override, 'utf8');
  } catch (err) {
    throw new Error(
      `lib/data.ts: cannot read SCVAL_SNAPSHOT=${override} (${(err as Error).message})`,
    );
  }
  return loadSnapshot(JSON.parse(raw) as unknown);
}

const snapshot = load();

// ---------------------------------------------------------------- basics

export function getSnapshot(): Snapshot {
  return snapshot;
}

export function getSeason(): Season {
  return snapshot.season;
}

export function getFetchedAt(): string {
  return snapshot.fetchedAt;
}

/** 'YYYY-MM-DD' in America/Los_Angeles, derived from the snapshot stamp. */
export function getToday(): string {
  return localDateKey(snapshot.fetchedAt);
}

/** Hours since the snapshot was written, relative to an instant you supply. */
export function getSnapshotAgeHours(now: string = snapshot.fetchedAt): number {
  return hoursBetween(snapshot.fetchedAt, now);
}

export function getCounts(): Snapshot['counts'] {
  return snapshot.counts;
}

/** The league a team slug, division or league id in a source row's scope belongs to. */
function scopeLeague(scope: SourceStatus['scope']): LeagueId | null {
  if (!scope) return null;
  if (scope.league) return scope.league;
  if (scope.division) return findDivision(scope.division)?.leagueId ?? null;
  if (scope.team) return getTeamBySlug(scope.team)?.league ?? null;
  return null;
}

/** One row per request. `league` keeps rows scoped to that league; `kind` keeps one kind. */
export function getSources(filter: { league?: LeagueId; kind?: SourceKind } = {}): readonly SourceStatus[] {
  if (!filter.league && !filter.kind) return snapshot.sources;
  return snapshot.sources.filter(
    (s) =>
      (!filter.league || scopeLeague(s.scope) === filter.league) &&
      (!filter.kind || s.kind === filter.kind),
  );
}

/** Contests the pipeline removed on purpose, so nothing disappears silently. */
export function getDropped(): readonly DroppedContest[] {
  return snapshot.dropped;
}

/** The MaxPreps STANDINGS comparison (DESIGN §9), optionally for one league. */
export function getCrossCheck(filter: { league?: LeagueId } = {}): readonly CrossCheckRow[] {
  if (!filter.league) return snapshot.crossCheck;
  return snapshot.crossCheck.filter((r) => getTeamBySlug(r.slug)?.league === filter.league);
}

/**
 * The si.com SCORE cross-check. Undefined when the step was skipped. `conflicts` are plain
 * disagreements (MaxPreps stays, D2 rule 5); `sbliveOnlyScored` are si.com scores D2 did NOT
 * publish, with the reason; `backfilled` are the si.com values D2 did publish (rules 2-4).
 */
export function getSbliveCrossCheck(): SbliveCrossCheck | undefined {
  return snapshot.sbliveCrossCheck;
}

/** The scoreConflict on one game, for the "sources disagree" marker on a row. */
export function getScoreConflict(contestId: ContestId): Game['provenance']['scoreConflict'] {
  return getGameById(contestId)?.provenance.scoreConflict;
}

/** null until SCVAL publishes a 2026-27 field hockey standings PDF; undefined if never polled. */
export function getOfficialStandingsPdfUrl(): string | null | undefined {
  return snapshot.officialStandingsPdfUrl;
}

/** The CCS iCal events, once the season gate has opened. */
export function getCcsCalendar(): readonly CcsCalendarEvent[] | undefined {
  return snapshot.playoffs.ccsCalendar;
}

/** true when the CCS calendar corroborated every published key date. undefined if not yet polled. */
export function areKeyDatesConfirmed(): boolean | undefined {
  return snapshot.playoffs.keyDatesConfirmed;
}

/** MaxPreps' CCS tournament page (re-exported for pages). */
export const BRACKET_URL: string = CCS.bracketUrl;

/** 'sblive:<id>' games a MaxPreps contest has since superseded → that contest (D2 rule 10). */
export function getSupersededGames(): Readonly<Record<ContestId, ContestId>> {
  return snapshot.supersededGames;
}

// ---------------------------------------------------------------- sections and leagues

export interface LeagueSummary {
  id: LeagueId;
  name: string;
  shortName: string;
  region: string;
  section: { id: SectionId; name: string; shortName: SectionConfig['shortName'] };
  singleDivision: boolean;
  divisions: Array<{ id: DivisionId; label: string; heading: string | null; teamCount: number }>;
  teamCount: number;
  officialUrl: string;
  links: ReadonlyArray<{ label: string; href: string }>;
}

function sectionConfig(id: SectionId): SectionConfig {
  const s = SECTIONS.find((x) => x.id === id);
  if (!s) throw new Error(`lib/data.ts: unknown section ${id}`);
  return s;
}

function summaryOf(league: LeagueConfig): LeagueSummary {
  const section = sectionConfig(league.sectionId);
  const divisions = league.divisions.map((d) => ({
    id: d.id,
    label: d.label,
    heading: divisionHeading(d.id),
    teamCount: snapshot.teams.filter((t) => t.division === d.id).length,
  }));
  return {
    id: league.id,
    name: league.name,
    shortName: league.shortName,
    region: league.region,
    section: { id: section.id, name: section.name, shortName: section.shortName },
    singleDivision: league.divisions.length === 1,
    divisions,
    teamCount: divisions.reduce((n, d) => n + d.teamCount, 0),
    officialUrl: league.officialUrl,
    links: league.links,
  };
}

const SUMMARIES: LeagueSummary[] = LEAGUES.map(summaryOf);

export function getSections(): readonly SectionConfig[] {
  return SECTIONS;
}

/** One summary per league, config order (scval, bval, pcal, mcal, eal). */
export function getLeagueSummaries(): LeagueSummary[] {
  return SUMMARIES;
}

export function getLeagueSummary(id: string): LeagueSummary | undefined {
  return SUMMARIES.find((s) => s.id === id);
}

/** generateStaticParams for /standings/[league] and /schedule/[league]. */
export function getLeagueIds(): LeagueId[] {
  return LEAGUES.map((l) => l.id);
}

/** generateStaticParams for /playoffs/[league] (league-tournament leagues only). */
export function getTournamentLeagueIds(): LeagueId[] {
  return [...TOURNAMENT_LEAGUE_IDS];
}

export function getLeagueHealth(id: LeagueId): LeagueHealth {
  const row = snapshot.leagueHealth.find((h) => h.leagueId === id);
  if (!row) throw new Error(`lib/data.ts: no leagueHealth row for ${id}`);
  return row;
}

export function getAllLeagueHealth(): readonly LeagueHealth[] {
  return snapshot.leagueHealth;
}

// ---------------------------------------------------------------- teams

/** All 49 (registry order), one division (a bare id), or `{ league?, division? }`. */
export function getTeams(filter?: DivisionId | { league?: LeagueId; division?: DivisionId }): readonly Team[] {
  if (filter === undefined) return snapshot.teams;
  const f = typeof filter === 'string' ? { division: filter } : filter;
  return snapshot.teams.filter(
    (t) => (!f.league || t.league === f.league) && (!f.division || t.division === f.division),
  );
}

/** Section → league → division → teams, config order, for /teams. */
export function getTeamsGrouped(): Array<{
  section: SectionConfig;
  leagues: Array<{
    league: LeagueSummary;
    divisions: Array<{ id: DivisionId; heading: string | null; teams: Team[] }>;
  }>;
}> {
  return SECTIONS.map((section) => ({
    section,
    leagues: LEAGUES.filter((l) => l.sectionId === section.id).map((l) => ({
      league: summaryOf(l),
      divisions: l.divisions.map((d) => ({
        id: d.id,
        heading: divisionHeading(d.id),
        teams: snapshot.teams.filter((t) => t.division === d.id),
      })),
    })),
  })).filter((g) => g.leagues.length > 0);
}

/**
 * The registry lookups (lib/teams.ts), re-exported so a page can name a team through this module.
 * The snapshot's teams equal the registry, in membership and order (checkAgainstConfig #1), so
 * there is one lookup, not a second scan of `snapshot.teams`.
 */
export { getTeamById, getTeamBySlug };

/**
 * Accepts a slug or a MaxPreps GUID. Reads the registry (getTeamBySlug, getTeamById), which the
 * snapshot's teams equal by checkAgainstConfig #1.
 */
export function resolveTeamRef(ref: string): Team | undefined {
  return getTeamBySlug(ref) ?? getTeamById(ref);
}

export function getTeamSlugs(): TeamSlug[] {
  return snapshot.teams.map((t) => t.slug);
}

export function getLeagueOfTeam(ref: string): LeagueSummary | undefined {
  const team = resolveTeamRef(ref);
  return team ? getLeagueSummary(team.league) : undefined;
}

let searchIndex: SearchIndex | null = null;

/** The pre-serialized 49-team search index (SPEC §9.1), in LEAGUES then registry order. Built once. */
export function getTeamSearchIndex(): SearchIndex {
  if (searchIndex) return searchIndex;
  const teams = LEAGUES.flatMap((l) => snapshot.teams.filter((t) => t.league === l.id)).map((t) => ({
    slug: t.slug,
    name: t.name,
    shortName: t.shortName,
    abbr: t.abbr,
    city: t.city,
    mascot: t.mascot,
    aliases: [...t.aliases],
    leagueId: t.league,
    division: t.division,
    colors: { primary: t.colors.primary, onPrimary: t.colors.onPrimary },
  }));
  const leagues = LEAGUES.map((l) => ({
    id: l.id,
    shortName: l.shortName,
    name: l.name,
    sectionShort: sectionConfig(l.sectionId).shortName,
    divisions: l.divisions.map((d) => ({
      id: d.id,
      label: d.label,
      heading: divisionHeading(d.id),
      searchAliases: d.searchAliases,
      teamCount: snapshot.teams.filter((t) => t.division === d.id).length,
    })),
  }));
  searchIndex = buildSearchIndex(teams, leagues, DATA_QUALITY.notCovered);
  return searchIndex;
}

// ---------------------------------------------------------------- games

export interface GameFilter {
  /** A MaxPreps GUID or one of our slugs. */
  teamId?: string;
  /** ≥1 side in the league. */
  league?: LeagueId;
  /** ≥1 side in the division. */
  division?: DivisionId;
  /** countsFor !== null. */
  leagueOnly?: boolean;
  /** true: postseason !== null; false: postseason === null. */
  postseason?: boolean;
  status?: GameStatus | GameStatus[];
  /** 'YYYY-MM-DD' */
  date?: string;
}

function involvesTeam(game: Game, team: Team): boolean {
  return (
    game.home.teamId === team.id ||
    game.away.teamId === team.id ||
    game.home.slug === team.slug ||
    game.away.slug === team.slug
  );
}

function sideTeam(side: Game['home']): Team | undefined {
  return (side.teamId ? getTeamById(side.teamId) : undefined) ?? (side.slug ? getTeamBySlug(side.slug) : undefined);
}

function hasSideIn(game: Game, pred: (t: Team) => boolean): boolean {
  const h = sideTeam(game.home);
  const a = sideTeam(game.away);
  return (!!h && pred(h)) || (!!a && pred(a));
}

export function getGames(filter: GameFilter = {}): Game[] {
  const statuses = filter.status
    ? new Set(Array.isArray(filter.status) ? filter.status : [filter.status])
    : null;
  const team = filter.teamId ? resolveTeamRef(filter.teamId) : undefined;
  if (filter.teamId && !team) return [];

  return snapshot.games.filter((g) => {
    if (team && !involvesTeam(g, team)) return false;
    if (filter.leagueOnly && g.countsFor === null) return false;
    if (filter.postseason === true && g.postseason === null) return false;
    if (filter.postseason === false && g.postseason !== null) return false;
    if (statuses && !statuses.has(g.status)) return false;
    if (filter.date && g.dateKey !== filter.date) return false;
    if (filter.league && !hasSideIn(g, (t) => t.league === filter.league)) return false;
    if (filter.division && !hasSideIn(g, (t) => t.division === filter.division)) return false;
    return true;
  });
}

export function getGameById(contestId: ContestId): Game | undefined {
  return snapshot.games.find((g) => g.contestId === contestId);
}

/** Every date with at least one contest, ascending — the /scores/[date] static params. */
export function getGameDates(filter: { league?: LeagueId } = {}): string[] {
  const games = filter.league ? getGames({ league: filter.league }) : snapshot.games;
  return [...new Set(games.map((g) => g.dateKey))].sort();
}

export function getGamesByDate(filter: { league?: LeagueId } = {}): Array<{ date: string; games: Game[] }> {
  return getGameDates(filter).map((date) => ({ date, games: getGames({ ...filter, date }) }));
}

/**
 * The last day a LEAGUE result was reported — for one division, one league, or all leagues.
 * `null` before league play has produced anything.
 *
 * This, never `getToday()`, is what a standings or projection caption's "through …" date means:
 * `getToday()` is the snapshot's own Pacific day and says nothing about whether a game was played
 * on it, and divisions do not play on the same days.
 */
export function getLastLeagueResultDate(
  scope: { league?: LeagueId; division?: DivisionId } = {},
): string | null {
  const leagueDivisions = scope.league
    ? new Set<string>(getLeague(scope.league).divisions.map((d) => d.id))
    : null;
  const dates = snapshot.games
    .filter(
      (g) =>
        g.status === 'final' &&
        g.countsFor !== null &&
        (!scope.division || g.countsFor === scope.division) &&
        (!leagueDivisions || leagueDivisions.has(g.countsFor)),
    )
    .map((g) => g.dateKey)
    .sort();
  return dates.length ? dates[dates.length - 1] : null;
}

const PLAYABLE: GameStatus[] = ['scheduled', 'live', 'postponed'];

function scoped(filter: { league?: LeagueId }): Game[] {
  return filter.league ? getGames({ league: filter.league }) : snapshot.games;
}

/** The next `n` contests at or after `asOf` (default: the snapshot stamp). */
export function getUpcoming(n = 5, asOf: string = snapshot.fetchedAt, filter: { league?: LeagueId } = {}): Game[] {
  const today = localDateKey(asOf);
  return scoped(filter)
    .filter((g) => PLAYABLE.includes(g.status) && g.dateKey >= today)
    .sort((a, b) => a.dateLocal.localeCompare(b.dateLocal))
    .slice(0, n);
}

/** The most recent `n` finals at or before `asOf`, newest first. */
export function getRecentResults(n = 5, asOf: string = snapshot.fetchedAt, filter: { league?: LeagueId } = {}): Game[] {
  const today = localDateKey(asOf);
  return scoped(filter)
    .filter((g) => g.status === 'final' && g.dateKey <= today)
    .sort((a, b) => b.dateLocal.localeCompare(a.dateLocal))
    .slice(0, n);
}

/**
 * The most recent date that actually has reported results, so the home page never shows a stale
 * day as if it were last night (DESIGN §8).
 */
export function getLatestResultsDate(asOf: string = snapshot.fetchedAt, filter: { league?: LeagueId } = {}): string | null {
  const today = localDateKey(asOf);
  const dates = scoped(filter)
    .filter((g) => g.status === 'final' && g.dateKey <= today)
    .map((g) => g.dateKey)
    .sort();
  return dates.length ? dates[dates.length - 1] : null;
}

/**
 * Official fixtures (any league) with NO contest in the snapshot — render these as "scheduled
 * per <SHORT>, not reported".
 */
export function getOfficialFixtures(
  filter: { league?: LeagueId; division?: DivisionId; slug?: string } = {},
): OfficialFixture[] {
  let rows = snapshot.officialFixtures ?? [];
  if (filter.league) rows = rows.filter((f) => f.league === filter.league);
  if (filter.division) rows = rows.filter((f) => f.division === filter.division);
  if (filter.slug) {
    const team = resolveTeamRef(filter.slug);
    if (!team) return [];
    rows = rows.filter((f) => f.awaySlug === team.slug || f.homeSlug === team.slug);
  }
  return [...rows];
}

// ---------------------------------------------------------------- standings

export function getStandings(division: DivisionId): Standing[] {
  return sortStandings(snapshot.standings.filter((s) => s.division === division));
}

/** A league's tables, division order; `heading` is null for a single-division league. */
export function getLeagueStandings(
  leagueId: LeagueId,
): Array<{ division: DivisionId; heading: string | null; rows: Standing[] }> {
  return getLeague(leagueId).divisions.map((d) => ({
    division: d.id,
    heading: divisionHeading(d.id),
    rows: getStandings(d.id),
  }));
}

export function getAllStandings(): Record<DivisionId, Standing[]> {
  const out: Record<DivisionId, Standing[]> = {};
  for (const d of ALL_DIVISIONS) out[d.id] = getStandings(d.id);
  return out;
}

export function getStandingFor(ref: string): Standing | undefined {
  const team = resolveTeamRef(ref);
  return team ? snapshot.standings.find((s) => s.teamId === team.id) : undefined;
}

/** max |gd| in a division — the GoalDiffBar domain, per division (DESIGN §5.6). */
export function getGoalDiffDomain(division: DivisionId): number {
  const values = getStandings(division).map((s) => Math.abs(s.computed.gd));
  return Math.max(1, ...values);
}

// ---------------------------------------------------------------- derived per-row facts (§5.10)

export interface StandingContext {
  teamId: TeamId;
  /** division.gamesPerTeam */
  scheduled: number;
  /** computed.gp */
  counted: number;
  /** max(0, scheduled − counted): league games with no counted result yet — still to play, or played and not reported. */
  remaining: number;
  /** pts + points.win × remaining. A ceiling, not a projection. */
  maxPts: number;
  /** Rows of kind 'missing' from missingOfficialResults() (lib/standings.ts) that involve this team. */
  missingPast: number;
  /** Counted games whose score came from si.com (provenance.scores === 'sblive'). */
  backfilled: number;
}

function missingRows(division: DivisionId, asOf?: string): MissingOfficialRow[] {
  const today = localDateKey(asOf ?? snapshot.fetchedAt);
  return missingOfficialResults(snapshot.games, snapshot.officialFixtures ?? [], division, today);
}

export function getStandingContext(division: DivisionId, asOf?: string): ReadonlyMap<TeamId, StandingContext> {
  const d = getDivision(division);
  const { points } = leagueOfDivision(division).rules;
  const missing = missingRows(division, asOf).filter((r) => r.kind === 'missing');
  const counted = divisionGames(snapshot.games, division);
  const out = new Map<TeamId, StandingContext>();
  for (const row of getStandings(division)) {
    const remaining = Math.max(0, d.gamesPerTeam - row.computed.gp);
    out.set(row.teamId, {
      teamId: row.teamId,
      scheduled: d.gamesPerTeam,
      counted: row.computed.gp,
      remaining,
      maxPts: row.computed.pts + points.win * remaining,
      missingPast: missing.filter((m) => m.homeSlug === row.slug || m.awaySlug === row.slug).length,
      backfilled: counted.filter(
        (g) =>
          (g.home.teamId === row.teamId || g.away.teamId === row.teamId) &&
          g.provenance.scores === 'sblive',
      ).length,
    });
  }
  return out;
}

export interface CoLeaders {
  /** ≥2 teams with gp > 0 level on the top points. */
  teams: Team[];
  /** league regular phase is over AND no missingPast in the division ⇒ use rules.coChampionsLabel */
  final: boolean;
  /** final ? rules.coChampionsLabel : 'Level on points at the top' */
  label: string;
}

const PRE_FINAL_PHASES: ReadonlySet<SeasonPhase> = new Set<SeasonPhase>(['preseason', 'regular']);

export function getCoLeaders(division: DivisionId, asOf?: string): CoLeaders | null {
  const rows = getStandings(division).filter((s) => s.hasReportedResults);
  if (rows.length < 2) return null;
  const top = Math.max(...rows.map((s) => s.computed.pts));
  const level = rows.filter((s) => s.computed.pts === top);
  if (level.length < 2) return null;
  const league = leagueOfDivision(division);
  const final =
    !PRE_FINAL_PHASES.has(getSeasonPhase(league.id, asOf)) &&
    missingRows(division, asOf).every((r) => r.kind !== 'missing');
  return {
    teams: level.map((s) => getTeamById(s.teamId)).filter((t): t is Team => t !== undefined),
    final,
    label: final ? league.rules.coChampionsLabel : 'Level on points at the top',
  };
}

/** missingOfficialResults() rows (§5.2), enriched for the UI. */
export interface MissingOfficialResult extends MissingOfficialRow {
  /** si.com's score from the cross-check when D2 did NOT publish it, with the SbliveOnlyRow note saying why. */
  sblive: { home: number; away: number; note: string } | null;
}

/** The si.com-only row for a missing result: by contest id, or by date and both team names. */
function sbliveFor(row: MissingOfficialRow): MissingOfficialResult['sblive'] {
  const x = snapshot.sbliveCrossCheck;
  if (!x) return null;
  const nameOf = (slug: TeamSlug | null, fallback: string) =>
    (slug ? getTeamBySlug(slug)?.name : undefined) ?? fallback;
  const away = nameOf(row.awaySlug, row.awayName).toLowerCase();
  const home = nameOf(row.homeSlug, row.homeName).toLowerCase();
  const hit = x.sbliveOnlyScored.find((s) =>
    row.game
      ? s.contestId === row.game.contestId
      : s.dateKey === row.dateKey &&
        s.label.toLowerCase().includes(away) &&
        s.label.toLowerCase().includes(home),
  );
  return hit ? { home: hit.sblive.home, away: hit.sblive.away, note: hit.note } : null;
}

export function getMissingOfficialResults(division: DivisionId, asOf?: string): MissingOfficialResult[] {
  return missingRows(division, asOf).map((row) => ({ ...row, sblive: sbliveFor(row) }));
}

/** Spread of games played among teams with results in a division (uneven-GP footnote when max − min ≥ 2). */
export function getGamesPlayedSpread(division: DivisionId): { min: number; max: number; scheduled: number } {
  const gps = getStandings(division)
    .filter((s) => s.hasReportedResults)
    .map((s) => s.computed.gp);
  return {
    min: gps.length ? Math.min(...gps) : 0,
    max: gps.length ? Math.max(...gps) : 0,
    scheduled: getDivision(division).gamesPerTeam,
  };
}

// ---------------------------------------------------------------- season phase (§5.9)

/** A league's phase on the day of `asOf` (default: the snapshot stamp). */
export function getSeasonPhase(leagueId: LeagueId, asOf: string = snapshot.fetchedAt): SeasonPhase {
  const today = localDateKey(asOf);
  const league = getLeague(leagueId);
  const w = snapshot.season.leagues.find((l) => l.id === leagueId)?.window;
  if (!w || !w.firstGame) return 'preseason';
  const first = isoDateKey(w.firstGame);
  if (today < first) return 'preseason';
  for (const step of league.phases) {
    let end: string;
    if (step.through === 'data') {
      // Today's SCVAL formula: the later of the last game and the last league game.
      const lastPlayed = [w.lastGame, w.lastLeagueGame]
        .filter((v): v is string => !!v)
        .map(isoDateKey)
        .sort();
      end = lastPlayed[lastPlayed.length - 1] ?? first;
    } else if (step.through === 'league-play') {
      const ends = [leaguePlayEnds(leagueId), ...(w.lastLeagueGame ? [isoDateKey(w.lastLeagueGame)] : [])].sort();
      end = ends[ends.length - 1];
    } else {
      end = step.through;
    }
    if (today <= end) return step.phase;
  }
  return 'complete';
}

const PHASE_RANK: Readonly<Record<SeasonPhase, number>> = {
  preseason: 0,
  regular: 1,
  crossover: 2,
  'play-in': 2,
  tournament: 2,
  playoffs: 3,
  complete: 4,
};

/** The least advanced league phase (config order breaks a tie). */
export function getSitePhase(asOf: string = snapshot.fetchedAt): SeasonPhase {
  let best: SeasonPhase | null = null;
  for (const league of LEAGUES) {
    const phase = getSeasonPhase(league.id, asOf);
    if (best === null || PHASE_RANK[phase] < PHASE_RANK[best]) best = phase;
  }
  return best ?? 'preseason';
}

// ---------------------------------------------------------------- head to head

export interface HeadToHead {
  a: Team;
  b: Team;
  games: Game[];
  /** Record from A's point of view. */
  aRecord: Record3;
  bRecord: Record3;
  aGoals: number;
  bGoals: number;
  summary: string;
}

export function getHeadToHead(aRef: string, bRef: string): HeadToHead | undefined {
  const a = resolveTeamRef(aRef);
  const b = resolveTeamRef(bRef);
  if (!a || !b || a.id === b.id) return undefined;
  const games = snapshot.games
    .filter((g) => {
      const ids = [g.home.teamId, g.away.teamId];
      return ids.includes(a.id) && ids.includes(b.id);
    })
    .sort((x, y) => x.dateLocal.localeCompare(y.dateLocal));

  const aRecord: Record3 = { w: 0, l: 0, t: 0 };
  const bRecord: Record3 = { w: 0, l: 0, t: 0 };
  let aGoals = 0;
  let bGoals = 0;
  for (const g of games) {
    if (g.status !== 'final' || g.home.score === null || g.away.score === null) continue;
    const aIsHome = g.home.teamId === a.id;
    const aScore = aIsHome ? g.home.score : g.away.score;
    const bScore = aIsHome ? g.away.score : g.home.score;
    if (!g.isForfeit) {
      aGoals += aScore;
      bGoals += bScore;
    }
    // sideOutcome: an EAL 1 v 1 win (decider 'SO', level on goals) is the flagged side's win.
    const outcome = sideOutcome(g, aIsHome ? 'home' : 'away');
    if (outcome === 'W') {
      aRecord.w += 1;
      bRecord.l += 1;
    } else if (outcome === 'L') {
      aRecord.l += 1;
      bRecord.w += 1;
    } else {
      aRecord.t += 1;
      bRecord.t += 1;
    }
  }
  return {
    a,
    b,
    games,
    aRecord,
    bRecord,
    aGoals,
    bGoals,
    summary: `${a.shortName} ${recordString(aRecord)} vs ${b.shortName}`,
  };
}

// ---------------------------------------------------------------- team form

export interface FormGame {
  contestId: ContestId;
  date: string;
  opponent: string;
  opponentSlug: TeamSlug | null;
  site: Game['site'];
  status: GameStatus;
  /** goals for − goals against; null unless the game is a counted final. */
  margin: number | null;
  outcome: Outcome | null;
  /** countsFor !== null */
  isLeague: boolean;
  /** Forfeits have no goal margin and are excluded from MarginStrip (DESIGN §5.7). */
  excludedFromMargin: boolean;
}

export interface TeamForm {
  team: Team;
  standing: Standing | undefined;
  last5: Outcome[];
  streak: Standing['computed']['streak'];
  /** Every counted-division contest in date order, played or not, for the MarginStrip axis. */
  leagueGames: FormGame[];
  nonLeagueCount: number;
}

export function getTeamForm(ref: string): TeamForm | undefined {
  const team = resolveTeamRef(ref);
  if (!team) return undefined;
  const standing = snapshot.standings.find((s) => s.teamId === team.id);
  const all = getGames({ teamId: team.id }).sort((a, b) =>
    a.dateLocal.localeCompare(b.dateLocal),
  );
  const leagueGames: FormGame[] = all
    .filter((g) => g.countsFor !== null)
    .map((g) => {
      const isHome = g.home.teamId === team.id;
      const mine = isHome ? g.home : g.away;
      const theirs = isHome ? g.away : g.home;
      const counted =
        g.status === 'final' && mine.score !== null && theirs.score !== null && !g.isForfeit;
      // sideOutcome: an EAL 1 v 1 win (decider 'SO', level on goals) is the flagged side's win.
      const outcome: Outcome | null = sideOutcome(g, isHome ? 'home' : 'away');
      return {
        contestId: g.contestId,
        date: g.dateKey,
        opponent: theirs.name,
        opponentSlug: theirs.slug,
        site: g.site === 'neutral' ? 'neutral' : isHome ? 'home' : 'away',
        status: g.status,
        margin: counted ? (mine.score as number) - (theirs.score as number) : null,
        outcome,
        isLeague: true,
        excludedFromMargin: g.isForfeit,
      };
    });
  return {
    team,
    standing,
    last5: standing ? [...standing.computed.last5] : [],
    streak: standing?.computed.streak ?? null,
    leagueGames,
    nonLeagueCount: all.filter((g) => g.countsFor === null).length,
  };
}

// ---------------------------------------------------------------- postseason

export function getPlayoffs(): CcsPlayoffs {
  return snapshot.playoffs;
}

/**
 * A CCS league's ladder projection (SPEC §6.1): rows per division from the computed table, every
 * status a written word. Throws for any other league: a league-tournament league (see getLeagueTournament) or
 * an unbracketed one (the EAL draws no bracket and gets no projection; DESIGN §22).
 */
export function getPlayoffProjection(leagueId: LeagueId, asOf: string = snapshot.fetchedAt): PlayoffProjection {
  const league = getLeague(leagueId);
  if (league.postseason.kind !== 'ccs-ladder') {
    throw new Error(`lib/data.ts: ${leagueId} has no CCS ladder (use getLeagueTournament)`);
  }
  const byDivision: Record<DivisionId, LadderRow[]> = {};
  for (const d of league.divisions) {
    byDivision[d.id] = getStandings(d.id).map((s) => {
      // The union, not `s.playoffStatus`: a level place spans more than one finishing slot, so a
      // tie for 3rd holds both the third automatic berth and the 4th-place play-in spot.
      const statuses = outcomesFor(s);
      return {
        teamId: s.teamId,
        slug: s.slug,
        place: s.computed.place,
        status: statuses[0],
        statuses,
        label: s.hasReportedResults ? playoffOutcomeLabel(d.id, statuses) : 'No results reported',
        shared: s.tiebreak.shared,
      };
    });
  }
  const aq = snapshot.playoffs.format.autoQualifiers;
  return {
    asOf,
    leagueId,
    berths: { auto: aq[leagueId] ?? league.postseason.autoBerths, total: aq.total },
    byDivision,
    pairings: getLeaguePairings(leagueId),
  };
}

/** SCVAL: the 4 crossover pairings; BVAL: the play-in; PCAL, MCAL and EAL: []. */
export function getLeaguePairings(leagueId: LeagueId): LeaguePairing[] {
  return leaguePairings(snapshot.standings, snapshot.games, leagueId);
}

/** The 16-team CCS field: numbers only. */
export function getCcsField(): {
  byLeague: Array<{ leagueId: LeagueId; shortName: string; auto: number }>;
  atLarge: number;
  total: number;
} {
  return {
    byLeague: CCS_LEAGUE_IDS.map((id) => ({
      leagueId: id,
      shortName: getLeague(id).shortName,
      auto: CCS.autoQualifiers[id],
    })),
    atLarge: CCS.autoQualifiers.atLarge,
    total: CCS.autoQualifiers.total,
  };
}

/** A league-tournament league's bracket projection (MCAL). Throws for any other league (CCS, EAL). */
export function getLeagueTournament(leagueId: LeagueId, asOf: string = snapshot.fetchedAt): LeagueTournamentProjection {
  const league = getLeague(leagueId);
  if (league.postseason.kind !== 'league-tournament') {
    throw new Error(`lib/data.ts: ${leagueId} runs no league tournament (use getPlayoffProjection)`);
  }
  const rows = league.divisions.flatMap((d) => getStandings(d.id));
  return buildLeagueTournament(league, rows, snapshot.games, getSeasonPhase(leagueId, asOf), asOf);
}

export interface TeamPostseasonLine {
  label: string;
  sentence: string;
  href: string;
  linkText: string;
}

/** '11:00' → '11 AM'; '16:30' → '4:30 PM'. */
function clock(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
}

/** §10.5 copy; null for an unknown ref AND for a team with gp 0 (never placed by merit). */
export function getTeamPostseasonLine(ref: string, asOf?: string): TeamPostseasonLine | null {
  void asOf;
  const team = resolveTeamRef(ref);
  if (!team) return null;
  const row = snapshot.standings.find((s) => s.teamId === team.id);
  if (!row || row.computed.gp === 0) return null;
  const league = findLeague(team.league);
  if (!league) return null;
  const statuses = outcomesFor(row);
  const label = playoffOutcomeLabel(row.division, statuses);
  const ps = league.postseason;

  switch (ps.kind) {
    case 'league-tournament': {
      const round = (id: string) => ps.rounds.find((r) => r.id === id);
      const qf = round('qf-1');
      const playIn = round('play-in');
      const final = round('final');
      const qualifiers = numberWord(ps.qualifiers);
      const byes = ps.byes.length === 2 ? `${ps.byes[0]}-${ps.byes[1]}` : ps.byes.join(', ');
      return {
        label,
        sentence:
          `Top ${qualifiers} make the ${ps.name}: quarterfinals ${qf ? shortDate(qf.date) : ''}` +
          `${playIn ? ` (a play-in ${shortDate(playIn.date)} only if needed)` : ''}, final ` +
          `${final ? shortDate(final.date) : ''} at ${ps.finalSite.label}; seeds ${byes} get byes to the semifinals.`,
        href: `/playoffs/${league.id}`,
        linkText: `${ps.name} →`,
      };
    }
    case 'unbracketed-tournament':
      // The EAL's Super Regional: the rule and the dates, never a bracket or a seed (DESIGN §22).
      return {
        label,
        sentence: `The top ${numberWord(ps.qualifiers)} schools play the ${ps.name}, ${dateSpan(ps.dates.first, ps.dates.last)}; its format and site are not published yet.`,
        href: `/playoffs#${league.id}`,
        linkText: 'Postseason →',
      };
    case 'ccs-ladder': {
      const crossover = ps.pairings.find((p) => p.tag === 'scval-crossover');
      const playIn = ps.pairings.find((p) => p.tag === 'bval-play-in');
      let sentence: string;
      if (crossover) {
        sentence = `The SCVAL crossover and the 4th-place play-in are ${shortDate(crossover.date)}.`;
      } else if (playIn && statuses.includes('play-in')) {
        sentence =
          `${playIn.seatLabels[1]} plays at the ${divisionLabelOf(playIn.seats[0].division)} champion ` +
          `${shortDate(playIn.date)}${playIn.time ? `, ${clock(playIn.time)}` : ''}, for ${league.shortName}’s fourth automatic CCS berth.`;
      } else if (statuses[0] === 'no-aq-route') {
        sentence = 'No automatic-berth route; at-large berths are the CCS committee’s call.';
      } else {
        // An automatic-berth place (BVAL Mt. Hamilton 1-3, PCAL 1-2): the spec gives no league sentence.
        sentence = `${league.shortName}’s automatic CCS berths go by final place; CCS seeds the field on ${shortDate(CCS.keyDates.seedingMeeting)}.`;
      }
      return { label, sentence, href: `/playoffs#${league.id}`, linkText: 'CCS playoffs →' };
    }
  }
}

function divisionLabelOf(id: DivisionId): string {
  return getDivision(id).label;
}

/** Re-exported so a page never has to import two modules to name a team id. */
export type { Division, DivisionId, Game, LeagueId, Standing, Team, TeamId, TeamSlug };
