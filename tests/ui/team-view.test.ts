/**
 * `components/teams/team-view.ts` — the derived strings the team page's tiles read.
 *
 * Built from the committed snapshot, so these assert against real places and real ties.
 */

import { describe, expect, it } from 'vitest';

import {
  buildNextCard,
  buildTeamPageView,
  earlierMeeting,
  opponentRecordLine,
  placeSub,
} from '../../components/teams/team-view';
import { getGameById, getGames, getStandingFor, getStandings } from '../../lib/data';
import { TEAMS, getTeamBySlug } from '../../lib/teams';

/** The calendar day before a 'YYYY-MM-DD' key, by UTC arithmetic (no clock, no time zone). */
function dayBefore(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

describe('placeSub', () => {
  it('completes the ordinal the tile already shows, rather than replacing it', () => {
    for (const team of TEAMS) {
      const view = buildTeamPageView(team.slug);
      expect(view, team.slug).toBeDefined();
      if (!view) continue;
      const sub = placeSub(view);
      // The tile's VALUE is the ordinal; the sub-line must read as the rest of that sentence and
      // must never open with the tie qualifier, which is what made it read "tied · of 8 in …".
      expect(sub, team.slug).toMatch(
        new RegExp(`^of ${view.divisionSize} in ${view.divisionLabel}( \\(tied\\))?$`),
      );
      expect(sub.startsWith('tied'), team.slug).toBe(false);
    }
  });

  it('marks exactly the teams the standings report as level on points', () => {
    const shared = new Set<string>();
    for (const division of ['de-anza', 'el-camino'] as const) {
      for (const row of getStandings(division)) {
        if (row.tiebreak.shared) shared.add(row.slug);
      }
    }
    // The snapshot has ties today; if a future snapshot has none the assertion below still holds.
    for (const team of TEAMS) {
      const view = buildTeamPageView(team.slug);
      if (!view) continue;
      expect(placeSub(view).endsWith('(tied)'), team.slug).toBe(shared.has(team.slug));
    }
  });
});

// Invariants over the committed snapshot, not pinned values: the snapshot changes every refresh,
// and these must hold on whichever one is checked in. `buildNextCard` takes `today` as a
// parameter, so the Today label is tested without touching the clock.
describe('buildNextCard', () => {
  it("labels the next game 'Today · ' only on its own day", () => {
    for (const team of TEAMS) {
      const view = buildTeamPageView(team.slug);
      const next = view?.next;
      if (!next || next.isDateTba) continue;
      const onDay = buildNextCard(team, next, [], next.dateKey);
      const dayAhead = buildNextCard(team, next, [], dayBefore(next.dateKey));
      expect(onDay.kind, team.slug).toBe('game');
      if (onDay.kind === 'none' || dayAhead.kind === 'none') continue;
      expect(onDay.dateLabel.startsWith('Today \u00b7 '), team.slug).toBe(true);
      expect(dayAhead.dateLabel.startsWith('Today'), team.slug).toBe(false);
    }
  });

  it('prints no place when the sources disagree on the host and no venue is named', () => {
    // The snapshot has such games today; if a later one has none the assertion still holds.
    const conflicted = getGames().filter((g) => g.provenance.hostConflict && !g.venue.name);
    for (const game of conflicted) {
      for (const slug of [game.home.slug, game.away.slug]) {
        const team = slug ? getTeamBySlug(slug) : undefined;
        if (!team) continue;
        const card = buildNextCard(team, game, [], game.dateKey);
        expect(card.kind === 'game' ? card.place : 'not a game card', game.contestId).toBeNull();
      }
    }
  });
});

describe('opponentRecordLine', () => {
  it('prints nothing for an opponent outside the 15', () => {
    expect(opponentRecordLine(undefined)).toBeNull();
  });

  it("reads 'W-L-T · [tied ]Nth in <division>', 'tied' exactly when the place is shared", () => {
    for (const team of TEAMS) {
      const line = opponentRecordLine(team);
      expect(line, team.slug).toMatch(
        /^(\d+-\d+-\d+ \u00b7 (tied )?\d+(st|nd|rd|th) in (De Anza|El Camino))$|^no league results yet$/,
      );
      const standing = getStandingFor(team.slug);
      if (line === 'no league results yet') continue;
      expect(line?.includes('tied '), team.slug).toBe(standing?.tiebreak.shared ?? false);
    }
  });
});

describe('earlierMeeting', () => {
  it('recalls only a final played before the next game', () => {
    for (const team of TEAMS) {
      const next = buildTeamPageView(team.slug)?.next;
      if (!next) continue;
      const side = next.home.slug === team.slug ? next.away : next.home;
      const opponent = side.slug ? getTeamBySlug(side.slug) : undefined;
      const earlier = earlierMeeting(team, opponent, next.dateLocal);
      if (!earlier) continue;
      const game = getGameById(earlier.contestId);
      expect(game?.status, team.slug).toBe('final');
      expect(game && game.dateLocal < next.dateLocal, team.slug).toBe(true);
    }
  });
});
