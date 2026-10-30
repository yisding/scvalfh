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

import { ordinal } from '../../lib/format';
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
        // A Southern Section independent (DESIGN §24.10): a league team's view, with the group's table (no fixed
        // schedule, so no scheduled count) and its standings link labelled 'LA standings'.
        if (leagues.isIndependentDivision(division.id)) {
          expect(v.scopeLabel, `components/teams/team-view.ts ${team.slug} scope`).toBe('LA');
          expect(v.divisionSize, `components/teams/team-view.ts ${team.slug} divisionSize`).toBe(division.expectedTeams);
          expect(v.standingsHref, `components/teams/team-view.ts ${team.slug} standingsHref`).toBe(
            `/standings/${division.leagueId}#${division.id}`,
          );
          expect(v.standingsLabel, `components/teams/team-view.ts ${team.slug} standingsLabel`).toBe('LA standings');
          expect(v.leagueScheduled, `components/teams/team-view.ts ${team.slug} scheduled`).toBeNull();
          continue;
        }
        expect(v.divisionSize, `components/teams/team-view.ts ${team.slug} divisionSize`).toBe(division.expectedTeams);
        expect(v.scopeLabel, `components/teams/team-view.ts ${team.slug} scope`).toBe(scope);
        const sub = view.placeSub(v);
        // The tile's VALUE is the ordinal (T-prefixed when level); the sub-line only completes it,
        // so a shared place is never written a second way under the value.
        expect(sub, `components/teams/team-view.ts placeSub ${team.slug}`).toBe(
          `of ${division.expectedTeams} in ${scope}`,
        );
        expect(v.standingsHref, `components/teams/team-view.ts standingsHref ${team.slug}`).toBe(
          `/standings/${division.leagueId}#${division.id}`,
        );
        // A league that publishes no schedule (`official.mode` 'none') has no link to give.
        expect(v.officialScheduleUrl, `components/teams/team-view.ts schedule url ${team.slug}`).toBe(
          division.official.mode === 'none' ? null : division.official.scheduleUrl,
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
    expect(seen, 'components/teams/team-view.ts: every registry team').toBe(102);
  });

  it('single-division leagues read "of N in <league short>"', () => {
    expect(view.placeSub(view.buildTeamPageView('tamalpais')!)).toBe('of 9 in MCAL');
    expect(view.placeSub(view.buildTeamPageView('carmel')!)).toBe('of 7 in PCAL');
    expect(view.placeSub(view.buildTeamPageView('leigh')!)).toBe('of 6 in Mt. Hamilton');
  });
});

describe('identity lines (components/teams/team-view.ts identityLine)', () => {
  it('a multi-division team: mascot and sport · division · league · city', () => {
    const leigh = view.buildTeamPageView('leigh')!;
    expect(leigh.identityLine, 'components/teams/team-view.ts leigh').toBe(
      `${leigh.team.mascot} girls varsity field hockey · Mt. Hamilton · BVAL · ${leigh.team.city}`,
    );
    const si = view.buildTeamPageView('st-ignatius')!;
    expect(si.identityLine, 'components/teams/team-view.ts st-ignatius').toBe(
      `${si.team.mascot} girls varsity field hockey · De Anza · SCVAL · ${si.team.city}`,
    );
  });

  it('a single-division team has no division label (SPEC §10.5 example)', () => {
    expect(view.buildTeamPageView('tamalpais')!.identityLine, 'components/teams/team-view.ts tamalpais').toBe(
      'Red-Tailed Hawks girls varsity field hockey · MCAL · Mill Valley',
    );
    const carmel = view.buildTeamPageView('carmel')!;
    expect(carmel.identityLine, 'components/teams/team-view.ts carmel').toBe(`${carmel.team.mascot} girls varsity field hockey · PCAL · ${carmel.team.city}`);
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
    expect(scval.seasonEndSentence).toBe('The SCVAL league season ends Wed Oct 28 and the SCVAL crossover is Thu Oct 29 and Fri Oct 30.');
    expect(scval.bracketSentence).toBe('We will list a playoff game as soon as CCS publishes the bracket.');
    expect(view.leagueCopy('bval').seasonEndSentence).toBe(
      'The BVAL league season ends Fri Oct 30 and the BVAL play-in is Sat Oct 31.',
    );
    const mcal = view.leagueCopy('mcal');
    // The tournament starts with its first round that is always played: the quarterfinals, not the optional play-in.
    expect(mcal.seasonEndSentence).toBe('The MCAL league season ends Thu Oct 22 and the MCAL tournament starts Mon Oct 26.');
    expect(mcal.bracketSentence).toBe('We will list a playoff game as soon as MCAL posts the bracket.');
    expect(view.leagueCopy('pcal').bracketSentence).toBe('We will list a playoff game as soon as CCS publishes the bracket.');
  });

  it('reads the day: "ended" after the last league date, "started" from the first round, and the bracket page once seeded', () => {
    // Before the last league date: the timeless words, whatever the status.
    expect(view.leagueCopy('mcal', '2026-10-22', 'projected').seasonEndSentence).toBe(
      'The MCAL league season ends Thu Oct 22 and the MCAL tournament starts Mon Oct 26.',
    );
    expect(view.leagueCopy('mcal', '2026-10-24', 'seeded')).toMatchObject({
      seasonEndSentence: 'The MCAL league season ended Thu Oct 22 and the MCAL tournament starts Mon Oct 26.',
      bracketSentence: 'The bracket and results are on the MCAL tournament page.',
    });
    const live = view.leagueCopy('mcal', '2026-10-29', 'in-progress');
    expect(live.seasonEndSentence).toBe('The MCAL league season ended Thu Oct 22 and the MCAL tournament started Mon Oct 26.');
    expect(live.bracketSentence).toBe('The bracket and results are on the MCAL tournament page.');
    expect(view.leagueCopy('mcal', '2026-10-31', 'complete').bracketSentence).toBe('The bracket and results are on the MCAL tournament page.');
    // Still projected from the table (no seeds yet): the promise stands.
    expect(view.leagueCopy('mcal', '2026-10-23', 'projected').bracketSentence).toBe('We will list a playoff game as soon as MCAL posts the bracket.');
    // The tense rule is every league's.
    expect(view.leagueCopy('scval', '2026-10-29').seasonEndSentence).toBe(
      'The SCVAL league season ended Wed Oct 28 and the SCVAL crossover is Thu Oct 29 and Fri Oct 30.',
    );
    expect(view.leagueCopy('sunset', '2026-11-01').seasonEndSentence).toBe('The Sunset season ended Sat Oct 31.');
    // The page passes the snapshot's day and the tournament's status: the corpus (Oct 2) is before both.
    const page = view.buildTeamPageView('tamalpais')!;
    expect(page.league.seasonEndSentence).toBe('The MCAL league season ends Thu Oct 22 and the MCAL tournament starts Mon Oct 26.');
    expect(page.league.bracketSentence).toBe('We will list a playoff game as soon as MCAL posts the bracket.');
    for (const copy of [live, view.leagueCopy('mcal', '2026-10-31', 'complete')]) {
      expect(`${copy.seasonEndSentence} ${copy.bracketSentence}`).not.toMatch(/\bCCS\b|eliminat/i);
    }
  });

  it('an unbracketed league (the Super Regional) states its dates and promises no bracket', () => {
    const unbracketed = leagues.LEAGUES.filter((l) => l.postseason.kind === 'unbracketed-tournament');
    expect(unbracketed.length, 'lib/leagues.ts: one league has an unbracketed postseason').toBe(1);
    for (const league of unbracketed) {
      if (league.postseason.kind !== 'unbracketed-tournament') continue;
      const copy = view.leagueCopy(league.id);
      expect(copy.postseasonKind, 'components/teams/team-view.ts kind').toBe('unbracketed-tournament');
      expect(copy.postseasonName, 'components/teams/team-view.ts postseasonName').toBe('Super Regional');
      expect(copy.seasonEndSentence, 'components/teams/team-view.ts seasonEndSentence').toBe(
        'The EAL league season ends Wed Oct 28; the Super Regional follows, Oct 30–31.',
      );
      expect(copy.bracketSentence, 'components/teams/team-view.ts bracketSentence').toBe(
        'No pairings are published; we list each Super Regional game as MaxPreps posts it.',
      );
    }
    for (const id of ['scval', 'bval', 'pcal']) {
      expect(view.leagueCopy(id as never).postseasonName, `components/teams/team-view.ts ${id}`).toBeNull();
    }
    expect(view.leagueCopy('mcal').postseasonName, 'components/teams/team-view.ts mcal').toBe('MCAL tournament');
  });
});

