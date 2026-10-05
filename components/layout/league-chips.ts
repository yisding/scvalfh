/**
 * The `LeagueSwitcher` chips and their targets, config order.
 *
 * Kept out of LeagueSwitcher.tsx because that module is `'use client'` and this one reads the
 * server-side league summaries (lib/data). Every page that renders the chips (/standings,
 * /standings/<league>, /schedule/<league>, /teams, /playoffs and the home scope row) builds them
 * through here; /playoffs keeps its own tournament-aware targets.
 */
import { getLeagueSummaries, type LeagueSummary } from '../../lib/data';

import type { LeagueChip } from './LeagueSwitcher';

function toLeagueChip(summary: LeagueSummary): LeagueChip {
  return { id: summary.id, shortName: summary.shortName, sectionShort: summary.section.shortName };
}

/** One chip per league, config order. */
export function leagueChips(): LeagueChip[] {
  return getLeagueSummaries().map(toLeagueChip);
}

/** `{ all: base, <id>: base/<id> }` for a link-mode switcher, or `{ <id>: '#<id>' }` for anchor mode. */
export function leagueHrefs(base: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (base) out.all = base;
  for (const { id } of getLeagueSummaries()) out[id] = base ? `${base}/${id}` : `#${id}`;
  return out;
}
