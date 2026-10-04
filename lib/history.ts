/**
 * The read API for data/history-2025-26.json — the prior-season archive (DESIGN §3.9).
 *
 * Why this is a separate file and not part of the snapshot: the 2025-26 standings exist ONLY in each
 * league's own end-of-season documents (SCVAL's two PDFs, BVAL's Google Sheet and all-league
 * documents; for PCAL, MCAL and EAL we found no official final standings, so they are marked
 * 'unavailable' with the reason, never filled from a third party). MaxPreps cannot serve a prior season at all — the year segment of
 * a league URL is cosmetic and always returns the CURRENT table (SPEC §1.1h) — so the daily cron has
 * nothing to fetch and this file is committed, built once by `scripts/build-history.ts`.
 *
 * Loaded and validated once at module scope, like lib/data.ts (and bundled at build time the same
 * way), so a bad file fails at import time rather than half-way through a render.
 */

import { readFileSync } from 'node:fs';

import { z } from 'zod';
import bundledHistory from '../data/history-2025-26.json';
import { LEAGUE_IDS, divisionsOf, getLeague } from './leagues';
import { getTeamBySlug, teamsInLeague } from './teams';
import type { DivisionId, LeagueId, TeamSlug } from './types';

const id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

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
  const teamSlug = id.refine((slug) => slugs.has(slug), `not a registry slug of league ${leagueId}`);
  const division = id.refine((d) => divisions.has(d), `not a division of league ${leagueId}`);

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
          retrievedOn: isoDate,
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
    checkedOn: isoDate,
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
export type History = { season: string; sport: string; leagues: Record<string, LeagueHistory> };
export type HistoryLevel = 'varsity' | 'jv';

/**
 * data/history-2025-26.json is imported, so the build bundles it, for the reason given in
 * lib/data.ts: a Worker has no project filesystem, and this module loads on the first
 * /history/2025-26 request in every Worker instance, cached page or not (the route's modules load
 * before the cache read). A missing file is a build error: run `pnpm build-history`. SCVAL_HISTORY
 * still swaps in another file through node:fs (Node only; never set it on a Worker).
 */
function load(): History {
  const override = process.env.SCVAL_HISTORY;
  let raw: unknown = bundledHistory;
  if (override) {
    let text: string;
    try {
      text = readFileSync(override, 'utf8');
    } catch (err) {
      throw new Error(
        `lib/history.ts: cannot read SCVAL_HISTORY=${override} (${(err as Error).message})`,
      );
    }
    raw = JSON.parse(text) as unknown;
  }
  const parsed = HistorySchema.safeParse(raw);
  if (!parsed.success) {
    const lines = parsed.error.issues
      .slice(0, 10)
      .map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new Error(`history failed validation:\n${lines.join('\n')}`);
  }
  return parsed.data as History;
}

const history = load();

export function getHistory(): History {
  return history;
}

export function getHistorySeason(): string {
  return history.season;
}

/** Every league's entry, in lib/leagues.ts order (SCVAL, BVAL, PCAL, MCAL, EAL). */
export function getHistoryLeagues(): Array<{ id: LeagueId; entry: LeagueHistory }> {
  return LEAGUE_IDS.map((leagueId) => ({ id: leagueId, entry: history.leagues[leagueId] }));
}

export function getHistoryLeague(leagueId: LeagueId): LeagueHistory | undefined {
  return history.leagues[leagueId];
}

/** The leagues that have final standings, in config order. */
export function getAvailableHistoryLeagues(): Array<{ id: LeagueId; entry: AvailableLeagueHistory }> {
  return getHistoryLeagues().filter(
    (x): x is { id: LeagueId; entry: AvailableLeagueHistory } => x.entry.status === 'available',
  );
}

/** The leagues marked unavailable, in config order. */
export function getUnavailableHistoryLeagues(): Array<{ id: LeagueId; entry: UnavailableLeagueHistory }> {
  return getHistoryLeagues().filter(
    (x): x is { id: LeagueId; entry: UnavailableLeagueHistory } => x.entry.status === 'unavailable',
  );
}

export function hasHistory(leagueId: LeagueId): boolean {
  return history.leagues[leagueId]?.status === 'available';
}

/** The source credit of an available league (SCVAL's two PDFs, BVAL's sheet and documents). */
export function getHistoryProvenance(leagueId: LeagueId): AvailableLeagueHistory['provenance'] | null {
  const entry = history.leagues[leagueId];
  return entry?.status === 'available' ? entry.provenance : null;
}

function divisionEntry(division: DivisionId): HistoryDivision | undefined {
  for (const { entry } of getAvailableHistoryLeagues()) {
    const found = entry.divisions.find((d) => d.division === division);
    if (found) return found;
  }
  return undefined;
}

export function getHistoryStandings(division: DivisionId, level: HistoryLevel = 'varsity'): HistoryRow[] {
  return divisionEntry(division)?.standings[level] ?? [];
}

export function getHistoryAwards(
  division: DivisionId,
  level: HistoryLevel = 'varsity',
): HistoryAwards | null {
  return divisionEntry(division)?.awards[level] ?? null;
}

/** Every 2025-26 row for one school, across divisions and levels. */
export function getHistoryFor(slug: TeamSlug): Array<{
  division: DivisionId;
  level: HistoryLevel;
  row: HistoryRow;
}> {
  const out: Array<{ division: DivisionId; level: HistoryLevel; row: HistoryRow }> = [];
  for (const { entry } of getAvailableHistoryLeagues()) {
    for (const d of entry.divisions) {
      for (const level of ['varsity', 'jv'] as const) {
        const row = d.standings[level].find((r) => r.slug === slug);
        if (row) out.push({ division: d.division, level, row });
      }
    }
  }
  return out;
}

/** One league's first-place varsity rows, for a one-line archive summary. */
export function getHistoryChampions(leagueId: LeagueId): Array<{ division: DivisionId; row: HistoryRow }> {
  const entry = history.leagues[leagueId];
  if (entry?.status !== 'available') return [];
  return entry.divisions
    .map((d) => ({ division: d.division, row: d.standings.varsity[0] }))
    .filter((x): x is { division: DivisionId; row: HistoryRow } => !!x.row);
}

/**
 * Teams whose 2025-26 division (as the source printed it) is not the division the registry lists
 * today (the 2026-27 alignment), e.g. Leland: Santa Teresa in the 2025-26 sheet, Mt. Hamilton in
 * the registry. The history keeps the source's division; the page says that the team moved.
 */
export function getHistoryDivisionChanges(
  leagueId: LeagueId,
): Array<{ slug: TeamSlug; name: string; historyDivision: DivisionId; registryDivision: DivisionId }> {
  const entry = history.leagues[leagueId];
  if (entry?.status !== 'available') return [];
  const out: Array<{ slug: TeamSlug; name: string; historyDivision: DivisionId; registryDivision: DivisionId }> = [];
  for (const d of entry.divisions) {
    for (const r of d.standings.varsity) {
      const team = r.slug ? getTeamBySlug(r.slug) : undefined;
      if (r.slug && team && team.division !== d.division) {
        out.push({ slug: r.slug, name: r.name, historyDivision: d.division, registryDivision: team.division });
      }
    }
  }
  return out;
}

/** Varsity rows whose source record has no ties field (`t` is null), by division. */
export function getHistoryUnpublishedTies(leagueId: LeagueId): HistoryRow[] {
  const entry = history.leagues[leagueId];
  if (entry?.status !== 'available') return [];
  return entry.divisions.flatMap((d) => d.standings.varsity.filter((r) => r.t === null));
}
