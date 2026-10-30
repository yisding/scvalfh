/**
 * The pure view models behind /playoffs (CCS) and /playoffs/<league> (league tournaments). No `fs`
 * and no `lib/data`: the pages read the snapshot and hand plain records down, so every builder here
 * is testable and safe anywhere. The only runtime imports are `lib/format`, the pure config in
 * `lib/leagues` (for `ladderFactsFor`) and the standings view's `ladderLineAfter` (the seeds'
 * tournament line). Server-only: no client component imports this module.
 *
 * CCS (SPEC §6.1, §10.7): the field is 16 teams, numbers only. Every CCS league qualifies by its own
 * LADDER (config): SCVAL's first three per division plus a 4th-place play-in, BVAL's Mt. Hamilton
 * 1st-3rd plus a play-in at the Santa Teresa champion, PCAL's top two. There is no merged 1-16 order:
 * no rule ranks a De Anza team against a Mt. Hamilton team, so the projection is one table per
 * division with a labelled separator after the division's `ladderLine`.
 *
 * Uncomputable steps (SCVAL Article VI §7's coin flip, BVAL §6f, PCAL §23.3's blind draw) leave
 * teams level (`tiebreak.shared`), and every consequence of that is derived here rather than
 * assumed: a shared last automatic place means more teams than berths, a shared play-in place leaves
 * the play-in unsettled, a shared at-large place means more than one at-large candidate. The ladder
 * facts that drive those sentences (how many automatic places, which place plays in, on what date)
 * come from config through `LadderFacts`, never from a literal.
 *
 * League tournaments (SPEC §6.2, MCAL): `buildTournamentView` turns `LeagueTournamentProjection`
 * into seeds, the play-in, and vertical rounds whose every unfilled slot reads `TBD` (or the written
 * rule), never blank.
 */

import {
  EM_DASH,
  byDateThenId,
  dateSpan,
  leagueClockPT,
  listWords,
  mapsSearchHref,
  monthDay,
  numberWord,
  ordinal,
  ordinalWord,
  placeWords,
  plural,
  recordString,
  recordWords,
  shortDate,
  timeOfDayPT,
} from '../../lib/format';
import { CCS, divisionHeading, getDivision, getLeague, ladderFor, leagueOfDivision } from '../../lib/leagues';
import { fixedSiteHost, winnerOf } from '../../lib/postseason';
import type { CcsConfig, LeagueConfig, OutsideTournamentConfig } from '../../lib/leagues';
import type {
  CcsKeyDates,
  CrossoverSeat,
  DivisionId,
  Game,
  LeaguePairing,
  LeagueTournamentProjection,
  PlayoffStatus,
  Standing,
  Team,
  TeamSlug,
  TiebreakStage,
  TournamentGame,
  TournamentSlot,
} from '../../lib/types';

import { ladderLineAfter, ladderRow } from '../standings/standings-view';
import { membershipSource } from '../ui/membership-words';

// ---------------------------------------------------------------- small helpers

function dateOnly(value: string): string {
  return value.slice(0, 10);
}

// ---------------------------------------------------------------- key dates

export type KeyDateKey =
  | 'entries'
  | 'seeding'
  | 'quarterfinals'
  | 'semifinals'
  | 'finals'
  | 'evaluation'
  | 'end-of-league-season'
  | `league:${string}`;

export interface KeyDateRow {
  key: KeyDateKey;
  /** 'YYYY-MM-DD' — the `<time datetime>` value. */
  dateKey: string;
  /** 'Sat Nov 7' */
  dateLabel: string;
  /** '1:00 PM PT', or null for an all-day date. */
  time: string | null;
  /** The league a date belongs to ('SCVAL', 'BVAL'); null for a CCS date. */
  leagueShort: string | null;
  label: string;
  detail: string;
  /** One of the three tournament rounds (set in ink and semibold). */
  isRound: boolean;
}

/** One league-owned date on the CCS calendar (a crossover, a play-in), from config pairings. */
export interface LeagueKeyDate {
  /** Stable key part, e.g. the league id. */
  id: string;
  /** 'SCVAL' */
  leagueShort: string;
  /** YYYY-MM-DD */
  date: string;
  /** League clock 'HH:MM' or null. */
  time: string | null;
  label: string;
  detail: string;
}

type CcsRound = 'quarterfinals' | 'semifinals' | 'finals';
const CCS_ROUNDS: readonly CcsRound[] = ['quarterfinals', 'semifinals', 'finals'];

/** Where a CCS round is played, from config: the higher seed's field through `highSeedHostsThrough`, neutral after. */
export function ccsRoundSite(round: CcsRound, hostsThrough: CcsConfig['highSeedHostsThrough'] = CCS.highSeedHostsThrough): 'home' | 'neutral' {
  return CCS_ROUNDS.indexOf(round) <= CCS_ROUNDS.indexOf(hostsThrough) ? 'home' : 'neutral';
}

/**
 * The round's detail line: who hosts, with the calendar's own words, and for a neutral round that each game's
 * site appears once MaxPreps lists it (the calendar names no venue).
 */
function roundSiteDetail(round: CcsRound, hostsThrough: CcsConfig['highSeedHostsThrough']): string {
  if (ccsRoundSite(round, hostsThrough) === 'home') return 'At the higher seed’s field (CCS calendar: “at Home Sites”).';
  return round === 'finals'
    ? 'At a neutral site set by CCS (CCS calendar: “at Neutral Site”); the site appears here once MaxPreps lists the game.'
    : 'At neutral sites set by CCS (CCS calendar: “at Neutral Sites”); each game’s site appears here once MaxPreps lists it.';
}

