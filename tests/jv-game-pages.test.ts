/**
 * The JV game pages (app/jv/game/[id], components/jv/jv-game-view.ts) over the bundled JV file, and the varsity
 * twin rule both game pages link each other by (lib/jv/jv-standings.ts jvVarsityTwins).
 */
import { describe, expect, it } from 'vitest';

import { buildJvGameView, jvGameStaticParams } from '../components/jv/jv-game-view';
import { buildDayJvView, buildTeamJvView } from '../components/jv/jv-view';
import { getGameDates, getSnapshot } from '../lib/data';
import { GAME_SLUG_RE, baseGameSlug } from '../lib/game-slug';
import {
  getJvGameBySlug,
  getJvGameForVarsity,
  getJvGameSlug,
  getJvGames,
  getJvVarsityGame,
  jvGameHref,
} from '../lib/jv/jv';
import { jvVarsityTwins } from '../lib/jv/jv-standings';
import { TEAMS } from '../lib/teams';
import { game as makeGame } from './game-builder';

const games = getJvGames();
const varsityDates = new Set(getGameDates());

describe('JV game slugs', () => {
  it('gives every listed JV game one slug, a page param, unique, in the varsity slug form', () => {
    const params = jvGameStaticParams().map((p) => p.id);
    expect(params).toHaveLength(games.length);
    expect(new Set(params).size).toBe(params.length);
    for (const id of params) expect(id).toMatch(GAME_SLUG_RE);
  });

  it('names a game by its date and sides, `-2` only on a same-day pair', () => {
    for (const g of games) {
      const slug = getJvGameSlug(g.contestId)!;
      const base = baseGameSlug(g);
      expect(slug === base || /^-\d+$/.test(slug.slice(base.length))).toBe(true);
      expect(getJvGameBySlug(slug)?.contestId).toBe(g.contestId);
      expect(jvGameHref(g)).toBe(`/jv/game/${slug}`);
    }
  });
});

describe('the JV game page model', () => {
  it('builds for every slug, with its canonical URL and two sides', () => {
    for (const { id } of jvGameStaticParams()) {
      const model = buildJvGameView(id)!;
      expect(model).toBeDefined();
      expect(model.canonical).toBe(`/jv/game/${id}`);
      expect(model.param).toBe(id);
      expect(model.countsAs.label).not.toBe('');
    }
    expect(buildJvGameView('2026-01-01-nobody-at-nowhere')).toBeUndefined();
  });

  it('links the date to its score day only when the day has a varsity game', () => {
    for (const { id } of jvGameStaticParams()) {
      const model = buildJvGameView(id)!;
      if (varsityDates.has(model.game.dateKey)) expect(model.dayHref).toBe(`/scores/${model.game.dateKey}#jv`);
      else expect(model.dayHref).toMatch(new RegExp(`^/jv(/[a-z-]+#d-${model.game.dateKey})?$`));
    }
  });

  it('counts a final in the records under the names, and a game still to play in neither', () => {
    const final = games.find((g) => g.status === 'final' && g.home.slug && g.away.slug && g.home.score! > g.away.score!);
    expect(final).toBeDefined();
    const model = buildJvGameView(getJvGameSlug(final!.contestId)!)!;
    expect(model.home.outcome).toBe('W');
    expect(model.away.outcome).toBe('L');
    expect(model.home.sub).toMatch(/^\d+-\d+(-\d+)? JV$/);
    expect(model.recordsCaption).toMatch(/after this game$/);
  });

  it('lists the two teams’ JV meetings as the series, this game among them', () => {
    for (const { id } of jvGameStaticParams().slice(0, 200)) {
      const model = buildJvGameView(id)!;
      expect(model.series.filter((m) => m.isThisGame).map((m) => m.game.contestId)).toEqual([model.game.contestId]);
      for (const m of model.series) expect(m.href).toBe(jvGameHref(m.game));
    }
  });

  it('every JV row on a team page and a day page links its page', () => {
    for (const team of TEAMS) for (const row of buildTeamJvView(team.slug)?.rows ?? []) expect(row.href).toBe(jvGameHref(row.game));
    for (const date of new Set(games.map((g) => g.dateKey))) {
      for (const row of buildDayJvView(date).rows) expect(row.href).toMatch(/^\/jv\/game\//);
    }
  });
});

describe('jvVarsityTwins', () => {
  it('pairs a JV game with the nearest varsity game of the two schools within three days', () => {
    const v = makeGame({ home: 'cupertino', away: 'los-gatos', date: '2026-09-15', hs: 1, as: 2 });
    const far = makeGame({ home: 'cupertino', away: 'los-gatos', date: '2026-10-15', hs: 0, as: 0 });
    const jv = makeGame({ home: 'los-gatos', away: 'cupertino', date: '2026-09-16', hs: 3, as: 0 });
    const { varsityOf, jvOf } = jvVarsityTwins([jv], [v, far]);
    expect(varsityOf.get(jv.contestId)?.contestId).toBe(v.contestId);
    expect(jvOf.get(v.contestId)).toBe(jv.contestId);
    expect(jvOf.has(far.contestId)).toBe(false);
  });

  it('decides nothing on two equally near varsity games, and links no JV game back to a varsity game two claim', () => {
    const a = makeGame({ home: 'cupertino', away: 'los-gatos', date: '2026-09-14' });
    const b = makeGame({ home: 'cupertino', away: 'los-gatos', date: '2026-09-16' });
    const between = makeGame({ home: 'cupertino', away: 'los-gatos', date: '2026-09-15' });
    expect(jvVarsityTwins([between], [a, b]).varsityOf.has(between.contestId)).toBe(false);

    const v = makeGame({ home: 'cupertino', away: 'los-gatos', date: '2026-09-15' });
    const jv1 = makeGame({ home: 'cupertino', away: 'los-gatos', date: '2026-09-15' });
    const jv2 = makeGame({ home: 'cupertino', away: 'los-gatos', date: '2026-09-15' });
    const twins = jvVarsityTwins([jv1, jv2], [v]);
    expect(twins.varsityOf.get(jv1.contestId)?.contestId).toBe(v.contestId);
    expect(twins.jvOf.has(v.contestId)).toBe(false);
  });

  it('agrees both ways over the bundled files: a varsity page’s JV game names that varsity game', () => {
    let linked = 0;
    for (const v of getSnapshot().games) {
      const jv = getJvGameForVarsity(v.contestId);
      if (!jv) continue;
      linked += 1;
      expect(getJvVarsityGame(jv.contestId)?.contestId).toBe(v.contestId);
    }
    expect(linked).toBeGreaterThan(0);
  });
});
