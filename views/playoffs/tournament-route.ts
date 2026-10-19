/**
 * The league-tournament lookup that `/playoffs/<league>` and its OG card share (SPEC §6.2, §8.1;
 * contract: views/site/route-contract.ts): which params the route prerenders, and the league plus
 * its tournament config for one of them.
 *
 * It reads `lib/queries/`, so it sits beside the pure `tournament.ts` rather than in it, the way
 * `views/standings/standings-view.ts` sits beside `division.ts`. The page and the
 * OG route both call these, so the OG card's params and its 404 guard cannot drift from the page's.
 * They are not exported from the page itself because a page file may only export the route's own
 * names. The page's own words also live here: the header line (`tournamentHeaderMeta`, which the page
 * description reuses) and the page model (`tournamentPageView`).
 */

import { TOURNAMENT_LEAGUE_IDS, getDivision, getLeague } from '@/lib/config/leagues';
import { outcomesFor, playoffOutcomeLabel } from '@/lib/engine/standings';
import { shortDate } from '@/lib/format/dates';
import type { LeagueConfig } from '@/lib/model/league-config';
import type { Team } from '@/lib/model/team';
import { type LeagueSummary, getLeagueSummary } from '@/lib/queries/leagues';
import { getLeagueTournament } from '@/lib/queries/postseason';
import { getStandingContext, getStandings } from '@/lib/queries/standings';
import { getTeamById, getTeamBySlug } from '@/lib/registry/teams';
import { buildTournamentView, type TournamentView } from '@/views/playoffs/tournament';
import type { StaticParams } from '@/views/site/route-contract';

/** A league-tournament league's postseason config (MCAL's). */
export type TournamentConfig = Extract<LeagueConfig['postseason'], { kind: 'league-tournament' }>;

/** One param per league-tournament league (today `mcal`): the page's and the OG card's `generateStaticParams`. */
export function tournamentStaticParams(): StaticParams<'league'> {
  return TOURNAMENT_LEAGUE_IDS.map((league) => ({ league }));
}

/**
 * The league and its tournament config, or null for any param that is not a tournament league
 * (an unknown id, a CCS league, the unbracketed EAL). Checked BEFORE `getLeagueTournament`, which
 * throws for a league without a tournament.
 */
export function tournamentParam(
  raw: string,
): { summary: LeagueSummary; config: LeagueConfig; ps: TournamentConfig } | null {
  if (!TOURNAMENT_LEAGUE_IDS.includes(raw)) return null;
  const summary = getLeagueSummary(raw);
  if (!summary) return null;
  const config = getLeague(summary.id);
  if (config.postseason.kind !== 'league-tournament') return null;
  return { summary, config, ps: config.postseason };
}

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
