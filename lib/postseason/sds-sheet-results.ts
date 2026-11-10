/**
 * The San Diego Section's bracket sheet as a source of playoff RESULTS (lib/sources/sds-bracket-sheet.ts reads
 * it): the games MaxPreps never gets, and the scores MaxPreps never posts.
 *
 * MaxPreps stays primary, as it is against si.com (lib/crosscheck/backfill.ts). For each result the sheet has,
 * the MaxPreps contests of the same two teams dated within two days of it, on or after the playoffs' first day
 * (the Section moves a game by a day; a postponed row is no contest), decide:
 *   1. a MaxPreps final with a score: MaxPreps' score is published as MaxPreps has it. A different winner or
 *      score is returned as a disagreement for the run log.
 *   2. a MaxPreps contest with no score yet (scheduled, live or score pending), or with a score an earlier run
 *      took from the sheet: the sheet's score is written onto it, the contest id and MaxPreps' other fields kept
 *      (`provenance.sectionSheet.rule 'score-pending'`).
 *   3. no MaxPreps contest: a new game `cifsds:<away>-at-<home>` is published from the sheet
 *      (`provenance.sectionSheet.rule 'absent-game'`). Two teams meet at most once in the Section's playoffs, so
 *      the id names the pair alone and stays the same if the Section moves the game. The team with the better
 *      place in data/sds-brackets-2026.json hosts (every round to the semifinals is "@ Higher Seed" on the
 *      sheet; the first rounds' "@Highlighted Site" was the better place's field for every 2026 game MaxPreps
 *      also has); a play-in is hosted by the file's `home`. A game the sheet places elsewhere ("@ Vista High
 *      School", the finals at La Jolla High School) is at a neutral site.
 * A score the sheet's two teams level at the end is a shootout: the side the sheet advanced is marked W, as
 * MaxPreps marks the Section's shootout wins (lib/types.ts Decider 'SO'), with no tally stored.
 *
 * Every published sheet score carries `provenance.scores 'cifsds-sheet'`, the note the game page prints, and the
 * sheet's URL (`urls.cifsds`). A MaxPreps contest posted later for a `cifsds:` game takes its place (rule 1 or 2
 * applies instead of 3) and lib/pipeline/steps/assemble.ts supersededGamesOf maps the old id to it.
 *
 * The sheet's FIXTURES (both teams known, no score yet) give the games' times, MaxPreps first again:
 *   4. a MaxPreps contest on the same date with no time ("time TBA"): the sheet's time is written onto it
 *      (`provenance.schedule 'cifsds-sheet'`); a contest MaxPreps times is left as it is.
 *   5. no MaxPreps contest: the game is published from the sheet as `cifsds:<away>-at-<home>`, scheduled (score
 *      pending once its day has passed), hosted as in rule 3. When its result is posted, rule 3 makes the same id
 *      final; when MaxPreps posts it, it is superseded as in rule 3.
 *
 * Pure: no I/O, no clock.
 */

import { datesAtLocal, dayDiff } from '../format';
import { CIFSDS_PREFIX, isCifsdsContestId } from '../game-id';
import { getTeamBySlug, normalizeTeamKey } from '../teams';
import type { Decider, Game, GameSide, Outcome, SectionSheetProvenance, Team, TeamSlug } from '../types';
import { winnerOf } from './game-winner';
import { sdsDivisionTeams, sdsPlaceOf } from './sds-brackets-file';
import type { SdsBracketsDivision, SdsBracketsFile } from './sds-brackets-schema';
import type { SdsSheetFixture, SdsSheetResult } from '../sources/sds-bracket-sheet';

/** A MaxPreps contest within this many days of the sheet's date is the same game. */
export const SDS_SHEET_DATE_TOLERANCE_DAYS = 2;

export function isCifsdsContest(contestId: string): boolean {
  return isCifsdsContestId(contestId);
}

/** `cifsds:<away>-at-<home>`. */
function cifsdsContestId(away: TeamSlug, home: TeamSlug): string {
  return `${CIFSDS_PREFIX}${away}-at-${home}`;
}

