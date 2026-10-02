/**
 * The read API for data/rosters.json — every SCVAL team's MaxPreps roster (SPEC §1.1j).
 *
 * Built by `scripts/fetch-rosters.ts` (by hand or on a weekly schedule, not by the twice-daily
 * cron), committed, and imported here so the build bundles it — for the reason lib/history.ts and
 * lib/data.ts give: a Worker has no project filesystem. Validated once at module scope, so a bad
 * file fails at import time rather than half-way through a render. `SCVAL_ROSTERS` swaps in another
 * file through node:fs (Node only; never set it on a Worker).
 */

import { readFileSync } from 'node:fs';

import bundledRosters from '../data/rosters.json';
import {
  RostersSchema,
  type RosterPlayer,
  type Rosters,
  type TeamRoster,
} from './rosters-schema';
import type { TeamSlug } from './types';

export type { RosterPlayer, Rosters, TeamRoster } from './rosters-schema';

function load(): Rosters {
  const override = process.env.SCVAL_ROSTERS;
  let raw: unknown = bundledRosters;
  if (override) {
    let text: string;
    try {
      text = readFileSync(override, 'utf8');
    } catch (err) {
      throw new Error(
        `lib/rosters.ts: cannot read SCVAL_ROSTERS=${override} (${(err as Error).message})`,
      );
    }
    raw = JSON.parse(text) as unknown;
  }
  const parsed = RostersSchema.safeParse(raw);
  if (!parsed.success) {
    const lines = parsed.error.issues
      .slice(0, 10)
      .map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new Error(`rosters failed validation:\n${lines.join('\n')}`);
  }
  return parsed.data;
}

const rosters = load();
const BY_SLUG = new Map<string, TeamRoster>(rosters.teams.map((t) => [t.slug, t]));

export function getRosters(): Rosters {
  return rosters;
}

export function getTeamRoster(slug: TeamSlug): TeamRoster | undefined {
  return BY_SLUG.get(slug);
}

/**
 * Display order: by jersey number when at least half the roster has one (numeric part first, so
 * "00" < "1" < "21/88"; blanks last), otherwise by last name. The file keeps MaxPreps' own order.
 */
export function sortedPlayers(team: TeamRoster): RosterPlayer[] {
  const players = [...team.players];
  const numbered = players.filter((p) => p.jersey !== null).length;
  const byName = (a: RosterPlayer, b: RosterPlayer) =>
    (a.lastName ?? a.fullName).localeCompare(b.lastName ?? b.fullName) ||
    a.fullName.localeCompare(b.fullName);
  if (numbered * 2 < players.length) return players.sort(byName);
  const num = (j: string | null) => {
    const m = j === null ? null : /^\d+/.exec(j);
    return m ? Number(m[0]) : Number.POSITIVE_INFINITY;
  };
  return players.sort(
    (a, b) => num(a.jersey) - num(b.jersey) || (a.jersey ?? '').localeCompare(b.jersey ?? '') || byName(a, b),
  );
}
