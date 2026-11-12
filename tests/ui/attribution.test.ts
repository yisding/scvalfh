/**
 * The footer (components/layout/Attribution.tsx) on every page, and the long-form prose it used to
 * hold (components/layout/site-prose.tsx), which /about carries (DESIGN §33; SPEC §6).
 *
 * Saying where the numbers come from on every page is not negotiable: the footer's short line names
 * both sources and says the site is unofficial. The long forms — every source and league rules
 * link, the scope note, the full not-affiliated line, the text docs/DATA-SOURCES.md §6 quotes — are
 * the three prose components, and this suite still pins their words. A league that publishes no
 * rules is "we found no published league rules" (what we found, not a claim that none exist:
 * review 2026-10-06).
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import Attribution from '../../components/layout/Attribution';
import { DisclaimerProse, ScopeProse, SourcesProse } from '../../components/layout/site-prose';
import { DATA_CORRECTIONS_URL, SITE_SCOPE_NOTE } from '../../components/layout/site';
import { TOP_LINKS } from '../../components/layout/TopNav';
import { getFetchedAt } from '../../lib/data';
import { formatStamp } from '../../lib/format';
import { textOf } from './html-text';

const clean = (html: string) =>
  textOf(html)
    // ExternalLink's sr-only "(opens in a new tab)" is not part of the sentence a sighted reader sees.
    .replace(/ \(opens in a new tab\)/g, '')
    .replace(/\s+/g, ' ')
    .replace(/ ([.,;:])/g, '$1')
    .trim();

describe('the footer', () => {
  const html = renderToStaticMarkup(createElement(Attribution, { snapshotAt: getFetchedAt() }));
  const text = clean(html);

  it('is a <footer> band, hidden in print', () => {
    expect(html).toMatch(/^<footer class="sx-foot sx-print-hide"><div class="sx-foot-inner">/);
  });

  it('says where the scores come from and that the site is unofficial, on every page', () => {
    expect(text).toContain(
      'Scores come from MaxPreps and SI.com. This is an unofficial site, not affiliated with any school, league or CIF section.',
    );
  });

  it('carries the long stamp, linked to how updates work, and the time zone', () => {
    expect(text).toContain(`Updated ${formatStamp(getFetchedAt())}. All times Pacific.`);
    expect(html).toMatch(
      new RegExp(`<span class="sx-stamp"><a href="/about#updates">Updated <time dateTime="${getFetchedAt().replace(/[.+]/g, '\\$&')}">`),
    );
  });

  it('indexes the site in the header’s own words, then History, About and the corrections thread', () => {
    const index = /<ul class="sx-foot-index" id="site-index">([\s\S]*?)<\/ul>/.exec(html);
    expect(index, 'the site index').not.toBeNull();
    const links = [...index![1].matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => ({
      href: m[1],
      label: clean(m[2]),
    }));
    expect(links).toEqual([
      ...TOP_LINKS.map((l) => ({ href: l.href, label: l.label })),
      { href: '/history/2025-26', label: 'History' },
      { href: '/about', label: 'About' },
      { href: DATA_CORRECTIONS_URL, label: 'Report an error' },
    ]);
  });

  it('holds the two preferences as plain text buttons: no switch, no pressed state', () => {
    const prefs = /<div class="sx-foot-prefs">([\s\S]*?)<\/div>/.exec(html);
    expect(prefs, 'the preferences row').not.toBeNull();
    expect(prefs![1].match(/<button\b/g)).toHaveLength(2);
    expect(prefs![1].match(/data-theme-toggle/g)).toHaveLength(1);
    expect(prefs![1].match(/data-region-option/g)).toHaveLength(1);
    expect(html).not.toContain('sx-seg');
    expect(html).not.toContain('sx-opt');
    expect(html).not.toContain('role="group"');
    expect(html).not.toContain('aria-pressed');
    for (const button of prefs![1].match(/<button\b[^>]*>/g)!) expect(button).toContain('sx-textbtn');
  });

  it('no longer holds the long prose (it is on /about)', () => {
    expect(text).not.toContain('League alignment and rules from');
    expect(text).not.toContain(SITE_SCOPE_NOTE);
  });
});

describe('the long-form prose /about carries (site-prose.tsx)', () => {
  const sources = renderToStaticMarkup(createElement(SourcesProse, {}));
  const disclaimerHtml = renderToStaticMarkup(createElement(DisclaimerProse, {}));

  it('names both data sources and the cross-check, each linked', () => {
    const text = clean(sources);
    expect(text).toContain('Data from MaxPreps and High School on SI (si.com); scores cross-checked against cifsshome.org.');
    expect(sources.match(/<a\b/g)!.length).toBeGreaterThanOrEqual(3);
  });

  it('names the rules source of every league, and says what we did not find', () => {
    const text = clean(sources);
    expect(text).toContain(
      'League alignment and rules from SCVAL, BVAL, PCAL and MCAL; EAL rules from the CIF Northern Section; ' +
        'Sunset: we found no published league rules; Southern Section rules from the CIF Southern Section; ' +
        'City, North and Metro: we found no published league rules; San Diego Section rules from the CIF San Diego Section.',
    );
    expect(text).not.toContain('no league rules are published');
  });

  it('names every league and section in the disclaimer, each CIF code unbreakable at its plain hyphen', () => {
    expect(clean(disclaimerHtml)).toContain(
      'This is an unofficial site, not affiliated with SCVAL, BVAL, PCAL, MCAL, EAL, Sunset, City, North, Metro, ' +
        'CIF-CCS, CIF-NCS, CIF-NS, CIF-SS, CIF-SDS, MaxPreps or SI.',
    );
    for (const code of ['CIF-CCS', 'CIF-NCS', 'CIF-NS', 'CIF-SS', 'CIF-SDS']) {
      expect(disclaimerHtml).toContain(`<span class="whitespace-nowrap">${code}</span>`);
    }
  });

  it('says records are computed and may differ from official standings', () => {
    expect(clean(disclaimerHtml)).toContain(
      'Records are computed from published game results and may differ from official standings.',
    );
  });

  it('carries the scope note', () => {
    expect(clean(renderToStaticMarkup(createElement(ScopeProse, {})))).toBe(SITE_SCOPE_NOTE);
  });
});
