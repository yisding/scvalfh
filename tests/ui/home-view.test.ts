/**
 * The home page (SPEC §10.1, §8.2, §8.4; DESIGN §33 "Home is Scores"), on the offline corpus snapshot so
 * league-specific values never move with a live fetch (SPEC §13.6).
 *
 * `/` renders the score day view for today (components/schedule/ScoreDay.tsx) with one block of its own,
 * "Find your team". The league panels, the league cards, the pinned card and the "This week" strip are no
 * longer drawn on `/`; their view models (components/home/*.ts) are still built and still read by other
 * suites, so what they SAY is held here on the view models themselves.
 *
 * Every assertion names the module that produced the value (the repair policy routes on it).
 */


import { readFileSync } from 'node:fs';
import path from 'node:path';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { loadSnapshot } from '../../lib/snapshot/snapshot-load';
import { game, withGames } from '../game-builder';
import { corpusSnapshotPath, writeTempSnapshot } from '../helpers';

import { SEED_CLAIM } from '../../scripts/copy-rules';
import { POSTSEASON_LEAD, postseasonCardLine, rungCardText } from '../../components/home/home-types';


import { textOf } from './html-text';
import { width } from './text-metrics';

type HomeView = typeof import('../../components/home/home-view');
type PhaseLead = typeof import('../../components/home/phase-lead');
type PostseasonCard = typeof import('../../components/home/postseason-card');
type TeamCard = typeof import('../../components/home/team-card');

let home: HomeView;
let phaseLeadModule: PhaseLead;
let postseasonCard: PostseasonCard;
let data: ReturnType<HomeView['buildHomeView']>;
let leagues: typeof import('../../lib/leagues');

const HV = 'components/home/home-view.ts';
const LEAGUE_IDS = ['scval', 'bval', 'pcal', 'mcal', 'eal', 'sunset', 'city', 'north-county', 'metro', 'independents'];

/** Every string a value holds, in order: the copy of a view model, without its keys. */
function stringsOf(value: unknown, into: string[] = []): string[] {
  if (typeof value === 'string') into.push(value);
  else if (Array.isArray(value)) for (const v of value) stringsOf(v, into);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) stringsOf(v, into);
  return into;
}

type Panel = ReturnType<HomeView['buildHomeView']>['panels'][number];

/**
 * A league panel's own copy: its names, phase lead, postseason view, table lines, the points legend and the
 * other-leagues lines. Not its game lists, which are other teams' names and nothing the panel wrote.
 */
function panelCopy(panel: Panel): string {
  return stringsOf([
    panel.shortName,
    panel.name,
    panel.lead,
    panel.postseason,
    panel.divisions.map((d) => [d.heading, d.home.lineLabel]),
    panel.pointsLegend,
    panel.others.map((o) => o.text),
    panel.afterSchedule,
  ]).join(' | ');
}

const panelOf = (id: string): Panel => {
  const panel = data.panels.find((p) => p.id === id);
  if (!panel) throw new Error(`${HV}: no panel for ${id}`);
  return panel;
};

beforeAll(async () => {
  process.env.SCVAL_SNAPSHOT = corpusSnapshotPath('all-2026-10-02');
  home = await import('../../components/home/home-view');
  phaseLeadModule = await import('../../components/home/phase-lead');
  postseasonCard = await import('../../components/home/postseason-card');
  leagues = await import('../../lib/leagues');
  data = home.buildHomeView();
}, 600_000);

