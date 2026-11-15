/**
 * SCHEDULE-DETAIL source: VNN / PlayOn "Mascot Media Bolt" whole-school `.ics` feeds (SPEC §1.5).
 *
 * Two schools only — Palo Alto 2635290 and Los Gatos 2634860 — because those are the two siteIds
 * that are verified. Los Altos's newer PlayOn build exposes no ICS at all, and the other 13 schools'
 * ids were never discovered. This feed carries **no scores**: venue and exact start time only.
 *
 * Extraction facts:
 *   - the `/0/` (whole-school) path is the only usable form; team-scoped paths return an empty
 *     VCALENDAR.
 *   - RFC 5545 line UNFOLDING is required before parsing — some LOCATION/URL lines are folded.
 *   - 🚨 the SUMMARY text uses **`JV`**, not `Junior Varsity`. The original regex matched 11 of 19
 *     Paly events and silently dropped 42 % of the data. The corrected regex below is verified
 *     19/19.
 *   - `DTSTART`/`DTEND` are UTC Zulu: `DTSTART:20260929T230000Z` is Sep 29, 4:00 PM PDT.
 *   - opponent-name formatting differs per school: Paly writes "Santa Clara High School",
 *     Los Gatos writes bare "Santa Clara". Both go through the registry alias table.
 */

import { localDateKey, toLocalTimestamp } from '../format';
import { GENDER_NAME, SPORT } from '../sports/current';
import { resolveTeam, sideJoinKey, unorderedPairKey } from '../teams';
import type { Game, StreetAddress, TeamSlug } from '../types';
import { icsLine, unfoldIcs } from './http';

/** [V] the only two verified siteIds (SPEC §1.5). */
export const VNN_SITE_IDS: ReadonlyArray<{ slug: TeamSlug; siteId: string; school: string }> = [
  { slug: 'palo-alto', siteId: '2635290', school: 'Palo Alto High School' },
  { slug: 'los-gatos', siteId: '2634860', school: 'Los Gatos High School' },
];

export function vnnIcsUrl(siteId: string): string {
  return `https://mmboltapi.azurewebsites.net/api/v2/events/calendar/${siteId}/0/calendar.ics`;
}

/** Group 2 = Varsity | JV · group 3 = vs (home) | at (away) · group 4 = opponent. Verified 19/19. */
export const VNN_SUMMARY_RE = new RegExp(`^(${GENDER_NAME} (Varsity|JV) ${SPORT.name}) (vs|at) (.+)$`);

export interface VnnEvent {
  uid: string | null;
  /** The school whose calendar this is. */
  schoolSlug: TeamSlug;
  level: 'Varsity' | 'JV';
  /** From `vs` / `at`, i.e. relative to the calendar's own school. */
  site: 'home' | 'away';
  opponentName: string;
  opponentSlug: TeamSlug | null;
  /** ISO UTC, from the Zulu DTSTART. */
  startUtc: string;
  /** Naive America/Los_Angeles timestamp for that instant. */
  startLocal: string;
  dateKey: string;
  /** LOCATION — a real venue here, unlike MaxPreps' `contest.location` note field. */
  venue: string | null;
}

/** `20260929T230000Z` → `2026-09-29T23:00:00.000Z`. Returns null for a date-only DTSTART. */
export function icsInstant(value: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value.trim());
  if (!m) return null;
  return new Date(
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6])),
  ).toISOString();
}

export function parseVnnIcs(text: string, schoolSlug: TeamSlug): VnnEvent[] {
  const lines = unfoldIcs(text);
  const out: VnnEvent[] = [];
  let inEvent = false;
  let fields: { uid: string; dtstart: string; summary: string; location: string } | null = null;

  for (const raw of lines) {
    const upper = raw.trim().toUpperCase();
    if (upper === 'BEGIN:VEVENT') {
      inEvent = true;
      fields = { uid: '', dtstart: '', summary: '', location: '' };
      continue;
    }
    if (upper === 'END:VEVENT') {
      if (fields) {
        // The regex is applied to the PARSED SUMMARY VALUE, never to a raw `SUMMARY:` line.
        const m = VNN_SUMMARY_RE.exec(fields.summary.trim());
        const startUtc = icsInstant(fields.dtstart);
        if (m && startUtc) {
          const opponentName = m[4].trim();
          const opponent = resolveTeam(opponentName);
          out.push({
            uid: fields.uid || null,
            schoolSlug,
            level: m[2] === 'JV' ? 'JV' : 'Varsity',
            site: m[3] === 'vs' ? 'home' : 'away',
            opponentName,
            opponentSlug: opponent?.slug ?? null,
            startUtc,
            startLocal: toLocalTimestamp(startUtc),
            dateKey: localDateKey(startUtc),
            venue: fields.location.trim() || null,
          });
        }
      }
      inEvent = false;
      fields = null;
      continue;
    }
    if (!inEvent || !fields) continue;
    const field = icsLine(raw);
    if (!field) continue;
    if (field.name === 'DTSTART') fields.dtstart = field.value;
    else if (field.name === 'SUMMARY') fields.summary = field.value;
    else if (field.name === 'LOCATION') fields.location = field.value;
    else if (field.name === 'UID') fields.uid = field.value;
  }

  return out.sort((a, b) => (a.startUtc === b.startUtc ? a.level.localeCompare(b.level) : a.startUtc.localeCompare(b.startUtc)));
}

// ---------------------------------------------------------------- application

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

