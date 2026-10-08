/**
 * The standings view models (SPEC §10.3): one league's full tables (`/standings/<league>`) and
 * the compact all-league overview (`/standings`).
 *
 * PURE with respect to the snapshot: it takes records in (standings, teams, cross-check rows,
 * per-row context, missing official results) and returns strings and arrays, so it never touches
 * `fs` or lib/data and can be exercised from a test over any snapshot. League FACTS — headings,
 * ladders, citations, official sources, the cross-check trust — come from config (lib/leagues),
 * and the ladder's badges and legends from lib/standings, never from a map keyed by division id.
 *
 * Everything it decides is a by-law, not a preference:
 *
 *  - Order and points are the league's (3 for a win, 1 for a tie in all five NorCal leagues) —
 *    lib/standings has already ranked the rows, so this module never re-sorts them. The EAL uses its
 *    points only to decide its title and publishes no standings (`rules.orderScope: 'title'`); the
 *    site orders its table by the same points and says so. The Sunset and the three San Diego
 *    leagues publish no points rule and no standings at all (`orderScope: 'site'`, DESIGN-socal
 *    §2.1.7): the order is this site's own 3-1-0 points, and every sentence here says exactly that,
 *    never that a league rule requires it.
 *  - A league with no fixed schedule (`gamesPerTeam` null: the Sunset, whose ten teams meet 0, 1 or
 *    2 times) has no "of N", so no LEFT or MAX column and no sentence explaining them.
 *  - A league with no postseason (`postseason.kind` 'no-postseason': the Sunset, CIF-SS Blue Book
 *    Bylaws 2011.1 and 3500.2) draws no status band and no ladder line; its card says why, from
 *    config. A league in its section's own playoffs ('section-playoffs': the San Diego Section,
 *    Green Book Bylaw 2000.1) shows one rung that a league place decides (1st: the designated
 *    champion's play-in) and says the rest is the Section's selection, never a projected seed.
 *  - A league with no schedule document (`official.mode: 'none'`, the EAL) gets no official
 *    schedule link, and its missing results are the past games MaxPreps marks as league games with
 *    no counted result: no sentence calls them "official".
 *  - Places can be SHARED: an uncomputable last step (a coin flip, a blind draw, a play-in) leaves
 *    teams level with `tiebreak.shared === true`. That is why the ladder line is COUNTED (how many
 *    rows sit at or above it) rather than assumed.
 *  - Postseason status is the league's ladder (`statusesOf(league)`); a team with no reported
 *    results gets NO projected place at all.
 *  - A division label is rendered only through `divisionHeading()`: a single-division league
 *    (PCAL, MCAL, EAL) has none, and MaxPreps' own table names (config data only) are never a
 *    string here.
 */

import type { MissingOfficialResult, StandingContext } from '../../lib/data';
import { monthDay, officialSourceFormat, ordinal, shortDate } from '../../lib/format';
import {
  divisionHeading,
  getDivision,
  getLeague,
  ladderFor,
  leagueStandingsUrl,
  regionOf,
  sectionOf,
  standaloneName,
  statusesOf,
  type DivisionConfig,
  type LeagueConfig,
} from '../../lib/leagues';
import {
  crossCheckSkipReason,
  outcomesFor,
  playoffOutcomeLabel,
  statusBadge,
  statusLegend,
  unevenGamesSentence,
} from '../../lib/standings';
import type {
  CrossCheckRow,
  DivisionId,
  LeagueId,
  OfficialSourceId,
  PlayoffStatus,
  Standing,
  Team,
  TeamId,
  TeamSlug,
  TiebreakStage,
} from '../../lib/types';
import type { StandingsRowData } from '../ui/StandingsTable';

// ---------------------------------------------------------------- shared shapes

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

// ---------------------------------------------------------------- small helpers

/**
 * Where a table's labelled ladder line goes: after how many rows, or null for no line.
 *
 * COUNTED, not assumed: the line sits under every ranked row whose place is at or above `after`,
 * so with two teams level on the line there are more rows above it than `after` says, and two
 * teams level on 1st both sit above Santa Teresa's "Play-in host" line. No line before any
 * result (nothing above it), none when every row is above it (nothing below), and none for a
 * division that draws no line (`after` null: the EAL). Rows come in table order, ranked rows
 * first, so the rows above the line are always the first ones. The full table
 * (`buildDivisionView`), the compact one, the home mini table (over its shown rows) and the
 * league-tournament seeds all place their line through here.
 */
