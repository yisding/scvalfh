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
import { getJvFile, getJvGamesForTeam, getJvMerge, getJvTeam } from '../lib/jv';
import { JV_FILL_NOTE, mergeJv } from '../lib/jv-merge';
import { JV_TEAM_COUNT, JvFileSchema, countJv, jvContentKey, type JvFile, type JvSbliveRow } from '../lib/jv-schema';
import { JV_SBLIVE_PATHS, JV_SLUG_BY_SBLIVE_ID, jvMaxprepsScheduleUrl, jvSbliveGamesUrl, jvSbliveTeamId } from '../lib/jv-teams';
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

  it('gives each school its own JV id, never a varsity one, and none to Marin Academy', () => {
    const ids = TEAMS.map((t) => jvSbliveTeamId(t.slug)).filter((id): id is string => id !== null);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(48);
    const varsity = new Set(TEAMS.map((t) => t.external.sbliveTeamId));
    for (const id of ids) expect(varsity.has(id)).toBe(false);
    expect(jvSbliveTeamId('marin-academy')).toBeNull();
    expect(jvSbliveGamesUrl('marin-academy')).toBeNull();
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

  it('never lets a JV game count: no table, no postseason, in the file or after the merge', () => {
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

  it('fetches and writes nothing out of season unless forced', () => {
    const out = path.join(mkdtempSync(path.join(tmpdir(), 'scvalfh-jv-')), 'jv.json');
    const r = runScript('scripts/fetch-jv.ts', ['--fixtures', FIXTURES, '--leagues', 'pcal', '--out', out, '--fetched-at', '2026-07-01T19:00:00.000Z']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('out of season');
    expect(() => readFileSync(out)).toThrow();
  });
});
