/**
 * JV games: the si.com JV id map, the si.com JV page parser, the MaxPreps-first merge
 * (lib/jv-merge.ts), the committed data/jv.json, the views, and scripts/fetch-jv.ts run offline
 * over the PCAL captures in tests/fixtures/jv (README there).
 *
 * The scheduled refresh runs this suite over the file it just wrote, so the checks on the
 * COMMITTED file accept every status the schema allows; coverage is asserted on files built from
 * the captures.
 */

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildDayJvView, buildTeamJvView, jvDiffersNote } from '../components/teams/jv-view';
import { getJvCorrections, getJvFile, getJvGamesForTeam, getJvMerge, getJvTeam } from '../lib/jv';
import { JV_CORRECTIONS, applyJvCorrections } from '../lib/jv-corrections';
import { JV_FILL_NOTE, mergeJv } from '../lib/jv-merge';
import { JV_SCHOOL_SITES, mergeJvSchoolSites, schoolSiteResults, type JvSchoolSite } from '../lib/jv-school-sites';
import { JV_TEAM_COUNT, JvFileSchema, countJv, jvContentKey, type JvFile, type JvSbliveRow } from '../lib/jv-schema';
import {
  JV_OUTSIDE_TEAMS,
  JV_SBLIVE_PATHS,
  JV_SLUG_BY_SBLIVE_ID,
  jvMaxprepsScheduleUrl,
  jvSbliveGamesUrl,
  jvSbliveTeamId,
} from '../lib/jv-teams';
import { combineJvCopies, parseJvTeamGamesPage, type JvSbliveCopy } from '../lib/sources/sblive-jv';
import { TEAMS, getTeamBySlug } from '../lib/teams';
import type { Game } from '../lib/types';
import { game } from './game-builder';
import { REPO, runScript } from './helpers';

const FIXTURES = path.join(REPO, 'tests', 'fixtures', 'jv');
const PCAL = TEAMS.filter((t) => t.league === 'pcal').map((t) => t.slug);

/** A JV game as MaxPreps' feed builds one: no table, no postseason, no official stamp. */
function jvGame(spec: Parameters<typeof game>[0]): Game {
  const { official: _official, ...g } = game({ league: false, official: null, ...spec });
  void _official;
  return { ...g, countsFor: null, postseason: null };
}

function row(
  id: string,
  date: string,
  a: [string | null, number],
  b: [string | null, number],
  extra: Partial<JvSbliveRow> = {},
): JvSbliveRow {
  const side = ([slug, score]: [string | null, number], isHome: boolean) => ({
    slug,
    sbliveTeamId: slug ? jvSbliveTeamId(slug) : '999999',
    name: slug ? (getTeamBySlug(slug)?.name ?? slug) : 'Somewhere Else',
    score,
    isHome,
  });
  return {
    sbliveGameId: id,
    dateIso: `${date}T16:00:00.000-07:00`,
    dateKey: date,
    url: `https://www.si.com/high-school/stats/california/field-hockey/games/${id}-x`,
    sides: [side(a, false), side(b, true)],
    pages: [a[0] ?? b[0]!].sort(),
    copiesDisagree: false,
    ...extra,
  };
}

describe('the si.com JV team map', () => {
  it('has exactly one entry per registry school', () => {
    expect(Object.keys(JV_SBLIVE_PATHS).sort()).toEqual(TEAMS.map((t) => t.slug).sort());
  });

  it('gives each school its own JV id, never a varsity one', () => {
    const ids = TEAMS.map((t) => jvSbliveTeamId(t.slug)).filter((id): id is string => id !== null);
    expect(new Set(ids).size).toBe(ids.length);
    // 48 NorCal JV ids read 2026-10-05, the 53 Southern California ones read 2026-10-06, and Marin
    // Academy's, read 2026-11-03 (it had no si.com page before).
    expect(ids).toHaveLength(102);
    const varsity = new Set(TEAMS.map((t) => t.external.sbliveTeamId));
    for (const id of ids) expect(varsity.has(id)).toBe(false);
    expect(jvSbliveTeamId('marin-academy')).toBe('575146');
    expect(jvSbliveGamesUrl('marin-academy')).toBe(
      'https://www.si.com/high-school/stats/california/field-hockey/teams/575146-marin-academy-wildcats-jv/games',
    );
    for (const [slug, p] of Object.entries(JV_SBLIVE_PATHS)) {
      if (!p) continue;
      expect(p).toMatch(/^\d+-[a-z0-9-]+-jv$/);
      expect(JV_SLUG_BY_SBLIVE_ID.get(jvSbliveTeamId(slug)!)).toBe(slug);
    }
  });

  it('builds MaxPreps’ JV schedule page under the varsity team URL', () => {
    const carmel = getTeamBySlug('carmel')!;
    expect(jvMaxprepsScheduleUrl(carmel)).toBe(`${carmel.external.maxprepsTeamUrl}jv/schedule/`);
  });
});

