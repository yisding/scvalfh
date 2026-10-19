/**
 * The /teams index (SPEC §10.5; views/teams/team-card.ts → app/teams/page.tsx): heading outline, the finder hooks, a
 * row per team and the links to the club and commitment pages.  League-specific values are asserted on the
 * all-2026-10-02 CORPUS snapshot (SPEC §13.6), loaded through useCorpusModules (tests/support/team-view.ts), so live
 * fetch #2 cannot break them. Every assertion message names the module that produced the value, so a failure routes
 * to its owner.
 */

import { describe, expect, it } from 'vitest';

import { textOf } from '@/tests/support/html-text';
import { m, renderIndex, ids } from '@/tests/support/team-view';

describe('/teams (app/teams/page.tsx)', () => {
  it('heading outline: h2 section → h3 league → h4 division; anchors resolve; ids unique', () => {
    const html = renderIndex();
    const all = ids(html);
    expect(new Set(all).size, 'app/teams/page.tsx: unique ids').toBe(all.length);
    for (const id of [
      'ccs', 'ncs', 'ns', 'scval', 'de-anza', 'el-camino', 'bval', 'mt-hamilton', 'santa-teresa', 'pcal', 'mcal', 'marin-county', 'eal',
      'ss', 'sds', 'sunset', 'city', 'city-western', 'city-eastern', 'north-county', 'avocado', 'palomar', 'valley', 'metro', 'metro-mesa',
      'metro-south-bay', 'independents', 'norcal', 'socal', 'team-list', 'team-league-switcher',
    ]) {
      expect(all, `app/teams/page.tsx #${id}`).toContain(id);
    }
    expect(html, 'app/teams/page.tsx CCS h2').toMatch(/<h2[^>]*>Central Coast Section<\/h2>/);
    expect(html, 'app/teams/page.tsx NCS h2').toMatch(/<h2[^>]*>North Coast Section<\/h2>/);
    expect(html, 'app/teams/page.tsx NS h2').toMatch(/<h2[^>]*>Northern Section<\/h2>/);
    expect(html, 'app/teams/page.tsx section labelling').toContain('<section aria-labelledby="ccs"');
    // Nine leagues and the LA independents (one table, so no h4: DESIGN §24.10).
    expect((html.match(/<h3[^>]*>/g) ?? []).length, 'app/teams/page.tsx league h3s').toBe(10);
    const h4s = [...html.matchAll(/<h4 class="m-0 mb-3 text-lead text-ink">([^<]+)<\/h4>/g)].map((m) => m[1]);
    expect(h4s, 'app/teams/page.tsx division h4s').toEqual([
      'De Anza', 'El Camino', 'Mt. Hamilton', 'Santa Teresa',
      'City Western', 'City Eastern', 'Avocado', 'Palomar', 'Valley', 'Metro Mesa', 'Metro South Bay',
    ]);
    // Region → section → league order; the regions are `<div id="norcal|socal" data-region-scope>`
    // inside #team-list (DESIGN-socal §2.4), so the finder's lift can show both while searching.
    expect(html, 'app/teams/page.tsx region wrappers').toMatch(/<div id="team-list"><div id="norcal" data-region-scope="norcal">/);
    expect(html, 'app/teams/page.tsx region wrappers').toContain('<div id="socal" data-region-scope="socal">');
    expect(html, 'app/teams/page.tsx lift hook').toContain('data-teams-page=""');
    const order = [
      'id="norcal"', 'id="ccs"', 'id="scval"', 'id="de-anza"', 'id="el-camino"', 'id="bval"', 'id="pcal"', 'id="ncs"', 'id="mcal"',
      'id="marin-county"', 'id="ns"', 'id="eal"', 'id="socal"', 'id="ss"', 'id="sunset"', 'id="independents"', 'id="sds"', 'id="city"',
      'id="north-county"', 'id="metro"',
    ].map((s) => html.indexOf(s));
    expect([...order].sort((a, b) => a - b), 'app/teams/page.tsx order').toEqual(order);
  });

  it('the finder hooks: 102 standings rows with data-team-tile, ladder rows, group wrappers, the switcher', () => {
    const html = renderIndex();
    // Every team is a row of its division's standings table (DESIGN §18), and the row is the
    // finder's hook: no <li> tiles any more.
    const rows = [...html.matchAll(/<tr data-team-slug="([^"]+)" data-team-tile="([^"]+)"/g)];
    expect(rows.length, 'components/standings/CompactStandingsTable.tsx data-team-tile').toBe(102);
    for (const [, slug, tile] of rows) expect(tile, slug).toBe(slug);
    expect(new Set(rows.map((m) => m[2])), 'app/teams/page.tsx every team').toEqual(new Set(m.data.getTeamSlugs()));
    expect(html, 'app/teams/page.tsx no tiles').not.toContain('<li data-team-tile');
    // The pinned row says so in words, not with the accent rule alone: every row's link carries the
    // hidden note the pinned-team CSS reveals (the old tiles did too).
    const links = [...html.matchAll(/<tr data-team-slug="[^"]+"[\s\S]*?<a [^>]*href="\/teams\/[^"]+"[^>]*>([\s\S]*?)<\/a>/g)];
    expect(links.length, 'components/standings/CompactStandingsTable.tsx row links').toBe(102);
    for (const [, inner] of links) {
      expect(inner, 'components/standings/CompactStandingsTable.tsx pin note').toContain(
        '<span class="sr-only"><span class="sx-pin-note" hidden="">Your team. </span></span>',
      );
    }
    // Sixteen tables, one per division, each in a group wrapper the finder can hide (5 sections, 9
    // leagues and the independents, 16 divisions; the independents' table is one of them, DESIGN §24.10).
    expect((html.match(/<table/g) ?? []).length, 'app/teams/page.tsx tables').toBe(16);
    expect((html.match(/data-team-group=""/g) ?? []).length, 'app/teams/page.tsx data-team-group').toBe(5 + 10 + 16);
    // A division with a ladder line drawn marks it, so a search never leaves it between rows.
    const lines = [...html.matchAll(/<tr data-hide-while-searching="">\s*<td colSpan="5"[^>]*>([^<]+)</g)].map((m) => m[1]);
    expect(lines.length, 'components/standings/CompactStandingsTable.tsx ladder rows').toBeGreaterThan(0);
    for (const label of lines) expect(label, 'ladder row label').toMatch(/line|host/i);
    // Each division links its full league table.
    for (const href of ['/standings/scval#de-anza', '/standings/bval#santa-teresa', '/standings/pcal#pcal', '/standings/mcal#marin-county', '/standings/eal#eal']) {
      expect(html, `app/teams/page.tsx ${href}`).toContain(`href="${href}"`);
    }
    expect(html, 'app/teams/page.tsx finder').toContain('<search');
    expect(html, 'app/teams/page.tsx switcher').toMatch(/<div id="team-league-switcher"[^>]*>\s*<nav/);
    const text = textOf(html);
    expect(text, 'app/teams/page.tsx description').toContain(
      'each in its division’s standings table. League and division alignment comes from each league’s official schedule; the EAL publishes none, so its six teams are the ones MaxPreps lists in its EAL table, less Red Bluff, which is not fielding a varsity team in 2026. In Southern California it comes from MaxPreps’ 2024-25 and 2025-26 Sunset tables for the Sunset, from the CIF-SDS 2026-27 League Alignment for City, North and Metro and from MaxPreps’ 2026-27 team pages and schedules (five Southern Section schools in no field hockey league, which play each other) for the LA independents.',
    );
    expect(text, 'app/teams/page.tsx description').toContain('All 102 girls varsity teams in ');
    expect(html, 'app/teams/page.tsx').not.toContain('Gabilan');
  });

  it('a row holds what the Table tab showed, and agrees with /standings', () => {
    const html = renderIndex();
    const heads = [...html.matchAll(/<thead[\s\S]*?<\/thead>/g)].map((m) => textOf(m[0]).replace(/\s+/g, ' ').trim());
    for (const head of heads) expect(head, 'app/teams/page.tsx table head').toBe('# Team GP W-L-T Pts');
    for (const slug of ['st-ignatius', 'leigh', 'stevenson', 'tamalpais']) {
      const s = m.data.getStandingFor(slug)!;
      const row = new RegExp(`<tr data-team-slug="${slug}"[\\s\\S]*?</tr>`).exec(html)![0];
      const cells = textOf(row).replace(/\s+/g, ' ');
      if (s.hasReportedResults) {
        expect(cells, slug).toContain(`${s.computed.w}-${s.computed.l}-${s.computed.t}`);
        expect(cells, slug).toContain(String(s.computed.pts));
      }
    }
  });

  it('links the club pages once, quietly, outside the list the finder filters', () => {
    const html = renderIndex();
    expect((html.match(/href="\/clubs"/g) ?? []).length, 'app/teams/page.tsx /clubs link').toBe(1);
    const link = html.indexOf('href="/clubs"');
    // After the whole list (its last group), not inside it: TeamFinder never hides it.
    expect(link, 'app/teams/page.tsx /clubs link').toBeGreaterThan(html.lastIndexOf('data-team-group=""'));
    expect(textOf(html), 'app/teams/page.tsx').toContain(
      'Club field hockey: the club teams page lists youth field hockey clubs and, for each, the players here a public page ties to it.',
    );
  });

  it('links the commitments page once, quietly, outside the list the finder filters', () => {
    const html = renderIndex();
    expect((html.match(/href="\/commits"/g) ?? []).length, 'app/teams/page.tsx /commits link').toBe(1);
    expect(html.indexOf('href="/commits"'), 'app/teams/page.tsx /commits link').toBeGreaterThan(
      html.lastIndexOf('data-team-group=""'),
    );
    expect(textOf(html), 'app/teams/page.tsx').toContain(
      'College commitments: the college commitments page lists the players here a public page says have committed to play in college, in field hockey or another sport.',
    );
  });
});
