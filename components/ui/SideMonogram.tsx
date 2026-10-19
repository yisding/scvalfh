import type { TeamSlug } from '@/lib/model/ids';
import { getTeamBySlug } from '@/lib/registry/teams';
import { NON_MEMBER_NOTE } from '@/views/shared/words/membership';

import GhostMonogram from './GhostMonogram';
import TeamMonogram, { type TeamMonogramProps } from './TeamMonogram';

/**
 * A game side's tile: the school's TeamMonogram when the side is one of the registry's teams, else a
 * GhostMonogram (two mixed-case letters on the inset surface, no school colour) titled
 * NON_MEMBER_NOTE (DESIGN §8). One decision for every row and hero that draws a side — the game
 * rows' team lines (components/game-row/parts/TeamLine.tsx), the ScoreBoard, the team page's
 * official-only fixtures and the game page's form rows — so a school outside the registry gets the
 * same tile wherever it appears.
 *
 * Server-only: it resolves the slug through lib/registry/teams. Decorative, like both tiles: the
 * side's name always sits beside it.
 */
export interface SideMonogramProps {
  /** The side's registry slug; null (or a slug the registry does not know) draws the ghost tile. */
  slug: TeamSlug | null | undefined;
  /** The source name, as the snapshot spells it: the ghost tile's letters. */
  name: string;
  size: NonNullable<TeamMonogramProps['size']>;
  /**
   * The ghost tile's hover note. null leaves it off, for a host that already says it in words beside
   * the tile (the game page's form rows).
   */
  ghostTitle?: string | null;
}

export function SideMonogram({ slug, name, size, ghostTitle = NON_MEMBER_NOTE }: SideMonogramProps) {
  const team = slug ? getTeamBySlug(slug) : undefined;
  return team ? (
    <TeamMonogram team={team} size={size} />
  ) : (
    <GhostMonogram name={name} size={size} title={ghostTitle ?? undefined} />
  );
}

export default SideMonogram;
