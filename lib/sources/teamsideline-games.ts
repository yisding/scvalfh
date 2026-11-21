/**
 * A TeamSideline schedule page (lib/sources/teamsideline.ts) as games: what the pipeline's primary stage publishes
 * for a league read from its own site (lib/pipeline/steps/teamsideline.ts, the 7th/8th grade page), and what the JV
 * fetcher stores for the second level (scripts/fetch-jv.ts, the 6th/7th grade page). Pure.
 *
 * What a row becomes:
 *  - A side is the registry team whose alias the page's team name is (lib/teams.ts resolveTeam: 'Blach Falcons'); a
 *    name no alias holds is a side that is not ours (teamId and slug null), and the run warns.
 *  - The contest id is the page's level and the two sides (lib/game-id.ts teamsidelineContestId), so a game the
 *    league moves to another day keeps its id and its page. A playoff row is a game only once both of its sides are
 *    teams ('3rd' and 'G1 Winner' are seats, not teams), with the page's game number as its id.
 *  - The page prints a day and month; the year is the season's (seasonDate). The time is the page's.
 *  - A row with both scores is final, the higher score the winner. Level scores are a tie, unless the page bolds one
 *    side, which it does only for a winner: then that side won the game's tiebreak (a playoff game's penalty kicks,
 *    VAL Soccer Rules 19), recorded as decider 'SO' with no tally, since the page prints none. A row with no score
 *    whose comment says it was postponed or cancelled is postponed; any other is scheduled.
 *  - A regular-season row between two registry teams is a league game of their division (`leagueDivision`); a
 *    playoff row is not (lib/classify.ts tags it from the league's postseason window). The page carries no contest
 *    type, so `contestTypes` is null on both sides.
 *  - The field is the venue's name; its address is the page's map link's, when the link is an address query.
 */

import { datesAtLocal } from '../format';
import { teamsidelineContestId, teamsidelinePlayoffContestId } from '../game-id';
import { resolveTeam } from '../teams';
import type { Game, GameSide, StreetAddress, Team } from '../types';
import { seasonDate, type TeamsidelineGame as Row, type TeamsidelinePage, type TeamsidelineSide } from './teamsideline';

/** A game as read from the page: a Game with no slug, classification, official stamp or result yet. */
export type TeamsidelineGameRead = Omit<
  Game,
  'slug' | 'aliases' | 'official' | 'result' | 'timeConfirmed' | 'countsFor' | 'postseason'
> & { countsFor: null; postseason: null };

export interface TeamsidelineGamesInput {
  page: TeamsidelinePage;
  /** The level's schedule id (lib/sports/shape.ts TeamsidelineLevelPage), the first part of every contest id. */
  scheduleId: string;
  /** The calendar year the season starts in ('26-27' → 2026). */
  fallYear: number;
  /** The run's stamp: every game's provenance.fetchedAt. */
  fetchedAt: string;
}

export interface TeamsidelineGamesResult {
  /** Regular-season games, then playoff games, each in page order. */
  games: TeamsidelineGameRead[];
  /** Team names no registry alias holds, once each. */
  unknownNames: string[];
  /** Playoff rows not yet between two teams (a seat or an earlier game's winner), by their game label. */
  pendingPlayoffs: string[];
}

const POSTPONED = /\b(postpon\w*|cancel\w*|reschedul\w*)\b/i;

/** A slug-safe key for a side no registry team holds: its name, lower case, hyphenated. */
function nameKey(name: string): string {
  return name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
}

/** 'http://maps.google.com/maps?li=rwp&q=10401%20Vista%20Drive%2CCupertino%2CCA%2095014' → the address; null otherwise. */
export function addressOfMapLink(url: string | null): StreetAddress | null {
  if (url === null) return null;
  let q: string | null;
  try {
    q = new URL(url).searchParams.get('q');
  } catch {
    return null;
  }
  const m = q === null ? null : /^(.+?),\s*(.+?),\s*([A-Z]{2})\s+(\d{5})$/.exec(q.trim());
  // The page's placeholder for an unset field: "TBD Field 1,TBD Field 1,CA 12345".
  if (!m || /\bTBD\b/i.test(m[1]) || m[4] === '12345') return null;
  return { street: m[1], city: m[2], region: m[3], postalCode: m[4] };
}

function sideOf(side: TeamsidelineSide, team: Team | undefined): GameSide {
  return {
    teamId: team?.id ?? null,
    slug: team?.slug ?? null,
    name: team?.name ?? side.name,
    ...(team ? { city: team.city } : {}),
    score: side.score,
    result: null,
  };
}

