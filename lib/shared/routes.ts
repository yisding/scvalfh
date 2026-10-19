/**
 * The URL of every routed page, built in one place (finding cmp-12). Pure, client-safe and import-free
 * on purpose: TeamFinder, MyTeamCard and PinTile ship it to the browser, and the client bundle keeps every
 * export of a module it reaches, so a dependency here would be paid for by /teams (assert:budgets pins
 * it to the byte). The game link is the one exception to "every routed page": `gameHref` stays in
 * lib/shared/game-id.ts beside the `sblive:` grammar it needs, which only the server ever builds.
 *
 * app/, components/ and views/ never spell `/teams/${…}`, `/standings/${…}`, `/schedule/${…}`,
 * `/scores/${…}`, `/playoffs/${…}`, `/clubs/${…}` or `/game/${…}`: tests/arch/page-code-literals.test.ts
 * bans the templates, so a route that moves is edited here, not at ~100 call sites. A fragment
 * (`#roster`, `#<date>`) is appended by the caller (`${teamHref(slug)}#roster`); the standings
 * division is the one fragment every caller wants, so `standingsHref` takes it as its second argument.
 * The sitemap and the JSON-LD put an origin in front of the result; the helper never does.
 */

/** `/teams/<slug>`. */
export function teamHref(slug: string): string {
  return `/teams/${slug}`;
}

/** `/standings/<league>`, or `/standings/<league>#<division>` when a division is named. */
export function standingsHref(league: string, division?: string): string {
  return division === undefined ? `/standings/${league}` : `/standings/${league}#${division}`;
}

/** `/schedule/<league>`. */
export function scheduleHref(league: string): string {
  return `/schedule/${league}`;
}

/** `/scores/<yyyy-mm-dd>`. */
export function scoresHref(date: string): string {
  return `/scores/${date}`;
}

/** `/playoffs/<league>`, or the cross-league `/playoffs` page when no league is named. */
export function playoffsHref(league?: string): string {
  return league === undefined ? '/playoffs' : `/playoffs/${league}`;
}

/** `/clubs/<slug>`. */
export function clubHref(slug: string): string {
  return `/clubs/${slug}`;
}