describe('postseason lines per kind (lib/data.ts getTeamPostseasonLine via team-view)', () => {
  it('CCS ladder leagues link the CCS page; MCAL links its tournament; the EAL states its Super Regional; no CCS sentence outside CCS', () => {
    for (const team of data.getTeams()) {
      const v = view.buildTeamPageView(team.slug)!;
      const line = v.postseasonLine;
      if (!v.hasResults) continue;
      expect(line, `lib/data.ts getTeamPostseasonLine ${team.slug}`).not.toBeNull();
      if (!line) continue;
      if (v.league.postseasonKind === 'ccs-ladder') {
        expect(line.href, `lib/data.ts ${team.slug} href`).toBe(`/playoffs#${team.league}`);
        expect(line.linkText, `lib/data.ts ${team.slug} link`).toBe('CCS playoffs');
      } else if (v.league.postseasonKind === 'unbracketed-tournament') {
        expect(line.href, `lib/data.ts ${team.slug} href`).toBe(`/playoffs#${team.league}`);
        expect(line.linkText, `lib/data.ts ${team.slug} link`).toBe('Postseason');
        expect(line.sentence, `lib/data.ts ${team.slug} sentence`).toBe(
          'The top six schools play the Super Regional, Oct 30–31, and every EAL team is one of the six; the NFHS Network’s CIFNS listing has the games at Pleasant Valley High School, Chico on Sat Oct 31.',
        );
        expect(`${line.label} ${line.sentence}`, `lib/data.ts ${team.slug}`).not.toMatch(/CCS|at-large|automatic qualifier|seed/i);
      } else if (v.league.postseasonKind === 'no-postseason' || v.league.postseasonKind === 'section-playoffs') {
        // The Southern California kinds: their cards on /playoffs, never a CCS or "top N" word.
        expect(line.href, `lib/data.ts ${team.slug} href`).toBe(`/playoffs#${team.league}`);
        expect(`${line.label} ${line.sentence}`, `lib/data.ts ${team.slug}`).not.toMatch(/CCS|at-large|automatic qualifier|top \w+ (make|qualify)/i);
      } else {
        expect(line.href, `lib/data.ts ${team.slug} href`).toBe('/playoffs/mcal');
        expect(line.linkText, `lib/data.ts ${team.slug} link`).toBe('MCAL tournament');
        expect(line.sentence, `lib/data.ts ${team.slug} sentence`).toBe(
          'Top six make the MCAL tournament: quarterfinals Mon Oct 26 (a play-in Fri Oct 23 only if needed), final Fri Oct 30 at Tamalpais; seeds 1-2 get byes to the semifinals.',
        );
        expect(`${line.label} ${line.sentence}`, `lib/data.ts ${team.slug}`).not.toMatch(/CCS|at-large|automatic qualifier/i);
      }
    }
    const si = view.buildTeamPageView('st-ignatius')!;
    expect(si.postseasonLine?.sentence, 'lib/data.ts SCVAL sentence').toBe(
      'The SCVAL crossover and the 4th-place play-in are Thu Oct 29 and Fri Oct 30.',
    );
  });

  it('TeamPlayoffLine renders the line and no CCS bracket link for MCAL', async () => {
    const { TeamPlayoffLine } = await import('../../components/teams/TeamPlayoffLine');
    const mcal = renderToStaticMarkup(createElement(TeamPlayoffLine, { view: view.buildTeamPageView('tamalpais')! }));
    // The arrow is drawn, not spoken (components/ui/Arrow.tsx): the link's name is the words alone.
    expect(mcal, 'components/teams/TeamPlayoffLine.tsx MCAL').toContain('MCAL tournament <span aria-hidden="true">→</span>');
    expect(mcal, 'components/teams/TeamPlayoffLine.tsx MCAL').not.toContain('CCS');
    const scval = renderToStaticMarkup(createElement(TeamPlayoffLine, { view: view.buildTeamPageView('st-ignatius')! }));
    expect(scval, 'components/teams/TeamPlayoffLine.tsx SCVAL').toContain('CCS playoffs <span aria-hidden="true">→</span>');
    expect(scval, 'components/teams/TeamPlayoffLine.tsx SCVAL').toContain('Official CCS bracket');
  });
});

