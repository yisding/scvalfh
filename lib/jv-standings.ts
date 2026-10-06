/**
 * JV league games and JV standings, computed from the JV games (lib/jv-merge.ts) and the varsity
 * snapshot's own classification.
 *
 * Which JV games are league games. MaxPreps' JV league flag (`contestType`) is not usable: it
 * disagrees with the varsity game of the same day and pairing on 116 of 200 such games
 * (DATA-SOURCES §1.7), and no league publishes a JV schedule or JV standings in season. But every
 * league plays its JV games alongside its varsity fixtures (SCVAL "Varsity 4:00 followed by JV";
 * BVAL and MCAL give a JV time per fixture), so a JV game takes the classification the varsity
 * pipeline already gave its varsity counterpart:
 *
 *   1. a varsity game between the same two schools within ±3 days (the nearest; two equally near
 *      decide nothing): the JV game counts for that game's division table when the varsity game
 *      does (`countsFor`), is non-league when the varsity game is, and is left uncounted when the
 *      varsity game is a postseason game;
 *   2. otherwise a fixture on the league's official schedule that no varsity contest matched
 *      (`snapshot.officialFixtures`), same pair, within ±3 days: it counts for that division;
 *   3. otherwise a game between two schools of different divisions or leagues, or against a school
 *      outside the registry, is non-league, exactly as a varsity game would be;
 *   4. and a game between two schools of one division with no varsity counterpart is left
 *      uncounted and named on the standings page, never guessed into a table.
 *
 * How a JV table is ordered. By 3 points a win and 1 a tie in all nine leagues. For the five NorCal
 * leagues that is the league's own points rule (SCVAL also ordered its published 2025-26 JV tables
 * that way); the Sunset and the San Diego Section's City, North County and Metro conferences publish
 * no points rule, varsity or JV, so this site applies its own 3-1-0, as it does to their varsity
 * tables (LeagueRules.orderScope 'site', DESIGN-socal §2.1.7). No league publishes a JV tiebreak,
 * so teams level on points share a place. A school is in its division's JV table when it has at least
 * one JV league game (played or not); a school with none is named under the table instead.
 *
 * When a JV table is shown. Coaches enter JV scores far less often than varsity ones, and a table
 * built on a few of a division's games would rank teams on whichever coaches enter scores. So a
 * table is shown only when at least JV_STANDINGS_MIN_REPORTED_SHARE of the division's JV league
 * games already played have a score; otherwise the page says how many do.
 *
 * Pure: no I/O, no clock — `today` is an input.
 */

import { byDateThenId, dayDiff } from './format';
import { LEAGUES, getLeague } from './leagues';
import { recordOver } from './standings';
import { getTeamBySlug, teamsInDivision } from './teams';
import type { ComputedRecord, ContestId, DivisionId, Game, LeagueId, OfficialFixture, TeamSlug } from './types';

/** A varsity game or official fixture this many days either side of the JV date can be its counterpart. */
export const JV_COUNTERPART_WINDOW_DAYS = 3;
/** A JV table is shown when at least this share of the division's played JV league games have a score. */
export const JV_STANDINGS_MIN_REPORTED_SHARE = 0.6;

export type JvClassification =
  | { kind: 'league'; division: DivisionId; via: 'varsity-game' | 'official-fixture'; ref: string }
  | { kind: 'non-league'; reason: 'varsity-non-league' | 'different-divisions' | 'outside-registry' }
  | { kind: 'uncounted'; reason: 'no-varsity-counterpart' | 'ambiguous' | 'varsity-postseason'; division: DivisionId };

function pairOf(g: { home: { slug: string | null }; away: { slug: string | null } }): string | null {
  return g.home.slug && g.away.slug ? [g.home.slug, g.away.slug].sort().join('~') : null;
}

/** The nearest candidate within the window, `ambiguous` when two are equally near, or null. */
function nearest<T extends { dateKey: string }>(date: string, candidates: readonly T[]): T | 'ambiguous' | null {
  const near = candidates
    .map((c) => ({ c, d: Math.abs(dayDiff(date, c.dateKey)) }))
    .filter(({ d }) => d <= JV_COUNTERPART_WINDOW_DAYS)
    .sort((a, b) => a.d - b.d);
  if (near.length === 0) return null;
  if (near.length > 1 && near[0].d === near[1].d) return 'ambiguous';
  return near[0].c;
}

