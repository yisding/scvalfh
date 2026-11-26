/**
 * The /festival view builders (components/festival/*-view.ts, festival-model.ts; DESIGN §35) over the committed
 * data/field-hockey/festival.json and festival-clubs.json, and over copies of the file edited in memory: what a
 * pool table ranks, who fills a placement game's side at each stage of its source pool, how a level placement
 * game reads, which slot is "latest" and which "up next" (from statuses, never the clock), how clubs group, and
 * the clock words.
 *
 * The committed file moves while the event is on (a refresh is a commit), so assertions on it are structural;
 * the stages are pinned on edited copies.
 */

import { describe, expect, it } from 'vitest';

import { buildClubIndexView } from '../../components/festival/club-index-view';
import { buildClubView } from '../../components/festival/club-view';
import { buildDivisionView } from '../../components/festival/division-view';
import {
  SHOOTOUT_WORDS,
  bracketColumns,
  buildFestivalModel,
  columnTitle,
  finalLabel,
  festivalModel,
  gameRow,
  latestAndNext,
  placeOf,
  placementPath,
  playingTeamIds,
  poolTable,
  sidesOf,
  teamCard,
  teamGame,
  teamGames,
  type FestivalModel,
} from '../../components/festival/festival-model';
import { bothClocks, clockET, clockPT, dayLabelET, slotHeading, stampWords, whenET } from '../../components/festival/festival-time';
import { buildHubView, californiaGroups, eventDates, statusLine } from '../../components/festival/hub-view';
import { buildScheduleView } from '../../components/festival/schedule-view';
import { buildTeamView } from '../../components/festival/team-view';
import type { SiteClubLookup } from '../../components/festival/site-clubs';
import {
  getFestival,
  getFestivalClubsFile,
  resolveFestivalClubs,
  type FestivalFile,
  type FestivalGame,
} from '../../lib/festival/festival';

const FILE = getFestival();
const M = festivalModel();

/** A deep copy of the committed file, edited by `edit`, as a model (the clubs resolved again on it). */
function edited(edit: (file: FestivalFile) => void): FestivalModel {
  const file = structuredClone(FILE) as FestivalFile;
  // Start every edit from unfilled placement sides, as the bracket reads before the event staff fill them, so a
  // refresh that fills them never changes what these cases test. An edit that names a team still does.
  for (const g of file.games) if (g.kind === 'placement') for (const side of g.sides) side.teamId = null;
  edit(file);
  return buildFestivalModel(file, resolveFestivalClubs(file, getFestivalClubsFile()));
}

function finalize(g: FestivalGame, score: [number, number] = [1, 0]): void {
  g.status = 'final';
  g.score = score;
}

/**
 * Give a pool's teams records that put each alone at its line of TourneyMachine's order (points falling by 3 a
 * place), so a test of a settled place does not hang on today's records, where most places are still level.
 */
function separate(f: FestivalFile, poolId: string): void {
  const pool = f.divisions.flatMap((d) => d.pools).find((p) => p.id === poolId)!;
  pool.teamIds.forEach((id, i) => {
    const w = pool.teamIds.length - i;
    f.teams.find((t) => t.id === id)!.record = { w, l: i, t: 0, pts: 3 * w, gf: w, ga: i, gd: w - i };
  });
}

/** Make the teams at `places` (1-based) of a pool level on points, wins, goal difference and goals for. */
function level(f: FestivalFile, poolId: string, places: readonly number[]): void {
  const pool = f.divisions.flatMap((d) => d.pools).find((p) => p.id === poolId)!;
  const model = f.teams.find((t) => t.id === pool.teamIds[places[0] - 1])!.record;
  for (const p of places.slice(1)) f.teams.find((t) => t.id === pool.teamIds[p - 1])!.record = { ...model };
}

const placement = FILE.games.filter((g) => g.kind === 'placement');
/** A placement game, its first side's source pool, and that pool's games. */
const P = placement[0];
const SOURCE = P.sides[0].source!;
const SOURCE_POOL = FILE.divisions.flatMap((d) => d.pools).find((p) => p.id === SOURCE.poolId)!;
const poolGamesOf = (file: FestivalFile, poolId: string) => file.games.filter((g) => g.kind === 'pool' && g.poolId === poolId);

