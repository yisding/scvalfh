/**
 * The fixture ledger of this build's sport (lib/fixtures/shape.ts), checked at import, and the ways the pipeline
 * and the snapshot loader read it. This is the one module that knows the ledger's shape: every step that merges a
 * source into the record asks it for the slice that step works on, keyed the way the step meets the game.
 *
 * The pipeline reads the ledger once, as the editor's claims (lib/claims/editor.ts), and passes their slices
 * (`ledgerView` of those claims, the same as LEDGER_VIEW) to every rule it calls. LEDGER_VIEW itself is what the
 * rule modules' parameters default to, for the snapshot loader, the site, the JV script and the tests.
 *
 *   rejected   MaxPreps contests that are not games, or are a fixture's duplicate rows → dropped
 *              pipeline: lib/claims/sources/maxpreps.ts matchMaxpreps (applyExclusions, through exclusionsOf)
 *              default:  EXCLUSIONS, lib/snapshot/snapshot-migrate.ts
 *   dates      the day of a fixture whose MaxPreps contest is dated otherwise, by contest
 *              pipeline: lib/claims/resolve.ts resolveMaxprepsClaim (applyDateCorrection)
 *              default:  lib/pipeline/normalize.ts normalizeGames (scripts/fetch-jv.ts, tests)
 *   hosts      the host of a fixture whose MaxPreps contest lists the other school, by contest
 *              pipeline: lib/claims/resolve.ts resolveMaxprepsClaim (applyHostCorrection)
 *              default:  lib/results/host-correction.ts applyHostCorrection (lib/snapshot/snapshot-migrate.ts)
 *   results    the result of a fixture a better source records, by contest
 *              pipeline: lib/claims/resolve.ts stage `results` (finalizeResult), lib/pipeline/steps/results.ts
 *                        (correctionProblems), lib/pipeline/steps/guards.ts (the finals count)
 *              default:  lib/results/result.ts applyResultCorrection (lib/snapshot/snapshot-migrate.ts)
 *   listed     the fixtures no feed lists, as games to put on the schedule
 *              pipeline: lib/pipeline/steps/results.ts decideResults (decideAddedGames), lib/pipeline/steps/guards.ts
 *              default:  lib/results/result.ts withAddedGames (lib/snapshot/snapshot-migrate.ts), lib/jv/jv.ts
 *   moves      the day and host of a fixture linked to a league fixture, by league fixture id
 *              pipeline: lib/pipeline/steps/official.ts, sblive.ts (playedFixture), assemble.ts (fixtureGame)
 *              default:  lib/crosscheck/backfill.ts playedFixture, lib/results/fixture-games.ts fixtureGame (lib/data.ts)
 *   byContest  the fixture a MaxPreps contest is
 *              pipeline: lib/pipeline/steps/results.ts (ledgerProblems), lib/claims/from-snapshot.ts maxprepsBaseId
 *                        (a linked contest's fixture is named after the ledger's)
 *
 * `ledgerProblems` is the other direction: the ledger checked against the games the sources gave, so a fixture
 * whose linked contest is another pair, another day or another host than it states is reported, never applied.
 */

import { DATA_QUALITY } from '../league-config/data-quality';
import { findDivision, getSection, leagueOfDivision } from '../leagues';
import { SECTIONS } from '../league-config/sections';
import { isCalendarDate } from '../schema-primitives';
import { IS_BASKETBALL, IS_FIELD_HOCKEY } from '../sports/current';
import { getTeamBySlug } from '../teams';
import type { AddedGame, ContestId, Game, ResultCorrection, TeamSlug } from '../types';
import { BASKETBALL_LEDGER } from './basketball';
import { FIELD_HOCKEY_LEDGER } from './field-hockey';
import type { CanonicalFixture, FixtureCitation, FixtureLedger } from './shape';

/** A ledger with nothing in it: soccer's and volleyball's, so far, and what a test passes to read a source as it is. */
export const EMPTY_LEDGER: FixtureLedger = { fixtures: [], rejected: {} };

