/**
 * Every game's URL and the URLs it used to have: `Game.slug` (lib/game-slug.ts) and `Game.aliases`.
 *
 * The slug says what the game is (`2026-10-06-santa-catalina-at-greenfield`), so it follows the facts: a game moved
 * to another day, a home side that flipped or an opponent renamed gets the slug of what it is now, and the slug it
 * had becomes an alias. An alias is any URL segment this game was ever published at and is not at now; each one
 * redirects to the slug (next.config.ts for an old slug, proxy.ts for an old id). The contest id stays the game's
 * identity everywhere else; before slugs it was also the URL (`/game/<MaxPreps GUID>`, `/game/sblive-<n>`,
 * `/game/cifsds-<a>-at-<b>`, `/game/official-<date>-<a>-at-<b>`: the "legacy params"), so every game published that
 * way keeps its legacy param as an alias.
 *
 * The rules, in the order they are applied:
 *  1. Slugs are unique among the games. Games that would share one (a same-day rematch) are told apart by `-2`,
 *     `-3`, …; a game keeps the slug it had while that slug still names it, so a number never moves from one game
 *     to another.
 *  2. A game's aliases are the aliases it had, the slug it had when that changed, the legacy param and the slug of
 *     each game it superseded (an si.com fill, a bracket-sheet game or a schedule-only game a feed lists now:
 *     lib/pipeline/steps/assemble.ts supersededGamesOf), and those games' aliases.
 *  3. A slug always beats an alias: a segment that is some game's slug now is nobody's alias.
 *  4. An alias belongs to one game: the one that had it most recently. A slug a game just left comes first, then a
 *     segment claimed for the first time (a legacy param), then an alias already held, and last what is only
 *     remembered: a superseded id recorded in an earlier run (its game normally holds it as an alias already), and
 *     the URLs a contest had before it left the snapshot and came back.
 *
 * Pure: no I/O, no clock, and no import beyond the two id leaves, so proxy.ts can bundle it.
 */

import { GUID_RE, OFFICIAL_PREFIX, gameIdToParam, isOfficialContestId } from './game-id';
import { GAME_SLUG_RE, baseGameSlug, type GameSlugFacts } from './game-slug';

/** What the URL rules read of a game. */
export interface UrlGame extends GameSlugFacts {
  contestId: string;
  dateUtc: string;
  slug?: string;
  aliases?: string[];
}

const LEGACY_PREFIXED_PARAM = /^(?:sblive-\d+|cifsds-[a-z0-9-]+|official-[a-z0-9-]+)$/;

/**
 * True for a URL segment of the old id form: a MaxPreps GUID (either case), `sblive-<n>`, `cifsds-…` or
 * `official-…`. A slug starts with a date, so the two never overlap; proxy.ts's matcher is this test as a path
 * pattern (tests/game-urls.test.ts holds them together).
 */
export function isLegacyGameParam(param: string): boolean {
  return GUID_RE.test(param) || LEGACY_PREFIXED_PARAM.test(param);
}

/** True for a segment an alias may be: a slug or a legacy param, nothing with path syntax in it. */
export function isGameUrlSegment(segment: string): boolean {
  return GAME_SLUG_RE.test(segment) || isLegacyGameParam(segment);
}

const byStartThenId = (a: UrlGame, b: UrlGame): number =>
  a.dateUtc < b.dateUtc ? -1 : a.dateUtc > b.dateUtc ? 1 : a.contestId < b.contestId ? -1 : a.contestId > b.contestId ? 1 : 0;

/** `base`, or `base-<n>` with n ≥ 2. */
function isNumberedFrom(slug: string, base: string): boolean {
  if (slug === base) return true;
  return slug.startsWith(`${base}-`) && /^[1-9]\d*$/.test(slug.slice(base.length + 1)) && Number(slug.slice(base.length + 1)) >= 2;
}

/**
 * Rule 1: each game with its slug. `previousSlug` is the slug the game had (or the game it superseded had); it is
 * kept while it still names the game. `taken` are slugs already in use elsewhere (the stored games', when
 * lib/results/fixture-games.ts names its own): nobody here gets one. `leaveFree` are slugs a game here may keep
 * but none may newly take (GameUrlHistory.leaveFree).
 */
export function assignGameSlugs(
  games: readonly UrlGame[],
  previousSlug: (game: UrlGame) => string | undefined,
  taken: Iterable<string> = [],
  leaveFree: Iterable<string> = [],
): Map<string, string> {
  const used = new Set(taken);
  const spoken = new Set(leaveFree);
  const out = new Map<string, string>();
  const waiting: Array<{ game: UrlGame; base: string }> = [];
  for (const game of [...games].sort(byStartThenId)) {
    const base = baseGameSlug(game);
    const had = previousSlug(game);
    if (had !== undefined && isNumberedFrom(had, base) && !used.has(had)) {
      used.add(had);
      out.set(game.contestId, had);
    } else {
      waiting.push({ game, base });
    }
  }
  for (const { game, base } of waiting) {
    let slug = base;
    for (let n = 2; used.has(slug) || spoken.has(slug); n++) slug = `${base}-${n}`;
    used.add(slug);
    out.set(game.contestId, slug);
  }
  return out;
}

