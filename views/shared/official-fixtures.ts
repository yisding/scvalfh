/**
 * A team's official-schedule fixtures (the league documents' fixtures with no published contest) in
 * the words every page shares: the next one at or after "today", and its opponent seen from one side.
 * The team page (views/teams/team-view.ts), its OG card and home's pinned card (views/home/my-team.ts)
 * all read them here, so the three name the same fixture and the same opponent.
 */

import type { OfficialFixture } from '@/lib/model/fixture';
import type { Team } from '@/lib/model/team';
import { getTeamBySlug } from '@/lib/registry/teams';

/** The next official fixture we have no contest for, at or after `today`. */
export function nextOfficialFixture(
  fixtures: readonly OfficialFixture[],
  today: string,
): OfficialFixture | null {
  const ahead = fixtures
    .filter((f) => f.dateKey >= today)
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  return ahead.length > 0 ? ahead[0] : null;
}

/** 'VALLEY CHRISTIAN' → 'Valley Christian', for a grid name with no registry row behind it. */
function titleCase(name: string): string {
  return name
    .toLowerCase()
    .replace(/(^|[\s.])([a-z])/g, (_, lead: string, ch: string) => `${lead}${ch.toUpperCase()}`);
}

/**
 * 'vs' / 'at' and the opponent of an official fixture, seen from `team`'s side. The one place a
 * fixture's opponent is named (the team page, its OG card and home's pinned card): the registry
 * short name, or the schedule's own spelling title-cased for a school outside the registry.
 */
export function fixtureOpponent(
  fixture: OfficialFixture,
  team: Pick<Team, 'slug'>,
): { mineIsHome: boolean; versus: 'vs' | 'at'; opponent: Team | undefined; opponentName: string } {
  const mineIsHome = fixture.homeSlug === team.slug;
  const opponentSlug = mineIsHome ? fixture.awaySlug : fixture.homeSlug;
  const opponent = opponentSlug ? getTeamBySlug(opponentSlug) : undefined;
  return {
    mineIsHome,
    versus: mineIsHome ? 'vs' : 'at',
    opponent,
    opponentName: opponent ? opponent.shortName : titleCase(mineIsHome ? fixture.awayName : fixture.homeName),
  };
}
