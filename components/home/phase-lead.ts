/**
 * The home panel's PhaseLead copy (DESIGN §3.1): the bold opening sentence, the rest of the paragraph and its link,
 * for a league in a season phase on a day. Built on the server for every league by home-view.ts buildHomeView;
 * "today" is getToday(), never the clock. Reads the snapshot only through lib/data.
 */

import { getLeagueTournament, getNonLeagueFinalsPlayed } from '../../lib/data';
import { dateSpan, ordinalWord, shortDate } from '../../lib/format';
import { hasHistory } from '../../lib/history/history';
import { CCS, ccsRoundDays } from '../../lib/league-config/sections';
import type { LeagueConfig } from '../../lib/league-config/shape';
import { leaguePlayStarts, standaloneName } from '../../lib/leagues';
import { tournamentHeadline } from '../../lib/postseason/postseason';
import { pairingDatesLabel } from '../../lib/standings/ladder';
import type { SeasonPhase } from '../../lib/types';
import { playInClause } from '../playoffs/team-postseason-line';
import { plural } from '../words/plural';

export interface PhaseLeadView {
  /** The bold opening sentence. */
  lead: string;
  /** The rest of the paragraph ('' when none). */
  body: string;
  link: { href: string; label: string } | null;
}

/** The PhaseLead copy for a league in a phase on a day (exported for tests/ui/home-view.test.ts). */
export function phaseLead(league: LeagueConfig, phase: SeasonPhase, today: string): PhaseLeadView | null {
  const short = league.shortName;
  const firstLeague = leaguePlayStarts(league.id);
  const ps = league.postseason;
  const keyDates = CCS.keyDates;


  if (phase === 'preseason' || (phase === 'regular' && today < firstLeague)) {
    // Games played SO FAR — a non-league final later in the season has not been played yet.
    const nonLeague = getNonLeagueFinalsPlayed(league.id, today);
    // A group of independents (the LA independents, DESIGN §24.10) has no league play: its table
    // counts the games between its members, so the lead names the first of those and the body says what the
    // table counts. 'LA' alone names a place, so the sentence names the group (standaloneName).
    if (league.independents) {
      return {
        lead: `The first game between two of ${standaloneName(league.id)} is ${shortDate(firstLeague)}.`,
        body:
          nonLeague > 0
            ? `The table counts only games between the independents, so the ${plural(nonLeague, 'game')} played so far against other teams ${
                nonLeague === 1 ? 'is' : 'are'
              } on the schedule and in the overall records, not in the standings.`
            : 'No games have been played yet, so every record below is empty on purpose.',
        link: { href: `/schedule/${league.id}`, label: 'Full schedule' },
      };
    }
    return {
      lead: `${short} league play starts ${shortDate(firstLeague)}.`,
      body:
        nonLeague > 0
          ? `These tables count league games only, so the ${plural(nonLeague, 'non-league game')} played so far ${
              nonLeague === 1 ? 'is' : 'are'
            } on the schedule and in the overall records, not in the standings.`
          : 'No games have been played yet, so every record below is empty on purpose.',
      link: { href: `/schedule/${league.id}`, label: 'Full schedule' },
    };
  }

  if (phase === 'regular') return null;

  if (phase === 'crossover' && ps.kind === 'ccs-ladder') {
    // The pairings' day(s): 'Thu Oct 29 and Fri Oct 30' when a crossover moved off the schedule's day.
    const when = pairingDatesLabel(ps.pairings) || shortDate(keyDates.endOfLeagueSeason);
    return {
      lead: 'League play is over.',
      body: `The crossover games and the fourth-place play-in for ${short}’s ${ordinalWord(ps.autoBerths)} automatic CCS berth are ${when}; the CCS seeding meeting is ${shortDate(keyDates.seedingMeeting)}.`,
      link: { href: `/playoffs#${league.id}`, label: 'Who is in' },
    };
  }

  if (phase === 'play-in' && ps.kind === 'ccs-ladder') {
    const playIn = ps.pairings.find((p) => p.isPlayIn);
    if (playIn) {
      return {
        lead: `${short} league play is over.`,
        body: `${playInClause(league, ps, playIn)}; the CCS seeding meeting is ${shortDate(keyDates.seedingMeeting)}.`,
        link: { href: `/playoffs#${league.id}`, label: 'Who is in' },
      };
    }
  }

  if (phase === 'tournament' && ps.kind === 'league-tournament') {
    // Results first (DESIGN §24.13): the champion once the final has a winner, else the next round's matchups
    // (lib/postseason/postseason.ts tournamentHeadline); the static round list only while the picture is projected.
    const headline = tournamentHeadline(getLeagueTournament(league.id), league);
    if (headline.champion) {
      return { lead: headline.champion, body: '', link: { href: `/playoffs/${league.id}`, label: 'Bracket' } };
    }
    if (headline.next) {
      return { lead: `${short} league play is over.`, body: `${headline.next}.`, link: { href: `/playoffs/${league.id}`, label: 'Bracket' } };
    }
    const round = (id: string) => ps.rounds.find((r) => r.id === id);
    const qf = round('qf-1');
    const playIn = round('play-in');
    const final = round('final');
    return {
      lead: `${short} league play is over.`,
      body: `Quarterfinals are ${qf ? shortDate(qf.date) : 'to be set'}${
        playIn ? ` (a play-in ${shortDate(playIn.date)} only if needed)` : ''
      }; the final is ${final ? shortDate(final.date) : 'to be set'} at ${ps.finalSite.label}.`,
      link: { href: `/playoffs/${league.id}`, label: 'Bracket' },
    };
  }

  if (phase === 'tournament' && ps.kind === 'unbracketed-tournament') {
    // No bracket and no page of its own: the dates and what is not published yet, linking to the
    // league's pointer card on /playoffs.
    // The site comes from a listing (config `site`, the NFHS Network), named as such; the pairings are not published.
    const where = ps.site
      ? `${ps.site.basis} has its games at ${ps.site.label} on ${shortDate(ps.site.day)}`
      : 'its format and site are not published yet';
    return {
      lead: `The ${ps.name} is ${dateSpan(ps.dates.first, ps.dates.last)}; ${where}.`,
      body: ps.site ? 'Pairings are not published; results appear here as MaxPreps posts them.' : '',
      link: { href: `/playoffs#${league.id}`, label: 'Postseason' },
    };
  }

  if (phase === 'tournament' && ps.kind === 'section-playoffs') {
    // The San Diego Section's playoffs (Green Book 2026-27 Bylaw 2000.1): the Section places the teams and
    // draws the brackets, and this site projects neither, so the lead says when and what is published.
    const seeding = league.keyDates.find((d) => d.id === 'seeding-meeting');
    return {
      lead: `${short} league play is over.`,
      body: `The ${ps.name} are ${dateSpan(ps.dates.first, ps.dates.last)}${
        seeding ? `; the Section posts its brackets on its field hockey page after its ${shortDate(seeding.date)} seeding meeting` : ''
      }.`,
      link: { href: `/playoffs#${league.id}`, label: 'Postseason' },
    };
  }

  // The CCS tournament: only a league whose postseason is the CCS ladder reaches it.
  if (phase === 'playoffs' && ps.kind === 'ccs-ladder') {
    if (today < keyDates.quarterfinals) {
      // A field the config does not size (soccer: the CCS allocation is not transcribed) is not counted.
      const seeds = CCS.autoQualifiers.total === null ? 'CCS seeds the field' : `CCS seeds the ${CCS.autoQualifiers.total}-team field`;
      return {
        lead: `${short} league play is over.`,
        body: `${seeds} on ${shortDate(keyDates.seedingMeeting)}; quarterfinals are ${shortDate(keyDates.quarterfinals)}.`,
        link: { href: `/playoffs#${league.id}`, label: 'Who is in' },
      };
    }
    return {
      lead: 'The CCS tournament is under way.',
      body: `Quarterfinals ${shortDate(keyDates.quarterfinals)}, semifinals ${ccsRoundDays(
        keyDates,
        'semifinals',
        shortDate,
      )}, final ${ccsRoundDays(keyDates, 'finals', shortDate)}. League standings below are final.`,
      link: { href: `/playoffs#${league.id}`, label: 'Bracket' },
    };
  }

  if (phase === 'complete') {
    return {
      lead: 'The season is over.',
      // A 'site' league publishes no standings (the Sunset, the San Diego leagues): the final table is ours.
      body:
        league.rules.orderScope === 'site'
          ? 'The tables below are this site’s final tables, ordered by its own points.'
          : 'The tables below are the final league standings.',
      // Only a league with a published 2025-26 table has a last season to link to.
      link: hasHistory(league.id) ? { href: `/history/2025-26#${league.id}`, label: 'Last season' } : null,
    };
  }

  return null;
}
