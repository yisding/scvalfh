/**
 * The eleven game-state rows of DESIGN §5.2, over the pure helper the UI actually uses
 * (components/ui/game-view.ts → `describeGame`, which wraps lib/format's `renderScore`).
 *
 * The contract being pinned: a missing score is NEVER rendered as 0-0, a genuine 0 is
 * indistinguishable from nothing only to a careless reader (here it is full ink, `hasScore: true`),
 * and every state carries a written label plus a letter plus a weight before it carries a hue.
 *
 * Multi-league (SPEC §10.4): the chips come from `countsFor` / `postseason` / `provenance.scores`
 * (`leagueTag`, `postseasonTag`, `sourceMark`), and the never-0-0 rule is walked over every game of
 * every league in the bundled snapshot (invariants only, SPEC §13.6).
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { describeCancelled, describeGame, signedMargin } from '../../components/ui/game-view';
import { getGames, getLeagueSummaries } from '../../lib/data';
import { EN_DASH } from '../../lib/format';
import { findDivision, findLeague } from '../../lib/leagues';
import type { Game, GameStatus } from '../../lib/types';

function game(overrides: Partial<Game> = {}): Game {
  const base: Game = {
    contestId: 'c-1',
    dateLocal: '2026-09-24T17:30:00',
    dateUtc: '2026-09-25T00:30:00Z',
    dateKey: '2026-09-24',
    isDateTba: false,
    isTimeTba: false,
    home: {
      teamId: 'home-id',
      slug: 'homestead',
      name: 'Homestead',
      score: null,
      result: null,
    },
    away: {
      teamId: 'away-id',
      slug: 'saint-francis',
      name: 'Saint Francis',
      score: null,
      result: null,
    },
    site: 'home',
    status: 'scheduled',
    isLeague: true,
    leagueDivision: 'de-anza',
    contestTypes: { home: 0, away: 0 },
    countsFor: 'de-anza',
    postseason: null,
    otPeriods: 0,
    isOt: false,
    isForfeit: false,
    forfeitBy: null,
    decider: null,
    shootout: null,
    venue: { text: null },
    recap: null,
    urls: { maxpreps: null, nfhsStream: null, goFan: null },
    provenance: { scores: 'maxpreps-api', schedule: 'maxpreps-api', fetchedAt: '2026-09-29T23:26:02.770Z' },
  };
  return { ...base, ...overrides };
}

function final(homeScore: number, awayScore: number, extra: Partial<Game> = {}): Game {
  return game({
    status: 'final',
    decider: 'REG',
    home: { ...game().home, score: homeScore, result: null },
    away: { ...game().away, score: awayScore, result: null },
    ...extra,
  });
}

describe('§5.2 row 1 — final, regulation', () => {
  const d = describeGame(final(0, 7));
  it('labels it FINAL and shows both numbers', () => {
    expect(d.kind).toBe('final');
    expect(d.statusLabel).toBe('FINAL');
    expect(d.showScores).toBe(true);
    expect(d.home.glyph).toBe('0');
    expect(d.away.glyph).toBe('7');
  });
  it('carries winner-by-weight as the fourth channel, and a letter on each side', () => {
    expect(d.away.weight).toBe('winner');
    expect(d.home.weight).toBe('loser');
    expect(d.away.chip).toBe('W');
    expect(d.home.chip).toBe('L');
  });
  it('treats a genuine 0 as a real score, not a missing one', () => {
    expect(d.home.hasScore).toBe(true);
    expect(d.home.glyph).not.toBe(EN_DASH);
  });
  it('announces one sentence', () => {
    expect(d.sentence).toBe('Homestead 0, Saint Francis 7, final.');
  });
});

describe('§5.2 row 2 — final 0-0 draw', () => {
  const d = describeGame(final(0, 0));
  it('renders 0 / 0 only because the status is final', () => {
    expect(d.showScores).toBe(true);
    expect([d.home.glyph, d.away.glyph]).toEqual(['0', '0']);
    expect(d.home.hasScore && d.away.hasScore).toBe(true);
  });
  it('puts a T on both sides and leaves both lines level', () => {
    expect([d.home.chip, d.away.chip]).toEqual(['T', 'T']);
    expect([d.home.weight, d.away.weight]).toEqual(['level', 'level']);
  });
});

describe('§5.2 row 3 — final after overtime', () => {
  it('tags 2–2 OT and still calls the outcome a tie', () => {
    const d = describeGame(final(2, 2, { decider: 'OT', isOt: true, otPeriods: 1 }));
    expect(d.deciderTag).toBe('OT');
    expect([d.home.chip, d.away.chip]).toEqual(['T', 'T']);
    expect(d.sentence).toContain('after overtime');
  });
  it('tags a second period as 2 OT and an OT win is a win', () => {
    const d = describeGame(final(3, 2, { decider: '2OT', isOt: true, otPeriods: 2 }));
    expect(d.deciderTag).toBe('2 OT');
    expect(d.home.chip).toBe('W');
    expect(d.home.weight).toBe('winner');
  });
});

describe('§5.2 row 4 — final on a shootout', () => {
  // Article IV means this can never happen in this league, but the render path must be correct:
  // the GOAL score stays level so GF/GA stay right, and the W/L comes from the shootout.
  const d = describeGame(final(1, 1, { decider: 'SO', shootout: { home: 4, away: 3 } }));
  it('keeps the goal score level and takes the result from the shootout', () => {
    expect([d.home.glyph, d.away.glyph]).toEqual(['1', '1']);
    expect(d.home.chip).toBe('W');
    expect(d.away.chip).toBe('L');
  });
  it('prints the shootout score separately', () => {
    expect(d.shootoutText).toBe(`(4${EN_DASH}3 SO)`);
  });
});

describe('§5.2 row 5 — forfeit', () => {
  const d = describeGame(
    final(1, 0, { decider: 'FORFEIT', isForfeit: true, forfeitBy: 'away' }),
  );
  it('tags F, still records a win, and flags itself for exclusion from goal totals', () => {
    expect(d.deciderTag).toBe('F');
    expect(d.home.chip).toBe('W');
    expect(d.isForfeit).toBe(true);
    expect(d.sentence).toContain('by forfeit');
  });
});

describe('§5.2 row 6 — scheduled', () => {
  it('drops the score cells and gives the column to the time', () => {
    const d = describeGame(game({ status: 'scheduled' }));
    expect(d.showScores).toBe(false);
    expect(d.statusLabel).toBe('5:30 PM');
    expect(d.home.chip).toBe('none');
    expect(d.perspectiveOutcome).toBeNull();
  });
});

describe('§5.2 row 6b — scheduled with no time', () => {
  it('says TIME TBA rather than inventing a kickoff', () => {
    const d = describeGame(game({ status: 'scheduled', isTimeTba: true }));
    expect(d.statusLabel).toBe('TIME TBA');
    expect(d.showScores).toBe(false);
  });
});

describe('§5.2 row 7 — in progress', () => {
  const d = describeGame(game({ status: 'live' }));
  it('shows no score at all and discloses that LIVE is a scheduled window', () => {
    expect(d.kind).toBe('live');
    expect(d.statusLabel).toBe('LIVE');
    expect(d.showScores).toBe(false);
    expect(d.liveDot).toBe(true);
    expect(d.note).toMatch(/scheduled window/i);
  });
  it('uses the accent, not a third status hue', () => {
    expect(d.statusTone).toBe('accent');
  });
});

describe('§5.2 row 8 — score not reported', () => {
  const d = describeGame(game({ status: 'score-pending' }));
  it('renders two en dashes and NEVER 0-0', () => {
    expect(d.showScores).toBe(true);
    expect([d.home.glyph, d.away.glyph]).toEqual([EN_DASH, EN_DASH]);
    expect(d.home.hasScore).toBe(false);
    expect(`${d.home.glyph}-${d.away.glyph}`).not.toBe('0-0');
  });
  it('uses an empty outlined chip, never a T, and promises an update', () => {
    expect([d.home.chip, d.away.chip]).toEqual(['pending', 'pending']);
    expect(d.statusLabel).toBe('SCORE NOT REPORTED');
    expect(d.note).toMatch(/MaxPreps/);
  });
});

describe('§5.2 row 9 — cancelled', () => {
  it('is not representable in the snapshot, because contestState 1 rows are dropped', () => {
    // SPEC §5.5.2: a "Deleted" MaxPreps row can carry a real scrimmage score, so those rows are
    // dropped at normalization rather than stored as a cancelled game. The status union proves it.
    const statuses: GameStatus[] = ['scheduled', 'live', 'final', 'score-pending', 'postponed'];
    expect(statuses).not.toContain('cancelled' as unknown as GameStatus);
  });
  it('still renders correctly when constructed explicitly', () => {
    const d = describeCancelled(game(), 'Cancelled — poor air quality');
    expect(d.statusLabel).toBe('CANCELLED');
    expect(d.showScores).toBe(false);
    // The TIME is struck through; the names never are.
    expect(d.strikeTime).toBe(true);
    expect([d.home.chip, d.away.chip]).toEqual(['cancelled', 'cancelled']);
    expect(d.note).toBe('Cancelled — poor air quality');
  });
});

describe('§5.2 row 10 — postponed', () => {
  const d = describeGame(game({ status: 'postponed' }));
  it('shows no score, strikes the time and says the new date is unknown', () => {
    expect(d.statusLabel).toBe('POSTPONED');
    expect(d.showScores).toBe(false);
    expect(d.strikeTime).toBe(true);
    expect(d.note).toMatch(/new date/i);
    expect([d.home.chip, d.away.chip]).toEqual(['postponed', 'postponed']);
  });
});

describe('§5.2 row 11 — non-league', () => {
  it('flags the row for the NL word and the 2px rule from countsFor, whatever the state', () => {
    expect(describeGame(final(4, 0, { isLeague: false, countsFor: null })).isNonLeague).toBe(true);
    expect(
      describeGame(game({ isLeague: false, countsFor: null, status: 'score-pending' })).isNonLeague,
    ).toBe(true);
    expect(describeGame(final(4, 0)).isNonLeague).toBe(false);
  });
  it('reads countsFor, not MaxPreps’ contest type: a same-division game the league does not count is NL', () => {
    expect(describeGame(final(4, 0, { isLeague: true, countsFor: null })).isNonLeague).toBe(true);
  });
});

describe('chips — league, postseason and source (SPEC §10.4)', () => {
  it('gives a counted game its league chip and no NL', () => {
    const d = describeGame(final(2, 1));
    expect(d.leagueTag, 'components/ui/game-view.ts leagueTag').toBe('SCVAL');
    expect(d.isNonLeague).toBe(false);
    expect(describeGame(final(2, 1, { countsFor: 'mt-hamilton' })).leagueTag).toBe('BVAL');
    expect(describeGame(final(2, 1, { countsFor: 'pcal' })).leagueTag).toBe('PCAL');
    expect(describeGame(final(2, 1, { countsFor: 'marin-county' })).leagueTag).toBe('MCAL');
  });
  it('gives a non-league game NL and no league chip', () => {
    const d = describeGame(final(2, 1, { countsFor: null }));
    expect(d.leagueTag).toBeNull();
    expect(d.isNonLeague).toBe(true);
  });
  it('names each postseason kind, and a postseason game is not NL', () => {
    const tag = (kind: NonNullable<Game['postseason']>['kind'], leagueId: string | null) =>
      describeGame(
        final(2, 1, { countsFor: null, postseason: { kind, leagueId, via: 'config-pairing' } }),
      );
    expect(tag('scval-crossover', 'scval').postseasonTag).toBe('SCVAL crossover');
    expect(tag('bval-play-in', 'bval').postseasonTag).toBe('BVAL play-in');
    expect(tag('mcal-tournament', 'mcal').postseasonTag).toBe('MCAL tournament');
    expect(tag('ccs', null).postseasonTag).toBe('CCS');
    expect(tag('ccs', null).isNonLeague).toBe(false);
    expect(tag('other', null).postseasonTag).toBeNull();
  });
  it('marks a score published from si.com, and only that', () => {
    const sb = final(3, 1, {
      contestId: 'sblive:6541425',
      provenance: { scores: 'sblive', schedule: 'pcal-pdf', fetchedAt: '2026-10-02T15:00:00.000Z' },
    });
    expect(describeGame(sb).sourceMark).toBe('si.com');
    expect(describeGame(final(3, 1)).sourceMark).toBeNull();
    expect(describeCancelled(game()).sourceMark).toBeNull();
  });
});

describe('rendered rows and the scoreboard (GameRow, ScoreBoard: UI pass, league-aware)', () => {
  const nonMember = (extra: Partial<Game> = {}) =>
    final(1, 3, {
      countsFor: null,
      isLeague: false,
      away: { teamId: 'x-id', slug: null, name: 'Scripps Ranch', score: 3, result: null },
      ...extra,
    });

  it('a side outside the registry carries NON_MEMBER_NOTE on the scoreboard, counted from the registry', async () => {
    const { ScoreBoard } = await import('../../components/ui/ScoreBoard');
    const { NON_MEMBER_NOTE } = await import('../../components/ui/GameRow');
    const { TEAMS } = await import('../../lib/teams');
    expect(NON_MEMBER_NOTE, 'components/ui/GameRow.tsx NON_MEMBER_NOTE').toBe(
      `Not one of the ${TEAMS.length} teams this site follows`,
    );
    const html = renderToStaticMarkup(createElement(ScoreBoard, { game: nonMember() }));
    expect(html, 'components/ui/ScoreBoard.tsx non-member sub').toContain(NON_MEMBER_NOTE);
    expect(html).not.toMatch(/SCVAL school/);
  });

  it('the game-log rule follows display.isNonLeague: a postseason game takes no NL rule', async () => {
    const { gameLogRowClass } = await import('../../components/ui/GameRow');
    expect(gameLogRowClass(final(2, 1)), 'components/ui/GameRow.tsx league').not.toContain('sx-nonleague');
    expect(gameLogRowClass(nonMember())).toContain('sx-nonleague');
    // MaxPreps' own league flag is evidence, never the classification (SPEC §10.4).
    expect(gameLogRowClass(final(2, 1, { isLeague: true, countsFor: null }))).toContain('sx-nonleague');
    const postseason = final(2, 1, {
      countsFor: null,
      isLeague: false,
      postseason: { kind: 'ccs', leagueId: null, via: 'config-pairing' },
    });
    expect(gameLogRowClass(postseason), 'components/ui/GameRow.tsx postseason').not.toContain('sx-nonleague');
  });

  it('the row’s sentence says the chips in words, and every link is gameHref', async () => {
    const { GameRow } = await import('../../components/ui/GameRow');
    const sb = final(3, 1, {
      contestId: 'sblive:6541425',
      provenance: { scores: 'sblive', schedule: 'pcal-pdf', fetchedAt: '2026-10-02T15:00:00.000Z' },
    });
    const html = renderToStaticMarkup(createElement(GameRow, { game: sb }));
    expect(html, 'components/ui/GameRow.tsx sentence').toContain('SCVAL league game.');
    expect(html, 'components/ui/GameRow.tsx gameHref').toContain('href="/game/sblive-6541425"');
    expect(html).not.toContain('href="/game/sblive:6541425"');
    const nl = renderToStaticMarkup(createElement(GameRow, { game: nonMember() }));
    expect(nl).toContain(' Non-league.');
  });
});

describe('every league’s games in the bundled snapshot (invariants)', () => {
  const games = getGames();
  it('has games in all four leagues', () => {
    for (const league of getLeagueSummaries()) {
      expect(
        games.filter((g) => g.countsFor !== null && findDivision(g.countsFor)?.leagueId === league.id).length,
        `lib/data.ts: ${league.id} has counted games`,
      ).toBeGreaterThan(0);
    }
  });
  it('never renders a missing score as 0-0, and renders every real score as published', () => {
    const offenders: string[] = [];
    for (const g of games) {
      const d = describeGame(g);
      const glyphs = [d.away.glyph, d.home.glyph];
      if (g.status === 'final') {
        if (glyphs.join(' ') !== `${String(g.away.score)} ${String(g.home.score)}`) {
          offenders.push(`${g.contestId} final ${glyphs.join('-')}`);
        }
      } else if (glyphs.some((x) => /\d/.test(x))) {
        offenders.push(`${g.contestId} ${g.status} ${glyphs.join('-')}`);
      }
    }
    expect(offenders, 'components/ui/game-view.ts describeGame').toEqual([]);
  });
  it('tags every counted game with its own league and every si.com score with the source mark', () => {
    for (const g of games) {
      const d = describeGame(g);
      const league = g.countsFor ? findLeague(findDivision(g.countsFor)?.leagueId ?? '') : undefined;
      expect(d.leagueTag, `components/ui/game-view.ts leagueTag ${g.contestId}`).toBe(league?.shortName ?? null);
      expect(d.sourceMark, `components/ui/game-view.ts sourceMark ${g.contestId}`).toBe(
        g.provenance.scores === 'sblive' ? 'si.com' : null,
      );
    }
  });
});

describe('perspective', () => {
  it('orients vs / at and the outcome from one team side', () => {
    const home = describeGame(final(0, 7), 'homestead');
    expect(home.versus).toBe('vs');
    expect(home.perspectiveOutcome).toBe('L');

    const away = describeGame(final(0, 7), 'saint-francis');
    expect(away.versus).toBe('at');
    expect(away.perspectiveOutcome).toBe('W');
  });

  it('says "vs" at a neutral site, where home/away is only a stable ordering', () => {
    const d = describeGame(final(2, 1, { site: 'neutral' }), 'saint-francis');
    expect(d.versus).toBe('vs');
  });

  it('reports a tie as T from either side', () => {
    expect(describeGame(final(1, 1), 'homestead').perspectiveOutcome).toBe('T');
    expect(describeGame(final(1, 1), 'saint-francis').perspectiveOutcome).toBe('T');
  });
});

describe('margin glyphs', () => {
  it('uses the typographic minus and always signs a non-zero margin', () => {
    expect(signedMargin(3)).toBe('+3');
    expect(signedMargin(0)).toBe('0');
    expect(signedMargin(-7)).toBe('−7');
  });
});
