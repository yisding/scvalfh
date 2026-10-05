/**
 * What the two prerender gates expect of a build, in one place: scripts/assert-prerender.ts holds
 * `next build`'s `.next/server/app` to it, scripts/assert-vinext-prerender.ts the vinext builds'
 * `dist/server/prerendered-routes` (Node and Workers alike). Both must agree page for page, so the
 * fixed pages, the families' expected params and the per-family check live here once.
 *
 * The expectations come from the build's INPUT, never from its output: the snapshot (as lib/data.ts
 * loads it), the league config (`lib/leagues.ts`), the team registry (`lib/teams.ts`) and the clubs
 * file (through lib/clubs.ts). Games take `gameIdToParam` (`sblive:N` → `sblive-N`), which
 * tests/game-id.test.ts holds and both gates' ':' check backs up.
 *
 * Three other places list routes and stay as they are, on purpose: app/sitemap.ts is the subject a
 * gate checks, never its oracle; scripts/a11y-axe.mjs runs a curated one-page-per-family sample,
 * with fallbacks for running outside the repo; scripts/smoke-server.sh is a self-contained HTTP
 * contract read by plain bash against any of the three servers.
 */

import { getClubSlugs } from '../../lib/clubs';
import { gameIdToParam } from '../../lib/game-id';
import { LEAGUE_IDS, TOURNAMENT_LEAGUE_IDS } from '../../lib/leagues';
import { TEAMS } from '../../lib/teams';
import type { Snapshot } from '../../lib/types';

/** The pages with no params (`index` is `/`), by their prerendered file name without `.html`. */
export const FIXED_PAGES = [
  'index',
  'about',
  'standings',
  'schedule',
  'playoffs',
  'teams',
  'leaders',
  'history/2025-26',
  'clubs',
  'commits',
  'jv',
] as const;

/** The params each dynamic family must prerender, exactly. */
export interface ExpectedFamilies {
  leagueIds: readonly string[];
  /** The league-tournament leagues: the /playoffs/[league] family. */
  tournament: readonly string[];
  gameParams: readonly string[];
  /** One stub per `supersededGames` key: a game page, but never in the sitemap. */
  stubParams: readonly string[];
  /** The distinct game dates, sorted. */
  dates: readonly string[];
  slugs: readonly string[];
  clubSlugs: readonly string[];
}

/** The items of `a` not in `b`. */
export function diff(a: Iterable<string>, b: Iterable<string>): string[] {
  const bs = new Set(b);
  return [...a].filter((x) => !bs.has(x));
}

/** The first five, and the count when there are more. */
export function sample(list: readonly string[]): string {
  return list.slice(0, 5).join(', ') + (list.length > 5 ? `, … (${list.length})` : '');
}

/**
 * Each family's expected params, and the cross-checks that make them trustworthy: the snapshot's
 * leagues and tournament leagues are the config's, its teams are the registry's by name and in
 * order, and no superseded stub is also a live game. Each disagreement goes to `fail`.
 */
export function expectedFamilies(snapshot: Snapshot, fail: (msg: string) => void): ExpectedFamilies {
  const snapshotLeagues = snapshot.season.leagues.map((l) => l.id);
  if (JSON.stringify(snapshotLeagues) !== JSON.stringify([...LEAGUE_IDS])) {
    fail(`snapshot season.leagues [${snapshotLeagues.join(', ')}] ≠ lib/leagues.ts LEAGUE_IDS [${LEAGUE_IDS.join(', ')}]`);
  }

  const gameParams = snapshot.games.map((g) => gameIdToParam(g.contestId));
  const stubParams = Object.keys(snapshot.supersededGames).map(gameIdToParam);
  const overlap = stubParams.filter((p) => gameParams.includes(p));
  if (overlap.length) fail(`superseded stubs that are also live games: ${sample(overlap)}`);

  const slugs = snapshot.teams.map((t) => t.slug);
  const registry = TEAMS.map((t) => t.slug);
  const missing = diff(registry, slugs);
  const extra = diff(slugs, registry);
  if (missing.length || extra.length || slugs.join('|') !== registry.join('|')) {
    fail(
      `snapshot teams ≠ the ${registry.length}-team registry (missing: ${sample(missing) || 'none'}; ` +
        `extra: ${sample(extra) || 'none'}${missing.length || extra.length ? '' : '; order differs'})`,
    );
  }

  const tournament = [...TOURNAMENT_LEAGUE_IDS];
  const snapshotTournament = snapshot.season.leagues
    .filter((l) => l.postseasonKind === 'league-tournament')
    .map((l) => l.id);
  if (JSON.stringify(snapshotTournament) !== JSON.stringify(tournament)) {
    fail(`snapshot tournament leagues [${snapshotTournament.join(', ')}] ≠ TOURNAMENT_LEAGUE_IDS [${tournament.join(', ')}]`);
  }

  return {
    leagueIds: [...LEAGUE_IDS],
    tournament,
    gameParams,
    stubParams,
    dates: [...new Set(snapshot.games.map((g) => g.dateKey))].sort(),
    slugs,
    clubSlugs: getClubSlugs(),
  };
}