/**
 * The key-dates footer's first sentence, from config: 'Quarterfinals are at the higher seed’s field; the semifinals
 * and the final are at neutral sites set by CCS (the CIF-CCS field hockey calendar).' In 2025 the semifinals were in
 * fact at the higher seed's field, so the sentence says what the calendar says and no more.
 */
export function ccsHostingSentence(hostsThrough: CcsConfig['highSeedHostsThrough'] = CCS.highSeedHostsThrough): string {
  const home = CCS_ROUNDS.filter((r) => ccsRoundSite(r, hostsThrough) === 'home');
  const neutral = CCS_ROUNDS.filter((r) => ccsRoundSite(r, hostsThrough) === 'neutral');
  const words = (rounds: readonly CcsRound[]) => listWords(rounds.map((r) => (r === 'finals' ? 'the final' : `the ${r}`)));
  if (neutral.length === 0) return 'Every round is at the higher seed’s field (the CIF-CCS field hockey calendar).';
  const homeWords = words(home);
  const homePart = home.length > 0 ? `${homeWords[0].toUpperCase()}${homeWords.slice(1)} are at the higher seed’s field; ` : '';
  return `${homePart}${words(neutral)} ${neutral.length === 1 ? 'is' : 'are'} at neutral sites set by CCS (the CIF-CCS field hockey calendar).`;
}

/**
 * Every CCS key date plus each CCS league's own postseason date, in date order. The CCS dates come
 * from the CCS playoff-dates release (cross-confirmed by the CCS iCal feed once it is polled); the
 * league dates come from the official league schedules and by-laws (config pairings). Round details
 * say where each round is played, from `CCS.highSeedHostsThrough`.
 */
export function keyDateRows(
  k: CcsKeyDates,
  leagueDates: readonly LeagueKeyDate[] = [],
  hostsThrough: CcsConfig['highSeedHostsThrough'] = CCS.highSeedHostsThrough,
): KeyDateRow[] {
  const ccs = (
    key: KeyDateKey,
    iso: string,
    label: string,
    detail: string,
    opts: { time?: boolean; isRound?: boolean } = {},
  ): KeyDateRow => ({
    key,
    dateKey: dateOnly(iso),
    dateLabel: shortDate(iso),
    time: opts.time ? timeOfDayPT(iso) : null,
    leagueShort: null,
    label,
    detail,
    isRound: opts.isRound ?? false,
  });
  const rows: KeyDateRow[] = [
    ccs('end-of-league-season', k.endOfLeagueSeason, 'CCS end of league season', 'The last day a league game or league postseason game may be played.'),
    ccs('entries', k.entriesDue, 'CCS entries due', 'Leagues submit their qualifiers and at-large candidates.', { time: true }),
    ccs('seeding', k.seedingMeeting, 'CCS seeding meeting', 'The committee seeds both CCS divisions; the games appear here as MaxPreps lists them, after the next update.', { time: true }),
    ccs('quarterfinals', k.quarterfinals, 'Quarterfinals', roundSiteDetail('quarterfinals', hostsThrough), { isRound: true }),
    ccs('semifinals', k.semifinals, 'Semifinals', roundSiteDetail('semifinals', hostsThrough), { isRound: true }),
    ccs('finals', k.finals, 'Finals', roundSiteDetail('finals', hostsThrough), { isRound: true }),
    ccs('evaluation', k.evaluationMeeting, 'CCS evaluation meeting', 'The season review that closes the tournament.', { time: true }),
    ...leagueDates.map(
      (d): KeyDateRow => ({
        key: `league:${d.id}`,
        dateKey: dateOnly(d.date),
        dateLabel: shortDate(d.date),
        time: d.time ? leagueClockPT(d.time) : null,
        leagueShort: d.leagueShort,
        label: d.label,
        detail: d.detail,
        isRound: false,
      }),
    ),
  ];
  // Stable: date, then the published order above (a league date before CCS dates on the same day
  // never happens today, but the order must not depend on the sort implementation).
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => a.row.dateKey.localeCompare(b.row.dateKey) || a.index - b.index)
    .map(({ row }) => row);
}

// ---------------------------------------------------------------- projection

export interface ProjectionRow {
  team: Team;
  standing: Standing;
  /** The best status the team can take — `statuses[0]`. */
  status: PlayoffStatus;
  /**
   * Every status still open to the team, best first. A level place spans as many finishing slots
   * as the tied group has teams, so two teams level on 3rd hold the third automatic berth AND the
   * 4th-place play-in spot between them. Grouping on `status` alone would make that play-in slot
   * vanish from the division.
   */
  statuses: PlayoffStatus[];
  /** The WRITTEN status from lib/data's projection — never a percentage (DESIGN §7.11). */
  label: string;
  /** This place is shared with another team and we render them level. */
  shared: boolean;
}

/**
 * The division's ladder, as config states it (`ladderFor`, `ladderLine`, the league's pairings and
 * `rules.unresolvedSuffix`). Passed in, so this module never reads config itself.
 */
export interface LadderFacts {
  /** Number of automatic-qualifier places in this division (SCVAL 3, Mt. Hamilton 3, Santa Teresa 0, PCAL 2). */
  aqPlaces: number;
  /** The place that plays in, or null (PCAL). SCVAL and Mt. Hamilton 4, Santa Teresa 1. */
  playInPlace: number | null;
  /** The play-in's date as 'Oct 30', or null. */
  playInDate: string | null;
  /** The at-large place, when the league's ladder names one (SCVAL 5), else null. */
  atLargePlace: number | null;
  /** The ladder line: a labelled separator row after the row(s) holding this status. */
  line: { status: PlayoffStatus; label: string } | null;
  /** 'Article VI §7 decides it with a coin flip' — `rules.unresolvedSuffix` without its dash. */
  unresolved: string;
}

