/**
 * Pin labels and picker-tile names (SPEC §10.1, §13.3). Pure and dependency-free on purpose (ZERO runtime
 * imports): MyTeamCard, PinTile and TeamFinder are `'use client'` modules, and the team page builds
 * `PinControl`'s label with it.
 *
 * WCAG 2.5.3 Label in Name (Level A): a tile shows `shortName`, so the accessible name must contain it. Almost
 * every short name is the full name or whole words of it ('Tamalpais', 'Mitty' ⊂ 'Archbishop Mitty',
 * 'Sobrato' ⊂ 'Ann Sobrato'), so the full name alone carries it. The three that are not ('SF University', an
 * alias of San Francisco University, and the initialisms 'LJCD' and 'RBV' of La Jolla Country Day and Rancho
 * Buena Vista) lead, and the full name follows in parentheses.
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
 * the name 61 px at 320 px (12 px / 500 Public Sans). A single word wider than that has no space to break at, and
 * Chromium's `hyphens: auto` never breaks a capitalised word, so the break points are stated here. Two-word
 * names break at their space; 'Lick-Wilmerding' breaks after its hyphen, and 'Wilmerding' (65.1) needs its own.
 *
 * Measured with tests/ui/text-metrics.ts (Public Sans since the 2026-11-12 refresh, DESIGN §33; it sets narrower
 * than Geist did, so seven names that needed a break no longer do) over the teams' short names: Presentation 71.6,
 * Christopher 66.3, Homestead 64.5, Huntington (of 'Huntington Beach') 63.8, Chaminade 63.2, Clairemont 62.1 px.
 * These fit whole and carry no break: Southwest 60.3, Greenfield 59.3, Stevenson 58.8, Escondido 58.1,
 * Westmont 57.3, Tamalpais 56.9, University 56.5 (also in 'University City'), Cupertino 55.7, Chaparral and
 * Cathedral 55.5, Thousand 55.0, Temecula 54.4, Westview 53.8, Fallbrook 53.3, Olympian 53.1, Westlake 52.2,
 * Glendora 51.4, Harvard- 49.8 (Harvard-Westlake breaks after its hyphen, as Lick-Wilmerding does),
 * Pleasant 48.8, Hollister 48.4, Corning 44.5. The breaks are at syllables; every piece with its hyphen is
 * <= 50 px except 'ton Beach', which breaks again at its space. Keyed by the exact short name, so a rename stops
 * matching instead of hyphenating the wrong word; tests/ui/pin-label.test.ts asserts the key set.
 */
export const PICKER_BREAKS: Readonly<Record<string, string>> = {
  Homestead: `Home${SHY}stead`,
  Presentation: `Pre${SHY}sen${SHY}ta${SHY}tion`,
  Christopher: `Chris${SHY}to${SHY}pher`,
  'Lick-Wilmerding': `Lick-Wil${SHY}mer${SHY}ding`,
  Chaminade: `Chami${SHY}nade`,
  'Huntington Beach': `Hunting${SHY}ton Beach`,
  Clairemont: `Claire${SHY}mont`,
};

/** The visible picker-tile label: `shortName`, carrying break points where it needs them. */
export function pickerName(t: { shortName: string }): string {
  return PICKER_BREAKS[t.shortName] ?? t.shortName;
}
