/**
 * THE OfficialFixture id rule (lib/model/fixture.ts), pure and import-free at runtime, so every
 * producer of official fixtures (the SCVAL PDF grid parser, the BVAL text parser, the bundle
 * loader and the bundle builder) spells the id the same way without reaching into lib/official.
 */

import type { DivisionId, TeamSlug } from '@/lib/model/ids';

/** THE OfficialFixture id rule (lib/model/fixture.ts): `${division}:${dateKey}:${awaySlug ?? awayName}@${homeSlug ?? homeName}`. */
export function officialFixtureId(
  division: DivisionId,
  dateKey: string,
  away: { slug: TeamSlug | null; name: string },
  home: { slug: TeamSlug | null; name: string },
): string {
  return `${division}:${dateKey}:${away.slug ?? away.name}@${home.slug ?? home.name}`;
}
