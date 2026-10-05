/**
 * Pin labels and picker-tile names (SPEC §10.1, §13.3). Pure and dependency-free on purpose (ZERO runtime
 * imports): MyTeamCard, PinTile and TeamFinder are `'use client'` modules, and the team page builds
 * `PinControl`'s label with it.
 *
 * WCAG 2.5.3 Label in Name (Level A): a tile shows `shortName`, so the accessible name must contain it. Almost
 * every short name is the full name or whole words of it ('Tamalpais', 'Mitty' ⊂ 'Archbishop Mitty',
 * 'Sobrato' ⊂ 'Ann Sobrato'), so the full name alone carries it. The one that is not ('SF University', an
 * alias of San Francisco University) leads, and the full name follows in parentheses.
 */

/** U+00AD SOFT HYPHEN: invisible unless the line actually breaks there. */
const SHY = '­';

/** 'Pin Leigh, Mt. Hamilton · BVAL' | 'Pin Tamalpais, MCAL' | 'Pin Archbishop Mitty, El Camino · SCVAL'. */
export function pinLabel(t: { name: string; shortName: string; divisionHeading: string | null; leagueShort: string }): string {
  const name = t.name.toLowerCase().includes(t.shortName.toLowerCase()) ? t.name : `${t.shortName} (${t.name})`;
  return `Pin ${name}, ${t.divisionHeading ? `${t.divisionHeading} · ` : ''}${t.leagueShort}`;
}

/**
 * Where a short name may break in a picker tile. The tile is four columns wide at every width, which leaves
 * the name 61 px at 320 px (12 px / 500 Geist). A single word wider than that has no space to break at, and
 * Chromium's `hyphens: auto` never breaks a capitalised word, so the break points are stated here. Two-word
 * names break at their space; 'Lick-Wilmerding' breaks after its hyphen, and 'Wilmerding' (68.9) needs its own.
 *
 * Measured with tests/ui/text-metrics.ts over all 49 short names: Presentation 77.0, Christopher 71.6,
 * Homestead 70.1, Stevenson 64.2, Westmont 62.8, Greenfield 62.6, Tamalpais 61.3 px. Hollister (50.9),
 * University (60.5) and Cupertino (60.1) fit, and so do the EAL's widest words, Pleasant (53.7) and
 * Corning (47.8). Keyed by the exact short name, so a rename stops matching
 * instead of hyphenating the wrong word; tests/ui/pin-label.test.ts asserts the key set.
 */
export const PICKER_BREAKS: Readonly<Record<string, string>> = {
  Homestead: `Home${SHY}stead`,
  Presentation: `Pre${SHY}sen${SHY}ta${SHY}tion`,
  Christopher: `Chris${SHY}to${SHY}pher`,
  Stevenson: `Steven${SHY}son`,
  Westmont: `West${SHY}mont`,
  Greenfield: `Green${SHY}field`,
  Tamalpais: `Tamal${SHY}pais`,
  'Lick-Wilmerding': `Lick-Wil${SHY}mer${SHY}ding`,
};

/** The visible picker-tile label: `shortName`, carrying break points where it needs them. */
export function pickerName(t: { shortName: string }): string {
  return PICKER_BREAKS[t.shortName] ?? t.shortName;
}
