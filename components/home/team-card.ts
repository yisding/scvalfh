/**
 * The home page's pinned-team cards (MyTeamCard, DESIGN §7.12): one compact, pre-serialized view per team, since
 * the pin lives in the reader's browser. Each view is a handful of strings, never a `Game` (the budget in
 * tests/ui/home-weight.test.ts). Built on the server by home-view.ts buildHomeView; reads the snapshot only
 * through lib/data, and "today" is getToday().
 */

import {
  getGames,
  getLeaguePairings,
  getLeagueTournament,
  getOfficialFixtures,
  getSeasonPhase,
  getStandingContext,
  getStandingFor,
  getTeams,
  getToday,
} from '../../lib/data';
import { EM_DASH, dateTimeAttr, mapsSearchHref, ordinal, recordString, shortDate, timeOfDayPT } from '../../lib/format';
import { gameHref } from '../../lib/game-id';
import { divisionHeading, getDivision, getLeague } from '../../lib/leagues';
import { ccsOutcomeFor } from '../../lib/postseason/postseason-outcomes';
import { outcomesFor, playoffOutcomeLabel, statusBadge } from '../../lib/standings/ladder';
import { gameAddress } from '../../lib/schools/venue';
import type { DivisionId, Game, SeasonPhase, Team } from '../../lib/types';
import { getTeamPostseasonLine } from '../playoffs/team-postseason-line';
import { fixtureOpponent, isPlayedBy, isUpcomingFrom, nextOfficialFixture, pendingPairingFor } from '../teams/team-schedule';
import { describeGame, gameKind, postseasonTagOf, type GameDisplay, type SideView } from '../ui/describe-game';
import { shortNameOf } from '../words/team-short-name';

import { byKickoff } from './by-kickoff';
import type {
  HomeLastDisplay,
  HomeLastGame,
  HomeNextGame,
  HomeOfficialFixture,
  HomePairingNext,
  HomeTeamView,
} from './home-types';
import { POSTSEASON_LEAD, rungCardText } from './home-types';

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

function lastGameView(game: Game, slug: string): HomeLastGame {
  return {
    display: slimDisplay(describeGame(game, slug)),
    mineIsHome: game.home.slug === slug,
    dateLabel: shortDate(game.dateLocal),
    dateTime: dateTimeAttr(game),
    href: gameHref(game.contestId),
  };
}

function nextGameView(game: Game, slug: string): HomeNextGame {
  const mineIsHome = game.home.slug === slug;
  const theirs = mineIsHome ? game.away : game.home;
  const links: HomeNextGame['links'] = [];
  // lib/schools/venue.ts: the game's own address, else the venue's or host's school (data/schools.json).
  const address = gameAddress(game)?.address;
  if (address) links.push({ label: 'Directions', href: mapsSearchHref(address) });
  if (game.urls.nfhsStream) links.push({ label: 'Stream', href: game.urls.nfhsStream });
  if (game.urls.goFan) links.push({ label: 'Tickets', href: game.urls.goFan });
  return {
    dateLabel: shortDate(game.dateLocal),
    dateTime: dateTimeAttr(game),
    timeLabel: game.isTimeTba ? 'Time TBA' : timeOfDayPT(game.dateLocal),
    versus: describeGame(game, slug).versus ?? 'vs',
    opponent: shortNameOf(theirs.slug, theirs.name),
    kindLabel: postseasonTagOf(game) ?? (gameKind(game) === 'league' ? 'league' : 'non-league'),
    href: gameHref(game.contestId),
    // Two external chips at most plus "Game page": three chips, one row, the same height for every
    // team (no layout shift).
    links: links.slice(0, 2),
  };
}

