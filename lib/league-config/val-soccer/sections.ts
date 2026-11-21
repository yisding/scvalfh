/**
 * The `val-soccer` build's one "section" (lib/league-config/sections.ts picks it when `SCVAL_SPORT=val-soccer`). The
 * Valley Athletic League is an after-school league of middle schools: it belongs to no CIF section, and no section
 * holds a playoff its teams go on to. So the build has no CCS block (lib/league-config/sections.ts `CCS` is null) and
 * one section entry, `none`, that only places the league in a region and gives the season's window.
 *
 * The window: valleyal.org's home page dates Season #3 "12/7 - 2/4" (tryouts Dec 7-10, then the games; the
 * championship games Thu Feb 4). The site went up on 2026-11-21 with the schedule already published, so the window
 * opens then and the refresh keeps the schedule current through tryouts; it closes a week after the finals.
 */

import type { SectionConfig } from '../shape';

const VAL_RULES = 'https://valleyal.org/content/8308/Girls-Soccer';

export const VAL_SOCCER_SECTIONS = [
  {
    id: 'none', name: 'no CIF section', shortName: 'None', briefLabel: 'middle school', region: 'norcal',
    // MaxPreps carries none of the league's schools.
    maxprepsSectionId: null,
    // No section championship: the league's own playoffs end the season (postseason 'league-tournament').
    holdsFieldHockeyChampionship: false,
    // There is no section to link: the league's own rules page stands in, so no page takes the league's site
    // (valleyal.org, LeagueConfig.officialUrl) for a section's.
    officialUrl: VAL_RULES,
    rulesSource: { name: 'VAL Soccer Rules', url: VAL_RULES, format: 'web page' },
    shootout: null,
    seasonWindow: { start: '2026-11-21', end: '2027-02-11' },
    noChampionshipNote:
      'The VAL is an after-school league of middle schools and belongs to no CIF section; its own playoffs end the season.',
    outsideTournament: null,
  },
] as const satisfies readonly SectionConfig[];