describe('Southern California team pages (DESIGN-socal §2.4)', () => {
  it('league copy: the Sunset has no playoffs to promise; a San Diego league waits for the Section', () => {
    const sunset = view.leagueCopy('sunset');
    expect(sunset.postseasonKind).toBe('no-postseason');
    expect(sunset.postseasonName).toBeNull();
    expect(sunset.seasonEndSentence).toBe('The Sunset season ends Sat Oct 31.');
    expect(sunset.bracketSentence).toMatch(/^The CIF Southern Section holds no field hockey playoffs/);
    const city = view.leagueCopy('city');
    expect(city.postseasonKind).toBe('section-playoffs');
    expect(city.postseasonName).toBe('San Diego Section playoffs');
    expect(city.seasonEndSentence).toBe('The City league season ends Fri Oct 30; the San Diego Section playoffs follow, Nov 2–14.');
    expect(city.bracketSentence).toBe('We will list a playoff game as soon as it is on the schedule; the Section posts its brackets on its field hockey page after its Sat Oct 31 seeding meeting.');
    expect(city.classification).toBe('membership');
  });

  it('the honesty line is the accessor’s: a CCS ladder is projected, a tournament still read from the table too', async () => {
    expect(data.getTeamPostseasonLine('saint-francis')!.caveat).toBe('Projected from the table today; nothing here is official.');
    expect(textOf(await renderTeam('saint-francis'))).toContain('Projected from the table today; nothing here is official.');
    // The corpus snapshot predates the MCAL tournament, so its picture is still a projection from the table.
    expect(data.getLeagueTournament('mcal').status).toBe('projected');
    expect(data.getTeamPostseasonLine('redwood')!.caveat).toBe('Projected from the table today; nothing here is official.');
  });

  it('a Sunset page: kicker "Postseason", the league note whatever it has played, no projection, GP bare', async () => {
    const v = view.buildTeamPageView('huntington-beach')!;
    expect(v.leagueScheduled, 'components/teams/team-view.ts no fixed schedule').toBeNull();
    expect(v.postseasonLine?.href).toBe('/playoffs#sunset');
    const text = textOf(await renderTeam('huntington-beach'));
    expect(text).toContain('Postseason');
    expect(text).toContain('The CIF Southern Section holds no field hockey playoffs');
    expect(text, 'components/teams/TeamPlayoffLine.tsx').not.toContain('Projected from the table today');
    expect(text).not.toMatch(/\bof null\b|\/null|CCS|at-large|automatic qualifier|eliminat/i);
    expect(text, 'components/teams/TeamElo.tsx: one fit').toMatch(/Elo rating/);
  });

  it('a San Diego page: the Section picture kicker, its own region\u2019s Elo board, no CCS word', async () => {
    const v = view.buildTeamPageView('poway')!;
    expect(v.elo.boardHref).toBe('/leaders#elo-rating-socal');
    expect(v.elo.boardRegion).toBe('SoCal');
    const html = await renderTeam('poway');
    const text = textOf(html);
    expect(text).toContain('San Diego Section playoffs picture');
    expect(html).toContain('href="/leaders#elo-rating-socal"');
    expect(text).not.toMatch(/CCS|at-large|automatic qualifier|lowest-seeded|eliminat/i);
    const norcal = view.buildTeamPageView('leigh')!;
    expect(norcal.elo.boardHref).toBe('/leaders#elo-rating');
  });
});