/**
 * The per-family check over one build's prerendered files (forward-slash paths relative to the
 * prerender directory). Pages are `<family>/X.html`; an OG card is `<family>/X<cardSuffix>`, which
 * is `/opengraph-image.body` under `.next` and `/opengraph-image.route` under vinext.
 */
export function makeFamilyChecker(
  files: readonly string[],
  opts: { cardSuffix: string; fail: (msg: string) => void },
) {
  const { cardSuffix, fail } = opts;
  /** `<family> got/expected` for each family checked, in order, for the summary line. */
  const counts: string[] = [];

  /** The `.html` pages directly inside `<family>/`, by name (no extension). */
  function pagesIn(family: string): string[] {
    const prefix = `${family}/`;
    return files
      .filter((f) => f.startsWith(prefix) && f.endsWith('.html') && !f.slice(prefix.length).includes('/'))
      .map((f) => f.slice(prefix.length, -'.html'.length));
  }

  /** The names `X` with a prerendered `<family>/X` card. */
  function cardsIn(family: string): string[] {
    const prefix = `${family}/`;
    return files
      .filter((f) => f.startsWith(prefix) && f.endsWith(cardSuffix))
      .map((f) => f.slice(prefix.length, -cardSuffix.length))
      .filter((name) => name !== '' && !name.includes('/') && !name.startsWith('['));
  }

  /** Exact page set for a family, then OG/page parity BY NAME (never by count). */
  function family(name: string, expected: readonly string[], { og }: { og: boolean }): void {
    const got = pagesIn(name);
    counts.push(`${name} ${got.length}/${expected.length}`);
    const missing = diff(expected, got);
    const extra = diff(got, expected);
    if (missing.length) fail(`${name}/: ${missing.length} expected page(s) not prerendered: ${sample(missing)}`);
    if (extra.length) fail(`${name}/: ${extra.length} unexpected page(s) prerendered: ${sample(extra)}`);
    if (new Set(expected).size !== expected.length) fail(`${name}/: the expected params contain duplicates`);
    if (!og) return;
    const cards = cardsIn(name);
    const noCard = diff(got, cards);
    const noPage = diff(cards, got);
    if (noCard.length) fail(`${name}/: page without its opengraph-image: ${sample(noCard.map((x) => `${name}/${x}.html`))}`);
    if (noPage.length) fail(`${name}/: opengraph-image without its page: ${sample(noPage.map((x) => `${name}/${x}/opengraph-image`))}`);
  }

  /** Every family both builds prerender, each against its expected params. */
  function allFamilies(expected: ExpectedFamilies): void {
    family('standings', expected.leagueIds, { og: true });
    family('schedule', expected.leagueIds, { og: true });
    family('playoffs', expected.tournament, { og: true });
    family('game', [...expected.gameParams, ...expected.stubParams], { og: true });
    family('scores', expected.dates, { og: true });
    family('teams', expected.slugs, { og: true });
    family('history', ['2025-26'], { og: false });
    // One page per club of data/clubs.json, a club with no tied player included; no OG card (the
    // clubs pages take the root one), so no parity check either.
    family('clubs', expected.clubSlugs, { og: false });
  }

  return { pagesIn, cardsIn, family, allFamilies, counts };
}
