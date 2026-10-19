/**
 * Who a si.com side is: id first (SPEC §7.9). A side resolves by its si.com team id (web path, raw
 * id or team-logo URL), then by its si.com school id (school-logo URL), and only then by name, and
 * never by name for the statewide namesakes (STATEWIDE_AMBIGUOUS).
 */

import { DATA_QUALITY } from '@/lib/config/leagues';
import type { TeamSlug } from '@/lib/model/ids';
import type { Team } from '@/lib/model/team';
import { resolveTeam } from '@/lib/registry/resolve';
import { TEAMS, normalizeTeamKey } from '@/lib/registry/teams';

/** `/california/field-hockey/teams/458850-los-altos-eagles` → `458850`. */
export function sbliveIdFromWebPath(webPath: string | null | undefined): string | null {
  if (!webPath) return null;
  const m = /\/teams\/(\d+)-/.exec(webPath);
  return m ? m[1] : null;
}

/**
 * `normalizeTeamKey` values that more than one California si.com team uses (University: Irvine and
 * San Francisco; Los Altos: Hacienda Heights and Los Altos; Santa Clara: Oxnard and Santa Clara;
 * Davis: 458605 Davis of Davis and 458828 Davis of Modesto). si.com's team search for the other EAL
 * names (Bella Vista, Chico, Corning, Lassen, Pleasant Valley) found one team of that name each (Chico
 * and Corning also list fuzzy matches under other names), checked 2026-10-04.
 *
 * The same search (`/high-school/stats/california/field-hockey/teams?name=…`, browser User-Agent, one
 * request at a time at least 600 ms apart) was run on 2026-10-06 for the 50 Southern California
 * names, plus the spellings Southwest SD, Mt Carmel, Bishops, Canyon Crest, San Dieguito, LJCD and
 * RBV (tests/fixtures/seeds/registry-seed-ss.json and registry-seed-sds.json,
 * sbliveIdentity.nameSearch). Seven names have a second California team on si.com, so they joined
 * the list:
 *   - Westview: ours is 458949 (San Diego); 464882 is the Westview Wildcats of West Los Angeles, which
 *     si.com shows playing Sage Creek on Sep 30 and Oct 28.
 *   - Del Norte: ours is 458937 (San Diego); 458609 is Crescent City's (the MaxPreps ghost in
 *     DATA_QUALITY.ghostTeamIds), which si.com shows playing Tamalpais and Davis on Oct 16.
 *   - Marina: ours is 458748 (Huntington Beach); 500865 is Marina's own (Monterey County, no games).
 *   - San Marcos: ours is 459066; 459073 is Santa Barbara's.
 *   - Mission Vista: ours is 464852 (Oceanside, with the games); 480754 is a second entry located
 *     "Vista, CA" whose games page serves si.com's index.
 *   - Granite Hills: ours is 458713 (El Cajon); 554634 (Porterville) and 458466 (Apple Valley).
 *   - Southwest: 583246 is El Centro's (no games); si.com names ours "Southwest SD" (459138), which
 *     still resolves by name.
 * Every other name returned one team of that name (some also list fuzzy matches under other names,
 * e.g. Bonita Vista for Bonita and Claremont for Clairemont, which are different keys).
 *
 * A side with one of these names resolves ONLY by a si.com id, never by name.
 */
export const STATEWIDE_AMBIGUOUS: ReadonlySet<string> = new Set(
  [
    'University', 'Los Altos', 'Santa Clara', 'Davis',
    'Westview', 'Del Norte', 'Marina', 'San Marcos', 'Mission Vista', 'Granite Hills', 'Southwest',
  ].map(normalizeTeamKey),
);

/** Everything si.com exposes about one side of a game or one standings row. */
export interface SbliveSideRef {
  name: string | null;
  webPath?: string | null;
  rawId?: string | number | null;
  image?: string | null;
}

