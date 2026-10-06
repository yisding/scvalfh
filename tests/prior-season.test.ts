/**
 * Last season's results (lib/prior-season-schema.ts, data/prior-season.json; DESIGN §20.1): the committed
 * file's promises, the schema that holds it to them, and the normalization scripts/fetch-prior-season.ts
 * runs over each team's MaxPreps feed, on synthetic rows.
 */

import { describe, expect, it } from 'vitest';

import { getPriorSeason } from '../lib/prior-season';
import {
  PriorSeasonSchema,
  previousMaxprepsYear,
  priorGamesFromFeeds,
  seasonLabel,
  seasonWindow,
  type PriorSeason,
} from '../lib/prior-season-schema';
import { SEASON_YEAR } from '../lib/season';
import { ScheduleRowSchema, type ScheduleRow } from '../lib/sources/maxpreps';
import { TEAMS, getTeamBySlug } from '../lib/teams';

describe('data/prior-season.json', () => {
  const file = getPriorSeason();

  it('is the season before this one, so the next-season bootstrap cannot forget it', () => {
    expect(file.maxprepsYear).toBe(previousMaxprepsYear(SEASON_YEAR));
    expect(file.season).toBe(seasonLabel(file.maxprepsYear));
  });

  it('holds finals between two registry teams, once each, inside its season', () => {
    const ids = new Set(TEAMS.map((t) => t.id));
    const { from, to } = seasonWindow(file.season);
    expect(new Set(file.games.map((g) => g.contestId)).size).toBe(file.games.length);
    for (const g of file.games) {
      expect(ids.has(g.homeId) && ids.has(g.awayId), g.contestId).toBe(true);
      expect(g.date >= from && g.date <= to, g.contestId).toBe(true);
    }
    // Sorted by date, then contest id, as the script writes it.
    const keys = file.games.map((g) => `${g.date} ${g.contestId}`);
    expect(keys).toEqual([...keys].sort());
  });

  /**
   * The 2026-10-06 run over all 99 teams (same 25-26 sportSeasonId). The 412 NorCal finals are the
   * ones the 49-team run wrote on 2026-10-04, unchanged; the Southern California teams add 473 finals
   * among themselves and 11 against NorCal teams (Leigh, Gilroy and Mitty's games against San Diego
   * and Sunset teams), the bridge DESIGN-socal §0 names for the one Elo fit. One deleted Sage Creek
   * row dated 2026-09-17 (contest 26fef99d…) sat in the 25-26 feed; the script listed it and counted
   * it as deleted. A refetch that changes these numbers is a new season file and is re-pinned here.
   *
   * Refetched the same day over all 102 teams, when the Southern Section independents (Glendora,
   * Harvard-Westlake, Thousand Oaks) joined the registry: the 412 NorCal, 473 SoCal and 11 cross-region
   * finals are unchanged, and the three add 40 SoCal–SoCal finals (513), every one against a Southern
   * California team or each other. outsideRegistry falls from 51 to 16 (their games were rows outside the
   * registry before), and one more row is not final (26).
   */
  it('holds the 2026-10-06 fetch over all 102 teams: 936 finals, 513 SoCal–SoCal, 11 NorCal–SoCal', () => {
    const SOCAL = new Set(['sunset', 'city', 'north-county', 'metro', 'independents']);
    const socal = (slug: string) => SOCAL.has(getTeamBySlug(slug)!.league);
    const pairs = { norcal: 0, socal: 0, cross: 0 };
    for (const g of file.games) {
      const [h, a] = [socal(g.homeSlug), socal(g.awaySlug)];
      if (h && a) pairs.socal += 1;
      else if (h || a) pairs.cross += 1;
      else pairs.norcal += 1;
    }
    expect(file.games).toHaveLength(936);
    expect(pairs).toEqual({ norcal: 412, socal: 513, cross: 11 });
    const INDEPENDENTS = new Set(['glendora', 'harvard-westlake', 'thousand-oaks']);
    expect(file.games.filter((g) => INDEPENDENTS.has(g.homeSlug) || INDEPENDENTS.has(g.awaySlug))).toHaveLength(40);
    expect(file.excluded).toEqual({ deleted: 113, notFinal: 26, outsideRegistry: 16, forfeit: 1, unscored: 0 });
    expect(file.sportSeasonId).toBe('8ae4cbab-caa1-4889-87a8-547fdaca9516');
    // Every registry team has at least one final, so every one of the 102 starts from a prior rating.
    const played = new Set(file.games.flatMap((g) => [g.homeSlug, g.awaySlug]));
    expect(TEAMS.filter((t) => !played.has(t.slug)).map((t) => t.slug)).toEqual([]);
  });
});

