/**
 * The page data for /playoffs (app/playoffs/page.tsx), read from `lib/data` and config: the CCS leagues'
 * blocks (each division's ladder projection, the league's pairings and their dates), each league's dates on
 * the CCS calendar, the at-large paragraph, and the header's "where each league's season leads" words, which
 * the page's `generateMetadata` shares with its header.
 *
 * "Today" is `getToday()` (`snapshot.fetchedAt` in Pacific), never `Date.now()`.
 */

import {
  getGames,
  getLastLeagueResultDate,
  getLeagueSummaries,
  getPlayoffProjection,
  getStandingFor,
  getTeamById,
  getToday,
} from '../../lib/data';
import type { LeagueSummary } from '../../lib/data';
import { listWords, monthDay, shortDate } from '../../lib/format';
import type { LeagueConfig } from '../../lib/league-config/shape';
import { getLeague, isIndependentLeague, sectionOf } from '../../lib/leagues';
import type { PlayoffProjection as Projection } from '../../lib/types';
import {
  buildDivisionProjection,
  buildPairingView,
  ladderFactsFor,
  type LeagueKeyDate,
  type PairingView,
  type ProjectionRow,
} from './playoff-view';
import { pairingViewsFor } from './this-week-inputs';

/** SPEC §10.7 item 8, verbatim. */
export const AT_LARGE_PARAGRAPH =
  'Three at-large berths are the CCS committee’s call. SCVAL submits its play-in loser and both fifth-place teams (Article VII §2); PCAL teams placed 3rd or lower may apply (PCAL By-laws §23.4); BVAL’s by-laws do not say whom it submits.';

/** "through Sep 29" / "so far", from the last day a LEAGUE result was reported (never getToday()). */
export function asOfPhrase(lastResult: string | null): string {
  return lastResult ? `through ${monthDay(lastResult)}` : 'so far';
}

function projectionRows(projection: Projection, division: string): ProjectionRow[] {
  return (projection.byDivision[division] ?? []).flatMap((row) => {
    const team = getTeamById(row.teamId);
    const standing = getStandingFor(row.teamId);
    if (!team || !standing) return [];
    return [{ team, standing, status: row.status, statuses: row.statuses, label: row.label, shared: row.shared }];
  });
}

/**
 * Whether the league still has a league game to play (a game of one of its divisions' tables, not final, dated today
 * or later): the pairings follow the tables only until then. Read from the games, not the phase window, which a
 * team's late non-league game can stretch.
 */
export function leagueGamesAhead(summary: LeagueSummary): boolean {
  const today = getToday();
  const divisions = new Set<string>(summary.divisions.map((d) => d.id));
  return getGames().some((g) => g.countsFor !== null && divisions.has(g.countsFor) && g.status !== 'final' && g.dateKey >= today);
}

/**
 * One CCS league's dates on the CCS calendar: its crossover / play-in, from config pairings. The row sits
 * on the schedule's day (`date`); when a game the pairings matched is dated off that day (the 2026 SCVAL
 * crossovers #1 and #3, Thu Oct 29), the detail says which, by seat labels, so the row stays true.
 */
export function leagueKeyDate(league: LeagueConfig, played: readonly PairingView[]): LeagueKeyDate | null {
  if (league.postseason.kind !== 'ccs-ladder' || league.postseason.pairings.length === 0) return null;
  const pairings = league.postseason.pairings;
  const first = pairings[0];
  const entry = league.keyDates.find((k) => k.date === first.date);
  const label = (entry?.label ?? `${league.shortName} postseason`).replace(/,\s*\d{1,2}(:\d{2})?\s*[AP]M$/, '');
  const purposes = [...new Set(pairings.map((p) => {
    const at = p.label.indexOf(' — ');
    const tail = at < 0 ? p.label : p.label.slice(at + 3);
    return `${tail[0].toUpperCase()}${tail.slice(1)}`;
  }))];
  const moved = new Map<string, string[]>();
  for (const p of played) {
    const configured = pairings.find((c) => c.id === p.id);
    if (!p.game || !configured || p.dateKey === configured.date) continue;
    const seats = `${p.seats[0].label} v ${p.seats[1].label}`;
    moved.set(p.dateKey, [...(moved.get(p.dateKey) ?? []), seats]);
  }
  const movedWords = [...moved.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, seats]) => ` ${listWords(seats)} ${seats.length === 1 ? 'is' : 'are'} ${shortDate(dateKey)}.`)
    .join('');
  const detail = `${pairings.length === 1 ? `${first.label}.` : `${purposes.join('. ')}.`}${movedWords}`;
  return { id: league.id, leagueShort: league.shortName, date: first.date, time: first.time, label, detail };
}