export function ladderLineAfter(
  rows: readonly { ranked: boolean; place: number }[],
  after: number | null | undefined,
): number | null {
  if (after === null || after === undefined) return null;
  const above = rows.filter((r) => r.ranked && r.place <= after).length;
  return above > 0 && above < rows.length ? above : null;
}

/** A standings (or seeds) row as `ladderLineAfter` reads it. */
export function ladderRow(row: { standing: Standing }): { ranked: boolean; place: number } {
  return { ranked: row.standing.hasReportedResults, place: row.standing.computed.place };
}

/** The official schedule link's label, by source (SPEC §10.3). */
export function officialScheduleLabel(source: OfficialSourceId): string {
  return `Official schedule (${officialSourceFormat(source)})`;
}

/** `3-1-0`: the league's points for a win, a tie and a loss, from config (never typed into copy). */
export function pointsWords(league: LeagueConfig): string {
  const { win, tie, loss } = league.rules.points;
  return `${win}-${tie}-${loss}`;
}

/**
 * `SCVAL ranks by points (Art. VI §2), and so do we.` — from the league's citations. A league that
 * uses points only for its title (`orderScope: 'title'`, the EAL) publishes no standings, so the
 * sentence says the order is the site's. A league with no points rule at all (`'site'`: the Sunset and
 * the San Diego leagues) gets the site's own points, said as the site's, never as a league rule.
 */
export function rankRuleText(league: LeagueConfig): string {
  const { shortName: short } = league;
  const cite = league.rules.citations.pointsShort;
  switch (league.rules.orderScope) {
    case 'table':
      return `${short} ranks by points (${cite}), and so do we.`;
    case 'title':
      return `${short} decides its title on points (${cite}) and publishes no standings; this site orders the whole table by the same points.`;
    case 'site':
      return `The order is this site’s ${pointsWords(league)} points; no ${short} rule orders the table.`;
  }
}

/** The legend's sentence on whose order the table is (by `rules.orderScope`). */
function orderLegendText(league: LeagueConfig): string {
  const short = league.shortName;
  switch (league.rules.orderScope) {
    case 'table': {
      const chain = league.rules.tiebreaks.default;
      return chain[chain.length - 1] === 'coin-flip'
        ? `This order is our computation from published results, not a league ruling: the official tiebreak, including any coin flip, belongs to ${short}.`
        : `This order is our computation from published results, not a league ruling: the official tiebreak belongs to ${short}.`;
    }
    case 'title':
      return `This order is our computation from published results, not a league ruling: ${short} publishes no standings.`;
    case 'site':
      return `This order is our computation from published results, not a league ruling: ${short} publishes no standings and no points rule, so the order is this site’s ${pointsWords(league)} points.`;
  }
}

/**
 * The Notes source line: `Scheduled per <SHORT>`, or where a league with no document's games come from:
 * MaxPreps' league flag (the EAL, the Sunset: 'contest-type'), or every game between two division members
 * on MaxPreps' schedules (the San Diego leagues: 'membership', whose flag misses many league games). A group
 * of independents (the LA independents, DESIGN §24.10) is in no league, so its line is the
 * division's own note: why the five are grouped and what the table counts.
 */
function scheduledPerText(league: LeagueConfig, official: DivisionConfig['official']): string {
  if (official.mode !== 'none') return `Scheduled per ${league.shortName}`;
  if (league.independents) return official.note.replace(/\.$/, '');
  // The subject is the league alone, so it is its `standaloneName`: 'North publishes no schedule' could
  // be read as a direction, 'North County publishes no schedule' cannot. Every other league's is its short name.
  const subject = standaloneName(league.id);
  return league.rules.classification === 'membership'
    ? `League games are every game between two division members on MaxPreps’ schedules (${subject} publishes no schedule)`
    : `League games as MaxPreps marks them (${subject} publishes no schedule)`;
}

