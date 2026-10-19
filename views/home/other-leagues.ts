/**
 * The home panel's "Other leagues" strip (components/home/OtherLeaguesStrip.tsx): one line per other
 * league of the panel's own region, naming who leads each division (DESIGN-socal §2.4).
 */

import { isSingleDivision } from '@/lib/config/leagues';
import { listWords } from '@/lib/format/words';
import type { LeagueId } from '@/lib/model/ids';
import type { LeagueConfig } from '@/lib/model/league-config';

import { divisionLeaders } from './leaders';

export interface OtherLeagueLine {
  id: LeagueId;
  shortName: string;
  href: string;
  /** 'St. Ignatius leads De Anza · Los Gatos leads El Camino' | 'Stevenson leads' | 'No league results yet' */
  text: string;
}

export function leagueLeadersLine(league: LeagueConfig): string {
  const single = isSingleDivision(league.id);
  const clauses = league.divisions.map((d) => {
    const leaders = divisionLeaders(d.id);
    if (!leaders) return single ? null : `no results yet in ${d.label}`;
    const verb = leaders.names.length === 1 ? 'leads' : 'lead';
    return `${listWords(leaders.names, '&')} ${verb}${single ? '' : ` ${d.label}`}`;
  });
  if (clauses.every((c) => c === null || c.startsWith('no results yet'))) return 'No league results yet';
  return clauses.filter((c): c is string => c !== null).join(' · ');
}
