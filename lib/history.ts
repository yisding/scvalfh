/**
 * The read API for data/history-2025-26.json — the prior-season archive (DESIGN §3.9), validated
 * against lib/history-schema.ts.
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

import bundledHistory from '../data/history-2025-26.json';
import {
  HistorySchema,
  type AvailableLeagueHistory,
  type History,
  type HistoryAwards,
  type HistoryDivision,
  type HistoryLevel,
  type HistoryRow,
  type LeagueHistory,
  type UnavailableLeagueHistory,
} from './history-schema';
import { LEAGUE_IDS } from './leagues';
import { failValidation } from './schema-primitives';
import { getTeamBySlug } from './teams';
import type { DivisionId, LeagueId, TeamSlug } from './types';

export type {
  AvailableLeagueHistory,
  History,
  HistoryAwards,
  HistoryDivision,
  HistoryLevel,
  HistoryPlayer,
  HistoryRow,
  LeagueHistory,
  UnavailableLeagueHistory,
} from './history-schema';

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
  if (!parsed.success) failValidation('history', parsed.error.issues);
  return parsed.data;
}

const history = load();

export function getHistorySeason(): string {
  return history.season;
}

/** Every league's entry, in lib/leagues.ts order (SCVAL, BVAL, PCAL, MCAL, EAL). */
export function getHistoryLeagues(): Array<{ id: LeagueId; entry: LeagueHistory }> {
  return LEAGUE_IDS.map((leagueId) => ({ id: leagueId, entry: history.leagues[leagueId] }));
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
