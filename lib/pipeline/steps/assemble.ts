/**
 * Step 13 (SPEC §7.4, §7.11): the snapshot, validated by `parseSnapshot` (a schema failure is a run
 * abort: nothing is written), the size and sources budgets (warn here, fail in tests), the
 * `snapshot.meta.json` object with its per-league rows and `commitSummary`, and the run's summary
 * line.
 */

import { ccsBracketGames } from '../../postseason/ccs-bracket';
import { contentRemovalsOf, stampContentChanges } from '../../snapshot/content-dates';
import { byDateThenId, dayDiff, localDateKey } from '../../format';
import { isOfficialContestId, isSbliveContestId } from '../../game-id';
import { baseGameSlug } from '../../game-slug';
import { withGameAliases, withGameSlugs } from '../../game-urls';
import { withFixtureGames } from '../../results/fixture-games';
import { SDS_SHEET_DATE_TOLERANCE_DAYS, isCifsdsContest } from '../../postseason/sds-sheet-results';
import { CCS } from '../../league-config/sections';
import { getLeague } from '../../leagues';
import { buildSeason } from '../../snapshot/season-build';
import { countsOf } from '../../snapshot/snapshot-migrate';
import { snapshotContentHash } from '../../snapshot/snapshot-hash';
import { parseSnapshot } from '../../snapshot/snapshot-load';
import { stableStringify } from '../../stable-json';
import { TEAMS } from '../../teams';
import type { ContestId, Game, LeagueHealth, OfficialFixture, Snapshot } from '../../types';
import { RunAbort, type SnapshotMeta } from '../contract';
import type { PipelineContext, RunState } from '../ledger';
import type { RequestCounts } from '../transport';
import type { StandingsStepResult } from './standings';

/**
 * SPEC §7.11 budgets, raised deliberately for the Southern California amendment (DESIGN-socal §2.2):
 * 49 teams in five leagues measured 980 KB with 101 source rows against 1.6 MB / 140. The 50 SoCal
 * teams roughly double the games, teams and standings rows (~1,700 B per game, ~1,140 B per team,
 * ~2,430 B per standings row, ~430 B per source row, measured on the 49-team file), so the snapshot
 * lands near 2.2-2.4 MB and the sources near 200 (1 bootstrap + 2 × 14 MaxPreps tables + 102 schedules
 * + the official, si.com, VNN and CCS rows). The caps below leave room for the rest of the season's
 * games; the measured numbers are recorded in DESIGN §24. Labels print from these constants
 * (budgetLabel), never from a literal.
 */
export const SNAPSHOT_MAX_BYTES = 3_200_000;
export const SNAPSHOT_WARN_BYTES = 2_400_000;
export const SOURCES_MAX = 280;