describe('home panels (components/home/home-view.ts)', () => {
  it('builds one panel per league, config order', () => {
    expect(data.panels.map((p) => p.id), `${HV}: panels`).toEqual(LEAGUE_IDS);
    // Each panel knows its region, from its section (DESIGN-socal §2.4).
    expect(data.panels.map((p) => p.region), `${HV}: panel regions`).toEqual([
      'norcal', 'norcal', 'norcal', 'norcal', 'norcal', 'socal', 'socal', 'socal', 'socal', 'socal',
    ]);
    for (const p of data.panels) {
      expect(p.shortName, `${HV}: ${p.id} short name`).toBe(leagues.getLeague(p.id).shortName);
      expect(p.name, `${HV}: ${p.id} name`).toBe(leagues.getLeague(p.id).name);
    }
  });

  it('the MCAL panel carries no CCS concept', () => {
    const text = panelCopy(panelOf('mcal'));

    expect(text, `${HV}: MCAL panel`).not.toMatch(/automatic qualifier/i);
    expect(text, `${HV}: MCAL panel`).not.toMatch(/at-large/i);
    expect(text, `${HV}: MCAL panel`).not.toMatch(/CCS Division/i);
    expect(text, `${HV}: MCAL panel`).not.toMatch(/\bCCS\b/);
    const mcal = data.panels.find((p) => p.id === 'mcal')!;
    expect(mcal.postseason.kind, `${HV}: MCAL postseason`).toBe('league-tournament');
    if (mcal.postseason.kind === 'league-tournament') {
      expect(mcal.postseason.line, `${HV}: MCAL postseason line`).toBe(
        'MCAL tournament · Quarterfinals Mon Oct 26 (a play-in Fri Oct 23 only if needed) · Semifinals Wed Oct 28 · Final Fri Oct 30 at Tamalpais',
      );
      expect(mcal.postseason.link.href).toBe('/playoffs/mcal');
    }
    expect(mcal.postseason.kind, `${HV}: MCAL has no berth meter`).not.toBe('ccs-ladder');
  });

  it('the EAL panel: the Super Regional line and note, no meter, no bracket and no CCS concept', () => {

    const eal = data.panels.find((p) => p.id === 'eal')!;
    const config = leagues.getLeague('eal');
    expect(eal.postseason.kind, `${HV}: EAL postseason`).toBe('unbracketed-tournament');
    if (eal.postseason.kind === 'unbracketed-tournament' && config.postseason.kind === 'unbracketed-tournament') {
      expect(eal.postseason.line, `${HV}: EAL postseason line`).toBe('Super Regional, Oct 30–31 — the top six qualify');
      expect(eal.postseason.note, `${HV}: EAL postseason note`).toBe(config.postseason.note);
      expect(eal.postseason.link, `${HV}: EAL postseason link`).toEqual({ href: '/playoffs#eal', label: 'Postseason' });
    }
    expect(eal.afterSchedule, `${HV}: EAL afterSchedule`).toEqual({ href: '/playoffs#eal', label: 'Super Regional' });
    const text = panelCopy(eal);
    expect(text, `${HV}: EAL line`).toContain('Super Regional, Oct 30–31 — the top six qualify');
    // The link is its words alone: no trailing arrow (DESIGN §33).
    expect(text, `${HV}: no arrow`).not.toContain('→');
    expect(eal.postseason.kind, `${HV}: EAL has no berth meter`).not.toBe('ccs-ladder');
    expect(JSON.stringify(eal.postseason), `${HV}: EAL has no bracket page`).not.toContain('/playoffs/eal');

    expect(text, `${HV}: EAL panel`).not.toMatch(/\bCCS\b/);
    expect(text, `${HV}: EAL panel`).not.toMatch(/automatic qualifier/i);
    expect(text, `${HV}: EAL panel`).not.toMatch(/at-large/i);
  });

  it('the CCS leagues show their berth sentence and CCS dates', () => {
    const labels = Object.fromEntries(
      data.panels.map((p) => [p.id, p.postseason.kind === 'ccs-ladder' ? p.postseason.meter.label : null]),
    );
    expect(labels.scval, `${HV}: SCVAL berth sentence`).toBe(
      'SCVAL holds 7 of the 16 CCS berths automatically: the top three in each division, plus the winner of the fourth-place play-in (By-Laws Article VII §1–2).',
    );
    expect(labels.bval, `${HV}: BVAL berth sentence`).toBe(
      'BVAL holds 4 of the 16 CCS berths automatically: Mt. Hamilton’s top three, plus the winner of the Oct 31 play-in (Mt. Hamilton #4 at the Santa Teresa champion).',
    );
    expect(labels.pcal, `${HV}: PCAL berth sentence`).toBe(
      'PCAL holds 2 of the 16 CCS berths automatically: the top two of the final standings.',
    );
    for (const id of ['scval', 'bval', 'pcal']) {
      const panel = panelOf(id);
      if (panel.postseason.kind !== 'ccs-ladder') throw new Error(`${HV}: ${id} is a CCS ladder`);
      expect(panel.postseason.link.href, `${HV}: ${id} CCS link`).toBe(`/playoffs#${id}`);
      expect(panel.postseason.dates.map((d) => d.term), `${HV}: ${id} dates`).toContain('Quarterfinals');
      // The footer is the view's dated sentence (ccsLadderView `official`); the corpus day is before the meeting.
      expect(panel.postseason.official, `${HV}: ${id} footer`).toBe(
        'Berths are assigned by the CCS committee. Nothing here is official until the seeding meeting.',
      );
    }
  });


  it('the CCS card footer changes tense the day after the seeding meeting (ccsOfficialSentence)', () => {
    const before = 'Berths are assigned by the CCS committee. Nothing here is official until the seeding meeting.';
    expect(postseasonCard.ccsOfficialSentence('2026-10-29'), HV).toBe(before);
    // On Nov 2 itself the updates land before the 1 PM meeting: still the present tense.
    expect(postseasonCard.ccsOfficialSentence('2026-11-02'), HV).toBe(before);
    expect(postseasonCard.ccsOfficialSentence('2026-11-03'), HV).toBe(
      'Berths were assigned by the CCS committee on Mon Nov 2; results update twice a day.',
    );
  });

  it('PCAL and MCAL tables carry no division label', () => {
    for (const id of ['pcal', 'mcal']) {
      const panel = panelOf(id);
      expect(panel.divisions.map((d) => d.heading), `${HV}: ${id} division heading`).toEqual([null]);
      const text = panelCopy(panel);
      expect(text, `${HV}: ${id}`).not.toMatch(/\b(PCAL|MCAL) Division\b/);
      expect(text, `${HV}: ${id}`).not.toMatch(/Gabilan/i);
    }

    const bval = data.panels.find((p) => p.id === 'bval')!;
    expect(bval.divisions.map((d) => d.heading), `${HV}: BVAL division headings`).toEqual(['Mt. Hamilton', 'Santa Teresa']);
  });

  it('the division `home` config drives each short table', () => {
    const { miniShownCount } = home;

    const expected: Record<string, { rows: number; line: string | null }> = {
      'de-anza': { rows: 4, line: null },
      'el-camino': { rows: 4, line: null },
      'mt-hamilton': { rows: 4, line: 'Automatic-berth line' },
      'santa-teresa': { rows: 3, line: 'Play-in host' },
      pcal: { rows: 7, line: 'Automatic-berth line' },
      'marin-county': { rows: 7, line: 'Tournament line' },
      eal: { rows: 6, line: null },
      // Southern California: every row, and no line (`home.lineAfter` null): no league table is a route.
      sunset: { rows: 10, line: null },
      'city-western': { rows: 6, line: null },
      'city-eastern': { rows: 6, line: null },
      avocado: { rows: 6, line: null },
      palomar: { rows: 7, line: null },
      valley: { rows: 6, line: null },
      'metro-mesa': { rows: 5, line: null },
      'metro-south-bay': { rows: 4, line: null },
      independents: { rows: 5, line: null },
    };
    for (const panel of data.panels) {
      for (const division of panel.divisions) {
        expect(division.home, `${HV}: ${division.id} home`).toEqual(leagues.getDivision(division.id).home);
        const want = expected[division.id];
        // `want.rows`, plus any team sharing the place at the cutoff.
        const rows = miniShownCount(division.rows, division.home.miniRows);
        expect(rows, `${HV}: ${division.id} rows`).toBe(miniShownCount(division.rows, want.rows));
        expect(rows, `${HV}: ${division.id} rows`).toBeGreaterThanOrEqual(Math.min(want.rows, division.total));
        expect(division.total, `${HV}: ${division.id} total`).toBe(division.rows.length);
        expect(division.home.lineLabel, `${HV}: ${division.id} line`).toBe(want.line);
        // No line configured (the EAL: `lineAfter` null): no label either.
        if (division.home.lineAfter === null) expect(division.home.lineLabel, `${HV}: ${division.id} no line`).toBeNull();
        // The row link reads the record in words and counts points ("1 point", never "1 points").
        for (const row of division.rows.filter((r) => r.hasResults)) {
          expect(row.recordWords, `${HV}: ${row.slug} record words`).toMatch(/^\d+ wins?, \d+ loss(es)?, \d+ ties?$/);
          expect(row.orderWords, `${HV}: ${row.slug} order words`).not.toMatch(/\b1 points\b/);
        }
        expect(division.href, `${HV}: ${division.id} href`).toBe(`/standings/${panel.id}#${division.id}`);
      }
    }
    // The points legend: once per league, citing the league's own rule (the independents' table included,
    // DESIGN §24.10).
    for (const panel of data.panels) {
      expect(panel.pointsLegend, `${HV}: ${panel.id} legend`).toBe(
        `PTS: ${leagues.getLeague(panel.id).rules.citations.points}.`,
      );
    }
  });

  it('a place shared at the row cutoff is shown whole (Mt. Hamilton 4= pair), and nothing else stretches it', () => {
    const { miniShownCount } = home;

    const row = (place: number, shared: boolean, hasResults = true) => ({ place, shared, hasResults });
    // 1, 2, 3, 4=, 4=, 6: four rows asked, both 4= teams shown.
    const tied = [row(1, false), row(2, false), row(3, false), row(4, true), row(4, true), row(6, false)];
    expect(miniShownCount(tied, 4)).toBe(5);
    // Three-way tie at the cutoff.
    expect(miniShownCount([row(1, false), row(2, true), row(2, true), row(2, true)], 2)).toBe(4);
    // The next row is a different shared cluster: no stretch.
    expect(miniShownCount([row(1, true), row(1, true), row(3, true), row(3, true)], 2)).toBe(2);
    // No tie at the cutoff, or no results yet: exactly the configured rows.
    expect(miniShownCount([row(1, false), row(2, false), row(3, false), row(4, false), row(5, false)], 4)).toBe(4);
    const unplayed = Array.from({ length: 6 }, () => row(1, true, false));
    expect(miniShownCount(unplayed, 4)).toBe(4);
    expect(miniShownCount([row(1, false)], 4)).toBe(1);
  });

  it('the other-leagues strip names each division leader', () => {
    const bval = data.panels.find((p) => p.id === 'bval')!;
    const scval = data.panels.find((p) => p.id === 'scval')!;
    const line = (panel: typeof bval, id: string) => panel.others.find((o) => o.id === id)?.text;
    // Only the panel's own region's leagues (DESIGN-socal §2.4): no SoCal line under a NorCal league.
    expect(bval.others.map((o) => o.id), `${HV}: BVAL strip`).toEqual(['scval', 'pcal', 'mcal', 'eal']);
    const city = data.panels.find((p) => p.id === 'city')!;
    expect(city.others.map((o) => o.id), `${HV}: City strip`).toEqual(['sunset', 'north-county', 'metro', 'independents']);
    // The independents' table has no result in this corpus (DESIGN §24.10).
    expect(line(city, 'independents'), `${HV}: strip independents`).toBe('No league results yet');
    // Its link is the group's own /standings page, which says why there is no table and lists the teams.
    expect(city.others.find((o) => o.id === 'independents')?.href, `${HV}: strip independents href`).toBe('/standings/independents');
    expect(line(bval, 'scval'), `${HV}: strip SCVAL`).toBe('Saint Francis leads De Anza · Mitty leads El Camino');
    expect(line(scval, 'bval'), `${HV}: strip BVAL`).toBe(
      'Christopher leads Mt. Hamilton · Prospect & Westmont lead Santa Teresa',
    );
    expect(line(scval, 'pcal'), `${HV}: strip PCAL`).toBe('Stevenson leads');
    expect(bval.others.every((o) => o.href === `/standings/${o.id}`), `${HV}: strip links`).toBe(true);
  });

  it('writes the phase copy per league (dates from config)', () => {
    const lead = (id: string, phase: Parameters<PhaseLead['phaseLead']>[1], today: string) =>
      phaseLeadModule.phaseLead(leagues.getLeague(id), phase, today);
    expect(lead('mcal', 'regular', '2026-10-02'), `${HV}: regular renders nothing`).toBeNull();
    // The independents (DESIGN §24.10): the lead names the first game between two of them, never "Independent
    // league play", and the body says the table counts only games between them.
    expect(lead('independents', 'regular', '2026-08-10'), `${HV}: independents before their first game`).toEqual({
      lead: 'The first game between two of the LA independents is Tue Sep 8.',
      body: 'No games have been played yet, so every record below is empty on purpose.',
      link: { href: '/schedule/independents', label: 'Full schedule' },
    });
    expect(lead('independents', 'regular', '2026-09-08'), `${HV}: independents in season`).toBeNull();
    // Before the first league date (config's, lib/leagues leaguePlayStarts), counting the
    // non-league finals played by that day only (lib/data getNonLeagueFinalsPlayed).
    expect(lead('scval', 'regular', '2026-09-01'), `${HV}: SCVAL before league play`).toEqual({
      lead: 'SCVAL league play starts Wed Sep 9.',
      body: 'These tables count league games only, so the 15 non-league games played so far are on the schedule and in the overall records, not in the standings.',
      link: { href: '/schedule/scval', label: 'Full schedule' },
    });
    expect(lead('mcal', 'tournament', '2026-10-24'), `${HV}: MCAL tournament`).toEqual({
      lead: 'MCAL league play is over.',
      body: 'Quarterfinals are Mon Oct 26 (a play-in Fri Oct 23 only if needed); the final is Fri Oct 30 at Tamalpais.',
      link: { href: '/playoffs/mcal', label: 'Bracket' },
    });
    const bval = lead('bval', 'play-in', '2026-10-31');
    expect(`${bval?.lead} ${bval?.body}`, `${HV}: BVAL play-in`).toBe(
      'BVAL league play is over. Mt. Hamilton #4 plays at the Santa Teresa champion Sat Oct 31, 11 AM, for BVAL’s fourth automatic CCS berth; the CCS seeding meeting is Mon Nov 2.',
    );
    expect(bval?.link?.href).toBe('/playoffs#bval');
    const scval = lead('scval', 'crossover', '2026-10-29');
    expect(`${scval?.lead} ${scval?.body}`, `${HV}: SCVAL crossover`).toBe(
      // The pairings' window (lib/league-config/scval.ts): two 2026 crossovers moved to Thu Oct 29, so both days are named.
      'League play is over. The crossover games and the fourth-place play-in for SCVAL’s seventh automatic CCS berth are Thu Oct 29 and Fri Oct 30; the CCS seeding meeting is Mon Nov 2.',
    );
    const pcal = lead('pcal', 'playoffs', '2026-11-03');
    expect(`${pcal?.lead} ${pcal?.body}`, `${HV}: PCAL playoffs`).toBe(
      'PCAL league play is over. CCS seeds the 16-team field on Mon Nov 2; quarterfinals are Sat Nov 7.',
    );
    expect(lead('pcal', 'complete', '2026-11-20')?.link, `${HV}: no last-season link: PCAL history is unavailable`).toBeNull();
    expect(lead('mcal', 'complete', '2026-11-20')?.link).toBeNull();
    expect(lead('scval', 'complete', '2026-11-20')?.link?.href).toBe('/history/2025-26#scval');
    expect(lead('bval', 'complete', '2026-11-20')?.link?.href).toBe('/history/2025-26#bval');
    // The EAL: no bracket, so the tournament phase says what is (and is not) published, and the
    // CCS-ladder 'playoffs' copy never reaches it.
    expect(lead('eal', 'tournament', '2026-10-30'), `${HV}: EAL tournament`).toEqual({
      lead: 'The Super Regional is Oct 30–31; the NFHS Network’s CIFNS listing has its games at Pleasant Valley High School, Chico on Sat Oct 31.',
      body: 'Pairings are not published; results appear here as MaxPreps posts them.',
      link: { href: '/playoffs#eal', label: 'Postseason' },
    });
    expect(lead('eal', 'playoffs', '2026-11-03'), `${HV}: EAL never gets the CCS copy`).toBeNull();
    expect(lead('eal', 'complete', '2026-11-20')?.link, `${HV}: no last-season link: EAL history is unavailable`).toBeNull();
    // The San Diego leagues: the Section's playoffs, dates from config, no bracket and no "top N".
    expect(lead('city', 'tournament', '2026-11-03'), `${HV}: City in the Section playoffs`).toEqual({
      lead: 'City league play is over.',
      body: 'The San Diego Section playoffs are Nov 2–14; the Section posts its brackets on its field hockey page after its Sat Oct 31 seeding meeting.',
      link: { href: '/playoffs#city', label: 'Postseason' },
    });
    expect(lead('metro', 'playoffs', '2026-11-03'), `${HV}: SDS never gets the CCS copy`).toBeNull();
    // A 'site' league's final table is this site's, never "the final league standings".
    expect(lead('sunset', 'complete', '2026-11-20')?.body).toBe('The tables below are this site’s final tables, ordered by its own points.');
    expect(lead('sunset', 'complete', '2026-11-20')?.link, `${HV}: no Sunset history`).toBeNull();
    expect(lead('scval', 'complete', '2026-11-20')?.body).toBe('The tables below are the final league standings.');
  });

  it('the Southern California postseason cards read their config, never "the top N qualify"', () => {
    const sunset = data.panels.find((p) => p.id === 'sunset')!;
    const sunsetPs = leagues.getLeague('sunset').postseason;
    expect(sunset.postseason, `${HV}: Sunset postseason`).toEqual({
      kind: 'no-postseason',
      leagueId: 'sunset',
      line: sunsetPs.kind === 'no-postseason' ? sunsetPs.note : '',
      // The section's outside tournament (the Tournament of Champions), from SectionConfig, never a seed or a "top N".
      note: leagues.getSection('ss').outsideTournament?.note ?? null,
      link: { href: '/playoffs#sunset', label: 'Postseason' },
    });
    expect(sunset.afterSchedule).toEqual({ href: '/playoffs#sunset', label: 'Postseason' });
    for (const id of ['city', 'north-county', 'metro']) {
      const panel = panelOf(id);

      const ps = leagues.getLeague(id).postseason;
      if (ps.kind !== 'section-playoffs') throw new Error(`${id}: section-playoffs`);
      expect(panel.postseason, `${HV}: ${id} postseason`).toEqual({
        kind: 'section-playoffs',
        leagueId: id,
        line: ps.qualificationLine,
        note: null,
        link: { href: `/playoffs#${id}`, label: 'San Diego Section playoffs' },
      });
      const text = panelCopy(panel);
      expect(text, `${HV}: ${id}`).toContain(ps.qualificationLine);
      expect(text, `${HV}: ${id}`).not.toMatch(/top \w+ qualify|CCS|at-large|automatic qualifier/i);
    }
    expect(panelCopy(sunset), `${HV}: Sunset`).not.toMatch(/top \w+ qualify|CCS|at-large|bracket/i);
  });
});

