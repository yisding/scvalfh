/**
 * The San Diego Section's 2026 brackets, drawn from the Section's PUBLISHED bracket and joined to the
 * results MaxPreps posts (plan final-07, 2026-10-29).
 *
 * Where the brackets come from: data/sds-brackets-2026.json, which the owner transcribes from the Section's
 * bracket sheet once it is linked after the Sat Oct 31 seeding meeting (lib/sds-brackets-schema.ts says
 * why it is a hand-entered file and what it guards). The site still projects nothing: until the file is
 * filled, getSdsBrackets() is null and no San Diego bracket is drawn (DESIGN §24.8; the reversal covers the
 * Section's published bracket only).
 *
 * The template: the file gives the placed teams and the round dates; the pairings are the Section's
 * fixed template, which the 2025 sheet confirms (data/history-brackets-2025-26.json):
 *   - 12 teams: first round 8 v 9, 5 v 12, 6 v 11, 7 v 10; quarterfinals 1 v (8/9), 4 v (5/12),
 *     3 v (6/11), 2 v (7/10); places 1-4 skip the first round. A play-in, when the Section holds one,
 *     fills one place (the 11th in 2025's Division II, Helix v Granite Hills).
 *   - 8 teams: quarterfinals 1 v 8, 4 v 5, 3 v 6, 2 v 7.
 *   - Then the top two quarterfinals' winners meet in one semifinal and the bottom two in the other.
 * A team that skips a round reaches its next card from the template, never from a MaxPreps row.
 *
 * The join: a card takes the `section-playoffs`-tagged game between the two teams that can stand in its
 * places, dated from the day before its round to the day before the next round (the Section moves single
 * games by a day: 2025's Clairemont v Rancho Bernardo quarterfinal was played Thu Nov 6, not Fri Nov 7).
 * Date-TBA and postponed rows never join. A final's winner fills its place in the next round; when MaxPreps
 * has posted a later round's game but not an earlier result (2025: Del Norte v Bonita Vista is on MaxPreps,
 * Bonita Vista v Westview is not), the later game says who came through, and the earlier card shows that
 * team advancing with no score. A level final marked W and L is the Section's shootout convention
 * (lib/types.ts Decider 'SO'), so the side marked W wins it.
 *
 * Copy: the only words this module writes are a not-yet-known place ("Winner of 8 v 9", "Winner of the
 * play-in"). Places print as bare numerals; the word "seed" is banned on San Diego surfaces
 * (scripts/copy-rules.ts SEED_CLAIM), and no champion is named here (DESIGN §24.5). Rendering is
 * final-08's (components/playoffs/), not this module's.
 */

import bundledFile from '../data/sds-brackets-2026.json';
import { getGames } from './data';
import { shiftDateKey } from './format';
import { failValidation } from './schema-primitives';
import { SdsBracketsSchema, type SdsBracketsDivision, type SdsBracketsFile, type SdsDivisionId } from './sds-brackets-schema';
import type { Game, TeamSlug } from './types';

/** One place on a card: a placed team with the Section's number, or a place still to be decided. */
export type LiveBracketSlot = { seed: number; slug: TeamSlug } | { tbd: true; text: string };

export interface LiveBracketCard {
  /** `<division>-<round index>-<card index>`, stable for keys and anchors. */
  id: string;
  top: LiveBracketSlot;
  bottom: LiveBracketSlot;
  /** The joined MaxPreps game, or null when none is posted yet. */
  game: Game | null;
  /** The side that went through: the game's winner, or the side a later round's game shows came through. */
  winner: 'top' | 'bottom' | null;
  /** The game's date when joined, else the round's date from the file. */
  dateKey: string;
  /** 'HH:MM' league clock: the game's time when MaxPreps has one, else the round's published time. */
  time: string | null;
  /** The round's neutral site from the file (the finals), else null. */
  site: string | null;
}

export interface LiveBracketRound {
  name: string;
  /** The round's date from the file. */
  date: string;
  /** A play-in round (one card for one place). */
  playIn: boolean;
  cards: LiveBracketCard[];
}

