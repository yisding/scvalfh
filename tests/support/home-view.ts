/**
 * The home page on the offline all-2026-10-02 corpus snapshot (SPEC §13.6), shared by tests/views/home/*.test.ts: the
 * modules, buildHomeView's result, the rendered page and a cached LeaguePanel renderer. The `let` bindings are
 * assigned in a beforeAll registered in each importing file, so read them only inside tests and hooks.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll } from 'vitest';

import { useCorpusModules } from '@/tests/support/corpus-modules';

export const m = useCorpusModules('all-2026-10-02', {
  home: () => import('@/views/home/home-view'),
  phaseLead: () => import('@/views/home/phase-lead'),
  leagues: () => import('@/lib/config/leagues'),
  labels: () => import('@/lib/config/leagues/labels'),
  homePage: () => import('@/app/page'),
  leaguePanel: () => import('@/components/home/LeaguePanel'),
});

export let data: ReturnType<typeof m.home.buildHomeView>;
export let pageHtml = '';
const panelHtml = new Map<string, string>();
export let renderPanel: (id: string) => string;

export const HV = 'views/home/home-view.ts';
export const PL = 'views/home/phase-lead.ts';

beforeAll(() => {
  data = m.home.buildHomeView();
  pageHtml = renderToStaticMarkup(createElement(m.homePage.default));
  renderPanel = (id: string) => {
    const cached = panelHtml.get(id);
    if (cached) return cached;
    const panel = data.panels.find((p) => p.id === id);
    if (!panel) throw new Error(`${HV}: no panel for ${id}`);
    const html = renderToStaticMarkup(createElement(m.leaguePanel.LeaguePanel, { panel }));
    panelHtml.set(id, html);
    return html;
  };
});