export interface LeagueBlock {
  summary: LeagueSummary;
  config: LeagueConfig;
  divisions: Array<{
    id: string;
    heading: string;
    anchor: string | undefined;
    asOf: string;
    projection: ReturnType<typeof buildDivisionProjection>;
  }>;
  meterNote: string | null;
  pairings: ReturnType<typeof buildPairingView>[];
  pairingDate: string | null;
}

export function leagueBlock(summary: LeagueSummary): LeagueBlock {
  const config = getLeague(summary.id);
  const projection = getPlayoffProjection(summary.id);
  const divisions = summary.divisions.map((d) => {
    const facts = ladderFactsFor(d.id);
    return {
      id: d.id,
      heading: d.heading ?? 'League table',
      // A single-division league whose division id equals the league id: ONE element carries it.
      anchor: d.id === summary.id ? undefined : d.id,
      asOf: asOfPhrase(getLastLeagueResultDate({ division: d.id })),
      projection: buildDivisionProjection(d.id, d.heading ?? summary.shortName, projectionRows(projection, d.id), facts),
      aq: facts.aqPlaces,
    };
  });
  const aqs = [...new Set(divisions.map((d) => d.aq))];
  const meterNote =
    divisions.length > 1 && aqs.length === 1 && aqs[0] > 0
      ? `${aqs[0]} per division qualify automatically.`
      : null;
  const pairings = pairingViewsFor(summary.id);
  return {
    summary,
    config,
    divisions,
    meterNote,
    pairings,
    // 'Fri Oct 30', or 'Thu Oct 29 – Fri Oct 30' when the games are spread over days (the SCVAL crossovers).
    pairingDate: (() => {
      const days = [...new Set(pairings.map((p) => p.dateKey))].sort();
      if (days.length === 0) return null;
      return days.length === 1 ? shortDate(days[0]) : `${shortDate(days[0])} – ${shortDate(days[days.length - 1])}`;
    })(),
  };
}

/**
 * Where each league's season leads, from config, in config order: 'the CCS championships (SCVAL, BVAL
 * and PCAL), the MCAL tournament, the EAL’s Super Regional, the Tournament of Champions (the Sunset and the
 * LA independents) and the San Diego Section playoffs (City, North and Metro)'. A group with no table
 * is named in full (its short name, 'LA', alone names a place).
 */
export function postseasonWords(): string {
  const parts: Array<{ key: string; words: (shorts: string[]) => string; shorts: string[] }> = [];
  const add = (key: string, short: string, words: (shorts: string[]) => string) => {
    const part = parts.find((p) => p.key === key);
    if (part) part.shorts.push(short);
    else parts.push({ key, words, shorts: [short] });
  };
  for (const summary of getLeagueSummaries()) {
    const ps = getLeague(summary.id).postseason;
    switch (ps.kind) {
      case 'ccs-ladder':
        add('ccs', summary.shortName, (shorts) => `the CCS championships (${listWords(shorts)})`);
        break;
      case 'league-tournament':
        add(summary.id, summary.shortName, () => `the ${ps.name}`);
        break;
      case 'unbracketed-tournament':
        add(summary.id, summary.shortName, () => `the ${summary.shortName}’s ${ps.name}`);
        break;
      case 'no-postseason': {
        // The section's outside tournament is their postseason (the Tournament of Champions: the Sunset and the
        // LA independents).
        const event = sectionOf(summary.id).outsideTournament;
        add(
          event ? `outside:${event.id}` : 'no-postseason',
          isIndependentLeague(summary.id) ? summary.name : summary.shortName,
          (shorts) =>
            event
              ? `the ${event.name} (${listWords(shorts.map((s) => `the ${s}`))})`
              : `no playoffs for ${listWords(shorts.map((s) => `the ${s}`), 'or')}`,
        );
        break;
      }
      case 'section-playoffs':
        add(ps.name, summary.shortName, (shorts) => `the ${ps.name} (${listWords(shorts)})`);
        break;
    }
  }
  return listWords(parts.map((p) => p.words(p.shorts)));
}
