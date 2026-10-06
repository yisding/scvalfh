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
 * Separate from lib/clubs.ts (the read API, which imports the file) so tests and scripts can parse
 * a file without loading one — the same split as lib/rosters-schema.ts / lib/rosters.ts.
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
 *      agrees with every stated class year — lives in lib/clubs.ts: this file cannot see the rosters
 *   9. `jvAffiliations` hold the same records for players on JV rows, under the same rules (1-8,
 *      except that each must join to a JV row); a player is in one list or the other, never both
 * 1-3 and 9's one-list rule are one file-level `superRefine(checkClubsFile)`, whose every failure is a named issue with
 * a path (the lib/snapshot-schema.ts idiom).
 *
 * Club records name no individual (no coaches, no directors) and that is deliberate; nothing here
 * can check it, so it is a rule for whoever edits the file.
 */

import { z } from 'zod';

import { isCalendarDate, isHttpsUrl, slugId } from './schema-primitives';
import { TEAMS } from './teams';
import type { RegionId } from './types';

/**
 * Where a club is based. Also the display order of /clubs' regions: Northern California's (DESIGN
 * §17.1), then Southern California's from Ventura County down to San Diego, then `elsewhere`. `sacramento` (D-City,
 * Roseville FHC) and `north-state` (Chico Hotshots) hold clubs met near the EAL teams' schools;
 * neither area was searched for every club (lib/clubs.ts SEARCHED_REGIONS). The five Southern
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
 * The half of the site (the NorCal/SoCal toggle, lib/leagues.ts REGIONS) a club region sits in, which
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
 *         team nickname standing for the school, or on a single self-reported line
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
 * Social media is never a source, nor a club's website. A host is banned when it IS one of these or
 * a subdomain of one (`www.instagram.com`, `m.facebook.com`) — never by substring, so `notx.com`
 * and `maxpreps.com` pass. The list covers the networks themselves and their short links (`fb.me`,
 * `instagr.am`, `t.co`, `youtu.be`), and is shared with data/commits.json (lib/commits-schema.ts),
 * whose commitments are most often announced on one of them.
 */
export const BANNED_HOSTS = [
  'instagram.com',
  'instagr.am',
  'facebook.com',
  'fb.com',
  'fb.me',
  'tiktok.com',
  'x.com',
  'twitter.com',
  't.co',
  'threads.net',
  'threads.com',
  'youtube.com',
  'youtu.be',
  'snapchat.com',
  'linkedin.com',
] as const;

export function isBannedHost(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false; // not a URL at all: isHttpsUrl refuses it under its own message
  }
  return BANNED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

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
  if (isCalendarDate(v)) return true;
  if (/^\d{4}$/.test(v)) return true;
  const short = /^(\d{4})-(\d{2})$/.exec(v);
  if (short) {
    const [year, tail] = [Number(short[1]), Number(short[2])];
    return (tail >= 1 && tail <= 12) || tail === (year + 1) % 100;
  }
  const range = /^(\d{4})-(\d{4})$/.exec(v);
  return range !== null && Number(range[1]) <= Number(range[2]);
}

// ---------------------------------------------------------------- building blocks

const TEAM_SLUGS: ReadonlySet<string> = new Set(TEAMS.map((t) => t.slug));
const teamSlug = slugId.refine((slug) => TEAM_SLUGS.has(slug), 'not a registry team slug');

const dateOnly = z.string().refine(isCalendarDate, 'expected YYYY-MM-DD');

/** Two refusals, two messages: not an https URL at all, or a social-media host. */
const httpsUrl = z
  .string()
  .refine(isHttpsUrl, 'expected an https URL')
  .refine((v) => !isBannedHost(v), 'social media is not a source');

const text = z.string().min(1);

// ---------------------------------------------------------------- clubs

/** A team or program the club lists (a U16 team, a clinic, a tournament), where it says so. */
export const ClubProgramSchema = z.object({
  name: text,
  detail: text.nullable(),
  source: httpsUrl,
});

/** A page the club record was read from, and what it gave. */
export const ClubSourceSchema = z.object({
  url: httpsUrl,
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
  website: httpsUrl.nullable(),
  city: text.nullable(),
  region: z.enum(CLUB_REGIONS),
  youth: z.boolean(),
  /** One factual sentence. */
  description: text,
  founded: z.number().int().nullable(),
  programs: z.array(ClubProgramSchema),
  /** The club's own public roster pages: linked instead of naming players who are not tracked here. */
  rosterPages: z.array(httpsUrl),
  sources: z.array(ClubSourceSchema).min(1, 'a club needs at least one source'),
  checkedOn: dateOnly,
});

// ---------------------------------------------------------------- affiliations

export const AffiliationSourceSchema = z.object({
  url: httpsUrl,
  kind: z.enum(CLUB_SOURCE_KINDS),
  /** Verbatim from the page. Kept in the file so a maintainer can re-check it; never rendered. */
  quote: text.max(300),
  /** The school as the page names it, when it does. */
  statedSchool: text.nullable(),
  /** The graduation year the page states; lib/clubs.ts checks it against the roster grade. */
  statedClassYear: z.number().int().min(2020).max(2040).nullable(),
  /** The page's own date, as it gives it: free text ("2025-26", "2025 Fall Season"). */
  sourceDate: text.nullable(),
});

export const ClubAffiliationSchema = z.object({
  teamSlug,
  /** The MaxPreps per-season athlete GUID: the join key to data/rosters.json. */
  athleteId: text,
  /** As MaxPreps spells it; lib/clubs.ts refuses any other spelling. */
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
  /** The roster season the affiliations join to ("26-27"); lib/clubs.ts checks it is rosters.json's. */
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

function issue(ctx: Ctx, path: Array<string | number>, message: string): void {
  ctx.addIssue({ code: 'custom', path, message });
}

/** Invariants 1-3, and 9's one-list rule: what no single record can see. */
function checkClubsFile(f: z.infer<typeof ClubsFileObject>, ctx: Ctx): void {
  const slugs = new Set<string>();
  f.clubs.forEach((c, i) => {
    if (slugs.has(c.slug)) issue(ctx, ['clubs', i, 'slug'], `duplicate club slug ${c.slug}`);
    slugs.add(c.slug);
  });
  const triples = new Set<string>();
  f.affiliations.forEach((a, i) => {
    if (!slugs.has(a.club)) issue(ctx, ['affiliations', i, 'club'], `${a.club} is not a club in clubs[]`);
    const key = `${a.teamSlug} ${a.athleteId} ${a.club}`;
    if (triples.has(key)) {
      issue(ctx, ['affiliations', i], `duplicate affiliation: ${a.teamSlug} / ${a.fullName} / ${a.club}`);
    }
    triples.add(key);
  });
  const varsityPlayers = new Set(f.affiliations.map((a) => `${a.teamSlug} ${a.athleteId}`));
  const jvTriples = new Set<string>();
  f.jvAffiliations.forEach((a, i) => {
    if (!slugs.has(a.club)) issue(ctx, ['jvAffiliations', i, 'club'], `${a.club} is not a club in clubs[]`);
    const key = `${a.teamSlug} ${a.athleteId} ${a.club}`;
    if (jvTriples.has(key)) {
      issue(ctx, ['jvAffiliations', i], `duplicate JV affiliation: ${a.teamSlug} / ${a.fullName} / ${a.club}`);
    }
    jvTriples.add(key);
    if (varsityPlayers.has(`${a.teamSlug} ${a.athleteId}`)) {
      issue(ctx, ['jvAffiliations', i], `${a.teamSlug} / ${a.fullName} is also in affiliations`);
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
