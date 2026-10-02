/**
 * The accessible name for one tile in the home page's 15-team picker.
 *
 * WCAG 2.5.3 Label in Name (Level A): the visible label has to be *inside* the accessible name, so
 * someone driving the page by voice can say what they can see and have it activate. The tile shows
 * `shortName`; the label was built from `name` INSTEAD of it, and for three of the fifteen the two
 * do not overlap — "St Ignatius" is not a substring of "St. Ignatius College Preparatory" (the
 * period), "St Francis" is not one of "Saint Francis", and "Valley Chr." is not one of "Valley
 * Christian". For the other twelve the short name is a plain prefix ("Mitty" ⊂ "Archbishop
 * Mitty"), which is why this went unnoticed; axe cannot catch it either, as
 * `label-content-name-mismatch` is experimental and off by default.
 *
 * So the visible string always leads, and the full school name follows only when it says something
 * the short one does not. Pure and dependency-free on purpose: it is imported by a `'use client'`
 * component and asserted over all 15 teams in tests/ui/pin-label.test.ts.
 */

/** The identity fields this label needs — structurally a `HomeTeamIdentity` or a `Team`. */
export interface PinLabelTeam {
  name: string;
  shortName: string;
  divisionLabel: string;
}

export function pinLabel(team: PinLabelTeam): string {
  const visible = team.shortName;
  const full = team.name.toLowerCase().includes(visible.toLowerCase())
    ? team.name
    : `${visible} (${team.name})`;
  return `Pin ${full}, ${team.divisionLabel} Division`;
}

/** U+00AD SOFT HYPHEN: invisible unless the line actually breaks there. */
const SHY = '­';

/**
 * Where a short name may break, for the two that cannot fit a picker tile on one line.
 *
 * The tile is four columns wide at every width, which leaves the name 61px at 320px — enough for
 * thirteen of the fifteen, and 9px short of "Homestead" (70px) and 16px short of "Presentation"
 * (77px) at the tile's 12px/500 Geist. Those two have no space to break at, so the browser fell
 * through to `overflow-wrap` and split them as "Homeste / ad" and "Presentatio / n", with nothing
 * to say a word had been broken.
 *
 * `hyphens: auto` does not rescue it: Chromium consults its hyphenation dictionary for lower-case
 * words only, so "hyphenation" breaks into hyphenated lines at a 62px measure while "Presentation"
 * and "Homestead" do not — a capital letter is enough to turn it off, and all fifteen names are
 * capitalised. A soft hyphen is honoured whatever the case, so the break points are stated here.
 *
 * Keyed by the exact short name rather than by slug, so a rename in the registry stops matching
 * instead of hyphenating the wrong word; tests/ui/pin-label.test.ts asserts the whole key set
 * against all 15 teams, which is what catches a sixteenth name that needs one.
 */
const PICKER_BREAKS: Record<string, string> = {
  Homestead: `Home${SHY}stead`,
  Presentation: `Pre${SHY}sen${SHY}ta${SHY}tion`,
};

/** The visible picker-tile label: `shortName`, carrying break points where it needs them. */
export function pickerName(team: Pick<PinLabelTeam, 'shortName'>): string {
  return PICKER_BREAKS[team.shortName] ?? team.shortName;
}

export default pinLabel;
