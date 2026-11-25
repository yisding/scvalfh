/**
 * A recruiting profile on a roster row with no grade (README, "Girls soccer and boys basketball: recruiting",
 * "Rows with no grade"). lib/players/rosters.ts checks a stated class year against the grade a row shows, and a
 * row with no grade has nothing to check it by, so since 2026-11-25 (owner's decision) such a row may take a page
 * on a class year with no grade to confirm it. What still holds, read from the files of every sport whatever
 * the run is for: the class year the page states is one a high school roster has this season (class of 2027 to
 * 2030 in 26-27), never a graduate's or a middle schooler's.
 */

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

type Row = { athleteId: string; grade: number | null; fullName: string };
type Team = { slug: string; players?: Row[] };
type Profile = { platform: string; url: string; classOf: number | null };

const read = <T,>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
const SPORTS = ['field-hockey', 'soccer', 'basketball', 'volleyball'] as const;

describe('profiles on rows with no grade', () => {
  for (const sport of SPORTS) {
    it(`${sport}: state a class year in high school this season, or none`, () => {
      const rosters = read<{ season: string; teams: Team[] }>(`data/${sport}/rosters.json`);
      const senior = 2000 + Number(rosters.season.slice(3));
      const inSchool = (y: number) => y >= senior && y <= senior + 3;
      const grade = new Map(rosters.teams.flatMap((t) => (t.players ?? []).map((p) => [`${t.slug} ${p.athleteId}`, p.grade])));
      const enrichment = read<{ teams: Array<{ slug: string; players: Array<{ athleteId: string; fullName: string; grade: { value: number } | null; profiles: Profile[] }> }> }>(
        `data/${sport}/rosters-enrichment.json`,
      );
      const off: string[] = [];
      for (const t of enrichment.teams) {
        for (const p of t.players) {
          if (typeof grade.get(`${t.slug} ${p.athleteId}`) === 'number' || p.grade !== null) continue; // a graded row: lib/players/rosters.ts checks it
          for (const x of p.profiles) if (x.classOf !== null && !inSchool(x.classOf)) off.push(`${t.slug} / ${p.fullName}: ${x.platform} says ${x.classOf}`);
        }
      }
      const jvRosters = read<{ teams: Team[] }>(`data/${sport}/jv-rosters.json`);
      const jvGrade = new Map(jvRosters.teams.flatMap((t) => (t.players ?? []).map((p) => [`${t.slug} ${p.fullName}`, p.grade])));
      const jv = read<{ teams: Array<{ slug: string; players: Array<{ name: string; profiles: Profile[] }> }> }>(`data/${sport}/jv-profiles.json`);
      for (const t of jv.teams) {
        for (const p of t.players) {
          if (typeof jvGrade.get(`${t.slug} ${p.name}`) === 'number') continue;
          for (const x of p.profiles) if (x.classOf !== null && !inSchool(x.classOf)) off.push(`JV ${t.slug} / ${p.name}: ${x.platform} says ${x.classOf}`);
        }
      }
      expect(off).toEqual([]);
    });
  }
});