describe('parseJvTeamGamesPage', () => {
  const html = readFileSync(path.join(FIXTURES, 'jv-sblive-carmel.html'), 'utf8');
  const url = jvSbliveGamesUrl('carmel')!;

  it('keeps scored finals only, with the page’s school as the first side and opponents by JV id', () => {
    const rows = parseJvTeamGamesPage(html, { url, expectedTeamId: jvSbliveTeamId('carmel')!, page: 'carmel' });
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.sides[0].slug).toBe('carmel');
      expect(Number.isInteger(r.sides[0].score) && Number.isInteger(r.sides[1].score)).toBe(true);
      expect(r.url).toMatch(/^https:\/\/www\.si\.com\/high-school\/stats\/california\/field-hockey\/games\//);
      if (r.sides[1].slug) expect(JV_SLUG_BY_SBLIVE_ID.get(r.sides[1].sbliveTeamId!)).toBe(r.sides[1].slug);
    }
    // Carmel's JV played Hollister on Sep 3 (si.com has it 1-0).
    expect(rows.some((r) => r.dateKey === '2026-09-03' && r.sides[1].slug === 'hollister')).toBe(true);
  });

  it('refuses a page that is not the JV team asked for', () => {
    expect(() => parseJvTeamGamesPage(html, { url, expectedTeamId: '458529', page: 'carmel' })).toThrow(/expected JV team 458529/);
    expect(() => parseJvTeamGamesPage('<html></html>', { url, expectedTeamId: '458528', page: 'carmel' })).toThrow(/teams\/Games/);
  });
});

describe('combineJvCopies', () => {
  const copy = (page: string, mine: number, theirs: number): JvSbliveCopy => {
    const other = page === 'carmel' ? 'hollister' : 'carmel';
    return {
      sbliveGameId: '123',
      dateIso: '2026-09-03T16:00:00.000-07:00',
      dateKey: '2026-09-03',
      url: null,
      sides: [
        { slug: page, sbliveTeamId: jvSbliveTeamId(page), name: page, score: mine, isHome: true },
        { slug: other, sbliveTeamId: jvSbliveTeamId(other), name: other, score: theirs, isHome: false },
      ],
      page,
    };
  };

  it('merges the two pages’ copies of one game, sides in slug order', () => {
    const [r] = combineJvCopies([copy('hollister', 0, 1), copy('carmel', 1, 0)]);
    expect(r.pages).toEqual(['carmel', 'hollister']);
    expect(r.sides.map((s) => s.slug)).toEqual(['carmel', 'hollister']);
    expect(r.copiesDisagree).toBe(false);
  });

  it('marks a game whose copies disagree', () => {
    const [r] = combineJvCopies([copy('hollister', 0, 1), copy('carmel', 2, 0)]);
    expect(r.copiesDisagree).toBe(true);
  });
});

