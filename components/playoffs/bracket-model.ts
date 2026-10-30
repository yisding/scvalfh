/**
 * Turning `snapshot.playoffs` (and the CCS seeds, when the owner file has them) into the rounds a bracket
 * can render — pure, and still cautious about what it claims. Rewritten 2026-10-30 (plan final-06), the
 * first version to be exercised against a real bracket: the 2025 CCS championship (its fourteen MaxPreps rows
 * in data/prior-season.json and its sixteen seeds in data/history-brackets-2025-26.json) is rebuilt on 2026's
 * dates in tests/fixtures/ccs/bracket-2025.ts, and tests/ui/bracket-model.test.ts holds this model to it.
 *
 * WHAT THE SNAPSHOT CARRIES NOW. `playoffs.games` is the `Game[]` lib/ccs-bracket.ts derives: every game
 * tagged 'ccs' that is dated in the bracket or that MaxPreps marks published. Since 2026-10-29 a game can
 * carry `Game.bracket` (lib/normalize.ts): MaxPreps' `bracketName`, 'Division 1' / 'Division 2' for the CCS,
 * which is the division label the feed gives and nothing else does (`Game.leagueDivision` is a LEAGUE
 * division, meaningless for a field drawn from SCVAL, BVAL and PCAL). Seeds come only from the owner file
 * (lib/ccs-bracket.ts getCcsSeeds; null until it is filled). The CCS's own two divisions are `format.ccsDivisions`
 * and are always called "CCS Division 1" / "CCS Division 2" in copy, never a bare "Division 1" that could be
 * read as a league division. So:
 *
 *  - **A game's division is proved, never guessed, in this order**: `game.bracket.name` when it names a CCS
 *    division; else the seeds list that holds one of its sides; else the connected component the game is in
 *    (a single-elimination bracket is a tree, so two divisions are two components once games are joined on
 *    the teams they share) when that component holds a game whose division is known; else unknown. Paths are
 *    one per known division, in config order, named `CCS Division 1` / `CCS Division 2`. Games whose division
 *    is unknown render as before: two independent components become `Bracket 1` / `Bracket 2`; anything else
 *    (one component, more components than divisions, a game with no identifiable team) is ONE path named
 *    `CCS bracket`, which is what today's eight unseeded quarterfinals would give (pinned by the tests).
 *  - **Rounds are WINDOWS on the three key dates**, not exact dates: before the quarterfinals' date is
 *    'other' (a published game MaxPreps lists early, named by its date), [quarterfinals, semifinals) is the
 *    quarterfinals, [semifinals, finals) the semifinals, the finals' date and after the final. A quarterfinal
 *    moved to Mon Nov 9 stays a quarterfinal; the card prints its own date.
 *  - **Seeds go onto cards when the owner file has them**, matched by slug (then the team's MaxPreps id and
 *    lowercased name, for a side the feed names without our slug). With seeds known the quarterfinals are in
 *    the slot order [1, 4, 3, 2] by the higher seed (1v8, 4v5, 3v6, 2v7 is the pairing SET the 2025 CCS and
 *    San Diego brackets confirm; the slot ORDER is this model's convention, so the semifinal connectors
 *    PlayoffBracket.tsx draws are true: slots 1 and 2 feed the first semifinal), and the semifinal holding the
 *    lowest of {1, 8, 4, 5} comes first. Without seeds a round keeps the games' own order (date, then id).
 *  - **An unplayed slot is a pairing card, never a blank box** (DESIGN §7.11): with seeds known, a quarterfinal
 *    MaxPreps has not listed yet is the CCS's own pairing from the seeds; a later round's side is the winner of
 *    the game that feeds it when that game is final, else 'Winner of 1 v 8'. Without seeds nothing is drawn
 *    for a missing game: `pendingRounds` names the rounds with no game and no pairing, for a sentence.
 *  - **Nothing is invented.** No seed without the file, no division without the feed's label or the file,
 *    no pairing without seeds.
 */

