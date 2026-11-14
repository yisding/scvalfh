/**
 * data/instagram.json — the official Instagram account of each registry team's program and of each club
 * in data/clubs.json, where we found one, keyed by slug. The team page's Elsewhere row and the club
 * page's link row read it from here.
 *
 * Social media is never a SOURCE on this site (BANNED_HOSTS, lib/players/clubs-schema.ts): these are
 * links, not facts. A team's handle is the field hockey program's own account, never the school's or
 * the athletics department's account for every sport, a booster club's, a club team's or a player's.
 * Each record says where the handle was found (`foundAt`, a page that is not social media, when there is
 * one: a club's website, a school's athletics page, a student paper) and what it rests on (`note`). A
 * proof page of the owner's own is not required (owner decision, 2026-11-13). A team whose JV squad keeps
 * its own account has a second record at `level: 'jv'`.
 *
 * The file is research, written by hand (its `builtBy` says how); no script rewrites it. A school or
 * club with no record had no account we could find and check when it was researched; that is not a
 * claim that it has none.
 *
 * Invariants, checked once at module scope so a bad file fails at import:
 *   1. a team slug is a registry team; a club slug is a club in data/clubs.json
 *   2. no slug appears twice in its list (a team at most once per level: varsity, and JV when the JV team
 *      keeps its own account), and no handle is two records'
 *   3. a handle is an Instagram username: lower case, letters, digits, `.` and `_`, at most 30
 *   4. `foundAt`, when set, is https and not social media
 *
 * One file per sport, as data/clubs.json: data/soccer/ and data/basketball/ hold empty ones until their
 * programs' accounts are researched.
 */

import { z } from 'zod';

import bundledFieldHockey from '../../data/instagram.json';
import bundledBasketball from '../../data/basketball/instagram.json';
import bundledVolleyball from '../../data/volleyball/instagram.json';
import bundledSoccer from '../../data/soccer/instagram.json';
import { validateData } from '../data-file';
import { getClub } from '../players/clubs';
import { sourceUrl } from '../players/clubs-schema';
import { calendarDateKey, slugId } from '../schema-primitives';
import { TEAMS } from '../teams';

/** This build's copy (data/ for field hockey, data/soccer/ for soccer, data/basketball/ for basketball: lib/sports/current.ts DATA_DIR). */
const bundled = process.env.SCVAL_SPORT === 'basketball' ? bundledBasketball : process.env.SCVAL_SPORT === 'volleyball' ? bundledVolleyball : process.env.SCVAL_SPORT === 'soccer' ? bundledSoccer : bundledFieldHockey;

const text = z.string().trim().min(1);

/** An Instagram username as Instagram stores it: lower case, so a link and a comparison need no folding. */
export const instagramHandle = z
  .string()
  .regex(/^[a-z0-9._]{1,30}$/, 'expected an Instagram username: lower case letters, digits, . and _, without the @');

export const InstagramAccountSchema = z.strictObject({
  /** A team slug (lib/teams.ts) or a club slug (data/clubs.json), by the list it is in. */
  slug: slugId,
  handle: instagramHandle,
  /** Where the handle was found: a page that is not social media, or null when only a search or the site's owner turned it up. */
  foundAt: sourceUrl.nullable(),
  /** How it was found and what it rests on, for maintainers ("Club website, footer links"). Never rendered. */
  note: text,
  /** The day the record was researched. */
  checkedOn: calendarDateKey,
});

export type InstagramAccount = z.infer<typeof InstagramAccountSchema>;

/** Which of a school's field hockey teams an account is: the varsity program's, or its JV team's own. */
export const INSTAGRAM_LEVELS = ['varsity', 'jv'] as const;
export type InstagramLevel = (typeof INSTAGRAM_LEVELS)[number];

/** A team's account: the varsity program's, or a JV team's when it keeps its own. */
export const TeamInstagramSchema = InstagramAccountSchema.extend({ level: z.enum(INSTAGRAM_LEVELS) });

export type TeamInstagram = z.infer<typeof TeamInstagramSchema>;

export const InstagramFileSchema = z.strictObject({
  /** How the file was made. */
  builtBy: text,
  capturedAt: calendarDateKey,
  /** Method and rules, in words. */
  notes: z.array(text),
  teams: z.array(TeamInstagramSchema),
  clubs: z.array(InstagramAccountSchema),
});

export type InstagramFile = z.infer<typeof InstagramFileSchema>;

/**
 * Parse `raw` and check what the schema cannot see: invariants 1 and 2. Throws
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
    const key = `${a.slug} ${a.level}`;
    if (seenTeams.has(key)) fail('teams', a.slug, `${a.level} listed twice`);
    seenTeams.add(key);
  }
  const seenClubs = new Set<string>();
  for (const a of file.clubs) {
    if (!getClub(a.slug)) fail('clubs', a.slug, 'not a club in data/clubs.json');
    if (seenClubs.has(a.slug)) fail('clubs', a.slug, 'listed twice');
    seenClubs.add(a.slug);
  }
  const owner = new Map<string, string>();
  for (const [list, a] of [...file.teams.map((t) => ['teams', t] as const), ...file.clubs.map((c) => ['clubs', c] as const)]) {
    const other = owner.get(a.handle);
    if (other) fail(list, a.slug, `handle ${a.handle} is already ${other}'s`);
    owner.set(a.handle, `${a.slug}${'level' in a ? ` ${a.level}` : ''}`);
  }
  return file;
}

const FILE = loadInstagram(bundled);
const BY_TEAM = new Map(FILE.teams.map((a) => [`${a.slug} ${a.level}`, a]));
const BY_CLUB = new Map(FILE.clubs.map((a) => [a.slug, a]));

export function getInstagramFile(): InstagramFile {
  return FILE;
}

/** The account's profile address: the one form of link the site renders. */
export function instagramUrl(handle: string): string {
  return `https://www.instagram.com/${handle}/`;
}

/** A team's field hockey program's official account (or its JV team's own), when the file has one. */
export function getTeamInstagram(slug: string, level: InstagramLevel = 'varsity'): TeamInstagram | null {
  return BY_TEAM.get(`${slug} ${level}`) ?? null;
}

/** A club's official account, when the file has one. */
export function getClubInstagram(slug: string): InstagramAccount | null {
  return BY_CLUB.get(slug) ?? null;
}
