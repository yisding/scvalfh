/**
 * The round a postseason game's own row names, read from MaxPreps' `contest.location` (`Game.venue.text`),
 * for a tournament that publishes no bracket: the EAL Super Regional. Pure, no imports.
 *
 * Why the location field: the Northern Section posts no pairings, and MaxPreps' 2025 Super Regional rows
 * (2025-11-01, entered the day after) carried the round only there — "Semi Final" (`5064685d`) and
 * "Championship Final" (`6d66e88f`, Davis 2-1 Chico in OT) — with an empty-GUID `tournamentId` and every
 * bracket field null (docs/DATA-SOURCES.md §1.4, read 2026-10-29 from a real Davis schedule capture). The
 * field is a NOTE field, not a venue field ("Senior Night", "SCVAL Crossover Game", "Too be rescheduled"),
 * so anything that does not name a round reads as null and the caller falls back to the date.
 *
 * Order matters: "Semi Final" and "Quarter Final" are tested before the bare final, so a semifinal is never
 * read as the final; a third-place or consolation game is tested before the final too ("Consolation Final").
 */

export type LocationRound = 'quarterfinal' | 'semifinal' | 'final' | 'third-place';

const ROUND_PATTERNS: ReadonlyArray<readonly [LocationRound, RegExp]> = [
  ['semifinal', /semi ?-?final/i],
  ['quarterfinal', /quarter ?-?final/i],
  ['third-place', /third|consolation/i],
  ['final', /championship|^final\b/i],
];

/** 'semifinal' for "Semi Final", 'final' for "Championship Final" or "Final", null for "Senior Night" or null. */
export function roundFromLocation(text: string | null | undefined): LocationRound | null {
  const value = text?.trim();
  if (!value) return null;
  for (const [round, pattern] of ROUND_PATTERNS) {
    if (pattern.test(value)) return round;
  }
  return null;
}

/**
 * The round as a reader's word, lower case, after a tournament's name ('EAL Super Regional semifinal'): the
 * game page's kicker and the "This week" strip's label say it the same way.
 */
export const LOCATION_ROUND_WORD: Readonly<Record<LocationRound, string>> = {
  quarterfinal: 'quarterfinal',
  semifinal: 'semifinal',
  final: 'final',
  'third-place': 'third-place game',
};

/** The same round as a day heading ('Semifinals', 'Final', 'Third-place game'), as the EAL card labels a day. */
export const LOCATION_ROUND_HEADING: Readonly<Record<LocationRound, string>> = {
  quarterfinal: 'Quarterfinals',
  semifinal: 'Semifinals',
  final: 'Final',
  'third-place': 'Third-place game',
};

/**
 * A tournament's label with the round its row names, when it names one: 'EAL Super Regional' + "Semi Final" →
 * 'EAL Super Regional semifinal'; "Senior Night" or no location → the label alone. The game page's kicker
 * (components/game/game-view.ts) and /playoffs' "This week" strip both call it, so they never disagree.
 */
export function withLocationRound(label: string, text: string | null | undefined): string {
  const round = roundFromLocation(text);
  return round ? `${label} ${LOCATION_ROUND_WORD[round]}` : label;
}
