/**
 * One league summary as a `LeagueSwitcher` chip.
 *
 * Kept out of LeagueSwitcher.tsx because that module is `'use client'` and this one reads a
 * server-side `LeagueSummary` (lib/data). Every page that renders the chips (/standings,
 * /schedule/<league>, /teams, /playoffs and the home scope row) builds them through here.
 */
import type { LeagueSummary } from '../../lib/data';

import type { LeagueChip } from './LeagueSwitcher';

export function toLeagueChip(summary: LeagueSummary): LeagueChip {
  return { id: summary.id, shortName: summary.shortName, sectionShort: summary.section.shortName };
}
