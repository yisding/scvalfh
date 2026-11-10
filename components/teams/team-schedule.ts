/**
 * A team's schedule, read for what comes next: the crossover or play-in it is seated in that MaxPreps has not
 * listed yet, its next official-only fixture and that fixture's opponent, and the predicates that split its games
 * into played ("Last") and still to come ("Next"). Shared by the team page (team-view.ts) and the home page's
 * pinned card (components/home/team-card.ts). Server-only: it reads the snapshot through lib/data.
 */

import { getLeaguePairings, getStandingContext, getTeamBySlug } from '../../lib/data';
import { leagueClockPT, listWords } from '../../lib/format';
import { getLeague } from '../../lib/leagues';
import { pairingsHref } from '../../lib/postseason/postseason-kind';
import type { DivisionId, Game, LeagueId, OfficialFixture, Team } from '../../lib/types';
import { capitalized } from '../words/capitalized';

/**
 * A game that HAPPENED by `today`: a final, or a game whose date has come and whose score has not (score-pending),
 * so a "Last" never sits on an older game after a newer one was played. Each caller keeps its own list and order.
 */
export const isPlayedBy = (today: string) => (g: Game) =>
  (g.status === 'final' || g.status === 'score-pending') && g.dateKey <= today;

/** A game that has NOT happened, today or later: a score-pending game never poses as an upcoming one. */
export const isUpcomingFrom = (today: string) => (g: Game) =>
  (g.status === 'scheduled' || g.status === 'live' || g.status === 'postponed') && g.dateKey >= today;

/**
 * A crossover or play-in a team is seated in, by the league table today, that MaxPreps has not listed as a game
 * yet (lib/data.ts getLeaguePairings: `game` null). Its date is today or later. The team must hold its seat alone
 * and have played every league game of its own; a seat other teams' games can still move (`settled` false) is
 * shown as the table has it today, and the card says the pairing can still change.
 */
export interface PendingPairing {
  leagueId: LeagueId;
  /** 'BVAL play-in' | 'SCVAL crossover' — the chip's words (lib/postseason/postseason-round-label.ts). */
  kindLabel: string;
  /** 'Play-in for BVAL’s 4th automatic CCS berth': the config label's purpose. */
  purpose: string;
  dateKey: string;
  /** '11:00 AM PT', or null when the league publishes no start time (SCVAL). */
  timeLabel: string | null;
  versus: 'vs' | 'at';
  /** The opponent when one team holds its seat today. */
  opponent: Team | undefined;
  /** Its short name; 'Prospect or Westmont' when level teams share the seat; the seat's label when nobody holds it. */
  opponentName: string;
  /** 'Mt. Hamilton #4 at Santa Teresa #1' (a host is named) | 'De Anza #4 v El Camino #4'. */
  seats: string;
  /** false while either seat can still change: level teams share one, or either division has league games left. */
  settled: boolean;
  /** `/playoffs#<league>-pairings`: the league's pairing cards on /playoffs. */
  href: string;
}

function divisionDone(division: DivisionId): boolean {
  return [...getStandingContext(division).values()].every((c) => c.remaining === null || c.remaining === 0);
}

export function pendingPairingFor(team: Team, today: string): PendingPairing | null {
  const league = getLeague(team.league);
  if (league.postseason.kind !== 'ccs-ladder') return null;
  for (const p of getLeaguePairings(league.id)) {
    if (p.game || p.date < today) continue;
    const mine = p.seats.findIndex((seat) => seat.length === 1 && seat[0].teamId === team.id);
    // The team has played every league game, so no game of its own can move it; others in its division still may.
    if (mine < 0 || getStandingContext(team.division).get(team.id)?.remaining !== 0) continue;
    const theirs = mine === 0 ? 1 : 0;
    const others = p.seats[theirs].flatMap((ref) => {
      const t = getTeamBySlug(ref.slug);
      return t ? [t] : [];
    });
    const opponent = others.length === 1 ? others[0] : undefined;
    const at = p.label.indexOf(' \u2014 ');
    const tail = at < 0 ? (p.isPlayIn ? 'play-in' : 'crossover') : p.label.slice(at + 3);
    const seats =
      p.host === null
        ? `${p.seatLabels[0]} v ${p.seatLabels[1]}`
        : `${p.seatLabels[p.host === 0 ? 1 : 0]} at ${p.seatLabels[p.host]}`;
    return {
      leagueId: league.id,
      kindLabel: `${league.shortName} ${p.isPlayIn ? 'play-in' : 'crossover'}`,
      purpose: capitalized(tail),
      dateKey: p.date,
      // The league's own clock words ('11 AM PT'), as the pairing card and the strip on /playoffs print it.
      timeLabel: p.time ? leagueClockPT(p.time) : null,
      versus: p.host !== null && p.host === theirs ? 'at' : 'vs',
      opponent,
      opponentName: opponent
        ? opponent.shortName
        : others.length > 1
          ? listWords(others.map((t) => t.shortName), 'or')
          : `the ${p.seatLabels[theirs]} team`,
      seats,
      settled: opponent !== undefined && divisionDone(team.division) && divisionDone(opponent.division),
      href: pairingsHref(league.id),
    };
  }
  return null;
}