const ABSENT_NOTE =
  'MaxPreps has no contest for this San Diego Section playoff game, so the score is the one the Section posted on its bracket sheet';
const PENDING_NOTE = 'MaxPreps lists this game without a score, so the score is the one the Section posted on its bracket sheet';
const LISTED_NOTE =
  'MaxPreps has no contest for this San Diego Section playoff game, so its date, time and place are the ones on the Section’s bracket sheet';

export interface SdsSheetApplyInput {
  /** This run's games (any `cifsds:` game among them is decided again and dropped first). */
  games: readonly Game[];
  results: readonly SdsSheetResult[];
  /** The sheet's games with no score yet (rules 4 and 5). */
  fixtures?: readonly SdsSheetFixture[];
  /** Pacific 'YYYY-MM-DD': a fixture dated before it is score pending, not scheduled. */
  today?: string;
  file: SdsBracketsFile;
  /** The playoffs' first day (lib/postseason/sds-brackets-schema.ts sdsPlayoffWindow): no earlier contest is the game. */
  windowFirst: string;
  sheetUrl: string;
  fetchedAt: string;
}

export interface SdsSheetApplyResult {
  games: Game[];
  /** `cifsds:` games published (rule 3). */
  added: Game[];
  /** MaxPreps contests the sheet's score was written onto (rule 2). */
  filled: Game[];
  /** Results MaxPreps already has as the sheet does. */
  agreed: number;
  /** Rule 1 disagreements, as log sentences. */
  disagreements: string[];
  /** MaxPreps contests the sheet's time was written onto (rule 4). */
  timed: Game[];
  /** Scheduled `cifsds:` games published (rule 5). */
  listed: Game[];
}

function pairKey(a: TeamSlug | null, b: TeamSlug | null): string {
  return [a ?? '', b ?? ''].sort().join('~');
}

function divisionOf(file: SdsBracketsFile, id: string): SdsBracketsDivision | undefined {
  return file.divisions.find((d) => d.id === id);
}

/** Home and away for a sheet game: the play-in's `home`, else the better (lower) place. */
function hostOf(div: SdsBracketsDivision, a: TeamSlug, b: TeamSlug): { home: TeamSlug; away: TeamSlug } {
  const p = div.playIn;
  if (p && ((p.home === a && p.away === b) || (p.home === b && p.away === a))) return { home: p.home, away: p.away };
  const pa = sdsPlaceOf(div, a) ?? Number.MAX_SAFE_INTEGER;
  const pb = sdsPlaceOf(div, b) ?? Number.MAX_SAFE_INTEGER;
  return pa <= pb ? { home: a, away: b } : { home: b, away: a };
}

function outcome(mine: number, theirs: number, won: boolean): Outcome {
  if (mine !== theirs) return mine > theirs ? 'W' : 'L';
  return won ? 'W' : 'L';
}

function deciderOf(r: SdsSheetResult): Decider {
  if (r.shootout) return 'SO';
  return r.otPeriods >= 2 ? '2OT' : r.otPeriods === 1 ? 'OT' : 'REG';
}

/** The sheet's score from one side's point of view. */
function goalsFor(r: SdsSheetResult, slug: TeamSlug | null): number {
  return slug === r.winner ? r.winnerGoals : r.loserGoals;
}

/** The score fields of a final, written from the sheet onto a game whose two sides are the result's teams. */
function withSheetScore(g: Game, r: SdsSheetResult, sectionSheet: SectionSheetProvenance, sheetUrl: string, fetchedAt: string): Game {
  const side = (s: GameSide): GameSide => ({
    ...s,
    score: goalsFor(r, s.slug),
    result: outcome(goalsFor(r, s.slug), goalsFor(r, s.slug === r.winner ? r.loser : r.winner), s.slug === r.winner),
  });
  return {
    ...g,
    home: side(g.home),
    away: side(g.away),
    status: 'final',
    otPeriods: r.otPeriods,
    isOt: r.otPeriods > 0,
    isForfeit: false,
    forfeitBy: null,
    decider: deciderOf(r),
    // The sheet's tally, winner first, onto the two sides; none when it prints none ("2-2 (SO)").
    shootout:
      r.shootout && r.shootoutTally
        ? {
            home: g.home.slug === r.winner ? r.shootoutTally[0] : r.shootoutTally[1],
            away: g.away.slug === r.winner ? r.shootoutTally[0] : r.shootoutTally[1],
          }
        : null,
    urls: { ...g.urls, cifsds: sheetUrl },
    provenance: { ...g.provenance, scores: 'cifsds-sheet', sectionSheet, fetchedAt },
  };
}

