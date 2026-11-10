/**
 * JV league games and JV standings, computed from the JV games (lib/jv/jv-merge.ts) and the varsity
 * snapshot's own classification.
 *
 * Which JV games are league games. MaxPreps' JV league flag (`contestType`) is not usable: it
 * disagrees with the varsity game of the same day and pairing on 116 of 200 such games
 * (DATA-SOURCES §1.7), and no league publishes a JV schedule or JV standings in season. But every
 * league plays its JV games alongside its varsity fixtures (SCVAL "Varsity 4:00 followed by JV";
 * BVAL and MCAL give a JV time per fixture), so a JV game takes the classification the varsity
 * pipeline already gave its varsity counterpart:
 *
 *   0. a game lib/jv/jv-corrections.ts names (leagueGames, each with its evidence) counts for that division,
 *      and so does a game listed from the league's own JV schedule (lib/jv/jv-official.ts: the fixture is its
 *      evidence);
 *   1. a varsity game between the same two schools within ±3 days (the nearest; two equally near
 *      decide nothing): the JV game counts for that game's division table when the varsity game
 *      does (`countsFor`), is non-league when the varsity game is, and is left uncounted when the
 *      varsity game is a postseason game;
 *   2. otherwise a fixture on the league's official schedule that no varsity contest matched
 *      (`snapshot.officialFixtures`), same pair, within ±3 days of its date or of the JV date the schedule
 *      gives it (OfficialFixture.jv): it counts for that division;
 *   3. otherwise a game between two schools of different divisions or leagues, or against a school
 *      outside the registry, is non-league, exactly as a varsity game would be;
 *   4. and a game between two schools of one division with no varsity counterpart is left
 *      uncounted and named on the standings page, never guessed into a table.
 *
 * How a JV table is ordered. As the league's varsity table is (LeagueRules.orderBy): on the league record
 * where the league's record orders its tables (SCVAL basketball, By-Laws Article VI §1; its end-of-season
 * meeting compiles the JV standings too, Article V §1.2), else by 3 points a win and 1 a tie in all nine leagues. For the five NorCal
 * leagues that is the league's own points rule (SCVAL also ordered its published 2025-26 JV tables
 * that way); the Sunset and the San Diego Section's City, North County and Metro conferences publish
 * no points rule, varsity or JV, so this site applies its own 3-1-0, as it does to their varsity
 * tables (LeagueRules.orderScope 'site', DESIGN-socal §2.1.7). No league publishes a JV tiebreak,
 * so teams level on points share a place. A school is in its division's JV table when it has at least
 * one JV league game (played or not); a school with none is named under the table instead.
 *
 * A JV slot team. PCAL pairs Santa Catalina (varsity only) with York (JV only) as one schedule slot
 * (lib/jv/jv-teams.ts JV_OUTSIDE_TEAMS), so a York game is classified as Santa Catalina's (its varsity
 * counterpart is Santa Catalina's game of the day) and York holds the table row: no registry page, its
 * MaxPreps team id, its own name. Santa Catalina is then neither a row nor named as absent.
 *
 * When a JV table is shown. Coaches enter JV scores far less often than varsity ones, and a table
 * built on a few of a division's games would rank teams on whichever coaches enter scores. So a
 * table is shown only when at least JV_STANDINGS_MIN_REPORTED_SHARE of the division's JV league
 * games already played have a score; otherwise the page says how many do.
 *
 * Pure: no I/O, no clock — `today` is an input.
 */

import { byDateThenId, dayDiff } from '../format';
import { officialJvFixtureId } from './jv-official';
import { jvOutsideTeamByMaxprepsId, jvSlotTeamFor } from './jv-teams';
import { LEAGUES, getLeague } from '../leagues';
import { recordOver } from '../standings/engine';
import { compareInOrder, levelInOrder } from '../standings/order';
import { getTeamBySlug, teamsInDivision } from '../teams';
import type { ComputedRecord, ContestId, DivisionId, Game, GameSide, LeagueId, OfficialFixture, TeamSlug } from '../types';

