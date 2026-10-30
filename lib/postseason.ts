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
 * The quarterfinal (5 at 4, 6 at 3) and semifinal (3-6) seat numbers follow the 2026 sheet and are written
 * here, not derived from config; the qualifier count and the last place come from `LeagueConfig.postseason`.
 * The sheet's "(lowest seed (3-6) left in the tournament) at (1st)" means lowest-RANKED: in 2025 #5 University
 * upset #4 Lick-Wilmerding and the semifinals were #5 University at #1 Redwood, #3 Marin Catholic at #2 Tamalpais.
 *
 * `sixthPlaceRule` takes the play-in pair (or the 2-0 sweep) from the standings engine itself
 * (lib/standings.ts `lastSpotOutcome`: seed-one-restart + MCAL's last tournament place, SPEC §5.4/§5.4b),
 * so its contenders are exactly the teams the table shows sharing 6th with `resolvedBy: 'play-in'`.
 *
 * Only a 'league-tournament' league (MCAL) reaches this module. Of the nine leagues, SCVAL, BVAL and PCAL go
 * to CCS ('ccs-ladder'), and the EAL's Super Regional ('unbracketed-tournament') publishes no format or
 * bracket, so none is drawn for it. The two Southern California kinds get no projection either, and their
 * standings statuses come from their ladders alone (lib/standings.ts playoffStatusFor): the Sunset
 * ('no-postseason': the CIF Southern Section holds no field hockey playoffs, Blue Book 2026-27 Bylaws
 * 2011.1 and 3500.2) has one rung, 'no-postseason', for every place; the San Diego leagues
 * ('section-playoffs': the Section places Open 8, Division I 12 and Division II 12 from its power
 * rankings, Green Book 2026-27 Bylaw 2000.1) have 'tournament' for 1st (a designated champion's
 * guaranteed play-in) and 'selection' below, and no bracket is drawn before the Section publishes one.
 *
 * Imports the standings engine (lib/standings.ts), lib/format.ts, lib/leagues.ts, lib/teams.ts and types.
 */

import { EN_DASH, byDateThenId, leagueClockPT, numberWord, shortDate, sideOutcome } from './format';
import { drawNumberOf, type LeagueConfig } from './leagues';
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

/**
 * Rendered on a one-goal tournament result MaxPreps does not mark as overtime (SPEC §6.2; `mayHideShootout`): a
 * shootout after two overtimes is recorded by MaxPreps as a regulation score with the tally as the goals (Tamalpais
 * 3-1 Marin Catholic, Oct 28, 2026, was 0-0; the 2025 final likewise), while a real overtime goal carries the OT
 * decider. A game the league config names in `resultNotes` prints that sourced sentence instead.
 */
export const SHOOTOUT_NOTE =
  'MCAL tournament games tied after overtime are decided by a shootout, and MaxPreps may record the shootout as goals.';

/**
 * A final whose score may hide a shootout: decided by one goal and not marked overtime by MaxPreps (an overtime
 * goal is a real goal; a shootout is entered as a regulation result). The margin rule misses a 3-1 shootout, which
 * is what `resultNotes` is for.
 */
export function mayHideShootout(game: Pick<Game, 'status' | 'home' | 'away' | 'decider'>): boolean {
  if (game.status !== 'final' || game.home.score === null || game.away.score === null) return false;
  if (game.decider === 'OT' || game.decider === '2OT' || game.decider === 'SO' || game.decider === 'FORFEIT') return false;
  return Math.abs(game.home.score - game.away.score) === 1;
}
/** Three-way tie for 5th whose two play-in teams' earlier meeting produced no winner (SPEC §6.2, verbatim). */
export const EARLIER_MEETING_NOTE =
  'The higher draw number hosts because their earlier meeting did not produce a winner (MCAL Tie-Breaking Criteria: "or # if needed").';

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

/**
 * Seeds 1..qualifiers (MCAL: 6) from the computed table (points, then the MCAL chain): the "cluster covers
 * the slot" rule. Throws, like every builder here, for a league without a league tournament.
 */
export function seedsFromStandings(
  rows: readonly Standing[], league: LeagueConfig,
): Array<{ seed: number; seat: CrossoverSeat }> {
  const ranked = rows.filter((r) => r.hasReportedResults);
  const { qualifiers } = tournamentOf(league);
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
  const drawOf = (id: TeamId): number => drawNumberOf(league.rules, slugOf(id));
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
 * pair), dated on or after the round date; the earliest such contest wins and is used once. A result the league
 * config sources in `resultNotes` carries that sentence; otherwise a one-goal result MaxPreps does not mark as
 * overtime carries the shootout caveat (`mayHideShootout`).
 */
export function matchTournamentGames(
  games: readonly Game[],
  bracket: readonly TournamentGame[],
  resultNotes: Readonly<Record<string, string>> = {},
): TournamentGame[] {
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
    const sourced = resultNotes[match.contestId];
    return { ...tg, game: match, note: sourced ?? (mayHideShootout(match) ? SHOOTOUT_NOTE : tg.note) };
  });
}

