/**
 * Snapshot upgrades, in memory. Pure: no I/O, no clock.
 *
 * v1 → v2 (SPEC §4.3). A v1 file (the SCVAL-only site, no `schemaVersion`) keeps loading until the
 * first v2 run replaces it. Every SCVAL value is recomputed by the same engine the v2 pipeline uses,
 * so the migrated SCVAL standings rows are byte-identical to the v1 rows (golden-gated); the other
 * leagues are present as registry teams with no results and a `degraded` health row that says why.
 *
 * "League added" (v2 → v2). A v2 file written before a configured league existed (the four-league
 * snapshot before the EAL; the five-league NorCal snapshot before the Sunset and the three San Diego
 * leagues, whose two sections arrive with them) gains those leagues' sections, season entries, teams,
 * empty standings rows and a `degraded` health row each; every existing league's rows stay
 * byte-identical. No schemaVersion bump: the upgrade is keyed on the league list, and a region is never
 * stored (it is derived from each section's config), so there is no new field to fill.
 *
 * "Rules changed" (v2 → v2, DESIGN §24.11). A v2 file whose games no longer classify as written — a
 * league's classification rule changed (the Sunset: MaxPreps' flag → every game between two of the eight),
 * or a team moved between divisions (Bonita and Chaminade: Sunset → the LA independents) after the file was
 * written — is reclassified under the current config: `leagueDivision` from the registry, `countsFor` from
 * the pipeline's classifier, and the affected divisions' standings rows, cross-check rows, health counts,
 * season windows and counts recomputed by the same engine. Without it the pipeline's `readPrevious` would
 * reject the file on its `countsFor` check and run with NO previous snapshot: no carry-forward, no finals
 * regression guard, and a meta file that reports every existing final as newly added.
 *
 * All three return v2 JSON, NOT yet parsed: the caller (`loadSnapshot`) runs it through `parseSnapshot`.
 */

import { classifyGame, classifyGames } from './classify';
import { CCS, LEAGUES, LEAGUE_IDS, findDivision, leagueOfDivision } from './leagues';
import { buildSeason, leagueWindowOf } from './season-build';
import { assertFullTable, buildCrossCheck, computeStandings, divisionGames } from './standings';
import { TEAMS, getTeamById, getTeamBySlug, teamOfSide, teamsInLeague } from './teams';
import type {
  DivisionHealth,
  DivisionId,
  Game,
  GameSide,
  LeagueHealth,
  OfficialFixture,
  OfficialStamp,
  ReportedRecord,
  Snapshot,
  Standing,
  Team,
  TeamId,
} from './types';

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/** No schemaVersion and `season.leagues` is an object (the v1 two-key record). */
export function isSnapshotV1(raw: unknown): boolean {
  if (!isObject(raw) || 'schemaVersion' in raw) return false;
  const season = raw.season;
  return isObject(season) && isObject(season.leagues);
}

/**
 * A side re-resolved by teamId through the registry (a now-registry opponent gains its slug and name: the
 * San Diego teams NorCal teams have already played become registry sides when their leagues are added).
 */
function upgradeSide(side: GameSide): GameSide {
  const team: Team | undefined = side.teamId ? getTeamById(side.teamId) : undefined;
  if (!team) return { ...side };
  return { ...side, slug: team.slug, name: team.name };
}

/**
 * The health reason of a league a snapshot predates: 'No Sunset data in this snapshot yet: it was written
 * before Sunset was added.' A group of independents (the LA independents, DESIGN §24.9) is named
 * in full, since its short name ('LA') alone names a place.
 */
function addedLeagueReason(league: (typeof LEAGUES)[number]): string {
  if (league.independents) {
    return `No data for the ${league.name} in this snapshot yet: it was written before they were added.`;
  }
  return `No ${league.shortName} data in this snapshot yet: it was written before ${league.shortName} was added.`;
}

