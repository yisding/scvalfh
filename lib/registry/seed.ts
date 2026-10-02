/**
 * One registry seed: the hand-maintained source of a Team (lib/teams.ts `toTeam`).
 *
 * Seeds are transcribed from the verified registry seeds (tests/fixtures/seeds/*.json, checked
 * field by field by tests/registry-seeds.test.ts). Slugs and 2-letter abbrs are OURS and are never
 * derived by string munging; ids are MaxPreps GUIDs.
 */

import type { DivisionId, LeagueId, SectionId, Team, TeamId, TeamSlug } from '../types';

export interface Seed {
  id: TeamId;
  slug: TeamSlug;
  name: string;
  shortName: string;
  abbr: string;
  acronym: string;
  mascot: string;
  city: string;
  section: SectionId;
  league: LeagueId;
  division: DivisionId;
  dataCoverage: Team['dataCoverage'];
  /** hex without '#', from the standings payload's schoolColor1 / schoolColor2. */
  colors: [string, string];
  colorSource: Team['colors']['source'];
  maxprepsPath: string | null;
  /** Globally unambiguous spellings only. League-grid codes live in LeagueConfig.officialCodes. */
  aliases: string[];
  sbliveTeamId?: string;
  /**
   * si.com URL slug. Never guessed: harvested from live si.com payloads (league standings
   * `teamStandings[].team.webPath`, or `opponent.team.webPath` on a team or game page).
   */
  sbliveSlug?: string;
  /** numeric si.com SCHOOL id from a logo URL `/uploads/production/school/{id}/`. Never guessed. */
  sbliveSchoolId?: string;
  vnnSiteId?: string;
}
