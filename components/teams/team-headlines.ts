import { getTeamBySlug } from '../../lib/data';
import { gameWhen, shortDate } from '../../lib/format';
import { getLeague } from '../../lib/leagues';
import type { Game, OfficialFixture, Team } from '../../lib/types';
import { describeGame } from '../ui/describe-game';

import { fixtureOpponent } from './team-schedule';

/*
 * The one-line game headlines the per-team OG card prints (app/teams/[slug]/opengraph-image.tsx).
 */

/**
 * One line describing a game from this team's side: `L 0–7 vs Saint Francis`, or
 * `at Los Altos · Tue Sep 29, 4:00 PM PT` when it has not been played.
 *
 * Every glyph comes from describeGame, so the never-0-0 rule holds here too: an unreported game
 * prints its written status and two en dashes, never a zero (DESIGN §5.2, §5.3).
 */
export function gameHeadline(game: Game, team: Team): string {
  const display = describeGame(game, team.slug);
  const mineIsHome = game.home.slug === team.slug;
  const mine = mineIsHome ? display.home : display.away;
  const theirs = mineIsHome ? display.away : display.home;
  const opponentTeam = theirs.slug ? getTeamBySlug(theirs.slug) : undefined;
  const opponent = opponentTeam ? opponentTeam.shortName : theirs.name;
  const where = `${display.versus ?? 'vs'} ${opponent}`;
  if (display.kind === 'final') {
    const letter = display.perspectiveOutcome ?? 'T';
    const tag = display.deciderTag ? ` ${display.deciderTag}` : '';
    return `${letter} ${mine.glyph}–${theirs.glyph} ${where}${tag}`;
  }
  if (display.kind === 'scheduled') {
    return `${where} · ${gameWhen(game)}`;
  }
  return `${display.statusLabel} · ${where}`;
}

/**
 * The same one-line shape as `gameHeadline`, for a fixture that exists only in the league's
 * official schedule. It is labelled as such — `(BVAL schedule)` — because there is no contest, no
 * start time and no game page, so it must never read like a scheduled game we have details for.
 */
export function officialFixtureHeadline(fixture: OfficialFixture, team: Team): string {
  const { versus, opponentName } = fixtureOpponent(fixture, team);
  const short = getLeague(fixture.league).shortName;
  return `${versus} ${opponentName} · ${shortDate(fixture.dateKey)} (${short} schedule)`;
}