/** One v1 game → a v2 game with placeholders (classification runs over the whole list afterwards). */
function upgradeGame(raw: Json): Game {
  const v1 = raw as unknown as Game & { official?: { scheduledDate: string; source: string } };
  const home = upgradeSide(v1.home);
  const away = upgradeSide(v1.away);
  const homeTeam = home.slug ? getTeamBySlug(home.slug) : undefined;
  const awayTeam = away.slug ? getTeamBySlug(away.slug) : undefined;
  const leagueDivision =
    homeTeam && awayTeam && homeTeam.division === awayTeam.division ? homeTeam.division : null;

  const { official: v1Official, ...rest } = v1;
  let stamp: OfficialStamp | undefined;
  if (v1Official && leagueDivision !== null) {
    // v1 stamps exist only on SCVAL same-division games.
    const division = leagueDivision;
    const official = findDivision(division)?.official;
    const source = !official || official.mode === 'none' ? 'scval-pdf' : official.source;
    stamp = {
      scheduledDate: v1Official.scheduledDate,
      division,
      source,
      fixtureId: `${division}:${v1Official.scheduledDate}:${away.slug}@${home.slug}`,
      pass: v1Official.scheduledDate === v1.dateKey ? 'same-date' : 'rescheduled',
    };
  }

  return {
    ...rest,
    home,
    away,
    leagueDivision,
    contestTypes: { home: null, away: null },
    postseason: null,
    countsFor: null,
    ...(stamp ? { official: stamp } : {}),
  };
}

/** v1 fixtures gain `id`, `league` and `time`. */
function upgradeFixture(raw: Json): OfficialFixture {
  const f = raw as unknown as Omit<OfficialFixture, 'id' | 'league' | 'time'>;
  const league = findDivision(f.division)?.leagueId ?? 'scval';
  return {
    id: `${f.division}:${f.dateKey}:${f.awaySlug ?? f.awayName}@${f.homeSlug ?? f.homeName}`,
    league,
    division: f.division,
    dateKey: f.dateKey,
    time: null,
    awayName: f.awayName,
    homeName: f.homeName,
    awaySlug: f.awaySlug,
    homeSlug: f.homeSlug,
    source: f.source,
  };
}

function healthRows(
  fetchedAt: string,
  games: readonly Game[],
  v1Standings: readonly Standing[],
): LeagueHealth[] {
  return LEAGUES.map((league) => {
    const isScval = league.id === 'scval';
    const divisions: DivisionHealth[] = league.divisions.map((d) =>
      isScval
        ? {
            divisionId: d.id,
            meta: 'ok',
            reportedTable: 'ok',
            reportedRows: v1Standings.filter((s) => s.division === d.id && s.reported !== null).length,
            classification: 'contest-type',
            official: null,
            countedFinals: divisionGames(games, d.id).length,
            previousCountedFinals: null,
            backfilled: 0,
          }
        : {
            divisionId: d.id,
            meta: 'skipped',
            reportedTable: 'skipped',
            reportedRows: null,
            classification: league.rules.classification,
            official: null,
            countedFinals: 0,
            previousCountedFinals: null,
            backfilled: 0,
          },
    );
    const total = teamsInLeague(league.id).length;
    return isScval
      ? {
          leagueId: league.id,
          state: 'fresh',
          lastFreshAt: fetchedAt,
          reasons: [],
          divisions,
          teamFeeds: { total, ok: total, carried: 0, failed: 0 },
        }
      : {
          leagueId: league.id,
          state: 'degraded',
          lastFreshAt: null,
          reasons: [addedLeagueReason(league)],
          divisions,
          teamFeeds: { total, ok: 0, carried: 0, failed: 0 },
        };
  });
}

/** `counts`, recomputed (incl. byLeague; `leagueGames` = games with countsFor !== null). */
export function countsOf(games: readonly Game[], standings: readonly Standing[]): Snapshot['counts'] {
  const byLeague: Snapshot['counts']['byLeague'] = {};
  for (const league of LEAGUES) {
    const divisions = new Set<string>(league.divisions.map((d) => d.id));
    const members = new Set<TeamId>(teamsInLeague(league.id).map((t) => t.id));
    const inLeague = games.filter(
      (g) => (g.home.teamId !== null && members.has(g.home.teamId)) || (g.away.teamId !== null && members.has(g.away.teamId)),
    );
    byLeague[league.id] = {
      teams: members.size,
      games: inLeague.length,
      finals: inLeague.filter((g) => g.status === 'final').length,
      leagueGames: games.filter((g) => g.countsFor !== null && divisions.has(g.countsFor)).length,
      backfilled: inLeague.filter((g) => g.provenance.scores === 'sblive').length,
    };
  }
  return {
    teams: TEAMS.length,
    games: games.length,
    finals: games.filter((g) => g.status === 'final').length,
    pending: games.filter((g) => g.status === 'score-pending').length,
    leagueGames: games.filter((g) => g.countsFor !== null).length,
    mismatches: standings.filter((s) => s.mismatch).length,
    byLeague,
  };
}

