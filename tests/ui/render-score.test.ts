/**
 * The eleven game-state rows of DESIGN §5.2, over the pure helper the UI actually uses
 * (components/ui/describe-game.ts → `describeGame`, which wraps lib/format's `renderScore`).
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

import {
  describeCancelled,
  describeGame,
  gameKind,
  gameKindLabel,
  otherLeagueSuffix,
  overtimeInDoubt,
  postseasonTagOf,
  signedMargin,
} from '../../components/ui/describe-game';
import { GameChips, postseasonChipText } from '../../components/ui/StatusLabel';
import { TOC } from '../../lib/league-config/sections';
import { getGames, getLeagueSummaries } from '../../lib/data';
import { EN_DASH } from '../../lib/format';
import { LEAGUES, findDivision, findLeague } from '../../lib/leagues';
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

describe('§5.2 row 4b — an EAL 1 v 1 win (decider SO, no tally stored)', () => {
  // NS Guidelines §VII.E.4: a level varsity EAL game goes to 1 v 1s. MaxPreps stores the level goal
  // score with the W/L flags (2026-09-28 Chico 1, Davis 1: Chico W), and the site stores no tally.
  const eal = (homeResult: 'W' | 'L') =>
    final(1, 1, {
      countsFor: 'eal',
      leagueDivision: 'eal',
      decider: 'SO',
      home: { teamId: 'chico-id', slug: 'chico', name: 'Chico', score: 1, result: homeResult },
      away: { teamId: 'davis-id', slug: 'davis', name: 'Davis', score: 1, result: homeResult === 'W' ? 'L' : 'W' },
    });

  it('renders W for the flagged side, keeps the level goals and tags SO', () => {
    const d = describeGame(eal('W'));
    expect([d.home.glyph, d.away.glyph]).toEqual(['1', '1']);
    expect([d.home.chip, d.away.chip], 'components/ui/describe-game.ts chips').toEqual(['W', 'L']);
    expect([d.home.weight, d.away.weight]).toEqual(['winner', 'loser']);
    expect(d.deciderTag, 'components/ui/describe-game.ts deciderTagFor').toBe('SO');
    expect(d.shootoutText).toBeNull();
    expect(d.sentence).toBe('Chico 1, Davis 1, final; Chico won on 1 v 1s.');
    expect(describeGame(eal('W'), 'davis').perspectiveOutcome).toBe('L');
    expect(describeGame(eal('L'), 'davis').perspectiveOutcome).toBe('W');
    expect(describeGame(eal('L')).sentence).toBe('Chico 1, Davis 1, final; Davis won on 1 v 1s.');
  });

  it('says what SO means in plain words everyone reads (StatusLabel)', async () => {
    // The decider is no longer an abbreviation with a hidden expansion: the words are the visible
    // text, so a screen reader and a sighted reader get the same thing.
    const { StatusLabel } = await import('../../components/ui/StatusLabel');
    const html = renderToStaticMarkup(createElement(StatusLabel, { display: describeGame(eal('W')), showChips: false }));
    expect(html, 'components/ui/StatusLabel.tsx SO label').toBe('<span class="sx-status"><span>Final, decided on 1 v 1s</span></span>');
    const ot = renderToStaticMarkup(
      createElement(StatusLabel, { display: describeGame(final(3, 2, { decider: 'OT', isOt: true, otPeriods: 1 })), showChips: false }),
    );
    expect(ot, 'components/ui/StatusLabel.tsx OT label').toBe('<span class="sx-status"><span>Final, overtime</span></span>');
    const forfeit = renderToStaticMarkup(
      createElement(StatusLabel, {
        display: describeGame(final(1, 0, { decider: 'FORFEIT', isForfeit: true, forfeitBy: 'away' })),
        showChips: false,
      }),
    );
    expect(forfeit, 'components/ui/StatusLabel.tsx forfeit label').toBe('<span class="sx-status"><span>Final, forfeit</span></span>');
    const tally = renderToStaticMarkup(
      createElement(StatusLabel, {
        display: describeGame(final(1, 1, { decider: 'SO', shootout: { home: 4, away: 3 } })),
        showChips: false,
      }),
    );
    expect(tally, 'components/ui/StatusLabel.tsx shootout tally').toBe('<span class="sx-status"><span>Final, shootout 4-3</span></span>');
    // No abbreviation is left for a reader to decode, and nothing is hidden.
    for (const out of [html, ot, forfeit, tally]) {
      expect(out).not.toContain('sr-only');
      expect(out).not.toMatch(/>(SO|OT|F)</);
    }
  });

  it('credits a San Diego level W/L final as a win with no SO tag and no shootout claim (StatusLabel)', async () => {
    // Clairemont 0, Eastlake 0 flagged L/W (Sep 1): two San Diego Section teams. The Section's inference is
    // 'unverified' (si.com and the power rankings record Mt. Carmel–Poway, Sep 11, as 2-0 where MaxPreps has
    // 0-0 W/L), so the row keeps the level score and the W/L chips but neither tags 'SO' nor says a shootout
    // decided it; the sentence says the win is credited and what MaxPreps lists.
    const sds = final(0, 0, {
      countsFor: null,
      leagueDivision: null,
      decider: 'SO',
      home: { teamId: 'clairemont-id', slug: 'clairemont', name: 'Clairemont', score: 0, result: 'L' },
      away: { teamId: 'eastlake-id', slug: 'eastlake', name: 'Eastlake', score: 0, result: 'W' },
    });
    const d = describeGame(sds);
    expect(d.deciderTag, 'components/ui/describe-game.ts deciderTagFor').toBeNull();
    expect(d.shootoutLabel, 'components/ui/describe-game.ts shootoutLabelFor').toBeNull();
    expect([d.home.chip, d.away.chip]).toEqual(['L', 'W']);
    expect(d.sentence).toBe(`Clairemont 0, Eastlake 0, final; Eastlake credited with the win (MaxPreps lists 0${EN_DASH}0 with no tally).`);
    expect(describeGame(eal('W')).deciderTag, 'the EAL tag, unchanged').toBe('SO');
    expect(describeGame(eal('W')).shootoutLabel, 'the EAL string, unchanged').toBe('decided on 1 v 1s');
    expect(describeGame(final(3, 2, { decider: 'OT', isOt: true, otPeriods: 1 })).shootoutLabel).toBeNull();
    const { StatusLabel } = await import('../../components/ui/StatusLabel');
    const html = renderToStaticMarkup(createElement(StatusLabel, { display: d }));
    expect(html).not.toContain('shootout');
    expect(html).not.toContain('>SO<');
    expect(html).not.toContain('1 v 1');
  });

  it('names the EAL postseason by its event', () => {
    const d = describeGame(
      final(2, 1, { countsFor: null, postseason: { kind: 'league-postseason', leagueId: 'eal', via: 'contest-type-4' } }),
    );
    expect(d.postseasonTag, 'components/ui/describe-game.ts postseasonTagOf').toBe('EAL Super Regional');
    expect(d.isNonLeague).toBe(false);
  });
});

describe('§5.2 row 4c — an overtime count the league’s rules cannot produce (overtimeInDoubt)', () => {
  // NS Guidelines §VII.E.4 allows one overtime period, then 1 v 1s; MaxPreps recorded three on the
  // 2026-09-02 Pleasant Valley at Chico game (1-0). The score is shown as MaxPreps has it, with no
  // overtime tag and no "after overtime".
  const threeOt = (countsFor: Game['countsFor']) =>
    final(0, 1, {
      countsFor,
      leagueDivision: countsFor,
      decider: '2OT',
      isOt: true,
      otPeriods: 3,
      home: { teamId: 'chico-id', slug: 'chico', name: 'Chico', score: 0, result: 'L' },
      away: { teamId: 'pv-id', slug: 'pleasant-valley', name: 'Pleasant Valley', score: 1, result: 'W' },
    });

  it('drops the tag and the overtime words in a shootout league', () => {
    const g = threeOt('eal');
    expect(overtimeInDoubt(g), 'components/ui/describe-game.ts overtimeInDoubt').toBe(true);
    const d = describeGame(g);
    expect(d.deciderTag).toBeNull();
    expect(d.sentence).toBe('Chico 0, Pleasant Valley 1, final.');
    expect(d.away.chip).toBe('W');
  });

  it('is keyed on the section, as normalize keys SO: an uncounted game between two EAL teams is in doubt too', () => {
    // The section's rule covers every varsity game between its teams, not only the ones a table counts.
    expect(overtimeInDoubt(threeOt(null)), 'components/ui/describe-game.ts overtimeInDoubt').toBe(true);
    expect(describeGame(threeOt(null)).deciderTag).toBeNull();
  });

  it('changes nothing for one overtime period, a postseason game, two sections or a section with no shootout rule', () => {
    const one = { ...threeOt('eal'), decider: 'OT' as const, otPeriods: 1 };
    expect(overtimeInDoubt(one)).toBe(false);
    expect(describeGame(one).deciderTag).toBe('OT');
    // The EAL Super Regional: a postseason tag leaves MaxPreps' count alone.
    const superRegional = { ...threeOt(null), postseason: { kind: 'league-postseason' as const, leagueId: 'eal' as const, via: 'contest-type-4' as const } };
    expect(overtimeInDoubt(superRegional)).toBe(false);
    expect(describeGame(superRegional).deciderTag).toBe('2 OT');
    // Chico against a CCS team: two sections, no shared rule.
    const cross = final(0, 1, {
      countsFor: null, leagueDivision: null, decider: '2OT', isOt: true, otPeriods: 3,
      home: { teamId: 'chico-id', slug: 'chico', name: 'Chico', score: 0, result: 'L' },
      away: { teamId: 'gilroy-id', slug: 'gilroy', name: 'Gilroy', score: 1, result: 'W' },
    });
    expect(overtimeInDoubt(cross)).toBe(false);
    expect(describeGame(cross).deciderTag).toBe('2 OT');
    // Two SCVAL teams (the CCS has no shootout rule): MaxPreps' count stands.
    const scval = final(0, 1, { decider: '2OT', isOt: true, otPeriods: 3 });
    expect(overtimeInDoubt(scval)).toBe(false);
    expect(describeGame(scval).deciderTag).toBe('2 OT');
    expect(describeGame(scval).sentence).toContain('after overtime');
  });

  describe('San Diego Section (one 10-minute period, then a shootout, outside tournaments)', () => {
    // Mission Hills 1, Del Norte 2 (Sep 14, 59b0f6a5): Valley v Palomar, counted in neither table, with
    // 2 overtime periods recorded. The San Diego rule cannot give a second period.
    const twoOt = (extra: Partial<Game> = {}) =>
      final(1, 2, {
        countsFor: null, leagueDivision: null, decider: '2OT', isOt: true, otPeriods: 2,
        contestTypes: { home: 1, away: 1 },
        home: { teamId: 'mission-hills-id', slug: 'mission-hills', name: 'Mission Hills', score: 1, result: 'L' },
        away: { teamId: 'del-norte-id', slug: 'del-norte', name: 'Del Norte', score: 2, result: 'W' },
        ...extra,
      });

    it('drops the 2 OT tag on an uncounted regular-season game', () => {
      expect(overtimeInDoubt(twoOt())).toBe(true);
      const d = describeGame(twoOt());
      expect(d.deciderTag).toBeNull();
      expect(d.sentence).toBe('Mission Hills 1, Del Norte 2, final.');
    });

    it('keeps 2 OT on a Section playoff game (the playoff procedure plays two 10-minute periods)', () => {
      const playoff = twoOt({ postseason: { kind: 'section-playoffs', leagueId: null, via: 'section-postseason-window' } });
      expect(overtimeInDoubt(playoff)).toBe(false);
      expect(describeGame(playoff).deciderTag).toBe('2 OT');
      expect(describeGame(playoff).sentence).toContain('after overtime');
    });

    it('keeps 2 OT on a tournament row (the procedures do not cover invitational tournaments)', () => {
      const tourney = twoOt({ contestTypes: { home: 2, away: 2 } });
      expect(overtimeInDoubt(tourney)).toBe(false);
      expect(describeGame(tourney).deciderTag).toBe('2 OT');
    });
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
  it('renders exactly like a scheduled game: a static page cannot know the game is still on', () => {
    const live = describeGame(game({ status: 'live' }));
    const scheduled = describeGame(game({ status: 'scheduled' }));
    expect(live.kind).toBe('scheduled');
    expect(live.statusLabel).toBe(scheduled.statusLabel);
    expect(live.statusTone).toBe(scheduled.statusTone);
    expect(live.note).toBeNull();
    expect(live.showScores).toBe(false);
    expect(live.sentence).toBe(scheduled.sentence);
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
    expect(d.leagueTag, 'components/ui/describe-game.ts leagueTag').toBe('SCVAL');
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
    // A league kind always carries its league (lib/classify.ts); the chip never derives one from the kind string.
    expect(tag('scval-crossover', null).postseasonTag).toBeNull();
  });
  it('prints no postseason chip word wider than one line of the 80px lead column (StatusLabel)', () => {
    // Every tag a league's games can carry (lib/classify.ts postseasonTag): its pairings', its own
    // postseason's and the CCS chip. One line of the capsule is the 80px column less 4px of padding
    // a side, at 12px mono caps of 0.6em advance plus 0.06em tracking: nine letters. A longer word
    // broke inside itself there (MCAL / TOURNAMEN / T).
    const maxLetters = Math.floor((80 - 2 * 4) / (12 * (0.6 + 0.06)));
    expect(maxLetters).toBe(9);
    const kindsOf = (league: (typeof LEAGUES)[number]): NonNullable<Game['postseason']>['kind'][] => {
      const ps = league.postseason;
      switch (ps.kind) {
        case 'ccs-ladder': return ['ccs', ...ps.pairings.map((p) => p.tag)];
        case 'league-tournament': return ['mcal-tournament'];
        case 'unbracketed-tournament': return ['league-postseason'];
        case 'section-playoffs': return ['section-playoffs'];
        default: return [];
      }
    };
    const tags = new Set<string>();
    for (const league of LEAGUES) {
      for (const kind of kindsOf(league)) {
        const t = postseasonTagOf({ postseason: { kind, leagueId: league.id, via: 'config-pairing' } });
        if (t) tags.add(t);
      }
    }
    expect(tags).toContain('MCAL tournament');
    expect(tags).toContain('San Diego Section playoffs');
    for (const t of tags) {
      for (const word of postseasonChipText(t).split(' ')) {
        expect(word.length, `"${word}" of the ${t} chip`).toBeLessThanOrEqual(maxLetters);
      }
    }
    expect(postseasonChipText('MCAL tournament')).toBe('MCAL tourney');
    // An event's own name is never lower-cased into "tourney of Champions": it prints the event's short name.
    expect(postseasonChipText(TOC.name)).toBe(TOC.shortName);
    expect(postseasonChipText('Tournament of Champions')).toBe('TOC');
    expect(postseasonChipText('SCVAL crossover')).toBe('SCVAL crossover');
  });
  it('prints the short chip word but reads the full name to a screen reader', () => {
    const html = renderToStaticMarkup(
      createElement(GameChips, {
        display: { leagueTag: null, isNonLeague: false, postseasonTag: 'MCAL tournament' },
      }),
    );
    expect(html).toContain('<span aria-hidden="true">MCAL tourney</span>');
    expect(html).toContain('<span class="sr-only">MCAL tournament</span>');
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
    const { ScoreBoard } = await import('../../components/game/ScoreBoard');
    const { NON_MEMBER_NOTE } = await import('../../components/game-row/summary');
    const { TEAMS } = await import('../../lib/teams');
    expect(NON_MEMBER_NOTE, 'components/game-row/summary.tsx NON_MEMBER_NOTE').toBe(
      `Not one of the ${TEAMS.length} teams this site follows`,
    );
    const html = renderToStaticMarkup(createElement(ScoreBoard, { game: nonMember() }));
    expect(html, 'components/game/ScoreBoard.tsx non-member sub').toContain(NON_MEMBER_NOTE);
    expect(html).not.toMatch(/SCVAL school/);
  });

  it('each registry side of the scoreboard taps through to its team page; a non-member side stays inert', async () => {
    const { ScoreBoard } = await import('../../components/game/ScoreBoard');
    const html = renderToStaticMarkup(createElement(ScoreBoard, { game: nonMember() }));
    expect(html, 'components/game/ScoreBoard.tsx home side').toContain('href="/teams/homestead"');
    // In the tab order: the pill row above the board is gone (UI refresh, spec 5.3), so the board's
    // own team links are the keyboard route to each team.
    expect(html).toMatch(/<a class="sx-teamlink"[^>]*href="\/teams\/homestead"/);
    expect(html).not.toContain('tabindex="-1"');
    expect(html.match(/<a\b/g)?.length, 'only the registry side links').toBe(1);
    const both = renderToStaticMarkup(createElement(ScoreBoard, { game: final(2, 1) }));
    const anchors = both.match(/<a\b[^>]*>/g) ?? [];
    expect(anchors.map((a) => a.match(/href="([^"]+)"/)?.[1]).sort()).toEqual([
      '/teams/homestead',
      '/teams/saint-francis',
    ]);
    // Both sides, not just one, can be reached with the keyboard.
    for (const a of anchors) expect(a).not.toContain('tabindex');
  });

  it('the game-log rule follows display.isNonLeague: a postseason game takes no NL rule', async () => {
    const { gameLogRowClass } = await import('../../components/game-row/GameLogRow');
    expect(gameLogRowClass(final(2, 1)), 'components/game-row/GameLogRow.tsx league').not.toContain('sx-nonleague');
    expect(gameLogRowClass(nonMember())).toContain('sx-nonleague');
    // MaxPreps' own league flag is evidence, never the classification (SPEC §10.4).
    expect(gameLogRowClass(final(2, 1, { isLeague: true, countsFor: null }))).toContain('sx-nonleague');
    const postseason = final(2, 1, {
      countsFor: null,
      isLeague: false,
      postseason: { kind: 'ccs', leagueId: null, via: 'config-pairing' },
    });
    expect(gameLogRowClass(postseason), 'components/game-row/GameLogRow.tsx postseason').not.toContain('sx-nonleague');
  });

  it('the row’s sentence says the chips in words, and every link is gameHref', async () => {
    const { GameRow } = await import('../../components/game-row/GameRow');
    const sb = final(3, 1, {
      contestId: 'sblive:6541425',
      provenance: { scores: 'sblive', schedule: 'pcal-pdf', fetchedAt: '2026-10-02T15:00:00.000Z' },
    });
    const html = renderToStaticMarkup(createElement(GameRow, { game: sb }));
    expect(html, 'components/game-row/GameRow.tsx sentence').toContain('SCVAL league game.');
    expect(html, 'components/game-row/GameRow.tsx gameHref').toContain('href="/game/sblive-6541425"');
    expect(html).not.toContain('href="/game/sblive:6541425"');
    const nl = renderToStaticMarkup(createElement(GameRow, { game: nonMember() }));
    expect(nl).toContain(' Non-league.');
  });
});

describe('every league’s games in the bundled snapshot (invariants)', () => {
  const games = getGames();
  it('has counted games in every league and in the independents’ table (their games against each other, DESIGN §24.10)', () => {
    for (const league of getLeagueSummaries()) {
      const counted = games.filter((g) => g.countsFor !== null && findDivision(g.countsFor)?.leagueId === league.id).length;
      expect(counted, `lib/data.ts: ${league.id} has counted games`).toBeGreaterThan(0);
    }
    // A game MaxPreps flags between an independent and a Sunset team (Bonita at Great Oak, Aug 27) counts for neither.
    const crossover = games.filter((g) => g.isLeague && [g.home.slug, g.away.slug].includes('bonita') && [g.home.slug, g.away.slug].includes('great-oak'));
    expect(crossover.length, 'the snapshot has Bonita at Great Oak').toBeGreaterThan(0);
    for (const g of crossover) expect(g.countsFor, `lib/classify.ts: ${g.contestId}`).toBeNull();
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
    expect(offenders, 'components/ui/describe-game.ts describeGame').toEqual([]);
  });
  it('tags every counted game with its own league and every si.com score with the source mark', () => {
    for (const g of games) {
      const d = describeGame(g);
      const league = g.countsFor ? findLeague(findDivision(g.countsFor)?.leagueId ?? '') : undefined;
      expect(d.leagueTag, `components/ui/describe-game.ts leagueTag ${g.contestId}`).toBe(league?.shortName ?? null);
      expect(d.sourceMark, `components/ui/describe-game.ts sourceMark ${g.contestId}`).toBe(
        g.provenance.scores === 'sblive' ? 'si.com' : g.provenance.scores === 'cifsds-sheet' && g.status === 'final' ? 'CIF-SDS' : null,
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

describe('game kind (SPEC §10.4, the team page’s Last and Next headers)', () => {
  it('says League for a counted game, Postseason for a tagged one, Non-league otherwise', () => {
    const ccs: Game['postseason'] = { kind: 'ccs', leagueId: null, via: 'ccs-window' };
    expect(gameKindLabel({ countsFor: 'de-anza', postseason: null })).toBe('League');
    expect(gameKindLabel({ countsFor: null, postseason: ccs })).toBe('Postseason');
    expect(gameKindLabel({ countsFor: null, postseason: null })).toBe('Non-league');
  });

  it('splits every game three ways, and a counted game is league even when it is also tagged', () => {
    const ccs: Game['postseason'] = { kind: 'ccs', leagueId: null, via: 'ccs-window' };
    expect(gameKind({ countsFor: 'de-anza', postseason: null })).toBe('league');
    expect(gameKind({ countsFor: 'de-anza', postseason: ccs })).toBe('league');
    expect(gameKind({ countsFor: null, postseason: ccs })).toBe('postseason');
    expect(gameKind({ countsFor: null, postseason: null })).toBe('non-league');
  });

  it('marks a row non-league exactly when gameKind says non-league', () => {
    for (const game of getGames()) {
      expect(describeGame(game).isNonLeague).toBe(gameKind(game) === 'non-league');
    }
  });
});

describe('other-league suffix (GameRow and LatestScores)', () => {
  it('names the league of a side from outside the list’s league, and nothing otherwise', () => {
    expect(otherLeagueSuffix('davis', 'scval')).toBe(' · EAL');
    expect(otherLeagueSuffix('tamalpais', 'mcal')).toBe('');
    expect(otherLeagueSuffix('tamalpais', null)).toBe('');
    expect(otherLeagueSuffix(null, 'scval')).toBe('');
  });
});

/**
 * The ONE game row (DESIGN §33, components/game-row/GameRow.tsx): status slot, two team lines, the
 * scores flush right. These pin the shape that makes a list of mixed states line up: the status is
 * always first, the score column holds scores and nothing else, and a result is weight, not a mark.
 */
