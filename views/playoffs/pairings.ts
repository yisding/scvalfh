/**
 * The league pairings on /playoffs (SCVAL's crossover, BVAL's play-in): one config `LeaguePairing`
 * with its seats resolved to teams, its notes and its sentence.
 *
 * Pure, like every playoffs view module (key-dates, projection, pairings, tournament): no `fs` and no
 * `lib/queries/`. The pages read the snapshot and hand plain records down, so every builder here is
 * testable and safe anywhere. Server-only: no client component imports this module.
 */

import { getLeague } from '@/lib/config/leagues';
import { divisionHeading } from '@/lib/config/leagues/labels';
import { leagueClockPT, shortDate } from '@/lib/format/dates';
import { listWords } from '@/lib/format/words';
import type { Game } from '@/lib/model/game';
import type { LeagueConfig } from '@/lib/model/league-config';
import type { LeaguePairing } from '@/lib/model/postseason';
import type { Standing, TiebreakStage } from '@/lib/model/standings';
import type { Team } from '@/lib/model/team';

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
 * One `LeaguePairing` (lib/queries/postseason `getLeaguePairings`) with its seats resolved to teams. Seat labels
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
