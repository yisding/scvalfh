/**
 * The read API for the JV rosters: one list per school, from one of two files.
 *
 *   - data/jv-rosters.json is each registry school's MaxPreps JV roster page (`<team URL>jv/roster/`,
 *     the JV sport season), rebuilt by `pnpm fetch-rosters --level jv` with the varsity roster's own
 *     parser and the same file contract (lib/players/rosters-schema.ts RostersSchema). By hand, like
 *     the varsity rosters: not part of the twice-daily cron.
 *   - data/jv-rosters-school-sites.json is the JV lists the schools' own athletics sites (or the page
 *     a school links as its roster) publish for 2026-27, transcribed by hand with the date each was read
 *     and the evidence for its season (the posture of lib/jv/jv-school-sites.ts' JV results). Validated here.
 *
 * A player on the school's varsity roster as the team page shows it (lib/players/rosters.ts, less the
 * rows a school source marks JV) is not repeated on its JV list, and the list counts them (`onVarsity`):
 * several MaxPreps JV pages carry the whole program (Marin Academy's lists all 18 varsity players with
 * their varsity numbers), and a player on both lists may be a swing player or a copy, which nothing
 * published tells apart. MaxPreps rows match by career id or by name (Hollister has one player under
 * two career records, one on each page), a school's list by name.
 *
 * Which list a team page shows, when both sources have one: the one that lists more JV players once
 * the varsity players are taken out, and the school's own on a tie. Neither source is reliably the
 * fuller one (Palo Alto's MaxPreps list has 23 to its site's 22; Los Gatos' MaxPreps JV page lists one
 * player, because its MaxPreps varsity page carries the whole program, to its site's 32). The other
 * source's count is kept (`other`) and the page names it. A school with neither has no JV roster here:
 * the team page shows no JV roster section, rather than an empty state on dozens of pages that would
 * say only that nobody published one.
 *
 * York, which plays Santa Catalina's PCAL JV slot (lib/jv/jv-teams.ts JV_OUTSIDE_TEAMS), has no list on
 * either: MaxPreps' York JV roster page lists nobody and york.org's field hockey page has a schedule
 * only (both read 2026-11-06).
 *
 * Imported so the build bundles both files (a Worker has no project filesystem); `SCVAL_JV_ROSTERS`
 * swaps in another MaxPreps file through node:fs (Node only; never set it on a Worker). Validated
 * once at module scope, so a bad file fails at import time rather than half-way through a render.
 */

import { z } from 'zod';

import bundledMaxPrepsFieldHockey from '../../data/jv-rosters.json';
import bundledSitesFieldHockey from '../../data/jv-rosters-school-sites.json';
import bundledMaxPrepsBasketball from '../../data/basketball/jv-rosters.json';
import bundledMaxPrepsSoccer from '../../data/soccer/jv-rosters.json';
import bundledSitesBasketball from '../../data/basketball/jv-rosters-school-sites.json';
import bundledSitesSoccer from '../../data/soccer/jv-rosters-school-sites.json';
import { readOverride, validateData } from '../data-file';
import { getEnrichedTeamRoster } from '../players/rosters';
import { RostersSchema, type Rosters, type TeamRoster } from '../players/rosters-schema';
import { dateKey, httpUrl } from '../schema-primitives';
import { getTeamBySlug } from '../teams';
import { IS_BASKETBALL, IS_FIELD_HOCKEY } from '../sports/current';
import type { TeamSlug } from '../types';

/** This build's copies (data/ for field hockey, data/soccer/ for soccer, data/basketball/ for basketball: lib/sports/current.ts DATA_DIR). */
const bundledMaxPreps = IS_FIELD_HOCKEY ? bundledMaxPrepsFieldHockey : IS_BASKETBALL ? bundledMaxPrepsBasketball : bundledMaxPrepsSoccer;
const bundledSites = IS_FIELD_HOCKEY ? bundledSitesFieldHockey : IS_BASKETBALL ? bundledSitesBasketball : bundledSitesSoccer;