export interface GameUrlHistory {
  /** The games of the previous snapshot as the site listed them, each with the slug and aliases it had. */
  previous?: readonly UrlGame[];
  /** Superseded contest id → the contest that replaced it (Snapshot.supersededGames, this run's). */
  superseded?: Readonly<Record<string, string>>;
  /**
   * Slugs no game may newly take, though one that has such a slug keeps it: what this run's schedule-only games
   * (lib/results/fixture-games.ts, not among `games`) are called. Such a game takes the first free slug after the
   * stored games, so a feed game of the same day and pair that turns up beside one gets the `-2`, and the page
   * already at the plain slug stays where it is.
   */
  leaveFree?: Iterable<string>;
  /** Slugs of pages that are not among `games` (those schedule-only games, as named): rule 3 covers them too. */
  reserved?: Iterable<string>;
  /**
   * True for a game that may have been published at its legacy param: every game of a file written before slugs
   * (the load upgrade), and in the pipeline a game nothing vouches for (no previous snapshot, or one that left and
   * is back). An alias nobody ever used costs nothing; a URL that was live and stops answering does.
   */
  publishedAtLegacyParam?: (game: UrlGame) => boolean;
  /**
   * Segments a game had before it left the snapshot, for a contest that is back (ContentRemoval.slug). The weakest
   * claim there is: a game that has used one since, as its slug or as an alias it still holds, keeps it.
   */
  remembered?: (game: UrlGame) => readonly string[];
}

/**
 * The segments a contest id was published at before slugs: its legacy param, and for an `official:` id that param
 * without its prefix as well. proxy.ts sends an `official-…` it has no table entry for to exactly that segment
 * (lib/game-aliases.ts), which is the slug of a game at the home side's school; where the game's slug differs (a
 * neutral site says `vs`), this makes it an alias, so the old URL still arrives.
 */
function legacySegments(contestId: string): string[] {
  const param = gameIdToParam(contestId);
  return isOfficialContestId(contestId) ? [param, contestId.slice(OFFICIAL_PREFIX.length)] : [param];
}

/** The ids each game superseded: `to` → every `from`. */
function supersededBy(superseded: Readonly<Record<string, string>>): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const from of Object.keys(superseded).sort()) {
    const to = superseded[from];
    out.set(to, [...(out.get(to) ?? []), from]);
  }
  return out;
}

/**
 * The slug a game had: its own in the previous snapshot (or the one it carries), else the slug of a game it
 * superseded, so the second game of a doubleheader keeps its `-2` when MaxPreps takes over an si.com fill.
 */
function previousSlugs(history: GameUrlHistory): (game: UrlGame) => string | undefined {
  const before = new Map((history.previous ?? []).map((g) => [g.contestId, g.slug]));
  const replaced = supersededBy(history.superseded ?? {});
  return (game) =>
    game.slug ??
    before.get(game.contestId) ??
    (replaced.get(game.contestId) ?? []).map((from) => before.get(from)).find((slug) => slug !== undefined);
}

/** `games`, each with its slug (rule 1). A game that carries one already is its own history. */
export function withGameSlugs<T extends UrlGame>(games: readonly T[], history: GameUrlHistory = {}): T[] {
  const slugs = assignGameSlugs(games, previousSlugs(history), [], history.leaveFree);
  return games.map((game) => ({ ...game, slug: slugs.get(game.contestId)! }));
}

/** `games` (each with its slug) with their aliases (rules 2-4); `aliases` is left out of a game that has none. */
export function withGameAliases<T extends UrlGame>(games: readonly T[], history: GameUrlHistory = {}): T[] {
  const before = new Map((history.previous ?? []).map((g) => [g.contestId, g]));
  const replaced = supersededBy(history.superseded ?? {});
  const live = new Set<string>(history.reserved ?? []);
  for (const game of games) {
    if (game.slug === undefined) throw new Error(`lib/game-urls.ts: ${game.contestId} has no slug (withGameSlugs runs first)`);
    live.add(game.slug);
  }

  // Each game's claims, in rule 4's order. `left`: the slug it had in the previous snapshot, or that a game it
  // replaces in this run had. `fresh`: segments claimed for the first time (its legacy param; those of a game it
  // replaces in this run). `kept`: aliases it, or that game, already had. `carried`: the legacy segments of an id
  // superseded in an EARLIER run. `superseded` is carried all season, so these come up on every run; the game has
  // them among its aliases unless another game has had the segment since, and that game keeps it. So does a game
  // holding a segment that a contest back from a removal remembers (`history.remembered`), which ranks with these.
  const claims = [...games]
    .sort((a, b) => (a.contestId < b.contestId ? -1 : a.contestId > b.contestId ? 1 : 0))
    .map((game) => {
      const left: string[] = [];
      const fresh: string[] = [];
      const kept: string[] = [...(game.aliases ?? [])];
      const carried: string[] = [...(history.remembered?.(game) ?? [])];
      const prior = before.get(game.contestId);
      if (prior?.slug) left.push(prior.slug);
      kept.push(...(prior?.aliases ?? []));
      if (history.publishedAtLegacyParam?.(game)) fresh.push(...legacySegments(game.contestId));
      for (const from of replaced.get(game.contestId) ?? []) {
        const gone = before.get(from);
        (gone ? fresh : carried).push(...legacySegments(from));
        if (gone?.slug) left.push(gone.slug);
        kept.push(...(gone?.aliases ?? []));
      }
      return { game, tiers: [left, fresh, kept, carried] };
    });

  const owner = new Map<string, string>();
  const claim = (segment: string, contestId: string): void => {
    if (!isGameUrlSegment(segment) || live.has(segment) || owner.has(segment)) return;
    owner.set(segment, contestId);
  };
  for (const tier of [0, 1, 2, 3]) {
    for (const { game, tiers } of claims) for (const segment of tiers[tier]) claim(segment, game.contestId);
  }

  const aliases = new Map<string, string[]>();
  for (const [segment, contestId] of owner) aliases.set(contestId, [...(aliases.get(contestId) ?? []), segment]);
  return games.map((game) => {
    const located = { ...game };
    const mine = aliases.get(game.contestId)?.sort();
    if (mine) located.aliases = mine;
    else delete located.aliases;
    return located;
  });
}

