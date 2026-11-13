/**
 * data/instagram.json — the official Instagram account of each registry team's program and of each club
 * in data/clubs.json, where we found one, keyed by slug. The team page's Elsewhere row and the club
 * page's link row read it from here.
 *
 * Social media is never a SOURCE on this site (BANNED_HOSTS, lib/players/clubs-schema.ts): these are
 * links, not facts. A handle is in the file only when `proof`, a page that is not social media and is
 * the owner's own (a club's website; the school's, its district's or its athletics department's site, or
 * the team's own site), links the account. That is what makes it the official one: a search result,
 * a handle that merely looks right, or an account that says it is the team's is never enough, and
 * Instagram itself is never read (it cannot be from the research environment). A team's handle is the
 * field hockey program's own account, never the school's or the athletics department's account for every
 * sport, a booster club's, a club team's or a player's.
 *
 * The file is research, written by hand (its `builtBy` says how); no script rewrites it. A school or
 * club with no record had no account linked from a page of its own when it was checked; that is
 * not a claim that it has none.
 *
 * Invariants, checked once at module scope so a bad file fails at import:
 *   1. a team slug is a registry team; a club slug is a club in data/clubs.json
 *   2. no slug appears twice in its list
 *   3. a handle is an Instagram username: lower case, letters, digits, `.` and `_`, at most 30
 *   4. `proof` is https and not social media; a club's proof is on the club's own site (clubSiteKey)
 *
 * One file per sport, as data/clubs.json: data/soccer/ and data/basketball/ hold empty ones until their
 * programs' accounts are researched.
 */

import { z } from 'zod';

import bundledFieldHockey from '../../data/instagram.json';
import bundledBasketball from '../../data/basketball/instagram.json';
import bundledSoccer from '../../data/soccer/instagram.json';
import { validateData } from '../data-file';
import { getClub } from '../players/clubs';
import { clubSiteKey, sourceUrl } from '../players/clubs-schema';
import { calendarDateKey, slugId } from '../schema-primitives';
import { TEAMS } from '../teams';

/** This build's copy (data/ for field hockey, data/soccer/ for soccer, data/basketball/ for basketball: lib/sports/current.ts DATA_DIR). */
const bundled = process.env.SCVAL_SPORT === 'basketball' ? bundledBasketball : process.env.SCVAL_SPORT === 'soccer' ? bundledSoccer : bundledFieldHockey;

const text = z.string().trim().min(1);

/** An Instagram username as Instagram stores it: lower case, so a link and a comparison need no folding. */
export const instagramHandle = z
  .string()
  .regex(/^[a-z0-9._]{1,30}$/, 'expected an Instagram username: lower case letters, digits, . and _, without the @');

export const InstagramAccountSchema = z.strictObject({
  /** A team slug (lib/teams.ts) or a club slug (data/clubs.json), by the list it is in. */
  slug: slugId,
  handle: instagramHandle,
  /** The owner's own page, not social media, that links the account. */
  proof: sourceUrl,
  /** What the proof page is, for maintainers ("Club website, footer"). Never rendered. */
  proofWhat: text,
  checkedOn: calendarDateKey,
});

export type InstagramAccount = z.infer<typeof InstagramAccountSchema>;

export const InstagramFileSchema = z.strictObject({
  /** How the file was made. */
  builtBy: text,
  capturedAt: calendarDateKey,
  /** Method and rules, in words. */
  notes: z.array(text),
  teams: z.array(InstagramAccountSchema),
  clubs: z.array(InstagramAccountSchema),
});

export type InstagramFile = z.infer<typeof InstagramFileSchema>;

/**
 * Parse `raw` and check what the schema cannot see: invariants 1, 2 and the club half of 4. Throws
 * `data/instagram.json: <list> <slug>: <what>` on the first failure. The tests call it on files built in memory.
 */
export function loadInstagram(raw: unknown): InstagramFile {
  const file = validateData('data/instagram.json', InstagramFileSchema, raw);
  const teamSlugs = new Set<string>(TEAMS.map((t) => t.slug));
  const fail = (list: string, slug: string, what: string): never => {
    throw new Error(`data/instagram.json: ${list} ${slug}: ${what}`);
  };
  const seenTeams = new Set<string>();
  for (const a of file.teams) {
    if (!teamSlugs.has(a.slug)) fail('teams', a.slug, 'not a registry team');
    if (seenTeams.has(a.slug)) fail('teams', a.slug, 'listed twice');
    seenTeams.add(a.slug);
  }
  const seenClubs = new Set<string>();
  for (const a of file.clubs) {
    const club = getClub(a.slug);
    if (!club) fail('clubs', a.slug, 'not a club in data/clubs.json');
    if (seenClubs.has(a.slug)) fail('clubs', a.slug, 'listed twice');
    seenClubs.add(a.slug);
    if (!club!.website || clubSiteKey(a.proof) !== clubSiteKey(club!.website)) {
      fail('clubs', a.slug, `proof ${a.proof} is not on the club's own site`);
    }
  }
  return file;
}

const FILE = loadInstagram(bundled);
const BY_TEAM = new Map(FILE.teams.map((a) => [a.slug, a]));
const BY_CLUB = new Map(FILE.clubs.map((a) => [a.slug, a]));

export function getInstagramFile(): InstagramFile {
  return FILE;
}

/** The account's profile address: the one form of link the site renders. */
export function instagramUrl(handle: string): string {
  return `https://www.instagram.com/${handle}/`;
}

/** A team's field hockey program's official account, when the file has one. */
export function getTeamInstagram(slug: string): InstagramAccount | null {
  return BY_TEAM.get(slug) ?? null;
}

/** A club's official account, when the file has one. */
export function getClubInstagram(slug: string): InstagramAccount | null {
  return BY_CLUB.get(slug) ?? null;
}
