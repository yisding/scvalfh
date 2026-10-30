/**
 * The Zod contract for data/sds-brackets-2026.json — the San Diego Section's 2026 field hockey brackets,
 * transcribed by hand from the Section's published bracket sheet (the "2026 CIFSDS Field Hockey
 * Championships" Google Sheet its field hockey page links after the Sat Oct 31 seeding meeting), so
 * lib/sds-bracket.ts can draw the three brackets and join them to MaxPreps' results.
 *
 * Why a hand-entered file (decided 2026-10-29, plan final-07): the 2026 sheet's id is unknown until the
 * Section publishes it, its layout is inferred from 2025's, and docs.google.com has never been read from
 * the Actions runner, so there is no parser; MaxPreps' 2026 Section tournament is an empty shell that never
 * published in 2025. The owner copies the placed teams in once (about 20 minutes) and runs `pnpm test`
 * before committing. Until then the file is the placeholder `{ season, retrievedOn: null, source: null,
 * divisions: [] }` and the site draws no San Diego bracket (lib/sds-bracket.ts getSdsBrackets is null).
 *
 * What this contract guards is the same as lib/history-brackets-schema.ts's: a slip cannot reach the page.
 * Every school is a registry team of a San Diego league, appears once in the whole file, and fills one
 * numbered place in a field of the size lib/leagues.ts gives (Open 8, Division I 12, Division II 12; Green
 * Book 2026-27 Bylaw 2000.1); a play-in fills exactly one place of a 12-team field; the rounds are the
 * template's count and fall in date order inside the playoffs' published dates (the league config's `dates`);
 * and every Open Division team is a Division I team on the Section's 2026 Divisions sheet (the Green Book's
 * division-placement bylaw draws the Open Division from Division I).
 *
 * The round dates live here, not in code: they default to the San Diego Field Hockey Officials
 * Association's calendar, and the owner edits them when the Section's sheet differs (in 2025 the Division II
 * play-in was Mon Nov 3 and its first round Thu Nov 5, a day later than the calendar pattern).
 *
 * Copy: nothing in this file is printed as a "seed". The numbers are the Section's places, printed bare
 * ("Torrey Pines (1)"); the word itself stays banned on San Diego surfaces (scripts/copy-rules.ts SEED_CLAIM).
 */

import { z } from 'zod';

import { LEAGUE_IDS, getLeague } from './leagues';
import { dateKey, httpsUrl, slugId } from './schema-primitives';
import { teamsInLeague } from './teams';
import type { LeagueId, TeamSlug } from './types';

/** The three division ids, in the order the file lists them (the config's `divisions` order). */
export const SDS_DIVISION_IDS = ['open', 'division-1', 'division-2'] as const;
export type SdsDivisionId = (typeof SDS_DIVISION_IDS)[number];

/** The two field sizes the Section draws (Green Book 2026-27 Bylaw 2000.1: Open 8, Divisions I and II 12). */
export const SDS_FIELD_SIZES = [8, 12] as const;

/** The San Diego leagues: every league whose postseason is the Section's playoffs. */
function sdsLeagueIds(): LeagueId[] {
  return LEAGUE_IDS.filter((l) => getLeague(l).postseason.kind === 'section-playoffs');
}

/** The section-playoffs config every San Diego league shares (lib/leagues.ts sdsPostseason builds one per league). */
function sdsPostseasonConfig() {
  const ps = getLeague(sdsLeagueIds()[0]).postseason;
  if (ps.kind !== 'section-playoffs') throw new Error('no section-playoffs league');
  return ps;
}

/** Every San Diego member's 2026 playoff division, 'I' or 'II' (the Section's Divisions sheet, 2025-12-23). */
function playoffDivisions(): ReadonlyMap<TeamSlug, 'I' | 'II'> {
  const out = new Map<TeamSlug, 'I' | 'II'>();
  for (const id of sdsLeagueIds()) {
    const ps = getLeague(id).postseason;
    if (ps.kind !== 'section-playoffs') continue;
    for (const [slug, div] of Object.entries(ps.playoffDivisionOf)) out.set(slug, div);
  }
  return out;
}

/** The playoffs' published dates, inclusive, from the league config (Nov 2–14 in 2026). */
export function sdsPlayoffWindow(): { first: string; last: string } {
  return { ...sdsPostseasonConfig().dates };
}

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * The file's schema for a playoffs window. The committed file is checked against the config's window
 * (SdsBracketsSchema); tests/fixtures/sds/brackets-2025.ts passes 2025's (Nov 2–15) to check last season's
 * brackets in the same shape.
 */