/** This build's sport's ledger (lib/sports/current.ts). */
export const LEDGER: FixtureLedger = IS_FIELD_HOCKEY ? FIELD_HOCKEY_LEDGER : IS_BASKETBALL ? BASKETBALL_LEDGER : EMPTY_LEDGER;

/** A fixture's day where its MaxPreps contest is dated otherwise, and the citation. */
export interface DateCorrection { dateKey: string; source: string }
/** A fixture's host where its MaxPreps contest lists the other school, and the citation. */
export interface HostCorrection extends FixtureCitation { home: TeamSlug }
/** The day and host of a fixture linked to a league fixture that the league's document dates or places otherwise. */
export interface FixtureMove { dateKey: string; home: TeamSlug; source: string }

export type DateCorrections = Readonly<Record<ContestId, DateCorrection>>;
export type HostCorrections = Readonly<Record<ContestId, HostCorrection>>;
export type ResultCorrections = Readonly<Record<ContestId, ResultCorrection>>;
export type FixtureMoves = Readonly<Record<string, FixtureMove>>;

export interface LedgerView {
  /** The fixture a MaxPreps contest is, by contest id. */
  byContest: ReadonlyMap<ContestId, CanonicalFixture>;
  rejected: Readonly<Record<ContestId, string>>;
  dates: DateCorrections;
  hosts: HostCorrections;
  results: ResultCorrections;
  listed: readonly AddedGame[];
  moves: FixtureMoves;
}

/** This site's own name for a fixture: its day and sides, as a game's slug is built (lib/game-slug.ts). */
export function fixtureKey(f: Pick<CanonicalFixture, 'dateKey' | 'home' | 'away'>): string {
  return `${f.dateKey}-${f.away}-at-${f.home}`;
}

/** The ledger as each step reads it (the module comment's table). */
export function ledgerView(ledger: FixtureLedger): LedgerView {
  const byContest = new Map<ContestId, CanonicalFixture>();
  const rejected: Record<ContestId, string> = { ...ledger.rejected };
  const dates: Record<ContestId, DateCorrection> = {};
  const hosts: Record<ContestId, HostCorrection> = {};
  const results: Record<ContestId, ResultCorrection> = {};
  const listed: AddedGame[] = [];
  const moves: Record<string, FixtureMove> = {};
  for (const f of ledger.fixtures) {
    const id = f.sources.maxpreps;
    if (id !== undefined) {
      byContest.set(id, f);
      if (f.date) dates[id] = { dateKey: f.dateKey, source: f.date.source };
      if (f.host) hosts[id] = { home: f.home, source: f.host.source, url: f.host.url };
      if (f.result) results[id] = f.result;
    }
    Object.assign(rejected, f.sources.maxprepsDuplicates ?? {});
    if (f.listing) listed.push({ dateKey: f.dateKey, home: f.home, away: f.away, ...f.listing });
    if (f.sources.official !== undefined && f.date) moves[f.sources.official] = { dateKey: f.dateKey, home: f.home, source: f.date.source };
  }
  return { byContest, rejected, dates, hosts, results, listed, moves };
}

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const OFFICIAL_FIXTURE_RE = /^([a-z0-9-]+):(\d{4}-\d{2}-\d{2}):([a-z0-9-]+)@([a-z0-9-]+)$/;

/** One sentence without a final period. */
const isCitation = (s: string): boolean => s.trim() !== '' && !/\.$/.test(s.trim());

/**
 * Throws `lib/fixtures: <message>` on the first entry of `ledger` that could not be a game of this sport's
 * registry: a fixture whose sides are not two registry teams or whose day is no date of a season; a contest,
 * league fixture or (day, pair) named twice; a fact with no citation; a result that names other teams than the
 * fixture's, or a tally that follows no level score. What a fixture's linked contest actually holds is
 * `ledgerProblems`' check, which needs the games.
 */
