import type { Game } from '@/lib/model/game';
import type { LeagueId, TeamSlug } from '@/lib/model/ids';
import type { GameRecords } from '@/views/shared/game-records';

/**
 * The props of the game-row family's four faces — GameRow, GameCard, GameLine and GameLogRow
 * (components/game-row/GameRow.tsx has the family's overview). Each face reads the ones it uses.
 */
export interface GameViewProps {
  game: Game;
  /** Orients "vs / at" and the W/L/T from this team's side. */
  perspective?: TeamSlug | null;
  showDate?: boolean;
  showTime?: boolean;
  /** Default true on /schedule and /; false in dense tables. */
  showRecap?: boolean;
  /**
   * The game's chips (league / NL, postseason), passed through to `StatusLabel`. It gates the
   * whole chip group, not only NL — but never the †, which travels with the score. Set it false
   * in a context that prints them elsewhere, or where every game is the same kind and marking
   * each one is noise — a CCS bracket (DESIGN §5.4).
   */
  showChips?: boolean;
  /**
   * A league-scoped list (`/schedule/<league>`): a side from ANOTHER league carries its league's
   * short name after its name (`Saint Francis · SCVAL`), so a cross-league game reads right in
   * both leagues' lists.
   */
  scopeLeague?: LeagueId | null;
  /**
   * GameRow / GameCard only: each registry side's current league record
   * (views/shared/game-records.ts `recordsFor`), printed beside its name on a league game (one that
   * counts for a league table, `countsFor`) that has no score yet ("Homestead 1-4-0"). GameList
   * passes them on /schedule/<league> and /scores/[date] only — a list with no perspective, where a
   * reader is sizing up a game before kickoff; their views resolve them (`recordsByGame`). Never on a
   * team page (the record is that page's headline) or in a bracket.
   */
  records?: GameRecords | null;
  /**
   * GameCard only: add an "NFHS stream" link beside Box score when the game has one. Only the
   * team page's Last card passes it: from 768px it replaces the phone's expanded row, whose
   * panel offers the stream, and a replay is what a parent wants from a game just played.
   */
  showStream?: boolean;
  /**
   * GameCard only: `'pills'` prints its links as the team page's Next card does — the accent
   * "Full game page" pill (still the stretched link) and 44px "MaxPreps box score" / "NFHS stream"
   * pills — so the Last and Next cards side by side word and size the same actions alike. Only that
   * Last card passes it; every other card keeps the compact `'text'` links.
   */
  linkStyle?: 'text' | 'pills';
  defaultExpanded?: boolean;
  className?: string;
}