/**
 * The division's `LadderFacts` from config: the rungs that apply to it (`ladderFor`), its
 * `ladderLine`, the league pairing that seats its play-in place, and the league's unresolved suffix.
 */
export function ladderFactsFor(division: DivisionId): LadderFacts {
  const d = getDivision(division);
  const league = leagueOfDivision(division);
  const rungs = ladderFor(division);
  const rung = (status: PlayoffStatus) => rungs.find((r) => r.status === status);
  const aq = rung('aq');
  const playIn = rung('play-in');
  const atLarge = rung('at-large');
  const pairings = league.postseason.kind === 'ccs-ladder' ? league.postseason.pairings : [];
  const playInPlace = playIn ? playIn.places[0] : null;
  const pairing =
    playInPlace === null
      ? undefined
      : pairings.find((p) => p.isPlayIn && p.seats.some((s) => s.division === division && s.place === playInPlace));
  // Every CCS and tournament division draws a line; only an unbracketed league's may be null (EAL),
  // and it never reaches /playoffs' ladders.
  const ladderLine = d.ladderLine;
  const lineRung = ladderLine
    ? rungs.find((r) => r.places[0] <= ladderLine.after && ladderLine.after <= r.places[1])
    : undefined;
  return {
    aqPlaces: aq ? aq.places[1] - aq.places[0] + 1 : 0,
    playInPlace,
    playInDate: pairing ? monthDay(pairing.date) : null,
    atLargePlace: atLarge ? atLarge.places[0] : null,
    line: lineRung && ladderLine ? { status: lineRung.status, label: ladderLine.label } : null,
    unresolved: league.rules.unresolvedSuffix.replace(/^—\s*/, ''),
  };
}

export interface DivisionProjection {
  division: DivisionId;
  /** 'De Anza' — or the league's short name for a single-division league ('PCAL'). */
  divisionLabel: string;
  rows: ProjectionRow[];
  /** Rows currently holding one of the division's automatic berths. */
  autoRows: ProjectionRow[];
  playInRows: ProjectionRow[];
  atLargeRows: ProjectionRow[];
  /** 1-based row index after which the labelled ladder line is drawn. 0 ⇒ no line. */
  lineAfter: number;
  /** 'AQ line' / 'Play-in host'; null when no line is drawn. */
  lineLabel: string | null;
  /** One sentence per tied group, and one per by-law consequence of a tie. */
  notes: string[];
}

/** The per-tied-group footnote. `tiebreak.note` already cites the by-law, so it renders verbatim. */
export function sharedGroupNotes(rows: ReadonlyArray<{ team: Team; standing: Standing }>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    if (!row.standing.tiebreak.shared) continue;
    const key = [row.standing.teamId, ...row.standing.tiebreak.tiedWith].sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(`${row.team.name}: ${row.standing.tiebreak.note}`);
  }
  return out;
}

/**
 * Derive everything the projection table needs from the division's ranked rows.
 *
 * `rows` must already be in place order (that is what `getPlayoffProjection` returns). The line
 * follows the LAST row holding the line's status rather than a hardcoded place, so a shared last
 * automatic place — four teams, three berths — still draws the line where the data puts it.
 */
export function buildDivisionProjection(
  division: DivisionId,
  divisionLabel: string,
  rows: ProjectionRow[],
  ladder: LadderFacts,
): DivisionProjection {
  const holds = (row: ProjectionRow, status: PlayoffStatus) => row.statuses.includes(status);
  const autoRows = rows.filter((r) => holds(r, 'aq'));
  const playInRows = ladder.playInPlace !== null ? rows.filter((r) => holds(r, 'play-in')) : [];
  const atLargeRows = rows.filter((r) => holds(r, 'at-large'));

  let lineAfter = 0;
  if (ladder.line) {
    for (const [index, row] of rows.entries()) {
      if (holds(row, ladder.line.status)) lineAfter = index + 1;
    }
  }

  const notes = sharedGroupNotes(rows.filter((r) => r.shared));
  const anyResults = rows.some((r) => r.standing.hasReportedResults);
  const base = { division, divisionLabel, rows, autoRows, playInRows, atLargeRows };

  if (!anyResults) {
    // Preseason, or a division the source has not reported at all: there is nothing to project and
    // the play-in notes below would be false rather than merely empty.
    // A league with no documents of its own (`official.mode: 'none'`) publishes no alignment. "As
    // MaxPreps lists it" only where MaxPreps' table for this division lists every row (the EAL);
    // otherwise the league's membership source (components/ui/membership-words.ts).
    const source = membershipSource(division, rows.map((r) => r.team.slug));
    const roster =
      source.kind === 'maxpreps'
        ? `the ${divisionLabel} table as MaxPreps lists it`
        : source.kind === 'official'
          ? 'the official alignment'
          : `the ${divisionLabel} teams (${source.source})`;
    notes.push(
      `No ${divisionLabel} league results have been reported yet, so there is nothing to project ` +
        `here. The rows below are ${roster}.`,
    );
    return { ...base, lineAfter: 0, lineLabel: null, notes };
  }

  const n = ladder.aqPlaces;
  if (n > 0 && autoRows.length > n) {
    // Name only the level teams contesting the last automatic place, not the clear leaders above.
    const level = autoRows.filter((r) => r.shared);
    notes.push(
      `${listWords((level.length > 1 ? level : autoRows).map((r) => r.team.name))} share the last of the ` +
        `top ${numberWord(n)} places, and ${divisionLabel} has only ${numberWord(n)} automatic berths — ` +
        `${ladder.unresolved}, so this row order is not a ruling.`,
    );
  }
  if (ladder.playInPlace !== null) {
    const place = ordinalWord(ladder.playInPlace);
    const when = ladder.playInDate ? ` ${ladder.playInDate}` : '';
    if (playInRows.length === 0) {
      notes.push(
        `No ${divisionLabel} team is ${place} on its own today, so the${when} play-in pairing is not ` +
          'settled: the tie above it has to break first.',
      );
    } else if (playInRows.length > 1) {
      // Two teams can both hold the play-in spot two ways: level ON the play-in place, or level on
      // the place above with the group spanning both. A single-status row is unambiguously at the
      // play-in place; a row carrying more than one status straddles the boundary.
      const allAtPlace = playInRows.every((r) => r.statuses.length === 1);
      notes.push(
        `${listWords(playInRows.map((r) => r.team.name))} ${
          allAtPlace ? `are level at ${place}` : `are level across ${place}`
        }, so which of them plays in${when ? ` on${when}` : ''} is not settled — ${ladder.unresolved}.`,
      );
    }
  }
  if (ladder.atLargePlace !== null && atLargeRows.length > 1) {
    const allAtPlace = atLargeRows.every((r) => r.statuses.length === 1);
    const place = ordinalWord(ladder.atLargePlace);
    notes.push(
      allAtPlace
        ? `${listWords(atLargeRows.map((r) => r.team.name))} are level at ${place}, so ` +
          `${divisionLabel} has two at-large candidates and no ${ordinalWord(ladder.atLargePlace + 1)} place today.`
        : `${listWords(atLargeRows.map((r) => r.team.name))} are level across ${place}, so ` +
          `${divisionLabel} has more than one at-large candidate today.`,
    );
  }
  return {
    ...base,
    lineAfter,
    lineLabel: lineAfter > 0 && ladder.line ? ladder.line.label : null,
    notes,
  };
}

