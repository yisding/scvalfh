/**
 * The Zod contract for data/clubs.json — the youth field hockey clubs around the 43 schools swept on
 * 2026-10-03, plus any club a tracked player is tied to, plus three clubs met near the EAL teams'
 * schools on 2026-10-04 (notes[4]), and which players on the tracked varsity rosters a public page
 * ties to one (SPEC §1.1j2, DESIGN §17).
 *
 * The file is research, not a script's output: it was begun by hand on its `capturedAt` date (the
 * first sweep), every affiliation checked twice (a checker re-opened each source, then an
 * independent refuter tried to break it); a later sweep added ties and three club records
 * (notes[5]), each tie checked twice, and each club record is dated by its own `checkedOn`; nothing
 * rebuilds it. Its facts are fixed; this contract only says what shape they must have.
 *
 * Separate from lib/datasets/clubs.ts (the read API, which imports the file) so tests and scripts can parse
 * a file without loading one — the same split as lib/schema/rosters.ts / lib/datasets/rosters.ts.
 *
 * Invariants:
 *   1. club slugs are unique
 *   2. every affiliation's `club` names a club in clubs[]
 *   3. (teamSlug, athleteId, club) is unique
 *   4. every URL is https and none is on a social-media host (BANNED_HOSTS): a website, a program
 *      or roster page, and every source
 *   5. every club and every affiliation has at least one source
 *   6. a quote is 1-300 characters (it is kept for maintainers and never rendered)
 *   7. `asOf` takes one of five shapes (isAsOf); `sourceDate` is free text ("2025 Fall Season")
 *   8. the join to data/rosters.json — the row exists, carries the same fullName, is not JV, and
 *      agrees with every stated class year — lives in lib/datasets/clubs.ts: this file cannot see the rosters
 *   9. `jvAffiliations` hold the same records for players on JV rows, under the same rules (1-8,
 *      except that each must join to a JV row); a player is in one list or the other, never both
 * 1-3 and 9's one-list rule are one file-level `superRefine(checkClubsFile)`, whose every failure is a named issue with
 * a path (the lib/snapshot/check.ts idiom).
 *
 * Club records name no individual (no coaches, no directors) and that is deliberate; nothing here
 * can check it, so it is a rule for whoever edits the file.
 */

import { z } from 'zod';

import type { RegionId } from '@/lib/model/ids';
import { customIssue, slugId } from './primitives';
import { registryTeamSlug } from './registry-primitives';
import { dateOnly, httpsSourceUrl, text } from './source-url';
import { partialDateKind } from '@/lib/shared/partial-date';
import { isCalendarDate } from '@/lib/shared/patterns';

/**
 * Where a club is based. Also the display order of /clubs' regions: Northern California's (DESIGN
 * §17.1), then Southern California's from Ventura County down to San Diego, then `elsewhere`. `sacramento` (D-City,
 * Roseville FHC) and `north-state` (Chico Hotshots) hold clubs met near the EAL teams' schools;
 * neither area was searched for every club (lib/datasets/clubs.ts SEARCHED_REGIONS). The five Southern
 * California areas were added with the 2026-10-06 sweep of the Southern Section and San Diego
 * Section schools, and each was searched (`inland-empire` holds no club).
 */
export const CLUB_REGIONS = [
  'san-francisco',
  'peninsula',
  'south-bay',
  'east-bay',
  'marin',
  'central-coast',
  'sacramento',
  'north-state',
  'ventura',
  'los-angeles',
  'orange-county',
  'inland-empire',
  'san-diego',
  'elsewhere',
] as const;
export type ClubRegion = (typeof CLUB_REGIONS)[number];

/**
 * The half of the site (the NorCal/SoCal toggle, lib/config/leagues.ts REGIONS) a club region sits in, which
 * /clubs scopes its region sections by. `elsewhere` is in neither, so it shows under both.
 */
export const CLUB_REGION_SITE_REGION: Record<ClubRegion, RegionId | null> = {
  'san-francisco': 'norcal',
  peninsula: 'norcal',
  'south-bay': 'norcal',
  'east-bay': 'norcal',
  marin: 'norcal',
  'central-coast': 'norcal',
  sacramento: 'norcal',
  'north-state': 'norcal',
  ventura: 'socal',
  'los-angeles': 'socal',
  'orange-county': 'socal',
  'inland-empire': 'socal',
  'san-diego': 'socal',
  elsewhere: null,
};

/**
 * current  the source reflects the 2025-26 or 2026-27 club season (dated August 2025 or later, a
 *          club's current-players page, or a live recruiting profile that lists the club)
 * past     dated earlier, an alumni list, or a club the player's own page lists for earlier years
 * unknown  listed with no usable date: a source names the club without saying whether the player
 *          is still with it (asOf, when set, is the date or season it gives); never worded as
 *          current
 */
