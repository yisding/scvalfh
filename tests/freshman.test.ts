/**
 * The freshman level (girls soccer and boys basketball, added 2026-11-25): the committed data/<sport>/freshman.json
 * files through their read API (lib/freshman/freshman.ts), and `scripts/fetch-jv.ts --level freshman` run offline over
 * the WCAL captures in tests/fixtures/freshman (README there).
 *
 * The scheduled refresh may run this suite over the files it just wrote, so the checks on the COMMITTED files accept
 * every status the schema allows; coverage is asserted on the file built from the captures.
 */
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { REPO, runScript } from './helpers';

type Freshman = typeof import('../lib/freshman/freshman');

async function load(sport: string): Promise<{ fr: Freshman; teams: typeof import('../lib/teams'); data: typeof import('../lib/data') }> {
  vi.stubEnv('SCVAL_SPORT', sport);
  vi.resetModules();
  return {
    fr: await import('../lib/freshman/freshman'),
    teams: await import('../lib/teams'),
    data: await import('../lib/data'),
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe.each(['soccer', 'basketball'])('data/%s/freshman.json', (sport) => {
  it('validates, and lists every game once, at its own URL, apart from varsity and the JV', async () => {
    const { fr, teams, data } = await load(sport);
    expect(fr.hasFreshmanLevel()).toBe(true);
    const file = fr.getFreshmanFile()!;
    expect(file.teams.map((t) => t.slug)).toEqual(teams.TEAMS.map((t) => t.slug));
    const games = fr.getFreshmanGames();
    const slugs = fr.getFreshmanGameSlugs();
    expect(new Set(slugs).size).toBe(games.length);
    for (const [i, g] of games.entries()) {
      // No freshman game counts for a table or a postseason, and none is a varsity game.
      expect(g.countsFor).toBeNull();
      expect(g.postseason).toBeNull();
      expect(fr.getFreshmanGameBySlug(slugs[i])).toBe(g);
      expect(fr.freshmanGameHref(g)).toBe(`/freshman/game/${slugs[i]}`);
      for (const side of [g.home, g.away]) expect(side.name).not.toMatch(/^Non Freshman Opponent$|^Freshman Opponent$/);
    }
    const varsity = new Set(data.getSnapshot().games.map((g) => g.contestId));
    expect(games.some((g) => varsity.has(g.contestId))).toBe(false);
    // Every game listed is in the file, and every row of the file is listed or left out with a reason.
    expect(games.length + fr.getFreshmanDropped().length).toBe(file.games.length);
    // A school's games and a day's games are the same rows.
    const sf = fr.getFreshmanGamesForTeam('saint-francis');
    expect(sf.length).toBeGreaterThan(0);
    for (const g of sf) expect(fr.getFreshmanGamesOn(g.dateKey)).toContain(g);
    expect(fr.getFreshmanDates()).toEqual([...new Set(games.map((g) => g.dateKey))].sort());
  });
});

describe('the placeholders in a freshman schedule', () => {
  it('names "Non Freshman Opponent" in words and leaves out an unset "Freshman Opponent"', async () => {
    const soccer = await load('soccer');
    const si = soccer.fr.getFreshmanGamesForTeam('st-ignatius').find((g) => g.dateKey === '2026-11-19');
    expect(si?.status).toBe('final');
    expect([si?.home.name, si?.away.name]).toContain('Non-freshman team');

    const basketball = await load('basketball');
    const westmoor = basketball.fr.getFreshmanDropped().filter((d) => d.game.home.slug === 'westmoor' || d.game.away.slug === 'westmoor');
    for (const d of westmoor) expect(d.reason).toMatch(/^“Freshman Opponent”/);
    for (const d of basketball.fr.getFreshmanDropped()) expect(basketball.fr.freshmanGameHref(d.game)).toBeUndefined();
  });
});

describe('a build without the freshman level', () => {
  it.each(['field-hockey', 'volleyball', 'val-soccer'])('%s answers as for a season with no freshman games', async (sport) => {
    const { fr } = await load(sport);
    expect(fr.hasFreshmanLevel()).toBe(false);
    expect(fr.getFreshmanFile()).toBeNull();
    expect(fr.getFreshmanGames()).toEqual([]);
    expect(fr.getFreshmanGameSlugs()).toEqual([]);
    expect(fr.getFreshmanFetchedAt()).toBeNull();
  });
});

describe('scripts/fetch-jv.ts --level freshman, offline over the WCAL captures', () => {
  const FIXTURES = path.join(REPO, 'tests', 'fixtures', 'freshman');
  const fetchedAt = '2026-11-25T22:38:00.000Z';
  const env = (sport: string) => ({ ...process.env, SCVAL_SPORT: sport });

  it('builds a valid freshman file: the WCAL read from MaxPreps, si.com unavailable, every other league pending', async () => {
    const { fr } = await load('soccer');
    const out = path.join(mkdtempSync(path.join(tmpdir(), 'scvalfh-freshman-')), 'freshman.json');
    const r = runScript(
      'scripts/fetch-jv.ts',
      ['--level', 'freshman', '--fixtures', FIXTURES, '--leagues', 'wcal', '--out', out, '--fetched-at', fetchedAt],
      { env: env('soccer') },
    );
    expect(r.status, r.output).toBe(0);
    expect(r.stdout).toContain('fetch-jv: offline');
    expect(r.stdout).toMatch(/WCAL {3}6 teams · 6 ok/);
    const file = fr.FreshmanFileSchema.parse(JSON.parse(readFileSync(out, 'utf8')));
    expect(file.source.builtBy).toBe('scripts/fetch-jv.ts --level freshman');
    expect(file.sportSeasonId).toBe('bd80f68e-f984-4c54-92c2-1845a8572f85');
    expect(file.sblive).toEqual([]);
    const wcal = new Set(['mitty', 'riordan', 'sacred-heart-cathedral', 'saint-francis', 'st-ignatius', 'valley-christian']);
    for (const t of file.teams) {
      expect(t.sblive.status).toBe('unavailable');
      expect(t.maxpreps.status).toBe(wcal.has(t.slug) ? 'ok' : 'pending');
    }
    const sf = file.teams.find((t) => t.slug === 'saint-francis')!;
    expect(sf.maxprepsScheduleUrl).toBe('https://www.maxpreps.com/ca/mountain-view/saint-francis-lancers/soccer/girls/freshman/winter/schedule/');
    // Saint Francis' feed has four rows; the Dec 4 game against California (San Ramon) is one MaxPreps marks deleted
    // (contestState 1), so three are kept: Redwood, Livermore and Carlmont.
    const sfGames = file.games.filter((g) => g.home.slug === 'saint-francis' || g.away.slug === 'saint-francis');
    expect(sfGames.map((g) => g.dateKey)).toEqual(['2026-12-05', '2026-12-05', '2026-12-10']);
    // Five WCAL schools with games (Riordan has none) and two registry opponents of theirs from other leagues.
    expect(file.counts.teamsWithGames).toBe(7);
  });

  it('refuses the flag in a build that does not cover the freshman level', () => {
    const out = path.join(mkdtempSync(path.join(tmpdir(), 'scvalfh-freshman-')), 'freshman.json');
    const r = runScript(
      'scripts/fetch-jv.ts',
      ['--level', 'freshman', '--fixtures', FIXTURES, '--out', out, '--fetched-at', '2026-10-05T19:00:00.000Z'],
      { env: env('field-hockey') },
    );
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('this build covers no freshman level');
    expect(() => readFileSync(out)).toThrow();
  });
});
