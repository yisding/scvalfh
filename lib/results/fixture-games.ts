/**
 * A league's own schedule is a source for a game: a fixture it publishes that no other source lists is still on
 * the site's schedule (owner decision, 2026-11-14: "if you have an official league source for a game, but it's not
 * on MaxPreps, still put it on the schedule"), as a San Diego playoff game only the Section's bracket sheet has is
 * (lib/postseason/sds-sheet-results.ts, `cifsds:` games), and as lib/jv/jv-official.ts lists a JV game from the
 * league's schedule.
 *
 * `fixtureGames` turns each unmatched official fixture (`snapshot.officialFixtures`) whose two schools are registry
 * teams of its division into a game: the schedule's date, start and host, contest id `official:<date>-<away>-at-
 * <home>`, a league game counted for the fixture's division (it IS the league's fixture, and carries its official
 * stamp, with the JV slot the schedule gives), `provenance.schedule` the league document. Before its day it is
 * 'scheduled'; once its day has passed it is 'score-pending': the league scheduled it and no source has a score,
 * which is never shown as 0-0. It has no score, so no table or record moves, and it goes the day a source lists
 * the game, which then matches the fixture. A fixture with a school outside the registry stays a fixture.
 *
 * Applied where the site reads the snapshot (lib/data.ts), not stored: the stored file keeps the fixture in
 * `officialFixtures`, which the pipeline's matcher and the si.com fill (D2 rule 2) read. Pure: no I/O, no clock.
 */

import { byDateThenId, datesAtLocal } from '../format';
import { officialContestId } from '../game-id';
import { getTeamBySlug } from '../teams';
import type { Game, GameSide, OfficialFixture, Team } from '../types';

const sideOf = (team: Team): GameSide => ({ teamId: team.id, slug: team.slug, name: team.name, score: null, result: null });

/** The game an unmatched fixture lists, or null when a school is outside the registry or the division. */
export function fixtureGame(fixture: OfficialFixture, today: string, fetchedAt: string): Game | null {
  const home = fixture.homeSlug ? getTeamBySlug(fixture.homeSlug) : undefined;
  const away = fixture.awaySlug ? getTeamBySlug(fixture.awaySlug) : undefined;
  if (!home || !away || home.division !== fixture.division || away.division !== fixture.division) return null;
  return {
    contestId: officialContestId(fixture.dateKey, away.slug, home.slug),
    ...datesAtLocal(fixture.dateKey, fixture.time),
    isDateTba: false,
    home: sideOf(home),
    away: sideOf(away),
    site: 'home',
    status: fixture.dateKey < today ? 'score-pending' : 'scheduled',
    isLeague: true,
    leagueDivision: fixture.division,
    contestTypes: { home: null, away: null },
    countsFor: fixture.division,
    postseason: null,
    otPeriods: 0,
    isOt: false,
    isForfeit: false,
    forfeitBy: null,
    decider: null,
    shootout: null,
    official: {
      scheduledDate: fixture.dateKey,
      division: fixture.division,
      source: fixture.source,
      fixtureId: fixture.id,
      pass: 'same-date',
      ...(fixture.jv ? { jv: fixture.jv } : {}),
    },
    venue: { text: null },
    urls: { maxpreps: null, nfhsStream: null, goFan: null },
    provenance: { scores: fixture.source, schedule: fixture.source, fetchedAt },
  };
}

/**
 * `games` with a game for every unmatched fixture that can be one (in `byDateThenId` order), and the fixtures that
 * cannot (`rest`). A fixture whose id a game already carries, or whose contest id is already taken, adds nothing.
 */
export function withFixtureGames(
  games: readonly Game[],
  unmatched: readonly OfficialFixture[],
  today: string,
  fetchedAt: string,
): { games: Game[]; listed: Game[]; rest: OfficialFixture[] } {
  const stamped = new Set(games.map((g) => g.official?.fixtureId).filter((id): id is string => id !== undefined));
  const ids = new Set(games.map((g) => g.contestId));
  const listed: Game[] = [];
  const rest: OfficialFixture[] = [];
  for (const f of unmatched) {
    if (stamped.has(f.id)) continue;
    const g = fixtureGame(f, today, fetchedAt);
    if (!g || ids.has(g.contestId)) {
      rest.push(f);
      continue;
    }
    ids.add(g.contestId);
    listed.push(g);
  }
  return { games: listed.length > 0 ? [...games, ...listed].sort(byDateThenId) : [...games], listed, rest };
}