export function assertLedger(ledger: FixtureLedger): void {
  const fail = (m: string): never => {
    throw new Error(`lib/fixtures: ${m}`);
  };
  const contests = new Set<string>();
  const claim = (id: string, what: string): void => {
    if (!GUID_RE.test(id)) fail(`${what}: ${id} is not a contest GUID`);
    if (contests.has(id)) fail(`${what}: contest ${id} is named twice in the ledger`);
    contests.add(id);
  };
  for (const [id, why] of Object.entries(ledger.rejected)) {
    claim(id, 'rejected');
    if (!why.trim()) fail(`rejected ${id}: needs a reason`);
  }
  const keys = new Set<string>();
  const officials = new Set<string>();
  for (const f of ledger.fixtures) {
    const key = fixtureKey(f);
    const pair = `${f.dateKey}|${[f.home, f.away].sort().join('~')}`;
    if (keys.has(pair)) fail(`${key}: the pair has two fixtures on ${f.dateKey}`);
    keys.add(pair);
    if (f.home === f.away) fail(`${key}: a fixture has two sides`);
    for (const slug of [f.home, f.away]) if (!getTeamBySlug(slug)) fail(`${key}: ${slug} is not a team of the registry`);
    if (!isCalendarDate(f.dateKey)) fail(`${key}: dateKey ${f.dateKey} is not a valid YYYY-MM-DD date`);
    else if (!SECTIONS.some((s) => f.dateKey >= s.seasonWindow.start && f.dateKey <= s.seasonWindow.end)) {
      fail(`${key}: ${f.dateKey} is outside every section's season window`);
    }
    const { maxpreps, maxprepsDuplicates, official } = f.sources;
    if (maxpreps === undefined && official === undefined && !f.listing) fail(`${key}: names no source's row and has no listing`);
    if (maxpreps !== undefined) claim(maxpreps, key);
    for (const [id, why] of Object.entries(maxprepsDuplicates ?? {})) {
      claim(id, `${key} duplicates`);
      if (!why.trim()) fail(`${key} duplicate ${id}: needs a reason`);
    }
    if (maxprepsDuplicates && maxpreps === undefined) fail(`${key}: duplicate rows are duplicates of a MaxPreps contest`);
    if (f.date && !f.date.source.trim()) fail(`${key}: the date needs a source`);
    if (f.date && maxpreps === undefined && official === undefined) fail(`${key}: a date is cited against a linked source's`);
    if (f.host && !isCitation(f.host.source)) fail(`${key}: the host needs a source, one sentence without a final period`);
    if (f.host && maxpreps === undefined) fail(`${key}: a host is cited against a MaxPreps contest's`);
    if (f.result && maxpreps === undefined) fail(`${key}: a result is recorded against a MaxPreps contest's; a game no feed lists carries its own in the listing`);
    if (f.listing && maxpreps !== undefined) fail(`${key}: a game MaxPreps lists needs no listing`);
    if (f.listing && !isCitation(f.listing.source)) fail(`${key}: the listing needs a source, one sentence without a final period`);
    if (f.listing?.goals && (!(f.home in f.listing.goals) || !(f.away in f.listing.goals))) fail(`${key}: the listing's goals name the fixture's two teams`);
    for (const slug of [f.listing?.winner, f.listing?.forfeitBy]) {
      if (slug && slug !== f.home && slug !== f.away) fail(`${key}: ${slug} is neither side of the fixture`);
    }

    // A linked league fixture: a fixture id of a configured division, played on another day than the league's.
    if (official !== undefined) {
      if (officials.has(official)) fail(`${key}: league fixture ${official} is named twice in the ledger`);
      officials.add(official);
      const parts = OFFICIAL_FIXTURE_RE.exec(official);
      const division = parts ? findDivision(parts[1]) : undefined;
      if (!parts || !division) {
        fail(`${key}: ${official} is not an official fixture id of a configured division`);
      } else {
        const window = getSection(leagueOfDivision(division.id).sectionId).seasonWindow;
        if (f.dateKey < window.start || f.dateKey > window.end) fail(`${key}: ${f.dateKey} is outside its section's season window`);
        if (maxpreps === undefined) {
          if (f.dateKey === parts[2]) fail(`${key}: dateKey is the official date of ${official}`);
          if (!f.date) fail(`${key}: a league fixture played on another day needs a source`);
        }
        if (![parts[3], parts[4]].includes(f.home) || ![parts[3], parts[4]].includes(f.away)) fail(`${key}: its sides are not the two of ${official}`);
      }
    }

    // A result names the fixture's two teams' goals, the overtime played, a tally with a winner after a level
    // score, and its source; or, with no goals, the winner alone and its source.
    const c = f.result;
    if (!c) continue;
    if (!isCitation(c.source)) fail(`${key}: the result needs a source, one sentence without a final period`);
    if (c.goals === null) {
      if (!c.winner) fail(`${key}: a result with no goals names the winner`);
      if (c.winner !== f.home && c.winner !== f.away) fail(`${key}: the winner ${c.winner} is neither side of the fixture`);
      if (c.shootout !== null || c.shootoutWinner || c.otPeriods !== 0) fail(`${key}: a result with no goals records no overtime or tiebreak`);
      continue;
    }
    if (c.winner) fail(`${key}: a winner is named only where no goals are given`);
    const slugs = Object.keys(c.goals);
    if (slugs.length !== 2 || !(f.home in c.goals) || !(f.away in c.goals)) fail(`${key}: the result's goals name the fixture's two teams by slug`);
    if (Object.values(c.goals).some((n) => !Number.isInteger(n) || n < 0)) fail(`${key}: goals are whole numbers`);
    if (!Number.isInteger(c.otPeriods) || c.otPeriods < 0) fail(`${key}: otPeriods is a whole number`);
    if (c.shootoutWinner && c.shootoutWinner !== f.home && c.shootoutWinner !== f.away) fail(`${key}: the tiebreak winner ${c.shootoutWinner} is neither side of the fixture`);
    if (c.shootout) {
      const tally = slugs.map((s) => c.shootout?.[s]);
      if (Object.keys(c.shootout).length !== 2 || tally.some((n) => n === undefined || !Number.isInteger(n) || n < 0)) fail(`${key}: the shootout names the same two teams`);
      if (tally[0] === tally[1]) fail(`${key}: a shootout tally has a winner`);
      if (c.goals[slugs[0]] !== c.goals[slugs[1]]) fail(`${key}: a shootout follows a level score`);
    }
  }
}

