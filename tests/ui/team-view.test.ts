/**
 * The teams pages' view models and markup (SPEC §10.5, §8.1, §10.0, §10.9):
 * `components/teams/team-view.ts`, `components/teams/*`, `/teams` and `/teams/[slug]`.
 *
 * League-specific values are asserted on the all-2026-10-02 CORPUS snapshot (SPEC §13.6), loaded by
 * pointing SCVAL_SNAPSHOT at it BEFORE lib/data is imported (dynamic imports after
 * `vi.resetModules()`), so live fetch #2 cannot break them. The "no results" case (gp 0) does not
 * occur in the corpus, so one block runs on a copy of it with one MCAL team's results zeroed. Every
 * assertion message names the module that produced the value, so a failure routes to its owner.
 */

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { Snapshot } from '../../lib/types';
import { corpusSnapshotPath } from '../helpers';
// textOf: the `<main>`-equivalent text of a page (the page component renders no layout).
import { textOf } from './html-text';

type Data = typeof import('../../lib/data');
type Leagues = typeof import('../../lib/leagues');
type View = typeof import('../../components/teams/team-view');

const priorEnv = process.env.SCVAL_SNAPSHOT;
let corpusPath: string;
let data: Data;
let leagues: Leagues;
let view: View;
let renderTeam: (slug: string) => Promise<string>;
let renderIndex: () => string;
let describeTeam: (slug: string) => Promise<string | undefined>;

async function loadModules() {
  vi.resetModules();
  const d = await import('../../lib/data');
  const l = await import('../../lib/leagues');
  const v = await import('../../components/teams/team-view');
  const teamPage = await import('../../app/teams/[slug]/page');
  const indexPage = (await import('../../app/teams/page')).default;
  return {
    d,
    l,
    v,
    renderTeam: async (slug: string) => {
      const el = await teamPage.default({ params: Promise.resolve({ slug }) } as never);
      return renderToStaticMarkup(el as ReactElement);
    },
    renderIndex: () => renderToStaticMarkup(createElement(indexPage)),
    describeTeam: async (slug: string) => {
      const meta = await teamPage.generateMetadata({ params: Promise.resolve({ slug }) } as never);
      return typeof meta.description === 'string' ? meta.description : undefined;
    },
  };
}

beforeAll(async () => {
  corpusPath = corpusSnapshotPath('all-2026-10-02');
  process.env.SCVAL_SNAPSHOT = corpusPath;
  const m = await loadModules();
  data = m.d;
  leagues = m.l;
  view = m.v;
  renderTeam = m.renderTeam;
  renderIndex = m.renderIndex;
  describeTeam = m.describeTeam;
}, 600_000);

afterAll(() => {
  if (priorEnv === undefined) delete process.env.SCVAL_SNAPSHOT;
  else process.env.SCVAL_SNAPSHOT = priorEnv;
  vi.resetModules();
});

