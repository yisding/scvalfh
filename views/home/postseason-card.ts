/**
 * The home panel's postseason card (components/home/PostseasonCard.tsx): one view per postseason
 * kind in the league config (a league tournament, an unbracketed tournament, the CCS ladder, no
 * postseason, the San Diego Section's playoffs), worded from that config and the snapshot.
 */

import { CCS, getDivision } from '@/lib/config/leagues';
import { dateSpan, leagueClock, monthDay, shortDate } from '@/lib/format/dates';
import { numberWord } from '@/lib/format/words';
import type { LeagueId } from '@/lib/model/ids';
import type { LeagueConfig, PostseasonConfig } from '@/lib/model/league-config';
import type { SeasonPhase } from '@/lib/model/season';
import { getPlayoffs } from '@/lib/queries/postseason';
import { playoffsHref } from '@/lib/shared/routes';

export type PostseasonView =
  | {
      kind: 'ccs-ladder';
      leagueId: LeagueId;
      /** One sentence about this league's own pre-CCS games, or the seeding date. */
      intro: string;
      meter: { claimed: number; total: number; label: string };
      dates: Array<{ term: string; date: string }>;
      bracket: { published: boolean; url: string };
      link: { href: string; label: string };
    }
  | {
      kind: 'league-tournament';
      leagueId: LeagueId;
      /** 'MCAL tournament · Quarterfinals Mon Oct 26 (a play-in Fri Oct 23 only if needed) · …' */
      line: string;
      /** The section's no-championship note (NCS). */
      note: string | null;
      link: { href: string; label: string };
    }
  | {
      kind: 'unbracketed-tournament';
      leagueId: LeagueId;
      /** 'Super Regional, Oct 30–31 — the top six qualify' */
      line: string;
      /** The config's postseason note: format, seeding and site not published, no further path. */
      note: string;
      link: { href: string; label: string };
    }
  | {
      /** The Sunset: no playoffs (CIF-SS Blue Book 2011.1, 3500.2). The line is the config's note. */
      kind: 'no-postseason';
      leagueId: LeagueId;
      line: string;
      note: null;
      link: { href: string; label: string };
    }
  | {
      /**
       * A San Diego league: the Section's playoffs. The line is the config's `qualificationLine` (who the
       * Section places, and the one place a league decides), never "the top N qualify".
       */
      kind: 'section-playoffs';
      leagueId: LeagueId;
      line: string;
      note: string | null;
      link: { href: string; label: string };
    };

export function postseasonView(league: LeagueConfig, phase: SeasonPhase, sectionNote: string | null): PostseasonView {
  const ps = league.postseason;
  switch (ps.kind) {
    case 'league-tournament':
      return leagueTournamentView(league, ps, sectionNote);
    case 'unbracketed-tournament':
      // No bracket, no rounds and no CCS dates: the event, its dates and the written qualifier count.
      return {
        kind: 'unbracketed-tournament',
        leagueId: league.id,
        line: `${ps.name}, ${dateSpan(ps.dates.first, ps.dates.last)} — the top ${numberWord(ps.qualifiers)} qualify`,
        note: ps.note,
        link: { href: `/playoffs#${league.id}`, label: 'Postseason' },
      };
    case 'ccs-ladder':
      return ccsLadderView(league, ps, phase);
    case 'no-postseason':
      return { kind: 'no-postseason', leagueId: league.id, line: ps.note, note: null, link: { href: `/playoffs#${league.id}`, label: 'Postseason' } };
    case 'section-playoffs':
      return {
        kind: 'section-playoffs',
        leagueId: league.id,
        line: ps.qualificationLine,
        note: sectionNote,
        link: { href: `/playoffs#${league.id}`, label: ps.name },
      };
  }
}