import { isoDateKey, shortDate, timeOfDayPT } from '../../lib/format';
import { getTeamBySlug } from '../../lib/teams';
import type { CcsSeeds } from '../../lib/ccs-bracket-schema';
import type { CcsDivisionName, CcsPlayoffs, Game, GameSide } from '../../lib/types';

export type RoundKey = 'quarterfinals' | 'semifinals' | 'finals' | 'other';

/** One side of a pairing card: a seeded team (its registry slug when it is one of ours). */
export interface SeedSide {
  seed: number;
  slug: string | null;
  /** The team's name as the card prints it (the registry's short name for a registry team). */
  name: string;
}

/** A side that is not known yet: the winner of the game between two seeded sides ('Winner of 1 v 8'), higher seed first. */
export interface WinnerOfSide {
  winnerOf: [SeedSide, SeedSide];
}

/** A side two rounds away from any known team (the final while a semifinal's own sides are still winners-of). */
export interface TbdSide {
  tbd: true;
}

export type PairingSide = SeedSide | WinnerOfSide | TbdSide;

export function isWinnerOf(side: PairingSide): side is WinnerOfSide {
  return 'winnerOf' in side;
}

export function isTbd(side: PairingSide): side is TbdSide {
  return 'tbd' in side;
}

export function isSeedSide(side: PairingSide): side is SeedSide {
  return 'seed' in side;
}

/** A game MaxPreps lists, with the seed of each side when the owner file names it. */
export interface BracketGame {
  kind: 'game';
  game: Game;
  seeds: { home: number | null; away: number | null };
  /** 'Sat Nov 7 · 4:00 PM PT' or 'Mon Nov 9 · time TBA': what an unplayed card prints. */
  when: string;
}

/** A slot no game fills yet, drawn from the seeds: the top side is the visitor (the lower seed), the bottom the host. */
export interface BracketPairing {
  kind: 'pairing';
  id: string;
  top: PairingSide;
  bottom: PairingSide;
}

export type BracketCard = BracketGame | BracketPairing;

export interface BracketRound {
  key: RoundKey;
  /** 'Quarterfinals' | 'Semifinals' | 'Final' | 'Thu Nov 5' */
  name: string;
  /** The round's configured date ('other': the games' date). */
  dateKey: string;
  /** 'Sat Nov 7' */
  dateLabel: string;
  cards: BracketCard[];
}

export interface BracketPath {
  id: string;
  /** The CCS division when it is known, from the feed's bracket name or the seed file. */
  division: CcsDivisionName | null;
  /** 'CCS Division 1' / 'CCS Division 2'; 'CCS bracket' when one unproven path; 'Bracket 1' / 'Bracket 2' when two. */
  name: string;
  rounds: BracketRound[];
}

const PLACEHOLDER = /^(tbd|tba|to be determined|winner|loser)\b/i;

/** true when a side names a real school rather than an unfilled slot. */
export function isNamedSide(side: GameSide): boolean {
  const name = side.name.trim();
  return name.length > 0 && !PLACEHOLDER.test(name);
}

/** The identity a side is joined on: our slug, the MaxPreps id, or the printed name. */
function sideKey(side: GameSide): string {
  return side.slug ?? side.teamId ?? side.name.trim().toLowerCase();
}

function participantKeys(game: Game): string[] {
  return [game.home, game.away].filter(isNamedSide).map(sideKey);
}

// ---------------------------------------------------------------- rounds

/**
 * The round a date falls in: a window on the three key dates, so a game moved off its day keeps its round
 * (the CCS calendar's dates are the days the rounds START; a weather move lands a day or two later).
 */
export function roundKeyFor(dateKey: string, keyDates: CcsPlayoffs['keyDates']): RoundKey {
  if (dateKey >= isoDateKey(keyDates.finals)) return 'finals';
  if (dateKey >= isoDateKey(keyDates.semifinals)) return 'semifinals';
  if (dateKey >= isoDateKey(keyDates.quarterfinals)) return 'quarterfinals';
  return 'other';
}

const ROUND_NAMES: Record<Exclude<RoundKey, 'other'>, string> = {
  quarterfinals: 'Quarterfinals',
  semifinals: 'Semifinals',
  finals: 'Final',
};

