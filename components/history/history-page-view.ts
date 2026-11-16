/**
 * The page data for /history/2025-26 (app/history/2025-26/page.tsx), read once, at module load, from
 * lib/history/history.ts (data/history-2025-26.json, data/history-brackets-2025-26.json) and lib/leagues.ts:
 * the season, the leagues and brackets in page order, and the sentences the page's header and its metadata
 * both print. The page hands the season to its components (components/history/AvailableLeague.tsx and its
 * siblings) as a prop.
 *
 * Kept apart from history-view.ts, which scripts/public-terms.ts imports: this module reads the data the
 * moment it loads.
 */

import { listWords } from '../../lib/format';
import {
  getAvailableHistoryLeagues,
  getHistoryBrackets,
  getHistoryLeagues,
  getHistoryPublishedBrackets,
  getHistorySeason,
  getHistoryTournaments,
  getUnavailableHistoryLeagues,
  historyGroupsSentence,
} from '../../lib/history/history';
import { TOC } from '../../lib/league-config/sections';
import { LEAGUE_IDS, getLeague, getSection, isIndependentLeague } from '../../lib/leagues';
import type { LeagueId } from '../../lib/types';

export const SEASON = getHistorySeason();
export const HISTORY_LEAGUES = getHistoryLeagues();
export const BRACKETS = getHistoryBrackets();
export const TOURNAMENTS = getHistoryTournaments();
/**
 * The soccer, basketball and volleyball builds' 2025-26 brackets, read whole from MaxPreps, by event: the CCS's
 * divisions, then the CIF State divisions a team of ours played in. Empty in field hockey (BRACKETS instead).
 */
const PUBLISHED = getHistoryPublishedBrackets();
export const PUBLISHED_READ_ON = PUBLISHED?.retrievedOn ?? null;
export const PUBLISHED_EVENTS = (['ccs', 'cif'] as const)
  .map((event) => ({ event, brackets: (PUBLISHED?.brackets ?? []).filter((b) => b.event === event) }))
  .filter((e) => e.brackets.length > 0);
/** 'SCVAL, BVAL, WCAL or WBAL': the leagues whose teams the published brackets draw. */
export const LEAGUE_WORDS = listWords(LEAGUE_IDS.map((id) => getLeague(id).shortName), 'or');
/**
 * "the CCS and San Diego Section playoff brackets and the Tournament of Champions": the brackets the page
 * shows, the sections' and the tournaments' (field hockey), or the CCS's and the CIF State's read whole (the other
 * builds), or null when it shows none.
 */
export const BRACKET_WORDS: string | null =
  [
    ...(BRACKETS.length > 0 ? [`the ${listWords(BRACKETS.map((b) => getSection(b.id).briefLabel))} playoff brackets`] : []),
    ...TOURNAMENTS.map(() => `the ${TOC.name}`),
    ...PUBLISHED_EVENTS.map((e) => (e.event === 'ccs' ? 'the CCS playoff brackets' : 'the CIF State brackets our teams played in')),
  ].join(' and ') || null;
export const AVAILABLE = getAvailableHistoryLeagues();
const UNAVAILABLE = getUnavailableHistoryLeagues();
/** 'SCVAL': a league's short name, as the page's pills and sentences name it. */
export const leagueShortName = (id: LeagueId) => getLeague(id).shortName;
/**
 * The unavailable leagues, and the groups of independents (the LA independents, DESIGN §24.9,
 * §24.10): "we found no official final standings" is said of the first only, since the group is this site's
 * grouping and nobody published a table of it (GROUPS_SENTENCE says so).
 */
const UNAVAILABLE_LEAGUES = UNAVAILABLE.filter((l) => !isIndependentLeague(l.id));
/** "PCAL, MCAL and EAL are", "MCAL is", or null when every league has its tables. */
export const UNAVAILABLE_SUBJECT = UNAVAILABLE_LEAGUES.length
  ? `${listWords(UNAVAILABLE_LEAGUES.map((l) => leagueShortName(l.id)))} ${UNAVAILABLE_LEAGUES.length === 1 ? 'is' : 'are'}`
  : null;
/** "The LA independents are this site’s grouping, so no table of them was published.", or null with no such group. */
export const GROUPS_SENTENCE = historyGroupsSentence();
