/**
 * si.com's league scoreboards (lib/sources/sblive.ts sbliveLeagueScoresUrl): read for a day the statewide scoreboard cut
 * short (its page holds a day's first 24 games), for the leagues of ours that played that day. The plan, the parser
 * over a real page, and the field hockey corpus run with one statewide day cut short, with and without the league page.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { leagueScoreboardPlan, SBLIVE_LEAGUE_SCOREBOARD_CAP, stepSblive } from '../../lib/pipeline/steps/sblive';
import { stepOfficial } from '../../lib/pipeline/steps/official';
import { getLeague } from '../../lib/leagues';
import { parseLeagueScoresPage, parseScoresDay, sbliveLeagueScoresUrl } from '../../lib/sources/sblive';
import { teamsInLeague } from '../../lib/teams';
import { corpusDir, REPO } from '../helpers';
import { snapshotOf, writeTempVariant } from './support/run-corpus';

const STEPS = { official: stepOfficial, sblive: stepSblive };
const SBLIVE = path.join(corpusDir('all-2026-10-02'), 'sblive');
const DAY = '2026-09-30';

const PROPS_RE = /data-react-props="([^"]*)"/;
const unescape = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const block = (className: string, props: unknown) =>
  `<div data-react-class="${className}" data-react-props="${escape(JSON.stringify(props))}"></div>`;

describe('the league scoreboard plan', () => {
  const scval = teamsInLeague('scval').map((t) => t.slug);
  const bval = teamsInLeague('bval').map((t) => t.slug);

  it('reads, newest day first, each league that played on a day cut short, every si.com slug of it, in config order', () => {
    const sides = [
      { dateKey: '2026-09-29', slugs: [scval[0], 'somewhere-else'] },
      { dateKey: '2026-09-30', slugs: [bval[0], null] },
      { dateKey: '2026-09-30', slugs: [scval[1], scval[2]] },
      // A day the statewide page did not cut: nothing planned for it.
      { dateKey: '2026-09-28', slugs: [scval[3], bval[1]] },
    ];
    const plan = leagueScoreboardPlan(['2026-09-29', '2026-09-30', '2026-09-29'], sides, ['scval', 'bval', 'pcal']);
    const slugs = (l: string) => getLeague(l).sblive.leagueSlugs;
    expect(plan.pages).toEqual([
      ...slugs('scval').map((slug) => ({ league: 'scval', slug, date: '2026-09-30' })),
      ...slugs('bval').map((slug) => ({ league: 'bval', slug, date: '2026-09-30' })),
      ...slugs('scval').map((slug) => ({ league: 'scval', slug, date: '2026-09-29' })),
    ]);
    expect(plan.deferred).toEqual([]);
  });

  it('reads no league outside the run, and holds the rest past the cap for a later run', () => {
    const sides = [{ dateKey: '2026-09-30', slugs: [scval[0], bval[0]] }];
    expect(leagueScoreboardPlan(['2026-09-30'], sides, ['bval']).pages.map((p) => p.league)).toEqual(
      getLeague('bval').sblive.leagueSlugs.map(() => 'bval'),
    );
    const capped = leagueScoreboardPlan(['2026-09-30'], sides, ['scval', 'bval'], 1);
    expect(capped.pages).toHaveLength(1);
    expect(capped.pages.length + capped.deferred.length).toBe(
      getLeague('scval').sblive.leagueSlugs.length + getLeague('bval').sblive.leagueSlugs.length,
    );
    expect(SBLIVE_LEAGUE_SCOREBOARD_CAP).toBeGreaterThanOrEqual(15);
  });
});

describe('parseLeagueScoresPage', () => {
  const html = readFileSync(
    path.join(REPO, 'tests', 'fixtures', 'sblive', 'winter-2026-11-21', 'girls-soccer-league-3912-scval-de-anza-scores-2026-12-08.html'),
    'utf8',
  );

  it('reads every game of the league’s members that day from a real page, with no 24-game cut', () => {
    const warnings: string[] = [];
    const games = parseLeagueScoresPage(html, '3912-scval-de-anza', '2026-12-08', undefined, (w) => warnings.push(w));
    expect(warnings).toEqual([]);
    expect(games.map((g) => g.sbliveGameId).sort()).toEqual(['5950822', '6752329', '6841241', '6852554']);
    for (const g of games) {
      expect(g.dateKey).toBe('2026-12-08');
      expect(g.origin).toBe('scoreboard');
      expect(g.url).toMatch(/^https:\/\/www\.si\.com\/high-school\/stats\/california\/girls-soccer\/games\/\d+-/);
    }
    expect(games.flatMap((g) => g.sides.map((s) => s.name)).sort()).toEqual(
      ['Aptos', 'Archbishop Mitty', 'Carlmont', 'Homestead', 'Los Gatos', 'Mountain View', 'Pacific Collegiate', 'Santa Clara'].sort(),
    );
  });

  it('gives no rows when si.com serves another day: a league with no game on the date asked for gets its last day with games', () => {
    // The same page asked for as another date: si.com's answer for a day the league did not play.
    expect(parseLeagueScoresPage(html, '3912-scval-de-anza', '2026-12-07')).toEqual([]);
    expect(parseLeagueScoresPage(html, '3912-scval-de-anza', '2026-12-08')).toHaveLength(4);
  });

  it('refuses a page for another league than the one asked for (si.com renumbers leagues)', () => {
    expect(() => parseLeagueScoresPage(html, '3913-scval-el-camino', '2026-12-08')).toThrow(/is for 3912-scval-de-anza, not 3913-scval-el-camino/);
  });

  it('refuses the statewide page, and the statewide parser refuses a league page', () => {
    expect(() => parseLeagueScoresPage(readFileSync(path.join(SBLIVE, `scores/${DAY}.html`), 'utf8'), '3912-scval-de-anza', DAY)).toThrow(
      /no data-react-props for "organizations\/Scores"/,
    );
    expect(() => parseScoresDay(html)).toThrow(/no data-react-props for "games\/GenderSportIndex"/);
  });
});

describe('a corpus run with a statewide day cut short', () => {
  // The all-2026-10-02 corpus's 2026-09-30 statewide page, made to look cut short: SCVAL's games are taken off it and
  // `hasNextPage` set. A SCVAL league page that day holds exactly the games taken off.
  const statewide = readFileSync(path.join(SBLIVE, `scores/${DAY}.html`), 'utf8');
  const props = JSON.parse(unescape(PROPS_RE.exec(statewide)![1])) as {
    query: { scoreboardDate: { date: string; games: { nodes: Array<{ id: string | number }>; totalCount?: number; pageInfo?: unknown } } };
  };
  const scval = new Set(teamsInLeague('scval').map((t) => t.slug));
  const scvalIds = new Set(
    parseScoresDay(statewide).games.filter((g) => g.sides.some((s) => s.slug && scval.has(s.slug))).map((g) => g.sbliveGameId),
  );
  const nodes = props.query.scoreboardDate.games.nodes;
  const kept = nodes.filter((n) => !scvalIds.has(String(n.id)));
  const moved = nodes.filter((n) => scvalIds.has(String(n.id)));
  const cut = {
    ...props,
    query: { ...props.query, scoreboardDate: { ...props.query.scoreboardDate, games: { ...props.query.scoreboardDate.games, nodes: kept, totalCount: nodes.length, pageInfo: { hasNextPage: true, endCursor: 'MjQ' } } } },
  };
  const cutPage = statewide.replace(PROPS_RE, () => `data-react-props="${escape(JSON.stringify(cut))}"`);
  const deAnza = getLeague('scval').sblive.leagueSlugs[0];
  const leaguePage = block('organizations/Scores', {
    query: { organization: { slug: deAnza, scoreboardDate: { date: DAY, games: { nodes: moved, pageInfo: { hasNextPage: false } } } } },
  });

  it('the setup moves SCVAL games, and the statewide parser sees the day as cut short', () => {
    expect(moved.length).toBeGreaterThan(0);
    expect(kept.length).toBeGreaterThan(0);
    expect(parseScoresDay(cutPage).truncated).toBe(true);
    expect(parseScoresDay(statewide).truncated).toBe(false);
  });

  it('reads the league page for that day, and publishes what the uncut page gave: same games, same cross-check', async () => {
    const base = await snapshotOf({ steps: STEPS });
    const variant = writeTempVariant({
      [`sblive/scores/${DAY}`]: { rel: 'scores.html', body: cutPage },
      [`sblive/league-scores/${deAnza}/${DAY}`]: { rel: 'league.html', body: leaguePage },
    });
    const { snapshot, run } = await snapshotOf({ variants: [variant], steps: STEPS });
    expect(snapshot.games).toEqual(base.snapshot.games);
    expect(snapshot.sbliveCrossCheck?.compared).toBe(base.snapshot.sbliveCrossCheck?.compared);
    // The league page is a source row; the El Camino page, not in the corpus, is no row at all.
    const rows = snapshot.sources.filter((r) => r.kind === 'sblive-scoreboard' && r.url.includes('/leagues/'));
    expect(rows.map((r) => [r.label, r.status, r.rowCount])).toEqual([[`sblive ${deAnza} scoreboard ${DAY}`, 'ok', moved.length]]);
    expect(rows[0].url).toBe(sbliveLeagueScoresUrl(deAnza, DAY));
    expect(run.result?.logLines.some((l) => /lists \d+ of \d+ games/.test(l))).toBe(true);
  });

  it('without the league page the cut day costs those games, and nothing else changes', async () => {
    const base = await snapshotOf({ steps: STEPS });
    const variant = writeTempVariant({ [`sblive/scores/${DAY}`]: { rel: 'scores.html', body: cutPage } });
    const { snapshot } = await snapshotOf({ variants: [variant], steps: STEPS });
    expect(snapshot.sources.filter((r) => r.kind === 'sblive-scoreboard' && r.url.includes('/leagues/'))).toEqual([]);
    expect(snapshot.sbliveCrossCheck!.compared).toBeLessThan(base.snapshot.sbliveCrossCheck!.compared);
  });
});
