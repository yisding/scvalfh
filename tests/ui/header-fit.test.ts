/**
 * The header row fits, for every sport a build can cover (DESIGN §33).
 *
 * The refresh started because the freshness stamp was cut off in the header at 1280. The header now
 * holds three things that never shrink (the wordmark, six nav links, the team search), so whether
 * it fits is arithmetic, and this suite does it at the three widths where the row is tightest:
 *
 *   320   wordmark + the magnifier link                      inside 288px (16px gutters)
 *   768   wordmark + nav (10px link padding) + magnifier     inside 720px (24px gutters)
 *   1024  wordmark + nav (12px link padding) + search field  inside 976px (24px gutters)
 *
 * Every number the sums use is either a measured text width in the tables below or a length read
 * from the header's own rules in app/globals.css, so a CSS edit moves the sum.
 *
 * The widths were measured ONCE in Chromium (2026-11-12) against the faces the site ships, on the
 * running site: "NorCal HS" in Barlow Semi Condensed 700 at 22px and 24px; the sport label in
 * Public Sans 500 at 14px and 15px WITH its leading space (the wordmark is `white-space: pre`);
 * the nav labels in Public Sans 700 at 15px (the weight the label reserves, `.sx-weight-hold`).
 * Nothing is measured at test time. A sport or a nav label with no measured width FAILS here, so
 * adding either means measuring it.
 *
 * In the browser the basketball header (the widest wordmark) has 30.2px to spare at 768, 78.2px at
 * 1024 and 56.4px at 320.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { WORDMARK_SHORT, WORDMARK_TAIL } from '../../components/layout/site';
import { TOP_LINKS } from '../../components/layout/TopNav';
import { BASKETBALL_BOYS_2026 } from '../../lib/sports/basketball';
import { SPORT_ID, SPORT_IDS, type SportId } from '../../lib/sports/current';
import { FIELD_HOCKEY_GIRLS_2026 } from '../../lib/sports/field-hockey';
import { SOCCER_GIRLS_2026 } from '../../lib/sports/soccer';

import { REPO } from '../helpers';

const CSS = readFileSync(path.join(REPO, 'app', 'globals.css'), 'utf8');

/** "NorCal HS", Barlow Semi Condensed 700: [22px (below 768), 24px (from 768)]. */
const SHORT_PX: Readonly<Record<string, readonly [number, number]>> = {
  'NorCal HS': [87.34, 95.28],
};

/** The sport label with its leading space, Public Sans 500: [14px (below 768), 15px (from 768)]. */
const TAIL_PX: Readonly<Record<string, readonly [number, number]>> = {
  'Field Hockey': [88.08, 94.38],
  'Girls Soccer': [83.53, 89.5],
  'Boys Basketball': [108.25, 115.98],
};

/** Nav labels, Public Sans 700 at 15px. */
const LABEL_PX: Readonly<Record<string, number>> = {
  Scores: 49.81,
  Standings: 73.06,
  Playoffs: 59.13,
  Teams: 46.47,
  Leaders: 57.47,
  JV: 16.59,
};

const SEASONS = {
  'field-hockey': FIELD_HOCKEY_GIRLS_2026,
  soccer: SOCCER_GIRLS_2026,
  basketball: BASKETBALL_BOYS_2026,
} satisfies Record<SportId, unknown>;

/** The wordmark's sport label, as components/layout/site.ts builds it (PROGRAM_TITLE). */
function tailOf(id: SportId): string {
  const season = SEASONS[id];
  if (id === 'field-hockey') return season.sport.name;
  const gender = `${season.gender.charAt(0).toUpperCase()}${season.gender.slice(1)}`;
  return `${gender} ${season.sport.name}`;
}

/** A length in px from a rule body: `1.25rem` → 20. */
function px(body: string, property: string): number {
  const m = new RegExp(`(?:^|[;{\\s])${property}:\\s*(-?[\\d.]+)(rem|px)`).exec(body);
  if (!m) throw new Error(`globals.css: no ${property} in "${body.trim().slice(0, 80)}"`);
  return Number(m[1]) * (m[2] === 'rem' ? 16 : 1);
}

