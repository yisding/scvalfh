/**
 * VNN school calendars → MaxPreps games (SPEC §1.5): attach the venue names and confirm the start
 * times the two verified school `.ics` feeds publish (lib/sources/vnn-ics.ts parses them), and put
 * back, per school, what a feed published before when it produced nothing this run.
 */

import type { Game } from '@/lib/model/game';
import type { TeamSlug } from '@/lib/model/ids';
import { sideJoinKey, unorderedPairKey } from '@/lib/registry/resolve';
import type { VnnEvent } from '@/lib/sources/vnn-ics';

export interface ApplyVnnResult {
  games: Game[];
  /** Games that gained a venue name. */
  venuesAdded: number;
  /** Games whose MaxPreps start time the school calendar corroborates. */
  timesConfirmed: number;
  /** Varsity events that matched no MaxPreps contest. */
  unmatched: number;
  warnings: string[];
}

/**
 * Attach `venue.name` and `timeConfirmed` where MaxPreps has neither.
 *
 * Varsity only (the snapshot is a varsity season). The start time is CONFIRMED, never rewritten:
 * `dateLocal` stays MaxPreps'. When MaxPreps says the time is TBA the calendar's time is reported as
 * a warning rather than written in, because filling it would put an unsourced timestamp in the field
 * the whole site formats from.
 */
export function applyVnnEvents(
  games: readonly Game[],
  events: readonly VnnEvent[],
): ApplyVnnResult {
  const warnings: string[] = [];
  const byKey = new Map<string, VnnEvent>();
  for (const e of events) {
    if (e.level !== 'Varsity') continue;
    if (!e.opponentSlug) {
      // A non-SCVAL opponent is still matchable by name, through the same normalization.
      byKey.set(`${e.dateKey}|${unorderedPairKey(e.schoolSlug, sideJoinKey({ slug: null, name: e.opponentName }))}`, e);
      continue;
    }
    byKey.set(`${e.dateKey}|${unorderedPairKey(e.schoolSlug, e.opponentSlug)}`, e);
  }

  let venuesAdded = 0;
  let timesConfirmed = 0;
  const matched = new Set<string>();

  const out = games.map((game) => {
    const key = `${game.dateKey}|${unorderedPairKey(sideJoinKey(game.home), sideJoinKey(game.away))}`;
    const event = byKey.get(key);
    if (!event) return game;
    matched.add(key);

    const wantVenue = !game.venue.name && !!event.venue;
    const icsTime = event.startLocal.slice(11, 16);
    const mpTime = game.dateLocal.slice(11, 16);
    const timeAgrees = !game.isTimeTba && icsTime === mpTime;
    if (game.isTimeTba) {
      warnings.push(
        `${game.contestId} (${game.dateKey} ${game.away.name} at ${game.home.name}): ` +
          `MaxPreps time is TBA; ${event.schoolSlug}'s calendar says ${icsTime} PT`,
      );
    } else if (!timeAgrees) {
      warnings.push(
        `${game.contestId} (${game.dateKey}): MaxPreps ${mpTime} PT, ` +
          `${event.schoolSlug}'s calendar ${icsTime} PT`,
      );
    }
    if (!wantVenue && !timeAgrees) return game;
    if (wantVenue) venuesAdded += 1;
    if (timeAgrees) timesConfirmed += 1;
    return {
      ...game,
      ...(timeAgrees ? { timeConfirmed: true } : {}),
      ...(wantVenue ? { venue: { ...game.venue, name: event.venue as string } } : {}),
    };
  });

  const varsity = events.filter((e) => e.level === 'Varsity').length;
  return {
    games: out,
    venuesAdded,
    timesConfirmed,
    unmatched: Math.max(0, varsity - matched.size),
    warnings,
  };
}

// ---------------------------------------------------------------- carry-forward

/**
 * SPEC §5.3, PER SITE: put back the venue names and confirmed start times a school calendar
 * published before, for the schools whose feed produced nothing this run.
 *
 * There are only two verified feeds and the failure that happens is ONE of them, so a pooled
 * "did any calendar answer" flag is the wrong question: while Los Gatos answered, a failed Palo
 * Alto feed silently dropped nine venue names and five confirmed start times off published game
 * pages. Keyed on the school instead, a feed that DID answer is never second-guessed and a feed
 * that did not never takes its school's data down with it.
 *
 * Only ever FILLS A HOLE — a value this run produced always wins.
 */
export function carryVnnForward(
  missing: readonly TeamSlug[],
  previousGames: readonly Game[],
  games: readonly Game[],
): { games: Game[]; carried: number } {
  const wanted = new Set<string>(missing);
  if (wanted.size === 0) return { games: [...games], carried: 0 };
  const prevById = new Map(previousGames.map((g) => [g.contestId, g]));
  let carried = 0;
  const out = games.map((game) => {
    const touches =
      (game.home.slug !== null && wanted.has(game.home.slug)) ||
      (game.away.slug !== null && wanted.has(game.away.slug));
    if (!touches) return game;
    const prev = prevById.get(game.contestId);
    if (!prev) return game;
    const patch: Partial<Game> = {};
    if (prev.venue.name && !game.venue.name) {
      patch.venue = {
        ...game.venue,
        name: prev.venue.name,
        ...(prev.venue.address ? { address: prev.venue.address } : {}),
      };
    }
    if (prev.timeConfirmed && !game.timeConfirmed) patch.timeConfirmed = true;
    if (Object.keys(patch).length === 0) return game;
    carried += 1;
    return { ...game, ...patch };
  });
  return { games: out, carried };
}