describe('TeamPlayoffLine without a result (the EAL in the all-2026-10-02 corpus)', () => {
  it('names the Super Regional picture, not a playoff or a CCS one', async () => {
    const { TeamPlayoffLine } = await import('../../components/teams/TeamPlayoffLine');
    const lassen = view.buildTeamPageView('lassen')!;
    expect(lassen.hasResults, 'the all corpus holds no EAL league result').toBe(false);
    const text = textOf(renderToStaticMarkup(createElement(TeamPlayoffLine, { view: lassen })));
    expect(text, 'components/teams/TeamPlayoffLine.tsx').toContain(
      'Lassen has no counted EAL result, so it has no computed place in the Super Regional picture.',
    );
    expect(text, 'components/teams/TeamPlayoffLine.tsx').not.toContain('CCS');
    const mcal = textOf(renderToStaticMarkup(createElement(TeamPlayoffLine, {
      view: { ...view.buildTeamPageView('tamalpais')!, postseasonLine: null },
    })));
    expect(mcal, 'components/teams/TeamPlayoffLine.tsx MCAL').toContain('in the MCAL tournament picture.');
    const scval = textOf(renderToStaticMarkup(createElement(TeamPlayoffLine, {
      view: { ...view.buildTeamPageView('st-ignatius')!, postseasonLine: null },
    })));
    expect(scval, 'components/teams/TeamPlayoffLine.tsx SCVAL').toContain('in the playoff picture.');
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
    expect(await describeTeam('davis'), 'app/teams/[slug]/page.tsx EAL description').toMatch(
      /goal margins and Super Regional picture\.$/,
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
      // An LA independent (DESIGN §24.10, §24.11): the standings link reads 'LA standings', and its GP tile prints
      // the bare count, as the Sunset's does (no fixed schedule).
      if (leagues.isIndependentLeague(team.league)) {
        expect(text, `app/teams/[slug]/page.tsx ${team.slug} group link`).toContain('LA standings →');
        expect(v.context!.scheduled, `components/teams/team-view.ts ${team.slug} scheduled`).toBeNull();
        expect(text, `components/teams/TeamStatTiles.tsx ${team.slug} GP`).toMatch(new RegExp(`GP\\s*${v.context!.counted}\\b`));
        expect(html, `app/teams/[slug]/page.tsx ${team.slug}`).not.toContain('Gabilan');
        continue;
      }
      expect(text, `app/teams/[slug]/page.tsx ${team.slug} standings label`).toContain(`${v.league.shortName} standings`);
      // A league with no fixed schedule (the Sunset) prints the bare count: no "of N" (DESIGN-socal §2.1.7).
      if (v.context!.scheduled === null) {
        expect(text, `components/teams/TeamStatTiles.tsx ${team.slug} GP`).toMatch(new RegExp(`GP\\s*${v.context!.counted}\\b`));
        expect(text, `components/teams/TeamStatTiles.tsx ${team.slug} GP`).not.toMatch(/\/null|of null/);
      } else expect(text, `components/teams/TeamStatTiles.tsx ${team.slug} GP`).toContain(
        `${v.context!.counted}/${v.context!.scheduled}`,
      );
      // MAX is a total: a team with no league games left shows its final points, never points "still" to win.
      expect(text, `components/teams/TeamStatTiles.tsx ${team.slug} MAX`).not.toMatch(/still reachable/);
      if (v.context!.remaining === 0) {
        expect(text, `components/teams/TeamStatTiles.tsx ${team.slug} MAX`).toMatch(
          new RegExp(`Max\\s*${v.context!.maxPts}\\s*final league points`),
        );
      } else if (v.context!.remaining !== null) {
        expect(text, `components/teams/TeamStatTiles.tsx ${team.slug} MAX`).toContain('most points possible');
      }
      expect(html, `app/teams/[slug]/page.tsx ${team.slug}`).not.toContain('Gabilan');
      expect(html, `app/teams/[slug]/page.tsx ${team.slug} game links`).not.toMatch(/href="\/game\/sblive:/);
      if (team.league === 'pcal' || team.league === 'mcal') {
        expect(text, `app/teams/[slug]/page.tsx ${team.slug}: division label`).not.toMatch(/PCAL Division|MCAL Division/);
      }
    }
  });

  it('the margin strip spans the division\'s scheduled league games, never a phantom 14-game season', async () => {
    const PHONE_CELL = 'flex flex-col items-center min-w-3 max-w-14 flex-1';
    // A slate longer than 14 (MCAL's 16) takes the 20px desktop floor at a 24px pitch, so it fits
    // the 380px plot of a half-width card at 1024px (components/ui/MarginStrip.tsx).
    const desktopCell = (slots: number) =>
      `flex flex-col items-center ${slots > 14 ? 'min-w-5' : 'min-w-6'} max-w-14 flex-1`;
    let checked = 0;
    for (const division of leagues.ALL_DIVISIONS) {
      for (const team of data.getTeams(division.id)) {
        const v = view.buildTeamPageView(team.slug)!;
        if (!v.marginEntries.some((e) => e.margin !== null && !e.excludedFromMargin)) continue;
        const html = await renderTeam(team.slug);
        // A league with no fixed schedule (the Sunset, gamesPerTeam null) draws only the games it has.
        const slots = division.gamesPerTeam ?? v.marginEntries.length;
        const expected = Math.max(slots, v.marginEntries.length);
        const count = (cls: string) => html.split(`${cls}"`).length - 1;
        expect(count(PHONE_CELL), `app/teams/[slug]/page.tsx MarginStrip slots ${team.slug}`).toBe(expected);
        expect(count(desktopCell(slots)), `app/teams/[slug]/page.tsx MarginStrip slots ${team.slug}`).toBe(expected);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(30);
  });

  it('every page: the Elo card is the /leaders board’s rating and place, and names no place below its top 10', async () => {
    const { buildLeadersView } = await import('../../components/leaders/leaders-view');
    // One Elo board per region (DESIGN-socal §2.3): a team's place is on its own region's board, whose id
    // is `elo-rating` (NorCal) or `elo-rating-socal` (SoCal), and the card links that board.
    const regions = buildLeadersView().regions;
    const boardFor = (league: string) => {
      const region = leagues.regionOf(league);
      const r = regions.find((x) => x.region === region)!;
      return r.schools.find((b) => b.id === `elo-rating${r.idSuffix}`)!;
    };
    let rated = 0;
    for (const team of data.getTeams()) {
      const board = boardFor(team.league);
      const listed = new Map(board.rows.map((r) => [r.team.slug, r]));
      const { elo } = view.buildTeamPageView(team.slug)!;
      expect(elo.boardHref, `components/teams/team-view.ts ${team.slug}: board link`).toBe(`/leaders#${board.id}`);
      expect(elo.fitTeams, `components/teams/team-view.ts ${team.slug}: one fit`).toBe(data.getTeams().length);
      const html = await renderTeam(team.slug);
      const text = textOf(html);
      const row = listed.get(team.slug);
      // Collapsed: the summary says "Elo rating" and nothing else shows until the reader opens it.
      expect(html, `components/teams/TeamElo.tsx ${team.slug}: closed disclosure`).toMatch(
        /<details id="elo" class="sx-disclosure"><summary>Elo rating<\/summary>/,
      );
      expect(html, `components/teams/TeamElo.tsx ${team.slug}: method link`).toContain(`href="/leaders#${board.id}"`);
      if (row) {
        expect(elo.boardPlace, `components/teams/team-view.ts ${team.slug}`).toEqual({ rank: row.rank, tied: row.tied });
        expect(String(elo.elo), `components/teams/team-view.ts ${team.slug}`).toBe(row.cells[board.rankedBy].text);
        expect(text, `components/teams/TeamElo.tsx ${team.slug}`).toContain(
          `${row.tied ? 'tied for ' : ''}${ordinal(row.rank)} on the ${elo.boardRegion} Elo board`,
        );
      } else {
        expect(elo.boardPlace, `components/teams/team-view.ts ${team.slug}`).toBeNull();
        expect(text, `components/teams/TeamElo.tsx ${team.slug}`).not.toMatch(/on the \w+ Elo board/);
      }
      expect(elo.provisional, `components/teams/team-view.ts ${team.slug} provisional`).toBe(
        elo.elo !== null && elo.games > 0 && elo.games < elo.minGames,
      );
      expect(elo.preseason, `components/teams/team-view.ts ${team.slug} preseason`).toBe(elo.elo !== null && elo.games === 0);
      if (elo.elo !== null) {
        rated += 1;
        expect(text, `components/teams/TeamElo.tsx ${team.slug}`).toContain(`Elo rating ${elo.elo} points ·`);
      }
      if (elo.provisional) {
        expect(text, `components/teams/TeamElo.tsx ${team.slug}`).toContain(`provisional, from ${elo.games}`);
      }
    }
    expect(rated, 'components/teams/team-view.ts: the corpus rates most teams').toBeGreaterThan(30);
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
    for (const id of [
      'ccs', 'ncs', 'ns', 'scval', 'de-anza', 'el-camino', 'bval', 'mt-hamilton', 'santa-teresa', 'pcal', 'mcal', 'marin-county', 'eal',
      'ss', 'sds', 'sunset', 'city', 'city-western', 'city-eastern', 'north-county', 'avocado', 'palomar', 'valley', 'metro', 'metro-mesa',
      'metro-south-bay', 'independents', 'norcal', 'socal', 'team-list', 'team-league-switcher',
    ]) {
      expect(all, `app/teams/page.tsx #${id}`).toContain(id);
    }
    expect(html, 'app/teams/page.tsx CCS h2').toMatch(/<h2[^>]*>Central Coast Section<\/h2>/);
    expect(html, 'app/teams/page.tsx NCS h2').toMatch(/<h2[^>]*>North Coast Section<\/h2>/);
    expect(html, 'app/teams/page.tsx NS h2').toMatch(/<h2[^>]*>Northern Section<\/h2>/);
    expect(html, 'app/teams/page.tsx section labelling').toContain('<section aria-labelledby="ccs"');
    // Nine leagues and the LA independents (one table, so no h4: DESIGN §24.10).
    expect((html.match(/<h3[^>]*>/g) ?? []).length, 'app/teams/page.tsx league h3s').toBe(10);
    const h4s = [...html.matchAll(/<h4 class="m-0 mb-3 text-lead text-ink">([^<]+)<\/h4>/g)].map((m) => m[1]);
    expect(h4s, 'app/teams/page.tsx division h4s').toEqual([
      'De Anza', 'El Camino', 'Mt. Hamilton', 'Santa Teresa',
      'City Western', 'City Eastern', 'Avocado', 'Palomar', 'Valley', 'Metro Mesa', 'Metro South Bay',
    ]);
    // Region → section → league order; the regions are `<div id="norcal|socal" data-region-scope>`
    // inside #team-list (DESIGN-socal §2.4), so the finder's lift can show both while searching.
    expect(html, 'app/teams/page.tsx region wrappers').toMatch(/<div id="team-list"><div id="norcal" data-region-scope="norcal">/);
    expect(html, 'app/teams/page.tsx region wrappers').toContain('<div id="socal" data-region-scope="socal">');
    expect(html, 'app/teams/page.tsx lift hook').toContain('data-teams-page=""');
    const order = [
      'id="norcal"', 'id="ccs"', 'id="scval"', 'id="de-anza"', 'id="el-camino"', 'id="bval"', 'id="pcal"', 'id="ncs"', 'id="mcal"',
      'id="marin-county"', 'id="ns"', 'id="eal"', 'id="socal"', 'id="ss"', 'id="sunset"', 'id="independents"', 'id="sds"', 'id="city"',
      'id="north-county"', 'id="metro"',
    ].map((s) => html.indexOf(s));
    expect([...order].sort((a, b) => a - b), 'app/teams/page.tsx order').toEqual(order);
  });

  it('the finder hooks: 102 standings rows with data-team-tile, ladder rows, group wrappers, the switcher', () => {
    const html = renderIndex();
    // Every team is a row of its division's standings table (DESIGN §18), and the row is the
    // finder's hook: no <li> tiles any more.
    const rows = [...html.matchAll(/<tr data-team-slug="([^"]+)" data-team-tile="([^"]+)"/g)];
    expect(rows.length, 'components/standings/CompactStandingsTable.tsx data-team-tile').toBe(102);
    for (const [, slug, tile] of rows) expect(tile, slug).toBe(slug);
    expect(new Set(rows.map((m) => m[2])), 'app/teams/page.tsx every team').toEqual(new Set(data.getTeamSlugs()));
    expect(html, 'app/teams/page.tsx no tiles').not.toContain('<li data-team-tile');
    // The pinned row says so in words, not with the accent rule alone: every row's link carries the
    // hidden note the pinned-team CSS reveals (the old tiles did too).
    const links = [...html.matchAll(/<tr data-team-slug="[^"]+"[\s\S]*?<a [^>]*href="\/teams\/[^"]+"[^>]*>([\s\S]*?)<\/a>/g)];
    expect(links.length, 'components/standings/CompactStandingsTable.tsx row links').toBe(102);
    for (const [, inner] of links) {
      expect(inner, 'components/standings/CompactStandingsTable.tsx pin note').toContain(
        '<span class="sr-only"><span class="sx-pin-note" hidden="">Your team. </span></span>',
      );
    }
    // Sixteen tables, one per division, each in a group wrapper the finder can hide (5 sections, 9
    // leagues and the independents, 16 divisions; the independents' table is one of them, DESIGN §24.10).
    expect((html.match(/<table/g) ?? []).length, 'app/teams/page.tsx tables').toBe(16);
    expect((html.match(/data-team-group=""/g) ?? []).length, 'app/teams/page.tsx data-team-group').toBe(5 + 10 + 16);
    // A division with a ladder line drawn marks it, so a search never leaves it between rows.
    const lines = [...html.matchAll(/<tr data-hide-while-searching="">\s*<td colSpan="5"[^>]*>([^<]+)</g)].map((m) => m[1]);
    expect(lines.length, 'components/standings/CompactStandingsTable.tsx ladder rows').toBeGreaterThan(0);
    for (const label of lines) expect(label, 'ladder row label').toMatch(/line|host/i);
    // Each division links its full league table.
    for (const href of ['/standings/scval#de-anza', '/standings/bval#santa-teresa', '/standings/pcal#pcal', '/standings/mcal#marin-county', '/standings/eal#eal']) {
      expect(html, `app/teams/page.tsx ${href}`).toContain(`href="${href}"`);
    }
    expect(html, 'app/teams/page.tsx finder').toContain('<search');
    expect(html, 'app/teams/page.tsx switcher').toMatch(/<div id="team-league-switcher"[^>]*>\s*<nav/);
    const text = textOf(html);
    expect(text, 'app/teams/page.tsx description').toContain(
      'each in its division’s standings table. League and division alignment comes from each league’s official schedule; the EAL publishes none, so its six teams are the ones MaxPreps lists in its EAL table, less Red Bluff, which is not fielding a varsity team in 2026. In Southern California it comes from MaxPreps’ 2024-25 and 2025-26 Sunset tables for the Sunset, from the CIF-SDS 2026-27 League Alignment for City, North and Metro and from MaxPreps’ 2026-27 team pages and schedules (five Southern Section schools in no field hockey league, which play each other) for the LA independents.',
    );
    expect(text, 'app/teams/page.tsx description').toContain('All 102 girls varsity teams in ');
    expect(html, 'app/teams/page.tsx').not.toContain('Gabilan');
  });

  it('a row holds what the Table tab showed, and agrees with /standings', () => {
    const html = renderIndex();
    const heads = [...html.matchAll(/<thead[\s\S]*?<\/thead>/g)].map((m) => textOf(m[0]).replace(/\s+/g, ' ').trim());
    for (const head of heads) expect(head, 'app/teams/page.tsx table head').toBe('# Team GP W-L-T Pts');
    for (const slug of ['st-ignatius', 'leigh', 'stevenson', 'tamalpais']) {
      const s = data.getStandingFor(slug)!;
      const row = new RegExp(`<tr data-team-slug="${slug}"[\\s\\S]*?</tr>`).exec(html)![0];
      const cells = textOf(row).replace(/\s+/g, ' ');
      if (s.hasReportedResults) {
        expect(cells, slug).toContain(`${s.computed.w}-${s.computed.l}-${s.computed.t}`);
        expect(cells, slug).toContain(String(s.computed.pts));
      }
    }
  });

  it('links the club pages once, quietly, outside the list the finder filters', () => {
    const html = renderIndex();
    expect((html.match(/href="\/clubs"/g) ?? []).length, 'app/teams/page.tsx /clubs link').toBe(1);
    const link = html.indexOf('href="/clubs"');
    // After the whole list (its last group), not inside it: TeamFinder never hides it.
    expect(link, 'app/teams/page.tsx /clubs link').toBeGreaterThan(html.lastIndexOf('data-team-group=""'));
    expect(textOf(html), 'app/teams/page.tsx').toContain(
      'Club field hockey: the club teams page lists youth field hockey clubs and, for each, the players here a public page ties to it.',
    );
  });

  it('links the commitments page once, quietly, outside the list the finder filters', () => {
    const html = renderIndex();
    expect((html.match(/href="\/commits"/g) ?? []).length, 'app/teams/page.tsx /commits link').toBe(1);
    expect(html.indexOf('href="/commits"'), 'app/teams/page.tsx /commits link').toBeGreaterThan(
      html.lastIndexOf('data-team-group=""'),
    );
    expect(textOf(html), 'app/teams/page.tsx').toContain(
      'College commitments: the college commitments page lists the players here a public page says have committed to play in college, in field hockey or another sport.',
    );
  });
});

describe('the NEXT card and the identity place line (UI pass, league-aware)', () => {
  it('an opponent’s record line is scoped to its own league: never a division label for PCAL or MCAL', () => {
    const ranked = (league: string) =>
      data.getTeams({ league }).find((t) => data.getStandingFor(t.slug)?.hasReportedResults)!;
    const scval = ranked('scval');
    const mcal = ranked('mcal');
    const heading = leagues.divisionHeading(scval.division)!;
    expect(view.opponentRecordLine(scval, 'scval'), 'components/teams/team-view.ts same league').toMatch(
      new RegExp(` in ${heading}$`),
    );
    expect(view.opponentRecordLine(scval, 'bval'), 'components/teams/team-view.ts cross-league').toMatch(
      new RegExp(` in SCVAL ${heading}$`),
    );
    expect(view.opponentRecordLine(mcal, 'mcal')).toMatch(/ in MCAL$/);
    expect(view.opponentRecordLine(mcal, 'scval')).toMatch(/ in MCAL$/);
    expect(view.opponentRecordLine(undefined, 'scval')).toBeNull();
  });

  it('every team’s NEXT card: an earlier meeting is a real final, and MCAL cards carry no CCS concept', () => {
    for (const team of data.getTeams()) {
      const v = view.buildTeamPageView(team.slug)!;
      const card = v.nextCard;
      if (card.kind === 'game' && card.earlier) {
        expect(card.earlier.text, `components/teams/team-view.ts ${team.slug} earlier`).toMatch(
          /^Earlier: ((won|lost|tied) \d+–\d+|(credited with the win|lost) on a level \d+–\d+ score)/,
        );
      }
      if (card.kind !== 'none') expect(card.record ?? '').not.toContain('0-0-0');
      if (team.league === 'mcal' && card.kind !== 'none') {
        // The strings the card prints (the Team and Game objects it carries are data, not copy).
        const printed = [
          card.dateLabel,
          card.opponentName,
          card.record ?? '',
          ...(card.kind === 'game'
            ? [card.place ?? '', card.earlier?.text ?? '', ...card.chips.map((c) => c.label)]
            : []),
        ].join(' ');
        expect(printed, `components/teams/team-view.ts ${team.slug} nextCard`).not.toMatch(
          /\bCCS\b|automatic qualifier/i,
        );
      }
    }
  });

  it('the identity card states the place on its own line, T-prefixed when level', async () => {
    const { TeamIdentity } = await import('../../components/teams/TeamIdentity');
    const { ordinal } = await import('../../lib/format');
    let checked = 0;
    for (const team of data.getTeams()) {
      const v = view.buildTeamPageView(team.slug)!;
      if (!v.hasResults || !v.standing) continue;
      checked += 1;
      const html = renderToStaticMarkup(createElement(TeamIdentity, { view: v, knownSlugs: [] }));
      const text = textOf(html);
      const place = ordinal(v.standing.computed.place);
      const scope = view.placeScope(v.divisionSize, v.scopeLabel);
      expect(text, `components/teams/TeamIdentity.tsx ${team.slug} identity line`).toContain(v.identityLine);
      if (v.standing.tiebreak.shared) {
        expect(text, `components/teams/TeamIdentity.tsx ${team.slug} level place`).toContain(`T-${place}`);
        expect(text).toContain(`tied for ${place}`);
      } else {
        expect(text, `components/teams/TeamIdentity.tsx ${team.slug} place`).toContain(`${place} ${scope}`);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('the Place tile writes a level place the same way: T-prefixed value, "tied for" spoken', async () => {
    const { TeamStatTiles } = await import('../../components/teams/TeamStatTiles');
    const { ordinal } = await import('../../lib/format');
    let checked = 0;
    for (const team of data.getTeams()) {
      const v = view.buildTeamPageView(team.slug)!;
      if (!v.hasResults || !v.standing) continue;
      checked += 1;
      const text = textOf(renderToStaticMarkup(createElement(TeamStatTiles, { view: v })));
      const place = ordinal(v.standing.computed.place);
      expect(text, `components/teams/TeamStatTiles.tsx ${team.slug} sub`).not.toContain('(tied)');
      if (v.standing.tiebreak.shared) {
        expect(text, `components/teams/TeamStatTiles.tsx ${team.slug} level place`).toContain(`T-${place}`);
        expect(text, `components/teams/TeamStatTiles.tsx ${team.slug} spoken`).toContain(`tied for ${place}`);
      } else {
        expect(text, `components/teams/TeamStatTiles.tsx ${team.slug} place`).not.toContain(`T-${place}`);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('the Max tile reads as a total: final points with no games left, never points "still" to win', async () => {
    const { TeamStatTiles } = await import('../../components/teams/TeamStatTiles');
    // The corpus is mid-season, so every branch is forced on one team's view: a finished team
    // (Cupertino, 12/12 on 2026-10-29), one with games left, and a league with no fixed schedule.
    const base = data.getTeams()
      .map((team) => view.buildTeamPageView(team.slug)!)
      .find((v) => v.hasResults && v.context?.scheduled != null)!;
    const ctx = base.context!;
    const render = (context: typeof ctx) =>
      textOf(renderToStaticMarkup(createElement(TeamStatTiles, { view: { ...base, context } })));
    const finished = render({ ...ctx, counted: ctx.scheduled!, remaining: 0, maxPts: 2 });
    expect(finished, 'components/teams/TeamStatTiles.tsx finished').toMatch(/Max\s*2\s*final league points/);
    expect(finished, 'components/teams/TeamStatTiles.tsx finished').toContain('no league games left');
    const open = render({ ...ctx, counted: ctx.scheduled! - 2, remaining: 2, maxPts: 8 });
    expect(open, 'components/teams/TeamStatTiles.tsx games left').toMatch(/Max\s*8\s*most points possible/);
    const unscheduled = render({ ...ctx, scheduled: null, remaining: null, maxPts: null });
    expect(unscheduled, 'components/teams/TeamStatTiles.tsx no schedule').toContain('no fixed league schedule');
    for (const text of [finished, open, unscheduled]) expect(text).not.toMatch(/still reachable/);
  });

  it('the Splits card never prints 0-0-0 for a venue with no league games', async () => {
    const { TeamSplits } = await import('../../components/teams/TeamSplits');
    let empty = 0;
    for (const team of data.getTeams()) {
      const v = view.buildTeamPageView(team.slug)!;
      const text = textOf(renderToStaticMarkup(createElement(TeamSplits, { view: v })));
      expect(text, `components/teams/TeamSplits.tsx ${team.slug}`).not.toContain('0-0-0');
      const league = v.hasResults && v.standing ? v.standing.computed : null;
      if (!league) continue;
      const splits = [
        [league.homeRecord, 'no home league games'],
        [league.awayRecord, 'no away league games'],
        [league.neutralRecord, 'no neutral-site league games'],
      ] as const;
      for (const [record, words] of splits) {
        if (record.w + record.l + record.t > 0) continue;
        empty += 1;
        expect(text, `components/teams/TeamSplits.tsx ${team.slug} empty split`).toContain(words);
      }
    }
    expect(empty, 'the corpus has an empty split to check').toBeGreaterThan(0);
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

  it('the Elo card rates the team from last season alone, as preseason, and keeps it off the board', async () => {
    const v = zeroed.v.buildTeamPageView(slug)!;
    expect(v.elo, 'components/teams/team-view.ts elo gp 0').toMatchObject({
      games: 0,
      preseason: true,
      provisional: false,
      boardPlace: null,
      seededFrom: '2025-26',
    });
    expect(v.elo.elo, 'components/teams/team-view.ts elo gp 0').not.toBeNull();
    expect(v.elo.seeded, 'components/teams/team-view.ts elo gp 0: its own start').toBe(true);
    const text = textOf(await zeroed.renderTeam(slug));
    expect(text, 'components/teams/TeamElo.tsx gp 0').toContain(`Elo rating ${v.elo.elo} points · preseason, from 2025-26`);
    expect(text, 'components/teams/TeamElo.tsx gp 0').toContain('No counted result this season yet, so this is where it starts');
  });

  it('the Elo card says where THIS team started: its own rating from last season, or average', async () => {
    const { TeamElo } = await import('../../components/teams/TeamElo');
    const view = zeroed.v.buildTeamPageView(slug)!.elo;
    const played = { ...view, elo: 1600, games: 8, preseason: false, provisional: false, boardPlace: null };
    const seeded = textOf(renderToStaticMarkup(createElement(TeamElo, { elo: { ...played, seeded: true } })));
    expect(seeded, 'components/teams/TeamElo.tsx seeded').toContain('It started the season from its 2025-26 rating');
    // A program new to the registry: no 2025-26 rating, though every other team has one.
    const fresh = textOf(renderToStaticMarkup(createElement(TeamElo, { elo: { ...played, seeded: false } })));
    // "Counted": last season's forfeits, unscored finals and games against outside schools are not
    // in the file, so a team can have played and still have no start.
    expect(fresh, 'components/teams/TeamElo.tsx unseeded').toContain('It had no counted 2025-26 game against the nine leagues’ teams and the Southern Section’s five independents, so it started from an average rating.');
    expect(fresh, 'components/teams/TeamElo.tsx unseeded').not.toContain('from its 2025-26 rating');
  });

  it('the Elo card says a team with no rating at all is not rated, never a 1500 it has not earned', async () => {
    const { TeamElo } = await import('../../components/teams/TeamElo');
    const view = zeroed.v.buildTeamPageView(slug)!.elo;
    const unrated = { ...view, elo: null, preseason: false, provisional: false, boardPlace: null };
    const text = textOf(renderToStaticMarkup(createElement(TeamElo, { elo: unrated })));
    expect(text, 'components/teams/TeamElo.tsx unrated').toContain('Elo rating Not rated · no counted results yet');
    expect(text, 'components/teams/TeamElo.tsx unrated').toContain('A rating needs at least one completed game');
    expect(text, 'components/teams/TeamElo.tsx unrated').not.toContain('1500 is an average team');
  });

  it('the identity card prints no place line at all (never an em dash in a sentence)', async () => {
    const { TeamIdentity } = await import('../../components/teams/TeamIdentity');
    const v = zeroed.v.buildTeamPageView(slug)!;
    const text = textOf(renderToStaticMarkup(createElement(TeamIdentity, { view: v, knownSlugs: [] })));
    expect(text, 'components/teams/TeamIdentity.tsx gp 0').toContain(v.identityLine);
    expect(text, 'components/teams/TeamIdentity.tsx gp 0: place line').not.toContain(
      zeroed.v.placeScope(v.divisionSize, v.scopeLabel),
    );
  });
});

/** The calendar day before a 'YYYY-MM-DD' key, by UTC arithmetic (no clock, no time zone). */
function dayBefore(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Invariants over the corpus snapshot, checked for every registry team in all five leagues rather
// than pinned per team, so a corpus refresh that moves a game keeps them meaningful.
// `buildNextCard` takes `today` as a parameter, so the Today label is tested without the clock.
describe('buildNextCard (components/teams/team-view.ts)', () => {
  it("labels the next game 'Today · ' only on its own day", () => {
    let checked = 0;
    for (const team of data.getTeams()) {
      const v = view.buildTeamPageView(team.slug)!;
      const next = v.next;
      if (!next || next.isDateTba) continue;
      checked += 1;
      const onDay = view.buildNextCard(team, next, [], next.dateKey, v.league);
      const dayAhead = view.buildNextCard(team, next, [], dayBefore(next.dateKey), v.league);
      expect(onDay.kind, `components/teams/team-view.ts ${team.slug}`).toBe('game');
      if (onDay.kind === 'none' || dayAhead.kind === 'none') continue;
      expect(onDay.dateLabel.startsWith('Today \u00b7 '), `components/teams/team-view.ts ${team.slug}`).toBe(true);
      expect(dayAhead.dateLabel.startsWith('Today'), `components/teams/team-view.ts ${team.slug}`).toBe(false);
    }
    expect(checked, 'the corpus has upcoming games to label').toBeGreaterThan(0);
  });

  it('prints no place when the sources disagree on the host and no venue is named', () => {
    // The corpus may or may not hold such a game; when it has none the assertion holds vacuously.
    const conflicted = data.getGames().filter((g) => g.provenance.hostConflict && !g.venue.name);
    for (const game of conflicted) {
      for (const slug of [game.home.slug, game.away.slug]) {
        const team = slug ? data.getTeamBySlug(slug) : undefined;
        if (!team) continue;
        const card = view.buildNextCard(team, game, [], game.dateKey, view.leagueCopy(team.league));
        expect(card.kind === 'game' ? card.place : 'not a game card', `components/teams/team-view.ts ${game.contestId}`).toBeNull();
      }
    }
  });

  it('names an official-only fixture dated before the next contest, and only one dated before it', () => {
    let checked = 0;
    for (const team of data.getTeams()) {
      const v = view.buildTeamPageView(team.slug)!;
      const next = v.next;
      if (!next || next.isDateTba) continue;
      // A league with no official schedule (`official.mode` 'none') has no fixtures to name.
      const official = leagues.getDivision(team.division).official;
      if (official.mode === 'none') continue;
      checked += 1;
      // A fixture of the team's own league, at home against a school outside the registry, so the
      // card must fall back to the schedule's own spelling of the opponent.
      const fixture = (dateKey: string, time: string | null = null) => ({
        id: `${team.division}:${dateKey}:Visitors@${team.slug}`,
        league: team.league,
        division: team.division,
        dateKey,
        time,
        awayName: 'Visitors',
        homeName: team.name,
        awaySlug: null,
        homeSlug: team.slug,
        source: official.source,
      });
      const today = dayBefore(dayBefore(next.dateKey));
      const before = view.buildNextCard(team, next, [fixture(dayBefore(next.dateKey))], today, v.league);
      expect(before.kind === 'game' ? before.officialBefore : null, `components/teams/team-view.ts ${team.slug}`).toEqual({
        dateLabel: expect.any(String),
        timeLabel: null,
        versus: 'vs',
        opponentName: 'Visitors',
      });
      // A league that publishes the start time (PCAL, BVAL): the card names it.
      const timed = view.buildNextCard(team, next, [fixture(dayBefore(next.dateKey), '16:00')], today, v.league);
      expect(timed.kind === 'game' ? timed.officialBefore?.timeLabel : null, `components/teams/team-view.ts ${team.slug}`).toBe('4:00 PM PT');
      const sameDay = view.buildNextCard(team, next, [fixture(next.dateKey)], today, v.league);
      expect(sameDay.kind === 'game' ? sameDay.officialBefore : 'not a game card', `components/teams/team-view.ts ${team.slug}`).toBeNull();
    }
    expect(checked, 'the corpus has upcoming games').toBeGreaterThan(0);
  });
});

describe('fixtureOpponent (components/teams/team-view.ts)', () => {
  it('names a registered opponent by short name and title-cases a grid name outside the registry', () => {
    const team = data.getTeams()[0];
    const base = {
      id: `${team.division}:2026-10-20:x@${team.slug}`,
      league: team.league,
      division: team.division,
      dateKey: '2026-10-20',
      time: null,
      homeName: team.name.toUpperCase(),
      homeSlug: team.slug,
      source: 'scval-pdf' as const,
    };
    const outside = view.fixtureOpponent({ ...base, awayName: 'VALLEY CHRISTIAN', awaySlug: null }, team);
    expect(outside).toMatchObject({ mineIsHome: true, versus: 'vs', opponent: undefined, opponentName: 'Valley Christian' });
    expect(view.officialFixtureHeadline({ ...base, awayName: 'VALLEY CHRISTIAN', awaySlug: null }, team)).toMatch(
      /^vs Valley Christian · /,
    );
    const rival = data.getTeams().find((t) => t.slug !== team.slug)!;
    const away = view.fixtureOpponent({ ...base, awayName: 'X', awaySlug: rival.slug }, rival);
    expect(away).toMatchObject({ mineIsHome: false, versus: 'at', opponentName: team.shortName });
  });
});

describe('opponentRecordLine (components/teams/team-view.ts)', () => {
  it('prints nothing for an opponent outside the registry, whichever league is asking', () => {
    for (const league of leagues.LEAGUES) {
      expect(view.opponentRecordLine(undefined, league.id), `components/teams/team-view.ts ${league.id}`).toBeNull();
    }
  });

  it("reads 'W-L-T · [tied ]Nth in <scope>' from its own league, 'tied' exactly when the place is shared", () => {
    for (const team of data.getTeams()) {
      const line = view.opponentRecordLine(team, team.league);
      if (line === 'no league results yet') continue;
      // An independent has no place: its overall record and the group's short name (DESIGN §24.9).
      if (leagues.isIndependentLeague(team.league)) {
        expect(line, `components/teams/team-view.ts ${team.slug}`).toMatch(/^(\d+-\d+-\d+ overall \u00b7 LA|no results yet)$/);
        continue;
      }
      const scope = leagues.divisionHeading(team.division) ?? leagues.getLeague(team.league).shortName;
      const m = /^\d+-\d+-\d+ \u00b7 (tied )?\d+(?:st|nd|rd|th) in (.+)$/.exec(line ?? '');
      expect(m, `components/teams/team-view.ts ${team.slug}: ${line}`).not.toBeNull();
      if (!m) continue;
      expect(m[2], `components/teams/team-view.ts ${team.slug} scope`).toBe(scope);
      const standing = data.getStandingFor(team.slug);
      expect(m[1] === 'tied ', `components/teams/team-view.ts ${team.slug} tied`).toBe(standing?.tiebreak.shared ?? false);
    }
  });
});

describe('earlierMeeting (components/teams/team-view.ts)', () => {
  it('recalls only a final played before the next game', () => {
    for (const team of data.getTeams()) {
      const next = view.buildTeamPageView(team.slug)?.next;
      if (!next) continue;
      const side = next.home.slug === team.slug ? next.away : next.home;
      const opponent = side.slug ? data.getTeamBySlug(side.slug) : undefined;
      const earlier = view.earlierMeeting(team, opponent, next.dateLocal);
      if (!earlier) continue;
      const game = data.getGameById(earlier.contestId);
      expect(game?.status, `components/teams/team-view.ts ${team.slug}`).toBe('final');
      expect(game !== undefined && game.dateLocal < next.dateLocal, `components/teams/team-view.ts ${team.slug}`).toBe(true);
    }
  });
});

describe('"Who we haven’t beaten" official-only fixtures (components/teams/team-view.ts buildUnbeaten)', () => {
  it('counts only past-dated fixtures as unreported, and carries the next future one as a date', () => {
    for (const team of data.getTeams()) {
      const v = view.buildTeamPageView(team.slug);
      if (!v) continue;
      const fixtures = data.getOfficialFixtures({ slug: team.slug });
      for (const o of v.unbeaten) {
        const theirs = fixtures.filter((f) => f.awaySlug === o.slug || f.homeSlug === o.slug);
        const past = theirs.filter((f) => f.dateKey < v.today);
        const ahead = theirs.filter((f) => f.dateKey >= v.today).map((f) => f.dateKey).sort();
        expect(o.unreportedFixtures, `components/teams/team-view.ts ${team.slug} v ${o.slug}`).toBe(past.length);
        expect(o.nextFixtureDate, `components/teams/team-view.ts ${team.slug} v ${o.slug}`).toBe(ahead[0] ?? null);
      }
    }
  });

  it('orders rows by the date each one shows, official-only fixtures included', () => {
    for (const team of data.getTeams()) {
      const v = view.buildTeamPageView(team.slug);
      if (!v) continue;
      const shown = v.unbeaten.map((o) => o.nextDate ?? o.nextFixtureDate);
      const dated = shown.filter((d): d is string => d !== null);
      expect(dated, `components/teams/team-view.ts ${team.slug}`).toEqual([...dated].sort());
      expect(shown.slice(0, dated.length), `components/teams/team-view.ts ${team.slug}`).toEqual(dated);
    }
  });

  it('says "next <date>" for a future fixture and "N unreported" only for a past one', async () => {
    const { TeamUnbeaten } = await import('../../components/teams/TeamUnbeaten');
    const base = view.buildTeamPageView('carmel')!;
    const opponent = (slug: string, extra: Partial<import('../../components/teams/team-view').UnbeatenOpponent>) => {
      const t = data.getTeamBySlug(slug)!;
      return {
        slug: t.slug,
        name: t.name,
        shortName: t.shortName,
        record: { w: 0, l: 1, t: 0 },
        played: 1,
        remaining: 0,
        nextDate: null,
        unreportedFixtures: 0,
        nextFixtureDate: null,
        ...extra,
      };
    };
    const short = base.league.shortName;
    const render = (unbeaten: ReturnType<typeof opponent>[]) =>
      renderToStaticMarkup(createElement(TeamUnbeaten, { view: { ...base, unbeaten } }));
    const others = data.getTeams(base.team.division).filter((t) => t.slug !== base.team.slug);

    // Future only: the date, never "unreported", and no footnote about unreported meetings.
    const future = render([opponent(others[0].slug, { nextFixtureDate: '2026-10-14' })]);
    expect(textOf(future), 'components/teams/TeamUnbeaten.tsx future').toContain('next Oct 14');
    expect(future, 'components/teams/TeamUnbeaten.tsx future').not.toContain('unreported');
    expect(future, 'components/teams/TeamUnbeaten.tsx future sentence').toContain(
      `next meeting Oct 14 on ${short}’s schedule`,
    );

    // One past and one future: the future date leads, and since no row then reads "unreported",
    // there is no footnote explaining the word.
    const mixed = render([opponent(others[0].slug, { nextFixtureDate: '2026-10-14', unreportedFixtures: 1 })]);
    expect(textOf(mixed), 'components/teams/TeamUnbeaten.tsx mixed').toContain('next Oct 14');
    expect(mixed, 'components/teams/TeamUnbeaten.tsx mixed footnote').not.toContain('An “unreported” meeting');

    // Past only: "N unreported" and the footnote.
    const past = render([opponent(others[0].slug, { unreportedFixtures: 2 })]);
    expect(textOf(past), 'components/teams/TeamUnbeaten.tsx past').toContain('2 unreported');
    expect(past, 'components/teams/TeamUnbeaten.tsx past sentence').toContain(
      `2 scheduled per ${short} with no result reported`,
    );
  });
});