describe('mergeJv: MaxPreps first, si.com supplements', () => {
  const today = '2026-10-05';
  const fetchedAt = '2026-10-05T19:00:00.000Z';

  it('fills a past MaxPreps game with no score from a si.com final within a day, marked as si.com’s', () => {
    const g = jvGame({ home: 'carmel', away: 'hollister', date: '2026-09-03', status: 'score-pending' });
    const m = mergeJv({ games: [g], sblive: [row('1', '2026-09-04', ['hollister', 0], ['carmel', 1])], today, fetchedAt });
    const out = m.games[0];
    expect(m.filled).toEqual([g.contestId]);
    expect(out).toMatchObject({ status: 'final', decider: 'REG', home: { score: 1, result: 'W' }, away: { score: 0, result: 'L' } });
    expect(out.provenance.scores).toBe('sblive');
    expect(out.provenance.backfill).toMatchObject({ rule: 'score-pending', sbliveGameId: '1', note: JV_FILL_NOTE });
    expect(out.urls.sblive).toContain('/games/1-x');
  });

  it('never fills a game still to come, a postponed one, or from a si.com row two days off', () => {
    const later = jvGame({ home: 'carmel', away: 'hollister', date: '2026-10-08' });
    const postponed = jvGame({ home: 'carmel', away: 'monterey', date: '2026-09-10', status: 'postponed' });
    const off = jvGame({ home: 'carmel', away: 'salinas', date: '2026-09-10', status: 'score-pending' });
    const m = mergeJv({
      games: [later, postponed, off],
      sblive: [
        row('1', '2026-10-08', ['hollister', 0], ['carmel', 1]),
        row('2', '2026-09-10', ['monterey', 0], ['carmel', 1]),
        row('3', '2026-09-12', ['salinas', 0], ['carmel', 1]),
      ],
      today,
      fetchedAt,
    });
    expect(m.filled).toEqual([]);
    expect(m.added).toEqual([]);
    expect(m.games.filter((x) => x.status === 'final')).toEqual([]);
  });

  it('keeps MaxPreps’ final when si.com disagrees, and records si.com’s score beside it', () => {
    const g = jvGame({ home: 'homestead', away: 'los-altos', date: '2026-09-14', hs: 3, as: 0 });
    const m = mergeJv({ games: [g], sblive: [row('5', '2026-09-14', ['homestead', 0], ['los-altos', 3])], today, fetchedAt });
    const out = m.games[0];
    expect(m.differs).toEqual([g.contestId]);
    expect([out.home.score, out.away.score]).toEqual([3, 0]);
    expect(out.provenance.scores).not.toBe('sblive');
    expect(out.provenance.scoreConflict?.sblive).toEqual({ home: 0, away: 3 });
    expect(jvDiffersNote(out)).toBe('si.com has Los Altos 3, Homestead 0; MaxPreps’ score is shown.');
  });

  it('leaves an agreeing final untouched', () => {
    const g = jvGame({ home: 'homestead', away: 'los-altos', date: '2026-09-14', hs: 3, as: 0 });
    const m = mergeJv({ games: [g], sblive: [row('5', '2026-09-14', ['homestead', 3], ['los-altos', 0])], today, fetchedAt });
    expect(m.games[0]).toEqual(g);
    expect(m.unused).toEqual([{ sbliveGameId: '5', reason: 'not-needed' }]);
  });

  it('adds a si.com-only final between two registry schools, hosted as si.com says', () => {
    const m = mergeJv({ games: [], sblive: [row('7', '2026-09-21', ['stevenson', 1], ['greenfield', 0])], today, fetchedAt });
    expect(m.added).toEqual(['sblive:7']);
    const g = m.games[0];
    expect(g).toMatchObject({
      status: 'final',
      site: 'home',
      home: { slug: 'greenfield', score: 0, result: 'L' },
      away: { slug: 'stevenson', score: 1, result: 'W' },
      countsFor: null,
      postseason: null,
      isLeague: false,
    });
    expect(g.provenance).toMatchObject({ scores: 'sblive', schedule: 'sblive', backfill: { rule: 'absent-fixture' } });
  });

  it('adds nothing when MaxPreps has the pair within two weeks, or the row is unusable', () => {
    const g = jvGame({ home: 'carmel', away: 'hollister', date: '2026-09-03', hs: 1, as: 0 });
    const m = mergeJv({
      games: [g],
      sblive: [
        row('8', '2026-09-12', ['hollister', 2], ['carmel', 2]),
        row('9', '2026-09-20', ['monterey', 2], ['carmel', 1], { copiesDisagree: true }),
        row('10', '2026-09-20', [null, 2], ['carmel', 1]),
      ],
      today,
      fetchedAt,
    });
    expect(m.added).toEqual([]);
    expect(m.unused).toEqual([
      { sbliveGameId: '10', reason: 'opponent-not-registry' },
      { sbliveGameId: '8', reason: 'maxpreps-pair-nearby' },
      { sbliveGameId: '9', reason: 'copies-disagree' },
    ]);
  });

  it('matches York, a JV team outside the registry, by its si.com and MaxPreps ids, never by name', () => {
    const YORK_MP = 'e9a91bc8-5999-4321-9e21-d6cdc8aafcb2';
    expect(JV_OUTSIDE_TEAMS['456850']).toMatchObject({ name: 'York', maxprepsTeamId: YORK_MP, jvFor: 'santa-catalina' });
    const york = (score: number, isHome: boolean) => ({ slug: null, sbliveTeamId: '456850', name: 'York', score, isHome });
    const yorkRow = (id: string, date: string, mine: [string, number], theirs: number): JvSbliveRow => ({
      ...row(id, date, mine, [null, theirs]),
      sides: [{ ...row(id, date, mine, [null, 0]).sides[0], isHome: true }, york(theirs, false)],
    });
    const pending: Game = {
      ...jvGame({ home: 'monterey', away: 'carmel', date: '2026-10-26', status: 'score-pending' }),
      away: { teamId: YORK_MP, slug: null, name: 'York', score: null, result: null },
    };
    // Same name, another si.com id: no match.
    const namesake: JvSbliveRow = {
      ...yorkRow('22', '2026-09-30', ['greenfield', 0], 1),
      sides: [{ ...yorkRow('22', '2026-09-30', ['greenfield', 0], 1).sides[0] }, { ...york(1, false), sbliveTeamId: '999999' }],
    };
    const m = mergeJv({
      games: [pending],
      sblive: [yorkRow('20', '2026-10-26', ['monterey', 1], 2), yorkRow('21', '2026-09-04', ['greenfield', 0], 6), namesake],
      today: '2026-11-03',
      fetchedAt,
    });
    expect(m.filled).toEqual([pending.contestId]);
    expect(m.games.find((g) => g.contestId === pending.contestId)).toMatchObject({
      status: 'final',
      home: { slug: 'monterey', score: 1, result: 'L' },
      away: { teamId: YORK_MP, slug: null, name: 'York', score: 2, result: 'W' },
    });
    expect(m.added).toEqual(['sblive:21']);
    expect(m.games.find((g) => g.contestId === 'sblive:21')).toMatchObject({
      site: 'home',
      home: { slug: 'greenfield', score: 0, result: 'L' },
      away: { teamId: YORK_MP, slug: null, name: 'York', score: 6, result: 'W' },
      leagueDivision: null,
    });
    expect(m.unused).toEqual([{ sbliveGameId: '22', reason: 'opponent-not-registry' }]);
  });

  it('uses no si.com row when two are equally near one game', () => {
    const g = jvGame({ home: 'carmel', away: 'hollister', date: '2026-09-03', status: 'score-pending' });
    const m = mergeJv({
      games: [g],
      sblive: [row('1', '2026-09-02', ['hollister', 0], ['carmel', 1]), row('2', '2026-09-04', ['hollister', 3], ['carmel', 1])],
      today,
      fetchedAt,
    });
    expect(m.filled).toEqual([]);
    expect(m.games).toEqual([g]);
    expect(m.unused.map((u) => u.reason)).toEqual(['ambiguous', 'ambiguous']);
  });
});