describe('the league cards (components/home/home-view.ts leagueCards)', () => {
  it('has a card per league with its facts', () => {
    expect(data.leagueCards.map((c) => c.id), `${HV}: cards`).toEqual(LEAGUE_IDS);

    const bval = data.leagueCards.find((c) => c.id === 'bval')!;
    expect(bval, `${HV}: BVAL card`).toMatchObject({
      shortName: 'BVAL',
      name: 'Blossom Valley Athletic League',
      teamsLine: '12 teams',
      divisions: ['Mt. Hamilton', 'Santa Teresa'],
      regionId: 'norcal',
      cities: 'San Jose, Campbell, Saratoga, Morgan Hill and Gilroy',
    });
    expect(data.leagueCards.find((c) => c.id === 'metro'), `${HV}: Metro card`).toMatchObject({
      shortName: 'Metro',
      name: 'Metro Conference',
      sectionShort: 'SDS',
      regionId: 'socal',
      cities: leagues.getLeague('metro').cities,
      teamsLine: '9 teams',
      divisions: ['Metro Mesa', 'Metro South Bay'],
    });
    expect(data.leagueCards.find((c) => c.id === 'pcal')?.divisions, `${HV}: PCAL card`).toEqual([]);
    expect(data.leagueCards.find((c) => c.id === 'mcal')?.sectionShort, `${HV}: MCAL card`).toBe('NCS');
    expect(data.leagueCards.find((c) => c.id === 'eal'), `${HV}: EAL card`).toMatchObject({
      shortName: 'EAL',
      name: 'Eastern Athletic League',
      sectionShort: 'NS',
      teamsLine: '6 teams',
      divisions: [],
    });
    expect(data.leagueCards.map((c) => c.showName), `${HV}: card button names`).toEqual([
      'SCVAL', 'BVAL', 'PCAL', 'MCAL', 'EAL', 'Sunset', 'City', 'North County', 'Metro', 'the LA independents',
    ]);
    expect(data.regions.map((r) => r.leagueCards.length), `${HV}: cards per region`).toEqual([5, 5]);
    expect(data.regions.map((r) => r.name), `${HV}: region names`).toEqual(['Northern California', 'Southern California']);
  });
});

