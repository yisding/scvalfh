/**
 * The /clubs index's shapes and sentences: one row per club with its tied players' counts and
 * schools, grouped by region, and the lede that says which areas were searched.
 * `buildClubsIndexView` (views/clubs/club-view.ts) assembles them.
 */

import type { ClubAffiliation, ClubRegion } from '@/lib/datasets/clubs';
import { listWords, plural } from '@/lib/format/words';
import type { RegionId } from '@/lib/model/ids';

import { REGION_WORDS } from './words';

export interface ClubIndexRow {
  slug: string;
  href: string;
  /** The display name. */
  name: string;
  /** The full name (only when a short name is displayed) and the city: "San Francisco Youth Field Hockey Club · San Francisco". */
  subline: string | null;
  current: number;
  /** Earlier, or listed without a date that makes them current. */
  other: number;
  /** "30 current players", "8 players: 2 current, 6 earlier or not known to be current". */
  countLine: string;
  /** The tied players' schools, by registry name, distinct and alphabetical. */
  schools: string[];
}

export interface ClubRegionGroup {
  id: ClubRegion;
  /** The site region its section is scoped to (data-region-scope), or null for `elsewhere`, shown under both. */
  siteRegion: RegionId | null;
  heading: string;
  /** "7 clubs" */
  meta: string;
  clubs: ClubIndexRow[];
}

export interface ClubsIndexView {
  lede: string;
  /** The regions that have a club, in CLUB_REGIONS order; clubs in getClubs() order (DESIGN §17.5). */
  regions: ClubRegionGroup[];
  /** The searched areas (lib/datasets/clubs.ts SEARCHED_REGIONS) with no club, as headings: ['Peninsula', 'Central Coast']. */
  regionsWithoutClubs: string[];
  /** "This list has no club based on the Peninsula or the Central Coast."; null when every area has one. */
  regionsWithoutClubsSentence: string | null;
  /** Regions that hold a club but were not searched for clubs (not in SEARCHED_REGIONS; `elsewhere` apart), as headings. */
  regionsNotSearched: string[];
  /** "The Sacramento area and the North State were not searched for every club, so other clubs may be based there."; null when there is none. */
  regionsNotSearchedSentence: string | null;
  /** The tracked rosters: rosters.json's teams, 49 today. */
  trackedTeams: number;
  /** Distinct players tied to any club. */
  playerCount: number;
  schoolCount: number;
  clubCount: number;
  clubsWithPlayers: number;
  /**
   * "Oct 3, 2026": the file's capturedAt, the day of the first sweep. A later sweep added ties
   * without moving it (data/clubs.json notes[5]), so the page does not date the checks by it.
   */
  capturedOn: string;
  /**
   * The club seasons a "current" tie comes from: the file's roster season and the one before it,
   * "2025-26 or 2026-27" for "26-27" (notes[3]).
   */
  currentSeasons: string;
}

/**
 * "30 current players", "1 current player", "8 players: 2 current, 6 earlier or not known to be
 * current" ("earlier" alone when no tie is `unknown`), "3 players, all earlier", or none found.
 */
export function countLine(ties: readonly Pick<ClubAffiliation, 'status'>[]): string {
  const current = ties.filter((a) => a.status === 'current').length;
  const other = ties.length - current;
  const otherWords = ties.some((a) => a.status === 'unknown') ? 'earlier or not known to be current' : 'earlier';
  if (ties.length === 0) return 'No player from these rosters found';
  if (other === 0) return plural(current, 'current player');
  if (current === 0) return other === 1 ? `1 player, ${otherWords}` : `${plural(other, 'player')}, all ${otherWords}`;
  return `${plural(ties.length, 'player')}: ${current} current, ${other} ${otherWords}`;
}

/** "The Sacramento area and the North State were not searched for every club, so other clubs may be based there." */
export function notSearchedSentence(regions: readonly ClubRegion[]): string {
  const places = listWords(regions.map((r) => REGION_WORDS[r].place));
  return `${places[0].toUpperCase()}${places.slice(1)} ${regions.length === 1 ? 'was' : 'were'} not searched for every club, so other clubs may be based there.`;
}

/** "26-27" → "2025-26 or 2026-27". */
export function currentSeasons(season: string): string {
  const end = 2000 + Number(season.slice(3, 5));
  const words = (y: number) => `${y - 1}-${String(y).slice(2)}`;
  return `${words(end - 1)} or ${words(end)}`;
}

/** The page's one-paragraph answer: what it lists, then how many, and where most of them play. */
export function lede(
  trackedTeams: number,
  players: number,
  schools: number,
  clubCount: number,
  withPlayers: ClubIndexRow[],
): string {
  const opening = `Which youth clubs players on this site’s ${trackedTeams} varsity rosters play for, or played for, according to public pages that name both.`;
  const count = (r: ClubIndexRow) => `${r.name} (${r.current + r.other})`;
  const who = `${plural(players, 'player')} from ${plural(schools, 'school')} ${players === 1 ? 'is' : 'are'} tied to`;
  if (withPlayers.length === 0) return `${opening} No public page we found ties a player here to one of these ${clubCount} clubs yet.`;
  if (withPlayers.length === 1) return `${opening} ${who} one of these ${clubCount} clubs, ${count(withPlayers[0])}.`;
  return `${opening} ${who} ${withPlayers.length} of these ${clubCount} clubs, the most to ${count(withPlayers[0])} and ${count(withPlayers[1])}.`;
}