/** The intro of the missing-results list, by whether the league has a schedule document, and by its classification. */
function missingIntroText(league: LeagueConfig, official: DivisionConfig['official'], label: string): string {
  if (official.mode !== 'none') {
    return `On ${league.name}’s official schedule for a date that has passed, with no counted result yet:`;
  }
  return league.rules.classification === 'membership'
    ? `Games between two ${label} teams on MaxPreps’ schedules, dated before today, with no counted result yet:`
    : `Marked by MaxPreps as ${league.shortName} league games, dated before today, with no counted result yet:`;
}

/**
 * `⚑ 1 official league result missing — listed below the table.` / `… results …`. `official: false`
 * (a league with no schedule document, the EAL) drops the word: `⚑ 1 league result missing — …`.
 */
export function missingBannerText(n: number, opts: { official?: boolean } = {}): string {
  const kind = opts.official === false ? 'league' : 'official league';
  return n === 1
    ? `⚑ 1 ${kind} result missing — listed below the table.`
    : `⚑ ${n} ${kind} results missing — listed below the table.`;
}

/** The si.com backfill footnote under a table with a † (singular / plural, verbatim). */
export function backfillFootnoteText(n: number): string {
  return n === 1
    ? '† Includes 1 result from High School on SI (si.com) that MaxPreps does not have, counted under the site’s rules for missing or wrong scores (About → Sources).'
    : `† Includes ${n} results from High School on SI (si.com) that MaxPreps does not have, counted under the site’s rules for missing or wrong scores (About → Sources).`;
}

/**
 * The postseason block's heading and link, from the league's postseason kind (no CCS for NCS or NS).
 * An unbracketed tournament (the EAL's Super Regional) has no bracket page: it links its card on
 * /playoffs, as do the two Southern California kinds (the Sunset's card says there are no playoffs; a
 * San Diego league's card sits in the Section's block). A 'no-postseason' league draws no band, so its
 * heading is only the card's link words.
 */
function postseasonLinks(league: LeagueConfig): { heading: string; href: string; linkText: string } {
  const ps = league.postseason;
  switch (ps.kind) {
    case 'league-tournament':
      return { heading: `${ps.name}, as things stand`, href: `/playoffs/${league.id}`, linkText: 'Tournament bracket' };
    case 'unbracketed-tournament':
      return { heading: `${ps.name}, as things stand`, href: `/playoffs#${league.id}`, linkText: 'Postseason' };
    case 'ccs-ladder':
      return { heading: 'CCS qualifying, as things stand', href: `/playoffs#${league.id}`, linkText: 'Playoff picture' };
    case 'no-postseason':
      return { heading: 'Postseason', href: `/playoffs#${league.id}`, linkText: 'Postseason' };
    case 'section-playoffs':
      return { heading: `${ps.name}: the league route, as things stand`, href: `/playoffs#${league.id}`, linkText: ps.name };
  }
}

/** The league's qualification rule, cited once in the legend (by postseason kind). */
function postseasonCitation(league: LeagueConfig): string {
  const ps = league.postseason;
  switch (ps.kind) {
    case 'ccs-ladder':
      return ps.citation;
    case 'league-tournament':
      return ps.citations.format;
    case 'unbracketed-tournament':
      return ps.citations.qualification;
    case 'no-postseason':
      return ps.citations.noPlayoffs;
    case 'section-playoffs':
      return ps.citations.qualification;
  }
}

function teamShort(teams: readonly Team[], slug: TeamSlug | null, fallback: string): string {
  return (slug ? teams.find((t) => t.slug === slug)?.shortName : undefined) ?? fallback;
}

function missingRowView(row: MissingOfficialResult, teams: readonly Team[], index: number): MissingRowView {
  const away = teamShort(teams, row.awaySlug, row.awayName);
  const home = teamShort(teams, row.homeSlug, row.homeName);
  const dateLabel = monthDay(row.dateKey);
  const matchup = row.kind === 'postponed' ? `${away} at ${home} — Postponed` : `${away} at ${home}`;
  return {
    key: `${row.dateKey}-${row.awaySlug ?? row.awayName}-${row.homeSlug ?? row.homeName}-${index}`,
    dateKey: row.dateKey,
    dateLabel,
    matchup,
    text: `${dateLabel} ${matchup}`,
    sbliveNote:
      row.kind === 'missing' && row.sblive
        ? `si.com reports ${away} ${row.sblive.away}-${row.sblive.home} ${home}; not counted: ${row.sblive.note}`
        : null,
  };
}

