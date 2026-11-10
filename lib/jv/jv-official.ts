/**
 * JV games from the league's own schedule (the fourth JV layer, after lib/jv/jv-school-sites.ts).
 *
 * Coaches enter JV schedules on MaxPreps far less completely than varsity ones: on 2026-11-10 the 15 SCVAL
 * boys basketball JV feeds held 9 to 24 games each, where every JV team plays a 12- or 14-game league round
 * alone. Where a league's schedule document schedules the JV games itself, an official fixture carries a `jv`
 * slot (OfficialFixture.jv: SCVAL basketball, whose By-Laws make the JV round a double round robin, Article V
 * §2, and whose schedules give the JV starting times and move the last JV round to the Monday). The snapshot
 * holds the slot on the varsity game the fixture matched (`Game.official.jv`) and on a fixture no contest
 * matched (`snapshot.officialFixtures`); `jvSlotsOf` reads both. This module makes each slot a JV game on the site:
 *
 *   1. a JV game already listed for the same two schools within ±JV_OFFICIAL_WINDOW_DAYS of the slot's date is
 *      that game (the nearest; a game is claimed by one slot only). It keeps everything MaxPreps says; only a
 *      start time MaxPreps leaves TBA is taken from the schedule, when the game is on the slot's own date;
 *   2. otherwise a listed JV game of the same two schools with the same host, anywhere in the season, that no
 *      slot claimed is the slot's game moved to another day, and nothing is added (so a rescheduled game is
 *      never listed twice);
 *   3. otherwise the slot is added as a scheduled JV game: the schedule's date, time and host, no score,
 *      contest id `official-jv:<fixture id>`, `provenance.schedule` the league document. It is a league game
 *      by definition (lib/jv/jv-standings.ts classifies it without a varsity counterpart), and it disappears
 *      the day MaxPreps lists the game, which then carries the score.
 *
 * A slot whose schools are not both registry teams is skipped. Pure: no I/O, no clock.
 */

import { byDateThenId, dayDiff, toLocalTimestamp } from '../format';
import { getTeamBySlug } from '../teams';
import type { ContestId, DivisionId, Game, GameSide, OfficialFixture, OfficialSourceId, TeamSlug } from '../types';

export const OFFICIAL_JV_PREFIX = 'official-jv:';
/** A listed JV game this many days either side of a schedule slot is the slot's game. */
export const JV_OFFICIAL_WINDOW_DAYS = 3;

export const isOfficialJvContestId = (id: ContestId): boolean => id.startsWith(OFFICIAL_JV_PREFIX);

/** The official fixture id behind a JV game this module added. */
export function officialJvFixtureId(contestId: ContestId): string | null {
  return isOfficialJvContestId(contestId) ? contestId.slice(OFFICIAL_JV_PREFIX.length) : null;
}

/** One JV game the league's schedule lists: the fixture it belongs to, its sides, its own date and start. */
export interface JvSlot {
  /** OfficialFixture.id (`${division}:${date}:${away}@${home}`). */
  fixtureId: string;
  division: DivisionId;
  source: OfficialSourceId;
  homeSlug: TeamSlug;
  awaySlug: TeamSlug;
  dateKey: string;
  time: string | null;
}

/**
 * Every JV slot the snapshot holds, by date: the fixtures a varsity contest matched (its `official` stamp
 * names the fixture, whose id carries the fixture's own away and home slugs, which a host the schools swapped
 * does not change) and the fixtures none did. A fixture id that does not name two registry teams is skipped.
 */
export function jvSlotsOf(varsityGames: readonly Game[], unmatched: readonly OfficialFixture[]): JvSlot[] {
  const slots = new Map<string, JvSlot>();
  for (const g of varsityGames) {
    const stamp = g.official;
    if (!stamp?.jv) continue;
    const m = /^[^:]+:\d{4}-\d{2}-\d{2}:([^@]+)@(.+)$/.exec(stamp.fixtureId);
    if (!m || !getTeamBySlug(m[1]) || !getTeamBySlug(m[2])) continue;
    slots.set(stamp.fixtureId, {
      fixtureId: stamp.fixtureId, division: stamp.division, source: stamp.source,
      awaySlug: m[1], homeSlug: m[2], dateKey: stamp.jv.dateKey, time: stamp.jv.time,
    });
  }
  for (const f of unmatched) {
    if (!f.jv || !f.homeSlug || !f.awaySlug || !getTeamBySlug(f.homeSlug) || !getTeamBySlug(f.awaySlug)) continue;
    slots.set(f.id, {
      fixtureId: f.id, division: f.division, source: f.source,
      awaySlug: f.awaySlug, homeSlug: f.homeSlug, dateKey: f.jv.dateKey, time: f.jv.time,
    });
  }
  return [...slots.values()].sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.fixtureId.localeCompare(b.fixtureId));
}

