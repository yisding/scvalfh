/**
 * MaxPreps team stats GAME BY GAME — `GET /gatewayweb/react/team-season-game-stats/rollup/v1
 * ?teamId=&sportSeasonId=` on the ghost API (SPEC §1.1k), the sibling of the player stats rollup
 * (lib/sources/maxpreps/player-stats.ts) in the same page chunk.
 *
 * Read only for a team a game note credits with stats (lib/engine/note-stats.ts): it says what
 * the coach has ALREADY entered on the stats sheet for each game, so a goal, assist or save the
 * note names is not counted twice.
 *
 * Shape [V] 2026-10-06 (Homestead): the same `data.groups[]` → `subgroups[]` → `stats.columns[]` /
 * `stats.rows[].columns[i]` tables as the player rollup, one row per game instead of per player.
 * Column `Result` ("W 3-0") links the game page, whose `?c=` is the contest id; `Goals`, `Assists`
 * and `Saves` are the team's counts for that game, "0" when nothing was entered. A team whose coach
 * has entered no stats answers the same HTTP 400 "No data was found" as the rollup.
 */

import { z } from 'zod';

import { SPORT_SEASON_ID } from '@/lib/config/season';
import { MAXPREPS_API } from '@/lib/config/source-urls';
import type { GameTotal } from '@/lib/schema/player-stats';

import type { MaxPrepsClient } from './client';
import { MaxPrepsError } from './error';
import { fetchRollupBody } from './rollup';
import { envelope } from './schemas';

export function gameStatsUrl(teamId: string, sportSeasonId = SPORT_SEASON_ID): string {
  return `${MAXPREPS_API}/gatewayweb/react/team-season-game-stats/rollup/v1?teamId=${teamId}&sportSeasonId=${sportSeasonId}`;
}

const CellSchema = z.looseObject({ value: z.string().nullable(), href: z.string().nullable().optional() });

const ResponseSchema = envelope(
  z
    .looseObject({
      teamId: z.string(),
      sportSeasonId: z.string(),
      groups: z.array(
        z.looseObject({
          name: z.string(),
          subgroups: z.array(
            z.looseObject({
              stats: z.looseObject({
                columns: z.array(z.looseObject({ name: z.string() })),
                rows: z.array(z.looseObject({ columns: z.array(CellSchema) })),
              }),
            }),
          ),
        }),
      ),
    })
    .nullable(),
);

/** MaxPreps column → the stat a game note can name. */
const COLUMNS = { Goals: 'goals', Assists: 'assists', Saves: 'saves' } as const;

function fail(what: string, url: string): never {
  throw new MaxPrepsError(`game stats: ${what}`, { url });
}

/** "…/9-30-2026/?c=d6ec9aac-…" → "d6ec9aac-…". */
export function contestIdFromUrl(href: string | null | undefined): string | null {
  if (!href) return null;
  try {
    return new URL(href).searchParams.get('c');
  } catch {
    return null;
  }
}

export interface ParseGameStatsOptions {
  expectedTeamId?: string;
  url?: string;
}

/**
 * The response → one row per game, in MaxPreps' order; [] when MaxPreps has no stats for the team
 * (the 400 "No data was found" envelope: nothing entered for any game). Throws on anything it
 * cannot read with certainty.
 */
export function parseGameStats(raw: unknown, opts: ParseGameStatsOptions = {}): GameTotal[] {
  const url = opts.url ?? '(game stats)';
  const parsed = ResponseSchema.safeParse(raw);
  if (!parsed.success) fail(`schema drift: ${parsed.error.issues[0]?.message ?? 'unknown'}`, url);
  const { data, status, message } = parsed.data;
  if (data === null) {
    if (String(status) === '400' && typeof message === 'string' && /^no data was found/i.test(message.trim())) return [];
    fail(`no data and status ${String(status)}`, url);
  }
  if (data.sportSeasonId !== SPORT_SEASON_ID) fail(`sportSeasonId ${data.sportSeasonId}, expected ${SPORT_SEASON_ID}`, url);
  if (opts.expectedTeamId && data.teamId !== opts.expectedTeamId) {
    fail(`teamId ${data.teamId}, expected ${opts.expectedTeamId}`, url);
  }

  const byGame = new Map<string, GameTotal>();
  for (const group of data.groups) {
    for (const sub of group.subgroups) {
      const cols = sub.stats.columns.map((c) => c.name);
      const resultAt = cols.indexOf('Result');
      if (resultAt < 0) fail(`${group.name}: no Result column`, url);
      for (const row of sub.stats.rows) {
        if (row.columns.length !== cols.length) fail(`${group.name}: a row has ${row.columns.length} cells for ${cols.length} columns`, url);
        const contestId = contestIdFromUrl(row.columns[resultAt].href);
        if (!contestId) continue; // a game with no page has no id to match a note to
        const game = byGame.get(contestId) ?? { contestId, goals: 0, assists: 0, saves: 0 };
        cols.forEach((name, at) => {
          const key = COLUMNS[name as keyof typeof COLUMNS];
          if (!key) return;
          const v = row.columns[at].value?.trim() ?? '';
          const n = v === '' ? 0 : Number(v);
          if (!Number.isInteger(n) || n < 0) fail(`${group.name}: ${name} is "${v}", not a count`, url);
          // Goals appear in both field subgroups; the larger is what was entered.
          game[key] = Math.max(game[key], n);
        });
        byGame.set(contestId, game);
      }
    }
  }
  return [...byGame.values()];
}

export async function fetchGameStats(
  client: MaxPrepsClient,
  teamId: string,
  /** Sees the raw body before anything reads it — scripts/fetch-player-stats.ts --capture. */
  onRaw?: (body: string) => void,
): Promise<GameTotal[]> {
  const url = gameStatsUrl(teamId);
  const raw = await fetchRollupBody(client, url, onRaw, {
    nonJson400: 'invalid-json',
    invalidJson: (detail) => new MaxPrepsError(`game stats: invalid JSON: ${detail}`, { url }),
  });
  return parseGameStats(raw, { expectedTeamId: teamId, url });
}
