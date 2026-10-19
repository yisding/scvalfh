/**
 * The teams pages on the offline all-2026-10-02 corpus snapshot (SPEC §13.6), shared by
 * tests/views/teams/team-view*.test.ts, team-page.test.ts and teams-index.test.ts: the module loaders, the page
 * renderers over one loaded graph and the rendered-id finder.
 */

import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { useCorpusModules, type CorpusModules } from '@/tests/support/corpus-modules';
import { loadQueries } from '@/tests/support/queries';

export const loaders = {
  data: loadQueries,
  leagues: () => import('@/lib/config/leagues'),
  labels: () => import('@/lib/config/leagues/labels'),
  view: () => import('@/views/teams/team-view'),
  fixtures: () => import('@/views/shared/official-fixtures'),
  teamPage: () => import('@/app/teams/[slug]/page'),
  indexPage: () => import('@/app/teams/page'),
};

export type Modules = CorpusModules<typeof loaders>;

/** The page renderers over one loaded module graph (`mods` is read when a renderer is called, so the graph may still be loading when they are made). */
export function pageRenderers(mods: () => Modules) {
  return {
    renderTeam: async (slug: string) => {
      const el = await mods().teamPage.default({ params: Promise.resolve({ slug }) } as never);
      return renderToStaticMarkup(el as ReactElement);
    },
    renderIndex: () => renderToStaticMarkup(createElement(mods().indexPage.default)),
    describeTeam: async (slug: string) => {
      const meta = await mods().teamPage.generateMetadata({ params: Promise.resolve({ slug }) } as never);
      return typeof meta.description === 'string' ? meta.description : undefined;
    },
  };
}

export const m = useCorpusModules('all-2026-10-02', loaders);

export const { renderTeam, renderIndex, describeTeam } = pageRenderers(() => m);

export function ids(html: string): string[] {
  return [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
}