const NAMED_ROUNDS: ReadonlyArray<Exclude<RoundKey, 'other'>> = ['quarterfinals', 'semifinals', 'finals'];

function roundDate(key: Exclude<RoundKey, 'other'>, keyDates: CcsPlayoffs['keyDates']): string {
  return isoDateKey(keyDates[key]);
}

/** What an unplayed card prints under its two lines. */
function whenOf(game: Game): string {
  if (game.isDateTba) return 'Date TBA';
  return `${shortDate(game.dateLocal)} · ${game.isTimeTba ? 'time TBA' : timeOfDayPT(game.dateLocal)}`;
}

// ---------------------------------------------------------------- seeds

/** One division's seeds, with every key a side might be matched on. */
interface DivisionSeeds {
  name: CcsDivisionName;
  bySeed: Map<number, SeedSide>;
  /** slug, MaxPreps id and lowercased name → seed */
  byKey: Map<string, number>;
}

function divisionSeeds(seeds: CcsSeeds | null): DivisionSeeds[] {
  if (!seeds) return [];
  return seeds.divisions.map((d) => {
    const bySeed = new Map<number, SeedSide>();
    const byKey = new Map<string, number>();
    for (const s of d.seeds) {
      const team = getTeamBySlug(s.slug);
      bySeed.set(s.seed, { seed: s.seed, slug: s.slug, name: team?.shortName ?? s.slug });
      byKey.set(s.slug, s.seed);
      if (team) {
        byKey.set(team.id, s.seed);
        byKey.set(team.name.toLowerCase(), s.seed);
        byKey.set(team.shortName.toLowerCase(), s.seed);
      }
    }
    return { name: d.name, bySeed, byKey };
  });
}

function seedOf(division: DivisionSeeds | undefined, side: GameSide): number | null {
  if (!division || !isNamedSide(side)) return null;
  for (const key of [side.slug, side.teamId, side.name.trim().toLowerCase()]) {
    if (key !== null) {
      const seed = division.byKey.get(key);
      if (seed !== undefined) return seed;
    }
  }
  return null;
}

function seededGame(game: Game, division: DivisionSeeds | undefined): BracketGame {
  return {
    kind: 'game',
    game,
    seeds: { home: seedOf(division, game.home), away: seedOf(division, game.away) },
    when: whenOf(game),
  };
}

function gameSeeds(card: BracketGame): number[] {
  return [card.seeds.home, card.seeds.away].filter((s): s is number => s !== null);
}

/** The winner of a final, by slug (null for a side outside the registry, a level score with no W flag, or no result). */
function winnerSlug(game: Game): string | null {
  if (game.status !== 'final') return null;
  const h = game.home.score;
  const a = game.away.score;
  if (h === null || a === null) return null;
  if (h > a) return game.home.slug;
  if (a > h) return game.away.slug;
  if (game.home.result === 'W' && game.away.result !== 'W') return game.home.slug;
  if (game.away.result === 'W' && game.home.result !== 'W') return game.away.slug;
  return null;
}

// ---------------------------------------------------------------- the seeded shape

/**
 * The CCS pairing of an eight-team division, in this model's slot order: slots 1 and 2 feed the first
 * semifinal, 3 and 4 the second. Each pair is [higher seed, lower seed].
 */
const QUARTERFINAL_SLOTS: ReadonlyArray<[number, number]> = [[1, 8], [4, 5], [3, 6], [2, 7]];
const SEMIFINAL_SLOTS: ReadonlyArray<[number, number]> = [[0, 1], [2, 3]];

function sideFor(division: DivisionSeeds, seed: number): SeedSide {
  return division.bySeed.get(seed) ?? { seed, slug: null, name: 'TBD' };
}

/**
 * A pairing card from the two sides that feed it: when both are seeded teams the higher seed (the lower
 * number) is the bottom line, the host's, and the other the top, the visitor's, as GameRow draws away over
 * home; otherwise the first feed is the bottom.
 */
