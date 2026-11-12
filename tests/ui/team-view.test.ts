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

import { readFileSync } from 'node:fs';

import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { ordinal } from '../../lib/format';
import type { Snapshot } from '../../lib/types';
import { corpusSnapshotPath, writeTempSnapshot } from '../helpers';
// textOf: the `<main>`-equivalent text of a page (the page component renders no layout).
import { textOf } from './html-text';

type Data = typeof import('../../lib/data');
type Leagues = typeof import('../../lib/leagues');
type View = typeof import('../../components/teams/team-view');
type Schedule = typeof import('../../components/teams/team-schedule');
type Headlines = typeof import('../../components/teams/team-headlines');
type Line = typeof import('../../components/playoffs/team-postseason-line');

const priorEnv = process.env.SCVAL_SNAPSHOT;
let corpusPath: string;
let data: Data;
let dataLine: Line;
let leagues: Leagues;
let view: View;
let schedule: Schedule;
let headlines: Headlines;
let renderTeam: (slug: string) => Promise<string>;
let renderIndex: () => string;
let describeTeam: (slug: string) => Promise<string | undefined>;

async function loadModules() {
  vi.resetModules();
  const d = await import('../../lib/data');
  const pl = await import('../../components/playoffs/team-postseason-line');
  const l = await import('../../lib/leagues');
  const v = await import('../../components/teams/team-view');
  const ts = await import('../../components/teams/team-schedule');
  const th = await import('../../components/teams/team-headlines');
  const teamPage = await import('../../app/teams/[slug]/page');
  const indexPage = (await import('../../app/teams/page')).default;
  return {
    d,
    pl,
    l,
    v,
    ts,
    th,
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
  dataLine = m.pl;
  leagues = m.l;
  view = m.v;
  schedule = m.ts;
  headlines = m.th;
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
    // The timeless words name the seeding meeting's day; never "as soon as CCS publishes the bracket".
    expect(scval.bracketSentence).toBe('CCS seeds the field on Mon Nov 2; we list each CCS game as MaxPreps posts it.');
    expect(view.leagueCopy('bval').seasonEndSentence).toBe(
      'The BVAL league season ends Fri Oct 30 and the BVAL play-in is Sat Oct 31.',
    );
    const mcal = view.leagueCopy('mcal');
    // The tournament starts with its first round that is always played: the quarterfinals, not the optional play-in.
    expect(mcal.seasonEndSentence).toBe('The MCAL league season ends Thu Oct 22 and the MCAL tournament starts Mon Oct 26.');
    expect(mcal.bracketSentence).toBe('We will list a playoff game as soon as MCAL posts the bracket.');
    expect(view.leagueCopy('pcal').bracketSentence).toBe('CCS seeds the field on Mon Nov 2; we list each CCS game as MaxPreps posts it.');
  });

  it('a CCS league reads the day: the crossover "runs" while under way, "was" once its window is over, and CCS "seeded" from the meeting', () => {
    // On its first day it "is"; once a day of it has passed it "runs" (never told as all to come).
    expect(view.leagueCopy('scval', '2026-10-29').seasonEndSentence).toBe(
      'The SCVAL league season ended Wed Oct 28 and the SCVAL crossover is Thu Oct 29 and Fri Oct 30.',
    );
    expect(view.leagueCopy('scval', '2026-10-30').seasonEndSentence).toBe(
      'The SCVAL league season ended Wed Oct 28 and the SCVAL crossover runs Thu Oct 29 and Fri Oct 30.',
    );
    expect(view.leagueCopy('scval', '2026-10-31').seasonEndSentence).toBe(
      'The SCVAL league season ended Wed Oct 28 and the SCVAL crossover was Thu Oct 29 and Fri Oct 30.',
    );
    expect(view.leagueCopy('bval', '2026-11-01').seasonEndSentence).toBe(
      'The BVAL league season ended Fri Oct 30 and the BVAL play-in was Sat Oct 31.',
    );
    expect(view.leagueCopy('pcal', '2026-11-01').bracketSentence).toBe(
      'CCS seeds the field on Mon Nov 2; we list each CCS game as MaxPreps posts it.',
    );
    expect(view.leagueCopy('pcal', '2026-11-02').bracketSentence).toBe(
      'CCS seeded the field on Mon Nov 2; we list each CCS game as MaxPreps posts it.',
    );
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

describe('postseason lines per kind (components/playoffs/team-postseason-line.ts getTeamPostseasonLine via team-view)', () => {
  it('CCS ladder leagues link the CCS page; MCAL links its tournament; the EAL states its Super Regional; no CCS sentence outside CCS', () => {
    for (const team of data.getTeams()) {
      const v = view.buildTeamPageView(team.slug)!;
      const line = v.postseasonLine;
      if (!v.hasResults) continue;
      expect(line, `components/playoffs/team-postseason-line.ts getTeamPostseasonLine ${team.slug}`).not.toBeNull();
      if (!line) continue;
      if (v.league.postseasonKind === 'ccs-ladder') {
        // A team with a crossover or play-in still to play goes straight to its league's pairing cards.
        expect(line.href, `components/playoffs/team-postseason-line.ts ${team.slug} href`).toBe(
          schedule.inOpenPairing(team, v.today) ? `/playoffs#${team.league}-pairings` : `/playoffs#${team.league}`,
        );
        expect(line.linkText, `components/playoffs/team-postseason-line.ts ${team.slug} link`).toBe('CCS playoffs');
      } else if (v.league.postseasonKind === 'unbracketed-tournament') {
        expect(line.href, `components/playoffs/team-postseason-line.ts ${team.slug} href`).toBe(`/playoffs#${team.league}`);
        expect(line.linkText, `components/playoffs/team-postseason-line.ts ${team.slug} link`).toBe('Postseason');
        expect(line.sentence, `components/playoffs/team-postseason-line.ts ${team.slug} sentence`).toBe(
          'The top six schools play the Super Regional, Oct 30–31, and every EAL team is one of the six; the NFHS Network’s CIFNS listing has the games at Pleasant Valley High School, Chico on Sat Oct 31.',
        );
        expect(`${line.label} ${line.sentence}`, `components/playoffs/team-postseason-line.ts ${team.slug}`).not.toMatch(/CCS|at-large|automatic qualifier|seed/i);
      } else if (v.league.postseasonKind === 'no-postseason' || v.league.postseasonKind === 'section-playoffs') {
        // The Southern California kinds: their cards on /playoffs, never a CCS or "top N" word.
        expect(line.href, `components/playoffs/team-postseason-line.ts ${team.slug} href`).toBe(`/playoffs#${team.league}`);
        expect(`${line.label} ${line.sentence}`, `components/playoffs/team-postseason-line.ts ${team.slug}`).not.toMatch(/CCS|at-large|automatic qualifier|top \w+ (make|qualify)/i);
      } else {
        expect(line.href, `components/playoffs/team-postseason-line.ts ${team.slug} href`).toBe('/playoffs/mcal');
        expect(line.linkText, `components/playoffs/team-postseason-line.ts ${team.slug} link`).toBe('MCAL tournament');
        expect(line.sentence, `components/playoffs/team-postseason-line.ts ${team.slug} sentence`).toBe(
          'Top six make the MCAL tournament: quarterfinals Mon Oct 26 (a play-in Fri Oct 23 only if needed), final Fri Oct 30 at Tamalpais; seeds 1-2 get byes to the semifinals.',
        );
        expect(`${line.label} ${line.sentence}`, `components/playoffs/team-postseason-line.ts ${team.slug}`).not.toMatch(/CCS|at-large|automatic qualifier/i);
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
    expect(mcal, 'components/teams/TeamPlayoffLine.tsx MCAL').toMatch(/>MCAL tournament\s*<\/a>/);
    // The trailing arrow is retired (components/ui/Arrow.tsx renders nothing, DESIGN §33).
    expect(mcal, 'components/teams/TeamPlayoffLine.tsx MCAL').not.toContain('→');
    expect(mcal, 'components/teams/TeamPlayoffLine.tsx MCAL').not.toContain('CCS');
    const scval = renderToStaticMarkup(createElement(TeamPlayoffLine, { view: view.buildTeamPageView('st-ignatius')! }));
    expect(scval, 'components/teams/TeamPlayoffLine.tsx SCVAL').toMatch(/>CCS playoffs\s*<\/a>/);
    expect(scval, 'components/teams/TeamPlayoffLine.tsx SCVAL').not.toContain('→');
    expect(scval, 'components/teams/TeamPlayoffLine.tsx SCVAL').toContain('Official CCS bracket');
  });
});

describe('Southern California team pages (DESIGN-socal §2.4)', () => {
  it('league copy: the Sunset has no playoffs to promise; a San Diego league waits for the Section', () => {
    const sunset = view.leagueCopy('sunset');
    expect(sunset.postseasonKind).toBe('no-postseason');
    expect(sunset.postseasonName).toBeNull();
    expect(sunset.seasonEndSentence).toBe('The Sunset season ends Sat Oct 31.');
    expect(sunset.bracketSentence).toMatch(/^The Sunset’s postseason is the Tournament of Champions, Oct 22–29, which it shares with the LA independents\./);
    const city = view.leagueCopy('city');
    expect(city.postseasonKind).toBe('section-playoffs');
    expect(city.postseasonName).toBe('San Diego Section playoffs');
    expect(city.seasonEndSentence).toBe('The City league season ends Fri Oct 30; the San Diego Section playoffs follow, Nov 2–14.');
    expect(city.bracketSentence).toBe('We will list a playoff game as soon as it is on the schedule; the Section posts its brackets on its field hockey page after its Sat Oct 31 seeding meeting.');
    expect(city.classification).toBe('membership');
  });

  it('the honesty line is the accessor’s: a CCS ladder is projected, a tournament still read from the table too', async () => {
    expect(dataLine.getTeamPostseasonLine('saint-francis')!.caveat).toBe('Projected from the table today; nothing here is official.');
    expect(textOf(await renderTeam('saint-francis'))).toContain('Projected from the table today; nothing here is official.');
    // The corpus snapshot predates the MCAL tournament, so its picture is still a projection from the table.
    expect(data.getLeagueTournament('mcal').status).toBe('projected');
    expect(dataLine.getTeamPostseasonLine('redwood')!.caveat).toBe('Projected from the table today; nothing here is official.');
  });

  it('a Sunset page: kicker "Postseason", the league note whatever it has played, no projection, GP bare', async () => {
    const v = view.buildTeamPageView('huntington-beach')!;
    expect(v.leagueScheduled, 'components/teams/team-view.ts no fixed schedule').toBeNull();
    expect(v.postseasonLine?.href).toBe('/playoffs#toc');
    const text = textOf(await renderTeam('huntington-beach'));
    expect(text).toContain('Postseason');
    expect(text).toContain('In the Tournament of Champions');
    expect(text).toContain('The Sunset’s postseason is the Tournament of Champions');
    expect(text).not.toContain('No section playoffs');
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
  it('says one plain line, under the Super Regional picture heading, with no CCS word', async () => {
    const { TeamPlayoffLine } = await import('../../components/teams/TeamPlayoffLine');
    const lassen = view.buildTeamPageView('lassen')!;
    expect(lassen.hasResults, 'the all corpus holds no EAL league result').toBe(false);
    // ONE line (DESIGN §33); the section's heading on the page names the picture it has no place in.
    const html = renderToStaticMarkup(createElement(TeamPlayoffLine, { view: lassen }));
    expect(html, 'components/teams/TeamPlayoffLine.tsx').toBe('<p class="sx-empty">No results reported yet.</p>');
    const page = await renderTeam('lassen');
    expect(page, 'app/teams/[slug]/page.tsx heading').toMatch(/<h2 id="postseason-heading">Super Regional picture<\/h2>/);
    expect(textOf(page.slice(page.indexOf('id="postseason"'))), 'app/teams/[slug]/page.tsx').not.toContain('CCS');
    for (const slug of ['tamalpais', 'st-ignatius']) {
      const text = textOf(renderToStaticMarkup(createElement(TeamPlayoffLine, {
        view: { ...view.buildTeamPageView(slug)!, postseasonLine: null },
      })));
      expect(text.trim(), `components/teams/TeamPlayoffLine.tsx ${slug}`).toBe('No results reported yet.');
    }
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

  it('every page: league line, record figures, standings link, never 0-0 for a missing score', async () => {
    const { leagueLine } = await import('../../components/teams/TeamIdentity');
    const { recordString } = await import('../../lib/format');
    for (const team of data.getTeams()) {
      const v = view.buildTeamPageView(team.slug)!;
      const html = await renderTeam(team.slug);
      const text = textOf(html);
      // ONE plain line under the name: the league and division (DESIGN §33).
      expect(html, `components/teams/TeamIdentity.tsx ${team.slug}`).toContain(
        `<div class="sx-pagehead-meta">${leagueLine(v).replace(/&/g, '&amp;')}</div>`,
      );
      expect((html.match(/<h1/g) ?? []).length, `app/teams/[slug]/page.tsx ${team.slug}: one h1`).toBe(1);
      expect(html, `app/teams/[slug]/page.tsx ${team.slug} standings`).toContain(`href="${v.standingsHref}"`);
      expect(html, `app/teams/[slug]/page.tsx ${team.slug} standings link`).toMatch(/>Full standings<\/a>/);
      // The rail's table is headed by the division, or the league's own label where it has one table
      // ('MCAL standings'; 'LA standings' for the independents, DESIGN §24.10).
      const heading = v.divisionHeading ? `${v.divisionHeading} standings` : v.standingsLabel;
      expect(html, `app/teams/[slug]/page.tsx ${team.slug} standings heading`).toContain(
        `<h2 id="standings-heading">${heading}</h2>`,
      );
      if (leagues.isIndependentLeague(team.league)) expect(heading).toBe('LA standings');
      // This team's row is the bold one.
      expect(html, `app/teams/[slug]/page.tsx ${team.slug} self row`).toMatch(
        new RegExp(`<tr data-team-slug="${team.slug}"[^>]*class="[^"]*sx-self`),
      );
      // The record as figures: the league record, exactly as the table has it; no figures without results.
      if (v.hasResults && v.standing) {
        expect(html, `components/teams/TeamIdentity.tsx ${team.slug} figures`).toContain(
          `<dt>League</dt><dd>${recordString(v.standing.computed)}</dd>`,
        );
      } else {
        expect(html, `components/teams/TeamIdentity.tsx ${team.slug} no figures`).not.toContain('sx-figures');
      }
      expect(text, `app/teams/[slug]/page.tsx ${team.slug}`).not.toMatch(/\b0-0-0\b|\/null|of null/);
      expect(html, `app/teams/[slug]/page.tsx ${team.slug}`).not.toContain('Gabilan');
      expect(html, `app/teams/[slug]/page.tsx ${team.slug} game links`).not.toMatch(/href="\/game\/sblive:/);
      if (team.league === 'pcal' || team.league === 'mcal') {
        expect(text, `app/teams/[slug]/page.tsx ${team.slug}: division label`).not.toMatch(/PCAL Division|MCAL Division/);
      }
      // The four section anchors the sticky tabs point at are on every page.
      for (const id of ['schedule', 'standings', 'roster', 'player-stats']) {
        expect(html, `app/teams/[slug]/page.tsx ${team.slug} #${id}`).toMatch(new RegExp(`<section id="${id}"`));
        expect(html, `app/teams/[slug]/page.tsx ${team.slug} tab ${id}`).toContain(`<a href="#${id}" class="sx-tab">`);
      }
      expect(html, `app/teams/[slug]/page.tsx ${team.slug}: no card, pill or badge`).not.toMatch(/\bsx-(card|pill|badge|flag|lift|bleed|flush)\b/);
    }
  });

  it('the schedule is ONE log: every game of the team, oldest first, non-league rows marked', async () => {
    let checked = 0;
    for (const team of data.getTeams()) {
      const v = view.buildTeamPageView(team.slug)!;
      const html = await renderTeam(team.slug);
      const at = html.indexOf('<section id="schedule"');
      const section = html.slice(at, html.indexOf('</section>', at));
      const all = [...v.leagueLog, ...v.nonLeagueLog];
      const hrefs = [...section.matchAll(/<a [^>]*href="\/game\/([^"]+)"/g)].map((m) => m[1]);
      expect(hrefs.length, `app/teams/[slug]/page.tsx ${team.slug} schedule rows`).toBe(all.length);
      const byId = new Map(all.map((g) => [g.contestId.replace(':', '-'), g]));
      const dates = hrefs.map((id) => byId.get(id)!.dateLocal);
      expect(dates, `app/teams/[slug]/page.tsx ${team.slug} date order`).toEqual([...dates].sort());
      const nonLeague = v.nonLeagueLog.filter((g) => g.postseason === null).length;
      expect(section.split('sx-nonleague').length - 1, `components/teams/TeamGameLog.tsx ${team.slug} non-league rows`).toBe(nonLeague);
      if (all.length > 0) checked += 1;
      else expect(section, `components/teams/TeamGameLog.tsx ${team.slug} empty`).toContain('<p class="sx-empty">No games listed</p>');
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
      // A rail section, not a disclosure (DESIGN §33); `#elo` is still the anchor the board links.
      expect(html, `components/teams/TeamElo.tsx ${team.slug}: section`).toMatch(
        /<section id="elo" aria-labelledby="elo-heading" class="sx-section sx-target"><h2 id="elo-heading">Rating<\/h2>/,
      );
      expect(html, `components/teams/TeamElo.tsx ${team.slug}: no disclosure`).not.toContain('<details id="elo"');
      expect(html, `components/teams/TeamElo.tsx ${team.slug}: method link`).toContain(`href="/leaders#${board.id}"`);
      if (row) {
        expect(elo.boardPlace, `components/teams/team-view.ts ${team.slug}`).toEqual({ rank: row.rank, tied: row.tied });
        expect(String(elo.elo), `components/teams/team-view.ts ${team.slug}`).toBe(row.cells[board.rankedBy].text);
        expect(text, `components/teams/TeamElo.tsx ${team.slug}`).toContain(
          `${elo.boardRegion} Elo board ${row.tied ? 'tied for ' : ''}${ordinal(row.rank)}`,
        );
      } else {
        expect(elo.boardPlace, `components/teams/team-view.ts ${team.slug}`).toBeNull();
        expect(text, `components/teams/TeamElo.tsx ${team.slug}`).not.toMatch(/\w+ Elo board/);
      }
      expect(elo.provisional, `components/teams/team-view.ts ${team.slug} provisional`).toBe(
        elo.elo !== null && elo.games > 0 && elo.games < elo.minGames,
      );
      expect(elo.preseason, `components/teams/team-view.ts ${team.slug} preseason`).toBe(elo.elo !== null && elo.games === 0);
      if (elo.elo !== null) {
        rated += 1;
        expect(html, `components/teams/TeamElo.tsx ${team.slug}`).toContain(`>Elo rating</dt><dd class="sx-num m-0">${elo.elo}</dd>`);
      }
      if (elo.provisional) {
        expect(text, `components/teams/TeamElo.tsx ${team.slug}`).toMatch(new RegExp(`Provisional ${elo.games} games?\\b`));
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
  it('heading outline: h1 Teams → h2 league → h3 division; anchors resolve; ids unique', () => {
    const html = renderIndex();
    const all = ids(html);
    expect(new Set(all).size, 'app/teams/page.tsx: unique ids').toBe(all.length);
    // League and division anchors (the nav's `/teams#<league>` lands on them). The section level is gone:
    // a league is a section of the directory (DESIGN §33).
    for (const id of [
      'scval', 'de-anza', 'el-camino', 'bval', 'mt-hamilton', 'santa-teresa', 'pcal', 'mcal', 'marin-county', 'eal',
      'sunset', 'city', 'city-western', 'city-eastern', 'north-county', 'avocado', 'palomar', 'valley', 'metro', 'metro-mesa',
      'metro-south-bay', 'independents', 'norcal', 'socal', 'team-list', 'team-league-switcher',
    ]) {
      expect(all, `app/teams/page.tsx #${id}`).toContain(id);
    }
    expect(html, 'app/teams/page.tsx h1').toMatch(/<h1[^>]*>Teams<\/h1>/);
    expect((html.match(/<h1/g) ?? []).length, 'app/teams/page.tsx: one h1').toBe(1);
    expect(html, 'app/teams/page.tsx league labelling').toContain('<section aria-labelledby="scval"');
    // Nine leagues and the LA independents, each an h2; the last h2 heads the three plain links.
    const h2s = [...html.matchAll(/<h2[^>]*>([^<]+)<\/h2>/g)].map((m) => m[1]);
    expect(h2s.length, 'app/teams/page.tsx league h2s + More').toBe(11);
    expect(h2s[0], 'app/teams/page.tsx SCVAL h2').toBe('SCVAL');
    expect(html, 'app/teams/page.tsx SCVAL long name').toContain('Santa Clara Valley Athletic League, ');
    expect(h2s[h2s.length - 1], 'app/teams/page.tsx last h2').toBe('More');
    // A league with one table has no division heading (the independents too: DESIGN §24.10).
    const h3s = [...html.matchAll(/<h3 class="sx-strip">([^<]+)<\/h3>/g)].map((m) => m[1]);
    expect(h3s, 'app/teams/page.tsx division h3s').toEqual([
      'De Anza', 'El Camino', 'Mt. Hamilton', 'Santa Teresa',
      'City Western', 'City Eastern', 'Avocado', 'Palomar', 'Valley', 'Metro Mesa', 'Metro South Bay',
    ]);
    expect(html, 'app/teams/page.tsx: no h4').not.toContain('<h4');
    // Region → league order; the regions are `<div id="norcal|socal" data-region-scope>` inside #team-list
    // (DESIGN-socal §2.4), so the finder's lift can show both while searching.
    expect(html, 'app/teams/page.tsx region wrappers').toMatch(/<div id="team-list"><div id="norcal" data-region-scope="norcal">/);
    expect(html, 'app/teams/page.tsx region wrappers').toContain('<div id="socal" data-region-scope="socal">');
    expect(html, 'app/teams/page.tsx lift hook').toContain('data-teams-page=""');
    const order = [
      'id="norcal"', 'id="scval"', 'id="de-anza"', 'id="el-camino"', 'id="bval"', 'id="pcal"', 'id="mcal"',
      'id="marin-county"', 'id="eal"', 'id="socal"', 'id="sunset"', 'id="independents"', 'id="city"',
      'id="north-county"', 'id="metro"',
    ].map((s) => html.indexOf(s));
    expect([...order].sort((a, b) => a - b), 'app/teams/page.tsx order').toEqual(order);
  });

  it('the finder hooks: 102 list items with data-team-tile, group wrappers, the search field first, the league row', () => {
    const html = renderIndex();
    // Every team is ONE list item of its division's name list, and the item is the finder's hook: the
    // directory holds no table (standings live on /standings, DESIGN §33).
    const items = [...html.matchAll(/<li data-team-slug="([^"]+)" data-team-tile="([^"]+)"/g)];
    expect(items.length, 'app/teams/page.tsx data-team-tile').toBe(102);
    for (const [, slug, tile] of items) expect(tile, slug).toBe(slug);
    expect(new Set(items.map((m) => m[2])), 'app/teams/page.tsx every team').toEqual(new Set(data.getTeamSlugs()));
    expect(html, 'app/teams/page.tsx: zero tables').not.toContain('<table');
    // Each item: the logo, the name as a link to the team's page, and the hidden note the pinned-team CSS
    // reveals as the star (the reader's team says so, not with a rule or a tint).
    const rows = [...html.matchAll(/<li data-team-slug="([^"]+)" data-team-tile[\s\S]*?<\/li>/g)];
    expect(rows.length, 'app/teams/page.tsx items').toBe(102);
    for (const [row, slug] of rows) {
      expect(row, `app/teams/page.tsx ${slug} logo`).toContain('<img class="sx-monogram"');
      expect(row, `app/teams/page.tsx ${slug} link`).toContain(`<a class="sx-rowlink text-body font-medium" href="/teams/${slug}">`);
      expect(row, `app/teams/page.tsx ${slug} pin note`).toContain('<span class="sx-pin-note" hidden="">Your team</span>');
    }
    // Ten league groups and sixteen division groups, each a wrapper the finder can hide.
    expect((html.match(/data-team-group=""/g) ?? []).length, 'app/teams/page.tsx data-team-group').toBe(10 + 16);
    // Each league's heading links its standings.
    for (const href of ['/standings/scval', '/standings/bval', '/standings/pcal', '/standings/mcal', '/standings/eal']) {
      expect(html, `app/teams/page.tsx ${href}`).toContain(`href="${href}"`);
    }
    // The finder is the first thing under the title, and its field is the page's first search input.
    expect(html, 'app/teams/page.tsx finder').toContain('<search');
    expect(html.indexOf('<search'), 'app/teams/page.tsx finder before the league row').toBeLessThan(html.indexOf('id="team-league-switcher"'));
    expect(html.indexOf('type="search"'), 'app/teams/page.tsx search input first').toBeLessThan(html.indexOf('id="team-list"'));
    // The league row: anchors to each league, with the region switch and the short stamp in its util part.
    expect(html, 'app/teams/page.tsx league row').toMatch(/<div id="team-league-switcher"[^>]*>\s*<div class="sx-scope sx-print-hide">/);
    expect(html, 'app/teams/page.tsx league anchors').toContain('href="#scval"');
    expect(html, 'app/teams/page.tsx stamp').toMatch(/<span class="sx-scope-util">[\s\S]*?Updated <time/);
    // No sentence under the title: the provenance lede is /about's.
    const text = textOf(html);
    expect(text, 'app/teams/page.tsx: no lede').not.toContain('League and division alignment comes from');
    expect(html, 'app/teams/page.tsx').not.toContain('Gabilan');
    expect(html, 'app/teams/page.tsx: no card, pill or badge').not.toMatch(/\bsx-(card|pill|badge|flag|lift|bleed|flush)\b/);
  });

  it('an item prints the league record the standings have, and nothing for a team with no result', () => {
    const html = renderIndex();
    for (const slug of ['st-ignatius', 'leigh', 'stevenson', 'tamalpais', 'lassen']) {
      const s = data.getStandingFor(slug)!;
      const row = new RegExp(`<li data-team-slug="${slug}"[\\s\\S]*?</li>`).exec(html)![0];
      const cells = textOf(row).replace(/\s+/g, ' ');
      if (s.hasReportedResults) {
        expect(cells, slug).toContain(`League record ${s.computed.w}-${s.computed.l}-${s.computed.t}`);
      } else {
        // Never 0-0-0, and no dash either: the record is simply absent.
        expect(cells, slug).not.toMatch(/\d+-\d+-\d+|—/);
      }
    }
    expect(data.getStandingFor('lassen')!.hasReportedResults, 'the all corpus holds no EAL league result').toBe(false);
  });

  it('links the clubs, commitments and recruiting pages once each, as plain links outside the list the finder filters', () => {
    const html = renderIndex();
    const lastGroup = html.lastIndexOf('data-team-group=""');
    for (const [href, label] of [
      ['/commits', 'College commitments'],
      ['/clubs', 'Club teams'],
      ['/recruiting', 'Recruiting by school'],
    ]) {
      expect((html.match(new RegExp(`href="${href}"`, 'g')) ?? []).length, `app/teams/page.tsx ${href} link`).toBe(1);
      // After the whole list (its last group), not inside it: TeamFinder never hides it.
      expect(html.indexOf(`href="${href}"`), `app/teams/page.tsx ${href} link`).toBeGreaterThan(lastGroup);
      expect(html, `app/teams/page.tsx ${href} label`).toContain(`<a class="sx-action" href="${href}">${label}</a>`);
    }
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

  it('the header states the place as a figure over its scope, T-prefixed when level', async () => {
    const { TeamIdentity, leagueLine } = await import('../../components/teams/TeamIdentity');
    const { ordinal, recordString } = await import('../../lib/format');
    let checked = 0;
    let level = 0;
    for (const team of data.getTeams()) {
      const v = view.buildTeamPageView(team.slug)!;
      if (!v.hasResults || !v.standing) continue;
      checked += 1;
      const html = renderToStaticMarkup(createElement(TeamIdentity, { view: v, knownSlugs: [] }));
      const place = ordinal(v.standing.computed.place);
      expect(textOf(html), `components/teams/TeamIdentity.tsx ${team.slug} league line`).toContain(leagueLine(v));
      // The record is figures, not a label line: league, overall, then the place over the table it is a place in.
      expect(html, `components/teams/TeamIdentity.tsx ${team.slug} league figure`).toContain(
        `<dt>League</dt><dd>${recordString(v.standing.computed)}</dd>`,
      );
      const shown = v.standing.tiebreak.shared ? `T-${place}` : place;
      if (v.standing.tiebreak.shared) level += 1;
      expect(html, `components/teams/TeamIdentity.tsx ${team.slug} place`).toContain(
        `<dt>${v.scopeLabel.replace(/&/g, '&amp;')}</dt><dd>${shown}</dd>`,
      );
      expect(html, `components/teams/TeamIdentity.tsx ${team.slug}: one way to write a level place`).not.toContain('(tied)');
      // The name is the h1; the logo is the 64px file.
      expect(html, `components/teams/TeamIdentity.tsx ${team.slug} h1`).toContain(
        `<h1 class="m-0 text-h1 text-ink">${v.team.name.replace(/&/g, '&amp;').replace(/'/g, '&#x27;')}</h1>`,
      );
      expect(html, `components/teams/TeamIdentity.tsx ${team.slug} hook`).toContain(`<div data-team-slug="${team.slug}">`);
    }
    expect(checked).toBeGreaterThan(0);
    expect(level, 'the corpus has a level place to check').toBeGreaterThan(0);
  });

  it('Last 5 games never prints 0-0-0 for a venue with no league games, and lists a neutral row only when there is one', async () => {
    const { TeamSplits } = await import('../../components/teams/TeamSplits');
    const { recordString } = await import('../../lib/format');
    let empty = 0;
    for (const team of data.getTeams()) {
      const v = view.buildTeamPageView(team.slug)!;
      const html = renderToStaticMarkup(createElement(TeamSplits, { view: v }));
      const text = textOf(html);
      expect(text, `components/teams/TeamSplits.tsx ${team.slug}`).not.toContain('0-0-0');
      expect(html, `components/teams/TeamSplits.tsx ${team.slug}: no card`).not.toMatch(/sx-card|sx-figure\b/);
      const league = v.hasResults && v.standing ? v.standing.computed : null;
      if (!league) continue;
      const splits = [
        [league.homeRecord, 'Home', 'no home league games'],
        [league.awayRecord, 'Away', 'no away league games'],
      ] as const;
      for (const [record, label, words] of splits) {
        if (record.w + record.l + record.t > 0) {
          expect(html, `components/teams/TeamSplits.tsx ${team.slug} ${label}`).toContain(
            `>${label}</dt><dd class="sx-num m-0">${recordString(record)}</dd>`,
          );
          continue;
        }
        empty += 1;
        expect(text, `components/teams/TeamSplits.tsx ${team.slug} empty split`).toContain(words);
      }
      const n = league.neutralRecord;
      expect(html.includes('>Neutral</dt>'), `components/teams/TeamSplits.tsx ${team.slug} neutral row`).toBe(n.w + n.l + n.t > 0);
    }
    expect(empty, 'the corpus has an empty split to check').toBeGreaterThan(0);
  });
});

describe('a team with no results (corpus copy, one MCAL team zeroed)', () => {
  let zeroed: { d: Data; pl: Line; v: View; renderTeam: (slug: string) => Promise<string> };
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
    process.env.SCVAL_SNAPSHOT = writeTempSnapshot(snap, 'team-view');
    const m = await loadModules();
    zeroed = { d: m.d, pl: m.pl, v: m.v, renderTeam: m.renderTeam };
  }, 600_000);

  it('getTeamPostseasonLine is null and the block says "No results reported yet."', async () => {
    expect(zeroed.pl.getTeamPostseasonLine(slug), 'components/playoffs/team-postseason-line.ts getTeamPostseasonLine gp 0').toBeNull();
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
    expect(text.replace(/\s+/g, ' '), 'components/teams/TeamElo.tsx gp 0').toContain(`Elo rating ${v.elo.elo} Preseason from 2025-26`);
    expect(text, 'components/teams/TeamElo.tsx gp 0: no board place').not.toMatch(/\w+ Elo board/);
  });

  it('the Elo rows say what the number rests on: games counted, or provisional, never how it is computed', async () => {
    const { TeamElo } = await import('../../components/teams/TeamElo');
    const view = zeroed.v.buildTeamPageView(slug)!.elo;
    const played = { ...view, elo: 1600, games: 8, preseason: false, provisional: false, boardPlace: null };
    const counted = textOf(renderToStaticMarkup(createElement(TeamElo, { elo: played }))).replace(/\s+/g, ' ');
    expect(counted, 'components/teams/TeamElo.tsx counted').toContain('Elo rating 1600 Counted 8 games');
    const provisional = textOf(renderToStaticMarkup(createElement(TeamElo, { elo: { ...played, games: 2, provisional: true } }))).replace(/\s+/g, ' ');
    expect(provisional, 'components/teams/TeamElo.tsx provisional').toContain('Elo rating 1600 Provisional 2 games');
    // The method (the scale, where a team started, what counts) is said once, on the board the link goes to.
    for (const text of [counted, provisional]) {
      expect(text, 'components/teams/TeamElo.tsx: no method text').not.toMatch(/Worked out from|It started the season|1500 is an average team/);
      expect(text, 'components/teams/TeamElo.tsx: the link').toContain('How it is computed');
    }
  });

  it('the Elo rows say a team with no rating at all is not rated, never a 1500 it has not earned', async () => {
    const { TeamElo } = await import('../../components/teams/TeamElo');
    const view = zeroed.v.buildTeamPageView(slug)!.elo;
    const unrated = { ...view, elo: null, preseason: false, provisional: false, boardPlace: null };
    const html = renderToStaticMarkup(createElement(TeamElo, { elo: unrated }));
    expect(html, 'components/teams/TeamElo.tsx unrated').toContain('>Elo rating</dt><dd class="sx-num m-0">Not rated</dd>');
    expect((html.match(/<dt/g) ?? []).length, 'components/teams/TeamElo.tsx unrated: one row').toBe(1);
    expect(html, 'components/teams/TeamElo.tsx unrated').not.toContain('1500');
  });

  it('the header prints no figures at all (never 0-0-0)', async () => {
    const { TeamIdentity, leagueLine } = await import('../../components/teams/TeamIdentity');
    const v = zeroed.v.buildTeamPageView(slug)!;
    const html = renderToStaticMarkup(createElement(TeamIdentity, { view: v, knownSlugs: [] }));
    const text = textOf(html);
    expect(text, 'components/teams/TeamIdentity.tsx gp 0').toContain(leagueLine(v));
    expect(html, 'components/teams/TeamIdentity.tsx gp 0: no figures').not.toContain('sx-figures');
    expect(text, 'components/teams/TeamIdentity.tsx gp 0').not.toContain('0-0-0');
    expect(html, 'components/teams/TeamIdentity.tsx gp 0: no definition list').not.toContain('<dl');
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

describe('fixtureOpponent (components/teams/team-schedule.ts)', () => {
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
    const outside = schedule.fixtureOpponent({ ...base, awayName: 'VALLEY CHRISTIAN', awaySlug: null }, team);
    expect(outside).toMatchObject({ mineIsHome: true, versus: 'vs', opponent: undefined, opponentName: 'Valley Christian' });
    expect(headlines.officialFixtureHeadline({ ...base, awayName: 'VALLEY CHRISTIAN', awaySlug: null }, team)).toMatch(
      /^vs Valley Christian · /,
    );
    const rival = data.getTeams().find((t) => t.slug !== team.slug)!;
    const away = schedule.fixtureOpponent({ ...base, awayName: 'X', awaySlug: rival.slug }, rival);
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
