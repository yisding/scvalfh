/**
 * views/playoffs/playoffs-view.ts and app/playoffs/page.tsx (SPEC §6.1, §10.7): the rendered /playoffs page, whole
 * and by region.  League-specific values are asserted on the all-2026-10-02 CORPUS snapshot (SPEC §13.6), loaded
 * through useCorpusModules (tests/support/playoffs-view.ts), so live fetch #2 cannot break them. On that snapshot De
 * Anza's 3rd place is shared (Los Altos, Valley Christian), El Camino's 4th straddles the play-in and at-large
 * places, Santa Teresa's champions are level (Prospect, Westmont) and Mt. Hamilton's 4th is shared: every by-law
 * consequence of an uncomputable tiebreak shows up at once. Every assertion message names the module that produced
 * the value.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { beforeAll, describe, expect, it } from 'vitest';

import { textOf } from '@/tests/support/html-text';
import { PAGE, m } from '@/tests/support/playoffs-view';

let html = '';

beforeAll(() => {
  html = renderToStaticMarkup(m.page.default() as ReactElement);
});

describe('/playoffs (rendered)', () => {
  it('has the league anchors, key dates and bracket anchors, each id once', () => {
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    for (const id of [
      'scval', 'bval', 'pcal', 'eal', 'key-dates', 'bracket', 'de-anza', 'el-camino', 'mt-hamilton', 'santa-teresa',
      'norcal', 'socal', 'sunset', 'city', 'north-county', 'metro',
    ]) {
      expect(ids.filter((x) => x === id), `${PAGE}: #${id}`).toHaveLength(1);
    }
    expect(new Set(ids).size, `${PAGE}: unique ids`).toBe(ids.length);
  });

  it('carries the NCS pointer card, the field and the verbatim at-large paragraph', () => {
    const text = textOf(html);
    expect(text, PAGE).toContain(
      'Following an MCAL team? The North Coast Section holds no field hockey championship. MCAL tournament →',
    );
    expect(html, PAGE).toContain('href="/playoffs/mcal"');
    expect(text, PAGE).toContain('Central Coast Section · 16 teams · SCVAL 7, BVAL 4, PCAL 2, 3 at-large');
    for (const line of ['SCVAL holds 7 of 16', 'BVAL holds 4 of 16', 'PCAL holds 2 of 16', '3 at-large berths, chosen by the CCS committee']) {
      expect(text, PAGE).toContain(line);
    }
    expect(text, PAGE).toContain(
      'Three at-large berths are the CCS committee’s call. SCVAL submits its play-in loser and both fifth-place teams (Article VII §2); PCAL teams placed 3rd or lower may apply (PCAL By-laws §23.4); BVAL’s by-laws do not say whom it submits.',
    );
    expect(text, PAGE).toContain('SCVAL crossover and 4th-place play-in');
    expect(text, PAGE).toContain('BVAL play-in');
    expect(text, PAGE).toContain('11 AM PT');
    expect(text, PAGE).toContain('(host)');
    expect(text, PAGE).toContain('Santa Teresa co-champions: BVAL By-Laws §6b-f decide who hosts.');
    expect(text, PAGE).toContain('AQ line');
    expect(text, PAGE).toContain('Play-in host');
  });

  it('carries the EAL card: the Super Regional note, its rule and the Guidelines, the #eal target once', () => {
    const text = textOf(html);
    expect(text, PAGE).toContain(
      'Following an EAL team? The Northern Section’s field hockey postseason is the Super Regional, Oct 30–31: the top six schools qualify. The coaches set its format and seeding, its site is to be announced, and no bracket is published yet. There is no NorCal or State path.',
    );
    expect(text, PAGE).toContain(
      'CIF Northern Section Field Hockey Guidelines 2026-28 §III.E.1 and §IV (the top six EAL/SRL schools compete; varsity only). Northern Section Field Hockey Guidelines (PDF)',
    );
    expect(html, PAGE).toContain(
      'href="https://www.cifns.org/guidelines-playoffs-Divisions-archives/26-28_Guidelines/Field_Hockey_Guidelines_26-28.pdf"',
    );
    // The chip and the jump link both land on the card, the one element with that id.
    expect([...html.matchAll(/\sid="eal"/g)], `${PAGE}: #eal`).toHaveLength(1);
    expect(html, PAGE).toContain('href="#eal"');
    expect(html, PAGE).not.toContain('href="/playoffs/eal"');
    // The card carries no CCS concept and no seed word.
    const card = /<div[^>]*\sid="eal"[^>]*>([\s\S]*?)<\/div>/.exec(html)?.[1] ?? '';
    expect(textOf(card), PAGE).not.toMatch(/\bCCS\b|at-large|automatic qualifier|\b(\d+(st|nd|rd|th)|No\. ?\d+|top|first|second) seed(ed)?\b/i);
  });

  it('never writes "eliminated" or "Gabilan", and never renders a missing record as 0-0-0', () => {
    expect(html, PAGE).not.toMatch(/eliminat/i);
    expect(html, PAGE).not.toContain('Gabilan');
    expect(textOf(html), PAGE).not.toContain('0-0-0');
  });
});

describe('/playoffs by region (DESIGN-socal §2.4)', () => {
  it('a neutral header, then the NorCal block (CCS, MCAL pointer, EAL card) and the SoCal block', () => {
    expect(html, PAGE).toMatch(/<h1[^>]*>Playoffs<\/h1>/);
    expect(html, PAGE).toContain('data-region-option="socal"');
    const norcal = html.indexOf('<div id="norcal" data-region-scope="norcal">');
    const socal = html.indexOf('<div id="socal" data-region-scope="socal">');
    expect(norcal, PAGE).toBeGreaterThan(0);
    expect(socal, PAGE).toBeGreaterThan(norcal);
    for (const id of ['scval', 'eal', 'bracket', 'at-large']) {
      const at = html.indexOf(`id="${id}"`);
      expect(at > norcal && at < socal, `${PAGE}: #${id} in the NorCal block`).toBe(true);
    }
    for (const id of ['sds-playoffs', 'city', 'north-county', 'metro', 'sunset', 'independents']) {
      expect(html.indexOf(`id="${id}"`), `${PAGE}: #${id} in the SoCal block`).toBeGreaterThan(socal);
    }
    // The CCS description moved into its block; the header names every league's postseason.
    expect(textOf(html), PAGE).toContain(
      'Where each league’s season leads: the CCS championships (SCVAL, BVAL and PCAL), the MCAL tournament, the EAL’s Super Regional, no playoffs for the Sunset or the LA independents and the San Diego Section playoffs (City, North and Metro).',
    );
  });

  it('the San Diego block states the Section’s rule from config and draws no bracket or seed', () => {
    const socal = html.slice(html.indexOf('<div id="socal" data-region-scope="socal">'));
    const text = textOf(socal);
    const city = m.leagues.getLeague('city').postseason;
    if (city.kind !== 'section-playoffs') throw new Error('city: section-playoffs');
    expect(text, PAGE).toContain(city.qualificationLine);
    expect(text, PAGE).toContain(city.citations.roundDates);
    expect(text, PAGE).toContain('The Section publishes its brackets after its Sat Oct 31 seeding meeting; until then this site draws no bracket and projects no places.');
    expect(socal, PAGE).toContain(`href="${city.powerRankingsUrl}"`);
    expect(text, PAGE).toContain(city.sourceLabel);
    // Each team's playoff division, per division, from config.
    expect(text, PAGE).toMatch(/City Western[\s\S]*Division I:/);
    expect(text, PAGE).toContain('Division II:');
    // The Sunset's card: its note and its source, labelled from config.
    const sunset = m.leagues.getLeague('sunset').postseason;
    if (sunset.kind !== 'no-postseason') throw new Error('sunset: no-postseason');
    expect(text, PAGE).toContain(sunset.note);
    expect(socal, PAGE).toContain(`href="${sunset.sourceUrl}"`);
    expect(text, PAGE).toContain(sunset.sourceLabel);
    // Copy rules for SoCal pages.
    expect(text, PAGE).not.toMatch(/at-large|automatic qualifier|lowest-seeded|\bseed(ed|s)?\b(?! ?ing meeting)|eliminat/i);
    for (const sentence of text.split(/(?<=[.!?])\s+/)) {
      if (/\bSunset League\b/.test(sentence)) expect(sentence).toContain('all-sports');
      expect(sentence).not.toMatch(/\bSunset (school|member)s?\b/);
    }
    expect(socal, PAGE).not.toMatch(/PlayoffBracket|sx-bracket/);
  });
});