/** '4-1-0 · 12 pts', or an em dash for a team with nothing reported (never 0-0-0). */
export function recordLine(standing: Standing): string {
  if (!standing.hasReportedResults) return EM_DASH;
  return `${recordString(standing.computed)} · ${standing.computed.pts} pts`;
}

/**
 * A status label's chip text and its tail: "Play-in game Oct 30 — a coin flip decides it" is the
 * head "Play-in game Oct 30" and the tail "a coin flip decides it". The chip shows the head;
 * /playoffs prints the tail under it, and the team page leaves it to the tiebreak note.
 */
export function splitStatusLabel(label: string): { head: string; tail: string | null } {
  const [head, ...rest] = label.split(' — ');
  return { head, tail: rest.length > 0 ? rest.join(' — ') : null };
}

/**
 * The row link's accessible sentence: name, place, record, points. It deliberately omits the
 * written status, which is real text in its own cell — repeating it would announce it twice.
 */
export function projectionRowLabel(row: ProjectionRow, divisionLabel: string): string {
  const { standing, team } = row;
  if (!standing.hasReportedResults) {
    return `${team.name}: no results reported, not ranked in ${divisionLabel}`;
  }
  const place = placeWords(standing.computed.place, row.shared);
  // The record in words, as on the standings table: "4-1-0" read aloud is a subtraction or a date.
  return `${team.name}, ${place} in ${divisionLabel}, ${recordWords(standing.computed)}, ${plural(
    standing.computed.pts,
    'point',
  )}`;
}

// ---------------------------------------------------------------- league pairings (SCVAL crossover, BVAL play-in)

export interface SeatView {
  /** From config: 'De Anza #4', 'Santa Teresa #1'. */
  label: string;
  /** Everyone who could take the seat: empty ⇒ TBD; two or more ⇒ a level place spans it. */
  contenders: Array<{ team: Team; standing: Standing | undefined }>;
  /** This seat hosts (BVAL's Santa Teresa #1). */
  host: boolean;
}

export interface PairingView {
  id: string;
  /** 'De Anza #4 vs El Camino #4 — play-in for the SCVAL 7th automatic qualifier' (config, verbatim). */
  label: string;
  /** 'Crossover · #1 v #1' / 'Play-in' */
  title: string;
  isPlayIn: boolean;
  dateKey: string;
  /** 'Fri Oct 30' */
  dateLabel: string;
  /** '11 AM PT', or null when the league states no time. */
  timeLabel: string | null;
  seats: [SeatView, SeatView];
  /** 'vs' when no seat hosts; 'at' when one does (the visitor is listed first). */
  connector: 'vs' | 'at';
  /** True when either seat has more than one contender. */
  unsettled: boolean;
  /** Extra sentences: co-champions deciding who hosts, an unsettled seat. */
  notes: string[];
  game: Game | null;
}

/**
 * One `LeaguePairing` (lib/data `getLeaguePairings`) with its seats resolved to teams. Seat labels
 * come from config, never from a division literal; the host seat (BVAL) is marked. Two level
 * co-champions hosting a play-in are both named, with the by-law that decides who hosts.
 */