/** The body of the first rule for `selector` at the top level of the base layer (not in a media block). */
function base(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`^  ${escaped} \\{([^}]*)\\}`, 'm').exec(CSS);
  if (!m) throw new Error(`globals.css: no base rule for ${selector}`);
  return m[1];
}

/** The body of the rule for `selector` inside the header's `@media (min-width: <rem>)` block. */
function from(minRem: number, selector: string): string {
  const start = CSS.indexOf('.sx-mast-find {');
  const at = CSS.indexOf(`@media (min-width: ${minRem}rem) {`, start);
  if (start < 0 || at < 0) throw new Error(`globals.css: no header media block at ${minRem}rem`);
  const end = CSS.indexOf('\n  }', at);
  const blockText = CSS.slice(at, end < 0 ? at + 400 : end + 4);
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`${escaped} \\{([^}]*)\\}`).exec(blockText);
  if (!m) throw new Error(`globals.css: no ${selector} rule at ${minRem}rem`);
  return m[1];
}

const GUTTER = { phone: px(base('.sx-mast-row'), 'padding-inline'), wide: px(from(48, '.sx-mast-row'), 'padding-inline') };
const TAIL_MARGIN = px(base('.sx-wordmark-tail'), 'margin-left');
const NAV_MARGIN = { at768: px(base('.sx-mast-nav'), 'margin-left'), at1024: px(from(64, '.sx-mast-nav'), 'margin-left') };
const LINK_PAD = { at768: px(base('.sx-navtop'), 'padding-inline'), at1024: px(from(64, '.sx-navtop'), 'padding-inline') };
const FIND = px(base('.sx-mast-find'), 'width') + px(base('.sx-mast-find'), 'margin-right');
const FIELD = px(base('.sx-mast-search > input'), 'width');

function wordmark(id: SportId, wide: boolean): number {
  const short = SHORT_PX[WORDMARK_SHORT];
  const tail = TAIL_PX[tailOf(id)];
  if (!short) throw new Error(`header-fit: "${WORDMARK_SHORT}" has no measured width`);
  if (!tail) throw new Error(`header-fit: the ${id} label "${tailOf(id)}" has no measured width`);
  const i = wide ? 1 : 0;
  return short[i] + TAIL_MARGIN + tail[i];
}

function labels(): number {
  return TOP_LINKS.reduce((total, link) => {
    const w = LABEL_PX[link.label];
    if (w === undefined) throw new Error(`header-fit: the nav label "${link.label}" has no measured width`);
    return total + w;
  }, 0);
}

describe('the lengths the sums use are the header rules’ own', () => {
  it('reads the gutters, margins, paddings and the two search faces from globals.css', () => {
    expect(GUTTER).toEqual({ phone: 16, wide: 24 });
    expect(TAIL_MARGIN).toBe(4);
    expect(NAV_MARGIN).toEqual({ at768: 20, at1024: 28 });
    expect(LINK_PAD).toEqual({ at768: 10, at1024: 12 });
    // A 44px link whose glyph overhangs 12px into the gutter: 32px of the row.
    expect(px(base('.sx-mast-find'), 'width')).toBe(44);
    expect(FIND).toBe(32);
    expect(FIELD).toBe(208);
  });

  it('sets the wordmark and the labels at the sizes that were measured', () => {
    expect(base('.sx-wordmark')).toMatch(/font-size:\s*1\.375rem/);
    expect(base('.sx-wordmark')).toMatch(/font-weight:\s*700/);
    expect(base('.sx-wordmark')).toMatch(/font-family:\s*var\(--font-num\)/);
    expect(from(48, '.sx-wordmark')).toMatch(/font-size:\s*1\.5rem/);
    expect(base('.sx-wordmark-tail')).toMatch(/font-size:\s*0\.875rem/);
    expect(base('.sx-wordmark-tail')).toMatch(/font-weight:\s*500/);
    expect(from(48, '.sx-wordmark-tail')).toMatch(/font-size:\s*0\.9375rem/);
    expect(base('.sx-navtop')).toMatch(/font-size:\s*0\.9375rem/);
    // Nothing in the row may shrink or wrap: that is what makes the sum the whole story.
    expect(base('.sx-wordmark')).toMatch(/flex:\s*none/);
    expect(base('.sx-wordmark')).toMatch(/white-space:\s*pre/);
    expect(base('.sx-mast-end')).toMatch(/flex:\s*none/);
    expect(base('.sx-navtop')).toMatch(/white-space:\s*nowrap/);
  });

  it('shows the nav from 768, and swaps the magnifier for the field at 1024', () => {
    expect(base('.sx-mast-nav')).toMatch(/display:\s*none/);
    expect(from(48, '.sx-mast-nav')).toMatch(/display:\s*block/);
    expect(base('.sx-mast-search')).toMatch(/display:\s*none/);
    expect(from(64, '.sx-mast-search')).toMatch(/display:\s*block/);
    expect(from(64, '.sx-mast-find')).toMatch(/display:\s*none/);
  });
});

