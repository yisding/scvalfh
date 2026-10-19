/**
 * The /game/[id] view model (SPEC §10.6, §8.1, §8.4): views/game/game-view.ts and titles.ts, with the source line and
 * the cross-check paragraph of components/game/GameSources.tsx and ScoreBoard.tsx.
 *
 * League-specific values are asserted on the all-2026-10-02 CORPUS snapshot (SPEC §13.6; the fixture is
 * tests/support/game-view.ts). Every assertion message names the module that produced the value.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { Game } from '@/lib/model/game';
import { L, counted } from '@/tests/support/game-view';
import { textOf } from '@/tests/support/html-text';

describe('sub-lines, kicker and context (views/game/game-view.ts)', () => {
  it('sub-line is "<record> <division heading ?? league short>"', () => {
    const cases: Array<[string, RegExp]> = [
      ['scval', /^\d+-\d+-\d+ (De Anza|El Camino)$/],
      ['bval', /^\d+-\d+-\d+ (Mt\. Hamilton|Santa Teresa)$/],
      ['pcal', /^\d+-\d+-\d+ PCAL$/],
      ['mcal', /^\d+-\d+-\d+ MCAL$/],
    ];
    for (const [league, re] of cases) {
      const model = L.m.buildGameView(counted(league).contestId)!;
      expect(model.home.sub, `views/game/game-view.ts ${league} home sub`).toMatch(re);
      expect(model.away.sub, `views/game/game-view.ts ${league} away sub`).toMatch(re);
    }
  });

  it('the kicker names the league (BVAL · Santa Teresa, MCAL, Non-league)', () => {
    const bval = L.m.buildGameView(counted('bval').contestId)!;
    expect(L.titles.gameKicker(bval), 'views/game/titles.ts BVAL kicker').toMatch(
      /^FINAL( · \S+)? · BVAL · (Mt\. Hamilton|Santa Teresa)$/,
    );
    const mcal = L.m.buildGameView(counted('mcal').contestId)!;
    expect(mcal.contextLabel, 'views/game/game-view.ts MCAL context').toBe('MCAL');
    expect(mcal.countsAs.label, 'views/game/game-view.ts MCAL counts as').toBe('League game · MCAL');
    expect(mcal.countsAs.detail, 'views/game/game-view.ts MCAL points').toBe(
      'Counts toward the MCAL standings — MCAL Field Hockey Handbook (rev. 10/19/24) §7a (3 points for a win, 1 for a tie).',
    );
    const scval = L.m.buildGameView(counted('scval').contestId)!;
    expect(scval.countsAs.label, 'views/game/game-view.ts SCVAL counts as').toMatch(/^League game · (De Anza|El Camino) Division$/);
    const nonLeague = L.d.getGames().find((g) => g.countsFor === null && g.postseason === null)!;
    const nl = L.m.buildGameView(nonLeague.contestId)!;
    expect(nl.contextLabel, 'views/game/game-view.ts non-league').toBe('Non-league');
    expect(L.titles.gameKicker(nl).endsWith(' · Non-league'), 'views/game/titles.ts non-league kicker').toBe(true);
  });

  it('the meta description names the league; the head-to-head note cites its own league', () => {
    const mcal = L.m.buildGameView(counted('mcal').contestId)!;
    expect(L.titles.gameDescription(mcal), 'views/game/titles.ts MCAL description').toContain(
      'Marin County Athletic League girls varsity field hockey, Fall 2026',
    );
    expect(mcal.series.tiebreakNote, 'views/game/game-view.ts MCAL h2h').toContain('MCAL Tie-Breaking Criteria (rev. 3/26) step 1');
    const scval = L.m.buildGameView(counted('scval').contestId)!;
    expect(scval.series.tiebreakNote, 'views/game/game-view.ts SCVAL h2h').toContain('Article VI §3');
    expect(L.titles.gameDescription(scval), 'views/game/titles.ts SCVAL description').toContain(
      'Santa Clara Valley Athletic League girls varsity field hockey, Fall 2026',
    );
  });
});

describe('si.com source line and the conflict block (components/game/GameSources.tsx, ScoreBoard.tsx)', () => {
  it('a si.com-only game: the source line, the † mark, the description', async () => {
    const g = L.d.getGames().find((x) => x.contestId.startsWith('sblive:'))!;
    const model = L.m.buildGameView(L.ids.gameIdToParam(g.contestId))!;
    const note = g.provenance.backfill!.note.replace(/[.\s]+$/, '');
    expect(model.source?.text, 'views/game/game-view.ts source line').toBe(
      `Score via High School on SI (si.com): ${note}.`,
    );
    expect(model.source?.sbliveUrl, 'views/game/game-view.ts source link').toBe(g.urls.sblive);
    const html = await L.renderPage(L.ids.gameIdToParam(g.contestId));
    const text = textOf(html);
    expect(text, 'components/game/GameSources.tsx source line').toContain(`Score via High School on SI (si.com): ${note}.`);
    expect(text, 'components/game/ScoreBoard.tsx † mark').toContain('† Score via si.com');
    expect(html, 'app/game/[id]/page.tsx').not.toContain('sblive:');
    expect(L.titles.gameDescription(model), 'views/game/titles.ts PCAL description').toContain(
      'Pacific Coast Athletic League girls varsity field hockey, Fall 2026',
    );
  });

  it('a si.com score on a score-pending MaxPreps contest also carries the line', () => {
    const g = L.d.getGames().find((x) => !x.contestId.startsWith('sblive:') && x.provenance.scores === 'sblive');
    expect(g, 'lib/queries/games.ts: the corpus has a rule-3 backfill').toBeDefined();
    const model = L.m.buildGameView(g!.contestId)!;
    expect(model.source?.text, 'views/game/game-view.ts rule 3').toMatch(/^Score via High School on SI \(si\.com\): .+\.$/);
    expect(model.source?.maxprepsUrl, 'views/game/game-view.ts rule 3 MaxPreps link').toBe(g!.urls.maxpreps);
  });

  it('a plain disagreement keeps MaxPreps’ score and shows the note with both links', async () => {
    const g = L.d.getGames().find((x) => x.provenance.scoreConflict && x.provenance.scores !== 'sblive');
    expect(g, 'lib/queries/games.ts: the corpus has a score conflict').toBeDefined();
    const model = L.m.buildGameView(g!.contestId)!;
    expect(model.source, 'views/game/game-view.ts no source line on a MaxPreps score').toBeNull();
    expect(model.conflict?.note, 'views/game/game-view.ts conflict note').toBe(g!.provenance.scoreConflict!.note);
    expect(model.conflict?.sblive, 'views/game/game-view.ts conflict si.com value').toEqual(g!.provenance.scoreConflict!.sblive);
    const text = textOf(await L.renderPage(g!.contestId));
    expect(text, 'components/game/GameSources.tsx conflict').toContain(g!.provenance.scoreConflict!.note);
    expect(text, 'components/game/ScoreBoard.tsx no † on a MaxPreps score').not.toContain('Score via si.com');
  });
});

describe('the cross-check paragraph under Elsewhere (components/game/GameSources.tsx GameElsewhere)', () => {
  /** The paragraph as every fixture-backed league and every non-league final has always printed it. */
  const FIXTURE_BACKED =
    'Scores come from MaxPreps and are cross-checked against High School on SI (si.com). When MaxPreps has no result for an official league game, or its row is clearly wrong, we publish si.com’s score and mark it; when both have a score and disagree, we publish MaxPreps’ and show the disagreement rather than choosing quietly.';

  it('is unchanged, as the whole paragraph, on a counted final of each fixture-backed league and on a non-league final', async () => {
    const nonLeague = L.d.getGames({ status: 'final' }).find((g) => g.countsFor === null && g.postseason === null)!;
    const games: Array<[string, Game]> = [
      ...['scval', 'bval', 'pcal', 'mcal'].map((league): [string, Game] => [league, counted(league)]),
      ['non-league', nonLeague],
    ];
    for (const [label, game] of games) {
      const html = await L.renderPage(L.ids.gameIdToParam(game.contestId));
      expect(html, `components/game/GameSources.tsx ${label} paragraph`).toContain(`>${FIXTURE_BACKED}</p>`);
      expect(html, `components/game/GameSources.tsx ${label}: no 1 v 1 clause`).not.toContain('1 v 1s');
    }
  });

  it('renders, with the fixture-backed wording, when a league-postseason tag names a league no longer configured', async () => {
    // The snapshot schema checks a tag's league id only for shape, so the lookup must not throw.
    const { GameElsewhere } = await import('@/components/game/GameSources');
    const nonLeague = L.d.getGames({ status: 'final' }).find((g) => g.countsFor === null && g.postseason === null)!;
    const model = L.m.buildGameView(L.ids.gameIdToParam(nonLeague.contestId))!;
    const tagged = {
      ...model,
      game: { ...model.game, postseason: { kind: 'league-postseason', leagueId: 'not-a-league', via: 'league-postseason-window' } },
    } as unknown as typeof model;
    const html = renderToStaticMarkup(createElement(GameElsewhere, { model: tagged }));
    expect(html).toContain(`>${FIXTURE_BACKED}</p>`);
  });
});