describe('the clock words (from UTC instants, in the named zones)', () => {
  it('prints the venue time as ET and California as PT', () => {
    expect(clockET('2026-11-26T13:00:00Z')).toBe('8:00 AM');
    expect(clockPT('2026-11-26T13:00:00Z')).toBe('5:00 AM');
    expect(clockET('2026-11-26T17:00:00Z')).toBe('12:00 PM');
    expect(clockPT('2026-11-26T17:00:00Z')).toBe('9:00 AM');
    expect(clockET('2026-11-28T00:00:00Z')).toBe('7:00 PM');
  });

  it('writes slot headings, day labels, game times and the stamp with plain spaces', () => {
    expect(dayLabelET('2026-11-26T13:00:00Z')).toBe('Thu Nov 26');
    expect(bothClocks('2026-11-26T19:00:00Z')).toBe('2:00 PM ET · 11:00 AM PT');
    expect(slotHeading('2026-11-26T13:00:00Z')).toBe('Thu Nov 26 · 8:00 AM ET · 5:00 AM PT');
    expect(whenET('2026-11-28T14:00:00Z')).toBe('Sat 9:00 AM ET');
    expect(stampWords('2026-11-26T20:42:00.000Z')).toBe('Thu 3:42 PM ET · 12:42 PM PT');
    // A late-evening Eastern stamp is still the same Pacific afternoon; the day is the venue's.
    expect(stampWords('2026-11-27T03:10:00Z')).toBe('Thu 10:10 PM ET · 7:10 PM PT');
    expect(stampWords(FILE.fetchedAt)).not.toMatch(/[  ]/);
  });

  it('writes the event dates', () => {
    expect(eventDates('2026-11-26', '2026-11-28')).toBe('Nov 26–28');
    expect(eventDates('2026-11-30', '2026-12-02')).toBe('Nov 30–Dec 2');
  });

  it('labels every slot of the committed file from its startUtc, which is its start at the venue', () => {
    for (const g of FILE.games) {
      const [h, min] = g.start.slice(11, 16).split(':').map(Number);
      const h12 = h % 12 === 0 ? 12 : h % 12;
      expect(gameRow(M, g).time).toBe(`${h12}:${String(min).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`);
    }
  });
});

describe('pool tables', () => {
  it('lists every pool in TourneyMachine’s order, which is the rank where the records differ', () => {
    for (const d of FILE.divisions) {
      for (const p of d.pools) {
        const t = poolTable(M, p.id);
        expect(t.rows.map((r) => r.team.id)).toEqual(p.teamIds);
        const any = FILE.games.some((g) => g.poolId === p.id && g.status === 'final');
        for (const [i, row] of t.rows.entries()) expect(row.rank === null ? null : row.tied || row.rank === i + 1).toBe(any ? true : null);
        expect(t.hasResults).toBe(any);
      }
    }
    const m = edited((f) => {
      separate(f, SOURCE_POOL.id);
      finalize(poolGamesOf(f, SOURCE_POOL.id)[0]);
    });
    expect(poolTable(m, SOURCE_POOL.id).rows.map((r) => [r.rank, r.tied])).toEqual(SOURCE_POOL.teamIds.map((_, i) => [i + 1, false]));
  });

  // DESIGN §35.5: TourneyMachine lists teams level on points, wins, goal difference and goals for alphabetically
  // (Pool S, 2026-11-26: "Atlanta FHC U19" over "FHL" at 1-0-0, +1, 2 goals), and the feed has no head-to-head or
  // shoot-out result. That order is not a rank, so the rows share one.
  it('ranks teams level on every figure equal, "=1", and none of them 1st', () => {
    const m = edited((f) => {
      separate(f, SOURCE_POOL.id);
      level(f, SOURCE_POOL.id, [1, 2]);
      finalize(poolGamesOf(f, SOURCE_POOL.id)[0]);
    });
    const t = poolTable(m, SOURCE_POOL.id);
    expect(t.rows.slice(0, 3).map((r) => [r.rank, r.tied])).toEqual([
      [1, true],
      [1, true],
      [3, false],
    ]);
    const first = placeOf(m, SOURCE_POOL.teamIds[0])!;
    const second = placeOf(m, SOURCE_POOL.teamIds[1])!;
    const of = SOURCE_POOL.teamIds.length;
    expect([first.words, second.words]).toEqual([`tied for 1st of ${of}`, `tied for 1st of ${of}`]);
    expect(placeOf(m, SOURCE_POOL.teamIds[2])!.words).toBe(`3rd of ${of}`);
    // Even with every pool game played, a tied place is not final.
    const done = edited((f) => {
      separate(f, SOURCE_POOL.id);
      level(f, SOURCE_POOL.id, [1, 2]);
      poolGamesOf(f, SOURCE_POOL.id).forEach((g) => finalize(g));
    });
    expect(placeOf(done, SOURCE_POOL.teamIds[1])).toMatchObject({ tied: true, final: false, first: 1, last: 2 });
    expect(placeOf(done, SOURCE_POOL.teamIds[2])).toMatchObject({ tied: false, final: true });
  });

  it('counts the games left and says when a pool is complete', () => {
    const t = poolTable(M, SOURCE_POOL.id);
    const left = poolGamesOf(FILE, SOURCE_POOL.id).filter((g) => g.status !== 'final').length;
    expect(t.toPlay).toBe(left);
    expect(t.status).toBe(left === 0 ? 'Pool complete' : `${left} ${left === 1 ? 'game' : 'games'} to play`);
    const done = edited((f) => poolGamesOf(f, SOURCE_POOL.id).forEach((g) => finalize(g)));
    expect(poolTable(done, SOURCE_POOL.id).status).toBe('Pool complete');
    expect(poolTable(done, SOURCE_POOL.id).complete).toBe(true);
  });

  it('records come from TourneyMachine’s pool fields: W-L-T, points and a signed GD', () => {
    const team = FILE.teams.find((t) => t.record.gd < 0) ?? FILE.teams[0];
    const row = poolTable(M, team.poolId).rows.find((r) => r.team.id === team.id)!;
    expect(row.record).toBe(`${team.record.w}-${team.record.l}-${team.record.t}`);
    expect(row.pts).toBe(team.record.pts);
    if (team.record.gd < 0) expect(row.gd).toBe(`−${-team.record.gd}`);
  });
});