// ---------------------------------------------------------------- the full division view

export interface DivisionViewInput {
  division: DivisionId;
  /** Already sorted and ranked by lib/standings.ts. */
  standings: readonly Standing[];
  teams: readonly Team[];
  /** Cross-check rows of the league (filtered to this division's teams here). */
  crossCheck: readonly CrossCheckRow[];
  /** `getStandingContext(division)`. */
  context: ReadonlyMap<TeamId, StandingContext>;
  /** `getMissingOfficialResults(division)`. */
  missing: readonly MissingOfficialResult[];
  /** Counted finals of this division whose score came from si.com. */
  backfilledGames: number;
  gdDomain: number;
  /** dateKey of the most recent league game with a published result. */
  throughDate: string | null;
  leagueFinals: number;
  pendingLeagueGames: number;
}

export function buildDivisionView(input: DivisionViewInput): DivisionView {
  const config = getDivision(input.division);
  const league = getLeague(config.leagueId);
  const heading = divisionHeading(input.division);
  const label = heading ?? league.shortName;
  const teamById = new Map(input.teams.map((t) => [t.id, t]));
  const nameOf = (slug: TeamSlug) => input.teams.find((t) => t.slug === slug)?.shortName ?? slug;

  const rows: StandingsRowData[] = [];
  for (const standing of input.standings) {
    const team = teamById.get(standing.teamId);
    if (team) rows.push({ standing, team });
  }

  const ranked = rows.filter((r) => r.standing.hasReportedResults);
  const unrankedTeams = rows.filter((r) => !r.standing.hasReportedResults).map((r) => r.team.name);

  // COUNTED, not assumed (ladderLineAfter). A division with no line (the EAL: every team is inside
  // the Super Regional's top six) draws none.
  const line = config.ladderLine;
  const berthRuleAfter = ladderLineAfter(rows.map(ladderRow), line?.after) ?? undefined;

  // A level place spans as many finishing slots as the tied group has teams, so it can hold two
  // rungs at once; grouping on `playoffStatus` alone would make a rung (the play-in, say) vanish.
  const statusGroups: StatusGroup[] = [];
  const divisionStatuses = new Set(ladderFor(input.division).map((r) => r.status));
  // A league with no postseason draws no band (its card says why), so it groups nothing.
  const noPostseason = league.postseason.kind === 'no-postseason';
  for (const status of statusesOf(league.id)) {
    if (noPostseason || !divisionStatuses.has(status)) continue;
    const teams = ranked
      .filter((r) => outcomesFor(r.standing).includes(status))
      .map((r) => ({
        slug: r.team.slug,
        name: r.team.shortName,
        place: r.standing.computed.place,
        shared: r.standing.tiebreak.shared,
      }));
    if (teams.length > 0) {
      statusGroups.push({
        status,
        badge: statusBadge(input.division, status),
        statusText: playoffOutcomeLabel(input.division, [status]),
        label: statusLegend(input.division, status),
        teams,
      });
    }
  }

  // Only a shared place that STRADDLES two rungs leaves a line unsettled.
  const contested = [
    ...new Set(
      ranked
        .filter((r) => r.standing.tiebreak.shared && outcomesFor(r.standing).length > 1)
        .map((r) => r.standing.computed.place),
    ),
  ].sort((a, b) => a - b);
  const suffix = league.rules.unresolvedSuffix;
  const statusCaveat = contested.length
    ? `${contested
        .map((place) => {
          const n = ranked.filter((r) => r.standing.computed.place === place).length;
          return `${n} teams are level on ${ordinal(place)}`;
        })
        .join(' and ')}, so this line is not settled here${suffix ? ` ${suffix}` : ''}. ` +
      'A level place spans every slot it covers, so a team can appear under two markers above.'
    : null;

  const slugs = new Set(rows.map((r) => r.team.slug));
  const mismatches: MismatchNote[] = input.crossCheck
    .filter((row) => slugs.has(row.slug))
    .map((row) => ({
      slug: row.slug,
      name: nameOf(row.slug),
      field: row.field,
      ours: row.ours,
      theirs: row.theirs,
      url: row.url,
    }));

  // "MaxPreps’ table leaves out X" only where MaxPreps HAS a table for the division. The San Diego
  // Section's Valley has none (`crossCheckSkipReason`), yet all six of its teams sit in
  // maxprepsMissing, which the count invariant in lib/leagues.ts needs (maxprepsTeamCount 0 + 6 = 6);
  // six "leaves out" lines followed by "MaxPreps publishes no table" contradicted each other (review
  // 2026-10-06). The no-table sentence alone says it.
  const leftOut =
    crossCheckSkipReason(input.division) !== null
      ? []
      : config.maxprepsMissing.map(
          (slug) => `MaxPreps’ table leaves out ${input.teams.find((t) => t.slug === slug)?.name ?? slug}.`,
        );
  const agrees =
    config.reportedTrust !== 'informational' && config.maxprepsMissing.length === 0 && mismatches.length === 0;
  const comparison: ComparisonView = {
    agreement: agrees
      ? `Our computed records match MaxPreps’ published ${label} table for every team.`
      : null,
    knownCause: agrees ? null : config.knownCause,
    leftOut: agrees ? [] : leftOut,
    flag: config.reportedTrust === 'full',
  };

  const missingRows = input.missing.filter((r) => r.kind === 'missing');
  const postponedRows = input.missing.filter((r) => r.kind === 'postponed');
  const missing = missingRows.map((r, i) => missingRowView(r, input.teams, i));
  const postponed = postponedRows.map((r, i) => missingRowView(r, input.teams, i));

  const through = input.throughDate ? shortDate(input.throughDate) : null;
  const meta = through ? `League games only · through ${through}` : 'League games only · none played yet';
  // "Division" only for NorCal, where the leagues call their groupings divisions (SCVAL's De Anza,
  // BVAL's Mt. Hamilton). The San Diego Section's alignment calls City Western or Palomar a league
  // inside a conference, and its own "Division I" / "Division II" are playoff tiers, so a SoCal
  // caption reads "Palomar league standings" (review 2026-10-06).
  // A group of independents is named in full: 'LA independents standings', never 'Independent
  // league standings' (DESIGN §24.10).
  const tableWords = heading
    ? regionOf(league.id) === 'socal'
      ? `${heading} league standings`
      : `${heading} Division league standings`
    : league.independents
      ? `${league.name} standings`
      : `${league.shortName} league standings`;
  const caption = through
    ? `${tableWords}, league games only, through ${through}. Computed from published results; unofficial.`
    : `${tableWords}. No league game has been reported yet.`;

  const citation = postseasonCitation(league);
  const legendNotes: string[] = [];
  if (!line) {
    legendNotes.push(`${citation}.`);
  } else if (berthRuleAfter) {
    legendNotes.push(
      `The labelled line after ${ordinal(berthRuleAfter)} place is the ${line.label} — ${citation}.`,
    );
  } else {
    legendNotes.push(`${line.label}: ${citation}.`);
  }
  legendNotes.push(orderLegendText(league));

  const footnotes: string[] = [];
  if (input.pendingLeagueGames > 0) {
    // In words, not a list of column codes ("not in W-L-T, PTS, GF, GA, GD…"): "anywhere above"
    // is the whole claim and every reader can check it.
    footnotes.push(
      input.pendingLeagueGames === 1
        ? "1 league game was played but has no score yet, so it isn't counted anywhere above."
        : `${input.pendingLeagueGames} league games were played but have no score yet, so they aren't counted anywhere above.`,
    );
  }
  if (input.leagueFinals === 0) {
    footnotes.push('No league result has been published yet, so no team is ranked and every record reads 0-0-0.');
  }

  const links = postseasonLinks(league);
  return {
    division: input.division,
    leagueId: league.id,
    leagueShort: league.shortName,
    heading,
    kicker: heading ?? 'League table',
    label,
    rows,
    context: input.context,
    gdDomain: input.gdDomain,
    caption,
    meta,
    footnotes,
    legendNotes,
    ...(berthRuleAfter ? { berthRuleAfter } : {}),
    ladderLineLabel: line?.label ?? null,
    statusGroups,
    statusHeading: links.heading,
    statusIntro: league.postseason.kind === 'section-playoffs' ? league.postseason.qualificationLine : null,
    noPostseason:
      league.postseason.kind === 'no-postseason'
        ? {
            note: league.postseason.note,
            sourceLabel: league.postseason.sourceLabel,
            sourceUrl: league.postseason.sourceUrl,
          }
        : null,
    fixedSchedule: config.gamesPerTeam !== null,
    statusCaveat,
    playoffsHref: links.href,
    playoffsLinkText: links.linkText,
    unrankedTeams,
    mismatches,
    comparison,
    missing,
    postponed,
    missingIntro: missingIntroText(league, config.official, label),
    missingBanner:
      missing.length > 0 ? missingBannerText(missing.length, { official: config.official.mode !== 'none' }) : null,
    missingId: `missing-${input.division}`,
    backfilledGames: input.backfilledGames,
    backfillFootnote: input.backfilledGames > 0 ? backfillFootnoteText(input.backfilledGames) : null,
    officialSchedule:
      config.official.mode === 'none'
        ? null
        : { href: config.official.scheduleUrl, label: officialScheduleLabel(config.official.source) },
    scheduledPer: scheduledPerText(league, config.official),
    rankRule: rankRuleText(league),
    sourceUrl: leagueStandingsUrl(input.division),
    sourceSkipped: crossCheckSkipReason(input.division),
    throughDate: input.throughDate,
    leagueFinals: input.leagueFinals,
    pendingLeagueGames: input.pendingLeagueGames,
  };
}