function sideOf(team: Team): GameSide {
  return { teamId: team.id, slug: team.slug, name: team.name, score: null, result: null };
}

/** Whether a place the sheet names is one of the two schools' own (then that school hosts). */
function venueHost(venue: string, home: Team, away: Team): Team | null {
  const key = normalizeTeamKey(venue.replace(/\s+(?:HS|High School|High)$/i, ''));
  for (const t of [home, away]) {
    if ([t.name, t.shortName, ...t.aliases].some((n) => normalizeTeamKey(n) === key)) return t;
  }
  return null;
}

interface When {
  dateKey: string;
  time: string | null;
  venue: string | null;
  /** The host an earlier run published, kept when a result or fixture is carried forward. */
  host?: TeamSlug;
}

/** Rules 3 and 5: a game MaxPreps has no contest for, from the sheet, not yet scored. */
function sheetGame(div: SdsBracketsDivision, a: TeamSlug, b: TeamSlug, r: When, sheetUrl: string, fetchedAt: string): Game | null {
  let { home: homeSlug, away: awaySlug } =
    r.host === a ? { home: a, away: b } : r.host === b ? { home: b, away: a } : hostOf(div, a, b);
  let home = getTeamBySlug(homeSlug);
  let away = getTeamBySlug(awaySlug);
  if (!home || !away) return null;
  let site: Game['site'] = 'home';
  // A carried game (host known) has a venue only when it was at a neutral site.
  if (r.venue && r.host !== undefined) site = 'neutral';
  else if (r.venue) {
    const host = venueHost(r.venue, home, away);
    if (host === null) site = 'neutral';
    else if (host.slug === away.slug) {
      [home, away] = [away, home];
      [homeSlug, awaySlug] = [awaySlug, homeSlug];
    }
  }
  const dates = datesAtLocal(r.dateKey, r.time);
  const base: Game = {
    contestId: cifsdsContestId(awaySlug, homeSlug),
    ...dates,
    isDateTba: false,
    home: sideOf(home),
    away: sideOf(away),
    site,
    status: 'scheduled',
    isLeague: false,
    leagueDivision: home.division === away.division ? home.division : null,
    contestTypes: { home: null, away: null },
    countsFor: null,
    postseason: null,
    otPeriods: 0,
    isOt: false,
    isForfeit: false,
    forfeitBy: null,
    decider: null,
    shootout: null,
    venue: { text: site === 'neutral' ? r.venue : null },
    urls: { maxpreps: null, cifsds: sheetUrl, nfhsStream: null, goFan: null },
    provenance: { scores: 'cifsds-sheet', schedule: 'cifsds-sheet', sectionSheet: { rule: 'absent-game', note: LISTED_NOTE }, fetchedAt },
  };
  return base;
}

/** Rule 3: a game MaxPreps has no contest for, with the sheet's result. */
function absentGame(div: SdsBracketsDivision, r: SdsSheetResult, sheetUrl: string, fetchedAt: string): Game | null {
  const base = sheetGame(div, r.winner, r.loser, r, sheetUrl, fetchedAt);
  return base && withSheetScore(base, r, { rule: 'absent-game', note: ABSENT_NOTE }, sheetUrl, fetchedAt);
}

function scoreText(g: Game): string {
  return `${g.away.name} ${g.away.score}, ${g.home.name} ${g.home.score}`;
}

function sheetText(r: SdsSheetResult): string {
  const w = getTeamBySlug(r.winner)?.name ?? r.winner;
  const l = getTeamBySlug(r.loser)?.name ?? r.loser;
  return `${w} ${r.scoreText} over ${l}`;
}

