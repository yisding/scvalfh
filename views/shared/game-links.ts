/**
 * A game's off-site links in one order — Directions, the stream, Tickets, the MaxPreps page and,
 * where a host asks for it, the si.com game page — only for links that exist, so no surface offers a
 * dead affordance. One builder for the expanded game row's pills
 * (components/game-row/parts/GameLinks.tsx), the team page's NEXT card (views/teams/team-view.ts),
 * the game page's Details card (components/game/GameDetails.tsx) and the home page's pinned-team
 * card (views/home/my-team.ts), which word and trim the list their own way through the options.
 */

import type { Game } from '@/lib/model/game';

import { maxPrepsLabel } from './words/maxpreps-label';

/** One off-site link: where it goes and the words on it. */
export interface ExternalGameLink {
  href: string;
  label: string;
}

/** The links a host can ask for, in the order they print. */
export type ExternalLinkKind = 'directions' | 'stream' | 'tickets' | 'maxpreps';

const EVERY_KIND: readonly ExternalLinkKind[] = ['directions', 'stream', 'tickets', 'maxpreps'];

export interface GameExternalLinkOptions {
  /**
   * The stream link's words. Named for what is behind it by default: 'Stream' and 'MaxPreps' did
   * not say which stream or which page. Home's pinned-team card, whose chips share one short row,
   * passes 'Stream'.
   */
  streamLabel?: string;
  /** Which links to offer (default all four kinds); the order is always the one above. */
  include?: readonly ExternalLinkKind[];
  /** Add the si.com game page last ('si.com game'), for a host that is not a list row. */
  sblive?: boolean;
}

/** A Google Maps search for a street address (the venue's, when the feed gave one). */
export function mapsUrl(address: NonNullable<Game['venue']['address']>): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${address.street}, ${address.city}, ${address.region} ${address.postalCode}`,
  )}`;
}

/**
 * The game's off-site links. Directions appear only when a street address exists: a chip that
 * cannot resolve a location is a dead affordance (components/game/GameDetails.tsx, rule 2).
 */
export function gameExternalLinks(
  game: Game,
  { streamLabel = 'NFHS stream', include = EVERY_KIND, sblive = false }: GameExternalLinkOptions = {},
): ExternalGameLink[] {
  const links: ExternalGameLink[] = [];
  const address = game.venue.address;
  if (include.includes('directions') && address) links.push({ href: mapsUrl(address), label: 'Directions' });
  if (include.includes('stream') && game.urls.nfhsStream) {
    links.push({ href: game.urls.nfhsStream, label: streamLabel });
  }
  if (include.includes('tickets') && game.urls.goFan) links.push({ href: game.urls.goFan, label: 'Tickets' });
  if (include.includes('maxpreps') && game.urls.maxpreps) {
    links.push({ href: game.urls.maxpreps, label: maxPrepsLabel(game.status) });
  }
  if (sblive && game.urls.sblive) links.push({ href: game.urls.sblive, label: 'si.com game' });
  return links;
}