describe('a placement game’s sides (spec §6)', () => {
  it('is only the slot before its source pool has a result', () => {
    const m = edited((f) => poolGamesOf(f, SOURCE.poolId).forEach((g) => ((g.status = 'scheduled'), (g.score = null))));
    const side = sidesOf(m, m.file.games.find((g) => g.key === P.key)!)[0];
    expect(side.state).toBe('placeholder');
    expect(side.team).toBeNull();
    expect(side.name).toBe(`${SOURCE_POOL.name} ${['1st', '2nd', '3rd', '4th', '5th', '6th'][SOURCE.place - 1]}`);
    expect(side.slot).toBe(side.name);
  });

  it('names the team at that place NOW while the pool is under way', () => {
    const m = edited((f) => {
      const games = poolGamesOf(f, SOURCE.poolId);
      games.forEach((g) => ((g.status = 'scheduled'), (g.score = null)));
      finalize(games[0]);
    });
    const side = sidesOf(m, m.file.games.find((g) => g.key === P.key)!)[0];
    expect(side.state).toBe('provisional');
    expect(side.team!.id).toBe(SOURCE_POOL.teamIds[SOURCE.place - 1]);
    // The line still leads with the slot: the team can change.
    expect(side.name).toBe(side.slot);
  });

  it('names the team from the final pool table once the pool is complete', () => {
    const m = edited((f) => {
      separate(f, SOURCE.poolId);
      poolGamesOf(f, SOURCE.poolId).forEach((g) => finalize(g));
    });
    const side = sidesOf(m, m.file.games.find((g) => g.key === P.key)!)[0];
    expect(side.state).toBe('pool-complete');
    expect(side.team!.id).toBe(SOURCE_POOL.teamIds[SOURCE.place - 1]);
    expect(side.name).toBe(side.team!.name);
    expect(gameRow(m, m.file.games.find((g) => g.key === P.key)!).teamSlugs).toContain(side.team!.slug);
  });

  // A full tie at the place, in a finished pool: TourneyMachine's first is only alphabetical (DESIGN §35.5), so the
  // side stays "Now: <team>" and nobody is filed under the game until the event staff fill it.
  it('keeps a place tied in the final pool table provisional, and files the game under nobody', () => {
    const neighbour = SOURCE.place === SOURCE_POOL.teamIds.length ? SOURCE.place - 1 : SOURCE.place + 1;
    const m = edited((f) => {
      separate(f, SOURCE.poolId);
      level(f, SOURCE.poolId, [SOURCE.place, neighbour]);
      poolGamesOf(f, SOURCE.poolId).forEach((g) => finalize(g));
    });
    const g = m.file.games.find((x) => x.key === P.key)!;
    const side = sidesOf(m, g)[0];
    expect(side.state).toBe('provisional');
    expect(side.team!.id).toBe(SOURCE_POOL.teamIds[SOURCE.place - 1]);
    expect(side.name).toBe(side.slot);
    expect(gameRow(m, g).teamSlugs).not.toContain(side.team!.slug);
    for (const p of [SOURCE.place, neighbour]) {
      const id = SOURCE_POOL.teamIds[p - 1];
      expect(teamGames(m, id).map((x) => x.key)).not.toContain(P.key);
      expect(placementPath(m, id).entries.flatMap((e) => e.games).some((x) => x.settled && x.number === P.number)).toBe(false);
    }
  });

  it('takes the team TourneyMachine names, whatever the pool says', () => {
    const named = SOURCE_POOL.teamIds.at(-1)!;
    const m = edited((f) => {
      const g = f.games.find((x) => x.key === P.key)!;
      g.sides[0].teamId = named;
    });
    const side = sidesOf(m, m.file.games.find((g) => g.key === P.key)!)[0];
    expect(side.state).toBe('team');
    expect(side.team!.id).toBe(named);
  });

  it('a level placement final is "Tied — shoot-out" with no winner; a decided one has one', () => {
    const tied = edited((f) => finalize(f.games.find((g) => g.key === P.key)!, [2, 2]));
    const g = tied.file.games.find((x) => x.key === P.key)!;
    expect(sidesOf(tied, g).map((s) => s.result)).toEqual([null, null]);
    expect(sidesOf(tied, g).map((s) => s.score)).toEqual(['2', '2']);
    expect(gameRow(tied, g).note).toContain(SHOOTOUT_WORDS);
    expect(SHOOTOUT_WORDS).toBe('Tied — shoot-out');
    const won = edited((f) => finalize(f.games.find((x) => x.key === P.key)!, [3, 1]));
    expect(sidesOf(won, won.file.games.find((x) => x.key === P.key)!).map((s) => s.result)).toEqual(['won', 'lost']);
  });

  it('a level POOL game is a plain tie', () => {
    const pg = FILE.games.find((g) => g.kind === 'pool')!;
    const m = edited((f) => finalize(f.games.find((g) => g.key === pg.key)!, [0, 0]));
    const g = m.file.games.find((x) => x.key === pg.key)!;
    expect(gameRow(m, g).note).not.toContain('shoot-out');
    expect(teamGame(m, g, g.sides[0].teamId!).chip).toBe('T');
    // A real zero is a zero, never a dash.
    expect(teamGame(m, g, g.sides[0].teamId!).score).toBe('0–0');
  });

  it('never prints a score for a game not started', () => {
    for (const g of FILE.games.filter((x) => x.status === 'scheduled')) {
      expect(sidesOf(M, g).map((s) => s.score)).toEqual([undefined, undefined]);
      for (const s of g.sides) if (s.teamId) expect(teamGame(M, g, s.teamId).score).toBeNull();
    }
  });
});