// ---------------------------------------------------------------- page-level footnotes

const STAGE_WORDS: Readonly<Record<TiebreakStage, string>> = {
  points: 'points',
  'head-to-head': 'head-to-head',
  'division-wins': 'division wins',
  'h2h-goals-against': 'fewest goals given up between the tied teams',
  'h2h-goal-diff': 'head-to-head goal differential',
  'division-goals-against': 'fewest goals allowed in division play',
  'record-vs-higher-placed': 'record against each higher-placed team',
  'record-vs-lower-placed': 'record against each lower-placed team',
  'h2h-win-pct': 'head-to-head winning percentage',
  'record-above-tie': 'record against the teams above the tie',
  'draw-number': 'spring draw numbers',
  'ccs-points': 'the CCS-points step, then a coin flip or blind draw',
  'coin-flip': 'a coin flip',
  'no-rule': 'no tiebreak',
  'play-in': 'a play-in',
};

function chainWords(chain: readonly TiebreakStage[]): string {
  return chain.map((stage) => STAGE_WORDS[stage]).join(', then ');
}

/**
 * The stage citations, compacted: the trailing parenthetical dropped and a shared document named
 * once (`Article VI §3, §4, §5, §6, §7`; `MCAL Tie-Breaking Criteria (rev. 3/26) step 1, step 2`).
 */