/** A varsity game or official fixture this many days either side of the JV date can be its counterpart. */
export const JV_COUNTERPART_WINDOW_DAYS = 3;
/** A JV table is shown when at least this share of the division's played JV league games have a score. */
export const JV_STANDINGS_MIN_REPORTED_SHARE = 0.6;

export type JvClassification =
  | { kind: 'league'; division: DivisionId; via: 'varsity-game' | 'official-fixture' | 'correction'; ref: string }
  | { kind: 'non-league'; reason: 'varsity-non-league' | 'different-divisions' | 'outside-registry' }
  | { kind: 'uncounted'; reason: 'no-varsity-counterpart' | 'ambiguous' | 'varsity-postseason'; division: DivisionId };

function pairOf(g: { home: { slug: string | null }; away: { slug: string | null } }): string | null {
  return g.home.slug && g.away.slug ? [g.home.slug, g.away.slug].sort().join('~') : null;
}

/**
 * The registry school a JV side plays for: its own slug, or, for a team that plays a school's JV slot
 * (lib/jv/jv-teams.ts JV_OUTSIDE_TEAMS: York for Santa Catalina), that school.
 */
function slotSlug(side: Pick<GameSide, 'slug' | 'teamId'>): TeamSlug | null {
  return side.slug ?? jvOutsideTeamByMaxprepsId(side.teamId)?.jvFor ?? null;
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
  /** Rule 0: a JV league game a source shows that no rule below can (lib/jv/jv-corrections.ts leagueGames). */
  leagueGames: Readonly<Record<ContestId, { division: DivisionId; source: string }>> = {},
): Map<ContestId, JvClassification> {
  const varsityByPair = new Map<string, Game[]>();
  for (const g of varsityGames) {
    const key = pairOf(g);
    if (key) varsityByPair.set(key, [...(varsityByPair.get(key) ?? []), g]);
  }
  // A fixture is a candidate on its own date and on the JV date its schedule gives it, when that is another day.
  const fixturesByPair = new Map<string, Array<{ dateKey: string; fixture: OfficialFixture }>>();
  for (const f of officialFixtures) {
    const key = f.homeSlug && f.awaySlug ? [f.homeSlug, f.awaySlug].sort().join('~') : null;
    if (!key) continue;
    const dates = f.jv && f.jv.dateKey !== f.dateKey ? [f.dateKey, f.jv.dateKey] : [f.dateKey];
    fixturesByPair.set(key, [...(fixturesByPair.get(key) ?? []), ...dates.map((dateKey) => ({ dateKey, fixture: f }))]);
  }

  const out = new Map<ContestId, JvClassification>();
  for (const g of jvGames) {
    const named = leagueGames[g.contestId];
    if (named) {
      out.set(g.contestId, { kind: 'league', division: named.division, via: 'correction', ref: named.source });
      continue;
    }
    // A game listed from the league's JV schedule is that fixture's JV game (its division is the fixture's).
    const slotFixtureId = officialJvFixtureId(g.contestId);
    if (slotFixtureId !== null && g.leagueDivision !== null) {
      out.set(g.contestId, { kind: 'league', division: g.leagueDivision, via: 'official-fixture', ref: slotFixtureId });
      continue;
    }
    const homeSlug = slotSlug(g.home);
    const awaySlug = slotSlug(g.away);
    const key = pairOf({ home: { slug: homeSlug }, away: { slug: awaySlug } });
    const home = homeSlug ? getTeamBySlug(homeSlug) : undefined;
    const away = awaySlug ? getTeamBySlug(awaySlug) : undefined;
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
    const candidates = fixturesByPair.get(key) ?? [];
    let fixture = nearest(g.dateKey, candidates);
    // One fixture near on both of its dates (the varsity day and the JV day) is one candidate, not two.
    if (fixture === 'ambiguous') {
      const near = candidates.filter((c) => Math.abs(dayDiff(g.dateKey, c.dateKey)) <= JV_COUNTERPART_WINDOW_DAYS);
      if (new Set(near.map((c) => c.fixture.id)).size === 1) fixture = near[0];
    }
    if (fixture && fixture !== 'ambiguous') {
      out.set(g.contestId, { kind: 'league', division: fixture.fixture.division, via: 'official-fixture', ref: fixture.fixture.id });
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
  /** null for a JV slot team (York), which has no registry page. */
  slug: TeamSlug | null;
  teamId: string;
  name: string;
  /** For a JV slot team: the registry school whose slot it plays. */
  jvFor?: TeamSlug;
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
  /** Counted finals whose score is si.com's (lib/jv/jv-merge.ts). */
  sbliveScores: number;
  /** Counted finals whose score is a school athletics site's (lib/jv/jv-school-sites.ts). */
  schoolSiteScores: number;
  /** League games still to come (not final, dated today or later). */
  toCome: number;
  /** Of every listed league game, those listed from the league's own JV schedule (lib/jv/jv-official.ts). */
  fromSchedule: number;
  /**
   * The league games each JV team plays, where the league's schedule schedules the JV round itself (every
   * fixture of the division carries a JV slot); null where no document says how many.
   */
  gamesPerTeam: number | null;
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
  /** The divisions whose official schedule schedules the JV round (each of their fixtures has a JV slot). */
  jvScheduledDivisions: ReadonlySet<DivisionId> = new Set(),
): JvDivisionTable[] {
  const out: JvDivisionTable[] = [];
  for (const league of LEAGUES) {
    const { rules } = getLeague(league.id);
    const { points } = rules;
    for (const div of league.divisions) {
      const leagueGames = games.filter((g) => g.countsFor === div.id).sort(byDateThenId);
      const finals = leagueGames.filter((g) => g.status === 'final');
      const played = leagueGames.filter(
        (g) => g.status === 'final' || (g.dateKey < today && g.status !== 'postponed'),
      ).length;
      const members = new Set(
        leagueGames.flatMap((g) => [slotSlug(g.home), slotSlug(g.away)]).filter((s): s is string => s !== null),
      );
      const teams = teamsInDivision(div.id);
      const records = teams
        .filter((t) => members.has(t.slug))
        .map((t) => {
          const slot = jvSlotTeamFor(t.slug);
          const team: { slug: TeamSlug | null; id: string; name: string; jvFor?: TeamSlug } = slot
            ? { slug: null, id: slot.maxprepsTeamId, name: slot.name, jvFor: t.slug }
            : { slug: t.slug, id: t.id, name: t.name };
          return { team, record: recordOver(finals, team.id, points, 0) };
        });
      // In the league's own order (points, or the league record: lib/standings/order.ts); level teams share
      // a place (no league publishes a JV tiebreak); teams with no result yet go last, by name.
      records.sort(
        (a, b) =>
          Number(b.record.gp > 0) - Number(a.record.gp > 0) ||
          compareInOrder(rules, a.record, b.record) ||
          a.team.name.localeCompare(b.team.name),
      );
      const rows: JvStandingRow[] = [];
      records.forEach(({ team, record }, i) => {
        const prev = rows[i - 1];
        const level = prev !== undefined && record.gp > 0 && prev.record.gp > 0 && levelInOrder(rules, prev.record, record);
        const place = level ? prev.record.place : i + 1;
        if (level) prev.shared = true;
        rows.push({
          slug: team.slug,
          teamId: team.id,
          name: team.name,
          ...(team.jvFor ? { jvFor: team.jvFor } : {}),
          record: { ...record, place },
          shared: level,
        });
      });
      const reported = finals.length;
      out.push({
        division: div.id,
        league: league.id,
        status:
          played === 0 ? 'none-played' : reported / played >= JV_STANDINGS_MIN_REPORTED_SHARE ? 'shown' : 'too-few',
        rows,
        absent: teams.filter((t) => !members.has(t.slug) && !jvSlotTeamFor(t.slug)).map((t) => t.slug),
        played,
        reported,
        sbliveScores: finals.filter((g) => g.provenance.scores === 'sblive').length,
        schoolSiteScores: finals.filter((g) => g.provenance.scores === 'school-site').length,
        toCome: leagueGames.filter((g) => g.status !== 'final' && g.dateKey >= today).length,
        fromSchedule: leagueGames.filter((g) => officialJvFixtureId(g.contestId) !== null).length,
        gamesPerTeam: jvScheduledDivisions.has(div.id) ? div.gamesPerTeam : null,
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