describe('applyJvCorrections: MaxPreps JV rows left out or re-pointed by contest id', () => {
  const twin = jvGame({ home: 'berkeley', away: 'convent-sacred-heart', date: '2026-09-09', hs: 0, as: 3 });
  const stray: Game = {
    ...jvGame({ home: 'berkeley', away: 'convent-sacred-heart', date: '2026-09-09', status: 'score-pending' }),
    contestId: 'stray-1',
    away: { teamId: 'boys-stuart-hall', slug: null, name: 'Stuart Hall', score: null, result: null },
  };
  const wrongTeam: Game = {
    ...jvGame({ home: 'stevenson', away: 'salinas', date: '2026-10-12', status: 'score-pending' }),
    contestId: 'wrong-1',
    home: { teamId: 'another-stevenson', slug: null, name: 'Stevenson', score: null, result: null },
  };
  const config = {
    excludedContestIds: { 'stray-1': 'a second copy of Berkeley v Convent that day', 'gone-1': 'not in the feed' },
    opponentFixes: {
      'wrong-1': { side: 'home' as const, wrongTeamId: 'another-stevenson', slug: 'stevenson', source: 'PCAL’s schedule.' },
    },
  };

  it('drops an excluded row, re-points a wrong side to the registry school, and reports unused entries', () => {
    const r = applyJvCorrections([twin, stray, wrongTeam], config);
    expect(r.games.map((g) => g.contestId)).toEqual([twin.contestId, 'wrong-1']);
    expect(r.excluded).toEqual([{ game: stray, reason: config.excludedContestIds['stray-1'] }]);
    const fixed = r.games[1];
    const stevenson = getTeamBySlug('stevenson')!;
    expect(fixed.home).toMatchObject({ teamId: stevenson.id, slug: 'stevenson', name: stevenson.name, score: null });
    expect(fixed.leagueDivision).toBe('pcal');
    expect(r.fixed.map((f) => f.game.contestId)).toEqual(['wrong-1']);
    expect(r.unused).toEqual(['gone-1']);
  });

  it('gives every row filed under Santa Catalina, which fields no JV team, to York, whose JV slot it is', () => {
    const g = jvGame({ home: 'salinas', away: 'santa-catalina', date: '2026-09-30', status: 'score-pending' });
    const r = applyJvCorrections([g], { excludedContestIds: {}, opponentFixes: {} });
    expect(r.games[0].away).toMatchObject({ teamId: 'e9a91bc8-5999-4321-9e21-d6cdc8aafcb2', slug: null, name: 'York' });
    expect(r.games[0].home.slug).toBe('salinas');
    expect(r.fixed.map((f) => f.game.contestId)).toEqual([g.contestId]);
    expect(buildTeamJvView('santa-catalina')).toMatchObject({ rows: [], emptyHeading: 'Santa Catalina fields no JV team.' });
  });

  it('leaves a row MaxPreps has fixed alone, and reports its entry unused', () => {
    const already: Game = { ...wrongTeam, home: { ...wrongTeam.home, teamId: getTeamBySlug('stevenson')!.id, slug: 'stevenson' } };
    const r = applyJvCorrections([already], { excludedContestIds: {}, opponentFixes: config.opponentFixes });
    expect(r.games).toEqual([already]);
    expect(r.unused).toEqual(['wrong-1']);
  });

  it('is configured by contest GUID, re-points only to registry schools, and is applied before the merge', () => {
    const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    const registryIds = new Set(TEAMS.map((t) => t.id));
    for (const id of Object.keys(JV_CORRECTIONS.excludedContestIds)) expect(id).toMatch(guid);
    for (const [id, fix] of Object.entries(JV_CORRECTIONS.opponentFixes)) {
      expect(id).toMatch(guid);
      expect(getTeamBySlug(fix.slug), fix.slug).toBeDefined();
      expect(registryIds.has(fix.wrongTeamId)).toBe(false);
    }
    const c = getJvCorrections();
    const merged = new Set(getJvMerge().games.map((g) => g.contestId));
    for (const { game: g } of c.excluded) expect(merged.has(g.contestId)).toBe(false);
    for (const { game: g } of c.fixed) expect(merged.has(g.contestId)).toBe(true);
  });
});

