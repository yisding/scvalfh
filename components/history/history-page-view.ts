/**
 * The page data for /history/2025-26 (app/history/2025-26/page.tsx), read once, at module load, from
 * lib/history/history.ts (data/history-2025-26.json, data/history-brackets-2025-26.json) and lib/leagues.ts:
 * the season, the leagues and brackets in page order, and the sentences the page's header and its metadata
 * both print. The page's components (components/history/AvailableLeague.tsx and its siblings) read the
 * season from here too.
 *
 * Kept apart from history-view.ts, which scripts/public-terms.ts imports: this module reads the data the
 * moment it loads.
 */

import { listWords } from '../../lib/format';
import {
  getAvailableHistoryLeagues,
  getHistoryBrackets,
  getHistoryLeagues,
  getHistorySeason,
  getHistoryTournaments,
  getUnavailableHistoryLeagues,
} from '../../lib/history/history';
import { TOC } from '../../lib/league-config/sections';
import { getLeague, getSection, isIndependentLeague } from '../../lib/leagues';
import type { LeagueId } from '../../lib/types';

export const SEASON = getHistorySeason();
export const HISTORY_LEAGUES = getHistoryLeagues();
export const BRACKETS = getHistoryBrackets();
export const TOURNAMENTS = getHistoryTournaments();
/**
 * "the CCS and San Diego Section playoff brackets and the Tournament of Champions": the brackets the page
 * shows, the sections' and the tournaments'.
 */
export const BRACKET_WORDS = [
  `the ${listWords(BRACKETS.map((b) => getSection(b.id).briefLabel))} playoff brackets`,
  ...TOURNAMENTS.map(() => `the ${TOC.name}`),
].join(' and ');
export const AVAILABLE = getAvailableHistoryLeagues();
const UNAVAILABLE = getUnavailableHistoryLeagues();
export const short = (id: LeagueId) => getLeague(id).shortName;
/**
 * The unavailable leagues, and the groups of independents (the LA independents, DESIGN §24.9,
 * §24.10): "we found no official final standings" is said of the first only, since the group is this site's
 * grouping and nobody published a table of it.
 */
const UNAVAILABLE_LEAGUES = UNAVAILABLE.filter((l) => !isIndependentLeague(l.id));
const UNAVAILABLE_GROUPS = UNAVAILABLE.filter((l) => isIndependentLeague(l.id));
/** "PCAL, MCAL and EAL are", "MCAL is", or null when every league has its tables. */
export const UNAVAILABLE_SUBJECT = UNAVAILABLE_LEAGUES.length
  ? `${listWords(UNAVAILABLE_LEAGUES.map((l) => short(l.id)))} ${UNAVAILABLE_LEAGUES.length === 1 ? 'is' : 'are'}`
  : null;
/** "The LA independents are this site’s grouping, so no table of them was published.", or null with no such group. */
export const GROUPS_SENTENCE = UNAVAILABLE_GROUPS.length
  ? `${listWords(UNAVAILABLE_GROUPS.map((l) => `the ${getLeague(l.id).name}`)).replace(/^t/, 'T')} are this site’s grouping, so no table of them was published.`
  : null;
