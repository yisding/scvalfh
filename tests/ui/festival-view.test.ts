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
  festivalModel,
  gameRow,
  latestAndNext,
  placementPath,
  poolTable,
  sidesOf,
  teamCard,
  teamGame,
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
  edit(file);
  return buildFestivalModel(file, resolveFestivalClubs(file, getFestivalClubsFile()));
}

function finalize(g: FestivalGame, score: [number, number] = [1, 0]): void {
  g.status = 'final';
  g.score = score;
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
  it('lists every pool in TourneyMachine’s order, which is the rank', () => {
    for (const d of FILE.divisions) {
      for (const p of d.pools) {
        const t = poolTable(M, p.id);
        expect(t.rows.map((r) => r.team.id)).toEqual(p.teamIds);
        const any = FILE.games.some((g) => g.poolId === p.id && g.status === 'final');
        expect(t.rows.map((r) => r.rank)).toEqual(p.teamIds.map((_, i) => (any ? i + 1 : null)));
        expect(t.hasResults).toBe(any);
      }
    }
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
    const m = edited((f) => poolGamesOf(f, SOURCE.poolId).forEach((g) => finalize(g)));
    const side = sidesOf(m, m.file.games.find((g) => g.key === P.key)!)[0];
    expect(side.state).toBe('pool-complete');
    expect(side.team!.id).toBe(SOURCE_POOL.teamIds[SOURCE.place - 1]);
    expect(side.name).toBe(side.team!.name);
    expect(gameRow(m, m.file.games.find((g) => g.key === P.key)!).teamSlugs).toContain(side.team!.slug);
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
    expect(columnTitle(['Pool A'])).toBe('Pool A placement');
    expect(columnTitle(['Pool R', 'Pool S'])).toBe('Pool R and S crossovers');
    const u19 = FILE.divisions.find((d) => d.slug === 'u19')!;
    expect(bracketColumns(M, u19.key).map((c) => c.title)).toEqual(['Pool R and S crossovers', 'Pool T and U crossovers']);
    const u10 = FILE.divisions.find((d) => d.slug === 'u10')!;
    expect(bracketColumns(M, u10.key).map((c) => c.title)).toEqual(['Pool A placement']);
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
    const m = edited((f) => poolGamesOf(f, SOURCE.poolId).forEach((g) => finalize(g)));
    const path = placementPath(m, team.id);
    const place = SOURCE_POOL.teamIds.indexOf(team.id) + 1;
    expect(path.poolComplete).toBe(true);
    expect(path.entries.filter((e) => e.current).map((e) => e.place)).toEqual(path.entries.some((e) => e.place === place) ? [place] : []);
    const settled = path.entries.flatMap((e) => e.games.filter((g) => g.settled).map(() => e.place));
    expect(new Set(settled)).toEqual(new Set(path.entries.some((e) => e.place === place) ? [place] : []));
  });

  it('is empty for a pool that feeds no placement game', () => {
    const fed = new Set(placement.flatMap((g) => g.sides.map((s) => s.source?.poolId)));
    const lone = FILE.teams.find((t) => !fed.has(t.poolId))!;
    expect(placementPath(M, lone.id).entries).toEqual([]);
    expect(teamCard(M, lone.id).placementAhead).toBe(false);
    expect(teamCard(M, team.id).placementAhead).toBe(true);
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
      'sf-hawks': { slug, name: 'SF Hawks', href: `/clubs/${slug}`, regionLabel: 'San Francisco', siteRegion: 'norcal' as const },
      'hayward-hawks': { slug, name: 'Hayward Hawks', href: `/clubs/${slug}`, regionLabel: 'East Bay', siteRegion: 'norcal' as const },
      'norcal-impact': { slug, name: 'NorCal Impact', href: `/clubs/${slug}`, regionLabel: 'South Bay', siteRegion: 'norcal' as const },
      htc: { slug, name: 'HTC', href: `/clubs/${slug}`, regionLabel: 'San Diego', siteRegion: 'socal' as const },
    })[slug] ?? null;

  it('groups the California clubs Northern then Southern by this site’s club region; HTC’s East Coast team is not one', () => {
    const groups = californiaGroups(M, site);
    expect(groups.map((g) => g.heading)).toEqual(['Northern California', 'Southern California']);
    const names = (i: number) => groups[i].clubs.flatMap((c) => c.teams.map((t) => t.team.name));
    expect(names(0)).toEqual(expect.arrayContaining(['San Francisco Hawks U16', 'San Francisco Hawks U19', 'Norcal Wolves u16', 'Hayward Hawks']));
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
      const games = FILE.games.filter((g) => g.sides.some((s) => s.teamId && ids.has(s.teamId)));
      const rows = view.schedule.flatMap((d) => d.slots.flatMap((s) => s.rows));
      expect(rows.map((r) => r.key)).toEqual(games.map((g) => g.key));
      expect(view.teams.map((t) => t.card.team.id)).toEqual(club.teamIds);
      expect(view.slugs.length).toBe(club.teamIds.length);
      for (const t of view.teams) expect(t.pool.rows.filter((r) => r.self).length).toBeGreaterThanOrEqual(1);
    }
    expect(buildClubView('nope', M, site)).toBeNull();
  });

  it('HTC’s page holds both its teams and says which is which', () => {
    const htc = buildClubView('htc', M, site)!;
    expect(htc.teams.map((t) => t.card.team.name)).toEqual(['HTC']);
    expect(htc.teams[0].card.note).toMatch(/East Coast/);
    const ca = buildClubView('htc-ca', M, site)!;
    expect(ca.teams.map((t) => t.card.team.name)).toEqual(['HTC CA U19']);
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

  it('a team page lists every game the team is named in, from its side', () => {
    for (const t of FILE.teams) {
      const view = buildTeamView(t.slug)!;
      expect(view.games.map((g) => g.key)).toEqual(FILE.games.filter((g) => g.sides.some((s) => s.teamId === t.id)).map((g) => g.key));
      expect(view.games.every((g) => g.team.id === t.id && g.opponent.team?.id !== t.id)).toBe(true);
    }
    expect(buildTeamView('nope')).toBeNull();
  });
});