/** The next fixture from the team's league's official schedule, for a team MaxPreps has no contest for. */
function officialNextView(team: Team, today: string, leagueShort: string): HomeOfficialFixture | null {
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

const LATER_PHASES: ReadonlySet<SeasonPhase> = new Set<SeasonPhase>(['preseason', 'regular']);

/**
 * Every team (49), pre-serialized (DESIGN §7.12). The pin lives in the reader's browser, so the
 * server cannot know which one is wanted; shipping every compact view is the cost of the feature.
 */
export function buildTeamViews(): HomeTeamView[] {
  const today = getToday();
  const contexts = new Map<DivisionId, ReturnType<typeof getStandingContext>>();
  const pairingsByLeague = new Map<string, ReturnType<typeof getLeaguePairings>>();
  return getTeams().map((team) => {
    const league = getLeague(team.league);
    const heading = divisionHeading(team.division);
    if (!contexts.has(team.division)) contexts.set(team.division, getStandingContext(team.division));
    const context = contexts.get(team.division)?.get(team.id);
    const standing = getStandingFor(team.slug);
    const games = getGames({ teamId: team.id }).sort(byKickoff);
    // The last PLAYED game: a final, or a game whose date has come and whose score has not
    // (score-pending), so a card never sits on an older "Last" after a newer game was played.
    const playedGames = games.filter(isPlayedBy(today));
    const last = playedGames.at(-1) ?? null;
    const next = games.find(isUpcomingFrom(today)) ?? null;
    const hasResults = standing?.hasReportedResults ?? false;
    const place = standing
      ? standing.tiebreak.shared
        ? `tied ${ordinal(standing.computed.place)}`
        : ordinal(standing.computed.place)
      : null;
    const line = getTeamPostseasonLine(team.slug);
    const projected = LATER_PHASES.has(getSeasonPhase(league.id));
    const lead = projected ? POSTSEASON_LEAD.projected : POSTSEASON_LEAD.final;
    // A league tournament under way: the line is the team's outcome ('In the MCAL final', 'Lost in the
    // semifinal'), its own sentence, not a 'Final place:' ladder rung (DESIGN §24.13). The same for a CCS ladder
    // team whose play-in is final ('Won the play-in', 'Lost the play-in'; lib/postseason/postseason-outcomes.ts, plan
    // final-10, 2026-10-30); a crossover result changes no label, so its team keeps the 'Final place:' rung.
    let pairings = pairingsByLeague.get(league.id);
    if (league.postseason.kind === 'ccs-ladder' && !pairings) {
      pairings = getLeaguePairings(league.id);
      pairingsByLeague.set(league.id, pairings);
    }
    // A Sunset or LA independent team's line is whether it is in the Tournament of Champions, not a place: no
    // 'Final place:' lead and no short rung form (components/playoffs/team-postseason-line.ts getTeamPostseasonLine).
    const outcomeLine =
      league.postseason.kind === 'no-postseason' ||
      (league.postseason.kind === 'league-tournament' && getLeagueTournament(league.id).status !== 'projected') ||
      (pairings !== undefined && (ccsOutcomeFor(team.slug, { pairings })?.label ?? null) !== null);
    // The card's one visible line must show the STATUS at 320px (288px of text): a short lead, and
    // for a place shared across two rungs the rungs' badges ('Play-in or No AQ (tied)')
    // instead of the full label with its tiebreak citation, which the team page carries.
    const outcomes = standing ? outcomesFor(standing) : [];
    const tieBadges =
      line && outcomes.length > 1 ? `${outcomes.map((o) => statusBadge(team.division, o)).join(' or ')} (tied)` : null;
    // A one-rung label too long for that line ("<who>: <what>", the San Diego Section's champion rung)
    // gets its short form too (home-types.ts rungCardText); every other label is shown whole.
    const oneRung =
      line && outcomes.length === 1
        ? rungCardText(playoffOutcomeLabel(team.division, outcomes), statusBadge(team.division, outcomes[0]))
        : null;
    const shortLabel = tieBadges ?? (oneRung !== null && oneRung !== line?.label ? oneRung : null);
    const officialFixture = next ? null : officialNextView(team, today, league.shortName);
    // The play-in or crossover the team is seated in that MaxPreps has not listed yet: the card never says "no game
    // left" the day before it, and it comes before a later game or fixture (the team page's `pairing` Next card).
    const pendingAny = pendingPairingFor(team, today);
    const pending =
      pendingAny &&
      (next === null || next.isDateTba || pendingAny.dateKey < next.dateKey) &&
      (officialFixture === null || pendingAny.dateKey <= officialFixture.dateKey)
        ? pendingAny
        : null;
    const officialNext = pending ? null : officialFixture;
    const pairingNext: HomePairingNext | null = pending
      ? {
          dateKey: pending.dateKey,
          when: [shortDate(pending.dateKey), pending.timeLabel].filter(Boolean).join(' · '),
          // The link says what it is and where it leads, the pairing card: 'BVAL play-in at Westmont'.
          title: `${pending.kindLabel} ${pending.versus} ${pending.opponentName}`,
          note: `From the ${league.shortName} tables today; MaxPreps has not listed this game yet.`,
          href: pending.href,
        }
      : null;
    return {
      // The identity the card draws is the search index's entry for this slug (HomeCardTeam).
      slug: team.slug,
      meta: [hasResults && place ? place : 'No results yet', heading, league.shortName]
        .filter((part): part is string => !!part)
        .join(' · '),
      // 'x of y played' while games are left; a league with no fixed schedule (the Sunset) has no "of y",
      // so its card says 'x played' once the team has played (DESIGN-socal §2.1.7).
      played:
        context === undefined
          ? null
          : context.scheduled === null || context.remaining === null
            ? context.counted > 0
              ? `${context.counted} played`
              : null
            : context.remaining > 0
              ? `${context.counted} of ${context.scheduled} played`
              : null,
      postseason: line ? (outcomeLine ? line.label : `${lead.full} ${line.label}`) : null,
      ...(shortLabel && !outcomeLine ? { postseasonShort: `${lead.short} ${shortLabel}` } : {}),
      tableHref: `/standings/${league.id}#${team.division}`,
      hasResults,
      leagueRecord: hasResults && standing ? recordString(standing.computed) : EM_DASH,
      overallRecord: standing && standing.overall.gp > 0 ? recordString(standing.overall) : EM_DASH,
      form: hasResults && standing ? [...standing.computed.last5] : [],
      last: last ? lastGameView(last, team.slug) : null,
      next: next && !pending ? nextGameView(next, team.slug) : null,
      officialNext,
      ...(pairingNext ? { pairingNext } : {}),
    };
  });
}
