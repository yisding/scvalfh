/**
 * v1 → v2 snapshot migration, in memory (SPEC §4.3). Pure: no I/O, no clock.
 *
 * A v1 file (the SCVAL-only site, no `schemaVersion`) keeps loading until the first v2 run
 * replaces it. Every SCVAL value is recomputed by the same engine the v2 pipeline uses, so the
 * migrated SCVAL standings rows are byte-identical to the v1 rows (golden-gated); the three new
 * leagues are present as registry teams with no results and a `degraded` health row that says why.
 *
 * Returns v2 JSON, NOT yet parsed: the caller (`loadSnapshot`) runs it through `parseSnapshot`.
 */

import { classifyGames } from './classify';
import { CCS, LEAGUES, findDivision } from './leagues';
import { buildSeason } from './season-build';
import { assertFullTable, buildCrossCheck, computeStandings, divisionGames } from './standings';
import { TEAMS, getTeamById, getTeamBySlug, teamsInLeague } from './teams';
import type {
  DivisionHealth,
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

/** A side re-resolved by teamId through the 43-team registry (a now-registry opponent gains its slug and name). */
function upgradeSide(side: GameSide): GameSide {
  const team: Team | undefined = side.teamId ? getTeamById(side.teamId) : undefined;
  if (!team) return { ...side };
  return { ...side, slug: team.slug, name: team.name };
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
  let official: OfficialStamp | undefined;
  if (v1Official && leagueDivision !== null) {
    // v1 stamps exist only on SCVAL same-division games.
    const division = leagueDivision;
    const source = findDivision(division)?.official.source ?? 'scval-pdf';
    official = {
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
    ...(official ? { official } : {}),
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
          reasons: [
            `No ${league.shortName} data in this snapshot yet: it was written before ${league.shortName} was added.`,
          ],
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
