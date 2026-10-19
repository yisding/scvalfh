/**
 * The `LeagueSwitcher` chips and their targets, config order.
 *
 * Kept out of LeagueSwitcher.tsx because that module is `'use client'` and this one reads the
 * server-side league summaries (lib/queries/leagues.ts). Every page that renders the chips (/standings,
 * /standings/<league>, /schedule/<league>, /teams, /playoffs and the home scope row) builds them
 * through here; /playoffs keeps its own tournament-aware targets.
 *
 * Regions (DESIGN-socal §2.4): every chip carries its league's region, which the switcher stamps on
 * its section lists as `data-region-scope` (scope and anchor modes), so an index page holds both
 * regions' chips and the scope stylesheet shows the reader's. A per-league page (`link` mode on
 * /standings/<league> and /schedule/<league>) is handed only its own league's region —
 * `leagueChips(regionOfPage)` and `leagueHrefs(base, regionOfPage)` — plus the `All` chip to the
 * index: the page is about one league, its neighbours are the leagues of the same region, and the
 * index is where the other region is one tap away.
 */
import type { LeagueId, RegionId } from '@/lib/model/ids';
import type { SectionConfig } from '@/lib/model/league-config';
import { type LeagueSummary, getLeagueSummaries } from '@/lib/queries/leagues';

/** One chip of the `LeagueSwitcher` (components/layout/LeagueSwitcher.tsx renders it). */
export interface LeagueChip {
  id: LeagueId;
  shortName: string;
  sectionShort: SectionConfig['shortName'];
  /** The league's region (its section's): the `data-region-scope` of the list it sits in. */
  region: RegionId;
}

function toLeagueChip(summary: LeagueSummary): LeagueChip {
  return {
    id: summary.id,
    shortName: summary.shortName,
    sectionShort: summary.section.shortName,
    region: summary.region,
  };
}

function summariesIn(region: RegionId | undefined): LeagueSummary[] {
  const all = getLeagueSummaries();
  return region === undefined ? all : all.filter((s) => s.region === region);
}

/** One chip per league, config order; with `region`, only that region's leagues. */
export function leagueChips(region?: RegionId): LeagueChip[] {
  return summariesIn(region).map(toLeagueChip);
}

/**
 * `{ all: base, <id>: base/<id> }` for a link-mode switcher, or `{ <id>: '#<id>' }` for anchor mode;
 * with `region`, only that region's leagues (the `all` entry, the index page, is always kept).
 */
export function leagueHrefs(base: string | null, region?: RegionId): Record<string, string> {
  const out: Record<string, string> = {};
  if (base) out.all = base;
  for (const { id } of summariesIn(region)) out[id] = base ? `${base}/${id}` : `#${id}`;
  return out;
}
