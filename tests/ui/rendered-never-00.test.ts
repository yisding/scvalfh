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
 * Multi-league (SPEC §10.4, §13.6): every walk covers SCVAL, BVAL, PCAL and MCAL. The rule runs
 * twice. Over the bundled data/snapshot.json (replaced twice a day by the data cron, whose commit
 * this suite gates) it asserts per-game INVARIANTS only — loops that pass trivially when a set is
 * empty, because a day with no score-pending game (every score entered, or backfilled by D2 rule 3)
 * or no 0-0 final is a normal day and must never block publishing. The two-direction PROOF — that
 * the sets exist and the rule bites on them — runs over the offline all-2026-10-02 corpus, which
 * has score-pending games, scheduled games and 0-0 finals (lib/data is re-imported after
 * SCVAL_SNAPSHOT points at it). Every assertion message names the module that produced the value.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { buildGameModel, gameDescription, gameKicker, gameTitle } from '../../components/game/game-model';
import { GameCard, GameLine, GameLogRow, GameRow } from '../../components/ui/GameRow';
import { ScoreCell } from '../../components/ui/ScoreCell';
import { getGames, getLeagueSummaries, getTeamBySlug } from '../../lib/data';
import type { Game } from '../../lib/types';
import { corpusSnapshotPath } from '../helpers';

interface Rendered {
  games: Game[];
  buildGameModel: typeof buildGameModel;
  gameTitle: typeof gameTitle;
  gameDescription: typeof gameDescription;
  gameKicker: typeof gameKicker;
  GameRow: typeof GameRow;
  GameCard: typeof GameCard;
  GameLine: typeof GameLine;
  GameLogRow: typeof GameLogRow;
  ScoreCell: typeof ScoreCell;
}

const live: Rendered = {
  games: getGames(),
  buildGameModel,
  gameTitle,
  gameDescription,
  gameKicker,
  GameRow,
  GameCard,
  GameLine,
  GameLogRow,
  ScoreCell,
};

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

/** A score-like pair; a W-L-T record (0-4-0) is three groups, so the lookarounds exclude it. */
const SCORE_PAIR = /(?<![\d-])\d{1,2}\s*[–-]\s*\d{1,2}(?![\d-])/;

/**
 * The never-0-0 rule over one snapshot. `proof` adds the existence checks that make the rule mean
 * something (a non-final, a score-pending game and a 0-0 final are all present); it is set only for
 * the fixed corpus, never for the live snapshot.
 */