describe('the one game row (GameRow, GameList)', () => {
  const STATES: Array<{ name: string; game: Game; state: string; scores: number }> = [
    { name: 'final', game: final(1, 3), state: 'final', scores: 2 },
    { name: 'upcoming', game: game(), state: 'upcoming', scores: 0 },
    { name: 'live', game: game({ status: 'live' }), state: 'live', scores: 0 },
    { name: 'off (unreported)', game: game({ status: 'score-pending' }), state: 'off', scores: 0 },
    { name: 'off (postponed)', game: game({ status: 'postponed' }), state: 'off', scores: 0 },
  ];
  const row = async (g: Game, props: Record<string, unknown> = {}) => {
    const { GameRow } = await import('../../components/game-row/GameRow');
    return renderToStaticMarkup(createElement(GameRow, { game: g, ...props }));
  };
  /** The direct children of `.sx-game-grid`, as their class attributes, in DOM order. */
  const cells = (html: string): string[] => {
    const grid = /<div class="sx-game-grid">([\s\S]*)<\/div><\/(?:div|li)>$/.exec(html);
    expect(grid, 'the row grid').not.toBeNull();
    const out: string[] = [];
    let depth = 0;
    for (const m of grid![1].matchAll(/<(\/)?(a|span|small|abbr|img|time)\b([^>]*?)(\/)?>/g)) {
      if (m[1]) depth -= 1;
      else {
        if (depth === 0) out.push(/class="([^"]*)"/.exec(m[3])?.[1] ?? '');
        if (!m[4] && m[2] !== 'img') depth += 1;
      }
    }
    return out;
  };

  for (const s of STATES) {
    it(`${s.name}: the row link, then the status slot, then teams and only scores in the score column`, async () => {
      const html = await row(s.game);
      expect(html).toMatch(new RegExp(`^<div class="sx-game" data-state="${s.state}"`));
      const classes = cells(html);
      // The empty row link first, the status slot second: in every state.
      expect(classes[0]).toBe('sx-game-link');
      expect(classes[1]).toBe('sx-game-status');
      expect(html).toMatch(/<a class="sx-game-link" aria-label="[^"]+" href="\/game\/c-1"><\/a><span class="sx-game-status" aria-hidden="true">/);
      // Then away, home (each followed by its score when there is one), then at most one note.
      const expected = s.scores
        ? ['sx-game-team sx-pinnable', 'sx-num sx-game-score text-score', 'sx-game-team sx-pinnable', 'sx-num sx-game-score text-score']
        : ['sx-game-team sx-pinnable', 'sx-game-team sx-pinnable'];
      const rest = classes.slice(2);
      expect(rest.slice(0, expected.length)).toEqual(expected);
      expect(rest.slice(expected.length).every((c) => c === 'sx-game-note')).toBe(true);
      expect(rest.slice(expected.length).length).toBeLessThanOrEqual(1);
      // Exactly one status slot, and nothing retired.
      expect(html.match(/class="sx-game-status"/g)).toHaveLength(1);
      expect(html.match(/sx-game-score/g)?.length ?? 0).toBe(s.scores);
      for (const retired of ['sx-game-at', 'sx-game-tag', 'sx-game-sep', 'sx-game-meta']) {
        expect(html, retired).not.toContain(retired);
      }
    });
  }

  it('every final’s status reads `Final`, whatever decided it', async () => {
    const finals = [
      final(2, 1),
      final(0, 0),
      final(3, 2, { decider: 'OT', isOt: true, otPeriods: 1 }),
      final(1, 1, { decider: 'SO', shootout: { home: 4, away: 3 } }),
      final(1, 0, { decider: 'FORFEIT', isForfeit: true, forfeitBy: 'away' }),
    ];
    for (const g of finals) {
      expect(await row(g)).toMatch(/<span class="sx-game-status" aria-hidden="true"><span>Final<\/span>/);
    }
    // And over the real snapshot.
    for (const g of getGames().filter((x) => describeGame(x).kind === 'final')) {
      expect(await row(g), g.contestId).toMatch(/<span class="sx-game-status" aria-hidden="true"><span>Final<\/span>/);
    }
  });

  it('an upcoming row’s status is its start time; a live row’s is `Live`; a postponed one says so', async () => {
    expect(await row(game())).toMatch(/<span class="sx-game-status" aria-hidden="true"><span class="sx-num sx-game-time">5:30 PM<\/span>/);
    expect(await row(game({ isTimeTba: true }))).toContain('<span class="sx-num sx-game-time">TBD</span>');
    expect(await row(game({ status: 'live' }))).toContain('<span class="sx-game-status" aria-hidden="true"><span class="sx-live">Live</span>');
    const ppd = await row(game({ status: 'postponed' }));
    expect(ppd).toContain('<span class="sx-long">Postponed</span><abbr class="sx-short" title="Postponed">PPD</abbr>');
  });

  it('an unreported game renders no score cell: never a dash, never a zero', async () => {
    const html = await row(game({ status: 'score-pending' }));
    expect(html).not.toContain('sx-game-score');
    expect(html).not.toContain('text-score');
    expect(html).toContain('<span class="sx-game-status" aria-hidden="true"><span>No score</span>');
    expect(html).not.toContain(EN_DASH);
    // The link still says it in words.
    expect(html).toMatch(/aria-label="[^"]*score not reported/i);
    // Unreported is not a result: neither side is marked.
    expect(html).not.toContain('data-won');
    expect(html).not.toContain('data-lost');
  });

  it('a final marks exactly one side `data-won` and the other `data-lost`, on the name and on the score; a tie neither', async () => {
    const html = await row(final(1, 3)); // home Homestead 1, away Saint Francis 3
    const team = (side: string) => new RegExp(`<span class="sx-game-team sx-pinnable" data-side="${side}" data-team-slug="[^"]+"( data-won="")?( data-lost="")?>`).exec(html)!;
    const score = (side: string) => new RegExp(`<span data-side="${side}"( data-won="")?( data-lost="")? aria-hidden="true" class="sx-num sx-game-score text-score">`).exec(html)!;
    for (const part of [team, score]) {
      expect([Boolean(part('away')[1]), Boolean(part('away')[2])], 'away won').toEqual([true, false]);
      expect([Boolean(part('home')[1]), Boolean(part('home')[2])], 'home lost').toEqual([false, true]);
    }
    expect(html.match(/data-won=""/g)).toHaveLength(2);
    expect(html.match(/data-lost=""/g)).toHaveLength(2);
    const tie = await row(final(2, 2));
    expect(tie).not.toContain('data-won');
    expect(tie).not.toContain('data-lost');
    // A live lead is not a result, and a game still to play has none.
    for (const g of [game({ status: 'live' }), game()]) {
      const out = await row(g);
      expect(out).not.toContain('data-won');
      expect(out).not.toContain('data-lost');
    }
  });

  it('a shootout final renders a `data-decider` note naming the winner', async () => {
    // Level on goals; the home side (Homestead) won the shootout 4-3.
    const so = await row(final(1, 1, { decider: 'SO', shootout: { home: 4, away: 3 } }), { showChips: false });
    expect(so).toContain('<span class="sx-game-note" data-decider="">Homestead wins shootout 4-3</span>');
    // The goals stay level, and the weight follows the shootout.
    expect(so).toMatch(/data-side="home" data-team-slug="homestead" data-won=""/);
    // No tally stored: the section's own words.
    const eal = await row(
      final(1, 1, {
        countsFor: 'eal',
        leagueDivision: 'eal',
        decider: 'SO',
        home: { teamId: 'chico-id', slug: 'chico', name: 'Chico', score: 1, result: 'W' },
        away: { teamId: 'davis-id', slug: 'davis', name: 'Davis', score: 1, result: 'L' },
      }),
      { showChips: false },
    );
    expect(eal).toContain('<span class="sx-game-note" data-decider="">Chico wins on 1 v 1s</span>');
    // A regulation or overtime final has no decider note.
    expect(await row(final(2, 1), { showChips: false })).not.toContain('data-decider');
    expect(await row(final(3, 2, { decider: 'OT', isOt: true, otPeriods: 1 }), { showChips: false })).not.toContain('data-decider');
  });

  it('a registry side is a link to its team and carries the hidden pin note; the row link is first and empty', async () => {
    const html = await row(final(1, 3));
    expect(html).toContain('<a class="sx-game-name" href="/teams/saint-francis">Saint Francis</a>');
    expect(html).toContain('<a class="sx-game-name" href="/teams/homestead">Homestead</a>');
    expect(html.match(/<span class="sx-pin-note" hidden="">Your team<\/span>/g)).toHaveLength(2);
    // Away first, home second, always.
    expect(html.indexOf('data-side="away"')).toBeLessThan(html.indexOf('data-side="home"'));
    const seeded = await row(final(1, 3), { seeds: { away: 2, home: 7 } });
    expect(seeded).toContain('<span class="sx-seed sx-num">#2</span>');
    expect(seeded).toContain('<span class="sx-seed sx-num">#7</span>');
  });

  it('`GameList` wraps its list in `sx-gamelist`, renders rows as <li>, and keeps the order it is given', async () => {
    const { GameList } = await import('../../components/schedule/GameList');
    const a = final(2, 1, { contestId: 'c-a' });
    const b = game({ contestId: 'c-b', dateKey: '2026-09-20', dateLocal: '2026-09-20T15:00:00' });
    const c = game({ contestId: 'c-c', status: 'live' });
    const d = final(0, 0, { contestId: 'c-d', dateKey: '2026-09-01', dateLocal: '2026-09-01T15:00:00' });
    for (const order of [[a, b, c, d], [d, c, b, a], [c, a, d, b]]) {
      const html = renderToStaticMarkup(createElement(GameList, { games: order }));
      expect(html).toMatch(/^<div class="sx-gamelist"><ul class="sx-games[^"]*"><li class="sx-game"/);
      expect(html).toMatch(/<\/li><\/ul><\/div>$/);
      expect([...html.matchAll(/href="\/game\/(c-[a-d])"/g)].map((m) => m[1])).toEqual(order.map((g) => g.contestId));
      expect(html.match(/<li class="sx-game"/g)).toHaveLength(4);
      // The status slot is first in every row of a mixed list.
      expect(html.match(/<\/a><span class="sx-game-status" aria-hidden="true">/g)).toHaveLength(4);
    }
    // No pinned-first reordering, no `order` trick: the list is the caller's.
    expect(renderToStaticMarkup(createElement(GameList, { games: [a, b], solo: true }))).toMatch(/<ul class="sx-games sx-games-solo/);
  });

  it('a real 0-0 final renders two zeros in the score column', async () => {
    const html = await row(final(0, 0));
    expect([...html.matchAll(/class="sx-num sx-game-score text-score"><span>([^<]*)<\/span>/g)].map((m) => m[1])).toEqual(['0', '0']);
  });
});
