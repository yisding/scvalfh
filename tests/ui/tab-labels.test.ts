/**
 * The phone bar's labels fit their cells (SPEC §8.3, DESIGN §33).
 *
 * The bar is four text tabs and a More cell: Scores, Standings, Playoffs, Teams, More. They are the
 * first four header links, in the header's order, so the two bars never disagree. A cell is NOT an
 * equal fifth of the bar: the list is a flex row whose items are as wide as their word plus an equal
 * share of the spare width, so the gaps between the five words are equal and "Standings" and
 * "Playoffs" cannot touch. What has to hold is the SUM: five labels plus each cell's 4px of inline
 * padding fit a 320px phone.
 *
 * Widths come from tests/ui/text-metrics.ts: a static Public Sans 500 @ 12px advance-width table,
 * measured once in Chromium against the face the site ships and committed. Nothing is measured at
 * test time. The 1.06 factor covers the 700-weight selected label (measured: Public Sans 700 is
 * 2.1% to 2.5% wider than 500 over these five words) with room to spare, and is applied to all
 * five although only one is bold at a time.
 *
 * Measured in Chromium at 320: the five words total 225px at 13px/500 and 265px with padding; the
 * cells are 62 / 81 / 69 / 58 / 50px; 19px between neighbouring words.
 *
 * Large text: the label follows the reader's text size but stops at a px cap in globals.css
 * (`min(…rem, 15px)`), because at 200% five 26px words cannot share a 320px bar. At the cap the
 * five labels must still fit 320px.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { TABS } from '../../components/layout/BottomTabBar';
import { isActive } from '../../components/layout/NavLink';
import { TOP_LINKS } from '../../components/layout/TopNav';

import { width } from './text-metrics';

/** The narrowest supported phone. */
const PHONE_PX = 320;
/** `.sx-tabbar-tab { padding: 0 0.25rem }`: 4px each side of every cell. */
const CELL_PADDING_PX = 8;
/** The selected label is 700; this over-covers its extra width (see the header comment). */
const BOLD_FACTOR = 1.06;
/** The label size under 360px of viewport, and the px cap every size shares. */
const SMALL_PX = 13;

const read = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');
const navLinkSource = read('components/layout/NavLink.tsx');
const moreMenuSource = read('components/layout/MoreMenu.tsx');
const CSS = read('app/globals.css');

/** The five words on the bar: the four tabs and the More cell's summary. */
const LABELS = [...TABS.map((t) => t.label), 'More'];

/** The declarations of the ONE rule whose selector is exactly `selector`. */
function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = [...CSS.matchAll(new RegExp(`(?:^|[};])\\s*${escaped}\\s*\\{([^}]*)\\}`, 'gm'))];
  expect(matches, `globals.css: exactly one rule for "${selector}"`).toHaveLength(1);
  return matches[0][1];
}

const sumAt = (px: number) =>
  LABELS.reduce((total, label) => total + width(label) * (px / 12) * BOLD_FACTOR + CELL_PADDING_PX, 0);

