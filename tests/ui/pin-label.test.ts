/**
 * `components/home/pin-label.ts` — WCAG 2.5.3 Label in Name over the real registry.
 *
 * The picker tile's VISIBLE label is `shortName`, so the accessible name has to contain it. Three
 * of the sixteen short names are not substrings of the school's full name, so a label built from
 * the full name alone left those three unsayable.
 */

import { describe, expect, it } from 'vitest';

import { pickerName, pinLabel } from '../../components/home/pin-label';
import { DIVISION_LABELS } from '../../lib/season';
import { TEAMS } from '../../lib/teams';

/** What `buildTeamViews()` hands the picker: the registry row plus its division's label. */
const IDENTITIES = TEAMS.map((team) => ({
  ...team,
  divisionLabel: DIVISION_LABELS[team.division],
}));

describe('pinLabel', () => {
  it('contains the visible tile label for all 16 teams', () => {
    expect(IDENTITIES.length).toBe(16);
    for (const team of IDENTITIES) {
      const label = pinLabel(team);
      expect(label.toLowerCase(), team.slug).toContain(team.shortName.toLowerCase());
    }
  });

  it('still names the full school, so the row is identifiable out of context', () => {
    for (const team of IDENTITIES) {
      const label = pinLabel(team);
      expect(label, team.slug).toContain(team.name);
      expect(label, team.slug).toContain(`${team.divisionLabel} Division`);
      expect(label.startsWith('Pin '), team.slug).toBe(true);
    }
  });

  it('adds the full name in parentheses only when the short name is not inside it', () => {
    const bracketed = IDENTITIES.filter((t) => pinLabel(t).includes('('));
    expect(bracketed.map((t) => t.slug).sort()).toEqual([
      'saint-francis',
      'st-ignatius',
      'valley-christian',
    ]);
    // The other thirteen read as one name, not a name twice over.
    for (const team of IDENTITIES) {
      if (bracketed.includes(team)) continue;
      expect(pinLabel(team), team.slug).toBe(`Pin ${team.name}, ${team.divisionLabel} Division`);
    }
  });
});

const SHY = '­';

describe('pickerName', () => {
  it('renders the same string as the short name, give or take a break point', () => {
    expect(IDENTITIES.length).toBe(16);
    for (const team of IDENTITIES) {
      expect(pickerName(team).replaceAll(SHY, ''), team.slug).toBe(team.shortName);
    }
  });

  it('breaks only the two names with no space to break at', () => {
    // The picker tile is four columns wide at every width, which leaves the name 61px at 320px.
    // Fifteen of the sixteen either fit it or break at their own space; "Homestead" (70px) and
    // "Presentation" (77px) are single words that do neither, and `hyphens: auto` will not break
    // a capitalised word in Chromium, so they carry soft hyphens. A seventeenth school, or a
    // renamed short name, fails here and has to be measured rather than assumed.
    const broken = IDENTITIES.filter((t) => pickerName(t).includes(SHY));
    expect(broken.map((t) => t.slug).sort()).toEqual(['homestead', 'presentation']);
    expect(pickerName({ shortName: 'Homestead' })).toBe(`Home${SHY}stead`);
    expect(pickerName({ shortName: 'Presentation' })).toBe(`Pre${SHY}sen${SHY}ta${SHY}tion`);
  });

  it('leaves the accessible name alone — the soft hyphen is visual only', () => {
    for (const team of IDENTITIES) {
      expect(pinLabel(team), team.slug).not.toContain(SHY);
    }
  });
});
