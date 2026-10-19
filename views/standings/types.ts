/**
 * The shapes the standings views share: one table row (`StandingsRowData`, which
 * components/ui/StandingsTable.tsx renders), the status band's groups, the cross-check and
 * missing-result notes, and the full division view (`DivisionView`) that
 * views/standings/division.ts builds. Apart from the builders, so the overview
 * (views/standings/overview.ts) and the components can name a row without importing them.
 */

import type { DivisionId, LeagueId, TeamId, TeamSlug } from '@/lib/model/ids';
import type { PlayoffStatus, Standing } from '@/lib/model/standings';
import type { Team } from '@/lib/model/team';
import type { StandingContext } from '@/lib/queries/standings';

/**
 * One row of a standings table (components/ui/StandingsTable.tsx renders it): the standing, its
 * team and the row's link. Declared with the view models that build the rows, so a view never
 * imports a component.
 */
export interface StandingsRowData {
  standing: Standing;
  team: Team;
  /** Defaults to /teams/[slug]. */
  href?: string;
}

export interface StatusTeam {
  slug: TeamSlug;
  name: string;
  place: number;
  /** Level with another team, so the marker is "T-5th" and the line is unsettled. */
  shared: boolean;
}

export interface StatusGroup {
  status: PlayoffStatus;
  /** The ladder's code (`statusBadge`): a word or letters — never a hue on its own (DESIGN §6.5). */
  badge: string;
  /**
   * The status in words: the ladder rung's own label (`playoffOutcomeLabel`) — "Automatic
   * qualifier", "Play-in game Oct 30", "Semifinal bye", "MCAL tournament" — the same phrases
   * /playoffs prints, never a code like "AQ" a reader has to decode. The status band's chip.
   */
  statusText: string;
  /**
   * The rung's verbatim legend from config (`statusLegend`, SPEC §5.7 / §10.3): the place range
   * and what the rung leads to ("4th place — play-in Fri Oct 30 for the SCVAL 7th berth"), the
   * consequence the chip beside it cannot say.
   */
  label: string;
  teams: StatusTeam[];
}

export interface MismatchNote {
  slug: TeamSlug;
  name: string;
  field: string;
  ours: string;
  theirs: string;
  url: string;
}

/** One past official fixture with no counted result, or one postponed (never counted as missing). */
export interface MissingRowView {
  key: string;
  dateKey: string;
  /** `Sep 4` */
  dateLabel: string;
  /** `Hollister at Carmel` (postponed rows add ` — Postponed`). */
  matchup: string;
  /** `Sep 4 Hollister at Carmel` — the two above, as one line. */
  text: string;
  /** `si.com reports A x-y B; not counted: <note>` when si.com has a score D2 did not publish. */
  sbliveNote: string | null;
}

/** What the notes say about MaxPreps' own table for this division (SPEC §5.8, §10.3). */
export interface ComparisonView {
  /** The agreement sentence — only when trust is not informational, nothing is left out and no row differs. */
  agreement: string | null;
  /** `DivisionConfig.knownCause`, printed above the comparison lines when there is no agreement. */
  knownCause: string | null;
  /** `MaxPreps’ table leaves out <Team>.` per `maxprepsMissing` slug. */
  leftOut: string[];
  /** ⚑ marks a difference only in a `full` division; elsewhere a difference is an annotation. */
  flag: boolean;
}

export interface DivisionView {
  division: DivisionId;
  leagueId: LeagueId;
  leagueShort: string;
  /** `divisionHeading(division)`: null for a single-division league. */
  heading: string | null;
  /** The section kicker: the heading, or `League table` for a single-division league. */
  kicker: string;
  /** How a sentence names this table: the heading, or the league's short name. */
  label: string;
  rows: StandingsRowData[];
  context: ReadonlyMap<TeamId, StandingContext>;
  gdDomain: number;
  /** The table's `<caption>`: visually hidden in every variant. */
  caption: string;
  /** The section heading's meta line. */
  meta: string;
  /** Division-specific notes (pending games, no league results yet), visible in the Notes block. */
  footnotes: string[];
  /** Generic sentences, printed once per page. */
  legendNotes: string[];
  /** 1-based row index to draw the 2px ladder line after (`DivisionConfig.ladderLine`). */
  berthRuleAfter?: number;
  /** `AQ line`, `Play-in host`, `Tournament line`; null when the division draws no line (EAL). */
  ladderLineLabel: string | null;
  statusGroups: StatusGroup[];
  /** `CCS qualifying, as things stand` / `MCAL tournament, as things stand` / `Super Regional, as things stand`. */
  statusHeading: string;
  /**
   * The band's lead sentence, from config: the San Diego Section's `qualificationLine` (who the Section
   * places, and the one place a league table decides). null for every other kind.
   */
  statusIntro: string | null;
  /**
   * A league with no postseason (the Sunset): the band is replaced by this note (`postseason.note`) and
   * its source link; null for every other league, which draws its band.
   */
  noPostseason: { note: string; sourceLabel: string; sourceUrl: string } | null;
  /**
   * The league has a fixed number of league games per team (`gamesPerTeam` set): GP reads "6/12" and
   * LEFT and MAX are shown. false for the Sunset: GP is the bare count and LEFT and MAX are not drawn.
   */
  fixedSchedule: boolean;
  /** Why a ladder line is not settled, when a shared place straddles two rungs. */
  statusCaveat: string | null;
  /**
   * `/playoffs#<league>` for a CCS league or an unbracketed tournament (its card on /playoffs),
   * `/playoffs/<league>` for a league tournament.
   */
  playoffsHref: string;
  playoffsLinkText: string;
  /** Teams with no reported results — named, never ranked. */
  unrankedTeams: string[];
  mismatches: MismatchNote[];
  comparison: ComparisonView;
  /** Rows of kind 'missing', then the postponed ones (listed after them, never counted). */
  missing: MissingRowView[];
  postponed: MissingRowView[];
  /**
   * `On <League>’s official schedule for a date that has passed, with no counted result yet:`, or, for
   * a league with no schedule document, `Marked by MaxPreps as <SHORT> league games, dated before
   * today, with no counted result yet:`.
   */
  missingIntro: string;
  /** The one-line banner above the table; null when nothing is missing. */
  missingBanner: string | null;
  /** The banner's link target, `missing-<division>`. */
  missingId: string;
  /** Counted games of this table whose score came from si.com. */
  backfilledGames: number;
  /** The † footnote; null when no counted score came from si.com. */
  backfillFootnote: string | null;
  /** The league's schedule document; null when it publishes none (`official.mode: 'none'`). */
  officialSchedule: { href: string; label: string } | null;
  /**
   * `Scheduled per <SHORT>` — the source line beside the official schedule link; for a league with no
   * document, `League games as MaxPreps marks them (<SHORT> publishes no schedule)`.
   */
  scheduledPer: string;
  /**
   * The Notes block's sentence after a place difference MaxPreps' win-percentage order explains
   * (`rankRuleText`, from config).
   */
  rankRule: string;
  /** MaxPreps' table for this division; null when MaxPreps publishes none (the San Diego Section's Valley). */
  sourceUrl: string | null;
  /** Why there is no MaxPreps table to link or compare (`crossCheckSkipReason`), or null. */
  sourceSkipped: string | null;
  throughDate: string | null;
  leagueFinals: number;
  pendingLeagueGames: number;
}