describe('applyJvCorrections: a date move', () => {
  it('moves a row to the date a school’s schedule gives, keeping its time and MaxPreps’ date beside it', () => {
    const g = jvGame({ home: 'los-altos', away: 'st-ignatius', date: '2026-09-09', status: 'score-pending' });
    const move = { fromDateKey: '2026-09-09', dateKey: '2026-10-08', source: 'Rescheduled.' };
    const r = applyJvCorrections([g], { excludedContestIds: {}, opponentFixes: {}, dateMoves: { [g.contestId]: move } });
    const m = r.games[0];
    expect(m.dateKey).toBe('2026-10-08');
    expect(m.dateLocal.slice(0, 10)).toBe('2026-10-08');
    expect(m.dateLocal.slice(10)).toBe(g.dateLocal.slice(10));
    expect(new Date(m.dateUtc).getTime() - new Date(g.dateUtc).getTime()).toBe(29 * 86_400_000);
    expect(m.provenance.dateCorrection).toEqual({ maxprepsDateLocal: g.dateLocal, maxprepsTimeTba: g.isTimeTba, source: 'Rescheduled.' });
    expect(r.moved.map((x) => x.game.contestId)).toEqual([g.contestId]);
    // A row MaxPreps has since moved is left alone.
    const already = { ...g, dateKey: '2026-10-08' };
    expect(applyJvCorrections([already], { excludedContestIds: {}, opponentFixes: {}, dateMoves: { [g.contestId]: move } }).unused).toEqual([
      g.contestId,
    ]);
  });
});

