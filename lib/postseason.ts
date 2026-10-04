/**
 * MCAL tournament (SPEC §6.2): seeds, the 6th-place play-in rule, the bracket and its results. Pure.
 *
 * Ported from the research reference implementation (tests/fixtures/mcal/reference/mcal-bracket.ts.txt:
 * seedByPoints, quarterfinals, semifinals, final; 7 cases on the 2025 bracket) and adapted to `Standing[]`
 * and `LeagueConfig.postseason` ('league-tournament'):
 *   play-in  Fri Oct 23  only when two teams are level for the last place and neither swept the other 2-0
 *   QF       Mon Oct 26  qf-1: 5 at 4; qf-2: 6 at 3 (the higher seed's field)
 *   SF       Wed Oct 28  re-seeded: the LARGER remaining seed number at #1 (sf-1), the smaller at #2 (sf-2)
 *   final    Fri Oct 30  at Tamalpais, a fixed site whoever the finalists are
 * The sheet's "(lowest seed (3-6) left in the tournament) at (1st)" means lowest-RANKED: in 2025 #5 University
 * upset #4 Lick-Wilmerding and the semifinals were #5 University at #1 Redwood, #3 Marin Catholic at #2 Tamalpais.
 *
 * `sixthPlaceRule` takes the play-in pair (or the 2-0 sweep) from the standings engine itself
 * (lib/standings.ts `lastSpotOutcome`: seed-one-restart + MCAL's last tournament place, SPEC §5.4/§5.4b),
 * so its contenders are exactly the teams the table shows sharing 6th with `resolvedBy: 'play-in'`.
 *
 * Only a 'league-tournament' league (MCAL) reaches this module. Of the five leagues, SCVAL, BVAL and PCAL go
 * to CCS ('ccs-ladder'), and the EAL's Super Regional ('unbracketed-tournament') publishes no format or
 * bracket, so none is drawn for it.
 *
 * Imports the standings engine (lib/standings.ts), lib/format.ts, lib/leagues.ts, lib/teams.ts and types.
 */

import { byDateThenId, sideOutcome } from './format';
import { findDivision, findLeague, type LeagueConfig } from './leagues';
import { lastSpotOutcome } from './standings';
import { getTeamById, getTeamBySlug } from './teams';
import type {
  CrossoverSeat, Game, LeagueTournamentProjection, SeasonPhase, Standing, TeamId, TeamSlug, TournamentGame,
  TournamentSlot,
} from './types';

export interface SixthPlaceDecision {
  playInNeeded: 'no' | 'yes' | 'possible';
  /** Teams contesting the last seat(s); empty when no play-in. */
  contenders: TeamSlug[];
  /** Host slug, or null when not determinable yet. */
  host: TeamSlug | null;
  /**
   * The place the play-in decides: [lastSpot.place] when a play-in is needed or possible, else []. A
   * three-way tie for 5th places the 5th seed by draw number, so the pair still plays only for this place.
   */
  seats: number[];
  note: string | null;
}

type TournamentConfig = Extract<LeagueConfig['postseason'], { kind: 'league-tournament' }>;
type Seeds = ReadonlyArray<{ seed: number; seat: CrossoverSeat }>;

/** Rendered verbatim on every one-goal tournament result (SPEC §6.2). */
export const SHOOTOUT_NOTE =
  'MCAL tournament games tied after overtime are decided by a shootout, and MaxPreps may record the shootout as goals.';
/** Three-way tie for 5th whose two play-in teams' earlier meeting produced no winner (SPEC §6.2, verbatim). */
export const EARLIER_MEETING_NOTE =
  'The higher draw number hosts because their earlier meeting did not produce a winner (MCAL Tie-Breaking Criteria: "or # if needed").';

const DEFAULT_QUALIFIERS = 6;

function tournamentOf(league: LeagueConfig): TournamentConfig {
  if (league.postseason.kind !== 'league-tournament') {
    throw new Error(`lib/postseason.ts: ${league.id} has no league tournament (postseason.kind '${league.postseason.kind}')`);
  }
  return league.postseason;
}

function roundOf(league: LeagueConfig, id: TournamentGame['id']): TournamentConfig['rounds'][number] {
  const round = tournamentOf(league).rounds.find((r) => r.id === id);
  if (!round) throw new Error(`lib/postseason.ts: ${league.id} has no tournament round '${id}'`);
  return round;
}

function makeGame(
  league: LeagueConfig, id: TournamentGame['id'], home: TournamentSlot, away: TournamentSlot, site: string | null,
): TournamentGame {
  const round = roundOf(league, id);
  return { id, round: round.round, date: round.date, time: round.time, home, away, site, game: null, note: null };
}

