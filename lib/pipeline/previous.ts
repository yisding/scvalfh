/**
 * The previous run, as the steps read it (SPEC §7.5, §7.11): the "shown as of" stamps that go into
 * reason sentences, the previous snapshot's per-league and per-division health, and the stamp a
 * carried source was last fresh. Pure functions of the previous snapshot; no ledger, no clock.
 */

import { shortDate, timeOfDay } from '@/lib/format/dates';
import type { DivisionHealth, LeagueHealth, SourceStatus } from '@/lib/model/health';
import type { DivisionId, LeagueId } from '@/lib/model/ids';
import type { Snapshot } from '@/lib/model/snapshot';
import { toLocalTimestamp } from '@/lib/shared/dates';

/** 'Tue Sep 29, 7:02 AM' (Pacific) for an ISO UTC stamp — the "shown as of" stamp in reasons. */
export function asOfStamp(iso: string): string {
  const local = toLocalTimestamp(iso);
  return `${shortDate(local)}, ${timeOfDay(local)}`;
}

/** 'Tue Sep 29' (Pacific) for an ISO UTC stamp. */
export function asOfDay(iso: string): string {
  return shortDate(toLocalTimestamp(iso));
}

export function previousLeagueHealth(previous: Snapshot | null, leagueId: LeagueId): LeagueHealth | null {
  return previous?.leagueHealth.find((h) => h.leagueId === leagueId) ?? null;
}

export function previousDivisionHealth(previous: Snapshot | null, division: DivisionId): DivisionHealth | null {
  for (const h of previous?.leagueHealth ?? []) {
    const d = h.divisions.find((x) => x.divisionId === division);
    if (d) return d;
  }
  return null;
}

/**
 * The previous snapshot holds this league's data: it has a health row whose `lastFreshAt` is set
 * (the league was fresh or partial in some earlier run, and a frozen run carries those rows). A
 * v1-migrated snapshot's BVAL/PCAL/MCAL rows (lastFreshAt null), and the EAL row a pre-EAL v2 file
 * gains on load (lib/snapshot/migrate.ts addConfiguredLeagues, lastFreshAt null), hold nothing to carry.
 */
export function hasPreviousData(previous: Snapshot | null, leagueId: LeagueId): boolean {
  return previousLeagueHealth(previous, leagueId)?.lastFreshAt != null;
}

/**
 * The "shown as of" stamp of a league's previous data (asOfStamp of its lastFreshAt), or null when the
 * previous snapshot holds nothing to carry for it (hasPreviousData).
 */
export function lastFreshStamp(previous: Snapshot | null, leagueId: LeagueId): string | null {
  const lastFresh = previousLeagueHealth(previous, leagueId)?.lastFreshAt ?? null;
  return lastFresh === null ? null : asOfStamp(lastFresh);
}

/** When a carried source's data was last fresh: the previous row's own stamp, else the previous run's. */
export function carriedFromOf(previous: Snapshot | null, pick: (row: SourceStatus) => boolean): string | undefined {
  if (!previous) return undefined;
  const prev = previous.sources.find(pick);
  if (prev?.status === 'ok') return prev.fetchedAt;
  if (prev?.carriedFrom) return prev.carriedFrom;
  return previous.fetchedAt;
}