export const AFFILIATION_STATUSES = ['current', 'past', 'unknown'] as const;
export type AffiliationStatus = (typeof AFFILIATION_STATUSES)[number];

/**
 * high    one first-hand page names player, club and school (or is the player's own profile)
 * medium  the match rests on a club roster's class-year heading plus the club's location, on a
 *         team nickname standing for the school, on a player's nickname or given name the page
 *         does not tie to the school, or on a single self-reported line
 */
export const AFFILIATION_CONFIDENCES = ['high', 'medium'] as const;
export type AffiliationConfidence = (typeof AFFILIATION_CONFIDENCES)[number];

export const CLUB_SOURCE_KINDS = [
  /** the club's own site (a roster, a team page, a player page) */
  'club-site',
  /** a SportsRecruits athlete or organization page */
  'sportsrecruits',
  'ncsa',
  'hudl',
  'fieldlevel',
  /** a news story or a field hockey site's post (the Gilroy Dispatch, Stick Together) */
  'news',
  'school-site',
  /** a tournament or showcase list */
  'event',
  'college',
  /** the club-teams block on a MaxPreps career page */
  'maxpreps-career',
  'other',
] as const;
export type ClubSourceKind = (typeof CLUB_SOURCE_KINDS)[number];

/**
 * Hosts that serve many unrelated sites, and how many leading path segments name one site there:
 * Google Sites `/view/<site>` or `/<domain>/<site>` (2; 3 for classic `/a/<domain>/<site>`), TeamLinkt `/<league slug>` (1). A club's own
 * site on one of them is the host plus those segments, so Davis High's Google Site is never taken
 * for D-City's. Shared with components/commits/commit-view.ts.
 */
export const SHARED_SITE_HOSTS: ReadonlyMap<string, number> = new Map([
  ['sites.google.com', 2],
  ['leagues.teamlinkt.com', 1],
]);

/** Which site a URL is on: the host without `www.`, or, on a shared host, the host plus its site's path segments, lowercased. */
export function clubSiteKey(url: string): string {
  const u = new URL(url);
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const depth = SHARED_SITE_HOSTS.get(host);
  if (depth === undefined) return host;
  const segments = u.pathname.toLowerCase().split('/').filter(Boolean);
  // Classic Google Sites: /a/<domain>/<site>, one segment deeper than /<domain>/<site>.
  const n = host === 'sites.google.com' && segments[0] === 'a' ? depth + 1 : depth;
  return [host, ...segments.slice(0, n)].join('/');
}

/**
 * The five shapes an affiliation's `asOf` may take:
 *   YYYY-MM-DD   a real day                        2026-07-08
 *   YYYY-MM      a month, 01-12                    2025-10
 *   YYYY                                           2025
 *   a season     the second year is the first + 1  2025-26
 *   a range      start <= end                      2015-2018
 * "2025-27", "2025-13", "2025/26" and "2018-2015" are none of them.
 */
export function isAsOf(v: string): boolean {
  const kind = partialDateKind(v);
  return kind !== null && (kind !== 'day' || isCalendarDate(v));
}

// ---------------------------------------------------------------- building blocks


// ---------------------------------------------------------------- clubs

/** A team or program the club lists (a U16 team, a clinic, a tournament), where it says so. */
export const ClubProgramSchema = z.object({
  name: text,
  detail: text.nullable(),
  source: httpsSourceUrl,
});

/** A page the club record was read from, and what it gave. */
export const ClubSourceSchema = z.object({
  url: httpsSourceUrl,
  what: text,
});

export const ClubSchema = z.object({
  /** Ours, kebab-case: the /clubs/<slug> path. */
  slug: slugId,
  name: text,
  /** The display name when set ("SF Hawks"); `name` otherwise. */
  shortName: text.nullable(),
  /** Other names sources use for the club or its teams. Kept for maintainers; not rendered. */
  aliases: z.array(text),
  website: httpsSourceUrl.nullable(),
  city: text.nullable(),
  region: z.enum(CLUB_REGIONS),
  youth: z.boolean(),
  /** One factual sentence. */
  description: text,
  founded: z.number().int().nullable(),
  programs: z.array(ClubProgramSchema),
  /** The club's own public roster pages: linked instead of naming players who are not tracked here. */
  rosterPages: z.array(httpsSourceUrl),
  sources: z.array(ClubSourceSchema).min(1, 'a club needs at least one source'),
  checkedOn: dateOnly,
});

// ---------------------------------------------------------------- affiliations

