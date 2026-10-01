/**
 * DESIGN §10.9(e) at ROUTE level: "no rendered route emits 0-0 for a non-final game".
 *
 * tests/ui/render-score.test.ts already walks the §5.2 table at helper level. This file closes
 * the other half by rendering the real components a route is built from, over the real snapshot,
 * with `react-dom/server` — no browser, no `next build`. Four page stages each verified this from
 * a scratchpad script and asked for it to be committed (see scratchpad/notes/page-{home,teams,
 * schedule,game}.md); this is that test.
 *
 * It asserts the rule in BOTH directions, which is the only way it means anything: a non-final
 * game renders no numeric score anywhere, AND a genuine 0-0 final still renders two zeros. A
 * component that suppressed every zero would pass the first assertion and be wrong.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { buildGameModel, gameDescription, gameKicker, gameTitle } from '../../components/game/game-model';
import { GameCard, GameLine, GameLogRow, GameRow } from '../../components/ui/GameRow';
import { ScoreCell } from '../../components/ui/ScoreCell';
import { getGames } from '../../lib/data';
import type { Game } from '../../lib/types';

const games = getGames();
const nonFinal = games.filter((g) => g.status !== 'final');
const finals = games.filter((g) => g.status === 'final');
const goalless = finals.filter((g) => g.home.score === 0 && g.away.score === 0);

/** Every score glyph in the markup, with the size class it was rendered at. */
function scoreGlyphs(html: string): string[] {
  return [
    ...html.matchAll(
      /class="sx-num [^"]*text-(?:score|meta|\[2rem\])[^"]*"><span(?: aria-hidden="true")?>([^<]{1,4})<\/span>/g,
    ),
  ].map((m) => m[1]);
}

function textOf(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x2013;|&ndash;/g, '–')
    .replace(/\s+/g, ' ');
}

function renderAllVariants(game: Game): string {
  return [
    renderToStaticMarkup(createElement(GameRow, { game })),
    renderToStaticMarkup(createElement(GameCard, { game })),
    renderToStaticMarkup(createElement(GameLine, { game })),
    renderToStaticMarkup(createElement(GameLogRow, { game })),
    renderToStaticMarkup(createElement(ScoreCell, { game })),
  ].join('\n');
}

describe('a non-final game never renders a score', () => {
  it('has non-final games to check', () => {
    expect(nonFinal.length).toBeGreaterThan(0);
  });

  it('renders no numeric score glyph in any GameRow variant', () => {
    const offenders: string[] = [];
    for (const game of nonFinal) {
      const html = renderAllVariants(game);
      for (const glyph of scoreGlyphs(html)) {
        if (/^\d/.test(glyph)) {
          offenders.push(`${game.dateKey} ${game.away.name} at ${game.home.name}: "${glyph}"`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('renders no digit-dash-digit pair in the visible text', () => {
    const offenders: string[] = [];
    for (const game of nonFinal) {
      const text = textOf(renderAllVariants(game));
      // A W-L-T record (0-4-0) is three groups, so it is excluded by the lookarounds.
      const hit = text.match(/(?<![\d-])\d{1,2}\s*[–-]\s*\d{1,2}(?![\d-])/);
      if (hit) offenders.push(`${game.contestId} ${game.status}: ${hit[0]} in "${text.slice(0, 120)}"`);
    }
    expect(offenders).toEqual([]);
  });

  it('gives the score-pending game two en dashes and the words, not zeros', () => {
    const pending = games.filter((g) => g.status === 'score-pending');
    expect(pending.length).toBeGreaterThan(0);
    for (const game of pending) {
      const html = renderToStaticMarkup(createElement(GameRow, { game }));
      expect(scoreGlyphs(html)).toEqual(['–', '–']);
      expect(html).toContain('score not reported');
      expect(html).toContain('SCORE NOT REPORTED');
    }
  });

  it('keeps the rule in the <title>, the description and the kicker of every game page', () => {
    const offenders: string[] = [];
    for (const game of nonFinal) {
      const model = buildGameModel(game.contestId);
      expect(model).not.toBeNull();
      for (const line of [gameTitle(model!), gameDescription(model!), gameKicker(model!)]) {
        if (/(?<![\d-])\d{1,2}\s*[–-]\s*\d{1,2}(?![\d-])/.test(line)) {
          offenders.push(`${game.contestId}: ${line}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('a real zero is still a zero', () => {
  it('renders both zeros of a genuine 0-0 final', () => {
    expect(goalless.length).toBeGreaterThan(0);
    for (const game of goalless) {
      const html = renderToStaticMarkup(createElement(GameRow, { game }));
      expect(scoreGlyphs(html)).toEqual(['0', '0']);
      expect(html).not.toContain('score not reported');
    }
  });

  it('renders the real score of every final', () => {
    for (const game of finals) {
      const glyphs = scoreGlyphs(renderToStaticMarkup(createElement(GameRow, { game })));
      expect(glyphs).toEqual([String(game.away.score), String(game.home.score)]);
    }
  });
});