function ids(html: string): string[] {
  return [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
}

describe('team-view.ts over every division (ALL_DIVISIONS)', () => {
  it('builds a view for every registry team, with the division size and "of N in …"', () => {
    let seen = 0;
    for (const division of leagues.ALL_DIVISIONS) {
      const scope = leagues.divisionHeading(division.id) ?? leagues.getLeague(division.leagueId).shortName;
      const teams = data.getTeams(division.id);
      expect(teams.length, `lib/data.ts getTeams(${division.id})`).toBe(division.expectedTeams);
      for (const team of teams) {
        const v = view.buildTeamPageView(team.slug);
        expect(v, `components/teams/team-view.ts ${team.slug}`).toBeDefined();
        if (!v) continue;
        seen += 1;
        expect(v.divisionSize, `components/teams/team-view.ts ${team.slug} divisionSize`).toBe(division.expectedTeams);
        expect(v.scopeLabel, `components/teams/team-view.ts ${team.slug} scope`).toBe(scope);
        const sub = view.placeSub(v);
        // The tile's VALUE is the ordinal; the sub-line completes it and never opens with "tied".
        expect(sub, `components/teams/team-view.ts placeSub ${team.slug}`).toMatch(
          new RegExp(`^of ${division.expectedTeams} in ${scope.replace('.', '\\.')}( \\(tied\\))?$`),
        );
        expect(sub.endsWith('(tied)'), `components/teams/team-view.ts placeSub tie ${team.slug}`).toBe(
          !!v.standing?.tiebreak.shared,
        );
        expect(v.standingsHref, `components/teams/team-view.ts standingsHref ${team.slug}`).toBe(
          `/standings/${division.leagueId}#${division.id}`,
        );
        expect(v.officialScheduleUrl, `components/teams/team-view.ts schedule url ${team.slug}`).toBe(
          division.official.scheduleUrl,
        );
        expect(v.leagueScheduled, `components/teams/team-view.ts scheduled ${team.slug}`).toBe(division.gamesPerTeam);
        // The league log is exactly the games that count for this team's table.
        expect(
          v.leagueLog.every((g) => g.countsFor === division.id),
          `components/teams/team-view.ts leagueLog ${team.slug}`,
        ).toBe(true);
        expect(v.nonLeagueLog.every((g) => g.countsFor === null), `components/teams/team-view.ts nonLeagueLog ${team.slug}`).toBe(true);
      }
    }
    expect(seen, 'components/teams/team-view.ts: every registry team').toBe(43);
  });

  it('single-division leagues read "of N in <league short>"', () => {
    expect(view.placeSub(view.buildTeamPageView('tamalpais')!).replace(' (tied)', '')).toBe('of 9 in MCAL');
    expect(view.placeSub(view.buildTeamPageView('carmel')!).replace(' (tied)', '')).toBe('of 7 in PCAL');
    expect(view.placeSub(view.buildTeamPageView('leigh')!).replace(' (tied)', '')).toBe('of 6 in Mt. Hamilton');
  });
});

describe('identity lines (components/teams/team-view.ts identityLine)', () => {
  it('a multi-division team: mascot · division · league · city', () => {
    const leigh = view.buildTeamPageView('leigh')!;
    expect(leigh.identityLine, 'components/teams/team-view.ts leigh').toBe(
      `${leigh.team.mascot} · Mt. Hamilton · BVAL · ${leigh.team.city}`,
    );
    const si = view.buildTeamPageView('st-ignatius')!;
    expect(si.identityLine, 'components/teams/team-view.ts st-ignatius').toBe(
      `${si.team.mascot} · De Anza · SCVAL · ${si.team.city}`,
    );
  });

  it('a single-division team has no division label (SPEC §10.5 example)', () => {
    expect(view.buildTeamPageView('tamalpais')!.identityLine, 'components/teams/team-view.ts tamalpais').toBe(
      'Red-Tailed Hawks · MCAL · Mill Valley',
    );
    const carmel = view.buildTeamPageView('carmel')!;
    expect(carmel.identityLine, 'components/teams/team-view.ts carmel').toBe(`${carmel.team.mascot} · PCAL · ${carmel.team.city}`);
  });

  it('the pin label names the team and its league', () => {
    expect(view.buildTeamPageView('leigh')!.pinLabel, 'components/teams/team-view.ts pinLabel').toBe(
      'Pin Leigh, Mt. Hamilton · BVAL',
    );
    expect(view.buildTeamPageView('tamalpais')!.pinLabel, 'components/teams/team-view.ts pinLabel').toBe('Pin Tamalpais, MCAL');
  });
});

describe('league copy (components/teams/team-view.ts leagueCopy)', () => {
  it('end-of-season and bracket sentences by league', () => {
    const scval = view.leagueCopy('scval');
    expect(scval.seasonEndSentence).toBe('The SCVAL league season ends Wed Oct 28 and the SCVAL crossover is Fri Oct 30.');
    expect(scval.bracketSentence).toBe('We will list a playoff game as soon as CCS publishes the bracket.');
    expect(view.leagueCopy('bval').seasonEndSentence).toBe(
      'The BVAL league season ends Fri Oct 30 and the BVAL play-in is Sat Oct 31.',
    );
    const mcal = view.leagueCopy('mcal');
    expect(mcal.seasonEndSentence).toBe('The MCAL league season ends Thu Oct 22 and the MCAL tournament starts Fri Oct 23.');
    expect(mcal.bracketSentence).toBe('We will list a playoff game as soon as MCAL posts the bracket.');
    expect(view.leagueCopy('pcal').bracketSentence).toBe('We will list a playoff game as soon as CCS publishes the bracket.');
  });
});

describe('postseason lines per kind (lib/data.ts getTeamPostseasonLine via team-view)', () => {
  it('CCS ladder leagues link the CCS page; MCAL links its tournament, with no CCS sentence', () => {
    for (const team of data.getTeams()) {
      const v = view.buildTeamPageView(team.slug)!;
      const line = v.postseasonLine;
      if (!v.hasResults) continue;
      expect(line, `lib/data.ts getTeamPostseasonLine ${team.slug}`).not.toBeNull();
      if (!line) continue;
      if (v.league.postseasonKind === 'ccs-ladder') {
        expect(line.href, `lib/data.ts ${team.slug} href`).toBe(`/playoffs#${team.league}`);
        expect(line.linkText, `lib/data.ts ${team.slug} link`).toBe('CCS playoffs →');
      } else {
        expect(line.href, `lib/data.ts ${team.slug} href`).toBe('/playoffs/mcal');
        expect(line.linkText, `lib/data.ts ${team.slug} link`).toBe('MCAL tournament →');
        expect(line.sentence, `lib/data.ts ${team.slug} sentence`).toBe(
          'Top six make the MCAL tournament: quarterfinals Mon Oct 26 (a play-in Fri Oct 23 only if needed), final Fri Oct 30 at Tamalpais; seeds 1-2 get byes to the semifinals.',
        );
        expect(`${line.label} ${line.sentence}`, `lib/data.ts ${team.slug}`).not.toMatch(/CCS|at-large|automatic qualifier/i);
      }
    }
    const si = view.buildTeamPageView('st-ignatius')!;
    expect(si.postseasonLine?.sentence, 'lib/data.ts SCVAL sentence').toBe(
      'The SCVAL crossover and the 4th-place play-in are Fri Oct 30.',
    );
  });

  it('TeamPlayoffLine renders the line and no CCS bracket link for MCAL', async () => {
    const { TeamPlayoffLine } = await import('../../components/teams/TeamPlayoffLine');
    const mcal = renderToStaticMarkup(createElement(TeamPlayoffLine, { view: view.buildTeamPageView('tamalpais')! }));
    expect(mcal, 'components/teams/TeamPlayoffLine.tsx MCAL').toContain('MCAL tournament →');
    expect(mcal, 'components/teams/TeamPlayoffLine.tsx MCAL').not.toContain('CCS');
    const scval = renderToStaticMarkup(createElement(TeamPlayoffLine, { view: view.buildTeamPageView('st-ignatius')! }));
    expect(scval, 'components/teams/TeamPlayoffLine.tsx SCVAL').toContain('CCS playoffs →');
    expect(scval, 'components/teams/TeamPlayoffLine.tsx SCVAL').toContain('Official CCS bracket');
  });
});

describe('/teams/[slug] pages (app/teams/[slug]/page.tsx)', () => {
  it('CCS vs MCAL copy: kicker and meta description', async () => {
    const scval = textOf(await renderTeam('st-ignatius'));
    expect(scval, 'app/teams/[slug]/page.tsx SCVAL kicker').toContain('CCS picture');
    expect(await describeTeam('st-ignatius'), 'app/teams/[slug]/page.tsx SCVAL description').toMatch(
      /… ?goal margins and CCS picture\.$|goal margins and CCS picture\.$/,
    );
    expect(await describeTeam('tamalpais'), 'app/teams/[slug]/page.tsx MCAL description').toMatch(
      /goal margins and MCAL tournament picture\.$/,
    );
  });

  it('no CCS concept inside an MCAL team page (SPEC §10.9), for all nine', async () => {
    for (const team of data.getTeams({ league: 'mcal' })) {
      const html = await renderTeam(team.slug);
      const text = textOf(html);
      expect(text, `app/teams/[slug]/page.tsx ${team.slug}`).toContain('MCAL tournament picture');
      for (const banned of ['automatic qualifier', 'at-large', 'CCS picture', 'CCS Division', 'Gabilan', 'eliminated']) {
        expect(text.toLowerCase().includes(banned.toLowerCase()), `app/teams/[slug]/page.tsx ${team.slug}: "${banned}"`).toBe(false);
      }
      expect(text, `app/teams/[slug]/page.tsx ${team.slug}: division label`).not.toMatch(/MCAL Division|Marin County Division/);
      expect(html, `app/teams/[slug]/page.tsx ${team.slug}: standings link`).toContain('href="/standings/mcal#marin-county"');
    }
  });

  it('every page: identity line, pin control with its league, league links, never 0-0 for a missing score', async () => {
    for (const team of data.getTeams()) {
      const v = view.buildTeamPageView(team.slug)!;
      const html = await renderTeam(team.slug);
      const text = textOf(html);
      expect(text, `components/teams/TeamIdentity.tsx ${team.slug}`).toContain(v.identityLine);
      expect(html, `app/teams/[slug]/page.tsx ${team.slug} standings`).toContain(`href="${v.standingsHref}"`);
      expect(text, `app/teams/[slug]/page.tsx ${team.slug} standings label`).toContain(`${v.league.shortName} standings`);
      expect(text, `components/teams/TeamStatTiles.tsx ${team.slug} GP`).toContain(
        `${v.context!.counted}/${v.context!.scheduled}`,
      );
      expect(html, `app/teams/[slug]/page.tsx ${team.slug}`).not.toContain('Gabilan');
      expect(html, `app/teams/[slug]/page.tsx ${team.slug} game links`).not.toMatch(/href="\/game\/sblive:/);
      if (team.league === 'pcal' || team.league === 'mcal') {
        expect(text, `app/teams/[slug]/page.tsx ${team.slug}: division label`).not.toMatch(/PCAL Division|MCAL Division/);
      }
    }
  });

  it('the margin strip spans the division\'s scheduled league games, never a phantom 14-game season', async () => {
    const PHONE_CELL = 'flex flex-col items-center min-w-3 max-w-14 flex-1';
    const DESKTOP_CELL = 'flex flex-col items-center min-w-6 max-w-14 flex-1';
    let checked = 0;
    for (const division of leagues.ALL_DIVISIONS) {
      for (const team of data.getTeams(division.id)) {
        const v = view.buildTeamPageView(team.slug)!;
        if (!v.marginEntries.some((e) => e.margin !== null && !e.excludedFromMargin)) continue;
        const html = await renderTeam(team.slug);
        const expected = Math.max(division.gamesPerTeam, v.marginEntries.length);
        const count = (cls: string) => html.split(`${cls}"`).length - 1;
        expect(count(PHONE_CELL), `app/teams/[slug]/page.tsx MarginStrip slots ${team.slug}`).toBe(expected);
        expect(count(DESKTOP_CELL), `app/teams/[slug]/page.tsx MarginStrip slots ${team.slug}`).toBe(expected);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(30);
  });

  it('a si.com-only game links by its param, never the raw contest id', async () => {
    const game = data.getGames().find((g) => g.contestId.startsWith('sblive:'));
    expect(game, 'lib/data.ts: the corpus has a si.com backfill').toBeDefined();
    const slug = game!.home.slug ?? game!.away.slug!;
    const html = await renderTeam(slug);
    expect(html, 'components/teams/TeamGameLog.tsx sblive link').toContain(`href="/game/${game!.contestId.replace(':', '-')}"`);
  });
});

describe('/teams (app/teams/page.tsx)', () => {
  it('heading outline: h2 section → h3 league → h4 division; anchors resolve; ids unique', () => {
    const html = renderIndex();
    const all = ids(html);
    expect(new Set(all).size, 'app/teams/page.tsx: unique ids').toBe(all.length);
    for (const id of ['ccs', 'ncs', 'scval', 'de-anza', 'el-camino', 'bval', 'mt-hamilton', 'santa-teresa', 'pcal', 'mcal', 'marin-county', 'team-list', 'team-league-switcher']) {
      expect(all, `app/teams/page.tsx #${id}`).toContain(id);
    }
    expect(html, 'app/teams/page.tsx CCS h2').toMatch(/<h2[^>]*>Central Coast Section<\/h2>/);
    expect(html, 'app/teams/page.tsx NCS h2').toMatch(/<h2[^>]*>North Coast Section<\/h2>/);
    expect(html, 'app/teams/page.tsx section labelling').toContain('<section aria-labelledby="ccs"');
    expect((html.match(/<h3[^>]*>/g) ?? []).length, 'app/teams/page.tsx league h3s').toBe(4);
    const h4s = [...html.matchAll(/<h4 class="m-0 mb-3 text-lead text-ink">([^<]+)<\/h4>/g)].map((m) => m[1]);
    expect(h4s, 'app/teams/page.tsx division h4s').toEqual(['De Anza', 'El Camino', 'Mt. Hamilton', 'Santa Teresa']);
    // Section → league order.
    const order = ['id="ccs"', 'id="scval"', 'id="de-anza"', 'id="el-camino"', 'id="bval"', 'id="pcal"', 'id="ncs"', 'id="mcal"', 'id="marin-county"'].map((s) => html.indexOf(s));
    expect([...order].sort((a, b) => a - b), 'app/teams/page.tsx order').toEqual(order);
  });

  it('the finder hooks: 43 tiles with data-team-tile on the <li>, group wrappers, the switcher wrapper', () => {
    const html = renderIndex();
    const tiles = [...html.matchAll(/<li data-team-tile="([^"]+)"/g)].map((m) => m[1]);
    expect(tiles.length, 'components/teams/TeamTile.tsx data-team-tile').toBe(43);
    expect(new Set(tiles), 'components/teams/TeamTile.tsx').toEqual(new Set(data.getTeamSlugs()));
    expect((html.match(/data-team-group=""/g) ?? []).length, 'app/teams/page.tsx data-team-group').toBe(2 + 4 + 6);
    expect(html, 'app/teams/page.tsx finder').toContain('<search');
    expect(html, 'app/teams/page.tsx switcher').toMatch(/<div id="team-league-switcher"[^>]*>\s*<nav/);
    const text = textOf(html);
    expect(text, 'app/teams/page.tsx description').toContain(
      'All 43 girls varsity teams in SCVAL, BVAL and PCAL (Central Coast Section) and MCAL (North Coast Section). League and division alignment comes from each league’s official schedule.',
    );
    expect(html, 'app/teams/page.tsx').not.toContain('Gabilan');
  });
});

describe('a team with no results (corpus copy, one MCAL team zeroed)', () => {
  let zeroed: { d: Data; v: View; renderTeam: (slug: string) => Promise<string> };
  const slug = 'marin-academy';

  beforeAll(async () => {
    const snap = JSON.parse(readFileSync(corpusPath, 'utf8')) as Snapshot;
    const team = snap.teams.find((t) => t.slug === slug)!;
    // Drop its games and zero its row: a registry member with nothing reported (DESIGN §8).
    snap.games = snap.games.filter((g) => g.home.teamId !== team.id && g.away.teamId !== team.id);
    snap.counts.games = snap.games.length;
    const row = snap.standings.find((r) => r.slug === slug)!;
    const zero = { w: 0, l: 0, t: 0 };
    row.computed = {
      ...row.computed,
      gp: 0, w: 0, l: 0, t: 0, winPct: 0, pts: 0, gf: 0, ga: 0, gd: 0,
      streak: null, last5: [], homeRecord: zero, awayRecord: zero, neutralRecord: zero,
    };
    row.hasReportedResults = false;
    const dir = mkdtempSync(path.join(tmpdir(), 'scvalfh-team-view-'));
    const file = path.join(dir, 'snapshot.json');
    writeFileSync(file, JSON.stringify(snap));
    process.env.SCVAL_SNAPSHOT = file;
    const m = await loadModules();
    zeroed = { d: m.d, v: m.v, renderTeam: m.renderTeam };
  }, 600_000);

  it('getTeamPostseasonLine is null and the block says "No results reported yet."', async () => {
    expect(zeroed.d.getTeamPostseasonLine(slug), 'lib/data.ts getTeamPostseasonLine gp 0').toBeNull();
    const v = zeroed.v.buildTeamPageView(slug)!;
    expect(v.hasResults, 'components/teams/team-view.ts hasResults').toBe(false);
    const text = textOf(await zeroed.renderTeam(slug));
    expect(text, 'components/teams/TeamPlayoffLine.tsx gp 0').toContain('No results reported yet.');
    expect(text, 'app/teams/[slug]/page.tsx gp 0').not.toMatch(/0-0-0/);
    expect(text, 'app/teams/[slug]/page.tsx gp 0: no CCS on MCAL').not.toContain('CCS');
  });
});
