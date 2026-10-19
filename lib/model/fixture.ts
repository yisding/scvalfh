/**
 * The normalized domain model (lib/model/): an official schedule fixture that matched no published game,
 * and the two row shapes of a bundled official-fixture file (data/official/<league>-2026.json).
 */

import type { DivisionId, LeagueId, OfficialSourceId, TeamSlug } from './ids';

// ---------- fixtures ----------

export interface OfficialFixture {
  /** `${division}:${dateKey}:${awaySlug ?? awayName}@${homeSlug ?? homeName}` — stable key. */
  id: string;
  league: LeagueId;
  division: DivisionId;
  /** The official date, YYYY-MM-DD. */
  dateKey: string;
  /** League-published varsity start 'HH:MM', when the source states one. */
  time: string | null;
  /** Grid spelling, verbatim (SCVAL uppercase; BVAL docx; PCAL code name; MCAL legend name). */
  awayName: string;
  homeName: string;
  awaySlug: TeamSlug | null;
  homeSlug: TeamSlug | null;
  source: OfficialSourceId;
}

// ---------- bundled official-fixture file rows ----------
//
// The rows of a bundle file as written (lib/official/bundle.ts holds their Zod schemas, which
// `satisfies` these shapes). Declared here so a document parser (lib/sources/bval/schedule-text.ts)
// can produce rows without importing lib/official.

export interface BundleFixture {
  /** `${division}:${date}:${awaySlug}@${homeSlug}` — the OfficialFixture id. */
  id: string;
  division: DivisionId;
  /** The official date (after any approved change), YYYY-MM-DD. */
  date: string;
  /** The originally published date when an approved change moved it (MCAL); else null. */
  originalDate: string | null;
  /** League-published varsity start 'HH:MM'. */
  time: string | null;
  /** Source token, resolved through the league scope only. */
  away: string;
  home: string;
  /** Source spelling, verbatim. */
  awayName: string;
  homeName: string;
}

/** A dated non-fixture line of the document the bundle keeps (the BVAL CCS play-in). */
export interface BundleEvent {
  kind: 'play-in';
  date: string;
  time: string | null;
  verbatim: string;
}
