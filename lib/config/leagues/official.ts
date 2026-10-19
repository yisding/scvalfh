/**
 * A part of the league configuration package (lib/config/leagues.ts is its door; SPEC §2, §7.8).
 * This file (public): a division's official schedule document as the configuration states it (the
 * 'live-pdf' and 'bundled' arms of `DivisionConfig.official`), and the lookups the official-fixture
 * readers, the bundle loader and the build script share. Built on the door's lookups, so it imports the
 * door; the door never imports it.
 */

import { getDivision, getLeague } from '@/lib/config/leagues';
import type { DivisionId, LeagueId } from '@/lib/model/ids';
import type { DivisionConfig } from '@/lib/model/league-config';


/** A division's own schedule document: the 'live-pdf' and 'bundled' arm of `DivisionConfig.official`. */
export type OfficialDocumentConfig = Extract<DivisionConfig['official'], { mode: 'live-pdf' | 'bundled' }>;

/** A division whose league publishes a schedule document (every division but a mode-'none' one: EAL). */
export type DocumentDivision = DivisionConfig & { official: OfficialDocumentConfig };

/** True when the division has a schedule document; false for official mode 'none' (no fixtures exist). */
export function hasOfficialDocument(d: DivisionConfig): d is DocumentDivision {
  return d.official.mode !== 'none';
}

/** A division's schedule document; throws for a division whose league publishes none (mode 'none'). */
export function officialDocumentOf(division: DivisionId): OfficialDocumentConfig {
  const d = getDivision(division);
  if (!hasOfficialDocument(d)) throw new Error(`lib/config/leagues/official.ts: ${division} publishes no official schedule`);
  return d.official;
}

/** The bundled divisions of a league, config order. */
export function bundledDivisions(leagueId: LeagueId): DocumentDivision[] {
  return getLeague(leagueId).divisions.filter((d): d is DocumentDivision => d.official.mode === 'bundled');
}
