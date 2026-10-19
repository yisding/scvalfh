/**
 * The /game/[id] page on the offline all-2026-10-02 corpus snapshot (SPEC §13.6), shared by
 * tests/views/game/*.test.ts: the module loaders, `loadedOf`/`loadFrom` (one loaded graph with the game page's
 * renderers over it), the corpus graph `L` (assigned in a beforeAll registered in each importing file) and the
 * counted-final finder.
 */

import { type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll } from 'vitest';

import type { Game } from '@/lib/model/game';
import { getTeamBySlug } from '@/lib/registry/teams';

import { useCorpusModules, withSnapshotModules, type CorpusModules } from './corpus-modules';
import { corpusSnapshotPath } from './corpus-snapshot';
import { loadQueries } from './queries';

export const loaders = {
  d: loadQueries,
  m: () => import('@/views/game/game-view'),
  titles: () => import('@/views/game/titles'),
  ids: () => import('@/lib/shared/game-id'),
  page: () => import('@/app/game/[id]/page'),
  og: () => import('@/app/game/[id]/opengraph-image'),
};

export type Modules = CorpusModules<typeof loaders>;

export interface Loaded {
  d: Modules['d'];
  m: Modules['m'];
  titles: Modules['titles'];
  ids: Modules['ids'];
  pageParams: () => Array<{ id: string }>;
  ogParams: () => Array<{ id: string }>;
  renderPage: (id: string) => Promise<string>;
  metadata: (id: string) => Promise<import('next').Metadata>;
}

/** The modules of one loaded graph with the game page's renderers over them. */
export function loadedOf({ d, m, titles, ids, page, og }: Modules): Loaded {
  return {
    d,
    m,
    titles,
    ids,
    pageParams: page.generateStaticParams,
    ogParams: og.generateStaticParams,
    renderPage: async (id) => {
      const el = await page.default({ params: Promise.resolve({ id }) } as never);
      return renderToStaticMarkup(el as ReactElement);
    },
    metadata: (id) => page.generateMetadata({ params: Promise.resolve({ id }) } as never),
  };
}

/** A fresh graph over a snapshot file the test wrote (the file-wide afterAll of useCorpusModules unstubs it). */
export async function loadFrom(file: string): Promise<Loaded> {
  return loadedOf((await withSnapshotModules(file, loaders)).modules);
}

export const corpus = useCorpusModules('all-2026-10-02', loaders);

export const corpusPath = corpusSnapshotPath('all-2026-10-02');

export let L: Loaded;

beforeAll(() => {
  L = loadedOf(corpus);
});

export const leagueOfSlug = (slug: string | null) => (slug ? getTeamBySlug(slug)?.league : undefined);

export function counted(league: string, status: Game['status'] = 'final'): Game {
  const game = L.d
    .getGames({ leagueOnly: true, status })
    .find((g) => leagueOfSlug(g.home.slug) === league && !g.contestId.startsWith('sblive:'));
  if (!game) throw new Error(`tests: no counted ${league} ${status} game in the corpus`);
  return game;
}
