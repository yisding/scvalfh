/**
 * The 102-team membership registry (SPEC §3; DESIGN §24 for the Southern California amendment):
 * NorCal — SCVAL 15, BVAL 12, PCAL 7, MCAL 9, EAL 6 (49); SoCal — the Southern Section's Sunset 10,
 * the San Diego Section's City 12, North County 19 and Metro 9, and the Southern Section's three
 * independents, five schools in no league with a table of their own (53; DESIGN §24.9, §24.10).
 *
 * THIS is the set of leagues, not the feed: every table is built from this constant and
 * left-joined against the feed. Seeds live in
 * lib/registry/{scval,bval,pcal,mcal,eal,sunset,city,north-county,metro,independents}.ts; TEAMS is
 * assembled in LEAGUES order (lib/config/leagues.ts), so the 49 NorCal teams keep their places, the SoCal
 * 48 follow the EAL, and the five independents come last.
 *
 * ids are MaxPreps GUIDs. Slugs and 2-letter abbrs are OURS and are never derived by string
 * munging. `assertRegistry()` runs at module load and throws `lib/registry/teams.ts: …` on any violation.
 *
 * This module is the package's door. The parts live beside it in lib/registry/: team-list.ts makes each
 * seed a Team, assembles TEAMS and holds the by-id and by-slug lookups; ink.ts is the monogram-ink
 * arithmetic; acronyms.ts is the alias index, its key and the acronym rule; assert.ts is the invariants.
 * The door re-exports the public values and calls the assert last. Name resolution (resolveTeam,
 * resolveOfficialName, isWithdrawnSchool, the cross-source join keys) is public on its own in
 * lib/registry/resolve.ts, which is built on the door's lookups and so imports the door: re-exporting it
 * here would make an import cycle.
 */

import { ACRONYM_COLLISIONS } from './acronyms';
import { checkRegistry } from './assert';
import { FETCHABLE_TEAMS, TEAMS } from './team-list';

export { ACRONYM_COLLISIONS, normalizeTeamKey } from './acronyms';
export { onPrimaryInk } from './ink';
export {
  FETCHABLE_TEAMS, TEAMS, getTeamById, getTeamBySlug, sideShortName, teamOfSide, teamShortName, teamsInDivision,
  teamsInLeague,
} from './team-list';

function assertRegistry(): void {
  checkRegistry({ teams: TEAMS, fetchable: FETCHABLE_TEAMS, acronymCollisions: ACRONYM_COLLISIONS });
}
assertRegistry();