/** '3.2 MB' from 3_200_000: the human label of a byte budget (decimal megabytes, one decimal). */
export function budgetLabel(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

/**
 * D2 rule 10: a `sblive:<id>` game an earlier run published that a MaxPreps contest now supersedes
 * (the contest matched the same official fixture) maps to that contest, as does a `cifsds:` game (the San
 * Diego Section's bracket sheet) MaxPreps has since posted, and a game the previous build listed from a league's
 * own schedule (lib/results/fixture-games.ts) that a source lists now; the mapping is carried
 * for the rest of the season, and the game that took over inherits the superseded game's slug and aliases
 * (gameUrlsOf below), so every URL it was published at still arrives. Only keys that are no longer games and values that are games survive
 * (snapshot refinement 10); a carried target that is itself superseded now is followed to its own.
 */
export function supersededGamesOf(games: readonly Game[], previous: Snapshot | null): Record<ContestId, ContestId> {
  const ids = new Set(games.map((g) => g.contestId));
  const out: Record<ContestId, ContestId> = {};
  const byFixture = new Map<string, ContestId>();
  for (const g of games) {
    if (g.official && !isSbliveContestId(g.contestId)) byFixture.set(g.official.fixtureId, g.contestId);
  }
  for (const g of previous?.games ?? []) {
    if (!isSbliveContestId(g.contestId) || ids.has(g.contestId) || !g.official) continue;
    const winner = byFixture.get(g.official.fixtureId);
    if (winner) out[g.contestId] = winner;
  }
  // A San Diego bracket sheet game (`cifsds:`) MaxPreps has posted since: the contest of the same two teams
  // the sheet's step matched it to (lib/postseason/sds-sheet-results.ts, within SDS_SHEET_DATE_TOLERANCE_DAYS).
  // Likewise a game an earlier run listed from the fixture ledger’s listings (lib/fixtures/; `official:`) that a feed lists now, so a
  // link to a game reported before its day still leads to it.
  const prefixed = (id: ContestId): boolean => isCifsdsContest(id) || isOfficialContestId(id);
  for (const g of previous?.games ?? []) {
    if (!prefixed(g.contestId) || ids.has(g.contestId)) continue;
    const pair = [g.home.slug, g.away.slug].sort().join('~');
    const now = games
      .filter(
        (c) =>
          !prefixed(c.contestId) &&
          !isSbliveContestId(c.contestId) &&
          [c.home.slug, c.away.slug].sort().join('~') === pair &&
          Math.abs(dayDiff(c.dateKey, g.dateKey)) <= SDS_SHEET_DATE_TOLERANCE_DAYS,
      )
      .sort((a, b) => Math.abs(dayDiff(a.dateKey, g.dateKey)) - Math.abs(dayDiff(b.dateKey, g.dateKey)) || a.contestId.localeCompare(b.contestId));
    if (now[0]) out[g.contestId] = now[0].contestId;
  }
  // A game the previous build listed from a league's own schedule: not stored (its fixture stayed in
  // `officialFixtures`, and lib/data.ts made the game where the site reads the snapshot), so it is rebuilt from the
  // previous snapshot exactly as lib/data.ts built it. Its fixture is matched now: the game carrying that fixture's
  // stamp replaced it (a MaxPreps contest, else an si.com fill).
  if (previous?.officialFixtures?.length) {
    const stamped = new Map<string, ContestId>();
    for (const g of games) {
      if (!g.official || isOfficialContestId(g.contestId)) continue;
      const held = stamped.get(g.official.fixtureId);
      if (!held || (isSbliveContestId(held) && !isSbliveContestId(g.contestId))) stamped.set(g.official.fixtureId, g.contestId);
    }
    const { listed } = withFixtureGames(previous.games, previous.officialFixtures, localDateKey(previous.fetchedAt), previous.fetchedAt);
    for (const g of listed) {
      const winner = g.official ? stamped.get(g.official.fixtureId) : undefined;
      if (winner && !ids.has(g.contestId) && !(g.contestId in out)) out[g.contestId] = winner;
    }
  }
  // Carried from earlier runs: a key that is a game again drops out, and a target superseded since is followed
  // (an si.com fill MaxPreps has replaced), so an old link never ends on a page that is gone.
  for (const [from, first] of Object.entries(previous?.supersededGames ?? {})) {
    if (ids.has(from) || Object.hasOwn(out, from)) continue;
    let to = first;
    for (let hop = 0; !ids.has(to) && Object.hasOwn(out, to) && hop < 8; hop++) to = out[to];
    if (ids.has(to) && to !== from) out[from] = to;
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * `games` with their URLs (lib/game-urls.ts): each game's slug, and as aliases every segment it was published at
 * before. The previous snapshot is read as the site listed it, schedule-only games included
 * (lib/results/fixture-games.ts gives those their slugs without storing them), so a game that takes one over
 * inherits its slug and aliases. This run's schedule-only games are pages too: no stored game newly takes the
 * slug one of them is called by (its id without the prefix, which is also where proxy.ts sends its old
 * `official-` URL), and no alias may be one of their slugs.
 *
 * A game is given its id, the URL before slugs, as an alias only where it may have been published at it and
 * nothing here can say otherwise: with no previous snapshot (a first run, or a file that would not load), and for
 * a contest the previous snapshot records as gone that is back (`contentRemovals`). Anything else new was first
 * seen now, and its id was never a URL. A contest that is back also gets the slug and aliases its removal record
 * kept (ContentRemoval.slug), as the weakest claim there is: a game that has used one of them since, as its slug
 * or as an alias it still holds, keeps it.
 */
export function gameUrlsOf(
  games: readonly Game[],
  previous: Snapshot | null,
  unmatched: readonly OfficialFixture[],
  superseded: Readonly<Record<ContestId, ContestId>>,
  fetchedAt: string,
): Game[] {
  const before = previous
    ? withFixtureGames(previous.games, previous.officialFixtures ?? [], localDateKey(previous.fetchedAt), previous.fetchedAt).games
    : [];
  const today = localDateKey(fetchedAt);
  const leaveFree = withFixtureGames(games, unmatched, today, fetchedAt).listed.map(baseGameSlug);
  const slugged = withGameSlugs(games, { previous: before, superseded, leaveFree });
  const reserved = withFixtureGames(slugged, unmatched, today, fetchedAt).listed.map((g) => g.slug!);
  // Contests the previous snapshot records as gone, each with the URLs its latest such record kept.
  const known = new Set(before.map((g) => g.contestId));
  const returned = new Map<ContestId, string[]>();
  const removals = [...(previous?.contentRemovals ?? [])].sort((a, b) => a.removedAt.localeCompare(b.removedAt));
  for (const r of removals) {
    if (known.has(r.contestId)) continue;
    const had = [...(r.slug ? [r.slug] : []), ...(r.aliases ?? [])];
    if (had.length > 0 || !returned.has(r.contestId)) returned.set(r.contestId, had);
  }
  return withGameAliases(slugged, {
    previous: before,
    superseded,
    reserved,
    publishedAtLegacyParam: (g) => previous === null || returned.has(g.contestId),
    remembered: (g) => returned.get(g.contestId) ?? [],
  });
}

function sortFixtures(fixtures: readonly OfficialFixture[]): OfficialFixture[] {
  return [...fixtures].sort((a, b) => (a.dateKey === b.dateKey ? a.id.localeCompare(b.id) : a.dateKey.localeCompare(b.dateKey)));
}

/**
 * `SCVAL +3 finals · BVAL +2 · PCAL frozen (meta season mismatch) · MCAL +4 · EAL +1`. A frozen or
 * degraded league names `causeOf` its state: the cause that set it (LeagueLedger.stateCause).
 */
export function commitSummaryOf(
  health: readonly LeagueHealth[],
  causeOf: (leagueId: string) => string | undefined,
): string {
  let unitWritten = false;
  return health
    .map((h) => {
      const short = getLeague(h.leagueId).shortName;
      if (h.state === 'frozen' || h.state === 'degraded') {
        const cause = causeOf(h.leagueId);
        return `${short} ${h.state}${cause ? ` (${cause})` : ''}`;
      }
      const delta = finalsDeltaOf(h);
      const unit = unitWritten ? '' : ' finals';
      unitWritten = true;
      return `${short} ${delta >= 0 ? '+' : '-'}${Math.abs(delta)}${unit}`;
    })
    .join(' · ');
}

export function finalsDeltaOf(h: LeagueHealth): number {
  return h.divisions.reduce((sum, d) => sum + d.countedFinals - (d.previousCountedFinals ?? 0), 0);
}

export interface AssembleInput {
  state: RunState;
  table: StandingsStepResult;
  requests: RequestCounts;
}

export function stepAssemble(
  ctx: PipelineContext,
  { state, table, requests }: AssembleInput,
): { snapshot: Snapshot; meta: SnapshotMeta } {
  const fixtures = sortFixtures(state.unmatched);
  const supersededGames = supersededGamesOf(state.games, ctx.previous);
  // Each game's slug and aliases (lib/game-urls.ts), then its contentChangedAt, against the previous snapshot's copy
  // (lib/snapshot/content-dates.ts).
  const located = gameUrlsOf([...state.games].sort(byDateThenId), ctx.previous, fixtures, supersededGames, ctx.fetchedAt);
  const games = stampContentChanges(located, ctx.previous?.games ?? null, ctx.fetchedAt);
  // …and the contests that left a date since, which no game left on it records (lib/snapshot/content-dates.ts).
  const contentRemovals = contentRemovalsOf(games, ctx.previous, ctx.fetchedAt);
  const sources = ctx.sources.ordered();
  const official = state.official;
  // The SCVAL standings-PDF poll keeps its last known answer when this run could not ask.
  const officialStandingsPdfUrl =
    official.officialStandingsPdfUrl !== undefined ? official.officialStandingsPdfUrl : ctx.previous?.officialStandingsPdfUrl;
  const anyOfficial = fixtures.length > 0 || games.some((g) => g.official !== undefined);
  const secondary = state.secondary;

  const draft: Snapshot = {
    schemaVersion: 2,
    fetchedAt: ctx.fetchedAt,
    season: buildSeason(games),
    teams: TEAMS.map((t) => ({ ...t })),
    games,
    standings: table.standings,
    playoffs: {
      keyDates: { ...CCS.keyDates },
      ...(secondary.ccsCalendar ? { ccsCalendar: secondary.ccsCalendar } : {}),
      ...(secondary.keyDatesConfirmed === undefined ? {} : { keyDatesConfirmed: secondary.keyDatesConfirmed }),
      format: {
        elimination: 'single',
        ccsDivisions: CCS.ccsDivisions.map((d) => ({ name: d.name, seeds: [d.seeds[0], d.seeds[1]] as [number, number] })),
        autoQualifiers: { ...CCS.autoQualifiers },
        highSeedHostsThrough: CCS.highSeedHostsThrough,
      },
      bracketPublished: secondary.bracketPublished,
      ...(secondary.divisionsPublished ? { divisionsPublished: { ...secondary.divisionsPublished } } : {}),
      bracketUrl: CCS.bracketUrl,
      ...(secondary.brackets ? { brackets: secondary.brackets } : {}),
      // The bracket games are the 'ccs'-tagged games on or after the quarterfinals, or marked published by
      // MaxPreps' feed: the same objects as `games` (lib/postseason/ccs-bracket.ts). Empty until the committee enters them.
      games: ccsBracketGames(games, CCS.keyDates),
    },
    sources,
    leagueHealth: table.leagueHealth,
    dropped: ctx.dropped.all(),
    crossCheck: table.crossCheck,
    ...(state.sbliveCrossCheck ? { sbliveCrossCheck: state.sbliveCrossCheck } : {}),
    ...(state.cifssCrossCheck ? { cifssCrossCheck: state.cifssCrossCheck } : {}),
    ...(anyOfficial ? { officialFixtures: fixtures } : {}),
    supersededGames,
    ...(contentRemovals.length > 0 ? { contentRemovals } : {}),
    ...(officialStandingsPdfUrl === undefined ? {} : { officialStandingsPdfUrl }),
    counts: countsOf(games, table.standings),
  };

  let snapshot: Snapshot;
  try {
    snapshot = parseSnapshot(draft);
  } catch (err) {
    throw new RunAbort(`the assembled snapshot failed validation: ${(err as Error).message}`);
  }

  // Budgets: warn here, fail in tests.
  const bytes = Buffer.byteLength(stableStringify(snapshot), 'utf8');
  if (bytes > SNAPSHOT_MAX_BYTES) ctx.warn(`budget: snapshot.json is ${bytes} bytes, over the ${SNAPSHOT_MAX_BYTES}-byte budget (${budgetLabel(SNAPSHOT_MAX_BYTES)})`);
  else if (bytes > SNAPSHOT_WARN_BYTES) ctx.warn(`budget: snapshot.json is ${bytes} bytes, past the ${budgetLabel(SNAPSHOT_WARN_BYTES)} warning line of the ${SNAPSHOT_MAX_BYTES}-byte budget`);
  if (sources.length > SOURCES_MAX) ctx.warn(`budget: ${sources.length} source rows, over the ${SOURCES_MAX}-row budget`);

  const health = snapshot.leagueHealth;
  const commitSummary = commitSummaryOf(health, (id) => ctx.leagues.stateCause(id));
  const counts = snapshot.counts;
  const backfilled = snapshot.games.filter((g) => g.provenance.scores === 'sblive').length;
  const ok = sources.filter((s) => s.status === 'ok').length;

  ctx.log(
    `summary: teams ${counts.teams} · games ${counts.games} (league ${counts.leagueGames}) · ` +
      `finals ${counts.finals} · pending ${counts.pending} · backfilled ${backfilled} · ` +
      `mismatches ${counts.mismatches} · sources ok ${ok}/${sources.length} · ` +
      `requests maxpreps:${requests.maxpreps} sblive:${requests.sblive} official:${requests.official} · ` +
      `leagues ${health.map((h) => `${h.leagueId}:${h.state}`).join(' ')}`,
  );
  if (snapshot.sbliveCrossCheck) {
    const x = snapshot.sbliveCrossCheck;
    ctx.log(
      `cross-check: compared ${x.compared} · agreements ${x.agreements} · conflicts ${x.conflicts.length} · ` +
        `sblive-only scored ${x.sbliveOnlyScored.length} · backfilled ${x.backfilled.length}`,
    );
  }
  if (snapshot.cifssCrossCheck) {
    const x = snapshot.cifssCrossCheck;
    ctx.log(
      `cifss cross-check: compared ${x.compared} · agreements ${x.agreements} · conflicts ${x.conflicts.length} · ` +
        `MaxPreps unscored ${x.cifssOnlyScored.length} · not on MaxPreps ${x.notOnMaxPreps.length}`,
    );
  }
  if (snapshot.officialFixtures) {
    ctx.log(`official: ${snapshot.officialFixtures.length} official ${snapshot.officialFixtures.length === 1 ? 'fixture' : 'fixtures'} with no reported contest`);
  }
  for (const h of health) {
    for (const reason of h.reasons) ctx.log(`  ${h.leagueId} ${h.state}: ${reason}`);
  }

  const meta: SnapshotMeta = {
    fetchedAt: ctx.fetchedAt,
    // The content identity with every fetchedAt stripped: the cron commits only when THIS changes.
    contentHash: snapshotContentHash(snapshot),
    // The PACIFIC date, which is what a commit message should say.
    today: ctx.today,
    counts,
    crossCheck: snapshot.sbliveCrossCheck
      ? {
          compared: snapshot.sbliveCrossCheck.compared,
          agreements: snapshot.sbliveCrossCheck.agreements,
          conflicts: snapshot.sbliveCrossCheck.conflicts.length,
          sbliveOnlyScored: snapshot.sbliveCrossCheck.sbliveOnlyScored.length,
          backfilled: snapshot.sbliveCrossCheck.backfilled.length,
        }
      : null,
    cifssCrossCheck: snapshot.cifssCrossCheck
      ? {
          compared: snapshot.cifssCrossCheck.compared,
          agreements: snapshot.cifssCrossCheck.agreements,
          conflicts: snapshot.cifssCrossCheck.conflicts.length,
          cifssOnlyScored: snapshot.cifssCrossCheck.cifssOnlyScored.length,
          notOnMaxPreps: snapshot.cifssCrossCheck.notOnMaxPreps.length,
        }
      : null,
    officialFixturesUnmatched: snapshot.officialFixtures?.length ?? null,
    officialStandingsPdfUrl: snapshot.officialStandingsPdfUrl ?? null,
    window: snapshot.season.window,
    sources: sources.map((s) => ({ label: s.label, status: s.status, rowCount: s.rowCount ?? null })),
    warnings: ctx.logLines.filter((l) => l.startsWith('WARN ')).length,
    requests: { maxpreps: requests.maxpreps, sblive: requests.sblive, official: requests.official },
    leagues: health.map((h) => ({
      id: h.leagueId,
      state: h.state,
      countedFinals: h.divisions.reduce((n, d) => n + d.countedFinals, 0),
      finalsDelta: finalsDeltaOf(h),
      missingPast: h.divisions.reduce((n, d) => n + (d.official?.missingPast ?? d.missingLeaguePast ?? 0), 0),
      backfilled: h.divisions.reduce((n, d) => n + d.backfilled, 0),
      reasons: h.reasons,
    })),
    commitSummary,
  };
  return { snapshot, meta };
}