describe('the bracket columns', () => {
  it('titles each column from its source pools, as TourneyMachine groups them', () => {
    expect(columnTitle(['Pool A'])).toBe('Pool A');
    expect(columnTitle(['Pool R', 'Pool S'])).toBe('Pool R v Pool S');
    const u19 = FILE.divisions.find((d) => d.slug === 'u19')!;
    expect(bracketColumns(M, u19.key).map((c) => c.title)).toEqual(['Pool R v Pool S', 'Pool T v Pool U']);
    const u10 = FILE.divisions.find((d) => d.slug === 'u10')!;
    expect(bracketColumns(M, u10.key).map((c) => c.title)).toEqual(['Pool A']);
  });

  // Owner decision, 2026-11-26: no knockout bracket; finals between the same places of paired pools, or by place
  // within one pool.
  it('names each Saturday game by the places it draws on', () => {
    const game = (a: number, b: number) => ({ sides: [{ source: { place: a } }, { source: { place: b } }] }) as never;
    expect(finalLabel(game(1, 1))).toBe('1st-place final');
    expect(finalLabel(game(3, 3))).toBe('3rd-place final');
    expect(finalLabel(game(1, 2))).toBe('Final: 1st v 2nd');
    expect(finalLabel(game(4, 3))).toBe('3rd v 4th');
    const u19 = FILE.divisions.find((d) => d.slug === 'u19')!;
    expect(bracketColumns(M, u19.key)[0]!.games.map((g) => g.label)).toEqual([
      '1st-place final', '2nd-place final', '3rd-place final', '4th-place final', '5th-place final',
    ]);
  });

  it('says in words that there is no knockout bracket, and which pools have no finals', () => {
    expect(buildDivisionView('u19')!.finalsSummary).toBe(
      'No knockout bracket: on Saturday each team plays the team that finished in the same place in the paired pool (Pool R v Pool S and Pool T v Pool U). Pools P and Q have no finals.',
    );
    expect(buildDivisionView('u12')!.finalsSummary).toBe(
      'No knockout bracket: on Saturday Pool D’s teams play by place: 1st v 2nd, 3rd v 4th and 4th v 5th. Pools B and C have no finals.',
    );
    expect(buildDivisionView('u16')!.finalsSummary).toBeNull();
  });

  it('puts every placement game in exactly one column, rows top to bottom', () => {
    for (const d of FILE.divisions) {
      const cols = bracketColumns(M, d.key);
      const keys = cols.flatMap((c) => c.games.map((g) => g.key)).sort((a, b) => a - b);
      expect(keys).toEqual(placement.filter((g) => g.divisionKey === d.key).map((g) => g.key).sort((a, b) => a - b));
      for (const c of cols) {
        const rows = c.games.map((g) => FILE.games.find((x) => x.key === g.key)!.layout!.row);
        expect(rows).toEqual([...rows].sort((a, b) => a - b));
      }
    }
  });

  it('a division without placement games has no bracket', () => {
    expect(buildDivisionView('u16')!.bracket).toBeNull();
    expect(buildDivisionView('u19')!.bracket).not.toBeNull();
    expect(buildDivisionView('nope')).toBeNull();
  });
});