function defineRule(name: string, get: () => Rendered, proof: boolean) {
  const sets = () => {
    const r = get();
    const finals = r.games.filter((g) => g.status === 'final');
    return {
      r,
      nonFinal: r.games.filter((g) => g.status !== 'final'),
      pending: r.games.filter((g) => g.status === 'score-pending'),
      finals,
      goalless: finals.filter((g) => g.home.score === 0 && g.away.score === 0),
    };
  };
  const renderAllVariants = (r: Rendered, game: Game): string =>
    [
      renderToStaticMarkup(createElement(r.GameRow, { game })),
      renderToStaticMarkup(createElement(r.GameCard, { game })),
      renderToStaticMarkup(createElement(r.GameLine, { game })),
      renderToStaticMarkup(createElement(r.GameLogRow, { game })),
      renderToStaticMarkup(createElement(r.ScoreCell, { game })),
    ].join('\n');

  describe(`${name}: a non-final game never renders a score`, () => {
    if (proof) {
      it('has non-final and score-pending games to check', () => {
        expect(sets().nonFinal.length).toBeGreaterThan(0);
        expect(sets().pending.length).toBeGreaterThan(0);
      });
    }

    it('renders no numeric score glyph in any GameRow variant', () => {
      const { r, nonFinal } = sets();
      const offenders: string[] = [];
      for (const game of nonFinal) {
        for (const glyph of scoreGlyphs(renderAllVariants(r, game))) {
          if (/^\d/.test(glyph)) {
            offenders.push(`${game.dateKey} ${game.away.name} at ${game.home.name}: "${glyph}"`);
          }
        }
      }
      expect(offenders).toEqual([]);
    });

    it('renders no digit-dash-digit pair in the visible text', () => {
      const { r, nonFinal } = sets();
      const offenders: string[] = [];
      for (const game of nonFinal) {
        const text = textOf(renderAllVariants(r, game));
        const hit = text.match(SCORE_PAIR);
        if (hit) offenders.push(`${game.contestId} ${game.status}: ${hit[0]} in "${text.slice(0, 120)}"`);
      }
      expect(offenders).toEqual([]);
    });

    it('gives every score-pending game two en dashes and the words, not zeros', () => {
      const { r, pending } = sets();
      for (const game of pending) {
        const html = renderToStaticMarkup(createElement(r.GameRow, { game }));
        expect(scoreGlyphs(html)).toEqual(['–', '–']);
        expect(html).toContain('score not reported');
        expect(html).toContain('SCORE NOT REPORTED');
      }
    });

    it('keeps the rule in the <title>, the description and the kicker of every game page', () => {
      const { r, nonFinal } = sets();
      const offenders: string[] = [];
      for (const game of nonFinal) {
        const model = r.buildGameModel(game.contestId);
        expect(model).toBeDefined();
        for (const line of [r.gameTitle(model!), r.gameDescription(model!), r.gameKicker(model!)]) {
          if (SCORE_PAIR.test(line)) offenders.push(`${game.contestId}: ${line}`);
        }
      }
      expect(offenders).toEqual([]);
    });
  });

  describe(`${name}: a real zero is still a zero`, () => {
    if (proof) {
      it('has a genuine 0-0 final to check', () => {
        expect(sets().goalless.length).toBeGreaterThan(0);
      });
    }

    it('renders both zeros of every genuine 0-0 final', () => {
      const { r, goalless } = sets();
      for (const game of goalless) {
        const html = renderToStaticMarkup(createElement(r.GameRow, { game }));
        expect(scoreGlyphs(html)).toEqual(['0', '0']);
        expect(html).not.toContain('score not reported');
      }
    });

    it('renders the real score of every final', () => {
      const { r, finals } = sets();
      for (const game of finals) {
        const glyphs = scoreGlyphs(renderToStaticMarkup(createElement(r.GameRow, { game })));
        expect(glyphs).toEqual([String(game.away.score), String(game.home.score)]);
      }
    });
  });
}

defineRule('bundled snapshot (invariants)', () => live, false);

describe('offline corpus (proof)', () => {
  const priorEnv = process.env.SCVAL_SNAPSHOT;
  let corpus: Rendered | undefined;

  beforeAll(async () => {
    process.env.SCVAL_SNAPSHOT = corpusSnapshotPath('all-2026-10-02');
    vi.resetModules();
    const data = await import('../../lib/data');
    const model = await import('../../components/game/game-model');
    const row = await import('../../components/ui/GameRow');
    const cell = await import('../../components/ui/ScoreCell');
    corpus = {
      games: data.getGames(),
      buildGameModel: model.buildGameModel,
      gameTitle: model.gameTitle,
      gameDescription: model.gameDescription,
      gameKicker: model.gameKicker,
      GameRow: row.GameRow,
      GameCard: row.GameCard,
      GameLine: row.GameLine,
      GameLogRow: row.GameLogRow,
      ScoreCell: cell.ScoreCell,
    };
  }, 600_000);

  afterAll(() => {
    if (priorEnv === undefined) delete process.env.SCVAL_SNAPSHOT;
    else process.env.SCVAL_SNAPSHOT = priorEnv;
    vi.resetModules();
  });

  defineRule('corpus all-2026-10-02', () => corpus!, true);
});

const games = live.games;
const finals = games.filter((g) => g.status === 'final');

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
