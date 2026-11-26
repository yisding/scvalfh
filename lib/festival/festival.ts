/**
 * The read API for the 2026 National Hockey Festival (/festival, DESIGN §35): data/field-hockey/festival.json (the
 * TourneyMachine feed, normalized by scripts/fetch-festival.ts) and data/field-hockey/festival-clubs.json (which club
 * each team plays for, researched by hand).
 *
 * Both files are imported so the build bundles them (a Worker has no project filesystem) and validated once at
 * module scope: the schemas first, then the one join they cannot see, every curated club's `siteClub` against
 * data/field-hockey/clubs.json. A bad file fails at import, and so `pnpm test` and the build fail.
 *
 * Field hockey's alone (lib/sports/current.ts HAS_FESTIVAL): another sport's build reads neither file, every getter
 * returns an empty festival, and the routes are 404s there.
 *
 * Pure apart from the module-scope load: the helpers take the file as a parameter, so a view test can feed one built
 * in memory. No lib/data import (tests/data-boundary.test.ts) and no lib/sources import (build-only:
 * tests/build-only-boundary.test.ts); lib/festival/festival-names.ts holds the name rules both sides share.
 */

import bundled from '../../data/field-hockey/festival.json';
import bundledClubs from '../../data/field-hockey/festival-clubs.json';
import { validateData } from '../data-file';
import { getClub } from '../players/clubs';
import { IS_FIELD_HOCKEY } from '../sports/current';
import { FestivalClubsFileSchema, type FestivalClubsFile } from './festival-clubs-schema';
import { automaticClubName, clubMatchText, matchesPrefix, slugify, uniqueSlug } from './festival-names';
import { FestivalFileSchema, type FestivalFile, type FestivalGame } from './festival-schema';

export type {
  FestivalDivision,
  FestivalField,
  FestivalFile,
  FestivalFormat,
  FestivalGame,
  FestivalGameStatus,
  FestivalPool,
  FestivalRecord,
  FestivalSide,
  FestivalSource,
  FestivalTeam,
  FestivalTournament,
  FestivalVenue,
} from './festival-schema';
export type { FestivalClubEvidence, FestivalClubsFile, FestivalCuratedClub } from './festival-clubs-schema';

/**
 * A game's length: 55 minutes for both formats (11v11: two 25-minute halves and a 5-minute half time, regs §E;
 * 7v7: four 12-minute quarters). USA Field Hockey: "The format is 55-minute games".
 */
export const FESTIVAL_GAME_MINUTES = 55;

/** Parse `raw` against the festival contract (lib/festival/festival-schema.ts). Tests call it on files built in memory. */
export function loadFestival(raw: unknown): FestivalFile {
  return validateData('festival', FestivalFileSchema, raw);
}

/**
 * Parse `raw` against the clubs contract, then check that every `siteClub` is a club in data/field-hockey/clubs.json.
 * Throws on the first failure.
 */
export function loadFestivalClubs(
  raw: unknown,
  hasClub: (slug: string) => boolean = (s) => getClub(s) !== undefined,
): FestivalClubsFile {
  const file = validateData('festival-clubs', FestivalClubsFileSchema, raw);
  for (const c of file.clubs) {
    if (c.siteClub !== null && !hasClub(c.siteClub)) {
      throw new Error(`festival-clubs: ${c.slug} names siteClub ${c.siteClub}, which is not a club in data/field-hockey/clubs.json`);
    }
  }
  return file;
}

const EMPTY: FestivalFile = {
  fetchedAt: '1970-01-01T00:00:00.000Z',
  sourceVersion: 'none',
  tournament: {
    id: 'none',
    name: 'none',
    startDate: '1970-01-01',
    endDate: '1970-01-01',
    timeZone: 'America/New_York',
    utcOffset: '-05:00',
    venue: { name: 'none', address: 'none', city: 'none', state: 'none', zip: 'none', lat: 0, lng: 0 },
    resultsUrl: 'https://tourneymachine.com/',
    infoUrl: 'https://www.usafieldhockey.com/',
  },
  fields: [],
  divisions: [],
  teams: [],
  games: [],
};

const EMPTY_CLUBS: FestivalClubsFile = { checkedOn: '1970-01-01', sources: [], clubs: [] };

const file: FestivalFile = IS_FIELD_HOCKEY ? loadFestival(bundled) : EMPTY;
const clubsFile: FestivalClubsFile = IS_FIELD_HOCKEY ? loadFestivalClubs(bundledClubs) : EMPTY_CLUBS;

/** The whole festival file. */
export function getFestival(): FestivalFile {
  return file;
}

/** The whole curated clubs file (its sources and checkedOn as well as the clubs). */
export function getFestivalClubsFile(): FestivalClubsFile {
  return clubsFile;
}

// ---------------------------------------------------------------- clubs

/** A club at the festival: a curated one (festival-clubs.json) or one made from a team name no curated club matches. */
export interface FestivalClub {
  slug: string;
  name: string;
  region: string | null;
  california: boolean;
  norCal: boolean;
  /** Its slug in data/field-hockey/clubs.json (/clubs/<slug>), when this site has a page for it. */
  siteClub: string | null;
  /** Its teams, in the file's order: division display order, then name. */
  teamIds: string[];
  curated: boolean;
  /** Notes on its teams, by team id (the file keys them by TourneyMachine name). */
  teamNotes: Record<string, string>;
}