/** The game one page row is, or null for a playoff row whose sides are not both teams yet. */
function gameOf(
  row: Row,
  input: TeamsidelineGamesInput,
  id: string,
  home: Team | undefined,
  away: Team | undefined,
  playoff: boolean,
): TeamsidelineGameRead {
  const dateKey = seasonDate(row.monthDay, input.fallYear);
  const dates = datesAtLocal(dateKey, row.time);
  const h = sideOf(row.home, home);
  const a = sideOf(row.away, away);
  const scored = row.home.score !== null && row.away.score !== null;
  let decider: Game['decider'] = null;
  if (scored) {
    const hs = row.home.score as number;
    const as = row.away.score as number;
    const byTiebreak = hs === as && row.home.bold !== row.away.bold;
    h.result = hs > as || (byTiebreak && row.home.bold) ? 'W' : hs < as || (byTiebreak && row.away.bold) ? 'L' : 'T';
    a.result = h.result === 'W' ? 'L' : h.result === 'L' ? 'W' : 'T';
    decider = byTiebreak ? 'SO' : 'REG';
  }
  const status: Game['status'] = scored ? 'final' : row.comments.some((c) => POSTPONED.test(c)) ? 'postponed' : 'scheduled';
  const unset = row.location === null || /^TBD\b/i.test(row.location);
  const address = unset ? null : addressOfMapLink(row.locationUrl);
  const division = !playoff && home && away && home.division === away.division ? home.division : null;
  return {
    contestId: id,
    dateLocal: dates.dateLocal,
    dateUtc: dates.dateUtc,
    dateKey: dates.dateKey,
    isDateTba: false,
    isTimeTba: dates.isTimeTba,
    home: h,
    away: a,
    // A league game is on the home school's field; a playoff game the page has not placed yet is at a field still
    // to be set, so neither side is the host there.
    site: unset ? 'neutral' : 'home',
    status,
    isLeague: division !== null,
    leagueDivision: division,
    contestTypes: { home: null, away: null },
    countsFor: null,
    postseason: null,
    otPeriods: 0,
    isOt: false,
    isForfeit: false,
    forfeitBy: null,
    decider,
    shootout: null,
    venue: { text: null, ...(unset ? {} : { name: row.location as string }), ...(address ? { address } : {}) },
    urls: { maxpreps: null, nfhsStream: null, goFan: null },
    provenance: { scores: 'teamsideline', schedule: 'teamsideline', fetchedAt: input.fetchedAt },
  };
}

/** Every game of the page (TeamsidelineGamesResult). */
export function teamsidelineGames(input: TeamsidelineGamesInput): TeamsidelineGamesResult {
  const unknown = new Set<string>();
  const resolve = (name: string): Team | undefined => {
    const team = resolveTeam(name);
    if (!team) unknown.add(name);
    return team;
  };
  const games: TeamsidelineGameRead[] = [];
  const ids = new Set<string>();
  for (const row of input.page.games) {
    const home = resolve(row.home.name);
    const away = resolve(row.away.name);
    const base = teamsidelineContestId(input.scheduleId, away?.slug ?? nameKey(row.away.name), home?.slug ?? nameKey(row.home.name));
    // A pair that meets twice at the same host (not the VAL's single round robin, but never two games on one id).
    let id = base;
    for (let n = 2; ids.has(id); n += 1) id = `${base}-${n}`;
    ids.add(id);
    games.push(gameOf(row, input, id, home, away, false));
  }
  const pending: string[] = [];
  for (const row of input.page.playoffs) {
    const n = /^G(\d+)$/.exec(row.gameLabel ?? '')?.[1];
    const home = resolveTeam(row.home.name);
    const away = resolveTeam(row.away.name);
    if (n === undefined || !home || !away) {
      pending.push(row.gameLabel ?? '(no label)');
      continue;
    }
    games.push(gameOf(row, input, teamsidelinePlayoffContestId(input.scheduleId, Number(n)), home, away, true));
  }
  return { games, unknownNames: [...unknown].sort(), pendingPlayoffs: pending };
}

/** '26-27' → 2026. */
export function fallYearOf(year: string): number {
  const m = /^(\d{2})-\d{2}$/.exec(year);
  if (!m) throw new Error(`lib/sources/teamsideline-games.ts: not a season year: ${year}`);
  return 2000 + Number(m[1]);
}