export const JvSiteRosterPlayerSchema = z
  .object({
    /** As the school's page prints it, re-cased as MaxPreps rows are ("zoe ruelas" → "Zoe Ruelas") when the file is built. */
    name: z.string().min(1),
    /** A string on purpose, as on the varsity roster. null when the page gives none. */
    jersey: z.string().min(1).nullable(),
    /** 9–12, from the page's grade or class word ("So.", "SOPHOMORE") or graduating year; null when it gives none. */
    grade: z.number().int().min(9).max(12).nullable(),
    /** The page's own word ("Midfield", "Defense/Midfield"); null when it gives none. */
    position: z.string().min(1).nullable(),
    /** `5'2"`, as the page prints it; null when it gives none. */
    height: z.string().regex(/^\d'\d{1,2}"$/, 'expected feet\'inches"').nullable(),
    /** Only where the page marks a captain. */
    captain: z.boolean(),
  })
  .strict();

export const JvSiteRosterSchema = z
  .object({
    slug: z.string().refine((s) => getTeamBySlug(s) !== undefined, 'not a registry team slug'),
    /** The address the list was read from (a 5 Star site's roster fragment, a Google Sheet's JSON, …). */
    readUrl: httpUrl,
    /** The page a reader opens to see the same list (Lick-Wilmerding's serves http only). */
    pageUrl: httpUrl,
    season: z.literal('2026-27'),
    /** One sentence: how the list is known to be this season's. */
    seasonEvidence: z.string().min(1),
    checkedOn: dateKey,
    players: z.array(JvSiteRosterPlayerSchema).min(1),
  })
  .strict();

export const JvSiteRostersFileSchema = z
  .object({
    builtBy: z.string().min(1),
    capturedAt: dateKey,
    notes: z.array(z.string().min(1)),
    teams: z.array(JvSiteRosterSchema),
  })
  .strict()
  .refine((f) => new Set(f.teams.map((t) => t.slug)).size === f.teams.length, 'one entry per school');

export type JvSiteRoster = z.infer<typeof JvSiteRosterSchema>;
export type JvSiteRostersFile = z.infer<typeof JvSiteRostersFileSchema>;

/** One JV player as the team page lists them, whichever source the list came from. */
export interface JvRosterPlayer {
  name: string;
  /** For sorting: the last word of the name when the source gives no last name. */
  lastName: string | null;
  jersey: string | null;
  grade: number | null;
  /** MaxPreps' codes (F / M / D / G) or the school's words, as given; [] when none. */
  positions: string[];
  height: string | null;
  isCaptain: boolean;
}

export type JvRosterSource = 'maxpreps' | 'school-site';

export interface JvRoster {
  slug: TeamSlug;
  source: JvRosterSource;
  /** The page a reader opens to see the same list. */
  url: string;
  /** "MaxPreps" or the school site's host ("sfhsathletics.com"). */
  sourceLabel: string;
  /** When the list was read: an ISO timestamp (MaxPreps) or a date key (a school site). */
  readAt: string;
  /** The JV players, less those on the varsity roster. */
  players: JvRosterPlayer[];
  /** Players the source lists who are on the varsity roster the page shows, left off `players`. */
  onVarsity: number;
  /** The other source's list, when it has one: how many JV players it lists, less the varsity ones. */
  other: { source: JvRosterSource; sourceLabel: string; url: string; count: number } | null;
}

function loadMaxPreps(): Rosters {
  return validateData(
    'jv-rosters',
    RostersSchema,
    readOverride('lib/jv/jv-rosters.ts', 'SCVAL_JV_ROSTERS', bundledMaxPreps),
  );
}

function loadSites(): JvSiteRostersFile {
  return validateData('jv-rosters-school-sites', JvSiteRostersFileSchema, bundledSites);
}

const maxpreps = loadMaxPreps();
const sites = loadSites();
const MAXPREPS_BY_SLUG = new Map<string, TeamRoster>(maxpreps.teams.map((t) => [t.slug, t]));
const SITE_BY_SLUG = new Map<string, JvSiteRoster>(sites.teams.map((t) => [t.slug, t]));

