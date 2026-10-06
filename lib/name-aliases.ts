/**
 * Player names written one way in free text and listed another way on the MaxPreps roster, per
 * team: the spellings lib/note-stats.ts needs to credit a coach's game note to a roster player.
 *
 * Curated, never guessed: each entry says why the two names are one player. An alias only ever
 * resolves to a player on that team's roster (tests/note-stats.test.ts checks every entry against
 * data/rosters.json), so a roster change that drops the player turns the alias into a test failure
 * rather than a credit to nobody.
 */

import type { TeamSlug } from './types';

export interface NameAlias {
  team: TeamSlug;
  /** As written in the note: "Emery Borges". */
  written: string;
  /** The roster's `fullName`: "Emry Borges". */
  fullName: string;
  /** Why the two are the same player. */
  basis: string;
}

export const NAME_ALIASES: readonly NameAlias[] = [
  {
    team: 'homestead',
    written: 'Emery Borges',
    fullName: 'Emry Borges',
    basis:
      "Homestead's Oct 5 note credits \"Emery Borges\", its Sep 30 note \"Emry Borges\"; the roster lists only " +
      'Emry Borges, and SCVAL\'s 2025-26 all-league list spells her Emry. Identified as one player by the site owner.',
  },
  {
    team: 'homestead',
    written: 'Gabby Molly',
    fullName: 'Gabrielle Moll',
    basis:
      "Homestead's Sep 30 note. Gabby is short for Gabrielle: SCVAL's 2025-26 all-league list names her \"Gabby " +
      'Moll", and her MaxPreps career page answers to both name slugs. The roster has no Molly and no other Gabrielle or Gabby.',
  },
  {
    team: 'homestead',
    written: 'Gabby Moll',
    fullName: 'Gabrielle Moll',
    basis: 'The name SCVAL\'s 2025-26 all-league list prints for her (see "Gabby Molly").',
  },
];
