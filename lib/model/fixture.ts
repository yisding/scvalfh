/**
 * The normalized domain model (lib/model/): an official schedule fixture that matched no published game.
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
