/**
 * The Zod contract for data/history-2025-26.json — the prior-season archive (DESIGN §3.9): every
 * league of lib/leagues.ts with its final standings and awards from an official source, or the
 * reason it has none.
 *
 * Separate from lib/history.ts (the read API, which imports and validates the file at module
 * scope) so scripts/build-history.ts can validate the file it is about to write without importing
 * the one it is about to overwrite — the same split as lib/rosters-schema.ts / lib/rosters.ts.
 */

import { z } from 'zod';

import { LEAGUE_IDS, divisionsOf, getLeague } from './leagues';
import { dateKey, slugId } from './schema-primitives';
import { teamsInLeague } from './teams';
import type { LeagueId } from './types';

/**
 * The archive is league-aware: every league of lib/leagues.ts has an entry, and each entry is
 * validated against ITS league's registry (slugs) and divisions. A league either has final
 * standings from an official source ('available') or says, with the reason, that it has none
 * ('unavailable'). There is no third state: a league missing from the file fails validation, so a
 * league cannot silently drop off the page.
 */
function leagueSchema(leagueId: LeagueId) {
  const slugs: ReadonlySet<string> = new Set(teamsInLeague(leagueId).map((t) => t.slug));
  const divisions: ReadonlySet<string> = new Set(divisionsOf(leagueId).map((d) => d.id));
  const teamSlug = slugId.refine((slug) => slugs.has(slug), `not a registry slug of league ${leagueId}`);
  const division = slugId.refine((d) => divisions.has(d), `not a division of league ${leagueId}`);

  const row = z
    .object({
      /** The source's own finish order ("SCHOOL by finish" / the sheet's "Place"). Never recomputed. */
      place: z.number().int().min(1),
      /** Verbatim source spelling, e.g. "St. Francis" where MaxPreps says "Saint Francis". */
      name: z.string().min(1),
      slug: teamSlug.nullable(),
      leagueRecord: z.string().regex(/^\d+-\d+(-\d+)?$/),
      w: z.number().int().min(0),
      l: z.number().int().min(0),
      /** null = the source printed no ties field (BVAL's Sobrato "4-6"): unpublished, not 0. */
      t: z.number().int().min(0).nullable(),
      /** The overall record as published, or null when the source has none (SCVAL's column is empty). */
      overallRecord: z
        .string()
        .regex(/^\d+-\d+(-\d+)?$/)
        .nullable(),
    })
    .refine(
      (r) =>
        r.leagueRecord === (r.t === null ? `${r.w}-${r.l}` : `${r.w}-${r.l}-${r.t}`) ||
        // SCVAL's parser has always stored a two-part PDF record ("2-10") with t: 0. That file is
        // unchanged; every other league must say null for a record with no ties field.
        (leagueId === 'scval' && r.t === 0 && r.leagueRecord === `${r.w}-${r.l}`),
      'leagueRecord does not match w/l/t',
    );

  const player = z.object({
    player: z.string().min(1),
    school: z.string().min(1),
    slug: teamSlug.nullable(),
    /** null = the source left the cell empty. */
    position: z.string().nullable(),
    year: z.number().int().min(9).max(12),
  });

  const awards = z.object({
    division,
    level: z.enum(['varsity', 'jv']),
    /** `value` is the source's right-hand side as written; the documents write it differently. */
    overall: z.array(z.object({ award: z.string().min(1), value: z.string().min(1) })),
    firstTeam: z.array(player),
    secondTeam: z.array(player),
    honorableMention: z.array(player),
  });

  const available = z
    .object({
      status: z.literal('available'),
      league: z.string(),
      provenance: z.discriminatedUnion('source', [
        z.object({
          source: z.literal('scval-pdf'),
          builtBy: z.string(),
          standingsPdf: z.string().url(),
          allLeaguePdf: z.string().url(),
          extraction: z.string(),
          notes: z.array(z.string()),
        }),
        z.object({
          source: z.literal('bval-sheet'),
          builtBy: z.string(),
          /** The official Google Sheet of final standings (the CSV export is what the build reads). */
          standingsSheet: z.string().url(),
          /** The same sheet as a reader opens it: what the page links. */
          standingsSheetView: z.string().url(),
          /** The bval.org page that links it. */
          standingsIndex: z.string().url(),
          /** division -> the official all-league document, or null when there is none. */
          allLeagueDocs: z.record(division, z.string().url().nullable()),
          /** The day the sheet and documents were read. */
          retrievedOn: dateKey,
          extraction: z.string(),
          notes: z.array(z.string()),
        }),
      ]),
      divisions: z.array(
        z.object({
          division,
          label: z.string(),
          standings: z.object({ varsity: z.array(row), jv: z.array(row) }),
          awards: z.object({ varsity: awards.nullable(), jv: awards.nullable() }),
        }),
      ),
    })
    .refine(
      (h) => h.divisions.length === divisions.size && new Set(h.divisions.map((d) => d.division)).size === divisions.size,
      `expected each of the ${divisions.size} division(s) of ${leagueId} exactly once`,
    )
    // Places must be 1..n with no gaps, or the table would render a hole.
    .refine(
      (h) =>
        h.divisions.every((d) =>
          [d.standings.varsity, d.standings.jv].every((rows) => rows.every((r, i) => r.place === i + 1)),
        ),
      'standings places are not 1..n in order',
    )
    .refine(
      (h) => h.divisions.every((d) => d.standings.varsity.length > 0),
      'an available league needs varsity standings in every division',
    );

  const unavailable = z.object({
    status: z.literal('unavailable'),
    league: z.string(),
    /** Why there is nothing to show, in words a reader can be given. */
    reason: z.string().min(20),
    /** The day we last looked. */
    checkedOn: dateKey,
    /** What we looked at, so the claim is checkable. */
    checked: z.array(z.string().min(1)).min(1),
    /**
     * Official documents the league did publish for the season that are not final standings (MCAL's
     * 2025 all-league team). The page links them from the card; nothing in them is stored, since
     * there is no awards-only state: an entry is either a league's final standings or unavailable.
     */
    alsoPublished: z.array(z.object({ label: z.string().min(1), url: z.string().url() })).optional(),
  });

  return z.discriminatedUnion('status', [available, unavailable]);
}

const leagueShape = Object.fromEntries(LEAGUE_IDS.map((l) => [l, leagueSchema(l)])) as Record<
  string,
  ReturnType<typeof leagueSchema>
>;

export const HistorySchema = z
  .object({
    season: z.string(),
    sport: z.string(),
    leagues: z.object(leagueShape).strict(),
  })
  .refine(
    (h) =>
      LEAGUE_IDS.every((l) => {
        const entry = (h.leagues as Record<string, { league: string }>)[l];
        return entry?.league === getLeague(l).name;
      }),
    'a league entry is not named after its registry league',
  );

type LeagueEntry = z.infer<ReturnType<typeof leagueSchema>>;
export type AvailableLeagueHistory = Extract<LeagueEntry, { status: 'available' }>;
export type UnavailableLeagueHistory = Extract<LeagueEntry, { status: 'unavailable' }>;
export type LeagueHistory = AvailableLeagueHistory | UnavailableLeagueHistory;
export type HistoryDivision = AvailableLeagueHistory['divisions'][number];
export type HistoryRow = HistoryDivision['standings']['varsity'][number];
export type HistoryAwards = NonNullable<HistoryDivision['awards']['varsity']>;
export type HistoryPlayer = HistoryAwards['firstTeam'][number];
export type History = z.infer<typeof HistorySchema>;
export type HistoryLevel = 'varsity' | 'jv';
