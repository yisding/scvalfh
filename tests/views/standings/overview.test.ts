/**
 * The all-league overview /standings (SPEC §10.3; views/standings/overview.ts and app/standings/page.tsx).
 * League-specific values are asserted on the all-2026-10-02 CORPUS snapshot (SPEC §13.6), loaded through
 * useCorpusModules (tests/support/standings-view.ts), so live fetch #2 cannot break them. Every assertion message
 * names the module that produced the value, so a failure routes to its owner.
 */

import { describe, expect, it } from 'vitest';

import { textOf } from '@/tests/support/html-text';
import { renderOverview, ids } from '@/tests/support/standings-view';

describe('the /standings overview', () => {
  it('has every anchor, each once, including the old SCVAL ones', () => {
    const html = renderOverview();
    const all = ids(html);
    const dupes = all.filter((id, i) => all.indexOf(id) !== i);
    expect(dupes, 'app/standings/page.tsx: duplicate ids').toEqual([]);
    for (const id of ['ccs', 'ncs', 'ns', 'scval', 'de-anza', 'el-camino', 'bval', 'mt-hamilton', 'santa-teresa', 'pcal', 'mcal', 'marin-county', 'eal']) {
      expect(all, `app/standings/page.tsx: #${id}`).toContain(id);
    }
  });

  it('follows the heading outline h2 section → h3 league → plain h4 division', () => {
    const html = renderOverview();
    const outline = [...html.matchAll(/<h([1-4])[^>]*>([\s\S]*?)<\/h\1>/g)].map((m) => `h${m[1]} ${textOf(m[2]).trim()}`);
    expect(outline, 'app/standings/page.tsx outline').toEqual([
      'h1 Standings',
      'h2 Central Coast Section',
      'h3 SCVAL — Santa Clara Valley Athletic League',
      'h4 De Anza',
      'h4 El Camino',
      'h3 BVAL — Blossom Valley Athletic League',
      'h4 Mt. Hamilton',
      'h4 Santa Teresa',
      'h3 PCAL — Pacific Coast Athletic League',
      'h2 North Coast Section',
      'h3 MCAL — Marin County Athletic League',
      'h2 Northern Section',
      'h3 EAL — Eastern Athletic League',
      'h2 Southern Section',
      'h3 Sunset — Sunset field hockey league',
      // No table, so no h4: the group's note and its three teams (DESIGN §24.9).
      'h3 LA independents',
      'h2 San Diego Section',
      'h3 City — City Conference',
      'h4 City Western',
      'h4 City Eastern',
      'h3 North — North County Conference',
      'h4 Avocado',
      'h4 Palomar',
      'h4 Valley',
      'h3 Metro — Metro Conference',
      'h4 Metro Mesa',
      'h4 Metro South Bay',
    ]);
    expect(html).toMatch(/<h4 class="m-0 mb-3 text-lead text-ink">/);
  });

  it('wraps each region’s sections in <div id="norcal|socal" data-region-scope> (DESIGN-socal §2.4)', () => {
    const html = renderOverview();
    const norcal = html.indexOf('<div id="norcal" data-region-scope="norcal">');
    const socal = html.indexOf('<div id="socal" data-region-scope="socal">');
    expect(norcal, 'app/standings/page.tsx #norcal').toBeGreaterThan(0);
    expect(socal, 'app/standings/page.tsx #socal').toBeGreaterThan(norcal);
    // The NorCal sections sit before the SoCal wrapper, the SoCal ones after it.
    expect(html.indexOf('id="ns"')).toBeLessThan(socal);
    expect(html.indexOf('id="ss"')).toBeGreaterThan(socal);
    expect(html.indexOf('id="sds"')).toBeGreaterThan(socal);
    // The Sunset's membership note under its heading; the region control under the header.
    expect(textOf(html)).toContain(
      'The Sunset here is a field hockey grouping of eight Southern Section schools in Orange and Riverside counties, not the all-sports Sunset League.',
    );
    expect(html, 'app/standings/page.tsx region control').toContain('data-region-option="socal"');
    // The points sentence names the 'site' leagues and never says their rules require anything.
    expect(textOf(html)).toContain('(Sunset, City, North, Metro and the LA independents publish no points rule, so there the order is this site’s own points)');
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i), 'app/standings/page.tsx duplicate ids').toEqual([]);
  });

  it('draws the labelled ladder line, links each full table, and has no sticky head', () => {
    const html = renderOverview();
    const text = textOf(html);
    for (const label of ['AQ line', 'Play-in host', 'Tournament line']) {
      expect(text, `components/standings/CompactStandingsTable.tsx ${label}`).toContain(label);
    }
    expect(html).toContain('href="/standings/scval#de-anza"');
    expect(html).toContain('href="/standings/mcal#marin-county"');
    expect(text).toContain('Full De Anza table →');
    expect(text).toContain('Full PCAL table →');
    expect(html, 'components/standings/CompactStandingsTable.tsx static head').toContain('[&amp;_th]:static');
    expect(text).not.toContain('Gabilan');
  });
});
