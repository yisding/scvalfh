/**
 * The pieces of one pinned team's card (components/home/MyTeamCard.tsx): its last game, its next
 * game and its next official-schedule fixture, slimmed to what the card draws, because every team's
 * view is serialized for the client (budget: tests/ui/home-weight.test.ts). `buildTeamViews`
 * (views/home/home-view.ts) assembles them.
 */

import { getDivision } from '@/lib/config/leagues';
import { dateTimeAttr, shortDate, timeOfDayPT } from '@/lib/format/dates';
import type { Game } from '@/lib/model/game';
import type { Team } from '@/lib/model/team';
import { getOfficialFixtures } from '@/lib/queries/games';
import { getTeamBySlug } from '@/lib/registry/teams';
import { gameHref } from '@/lib/shared/game-id';
import { describeGame, gameKind, postseasonTagOf } from '@/views/shared/describe-game';
import type { GameDisplay, SideView } from '@/views/shared/game-display-client';
import { fixtureOpponent, nextOfficialFixture } from '@/views/shared/official-fixtures';

import type { HomeLastDisplay, HomeLastGame, HomeNextGame, HomeOfficialFixture } from './home-client';

function shortNameOf(side: Game['home']): string {
  return (side.slug ? getTeamBySlug(side.slug)?.shortName : undefined) ?? side.name;
}

/** One score line: the registry short name ("Mitty" on a 358px card), glyph, weight, chip. */
function homeSide(side: SideView): HomeLastDisplay['home'] {
  return { name: side.shortName || side.name, glyph: side.glyph, hasScore: side.hasScore, weight: side.weight, chip: side.chip };
}

/** `describeGame()`'s decision, slimmed to what the card draws (the team-views budget, tests/ui/home-weight.test.ts). */
function slimDisplay(display: GameDisplay): HomeLastDisplay {
  const marks: NonNullable<HomeLastDisplay['marks']> = {};
  if (display.strikeTime) marks.strikeTime = true;
  if (display.isNonLeague) marks.isNonLeague = true;
  if (display.deciderTag) marks.deciderTag = display.deciderTag;
  if (display.shootoutLabel) marks.shootoutLabel = display.shootoutLabel;
  if (display.shootoutText) marks.shootoutText = display.shootoutText;
  if (display.sourceMark) marks.sourceMark = display.sourceMark;
  if (display.leagueTag) marks.leagueTag = display.leagueTag;
  if (display.postseasonTag) marks.postseasonTag = display.postseasonTag;
  return {
    kind: display.kind === 'unreported' ? 'unreported' : 'final',
    statusLabel: display.statusLabel,
    statusTone: display.statusTone,
    ...(Object.keys(marks).length > 0 ? { marks } : {}),
    note: display.note,
    sentence: display.sentence,
    home: homeSide(display.home),
    away: homeSide(display.away),
  };
}

export function lastGameView(game: Game, slug: string): HomeLastGame {
  return {
    display: slimDisplay(describeGame(game, slug)),
    mineIsHome: game.home.slug === slug,
    dateLabel: shortDate(game.dateLocal),
    dateTime: dateTimeAttr(game),
    href: gameHref(game.contestId),
  };
}

export function nextGameView(game: Game, slug: string): HomeNextGame {
  const mineIsHome = game.home.slug === slug;
  const theirs = mineIsHome ? game.away : game.home;
  const links: HomeNextGame['links'] = [];
  const address = game.venue.address;
  if (address) {
    links.push({
      label: 'Directions',
      href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${address.street}, ${address.city}, ${address.region} ${address.postalCode}`,
      )}`,
    });
  }
  if (game.urls.nfhsStream) links.push({ label: 'Stream', href: game.urls.nfhsStream });
  if (game.urls.goFan) links.push({ label: 'Tickets', href: game.urls.goFan });
  return {
    dateLabel: shortDate(game.dateLocal),
    dateTime: dateTimeAttr(game),
    timeLabel: game.isTimeTba ? 'Time TBA' : timeOfDayPT(game.dateLocal),
    versus: describeGame(game, slug).versus ?? 'vs',
    opponent: shortNameOf(theirs),
    kindLabel: postseasonTagOf(game) ?? (gameKind(game) === 'league' ? 'league' : 'non-league'),
    href: gameHref(game.contestId),
    // Two external chips at most plus "Game page": three chips, one row, the same height for every
    // team (no layout shift).
    links: links.slice(0, 2),
  };
}

/** The next fixture from the team's league's official schedule, for a team MaxPreps has no contest for. */
export function officialNextView(team: Team, today: string, leagueShort: string): HomeOfficialFixture | null {
  const fixture = nextOfficialFixture(getOfficialFixtures({ slug: team.slug }), today);
  if (!fixture) return null;
  // A division with no official document has no fixtures; narrowing keeps the link honest anyway.
  const official = getDivision(fixture.division).official;
  if (official.mode === 'none') return null;
  const { versus, opponentName } = fixtureOpponent(fixture, team);
  return {
    dateLabel: shortDate(fixture.dateKey),
    dateKey: fixture.dateKey,
    versus,
    opponent: opponentName,
    leagueShort,
    scheduleUrl: official.scheduleUrl,
  };
}
