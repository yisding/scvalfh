/**
 * The inputs of "This week in the postseason" (this-week.ts), shared by the two pages that print the strip:
 * `/playoffs` (`#this-week-norcal`, `#this-week-socal`) and the home page (`#this-week`, `#this-week-socal`,
 * components/home/HomeThisWeek.tsx). Lifted out of app/playoffs/page.tsx on 2026-10-30 (plan final-11) so the
 * two strips cannot disagree: the labels map (a contest's round word), NorCal's dated events and SoCal's are
 * built here from the snapshot and config, once, and each page only chooses the row cap.
 *
 * Nothing here is new copy: the labels and the event rows are the page's own words from final-03, moved. "Today"
 * is the caller's (`getToday()`, the snapshot's day in Pacific, never Date.now()). Reads lib/data and
 * lib/leagues only; server-side, like the pages that call it.
 *
 * Copy rules the rows already satisfy and a change here must keep: no seed word on a San Diego or EAL row
 * (SEED_CLAIM: "seeding meeting" and bare `#1 v #1` seat labels pass), no CCS word on a SoCal row, no
 * 'eliminat'. The strip sits outside every league card, so the per-league bans do not reach it, but the SoCal
 * strip is still free of `\bCCS\b` because no SoCal label has one.
 */

import { ROUND_WORD } from '../game/game-view';
import {
  getCcsField,
  getLeaguePairings,
  getLeagueSummaries,
  getLeagueTournament,
  getPlayoffs,
  getStandingFor,
  getTeamById,
  getTournamentLeagueIds,
} from '../../lib/data';
import type { LeagueSummary } from '../../lib/data';
import { leagueClockPT, listWords, ordinal, timeOfDayPT } from '../../lib/format';
import {
  SECTION_PLAYOFFS_LEAGUE_IDS,
  UNBRACKETED_LEAGUE_IDS,
  getLeague,
} from '../../lib/leagues';
import type { LeagueConfig } from '../../lib/leagues';
import { tournamentGameLine } from '../../lib/postseason';
import { withLocationRound } from '../../lib/postseason-rounds';
import type { CcsPlayoffs, ContestId, Game, LeagueId, RegionId } from '../../lib/types';

import { roundKeyFor } from './bracket-model';
import { buildPairingView, pairingNotesFor, pairingSentence, type PairingView } from './playoff-view';
import { buildThisWeek, type ThisWeekEvent, type ThisWeekView } from './this-week';

export function resolveSeat(teamId: string) {
  const team = getTeamById(teamId);
  return team ? { team, standing: getStandingFor(teamId) } : undefined;
}

/** What the labels and NorCal's events read of a CCS league's block: its names and its pairings. */
export interface CcsPairingBlock {
  summary: Pick<LeagueSummary, 'id' | 'shortName'>;
  pairings: readonly PairingView[];
}

/** A CCS league's pairings (crossover, play-in) as the page's view models, seats resolved to teams and standings. */
export function pairingViewsFor(leagueId: LeagueId): PairingView[] {
  return getLeaguePairings(leagueId).map((p) => buildPairingView(p, resolveSeat, pairingNotesFor(p)));
}

/** The San Diego Section's playoffs: the config every San Diego league shares, and its leagues. */
export function sectionPlayoffs(): {
  ps: Extract<LeagueConfig['postseason'], { kind: 'section-playoffs' }>;
  seeding: string | null;
  leagues: LeagueSummary[];
} | null {
  const leagues = getLeagueSummaries().filter((s) => SECTION_PLAYOFFS_LEAGUE_IDS.includes(s.id));
  const first = leagues[0] ? getLeague(leagues[0].id) : undefined;
  if (!first || first.postseason.kind !== 'section-playoffs') return null;
  return {
    ps: first.postseason,
    seeding: first.keyDates.find((d) => d.id === 'seeding-meeting')?.date ?? null,
    leagues,
  };
}



/** A CCS round in the singular, as a game's label says it ('CCS quarterfinal'). */
const CCS_ROUND_WORD = { quarterfinals: 'quarterfinal', semifinals: 'semifinal', finals: 'final' } as const;