describe('mergeJvSchoolSites: a school’s own athletics site, after MaxPreps and si.com', () => {
  const today = '2026-11-03';
  const fetchedAt = '2026-11-03T15:00:00.000Z';
  const site = (school: string, games: JvSchoolSite['games']): JvSchoolSite => ({
    school,
    url: `https://example.org/${school}/jv`,
    readOn: today,
    label: `${getTeamBySlug(school)!.shortName}’s athletics site`,
    games,
  });

  it('fills a past game with no score, marks it, and reads a forfeit', () => {
    const pending = jvGame({ home: 'fremont', away: 'saint-francis', date: '2026-09-09', status: 'score-pending' });
    const forfeit = jvGame({ home: 'los-altos', away: 'st-ignatius', date: '2026-10-08', status: 'score-pending' });
    const m = mergeJvSchoolSites({
      games: [pending, forfeit],
      sites: [
        site('saint-francis', [{ dateKey: '2026-09-09', time: '17:15', opponent: 'fremont', home: false, score: [5, 0] }]),
        site('st-ignatius', [
          { dateKey: '2026-10-08', time: '17:15', opponent: 'los-altos', home: false, score: [1, 0], opponentForfeit: true },
        ]),
      ],
      today,
      fetchedAt,
    });
    expect(m.filled).toEqual([pending.contestId, forfeit.contestId]);
    expect(m.games[0]).toMatchObject({
      status: 'final',
      home: { slug: 'fremont', score: 0, result: 'L' },
      away: { slug: 'saint-francis', score: 5, result: 'W' },
      provenance: { scores: 'school-site' },
      urls: { school: 'https://example.org/saint-francis/jv' },
    });
    expect(m.games[1]).toMatchObject({ isForfeit: true, forfeitBy: 'home', decider: 'FORFEIT', away: { score: 1, result: 'W' } });
  });

  it('keeps a MaxPreps final it disagrees with and notes the school’s score, and adds a game nobody lists', () => {
    const final = jvGame({ home: 'homestead', away: 'st-ignatius', date: '2026-09-21', hs: 0, as: 5 });
    const near = jvGame({ home: 'st-ignatius', away: 'fremont', date: '2026-10-21', hs: 4, as: 0 });
    const m = mergeJvSchoolSites({
      games: [final, near],
      sites: [
        site('st-ignatius', [
          { dateKey: '2026-09-21', time: '17:15', opponent: 'homestead', home: false, score: [6, 0] },
          { dateKey: '2026-09-30', time: '17:15', opponent: 'cupertino', home: true, score: [7, 0] },
          // Fremont within two weeks of Oct 21 already: not added.
          { dateKey: '2026-10-12', time: '17:15', opponent: 'fremont', home: false, score: [2, 0] },
          { dateKey: '2026-12-01', time: '17:15', opponent: 'mitty', home: true, score: [2, 0] },
        ]),
      ],
      today,
      fetchedAt,
    });
    expect(m.differs).toEqual([
      { contestId: final.contestId, note: 'St. Ignatius’s athletics site has St. Ignatius 6, Homestead 0; MaxPreps’ score is shown.' },
    ]);
    expect(m.games.find((g) => g.contestId === final.contestId)).toEqual(final);
    expect(m.added).toEqual(['school:st-ignatius:2026-09-30:cupertino']);
    expect(m.games.find((g) => g.contestId === m.added[0])).toMatchObject({
      dateLocal: '2026-09-30T17:15:00',
      dateUtc: '2026-10-01T00:15:00Z',
      home: { slug: 'st-ignatius', score: 7 },
      away: { slug: 'cupertino', score: 0 },
      leagueDivision: 'de-anza',
      provenance: { scores: 'school-site', schedule: 'school-site' },
    });
    expect(m.unused.map((u) => u.reason).sort()).toEqual(['not-needed', 'pair-nearby']);
  });

  it('uses a game two pages list only when they agree', () => {
    const sf = site('saint-francis', [{ dateKey: '2026-09-23', time: '17:15', opponent: 'st-ignatius', home: false, score: [1, 0] }]);
    const si = (mine: number, theirs: number) =>
      site('st-ignatius', [{ dateKey: '2026-09-23', time: '17:15', opponent: 'saint-francis', home: true, score: [mine, theirs] }]);
    const agree = schoolSiteResults([sf, si(0, 1)]);
    expect(agree.results).toHaveLength(1);
    expect(agree.results[0]).toMatchObject({ home: 'st-ignatius', away: 'saint-francis', homeScore: 0, awayScore: 1 });
    expect(agree.results[0].sites).toHaveLength(2);
    expect(schoolSiteResults([sf, si(1, 1)])).toEqual({ results: [], disagree: ['2026-09-23:saint-francis@st-ignatius'] });
  });

  it('transcribes only registry schools, and the two committed pages agree with each other', () => {
    for (const s of JV_SCHOOL_SITES) {
      expect(getTeamBySlug(s.school), s.school).toBeDefined();
      for (const g of s.games) expect(getTeamBySlug(g.opponent), g.opponent).toBeDefined();
    }
    expect(schoolSiteResults().disagree).toEqual([]);
  });
});

