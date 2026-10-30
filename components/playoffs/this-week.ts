/**
 * "This week in the postseason" on /playoffs (one strip per region, `#this-week-norcal` and `#this-week-socal`):
 * every postseason game and dated postseason event from two days ago to a week ahead, by day, so a parent on a
 * phone reads who plays whom, when, and what the results were without opening each league's block. Pure: the
 * page reads the snapshot and config and hands down the games, the round labels and the events; nothing here
 * imports lib/data, and "today" is the caller's (`getToday()`, the snapshot's day in Pacific, never Date.now()).
 *
 * Game rows: games carrying a postseason tag other than 'other' (an 'other' tag names no event the site knows,
 * describe-game.ts prints no chip for it, so neither does this) with at least one registry side in a league of
 * the region. A final (or a played game with no score yet) reads as the site-wide `scoreSentence`; a game to
 * come as `<away> at <home>` ('vs' at a neutral site, `matchupJoiner`), short names. The label is the page's
 * round word for that contest ('MCAL final', 'SCVAL crossover · #1 v #1', 'CCS quarterfinal') or, failing one,
 * the tag's own words (`postseasonTagOf`: 'San Diego Section playoffs', 'Tournament of Champions').
 *
 * Event rows: dated things with no game yet (the BVAL play-in until MaxPreps lists it, the EAL's Super Regional
 * day, the CCS and San Diego seeding meetings, a round the San Diego Section or MCAL has not filled). An event is
 * dropped once a game row of its league exists on its day, so the BVAL play-in reads as the game the day
 * MaxPreps lists it. An event's text is its detail (or its title, when it has none) and its label its title.
 *
 * Order: by day, then time (a time to be announced last), then contest id. The strip holds `cap` rows (12): past
 * the cap the OLDEST results go first (a parent wants what is next), then the latest future rows, and the
 * strip ends with "+N more on the schedule". An empty window renders nothing at all (DESIGN §8: no empty-state
 * box and no skeleton; the key dates list covers a quiet week). Added 2026-10-29 (plan final-03).
 */

import { matchupJoiner, renderScore, scoreSentence, shiftDateKey, shortDate, timeOfDayPT } from '../../lib/format';
import { gameHref } from '../../lib/game-id';
import { regionOf } from '../../lib/leagues';
import { getTeamBySlug } from '../../lib/teams';
import type { ContestId, Game, LeagueId, RegionId, Team } from '../../lib/types';

import { postseasonTagOf } from '../ui/describe-game';

export interface ThisWeekRow {
  dateKey: string;
  /** '4:00 PM PT', or null (a game whose time is to be announced; an event with no published time). */
  time: string | null;
  /** The score sentence, the matchup, or an event's detail. */
  text: string;
  /** The badge: the round word or the tag's words; '' for an event with no detail (its title is the text). */
  label: string;
  /** The game page, or the event's anchor on /playoffs. */
  href: string | null;
  /** A game with a final score. */
  final: boolean;
  /** A game row or an event row (an event with no time prints no "Time TBA"). */
  kind: 'game' | 'event';
  /** Sort key inside a day: the contest id, or the event's title. */
  key: string;
}

export interface ThisWeekDay {
  dateKey: string;
  /** 'Today · Thu Oct 29' | 'Tomorrow · Fri Oct 30' | 'Sat Oct 31' */
  dateLabel: string;
  rows: ThisWeekRow[];
}

export interface ThisWeekEvent {
  dateKey: string;
  /** '1:00 PM PT', or null when no time is published. */
  time: string | null;
  /** 'BVAL play-in', 'CCS seeding meeting', 'San Diego Section playoffs'. */
  title: string;
  /** 'Prospect or Westmont (Santa Teresa #1, host) …', 'Quarterfinals, Division II', or null. */
  detail: string | null;
  href: string;
  /** The league whose game replaces the event on its day; null for an event no single league owns. */
  leagueId: LeagueId | null;
}

export interface ThisWeekInput {
  games: readonly Game[];
  today: string;
  region: RegionId;
  /** Round words the page computes, by contest ('MCAL final', 'SCVAL crossover · #2 v #2'). */
  labels: ReadonlyMap<ContestId, string>;
  events: readonly ThisWeekEvent[];
  /** Rows per region; default 12. */
  cap?: number;
}

export interface ThisWeekView {
  /** The window's first and last day (YYYY-MM-DD), for the header's meta. */
  from: string;
  to: string;
  days: ThisWeekDay[];
  /** Rows beyond the cap ("+N more on the schedule"). */
  more: number;
}

