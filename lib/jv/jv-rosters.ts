/**
 * The read API for the JV rosters: one list per school, from one of two files.
 *
 *   - data/jv-rosters.json is each registry school's MaxPreps JV roster page (`<team URL>jv/roster/`,
 *     the JV sport season), rebuilt by `pnpm fetch-rosters --level jv` with the varsity roster's own
 *     parser and the same file contract (lib/players/rosters-schema.ts RostersSchema). By hand, like
 *     the varsity rosters: not part of the twice-daily cron.
 *   - data/jv-rosters-school-sites.json is the JV lists the schools' own athletics sites publish,
 *     transcribed by hand with the date each was read (the same posture as lib/jv/jv-school-sites.ts'
 *     JV results). Validated here.
 *
 * Which one a team page shows: the school's own list when the file holds one, else MaxPreps' when it
 * lists anyone. A player on the school's varsity roster as the team page shows it (lib/players/rosters.ts,
 * less the rows a school source marks JV) is not repeated on the JV list, and the list counts them
 * (`onVarsity`): several MaxPreps JV pages carry the whole program (Marin Academy's lists all 18 varsity
 * players with their varsity numbers), and a player on both lists may be a swing player or a copy, which
 * nothing published tells apart. MaxPreps rows match by career id or by name (Hollister has one player
 * under two career records, one on each page), a school's list by name. The school's page is its JV list; where MaxPreps lists JV players for the same school
 * it lists fewer (asserted at load time), and Los Gatos' MaxPreps varsity page carries its whole
 * program, so its JV players are on the school's list, not MaxPreps' JV one. A school with neither
 * has no JV roster here: the team page shows no JV roster section, rather than an empty state on 68
 * pages that would say only that nobody published one.
 *
 * York, which plays Santa Catalina's PCAL JV slot (lib/jv/jv-teams.ts JV_OUTSIDE_TEAMS), has no list on
 * either: MaxPreps' York JV roster page lists nobody and york.org's field hockey page has a schedule
 * only (both read 2026-11-06). A JV slot team's list would go here, keyed by the school whose slot it
 * plays, when one is found.
 *
 * Imported so the build bundles both files (a Worker has no project filesystem); `SCVAL_JV_ROSTERS`
 * swaps in another MaxPreps file through node:fs (Node only; never set it on a Worker). Validated
 * once at module scope, so a bad file fails at import time rather than half-way through a render.
 */

import { readFileSync } from 'node:fs';

import { z } from 'zod';

import bundledMaxPreps from '../../data/jv-rosters.json';
import bundledSites from '../../data/jv-rosters-school-sites.json';
import { getEnrichedTeamRoster } from '../players/rosters';
import { RostersSchema, type Rosters, type TeamRoster } from '../players/rosters-schema';
import { dateKey, failValidation, httpsUrl } from '../schema-primitives';
import { getTeamBySlug } from '../teams';
import type { TeamSlug } from '../types';

export const JvSiteRosterPlayerSchema = z
  .object({
    /** As the school's page prints it, re-cased as MaxPreps rows are ("zoe ruelas" → "Zoe Ruelas") when the file is built. */
    name: z.string().min(1),
    /** A string on purpose, as on the varsity roster. null when the page gives none. */
    jersey: z.string().min(1).nullable(),
    /** 9–12, from the page's class word ("So.", "SOPHOMORE"); null when it gives none. */
    grade: z.number().int().min(9).max(12).nullable(),
    /** The page's own word ("Midfield", "Defense/Midfield"); null when it gives none. */
    position: z.string().min(1).nullable(),
    /** `5'2"`, as the page prints it; null when it gives none. */
    height: z.string().regex(/^\d'\d{1,2}"$/, 'expected feet\'inches"').nullable(),
  })
  .strict();