function pairing(id: string, first: PairingSide, second: PairingSide): BracketPairing {
  const hostFirst = !(isSeedSide(first) && isSeedSide(second)) || first.seed <= second.seed;
  return { kind: 'pairing', id, top: hostFirst ? second : first, bottom: hostFirst ? first : second };
}

/**
 * The seeded bracket of one division: the three named rounds, each slot a game when MaxPreps lists one whose
 * sides carry the slot's seeds, else a pairing. A game whose seeds fit no slot (a side the file does not
 * name) is appended to its round as a game card, after the slots.
 */
function seededRounds(games: Game[], division: DivisionSeeds, keyDates: CcsPlayoffs['keyDates']): BracketRound[] {
  const byRound = new Map<RoundKey, BracketGame[]>();
  for (const game of games) {
    const key = roundKeyFor(game.dateKey, keyDates);
    const list = byRound.get(key) ?? [];
    list.push(seededGame(game, division));
    byRound.set(key, list);
  }
  for (const list of byRound.values()) list.sort(byGameOrder);

  /** The games of a round not yet placed in a slot. */
  const unplaced = (key: RoundKey) => byRound.get(key) ?? [];
  const take = (key: RoundKey, seeds: ReadonlySet<number>): BracketGame | null => {
    const list = unplaced(key);
    const at = list.findIndex((c) => gameSeeds(c).some((s) => seeds.has(s)));
    if (at < 0) return null;
    return list.splice(at, 1)[0];
  };

  // Quarterfinals: four slots from the seeds.
  const quarterfinals: BracketCard[] = QUARTERFINAL_SLOTS.map(([high, low], i) => {
    const game = take('quarterfinals', new Set([high, low]));
    if (game) return game;
    return pairing(`${division.name}-qf-${i + 1}`, sideFor(division, high), sideFor(division, low));
  });

  // Semifinals: each slot's side is the winner of the quarterfinal that feeds it when that game is final, else
  // "Winner of a v b" from the two seeds; a slot fed by a pairing whose own sides are unknown is TBD.
  const feeder = (card: BracketCard): PairingSide => {
    if (card.kind === 'pairing') {
      const { top, bottom } = card;
      if (isSeedSide(top) && isSeedSide(bottom)) return { winnerOf: bottom.seed < top.seed ? [bottom, top] : [top, bottom] };
      return { tbd: true };
    }
    const slug = winnerSlug(card.game);
    const seed = slug === null ? undefined : division.byKey.get(slug);
    if (seed !== undefined) return sideFor(division, seed);
    const sides = gameSeeds(card).sort((a, b) => a - b).map((s) => sideFor(division, s));
    return sides.length === 2 ? { winnerOf: [sides[0], sides[1]] } : { tbd: true };
  };
  const slotSeeds = (card: BracketCard): number[] => {
    if (card.kind === 'game') return gameSeeds(card);
    return [card.top, card.bottom].flatMap((s) => (isWinnerOf(s) ? s.winnerOf.map((x) => x.seed) : isSeedSide(s) ? [s.seed] : []));
  };
  const semifinals: BracketCard[] = SEMIFINAL_SLOTS.map(([a, b], i) => {
    const feeds = [quarterfinals[a], quarterfinals[b]];
    const seeds = new Set(feeds.flatMap(slotSeeds));
    const game = take('semifinals', seeds);
    if (game) return game;
    return pairing(`${division.name}-sf-${i + 1}`, feeder(feeds[0]), feeder(feeds[1]));
  });

  // Final: one slot, fed by both semifinals.
  const finalSeeds = new Set(semifinals.flatMap(slotSeeds));
  const finalGame = take('finals', finalSeeds);
  const finals: BracketCard[] = [
    finalGame ?? pairing(`${division.name}-final`, feeder(semifinals[0]), feeder(semifinals[1])),
  ];

  const rounds: BracketRound[] = [];
  const other = unplaced('other');
  if (other.length > 0) {
    // Games before the quarterfinals' date, by date, named by their date (nothing in the seeded shape feeds them).
    const byDate = new Map<string, BracketGame[]>();
    for (const c of other) byDate.set(c.game.dateKey, [...(byDate.get(c.game.dateKey) ?? []), c]);
    for (const [dateKey, cards] of [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      rounds.push({ key: 'other', name: shortDate(dateKey), dateKey, dateLabel: shortDate(dateKey), cards });
    }
  }
  const named: Array<[Exclude<RoundKey, 'other'>, BracketCard[]]> = [
    ['quarterfinals', quarterfinals],
    ['semifinals', semifinals],
    ['finals', finals],
  ];
  for (const [key, cards] of named) {
    const dateKey = roundDate(key, keyDates);
    rounds.push({ key, name: ROUND_NAMES[key], dateKey, dateLabel: shortDate(dateKey), cards: [...cards, ...unplaced(key)] });
  }
  return rounds;
}

function byGameOrder(a: BracketGame, b: BracketGame): number {
  return a.game.dateLocal.localeCompare(b.game.dateLocal) || a.game.contestId.localeCompare(b.game.contestId);
}

// ---------------------------------------------------------------- the unseeded shape

/** The rounds of a path with no seeds: the games it has, by round window, in date-then-id order; no pairing. */
function unseededRounds(games: Game[], keyDates: CcsPlayoffs['keyDates']): BracketRound[] {
  const byKey = new Map<string, BracketGame[]>();
  for (const game of games) {
    const key = roundKeyFor(game.dateKey, keyDates);
    const groupKey = key === 'other' ? `other:${game.dateKey}` : key;
    byKey.set(groupKey, [...(byKey.get(groupKey) ?? []), seededGame(game, undefined)]);
  }
  const rounds: BracketRound[] = [];
  for (const [groupKey, cards] of [...byKey.entries()].filter(([k]) => k.startsWith('other:')).sort(([a], [b]) => a.localeCompare(b))) {
    const dateKey = groupKey.slice('other:'.length);
    rounds.push({ key: 'other', name: shortDate(dateKey), dateKey, dateLabel: shortDate(dateKey), cards: cards.sort(byGameOrder) });
  }
  for (const key of NAMED_ROUNDS) {
    const cards = byKey.get(key);
    if (!cards) continue;
    const dateKey = roundDate(key, keyDates);
    rounds.push({ key, name: ROUND_NAMES[key], dateKey, dateLabel: shortDate(dateKey), cards: cards.sort(byGameOrder) });
  }
  return rounds;
}

// ---------------------------------------------------------------- divisions

/** Connected components over the teams the games share; a game with no identifiable team is its own component. */
function components(games: Game[]): Game[][] {
  const parent = new Map<string, string>();
  const find = (key: string): string => {
    let root = parent.get(key) ?? key;
    while (root !== (parent.get(root) ?? root)) root = parent.get(root) ?? root;
    parent.set(key, root);
    return root;
  };
  const union = (a: string, b: string) => {
    const [ra, rb] = [find(a), find(b)];
    if (ra !== rb) parent.set(ra, rb);
  };
  const keysOf = (game: Game): string[] => {
    const keys = participantKeys(game);
    return keys.length > 0 ? keys : [`game:${game.contestId}`];
  };
  for (const game of games) {
    const keys = keysOf(game);
    for (const key of keys) if (!parent.has(key)) parent.set(key, key);
    for (const key of keys.slice(1)) union(keys[0], key);
  }
  const groups = new Map<string, Game[]>();
  for (const game of games) {
    const root = find(keysOf(game)[0]);
    groups.set(root, [...(groups.get(root) ?? []), game]);
  }
  return [...groups.values()];
}

/** The division a game proves on its own: the feed's bracket name, else the seed list holding a side. */
function provenDivision(game: Game, names: ReadonlySet<CcsDivisionName>, seeds: DivisionSeeds[]): CcsDivisionName | null {
  const named = game.bracket?.name;
  if (named && names.has(named as CcsDivisionName)) return named as CcsDivisionName;
  for (const d of seeds) {
    if (seedOf(d, game.home) !== null || seedOf(d, game.away) !== null) return d.name;
  }
  return null;
}

function earliest(games: Game[]): string {
  return games.reduce((min, g) => (g.dateLocal < min ? g.dateLocal : min), games[0].dateLocal);
}

// ---------------------------------------------------------------- public

/** The CCS's two eight-team divisions as copy: 'CCS Division 1'. Always prefixed so it is never read as a league division. */
export function ccsDivisionLabels(playoffs: Pick<CcsPlayoffs, 'format'>): string[] {
  return playoffs.format.ccsDivisions.map((d) => `CCS ${d.name}`);
}

/**
 * Every bracket the snapshot and the seed file can support, in config order for known divisions, then the
 * unproven paths. Empty when nothing is published and no seed is known.
 */
export function buildBrackets(playoffs: CcsPlayoffs, seeds: CcsSeeds | null = null): BracketPath[] {
  const { keyDates } = playoffs;
  const divisions = playoffs.format.ccsDivisions.map((d) => d.name);
  const names = new Set<CcsDivisionName>(divisions);
  const seedLists = divisionSeeds(seeds).filter((d) => names.has(d.name));
  const games = playoffs.games;

  // 1. Each component's division: the one its games prove, when they agree.
  const byDivision = new Map<CcsDivisionName, Game[]>();
  const unknown: Game[][] = [];
  let conflict = false;
  for (const component of components(games)) {
    const proven = new Set(component.map((g) => provenDivision(g, names, seedLists)).filter((d): d is CcsDivisionName => d !== null));
    if (proven.size > 1) conflict = true;
    const [division] = [...proven];
    if (proven.size === 1) byDivision.set(division, [...(byDivision.get(division) ?? []), ...component]);
    else unknown.push(component);
  }

  const paths: BracketPath[] = [];
  if (!conflict) {
    // 2. One path per division that is known from the games or has seeds, in config order.
    for (const division of divisions) {
      const list = seedLists.find((d) => d.name === division);
      const divisionGames = byDivision.get(division) ?? [];
      if (divisionGames.length === 0 && !list) continue;
      paths.push({
        id: `ccs-${division.toLowerCase().replace(/\s+/g, '-')}`,
        division,
        name: `CCS ${division}`,
        rounds: list ? seededRounds(divisionGames, list, keyDates) : unseededRounds(divisionGames, keyDates),
      });
    }
  }

  // 3. The games whose division is unproven (every game, after a conflict): two independent components are
  //    'Bracket 1' / 'Bracket 2'; anything else is one 'CCS bracket'. Never a seed on these cards.
  const leftover = conflict ? [games] : unknown;
  const flat = leftover.flat();
  if (flat.length > 0) {
    const groups = !conflict && leftover.length > 1 && leftover.length <= divisions.length && paths.length === 0 ? leftover : [flat];
    const ordered = groups
      .slice()
      .sort((a, b) => earliest(a).localeCompare(earliest(b)) || b.length - a.length || a[0].contestId.localeCompare(b[0].contestId));
    ordered.forEach((group, index) => {
      paths.push({
        id: `bracket-${index + 1}`,
        division: null,
        name: ordered.length === 1 ? 'CCS bracket' : `Bracket ${index + 1}`,
        rounds: unseededRounds(group, keyDates),
      });
    });
  }
  return paths;
}

export interface PendingRound {
  key: RoundKey;
  name: string;
  dateKey: string;
  dateLabel: string;
}

/** The named rounds with no game AND no pairing in any path yet — printed as a sentence, not a box. */
export function pendingRounds(playoffs: CcsPlayoffs, paths: BracketPath[]): PendingRound[] {
  const present = new Set(paths.flatMap((p) => p.rounds.filter((r) => r.cards.length > 0).map((r) => r.key)));
  return NAMED_ROUNDS.filter((key) => !present.has(key)).map((key) => ({
    key,
    name: ROUND_NAMES[key],
    dateKey: roundDate(key, playoffs.keyDates),
    dateLabel: shortDate(playoffs.keyDates[key]),
  }));
}