/** Returns v2 JSON, not yet parsed. Throws on input that is not a v1 snapshot. */
export function migrateV1ToV2(raw: unknown): unknown {
  if (!isSnapshotV1(raw)) throw new Error('lib/snapshot-migrate.ts: not a v1 snapshot');
  const v1 = raw as Json;
  const fetchedAt = String(v1.fetchedAt);

  // 3. games: re-resolved sides, membership from the registry, then the pipeline's classification.
  const games = classifyGames(((v1.games as Json[]) ?? []).map(upgradeGame));

  // 4. standings, from the same engine, with MaxPreps' reported rows carried over.
  const v1Standings = (v1.standings as Standing[]) ?? [];
  const reported = new Map<TeamId, ReportedRecord>();
  for (const row of v1Standings) if (row.reported) reported.set(row.teamId, row.reported);
  const standings = computeStandings(games, { reported });
  assertFullTable(standings);

  // 7. CCS playoffs: section config copies, v1's observed fields kept.
  const p = (v1.playoffs as Json) ?? {};
  const playoffs: Snapshot['playoffs'] = {
    keyDates: { ...CCS.keyDates },
    ...(p.ccsCalendar !== undefined ? { ccsCalendar: p.ccsCalendar as Snapshot['playoffs']['ccsCalendar'] } : {}),
    ...(p.keyDatesConfirmed !== undefined ? { keyDatesConfirmed: p.keyDatesConfirmed as boolean } : {}),
    format: {
      elimination: 'single',
      ccsDivisions: CCS.ccsDivisions.map((d) => ({ name: d.name, seeds: [d.seeds[0], d.seeds[1]] as [number, number] })),
      autoQualifiers: { ...CCS.autoQualifiers },
      highSeedHostsThrough: CCS.highSeedHostsThrough,
    },
    bracketPublished: Boolean(p.bracketPublished),
    bracketUrl: typeof p.bracketUrl === 'string' ? p.bracketUrl : CCS.bracketUrl,
    games: classifyGames(((p.games as Json[]) ?? []).map(upgradeGame)),
  };

  const sblive = v1.sbliveCrossCheck as Json | undefined;
  const fixtures = v1.officialFixtures as Json[] | undefined;

  const out: Snapshot = {
    schemaVersion: 2,
    fetchedAt,
    season: buildSeason(games),
    teams: TEAMS.map((t) => ({ ...t })),
    games,
    standings,
    playoffs,
    sources: (v1.sources as Snapshot['sources']) ?? [],
    leagueHealth: healthRows(fetchedAt, games, v1Standings),
    dropped: [],
    crossCheck: buildCrossCheck(standings),
    ...(sblive ? { sbliveCrossCheck: { ...(sblive as unknown as Snapshot['sbliveCrossCheck'] & object), backfilled: [] } } : {}),
    ...(fixtures ? { officialFixtures: fixtures.map(upgradeFixture) } : {}),
    supersededGames: {},
    ...(v1.officialStandingsPdfUrl !== undefined
      ? { officialStandingsPdfUrl: v1.officialStandingsPdfUrl as string | null }
      : {}),
    counts: countsOf(games, standings),
  };
  return out;
}

// ---------------------------------------------------------------- "league added" (v2 → v2)

/**
 * A v2 object whose `season.leagues` ids are a proper, in-order subsequence of LEAGUE_IDS: a file
 * written before one or more configured leagues existed.
 */
export function lacksConfiguredLeagues(raw: unknown): boolean {
  if (!isObject(raw) || raw.schemaVersion !== 2) return false;
  const season = raw.season;
  if (!isObject(season) || !Array.isArray(season.leagues)) return false;
  const ids = season.leagues.map((l) => (isObject(l) ? l.id : undefined));
  if (ids.length >= LEAGUE_IDS.length) return false;
  let at = 0;
  for (const id of ids) {
    if (typeof id !== 'string') return false;
    const next = LEAGUE_IDS.indexOf(id, at);
    if (next < 0) return false;
    at = next + 1;
  }
  return true;
}

/** `present` (a subset of `all`, in `all`'s order) with the missing entries of `all` inserted where config puts them. */
function mergeInConfigOrder<T extends { id: string }>(present: readonly T[], all: readonly T[]): T[] {
  const have = new Map(present.map((x) => [x.id, x]));
  return all.map((x) => have.get(x.id) ?? x);
}