function leagueTournamentView(
  league: LeagueConfig,
  ps: Extract<PostseasonConfig, { kind: 'league-tournament' }>,
  sectionNote: string | null,
): PostseasonView {
  const round = (id: string) => ps.rounds.find((r) => r.id === id);
  const qf = round('qf-1');
  const sf = round('sf-1');
  const final = round('final');
  const playIn = round('play-in');
  const parts = [ps.name];
  if (qf) parts.push(`Quarterfinals ${shortDate(qf.date)}${playIn ? ` (a play-in ${shortDate(playIn.date)} only if needed)` : ''}`);
  if (sf) parts.push(`Semifinals ${shortDate(sf.date)}`);
  if (final) parts.push(`Final ${shortDate(final.date)} at ${ps.finalSite.label}`);
  return {
    kind: 'league-tournament',
    leagueId: league.id,
    line: parts.join(' · '),
    note: sectionNote,
    link: { href: playoffsHref(league.id), label: 'Bracket' },
  };
}

function ccsLadderView(
  league: LeagueConfig,
  ps: Extract<PostseasonConfig, { kind: 'ccs-ladder' }>,
  phase: SeasonPhase,
): PostseasonView {
  const short = league.shortName;
  const total = CCS.autoQualifiers.total;
  const aqRung = ps.ladder.find((r) => r.status === 'aq');
  const aqTop = aqRung ? aqRung.places[1] : 0;
  const crossover = ps.pairings.find((p) => p.tag === 'scval-crossover');
  const playIn = ps.pairings.find((p) => p.tag === 'bval-play-in');
  let label: string;
  if (crossover) {
    label = `${short} holds ${ps.autoBerths} of the ${total} CCS berths automatically: the top ${numberWord(
      aqTop,
    )} in each division, plus the winner of the fourth-place play-in (By-Laws Article VII §1–2).`;
  } else if (playIn) {
    const aqDivision =
      aqRung && aqRung.divisions !== '*' && aqRung.divisions.length === 1 ? getDivision(aqRung.divisions[0]).label : null;
    const host = getDivision(playIn.seats[0].division).label;
    label = `${short} holds ${ps.autoBerths} of the ${total} CCS berths automatically: ${
      aqDivision ? `${aqDivision}’s` : 'the'
    } top ${numberWord(aqTop)}, plus the winner of the ${monthDay(playIn.date)} play-in (${playIn.seatLabels[1]} at the ${host} champion).`;
  } else {
    label = `${short} holds ${ps.autoBerths} of the ${total} CCS berths automatically: the top ${numberWord(
      aqTop,
    )} of the final standings.`;
  }

  const seeding = shortDate(CCS.keyDates.seedingMeeting);
  const beforeLeagueGames = phase === 'preseason' || phase === 'regular';
  let intro: string;
  if (crossover && beforeLeagueGames) {
    intro = `Crossover and the 4-vs-4 play-in ${shortDate(crossover.date)}. Seeding meeting ${seeding}.`;
  } else if (crossover && phase === 'crossover') {
    intro = `League play is done. Crossover and the play-in are ${shortDate(crossover.date)}; the seeding meeting is ${seeding}.`;
  } else if (playIn && (beforeLeagueGames || phase === 'play-in')) {
    intro = `Play-in ${shortDate(playIn.date)}${playIn.time ? `, ${leagueClock(playIn.time)}` : ''}. Seeding meeting ${seeding}.`;
  } else {
    intro = `Seeding meeting ${seeding}.`;
  }

  const playoffs = getPlayoffs();
  return {
    kind: 'ccs-ladder',
    leagueId: league.id,
    intro,
    meter: { claimed: ps.autoBerths, total, label },
    dates: [
      { term: 'Quarterfinals', date: CCS.keyDates.quarterfinals },
      { term: 'Semifinals', date: CCS.keyDates.semifinals },
      { term: 'Final', date: CCS.keyDates.finals },
    ],
    bracket: { published: playoffs.bracketPublished, url: playoffs.bracketUrl },
    link: { href: `/playoffs#${league.id}`, label: 'CCS playoffs' },
  };
}
