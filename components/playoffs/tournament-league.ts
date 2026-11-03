/**
 * The league-tournament lookup that `/playoffs/<league>` and its OG card share (SPEC §6.2, §8.1):
 * which params the route prerenders, and the league plus its tournament config for one of them. Since
 * 2026-11-03 also the tournament's view model and title sentence, which `/playoffs` shares too (the MCAL
 * section draws the whole tournament there, like every other league's postseason).
 *
 * It reads `lib/data`, so it sits beside the pure `playoff-view.ts` rather than in it, the way
 * `components/standings/standings-page-view.ts` sits beside `standings-view.ts`. The page and the
 * OG route both call these, so the OG card's params and its 404 guard cannot drift from the page's.
 * They are not exported from the page itself because a page file may only export the route's own
 * names.
 */

import {
  getLeagueSummary,
  getLeagueTournament,
  getStandingContext,
  getStandings,
  getTeamById,
  getTeamBySlug,
  getTournamentLeagueIds,
  type LeagueSummary,
} from '../../lib/data';
import { getDivision, getLeague, type LeagueConfig } from '../../lib/leagues';
import { tournamentOutcome, tournamentOutcomeCopy } from '../../lib/postseason';
import { schoolAddress } from '../../lib/schools';
import { outcomesFor, playoffOutcomeLabel } from '../../lib/standings';
import type { LeagueTournamentProjection, Team } from '../../lib/types';

import { buildTournamentView, type TournamentView } from './playoff-view';

/** A league-tournament league's postseason config (MCAL's). */
export type TournamentConfig = Extract<LeagueConfig['postseason'], { kind: 'league-tournament' }>;

/** One param per league-tournament league (today `mcal`): the page's and the OG card's `generateStaticParams`. */
export function tournamentStaticParams(): { league: string }[] {
  return getTournamentLeagueIds().map((league) => ({ league }));
}

/**
 * The league and its tournament config, or undefined for any param that is not a tournament league
 * (an unknown id, a CCS league, the unbracketed EAL). Checked BEFORE `getLeagueTournament`, which
 * throws for a league without a tournament.
 */
export function tournamentLeague(
  id: string,
): { summary: LeagueSummary; config: LeagueConfig; ps: TournamentConfig } | undefined {
  if (!getTournamentLeagueIds().includes(id)) return undefined;
  const summary = getLeagueSummary(id);
  if (!summary) return undefined;
  const config = getLeague(summary.id);
  if (config.postseason.kind !== 'league-tournament') return undefined;
  return { summary, config, ps: config.postseason };
}

/**
 * The league's title rule applied to the result (config `titleNote`, MCAL General Rules Pennants 1–3): the
 * regular-season points leader (seed 1) is MCAL Champion; when a different team wins the tournament it also
 * receives a pennant, and the sentence names both.
 */
export function titleSentence(projection: LeagueTournamentProjection, ps: TournamentConfig): string {
  const champion = projection.champion;
  if (!champion) return ps.titleNote;
  const leader = projection.seeds.find((s) => s.seed === 1)?.seat;
  const leaderSlug = leader && leader.length === 1 ? leader[0].slug : null;
  const leaderName = leaderSlug ? (getTeamBySlug(leaderSlug)?.name ?? leaderSlug) : null;
  const championName = getTeamBySlug(champion.slug)?.name ?? champion.slug;
  const title = ps.name.replace(/ tournament$/, '');
  if (leaderName && leaderSlug === champion.slug) {
    return `${championName} is the regular-season ${title} Champion (the points leader) and the tournament champion.`;
  }
  if (leaderName) {
    return `${leaderName} is the regular-season ${title} Champion (the points leader); ${championName} won the tournament and also receives a pennant.`;
  }
  return ps.titleNote;
}

/** The tournament's seeds, play-in and bracket as LeagueTournament draws them (both pages call this). */
export function tournamentView(summary: LeagueSummary, ps: TournamentConfig, config: LeagueConfig): TournamentView {
  const projection = getLeagueTournament(summary.id);
  const rows = summary.divisions.flatMap((d) => {
    const context = getStandingContext(d.id);
    return getStandings(d.id).flatMap((standing) => {
      const team = getTeamById(standing.teamId);
      if (!team) return [];
      const ctx = context.get(standing.teamId);
      // The status column reads the results once the tournament is under way ('In the MCAL final', 'Lost in the
      // semifinal'); the table's ladder rung ('Semifinal bye') only while the picture is projected (DESIGN §24.13).
      const ladderLabel = playoffOutcomeLabel(d.id, outcomesFor(standing));
      const label = tournamentOutcomeCopy(tournamentOutcome(projection, team.slug), team.slug, config, { label: ladderLabel, sentence: '' }).label;
      return [
        {
          team,
          standing,
          counted: ctx?.counted ?? standing.computed.gp,
          scheduled: ctx?.scheduled ?? getDivision(d.id).gamesPerTeam,
          label,
        },
      ];
    });
  });
  // A league tournament is single-division (MCAL); its one division's ladder line is the tournament line.
  const division = getDivision(summary.divisions[0].id);
  return buildTournamentView({
    projection,
    rows,
    teamOf: (slug): Team | undefined => getTeamBySlug(slug),
    lastPlace: ps.lastSpot.place,
    ladderLine: division.ladderLine,
    // The site school's own address (data/schools.json); lib/teams.ts checks the slug is a member.
    finalSite: { ...ps.finalSite, address: schoolAddress(ps.finalSite.slug) },
  });
}