describe('a team’s placement path', () => {
  const team = FILE.teams.find((t) => t.poolId === SOURCE.poolId)!;

  it('lists every place of its pool that feeds a placement game, with the opponent’s slot', () => {
    const path = placementPath(M, team.id);
    const fed = placement.flatMap((g) => g.sides.filter((s) => s.source?.poolId === SOURCE.poolId).map((s) => s.source!.place));
    expect(path.entries.map((e) => e.place)).toEqual([...new Set(fed)].sort((a, b) => a - b));
    expect(path.entries.flatMap((e) => e.games).length).toBe(fed.length);
    for (const e of path.entries) for (const g of e.games) expect(g.when).toMatch(/^\w{3} \d{1,2}:\d{2} [AP]M ET$/);
  });

  it('marks the team’s place now, and the one game it plays once the pool is complete', () => {
    const m = edited((f) => {
      separate(f, SOURCE.poolId);
      poolGamesOf(f, SOURCE.poolId).forEach((g) => finalize(g));
    });
    const path = placementPath(m, team.id);
    const place = SOURCE_POOL.teamIds.indexOf(team.id) + 1;
    expect(path.poolComplete).toBe(true);
    expect(path.entries.filter((e) => e.current).map((e) => e.place)).toEqual(path.entries.some((e) => e.place === place) ? [place] : []);
    const settled = path.entries.flatMap((e) => e.games.filter((g) => g.settled).map(() => e.place));
    expect(new Set(settled)).toEqual(new Set(path.entries.some((e) => e.place === place) ? [place] : []));
  });

  it('a team tied in its finished pool is "tied for 1st" across the tie, and plays no game yet', () => {
    const m = edited((f) => {
      separate(f, SOURCE.poolId);
      level(f, SOURCE.poolId, [1, 2]);
      poolGamesOf(f, SOURCE.poolId).forEach((g) => finalize(g));
    });
    const second = SOURCE_POOL.teamIds[1];
    const path = placementPath(m, second);
    expect(path.place).toMatchObject({ tied: true, words: `tied for 1st of ${SOURCE_POOL.teamIds.length}` });
    const fed = path.entries.map((e) => e.place).filter((p) => p <= 2);
    expect(path.entries.filter((e) => e.current).map((e) => e.place)).toEqual(fed);
    for (const e of path.entries.filter((x) => x.current)) expect(e.nowWords).toBe('Tied for 1st now.');
    expect(path.entries.flatMap((e) => e.games).filter((g) => g.settled)).toEqual([]);
    expect(teamCard(m, second).place).toMatchObject({ final: false });
  });

  // In a one-pool division (U10, U12 Pool D, U14 7v7) both sides of B1 come from the same pool: on Blue Star
  // Warriors' page, 2nd in Pool F on 2026-11-26, "If 1st: plays Pool F 2nd (now Blue Star Warriors)". The team
  // cannot hold that place and play against it, so the slot prints alone.
  // The same once the pool is final: a pool-complete side carries the team's own name, so the slot (not the name)
  // is what prints.
  it('never names the team as its own opponent once the one pool is final either', () => {
    const single = placement.find((g) => g.sides[0].source!.poolId === g.sides[1].source!.poolId)!;
    const poolId = single.sides[0].source!.poolId;
    const pool = FILE.divisions.flatMap((d) => d.pools).find((p) => p.id === poolId)!;
    const m = edited((f) => {
      separate(f, poolId);
      poolGamesOf(f, poolId).forEach((g) => finalize(g));
    });
    for (const id of pool.teamIds) {
      for (const g of placementPath(m, id).entries.flatMap((e) => e.games)) {
        expect(g.opponent.team?.id).not.toBe(id);
        if (g.opponent.state === 'placeholder') expect(g.opponent.name).toBe(g.opponent.slot);
      }
    }
  });

  it('never names the team as its own opponent', () => {
    const single = placement.find((g) => g.sides[0].source!.poolId === g.sides[1].source!.poolId)!;
    const poolId = single.sides[0].source!.poolId;
    const pool = FILE.divisions.flatMap((d) => d.pools).find((p) => p.id === poolId)!;
    const holderPlace = single.sides[1].source!.place;
    const m = edited((f) => {
      separate(f, poolId);
      poolGamesOf(f, poolId).forEach((g) => ((g.status = 'scheduled'), (g.score = null)));
      finalize(poolGamesOf(f, poolId)[0]);
    });
    const self = pool.teamIds[holderPlace - 1];
    const path = placementPath(m, self);
    const line = path.entries.flatMap((e) => e.games).find((g) => g.number === single.number && g.opponent.slot === sidesOf(m, single)[1].slot)!;
    expect(line.opponent.state).toBe('placeholder');
    expect(line.opponent.team).toBeNull();
    // Every other team's page still names who holds that slot now.
    const other = pool.teamIds.find((id) => id !== self)!;
    for (const g of placementPath(m, other).entries.flatMap((e) => e.games)) {
      if (g.opponent.state === 'provisional') expect(g.opponent.team!.id).not.toBe(other);
    }
    for (const id of pool.teamIds) {
      for (const g of placementPath(m, id).entries.flatMap((e) => e.games)) expect(g.opponent.team?.id).not.toBe(id);
    }
  });

  it('is empty for a pool that feeds no placement game', () => {
    const fed = new Set(placement.flatMap((g) => g.sides.map((s) => s.source?.poolId)));
    const lone = FILE.teams.find((t) => !fed.has(t.poolId))!;
    expect(placementPath(M, lone.id).entries).toEqual([]);
    expect(teamCard(M, lone.id).placementAhead).toBe(false);
    // A team whose pool does feed one has it ahead while it is unplayed (an edited model, so the test holds after
    // Saturday's games are played too).
    const unplayed = edited((f) => f.games.filter((g) => g.kind === 'placement').forEach((g) => ((g.status = 'scheduled'), (g.score = null))));
    expect(teamCard(unplayed, team.id).placementAhead).toBe(true);
  });
});

