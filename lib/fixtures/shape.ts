/**
 * The fixture ledger: this site's own record of a game, and where each source has it.
 *
 * Every source this site reads is wrong now and then: MaxPreps dates a game on the league's day and not the day
 * it was played, lists a game twice, stores a shootout tally as the score, or never lists the game at all. The
 * ledger is where this site says what a game WAS, once: one `CanonicalFixture` per game, stating its day, host and
 * visitor, and under `sources` which row of which source is that game. The sources are then merged into the
 * fixture (lib/fixtures/ledger.ts), never the other way round:
 *
 *  - the MaxPreps contest named in `sources.maxpreps` supplies everything the fixture does not state (the start
 *    time, the score, the links); where it disagrees with a fact the fixture cites (`date`, `host`, `result`) the
 *    fixture's fact is published and MaxPreps' version is kept in the game's provenance, which the game page prints;
 *  - a contest in `sources.maxprepsDuplicates` is another MaxPreps row for the same game and is dropped, as is a
 *    row in the ledger's `rejected` list, which is no game at all (a scrimmage, a row for a game never played);
 *  - the league fixture named in `sources.official` is this game, so the league's schedule, si.com's score for it
 *    and the JV game that goes with it are looked for on the fixture's day and at its host;
 *  - a fixture with a `listing` is on no feed: the listing is the citing source's account of it (start, site,
 *    result), and the game is on the schedule from it until a feed lists the pair on that day.
 *
 * A game with no fixture is published as the sources have it: the ledger holds only the games a person has had to
 * say something about. A fact is never stated twice: a game with a corrected date and a corrected result is one
 * fixture, and a correction to it is an edit to that fixture.
 */

import type { AddedGame, ContestId, ResultCorrection, TeamSlug } from '../types';

/** A citation: the source and what it says, one sentence without a final period, and its page where it has one. */
export interface FixtureCitation {
  source: string;
  url: string | null;
}

/**
 * What the citing source says of a game no feed lists (lib/types.ts AddedGame, without the day and the sides,
 * which are the fixture's own).
 */
export type FixtureListing = Omit<AddedGame, 'dateKey' | 'home' | 'away'>;

export interface CanonicalFixture {
  /** The day the game was played (YYYY-MM-DD), as this site records it. */
  dateKey: string;
  /** The school that hosted, by slug; at a neutral site, the side the sources list first. */
  home: TeamSlug;
  away: TeamSlug;
  /** Where each source has this game. At least one of `maxpreps`, `official` or the fixture's `listing`. */
  sources: {
    /** The MaxPreps contest that is this game. */
    maxpreps?: ContestId;
    /** Other MaxPreps contests that are this same game (a second row, a stale earlier date): each is dropped, with why. */
    maxprepsDuplicates?: Readonly<Record<ContestId, string>>;
    /**
     * The league fixture (`division:date:away@home`) that is this game, where it was played on another day, and
     * maybe at the other school, than the league's document says, and MaxPreps has no contest for it.
     */
    official?: string;
  };
  /**
   * Cited where `dateKey` is not the day the linked source gives. The source gives no start time, so none is
   * invented: the game reads "time TBA". `source` names the source, what it says, and what MaxPreps says.
   */
  date?: { source: string };
  /** Cited where `home` is the school MaxPreps lists as the visitor. */
  host?: FixtureCitation;
  /**
   * The result as a better source than the feed records it: the goals in play, the overtime periods, the tiebreak
   * tally; or, with `goals` null, the winner alone. Where MaxPreps has another result, it is kept on the game.
   */
  result?: ResultCorrection;
  /** The citing source's account of a game no feed lists. Never with `sources.maxpreps`. */
  listing?: FixtureListing;
}

export interface FixtureLedger {
  /** In the order they were recorded; a contest, a league fixture and a (day, pair) each appear in at most one. */
  fixtures: readonly CanonicalFixture[];
  /** MaxPreps contests that are no game at all, with why: dropped, and never a fixture. */
  rejected: Readonly<Record<ContestId, string>>;
}
