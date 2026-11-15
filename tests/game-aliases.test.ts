/**
 * Every old game URL arrives, in every sport's committed snapshot (SPEC §8.1): proxy.ts, next.config.ts
 * `redirects()` and lib/game-aliases.ts against the games as lib/data.ts reads them.
 *
 * A segment is followed the way the servers answer it (`redirects` run before the proxy,
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md "Execution order"): a
 * next.config rule first, else proxy.ts called with a real NextRequest, until it is a page or nothing answers.
 * The proxy reads the file as stored and the pages read it through lib/data.ts, so this is also the check that
 * the two agree on every game: each of a game's aliases must end at that game's slug. In a snapshot written before
 * slugs that includes every game's id, the URL it was published at; a game first listed since has no alias, and
 * its id was never a URL. (update-data*.yml runs this file on each snapshot it fetches.)
 */

import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { gameIdToParam } from '../lib/game-id';

const SPORTS = ['field-hockey', 'soccer', 'basketball', 'volleyball'] as const;

async function load(sport: (typeof SPORTS)[number]) {
  vi.stubEnv('SCVAL_SPORT', sport);
  vi.resetModules();
  const data = await import('../lib/data');
  const aliases = await import('../lib/game-aliases');
  const urls = await import('../lib/game-urls');
  const { proxy } = await import('../proxy');
  const { default: config } = await import('../next.config');
  const games = data.getGames();
  const pages = new Set(games.map((g) => g.slug!));
  const rules = new Map((await config.redirects!()).map((r) => [r.source, r]));
  /** One answer of the servers for `/game/<path>`: the path it redirects to, or undefined when nothing does. */
  const hop = (path: string): string | undefined => {
    const rule = rules.get(`/game/${path}`);
    if (rule) {
      expect(rule.permanent, `next.config.ts ${rule.source}`).toBe(true);
      return rule.destination.slice('/game/'.length);
    }
    const res = proxy(new NextRequest(`https://example.test/game/${path}`));
    const location = res.headers.get('location');
    if (location === null) return undefined;
    expect(res.status, `proxy.ts /game/${path}`).toBe(308);
    return new URL(location).pathname.slice('/game/'.length);
  };
  const follow = (path: string): { end: string | undefined; hops: number } => {
    for (let hops = 0, at = path; hops <= 3; hops++) {
      if (pages.has(at.replace(/\/opengraph-image$/, '')) && hops > 0) return { end: at, hops };
      const next = hop(at);
      if (next === undefined) return { end: undefined, hops };
      at = next;
    }
    return { end: undefined, hops: 4 };
  };
  return { data, aliases, urls, games, pages, rules, hop, follow, proxy };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe.each(SPORTS)('%s: every old game URL leads to its game', (sport) => {
  it('each game has one slug, each id and alias ends at it, and nothing shadows a page', async () => {
    const m = await load(sport);
    expect(m.games.length, 'lib/data.ts getGames').toBeGreaterThan(0);
    expect(m.games.filter((g) => !g.slug).map((g) => g.contestId), 'lib/data.ts: games with no slug').toEqual([]);
    expect(m.pages.size, 'lib/data.ts: slugs are unique').toBe(m.games.length);

    // No redirect source is a page: a rule (or the proxy) answers before a page is looked for.
    const shadowed = [...m.rules.keys()].filter((source) => m.pages.has(source.slice('/game/'.length)));
    expect(shadowed, 'next.config.ts redirects a live page').toEqual([]);
    expect(m.games.filter((g) => m.urls.isLegacyGameParam(g.slug!)).map((g) => g.slug), 'a slug proxy.ts would take').toEqual([]);
    expect(m.rules.size, 'next.config.ts: under the 1,024 redirects Vercel allows').toBeLessThan(1024);

    const wrong: string[] = [];
    let twoHops = 0;
    for (const game of m.games) {
      // Its aliases; and for an `official:` game its id as a URL segment, alias or not: proxy.ts answers every
      // `official-…` (a schedule-only game is not stored, so nothing can list that segment for it).
      const official = game.contestId.startsWith('official:') ? [gameIdToParam(game.contestId)] : [];
      for (const segment of new Set([...official, ...(game.aliases ?? [])])) {
        if (segment === game.slug) continue;
        for (const suffix of ['', '/opengraph-image']) {
          const { end, hops } = m.follow(`${segment}${suffix}`);
          if (end !== `${game.slug}${suffix}`) wrong.push(`/game/${segment}${suffix} → ${end} (expected ${game.slug}${suffix})`);
          if (hops > 2) wrong.push(`/game/${segment}${suffix} takes ${hops} redirects`);
          if (hops === 2 && suffix === '') twoHops++;
        }
      }
    }
    expect(wrong.slice(0, 8), `${wrong.length} old URLs do not arrive`).toEqual([]);
    // Two redirects only for an `official-` id of a game whose slug says `vs` (lib/game-aliases.ts legacyGameTarget).
    expect(twoHops, 'old URLs that take two redirects').toBeLessThanOrEqual(m.games.filter((g) => g.contestId.startsWith('official:') && g.site === 'neutral').length);
  }, 120_000);

  it('proxy.ts leaves everything else alone', async () => {
    const m = await load(sport);
    const passes = (path: string) => m.proxy(new NextRequest(`https://example.test${path}`)).headers.get('location') === null;
    const game = m.games.find((g) => (g.aliases ?? []).some((a) => m.urls.isLegacyGameParam(a)));
    // A snapshot none of whose games was published before slugs has no old id URL to try.
    if (!game) return;
    const alias = game.aliases!.find((a) => m.urls.isLegacyGameParam(a))!;
    // An id that never was a game here, a slug (the matcher never sends one, but the function must not care),
    // and anything deeper than the page and its card.
    for (const path of [
      '/game/00000000-0000-4000-8000-000000000000',
      '/game/sblive-0',
      '/game/cifsds-nobody-at-nowhere',
      `/game/${game.slug}`,
      `/game/${alias}/opengraph-image/extra`,
      `/game/${alias}/twitter-image`,
      '/game',
    ]) {
      expect(passes(path), path).toBe(true);
    }
    // The query string survives, and a GUID is found in either case.
    const res = m.proxy(new NextRequest(`https://example.test/game/${alias}?utm_source=share&x=1`));
    expect(res.status).toBe(308);
    expect(new URL(res.headers.get('location')!).pathname + new URL(res.headers.get('location')!).search).toBe(`/game/${game.slug}?utm_source=share&x=1`);
    const guid = m.games.find((g) => (g.aliases ?? []).includes(g.contestId) && /^[0-9a-f-]{36}$/.test(g.contestId));
    if (guid) expect(m.aliases.legacyGameTarget(guid.contestId.toUpperCase()), 'lib/game-aliases.ts: an upper-case GUID').toBe(guid.slug);
  }, 120_000);
});

describe('lib/game-aliases.ts', () => {
  it('renamedGameRedirects: a rule for an old slug and its card, none for a legacy id', async () => {
    const { renamedGameRedirects } = await import('../lib/game-aliases');
    const side = (slug: string) => ({ slug, name: slug });
    const game = {
      contestId: '30e15701-fddc-4695-9f1c-148e19f58ca5', dateKey: '2026-10-13', dateUtc: '2026-10-13T23:00:00.000Z', site: 'home' as const,
      away: side('a'), home: side('b'), slug: '2026-10-13-a-at-b',
      aliases: ['2026-10-06-a-at-b', '30e15701-fddc-4695-9f1c-148e19f58ca5', 'sblive-1', 'official-2026-10-06-a-at-b'],
    };
    expect(renamedGameRedirects([game])).toEqual([
      { source: '/game/2026-10-06-a-at-b', destination: '/game/2026-10-13-a-at-b', permanent: true },
      { source: '/game/2026-10-06-a-at-b/opengraph-image', destination: '/game/2026-10-13-a-at-b/opengraph-image', permanent: true },
    ]);
    expect(renamedGameRedirects([{ ...game, aliases: undefined }])).toEqual([]);
  });

  it('legacyGameTarget: an official- id with no table entry leads to the segment without its prefix', async () => {
    const { legacyGameTarget } = await import('../lib/game-aliases');
    expect(legacyGameTarget('official-2031-01-02-a-at-b')).toBe('2031-01-02-a-at-b');
    expect(legacyGameTarget('official-nonsense')).toBeUndefined();
    expect(legacyGameTarget('2031-01-02-a-at-b'), 'a slug is not a legacy param').toBeUndefined();
    expect(legacyGameTarget('sblive-0')).toBeUndefined();
  });
});
