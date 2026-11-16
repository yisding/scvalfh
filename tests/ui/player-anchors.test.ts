/**
 * components/teams/player-anchors.ts and its two readers on the team page: every varsity roster row
 * carries a `player-…` id, and every player stats name that joins a roster row links it.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import TeamPage from '../../app/teams/[slug]/page';
import { playerAnchors } from '../../components/teams/player-anchors';
import { buildPlayerStatsView } from '../../components/teams/player-stats-view';
import { getPlayerStats } from '../../lib/players/player-stats';
import { TEAMS } from '../../lib/teams';

async function render(slug: string): Promise<string> {
  const element = await TeamPage({ params: Promise.resolve({ slug }) } as never);
  return renderToStaticMarkup(element);
}

describe('playerAnchors', () => {
  const p = (athleteId: string | null, fullName: string, level: 'varsity' | 'jv' | null = null) => ({ athleteId, fullName, level });

  it("is the player's name in ASCII, a hyphen for every run of anything else", () => {
    const a = playerAnchors([
      p('a', 'Ana Ames'),
      p('b', 'Chloé Wall'),
      p('c', 'Sophie (Mai Lam) Vu'),
      p('d', 'Amelia "mimi" Scatena'),
      p('e', "Kate O'Neil-Smith"),
    ]);
    expect([...a.values()]).toEqual([
      'player-ana-ames',
      'player-chloe-wall',
      'player-sophie-mai-lam-vu',
      'player-amelia-mimi-scatena',
      'player-kate-o-neil-smith',
    ]);
  });

  it('numbers a repeated name in file order, skips JV and athleteId-less rows, and never takes a section id', () => {
    const a = playerAnchors([
      p('a', 'Mia Vega'),
      p('b', 'Mia Vega'),
      p('c', 'mia  vega'),
      p('d', 'Jo Jones', 'jv'),
      p(null, 'No Id'),
      p('e', 'Stats'),
      p('f', '?!'),
    ]);
    expect(Object.fromEntries(a)).toEqual({
      a: 'player-mia-vega',
      b: 'player-mia-vega-2',
      c: 'player-mia-vega-3',
      e: 'player-stats-2',
      f: 'player-unnamed',
    });
  });
});

describe('the team page links each player stats name to the player’s roster row', () => {
  it('passes the anchors through to every table row and goalkeeper', () => {
    const team = getPlayerStats().teams.find((t) => t.players.length > 0)!;
    const ids = new Map(team.players.flatMap((pl) => (pl.athleteId ? [[pl.athleteId, `player-x-${pl.athleteId}`] as const] : [])));
    const view = buildPlayerStatsView(team.slug, [], team, ids)!;
    const rows = [
      ...(view.scoring?.rows ?? []),
      ...(view.more?.rows ?? []),
      ...view.goalies,
      ...(view.tables ?? []).flatMap((t) => t.table.rows),
    ];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const line = team.players.find((pl) => pl.fullName === row.name)!;
      expect(row.href, row.name).toBe(line.athleteId ? `#player-x-${line.athleteId}` : undefined);
    }
    // No anchors, no links.
    const bare = buildPlayerStatsView(team.slug, [], team, new Map())!;
    expect([...(bare.scoring?.rows ?? []), ...(bare.tables ?? []).flatMap((t) => t.table.rows)].every((r) => r.href === undefined)).toBe(true);
  });

  it('every in-page player link lands on a roster row of that page, and every id is unique', async () => {
    let links = 0;
    for (const team of TEAMS) {
      const html = await render(team.slug);
      const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
      expect(new Set(ids).size, `${team.slug}: duplicate id`).toBe(ids.length);
      const rosterIds = new Set(
        [...html.matchAll(/<li id="(player-[^"]+)" class="sx-target/g)].map((m) => m[1]),
      );
      for (const m of html.matchAll(/<a href="#(player-[^"]+)" class="sx-teamlink">/g)) {
        expect(rosterIds.has(m[1]), `${team.slug}: #${m[1]}`).toBe(true);
        links += 1;
      }
    }
    // The join works on the committed data: stat lines do link their roster rows.
    expect(links).toBeGreaterThan(0);
  });
});