export const THIS_WEEK_CAP = 12;
/** The window: two days back (the results a parent missed), a week ahead. */
const DAYS_BACK = 2;
const DAYS_AHEAD = 7;

function registryTeam(side: Game['home']): Team | undefined {
  return side.slug ? getTeamBySlug(side.slug) : undefined;
}

function inRegion(game: Game, region: RegionId): boolean {
  return [game.home, game.away].some((side) => {
    const team = registryTeam(side);
    return team !== undefined && regionOf(team.league) === region;
  });
}

function shortNameOf(side: Game['home']): string {
  return registryTeam(side)?.shortName ?? side.name;
}

function gameRow(game: Game, labels: ReadonlyMap<ContestId, string>): ThisWeekRow {
  const view = renderScore(game);
  const text =
    view.kind === 'scheduled'
      ? `${shortNameOf(game.away)} ${matchupJoiner(game)} ${shortNameOf(game.home)}`
      : scoreSentence(game);
  return {
    dateKey: game.dateKey,
    time: game.isTimeTba ? null : timeOfDayPT(game.dateLocal),
    text,
    label: labels.get(game.contestId) ?? postseasonTagOf(game) ?? '',
    href: gameHref(game.contestId),
    final: view.kind === 'final',
    kind: 'game',
    key: game.contestId,
  };
}

function eventRow(event: ThisWeekEvent): ThisWeekRow {
  return {
    dateKey: event.dateKey,
    time: event.time,
    text: event.detail ?? event.title,
    label: event.detail ? event.title : '',
    href: event.href,
    final: false,
    kind: 'event',
    key: event.title,
  };
}

/** 'h:mm AM PT' → minutes after midnight, for the order inside a day; null (TBA) sorts last. */
function minutesOf(time: string | null): number {
  const m = time ? /^(\d{1,2})(?::(\d{2}))?\s*([AP]M)/.exec(time) : null;
  if (!m) return 24 * 60;
  const hour = (Number(m[1]) % 12) + (m[3] === 'PM' ? 12 : 0);
  return hour * 60 + Number(m[2] ?? 0);
}

function byWhen(a: ThisWeekRow, b: ThisWeekRow): number {
  return a.dateKey.localeCompare(b.dateKey) || minutesOf(a.time) - minutesOf(b.time) || a.key.localeCompare(b.key);
}

function dayLabel(dateKey: string, today: string): string {
  if (dateKey === today) return `Today · ${shortDate(dateKey)}`;
  if (dateKey === shiftDateKey(today, 1)) return `Tomorrow · ${shortDate(dateKey)}`;
  return shortDate(dateKey);
}

export function buildThisWeek(input: ThisWeekInput): ThisWeekView {
  const { today, region, labels } = input;
  const cap = input.cap ?? THIS_WEEK_CAP;
  const from = shiftDateKey(today, -DAYS_BACK);
  const to = shiftDateKey(today, DAYS_AHEAD);
  const inWindow = (dateKey: string) => dateKey >= from && dateKey <= to;

  const games = input.games.filter(
    (g) =>
      g.postseason !== null &&
      g.postseason.kind !== 'other' &&
      !g.isDateTba &&
      inWindow(g.dateKey) &&
      inRegion(g, region),
  );
  // A league's event gives way to its game on the same day (the BVAL play-in once MaxPreps lists it).
  const played = new Set(games.flatMap((g) => (g.postseason?.leagueId ? [`${g.postseason.leagueId}:${g.dateKey}`] : [])));
  const events = input.events.filter(
    (e) => inWindow(e.dateKey) && !(e.leagueId !== null && played.has(`${e.leagueId}:${e.dateKey}`)),
  );

  let rows = [...games.map((g) => gameRow(g, labels)), ...events.map(eventRow)].sort(byWhen);
  let more = 0;
  if (rows.length > cap) {
    more = rows.length - cap;
    // Oldest results first, then the latest rows of the window.
    const past = rows.filter((r) => r.dateKey < today).length;
    const dropPast = Math.min(past, more);
    rows = rows.slice(dropPast);
    rows = rows.slice(0, cap);
  }

  const days: ThisWeekDay[] = [];
  for (const row of rows) {
    const last = days[days.length - 1];
    if (last && last.dateKey === row.dateKey) last.rows.push(row);
    else days.push({ dateKey: row.dateKey, dateLabel: dayLabel(row.dateKey, today), rows: [row] });
  }
  return { from, to, days, more };
}