describe('PriorSeasonSchema', () => {
  const fremont = getTeamBySlug('fremont')!;
  const saratoga = getTeamBySlug('saratoga')!;
  const base: PriorSeason = {
    season: '2025-26',
    maxprepsYear: '25-26',
    sportSeasonId: 'x',
    source: 'maxpreps-api',
    fetchedAt: '2025-12-01T00:00:00.000Z',
    excluded: { deleted: 0, notFinal: 0, outsideRegistry: 0, forfeit: 0, unscored: 0 },
    games: [
      {
        contestId: 'c1',
        date: '2025-09-10',
        homeId: fremont.id,
        homeSlug: 'fremont',
        awayId: saratoga.id,
        awaySlug: 'saratoga',
        homeScore: 2,
        awayScore: 1,
        site: 'home',
      },
    ],
  };
  const issues = (file: unknown) => {
    const r = PriorSeasonSchema.safeParse(file);
    return r.success ? [] : r.error.issues.map((i) => i.message);
  };

  it('accepts a well-formed file', () => {
    expect(issues(base)).toEqual([]);
  });

  it('accepts a final between two EAL teams and one between an EAL and an MCAL team', () => {
    const [chico, davis, pv, redwood] = ['chico', 'davis', 'pleasant-valley', 'redwood'].map((s) => getTeamBySlug(s)!);
    const game = (contestId: string, home: typeof chico, away: typeof chico) => ({
      contestId,
      date: '2025-10-15',
      homeId: home.id,
      homeSlug: home.slug,
      awayId: away.id,
      awaySlug: away.slug,
      homeScore: 1,
      awayScore: 0,
      site: 'home' as const,
    });
    expect(chico.league).toBe('eal');
    expect(redwood.league).toBe('mcal');
    expect(issues({ ...base, games: [game('eal-eal', chico, davis)] })).toEqual([]);
    expect(issues({ ...base, games: [game('eal-mcal', pv, redwood)] })).toEqual([]);
  });

  it('rejects a contest listed twice, a team playing itself, a wrong slug and a date out of season', () => {
    const g = base.games[0];
    expect(issues({ ...base, games: [g, g] })).toContain('contest c1 is listed twice');
    expect(issues({ ...base, games: [{ ...g, awayId: g.homeId, awaySlug: g.homeSlug }] })).toContain('a team plays itself');
    expect(issues({ ...base, games: [{ ...g, homeSlug: 'saratoga' }] }).join()).toMatch(/is not that registry team/);
    expect(issues({ ...base, games: [{ ...g, date: '2024-09-10' }] })).toContain('2024-09-10 is outside the 2025-26 season');
    expect(issues({ ...base, maxprepsYear: '24-25' })).toContain('24-25 does not name 2025-26');
  });
});

describe('season helpers', () => {
  it('names the season before, and its window', () => {
    expect(previousMaxprepsYear('26-27')).toBe('25-26');
    expect(previousMaxprepsYear('00-01')).toBe('99-00');
    expect(seasonLabel('25-26')).toBe('2025-26');
    expect(seasonWindow('2025-26')).toEqual({ from: '2025-07-01', to: '2026-01-31' });
  });
});

// ---------------------------------------------------------------- the normalization

interface Side {
  slug?: string;
  /** A school outside the registry. */
  outsider?: string;
  score: number | null;
  /** 0 home, 1 away, 2 neutral. */
  at: 0 | 1 | 2;
  forfeit?: boolean;
}

/** One schedule row as MaxPreps' schedule-calculated/v1 returns it, parsed by the client's schema. */
function row(contestId: string, sides: [Side, Side], opts: { state?: number; date?: string } = {}): ScheduleRow {
  const teams = sides.map((s) => {
    const team = s.slug ? getTeamBySlug(s.slug)! : null;
    return {
      teamId: team ? team.id : `outsider-${s.outsider}`,
      name: team ? team.name : s.outsider!,
      score: s.score,
      result: null,
      homeAwayType: s.at,
      contestType: 1,
      isForfeit: s.forfeit ?? false,
      isTeamTBA: false,
      isDeleted: false,
    };
  });
  return ScheduleRowSchema.parse({
    contest: { contestId, date: `${opts.date ?? '2025-09-10'}T16:00:00`, teams },
    calculatedFields: {
      contestId,
      contestState: opts.state ?? 4,
      canonicalUrl: null,
      isDateTba: false,
      isTimeTba: false,
      contestDateInGMT: `${opts.date ?? '2025-09-10'}T23:00:00`,
      teamsCalculated: [],
    },
  });
}