export interface JvOfficialMergeResult {
  /** Every JV game: the listed ones (some with a schedule time), then the schedule's own, by date. */
  games: Game[];
  /** Games added from the schedule (rule 3). */
  added: ContestId[];
  /** Listed games whose TBA start time is the schedule's (rule 1). */
  timed: ContestId[];
  /** Slots a listed game claimed on or near its date (rule 1), and slots whose game was found moved (rule 2). */
  matched: number;
  moved: number;
  /** Fixtures that carry a JV slot. */
  slots: number;
}

const pairKey = (a: TeamSlug, b: TeamSlug): string => [a, b].sort().join('~');

function pacificToUtc(dateLocal: string): string {
  for (const hours of [7, 8]) {
    const iso = new Date(Date.parse(`${dateLocal}Z`) + hours * 3_600_000).toISOString().replace('.000Z', 'Z');
    if (toLocalTimestamp(iso) === dateLocal) return iso;
  }
  throw new Error(`jv-official: no Pacific instant for ${dateLocal}`);
}

function side(slug: TeamSlug): GameSide {
  const team = getTeamBySlug(slug);
  if (!team) throw new Error(`jv-official: ${slug} is not a registry team`);
  return { teamId: team.id, slug, name: team.name, score: null, result: null };
}

function slotGame(slot: JvSlot, fetchedAt: string): Game {
  // A slot with no time is listed at noon with the time TBA, as a MaxPreps row with no time is.
  const dateLocal = `${slot.dateKey}T${slot.time ?? '12:00'}:00`;
  return {
    contestId: `${OFFICIAL_JV_PREFIX}${slot.fixtureId}`,
    dateLocal,
    dateUtc: pacificToUtc(dateLocal),
    dateKey: slot.dateKey,
    isDateTba: false,
    isTimeTba: slot.time === null,
    home: side(slot.homeSlug),
    away: side(slot.awaySlug),
    site: 'home',
    status: 'scheduled',
    isLeague: true,
    leagueDivision: slot.division,
    contestTypes: { home: null, away: null },
    countsFor: null,
    postseason: null,
    otPeriods: 0,
    isOt: false,
    isForfeit: false,
    forfeitBy: null,
    decider: null,
    shootout: null,
    venue: { text: null },
    urls: { maxpreps: null, nfhsStream: null, goFan: null },
    provenance: { scores: slot.source, schedule: slot.source, fetchedAt },
  };
}

export function mergeJvOfficial(input: {
  games: readonly Game[];
  slots: readonly JvSlot[];
  /** Stamped on an added game's provenance: the JV file's fetchedAt. */
  fetchedAt: string;
}): JvOfficialMergeResult {
  const slots = input.slots;

  const byPair = new Map<string, Game[]>();
  for (const g of input.games) {
    if (!g.home.slug || !g.away.slug) continue;
    const key = pairKey(g.home.slug, g.away.slug);
    byPair.set(key, [...(byPair.get(key) ?? []), g]);
  }

  const claimed = new Set<ContestId>();
  const timeOf = new Map<ContestId, string>();
  const open: JvSlot[] = [];
  let matched = 0;

  // Rule 1: the nearest unclaimed listed game of the pair within the window.
  for (const f of slots) {
    const near = (byPair.get(pairKey(f.homeSlug, f.awaySlug)) ?? [])
      .filter((g) => !claimed.has(g.contestId))
      .map((g) => ({ g, d: Math.abs(dayDiff(f.dateKey, g.dateKey)) }))
      .filter(({ d }) => d <= JV_OFFICIAL_WINDOW_DAYS)
      .sort((a, b) => a.d - b.d || byDateThenId(a.g, b.g));
    if (near.length === 0) {
      open.push(f);
      continue;
    }
    const { g, d } = near[0];
    claimed.add(g.contestId);
    matched += 1;
    if (d === 0 && g.isTimeTba && f.time !== null && g.status === 'scheduled') timeOf.set(g.contestId, f.time);
  }

  // Rule 2: the same pair with the same host on another day is the slot's game, moved.
  const added: Game[] = [];
  let moved = 0;
  for (const f of open) {
    const elsewhere = (byPair.get(pairKey(f.homeSlug, f.awaySlug)) ?? [])
      .filter((g) => !claimed.has(g.contestId) && g.home.slug === f.homeSlug)
      .sort(byDateThenId);
    if (elsewhere.length > 0) {
      claimed.add(elsewhere[0].contestId);
      moved += 1;
      continue;
    }
    added.push(slotGame(f, input.fetchedAt));
  }

  const games = input.games.map((g) => {
    const time = timeOf.get(g.contestId);
    if (time === undefined) return g;
    const dateLocal = `${g.dateKey}T${time}:00`;
    return { ...g, dateLocal, dateUtc: pacificToUtc(dateLocal), isTimeTba: false };
  });

  return {
    games: [...games, ...added].sort(byDateThenId),
    added: added.map((g) => g.contestId),
    timed: [...timeOf.keys()],
    matched,
    moved,
    slots: slots.length,
  };
}
