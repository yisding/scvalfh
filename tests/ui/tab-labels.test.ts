/**
 * The phone bottom bar's labels fit their tabs (SPEC §8.3). Each tab is an equal fifth of a bar
 * capped at 448px, so a 320px phone gives 64px per tab; a label over 56px (the tab minus 4px of
 * breathing room on each side) would crowd or truncate. "Playoffs" (renamed from "CCS", which was
 * false for MCAL) is the widest.
 *
 * Widths come from tests/ui/text-metrics.ts (A3): a static Geist Sans 500 @ 12px advance-width
 * table, measured once and committed — nothing is measured at test time.
 */
import { describe, expect, it } from 'vitest';

import { TABS } from '../../components/layout/BottomTabBar';

import { width } from './text-metrics';

const MAX_LABEL_PX = 56;

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

  it('every label is at most 8 characters (the BottomTabBar comment)', () => {
    for (const tab of TABS) expect(tab.label.length, tab.label).toBeLessThanOrEqual(8);
  });
});