export function buildPairingView(
  pairing: LeaguePairing,
  resolve: (teamId: string) => { team: Team; standing: Standing | undefined } | undefined,
  opts: { hostTieNote?: string | null; unsettledNote?: string | null; unsettledHostNote?: string | null } = {},
): PairingView {
  const seat = (i: 0 | 1): SeatView => ({
    label: pairing.seatLabels[i],
    contenders: pairing.seats[i].flatMap((ref) => {
      const hit = resolve(ref.teamId);
      return hit ? [hit] : [];
    }),
    host: pairing.host === i,
  });
  const seats: [SeatView, SeatView] = [seat(0), seat(1)];
  const unsettled = seats.some((s) => s.contenders.length > 1);
  const notes: string[] = [];
  const hostTieNote =
    pairing.host !== null && seats[pairing.host].contenders.length > 1 ? (opts.hostTieNote ?? null) : null;
  if (hostTieNote) notes.push(hostTieNote);
  // When only the host seat is level, the host note already names the by-laws that settle it, so
  // the unsettled note does not state the rule a second time.
  const onlyHostTied = hostTieNote !== null && seats[pairing.host === 0 ? 1 : 0].contenders.length <= 1;
  const unsettledNote = onlyHostTied && opts.unsettledHostNote ? opts.unsettledHostNote : opts.unsettledNote;
  if (unsettled && unsettledNote) notes.push(unsettledNote);
  const seedMatch = /#(\d+)\b/.exec(pairing.seatLabels[0]);
  const seedA = seedMatch ? seedMatch[1] : null;
  const seedB = /#(\d+)\b/.exec(pairing.seatLabels[1])?.[1] ?? null;
  return {
    id: pairing.id,
    label: pairing.label,
    title: pairing.isPlayIn
      ? 'Play-in'
      : seedA && seedB
        ? `Crossover · #${seedA} v #${seedB}`
        : 'Crossover',
    isPlayIn: pairing.isPlayIn,
    dateKey: pairing.date,
    dateLabel: shortDate(pairing.date),
    timeLabel: pairing.time ? leagueClockPT(pairing.time) : null,
    seats,
    connector: pairing.host === null ? 'vs' : 'at',
    unsettled,
    notes,
    game: pairing.game,
  };
}

/** '§6b-f' from the first and last cited stages of the league's default chain, when they share a section. */
function chainSpan(league: LeagueConfig): string | null {
  const chain = league.rules.tiebreaks.default;
  const ref = (stage: TiebreakStage | undefined) =>
    stage ? /§(\d+)([a-z])\b/.exec(league.rules.citations.stages[stage] ?? '') : null;
  const a = ref(chain[0]);
  const b = ref(chain[chain.length - 1]);
  return a && b && a[1] === b[1] ? `§${a[1]}${a[2]}-${b[2]}` : null;
}

/**
 * The config-driven notes a pairing card may need (SPEC §6.1): when the hosting seat is shared by
 * co-champions, which by-laws decide who hosts (BVAL: `Santa Teresa co-champions: BVAL By-Laws §6b-f
 * decide who hosts.`); and, for any seat with more than one contender, why it is not settled.
 */
export function pairingNotesFor(pairing: LeaguePairing): {
  hostTieNote: string | null;
  unsettledNote: string;
  unsettledHostNote: string | null;
} {
  const league = getLeague(pairing.leagueId);
  const suffix = league.rules.unresolvedSuffix.replace(/^—\s*/, '');
  const unsettledNote = `Not settled yet: teams are level across a seat${suffix ? `, and ${suffix}` : ''}. The pairing follows the table, so it moves with every result.`;
  const none = { hostTieNote: null, unsettledNote, unsettledHostNote: null };
  if (pairing.host === null || league.postseason.kind !== 'ccs-ladder') return none;
  const seat = league.postseason.pairings.find((p) => p.id === pairing.id)?.seats[pairing.host];
  if (!seat) return none;
  const heading = divisionHeading(seat.division) ?? league.shortName;
  const span = chainSpan(league);
  return {
    hostTieNote: span
      ? `${heading} co-champions: ${league.shortName} By-Laws ${span} decide who hosts.`
      : `${heading} co-champions: the ${league.shortName} tiebreakers decide who hosts.`,
    unsettledNote,
    // Only the host seat level: the host note above already names the by-laws.
    unsettledHostNote: 'Not settled yet: the pairing follows the table, so it moves with every result.',
  };
}

/** The screen-reader sentence for one pairing card. */
export function pairingSentence(view: PairingView): string {
  const name = (seat: SeatView) =>
    seat.contenders.length === 0
      ? `${seat.label} (to be decided)`
      : `${listWords(seat.contenders.map((c) => c.team.name), 'or')} (${seat.label}${seat.host ? ', host' : ''})`;
  const [a, b] = view.seats;
  const pair =
    view.connector === 'at'
      ? // The host is seat `host`; read "visitor at host".
        a.host
        ? `${name(b)} at ${name(a)}`
        : `${name(a)} at ${name(b)}`
      : `${name(a)} versus ${name(b)}`;
  return `${view.title}, ${view.dateLabel}${view.timeLabel ? `, ${view.timeLabel}` : ''}: ${pair}.`;
}

// ---------------------------------------------------------------- section playoffs (the San Diego Section)

type SectionPlayoffsConfig = Extract<LeagueConfig['postseason'], { kind: 'section-playoffs' }>;

/**
 * The Section's round calendar as DateList rows: a round's label, its league clock time where published (the
 * finals) and its site as the detail (La Jolla High School). Rounds and finals are set in ink (`isRound`), the
 * play-in row is not. No row names a host: the Section's bulletin is unreadable and a seed word is banned here.
 */
export function sectionRoundRows(ps: SectionPlayoffsConfig): KeyDateRow[] {
  return ps.rounds.map((r) => ({
    key: `league:${r.id}`,
    dateKey: r.date,
    dateLabel: shortDate(r.date),
    time: r.time ? leagueClockPT(r.time) : null,
    leagueShort: null,
    label: r.label,
    detail: r.site ?? '',
    isRound: /^(First round|Quarterfinals|Semifinals|Final)\b/.test(r.label),
  }));
}

