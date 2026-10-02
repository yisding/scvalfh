/**
 * The serializable view model the home page hands to its one client component.
 *
 * `MyTeamCard` is `'use client'` (DESIGN §7.12), so it cannot read `lib/data` — that module does an
 * `fs` read at import time. Everything it needs is therefore computed on the server and passed as
 * plain data: the §5.2 render decision for the last game arrives as a `GameDisplay`, already
 * resolved by `describeGame()`, so no score is ever re-derived on the client and the never-0-0 rule
 * stays in its single place (`renderScore()` in lib/format.ts).
 *
 * This file imports TYPES ONLY, so it is safe on both sides of the boundary.
 */

import type { Division, TeamColors } from '../../lib/types';
import type { FormEntry } from '../ui/FormStrip';
import type { GameDisplay } from '../ui/game-view';

/** Exactly the identity fields the card and the picker render. `TeamMonogram` needs the first three. */
export interface HomeTeamIdentity {
  abbr: string;
  name: string;
  colors: TeamColors;
  slug: string;
  shortName: string;
  mascot: string;
  division: Division;
  divisionLabel: string;
}

/** The pinned team's most recent final. */
export interface HomeLastGame {
  /** The whole §5.2 rendering decision, resolved server-side. */
  display: GameDisplay;
  /** true ⇒ `display.home` is the pinned team, so it takes the first line. */
  mineIsHome: boolean;
  /** 'Thu Sep 24' */
  dateLabel: string;
  /** The `<time datetime>` value. */
  dateTime: string;
  /** Cleaned at build (DESIGN §5.8); clamped to two lines when rendered. */
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
  isLeague: boolean;
  href: string;
  /** Real links only — a chip is never a dead affordance. */
  links: Array<{ label: string; href: string; external: boolean }>;
}

/**
 * The next fixture from the OFFICIAL SCVAL schedule grid for a team MaxPreps does not cover.
 * The games are real (SPEC §1.3), the results are not reported anywhere, and nothing is
 * backfilled or invented.
 */
export interface HomeOfficialFixture {
  dateLabel: string;
  dateKey: string;
  versus: 'vs' | 'at';
  opponent: string;
  /** The scval.com schedule PDF this fixture came from. */
  pdfUrl: string;
}

export interface HomeTeamView {
  team: HomeTeamIdentity;
  /** 'Mustangs · De Anza · 7th' — one line, already assembled. */
  meta: string;
  /** false ⇒ nothing reported: no record is invented, and the card says so (DESIGN §8). */
  hasResults: boolean;
  /** '0-4-0' league and overall, or an em dash when nothing is reported. */
  leagueRecord: string;
  overallRecord: string;
  /** Article VI §2 points, null when nothing is reported. */
  pts: number | null;
  /** The written playoff status (Article VII §2) — never a percentage. */
  playoffLabel: string;
  /** Oldest → newest, league only, at most 5. */
  form: FormEntry[];
  nonLeagueCount: number;
  last: HomeLastGame | null;
  next: HomeNextGame | null;
  /** Used only when `next` is null — the official grid still has a fixture (DESIGN §8). */
  officialNext: HomeOfficialFixture | null;
}