/**
 * The winner of a matched tournament game: the higher score, else the side MaxPreps marks 'W'. Exported for the
 * bracket's winner mark (components/playoffs/playoff-view.ts tournamentGameView), so the page and the engine
 * never disagree on who advanced.
 */
export function winnerOf(tg: TournamentGame): TeamSlug | null {
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

  const seeds = seedsFromStandings(own, league);
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
    [playIn] = matchTournamentGames(games, [playIn], ps.resultNotes);
    const winner = winnerOf(playIn);
    if (winner !== null) {
      const idx = seeds.findIndex((s) => s.seed === L);
      seeds[idx] = { seed: L, seat: [refOf(winner, seeds)] };
    }
  }

  const qfs = matchTournamentGames(games, quarterfinals(seeds, league), ps.resultNotes);
  const qfWinners = qfs.map(winnerWithSeed);
  const sfs = matchTournamentGames(
    games,
    semifinals(seeds, qfWinners.every((w) => w !== null) ? (qfWinners as Array<{ seed: number; slug: TeamSlug }>) : null, league),
    ps.resultNotes,
  );
  const sfWinners = sfs.map(winnerWithSeed);
  const [final] = matchTournamentGames(
    games,
    [finalGame(sfWinners.every((w) => w !== null) ? (sfWinners as Array<{ seed: number; slug: TeamSlug }>) : null, league)],
    ps.resultNotes,
  );

  const all = [...(playIn ? [playIn] : []), ...qfs, ...sfs, final];
  let status: LeagueTournamentProjection['status'];
  // A final with a result but no winner (level, no W flag) is not complete: nobody has won it.
  const finalWinner = winnerWithSeed(final);
  if (phase === 'preseason' || phase === 'regular') status = 'projected';
  else if (finalWinner !== null) status = 'complete';
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
    champion: finalWinner ? { ...refOf(finalWinner.slug, seeds), seed: finalWinner.seed } : null,
  };
}

// ---------------------------------------------------------------- a team's outcome (SPEC §6.2; DESIGN §24.13)

/**
 * Where one team stands in the tournament, read from the matched results: the champion or the runner-up once
 * the final has a winner; in the final, or alive before a next game, while it has not lost; the round it lost
 * in; below the line when it holds no seed; 'projected' while the whole picture is still read from the table.
 */
export type TournamentOutcome =
  | { kind: 'projected' }
  | { kind: 'below-line' }
  | { kind: 'champion'; game: Game; opponent: TeamSlug }
  | { kind: 'runner-up'; game: Game; opponent: TeamSlug }
  | { kind: 'in-final'; next: TournamentGame; opponent: TeamSlug | null }
  | { kind: 'lost'; round: TournamentGame['round']; game: Game; opponent: TeamSlug }
  | { kind: 'alive'; next: TournamentGame | null };

const slotNames = (slot: TournamentSlot): TeamSlug[] => (slot.kind === 'seed' ? slot.seat.map((s) => s.slug) : []);
const inSlot = (slot: TournamentSlot, slug: TeamSlug): boolean => slotNames(slot).includes(slug);

/** The other side's slug when the slot names exactly one team, else null. */
function opponentIn(tg: TournamentGame, slug: TeamSlug): TeamSlug | null {
  const other = inSlot(tg.home, slug) ? tg.away : tg.home;
  const names = slotNames(other);
  return names.length === 1 ? names[0] : null;
}

export function tournamentOutcome(p: LeagueTournamentProjection, slug: TeamSlug): TournamentOutcome {
  if (p.status === 'projected') return { kind: 'projected' };
  const all = [...(p.playIn ? [p.playIn] : []), ...p.games];
  // The latest decided game this team played, by round order (play-in, quarterfinal, semifinal, final). Read
  // before the seat check: a play-in loser holds no seat afterwards, and still "lost the play-in".
  const played = all.filter((tg) => hasResult(tg.game) && (tg.game.home.slug === slug || tg.game.away.slug === slug));
  const last = played[played.length - 1];
  if (last && last.game) {
    const g = last.game;
    const won = winnerOf(last) === slug;
    const opponent = (g.home.slug === slug ? g.away.slug : g.home.slug) ?? '';
    if (last.round === 'final') return won ? { kind: 'champion', game: g, opponent } : { kind: 'runner-up', game: g, opponent };
    if (!won) return { kind: 'lost', round: last.round, game: g, opponent };
  }
  if (!p.seeds.some((s) => s.seat.some((x) => x.slug === slug))) return { kind: 'below-line' };
  // Not out: the next game whose slot names this team and has no result yet.
  const next = all.find((tg) => !hasResult(tg.game) && (inSlot(tg.home, slug) || inSlot(tg.away, slug))) ?? null;
  if (next && next.round === 'final') return { kind: 'in-final', next, opponent: opponentIn(next, slug) };
  return { kind: 'alive', next };
}