/**
 * Adds the configured leagues a v2 file predates (D15). In order: (1) every game side in `games` and
 * `playoffs.games` re-resolved by teamId (a now-registry opponent gains its slug and name; teamId,
 * leagueDivision, countsFor and postseason are untouched, since a pre-league file holds no game
 * between two members of a new league: the NorCal snapshot's games all have a NorCal side, and a
 * NorCal–San Diego game is in no table); (2) `teams` = the registry; (3) the missing season sections
 * and leagues from `buildSeason`, inserted where config puts them; (4) the missing divisions' standings
 * rows (no results) and their cross-check rows; (5) one `degraded` health row per missing league;
 * (6) `counts` recomputed. Throws on input that `lacksConfiguredLeagues` rejects.
 */
export function addConfiguredLeagues(raw: unknown): unknown {
  if (!lacksConfiguredLeagues(raw)) throw new Error('lib/snapshot-migrate.ts: not a v2 snapshot that lacks a configured league');
  const v2 = raw as unknown as Snapshot;
  const presentIds = new Set(v2.season.leagues.map((l) => l.id));
  const missing = LEAGUES.filter((l) => !presentIds.has(l.id));
  const missingDivisions = new Set<string>(missing.flatMap((l) => l.divisions.map((d) => d.id)));

  // 1. game sides
  const upgradeSides = (g: Game): Game => ({ ...g, home: upgradeSide(g.home), away: upgradeSide(g.away) });
  const games = v2.games.map(upgradeSides);
  const playoffs: Snapshot['playoffs'] = { ...v2.playoffs, games: v2.playoffs.games.map(upgradeSides) };

  // 3. season: sections and leagues from config, existing entries kept as written
  const built = buildSeason(games);
  const season: Snapshot['season'] = {
    ...v2.season,
    sections: mergeInConfigOrder(v2.season.sections, built.sections),
    leagues: mergeInConfigOrder(v2.season.leagues, built.leagues),
  };

  // 4. standings rows (and their cross-check rows) for the missing divisions, in config order
  const added = computeStandings(games, { reported: new Map() }).filter((r) => missingDivisions.has(r.division));
  const standings: Standing[] = [];
  for (const league of LEAGUES) {
    const divisions = new Set<string>(league.divisions.map((d) => d.id));
    const source = presentIds.has(league.id) ? v2.standings : added;
    standings.push(...source.filter((r) => divisions.has(r.division)));
  }
  const crossCheck = [...v2.crossCheck, ...buildCrossCheck(added)];

  // 5. one degraded health row per missing league, in config order
  const leagueHealth: LeagueHealth[] = LEAGUES.flatMap((league): LeagueHealth[] => {
    if (presentIds.has(league.id)) return v2.leagueHealth.filter((h) => h.leagueId === league.id);
    return [{
      leagueId: league.id,
      state: 'degraded',
      lastFreshAt: null,
      reasons: [addedLeagueReason(league)],
      divisions: league.divisions.map((d) => ({
        divisionId: d.id,
        meta: 'skipped',
        reportedTable: 'skipped',
        reportedRows: null,
        classification: league.rules.classification,
        official: null,
        countedFinals: 0,
        previousCountedFinals: null,
        backfilled: 0,
      })),
      teamFeeds: { total: teamsInLeague(league.id).length, ok: 0, carried: 0, failed: 0 },
    }];
  });

  const out: Snapshot = {
    ...v2,
    season,
    // 2. the registry
    teams: TEAMS.map((t) => ({ ...t })),
    games,
    standings,
    playoffs,
    leagueHealth,
    crossCheck,
    // 6. counts
    counts: countsOf(games, standings),
  };
  return out;
}

// ---------------------------------------------------------------- "rules changed" (v2 → v2)

/** The registry's `leagueDivision` of a game: set only when BOTH sides are members of one division (lib/normalize). */
function registryDivision(g: Game): DivisionId | null {
  const home = teamOfSide(g.home);
  const away = teamOfSide(g.away);
  return home && away && home.division === away.division ? home.division : null;
}

/** The divisions a file's health rows say fell back to MaxPreps' flag (the classifier's `degradedDivisions`). */
function degradedDivisionsOf(leagueHealth: readonly LeagueHealth[]): Set<DivisionId> {
  const out = new Set<DivisionId>();
  for (const h of leagueHealth) {
    for (const d of h.divisions) if (d.classification === 'fallback-contest-type') out.add(d.divisionId);
  }
  return out;
}

