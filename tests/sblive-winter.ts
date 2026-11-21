/**
 * si.com for a winter build (girls soccer, boys basketball): the registry's si.com ids, the JV team pages, the
 * statewide namesakes, rule 4c's switch, and a real team games page read through the same parser and side
 * resolver the pipeline uses. tests/soccer-sblive.test.ts and tests/basketball-sblive.test.ts call this with
 * their sport; each sets SCVAL_SPORT before importing anything that reads it, so field hockey's tests never
 * see it (vitest runs each test file in its own module graph).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { beforeAll, describe, expect, it, vi } from 'vitest';

import { REPO } from './helpers';

const FIXTURES = path.join(REPO, 'tests', 'fixtures', 'sblive', 'winter-2026-11-21');

type Modules = {
  current: typeof import('../lib/sports/current');
  teams: typeof import('../lib/teams');
  leagues: typeof import('../lib/leagues');
  sblive: typeof import('../lib/sources/sblive');
  jvTeams: typeof import('../lib/jv/jv-teams');
};

export interface WinterSbliveCase {
  sport: 'soccer' | 'basketball';
  /** si.com's URL segment for the sport. */
  segment: string;
  teamCount: number;
  /** Registry slugs with no si.com JV team. */
  noJv: readonly string[];
  namesakes: readonly string[];
  /** The captured team games page: file name, the registry team it is, and its si.com team id. */
  page: { file: string; slug: string; sbliveTeamId: string };
}

export function describeWinterSblive(c: WinterSbliveCase): void {
  let m: Modules;

  beforeAll(async () => {
    vi.stubEnv('SCVAL_SPORT', c.sport);
    vi.resetModules();
    m = {
      current: await import('../lib/sports/current'),
      teams: await import('../lib/teams'),
      leagues: await import('../lib/leagues'),
      sblive: await import('../lib/sources/sblive'),
      jvTeams: await import('../lib/jv/jv-teams'),
    };
  });

  describe(`si.com for ${c.sport}`, () => {
    it(`reads si.com's ${c.segment} pages, and never replaces a MaxPreps 0-0 with a si.com winner (rule 4c)`, () => {
      expect(m.current.SPORT.id).toBe(c.sport);
      expect(m.current.SPORT.sblive).toEqual({ slug: c.segment, replacesZeroZeroTies: false });
      expect(m.sblive.SBLIVE_GAME_PATH_PREFIX).toBe(`/california/${c.segment}/games/`);
    });

    it('gives every registry team a si.com team id, slug, games page and school id, each its own', () => {
      const { TEAMS } = m.teams;
      expect(TEAMS).toHaveLength(c.teamCount);
      const teamIds = new Set<string>();
      const schoolIds = new Set<string>();
      for (const t of TEAMS) {
        const { sbliveTeamId, sbliveSchoolId, sbliveGamesUrl } = t.external;
        expect(sbliveTeamId, t.slug).toMatch(/^\d+$/);
        expect(sbliveSchoolId, t.slug).toMatch(/^\d+$/);
        expect(sbliveGamesUrl, t.slug).toMatch(
          new RegExp(`^https://www\\.si\\.com/high-school/stats/california/${c.segment}/teams/${sbliveTeamId}-[a-z0-9-]+/games$`),
        );
        teamIds.add(sbliveTeamId!);
        schoolIds.add(sbliveSchoolId!);
      }
      expect(teamIds.size).toBe(c.teamCount);
      expect(schoolIds.size).toBe(c.teamCount);
    });

    it('resolves each team by its own si.com team id, and by its school id', () => {
      for (const t of m.teams.TEAMS) {
        const ext = t.external;
        expect(m.sblive.resolveSbliveSide({ name: 'anything', rawId: ext.sbliveTeamId }), t.slug).toMatchObject({ slug: t.slug, via: 'team-id' });
        expect(
          m.sblive.resolveSbliveSide({ name: 'anything', image: `https://assets.scorebooklive.com/uploads/production/school/${ext.sbliveSchoolId}/image/x.png` }),
          t.slug,
        ).toMatchObject({ slug: t.slug, via: 'school-id' });
      }
    });

    it('lists every team’s si.com JV page (or none), whose id differs from its varsity id', () => {
      const { JV_SBLIVE_PATHS, jvSbliveTeamId, jvSbliveGamesUrl } = m.jvTeams;
      expect(Object.keys(JV_SBLIVE_PATHS).sort()).toEqual(m.teams.TEAMS.map((t) => t.slug).sort());
      for (const t of m.teams.TEAMS) {
        if (c.noJv.includes(t.slug)) {
          expect(JV_SBLIVE_PATHS[t.slug], t.slug).toBeNull();
          continue;
        }
        expect(JV_SBLIVE_PATHS[t.slug], t.slug).toMatch(/^\d+-[a-z0-9-]+-jv$/);
        expect(jvSbliveTeamId(t.slug), t.slug).not.toBe(t.external.sbliveTeamId);
        expect(jvSbliveGamesUrl(t.slug), t.slug).toMatch(new RegExp(`^https://www\\.si\\.com/high-school/stats/california/${c.segment}/teams/\\d+-[a-z0-9-]+-jv/games$`));
      }
    });

    it('never resolves a statewide namesake by name', () => {
      for (const name of c.namesakes) {
        expect(m.sblive.STATEWIDE_AMBIGUOUS.has(m.teams.normalizeTeamKey(name)), name).toBe(true);
        expect(m.sblive.resolveSbliveSide({ name }), name).toMatchObject({ slug: null, refused: 'ambiguous-name' });
      }
      expect(m.sblive.STATEWIDE_AMBIGUOUS.size).toBe(c.namesakes.length);
    });

    it('keeps the leagues’ si.com standings slugs for the id harvest, with the si.com wording on game pages', () => {
      for (const l of m.leagues.LEAGUES) {
        expect(l.sblive.backfill, l.id).toBe(true);
        expect(l.sblive.leagueSlugs.length, l.id).toBeGreaterThan(0);
        for (const s of l.sblive.leagueSlugs) expect(s, l.id).toMatch(/^\d+-[a-z0-9-]+$/);
      }
    });

    it(`reads a captured team games page (${c.page.slug}): every row on its date, the team resolved by id`, () => {
      const html = readFileSync(path.join(FIXTURES, c.page.file), 'utf8');
      const warnings: string[] = [];
      const games = m.sblive.parseTeamGamesPage(html, undefined, (w) => warnings.push(w));
      expect(warnings).toEqual([]);
      expect(games.length).toBeGreaterThan(10);
      for (const g of games) {
        expect(g.dateKey >= '2026-11-01' && g.dateKey <= '2027-03-31', g.dateKey).toBe(true);
        const mine = g.sides.find((s) => s.sbliveTeamId === c.page.sbliveTeamId);
        expect(mine, g.sbliveGameId).toMatchObject({ slug: c.page.slug, via: 'team-id' });
        expect(g.url === null || g.url.includes(m.sblive.SBLIVE_GAME_PATH_PREFIX), g.sbliveGameId).toBe(true);
      }
      // Its league opponents are ours, resolved by si.com id, never by name.
      const opponents = games.flatMap((g) => g.sides.filter((s) => s.sbliveTeamId !== c.page.sbliveTeamId));
      const ours = opponents.filter((s) => s.slug !== null);
      expect(ours.length).toBeGreaterThan(5);
      for (const s of ours) expect(['team-id', 'school-id'], `${s.name} → ${s.slug}`).toContain(s.via);
    });
  });
}