/**
 * The load upgrade (lib/snapshot/snapshot-load.ts): the games of a file written before slugs existed, or that a
 * load step added to one. Every game with no slug was published at its legacy param, and so was every game
 * `superseded` records as replaced by one: each gets its slug, clear of the slugs already there, and those
 * segments as aliases. A game that has a slug is returned as it is, whatever its facts say now: only the pipeline,
 * which has the previous snapshot beside it and so can leave the old slug as an alias, renames a game.
 */
export function withLegacyGameUrls<T extends UrlGame>(games: readonly T[], superseded: Readonly<Record<string, string>> = {}): T[] {
  const unnamed = games.filter((g) => g.slug === undefined);
  if (unnamed.length === 0) return [...games];
  const named = games.filter((g) => g.slug !== undefined);
  const taken = new Set<string>();
  for (const g of named) for (const segment of [g.slug!, ...(g.aliases ?? [])]) taken.add(segment);
  // Clear of the named games' slugs AND aliases: an alias of theirs cannot be taken back here (they are left as they are).
  const slugs = assignGameSlugs(unnamed, () => undefined, taken);
  const located = withGameAliases(
    unnamed.map((g) => ({ ...g, slug: slugs.get(g.contestId)! })),
    { superseded, reserved: taken, publishedAtLegacyParam: () => true },
  );
  const byId = new Map(located.map((g) => [g.contestId, g]));
  return games.map((g) => byId.get(g.contestId) ?? g);
}

/** A v2 snapshot file with a game that has no slug: written before slugs existed. */
export function needsGameUrls(raw: unknown): boolean {
  if (typeof raw !== 'object' || raw === null) return false;
  const { schemaVersion, games } = raw as { schemaVersion?: unknown; games?: unknown };
  return schemaVersion === 2 && Array.isArray(games) && games.some((g) => typeof (g as { slug?: unknown } | null)?.slug !== 'string');
}

/**
 * That file with its game URLs (withLegacyGameUrls, over its `games` and `supersededGames`). `playoffs.games` holds
 * some of the same games again (lib/postseason/ccs-bracket.ts), so each of those is replaced by the game as it is
 * now. lib/snapshot/snapshot-load.ts applies this to every file it reads, and lib/game-aliases.ts to the file
 * proxy.ts bundles; the next pipeline run stores the result.
 */
export function addGameUrls(raw: unknown): unknown {
  const file = raw as { games: UrlGame[]; supersededGames?: Record<string, string>; playoffs?: { games?: UrlGame[] } };
  const games = withLegacyGameUrls(file.games, file.supersededGames ?? {});
  if (!Array.isArray(file.playoffs?.games)) return { ...file, games };
  const byId = new Map(games.map((g) => [g.contestId, g]));
  return { ...file, games, playoffs: { ...file.playoffs, games: file.playoffs.games.map((g) => byId.get(g.contestId) ?? g) } };
}

/**
 * Alias → slug for every alias of `games`, slugs winning (rule 3) and the first game in contest-id order owning a
 * segment two games list (rule 4; the snapshot's invariants refuse both, so this only guards a hand-made file).
 */
export function gameAliasTable(games: readonly UrlGame[]): Map<string, string> {
  const live = new Set(games.map((g) => g.slug).filter((s): s is string => s !== undefined));
  const table = new Map<string, string>();
  for (const game of [...games].sort((a, b) => (a.contestId < b.contestId ? -1 : a.contestId > b.contestId ? 1 : 0))) {
    if (game.slug === undefined) continue;
    for (const alias of game.aliases ?? []) {
      if (isGameUrlSegment(alias) && !live.has(alias) && !table.has(alias)) table.set(alias, game.slug);
    }
  }
  return table;
}