/** A game with its sides re-resolved and `leagueDivision` from the registry; classification runs over the list afterwards. */
function reassign(g: Game): Game {
  const home = upgradeSide(g.home);
  const away = upgradeSide(g.away);
  return { ...g, home, away, leagueDivision: registryDivision({ ...g, home, away }) };
}

/**
 * A v2 object with at least one game that no longer classifies as written: its `leagueDivision` is not what
 * the registry says now, or its `countsFor` is not what `classifyGame` returns under the current rules (with the
 * file's own degraded set). False for anything else, including a file `parseSnapshot` would reject for another
 * reason: that error is the caller's to report.
 */
export function needsReclassification(raw: unknown): boolean {
  if (!isObject(raw) || raw.schemaVersion !== 2 || !Array.isArray(raw.games) || !Array.isArray(raw.leagueHealth)) return false;
  try {
    const degraded = degradedDivisionsOf(raw.leagueHealth as LeagueHealth[]);
    return (raw.games as Game[]).some((g) => {
      const division = registryDivision(g);
      return division !== g.leagueDivision || classifyGame({ ...g, leagueDivision: division }, { degradedDivisions: degraded }) !== g.countsFor;
    });
  } catch {
    return false;
  }
}

/**
 * Reclassifies a v2 file under the current config (DESIGN §24.11). In order: (1) every game side in `games`
 * re-resolved by teamId, `leagueDivision` from the registry, then `postseason` and `countsFor` from the
 * pipeline's `classifyGames` with the file's own degraded set; (2) the standings rows of every division whose
 * classified games changed, recomputed by the same engine with MaxPreps' reported rows carried over (the other
 * divisions' rows stay byte-identical); (3) the cross-check from the merged rows; (4) those divisions' health
 * `countedFinals`, `backfilled` and `classification` (a rule that needs no document never falls back; the
 * other counts need a clock or a feed and stay as written); (5) those leagues' season windows; (6) `counts`.
 * Throws on input that `needsReclassification` rejects.
 */
export function reclassify(raw: unknown): unknown {
  if (!needsReclassification(raw)) throw new Error('lib/snapshot-migrate.ts: not a v2 snapshot whose games need reclassifying');
  const v2 = raw as unknown as Snapshot;
  const degraded = degradedDivisionsOf(v2.leagueHealth);

  // 1. games
  const games = classifyGames(v2.games.map(reassign), { degradedDivisions: degraded });
  const changed = new Set<DivisionId>();
  v2.games.forEach((before, i) => {
    const after = games[i];
    if (before.leagueDivision === after.leagueDivision && before.countsFor === after.countsFor) return;
    for (const d of [before.leagueDivision, after.leagueDivision, before.countsFor, after.countsFor]) if (d !== null) changed.add(d);
  });
  const changedLeagues = new Set([...changed].map((d) => leagueOfDivision(d).id));

  // 2. standings: the changed divisions' rows from the engine, the rest as written, in config order
  const reported = new Map<TeamId, ReportedRecord>();
  for (const row of v2.standings) if (row.reported) reported.set(row.teamId, row.reported);
  const recomputed = computeStandings(games, { reported });
  const standings: Standing[] = [];
  for (const league of LEAGUES) {
    for (const d of league.divisions) {
      standings.push(...(changed.has(d.id) ? recomputed : v2.standings).filter((r) => r.division === d.id));
    }
  }
  assertFullTable(standings);

  // 4. health counts of the changed divisions
  const leagueHealth: LeagueHealth[] = v2.leagueHealth.map((h) => ({
    ...h,
    divisions: h.divisions.map((d): DivisionHealth => {
      if (!changed.has(d.divisionId)) return d;
      const counted = divisionGames(games, d.divisionId);
      const rule = leagueOfDivision(d.divisionId).rules.classification;
      return {
        ...d,
        classification: rule === 'contest-type' || rule === 'membership' ? rule : d.classification,
        countedFinals: counted.length,
        backfilled: counted.filter((g) => g.provenance.scores === 'sblive').length,
      };
    }),
  }));

  // 5. season windows of the changed leagues (`lastLeagueGame` reads countsFor)
  const season: Snapshot['season'] = {
    ...v2.season,
    leagues: v2.season.leagues.map((l) => (changedLeagues.has(l.id) ? { ...l, window: leagueWindowOf(games, l.id) } : l)),
  };

  const out: Snapshot = {
    ...v2,
    season,
    games,
    standings,
    // 3. cross-check
    crossCheck: buildCrossCheck(standings),
    leagueHealth,
    // 6. counts
    counts: countsOf(games, standings),
  };
  return out;
}