describe('the measured tables cover what the header prints', () => {
  it('has six nav links, each with a measured width', () => {
    expect(TOP_LINKS).toHaveLength(6);
    for (const link of TOP_LINKS) expect(LABEL_PX[link.label], link.label).toBeGreaterThan(0);
    // And no stale rows: the table is exactly the nav.
    expect(Object.keys(LABEL_PX).sort()).toEqual(TOP_LINKS.map((l) => l.label).sort());
    expect(labels()).toBeCloseTo(302.5, 0);
  });

  it('has a measured wordmark for all three sports, and this build prints one of them', () => {
    expect(SPORT_IDS).toHaveLength(3);
    for (const id of SPORT_IDS) expect(TAIL_PX[tailOf(id)], `${id}: "${tailOf(id)}"`).toBeDefined();
    expect(SHORT_PX[WORDMARK_SHORT], WORDMARK_SHORT).toBeDefined();
    expect(WORDMARK_TAIL).toBe(tailOf(SPORT_ID));
    expect(wordmark('basketball', false)).toBeCloseTo(199.6, 1);
    expect(wordmark('basketball', true)).toBeCloseTo(215.3, 1);
    expect(wordmark('field-hockey', false)).toBeCloseTo(179.4, 1);
    expect(wordmark('field-hockey', true)).toBeCloseTo(193.7, 1);
  });
});

describe('the header row fits', () => {
  for (const id of SPORT_IDS) {
    it(`${id}: wordmark + magnifier fit a 320px phone`, () => {
      expect(wordmark(id, false) + FIND).toBeLessThanOrEqual(320 - 2 * GUTTER.phone);
    });

    it(`${id}: wordmark + six links + magnifier fit at 768`, () => {
      const sum = wordmark(id, true) + NAV_MARGIN.at768 + labels() + TOP_LINKS.length * 2 * LINK_PAD.at768 + FIND;
      expect(sum).toBeLessThanOrEqual(768 - 2 * GUTTER.wide);
    });

    it(`${id}: wordmark + six links + the search field fit at 1024`, () => {
      const sum = wordmark(id, true) + NAV_MARGIN.at1024 + labels() + TOP_LINKS.length * 2 * LINK_PAD.at1024 + FIELD;
      expect(sum).toBeLessThanOrEqual(1024 - 2 * GUTTER.wide);
    });
  }

  it('basketball, the widest, measures what the browser showed', () => {
    const at768 = wordmark('basketball', true) + NAV_MARGIN.at768 + labels() + TOP_LINKS.length * 2 * LINK_PAD.at768 + FIND;
    const at1024 = wordmark('basketball', true) + NAV_MARGIN.at1024 + labels() + TOP_LINKS.length * 2 * LINK_PAD.at1024 + FIELD;
    expect(at768).toBeCloseTo(689.8, 0);
    expect(at1024).toBeCloseTo(897.8, 0);
    expect(wordmark('basketball', false) + FIND).toBeCloseTo(231.6, 1);
  });
});
