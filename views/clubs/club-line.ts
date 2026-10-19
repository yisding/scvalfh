/**
 * The team roster's club line (views/teams/roster.ts, components/teams/TeamRoster.tsx): a player's
 * clubs grouped current, listed, earlier, each linking its club page.
 */

import {
  type AffiliationStatus,
  type Club,
  clubDisplayName,
  getClub,
  getPlayerClubs,
} from '@/lib/datasets/clubs';
import { partialDateKind } from '@/lib/format/dates';
import type { TeamSlug } from '@/lib/model/ids';
import { clubHref } from '@/lib/shared/routes';

/** The last year an `asOf` covers (a range's or a season's end), for "latest first"; null last. */
function endYear(asOf: string | null): number {
  if (asOf === null) return Number.NEGATIVE_INFINITY;
  const kind = partialDateKind(asOf);
  if (kind === 'range') return Number(asOf.slice(5, 9));
  if (kind === 'season') return Number(asOf.slice(0, 4)) + 1;
  return Number(asOf.slice(0, 4));
}

export interface ClubLink {
  slug: string;
  /** The display name: "SF Hawks". */
  name: string;
  /** `/clubs/<slug>` */
  href: string;
}

function clubLink(club: Club): ClubLink {
  return { slug: club.slug, name: clubDisplayName(club), href: clubHref(club.slug) };
}

/** One status's clubs on a roster row: "Club: SF Hawks", "Earlier clubs: Fly FHC, Lightning". */
export interface RosterClubGroup {
  status: AffiliationStatus;
  label: 'Club' | 'Clubs' | 'Listed club' | 'Listed clubs' | 'Earlier club' | 'Earlier clubs';
  /** The same words for the link's accessible name ("Storey Lewis’s club: SF Hawks"). */
  srLabel: 'club' | 'clubs' | 'listed club' | 'listed clubs' | 'earlier club' | 'earlier clubs';
  /** Latest `asOf` first (a range's or season's end year; undated last), then display name. */
  clubs: ClubLink[];
}

const GROUP_WORDS = {
  current: { one: 'Club', many: 'Clubs', srOne: 'club', srMany: 'clubs' },
  unknown: { one: 'Listed club', many: 'Listed clubs', srOne: 'listed club', srMany: 'listed clubs' },
  past: { one: 'Earlier club', many: 'Earlier clubs', srOne: 'earlier club', srMany: 'earlier clubs' },
} as const;

/** What is true now, then what a source only lists, then what was. */
const GROUP_ORDER: readonly AffiliationStatus[] = ['current', 'unknown', 'past'];

/**
 * A roster row's club line, as groups in the order current, listed (unknown), earlier (past).
 * [] for a row without a MaxPreps athleteId or a player no source ties to a club — most rows.
 */
export function playerClubGroups(teamSlug: TeamSlug, athleteId: string | null): RosterClubGroup[] {
  if (athleteId === null) return [];
  const ties = getPlayerClubs(teamSlug, athleteId);
  return GROUP_ORDER.flatMap((status): RosterClubGroup[] => {
    const clubs = ties
      .filter((a) => a.status === status)
      .map((a) => ({ a, club: getClub(a.club)! }))
      .sort(
        (x, y) =>
          endYear(y.a.asOf) - endYear(x.a.asOf) ||
          clubDisplayName(x.club).localeCompare(clubDisplayName(y.club)),
      )
      .map(({ club }) => clubLink(club));
    if (clubs.length === 0) return [];
    const w = GROUP_WORDS[status];
    const many = clubs.length > 1;
    return [{ status, label: many ? w.many : w.one, srLabel: many ? w.srMany : w.srOne, clubs }];
  });
}