function chainCitations(league: LeagueConfig, stages: readonly TiebreakStage[]): string {
  const bases: string[] = [];
  for (const stage of stages) {
    const text = league.rules.citations.stages[stage];
    if (!text) continue;
    const base = text.replace(/\s*\((?:[^()]|\([^()]*\))*\)\s*$/, '').trim();
    if (/§|\bstep\b/.test(base) && !bases.includes(base)) bases.push(base);
  }
  const parts = bases.map((b) => b.match(/^(.*?)\s((?:§|step )\S+)$/));
  if (parts.length > 0 && parts.every((p) => p !== null)) {
    const prefixes = new Set(parts.map((p) => p![1]));
    if (prefixes.size === 1) return `${parts[0]![1]} ${parts.map((p) => p![2]).join(', ')}`;
  }
  return bases.join('; ');
}

/**
 * `PTS: <citations.points>. Ties: <chain in words> (<citations>).` — the rules footnote under a
 * league's last table (SPEC §10.3). A league with chains by points-bucket (PCAL) names each.
 */
export function rulesFootnote(leagueId: LeagueId): string {
  const league = getLeague(leagueId);
  const { tiebreaks, citations } = league.rules;
  const byStart = Object.entries(tiebreaks.byBucketStart ?? {})
    .filter((entry): entry is [string, readonly TiebreakStage[]] => entry[1] !== undefined)
    .sort((a, b) => Number(a[0]) - Number(b[0]));
  let ties: string;
  let stages: TiebreakStage[];
  if (byStart.length === 0) {
    ties = chainWords(tiebreaks.default);
    stages = [...tiebreaks.default];
  } else {
    const last = Number(byStart[byStart.length - 1][0]);
    ties = [
      ...byStart.map(([start, chain]) => `for ${ordinal(Number(start))}, ${chainWords(chain)}`),
      `below ${ordinal(last)}, ${chainWords(tiebreaks.default)}`,
    ].join('; ');
    stages = [...byStart.flatMap(([, chain]) => chain), ...tiebreaks.default];
  }
  const cites = chainCitations(league, stages);
  return `PTS: ${citations.points}. Ties: ${ties}${cites ? ` (${cites})` : ''}.`;
}

