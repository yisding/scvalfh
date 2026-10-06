/**
 * lib/sources/maxpreps-player-stats.ts — the team-season-player-stats rollup, over the 15
 * captures in tests/fixtures/maxpreps/stats-<slug>.json (2026-10-02; SCVAL's teams, the first
 * league captured — the adapter reads every league's teams the same way).
 *
 * The adapter's promises: a team with no stats is null (not an error), a stat the team does not
 * track is null while a tracked 0 stays 0, every row joins to the roster on the career id, and
 * anything it cannot read with certainty throws.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { getRosters } from '../lib/rosters';
import { MaxPrepsClient, NEXT_DATA_RE } from '../lib/sources/maxpreps';
import {
  fetchPlayerStats,
  joinToRoster,
  parsePlayerStats,
  pendingPlayerStats,
  playerStatsUrl,
  reconcileTotals,
  teamStatsPageUrl,
} from '../lib/sources/maxpreps-player-stats';
import {
  FIELD_STAT_KEYS,
  PlayerStatsFileSchema,
  countPlayerStats,
  type FieldStatKey,
  type GoalieStatKey,
} from '../lib/player-stats-schema';
import { SPORT_SEASON_ID } from '../lib/season';
import { TEAMS as REGISTRY, teamsInLeague } from '../lib/teams';
import { FIXTURE_DIR } from './helpers';

/** The 15 captures are SCVAL's: the first league captured. */
const TEAMS = teamsInLeague('scval');

const raw = (slug: string): unknown =>
  JSON.parse(readFileSync(path.join(FIXTURE_DIR, `stats-${slug}.json`), 'utf8')) as unknown;
const rosterOf = (slug: string) => getRosters().teams.find((t) => t.slug === slug)!;
const parse = (slug: string) =>
  parsePlayerStats(raw(slug), { expectedTeamId: rosterOf(slug).maxprepsTeamId! });

/** A deep copy of a fixture's `data`, for building drift cases. */
function mutable(slug: string) {
  return structuredClone(raw(slug)) as {
    data: {
      teamId: string;
      sportSeasonId: string;
      groups: Array<{
        name: string;
        subgroups: Array<{
          name: string;
          stats: {
            columns: Array<{ name: string; overallValue: string | null }>;
            rows: Array<{ columns: Array<{ value: string | null; href?: string | null }> }>;
          };
        }>;
      }>;
    };
  };
}