const clusterSize = (r: Standing): number => r.tiebreak.tiedWith.length + 1;
const seatOf = (rows: readonly Standing[]): CrossoverSeat => rows.map((r) => ({ teamId: r.teamId, slug: r.slug }));

/** Seeds 1..6 from the computed table (points, then the MCAL chain): the "cluster covers the slot" rule. */
export function seedsFromStandings(rows: readonly Standing[]): Array<{ seed: number; seat: CrossoverSeat }> {
  const ranked = rows.filter((r) => r.hasReportedResults);
  // The rows' league states its qualifier count (MCAL: 6).
  const division = rows[0] ? findDivision(rows[0].division) : undefined;
  const ps = division ? findLeague(division.leagueId)?.postseason : undefined;
  const qualifiers = ps?.kind === 'league-tournament' ? ps.qualifiers : DEFAULT_QUALIFIERS;
  const out: Array<{ seed: number; seat: CrossoverSeat }> = [];
  for (let seed = 1; seed <= qualifiers; seed++) {
    const covering = ranked.filter((r) => r.computed.place <= seed && seed < r.computed.place + clusterSize(r));
    out.push({ seed, seat: seatOf(covering) });
  }
  return out;
}

// ---------------------------------------------------------------- the 6th-place rule

const between = (g: Game, a: TeamId, b: TeamId): boolean =>
  (g.home.teamId === a && g.away.teamId === b) || (g.home.teamId === b && g.away.teamId === a);

const nameOfSlug = (slug: TeamSlug): string => getTeamBySlug(slug)?.name ?? slug;

const NO_PLAY_IN: SixthPlaceDecision = { playInNeeded: 'no', contenders: [], host: null, seats: [], note: null };

/**
 * The last tournament place (SPEC §6.2, §5.4b). The engine (lib/standings.ts `lastSpotOutcome`) decides
 * whether a play-in is needed and between whom, or that a 2-0 sweep settled it; this adds what only the
 * bracket needs: 'possible' while a league meeting the case depends on is unplayed, the host (the higher
 * draw number, or in the three-way 5-7 case the winner of the pair's earlier meeting) and the notes.
 */
export function sixthPlaceRule(rows: readonly Standing[], games: readonly Game[], league: LeagueConfig): SixthPlaceDecision {
  const L = tournamentOf(league).lastSpot.place;
  const outcome = lastSpotOutcome(rows, games, league);
  if (outcome === null) return NO_PLAY_IN;

  const slugById = new Map(rows.map((r) => [r.teamId, r.slug]));
  const slugOf = (id: TeamId): TeamSlug => slugById.get(id) ?? getTeamById(id)?.slug ?? id;
  if (outcome.kind === 'sweep') {
    const [w, l] = [slugOf(outcome.winner), slugOf(outcome.loser)];
    return { ...NO_PLAY_IN, note: `${nameOfSlug(w)} won both meetings with ${nameOfSlug(l)}, so no play-in is needed.` };
  }

  const divisionIds = new Set(league.divisions.map((d) => d.id));
  const counted = games.filter((g) => g.countsFor !== null && divisionIds.has(g.countsFor));
  const finals = counted.filter((g) => g.status === 'final' && g.home.score !== null && g.away.score !== null);
  const [a, b] = outcome.pair;
  // Unplayed = fewer than two final meetings (double round robin) between any two teams the case depends on.
  const group = outcome.group;
  let unplayed = false;
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      if (finals.filter((g) => between(g, group[i], group[j])).length < 2) unplayed = true;
    }
  }
  const draws = league.rules.drawNumbers ?? {};
  const drawOf = (id: TeamId): number => draws[slugOf(id)] ?? 0;
  const higherDraw = drawOf(a) >= drawOf(b) ? a : b;
  let host: TeamId = higherDraw;
  let note: string | null = null;
  if (outcome.fifth !== null) {
    // Three-way tie for 5th: the winner of the pair's earlier meeting hosts, else the higher draw number.
    const earlier = [...counted.filter((g) => between(g, a, b))].sort(byDateThenId)[0];
    const result = earlier ? sideOutcome(earlier, earlier.home.teamId === a ? 'home' : 'away') : null;
    if (result === 'W') host = a;
    else if (result === 'L') host = b;
    else note = EARLIER_MEETING_NOTE;
  }
  const contenders = [a, b].map(slugOf);
  return {
    playInNeeded: unplayed ? 'possible' : 'yes',
    contenders,
    host: slugOf(host),
    seats: [L],
    note,
  };
}

// ---------------------------------------------------------------- the bracket

function seatFor(seeds: Seeds, seed: number): CrossoverSeat {
  return seeds.find((s) => s.seed === seed)?.seat ?? [];
}

