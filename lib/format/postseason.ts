/**
 * Postseason copy as pure sentence builders over values the caller has already looked up in the league
 * config (lib/queries/postseason.ts does the lookups and calls these). Client-safe: it imports only
 * types and lib/format/dates.ts and lib/format/numbers.ts.
 */

import type { PairingConfig } from '@/lib/model/league-config';

import { leagueClock, shortDate } from './dates';
import { ordinalWord } from './numbers';

/**
 * The BVAL-style play-in, as one clause with no closing stop: 'Mt. Hamilton #4 plays at the Santa
 * Teresa champion Sat Oct 31, 11 AM, for BVAL’s fourth automatic CCS berth', the ordinal from the
 * league's configured `autoBerths`. The team page ends it
 * with a period; the home page's phase lead adds the CCS seeding meeting.
 */
export function playInWords({
  leagueShortName,
  autoBerths,
  playIn,
  championDivisionLabel,
}: {
  leagueShortName: string;
  autoBerths: number;
  playIn: PairingConfig;
  championDivisionLabel: string;
}): string {
  return (
    `${playIn.seatLabels[1]} plays at the ${championDivisionLabel} champion ` +
    `${shortDate(playIn.date)}${playIn.time ? `, ${leagueClock(playIn.time)}` : ''}, for ${leagueShortName}’s ` +
    `${ordinalWord(autoBerths)} automatic CCS berth`
  );
}