/** The uneven-GP footnote's last sentence: whose order the table is, by `rules.orderScope`. */
function unevenOrderSentence(league: LeagueConfig): string {
  switch (league.rules.orderScope) {
    case 'table':
      return `The order is points, as ${league.shortName} rules require.`;
    case 'title':
      return `The order is points, which ${league.shortName} uses to decide its title.`;
    case 'site':
      // Never "rules require": no Southern California league publishes a points rule (copy-rules).
      return `The order is this site’s ${pointsWords(league)} points; no ${league.shortName} rule orders the table.`;
  }
}

/**
 * The uneven-GP footnote (SPEC §10.3), or null when every team has played within one game of the
 * others. MCAL adds its incomplete-schedule rule; a league whose points decide only its title (EAL)
 * does not say its rules require the order, and a 'site' league says the order is the site's. A league
 * with no fixed schedule (`scheduled` null: the Sunset) has no LEFT or MAX column, so its footnote
 * explains neither; its first sentence is lib/standings.ts unevenGamesSentence's no-"of N" variant.
 */
export function unevenGpFootnote(
  leagueId: LeagueId,
  spread: { min: number; max: number; scheduled: number | null },
): string | null {
  const games = unevenGamesSentence(leagueId, spread);
  if (games === null) return null;
  const league = getLeague(leagueId);
  const columns =
    spread.scheduled === null
      ? ''
      : ' LEFT is league games with no counted result yet — still to play, or played and not reported. MAX is the most points a team could reach if it won all of them.';
  const base = `${games}${columns} ${unevenOrderSentence(league)}`;
  const incomplete = league.rules.citations.incomplete;
  return incomplete
    ? `${base} If the season ends with games unplayed, ${incomplete}; we will show that order then.`
    : base;
}

/** `Level on points at the top: Leigh & Branham` — the co-leaders line (label per SPEC §5.10). */
export function coLeadersLine(coLeaders: { label: string; teams: readonly Pick<Team, 'shortName'>[] } | null): string | null {
  if (!coLeaders || coLeaders.teams.length < 2) return null;
  return `${coLeaders.label}: ${coLeaders.teams.map((t) => t.shortName).join(' & ')}.`;
}

// ---------------------------------------------------------------- the /standings overview

export interface OverviewDivision {
  division: DivisionId;
  /** Division heading (h4) — null for a single-division league, which has no sub-header. */
  heading: string | null;
  /**
   * The division block's id: the division id, unless it equals the league id (PCAL, EAL), where the
   * league's heading carries it — ONE element per id. It sits on the block, not the h4, because a
   * single-division league (MCAL: `#marin-county`) has no h4.
   */
  anchorId: string | null;
  rows: StandingsRowData[];
  /** The labelled rule in the compact table; null when the division draws none (EAL). */
  ladderLine: { after: number; label: string } | null;
  /** `Full <division heading ?? SHORT> table`; the page adds the aria-hidden arrow (components/ui/Arrow). */
  fullLabel: string;
  /** `/standings/<league>#<division>` */
  fullHref: string;
  caption: string;
}

