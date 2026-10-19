/**
 * The home page's league panels (views/home/league-panel.ts, mini-standings.ts, other-leagues.ts, phase-lead.ts and
 * postseason-card.ts → components/home/LeaguePanel.tsx), on the offline corpus snapshot so league-specific values
 * never move with a live fetch (SPEC §13.6; the fixture is tests/support/home-view.ts). Every assertion names the
 * module that produced the value (the repair policy routes on it).
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { m, data, renderPanel, HV, PL } from '@/tests/support/home-view';
import { textOf } from '@/tests/support/html-text';

describe('home panels (views/home/home-view.ts → LeaguePanel)', () => {
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
    const config = m.leagues.getLeague('eal');
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
    const { MiniStandings } = await import('@/components/home/MiniStandings');
    const { miniShownCount } = await import('@/views/home/mini-standings');
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
        expect(division.home, `${HV}: ${division.id} home`).toEqual(m.leagues.getDivision(division.id).home);
        const html = renderToStaticMarkup(
          createElement(MiniStandings, { division }),
        );
        const want = expected[division.id];
        const rows = (html.match(/<tr data-team-slug=/g) ?? []).length;
        // `want.rows`, plus any team sharing the place at the cutoff.
        expect(rows, `components/home/MiniStandings.tsx: ${division.id} rows`).toBe(miniShownCount(division.rows, want.rows));
        expect(division.shown, `views/home/mini-standings.ts: ${division.id} shown`).toBe(rows);
        expect(rows, `components/home/MiniStandings.tsx: ${division.id} rows`).toBeGreaterThanOrEqual(Math.min(want.rows, division.total));
        if (want.line) expect(textOf(html), `components/home/MiniStandings.tsx: ${division.id} line`).toContain(want.line);
        // No line configured (the EAL: `lineAfter` null): no labelled separator row at all.
        if (!want.line) expect(division.home.lineLabel, `${HV}: ${division.id} no line label`).toBeNull();
        if (division.home.lineAfter === null) {
          expect(html, `components/home/MiniStandings.tsx: ${division.id} no line`).not.toContain('border-t-2');
        }
        expect(html, `components/home/MiniStandings.tsx: ${division.id} GP column`).toContain('>GP</th>');
        // The row link reads the record in words and counts points ("1 point", never "1 points").
        for (const row of division.rows.filter((r) => r.hasResults)) {
          expect(row.recordWords, `${HV}: ${row.slug} record words`).toMatch(/^\d+ wins?, \d+ loss(es)?, \d+ ties?$/);
        }
        expect(html, `components/home/MiniStandings.tsx: ${division.id} row label`).not.toMatch(/\b1 points\b|, \d+-\d+-\d+, /);
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
        `PTS: ${m.leagues.getLeague(panel.id).rules.citations.points}.`,
      );
      const html = renderPanel(panel.id);
      expect(html.split(panel.pointsLegend).length - 1, `components/home/LeaguePanel.tsx: ${panel.id} legend once`).toBe(
        1,
      );
    }
  });

  it('a place shared at the row cutoff is shown whole (Mt. Hamilton 4= pair), and nothing else stretches it', async () => {
    const { miniShownCount } = await import('@/views/home/mini-standings');
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
    const lead = (id: string, phase: Parameters<typeof m.phaseLead.phaseLead>[1], today: string) =>
      m.phaseLead.phaseLead(m.leagues.getLeague(id), phase, today);
    expect(lead('mcal', 'regular', '2026-10-02'), `${PL}: regular renders nothing`).toBeNull();
    // The independents (DESIGN §24.10): the lead names the first game between two of them, never "Independent
    // league play", and the body says the table counts only games between them.
    expect(lead('independents', 'regular', '2026-08-10'), `${PL}: independents before their first game`).toEqual({
      lead: 'The first game between two of the LA independents is Tue Sep 8.',
      body: 'No games have been played yet, so every record below is empty on purpose.',
      link: { href: '/schedule/independents', label: 'Full schedule' },
    });
    expect(lead('independents', 'regular', '2026-09-08'), `${PL}: independents in season`).toBeNull();
    // Before the first league date (config's, lib/config/leagues leaguePlayStarts), counting the
    // non-league finals played by that day only (lib/queries/games getNonLeagueFinalsPlayed).
    expect(lead('scval', 'regular', '2026-09-01'), `${PL}: SCVAL before league play`).toEqual({
      lead: 'SCVAL league play starts Wed Sep 9.',
      body: 'These tables count league games only, so the 15 non-league games played so far are on the schedule and in the overall records, not in the standings.',
      link: { href: '/schedule/scval', label: 'Full schedule' },
    });
    expect(lead('mcal', 'tournament', '2026-10-24'), `${PL}: MCAL tournament`).toEqual({
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
    expect(lead('pcal', 'complete', '2026-11-20')?.link, `${PL}: no last-season link: PCAL history is unavailable`).toBeNull();
    expect(lead('mcal', 'complete', '2026-11-20')?.link).toBeNull();
    expect(lead('scval', 'complete', '2026-11-20')?.link?.href).toBe('/history/2025-26#scval');
    expect(lead('bval', 'complete', '2026-11-20')?.link?.href).toBe('/history/2025-26#bval');
    // The EAL: no bracket, so the tournament phase says what is (and is not) published, and the
    // CCS-ladder 'playoffs' copy never reaches it.
    expect(lead('eal', 'tournament', '2026-10-30'), `${PL}: EAL tournament`).toEqual({
      lead: 'The Super Regional is Oct 30–31; its format and site are not published yet.',
      body: '',
      link: { href: '/playoffs#eal', label: 'Postseason' },
    });
    expect(lead('eal', 'playoffs', '2026-11-03'), `${PL}: EAL never gets the CCS copy`).toBeNull();
    expect(lead('eal', 'complete', '2026-11-20')?.link, `${PL}: no last-season link: EAL history is unavailable`).toBeNull();
    // The San Diego leagues: the Section's playoffs, dates from config, no bracket and no "top N".
    expect(lead('city', 'tournament', '2026-11-03'), `${PL}: City in the Section playoffs`).toEqual({
      lead: 'City league play is over.',
      body: 'The San Diego Section playoffs are Nov 2–14; the Section publishes its brackets after its Sat Oct 31 seeding meeting.',
      link: { href: '/playoffs#city', label: 'Postseason' },
    });
    expect(lead('metro', 'playoffs', '2026-11-03'), `${PL}: SDS never gets the CCS copy`).toBeNull();
    // A 'site' league's final table is this site's, never "the final league standings".
    expect(lead('sunset', 'complete', '2026-11-20')?.body).toBe('The tables below are this site’s final tables, ordered by its own points.');
    expect(lead('sunset', 'complete', '2026-11-20')?.link, `${PL}: no Sunset history`).toBeNull();
    expect(lead('scval', 'complete', '2026-11-20')?.body).toBe('The tables below are the final league standings.');
  });

  it('the Southern California postseason cards read their config, never "the top N qualify"', () => {
    const sunset = data.panels.find((p) => p.id === 'sunset')!;
    const sunsetPs = m.leagues.getLeague('sunset').postseason;
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
      const ps = m.leagues.getLeague(id).postseason;
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