/**
 * The San Diego block's bracket sentence, true on every day: before the seeding meeting, when the Section places
 * teams and where it posts (never the word "seeds": SEED_CLAIM bans a seed word on a San Diego card); from the meeting on, that it posts its brackets on its field hockey page (and, once the
 * owner has pasted the sheet's URL, that they are published); always that this site draws none and projects no
 * places, since the Section places teams.
 */
export function sectionBracketSentence(ps: SectionPlayoffsConfig, seedingDate: string | null, today: string): string {
  const seeding = seedingDate ? shortDate(seedingDate) : null;
  if (ps.bracketSheetUrl) return 'The Section has published its brackets; this site draws no bracket and projects no places.';
  if (seedingDate && today < seedingDate) {
    return `The Section places teams at its ${seeding} seeding meeting and posts its brackets on its field hockey page afterwards; this site draws no bracket and projects no places.`;
  }
  return `The Section posts its brackets on its field hockey page${seeding ? ` after its ${seeding} seeding meeting` : ''}; this site draws no bracket and projects no places. Its playoff games appear on team pages and schedules as MaxPreps lists them.`;
}

// ---------------------------------------------------------------- outside tournament (the Tournament of Champions)

export interface OutsideTournamentRoundView {
  dateKey: string;
  /** 'Thu Oct 22' */
  dateLabel: string;
  /** The round's name from config ('Round 1', 'Semifinals'), or null for a game on a day config names no round for. */
  label: string | null;
  games: Game[];
}

export interface OutsideTournamentView {
  name: string;
  /** 'Oct 22–29' */
  dates: string;
  note: string;
  rounds: OutsideTournamentRoundView[];
  /** How many of the listed games have a final score. */
  finals: number;
  /** How many are still to be played. */
  toCome: number;
  sources: readonly { label: string; href: string }[];
}

/**
 * The games of a section's outside tournament (DESIGN §24.13), the ones tagged 'outside-tournament' among
 * `games`, grouped by day in date order with the config's round label for that day. No seed, no bracket: the
 * tournament publishes neither, so the view lists what MaxPreps lists. A day the config names no round for
 * (a moved game) is shown under its date alone, never forced into a round.
 */
export function buildOutsideTournamentView(event: OutsideTournamentConfig, games: readonly Game[]): OutsideTournamentView {
  const own = games
    .filter((g) => g.postseason?.kind === 'outside-tournament')
    .sort(byDateThenId);
  const rounds: OutsideTournamentRoundView[] = [];
  for (const g of own) {
    let round = rounds.find((r) => r.dateKey === g.dateKey);
    if (!round) {
      round = {
        dateKey: g.dateKey,
        dateLabel: shortDate(g.dateKey),
        label: event.rounds.find((r) => r.date === g.dateKey)?.label ?? null,
        games: [],
      };
      rounds.push(round);
    }
    round.games.push(g);
  }
  const finals = own.filter((g) => g.status === 'final').length;
  return {
    name: event.name,
    dates: dateSpan(event.window.first, event.window.last),
    note: event.note,
    rounds,
    finals,
    toCome: own.filter((g) => g.status === 'scheduled').length,
    sources: event.sources,
  };
}

// ---------------------------------------------------------------- league tournament (MCAL)

export interface TournamentSlotView {
  /** The seed number shown before the name, or null (a rule or a winner-of slot). */
  seed: number | null;
  /** 'Marin Catholic', 'Redwood or Tamalpais', 'TBD', 'Lowest-ranked remaining seed', 'Play-in winner'. */
  text: string;
  /** Teams named by the slot (one when settled; several when level; none for TBD or a rule). */
  teams: Team[];
  /** Nothing is known about this slot yet (renders `TBD`). */
  tbd: boolean;
}

export interface TournamentGameView {
  id: TournamentGame['id'];
  round: TournamentGame['round'];
  dateKey: string;
  dateLabel: string;
  timeLabel: string;
  /**
   * The host side: the higher seed's field, or at a fixed site the slot whose team IS the site team (the 2026 final:
   * 1 Tamalpais, at Tamalpais). At a fixed site neither team calls home, the better seed.
   */
  home: TournamentSlotView;
  away: TournamentSlotView;
  /**
   * 'at' (the higher seed's field, or a fixed site that is one finalist's own: lib/postseason.ts fixedSiteHost) or
   * 'vs' (a fixed site neither finalist calls home). The final reads '3 Redwood at 1 Tamalpais', the game page's words.
   */
  connector: 'at' | 'vs';
  /** '5 Convent at 4 Marin Catholic' — what the page prints. */
  line: string;
  /**
   * The side that won the matched game (lib/postseason.ts winnerOf: the higher score, else the side MaxPreps marks
   * W), as this view's `home`/`away`; null with no result or a level game with no W flag. The bracket marks it with
   * the site's winner rule (600 weight and the 2px left rule, DESIGN §8 accessibility).
   */
  winner: 'home' | 'away' | null;
  /**
   * The result for the game's sr-only sentence: 'Redwood won and advances to the final.' / 'Tamalpais wins the MCAL
   * tournament.'; null with no winner.
   */
  outcome: string | null;
  /** 'Tamalpais' for a fixed site; null = the home seed's field. */
  site: string | null;
  note: string | null;
  game: Game | null;
}

export interface TournamentRoundView {
  round: Exclude<TournamentGame['round'], 'play-in'>;
  /** 'Quarterfinals' | 'Semifinals' | 'Final' */
  title: string;
  dateKey: string;
  /** 'Mon Oct 26 · 4 PM PT' / 'Fri Oct 30 · 4 PM PT · at Tamalpais' */
  meta: string;
  /** The round's start time from config ('4 PM PT'), every game of a round sharing it. */
  time: string;
  /**
   * The fixed site's where and how much (the final at Tamalpais): the venue, one address line, the Directions
   * link and the league's admission sentence with its source; null for a round at the higher seed's field.
   */
  venue: { name: string; addressLine: string; directionsHref: string; admission: string | null; admissionSource: string | null } | null;
  games: TournamentGameView[];
}