/** The MaxPreps contests of a pair that can be the sheet's game dated `dateKey`, the nearest first. */
function candidatesOf(games: readonly Game[], key: string, dateKey: string, windowFirst: string): Game[] {
  return games
    .filter(
      (g) =>
        !isCifsdsContest(g.contestId) &&
        g.status !== 'postponed' &&
        !g.isDateTba &&
        g.dateKey >= windowFirst &&
        pairKey(g.home.slug, g.away.slug) === key &&
        Math.abs(dayDiff(g.dateKey, dateKey)) <= SDS_SHEET_DATE_TOLERANCE_DAYS,
    )
    .sort((a, b) => Math.abs(dayDiff(a.dateKey, dateKey)) - Math.abs(dayDiff(b.dateKey, dateKey)) || a.contestId.localeCompare(b.contestId));
}

/** The sheet's results and fixtures applied to this run's games (rules 1-5 above). */
export function applySdsSheetResults(input: SdsSheetApplyInput): SdsSheetApplyResult {
  let games = input.games.filter((g) => !isCifsdsContest(g.contestId));
  const added: Game[] = [];
  const filled: Game[] = [];
  const timed: Game[] = [];
  const listed: Game[] = [];
  const disagreements: string[] = [];
  let agreed = 0;

  for (const r of input.results) {
    const div = divisionOf(input.file, r.division);
    if (!div) continue;
    const teams = new Set(sdsDivisionTeams(div));
    if (!teams.has(r.winner) || !teams.has(r.loser) || r.winner === r.loser) continue;
    const candidates = candidatesOf(games, pairKey(r.winner, r.loser), r.dateKey, input.windowFirst);
    // A score an earlier run took from the sheet (a contest carried forward from the previous snapshot) is not
    // MaxPreps' own: the sheet's current result is written over it, so a corrected sheet score always lands.
    const scored = candidates.find(
      (g) => g.status === 'final' && g.home.score !== null && g.away.score !== null && g.provenance.scores !== 'cifsds-sheet',
    );
    if (scored) {
      // Rule 1: MaxPreps' final stands.
      const same =
        winnerOf(scored) === r.winner &&
        goalsFor(r, scored.home.slug) === scored.home.score &&
        goalsFor(r, scored.away.slug) === scored.away.score;
      if (same) agreed += 1;
      else {
        // A score si.com filled in step 08 (owner decision D2) is si.com's, not MaxPreps': the warning says whose.
        const who = scored.provenance.scores === 'sblive' ? 'si.com' : 'MaxPreps';
        disagreements.push(`${scored.contestId} (${scored.dateKey}): ${who} has ${scoreText(scored)}; the Section's sheet has ${sheetText(r)}. ${who === 'si.com' ? 'si.com’s' : 'MaxPreps’'} score is kept.`);
      }
      continue;
    }
    const pending = candidates[0];
    if (pending) {
      // Rule 2: the sheet's score onto MaxPreps' contest.
      const next = withSheetScore(pending, r, { rule: 'score-pending', note: PENDING_NOTE }, input.sheetUrl, input.fetchedAt);
      games = games.map((g) => (g.contestId === pending.contestId ? next : g));
      filled.push(next);
      continue;
    }
    // Rule 3: a game only the sheet has.
    const game = absentGame(div, r, input.sheetUrl, input.fetchedAt);
    if (game && !games.some((g) => g.contestId === game.contestId)) {
      games.push(game);
      added.push(game);
    }
  }

  const resultPairs = new Set(input.results.map((r) => pairKey(r.winner, r.loser)));
  for (const f of input.fixtures ?? []) {
    const div = divisionOf(input.file, f.division);
    if (!div) continue;
    const [a, b] = f.teams;
    const teams = new Set(sdsDivisionTeams(div));
    const key = pairKey(a, b);
    if (!teams.has(a) || !teams.has(b) || a === b || resultPairs.has(key)) continue;
    const candidates = candidatesOf(games, key, f.dateKey, input.windowFirst);
    const contest = candidates[0];
    if (contest) {
      // Rule 4: MaxPreps' contest keeps its own time; one with none, on the sheet's date, takes the sheet's.
      if (contest.isTimeTba && f.time !== null && contest.dateKey === f.dateKey && contest.status !== 'final') {
        const next: Game = {
          ...contest,
          ...datesAtLocal(contest.dateKey, f.time),
          urls: { ...contest.urls, cifsds: input.sheetUrl },
          provenance: { ...contest.provenance, schedule: 'cifsds-sheet' },
        };
        games = games.map((g) => (g.contestId === contest.contestId ? next : g));
        timed.push(next);
      }
      continue;
    }
    // Rule 5: a game only the sheet lists.
    const game = sheetGame(div, a, b, f, input.sheetUrl, input.fetchedAt);
    if (game && !games.some((g) => g.contestId === game.contestId)) {
      const pending = input.today !== undefined && game.dateKey < input.today;
      const next: Game = pending ? { ...game, status: 'score-pending' } : game;
      games.push(next);
      listed.push(next);
    }
  }
  games.sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.contestId.localeCompare(b.contestId));
  return { games, added, filled, agreed, disagreements, timed, listed };
}