const ROUND_WORDS: Readonly<Record<TournamentGame['round'], string>> = {
  'play-in': 'play-in', quarterfinal: 'quarterfinal', semifinal: 'semifinal', final: 'final',
};

/** '3–1' winner first, with ' in overtime' when MaxPreps marks it so. */
function scoreWords(g: Game, winner: TeamSlug): string {
  const w = g.home.slug === winner ? g.home.score : g.away.score;
  const l = g.home.slug === winner ? g.away.score : g.home.score;
  const ot = g.decider === 'OT' || g.decider === '2OT' ? ' in overtime' : '';
  return `${w}${EN_DASH}${l}${ot}`;
}

/** 'Fri Oct 30, 4 PM PT at Tamalpais' / 'Mon Oct 26, 4 PM PT at <host>' for an unplayed bracket game. */
function whenWhere(tg: TournamentGame, slug: TeamSlug): string {
  const time = leagueClockPT(tg.time);
  if (tg.site) return `${shortDate(tg.date)}, ${time} at ${tg.site}`;
  const hostSlug = slotNames(tg.home);
  const host = hostSlug.length === 1 ? hostSlug[0] : null;
  if (host === slug) return `${shortDate(tg.date)}, ${time} at home`;
  return host ? `${shortDate(tg.date)}, ${time} at ${nameOfSlug(host)}` : `${shortDate(tg.date)}, ${time}`;
}

/**
 * The outcome in words for a team's postseason line and pinned card (DESIGN §24.13): a written label (never
 * "eliminat…") and one sentence that reads the results. `ladderLabel` and `ladderSentence` are the table-based
 * words for the two cases that are not about results ('projected', 'below-line').
 */
export function tournamentOutcomeCopy(
  outcome: TournamentOutcome, slug: TeamSlug, league: LeagueConfig, ladder: { label: string; sentence: string },
): { label: string; sentence: string } {
  const ps = tournamentOf(league);
  const team = nameOfSlug(slug);
  switch (outcome.kind) {
    case 'projected':
      return ladder;
    case 'below-line':
      return { label: ladder.label, sentence: `The ${numberWord(ps.qualifiers)}-team ${ps.name} is under way without ${team}; its season ended with its last league game.` };
    case 'champion':
      return {
        label: `${ps.name} champion`,
        sentence: `${team} won the ${ps.name}, beating ${nameOfSlug(outcome.opponent)} ${scoreWords(outcome.game, slug)} in the final on ${shortDate(outcome.game.dateKey)}.`,
      };
    case 'runner-up':
      return {
        label: `${ps.name} runner-up`,
        sentence: `${team} lost the ${ps.name} final to ${nameOfSlug(outcome.opponent)}, ${scoreWords(outcome.game, outcome.opponent)}, on ${shortDate(outcome.game.dateKey)}.`,
      };
    case 'in-final':
      return {
        label: `In the ${ps.name} final`,
        sentence: outcome.opponent
          ? `${team} plays ${nameOfSlug(outcome.opponent)} in the ${ps.name} final, ${whenWhere(outcome.next, slug)}.`
          : `${team} is in the ${ps.name} final, ${whenWhere(outcome.next, slug)}; its opponent is not decided yet.`,
      };
    case 'lost':
      return {
        label: `Lost in the ${ROUND_WORDS[outcome.round]}`,
        sentence: `${team} lost its ${ps.name} ${ROUND_WORDS[outcome.round]} to ${nameOfSlug(outcome.opponent)}, ${scoreWords(outcome.game, outcome.opponent)}, on ${shortDate(outcome.game.dateKey)}.`,
      };
    case 'alive': {
      const next = outcome.next;
      if (!next) return { label: `In the ${ps.name}`, sentence: `${team} is in the ${ps.name}; its next game is listed as MaxPreps posts it.` };
      const opponent = opponentIn(next, slug);
      const vs = opponent ? nameOfSlug(opponent) : `the ${slotText(next, slug)}`;
      return { label: `In the ${ps.name}`, sentence: `${team} plays ${vs} in the ${ps.name} ${ROUND_WORDS[next.round]}, ${whenWhere(next, slug)}.` };
    }
  }
}

