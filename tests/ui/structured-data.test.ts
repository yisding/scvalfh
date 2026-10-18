/**
 * The JSON-LD the pages carry (components/layout/structured-data.ts, components/layout/JsonLd.tsx):
 * the escaping that keeps free text inside its <script>, the WebSite node on `/`, a SportsTeam per
 * registry team and a SportsEvent per game of the corpus snapshot — each property the page shows,
 * and nothing the data does not have (no score property, no venue from MaxPreps' note field, no
 * league for a group of independents, no cancelled state).
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';

import { stubCorpusSnapshot } from '@/tests/support/corpus-snapshot';

type StructuredData = typeof import('@/components/layout/structured-data');
type GameView = typeof import('@/components/game/game-view');
type Data = typeof import('@/lib/data');

let sd: StructuredData;
let gv: GameView;
let data: Data;

stubCorpusSnapshot('all-2026-10-02');

beforeAll(async () => {
  sd = await import('@/components/layout/structured-data');
  gv = await import('@/components/game/game-view');
  data = await import('@/lib/data');
}, 600_000);

/** The node back out of the rendered <script>, the way a crawler reads it. */
async function roundTrip(node: Record<string, unknown>): Promise<{ html: string; parsed: unknown }> {
  const JsonLd = (await import('@/components/layout/JsonLd')).default;
  const html = renderToStaticMarkup(createElement(JsonLd, { data: node as never }));
  const body = /^<script type="application\/ld\+json">([\s\S]*)<\/script>$/.exec(html)?.[1];
  if (body === undefined) throw new Error(`components/layout/JsonLd.tsx: not one ld+json script: ${html}`);
  return { html, parsed: JSON.parse(body) };
}

describe('JsonLd (components/layout/JsonLd.tsx)', () => {
  it('writes every < as \\u003c, so free text cannot close the script, and parses back unchanged', async () => {
    const node = { '@type': 'Thing', description: 'Senior Night </script><img src=x onerror=alert(1)>' };
    const { html, parsed } = await roundTrip(node);
    expect(html.match(/<\/script>/g), 'one closing tag, the real one').toHaveLength(1);
    expect(html).not.toContain('<img');
    expect(parsed).toEqual(node);
  });
});

describe('websiteJsonLd', () => {
  it('names the site as og:site_name and the wordmark do, with no SearchAction', async () => {
    const { SITE_NAME, SITE_URL, SITE_WORDMARK } = await import('@/components/layout/site');
    const node = sd.websiteJsonLd();
    expect(node['@type']).toBe('WebSite');
    expect(node.name).toBe(SITE_NAME);
    expect(node.alternateName).toContain(SITE_WORDMARK);
    expect(node.url).toBe(`${SITE_URL}/`);
    expect(node).not.toHaveProperty('potentialAction');
  });
});

describe('teamJsonLd', () => {
  it('describes every registry team: sport, its city, its league unless it is a group of independents', async () => {
    const { TEAMS } = await import('@/lib/teams');
    const { getLeague, isIndependentLeague } = await import('@/lib/leagues');
    for (const team of TEAMS) {
      const node = sd.teamJsonLd(team, getLeague(team.league));
      const where = `components/layout/structured-data.ts teamJsonLd ${team.slug}`;
      expect(node['@type'], where).toBe('SportsTeam');
      expect(node['@id'], where).toBe(sd.teamNodeId(team.slug));
      expect(node.name, where).toBe(team.name);
      expect(node.sport, where).toBe('Field hockey');
      expect(JSON.stringify(node.location), where).toContain(JSON.stringify(team.city));
      if (isIndependentLeague(team.league)) expect(node, where).not.toHaveProperty('memberOf');
      else expect((node.memberOf as Record<string, unknown>).name, where).toBe(getLeague(team.league).name);
      if (team.external.maxprepsTeamUrl) expect(node.sameAs, where).toEqual([team.external.maxprepsTeamUrl]);
      expect(node, where).not.toHaveProperty('athlete');
    }
  });
});

describe('gameJsonLd', () => {
  it('describes every corpus game as the page does: title, start, status, sides and only a published place', async () => {
    const { dateTimeAttr } = await import('@/lib/format');
    for (const { id } of gv.gameStaticParams()) {
      const model = gv.buildGameView(id);
      if (!model) continue; // a superseded stub: no event of its own
      const { game } = model;
      const node = sd.gameJsonLd(model);
      const where = `components/layout/structured-data.ts gameJsonLd ${id}`;
      expect(node['@type'], where).toBe('SportsEvent');
      expect(node.name, where).toBe(gv.gameTitle(model));
      expect(node.startDate, where).toBe(game.isDateTba ? undefined : dateTimeAttr(game));
      expect(node.eventStatus, where).not.toBe('https://schema.org/EventCancelled');
      if (game.status === 'postponed') expect(node.eventStatus, where).toBe('https://schema.org/EventPostponed');
      for (const [key, side] of [['homeTeam', model.home], ['awayTeam', model.away]] as const) {
        const sideNode = node[key] as Record<string, unknown>;
        expect(sideNode.name, `${where} ${key}`).toBe(side.name);
        expect(sideNode['@id'], `${where} ${key}`).toBe(side.team ? sd.teamNodeId(side.team.slug) : undefined);
      }
      // No score property exists on SportsEvent; none is invented.
      expect(JSON.stringify(node), where).not.toMatch(/"(home|away)Score"/);
      if (game.site === 'neutral' && !game.venue.name) expect(node, where).not.toHaveProperty('location');
      if (game.venue.text) expect(JSON.stringify(node.location ?? null), where).not.toContain(JSON.stringify(game.venue.text));
    }
    expect(data.getGames().length).toBeGreaterThan(0);
  });
});
