/**
 * What scripts/fetch-rosters.ts and scripts/fetch-player-stats.ts share: which registry teams a
 * run covers, and how a run reports its teams league by league.
 *
 * Both scripts walk the whole 43-team registry. `--leagues scval,bval` narrows a run to those
 * leagues, exactly as `fetch-data --leagues` does: a team of any other league is not fetched and
 * keeps whatever the previous file held for it (or 'pending' when it held nothing). Failures are
 * scoped the same way — each team is its own unit, so one team, or one whole league, failing never
 * stops another league's teams from being read and written; a failed team keeps its own previous
 * rows as 'carried-forward'.
 *
 * Pure (no fs, no network), so tests can hold it to that.
 */

import { LEAGUES, LEAGUE_IDS, getLeague, isLeagueId } from './leagues';
import { TEAMS, getTeamBySlug } from './teams';
import type { LeagueId, Team } from './types';

/** `scval,bval` → ['scval', 'bval']; an unknown id or an empty list throws. */
export function parseLeaguesFlag(value: string, flag = '--leagues'): LeagueId[] {
  const ids = value.split(',').map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) throw new Error(`${flag} needs at least one league id`);
  for (const id of ids) {
    if (!isLeagueId(id)) throw new Error(`${flag}: unknown league ${id} (known: ${LEAGUE_IDS.join(', ')})`);
  }
  return [...new Set(ids)] as LeagueId[];
}

/** The registry teams a run covers, in registry order: all 43, or those of `leagues`. */
export function teamsInScope(leagues: readonly LeagueId[] | null): readonly Team[] {
  return leagues === null ? TEAMS : TEAMS.filter((t) => leagues.includes(t.league));
}

/** Whether a run over `leagues` (null = every league) fetches this team. */
export function inScope(team: Team, leagues: readonly LeagueId[] | null): boolean {
  return leagues === null || leagues.includes(team.league);
}

/** Keys sorted at every level, so re-running produces a byte-identical file. */
export function stableStringify(value: unknown): string {
  const normalize = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(normalize);
    if (node && typeof node === 'object') {
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(node as Record<string, unknown>).sort()) {
        const v = (node as Record<string, unknown>)[key];
        if (v !== undefined) out[key] = normalize(v);
      }
      return out;
    }
    return node;
  };
  return `${JSON.stringify(normalize(value), null, 2)}\n`;
}

/**
 * `value` as JSON with keys sorted and every key in `ignore` dropped at every level. Two files with
 * the same key differ only in what `ignore` names, so a fetch script can leave the old file in
 * place and a scheduled refresh has nothing to commit. Both scripts ignore `fetchedAt` (when a row
 * was read) and `error` (a failure's free-form message, which can carry a duration or request id).
 */
export function contentKey(value: unknown, ignore: readonly string[]): string {
  const normalize = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(normalize);
    if (node && typeof node === 'object') {
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(node as Record<string, unknown>).sort()) {
        if (ignore.includes(key)) continue;
        const v = (node as Record<string, unknown>)[key];
        if (v !== undefined) out[key] = normalize(v);
      }
      return out;
    }
    return node;
  };
  return JSON.stringify(normalize(value));
}

export interface LeagueRunSummary {
  league: LeagueId;
  shortName: string;
  /** Teams of this league in the file. */
  teams: number;
  /** Teams this run did not cover (another league's run): their rows are whatever the file held. */
  outOfScope: number;
  /** Teams this run covered whose fetch failed (carried-forward or error). */
  failed: number;
  /** Status → count, over the covered teams only. */
  byStatus: Record<string, number>;
}

/**
 * One row per league: how its teams fared this run. `failed` counts only teams the run covered
 * whose status is carried-forward or error, which is what decides a script's exit code.
 */
export function summarizeByLeague(
  teams: ReadonlyArray<{ slug: string; status: string }>,
  leagues: readonly LeagueId[] | null,
): LeagueRunSummary[] {
  return LEAGUES.map((l) => {
    const mine = teams.filter((t) => getTeamBySlug(t.slug)?.league === l.id);
    const covered = leagues === null || leagues.includes(l.id);
    const byStatus: Record<string, number> = {};
    if (covered) for (const t of mine) byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
    return {
      league: l.id,
      shortName: getLeague(l.id).shortName,
      teams: mine.length,
      outOfScope: covered ? 0 : mine.length,
      failed: (byStatus['carried-forward'] ?? 0) + (byStatus['error'] ?? 0),
      byStatus,
    };
  });
}

/** `SCVAL  15 teams · 14 ok · 1 carried-forward` / `BVAL  12 teams · not in this run`. */
export function formatLeagueSummary(s: LeagueRunSummary): string {
  const head = `${s.shortName.padEnd(5)} ${String(s.teams).padStart(2)} teams`;
  if (s.outOfScope > 0) return `${head} · not in this run (kept as they were)`;
  const parts = Object.entries(s.byStatus).map(([k, n]) => `${n} ${k}`);
  return `${head} · ${parts.join(' · ') || 'none'}`;
}