describe('bottom tab labels', () => {
  it('has the four tabs, in order: Scores, Standings, Playoffs, Teams (home is Scores; no Home tab)', () => {
    expect(TABS.map((t) => t.label)).toEqual(['Scores', 'Standings', 'Playoffs', 'Teams']);
    expect(TABS.map((t) => t.href)).toEqual(['/schedule', '/standings', '/playoffs', '/teams']);
  });

  it('is the start of the header nav, label for label and href for href', () => {
    const head = TOP_LINKS.slice(0, 4);
    expect(TABS.map((t) => t.label)).toEqual(head.map((l) => l.label));
    expect(TABS.map((t) => t.href)).toEqual(head.map((l) => l.href));
  });

  it('the fifth cell is the More sheet, and its summary is the word alone', () => {
    const summary = /<summary className="sx-tabbar-tab"[^>]*>([\s\S]*?)<\/summary>/.exec(moreMenuSource);
    expect(summary, 'components/layout/MoreMenu.tsx: the summary').not.toBeNull();
    expect(summary![1]).toContain('More');
    expect(summary![1]).not.toContain('<svg');
  });

  it('the tab face is the word alone: no icon', () => {
    const face = /function TabFace[\s\S]*?\n}\n/.exec(navLinkSource);
    expect(face, 'components/layout/NavLink.tsx: TabFace').not.toBeNull();
    expect(face![0]).not.toContain('<svg');
    expect(face![0]).not.toMatch(/glyph|Icon/);
    // Nothing in the file draws one for either face.
    expect(navLinkSource).not.toContain('<svg');
  });

  it('the bar is a flex row of word-width cells, not an equal five-column grid', () => {
    const list = rule('.sx-tabbar > ul');
    expect(list).toMatch(/display:\s*flex/);
    expect(list).not.toMatch(/grid/);
    const item = rule('.sx-tabbar > ul > li');
    expect(item).toMatch(/flex:\s*1 1 auto/);
    for (const m of CSS.matchAll(/([^{}]*\.sx-tabbar[^{}]*)\{([^}]*)\}/g)) {
      expect(m[2], m[1].trim()).not.toMatch(/grid-template-columns|repeat\(5/);
    }
    // The measured padding is the rule's padding, and the label never wraps or truncates.
    const tab = rule('.sx-tabbar-tab');
    expect(tab).toMatch(/padding:\s*0 0\.25rem/);
    expect(tab).toMatch(/white-space:\s*nowrap/);
    expect(tab).not.toMatch(/text-overflow|overflow/);
  });

  it('the five labels and their padding fit a 320px phone at 13px', () => {
    expect(sumAt(SMALL_PX)).toBeLessThanOrEqual(PHONE_PX);
    // The words alone at 13px/500 measure 225px in Chromium; the table agrees to the pixel.
    const words = LABELS.reduce((total, label) => total + width(label) * (SMALL_PX / 12), 0);
    expect(words).toBeCloseTo(224.8, 0);
  });

  it('labels are 14px, and 13px (never smaller) under 360px of viewport', () => {
    expect(rule('.sx-tabbar-tab')).toMatch(/font-size:\s*min\(0\.875rem, (\d+)px\)/);
    const small = /@media \(max-width: 22\.49rem\) \{ \.sx-tabbar-tab \{([^}]*)\} \}/.exec(CSS);
    expect(small, 'globals.css: the 22.49rem tab rule').not.toBeNull();
    expect(small![1]).toMatch(/font-size:\s*min\(0\.8125rem, (\d+)px\)/);
    // No rule sets a tab label under 13px.
    for (const m of CSS.matchAll(/([^{}]*\.sx-tabbar-tab[^{}]*)\{([^}]*)\}/g)) {
      for (const size of m[2].matchAll(/font-size:\s*(?:min\()?([\d.]+)rem/g)) {
        expect(Number(size[1]), m[1].trim()).toBeGreaterThanOrEqual(0.8125);
      }
    }
  });

  it('the label size is capped in px, and at the cap (large text) the five labels still fit 320px', () => {
    const caps = [...CSS.matchAll(/\.sx-tabbar-tab \{[^}]*?font-size:\s*min\([\d.]+rem, (\d+(?:\.\d+)?)px\)/g)].map(
      (m) => Number(m[1]),
    );
    // Both the base rule and the small-viewport rule carry it (at 200% text every phone is "small").
    expect(caps).toHaveLength(2);
    for (const cap of caps) {
      expect(cap).toBeGreaterThan(SMALL_PX);
      expect(cap).toBeLessThanOrEqual(18);
      expect(sumAt(cap)).toBeLessThanOrEqual(PHONE_PX);
    }
  });

  it('every label is at most 9 characters', () => {
    for (const label of LABELS) expect(label.length, label).toBeLessThanOrEqual(9);
  });

  it('the selected cell is bold, accent-coloured and barred: never colour alone', () => {
    const selected = rule('.sx-tabbar-tab:is([aria-current], [data-current])');
    expect(selected).toContain('color: var(--sx-accent-ink)');
    expect(selected).toMatch(/font-weight:\s*700/);
    expect(selected).toContain('box-shadow: inset 0 3px 0 var(--sx-accent)');
  });

  it('Scores is the current tab on the home page (home is the Scores page)', () => {
    const scores = TABS[0];
    expect(isActive('/', scores.href)).toBe(true);
    for (const tab of TABS.slice(1)) expect(isActive('/', tab.href), tab.label).toBe(false);
  });
});