/** What a school calendar adds to one game: the venue name MaxPreps lacks, and/or a confirmed start time. */
export interface VnnDecision {
  venueName?: string;
  timeConfirmed?: true;
}

export interface VnnDecisions {
  /** By contest id; a game the calendars add nothing to has no entry and is left as it is. */
  decisions: Map<string, VnnDecision>;
  venuesAdded: number;
  timesConfirmed: number;
  unmatched: number;
  warnings: string[];
}

/** One decision applied to the game it is for; the start time is only ever confirmed, never rewritten. */
export function applyVnnDecision(game: Game, decision: VnnDecision): Game {
  return {
    ...game,
    ...(decision.timeConfirmed ? { timeConfirmed: true } : {}),
    ...(decision.venueName !== undefined ? { venue: { ...game.venue, name: decision.venueName } } : {}),
  };
}

/**
 * Decide which games gain `venue.name` and `timeConfirmed`, and what the calendars and MaxPreps disagree on.
 *
 * Varsity only (the snapshot is a varsity season). The start time is CONFIRMED, never rewritten:
 * `dateLocal` stays MaxPreps'. When MaxPreps says the time is TBA the calendar's time is reported as
 * a warning rather than written in, because filling it would put an unsourced timestamp in the field
 * the whole site formats from.
 */
export function decideVnn(games: readonly Game[], events: readonly VnnEvent[]): VnnDecisions {
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
  const decisions = new Map<string, VnnDecision>();

  for (const game of games) {
    const key = `${game.dateKey}|${unorderedPairKey(sideJoinKey(game.home), sideJoinKey(game.away))}`;
    const event = byKey.get(key);
    if (!event) continue;
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
    if (!wantVenue && !timeAgrees) continue;
    if (wantVenue) venuesAdded += 1;
    if (timeAgrees) timesConfirmed += 1;
    decisions.set(game.contestId, {
      ...(wantVenue ? { venueName: event.venue as string } : {}),
      ...(timeAgrees ? { timeConfirmed: true as const } : {}),
    });
  }

  const varsity = events.filter((e) => e.level === 'Varsity').length;
  return { decisions, venuesAdded, timesConfirmed, unmatched: Math.max(0, varsity - matched.size), warnings };
}

/** Attach `venue.name` and `timeConfirmed` where MaxPreps has neither: decide, then apply to each game. */
export function applyVnnEvents(
  games: readonly Game[],
  events: readonly VnnEvent[],
): ApplyVnnResult {
  const d = decideVnn(games, events);
  const out = games.map((game) => {
    const decision = d.decisions.get(game.contestId);
    return decision ? applyVnnDecision(game, decision) : game;
  });
  return { games: out, venuesAdded: d.venuesAdded, timesConfirmed: d.timesConfirmed, unmatched: d.unmatched, warnings: d.warnings };
}

// ---------------------------------------------------------------- carry-forward

/** What a game showed from the school calendars the last time it was published: the per-site carry's input. */
export interface VnnPublished {
  venueName?: string;
  venueAddress?: StreetAddress;
  timeConfirmed?: true;
}

/** The venue name, its address and the confirmed start time a published game shows; undefined when it shows none. */
export function vnnPublishedOf(game: Pick<Game, 'venue' | 'timeConfirmed'>): VnnPublished | undefined {
  const out: VnnPublished = {
    ...(game.venue.name ? { venueName: game.venue.name, ...(game.venue.address ? { venueAddress: game.venue.address } : {}) } : {}),
    ...(game.timeConfirmed ? { timeConfirmed: true as const } : {}),
  };
  return Object.keys(out).length > 0 ? out : undefined;
}

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
 * Only ever FILLS A HOLE — a value this run produced always wins. `publishedOf` is what each game showed the last
 * time it was published (lib/claims/sources/vnn.ts reads it from the stored claims).
 */
export function carryVnnPublished(
  missing: readonly TeamSlug[],
  games: readonly Game[],
  publishedOf: (contestId: string) => VnnPublished | undefined,
): { games: Game[]; carried: number } {
  const wanted = new Set<string>(missing);
  if (wanted.size === 0) return { games: [...games], carried: 0 };
  let carried = 0;
  const out = games.map((game) => {
    const touches =
      (game.home.slug !== null && wanted.has(game.home.slug)) ||
      (game.away.slug !== null && wanted.has(game.away.slug));
    if (!touches) return game;
    const prev = publishedOf(game.contestId);
    if (!prev) return game;
    const patch: Partial<Game> = {};
    if (prev.venueName && !game.venue.name) {
      patch.venue = {
        ...game.venue,
        name: prev.venueName,
        ...(prev.venueAddress ? { address: prev.venueAddress } : {}),
      };
    }
    if (prev.timeConfirmed && !game.timeConfirmed) patch.timeConfirmed = true;
    if (Object.keys(patch).length === 0) return game;
    carried += 1;
    return { ...game, ...patch };
  });
  return { games: out, carried };
}

/** carryVnnPublished with what each game showed in `previousGames`, the previous snapshot's list. */
export function carryVnnForward(
  missing: readonly TeamSlug[],
  previousGames: readonly Game[],
  games: readonly Game[],
): { games: Game[]; carried: number } {
  if (missing.length === 0) return { games: [...games], carried: 0 };
  const prevById = new Map(previousGames.map((g) => [g.contestId, g]));
  return carryVnnPublished(missing, games, (id) => {
    const prev = prevById.get(id);
    return prev ? vnnPublishedOf(prev) : undefined;
  });
}
