/**
 * The home panel's PhaseLead paragraph (components/home/PhaseLead.tsx): what a league's season is
 * doing today, in one bold sentence and an optional body and link, chosen from the league's phase
 * and its config dates (SPEC §10.1).
 */

import { CCS, leaguePlayStarts } from '@/lib/config/leagues';
import { standaloneName } from '@/lib/config/leagues/labels';
import { hasHistory } from '@/lib/datasets/history';
import { dateSpan, shortDate } from '@/lib/format/dates';
import { ordinalWord } from '@/lib/format/numbers';
import { agree, plural } from '@/lib/format/words';
import type { LeagueConfig } from '@/lib/model/league-config';
import type { SeasonPhase } from '@/lib/model/season';
import { getNonLeagueFinalsPlayed } from '@/lib/queries/games';
import { playInClause } from '@/lib/queries/postseason';
import { playoffsHref, scheduleHref } from '@/lib/shared/routes';

export interface PhaseLeadView {
  /** The bold opening sentence. */
  lead: string;
  /** The rest of the paragraph ('' when none). */
  body: string;
  link: { href: string; label: string } | null;
}

/** The PhaseLead copy for a league in a phase on a day (exported for tests/views/home/home-view.test.ts). */
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
                agree(nonLeague, 'is', 'are')
              } on the schedule and in the overall records, not in the standings.`
            : 'No games have been played yet, so every record below is empty on purpose.',
        link: { href: scheduleHref(league.id), label: 'Full schedule' },
      };
    }
    return {
      lead: `${short} league play starts ${shortDate(firstLeague)}.`,
      body:
        nonLeague > 0
          ? `These tables count league games only, so the ${plural(nonLeague, 'non-league game')} played so far ${
              agree(nonLeague, 'is', 'are')
            } on the schedule and in the overall records, not in the standings.`
          : 'No games have been played yet, so every record below is empty on purpose.',
      link: { href: scheduleHref(league.id), label: 'Full schedule' },
    };
  }

  if (phase === 'regular') return null;

  if (phase === 'crossover' && ps.kind === 'ccs-ladder') {
    const crossover = ps.pairings[0];
    return {
      lead: 'League play is over.',
      body: `The crossover games and the fourth-place play-in for ${short}’s ${ordinalWord(ps.autoBerths)} automatic CCS berth are ${shortDate(
        crossover?.date ?? keyDates.endOfLeagueSeason,
      )}; the CCS seeding meeting is ${shortDate(keyDates.seedingMeeting)}.`,
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
    const round = (id: string) => ps.rounds.find((r) => r.id === id);
    const qf = round('qf-1');
    const playIn = round('play-in');
    const final = round('final');
    return {
      lead: `${short} league play is over.`,
      body: `Quarterfinals are ${qf ? shortDate(qf.date) : 'to be set'}${
        playIn ? ` (a play-in ${shortDate(playIn.date)} only if needed)` : ''
      }; the final is ${final ? shortDate(final.date) : 'to be set'} at ${ps.finalSite.label}.`,
      link: { href: playoffsHref(league.id), label: 'Bracket' },
    };
  }

  if (phase === 'tournament' && ps.kind === 'unbracketed-tournament') {
    // No bracket and no page of its own: the dates and what is not published yet, linking to the
    // league's pointer card on /playoffs.
    return {
      lead: `The ${ps.name} is ${dateSpan(ps.dates.first, ps.dates.last)}; its format and site are not published yet.`,
      body: '',
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
        seeding ? `; the Section publishes its brackets after its ${shortDate(seeding.date)} seeding meeting` : ''
      }.`,
      link: { href: `/playoffs#${league.id}`, label: 'Postseason' },
    };
  }

  // The CCS tournament: only a league whose postseason is the CCS ladder reaches it.
  if (phase === 'playoffs' && ps.kind === 'ccs-ladder') {
    if (today < keyDates.quarterfinals) {
      return {
        lead: `${short} league play is over.`,
        body: `CCS seeds the ${CCS.autoQualifiers.total}-team field on ${shortDate(
          keyDates.seedingMeeting,
        )}; quarterfinals are ${shortDate(keyDates.quarterfinals)}.`,
        link: { href: `/playoffs#${league.id}`, label: 'Who is in' },
      };
    }
    return {
      lead: 'The CCS tournament is under way.',
      body: `Quarterfinals ${shortDate(keyDates.quarterfinals)}, semifinals ${shortDate(
        keyDates.semifinals,
      )}, final ${shortDate(keyDates.finals)}. League standings below are final.`,
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
