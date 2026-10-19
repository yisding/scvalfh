/**
 * The standings pages on the offline all-2026-10-02 corpus snapshot (SPEC §13.6), shared by
 * tests/views/standings/*.test.ts: the modules and the renderers of /standings/<league> and /standings.
 */

import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { useCorpusModules } from './corpus-modules';
import { loadQueries } from './queries';

export const m = useCorpusModules('all-2026-10-02', {
  data: loadQueries,
  sd: () => import('@/views/standings/standings-view'),
  view: () => import('@/views/standings/division'),
  footnotes: () => import('@/views/standings/footnotes'),
  leaderLines: () => import('@/views/standings/leader-lines'),
  leaguePage: () => import('@/app/standings/[league]/page'),
  overviewPage: () => import('@/app/standings/page'),
});

export async function renderLeague(league: string): Promise<string> {
  const el = await m.leaguePage.default({ params: Promise.resolve({ league }) } as never);
  return renderToStaticMarkup(el as ReactElement);
}

export function renderOverview(): string {
  return renderToStaticMarkup(createElement(m.overviewPage.default));
}

export function ids(html: string): string[] {
  return [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
}