export interface LiveBracketDivision {
  id: SdsDivisionId;
  label: string;
  size: 8 | 12;
  rounds: LiveBracketRound[];
}

// ---------------------------------------------------------------- the result of one game

/**
 * The winner of a game: the higher score; a level score goes to the side MaxPreps marks 'W' (the San Diego
 * shootout convention); null when the game is not final or nothing decides it. Kept here, pure, rather
 * than widening lib/postseason.ts's MCAL helper, which reads a TournamentGame.
 */
export function winnerOf(game: Game): TeamSlug | null {
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

// ---------------------------------------------------------------- the template

type Entry = { seed: number; slug: TeamSlug };
type Side = 'top' | 'bottom';
type Feed = { kind: 'placed'; entry: Entry } | { kind: 'winner'; card: Node };

interface Node {
  id: string;
  /** The round's position in the division, and the card's in its round. */
  roundIndex: number;
  index: number;
  playIn: boolean;
  feeds: Record<Side, Feed>;
  /** Join window, inclusive from, exclusive to (null: open-ended, the final). */
  from: string;
  to: string | null;
  date: string;
  time: string | null;
  site: string | null;
  // Resolution, filled by the passes below.
  game: Game | null;
  resolved: Record<Side, Entry | null>;
  winner: Side | null;
}

/** First-round pairings of a 12-team field, top to bottom. */
const FIRST_ROUND_12: ReadonlyArray<readonly [number, number]> = [
  [8, 9],
  [5, 12],
  [6, 11],
  [7, 10],
];
/** The quarterfinals' placed team of a 12-team field, card by card (its opponent is that row's first-round winner). */
const BYES_12 = [1, 4, 3, 2] as const;
/** Quarterfinal pairings of an 8-team field, top to bottom. */
const QUARTERFINALS_8: ReadonlyArray<readonly [number, number]> = [
  [1, 8],
  [4, 5],
  [3, 6],
  [2, 7],
];

const SIDES: readonly Side[] = ['top', 'bottom'];

/** The section-playoffs games a card may join: tagged, dated, not postponed, two registry sides. */
function joinable(games: readonly Game[]): Game[] {
  return games
    .filter(
      (g) =>
        g.postseason?.kind === 'section-playoffs' &&
        !g.isDateTba &&
        g.status !== 'postponed' &&
        g.home.slug !== null &&
        g.away.slug !== null,
    )
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.contestId.localeCompare(b.contestId));
}

/** The entries that can still stand in a card's place. */
function pool(feed: Feed): Entry[] {
  if (feed.kind === 'placed') return [feed.entry];
  const c = feed.card;
  const sides = c.winner ? [c.winner] : SIDES;
  return sides.flatMap((s) => {
    const e = c.resolved[s];
    return e ? [e] : pool(c.feeds[s]);
  });
}

interface TemplateRound {
  name: string;
  date: string;
  playIn: boolean;
  nodes: Node[];
}