export interface SbliveResolution {
  slug: TeamSlug | null;
  via: 'team-id' | 'school-id' | 'name' | null;
  refused?: 'ignored-team' | 'ambiguous-name' | 'id-contradicts-name' | 'unknown';
}

/**
 * teamId: `/teams/(\d+)-` on webPath, else rawId, else `/uploads/production/team/(\d+)-v\d+/` on image.
 * schoolId: `/uploads/production/school/(\d+)/` on image.
 */
export function sbliveIdsFrom(ref: SbliveSideRef): { teamId: string | null; schoolId: string | null } {
  const raw = ref.rawId === null || ref.rawId === undefined ? '' : String(ref.rawId).trim();
  const teamId =
    sbliveIdFromWebPath(ref.webPath) ??
    (raw ? raw : null) ??
    (ref.image ? (/\/uploads\/production\/team\/(\d+)-v\d+\//.exec(ref.image)?.[1] ?? null) : null);
  const schoolId = ref.image ? (/\/uploads\/production\/school\/(\d+)\//.exec(ref.image)?.[1] ?? null) : null;
  return { teamId, schoolId };
}

/** Reverse indexes over Team.external.sbliveTeamId / sbliveSchoolId. */
const BY_SBLIVE_TEAM_ID = new Map<string, Team>();
const BY_SBLIVE_SCHOOL_ID = new Map<string, Team>();
for (const t of TEAMS) {
  if (t.external.sbliveTeamId) BY_SBLIVE_TEAM_ID.set(t.external.sbliveTeamId, t);
  if (t.external.sbliveSchoolId) BY_SBLIVE_SCHOOL_ID.set(t.external.sbliveSchoolId, t);
}

function isIgnoredSbliveTeamId(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(DATA_QUALITY.sbliveIgnoredTeamIds, id);
}

/**
 * Resolve one si.com side to a registry team, id first (SPEC §7.9, steps 0-6):
 *   0. teamId ∈ DATA_QUALITY.sbliveIgnoredTeamIds                 → null, 'ignored-team'
 *   1. teamId === some Team.external.sbliveTeamId                 → that team, via 'team-id'
 *   2. schoolId === some Team.external.sbliveSchoolId             → that team, via 'school-id'
 *   3. normalizeTeamKey(name) ∈ STATEWIDE_AMBIGUOUS               → null, 'ambiguous-name'
 *   4. resolveTeam(name) hit whose recorded si.com id contradicts a PRESENT id → null, 'id-contradicts-name'
 *   5. resolveTeam(name) hit                                      → that team, via 'name'
 *   6. null, 'unknown'
 */
export function resolveSbliveSide(ref: SbliveSideRef): SbliveResolution {
  const { teamId, schoolId } = sbliveIdsFrom(ref);
  if (teamId && isIgnoredSbliveTeamId(teamId)) return { slug: null, via: null, refused: 'ignored-team' };
  const byTeam = teamId ? BY_SBLIVE_TEAM_ID.get(teamId) : undefined;
  if (byTeam) return { slug: byTeam.slug, via: 'team-id' };
  const bySchool = schoolId ? BY_SBLIVE_SCHOOL_ID.get(schoolId) : undefined;
  if (bySchool) return { slug: bySchool.slug, via: 'school-id' };
  const name = ref.name?.trim() ?? '';
  if (!name) return { slug: null, via: null, refused: 'unknown' };
  if (STATEWIDE_AMBIGUOUS.has(normalizeTeamKey(name))) return { slug: null, via: null, refused: 'ambiguous-name' };
  const byName = resolveTeam(name);
  if (!byName) return { slug: null, via: null, refused: 'unknown' };
  const recordedTeam = byName.external.sbliveTeamId;
  const recordedSchool = byName.external.sbliveSchoolId;
  if ((teamId && recordedTeam && teamId !== recordedTeam) || (schoolId && recordedSchool && schoolId !== recordedSchool)) {
    return { slug: null, via: null, refused: 'id-contradicts-name' };
  }
  return { slug: byName.slug, via: 'name' };
}