describe('latest results and up next (statuses, never the clock)', () => {
  const slots = [...new Set(FILE.games.map((g) => g.startUtc))].sort();
  const reset = (f: FestivalFile) => f.games.forEach((g) => ((g.status = 'scheduled'), (g.score = null)));

  it('before any result: no latest, the first slot up next, and the start in the status line', () => {
    const m = edited(reset);
    expect(latestAndNext(m.file)).toEqual({ latest: null, next: slots[0] });
    expect(statusLine(m).text).toBe(`Starts ${dayLabelET(slots[0])}, ${clockET(slots[0])} ET`);
  });

  it('a late entry: the latest slot with a final, and the next slot after it with nothing started', () => {
    const m = edited((f) => {
      reset(f);
      finalize(f.games.find((g) => g.startUtc === slots[2])!);
      const live = f.games.find((g) => g.startUtc === slots[3])!;
      live.status = 'live';
      live.score = [0, 0];
    });
    expect(latestAndNext(m.file)).toEqual({ latest: slots[2], next: slots[4] });
    expect(statusLine(m).text).toBe(`Day 1 of 3 · 1 of ${FILE.games.length} games final`);
  });

  it('every game final: "Final results", nothing up next', () => {
    const m = edited((f) => f.games.forEach((g) => finalize(g)));
    expect(statusLine(m)).toEqual({ text: 'Final results', complete: true });
    expect(latestAndNext(m.file).next).toBeNull();
  });

  it('the committed file: the hub shows the latest slot’s every game and the next slot', () => {
    const hub = buildHubView();
    const { latest, next } = latestAndNext(FILE);
    expect(hub.latest?.startUtc ?? null).toBe(latest);
    expect(hub.next?.startUtc ?? null).toBe(next);
    if (latest) expect(hub.latest!.rows.length).toBe(FILE.games.filter((g) => g.startUtc === latest).length);
    expect(hub.cards.length).toBe(FILE.teams.length);
  });
});