export interface ResolvedFestivalClubs {
  /** Every club with at least one team, A–Z by name. */
  clubs: FestivalClub[];
  /** team id → club slug, for every team. */
  clubOfTeam: Map<string, string>;
  /** Curated clubs no team matched (a club that withdrew, or a prefix that no longer fits): empty today. */
  unmatched: string[];
}

/**
 * Which club each team plays for. A team joins the curated club with the longest `match` prefix its name starts
 * with (clubMatchText: lower case, leading age token removed), at a word boundary. Prefixes are unique across clubs
 * (festival-clubs-schema invariant 1), and two different prefixes of one name cannot be the same length, so the
 * longest is never a tie. A team no curated club matches gets an automatic club named by automaticClubName ('AGH U16
 * 2' → 'AGH'), shared by every such team of that name, whose slug takes '-2' if a curated club already has it.
 * Pure and deterministic.
 */
export function resolveFestivalClubs(festival: FestivalFile, clubs: FestivalClubsFile): ResolvedFestivalClubs {
  const prefixes = clubs.clubs
    .flatMap((c) => c.match.map((m) => ({ prefix: m, slug: c.slug })))
    .sort((a, b) => b.prefix.length - a.prefix.length);
  const taken = new Set(clubs.clubs.map((c) => c.slug));
  const out = new Map<string, FestivalClub>(
    clubs.clubs.map((c) => [
      c.slug,
      {
        slug: c.slug,
        name: c.name,
        region: c.region,
        california: c.california,
        norCal: c.norCal,
        siteClub: c.siteClub,
        teamIds: [],
        curated: true,
        teamNotes: {},
      },
    ]),
  );
  /** automatic club name's slug base → its slug, so teams of one name share a club. */
  const automatic = new Map<string, string>();
  const clubOfTeam = new Map<string, string>();
  for (const team of festival.teams) {
    const text = clubMatchText(team.name);
    let slug = prefixes.find((p) => matchesPrefix(text, p.prefix))?.slug;
    if (slug === undefined) {
      const name = automaticClubName(team.name);
      const base = slugify(name) || 'club';
      slug = automatic.get(base);
      if (slug === undefined) {
        slug = uniqueSlug(base, taken);
        automatic.set(base, slug);
        out.set(slug, {
          slug,
          name,
          region: null,
          california: false,
          norCal: false,
          siteClub: null,
          teamIds: [],
          curated: false,
          teamNotes: {},
        });
      }
    }
    const club = out.get(slug)!;
    club.teamIds.push(team.id);
    clubOfTeam.set(team.id, slug);
    const note = clubs.clubs.find((c) => c.slug === slug)?.teamNotes?.[team.name];
    if (note !== undefined) club.teamNotes[team.id] = note;
  }
  const all = [...out.values()];
  return {
    clubs: all.filter((c) => c.teamIds.length > 0).sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || a.slug.localeCompare(b.slug)),
    clubOfTeam,
    unmatched: all.filter((c) => c.curated && c.teamIds.length === 0).map((c) => c.slug),
  };
}

const RESOLVED = resolveFestivalClubs(file, clubsFile);

/** Every club with a team at the festival, A–Z. */
export function festivalClubs(): readonly FestivalClub[] {
  return RESOLVED.clubs;
}

/** team id → club slug, for every team. */
export function festivalClubOfTeam(): ReadonlyMap<string, string> {
  return RESOLVED.clubOfTeam;
}

// ---------------------------------------------------------------- route params

/** /festival/[division] params, in display order. */
export function festivalDivisionSlugs(): string[] {
  return file.divisions.map((d) => d.slug);
}

/** /festival/clubs/[club] params, A–Z. */
export function festivalClubSlugs(): string[] {
  return RESOLVED.clubs.map((c) => c.slug);
}

/** /festival/teams/[team] params, in the file's order. */
export function festivalTeamSlugs(): string[] {
  return file.teams.map((t) => t.slug);
}

// ---------------------------------------------------------------- slots

/** A time slot: every game that starts at one time, on any field. */
export interface FestivalSlot {
  /** Venue wall clock: '2026-11-26T08:00:00'. */
  start: string;
  startUtc: string;
  /** startUtc + FESTIVAL_GAME_MINUTES. */
  endUtc: string;
  games: number;
}

/** The distinct start times, in order, each with when its games end and how many there are. */
export function festivalSlots(festival: { games: readonly Pick<FestivalGame, 'start' | 'startUtc'>[] }): FestivalSlot[] {
  const slots = new Map<string, FestivalSlot>();
  for (const g of festival.games) {
    const slot = slots.get(g.startUtc);
    if (slot) slot.games += 1;
    else {
      const endUtc = new Date(Date.parse(g.startUtc) + FESTIVAL_GAME_MINUTES * 60_000).toISOString().replace('.000Z', 'Z');
      slots.set(g.startUtc, { start: g.start, startUtc: g.startUtc, endUtc, games: 1 });
    }
  }
  return [...slots.values()].sort((a, b) => a.startUtc.localeCompare(b.startUtc));
}
