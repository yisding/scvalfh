/**
 * The `/playoffs/<league>` page's own words and model (SPEC §6.2, §6.3, §10.7): the header line
 * (`tournamentHeaderMeta`, which the page description reuses) and the seeds, play-in and bracket
 * (`tournamentPageView`). The params and the 404 guard the page shares with its OG card are
 * views/playoffs/tournament-route.ts; the pure bracket model is views/playoffs/tournament.ts.
 */

import { getDivision } from '@/lib/config/leagues';
import { outcomesFor, playoffOutcomeLabel } from '@/lib/engine/standings';
import { shortDate } from '@/lib/format/dates';
import type { Team } from '@/lib/model/team';
import type { LeagueSummary } from '@/lib/queries/leagues';
import { getLeagueTournament } from '@/lib/queries/postseason';
import { getStandingContext, getStandings } from '@/lib/queries/standings';
import { getTeamById, getTeamBySlug } from '@/lib/registry/teams';

import { buildTournamentView, type TournamentView } from './tournament';
import type { TournamentConfig } from './tournament-route';

function roundDate(ps: TournamentConfig, round: string): string | null {
  return ps.rounds.find((r) => r.round === round)?.date ?? null;
}

/** The rounds the header names: 'Quarterfinals Mon Oct 26 · Final Fri Oct 30' (a round with no date is left out). */
export function tournamentRoundsLine(ps: TournamentConfig): string {
  const qf = roundDate(ps, 'quarterfinal');
  const final = roundDate(ps, 'final');
  return [...(qf ? [`Quarterfinals ${shortDate(qf)}`] : []), ...(final ? [`Final ${shortDate(final)}`] : [])].join(
    ' · ',
  );
}

/** 'Marin County Athletic League · 6 teams · Quarterfinals Mon Oct 26 · Final Fri Oct 30' */
export function tournamentHeaderMeta(summary: LeagueSummary, ps: TournamentConfig): string {
  const rounds = tournamentRoundsLine(ps);
  return [summary.name, `${ps.qualifiers} teams`, ...(rounds ? [rounds] : [])].join(' · ');
}

/** The page's seeds, play-in and bracket, from the league's projection and its standings rows. */
export function tournamentPageView(summary: LeagueSummary, ps: TournamentConfig): TournamentView {
  const projection = getLeagueTournament(summary.id);
  const rows = summary.divisions.flatMap((d) => {
    const context = getStandingContext(d.id);
    return getStandings(d.id).flatMap((standing) => {
      const team = getTeamById(standing.teamId);
      if (!team) return [];
      const ctx = context.get(standing.teamId);
      return [
        {
          team,
          standing,
          counted: ctx?.counted ?? standing.computed.gp,
          scheduled: ctx?.scheduled ?? getDivision(d.id).gamesPerTeam,
          label: playoffOutcomeLabel(d.id, outcomesFor(standing)),
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
  });
}
