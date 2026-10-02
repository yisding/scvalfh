/**
 * The serializable view models the home page hands to its client components (SPEC §10.1).
 *
 * `MyTeamCard`, `PinTile`, `FindYourTeam` and `SetLeagueButton` are `'use client'`, so they cannot
 * read `lib/data` (an `fs` read at import), `lib/teams` or `lib/leagues` (SPEC §0.4 client
 * boundary). Everything they need is computed on the server (`home-data.ts`) and passed as plain
 * data: the §5.2 render decision for the last game arrives as a `GameDisplay`, already resolved by
 * `describeGame()`, so no score is ever re-derived on the client and the never-0-0 rule stays in its
 * single place (`renderScore()` in lib/format.ts).
 *
 * This file imports TYPES ONLY, so it is safe on both sides of the boundary.
 */

import type { LeagueId, Outcome, TeamColors } from '../../lib/types';
import type { GameDisplay, SideView } from '../ui/game-view';

/** The colors `TeamMonogram` draws with (no provenance field: it is never rendered). */
export type HomeColors = Pick<TeamColors, 'primary' | 'secondary' | 'onPrimary'>;

/** Exactly the identity fields the card renders. `TeamMonogram` needs the first three. */
export interface HomeTeamIdentity {
  abbr: string;
  name: string;
  colors: HomeColors;
  slug: string;
  shortName: string;
  leagueId: LeagueId;
  leagueShort: string;
  /** null for a single-division league (PCAL, MCAL): never a division label there. */
  divisionHeading: string | null;
}

/** One side of the last game: what a score line draws (the name is the registry short name). */
export type HomeSide = Pick<SideView, 'name' | 'glyph' | 'hasScore' | 'weight' | 'chip'>;

/**
 * The §5.2 rendering decision for the last game, resolved server-side by `describeGame()` and
 * slimmed to what the card draws: the status label and its chips (only the ones that are set),
 * the screen-reader sentence and the two sides. The client rebuilds a `GameDisplay` for
 * `StatusLabel` from it (MyTeamCard.tsx), so no score is ever re-derived on the client.
 */
export interface HomeLastDisplay {
  statusLabel: GameDisplay['statusLabel'];
  statusTone: GameDisplay['statusTone'];
  /** The flags and chips that are set; an absent key is false/null. */
  marks?: Partial<{
    liveDot: true;
    strikeTime: true;
    isNonLeague: true;
    deciderTag: string;
    shootoutText: string;
    sourceMark: 'si.com';
    leagueTag: string;
    postseasonTag: string;
  }>;
  note: string | null;
  sentence: string;
  home: HomeSide;
  away: HomeSide;
}

/** The pinned team's most recent final. */
export interface HomeLastGame {
  /** The §5.2 rendering decision, resolved server-side and slimmed. */
  display: HomeLastDisplay;
  /** true ⇒ `display.home` is the pinned team, so it takes the first line. */
  mineIsHome: boolean;
  /** 'Thu Sep 24' */
  dateLabel: string;
  /** The `<time datetime>` value. */
  dateTime: string;
  /** Cleaned at build (DESIGN §5.8), capped, clamped to two lines when rendered. */
  recap: string | null;
  href: string;
}

export interface HomeNextGame {
  /** 'Tue Sep 29' */
  dateLabel: string;
  dateTime: string;
  /** '5:30 PM PT' or 'Time TBA' — never a fabricated time. */
  timeLabel: string;
  /** From the pinned team's point of view. */
  versus: 'vs' | 'at';
  opponent: string;
  /** 'league' | 'non-league' | the postseason chip ('MCAL tournament', 'BVAL play-in', …). */
  kindLabel: string;
  /** The game page; the card also renders it as the last chip. */
  href: string;
  /** Real external links only (Directions, Stream, Tickets) — a chip is never a dead affordance. ≤ 2. */
  links: Array<{ label: string; href: string }>;
}