assertLedger(LEDGER);

/** This build's sport's ledger, as each step reads it. */
export const LEDGER_VIEW: LedgerView = ledgerView(LEDGER);

/** Every contest the pipeline drops on sight: a ghost team's (DATA_QUALITY) and the ledger's rejected and duplicate rows. */
export const EXCLUSIONS = { ghostTeamIds: DATA_QUALITY.ghostTeamIds, rejected: LEDGER_VIEW.rejected };

/**
 * The fixtures whose linked MaxPreps contest, among `games` as published (after the ledger's date and host are
 * applied), is not the game the fixture states: other teams, another day, or the other school at home. One line
 * each, for the run log and a test over the committed snapshot. A fixture whose contest is not among `games` says
 * nothing here (another league's run, or a contest MaxPreps has since removed).
 */
export function ledgerProblems(games: readonly Game[], view: Pick<LedgerView, 'byContest'> = LEDGER_VIEW): string[] {
  const out: string[] = [];
  for (const g of games) {
    const f = view.byContest.get(g.contestId);
    if (!f) continue;
    const key = fixtureKey(f);
    const sides = [g.home.slug, g.away.slug];
    if (!sides.includes(f.home) || !sides.includes(f.away)) {
      out.push(`fixture ${key}: contest ${g.contestId} is ${g.away.name} at ${g.home.name}`);
      continue;
    }
    if (g.dateKey !== f.dateKey) out.push(`fixture ${key}: contest ${g.contestId} is dated ${g.dateKey}, and the fixture cites no source for its own day`);
    if (g.site === 'home' && g.home.slug !== f.home) out.push(`fixture ${key}: contest ${g.contestId} is at ${g.home.name}, and the fixture cites no source for its own host`);
  }
  return out;
}