function seedSlot(seeds: Seeds, seed: number): TournamentSlot {
  return { kind: 'seed', seed, seat: seatFor(seeds, seed) };
}

function refOf(slug: TeamSlug, seeds?: Seeds): { teamId: TeamId; slug: TeamSlug } {
  for (const s of seeds ?? []) {
    const hit = s.seat.find((x) => x.slug === slug);
    if (hit) return { teamId: hit.teamId, slug };
  }
  return { teamId: getTeamBySlug(slug)?.id ?? slug, slug };
}

/** qf-1: 5 at 4; qf-2: 6 at 3 (home = the higher seed's field). An undecided 6th seat waits for the play-in. */
export function quarterfinals(seeds: Seeds, league: LeagueConfig): [TournamentGame, TournamentGame] {
  const L = tournamentOf(league).lastSpot.place;
  const sixth: TournamentSlot = seatFor(seeds, L).length > 1
    ? { kind: 'winner-of', gameId: 'play-in', label: 'Play-in winner' }
    : seedSlot(seeds, L);
  return [
    makeGame(league, 'qf-1', seedSlot(seeds, 4), seedSlot(seeds, 5), null),
    makeGame(league, 'qf-2', seedSlot(seeds, 3), sixth, null),
  ];
}

/**
 * Re-seeded semifinals: once both quarterfinal winners are known, the LARGER seed number plays at #1 (sf-1)
 * and the smaller at #2 (sf-2). Before that the away slots are the written rules.
 */
export function semifinals(
  seeds: Seeds, qfWinners: ReadonlyArray<{ seed: number; slug: TeamSlug }> | null, league: LeagueConfig,
): [TournamentGame, TournamentGame] {
  let toOne: TournamentSlot = { kind: 'rule', text: 'Lowest-ranked remaining seed' };
  let toTwo: TournamentSlot = { kind: 'rule', text: 'Highest-ranked remaining seed of 3-6' };
  if (qfWinners !== null) {
    if (qfWinners.length !== 2 || qfWinners.some((w) => w.seed < 3 || w.seed > 6)) {
      throw new Error('lib/postseason.ts: semifinals need exactly two quarterfinal winners seeded 3-6');
    }
    const [best, worst] = [...qfWinners].sort((a, b) => a.seed - b.seed);
    toOne = { kind: 'seed', seed: worst.seed, seat: [refOf(worst.slug, seeds)] };
    toTwo = { kind: 'seed', seed: best.seed, seat: [refOf(best.slug, seeds)] };
  }
  return [
    makeGame(league, 'sf-1', seedSlot(seeds, 1), toOne, null),
    makeGame(league, 'sf-2', seedSlot(seeds, 2), toTwo, null),
  ];
}

/** The final, at the league's fixed site (Tamalpais) whoever the finalists are; better seed listed first. */
export function finalGame(sfWinners: ReadonlyArray<{ seed: number; slug: TeamSlug }> | null, league: LeagueConfig): TournamentGame {
  const site = tournamentOf(league).finalSite.label;
  if (sfWinners === null) {
    return makeGame(
      league, 'final',
      { kind: 'winner-of', gameId: 'sf-1', label: 'Semifinal 1 winner' },
      { kind: 'winner-of', gameId: 'sf-2', label: 'Semifinal 2 winner' },
      site,
    );
  }
  if (sfWinners.length !== 2) throw new Error('lib/postseason.ts: the final needs exactly two semifinal winners');
  const [a, b] = [...sfWinners].sort((x, y) => x.seed - y.seed);
  return makeGame(
    league, 'final',
    { kind: 'seed', seed: a.seed, seat: [refOf(a.slug)] },
    { kind: 'seed', seed: b.seed, seat: [refOf(b.slug)] },
    site,
  );
}

/** The single slug of a resolved slot, else null. */
function slugOfSlot(slot: TournamentSlot): TeamSlug | null {
  return slot.kind === 'seed' && slot.seat.length === 1 ? slot.seat[0].slug : null;
}

const hasResult = (g: Game | null): g is Game =>
  g !== null && g.status === 'final' && g.home.score !== null && g.away.score !== null;

/**
 * Attaches each bracket game's contest: an MCAL game tagged 'mcal-tournament' between the slot teams (unordered
 * pair), dated on or after the round date; the earliest such contest wins and is used once. A one-goal result
 * carries the shootout caveat.
 */