/**
 * The next fixture from a league's OFFICIAL schedule for a team MaxPreps has no contest for. The
 * fixture is real (the league published it); nothing is invented, and no result is shown until a
 * source reports one.
 */
export interface HomeOfficialFixture {
  dateLabel: string;
  dateKey: string;
  versus: 'vs' | 'at';
  opponent: string;
  /** The league's short name, for 'per BVAL'. */
  leagueShort: string;
  /** The official schedule this fixture came from. */
  scheduleUrl: string;
}

export interface HomeTeamView {
  team: HomeTeamIdentity;
  /** '1st · De Anza · SCVAL' | 'tied 1st · Santa Teresa · BVAL' | 'No results yet · MCAL'. */
  meta: string;
  /** '6 of 12 played' while league games are left, else null. */
  played: string | null;
  /**
   * ONE line: 'If the season ended today: <label>' in the regular phase, 'Final place: <label>'
   * later; null for a team with no league results (getTeamPostseasonLine returns null).
   */
  postseason: string | null;
  /**
   * Only for a place shared across two rungs, whose full label carries a tiebreak citation: the
   * card line as the rungs' badges ('Today: Play-in or No AQ route (tied)'). Absent otherwise (the
   * card derives its line with `postseasonCardLine`), so 43 views do not ship the line twice.
   */
  postseasonShort?: string;
  /** `/standings/<league>#<division>` */
  tableHref: string;
  /** false ⇒ nothing reported: no record is invented, and the card says so (DESIGN §8). */
  hasResults: boolean;
  /** '0-4-0' league and overall, or an em dash when nothing is reported. */
  leagueRecord: string;
  overallRecord: string;
  /** Oldest → newest, league only, at most 5 (outcomes only: the card's strip is marks, not links). */
  form: Outcome[];
  last: HomeLastGame | null;
  next: HomeNextGame | null;
  /** Used only when `next` is null — the official schedule still has a fixture (DESIGN §8). */
  officialNext: HomeOfficialFixture | null;
}

/** One tile of a league panel's "Teams in <SHORT>" grid (`PinTile`). */
export interface PinTileView {
  slug: string;
  leagueId: LeagueId;
  name: string;
  abbr: string;
  colors: HomeColors;
  /** The visible tile text, with soft hyphens where it needs them (lib/pin-label.ts `pickerName`). */
  pickerName: string;
  /** The pin button's accessible name (lib/pin-label.ts `pinLabel`): 'Pin Leigh, Mt. Hamilton · BVAL'. */
  pinLabel: string;
}

/** A league card in "Find your team" (`LeagueCard`). */
export interface LeagueCardView {
  id: LeagueId;
  shortName: string;
  name: string;
  sectionShort: 'CCS' | 'NCS';
  region: string;
  /** '12 teams' */
  teamsLine: string;
  /** Division labels; empty for a single-division league. */
  divisions: string[];
  standingsHref: string;
}

/** The postseason line's lead, full (the accessible text, SPEC §10.1) and as the card shows it. */
export const POSTSEASON_LEAD = {
  projected: { full: 'If the season ended today:', short: 'Today:' },
  final: { full: 'Final place:', short: 'Final:' },
} as const;

/**
 * The pinned card's VISIBLE postseason line, short enough for one 320px line (288px of text):
 * `postseasonShort` for a tie, else `postseason` with the short lead. The full `postseason` stays
 * the accessible text and the title. Null when there is no line.
 */
export function postseasonCardLine(view: Pick<HomeTeamView, 'postseason' | 'postseasonShort'>): string | null {
  if (!view.postseason) return null;
  if (view.postseasonShort) return view.postseasonShort;
  for (const lead of Object.values(POSTSEASON_LEAD)) {
    if (view.postseason.startsWith(`${lead.full} `)) return `${lead.short}${view.postseason.slice(lead.full.length)}`;
  }
  return view.postseason;
}
