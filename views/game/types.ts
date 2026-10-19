/**
 * The shapes the parts of the /game/[id] view share (views/game/game-view.ts and the topic modules
 * beside it): one side of the scoreboard, the season series, the result links, the score
 * disagreement and source lines, and how the game counts. They live apart from the view that
 * assembles them so a topic module can name a shape without importing that view
 * (tests/arch/layers.test.ts rule (g): no import cycle, type-only imports included).
 */

import type { BackfillProvenance, Game, Outcome } from '@/lib/model/game';
import type { Standing } from '@/lib/model/standings';
import type { Team } from '@/lib/model/team';
import type { FormEntry } from '@/views/shared/form-entry';
import type { SideView } from '@/views/shared/game-display-client';

export interface GameSideModel {
  /** The display name, from the snapshot. */
  name: string;
  /**
   * The name for a `<title>` and an OG card: the full name, or `shortName` when the full one is
   * too long for a link preview (over 24 characters: "Convent of the Sacred Heart" is 27 and would
   * eat a whole title on its own). The page body uses `name`, except the season-series sentence,
   * which uses the team's short name to match the meeting rows above it.
   */
  label: string;
  /** Present only for one of the teams this site follows; anyone else is a name (DESIGN §8). */
  team: Team | undefined;
  standing: Standing | undefined;
  /**
   * "4-1-0 De Anza" / "10-1-1 MCAL" — the LEAGUE record as of this contest (`recordAsOf`), not
   * today's — or the honest no-results line. `null` for a non-member.
   */
  sub: string | null;
  /** Up to five LEAGUE results BEFORE this contest, oldest first (DESIGN §5.5). */
  formBefore: FormEntry[];
  /** How many league games this side had played before this one — the form caption's subject. */
  playedBefore: number;
  /** This game's result from this side, when it is a final. */
  outcome: Outcome | null;
  /** The side's own page on si.com, when the slug was verified upstream. */
  sbliveUrl: string | undefined;
  /** The DESIGN §5.2 view of this side: glyph, weight, chip. */
  view: SideView;
}

export interface SeriesMeeting {
  game: Game;
  isThisGame: boolean;
}

export interface SeriesModel {
  meetings: SeriesMeeting[];
  /** One sentence naming the leader, or saying they have not played (DESIGN §3.5). */
  summary: string;
  /** The league's own head-to-head citation, when this is a counted game and the league breaks ties on it. */
  tiebreakNote: string | null;
  /** The perspective the rows are oriented from: this game's home side where possible. */
  perspective: GameSideModel;
}

/** An off-site link for this contest. `accent` marks the one primary pill. */
export interface GameLink {
  href: string;
  label: string;
  accent?: boolean;
}

export interface GameConflict {
  /** The ready-to-render sentence written by the pipeline (both numbers are in it). */
  note: string;
  /** What MaxPreps published, when it published anything. */
  maxpreps: { home: number; away: number } | null;
  /** What si.com published. */
  sblive: { home: number; away: number };
  sbliveUrl: string | null;
  maxprepsUrl: string | null;
}

/** The si.com source line (owner decision D2): shown whenever the published score is si.com's. */
export interface GameSourceLine {
  /** `Score via High School on SI (si.com): <rule note>.` */
  text: string;
  rule: BackfillProvenance['rule'] | null;
  sbliveUrl: string | null;
  maxprepsUrl: string | null;
}

/** How the game counts, in words (GameDetails "Counts as"). */
export interface CountsAs {
  /** `League game · De Anza Division` | `League game · MCAL` | `MCAL semifinal` | `Non-league game` */
  label: string;
  /** The sentence under it: the points citation, the postseason sentence, or the non-league rule. */
  detail: string;
  /** The classifier's own note when a same-division game does not count (verbatim). */
  classificationNote: string | null;
}