/**
 * Which side of a fixed-site game is the host, by the site team's slug (config `finalSite.slug`): the slot whose one
 * settled team IS the site team. Null for a game at the higher seed's field (no `site`), while the slots are not
 * settled (the winner-of labels), or when neither finalist is the host, the one case a fixed site is neutral.
 * 2026: the final is Redwood (3) at Tamalpais (1) on Tam's own turf, and MaxPreps (contest 8f8d3fe5, read
 * 2026-10-29) lists it as a Tamalpais home game, so the bracket says "at" like the game page, never "vs"; the
 * General Rules (Playoffs 5) say such a game "should not be considered" a home contest, which is about gate and
 * scheduling, not about who plays on its own field.
 */
export function fixedSiteHost(tg: TournamentGame, siteSlug: TeamSlug | null | undefined): 'home' | 'away' | null {
  if (!tg.site || !siteSlug) return null;
  if (slugOfSlot(tg.home) === siteSlug) return 'home';
  if (slugOfSlot(tg.away) === siteSlug) return 'away';
  return null;
}

/**
 * '3 Redwood at 1 Tamalpais' (visitor at host: the higher seed's field, or a fixed site whose own team is in the
 * game, `fixedSiteHost`) / '1 Archie Williams vs 2 Redwood' (a fixed site neither team calls home lists the better
 * seed first); TBD for an empty seat. The same words as the bracket row (playoff-view.ts tournamentGameView).
 */
export function tournamentGameLine(tg: TournamentGame, siteSlug: TeamSlug | null = null): string {
  const label = (slot: TournamentSlot): string => {
    if (slot.kind === 'rule') return slot.text;
    if (slot.kind === 'winner-of') return slot.label;
    const names = slot.seat.map((s) => getTeamBySlug(s.slug)?.shortName ?? s.slug);
    return `${slot.seed} ${names.length ? names.join(' or ') : 'TBD'}`;
  };
  const host = fixedSiteHost(tg, siteSlug);
  if (host === 'away') return `${label(tg.home)} at ${label(tg.away)}`;
  if (tg.site && host === null) return `${label(tg.home)} vs ${label(tg.away)}`;
  return `${label(tg.away)} at ${label(tg.home)}`;
}

/**
 * What the home lead, the home card, the page header and the OG card lead with (DESIGN §24.13): the champion's
 * sentence once the final has a winner, else the next round with an unplayed game ('Final Fri Oct 30, 4 PM PT at
 * Tamalpais: 3 Redwood at 1 Tamalpais', `tournamentGameLine` with the site team's slug), else null (every game played but the final undecided, or no round left).
 * Null too while the picture is only projected: the static round list serves then.
 */
export function tournamentHeadline(p: LeagueTournamentProjection, league: LeagueConfig): { champion: string | null; next: string | null } {
  const ps = tournamentOf(league);
  if (p.status === 'projected') return { champion: null, next: null };
  if (p.champion) {
    const final = p.games.find((tg) => tg.round === 'final');
    const g = final?.game;
    const opp = g ? (g.home.slug === p.champion.slug ? g.away.slug : g.home.slug) : null;
    const name = nameOfSlug(p.champion.slug);
    const detail = g && opp ? `, beating ${nameOfSlug(opp)} ${scoreWords(g, p.champion.slug)} in the final on ${shortDate(g.dateKey)}` : '';
    return { champion: `${name} won the ${ps.name}${detail}.`, next: null };
  }
  const all = [...(p.playIn ? [p.playIn] : []), ...p.games];
  const nextGame = all.find((tg) => !hasResult(tg.game));
  if (!nextGame) return { champion: null, next: null };
  const round = all.filter((tg) => tg.round === nextGame.round && !hasResult(tg.game));
  const title = nextGame.round === 'play-in' ? 'Play-in' : nextGame.round === 'final' ? 'Final' : `${ROUND_WORDS[nextGame.round][0].toUpperCase()}${ROUND_WORDS[nextGame.round].slice(1)}s`;
  const where = nextGame.site ? ` at ${nextGame.site}` : '';
  return { champion: null, next: `${title} ${shortDate(nextGame.date)}, ${leagueClockPT(nextGame.time)}${where}: ${round.map((tg) => tournamentGameLine(tg, ps.finalSite.slug)).join('; ')}` };
}

/** The other slot's written rule or contenders ('winner of the play-in', 'lowest-ranked remaining seed'). */
function slotText(tg: TournamentGame, slug: TeamSlug): string {
  const other = inSlot(tg.home, slug) ? tg.away : tg.home;
  if (other.kind === 'rule') return other.text.toLowerCase();
  if (other.kind === 'winner-of') return other.label.toLowerCase();
  const names = other.seat.map((s) => nameOfSlug(s.slug));
  return names.length ? `winner between ${names.join(' and ')}` : 'team to be decided';
}