describe('parsePlayerStats over the captures', () => {
  const NONE = ['cupertino', 'los-altos', 'los-gatos', 'lynbrook', 'saratoga'];

  it('reads ten teams and returns null for the five MaxPreps has no stats for', () => {
    for (const team of TEAMS) {
      const page = parse(team.slug);
      if (NONE.includes(team.slug)) expect(page, team.slug).toBeNull();
      else expect(page?.players.length, team.slug).toBeGreaterThan(0);
    }
  });

  it('agrees with the roster pages: the no-stats teams are exactly those with no hasStats athlete', () => {
    for (const team of TEAMS) {
      const html = readFileSync(path.join(FIXTURE_DIR, `roster-${team.slug}.html`), 'utf8');
      const rows = (
        JSON.parse(NEXT_DATA_RE.exec(html)![1]) as { props: { pageProps: { athleteData: unknown[][] } } }
      ).props.pageProps.athleteData;
      // athleteData index 15 is hasStats, 17 isDeleted (lib/sources/maxpreps-roster.ts ROSTER_KEYS).
      const flagged = rows.some((r) => r[15] === true && r[17] !== true);
      expect(parse(team.slug) !== null, team.slug).toBe(flagged);
    }
  });

  it('keeps a stat only where the team tracks it: untracked is null, a tracked 0 is 0', () => {
    for (const team of TEAMS) {
      const page = parse(team.slug);
      if (!page) continue;
      for (const p of page.players) {
        for (const [k, v] of Object.entries(p.field ?? {})) {
          if (!page.tracked.field.includes(k as never)) expect(v, `${team.slug} ${p.shortName} ${k}`).toBeNull();
        }
        for (const [k, v] of Object.entries(p.goalkeeping ?? {})) {
          if (!page.tracked.goalkeeping.includes(k as never)) expect(v, `${team.slug} ${p.shortName} ${k}`).toBeNull();
        }
      }
    }
    // Homestead's coach enters goals but no assists: the column is not tracked, so null, not 0.
    const homestead = parse('homestead')!;
    expect(homestead.tracked.field).not.toContain('assists');
    expect(homestead.players.every((p) => p.field?.assists === null)).toBe(true);
    // Valley Christian tracks goals; a defender with none has a real 0.
    const traas = parse('valley-christian')!.players.find((p) => p.shortName === 'E. Traas')!;
    expect(traas.field).toMatchObject({ goals: 0, assists: 3, points: 3, gamesPlayed: 6 });
  });

  it('merges the overflow subgroup and the goalkeeping table into one line per player', () => {
    const sf = parse('saint-francis')!;
    const keys = sf.players.map((p) => p.careerId);
    expect(new Set(keys).size).toBe(keys.length);
    const goalies = sf.players.filter((p) => p.goalkeeping !== null);
    expect(goalies.map((g) => g.shortName).sort()).toEqual(['N. Kalina', 'N. Lagenfeld']);
    expect(goalies.find((g) => g.shortName === 'N. Kalina')!.goalkeeping!.saves).toBe(9);
  });

  it('warns about nothing but what is known: no unknown column or group, no new warning of any kind', () => {
    // The only warnings the 15 captures raise: a goalie games total with no goalie holding any
    // (reconcileTotals). A new column or group MaxPreps adds, or any other new warning, fails here.
    const KNOWN: Record<string, string[]> = {
      fremont: ['goalkeeping gamesPlayed: team total is 14 but no player has any; not shown rather than as zeros'],
      homestead: ['goalkeeping gamesPlayed: team total is 10 but no player has any; not shown rather than as zeros'],
      presentation: ['goalkeeping gamesPlayed: team total is 3 but no player has any; not shown rather than as zeros'],
    };
    for (const team of TEAMS) {
      const page = parse(team.slug);
      if (!page) continue;
      expect(page.warnings, team.slug).toEqual(KNOWN[team.slug] ?? []);
    }
    expect(Object.keys(KNOWN).every((slug) => TEAMS.some((t) => t.slug === slug))).toBe(true);
  });

  it('would say so if MaxPreps added a column or a group', () => {
    const drift = mutable('palo-alto');
    const sub = drift.data.groups[0].subgroups[0];
    sub.stats.columns.push({ name: 'Interceptions', overallValue: '3' });
    for (const row of sub.stats.rows) row.columns.push({ value: '0' });
    drift.data.groups.push({ name: 'Defense Stats', subgroups: [] });
    const page = parsePlayerStats(drift, { expectedTeamId: rosterOf('palo-alto').maxprepsTeamId! })!;
    expect(page.warnings).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/ignored unknown column Interceptions$/),
        'ignored stats group "Defense Stats"',
      ]),
    );
  });

  it('points are 2 per goal + 1 per assist on every team, so no points warning fires', () => {
    for (const team of TEAMS) {
      const page = parse(team.slug);
      if (!page) continue;
      expect(page.warnings.filter((w) => /points/.test(w)), team.slug).toEqual([]);
      for (const p of page.players) {
        const f = p.field;
        if (f?.points != null && f.goals != null) {
          expect(f.points, `${team.slug} ${p.shortName}`).toBe(2 * f.goals + (f.assists ?? 0));
        }
      }
    }
  });

  it('joins every row to the roster on the career id', () => {
    for (const team of TEAMS) {
      const page = parse(team.slug);
      if (!page) continue;
      const { lines, warnings } = joinToRoster(page, rosterOf(team.slug).players);
      expect(warnings, team.slug).toEqual([]);
      for (const l of lines) {
        expect(l.onRoster, `${team.slug} ${l.shortName}`).toBe(true);
        const last = l.shortName.split(' ').slice(1).join(' ');
        expect(l.fullName, `${team.slug} ${l.shortName}`).toContain(last);
      }
    }
  });
});

