/**
 * `lib/pin-label.ts` over the real 49-team registry (SPEC §10.1).
 *
 * WCAG 2.5.3 Label in Name: a tile's VISIBLE label is `shortName`, so the accessible name has to contain it.
 * The picker's break points are asserted against tests/ui/text-metrics.ts (static Geist 12 px / 500 widths),
 * so a new school or a renamed short name that needs one fails here instead of being assumed.
 */

import { describe, expect, it } from 'vitest';

import { divisionHeading, getLeague } from '../../lib/leagues';
import { PICKER_BREAKS, pickerName, pinLabel } from '../../lib/pin-label';
import { TEAMS } from '../../lib/teams';
import { width } from './text-metrics';

const SHY = '­';
/** The name's measure in a picker tile at 320 px (four columns). */
const TILE_PX = 61;

const IDENTITIES = TEAMS.map((team) => ({
  slug: team.slug,
  name: team.name,
  shortName: team.shortName,
  divisionHeading: divisionHeading(team.division),
  leagueShort: getLeague(team.league).shortName,
}));

describe('pinLabel', () => {
  it('formats the documented examples', () => {
    expect(pinLabel({ name: 'Leigh', shortName: 'Leigh', divisionHeading: 'Mt. Hamilton', leagueShort: 'BVAL' }))
      .toBe('Pin Leigh, Mt. Hamilton · BVAL');
    expect(pinLabel({ name: 'Tamalpais', shortName: 'Tamalpais', divisionHeading: null, leagueShort: 'MCAL' }))
      .toBe('Pin Tamalpais, MCAL');
    const byslug = (slug: string) => pinLabel(IDENTITIES.find((t) => t.slug === slug)!);
    expect(byslug('leigh')).toBe('Pin Leigh, Mt. Hamilton · BVAL');
    expect(byslug('tamalpais')).toBe('Pin Tamalpais, MCAL');
    expect(byslug('carmel')).toBe('Pin Carmel, PCAL');
    expect(byslug('mitty')).toBe('Pin Archbishop Mitty, El Camino · SCVAL');
    expect(byslug('saint-francis')).toBe('Pin Saint Francis, De Anza · SCVAL');
    expect(byslug('university-sf')).toBe('Pin SF University (San Francisco University), MCAL');
    expect(byslug('davis')).toBe('Pin Davis, EAL');
    expect(byslug('pleasant-valley')).toBe('Pin Pleasant Val. (Pleasant Valley), EAL');
  });

  it('has the label format for all 49 teams', () => {
    expect(IDENTITIES.length).toBe(49);
    for (const t of IDENTITIES) {
      const label = pinLabel(t);
      const tail = `, ${t.divisionHeading === null ? '' : `${t.divisionHeading} · `}${t.leagueShort}`;
      expect(label.startsWith('Pin '), t.slug).toBe(true);
      expect(label.endsWith(tail), t.slug).toBe(true);
      expect(label, t.slug).toContain(t.name);
      // Single-division leagues (PCAL, MCAL, EAL) carry no division label.
      if (['PCAL', 'MCAL', 'EAL'].includes(t.leagueShort)) expect(label, t.slug).not.toContain(' · ');
      expect(label, t.slug).not.toContain('Division');
    }
  });

  it('contains the visible tile label (WCAG 2.5.3) for all 49 teams', () => {
    for (const t of IDENTITIES) {
      expect(pinLabel(t).toLowerCase(), t.slug).toContain(t.shortName.toLowerCase());
    }
  });

  it('adds the full name in parentheses only when the short name is not inside it', () => {
    const bracketed = IDENTITIES.filter((t) => pinLabel(t).includes('('));
    expect(bracketed.map((t) => t.slug).sort()).toEqual([
      'archie-williams',
      'lick-wilmerding',
      'pleasant-valley',
      'university-sf',
      'valley-christian',
    ]);
    for (const t of IDENTITIES) {
      if (bracketed.includes(t)) {
        expect(pinLabel(t).startsWith(`Pin ${t.shortName} (${t.name}), `), t.slug).toBe(true);
      } else {
        expect(pinLabel(t).startsWith(`Pin ${t.name}, `), t.slug).toBe(true);
      }
    }
  });

  it('leaves the accessible name alone — the soft hyphen is visual only', () => {
    for (const t of IDENTITIES) expect(pinLabel(t), t.slug).not.toContain(SHY);
  });
});

/** Pieces a line can break between without help: spaces, and after a hyphen. */
const segments = (s: string) => s.split(/ |(?<=-)/).filter(Boolean);

describe('text metrics (calibration)', () => {
  it('reproduces the widths the browser rendered at 12 px / 500 Geist', () => {
    expect(width('Homestead')).toBeCloseTo(70, 0);
    expect(width('Presentation')).toBeCloseTo(77, 0);
    expect(width('Hollister')).toBeCloseTo(50.9, 1);
  });
});

describe('pickerName', () => {
  it('renders the same string as the short name, give or take a break point', () => {
    for (const t of IDENTITIES) {
      expect(pickerName(t).split(SHY).join(''), t.slug).toBe(t.shortName);
    }
  });

  it('has PICKER_BREAKS keys = exactly the short names with a word wider than the 61 px tile', () => {
    const tooWide = IDENTITIES
      .filter((t) => segments(t.shortName).some((seg) => width(seg) > TILE_PX))
      .map((t) => t.shortName)
      .sort();
    expect(Object.keys(PICKER_BREAKS).sort()).toEqual(tooWide);
    expect(tooWide).toEqual([
      'Christopher', 'Greenfield', 'Homestead', 'Presentation', 'Stevenson', 'Tamalpais', 'Westmont',
    ]);
    // Hollister fits and gets no break.
    expect(width('Hollister')).toBeLessThan(TILE_PX);
    expect(pickerName({ shortName: 'Hollister' })).toBe('Hollister');
  });

  it('breaks each listed name into pieces that fit the tile with their hyphen', () => {
    for (const [shortName, broken] of Object.entries(PICKER_BREAKS)) {
      const pieces = broken.split(SHY);
      expect(pieces.length, shortName).toBeGreaterThan(1);
      pieces.forEach((piece, i) => {
        const shown = i < pieces.length - 1 ? `${piece}-` : piece;
        expect(width(shown), `${shortName}: ${shown}`).toBeLessThanOrEqual(TILE_PX);
      });
    }
    expect(pickerName({ shortName: 'Homestead' })).toBe(`Home${SHY}stead`);
    expect(pickerName({ shortName: 'Presentation' })).toBe(`Pre${SHY}sen${SHY}ta${SHY}tion`);
  });
});