export interface SeedRowView {
  team: Team;
  standing: Standing;
  /** A shared place renders level: `T6`, with "tied for 6th" spoken. */
  shared: boolean;
  /** '4/16 GP' — counted of scheduled league games. */
  gpText: string;
  /** '12 pts', or an em dash for a team with nothing reported. */
  ptsText: string;
  /** The ladder label (written words), or 'No results reported'. */
  label: string;
}

export interface TournamentView {
  status: LeagueTournamentProjection['status'];
  /** 'If the season ended today' while projected; null once seeded. */
  seedsMeta: string | null;
  seedRows: SeedRowView[];
  /** 1-based row index after which the labelled tournament line sits; 0 ⇒ none. */
  lineAfter: number;
  lineLabel: string | null;
  /** The play-in spelled out, or null when none is needed. */
  playInSentence: string | null;
  playIn: TournamentGameView | null;
  rounds: TournamentRoundView[];
  /** Tie footnotes plus the engine's notes (a 2-0 sweep that settles the last place). */
  notes: string[];
}

export interface TournamentInput {
  projection: LeagueTournamentProjection;
  /** The league's table in place order, with each row's team, counted/scheduled games and written status. */
  /**
   * `scheduled` is the division's gamesPerTeam: null only for a league with no fixed schedule (the
   * Sunset), which has no tournament, so a seed row then reads the bare count.
   */
  rows: ReadonlyArray<{ team: Team; standing: Standing; counted: number; scheduled: number | null; label: string }>;
  /** Slug → team, for bracket slots. */
  teamOf: (slug: TeamSlug) => Team | undefined;
  /** The league's last tournament place (MCAL 6). */
  lastPlace: number;
  /**
   * `ladderLine` of the league's (single) division. A league tournament always has one (assertLeagues);
   * the type is config's, where null means "no line" (only an unbracketed league, which has no bracket).
   */
  ladderLine: { after: number; label: string } | null;
  /**
   * The final's fixed site from config (the host school's slug, venue, address, admission); omitted ⇒ the round
   * shows no venue block and the final reads 'vs' (no host known). The slug makes the final 'at' when the site team
   * is a finalist (lib/postseason.ts fixedSiteHost).
   */
  finalSite?: { slug?: TeamSlug; venue: string; address: { street: string; city: string; region: string; postalCode: string }; admission: string | null; admissionSource: string | null };
}

/** A bracket round's title, for the page's round headers and the OG card's round line alike. */
export const ROUND_TITLES: Readonly<Record<TournamentRoundView['round'], string>> = {
  quarterfinal: 'Quarterfinals',
  semifinal: 'Semifinals',
  final: 'Final',
};

function seatTeams(seat: CrossoverSeat, teamOf: TournamentInput['teamOf']): Team[] {
  return seat.flatMap((s) => {
    const t = teamOf(s.slug);
    return t ? [t] : [];
  });
}

/** One bracket slot in words. A seat nobody holds yet reads `TBD`, never blank. */
export function slotView(
  slot: TournamentSlot,
  teamOf: TournamentInput['teamOf'],
  seeds: LeagueTournamentProjection['seeds'] = [],
): TournamentSlotView {
  if (slot.kind === 'rule') return { seed: null, text: slot.text, teams: [], tbd: false };
  if (slot.kind === 'winner-of') {
    // The play-in winner takes the contested seat: name the seed and both contenders.
    if (slot.gameId === 'play-in') {
      const contested = seeds.find((s) => s.seat.length > 1);
      const teams = contested ? seatTeams(contested.seat, teamOf) : [];
      return {
        seed: contested?.seed ?? null,
        text: teams.length > 1 ? `${slot.label} (${listWords(teams.map((t) => t.shortName), 'or')})` : slot.label,
        teams,
        tbd: false,
      };
    }
    return { seed: null, text: slot.label, teams: [], tbd: false };
  }
  const teams = seatTeams(slot.seat, teamOf);
  if (teams.length === 0) return { seed: slot.seed, text: 'TBD', teams: [], tbd: true };
  return { seed: slot.seed, text: listWords(teams.map((t) => t.shortName), 'or'), teams, tbd: false };
}

function slotLabel(v: TournamentSlotView): string {
  return v.seed !== null ? `${v.seed} ${v.text}` : v.text;
}

/** The round a game's winner goes on to; null after the final. */
const NEXT_ROUND: Readonly<Record<TournamentGame['round'], TournamentRoundView['round'] | null>> = {
  'play-in': 'quarterfinal',
  quarterfinal: 'semifinal',
  semifinal: 'final',
  final: null,
};

/**
 * One bracket game in words. `siteSlug` is the fixed site's own team (config `finalSite.slug`): when that team is in
 * the game the line is visitor at host, as at any other round and on the game page ('3 Redwood at 1 Tamalpais');
 * a fixed site neither finalist calls home lists the better seed first with 'vs'. `tournamentName` ('MCAL
 * tournament') names what the final's winner wins in the sr-only sentence.
 */
