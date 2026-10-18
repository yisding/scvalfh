/**
 * The schema.org JSON-LD the pages carry (rendered by components/layout/JsonLd.tsx): a `WebSite` on
 * `/`, a `SportsTeam` on each team page and a `SportsEvent` on each game page. Nothing here renders.
 * Server-only: it reads the site constants and the league config.
 *
 * Every property is something the page itself shows, because Google's structured-data guidelines
 * require markup to describe the visible content, and this site's copy rules (scripts/assert-copy.ts,
 * DESIGN §22.5) apply to it as much as to the prose. So:
 *
 * - No score property. schema.org has none for a SportsEvent, and an invented `homeScore` would be
 *   noise; the score is already in the event's `name` (gameTitle).
 * - `location` is only what the DETAILS card prints (components/game/GameDetails.tsx): the venue's
 *   name and street address when the school's calendar gave one; otherwise the host school, with
 *   its city when it is a registry team ("Hosted by Fremont, Sunnyvale, CA"); nothing on a neutral
 *   site, whose venue is not published. `venue.text` is MaxPreps' NOTE field ("Senior Night"), never
 *   a place.
 * - `eventStatus` is never EventCancelled: the data has no cancelled state (a deleted MaxPreps row is
 *   dropped, lib/types.ts GameStatus). A game the official schedule has on another day is
 *   EventRescheduled with that day as `previousStartDate`, the "Moved —" line the page prints.
 * - No roster `athlete` entries: the players are minors, and the visible roster is enough.
 * - A group of independents is not a league (DESIGN §24.9), so its teams carry no `memberOf`.
 *
 * Nothing here is eligible for a Google rich result (Event results need a street address and an
 * upcoming event; there is no SportsTeam result). The point is entity understanding: which school,
 * which league, which sport, which day.
 *
 * `metadataBase` does not reach inside JSON-LD, so every URL is built absolute from SITE_URL, and a
 * team's `@id` is the same IRI on its own page and in every game that names it.
 */
import type { GameModel } from '../game/game-view';
import { gameFactsDescription, gameTitle } from '../game/game-view';
import { dateTimeAttr } from '../../lib/format';
import { isIndependentLeague, type LeagueConfig } from '../../lib/leagues';
import type { Team } from '../../lib/types';

import { SITE_DESCRIPTION, SITE_NAME, SITE_SHORT_NAME, SITE_URL, SITE_WORDMARK } from './site';

/** A JSON-LD node: plain JSON, nothing a `JSON.stringify` would drop. */
export type JsonLdNode = { [key: string]: JsonLdValue };
type JsonLdValue = string | number | boolean | JsonLdNode | JsonLdValue[];

const CONTEXT = 'https://schema.org';
const SPORT = 'Field hockey';
/** Every team the site covers is a girls varsity team (SEASON_LABEL). */
const FEMALE = 'https://schema.org/Female';

const absolute = (path: string) => `${SITE_URL}${path}`;

/** The `@id` of a team, shared by its page and every game that names it. */
export function teamNodeId(slug: string): string {
  return absolute(`/teams/${slug}#team`);
}

/** `/`: the site's name, which feeds the site name a search result shows. No SearchAction: Google retired the sitelinks search box. */
export function websiteJsonLd(): JsonLdNode {
  return {
    '@context': CONTEXT,
    '@type': 'WebSite',
    '@id': absolute('/#website'),
    name: SITE_NAME,
    alternateName: [SITE_WORDMARK, SITE_SHORT_NAME],
    url: absolute('/'),
    description: SITE_DESCRIPTION,
    inLanguage: 'en-US',
  };
}

/** The league as an organization, for a team's `memberOf`; null for a group of independents. */
function leagueNode(league: LeagueConfig): JsonLdNode | null {
  if (isIndependentLeague(league.id)) return null;
  return {
    '@type': 'SportsOrganization',
    name: league.name,
    alternateName: league.shortName,
    // The league's own site, which the footer links on every page (components/layout/Attribution.tsx).
    url: league.officialUrl,
    sport: SPORT,
  };
}

