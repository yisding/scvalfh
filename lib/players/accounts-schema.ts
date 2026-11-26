/**
 * The Zod contract for data/player-accounts.json: each person's own recruiting pages (NCSA, SportsRecruits,
 * FieldLevel, Hudl, Captain U, MAX Field Hockey, a claimed MaxPreps career page, a personal site), across
 * every sport, filed under the person's registry id (data/players.json).
 *
 * One file for every sport, because a page is the person's, not a roster's: a Hudl profile that lists field
 * hockey and soccer is one profile, shown on both builds' rosters, and a player who changes schools or moves
 * up from JV keeps it. Until 2026-11-26 the profiles sat on each sport's roster rows (rosters-enrichment.json
 * by MaxPreps athleteId, otherRosters' listed players by name, jv-profiles.json by the JV list's name), so a
 * new season's rows lost them and a two-sport player's were kept twice.
 *
 * The file is research, written by hand under the profile rule (lib/players/rosters-schema.ts PlayerProfileSchema:
 * a page names the player and a sport, and the school or a class year that agrees with the roster plus a
 * hometown in the school's area). What a person decided goes here; nothing rebuilds it. `pnpm build-players`
 * keeps it keyed: it rewrites an id the registry has since retired (two records found to be one person) to the
 * one that stayed, and `name` to the person's official name.
 *
 * A page shows a person's accounts on a roster row through data/<sport>/player-index.json (lib/players/accounts.ts,
 * lib/players/rosters.ts), and checks each against the row as the roster overlay's profiles always were: a class
 * year a page states must agree with the row's grade, and a MaxPreps page must be the row's own career's.
 *
 * Invariants (checked here):
 *   1. a person is listed once, players are in id order, and each has at least one account
 *   2. a URL is one account's, in the whole file: a page is one person's
 *   3. a person has at most one account per platform in each sport, and one MaxPreps page
 *   4. an account names its sports, at least one (the sports the page shows the player in), except a MaxPreps
 *      career page, which covers every sport and names none; a MAX Field Hockey page is a field hockey page
 *   5. a URL is on the platform's own host (PROFILE_HOSTS), except a personal site's
 * That every id is a registry player's, `name` one of hers and a MaxPreps page one of her careers' is
 * tests/player-accounts.test.ts's to check: the registry is never bundled.
 */

import { z } from 'zod';

import { COMMIT_SPORTS } from './commits-schema';
import { PROFILE_HOSTS, PROFILE_PLATFORMS } from './rosters-schema';
import { calendarDateKey, httpsUrl, playerId } from '../schema-primitives';
import { SPORT_IDS } from '../sports/current';

const text = z.string().min(1);

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** The `careerid` a MaxPreps career page's URL names, or null. */
export function maxPrepsCareerId(url: string): string | null {
  try {
    return new URL(url).searchParams.get('careerid');
  } catch {
    return null;
  }
}

export const AccountSchema = z
  .object({
    platform: z.enum(PROFILE_PLATFORMS),
    url: httpsUrl,
    /** The sports the page shows the player in; absent only on a MaxPreps career page, which covers every sport. */
    sports: z.array(z.enum(COMMIT_SPORTS)).min(1).optional(),
    /**
     * The research rounds that linked the page, as the build and the list they were looking at: a varsity round's
     * rule and date are in that build's rosters-enrichment.json notes (a listed player's too), a JV round's in this
     * file's `jvResearch`. Provenance, never rendered. A page a later round links names that round.
     */
    linkedBy: z.array(z.object({ build: z.enum(SPORT_IDS), list: z.enum(['varsity', 'jv']) }).strict()).min(1),
    /** The graduation year the page states, when it states one. */
    classOf: z.number().int().min(2020).max(2040).nullable(),
    /** What the link rests on, for maintainers. Never rendered. */
    note: text.nullable(),
  })
  .strict()
  .refine((a) => (a.platform === 'maxpreps') === (a.sports === undefined), {
    message: 'a MaxPreps career page names no sport; every other account names its sports',
    path: ['sports'],
  })
  .refine((a) => a.sports === undefined || new Set(a.sports).size === a.sports.length, { message: 'a sport is listed twice', path: ['sports'] })
  .refine((a) => new Set(a.linkedBy.map((r) => `${r.build} ${r.list}`)).size === a.linkedBy.length, { message: 'a round is listed twice', path: ['linkedBy'] })
  .refine((a) => a.platform !== 'maxfh' || (a.sports?.length === 1 && a.sports[0] === 'field-hockey'), {
    message: 'a MAX Field Hockey page is a field hockey page',
    path: ['sports'],
  })
  .refine((a) => a.platform !== 'maxpreps' || maxPrepsCareerId(a.url) !== null, { message: 'a MaxPreps career page names its careerid', path: ['url'] })
  .refine(
    (a) => {
      const host = hostOf(a.url);
      if (host === null) return false;
      if (a.platform === 'personal') return true;
      const want = PROFILE_HOSTS[a.platform];
      return host === want || host.endsWith(`.${want}`);
    },
    { message: 'url is not on the platform it names', path: ['url'] },
  );
export type Account = z.infer<typeof AccountSchema>;

/** One account's uniqueness keys: platform and sport, one per sport it names (a MaxPreps page one in all). */
export const accountKeys = (a: Pick<Account, 'platform' | 'sports'>): string[] => (a.sports ?? ['*']).map((s) => `${a.platform} ${s}`);

export const PersonAccountsSchema = z
  .object({
    playerId,
    /** The person's official name in the registry, for whoever reads the file: build-players keeps it so. */
    name: text,
    accounts: z.array(AccountSchema).min(1),
  })
  .strict()
  .refine((p) => {
    const keys = p.accounts.flatMap(accountKeys);
    return new Set(keys).size === keys.length;
  }, 'two accounts on one platform in one sport (or two MaxPreps pages)');
export type PersonAccounts = z.infer<typeof PersonAccountsSchema>;

/** How one sport's JV players' pages were looked for: the JV list's footnote dates it, the recruiting page reads its notes. */
export const JvResearchSchema = z
  .object({
    builtBy: text,
    capturedAt: calendarDateKey,
    notes: z.array(text),
  })
  .strict();
export type JvResearch = z.infer<typeof JvResearchSchema>;

export const AccountsFileSchema = z
  .object({
    builtBy: text,
    notes: z.array(text),
    /**
     * Each sport's JV round, as it recorded itself in data/<sport>/jv-profiles.json before the profiles were
     * filed here: the date the JV lists' profiles were looked for, and how. The varsity rows' rounds are told in
     * each sport's rosters-enrichment.json, whose `capturedAt` the team page's footnote gives.
     */
    jvResearch: z.partialRecord(z.enum(SPORT_IDS), JvResearchSchema),
    players: z.array(PersonAccountsSchema),
  })
  .strict()
  .superRefine((f, ctx) => {
    const urls = new Map<string, string>();
    f.players.forEach((p, i) => {
      if (i > 0 && f.players[i - 1].playerId >= p.playerId) {
        ctx.addIssue({ code: 'custom', path: ['players', i, 'playerId'], message: `${p.playerId} is out of order or listed twice` });
      }
      p.accounts.forEach((a, j) => {
        const owner = urls.get(a.url);
        if (owner !== undefined) ctx.addIssue({ code: 'custom', path: ['players', i, 'accounts', j, 'url'], message: `${a.url} is also ${owner}'s` });
        urls.set(a.url, p.playerId);
      });
    });
  });
export type AccountsFile = z.infer<typeof AccountsFileSchema>;