/**
 * The round word of every postseason contest the page can name, for the strip's labels: a CCS game by its date
 * against the CCS key dates ('CCS semifinal'); an unbracketed league's game by the round its own row names
 * ('EAL Super Regional semifinal', lib/postseason-rounds.ts); a league tournament's game by its bracket slot
 * ('MCAL final'); a CCS league's crossover or play-in by its pairing ('SCVAL crossover · #2 v #2', 'SCVAL play-in
 * for the 7th CCS berth', the berth's number from the CCS field). Anything else takes its tag's own words in
 * buildThisWeek (postseasonTagOf). The pairings come last, so a crossover MaxPreps marked a playoff (the Oct 29
 * Valley Christian v Palo Alto row, contestType 4) still reads as its crossover.
 */
export function postseasonLabels(
  games: readonly Game[],
  keyDates: CcsPlayoffs['keyDates'],
  blocks: readonly CcsPairingBlock[],
  autoBerths: ReadonlyMap<LeagueId, number>,
): Map<ContestId, string> {
  const labels = new Map<ContestId, string>();
  for (const g of games) {
    const tag = g.postseason;
    if (tag?.kind === 'ccs') {
      const round = roundKeyFor(g.dateKey, keyDates);
      labels.set(g.contestId, round === 'other' ? 'CCS' : `CCS ${CCS_ROUND_WORD[round]}`);
    } else if (tag?.kind === 'league-postseason' && tag.leagueId) {
      const league = getLeague(tag.leagueId);
      if (league.postseason.kind === 'unbracketed-tournament') {
        labels.set(g.contestId, withLocationRound(`${league.shortName} ${league.postseason.name}`, g.venue.text));
      }
    }
  }
  for (const id of getTournamentLeagueIds()) {
    const league = getLeague(id);
    const t = getLeagueTournament(id);
    for (const tg of [...(t.playIn ? [t.playIn] : []), ...t.games]) {
      if (tg.game) labels.set(tg.game.contestId, `${league.shortName} ${ROUND_WORD[tg.round]}`);
    }
  }
  for (const block of blocks) {
    for (const p of block.pairings) {
      if (!p.game) continue;
      const short = block.summary.shortName;
      const berth = autoBerths.get(block.summary.id);
      labels.set(
        p.game.contestId,
        p.isPlayIn
          ? `${short} play-in${berth ? ` for the ${ordinal(berth)} CCS berth` : ''}`
          : `${short} ${p.title[0].toLowerCase()}${p.title.slice(1)}`,
      );
    }
  }
  return labels;
}

/**
 * NorCal's dated events with no game yet, from config: each CCS league's pairing MaxPreps does not list yet (the
 * BVAL play-in, Sat Oct 31, 11 AM), the EAL's Super Regional day (its listed site and stream times, config
 * `site`/`streams`), the CCS seeding meeting, and a league tournament's round still ahead with no game. Each
 * gives way to its league's game on its day (buildThisWeek).
 */
export function norcalEvents(blocks: readonly CcsPairingBlock[], playoffs: CcsPlayoffs, today: string): ThisWeekEvent[] {
  const { keyDates } = playoffs;
  const events: ThisWeekEvent[] = [];
  for (const block of blocks) {
    for (const p of block.pairings) {
      if (p.game) continue;
      events.push({
        dateKey: p.dateKey,
        time: p.timeLabel,
        title: `${block.summary.shortName} ${p.isPlayIn ? 'play-in' : 'crossover'}`,
        // The pairing sentence without its "Play-in, Sat Oct 31, 11 AM PT:" head: the strip prints the day and time.
        detail: pairingSentence(p).replace(/^[^:]*:\s*/, ''),
        // The league's pairing cards, where the team pages' postseason link lands too (DESIGN §32.5).
        href: `/playoffs#${block.summary.id}-pairings`,
        leagueId: block.summary.id,
      });
    }
  }
  for (const id of UNBRACKETED_LEAGUE_IDS) {
    const league = getLeague(id);
    const ps = league.postseason;
    if (ps.kind !== 'unbracketed-tournament') continue;
    // The stream times are in the config labels ('Part 1, Sat Oct 31, 8:30 AM PT').
    const times = ps.streams.flatMap((s) => /(\d{1,2}(?::\d{2})? [AP]M) PT$/.exec(s.label)?.[1] ?? []);
    const streams = times.length > 0 ? `streams ${listWords(times)} PT (NFHS Network)` : null;
    events.push({
      dateKey: ps.site?.day ?? ps.dates.first,
      time: times[0] ? `${times[0]} PT` : null,
      title: `${league.shortName} ${ps.name}`,
      detail: [ps.site?.label ?? null, streams].filter((x): x is string => x !== null).join(' · ') || null,
      href: `/playoffs#${league.id}`,
      leagueId: league.id,
    });
  }
  events.push({
    dateKey: keyDates.seedingMeeting.slice(0, 10),
    time: timeOfDayPT(keyDates.seedingMeeting),
    title: 'CCS seeding meeting',
    detail: listWords(playoffs.format.ccsDivisions.map((d) => `CCS ${d.name}`)),
    href: '/playoffs#key-dates',
    leagueId: null,
    scope: blocks.map((b) => b.summary.id),
  });
  for (const id of getTournamentLeagueIds()) {
    const league = getLeague(id);
    const ps = league.postseason;
    if (ps.kind !== 'league-tournament') continue;
    const t = getLeagueTournament(id);
    for (const tg of [...(t.playIn ? [t.playIn] : []), ...t.games]) {
      if (tg.game || tg.date < today) continue;
      events.push({
        dateKey: tg.date,
        time: leagueClockPT(tg.time),
        title: `${league.shortName} ${ROUND_WORD[tg.round]}`,
        detail: tournamentGameLine(tg, ps.finalSite.slug),
        href: `/playoffs/${league.id}`,
        leagueId: league.id,
      });
    }
  }
  return events;
}