/** Every JV game's classification (rules 1-4 above), by contest id. */
export function classifyJvGames(
  jvGames: readonly Game[],
  varsityGames: readonly Game[],
  officialFixtures: readonly OfficialFixture[],
): Map<ContestId, JvClassification> {
  const varsityByPair = new Map<string, Game[]>();
  for (const g of varsityGames) {
    const key = pairOf(g);
    if (key) varsityByPair.set(key, [...(varsityByPair.get(key) ?? []), g]);
  }
  const fixturesByPair = new Map<string, OfficialFixture[]>();
  for (const f of officialFixtures) {
    const key = f.homeSlug && f.awaySlug ? [f.homeSlug, f.awaySlug].sort().join('~') : null;
    if (key) fixturesByPair.set(key, [...(fixturesByPair.get(key) ?? []), f]);
  }

  const out = new Map<ContestId, JvClassification>();
  for (const g of jvGames) {
    const key = pairOf(g);
    const home = g.home.slug ? getTeamBySlug(g.home.slug) : undefined;
    const away = g.away.slug ? getTeamBySlug(g.away.slug) : undefined;
    if (!key || !home || !away) {
      out.set(g.contestId, { kind: 'non-league', reason: 'outside-registry' });
      continue;
    }
    const sameDivision = home.division === away.division;
    const twin = nearest(g.dateKey, varsityByPair.get(key) ?? []);
    if (twin === 'ambiguous') {
      out.set(
        g.contestId,
        sameDivision
          ? { kind: 'uncounted', reason: 'ambiguous', division: home.division }
          : { kind: 'non-league', reason: 'different-divisions' },
      );
      continue;
    }
    if (twin) {
      if (twin.countsFor !== null) {
        out.set(g.contestId, { kind: 'league', division: twin.countsFor, via: 'varsity-game', ref: twin.contestId });
      } else if (twin.postseason !== null && sameDivision) {
        out.set(g.contestId, { kind: 'uncounted', reason: 'varsity-postseason', division: home.division });
      } else {
        out.set(g.contestId, { kind: 'non-league', reason: sameDivision ? 'varsity-non-league' : 'different-divisions' });
      }
      continue;
    }
    const fixture = nearest(g.dateKey, fixturesByPair.get(key) ?? []);
    if (fixture && fixture !== 'ambiguous') {
      out.set(g.contestId, { kind: 'league', division: fixture.division, via: 'official-fixture', ref: fixture.id });
      continue;
    }
    out.set(
      g.contestId,
      sameDivision
        ? { kind: 'uncounted', reason: fixture === 'ambiguous' ? 'ambiguous' : 'no-varsity-counterpart', division: home.division }
        : { kind: 'non-league', reason: 'different-divisions' },
    );
  }
  return out;
}

/** JV games with `countsFor` set from their classification (postseason stays null). */
export function withJvClassification(games: readonly Game[], classes: ReadonlyMap<ContestId, JvClassification>): Game[] {
  return games.map((g) => {
    const c = classes.get(g.contestId);
    return c?.kind === 'league' ? { ...g, countsFor: c.division, postseason: null } : { ...g, countsFor: null, postseason: null };
  });
}

export interface JvStandingRow {
  slug: TeamSlug;
  teamId: string;
  record: ComputedRecord;
  /** Level on points with another team: the two share `record.place`. */
  shared: boolean;
}

export interface JvDivisionTable {
  division: DivisionId;
  league: LeagueId;
  /**
   * shown       enough of the played league games have a score: the table is published
   * too-few     some played league games, but under the threshold have a score
   * none-played no JV league game of this division has been played yet
   */
  status: 'shown' | 'too-few' | 'none-played';
  /** Schools with at least one JV league game, in table order. */
  rows: JvStandingRow[];
  /** Schools of the division with no JV league game at all. */
  absent: TeamSlug[];
  /** JV league games played: final, or dated before today and not postponed. */
  played: number;
  /** Of those, the finals. */
  reported: number;
  /** Counted finals whose score is si.com's (lib/jv-merge.ts). */
  sbliveScores: number;
  /** League games still to come (not final, dated today or later). */
  toCome: number;
  /** Same-division JV games with no varsity counterpart, which no table counts. */
  uncounted: Game[];
  /** The latest counted final's date, or null. */
  throughDate: string | null;
}

/** Every division's JV table, in config order. `games` are classified (withJvClassification). */
export function computeJvStandings(
  games: readonly Game[],
  classes: ReadonlyMap<ContestId, JvClassification>,
  today: string,
): JvDivisionTable[] {
  const out: JvDivisionTable[] = [];
  for (const league of LEAGUES) {
    const points = getLeague(league.id).rules.points;
    for (const div of league.divisions) {
      const leagueGames = games.filter((g) => g.countsFor === div.id).sort(byDateThenId);
      const finals = leagueGames.filter((g) => g.status === 'final');
      const played = leagueGames.filter(
        (g) => g.status === 'final' || (g.dateKey < today && g.status !== 'postponed'),
      ).length;
      const members = new Set(leagueGames.flatMap((g) => [g.home.slug, g.away.slug]).filter((s): s is string => s !== null));
      const teams = teamsInDivision(div.id);
      const records = teams
        .filter((t) => members.has(t.slug))
        .map((t) => ({ team: t, record: recordOver(finals, t.id, points, 0) }));
      // By points; level teams share a place (no league publishes a JV tiebreak); teams with no
      // result yet go last, by name.
      records.sort(
        (a, b) =>
          Number(b.record.gp > 0) - Number(a.record.gp > 0) ||
          b.record.pts - a.record.pts ||
          a.team.name.localeCompare(b.team.name),
      );
      const rows: JvStandingRow[] = [];
      records.forEach(({ team, record }, i) => {
        const prev = rows[i - 1];
        const level = prev !== undefined && record.gp > 0 && prev.record.gp > 0 && prev.record.pts === record.pts;
        const place = level ? prev.record.place : i + 1;
        if (level) prev.shared = true;
        rows.push({ slug: team.slug, teamId: team.id, record: { ...record, place }, shared: level });
      });
      const reported = finals.length;
      out.push({
        division: div.id,
        league: league.id,
        status:
          played === 0 ? 'none-played' : reported / played >= JV_STANDINGS_MIN_REPORTED_SHARE ? 'shown' : 'too-few',
        rows,
        absent: teams.filter((t) => !members.has(t.slug)).map((t) => t.slug),
        played,
        reported,
        sbliveScores: finals.filter((g) => g.provenance.scores === 'sblive').length,
        toCome: leagueGames.filter((g) => g.status !== 'final' && g.dateKey >= today).length,
        uncounted: games
          .filter((g) => {
            const c = classes.get(g.contestId);
            return c?.kind === 'uncounted' && c.division === div.id;
          })
          .sort(byDateThenId),
        throughDate: finals.at(-1)?.dateKey ?? null,
      });
    }
  }
  return out;
}
