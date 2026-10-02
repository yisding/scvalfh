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
 *
 * Multi-league (SPEC §10.4, §13.6): the bundled snapshot holds all four leagues' games, so every
 * walk below covers SCVAL, BVAL, PCAL and MCAL; the assertions are invariants only (the file is
 * replaced by live fetch #2). Every assertion message names the module that produced the value.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { buildGameModel, gameDescription, gameKicker, gameTitle } from '../../components/game/game-model';
import { GameCard, GameLine, GameLogRow, GameRow } from '../../components/ui/GameRow';
import { ScoreCell } from '../../components/ui/ScoreCell';
import { getGames, getLeagueSummaries, getTeamBySlug } from '../../lib/data';
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

describe('every league, rendered', () => {
  it('walks games of all four leagues', () => {
    for (const league of getLeagueSummaries()) {
      const mine = games.filter((g) =>
        [g.home.slug, g.away.slug].some((slug) => slug !== null && getTeamBySlug(slug)?.league === league.id),
      );
      expect(mine.length, `lib/data.ts: games with a ${league.shortName} side`).toBeGreaterThan(0);
    }
  });

  it('marks every si.com score with the † and its words, and no other score', () => {
    for (const game of finals) {
      const html = renderToStaticMarkup(createElement(GameRow, { game }));
      expect(html.includes('Score via si.com'), `components/ui/StatusLabel.tsx ${game.contestId}`).toBe(
        game.provenance.scores === 'sblive',
      );
    }
  });

  it('prints the league chip of a counted game and NL for a non-league one', () => {
    for (const game of games) {
      const text = textOf(renderToStaticMarkup(createElement(GameRow, { game })));
      if (game.countsFor === null && game.postseason === null) {
        expect(text, `components/ui/GameRow.tsx NL ${game.contestId}`).toContain('non-league');
      } else if (game.countsFor !== null) {
        expect(text, `components/ui/GameRow.tsx league chip ${game.contestId}`).toContain('league game');
      }
    }
  });

  it('tags the other league on a league-scoped list, and only there', () => {
    const cross = games.find((g) => {
      const a = g.away.slug ? getTeamBySlug(g.away.slug)?.league : undefined;
      const h = g.home.slug ? getTeamBySlug(g.home.slug)?.league : undefined;
      return a !== undefined && h !== undefined && a !== h;
    });
    if (!cross) return; // no cross-league game in this snapshot: nothing to tag
    const homeLeague = getTeamBySlug(cross.home.slug!)!.league;
    const awayShort = getLeagueSummaries().find((l) => l.id === getTeamBySlug(cross.away.slug!)!.league)!.shortName;
    const scoped = textOf(renderToStaticMarkup(createElement(GameRow, { game: cross, scopeLeague: homeLeague })));
    expect(scoped, 'components/ui/GameRow.tsx scopeLeague').toContain(`· ${awayShort}`);
    const plain = textOf(renderToStaticMarkup(createElement(GameRow, { game: cross })));
    expect(plain, 'components/ui/GameRow.tsx without scopeLeague').not.toContain(`· ${awayShort}`);
  });

  it('links every game through gameHref (sblive ids become sblive-<n>)', () => {
    for (const game of games) {
      const html = renderToStaticMarkup(createElement(GameCard, { game }));
      expect(html, `components/ui/GameRow.tsx ${game.contestId}`).toContain(
        `href="/game/${game.contestId.replace(/^sblive:/, 'sblive-')}"`,
      );
    }
  });
});