describe('reconcileTotals: the tracked stats hold up against the rows', () => {
  const zeros = (keys: string[]) => Object.fromEntries(keys.map((k) => [k, 0]));
  const page = (rows: Array<Record<string, number>>, total: Record<string, number>) => ({
    tracked: { field: Object.keys(total) as FieldStatKey[], goalkeeping: [] as GoalieStatKey[] },
    totals: { field: total as Partial<Record<FieldStatKey, number>>, goalkeeping: {} },
    players: rows.map((r) => ({ field: { ...zeros([...FIELD_STAT_KEYS]), ...r } as Record<string, number | null>, goalkeeping: null })),
    warnings: [] as string[],
  });

  it('drops a stat whose team total no player holds (Hollister minutes), with a warning', () => {
    const r = reconcileTotals(page([{ goals: 2, minutes: 0 }, { goals: 1, minutes: 0 }], { goals: 3, minutes: 60 }));
    expect(r.tracked.field).toEqual(['goals']);
    expect(r.totals.field).toEqual({ goals: 3 });
    expect(r.players.map((p) => p.field!.minutes)).toEqual([null, null]);
    expect(r.players.map((p) => p.field!.goals)).toEqual([2, 1]);
    expect(r.warnings).toEqual([expect.stringMatching(/minutes: team total is 60 but no player has any/)]);
  });

  it('keeps a stat any one player holds, and a real 0 beside it', () => {
    const r = reconcileTotals(page([{ goals: 2 }, { goals: 0 }], { goals: 2 }));
    expect(r.tracked.field).toEqual(['goals']);
    expect(r.players.map((p) => p.field!.goals)).toEqual([2, 0]);
    expect(r.warnings).toEqual([]);
  });

  it('flags rows that add up to more than the team total, and keeps both as published', () => {
    const r = reconcileTotals(page([{ goals: 6 }, { goals: 4 }], { goals: 7 }));
    expect(r.players.map((p) => p.field!.goals)).toEqual([6, 4]);
    expect(r.totals.field.goals).toBe(7);
    expect(r.warnings).toEqual([expect.stringMatching(/goals: players add up to 10, above MaxPreps' team total of 7/)]);
  });

  it('does not compare games or minutes, which do not add across players, and flags nothing for fewer', () => {
    const r = reconcileTotals(page([{ gamesPlayed: 9, minutes: 40, goals: 1 }, { gamesPlayed: 8, minutes: 50, goals: 1 }], { gamesPlayed: 10, minutes: 60, goals: 5 }));
    expect(r.warnings).toEqual([]);
    expect(r.tracked.field).toEqual(['gamesPlayed', 'minutes', 'goals']);
  });

  it('leaves the input untouched', () => {
    const input = page([{ minutes: 0 }], { minutes: 60 });
    const before = structuredClone(input);
    reconcileTotals(input);
    expect(input).toEqual(before);
  });

  it('is what the parser applies: Fremont\'s goalie games total has no player behind it', () => {
    const fremont = parse('fremont')!;
    expect(fremont.tracked.goalkeeping).not.toContain('gamesPlayed');
    expect(fremont.players.every((p) => p.goalkeeping === null || p.goalkeeping.gamesPlayed === null)).toBe(true);
  });
});

describe('joinToRoster', () => {
  it('publishes a player the roster lacks under the stats sheet name, with a warning', () => {
    const page = parse('fremont')!;
    const roster = rosterOf('fremont').players.slice(1);
    const { lines, warnings } = joinToRoster(page, roster);
    const missing = lines.filter((l) => !l.onRoster);
    expect(missing.length).toBe(warnings.length);
    for (const l of missing) {
      expect(l.fullName).toBe(l.shortName);
      expect(l.athleteId).toBeNull();
    }
  });
});

describe('parsePlayerStats: loud on drift', () => {
  const teamId = rosterOf('palo-alto').maxprepsTeamId!;
  const run = (body: unknown) => () => parsePlayerStats(body, { expectedTeamId: teamId });

  it('throws on a different season or team', () => {
    const season = mutable('palo-alto');
    season.data.sportSeasonId = 'another-season';
    expect(run(season)).toThrow(/sportSeasonId/);
    expect(() => parsePlayerStats(raw('palo-alto'), { expectedTeamId: 'someone-else' })).toThrow(/teamId/);
  });

  it('throws when the Name column is gone or a row is the wrong width', () => {
    const noName = mutable('palo-alto');
    noName.data.groups[0].subgroups[0].stats.columns[1].name = 'Player';
    expect(run(noName)).toThrow(/no Name column/);
    const short = mutable('palo-alto');
    short.data.groups[0].subgroups[0].stats.rows[0].columns.pop();
    expect(run(short)).toThrow(/cells for/);
  });

  it('throws on a count that is not a whole number, and on two tables disagreeing', () => {
    const cols = mutable('palo-alto').data.groups[0].subgroups[0].stats.columns.map((c) => c.name);
    const goalsAt = cols.indexOf('Goals');
    const bad = mutable('palo-alto');
    bad.data.groups[0].subgroups[0].stats.rows[0].columns[goalsAt].value = 'n/a';
    expect(run(bad)).toThrow(/not a count/);
    const half = mutable('palo-alto');
    half.data.groups[0].subgroups[0].stats.rows[0].columns[goalsAt].value = '1.5';
    expect(run(half)).toThrow(/whole count/);
    // Goals also appears in the overflow subgroup: change it there only.
    const split = mutable('palo-alto');
    const sub2 = split.data.groups[0].subgroups[1];
    const g2 = sub2.stats.columns.findIndex((c) => c.name === 'Goals');
    const row = sub2.stats.rows.find((r) => Number(r.columns[g2].value) > 0)!;
    row.columns[g2].value = String(Number(row.columns[g2].value) + 1);
    expect(run(split)).toThrow(/in another table/);
  });

  it('treats only the 400 "no data" envelope as no stats', () => {
    expect(parsePlayerStats(raw('cupertino'))).toBeNull();
    expect(() => parsePlayerStats({ status: 500, data: null })).toThrow(/no data and status 500/);
    expect(() => parsePlayerStats({ status: 200, data: { teamId: 1 } })).toThrow(/schema drift/);
    // A 400 for any other reason (a stale season id, a bad team id) is a failure, not "no stats".
    expect(() =>
      parsePlayerStats({ status: 400, message: 'Invalid sportSeasonId.', data: null, errors: ['Invalid sportSeasonId.'] }),
    ).toThrow(/no data and status 400: Invalid sportSeasonId/);
    expect(() => parsePlayerStats({ status: 400, data: null })).toThrow(/no data and status 400/);
    // The message may come only in errors[].
    expect(parsePlayerStats({ status: 400, data: null, errors: ['No data was found for this request.'] })).toBeNull();
  });
});

describe('fetchPlayerStats', () => {
  const noSleep = async () => {};
  const teamId = rosterOf('saint-francis').maxprepsTeamId!;

  it('hits the rollup URL and parses it', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(raw('saint-francis')), { status: 200 }));
    const client = new MaxPrepsClient({ fetchImpl: fetchImpl as unknown as typeof fetch, sleep: noSleep, spacingMs: 0 });
    const page = await fetchPlayerStats(client, teamId);
    expect(fetchImpl).toHaveBeenCalledWith(playerStatsUrl(teamId), expect.anything());
    expect(playerStatsUrl(teamId)).toBe(
      `https://production.api.maxpreps.com/gatewayweb/react/team-season-player-stats/rollup/v1?teamId=${teamId}&sportSeasonId=${SPORT_SEASON_ID}`,
    );
    expect(page?.players.length).toBeGreaterThan(0);
  });

  it('returns null on the 400 MaxPreps sends for a team with no stats, without retrying', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(raw('cupertino')), { status: 400 }));
    const client = new MaxPrepsClient({ fetchImpl: fetchImpl as unknown as typeof fetch, sleep: noSleep, spacingMs: 0 });
    expect(await fetchPlayerStats(client, teamId)).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('hands the raw body to onRaw (what --capture saves), 400 envelope included', async () => {
    for (const [slug, status] of [['saint-francis', 200], ['cupertino', 400]] as const) {
      const body = JSON.stringify(raw(slug));
      const fetchImpl = vi.fn(async () => new Response(body, { status }));
      const client = new MaxPrepsClient({ fetchImpl: fetchImpl as unknown as typeof fetch, sleep: noSleep, spacingMs: 0 });
      const seen: string[] = [];
      await fetchPlayerStats(client, teamId, (r) => seen.push(r));
      // The saved capture is the body as received, so it parses exactly as the response did.
      expect(seen, slug).toEqual([body]);
    }
  });

  it('hands over a drifted or non-JSON body BEFORE validating it, so --capture saves what failed', async () => {
    const drifted = JSON.stringify({ status: 200, data: { teamId: 1 } });
    for (const [body, error] of [[drifted, /schema drift/], ['<html>maintenance</html>', /invalid JSON/]] as const) {
      const fetchImpl = vi.fn(async () => new Response(body, { status: 200 }));
      const client = new MaxPrepsClient({ fetchImpl: fetchImpl as unknown as typeof fetch, sleep: noSleep, spacingMs: 0 });
      const seen: string[] = [];
      await expect(fetchPlayerStats(client, teamId, (r) => seen.push(r)), body).rejects.toThrow(error);
      expect(seen, body).toEqual([body]);
    }
    // ...and a 400 that is not the "no data" envelope, before it fails.
    const other = JSON.stringify({ status: 400, message: 'Invalid teamId.', data: null });
    const fetchImpl = vi.fn(async () => new Response(other, { status: 400 }));
    const client = new MaxPrepsClient({ fetchImpl: fetchImpl as unknown as typeof fetch, sleep: noSleep, spacingMs: 0 });
    const seen: string[] = [];
    await expect(fetchPlayerStats(client, teamId, (r) => seen.push(r))).rejects.toThrow(/Invalid teamId/);
    expect(seen).toEqual([other]);
  });

  it('fails on any other 400, so the fetch script carries the previous rows forward', async () => {
    const other = JSON.stringify({ status: 400, message: 'Invalid teamId.', data: null, errors: ['Invalid teamId.'] });
    for (const body of [other, '', '<html>Bad Request</html>']) {
      const fetchImpl = vi.fn(async () => new Response(body, { status: 400 }));
      const client = new MaxPrepsClient({ fetchImpl: fetchImpl as unknown as typeof fetch, sleep: noSleep, spacingMs: 0 });
      await expect(fetchPlayerStats(client, teamId), JSON.stringify(body)).rejects.toThrow(/400/);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  });

  it('still fails on a server error', async () => {
    const fetchImpl = vi.fn(async () => new Response('oops', { status: 503 }));
    const client = new MaxPrepsClient({ fetchImpl: fetchImpl as unknown as typeof fetch, sleep: noSleep, spacingMs: 0 });
    await expect(fetchPlayerStats(client, teamId)).rejects.toThrow(/HTTP 503/);
  });
});

describe('teamStatsPageUrl', () => {
  it('appends stats/ to the team URL', () => {
    expect(teamStatsPageUrl('https://www.maxpreps.com/ca/x/y/field-hockey/')).toBe(
      'https://www.maxpreps.com/ca/x/y/field-hockey/stats/',
    );
    expect(teamStatsPageUrl(null)).toBeNull();
  });
});

describe('pendingPlayerStats', () => {
  it('is a valid, claim-free entry for every registry team of every league', () => {
    const teams = REGISTRY.map((t) => pendingPlayerStats(t));
    expect(teams).toHaveLength(102);
    for (const t of teams) {
      expect(t.status).toBe('pending');
      expect(t.players).toEqual([]);
      expect(t.fetchedAt).toBeNull();
      expect(t.statsUrl).toBe(teamStatsPageUrl(REGISTRY.find((x) => x.slug === t.slug)!.external.maxprepsTeamUrl));
    }
    const file = {
      season: '26-27',
      fetchedAt: '2026-10-02T00:00:00.000Z',
      source: { id: 'maxpreps-api' as const, builtBy: 'test', notes: [] },
      teams,
      counts: countPlayerStats(teams),
    };
    expect(PlayerStatsFileSchema.safeParse(file).success).toBe(true);
  });
});