/**
 * The fixtures an earlier run took from the sheet, read back from its games (a listed `cifsds:` game, or a MaxPreps
 * contest timed from the sheet), for a run that could not read a tab.
 */
export function sheetFixturesFromGames(games: readonly Game[], file: SdsBracketsFile): SdsSheetFixture[] {
  const out: SdsSheetFixture[] = [];
  for (const g of games) {
    if (g.status === 'final' || g.home.slug === null || g.away.slug === null) continue;
    if (g.provenance.scores !== 'cifsds-sheet' && g.provenance.schedule !== 'cifsds-sheet') continue;
    const div = divisionHolding(file, g);
    if (!div) continue;
    out.push({
      division: div.id,
      dateKey: g.dateKey,
      time: g.isTimeTba ? null : g.dateLocal.slice(11, 16),
      venue: g.site === 'neutral' ? g.venue.text : null,
      teams: [g.home.slug, g.away.slug],
      host: g.home.slug,
    });
  }
  return out;
}

function divisionHolding(file: SdsBracketsFile, g: Game): SdsBracketsDivision | undefined {
  return file.divisions.find((d) => {
    const teams = sdsDivisionTeams(d);
    return teams.includes(g.home.slug as TeamSlug) && teams.includes(g.away.slug as TeamSlug);
  });
}

/**
 * The results an earlier run took from the sheet, read back from its games: what a run that could not read a tab
 * publishes for that division, so a failed read never takes a result off the site.
 */
export function sheetResultsFromGames(games: readonly Game[], file: SdsBracketsFile): SdsSheetResult[] {
  const out: SdsSheetResult[] = [];
  for (const g of games) {
    if (g.provenance.scores !== 'cifsds-sheet' || g.status !== 'final' || g.home.slug === null || g.away.slug === null) continue;
    const winner = winnerOf(g);
    if (winner === null) continue;
    const div = divisionHolding(file, g);
    if (!div) continue;
    const loser = winner === g.home.slug ? g.away.slug : g.home.slug;
    const winnerGoals = (winner === g.home.slug ? g.home.score : g.away.score) ?? 0;
    const loserGoals = (winner === g.home.slug ? g.away.score : g.home.score) ?? 0;
    const shootout = g.decider === 'SO';
    const tally: [number, number] | null = g.shootout
      ? winner === g.home.slug
        ? [g.shootout.home, g.shootout.away]
        : [g.shootout.away, g.shootout.home]
      : null;
    out.push({
      division: div.id,
      dateKey: g.dateKey,
      time: g.isTimeTba ? null : g.dateLocal.slice(11, 16),
      venue: g.site === 'neutral' ? g.venue.text : null,
      winner,
      loser,
      winnerGoals,
      loserGoals,
      otPeriods: g.otPeriods,
      shootout,
      ...(tally ? { shootoutTally: tally } : {}),
      host: g.home.slug,
      scoreText: `${winnerGoals}-${loserGoals}${shootout ? ` (${tally ? `${tally[0]}-${tally[1]} ` : ''}SO)` : g.otPeriods >= 2 ? ` (${g.otPeriods}OT)` : g.otPeriods === 1 ? ' (OT)' : ''}`,
    });
  }
  return out;
}
