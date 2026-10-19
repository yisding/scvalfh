/**
 * The home page (views/home/home-view.ts; SPEC §10.1, §8.2): the first-visit cards and the rendered page, on the
 * offline corpus snapshot so league-specific values never move with a live fetch (SPEC §13.6; the fixture is
 * tests/support/home-view.ts). Every assertion names the module that produced the value (the repair policy routes on
 * it).
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { m, data, pageHtml, HV } from '@/tests/support/home-view';
import { textOf } from '@/tests/support/html-text';

describe('first visit (components/home/FindYourTeam.tsx, LeagueCard.tsx)', () => {
  it('has a card per league with its facts and both ways on', async () => {
    const { LeagueCard } = await import('@/components/home/LeagueCard');
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
      cities: m.leagues.getLeague('metro').cities,
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
      expect(textOf(html), `components/home/LeagueCard.tsx: ${card.id}`).toContain(`Show ${m.labels.standaloneName(card.id)} here`);
      expect(html, `components/home/LeagueCard.tsx: ${card.id} link`).toContain(`href="/standings/${card.id}"`);
      expect(textOf(html), `components/home/LeagueCard.tsx: ${card.id} link words`).toContain(m.labels.standingsLabel(card.id));
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