describe('priorGamesFromFeeds', () => {
  it('keeps one game per contest from both teams’ feeds, host first', () => {
    // Saratoga's feed lists the home side second; Fremont's lists it first.
    const fromFremont = row('c1', [{ slug: 'fremont', score: 3, at: 0 }, { slug: 'saratoga', score: 1, at: 1 }]);
    const fromSaratoga = row('c1', [{ slug: 'saratoga', score: 1, at: 1 }, { slug: 'fremont', score: 3, at: 0 }]);
    const r = priorGamesFromFeeds(new Map([['fremont', [fromFremont]], ['saratoga', [fromSaratoga]]]));
    expect(r.conflicts).toEqual([]);
    expect(r.games).toHaveLength(1);
    expect(r.games[0]).toMatchObject({ homeSlug: 'fremont', awaySlug: 'saratoga', homeScore: 3, awayScore: 1, site: 'home' });
  });

  it('marks a game neutral when either side is, and puts the host second when MaxPreps does', () => {
    const neutral = row('c2', [{ slug: 'fremont', score: 0, at: 2 }, { slug: 'saratoga', score: 0, at: 2 }]);
    const hostSecond = row('c3', [{ slug: 'fremont', score: 1, at: 1 }, { slug: 'saratoga', score: 2, at: 0 }]);
    const r = priorGamesFromFeeds(new Map([['fremont', [neutral, hostSecond]]]));
    expect(r.games.map((g) => [g.contestId, g.site, g.homeSlug, g.homeScore])).toEqual([
      ['c2', 'neutral', 'fremont', 0],
      ['c3', 'home', 'saratoga', 2],
    ]);
  });

  it('leaves out deleted, unfinished, outside, forfeited and unscored contests, counting each once', () => {
    const feeds = new Map([
      [
        'fremont',
        [
          row('d', [{ slug: 'fremont', score: 1, at: 0 }, { slug: 'saratoga', score: 0, at: 1 }], { state: 1 }),
          row('p', [{ slug: 'fremont', score: null, at: 0 }, { slug: 'saratoga', score: null, at: 1 }], { state: 2 }),
          row('o', [{ slug: 'fremont', score: 5, at: 0 }, { outsider: 'Gunn', score: 0, at: 1 }]),
          row('f', [{ slug: 'fremont', score: 1, at: 0, forfeit: true }, { slug: 'saratoga', score: 0, at: 1 }]),
          row('u', [{ slug: 'fremont', score: null, at: 0 }, { slug: 'saratoga', score: 2, at: 1 }]),
        ],
      ],
      [
        'saratoga',
        [
          row('d', [{ slug: 'fremont', score: 1, at: 0 }, { slug: 'saratoga', score: 0, at: 1 }], { state: 1 }),
          row('f', [{ slug: 'fremont', score: 1, at: 0, forfeit: true }, { slug: 'saratoga', score: 0, at: 1 }]),
        ],
      ],
    ]);
    const r = priorGamesFromFeeds(feeds);
    expect(r.games).toEqual([]);
    expect(r.excluded).toEqual({ deleted: 1, notFinal: 1, outsideRegistry: 1, forfeit: 1, unscored: 1 });
  });

  it('reports a contest whose two feeds disagree, and leaves it out', () => {
    const a = row('c4', [{ slug: 'fremont', score: 2, at: 0 }, { slug: 'saratoga', score: 1, at: 1 }]);
    const b = row('c4', [{ slug: 'fremont', score: 2, at: 0 }, { slug: 'saratoga', score: 2, at: 1 }]);
    const r = priorGamesFromFeeds(new Map([['fremont', [a]], ['saratoga', [b]]]));
    expect(r.games).toEqual([]);
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts[0]).toMatch(/^contest c4 \(2025-09-10, fremont v saratoga\): the two feeds disagree/);
  });

  it('reports a contest one feed hosts and the other calls neutral, whichever feed comes first', () => {
    // Same score, same side listed first: only the site differs, and it decides the home edge.
    const hosted = row('c5', [{ slug: 'fremont', score: 2, at: 0 }, { slug: 'saratoga', score: 1, at: 1 }]);
    const neutral = row('c5', [{ slug: 'fremont', score: 2, at: 2 }, { slug: 'saratoga', score: 1, at: 2 }]);
    for (const [first, second] of [[hosted, neutral], [neutral, hosted]]) {
      const r = priorGamesFromFeeds(new Map([['fremont', [first]], ['saratoga', [second]]]));
      expect(r.games).toEqual([]);
      expect(r.conflicts).toHaveLength(1);
    }
  });
});
