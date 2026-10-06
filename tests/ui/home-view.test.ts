/**
 * The home page's view models and rendered markup (SPEC §10.1, §8.2, §8.4), on the offline corpus
 * snapshot so league-specific values never move with a live fetch (SPEC §13.6).
 *
 * Every assertion names the module that produced the value (the repair policy routes on it).
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';

import { corpusSnapshotPath } from '../helpers';

import { POSTSEASON_LEAD, postseasonCardLine, rungCardText } from '../../components/home/home-types';

import { textOf } from './html-text';
import { width } from './text-metrics';

type HomeView = typeof import('../../components/home/home-view');

let home: HomeView;
let data: ReturnType<HomeView['buildHomeView']>;
let leagues: typeof import('../../lib/leagues');
let pageHtml = '';
const panelHtml = new Map<string, string>();
let renderPanel: (id: string) => string;

const HV = 'components/home/home-view.ts';

beforeAll(async () => {
  process.env.SCVAL_SNAPSHOT = corpusSnapshotPath('all-2026-10-02');
  home = await import('../../components/home/home-view');
  leagues = await import('../../lib/leagues');
  const { default: HomePage } = await import('../../app/page');
  const { LeaguePanel } = await import('../../components/home/LeaguePanel');
  data = home.buildHomeView();
  pageHtml = renderToStaticMarkup(createElement(HomePage));
  renderPanel = (id: string) => {
    const cached = panelHtml.get(id);
    if (cached) return cached;
    const panel = data.panels.find((p) => p.id === id);
    if (!panel) throw new Error(`${HV}: no panel for ${id}`);
    const html = renderToStaticMarkup(createElement(LeaguePanel, { panel }));
    panelHtml.set(id, html);
    return html;
  };
}, 600_000);

describe('home panels (components/home/home-view.ts → LeaguePanel)', () => {
  it('builds one panel per league, config order', () => {
    expect(data.panels.map((p) => p.id), `${HV}: panels`).toEqual([
      'scval', 'bval', 'pcal', 'mcal', 'eal', 'sunset', 'city', 'north-county', 'metro', 'independents',
    ]);
    // Each panel knows its region, from its section (DESIGN-socal §2.4): the page puts it in that block.
    expect(data.panels.map((p) => p.region), `${HV}: panel regions`).toEqual([
      'norcal', 'norcal', 'norcal', 'norcal', 'norcal', 'socal', 'socal', 'socal', 'socal', 'socal',
    ]);
    for (const p of data.panels) {
      const html = renderPanel(p.id);
      expect(html, `components/home/LeaguePanel.tsx: ${p.id} scope`).toContain(`data-scope="${p.id}"`);
      expect(html, `components/home/LeaguePanel.tsx: ${p.id} heading id`).toContain(`id="league-${p.id}"`);
      expect(textOf(html), `components/home/LeaguePanel.tsx: ${p.id} heading`).toContain(`${p.shortName} · ${p.name}`);
    }
  });

  it('the MCAL panel carries no CCS concept', () => {
    const text = textOf(renderPanel('mcal'));
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
    expect(renderPanel('mcal'), 'components/home/PostseasonCard.tsx: MCAL has no meter').not.toContain('sx-meter');
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
    const html = renderPanel('eal');
    const text = textOf(html);
    expect(text, 'components/home/PostseasonCard.tsx: EAL kicker').toContain('Postseason');
    expect(text, 'components/home/PostseasonCard.tsx: EAL line').toContain('Super Regional, Oct 30–31 — the top six qualify');
    expect(text, 'components/home/PostseasonCard.tsx: EAL link').toContain('Postseason →');
    expect(html, 'components/home/PostseasonCard.tsx: EAL link href').toContain('href="/playoffs#eal"');
    expect(html, 'components/home/PostseasonCard.tsx: EAL has no meter').not.toContain('sx-meter');
    expect(html, 'components/home/PostseasonCard.tsx: EAL has no bracket page').not.toContain('href="/playoffs/eal"');
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
      const html = renderPanel(id);
      expect(html, `components/home/PostseasonCard.tsx: ${id} CCS link`).toContain(`href="/playoffs#${id}"`);
      expect(textOf(html), `components/home/PostseasonCard.tsx: ${id} dates`).toContain('Quarterfinals');
    }
  });

  it('PCAL and MCAL mini tables carry no division label', () => {
    for (const id of ['pcal', 'mcal']) {
      const panel = data.panels.find((p) => p.id === id)!;
      expect(panel.divisions.map((d) => d.heading), `${HV}: ${id} division heading`).toEqual([null]);
      const text = textOf(renderPanel(id));
      expect(text, `components/home/MiniStandings.tsx: ${id} kicker`).toContain('League table');
      expect(text, `components/home/MiniStandings.tsx: ${id}`).not.toMatch(/\b(PCAL|MCAL) Division\b/);
      expect(text, `components/home/MiniStandings.tsx: ${id}`).not.toMatch(/Gabilan/i);
    }
    const bval = data.panels.find((p) => p.id === 'bval')!;
    expect(bval.divisions.map((d) => d.heading), `${HV}: BVAL division headings`).toEqual(['Mt. Hamilton', 'Santa Teresa']);
  });

  it('the division `home` config drives each mini table', async () => {
    const { MiniStandings, miniShownCount } = await import('../../components/home/MiniStandings');
    const expected: Record<string, { rows: number; line: string | null }> = {
      'de-anza': { rows: 4, line: null },
      'el-camino': { rows: 4, line: null },
      'mt-hamilton': { rows: 4, line: 'AQ line' },
      'santa-teresa': { rows: 3, line: 'Play-in host' },
      pcal: { rows: 7, line: 'AQ line' },
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
        const html = renderToStaticMarkup(
          createElement(MiniStandings, { division }),
        );
        const want = expected[division.id];
        const rows = (html.match(/<tr data-team-slug=/g) ?? []).length;
        // `want.rows`, plus any team sharing the place at the cutoff.
        expect(rows, `components/home/MiniStandings.tsx: ${division.id} rows`).toBe(miniShownCount(division.rows, want.rows));
        expect(rows, `components/home/MiniStandings.tsx: ${division.id} rows`).toBeGreaterThanOrEqual(Math.min(want.rows, division.total));
        if (want.line) expect(textOf(html), `components/home/MiniStandings.tsx: ${division.id} line`).toContain(want.line);
        // No line configured (the EAL: `lineAfter` null): no labelled separator row at all.
        if (!want.line) expect(division.home.lineLabel, `${HV}: ${division.id} no line label`).toBeNull();
        if (division.home.lineAfter === null) {
          expect(html, `components/home/MiniStandings.tsx: ${division.id} no line`).not.toContain('border-t-2');
        }
        expect(html, `components/home/MiniStandings.tsx: ${division.id} GP column`).toContain('>GP</th>');
        expect(division.href, `${HV}: ${division.id} href`).toBe(`/standings/${panel.id}#${division.id}`);
        // "Division" only for NorCal: San Diego's "Division I/II" are playoff tiers (review 2026-10-06).
        if (division.heading !== null) {
          expect(html, `components/home/MiniStandings.tsx: ${division.id} caption`).toContain(
            panel.region === 'socal' ? `${division.heading} league standings` : `${division.heading} Division league standings`,
          );
        }
        if (panel.region === 'socal') expect(html).not.toMatch(/ Division league standings/);
        // The scale is named only when some team has a goal difference: the floor of 1 is not a fact.
        const realMax = Math.max(0, ...division.rows.map((r) => Math.abs(r.gd)));
        expect(textOf(html).includes('biggest goal difference'), `components/home/MiniStandings.tsx: ${division.id} GD`).toBe(
          realMax > 0,
        );
      }
    }
    // The points legend: once per league, under its last table, citing the league's own rule (the
    // independents' table included, DESIGN §24.10).
    for (const panel of data.panels) {
      expect(panel.pointsLegend, `${HV}: ${panel.id} legend`).toBe(
        `PTS: ${leagues.getLeague(panel.id).rules.citations.points}.`,
      );
      const html = renderPanel(panel.id);
      expect(html.split(panel.pointsLegend).length - 1, `components/home/LeaguePanel.tsx: ${panel.id} legend once`).toBe(
        1,
      );
    }
  });

  it('a place shared at the row cutoff is shown whole (Mt. Hamilton 4= pair), and nothing else stretches it', async () => {
    const { miniShownCount } = await import('../../components/home/MiniStandings');
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
    const lead = (id: string, phase: Parameters<HomeView['phaseLead']>[1], today: string) =>
      home.phaseLead(leagues.getLeague(id), phase, today);
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
      'League play is over. The crossover games and the fourth-place play-in for SCVAL’s seventh automatic CCS berth are Fri Oct 30; the CCS seeding meeting is Mon Nov 2.',
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
      lead: 'The Super Regional is Oct 30–31; its format and site are not published yet.',
      body: '',
      link: { href: '/playoffs#eal', label: 'Postseason' },
    });
    expect(lead('eal', 'playoffs', '2026-11-03'), `${HV}: EAL never gets the CCS copy`).toBeNull();
    expect(lead('eal', 'complete', '2026-11-20')?.link, `${HV}: no last-season link: EAL history is unavailable`).toBeNull();
    // The San Diego leagues: the Section's playoffs, dates from config, no bracket and no "top N".
    expect(lead('city', 'tournament', '2026-11-03'), `${HV}: City in the Section playoffs`).toEqual({
      lead: 'City league play is over.',
      body: 'The San Diego Section playoffs are Nov 2–14; the Section publishes its brackets after its Sat Oct 31 seeding meeting.',
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
      note: null,
      link: { href: '/playoffs#sunset', label: 'Postseason' },
    });
    expect(sunset.afterSchedule).toEqual({ href: '/playoffs#sunset', label: 'Postseason' });
    for (const id of ['city', 'north-county', 'metro']) {
      const panel = data.panels.find((p) => p.id === id)!;
      const ps = leagues.getLeague(id).postseason;
      if (ps.kind !== 'section-playoffs') throw new Error(`${id}: section-playoffs`);
      expect(panel.postseason, `${HV}: ${id} postseason`).toEqual({
        kind: 'section-playoffs',
        leagueId: id,
        line: ps.qualificationLine,
        note: null,
        link: { href: `/playoffs#${id}`, label: 'San Diego Section playoffs' },
      });
      const text = textOf(renderPanel(id));
      expect(text, `components/home/PostseasonCard.tsx: ${id}`).toContain(ps.qualificationLine);
      expect(text, `components/home/PostseasonCard.tsx: ${id}`).not.toMatch(/top \w+ qualify|CCS|at-large|automatic qualifier/i);
    }
    const sunsetText = textOf(renderPanel('sunset'));
    expect(sunsetText).not.toMatch(/top \w+ qualify|CCS|at-large|bracket/i);
  });
});

describe('first visit (components/home/FindYourTeam.tsx, LeagueCard.tsx)', () => {
  it('has a card per league with its facts and both ways on', async () => {
    const { LeagueCard } = await import('../../components/home/LeagueCard');
    expect(data.leagueCards.map((c) => c.id), `${HV}: cards`).toEqual([
      'scval', 'bval', 'pcal', 'mcal', 'eal', 'sunset', 'city', 'north-county', 'metro', 'independents',
    ]);
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
    for (const card of data.leagueCards) {
      const html = renderToStaticMarkup(createElement(LeagueCard, { card }));
      // The button names the league by its standalone name: 'Show North County here', 'Show the independents here'.
      expect(textOf(html), `components/home/LeagueCard.tsx: ${card.id}`).toContain(`Show ${leagues.standaloneName(card.id)} here`);
      expect(html, `components/home/LeagueCard.tsx: ${card.id} link`).toContain(`href="/standings/${card.id}"`);
      expect(textOf(html), `components/home/LeagueCard.tsx: ${card.id} link words`).toContain(leagues.standingsLabel(card.id));
      expect(html, 'components/home/SetLeagueButton.tsx: js-only, disabled before hydration').toMatch(
        /<button[^>]*disabled=""[^>]*class="sx-js-only/,
      );
    }
  });

  it('the last card of a region’s odd count spans both columns (NorCal five: 2 + 2 + 1; SoCal five: 2 + 2 + 1)', () => {
    const cards = [...pageHtml.matchAll(/<li class="sx-card flex[^"]*"/g)].map((m) => m[0]);
    expect(cards, 'app/page.tsx: one card per league').toHaveLength(data.leagueCards.length);
    // Per region grid (DESIGN-socal §2.4): the col-span rule is each grid's own.
    const grids = [...pageHtml.matchAll(/<ul data-region-scope="(norcal|socal)"[^>]*>([\s\S]*?)<\/ul>/g)];
    expect(grids.map((g) => g[1]), 'app/page.tsx: one card grid per region').toEqual(['norcal', 'socal']);
    for (const [, region, body] of grids) {
      const mine = [...body.matchAll(/<li class="sx-card flex[^"]*"/g)].map((m) => m[0]);
      const count = data.regions.find((r) => r.id === region)!.leagueCards.length;
      expect(mine, `app/page.tsx: ${region} cards`).toHaveLength(count);
      mine.forEach((card, i) => {
        expect(card.includes('min-[390px]:col-span-2'), `app/page.tsx: ${region} card ${i + 1} spans`).toBe(
          count % 2 === 1 && i === count - 1,
        );
      });
    }
    expect(data.regions.map((r) => r.leagueCards.length), `${HV}: cards per region`).toEqual([5, 5]);
    // Each grid is preceded by an h3 naming its region, under the one "Find your team" h2.
    expect(pageHtml).toMatch(/<h3 data-region-scope="norcal"[^>]*>Northern California<\/h3><ul data-region-scope="norcal"/);
    expect(pageHtml).toMatch(/<h3 data-region-scope="socal"[^>]*>Southern California<\/h3><ul data-region-scope="socal"/);
  });
});

describe('the rendered home page (app/page.tsx)', () => {
  it('has one data-scope section per league, a first-visit block and the always-on chrome', () => {
    for (const id of ['scval', 'bval', 'pcal', 'mcal', 'eal', 'sunset', 'city', 'north-county', 'metro', 'independents']) {
      expect(pageHtml.split(`<section data-scope="${id}"`).length - 1, `app/page.tsx: ${id} panel`).toBe(1);
    }
    expect(pageHtml, 'components/home/FindYourTeam.tsx: first-visit block').toMatch(
      /<section data-scope="none" aria-labelledby="find-your-team"/,
    );
    expect(textOf(pageHtml)).toContain('Find your team');
    expect(pageHtml, 'app/page.tsx: My-team slot').toMatch(/<section data-scope="all" class="sx-myteam-slot[^"]*" aria-labelledby="my-team-heading"/);
    // One h1, always NorCal (owner decision, 2026-10-06): the brand stays NorCal, and with SoCal
    // selected the "Southern California" region heading below it says what is shown.
    expect(pageHtml.split('<h1').length - 1, 'app/page.tsx: one h1').toBe(1);
    expect(pageHtml, 'app/page.tsx: h1').toMatch(/<h1[^>]*>NorCal High School Field Hockey Teams/);
    expect(pageHtml, 'app/page.tsx: h1').not.toContain('California High School Field Hockey Teams');
    // The status line, one per region: its own latest day, its teams and its leagues.
    expect(textOf(pageHtml), 'app/page.tsx: status line').toMatch(
      /Results through \w{3} \w{3} \d{1,2} · 49 NorCal teams · SCVAL · BVAL · PCAL · MCAL · EAL/,
    );
    expect(textOf(pageHtml), 'app/page.tsx: SoCal status line').toMatch(/· 53 SoCal teams · Sunset · City · North · Metro · LA/);
    // ONE finder, outside every region block; the region control leads the scope row.
    expect(pageHtml.split('aria-labelledby="find-your-team"').length - 1).toBe(1);
    expect(pageHtml, 'app/page.tsx: region control').toMatch(/data-region-option="norcal"[\s\S]*data-league-option="all"/);
    // The panels sit in their region's block, in config order.
    const norcal = pageHtml.indexOf('<section data-scope="eal"');
    const socal = pageHtml.indexOf('<section data-scope="sunset"');
    expect(norcal).toBeGreaterThan(0);
    expect(socal).toBeGreaterThan(norcal);
    // One latest-results block per region (ids per the -socal rule).
    expect(pageHtml).toMatch(/<section data-scope="none" data-region-scope="norcal" aria-labelledby="latest-every-league"/);
    expect(pageHtml).toMatch(/<section data-scope="none" data-region-scope="socal" aria-labelledby="latest-every-league-socal"/);
  });

  it('keeps every id unique', () => {
    const ids = [...pageHtml.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes, 'app/page.tsx: duplicate ids').toEqual([]);
    for (const id of [
      'my-team-heading', 'find-your-team', 'league-scval', 'league-bval', 'league-pcal', 'league-mcal', 'league-eal',
      'league-sunset', 'league-city', 'league-north-county', 'league-metro', 'league-independents', 'latest-every-league', 'latest-every-league-socal',
    ]) {
      expect(ids, `app/page.tsx: #${id}`).toContain(id);
    }
  });

  it('never renders Gabilan, "eliminated", a league hue or a game link that skips gameHref', () => {
    const text = textOf(pageHtml);
    expect(text, 'app/page.tsx').not.toMatch(/Gabilan/i);
    expect(text, 'app/page.tsx').not.toMatch(/eliminated/i);
    expect(pageHtml, 'app/page.tsx: no league hue').not.toMatch(/--sx-league|league-hue|data-league-hue/);
    expect(pageHtml, 'app/page.tsx: sblive game links use gameHref').not.toMatch(/href="\/game\/sblive:/);
  });
});

describe('the pinned card (components/home/MyTeamCard.tsx ← home-view.ts team views)', () => {
  /** The card's identity: the search index entry its view joins to on `slug` (MyTeamCard.tsx). */
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

  it('has a view for all 102 teams with the meta, played and postseason lines', async () => {
    const { PinnedCard } = await import('../../components/home/MyTeamCard');
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
      // playoffs" note whatever it has played (lib/data getTeamPostseasonLine).
      const noPostseason = leagues.NO_POSTSEASON_LEAGUE_IDS.includes(leagues.getLeague(cardTeamLeague(v.slug)).id);
      if (!v.hasResults && !noPostseason) expect(v.postseason, `${HV}: ${v.slug} gp 0 has no postseason line`).toBeNull();
      const html = renderToStaticMarkup(createElement(PinnedCard, { view: v, team: cardTeam(v.slug), onUnpin: () => {} }));
      expect(html, `components/home/MyTeamCard.tsx: ${v.slug} unpin id`).toContain('id="my-team-unpin"');
      if (v.postseason) expect(textOf(html)).toContain(v.postseason);
      const card = postseasonCardLine(v);
      if (card) expect(textOf(html)).toContain(card);
      expect(card === null, `${HV}: ${v.slug} card line iff line`).toBe(v.postseason === null);
    }
  });

  it('"Last" is the newest PLAYED game: a score-pending one shows as unreported, never as a final', async () => {
    const d = await import('../../lib/data');
    const { describeGame } = await import('../../components/ui/describe-game');
    const { gameHref } = await import('../../lib/game-id');
    const { PinnedCard } = await import('../../components/home/MyTeamCard');
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
      const text = textOf(renderToStaticMarkup(createElement(PinnedCard, { view: v, team: cardTeam(v.slug), onUnpin: () => {} })));
      expect(text, `components/home/MyTeamCard.tsx: ${v.slug} unreported last`).toMatch(/score not reported/i);
      if (v.last.display.note) expect(text, `components/home/MyTeamCard.tsx: ${v.slug} note`).toContain(v.last.display.note);
    }
    // The corpus has at least one such team, so the unreported branch is never vacuous.
    expect(pending, `${HV}: a newest played game that is score-pending`).toBeGreaterThan(0);
  });

  // The card text is 288px wide at 320 (px-4 in a 320px card); the line is one truncated h-6 row,
  // so the STATUS must fit whole or the reader sees only the prefix. Widths: tests/ui/text-metrics.ts
  // (Geist 12px/500) scaled to the 14px meta size — an over-estimate for the 400 weight.
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
