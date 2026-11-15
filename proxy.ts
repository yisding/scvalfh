import { NextResponse, type NextRequest } from 'next/server';

import { legacyGameTarget } from './lib/game-aliases';

/**
 * Old game URLs. Before slugs a game's page was `/game/<its contest id>`: a MaxPreps GUID, or `sblive-<n>`,
 * `cifsds-<away>-at-<home>`, `official-<date>-<away>-at-<home>` for a game MaxPreps did not list. Each is a
 * permanent (308) redirect to the game's page now, `/game/<slug>` (lib/game-slug.ts), and its OG image to that
 * page's; the table is the snapshot's aliases (lib/game-aliases.ts legacyGameTarget). An id that was never a game
 * here falls through to the 404 it always got.
 *
 * This is the site's only request-time code, and the matcher keeps it to those URL shapes: a slug starts with a
 * date, which none of the four patterns match, so no page the site links to ever runs it. They are here and not in
 * next.config.ts `redirects()` because there is one per game published before slugs, past the 1,024 redirects a
 * config may carry on Vercel; the few renamed slugs, which a matcher could not tell from live ones, are there.
 */
export function proxy(request: NextRequest): NextResponse {
  const [, , param, ...rest] = request.nextUrl.pathname.split('/');
  const card = rest.length === 1 && rest[0] === 'opengraph-image';
  const slug = rest.length === 0 || card ? legacyGameTarget(param ?? '') : undefined;
  if (slug === undefined) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = `/game/${slug}${card ? '/opengraph-image' : ''}`;
  return NextResponse.redirect(url, 308);
}

/**
 * The four legacy shapes (lib/game-urls.ts isLegacyGameParam, which tests/game-urls.test.ts holds this pattern to),
 * and anything under them. A literal: Next reads the matcher statically at build time.
 */
export const config = {
  matcher: [
    '/game/:id([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|sblive-\\d+|cifsds-[a-z0-9-]+|official-[a-z0-9-]+)/:rest*',
  ],
};