describe('clubs and California', () => {
  const site: SiteClubLookup = (slug) =>
    ({
      'sf-hawks': { slug, name: 'SF Hawks', href: `/clubs/${slug}`, regionLabel: 'San Francisco', siteRegion: 'norcal' as const, website: null, description: null },
      'hayward-hawks': { slug, name: 'Hayward Hawks', href: `/clubs/${slug}`, regionLabel: 'East Bay', siteRegion: 'norcal' as const, website: null, description: null },
      'norcal-impact': { slug, name: 'NorCal Impact', href: `/clubs/${slug}`, regionLabel: 'South Bay', siteRegion: 'norcal' as const, website: null, description: null },
      htc: { slug, name: 'HTC', href: `/clubs/${slug}`, regionLabel: 'San Diego', siteRegion: 'socal' as const, website: null, description: null },
    })[slug] ?? null;

  it('groups the California clubs Northern then Southern by this site’s club region; HTC’s East Coast team is not one', () => {
    const groups = californiaGroups(M, site);
    expect(groups.map((g) => g.heading)).toEqual(['Northern California', 'Southern California']);
    const names = (i: number) => groups[i].clubs.flatMap((c) => c.teams.map((t) => t.team.name));
    expect(names(0)).toEqual(expect.arrayContaining(['San Francisco Hawks U16', 'San Francisco Hawks U19', 'Norcal Wolves U16', 'Hayward Hawks']));
    expect(names(1)).toEqual(['HTC CA U19']);
    expect([...names(0), ...names(1)]).not.toContain('HTC');
    expect(groups[1].clubs[0].region).toBe('San Diego');
    expect(groups[1].clubs[0].site?.href).toBe('/clubs/htc');
  });

  it('uses the real club registry by default', () => {
    const hub = buildHubView();
    expect(hub.california.find((g) => g.id === 'socal')!.clubs.map((c) => c.slug)).toEqual(['htc-ca']);
    expect(hub.california.find((g) => g.id === 'norcal')!.clubs.every((c) => c.site !== null)).toBe(true);
  });

  it('/festival/clubs lists California first, then every other club, each once, with all its teams', () => {
    const view = buildClubIndexView(M, site);
    expect(view.groups.map((g) => g.id)).toEqual(['norcal', 'socal', 'all']);
    const slugs = view.groups.flatMap((g) => g.clubs.map((c) => c.slug));
    expect(slugs.sort()).toEqual(M.clubs.map((c) => c.slug).sort());
    expect(view.groups.flatMap((g) => g.clubs.flatMap((c) => c.teams)).length).toBe(FILE.teams.length);
    expect(view.groups[2].clubs.map((c) => c.slug)).toContain('htc');
  });

  it('a club page merges every game of its teams once, by day and slot, and has a section per team', () => {
    for (const club of M.clubs) {
      const view = buildClubView(club.slug, M, site)!;
      const ids = new Set(club.teamIds);
      const games = FILE.games.filter((g) => playingTeamIds(M, g).some((id) => ids.has(id)));
      const rows = view.schedule.flatMap((d) => d.slots.flatMap((s) => s.rows));
      expect(rows.map((r) => r.key)).toEqual(games.map((g) => g.key));
      expect(view.teams.map((t) => t.card.team.id)).toEqual(club.teamIds);
      expect(view.slugs.length).toBe(club.teamIds.length);
      for (const t of view.teams) expect(t.pool.rows.filter((r) => r.self).length).toBeGreaterThanOrEqual(1);
    }
    expect(buildClubView('nope', M, site)).toBeNull();
  });

  it('HTC’s page holds its team and links the other HTC club, with no note on either', () => {
    const htc = buildClubView('htc', M, site)!;
    expect(htc.teams.map((t) => t.card.team.name)).toEqual(['HTC']);
    expect(htc.teams[0].card.note).toBeNull();
    const ca = buildClubView('htc-ca', M, site)!;
    expect(ca.teams.map((t) => t.card.team.name)).toEqual(['HTC CA U19']);
    expect(ca.teams[0].card.note).toBeNull();
    expect(ca.california).toBe(true);
    expect(htc.site?.href).toBe('/clubs/htc');
    // Spec §3 (a): the two festival clubs that are one club on this site link each other.
    expect(htc.siblings).toEqual([{ slug: 'htc-ca', name: 'HTC CA', href: '/festival/clubs/htc-ca', divisions: 'U19' }]);
    expect(ca.siblings).toEqual([{ slug: 'htc', name: 'HTC', href: '/festival/clubs/htc', divisions: 'U16' }]);
    expect(buildClubView('gateway', M, site)!.siblings).toEqual([]);
  });
});