/**
 * `/` is the score day view for today (DESIGN §33, "Home is Scores"): app/page.tsx renders
 * components/schedule/ScoreDay.tsx with `home` and hands it the first-visit block. What the day view
 * prints for a day is tests/ui/scores-day.test.ts's; this pins what makes it the home page.
 */
describe('the rendered home page (app/page.tsx): the score day view for today', () => {
  let pageHtml = '';

  beforeAll(async () => {
    const { default: HomePage } = await import('../../app/page');
    pageHtml = renderToStaticMarkup(createElement(HomePage));
  }, 600_000);

  it('has ONE h1, visually hidden, that starts with the site name and says it is the scores', () => {
    // Always NorCal (owner decision, 2026-10-06): the brand stays NorCal whichever region is shown.
    expect(pageHtml.split('<h1').length - 1, 'app/page.tsx: one h1').toBe(1);
    const h1 = /<h1([^>]*)>([\s\S]*?)<\/h1>/.exec(pageHtml);
    expect(h1?.[1], 'app/page.tsx: the h1 is visually hidden (the date bar is the visible title)').toContain('class="sr-only"');
    expect(textOf(h1?.[2] ?? ''), 'app/page.tsx: h1').toMatch(/^NorCal High School Field Hockey\b.*\bscores\b/i);
    expect(pageHtml, 'app/page.tsx: h1').not.toContain('California High School Field Hockey Teams');
  });

  it('opens the date bar on today, the selected cell', () => {
    expect(pageHtml, 'components/schedule/ScoreDay.tsx: the date bar').toMatch(/<nav class="sx-datebar[^"]*"/);
    const current = [...pageHtml.matchAll(/<a\b[^>]*aria-current="date"[^>]*>/g)].map((m) => m[0]);
    // Each region's bar marks its own selected day; every one of them is today's cell.
    expect(current.length, 'components/schedule/ScoreDay.tsx: a selected day').toBeGreaterThan(0);
    for (const cell of current.filter((c) => c.includes('sx-day'))) {
      expect(cell, 'app/page.tsx: the selected cell is today').toContain('data-today');
    }
    expect(current.some((c) => c.includes('sx-day')), 'components/schedule/ScoreDay.tsx: the selected cell is a date-bar cell').toBe(true);
    expect(data.today, `${HV}: the corpus day`).toBe('2026-10-02');
  });

  it('is not a second layout: no my-team strip, no "Today" headline, no league panels, cards or "This week" strip', () => {
    expect(pageHtml, 'app/page.tsx: no my-team strip').not.toMatch(/sx-myteam|my-team-heading|my-team-unpin/);
    expect(pageHtml, 'app/page.tsx: no date headline').not.toContain('data-title');
    expect(pageHtml, 'app/page.tsx: no "Today" section head').not.toMatch(/<h2[^>]*>\s*Today\s*<\/h2>/);
    expect(pageHtml, 'app/page.tsx: no league panels').not.toMatch(/id="league-(scval|bval|pcal|mcal|eal|sunset|city|north-county|metro|independents)"/);
    expect(textOf(pageHtml), 'app/page.tsx: no league cards').not.toMatch(/Show \w[\w ]* here/);
    expect(pageHtml, 'app/page.tsx: no "This week" strip').not.toMatch(/id="this-week|This week in the postseason/);
    // The whole rendered page, so a component of another family that `/` prints is held to the purge too:
    // the fix belongs to whichever file prints the class (components/home/ prints none).
    expect(pageHtml, 'the component that prints it (not components/home/): no card, pill or badge on `/`').not.toMatch(/\bsx-(card|pill|badge|flag|lift)\b/);
    expect(textOf(pageHtml), 'app/page.tsx: nothing is labelled "My team"').not.toMatch(/\bMy team\b/);
  });

  it('has the first-visit block once, the league row with the region switch, and the scope wrappers', () => {
    expect(pageHtml, 'components/home/FindYourTeam.tsx: first-visit block').toMatch(
      /<section data-scope="none" aria-labelledby="find-your-team"/,
    );
    expect(pageHtml, 'components/home/FindYourTeam.tsx: its heading').toMatch(/<h2 id="find-your-team" class="sr-only">Find your team<\/h2>/);
    // ONE finder, outside every region block.
    expect(pageHtml.split('aria-labelledby="find-your-team"').length - 1).toBe(1);
    expect(pageHtml.split('<search').length - 1, 'components/home/FindYourTeam.tsx: one finder').toBe(1);
    // The league row: "All" and one tab per league, then the region switch at the row's end
    // (components/prefs/ScopeBar.tsx: the tabs, then the util part).
    expect(pageHtml, 'app/page.tsx: league row, region control').toMatch(/data-league-option="all"[\s\S]*data-region-option="norcal"[\s\S]*data-region-option="socal"/);
    for (const id of LEAGUE_IDS) {
      expect(pageHtml, `app/page.tsx: the ${id} tab`).toContain(`data-league-option="${id}"`);
    }
    // Both regions are in the static HTML; the scope stylesheet shows the reader's.
    expect(pageHtml, 'app/page.tsx: NorCal block').toContain('data-region-scope="norcal"');
    expect(pageHtml, 'app/page.tsx: SoCal block').toContain('data-region-scope="socal"');
    // The first-visit block sits above the games: it is the top of the main column.
    const finder = pageHtml.indexOf('aria-labelledby="find-your-team"');
    const firstGame = pageHtml.search(/class="sx-game"|class="sx-empty"/);
    expect(firstGame, 'components/schedule/ScoreDay.tsx: games or the empty line').toBeGreaterThan(-1);
    expect(finder, 'components/schedule/ScoreDay.tsx: `before` comes first in the main column').toBeLessThan(firstGame);
    expect(pageHtml.indexOf('sx-datebar'), 'components/schedule/ScoreDay.tsx: the date bar is above it').toBeLessThan(finder);
  });

  it('keeps every id unique', () => {
    const ids = [...pageHtml.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes, 'app/page.tsx: duplicate ids').toEqual([]);
    expect(ids, 'app/page.tsx: #find-your-team').toContain('find-your-team');
    expect(ids, 'app/page.tsx: the retired my-team heading').not.toContain('my-team-heading');
  });

  it('prints no game twice', () => {
    // One row per game per scope: a league tab shows one scope at a time, so within a scope a game is listed once.
    const rows = [...pageHtml.matchAll(/<section[^>]*data-scope="([^"]+)"[^>]*>([\s\S]*?)<\/section>/g)];
    for (const [, scope, body] of rows) {
      const hrefs = [...body.matchAll(/class="sx-game-link"[^>]*href="([^"]+)"|href="([^"]+)"[^>]*class="sx-game-link"/g)].map((m) => m[1] ?? m[2]);
      expect(hrefs.filter((h, i) => hrefs.indexOf(h) !== i), `components/schedule/ScoreDay.tsx: ${scope} lists a game twice`).toEqual([]);
    }
  });

  it('carries the site’s structured data', () => {
    expect(pageHtml, 'app/page.tsx: JSON-LD').toMatch(/<script type="application\/ld\+json">[^<]*"WebSite"/);
  });

  it('prints no "This week in the postseason" strip in the regular season (the Oct 2 corpus)', () => {
    // No postseason game and no dated postseason event is within two days back and a week ahead of the corpus's
    // day, so the view model is empty; and `/` has no such strip in any week (DESIGN §33).
    expect(data.thisWeek.norcal.days, `${HV}: thisWeek.norcal`).toEqual([]);
    expect(data.thisWeek.socal.days, `${HV}: thisWeek.socal`).toEqual([]);
    expect(pageHtml, 'app/page.tsx').not.toMatch(/id="this-week|This week in the postseason/);
  });


  it('never renders Gabilan, "eliminated", a league hue or a game link that skips gameHref', () => {
    const text = textOf(pageHtml);
    expect(text, 'app/page.tsx').not.toMatch(/Gabilan/i);
    expect(text, 'app/page.tsx').not.toMatch(/eliminated/i);
    expect(pageHtml, 'app/page.tsx: no league hue').not.toMatch(/--sx-league|league-hue|data-league-hue/);
    expect(pageHtml, 'app/page.tsx: sblive game links use gameHref').not.toMatch(/href="\/game\/sblive:/);
  });
});

describe('the team views (components/home/team-card.ts ← home-view.ts teamViews)', () => {
  /** A view's identity: the search index entry it joins to on `slug`. */

  const cardTeam = (slug: string) => data.searchIndex.teams.find((t) => t.slug === slug)!;
  /** The league a view's team plays in, from its search-index entry (a team with no table has no table link). */
  const cardTeamLeague = (slug: string) => cardTeam(slug).leagueId;

  it('joins every view to exactly one search-index entry, and ships no identity of its own', () => {
    const slugs = data.teamViews.map((v) => v.slug);
    expect(new Set(slugs).size, `${HV}: one view per team`).toBe(102);
    expect([...slugs].sort(), `${HV}: views ↔ search index`).toEqual(data.searchIndex.teams.map((t) => t.slug).sort());
    for (const v of data.teamViews) {
      expect(Object.hasOwn(v, 'team'), `${HV}: ${v.slug} carries no second copy of the identity`).toBe(false);
    }
  });

  it('has a view for all 102 teams with the meta, played and postseason lines', () => {

    expect(data.teamViews, `${HV}: team views`).toHaveLength(102);
    const leigh = data.teamViews.find((v) => v.slug === 'leigh')!;
    expect(leigh.meta, `${HV}: meta`).toBe('3rd · Mt. Hamilton · BVAL');
    expect(leigh.played, `${HV}: played`).toBe('3 of 10 played');
    expect(leigh.postseason, `${HV}: postseason line`).toBe('If the season ended today: Automatic qualifier');
    expect(postseasonCardLine(leigh), `${HV}: postseason card line`).toBe('Today: Automatic qualifier');
    expect(leigh.postseasonShort, `${HV}: no tie, no second copy of the line`).toBeUndefined();
    expect(leigh.tableHref).toBe('/standings/bval#mt-hamilton');
    const tam = data.teamViews.find((v) => v.slug === 'tamalpais')!;
    expect(tam.meta, `${HV}: single-division meta`).toBe('1st · MCAL');
    for (const v of data.teamViews) {
      // A team with no result is never placed, except that a Sunset team's line is the league's "no
      // playoffs" note whatever it has played (components/playoffs/team-postseason-line.ts getTeamPostseasonLine).
      const noPostseason = leagues.NO_POSTSEASON_LEAGUE_IDS.includes(leagues.getLeague(cardTeamLeague(v.slug)).id);
      if (!v.hasResults && !noPostseason) expect(v.postseason, `${HV}: ${v.slug} gp 0 has no postseason line`).toBeNull();
      const card = postseasonCardLine(v);
      expect(card === null, `${HV}: ${v.slug} card line iff line`).toBe(v.postseason === null);
    }
  });

  it('"Last" is the newest PLAYED game: a score-pending one shows as unreported, never as a final', async () => {
    const d = await import('../../lib/data');
    const { describeGame } = await import('../../components/ui/describe-game');
    const { gameHref } = await import('../../lib/game-id');

    let pending = 0;
    for (const v of data.teamViews) {
      const team = d.getTeamBySlug(v.slug)!;
      const played = d
        .getGames({ teamId: team.id })
        .filter((g) => (g.status === 'final' || g.status === 'score-pending') && g.dateKey <= data.today)
        .sort((a, b) => a.dateLocal.localeCompare(b.dateLocal) || a.away.name.localeCompare(b.away.name));
      const newest = played.at(-1);
      expect(v.last?.href ?? null, `${HV}: ${v.slug} last`).toBe(newest ? gameHref(newest.contestId) : null);
      if (!newest || !v.last) continue;
      expect(Object.hasOwn(v.last, 'recap'), `${HV}: ${v.slug} carries no recap`).toBe(false);
      const unreported = describeGame(newest, v.slug).kind === 'unreported';
      expect(v.last.display.kind, `${HV}: ${v.slug} last kind`).toBe(unreported ? 'unreported' : 'final');
      if (!unreported) continue;
      pending += 1;
      expect(v.last.display.statusLabel, `${HV}: ${v.slug} unreported last`).toMatch(/score not reported/i);
    }

    // The corpus has at least one such team, so the unreported branch is never vacuous.
    expect(pending, `${HV}: a newest played game that is score-pending`).toBeGreaterThan(0);
  });

  // The short postseason line is one line at 320px (288px of text): the STATUS must fit whole or the reader
  // sees only the prefix. Widths: tests/ui/text-metrics.ts (12px/500) scaled to the 14px meta size, an
  // over-estimate for the 400 weight.

  const CARD_TEXT_PX = 288;
  const at14 = (s: string) => (width(s) * 14) / 12;

  it('the postseason card line fits one 320px line for every team (corpus)', () => {
    for (const v of data.teamViews) {
      const card = postseasonCardLine(v);
      if (!card) continue;
      expect(at14(card), `${HV}: ${v.slug} "${card}"`).toBeLessThanOrEqual(CARD_TEXT_PX);
    }
  });

  it('every ladder label, and every two-rung tie, fits that line in every league', () => {
    for (const league of leagues.LEAGUES) {
      const rungs = league.postseason.ladder;
      for (const division of league.divisions) {
        const mine = rungs.filter((r) => r.divisions === '*' || r.divisions.includes(division.id));
        for (const lead of Object.values(POSTSEASON_LEAD).map((l) => l.short)) {
          for (const r of mine) {
            // The card shows a long "<who>: <what>" label by its short form (home-types.ts rungCardText).
            const line = `${lead} ${rungCardText(r.label, r.badge)}`;
            expect(at14(line), `${HV}: ${division.id} "${line}"`).toBeLessThanOrEqual(CARD_TEXT_PX);
          }
          for (let i = 0; i + 1 < mine.length; i++) {
            const line = `${lead} ${mine[i].badge} or ${mine[i + 1].badge} (tied)`;
            expect(at14(line), `${HV}: ${division.id} "${line}"`).toBeLessThanOrEqual(CARD_TEXT_PX);
          }
        }
      }
    }
  });
});


/**
 * The team view after the SCVAL play-in (plan final-10, 2026-10-30): the committed 2026-10-29 snapshot
 * (data/snapshot.json, SCVAL league play over: Los Altos is De Anza #4, Santa Clara El Camino #4) with Los Altos 2-1
 * Santa Clara played Fri Oct 30, stamped Sat Oct 31. The outcome label replaces the 'Final place:' lead, as an MCAL
 * tournament outcome does, and fits one 288px line. A fresh module instance; the corpus views above are
 * already built.
 */
describe('the team view after the SCVAL play-in (home-view.ts ← lib/postseason/postseason-outcomes.ts)', () => {

  let views: ReturnType<TeamCard['buildTeamViews']>;
  const prior = process.env.SCVAL_SNAPSHOT;

  beforeAll(async () => {
    const base = loadSnapshot(
      JSON.parse(readFileSync(path.join(import.meta.dirname, '..', '..', 'data', 'snapshot.json'), 'utf8')) as unknown,
    );
    const crossover = { kind: 'scval-crossover', leagueId: 'scval', via: 'config-pairing' } as const;
    const playIn = game({
      home: 'los-altos', away: 'santa-clara', hs: 2, as: 1, date: '2026-10-30', league: false, postseason: crossover, official: null,
    });
    // Every crossover and play-in the snapshot carries goes, not only this pair's: the daily refresh runs this file
    // against the snapshot it has just fetched, and a result posted since (the other crossovers, the BVAL play-in)
    // must not reach the cards these cases read.
    const games = [
      ...base.games.filter((g) => g.postseason?.kind !== 'scval-crossover' && g.postseason?.kind !== 'bval-play-in'),
      playIn,
    ];
    const next = withGames(base, games, { fetchedAt: '2026-10-31T19:00:00.000Z' });
    process.env.SCVAL_SNAPSHOT = writeTempSnapshot(next, 'home-play-in');
    vi.resetModules();
    const fresh = (await import('../../components/home/team-card')) as TeamCard;
    views = fresh.buildTeamViews();
  }, 600_000);

  afterAll(() => {
    if (prior === undefined) delete process.env.SCVAL_SNAPSHOT;
    else process.env.SCVAL_SNAPSHOT = prior;
  });

  it('Los Altos reads "Won the play-in", Santa Clara "Lost the play-in", with no "Final place:" lead', () => {

    const view = (slug: string) => views.find((v) => v.slug === slug)!;
    expect(view('los-altos').postseason, `${HV}: los-altos`).toBe('Won the play-in');
    expect(postseasonCardLine(view('los-altos')), `${HV}: los-altos card line`).toBe('Won the play-in');
    expect(view('los-altos').postseasonShort, `${HV}: los-altos short`).toBeUndefined();
    expect(view('santa-clara').postseason, `${HV}: santa-clara`).toBe('Lost the play-in');
    // A team with no final pairing keeps its ladder rung behind the lead.
    expect(view('cupertino').postseason, `${HV}: cupertino`).toMatch(/^Final place: /);
    for (const slug of ['los-altos', 'santa-clara']) {
      const card = postseasonCardLine(view(slug))!;
      expect((width(card) * 14) / 12, `${HV}: ${slug} "${card}" fits 288px`).toBeLessThanOrEqual(288);
      expect(card).not.toMatch(/eliminat/i);
    }
  });
});

/**
 * The "This week in the postseason" view model (home-view.ts `thisWeek`, plan final-11, 2026-10-30): built from
 * the committed snapshot with every postseason-tagged game replaced by synthetic ones from the shared builder (so
 * a data refresh cannot move the assertions), stamped Thu Oct 29 at noon Pacific, the day the 2026 week looked like
 * this. Config supplies the events (the BVAL play-in Sat Oct 31, the EAL's Super Regional, the CCS and San Diego
 * seeding meetings and the San Diego round calendar). `/` no longer prints the strip (DESIGN §33: that week's games
 * are the day view's own groups); /playoffs prints the same view at 12 rows. A fresh module instance; the corpus
 * views above are already built.
 */
describe('the home "This week in the postseason" view (home-view.ts <- playoffs/this-week-inputs.ts)', () => {

  let week: ReturnType<HomeView['buildHomeView']>['thisWeek'];
  let html = '';
  const prior = process.env.SCVAL_SNAPSHOT;

  const at = (date: string, time: string, g: ReturnType<typeof game>) => ({ ...g, dateLocal: `${date}T${time}:00` });
  const crossover = { kind: 'scval-crossover', leagueId: 'scval', via: 'config-pairing' } as const;
  const mcal = { kind: 'mcal-tournament', leagueId: 'mcal', via: 'league-postseason-window' } as const;
  const toc = { kind: 'outside-tournament', leagueId: null, via: 'outside-tournament-window' } as const;
  const post = (home: string, away: string, date: string, time: string, tag: typeof crossover | typeof mcal | typeof toc, score?: [number, number]) =>
    at(date, time, game({ home, away, date, league: false, postseason: tag, official: null, ...(score ? { as: score[0], hs: score[1] } : {}) }));

  beforeAll(async () => {
    const base = loadSnapshot(
      JSON.parse(readFileSync(path.join(import.meta.dirname, '..', '..', 'data', 'snapshot.json'), 'utf8')) as unknown,
    );
    const games = [
      ...base.games.filter((g) => g.postseason === null),
      post('tamalpais', 'marin-catholic', '2026-10-28', '16:00', mcal, [1, 3]),
      post('mitty', 'st-ignatius', '2026-10-29', '16:00', crossover),
      post('valley-christian', 'palo-alto', '2026-10-29', '18:00', crossover),
      post('los-gatos', 'saint-francis', '2026-10-30', '15:30', crossover),
      post('los-altos', 'santa-clara', '2026-10-30', '16:00', crossover),
      post('tamalpais', 'redwood', '2026-10-30', '16:00', mcal),
      post('huntington-beach', 'harvard-westlake', '2026-10-29', '18:00', toc),
    ];
    const next = withGames(base, games, { fetchedAt: '2026-10-29T19:00:00.000Z' });
    process.env.SCVAL_SNAPSHOT = writeTempSnapshot(next, 'home-week');
    vi.resetModules();
    const fresh = (await import('../../components/home/home-view')) as HomeView;
    week = fresh.buildHomeView().thisWeek;
    const { default: HomePage } = await import('../../app/page');
    html = renderToStaticMarkup(createElement(HomePage));
  }, 600_000);

  afterAll(() => {
    if (prior === undefined) delete process.env.SCVAL_SNAPSHOT;
    else process.env.SCVAL_SNAPSHOT = prior;
  });

  const rows = (region: 'norcal' | 'socal') => week[region].days.flatMap((d) => d.rows);

  it('holds the cap of 8 rows a region, but shows a ninth rather than say "+1 more"', () => {
    // Nine rows from Wed Oct 28 to Mon Nov 2 (the semifinal result, five games, the EAL's Super Regional, the BVAL
    // play-in and the CCS seeding meeting): one over the cap, so all nine are shown (2026-11-03), the result too.
    expect(rows('norcal').length, `${HV}: thisWeek.norcal rows`).toBe(9);
    expect(week.norcal.more, `${HV}: thisWeek.norcal more`).toBe(0);
    expect(week.norcal.days[0].dateLabel, `${HV}: first day`).toBe('Wed Oct 28');
    expect(rows('norcal').map((r) => r.text), `${HV}: NorCal texts`).toContain('Tamalpais 3, Marin Catholic 1, final.');
    expect(week.socal.more, `${HV}: thisWeek.socal more`).toBeGreaterThanOrEqual(0);
    expect(rows('socal').length, `${HV}: thisWeek.socal rows`).toBeLessThanOrEqual(8);
  });

  it('keeps each region to its own sides: the Tournament of Champions game is SoCal, the crossovers NorCal', () => {
    const north = rows('norcal').map((r) => r.text).join(' | ');
    const south = rows('socal').map((r) => r.text).join(' | ');
    expect(north, `${HV}: NorCal`).toContain('St. Ignatius at Mitty');
    expect(north, `${HV}: NorCal`).toContain('Redwood at Tamalpais');
    expect(north, `${HV}: NorCal has no SoCal game`).not.toMatch(/Huntington Beach|Harvard-Westlake/);
    expect(south, `${HV}: SoCal`).toContain('Harvard-Westlake at Huntington Beach');
    expect(south, `${HV}: SoCal has no NorCal game`).not.toMatch(/Mitty|Tamalpais/);
  });

  it('`/` prints no strip in a postseason week either: one page, one way of grouping', () => {
    expect(html, 'app/page.tsx').not.toMatch(/id="this-week|This week in the postseason/);
    expect(html.split('<h1').length - 1, 'app/page.tsx: one h1').toBe(1);
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i), 'app/page.tsx: duplicate ids').toEqual([]);
  });

  it('writes whole sentences, no seed word and no "eliminat"', () => {
    // Everything the view says (row texts, their labels, the day labels), as the strip printed it.
    const north = stringsOf(week.norcal).join(' | ');
    const south = stringsOf(week.socal).join(' | ');
    expect(north, HV).toContain('St. Ignatius at Mitty');
    expect(week.norcal.more, `${HV}: one row over the cap is shown`).toBe(0);
    for (const text of [north, south]) {
      expect(text).not.toMatch(SEED_CLAIM);
      expect(text).not.toMatch(/eliminat/i);
    }
    expect(south, `${HV}: SoCal rows have no CCS word`).not.toMatch(/\bCCS\b/);
    expect(south).toContain('Tournament of Champions');
  });


  it('is the same view /playoffs prints, at 8 rows instead of 12', async () => {
    const { thisWeekByRegion } = await import('../../components/playoffs/this-week-inputs');
    const { getGames, getToday } = await import('../../lib/data');
    const twelve = thisWeekByRegion({ games: getGames(), today: getToday() });
    expect(twelve.norcal.days.flatMap((d) => d.rows).length, 'components/playoffs/this-week-inputs.ts').toBe(9);
    expect(twelve.norcal.more).toBe(0);
    expect(twelve.norcal.from).toBe(week.norcal.from);
    expect(twelve.norcal.to).toBe(week.norcal.to);
  });
});
