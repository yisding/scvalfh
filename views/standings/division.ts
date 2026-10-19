/**
 * The standings view models (SPEC §10.3): one league's full tables (`/standings/<league>`) and
 * the compact all-league overview (`/standings`, views/standings/overview.ts).
 *
 * PURE with respect to the snapshot: it takes records in (standings, teams, cross-check rows,
 * per-row context, missing official results) and returns strings and arrays, so it never touches
 * `fs` or lib/queries/ and can be exercised from a test over any snapshot. League FACTS — headings,
 * ladders, citations, official sources, the cross-check trust — come from config (lib/config/leagues),
 * and the ladder's badges and legends from lib/engine/standings, never from a map keyed by division id.
 *
 * Everything it decides is a by-law, not a preference:
 *
 *  - Order and points are the league's (3 for a win, 1 for a tie in all five NorCal leagues) —
 *    lib/engine/standings has already ranked the rows, so this module never re-sorts them. The EAL uses its
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

import {
  getDivision, getLeague, isDefaultRegion, ladderFor, leagueStandingsUrl, regionOf, statusesOf,
} from '@/lib/config/leagues';
import { divisionHeading, standaloneName } from '@/lib/config/leagues/labels';
import {
  crossCheckSkipReason, outcomesFor, playoffOutcomeLabel, statusBadge, statusLegend,
} from '@/lib/engine/standings';
import { monthDay, shortDate } from '@/lib/format/dates';
import { ordinal } from '@/lib/format/numbers';
import { officialSourceFormat } from '@/lib/format/words';
import type { CrossCheckRow } from '@/lib/model/crosscheck';
import type { DivisionId, OfficialSourceId, TeamId, TeamSlug } from '@/lib/model/ids';
import type { DivisionConfig, LeagueConfig } from '@/lib/model/league-config';
import type { Standing, StandingContext } from '@/lib/model/standings';
import type { Team } from '@/lib/model/team';
import type { MissingOfficialResult } from '@/lib/queries/standings';

import { mismatchItems, pointsWords } from './footnotes';
import { collectStandingsNotes } from './table-notes';
import type {
  ComparisonView,
  DivisionView,
  MismatchNote,
  MissingRowView,
  StandingsRowData,
  StatusGroup,
} from './types';

// ---------------------------------------------------------------- small helpers

/**
 * What a division's table is called in its caption, here and in the home page's mini table
 * (views/home/mini-standings.ts): 'De Anza Division league standings', 'MCAL league standings'.
 *
 * "Division" only for NorCal, where the leagues call their groupings divisions (SCVAL's De Anza,
 * BVAL's Mt. Hamilton). The San Diego Section's alignment calls City Western or Palomar a league
 * inside a conference, and its own "Division I" / "Division II" are playoff tiers, so a SoCal
 * caption reads "Palomar league standings" (review 2026-10-06).
 * A group of independents is named in full: 'LA independents standings', never 'Independent
 * league standings' (DESIGN §24.10).
 */
export function tableSubject(league: LeagueConfig, heading: string | null): string {
  return heading
    ? isDefaultRegion(regionOf(league.id))
      ? `${heading} Division league standings`
      : `${heading} league standings`
    : league.independents
      ? `${league.name} standings`
      : `${league.shortName} league standings`;
}

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
  // Where the league is the subject it is its `standaloneName` ('North publishes no standings' reads
  // as a direction; 'North County publishes…' cannot). A group of independents is plural.
  const subject = standaloneName(league.id);
  const publishes = league.independents ? 'publish' : 'publishes';
  switch (league.rules.orderScope) {
    case 'table': {
      const chain = league.rules.tiebreaks.default;
      return chain[chain.length - 1] === 'coin-flip'
        ? `This order is our computation from published results, not a league ruling: the official tiebreak, including any coin flip, belongs to ${short}.`
        : `This order is our computation from published results, not a league ruling: the official tiebreak belongs to ${short}.`;
    }
    case 'title':
      return `This order is our computation from published results, not a league ruling: ${subject} ${publishes} no standings.`;
    case 'site':
      return `This order is our computation from published results, not a league ruling: ${subject} ${publishes} no standings and no points rule, so the order is this site’s ${pointsWords(league)} points.`;
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
  /** Already sorted and ranked by lib/engine/standings.ts. */
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
  // maxprepsMissing, which the count invariant in lib/config/leagues.ts needs (maxprepsTeamCount 0 + 6 = 6);
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
  const tableWords = tableSubject(league, heading);
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
        ? '1 league game was played but has no score yet, so it isn’t counted anywhere above.'
        : `${input.pendingLeagueGames} league games were played but have no score yet, so they aren’t counted anywhere above.`,
    );
  }
  if (input.leagueFinals === 0) {
    footnotes.push('No league result has been published yet, so no team is ranked and every record reads 0-0-0.');
  }

  const links = postseasonLinks(league);
  const sourceUrl = leagueStandingsUrl(input.division);
  // `footnotes` go last in the Notes block, so they are left out of the table's own list here.
  // A team the comparison list already names (it prints its items unless MaxPreps agrees) keeps
  // only that sentence: the ⚑ line would repeat it in other words.
  const tableNotes = collectStandingsNotes({
    rows,
    statedElsewhere: comparison.agreement ? [] : mismatches.map((m) => m.slug),
  });
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
    pointsCitation: league.rules.citations.points,
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
    noteItems: mismatchItems(mismatches, rows, sourceUrl),
    tableNotes,
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
    sourceUrl,
    sourceSkipped: crossCheckSkipReason(input.division),
    throughDate: input.throughDate,
    leagueFinals: input.leagueFinals,
    pendingLeagueGames: input.pendingLeagueGames,
  };
}