export function sdsBracketsSchema(window: { first: string; last: string }) {
  const registry: ReadonlySet<string> = new Set(sdsLeagueIds().flatMap((l) => teamsInLeague(l).map((t) => t.slug)));
  const divisionOf = playoffDivisions();
  const configSizes = sdsPostseasonConfig().divisions.map((d) => d.teams);
  const inWindow = (d: string) => d >= window.first && d <= window.last;

  const teamSlug = slugId.refine((slug) => registry.has(slug), 'not a registry slug of a San Diego league');

  const round = z.object({
    /** The sheet's round name ("First round", "Quarterfinals", "Semifinals", "Final"). */
    name: z.string().min(1),
    date: dateKey,
    /** A league clock time, 'HH:MM', where the Section publishes one (the finals). */
    time: z.string().regex(CLOCK, 'expected HH:MM').optional(),
    /** The neutral site, where the Section names one (La Jolla High School for the finals). */
    site: z.string().min(1).optional(),
  });

  const division = z
    .object({
      id: z.enum(SDS_DIVISION_IDS),
      label: z.string().min(1),
      size: z.union([z.literal(SDS_FIELD_SIZES[0]), z.literal(SDS_FIELD_SIZES[1])]),
      /** A play-in for one numbered place of a 12-team field; `home` hosts (the sheet's first-named team). */
      playIn: z
        .object({
          date: dateKey,
          forSeed: z.union([z.literal(11), z.literal(12)]),
          home: teamSlug,
          away: teamSlug,
        })
        .refine((p) => p.home !== p.away, 'a play-in team plays itself')
        .optional(),
      rounds: z.array(round).min(1),
      /** The placed teams, 1..size in order; a play-in's place is left out (its two teams are in `playIn`). */
      seeds: z.array(z.object({ seed: z.number().int().min(1).max(12), slug: teamSlug })),
    })
    .refine((d) => d.rounds.length === (d.size === 8 ? 3 : 4), {
      message: 'an 8-team bracket has 3 rounds and a 12-team bracket 4',
      path: ['rounds'],
    })
    .refine((d) => d.playIn === undefined || d.size === 12, {
      message: 'a play-in belongs to a 12-team bracket',
      path: ['playIn'],
    })
    .refine(
      (d) => {
        const expected = Array.from({ length: d.size }, (_, i) => i + 1).filter((n) => n !== d.playIn?.forSeed);
        return d.seeds.length === expected.length && d.seeds.every((s, i) => s.seed === expected[i]);
      },
      { message: 'the places are not 1..size in order (less the play-in place)', path: ['seeds'] },
    )
    .refine(
      (d) => {
        const slugs = [...d.seeds.map((s) => s.slug), ...(d.playIn ? [d.playIn.home, d.playIn.away] : [])];
        return new Set(slugs).size === slugs.length;
      },
      { message: 'a team is placed twice (or a play-in team is also placed)', path: ['seeds'] },
    )
    .refine(
      (d) => {
        const dates = [...(d.playIn ? [d.playIn.date] : []), ...d.rounds.map((r) => r.date)];
        return dates.every((x, i) => inWindow(x) && (i === 0 || x > dates[i - 1]));
      },
      { message: `round dates are not increasing inside ${window.first}..${window.last}`, path: ['rounds'] },
    )
    .refine((d) => d.id !== 'open' || d.seeds.every((s) => divisionOf.get(s.slug) === 'I'), {
      message: 'an Open Division team is not a Division I team on the Section’s Divisions sheet',
      path: ['seeds'],
    });

  return z
    .object({
      season: z.string().regex(/^\d{4}-\d{2}$/, 'expected YYYY-YY'),
      /** The day the owner read the Section's sheet; null on the placeholder. */
      retrievedOn: dateKey.nullable(),
      /** The Section's sheet, linked as the source; null on the placeholder. */
      source: z.object({ label: z.string().min(1), url: httpsUrl }).nullable(),
      /** `[]` (the placeholder: nothing published) or the three divisions in order. */
      divisions: z.array(division),
    })
    .refine(
      (f) =>
        f.divisions.length === 0 ||
        (f.divisions.length === SDS_DIVISION_IDS.length && f.divisions.every((d, i) => d.id === SDS_DIVISION_IDS[i])),
      { message: 'divisions are [] or open, division-1, division-2 in that order', path: ['divisions'] },
    )
    .refine((f) => f.divisions.every((d, i) => d.size === configSizes[i]), {
      message: 'a field size disagrees with lib/leagues.ts (Open 8, Division I 12, Division II 12)',
      path: ['divisions'],
    })
    .refine(
      (f) => {
        const slugs = f.divisions.flatMap((d) => [
          ...d.seeds.map((s) => s.slug),
          ...(d.playIn ? [d.playIn.home, d.playIn.away] : []),
        ]);
        return new Set(slugs).size === slugs.length;
      },
      { message: 'a team is placed in two divisions', path: ['divisions'] },
    )
    .refine((f) => f.divisions.length === 0 || (f.retrievedOn !== null && f.source !== null), {
      message: 'a filled file names its source and the day it was read',
      path: ['source'],
    });
}

/** The committed file's schema: the config's playoffs window. */
export const SdsBracketsSchema = sdsBracketsSchema(sdsPlayoffWindow());

export type SdsBracketsFile = z.infer<typeof SdsBracketsSchema>;
export type SdsBracketsDivision = SdsBracketsFile['divisions'][number];
export type SdsBracketsRound = SdsBracketsDivision['rounds'][number];
export type SdsPlayIn = NonNullable<SdsBracketsDivision['playIn']>;
