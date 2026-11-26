/**
 * A recruiting profile on a roster row with no grade (README, "Girls soccer and boys basketball: recruiting",
 * "Rows with no grade"). lib/players/rosters.ts checks a stated class year against the grade a row shows, and a
 * row with no grade has nothing to check it by, so since 2026-11-25 (owner's decision) such a row may take a page
 * on a class year with no grade to confirm it. What still holds, read from the files of every sport whatever
 * the run is for: the class year the page states is one a high school roster has this season (class of 2027 to
 * 2030 in 26-27), never a graduate's or a middle schooler's. The pages are the person's (data/player-accounts.json),
 * found on her rows through each sport's data/<sport>/player-index.json.
 */

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

type Row = { athleteId: string | null; grade: number | null; fullName: string };
type Team = { slug: string; players?: Row[] };
type Account = { platform: string; url: string; classOf: number | null };

const read = <T,>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
const SPORTS = ['field-hockey', 'soccer', 'basketball', 'volleyball'] as const;
const accounts = new Map(
  read<{ players: Array<{ playerId: string; accounts: Account[] }> }>('data/player-accounts.json').players.map((p) => [p.playerId, p.accounts]),
);

describe('profiles on rows with no grade', () => {
  for (const sport of SPORTS) {
    it(`${sport}: state a class year in high school this season, or none`, () => {
      const rosters = read<{ season: string; teams: Team[] }>(`data/${sport}/rosters.json`);
      const senior = 2000 + Number(rosters.season.slice(3));
      const inSchool = (y: number) => y >= senior && y <= senior + 3;
      const jvRosters = read<{ teams: Team[] }>(`data/${sport}/jv-rosters.json`);
      const grade = new Map(
        [...rosters.teams, ...jvRosters.teams].flatMap((t) => (t.players ?? []).flatMap((p) => (p.athleteId === null ? [] : [[`${t.slug} ${p.athleteId}`, p.grade] as const]))),
      );
      const enrichment = read<{ teams: Array<{ slug: string; players: Array<{ athleteId: string; grade: { value: number } | null }> }> }>(
        `data/${sport}/rosters-enrichment.json`,
      );
      const filled = new Set(enrichment.teams.flatMap((t) => t.players.filter((p) => p.grade !== null).map((p) => `${t.slug} ${p.athleteId}`)));
      // Every row of this season a person is found on (data/<sport>/player-index.json), and her pages.
      const index = read<{ rows: Array<[string, string, string, string | null, string]> }>(`data/${sport}/player-index.json`);
      const off: string[] = [];
      for (const [id, team, level, athleteId, name] of index.rows) {
        // A graded row: lib/players/rosters.ts (or, on a JV list, lib/jv/jv-profiles.ts) checks it.
        if (athleteId !== null && (typeof grade.get(`${team} ${athleteId}`) === 'number' || filled.has(`${team} ${athleteId}`))) continue;
        for (const x of accounts.get(id) ?? []) {
          if (x.classOf !== null && !inSchool(x.classOf)) off.push(`${level} ${team} / ${name}: ${x.platform} says ${x.classOf}`);
        }
      }
      expect(off).toEqual([]);
    });
  }
});
