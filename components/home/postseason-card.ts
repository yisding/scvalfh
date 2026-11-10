/**
 * The home panel's postseason card (PostseasonCard.tsx), by the league's postseason kind: the CCS ladder's berth
 * meter, dates and dated footer sentence; a league tournament's results-first line; an unbracketed tournament's,
 * the section playoffs' or no postseason's one line and note. Built on the server by home-view.ts buildHomeView.
 */

import { getLeagueTournament, getPlayoffs, getToday } from '../../lib/data';
import { dateSpan, leagueClock, listWords, monthDay, numberWord, shortDate } from '../../lib/format';
import { CCS } from '../../lib/league-config/sections';
import type { LeagueConfig, PostseasonConfig, TournamentConfig } from '../../lib/league-config/shape';
import { getDivision, sectionOf } from '../../lib/leagues';
import { tournamentHeadline } from '../../lib/postseason/postseason';
import { pairingDatesLabel } from '../../lib/standings/ladder';
import type { LeagueId, SeasonPhase } from '../../lib/types';
import { plural } from '../words/plural';

export type PostseasonView =
  | {
      kind: 'ccs-ladder';
      leagueId: LeagueId;
      /** One sentence about this league's own pre-CCS games, or the seeding date. */
      intro: string;
      /** `total` null: the CCS field size is unread (soccer), so the card states the label without a meter. */
      meter: { claimed: number; total: number | null; label: string };
      dates: Array<{ term: string; date: string }>;
      bracket: { published: boolean; url: string };
      /**
       * The card's footer sentence, dated: 'Berths are assigned by the CCS committee. Nothing here is official until
       * the seeding meeting.' through the seeding meeting's day; from the day after, 'Berths were assigned by the CCS
       * committee on Mon Nov 2; results update twice a day.'
       */
      official: string;
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
      /**
       * The Sunset: no playoffs (CIF-SS Blue Book 2011.1, 3500.2). The line is the config's note; the note is
       * the section's outside tournament (the Tournament of Champions, DESIGN §24.13), or null without one.
       */
      kind: 'no-postseason';
      leagueId: LeagueId;
      line: string;
      note: string | null;
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
      // The section's outside tournament, when it has one (the Southern Section's Tournament of Champions,
      // DESIGN §24.13): the note names the event, its dates and that CIF does not run it.
      return {
        kind: 'no-postseason',
        leagueId: league.id,
        line: ps.note,
        note: sectionOf(league.id).outsideTournament?.note ?? null,
        link: { href: `/playoffs#${league.id}`, label: 'Postseason' },
      };
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
  ps: TournamentConfig,
  sectionNote: string | null,
): PostseasonView {
  // Results first (DESIGN §24.13): 'MCAL tournament · Champion: Tamalpais won the MCAL tournament, beating …' or
  // 'MCAL tournament · Final Fri Oct 30, 4 PM PT at Tamalpais: 3 Redwood at 1 Tamalpais'; the static round list
  // only while the picture is projected from the table.
  const headline = tournamentHeadline(getLeagueTournament(league.id), league);
  const live = headline.champion ? `Champion: ${headline.champion}` : headline.next;
  const round = (id: string) => ps.rounds.find((r) => r.id === id);
  const qf = round('qf-1');
  const sf = round('sf-1');
  const final = round('final');
  const playIn = round('play-in');
  const parts = [ps.name];
  if (live) parts.push(live);
  else {
    if (qf) parts.push(`Quarterfinals ${shortDate(qf.date)}${playIn ? ` (a play-in ${shortDate(playIn.date)} only if needed)` : ''}`);
    if (sf) parts.push(`Semifinals ${shortDate(sf.date)}`);
    if (final) parts.push(`Final ${shortDate(final.date)} at ${ps.finalSite.label}`);
  }
  return {
    kind: 'league-tournament',
    leagueId: league.id,
    line: parts.join(' · '),
    note: sectionNote,
    link: { href: `/playoffs/${league.id}`, label: 'Bracket' },
  };
}

/**
 * The CCS card's footer sentence, in the day's tense (DESIGN §8 "say what is true, say when it changes"): the CCS
 * committee assigns the berths at its seeding meeting (CCS.keyDates.seedingMeeting, Mon Nov 2, 1 PM, 2026). The past
 * tense starts the day AFTER the meeting, not on its day: an update that lands on Nov 2 runs before 1 PM Pacific
 * (the crons are 5:00 and 14:00 UTC, 9 PM and 6 AM PST after Nov 1, and run 3-6 hours late), when nothing has been
 * assigned yet. `today` is getToday(), never Date.now().
 */
export function ccsOfficialSentence(today: string): string {
  const seedingDay = CCS.keyDates.seedingMeeting.slice(0, 10);
  return today > seedingDay
    ? `Berths were assigned by the CCS committee on ${shortDate(CCS.keyDates.seedingMeeting)}; results update twice a day.`
    : 'Berths are assigned by the CCS committee. Nothing here is official until the seeding meeting.';
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
  } else if (total === null) {
    // Each division's own automatic places (soccer SCVAL: De Anza's top three, El Camino's champion).
    const perDivision = ps.ladder
      .filter((r) => r.status === 'aq' && r.divisions !== '*')
      .flatMap((r) => (r.divisions === '*' ? [] : r.divisions).map((d) => {
        const top = r.places[1];
        return `${getDivision(d).label}’s ${top === 1 ? 'champion' : `top ${numberWord(top)}`}`;
      }));
    label = `${short} holds ${plural(ps.autoBerths, 'automatic CCS berth')}: ${
      perDivision.length > 0 ? listWords(perDivision) : `the top ${numberWord(aqTop)} of the final standings`
    }.`;
  } else {
    label = `${short} holds ${ps.autoBerths} of the ${total} CCS berths automatically: the top ${numberWord(
      aqTop,
    )} of the final standings.`;
  }

  const seeding = shortDate(CCS.keyDates.seedingMeeting);
  const beforeLeagueGames = phase === 'preseason' || phase === 'regular';
  let intro: string;
  if (crossover && beforeLeagueGames) {
    intro = `Crossover and the 4-vs-4 play-in ${pairingDatesLabel(ps.pairings)}. Seeding meeting ${seeding}.`;
  } else if (crossover && phase === 'crossover') {
    intro = `League play is done. Crossover and the play-in are ${pairingDatesLabel(ps.pairings)}; the seeding meeting is ${seeding}.`;
  } else if (playIn && (beforeLeagueGames || phase === 'play-in')) {
    intro = `Play-in ${shortDate(playIn.date)}${playIn.time ? `, ${leagueClock(playIn.time)}` : ''}. Seeding meeting ${seeding}.`;
  } else {
    intro = `Seeding meeting ${seeding}.`;
  }

  const official = ccsOfficialSentence(getToday());

  const playoffs = getPlayoffs();
  return {
    kind: 'ccs-ladder',
    leagueId: league.id,
    intro,
    meter: { claimed: ps.autoBerths, total, label },
    // Each round's first day: where divisions play a round on different days (soccer), the earliest.
    dates: [
      { term: 'Quarterfinals', date: CCS.keyDates.quarterfinals },
      { term: 'Semifinals', date: CCS.keyDates.semifinals },
      { term: 'Final', date: CCS.keyDates.finals },
    ],
    bracket: { published: playoffs.bracketPublished, url: playoffs.bracketUrl ?? CCS.sources.index },
    official,
    link: { href: `/playoffs#${league.id}`, label: 'CCS playoffs' },
  };
}