describe('data/jv.json', () => {
  const raw = JSON.parse(readFileSync(path.join(REPO, 'data', 'jv.json'), 'utf8')) as JvFile;

  it('validates and is what the read API serves', () => {
    const parsed = JvFileSchema.safeParse(raw);
    expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues.slice(0, 5))).toBe(true);
    expect(getJvFile().fetchedAt).toBe(raw.fetchedAt);
    expect(JV_TEAM_COUNT).toBe(TEAMS.length);
    expect(raw.teams.map((t) => t.slug)).toEqual(TEAMS.map((t) => t.slug));
    for (const t of TEAMS) expect(getJvTeam(t.slug)?.teamId).toBe(t.id);
  });

  it('lets no JV game count for a varsity table or a postseason, in the file or after the merge', () => {
    for (const g of getJvMerge().games) {
      expect(g.countsFor).toBeNull();
      expect(g.postseason).toBeNull();
    }
  });

  it('refuses a stranger, a missing team, a si.com game and wrong counts', () => {
    const short = structuredClone(raw);
    short.teams.pop();
    short.counts = countJv(short.teams, short.games, short.sblive);
    expect(JvFileSchema.safeParse(short).success).toBe(false);
    const sb = structuredClone(raw);
    if (sb.games[0]) sb.games[0].contestId = 'sblive:1';
    expect(JvFileSchema.safeParse(sb).success).toBe(raw.games.length === 0);
    const counts = structuredClone(raw);
    counts.counts.games += 1;
    expect(JvFileSchema.safeParse(counts).success).toBe(false);
  });

  it('ignores fetchedAt and error in its content key', () => {
    const later = structuredClone(raw);
    later.fetchedAt = '2099-01-01T00:00:00.000Z';
    expect(jvContentKey(later)).toBe(jvContentKey(raw));
  });
});

describe('the JV views', () => {
  it('lists a school’s JV games oldest first, with what was played and what is to come', () => {
    const slug = TEAMS.find((t) => getJvGamesForTeam(t.slug).length > 0)?.slug;
    expect(slug).toBeDefined();
    const view = buildTeamJvView(slug!)!;
    expect(view.rows.map((r) => r.game.dateLocal)).toEqual([...view.rows.map((r) => r.game.dateLocal)].sort());
    expect(view.played).toBe(view.rows.filter((r) => r.game.status === 'final').length);
    // The header's counts (played · to come · no score) add up to the rows listed under it.
    for (const t of TEAMS) {
      const v = buildTeamJvView(t.slug);
      if (!v) continue;
      expect(v.played + v.toCome + v.noScore, `components/teams/jv-view.ts ${t.slug}`).toBe(v.rows.length);
    }
    expect(view.sbliveScores).toBe(view.rows.filter((r) => r.game.provenance.scores === 'sblive').length);
    expect(buildTeamJvView('not-a-school')).toBeNull();
  });

  it('gives a day its JV games and nothing from another day', () => {
    const date = getJvMerge().games[0]?.dateKey;
    if (!date) return;
    for (const r of buildDayJvView(date).rows) expect(r.game.dateKey).toBe(date);
  });
});

