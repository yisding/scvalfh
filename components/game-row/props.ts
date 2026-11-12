import type { Game, LeagueId } from '../../lib/types';

import type { Perspective } from '../ui/describe-game';

/** What every game row, card, line and log row takes. */
export interface GameBaseProps {
  game: Game;
  /** Orients "vs / at" and the W/L/T from this team's side. */
  perspective?: Perspective | null;
  /**
   * The game's chips (league / NL, postseason), passed through to `StatusLabel`. It gates the
   * whole chip group, not only NL — but never the †, which travels with the score. Set it false
   * in a context that prints them elsewhere, or where every game is the same kind and marking
   * each one is noise — a CCS bracket (DESIGN §5.4).
   */
  showChips?: boolean;
  className?: string;
}

/**
 * The options only some of the faces read. Each component takes `GameBaseProps` plus a `Pick` of
 * the fields it reads.
 */
export interface GameViewOptions {
  /** Print the date after the status word (`Final Sep 24`). */
  showDate?: boolean;
  /** @deprecated The status cell is the time for a game still to play; ignored. */
  showTime?: boolean;
  /** @deprecated Rows print no recap sentence (DESIGN §33); ignored. */
  showRecap?: boolean;
  /**
   * A league-scoped list (`/schedule/<league>`): a side from ANOTHER league carries its league's
   * short name after its name (`Saint Francis · SCVAL`), so a cross-league game reads right in
   * both leagues' lists.
   */
  scopeLeague?: LeagueId | null;
  /**
   * GameRow / GameCard only: print each registry side's current league record beside its name on
   * a league game (one that counts for a league table, `countsFor`) that has no score yet
   * ("Homestead 1-4-0"). GameList passes it on /schedule/<league> and /scores/[date] only — a
   * list with no perspective, where a reader is sizing up a game before kickoff. Never on a team
   * page (the record is that page's headline) or in a bracket.
   */
  showRecords?: boolean;
  /**
   * @deprecated Ignored: the game page carries the stream link.
   * GameCard only: add an "NFHS stream" link beside Box score when the game has one. Only the
   * team page's Last card passes it: from 768px it replaces the phone's expanded row, whose
   * panel offers the stream, and a replay is what a parent wants from a game just played.
   */
  showStream?: boolean;
  /**
   * @deprecated Ignored: the whole row is the game link.
   * GameCard only: `'pills'` prints its links as the team page's Next card does — the accent
   * "Full game page" pill (still the stretched link) and 44px "MaxPreps box score" / "NFHS stream"
   * pills — so the Last and Next cards side by side word and size the same actions alike. Only that
   * Last card passes it; every other card keeps the compact `'text'` links.
   */
  linkStyle?: 'text' | 'pills';
  /** @deprecated Nothing expands; ignored. */
  defaultExpanded?: boolean;
  /**
   * Each side's seed: the row's meta becomes the seed line (`7 v 2`). Only the CCS bracket passes it, and only once
   * both seeds are known.
   */
  seeds?: { away: number | null; home: number | null };
  /**
   * @deprecated Ignored: a row holds one link, to the game page.
   * GameRow / GameCard: a postseason game links its place on /playoffs ("CCS bracket", "Section bracket", "MCAL
   * bracket", components/playoffs/bracket-link.ts) beside the game page link. False where the row IS that place: the
   * brackets, the Tournament of Champions' and the Super Regional's game lists on /playoffs.
   */
  bracket?: boolean;
}