/** Builds the division's cards from the template, round by round, with their join windows. */
function template(div: SdsBracketsDivision): TemplateRound[] {
  const placed = new Map<number, Entry>(div.seeds.map((s) => [s.seed, { seed: s.seed, slug: s.slug }]));
  const rounds: TemplateRound[] = [];
  const dates = [...(div.playIn ? [div.playIn.date] : []), ...div.rounds.map((r) => r.date)];

  const node = (roundIndex: number, index: number, feeds: Record<Side, Feed>, r: { date: string; time?: string; site?: string }, playIn = false): Node => ({
    id: `${div.id}-${roundIndex}-${index}`,
    roundIndex,
    index,
    playIn,
    feeds,
    from: shiftDateKey(r.date, -1),
    to: dates[roundIndex + 1] ?? null,
    date: r.date,
    time: r.time ?? null,
    site: r.site ?? null,
    game: null,
    resolved: { top: null, bottom: null },
    winner: null,
  });

  let playInNode: Node | null = null;
  if (div.playIn) {
    const p = div.playIn;
    playInNode = node(
      0,
      0,
      {
        top: { kind: 'placed', entry: { seed: p.forSeed, slug: p.home } },
        bottom: { kind: 'placed', entry: { seed: p.forSeed, slug: p.away } },
      },
      { date: p.date },
      true,
    );
    rounds.push({ name: 'Play-in', date: p.date, playIn: true, nodes: [playInNode] });
  }
  const at = (n: number): Feed => {
    if (div.playIn && n === div.playIn.forSeed && playInNode) return { kind: 'winner', card: playInNode };
    const entry = placed.get(n);
    if (!entry) throw new Error(`${div.id}: no team in place ${n}`);
    return { kind: 'placed', entry };
  };

  let previous: Node[] = [];
  div.rounds.forEach((r, i) => {
    const ri = rounds.length;
    let nodes: Node[];
    if (i === 0) {
      const pairs = div.size === 12 ? FIRST_ROUND_12 : QUARTERFINALS_8;
      nodes = pairs.map(([a, b], ci) => node(ri, ci, { top: at(a), bottom: at(b) }, r));
    } else if (i === 1 && div.size === 12) {
      nodes = BYES_12.map((n, ci) => node(ri, ci, { top: at(n), bottom: { kind: 'winner', card: previous[ci] } }, r));
    } else {
      nodes = Array.from({ length: previous.length / 2 }, (_, ci) =>
        node(ri, ci, { top: { kind: 'winner', card: previous[2 * ci] }, bottom: { kind: 'winner', card: previous[2 * ci + 1] } }, r),
      );
    }
    rounds.push({ name: r.name, date: r.date, playIn: false, nodes });
    previous = nodes;
  });
  return rounds;
}

/** Forward: each card, round by round, takes its game and its winner; a decided winner narrows the next card. */
function joinForward(nodes: readonly Node[], games: readonly Game[], used: Set<string>): void {
  for (const n of nodes) {
    const pools = { top: pool(n.feeds.top), bottom: pool(n.feeds.bottom) };
    const sideOf = (slug: TeamSlug | null, s: Side) => pools[s].find((e) => e.slug === slug) ?? null;
    const match = games.find((g) => {
      if (used.has(g.contestId) || g.dateKey < n.from || (n.to !== null && g.dateKey >= n.to)) return false;
      return (
        (sideOf(g.home.slug, 'top') && sideOf(g.away.slug, 'bottom')) ||
        (sideOf(g.away.slug, 'top') && sideOf(g.home.slug, 'bottom'))
      );
    });
    if (match) {
      used.add(match.contestId);
      n.game = match;
      const topIsHome = sideOf(match.home.slug, 'top') !== null && sideOf(match.away.slug, 'bottom') !== null;
      n.resolved = topIsHome
        ? { top: sideOf(match.home.slug, 'top'), bottom: sideOf(match.away.slug, 'bottom') }
        : { top: sideOf(match.away.slug, 'top'), bottom: sideOf(match.home.slug, 'bottom') };
      const w = winnerOf(match);
      n.winner = w === null ? null : n.resolved.top?.slug === w ? 'top' : 'bottom';
    } else {
      n.resolved = {
        top: pools.top.length === 1 ? pools.top[0] : null,
        bottom: pools.bottom.length === 1 ? pools.bottom[0] : null,
      };
    }
  }
}

/** Backward: a team standing in a later card came through the card that feeds that place. */
function inferBackward(nodes: readonly Node[]): void {
  for (const n of nodes) {
    for (const s of SIDES) {
      const feed = n.feeds[s];
      const entry = n.resolved[s];
      if (feed.kind !== 'winner' || entry === null || feed.card.winner !== null) continue;
      const c = feed.card;
      const side = SIDES.find((cs) => pool(c.feeds[cs]).some((e) => e.slug === entry.slug));
      if (!side) continue;
      c.winner = side;
      c.resolved[side] = entry;
    }
  }
}

/** The distinct places that can stand on one side of a card, as bare numerals ("8/9"), or null past two. */
function placeLabel(c: Node, s: Side): string | null {
  const resolved = c.resolved[s];
  if (resolved) return String(resolved.seed);
  const seeds = [...new Set(pool(c.feeds[s]).map((e) => e.seed))].sort((a, b) => a - b);
  return seeds.length <= 2 ? seeds.join('/') : null;
}