/**
 * SoCal's dated events, from the San Diego config: the Section's seeding meeting and every round of its calendar
 * (config `rounds`, the SDFHOA's; the play-in row is the first), each under the playoffs' name with the round
 * (and the finals' site) as its detail. The meeting's 10 AM is in no config field yet, so its row prints no time.
 * No row names a seed or a host (SEED_CLAIM; the Section's bulletin is unreadable).
 */
export function socalEvents(sds: NonNullable<ReturnType<typeof sectionPlayoffs>>): ThisWeekEvent[] {
  const { ps, seeding } = sds;
  const href = '/playoffs#sds-playoffs';
  const scope = sds.leagues.map((l) => l.id);
  return [
    ...(seeding
      ? [{ dateKey: seeding, time: null, title: ps.name, detail: 'Section seeding meeting', href, leagueId: null, scope }]
      : []),
    ...ps.rounds.map((r) => ({
      dateKey: r.date,
      time: r.time ? leagueClockPT(r.time) : null,
      title: ps.name,
      detail: r.site ? `${r.label}, ${r.site}` : r.label,
      href,
      leagueId: null,
      scope,
    })),
  ];
}

/**
 * Both regions' strips from the snapshot: the labels, the events and `buildThisWeek` in one call. `/playoffs`
 * asks for the default cap (12 rows a region); the home page for 8 (plan final-11: its HTML and RSC payload are
 * weighed against a budget, and the strip there is a pointer, not the page).
 */
export function thisWeekByRegion(input: {
  games: readonly Game[];
  today: string;
  cap?: number;
}): Record<RegionId, ThisWeekView> {
  const { games, today, cap } = input;
  const playoffs = getPlayoffs();
  const field = getCcsField();
  const ccsIds = new Set<LeagueId>(field.byLeague.map((l) => l.leagueId));
  const blocks: CcsPairingBlock[] = getLeagueSummaries()
    .filter((s) => ccsIds.has(s.id))
    .map((summary) => ({ summary, pairings: pairingViewsFor(summary.id) }));
  const labels = postseasonLabels(
    games,
    playoffs.keyDates,
    blocks,
    new Map(field.byLeague.map((l) => [l.leagueId, l.auto])),
  );
  const sds = sectionPlayoffs();
  // The games a pairing or a bracket slot has joined: an event gives way only to a game of its league no slot claims.
  const claimed = new Set<ContestId>([
    ...blocks.flatMap((b) => b.pairings.flatMap((p) => (p.game ? [p.game.contestId] : []))),
    ...getTournamentLeagueIds().flatMap((id) => {
      const t = getLeagueTournament(id);
      return [...(t.playIn ? [t.playIn] : []), ...t.games].flatMap((tg) => (tg.game ? [tg.game.contestId] : []));
    }),
  ]);
  return {
    norcal: buildThisWeek({ games, today, region: 'norcal', labels, events: norcalEvents(blocks, playoffs, today), claimed, cap }),
    socal: buildThisWeek({ games, today, region: 'socal', labels, events: sds ? socalEvents(sds) : [], claimed, cap }),
  };
}