export function tournamentGameView(
  tg: TournamentGame,
  teamOf: TournamentInput['teamOf'],
  seeds: LeagueTournamentProjection['seeds'] = [],
  siteSlug: TeamSlug | null = null,
  tournamentName: string | null = null,
): TournamentGameView {
  const host = fixedSiteHost(tg, siteSlug);
  // The view's `home` is the host: at a fixed site the site team's slot, whichever seed it holds.
  const [homeSlot, awaySlot] = host === 'away' ? [tg.away, tg.home] : [tg.home, tg.away];
  const home = slotView(homeSlot, teamOf, seeds);
  const away = slotView(awaySlot, teamOf, seeds);
  const connector = tg.site !== null && host === null ? 'vs' : 'at';
  const winnerSlug = winnerOf(tg);
  const holds = (v: TournamentSlotView) => winnerSlug !== null && v.teams.length === 1 && v.teams[0].slug === winnerSlug;
  const winner = holds(home) ? 'home' : holds(away) ? 'away' : null;
  let outcome: string | null = null;
  if (winner !== null) {
    const name = (winner === 'home' ? home : away).teams[0].shortName;
    const next = NEXT_ROUND[tg.round];
    if (next !== null) outcome = `${name} won and advances to the ${ROUND_TITLES[next].toLowerCase()}.`;
    else if (tournamentName) outcome = `${name} wins the ${tournamentName}.`;
  }
  return {
    id: tg.id,
    round: tg.round,
    dateKey: tg.date,
    dateLabel: shortDate(tg.date),
    timeLabel: leagueClockPT(tg.time),
    home,
    away,
    connector,
    // A neutral fixed site lists the better seed first ('1 Archie Williams vs 2 Redwood'); otherwise visitor at host.
    line: connector === 'vs' ? `${slotLabel(home)} vs ${slotLabel(away)}` : `${slotLabel(away)} at ${slotLabel(home)}`,
    winner,
    outcome,
    site: tg.site,
    note: tg.note,
    game: tg.game,
  };
}

/**
 * The /playoffs/<league> view: seeds 1..N from the table with the labelled tournament line, the
 * play-in spelled out, and the bracket as vertical rounds (quarterfinals, semifinals, final).
 */
export function buildTournamentView(input: TournamentInput): TournamentView {
  const { projection: p, rows, teamOf, lastPlace, ladderLine, finalSite } = input;
  const seedRows: SeedRowView[] = rows.map(({ team, standing, counted, scheduled, label }) => ({
    team,
    standing,
    shared: standing.tiebreak.shared,
    gpText: scheduled === null ? `${counted} GP` : `${counted}/${scheduled} GP`,
    ptsText: standing.hasReportedResults ? `${standing.computed.pts} pts` : EM_DASH,
    label: standing.hasReportedResults ? label : 'No results reported',
  }));

  // The standings tables' own rule (ladderLineAfter): no line when every seed sits above it,
  // which LeagueTournament never drew anyway.
  const lineAfter = ladderLineAfter(seedRows.map(ladderRow), ladderLine?.after) ?? 0;

  const name = (slug: TeamSlug) => teamOf(slug)?.name ?? slug;
  const place = ordinal(lastPlace);
  const contenders = p.playIn
    ? [p.playIn.home, p.playIn.away].flatMap((s) => (s.kind === 'seed' ? s.seat.map((x) => x.slug) : []))
    : [];
  let playInSentence: string | null = null;
  if (p.playInNeeded === 'possible' && contenders.length === 2) {
    playInSentence =
      `A play-in for ${place} is possible: ${name(contenders[0])} and ${name(contenders[1])} are level ` +
      'on points and have split or not finished their meetings.';
  } else if (p.playInNeeded === 'yes' && contenders.length === 2) {
    // playIn.home is the host (the higher draw number, or the earlier meeting's winner).
    playInSentence =
      `A play-in for ${place} is needed: ${name(contenders[0])} and ${name(contenders[1])} are level on ` +
      `points and neither won both meetings. ${name(contenders[0])} hosts.`;
  }

  const siteSlug = finalSite?.slug ?? null;
  const ps = getLeague(p.leagueId).postseason;
  const tournamentName = ps.kind === 'league-tournament' ? ps.name : null;
  const games = p.games.map((tg) => tournamentGameView(tg, teamOf, p.seeds, siteSlug, tournamentName));
  const rounds: TournamentRoundView[] = [];
  for (const g of games) {
    if (g.round === 'play-in') continue;
    let round = rounds.find((r) => r.round === g.round);
    if (!round) {
      // A fixed site (the final) gets its venue block; the time is the round's, from config, printed once here
      // rather than on each row (every game of a round starts together).
      const venue = g.site && finalSite
        ? {
            name: finalSite.venue,
            addressLine: `${finalSite.address.street}, ${finalSite.address.city}, ${finalSite.address.region} ${finalSite.address.postalCode}`,
            directionsHref: mapsSearchHref(finalSite.address),
            admission: finalSite.admission,
            admissionSource: finalSite.admissionSource,
          }
        : null;
      round = {
        round: g.round,
        title: ROUND_TITLES[g.round],
        dateKey: g.dateKey,
        meta: g.site ? `${g.dateLabel} · ${g.timeLabel} · at ${g.site}` : `${g.dateLabel} · ${g.timeLabel}`,
        time: g.timeLabel,
        venue,
        games: [],
      };
      rounds.push(round);
    }
    round.games.push(g);
  }

  const notes = [
    ...sharedGroupNotes(seedRows.filter((r) => r.shared)),
    ...p.notes,
  ];

  return {
    status: p.status,
    seedsMeta: p.status === 'projected' ? 'If the season ended today' : null,
    seedRows,
    lineAfter,
    lineLabel: lineAfter > 0 && ladderLine ? ladderLine.label : null,
    playInSentence,
    playIn: p.playIn ? tournamentGameView(p.playIn, teamOf, p.seeds, siteSlug, tournamentName) : null,
    rounds,
    notes,
  };
}