/** The words for a place a card's winner will fill: "Winner of 8 v 9", "Winner of 1 v 8/9", "Winner of the play-in". */
function tbdText(c: Node, roundSize: number): string {
  if (c.playIn) return 'Winner of the play-in';
  const top = placeLabel(c, 'top');
  const bottom = placeLabel(c, 'bottom');
  if (top !== null && bottom !== null) return `Winner of ${top} v ${bottom}`;
  // Only a 12-team final's places get here before the quarterfinals (1/8/9 v 4/5/12): name the half.
  if (roundSize === 2) return `Winner of the ${c.index === 0 ? 'top' : 'bottom'} half`;
  const all = (side: Side) => [...new Set(pool(c.feeds[side]).map((e) => e.seed))].sort((a, b) => a - b).join('/');
  return `Winner of ${all('top')} v ${all('bottom')}`;
}

/** The game's own clock time ('HH:MM') unless MaxPreps has none. */
function gameClock(g: Game): string | null {
  return g.isTimeTba ? null : g.dateLocal.slice(11, 16) || null;
}

/**
 * The live brackets: the file's three divisions, each card joined to its section-playoffs game when one
 * is posted, winners carried forward, unknown places named by the card that will fill them. Pure: the
 * caller passes the games (getSdsBrackets passes the snapshot's).
 */
export function buildSdsBrackets(file: SdsBracketsFile, games: readonly Game[]): LiveBracketDivision[] {
  const candidates = joinable(games);
  const used = new Set<string>();
  return file.divisions.map((div) => {
    const rounds = template(div);
    for (const r of rounds) joinForward(r.nodes, candidates, used);
    for (const r of [...rounds].reverse()) inferBackward(r.nodes);

    // A not-yet-known place is named by the card that will fill it ("the top half" needs that card's round size).
    const roundSizeOf = (c: Node) => rounds[c.roundIndex].nodes.length;
    const slot = (n: Node, s: Side): LiveBracketSlot => {
      const e = n.resolved[s];
      if (e) return { seed: e.seed, slug: e.slug };
      const feed = n.feeds[s];
      return { tbd: true, text: feed.kind === 'winner' ? tbdText(feed.card, roundSizeOf(feed.card)) : 'TBD' };
    };

    return {
      id: div.id,
      label: div.label,
      size: div.size,
      rounds: rounds.map((r) => ({
        name: r.name,
        date: r.date,
        playIn: r.playIn,
        cards: r.nodes.map((n) => ({
          id: n.id,
          top: slot(n, 'top'),
          bottom: slot(n, 'bottom'),
          game: n.game,
          winner: n.winner,
          dateKey: n.game?.dateKey ?? n.date,
          time: (n.game ? gameClock(n.game) : null) ?? n.time,
          site: n.site,
        })),
      })),
    };
  });
}

// ---------------------------------------------------------------- the committed file

/**
 * data/sds-brackets-2026.json, imported so the build bundles it (a Worker has no project filesystem; see
 * lib/data.ts) and validated once at module scope, so a slip in the hand-entered file fails the build
 * rather than drawing a wrong bracket.
 */
function loadFile(): SdsBracketsFile {
  const parsed = SdsBracketsSchema.safeParse(bundledFile);
  if (!parsed.success) failValidation('sds-brackets-2026', parsed.error.issues);
  return parsed.data;
}

const file = loadFile();

/** The Section's published brackets joined to the snapshot's games; null while the file is the placeholder. */
export function getSdsBrackets(): LiveBracketDivision[] | null {
  if (file.divisions.length === 0) return null;
  return buildSdsBrackets(file, getGames({ postseason: true }));
}

/** The sheet the brackets were copied from and the day it was read; null while the file is the placeholder. */
export function getSdsBracketsSource(): { label: string; url: string; retrievedOn: string } | null {
  if (file.divisions.length === 0 || file.source === null || file.retrievedOn === null) return null;
  return { label: file.source.label, url: file.source.url, retrievedOn: file.retrievedOn };
}