/** "Zoë  O'Brien" → "zoe obrien": a name compared across two sources' spellings. */
export function nameKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The varsity roster as the team page shows it: career ids and name keys (both spellings). */
function varsityKeys(slug: TeamSlug): { careers: Set<string>; names: Set<string> } {
  const players = (getEnrichedTeamRoster(slug)?.players ?? []).filter((p) => p.level !== 'jv');
  return {
    careers: new Set(players.flatMap((p) => (p.careerProfileId ? [p.careerProfileId] : []))),
    names: new Set(players.flatMap((p) => [nameKey(p.fullName), ...(p.sourceName ? [nameKey(p.sourceName)] : [])])),
  };
}

function hostOf(url: string): string {
  return new URL(url).hostname.replace(/^(www|m)\./, '');
}

type Listed = Omit<JvRoster, 'other'>;

function fromSite(site: JvSiteRoster, varsity: ReturnType<typeof varsityKeys>): Listed {
  const all = site.players.map((p): JvRosterPlayer => {
    const words = p.name.split(/\s+/);
    return {
      name: p.name,
      lastName: words.length > 1 ? words[words.length - 1] : null,
      jersey: p.jersey,
      grade: p.grade,
      positions: p.position ? [p.position] : [],
      height: p.height,
      isCaptain: p.captain,
    };
  });
  const players = all.filter((p) => !varsity.names.has(nameKey(p.name)));
  return {
    slug: site.slug,
    source: 'school-site',
    url: site.pageUrl,
    sourceLabel: hostOf(site.pageUrl),
    readAt: site.checkedOn,
    players,
    onVarsity: all.length - players.length,
  };
}

/** MaxPreps' JV list for a school whose page was read (this run, or carried forward) and lists anyone. */
function fromMaxPreps(entry: TeamRoster | undefined, varsity: ReturnType<typeof varsityKeys>): Listed | null {
  if (!entry || (entry.status !== 'ok' && entry.status !== 'carried-forward')) return null;
  if (entry.players.length === 0 || !entry.rosterUrl || !entry.fetchedAt) return null;
  const players = entry.players
    .filter(
      (p) =>
        !((p.careerProfileId !== null && varsity.careers.has(p.careerProfileId)) || varsity.names.has(nameKey(p.fullName))),
    )
    .map(
      (p): JvRosterPlayer => ({
        name: p.fullName,
        lastName: p.lastName,
        jersey: p.jersey,
        grade: p.grade,
        positions: p.positions,
        height: p.height,
        isCaptain: p.isCaptain,
      }),
    );
  return {
    slug: entry.slug,
    source: 'maxpreps',
    url: entry.rosterUrl,
    sourceLabel: 'MaxPreps',
    readAt: entry.fetchedAt,
    players,
    onVarsity: entry.players.length - players.length,
  };
}

/**
 * A school's JV roster (see the module comment for which source), less the players on its varsity
 * roster; null when no source lists its JV players. A list whose every player is on the varsity roster
 * is still returned (with no players), so the page can say so rather than drop the section silently.
 */
export function getJvRoster(slug: TeamSlug): JvRoster | null {
  const varsity = varsityKeys(slug);
  const site = SITE_BY_SLUG.get(slug);
  const fromSchool = site ? fromSite(site, varsity) : null;
  const fromMp = fromMaxPreps(MAXPREPS_BY_SLUG.get(slug), varsity);
  const [shown, other] =
    fromSchool && fromMp
      ? fromSchool.players.length >= fromMp.players.length
        ? [fromSchool, fromMp]
        : [fromMp, fromSchool]
      : [fromSchool ?? fromMp, null];
  if (!shown) return null;
  return {
    ...shown,
    other: other
      ? { source: other.source, sourceLabel: other.sourceLabel, url: other.url, count: other.players.length }
      : null,
  };
}

export function getJvRostersFile(): Rosters {
  return maxpreps;
}

export function getJvSiteRostersFile(): JvSiteRostersFile {
  return sites;
}