/** A US city in California, the only state the site covers. */
function cityAddress(city: string): JsonLdNode {
  return { '@type': 'PostalAddress', addressLocality: city, addressRegion: 'CA', addressCountry: 'US' };
}

/** `/teams/[slug]`: the team, its city, its league and its MaxPreps page (the page's Elsewhere row links it). */
export function teamJsonLd(team: Team, league: LeagueConfig): JsonLdNode {
  const memberOf = leagueNode(league);
  const sameAs = team.external.maxprepsTeamUrl;
  // "Los Altos Eagles" and "Mitty": the names the identity card and the rows use besides `name`.
  const alternateName = [...new Set([`${team.name} ${team.mascot}`, team.shortName])].filter((n) => n !== team.name);
  return {
    '@context': CONTEXT,
    '@type': 'SportsTeam',
    '@id': teamNodeId(team.slug),
    name: team.name,
    ...(alternateName.length > 0 ? { alternateName } : {}),
    url: absolute(`/teams/${team.slug}`),
    sport: SPORT,
    gender: FEMALE,
    location: { '@type': 'Place', address: cityAddress(team.city) },
    ...(memberOf ? { memberOf } : {}),
    ...(sameAs ? { sameAs: [sameAs] } : {}),
  };
}

/** One side of a game: a registry team by its `@id` and page, anyone else by name only (DESIGN §8). */
function sideNode(side: GameModel['home']): JsonLdNode {
  return side.team
    ? {
        '@type': 'SportsTeam',
        '@id': teamNodeId(side.team.slug),
        name: side.name,
        url: absolute(`/teams/${side.team.slug}`),
        sport: SPORT,
        gender: FEMALE,
      }
    : { '@type': 'SportsTeam', name: side.name, sport: SPORT, gender: FEMALE };
}

/** Where the game is, exactly as the DETAILS card says it (see the header); null on a neutral site. */
function locationNode(model: GameModel): JsonLdNode | null {
  const { game, home } = model;
  const { address } = game.venue;
  const street: JsonLdNode | null = address
    ? {
        '@type': 'PostalAddress',
        streetAddress: address.street,
        addressLocality: address.city,
        addressRegion: address.region,
        postalCode: address.postalCode,
        addressCountry: 'US',
      }
    : null;
  if (game.venue.name) return { '@type': 'Place', name: game.venue.name, ...(street ? { address: street } : {}) };
  if (game.site === 'neutral') return null;
  const city = home.team ? cityAddress(home.team.city) : null;
  const place = street ?? city;
  return { '@type': 'Place', name: home.name, ...(place ? { address: place } : {}) };
}

/** `/game/[id]`: the contest, its two sides, when and where, and whether it moved. */
export function gameJsonLd(model: GameModel): JsonLdNode {
  const { game } = model;
  const movedFrom =
    game.official && game.official.scheduledDate !== game.dateKey ? game.official.scheduledDate : null;
  const eventStatus =
    game.status === 'postponed'
      ? 'https://schema.org/EventPostponed'
      : movedFrom
        ? 'https://schema.org/EventRescheduled'
        : 'https://schema.org/EventScheduled';
  const location = locationNode(model);
  return {
    '@context': CONTEXT,
    '@type': 'SportsEvent',
    name: gameTitle(model),
    // Not gameDescription: its recap sentence is no longer printed on the page.
    description: gameFactsDescription(model),
    url: absolute(model.canonical),
    sport: SPORT,
    // The <time datetime> the page prints: the UTC instant, or the date alone when the time is TBA.
    // A game whose date is TBA has no start to state.
    ...(game.isDateTba ? {} : { startDate: dateTimeAttr(game) }),
    eventStatus,
    ...(movedFrom ? { previousStartDate: movedFrom } : {}),
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    homeTeam: sideNode(model.home),
    awayTeam: sideNode(model.away),
    ...(location ? { location } : {}),
  };
}