export const AffiliationSourceSchema = z.object({
  url: httpsSourceUrl,
  kind: z.enum(CLUB_SOURCE_KINDS),
  /** Verbatim from the page. Kept in the file so a maintainer can re-check it; never rendered. */
  quote: text.max(300),
  /** The school as the page names it, when it does. */
  statedSchool: text.nullable(),
  /** The graduation year the page states; lib/datasets/clubs.ts checks it against the roster grade. */
  statedClassYear: z.number().int().min(2020).max(2040).nullable(),
  /** The page's own date, as it gives it: free text ("2025-26", "2025 Fall Season"). */
  sourceDate: text.nullable(),
});

export const ClubAffiliationSchema = z.object({
  teamSlug: registryTeamSlug,
  /** The MaxPreps per-season athlete GUID: the join key to data/rosters.json. */
  athleteId: text,
  /** As MaxPreps spells it; lib/datasets/clubs.ts refuses any other spelling. */
  fullName: text,
  club: slugId,
  /** The club's own team name ("U19 Hawks Blue"), when a source gives one. */
  clubTeam: text.nullable(),
  status: z.enum(AFFILIATION_STATUSES),
  /** The date or season the status rests on (isAsOf), when a source gives one. */
  asOf: z.string().refine(isAsOf, 'expected YYYY-MM-DD, YYYY-MM, YYYY, a season (2025-26) or a range (2015-2018)').nullable(),
  confidence: z.enum(AFFILIATION_CONFIDENCES),
  sources: z.array(AffiliationSourceSchema).min(1, 'an affiliation needs at least one source'),
  /** What the match rests on, for maintainers. Never rendered: it can name people who are not players. */
  basis: text,
});

const ClubsFileObject = z.object({
  /** How the file was made. */
  builtBy: text,
  capturedAt: dateOnly,
  /** The roster season the affiliations join to ("26-27"); lib/datasets/clubs.ts checks it is rosters.json's. */
  season: z.string().regex(/^\d{2}-\d{2}$/, 'expected a season like 26-27'),
  /** Method, rules and recall, in words. */
  notes: z.array(text),
  clubs: z.array(ClubSchema).min(1),
  affiliations: z.array(ClubAffiliationSchema),
  /**
   * Ties for players on JV rows (the overlay's `level`), kept apart from `affiliations`, which list
   * varsity rows only. Recorded on 2026-10-05; nothing renders them yet.
   */
  jvAffiliations: z.array(ClubAffiliationSchema).default([]),
});

type Ctx = z.RefinementCtx;

/** Invariants 1-3, and 9's one-list rule: what no single record can see. */
function checkClubsFile(f: z.infer<typeof ClubsFileObject>, ctx: Ctx): void {
  const slugs = new Set<string>();
  f.clubs.forEach((c, i) => {
    if (slugs.has(c.slug)) customIssue(ctx, ['clubs', i, 'slug'], `duplicate club slug ${c.slug}`);
    slugs.add(c.slug);
  });
  const triples = new Set<string>();
  f.affiliations.forEach((a, i) => {
    if (!slugs.has(a.club)) customIssue(ctx, ['affiliations', i, 'club'], `${a.club} is not a club in clubs[]`);
    const key = `${a.teamSlug} ${a.athleteId} ${a.club}`;
    if (triples.has(key)) {
      customIssue(ctx, ['affiliations', i], `duplicate affiliation: ${a.teamSlug} / ${a.fullName} / ${a.club}`);
    }
    triples.add(key);
  });
  const varsityPlayers = new Set(f.affiliations.map((a) => `${a.teamSlug} ${a.athleteId}`));
  const jvTriples = new Set<string>();
  f.jvAffiliations.forEach((a, i) => {
    if (!slugs.has(a.club)) customIssue(ctx, ['jvAffiliations', i, 'club'], `${a.club} is not a club in clubs[]`);
    const key = `${a.teamSlug} ${a.athleteId} ${a.club}`;
    if (jvTriples.has(key)) {
      customIssue(ctx, ['jvAffiliations', i], `duplicate JV affiliation: ${a.teamSlug} / ${a.fullName} / ${a.club}`);
    }
    jvTriples.add(key);
    if (varsityPlayers.has(`${a.teamSlug} ${a.athleteId}`)) {
      customIssue(ctx, ['jvAffiliations', i], `${a.teamSlug} / ${a.fullName} is also in affiliations`);
    }
  });
}

export const ClubsFileSchema = ClubsFileObject.superRefine(checkClubsFile);

export type ClubProgram = z.infer<typeof ClubProgramSchema>;
export type ClubSource = z.infer<typeof ClubSourceSchema>;
export type Club = z.infer<typeof ClubSchema>;
export type AffiliationSource = z.infer<typeof AffiliationSourceSchema>;
export type ClubAffiliation = z.infer<typeof ClubAffiliationSchema>;
export type ClubsFile = z.infer<typeof ClubsFileSchema>;