describe('the schedule and team views', () => {
  it('the schedule holds every game once, by venue day then slot', () => {
    const view = buildScheduleView();
    const rows = view.days.flatMap((d) => d.slots.flatMap((s) => s.rows));
    expect(rows.map((r) => r.key)).toEqual(FILE.games.map((g) => g.key));
    expect(view.days.map((d) => d.label)).toEqual(['Thu Nov 26', 'Fri Nov 27', 'Sat Nov 28']);
  });

  it('a team page lists every game the team plays, from its side', () => {
    for (const t of FILE.teams) {
      const view = buildTeamView(t.slug)!;
      expect(view.games.map((g) => g.key)).toEqual(FILE.games.filter((g) => playingTeamIds(M, g).includes(t.id)).map((g) => g.key));
      expect(view.games.every((g) => g.team.id === t.id && g.opponent.team?.id !== t.id)).toBe(true);
    }
    expect(buildTeamView('nope')).toBeNull();
  });

  // TourneyMachine may leave a placement side unfilled after pool play (tm.md never saw it fill one). Once the
  // source pool is complete with the team alone at the place, the game is the team's on every page of its own, and
  // its result reads from that side.
  it('a placement game a final pool table settles is the team’s: team page, card, club schedule and club section', () => {
    const holder = SOURCE_POOL.teamIds[SOURCE.place - 1];
    const unfilled = (f: FestivalFile) => {
      separate(f, SOURCE.poolId);
      poolGamesOf(f, SOURCE.poolId).forEach((g) => finalize(g));
      const g = f.games.find((x) => x.key === P.key)!;
      g.sides.forEach((s) => (s.teamId = null));
      g.status = 'scheduled';
      g.score = null;
    };
    const m = edited(unfilled);
    const g = m.file.games.find((x) => x.key === P.key)!;
    expect(sidesOf(m, g)[0].state).toBe('pool-complete');
    expect(teamGames(m, holder).map((x) => x.key)).toContain(P.key);
    const card = teamCard(m, holder);
    expect(card.next?.key).toBe(P.key);
    expect(card.placementAhead).toBe(false);
    const clubSlug = m.clubOfTeam.get(holder)!;
    const club = buildClubView(clubSlug, m)!;
    expect(club.schedule.flatMap((d) => d.slots.flatMap((s) => s.rows)).map((r) => r.key)).toContain(P.key);
    expect(club.teams.find((t) => t.card.team.id === holder)!.games.map((x) => x.key)).toContain(P.key);

    // Played and final, still unfilled: the result is the team's, chip and score from its resolved side.
    const played = edited((f) => {
      unfilled(f);
      finalize(f.games.find((x) => x.key === P.key)!, [1, 3]);
    });
    const own = teamCard(played, holder).last!;
    expect(own.key).toBe(P.key);
    expect(own.chip).toBe('L');
    expect(own.score).toBe('1–3');
    const row = buildClubView(clubSlug, played)!.schedule.flatMap((d) => d.slots.flatMap((s) => s.rows)).find((r) => r.key === P.key)!;
    expect(row.team.id).toBe(holder);
    expect(row.chip).toBe('L');
  });
});
