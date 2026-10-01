/**
 * The read API for data/history-2025-26.json — the prior-season archive (DESIGN §3.9).
 *
 * Why this is a separate file and not part of the snapshot: the 2025-26 standings exist ONLY in
 * scval.com's end-of-season PDFs. MaxPreps cannot serve a prior season at all — the year segment of
 * a league URL is cosmetic and always returns the CURRENT table (SPEC §1.1h) — so the daily cron has
 * nothing to fetch and this file is committed, built once by `scripts/build-history.ts`.
 *
 * Loaded and validated once at module scope, like lib/data.ts, so a bad file fails at import time
 * rather than half-way through a render.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { z } from 'zod';
import type { Division, TeamSlug } from './types';

const teamSlug = z.enum([
  'cupertino', 'fremont', 'homestead', 'los-altos', 'saint-francis',
  'st-ignatius', 'valley-christian', 'wilcox',
  'los-gatos', 'lynbrook', 'mitty', 'monta-vista',
  'palo-alto', 'presentation', 'santa-clara', 'saratoga',
]);

const HistoryRowSchema = z.object({
  /** The PDF's own "SCHOOL by finish" order. Not a recomputed ranking. */
  place: z.number().int().min(1),
  /** Verbatim PDF spelling, e.g. "St. Francis" where MaxPreps says "Saint Francis". */
  name: z.string().min(1),
  slug: teamSlug.nullable(),
  leagueRecord: z.string().regex(/^\d+-\d+(-\d+)?$/),
  w: z.number().int().min(0),
  l: z.number().int().min(0),
  t: z.number().int().min(0),
  /** Always null: that PDF column is empty in the 2025-26 file. */
  overallRecord: z.null(),
});

const HistoryPlayerSchema = z.object({
  player: z.string().min(1),
  school: z.string().min(1),
  slug: teamSlug.nullable(),
  position: z.string(),
  year: z.number().int().min(9).max(12),
});

const HistoryAwardsSchema = z.object({
  division: z.enum(['de-anza', 'el-camino']),
  level: z.enum(['varsity', 'jv']),
  /** `value` is the PDF's right-hand side VERBATIM — the three divisions write it differently. */
  overall: z.array(z.object({ award: z.string().min(1), value: z.string().min(1) })),
  firstTeam: z.array(HistoryPlayerSchema),
  secondTeam: z.array(HistoryPlayerSchema),
  honorableMention: z.array(HistoryPlayerSchema),
});

export const HistorySchema = z
  .object({
    season: z.string(),
    sport: z.string(),
    league: z.string(),
    provenance: z.object({
      source: z.literal('scval-pdf'),
      builtBy: z.string(),
      standingsPdf: z.string().url(),
      allLeaguePdf: z.string().url(),
      extraction: z.string(),
      notes: z.array(z.string()),
    }),
    divisions: z.array(
      z.object({
        division: z.enum(['de-anza', 'el-camino']),
        label: z.string(),
        standings: z.object({
          varsity: z.array(HistoryRowSchema),
          jv: z.array(HistoryRowSchema),
        }),
        awards: z.object({
          varsity: HistoryAwardsSchema.nullable(),
          jv: HistoryAwardsSchema.nullable(),
        }),
      }),
    ),
  })
  .refine((h) => h.divisions.length === 2, 'expected both divisions')
  // Places must be 1..n with no gaps, or the table would render a hole.
  .refine(
    (h) =>
      h.divisions.every((d) =>
        [d.standings.varsity, d.standings.jv].every((rows) =>
          rows.every((r, i) => r.place === i + 1),
        ),
      ),
    'standings places are not 1..n in order',
  );

export type HistoryRow = z.infer<typeof HistoryRowSchema>;
export type HistoryPlayer = z.infer<typeof HistoryPlayerSchema>;
export type HistoryAwards = z.infer<typeof HistoryAwardsSchema>;
export type History = z.infer<typeof HistorySchema>;
export type HistoryLevel = 'varsity' | 'jv';

/** Overridable so a test can point at another file. */
export const HISTORY_PATH =
  process.env.SCVAL_HISTORY ?? path.join(process.cwd(), 'data', 'history-2025-26.json');

/**
 * Same shape as `lib/data.ts`'s reader, and for the same reason: a single variable path makes the
 * read opaque to Turbopack's file tracing, which then traces the whole project into the server
 * bundle. The default branch is a literal `path.join(process.cwd(), …)`; the env override is its
 * own call.
 */
function readHistoryFile(): string {
  const override = process.env.SCVAL_HISTORY;
  if (override) return readFileSync(override, 'utf8');
  return readFileSync(path.join(process.cwd(), 'data', 'history-2025-26.json'), 'utf8');
}

function load(): History {
  let raw: string;
  try {
    raw = readHistoryFile();
  } catch (err) {
    throw new Error(
      `lib/history.ts: cannot read ${HISTORY_PATH} — run \`pnpm exec tsx scripts/build-history.ts\` ` +
        `(${(err as Error).message})`,
    );
  }
  const parsed = HistorySchema.safeParse(JSON.parse(raw) as unknown);
  if (!parsed.success) {
    const lines = parsed.error.issues
      .slice(0, 10)
      .map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new Error(`history failed validation:\n${lines.join('\n')}`);
  }
  return parsed.data;
}

const history = load();

export function getHistory(): History {
  return history;
}

export function getHistorySeason(): string {
  return history.season;
}

/** The two source PDFs, so /history/2025-26 can credit scval.com beside the global attribution. */
export function getHistorySources(): { standingsPdf: string; allLeaguePdf: string } {
  return {
    standingsPdf: history.provenance.standingsPdf,
    allLeaguePdf: history.provenance.allLeaguePdf,
  };
}

export function getHistoryStandings(division: Division, level: HistoryLevel = 'varsity'): HistoryRow[] {
  const entry = history.divisions.find((d) => d.division === division);
  return entry ? entry.standings[level] : [];
}

export function getHistoryAwards(
  division: Division,
  level: HistoryLevel = 'varsity',
): HistoryAwards | null {
  return history.divisions.find((d) => d.division === division)?.awards[level] ?? null;
}

/** Every 2025-26 row for one school, across divisions and levels. */
export function getHistoryFor(slug: TeamSlug): Array<{
  division: Division;
  level: HistoryLevel;
  row: HistoryRow;
}> {
  const out: Array<{ division: Division; level: HistoryLevel; row: HistoryRow }> = [];
  for (const d of history.divisions) {
    for (const level of ['varsity', 'jv'] as const) {
      const row = d.standings[level].find((r) => r.slug === slug);
      if (row) out.push({ division: d.division, level, row });
    }
  }
  return out;
}

/** The champions, for a one-line archive summary. */
export function getHistoryChampions(): Array<{ division: Division; row: HistoryRow }> {
  return history.divisions
    .map((d) => ({ division: d.division, row: d.standings.varsity[0] }))
    .filter((x): x is { division: Division; row: HistoryRow } => !!x.row);
}