export interface OverviewLeague {
  id: LeagueId;
  /** `SCVAL — Santa Clara Valley Athletic League` */
  title: string;
  shortName: string;
  /** `LeagueConfig.membershipNote`: printed under the league's heading when its schools are not all in its section. */
  membershipNote: string | null;
  divisions: OverviewDivision[];
}

export interface OverviewSection {
  id: string;
  /** `Central Coast Section` / `North Coast Section` / `Northern Section` */
  name: string;
  leagues: OverviewLeague[];
}

export function buildOverviewDivision(input: {
  division: DivisionId;
  standings: readonly Standing[];
  teams: readonly Team[];
  throughDate: string | null;
}): OverviewDivision {
  const config = getDivision(input.division);
  const league = getLeague(config.leagueId);
  const heading = divisionHeading(input.division);
  const teamById = new Map(input.teams.map((t) => [t.id, t]));
  const rows: StandingsRowData[] = [];
  for (const standing of input.standings) {
    const team = teamById.get(standing.teamId);
    if (team) rows.push({ standing, team });
  }
  const through = input.throughDate ? `, through ${shortDate(input.throughDate)}` : '';
  return {
    division: input.division,
    heading,
    anchorId: config.id === league.id ? null : config.id,
    rows,
    ladderLine: config.ladderLine,
    fullLabel: `Full ${heading ?? league.shortName} table`,
    fullHref: `/standings/${league.id}#${config.id}`,
    caption: `${heading ? `${league.shortName} ${heading}` : league.shortName} standings, league games only${through}.`,
  };
}

/** The section → league → division outline, config order (SPEC §10.0 heading outline). */
export function overviewOutline(
  leagueIds: readonly LeagueId[],
  divisionOf: (division: DivisionId) => OverviewDivision,
): OverviewSection[] {
  const sections: OverviewSection[] = [];
  for (const id of leagueIds) {
    const league = getLeague(id);
    const section = sectionOf(id);
    let group = sections.find((s) => s.id === section.id);
    if (!group) {
      group = { id: section.id, name: section.name, leagues: [] };
      sections.push(group);
    }
    group.leagues.push({
      id,
      // A group of independents is not a league: its heading is its name alone ('LA independents').
      title: league.independents ? league.name : `${league.shortName} — ${league.name}`,
      shortName: league.shortName,
      membershipNote: league.membershipNote,
      divisions: league.divisions.map((d) => divisionOf(d.id)),
    });
  }
  return sections;
}

// ---------------------------------------------------------------- leader lines (metadata, OG)

/** One table's leaders — what a link preview or a `<title>` can carry. */
export interface LeaderLine {
  division: DivisionId;
  /** Division heading, or null for a single-division league. */
  heading: string | null;
  teams: Array<{ name: string; record: string; pts: number }>;
  /** A tie at the top. */
  tiedAtTop: boolean;
}

/**
 * One league's leaders as a single OG / metadata clause (SPEC §8.4): `De Anza: St. Ignatius 18 pts
 * · El Camino: Los Gatos 21 pts`; co-leaders at most two names joined with " & ", then ` +<n>`;
 * `No league results yet` before any result. The one builder of this row for both OG cards (the
 * root card, app/opengraph-image.tsx, and the /standings card) and the standings metadata.
 */
export function leaderClause(lines: readonly LeaderLine[]): string {
  if (lines.every((line) => line.teams.length === 0)) return 'No league results yet';
  return lines
    .map((line) => {
      const names =
        line.teams.length === 0
          ? 'no results yet'
          : `${line.teams
              .slice(0, 2)
              .map((t) => t.name)
              .join(' & ')}${line.teams.length > 2 ? ` +${line.teams.length - 2}` : ''} ${line.teams[0].pts} pts`;
      return line.heading ? `${line.heading}: ${names}` : names;
    })
    .join(' · ');
}
