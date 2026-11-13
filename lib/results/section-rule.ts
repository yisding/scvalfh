/**
 * Which section's shootout rule reaches a game (SectionConfig.shootout): the one lookup lib/pipeline/normalize.ts,
 * lib/results/result.ts and the views share. Pure: the registry and the section config only.
 */

import type { SectionConfig } from '../league-config/shape';
import { getSection } from '../leagues';
import { getTeamBySlug } from '../teams';
import type { Game } from '../types';

/**
 * The section both sides are teams of when it ends a level varsity game with a shootout
 * (SectionConfig.shootout: the Northern Section's 1 v 1s, the San Diego Section's shootout), else null.
 * The same rule lib/pipeline/normalize.ts writes decider 'SO' by. An 'SO' game without one is a level final in a
 * game that had to have a winner (lib/postseason/level-final.ts).
 */
export function shootoutSectionOf(game: Pick<Game, 'home' | 'away'>): SectionConfig | null {
  const home = game.home.slug ? getTeamBySlug(game.home.slug) : undefined;
  const away = game.away.slug ? getTeamBySlug(game.away.slug) : undefined;
  if (!home || !away || home.section !== away.section) return null;
  const section = getSection(home.section);
  return section.shootout ? section : null;
}

/**
 * The section whose shootout rule covers this game: `shootoutSectionOf`, unless the game is a tournament
 * row (contestType 2 on either side) and the rule does not reach tournaments (SectionConfig.shootout.
 * coversTournaments false: the SDFHOA procedures cover the regular season and the playoffs only). The
 * same rule lib/pipeline/normalize.ts reads 'SO' by.
 */
export function shootoutRuleSectionOf(game: Pick<Game, 'home' | 'away' | 'contestTypes'>): SectionConfig | null {
  const section = shootoutSectionOf(game);
  if (!section?.shootout) return null;
  const tournament = game.contestTypes?.home === 2 || game.contestTypes?.away === 2;
  return tournament && !section.shootout.coversTournaments ? null : section;
}