export function matchTournamentGames(games: readonly Game[], bracket: readonly TournamentGame[]): TournamentGame[] {
  const used = new Set<string>();
  const candidates = games
    .filter((g) => g.postseason?.kind === 'mcal-tournament')
    .sort(byDateThenId);
  return bracket.map((tg) => {
    const a = slugOfSlot(tg.home);
    const b = slugOfSlot(tg.away);
    if (a === null || b === null) return { ...tg };
    const match = candidates.find((g) => {
      if (used.has(g.contestId) || g.dateKey < tg.date) return false;
      const pair = [g.home.slug, g.away.slug];
      return pair.includes(a) && pair.includes(b) && a !== b;
    });
    if (!match) return { ...tg };
    used.add(match.contestId);
    const oneGoal = hasResult(match) && Math.abs((match.home.score as number) - (match.away.score as number)) === 1;
    return { ...tg, game: match, note: oneGoal ? SHOOTOUT_NOTE : tg.note };
  });
}

/** The winner of a matched tournament game: the higher score, else the side MaxPreps marks 'W'. */
function winnerOf(tg: TournamentGame): TeamSlug | null {
  const g = tg.game;
  if (!hasResult(g)) return null;
  const h = g.home.score as number;
  const a = g.away.score as number;
  if (h > a) return g.home.slug;
  if (a > h) return g.away.slug;
  if (g.home.result === 'W') return g.home.slug;
  if (g.away.result === 'W') return g.away.slug;
  return null;
}

function seedNumberOf(slot: TournamentSlot, slug: TeamSlug): number | null {
  return slot.kind === 'seed' && slot.seat.some((s) => s.slug === slug) ? slot.seed : null;
}

function winnerWithSeed(tg: TournamentGame): { seed: number; slug: TeamSlug } | null {
  const w = winnerOf(tg);
  if (w === null) return null;
  const seed = seedNumberOf(tg.home, w) ?? seedNumberOf(tg.away, w);
  return seed === null ? null : { seed, slug: w };
}

/** The whole MCAL tournament picture (SPEC §6.2), resolved round by round from the matched results. */
export function buildLeagueTournament(
  league: LeagueConfig, rows: readonly Standing[], games: readonly Game[], phase: SeasonPhase, asOf: string,
): LeagueTournamentProjection {
  const ps = tournamentOf(league);
  const L = ps.lastSpot.place;
  const divisionIds = new Set(league.divisions.map((d) => d.id));
  const own = rows.filter((r) => divisionIds.has(r.division));
  const decision = sixthPlaceRule(own, games, league);

  const seeds = seedsFromStandings(own).slice(0, ps.qualifiers);
  if (decision.playInNeeded !== 'no') {
    const idx = seeds.findIndex((s) => s.seed === L);
    if (idx >= 0) seeds[idx] = { seed: L, seat: decision.contenders.map((slug) => refOf(slug, seeds)) };
  }

  let playIn: TournamentGame | null = null;
  if (decision.playInNeeded !== 'no') {
    const host = decision.host ?? decision.contenders[0];
    const visitor = decision.contenders.find((s) => s !== host) ?? decision.contenders[1];
    playIn = makeGame(
      league, 'play-in',
      { kind: 'seed', seed: L, seat: [refOf(host, seeds)] },
      { kind: 'seed', seed: L, seat: [refOf(visitor, seeds)] },
      null,
    );
    [playIn] = matchTournamentGames(games, [playIn]);
    const winner = winnerOf(playIn);
    if (winner !== null) {
      const idx = seeds.findIndex((s) => s.seed === L);
      seeds[idx] = { seed: L, seat: [refOf(winner, seeds)] };
    }
  }

  const qfs = matchTournamentGames(games, quarterfinals(seeds, league));
  const qfWinners = qfs.map(winnerWithSeed);
  const sfs = matchTournamentGames(
    games,
    semifinals(seeds, qfWinners.every((w) => w !== null) ? (qfWinners as Array<{ seed: number; slug: TeamSlug }>) : null, league),
  );
  const sfWinners = sfs.map(winnerWithSeed);
  const [final] = matchTournamentGames(
    games,
    [finalGame(sfWinners.every((w) => w !== null) ? (sfWinners as Array<{ seed: number; slug: TeamSlug }>) : null, league)],
  );

  const all = [...(playIn ? [playIn] : []), ...qfs, ...sfs, final];
  let status: LeagueTournamentProjection['status'];
  if (phase === 'preseason' || phase === 'regular') status = 'projected';
  else if (hasResult(final.game)) status = 'complete';
  else if (all.some((tg) => hasResult(tg.game))) status = 'in-progress';
  else status = 'seeded';

  return {
    leagueId: league.id,
    asOf,
    status,
    seeds,
    playInNeeded: decision.playInNeeded,
    playIn,
    games: [...qfs, ...sfs, final],
    notes: decision.note === null ? [] : [decision.note],
  };
}
