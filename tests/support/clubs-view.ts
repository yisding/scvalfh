/**
 * The clubs data and the club page views over the committed data/clubs.json, data/rosters.json and
 * data/rosters-enrichment.json (SPEC §1.1j2, DESIGN §17), shared by tests/views/clubs/*.test.ts.
 */

import { getClub, getClubSlugs, getClubsFile } from '@/lib/datasets/clubs';
import type { Club, ClubAffiliation } from '@/lib/schema/clubs';
import type { ClubPageView } from '@/views/clubs/club-page';
import { buildClubPageView } from '@/views/clubs/club-view';

export const file = getClubsFile();

export const club = (slug: string): Club => getClub(slug)!;

/** The affiliation for `name` at `slug`. */
export const tie = (name: string, slug: string): ClubAffiliation =>
  file.affiliations.find((a) => a.fullName === name && a.club === slug)!;

export const views: Array<{ slug: string; view: ClubPageView }> = getClubSlugs().map((slug) => ({
  slug,
  view: buildClubPageView(slug)!,
}));

export const viewOf = (slug: string) => views.find((v) => v.slug === slug)!.view;