/**
 * True when the team is in a crossover or play-in not played yet: a listed game that is not final, or a seat the team
 * holds alone in one MaxPreps has not listed. The team page's "CCS playoffs →" then goes straight to the league's
 * pairing cards on /playoffs (`#<league>-pairings`), not the top of its section.
 */
export function inOpenPairing(team: Team, today: string): boolean {
  if (getLeague(team.league).postseason.kind !== 'ccs-ladder') return false;
  return getLeaguePairings(team.league).some((p) => {
    if (p.game) {
      const mine = p.game.home.slug === team.slug || p.game.away.slug === team.slug;
      return mine && p.game.status !== 'final' && p.game.dateKey >= today;
    }
    return p.date >= today && p.seats.some((seat) => seat.length === 1 && seat[0].teamId === team.id);
  });
}

/**
 * The team's own crossover or play-in once it is final ('the SCVAL crossover', Thu Oct 29), for the empty Next
 * card: the league's 'the SCVAL crossover is Thu Oct 29 and Fri Oct 30' would describe a game this team has played.
 */
export function playedPairing(team: Team): { word: string; dateKey: string } | null {
  const league = getLeague(team.league);
  if (league.postseason.kind !== 'ccs-ladder') return null;
  for (const p of getLeaguePairings(league.id)) {
    if (p.game?.status !== 'final') continue;
    if (p.game.home.slug !== team.slug && p.game.away.slug !== team.slug) continue;
    return { word: `the ${league.shortName} ${p.isPlayIn ? 'play-in' : 'crossover'}`, dateKey: p.game.dateKey };
  }
  return null;
}

/** The next official fixture we have no contest for, at or after `today`. */
export function nextOfficialFixture(
  fixtures: readonly OfficialFixture[],
  today: string,
): OfficialFixture | null {
  const ahead = fixtures
    .filter((f) => f.dateKey >= today)
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  return ahead.length > 0 ? ahead[0] : null;
}

/**
 * 'VALLEY CHRISTIAN' → 'Valley Christian', 'LICK-WILMERDING' → 'Lick-Wilmerding', for a grid name
 * with no registry row behind it.
 */
function titleCase(name: string): string {
  return name
    .toLowerCase()
    .replace(/(^|[\s.\-/(])([a-z])/g, (_, lead: string, ch: string) => `${lead}${ch.toUpperCase()}`);
}

/**
 * 'vs' / 'at' and the opponent of an official fixture, seen from `team`'s side. The one place a
 * fixture's opponent is named (the team page, its OG card and home's pinned card): the registry
 * short name, or the schedule's own spelling title-cased for a school outside the registry.
 */
export function fixtureOpponent(
  fixture: OfficialFixture,
  team: Pick<Team, 'slug'>,
): { mineIsHome: boolean; versus: 'vs' | 'at'; opponent: Team | undefined; opponentName: string } {
  const mineIsHome = fixture.homeSlug === team.slug;
  const opponentSlug = mineIsHome ? fixture.awaySlug : fixture.homeSlug;
  const opponent = opponentSlug ? getTeamBySlug(opponentSlug) : undefined;
  return {
    mineIsHome,
    versus: mineIsHome ? 'vs' : 'at',
    opponent,
    opponentName: opponent ? opponent.shortName : titleCase(mineIsHome ? fixture.awayName : fixture.homeName),
  };
}