describe('scripts/fetch-jv.ts, offline over the PCAL captures', () => {
  const fetchedAt = '2026-10-05T19:52:00.000Z';
  const run = (out: string, ...extra: string[]) =>
    runScript('scripts/fetch-jv.ts', ['--fixtures', FIXTURES, '--leagues', 'pcal', '--out', out, '--fetched-at', fetchedAt, ...extra]);

  it('builds a valid file: PCAL read from both sources, every other league pending', () => {
    const out = path.join(mkdtempSync(path.join(tmpdir(), 'scvalfh-jv-')), 'jv.json');
    const r = run(out);
    expect(r.status, r.output).toBe(0);
    const file = JvFileSchema.parse(JSON.parse(readFileSync(out, 'utf8')));
    for (const t of file.teams) {
      if (PCAL.includes(t.slug)) {
        expect(t.maxpreps.status).toBe('ok');
        expect(t.sblive.status).toBe('ok');
      } else {
        expect(t.maxpreps.status).toBe('pending');
      }
    }
    expect(file.games.length).toBeGreaterThan(0);
    expect(file.sblive.length).toBeGreaterThan(0);
    const merged = mergeJv({ games: file.games, sblive: file.sblive, today: '2026-10-05', fetchedAt });
    // PCAL's JV scores are mostly on si.com: it fills and adds games MaxPreps has no score for.
    expect(merged.filled.length + merged.added.length).toBeGreaterThan(0);
    expect(r.stdout).toMatch(/PCAL {3}7 teams · 7 ok/);
  });

  it('leaves an unchanged file as it was, and carries a failed school’s rows forward', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'scvalfh-jv-'));
    const out = path.join(dir, 'jv.json');
    expect(run(out).status).toBe(0);
    const first = readFileSync(out, 'utf8');
    const again = runScript('scripts/fetch-jv.ts', [
      '--fixtures', FIXTURES, '--leagues', 'pcal', '--out', out, '--fetched-at', '2026-10-06T05:00:00.000Z',
    ]);
    expect(again.status).toBe(0);
    expect(again.stdout).toContain('no change since');
    expect(readFileSync(out, 'utf8')).toBe(first);

    // A fixture directory missing Carmel's MaxPreps capture: Carmel's games are carried.
    const partial = mkdtempSync(path.join(tmpdir(), 'scvalfh-jv-fx-'));
    for (const slug of PCAL) {
      for (const name of [`jv-sched-${slug}.json`, `jv-sblive-${slug}.html`]) {
        if (name === 'jv-sched-carmel.json') continue;
        writeFileSync(path.join(partial, name), readFileSync(path.join(FIXTURES, name)));
      }
    }
    const failed = runScript('scripts/fetch-jv.ts', [
      '--fixtures', partial, '--leagues', 'pcal', '--out', out, '--fetched-at', '2026-10-06T05:00:00.000Z',
    ]);
    expect(failed.status).toBe(1);
    const file = JvFileSchema.parse(JSON.parse(readFileSync(out, 'utf8')));
    const carmel = file.teams.find((t) => t.slug === 'carmel')!;
    expect(carmel.maxpreps.status).toBe('carried-forward');
    expect(carmel.maxpreps.fetchedAt).toBe(fetchedAt);
    const before = JvFileSchema.parse(JSON.parse(first));
    const ids = (f: JvFile) => f.games.filter((g) => g.home.slug === 'carmel' || g.away.slug === 'carmel').map((g) => g.contestId).sort();
    expect(ids(file)).toEqual(ids(before));
  });

  // The whole-file schema wants one row per registry team, in registry order, so it fails whenever the
  // registry grows. A `--leagues` run must still carry every team outside it from that file, row by
  // row (lib/fetch-scope.ts readPreviousFile), as fetch-rosters and fetch-player-stats do; it once
  // dropped every such team to 'pending' with no games.
  it('salvages a previous file that fails the whole-file schema row by row, carrying the teams outside the run', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'scvalfh-jv-'));
    const out = path.join(dir, 'jv.json');
    expect(run(out).status).toBe(0);
    const before = JvFileSchema.parse(JSON.parse(readFileSync(out, 'utf8')));
    // A file written before Southwest (the last registry team) was in the registry, and with one bad
    // PCAL row (a teamId that is not the registry's): two different reasons it is not whole.
    const older = structuredClone(before);
    older.teams = older.teams.filter((t) => t.slug !== 'southwest');
    older.teams.find((t) => t.slug === 'stevenson')!.teamId = 'not-a-maxpreps-id';
    older.counts = countJv(older.teams, older.games, older.sblive);
    expect(JvFileSchema.safeParse(older).success).toBe(false);
    writeFileSync(out, JSON.stringify(older));

    // A Metro-only run over an empty capture directory: the Metro feeds fail (exit 1 on its own), and
    // PCAL is outside the run.
    const empty = mkdtempSync(path.join(tmpdir(), 'scvalfh-jv-fx-'));
    const r = runScript('scripts/fetch-jv.ts', [
      '--fixtures', empty, '--leagues', 'metro', '--out', out, '--fetched-at', '2026-10-06T05:00:00.000Z',
    ]);
    expect(r.status, r.output).toBe(1);
    expect(r.output).toMatch(/WARN previous .*jv\.json: 1 row\(s\) do not validate/);
    const file = JvFileSchema.parse(JSON.parse(readFileSync(out, 'utf8')));
    const team = (f: JvFile, slug: string) => f.teams.find((t) => t.slug === slug)!;
    const ids = (f: JvFile, slug: string) =>
      f.games.filter((g) => g.home.slug === slug || g.away.slug === slug).map((g) => g.contestId).sort();
    for (const slug of PCAL.filter((p) => p !== 'stevenson')) {
      // Kept exactly as the previous file had it: status, stamp, games and si.com rows.
      expect(team(file, slug), slug).toEqual(team(before, slug));
      expect(ids(file, slug), slug).toEqual(ids(before, slug));
      expect(file.sblive.filter((row) => row.pages.includes(slug))).toEqual(before.sblive.filter((row) => row.pages.includes(slug)));
    }
    expect(ids(file, 'carmel').length).toBeGreaterThan(0);
    // Stevenson's own row was dropped: pending now, and named in the log.
    expect(team(file, 'stevenson').maxpreps.status).toBe('pending');
    expect(r.stdout).toContain('PCAL   7 teams · not in this run · 6 kept as they were · 1 pending, previous row dropped (stevenson)');
  });

  it('fetches and writes nothing out of season unless forced', () => {
    const out = path.join(mkdtempSync(path.join(tmpdir(), 'scvalfh-jv-')), 'jv.json');
    const r = runScript('scripts/fetch-jv.ts', ['--fixtures', FIXTURES, '--leagues', 'pcal', '--out', out, '--fetched-at', '2026-07-01T19:00:00.000Z']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('out of season');
    expect(() => readFileSync(out)).toThrow();
  });
});