export const JvSiteRosterSchema = z
  .object({
    slug: z.string().refine((s) => getTeamBySlug(s) !== undefined, 'not a registry team slug'),
    /** The address the list was read from (for a 5 Star site, the roster fragment its page loads). */
    readUrl: httpsUrl,
    /** The page a reader opens to see the same list. */
    pageUrl: httpsUrl,
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

export interface JvRoster {
  slug: TeamSlug;
  source: 'maxpreps' | 'school-site';
  /** The page a reader opens to see the same list. */
  url: string;
  /** "MaxPreps" or the school site's host ("sfhsathletics.com"). */
  sourceLabel: string;
  /** When the list was read: an ISO timestamp (MaxPreps) or a date key (a school site). */
  readAt: string;
  players: JvRosterPlayer[];
  /** A school-site list only: how many JV players MaxPreps' JV page lists for the same school (0 when none). */
  maxprepsCount: number | null;
  /** Players the source lists who are on the varsity roster shown above, left off `players`. */
  onVarsity: number;
}

function loadMaxPreps(): Rosters {
  const override = process.env.SCVAL_JV_ROSTERS;
  let raw: unknown = bundledMaxPreps;
  if (override) {
    try {
      raw = JSON.parse(readFileSync(override, 'utf8')) as unknown;
    } catch (err) {
      throw new Error(`lib/jv/jv-rosters.ts: cannot read SCVAL_JV_ROSTERS=${override} (${(err as Error).message})`);
    }
  }
  const parsed = RostersSchema.safeParse(raw);
  if (!parsed.success) failValidation('jv-rosters', parsed.error.issues);
  return parsed.data;
}

function loadSites(): JvSiteRostersFile {
  const parsed = JvSiteRostersFileSchema.safeParse(bundledSites);
  if (!parsed.success) failValidation('jv-rosters-school-sites', parsed.error.issues);
  return parsed.data;
}

const maxpreps = loadMaxPreps();
const sites = loadSites();
const MAXPREPS_BY_SLUG = new Map<string, TeamRoster>(maxpreps.teams.map((t) => [t.slug, t]));
const SITE_BY_SLUG = new Map<string, JvSiteRoster>(sites.teams.map((t) => [t.slug, t]));

/** MaxPreps' JV rows for a school: those of a page that was read (this run, or carried forward). */
function maxprepsPlayers(slug: TeamSlug): TeamRoster['players'] {
  const entry = MAXPREPS_BY_SLUG.get(slug);
  return entry && (entry.status === 'ok' || entry.status === 'carried-forward') ? entry.players : [];
}

// The rule the team page relies on, checked once: a school's own list is never the shorter one.
for (const site of sites.teams) {
  const n = maxprepsPlayers(site.slug).length;
  if (n > site.players.length) {
    throw new Error(
      `lib/jv/jv-rosters.ts: ${site.slug}'s school-site JV list (${site.players.length}) is shorter than MaxPreps' JV roster (${n}); ` +
        'check which one is current before preferring the school’s.',
    );
  }
}

/** "Zoë  O'Brien" → "zoe obrien": a name compared across two sources' spellings. */
function nameKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
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

/** Leave out the players on the varsity roster; count them. */
function withoutVarsity(roster: Omit<JvRoster, 'onVarsity'>, isVarsity: (p: JvRosterPlayer, i: number) => boolean): JvRoster {
  const players = roster.players.filter((p, i) => !isVarsity(p, i));
  return { ...roster, players, onVarsity: roster.players.length - players.length };
}

function hostOf(url: string): string {
  return new URL(url).hostname.replace(/^www\./, '');
}

function fromSite(site: JvSiteRoster): Omit<JvRoster, 'onVarsity'> {
  return {
    slug: site.slug,
    source: 'school-site',
    url: site.pageUrl,
    sourceLabel: hostOf(site.pageUrl),
    readAt: site.checkedOn,
    players: site.players.map((p) => {
      const words = p.name.split(/\s+/);
      return {
        name: p.name,
        lastName: words.length > 1 ? words[words.length - 1] : null,
        jersey: p.jersey,
        grade: p.grade,
        positions: p.position ? [p.position] : [],
        height: p.height,
        isCaptain: false,
      };
    }),
    maxprepsCount: maxprepsPlayers(site.slug).length,
  };
}

function fromMaxPreps(entry: TeamRoster): Omit<JvRoster, 'onVarsity'> | null {
  if (entry.players.length === 0 || !entry.rosterUrl || !entry.fetchedAt) return null;
  return {
    slug: entry.slug,
    source: 'maxpreps',
    url: entry.rosterUrl,
    sourceLabel: 'MaxPreps',
    readAt: entry.fetchedAt,
    players: entry.players.map((p) => ({
      name: p.fullName,
      lastName: p.lastName,
      jersey: p.jersey,
      grade: p.grade,
      positions: p.positions,
      height: p.height,
      isCaptain: p.isCaptain,
    })),
    maxprepsCount: null,
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
  if (site) return withoutVarsity(fromSite(site), (p) => varsity.names.has(nameKey(p.name)));
  const entry = MAXPREPS_BY_SLUG.get(slug);
  if (!entry || (entry.status !== 'ok' && entry.status !== 'carried-forward')) return null;
  const roster = fromMaxPreps(entry);
  if (!roster) return null;
  return withoutVarsity(roster, (_, i) => {
    const row = entry.players[i];
    return (row.careerProfileId !== null && varsity.careers.has(row.careerProfileId)) || varsity.names.has(nameKey(row.fullName));
  });
}

export function getJvRostersFile(): Rosters {
  return maxpreps;
}

export function getJvSiteRostersFile(): JvSiteRostersFile {
  return sites;
}
