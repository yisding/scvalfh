/**
 * The phone bottom bar's labels fit their tabs (SPEC §8.3). Each tab is an equal fifth of a bar
 * capped at 448px, so a 320px phone gives 64px per tab; a label over 56px (the tab minus 4px of
 * breathing room on each side) would crowd or truncate. "Playoffs" (renamed from "CCS", which was
 * false for MCAL) is the widest.
 *
 * Widths come from tests/ui/text-metrics.ts (A3): a static Geist Sans 500 @ 12px advance-width
 * table, measured once and committed — nothing is measured at test time.
 *
 * Large text: the label grows with the reader's text size but stops at a px cap in NavLink.tsx
 * (`min(var(--text-micro), 15px)`), because at 200% the 24px "Leaders" and "Playoffs" ran together.
 * At the cap every label must still fit a 320px phone's 64px tab, with 2px to spare (semibold
 * runs a little wider than the 500-weight table).
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { TABS } from '@/components/layout/BottomTabBar';

import { width } from './text-metrics';

const MAX_LABEL_PX = 56;
/** One fifth of a 320px phone's bar, less 2px of margin for the semibold active label. */
const TAB_320_PX = 64;
const TAB_MARGIN_PX = 2;

const navLinkSource = readFileSync(new URL('../../components/layout/NavLink.tsx', import.meta.url), 'utf8');
const capMatch = /text-\[length:min\(var\(--text-micro\),(\d+(?:\.\d+)?)px\)\]/.exec(navLinkSource);

describe('bottom tab labels', () => {
  it('has the five tabs, in order: Teams holds the standings, Leaders has the old Table slot, Playoffs (not CCS)', () => {
    expect(TABS.map((t) => t.label)).toEqual(['Home', 'Scores', 'Teams', 'Leaders', 'Playoffs']);
    expect(TABS.map((t) => t.href)).toEqual(['/', '/schedule', '/teams', '/leaders', '/playoffs']);
  });

  for (const { label } of TABS) {
    it(`"${label}" is at most ${MAX_LABEL_PX}px at 12px/500 Geist`, () => {
      expect(width(label)).toBeLessThanOrEqual(MAX_LABEL_PX);
    });
  }

  it('the tab label size is capped in px above the 12px micro size', () => {
    expect(capMatch, 'NavLink tab label font-size cap').not.toBeNull();
    const cap = Number(capMatch?.[1]);
    expect(cap).toBeGreaterThan(12);
    expect(cap).toBeLessThanOrEqual(18);
  });

  for (const { label } of TABS) {
    it(`"${label}" fits a ${TAB_320_PX}px tab (320px phone) at the clamped maximum size (large text)`, () => {
      const cap = Number(capMatch?.[1] ?? NaN);
      expect(width(label) * (cap / 12)).toBeLessThanOrEqual(TAB_320_PX - TAB_MARGIN_PX);
    });
  }

  it('every label is at most 8 characters (the BottomTabBar comment)', () => {
    for (const tab of TABS) expect(tab.label.length, tab.label).toBeLessThanOrEqual(8);
  });
});
