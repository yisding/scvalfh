/**
 * The words and ids that say which teams a /leaders board covers (DESIGN-socal §2.3, §2.4), from
 * lib/leagues.ts config, never typed in. The team pages read these too (the Elo disclosure, the
 * board link's id suffix), so they live apart from the page's assembly.
 */

import { numberWord } from '@/lib/format/words';
import { INDEPENDENT_LEAGUES, LEAGUES_PROPER, REGIONS, getSection, leaguesInRegion } from '@/lib/leagues';
import type { RegionId } from '@/lib/model/ids';

/**
 * 'nine': the number of configured leagues proper, in words. The Elo fit spans all of them and the
 * independent groups too (one scale), so the copy that speaks for the whole fit says 'the nine leagues'
 * teams' and adds AND_INDEPENDENTS; a board speaks for its region's. Never 'ten leagues': the Southern
 * Section independents are not a league (DESIGN §24.9).
 */
export const LEAGUE_COUNT = numberWord(LEAGUES_PROPER.length);

const independentTeams = (group: { divisions: readonly { expectedTeams: number }[] }) =>
  group.divisions.reduce((n, d) => n + d.expectedTeams, 0);

/**
 * ' and the Southern Section’s five independents' ('' with no independent group): the covered teams that
 * are in no league, named after a count of leagues wherever the sentence speaks for every covered team.
 */
export const AND_INDEPENDENTS = INDEPENDENT_LEAGUES.map(
  (g) => ` and the ${getSection(g.sectionId).name}’s ${numberWord(independentTeams(g))} independents`,
).join('');

/** ' and five independents' ('' with none): the short form, for an eyebrow. */
export const AND_INDEPENDENTS_SHORT = INDEPENDENT_LEAGUES.map(
  (g) => ` and ${numberWord(independentTeams(g))} independents`,
).join('');

/** The id suffix of a region's boards and sections: '' for NorCal (today's anchors), '-socal' for SoCal. */
export function regionIdSuffix(region: RegionId): '' | '-socal' {
  return region === 'norcal' ? '' : '-socal';
}

/** What a board needs to know about the region it ranks: its id suffix and the words for its leagues. */
export interface BoardScope {
  /** '' | '-socal' */
  suffix: '' | '-socal';
  /**
   * 'all five NorCal leagues', 'all four SoCal leagues and five independents': every board's caption scope.
   * The independents rank on every board, the league record included: their table is their league
   * (DESIGN §29).
   */
  leagues: string;
  /** The region's independents (0 NorCal): the league-record note says what their table counts. */
  independents: number;
}

/** A region's config row, its leagues proper and its independents' team count. */
export interface RegionScope {
  config: (typeof REGIONS)[number];
  /** Leagues proper: the LA independents are SoCal's, but no league (DESIGN §24.9). */
  leagues: number;
  independents: number;
  board: BoardScope;
  /** "NorCal’s five leagues", "SoCal’s four leagues and five independents": a section's scope. */
  sectionWords: string;
}

export function regionScope(region: RegionId): RegionScope {
  const config = REGIONS.find((r) => r.id === region)!;
  const all = leaguesInRegion(region);
  const leagues = all.filter((l) => !l.independents).length;
  const independents = all.filter((l) => l.independents).reduce((n, l) => n + independentTeams(l), 0);
  const andIndependents = independents > 0 ? ` and ${numberWord(independents)} independents` : '';
  return {
    config,
    leagues,
    independents,
    board: {
      suffix: regionIdSuffix(region),
      leagues: `all ${numberWord(leagues)} ${config.shortName} leagues${andIndependents}`,
      independents,
    },
    sectionWords: `${config.shortName}’s ${numberWord(leagues)} leagues${andIndependents}`,
  };
}
