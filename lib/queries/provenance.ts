/**
 * The snapshot's provenance (SPEC §13.3): its counts, the source requests, the contests the pipeline
 * dropped or superseded, the three cross-checks, the official standings PDF and the CCS calendar.
 */

import { findDivision } from '@/lib/config/leagues';
import { getSnapshot } from '@/lib/datasets/snapshot';
import type { CifssCrossCheck, CrossCheckRow, SbliveCrossCheck } from '@/lib/model/crosscheck';
import type { DroppedContest, SourceKind, SourceStatus } from '@/lib/model/health';
import type { ContestId, LeagueId } from '@/lib/model/ids';
import type { CcsCalendarEvent } from '@/lib/model/postseason';
import type { ContentRemoval, Snapshot } from '@/lib/model/snapshot';
import { getTeamBySlug } from '@/lib/registry/teams';

const snapshot = getSnapshot();

export function getCounts(): Snapshot['counts'] {
  return snapshot.counts;
}

/** The league a team slug, division or league id in a source row's scope belongs to. */
function scopeLeague(scope: SourceStatus['scope']): LeagueId | null {
  if (!scope) return null;
  if (scope.league) return scope.league;
  if (scope.division) return findDivision(scope.division)?.leagueId ?? null;
  if (scope.team) return getTeamBySlug(scope.team)?.league ?? null;
  return null;
}

/** One row per request. `league` keeps rows scoped to that league; `kind` keeps one kind. */
export function getSources(filter: { league?: LeagueId; kind?: SourceKind } = {}): readonly SourceStatus[] {
  if (!filter.league && !filter.kind) return snapshot.sources;
  return snapshot.sources.filter(
    (s) =>
      (!filter.league || scopeLeague(s.scope) === filter.league) &&
      (!filter.kind || s.kind === filter.kind),
  );
}

/** Contests the pipeline removed on purpose, so nothing disappears silently. */
export function getDropped(): readonly DroppedContest[] {
  return snapshot.dropped;
}

/** The MaxPreps STANDINGS comparison (DESIGN §9), optionally for one league. */
export function getCrossCheck(filter: { league?: LeagueId } = {}): readonly CrossCheckRow[] {
  if (!filter.league) return snapshot.crossCheck;
  return snapshot.crossCheck.filter((r) => getTeamBySlug(r.slug)?.league === filter.league);
}

/**
 * The si.com SCORE cross-check. Undefined when the step was skipped. `conflicts` are plain
 * disagreements (MaxPreps stays, D2 rule 5); `sbliveOnlyScored` are si.com scores D2 did NOT
 * publish, with the reason; `backfilled` are the si.com values D2 did publish (rules 2-4).
 */
export function getSbliveCrossCheck(): SbliveCrossCheck | undefined {
  return snapshot.sbliveCrossCheck;
}

/**
 * The cifsshome.org SCORE cross-check (lib/pipeline/reconcile/cifss-crosscheck.ts). Undefined until a run has read it.
 * It never changes a published score: `conflicts` keep MaxPreps' score, and the other two lists are
 * widget scores MaxPreps lacks, none of them published as results.
 */
export function getCifssCrossCheck(): CifssCrossCheck | undefined {
  return snapshot.cifssCrossCheck;
}

/** null until SCVAL publishes a 2026-27 field hockey standings PDF; undefined if never polled. */
export function getOfficialStandingsPdfUrl(): string | null | undefined {
  return snapshot.officialStandingsPdfUrl;
}

/** The CCS iCal events, once the season gate has opened. */
export function getCcsCalendar(): readonly CcsCalendarEvent[] | undefined {
  return snapshot.playoffs.ccsCalendar;
}

/** true when the CCS calendar corroborated every published key date. undefined if not yet polled. */
export function areKeyDatesConfirmed(): boolean | undefined {
  return snapshot.playoffs.keyDatesConfirmed;
}

/** Contests that left a date this season (Snapshot.contentRemovals), for the sitemap's `lastmod`. */
export function getContentRemovals(): readonly ContentRemoval[] {
  return snapshot.contentRemovals ?? [];
}

/** 'sblive:<id>' games a MaxPreps contest has since superseded → that contest (D2 rule 10). */
export function getSupersededGames(): Readonly<Record<ContestId, ContestId>> {
  return snapshot.supersededGames;
}
