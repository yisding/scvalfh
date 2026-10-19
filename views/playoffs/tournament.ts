/**
 * The league tournament on /playoffs/<league> (SPEC §6.2, MCAL): `buildTournamentView` turns
 * `LeagueTournamentProjection` into seeds, the play-in, and vertical rounds whose every unfilled
 * slot reads `TBD` (or the written rule), never blank; `tournamentCardModel` turns the same
 * projection into the OG card's seeds and round line.
 *
 * Pure, like every playoffs view module (key-dates, projection, pairings, tournament): no `fs` and no
 * `lib/queries/`. The pages read the snapshot and hand plain records down, so every builder here is
 * testable and safe anywhere. Server-only: no client component imports this module. The seeds'
 * tournament line is the standings view's `ladderLineAfter` (views/standings/division.ts); the
 * route's params and its 404 guard live in views/playoffs/tournament-route.ts, which reads
 * `lib/queries/`.
 */

import { leagueClockPT, shortDate } from '@/lib/format/dates';
import { ordinal } from '@/lib/format/numbers';
import { EM_DASH, listWords } from '@/lib/format/words';
import type { Game } from '@/lib/model/game';
import type { TeamSlug } from '@/lib/model/ids';
import type { PostseasonConfig } from '@/lib/model/league-config';
import type {
  CrossoverSeat,
  LeagueTournamentProjection,
  TournamentGame,
  TournamentSlot,
} from '@/lib/model/postseason';
import type { Standing } from '@/lib/model/standings';
import type { Team } from '@/lib/model/team';
import { ladderLineAfter, ladderRow } from '@/views/standings/division';

import { sharedGroupNotes } from './projection';

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
  home: TournamentSlotView;
  away: TournamentSlotView;
  /** 'at' (the higher seed's field) or 'vs' (a fixed site such as Tamalpais). */
  connector: 'at' | 'vs';
  /** '5 Convent at 4 Marin Catholic' — what the page prints. */
  line: string;
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
  /** 'Mon Oct 26' / 'Fri Oct 30 · at Tamalpais' */
  meta: string;
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

export function tournamentGameView(
  tg: TournamentGame,
  teamOf: TournamentInput['teamOf'],
  seeds: LeagueTournamentProjection['seeds'] = [],
): TournamentGameView {
  const home = slotView(tg.home, teamOf, seeds);
  const away = slotView(tg.away, teamOf, seeds);
  const connector = tg.site !== null ? 'vs' : 'at';
  return {
    id: tg.id,
    round: tg.round,
    dateKey: tg.date,
    dateLabel: shortDate(tg.date),
    timeLabel: leagueClockPT(tg.time),
    home,
    away,
    connector,
    // A fixed site lists the better seed first ('1 Tamalpais vs 3 Redwood'); otherwise visitor at host.
    line: connector === 'vs' ? `${slotLabel(home)} vs ${slotLabel(away)}` : `${slotLabel(away)} at ${slotLabel(home)}`,
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
  const { projection: p, rows, teamOf, lastPlace, ladderLine } = input;
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

  const games = p.games.map((tg) => tournamentGameView(tg, teamOf, p.seeds));
  const rounds: TournamentRoundView[] = [];
  for (const g of games) {
    if (g.round === 'play-in') continue;
    let round = rounds.find((r) => r.round === g.round);
    if (!round) {
      round = {
        round: g.round,
        title: ROUND_TITLES[g.round],
        dateKey: g.dateKey,
        meta: g.site ? `${g.dateLabel} · at ${g.site}` : g.dateLabel,
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
    playIn: p.playIn ? tournamentGameView(p.playIn, teamOf, p.seeds) : null,
    rounds,
    notes,
  };
}

/** What the `/playoffs/<league>` OG card prints (components/og/TournamentCard.tsx, SPEC §8.4). */
export interface TournamentCardModel {
  /** 'MCAL tournament' */
  name: string;
  /** 'Seeds if the season ended today' while projected, else 'Seeds'. */
  sub: string;
  /** Each seed's team(s): a shared seat reads `A, B or C` as on the page; an empty one `TBD`. */
  seeds: Array<{ seed: number; names: string }>;
  /** One per round after the play-in, in config order: `Semifinals Thu Oct 29`, `Final Sat Oct 31 at Tamalpais`. */
  rounds: string[];
  /** The league's short name, for the footer. */
  shortName: string;
}

export interface TournamentCardInput {
  /** The league's tournament config (tournament-route.ts `tournamentParam`'s `ps`). */
  ps: Pick<Extract<PostseasonConfig, { kind: 'league-tournament' }>, 'name' | 'rounds' | 'finalSite'>;
  projection: LeagueTournamentProjection;
  teamOf: (slug: TeamSlug) => Team | undefined;
  shortName: string;
}

/** The card's seeds and round line, with the page's ROUND_TITLES, so the card and the page cannot word a round differently. */
export function tournamentCardModel({ ps, projection, teamOf, shortName }: TournamentCardInput): TournamentCardModel {
  const seeds = projection.seeds.map((s) => ({
    seed: s.seed,
    names:
      s.seat.length === 0
        ? 'TBD'
        : listWords(s.seat.map((x) => teamOf(x.slug)?.shortName ?? x.slug), 'or'),
  }));
  const rounds = ps.rounds
    .filter((r) => !r.optional)
    .reduce<Array<{ round: TournamentRoundView['round']; date: string }>>((out, r) => {
      if (r.round !== 'play-in' && !out.some((o) => o.round === r.round)) out.push({ round: r.round, date: r.date });
      return out;
    }, [])
    .map((r) => `${ROUND_TITLES[r.round]} ${shortDate(r.date)}${r.round === 'final' ? ` at ${ps.finalSite.label}` : ''}`);
  return {
    name: ps.name,
    sub: projection.status === 'projected' ? 'Seeds if the season ended today' : 'Seeds',
    seeds,
    rounds,
    shortName,
  };
}
