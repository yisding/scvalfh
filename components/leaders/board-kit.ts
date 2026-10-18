/**
 * The pieces every /leaders board module shares: a row's team link, a plain number cell, and the one
 * builder that turns a ranked list of schools into a `LeaderBoard` (the school boards and the Elo
 * board both use it).
 */

import { statText } from '@/components/teams/player-stats-view';
import { getLeague } from '@/lib/leagues';
import type { Team } from '@/lib/types';
import { rankBoard } from './ranking';
import type { BoardScope } from './scope';
import type { LeaderBoard, LeaderCell, LeaderColumnSpec, LeaderTeamRef } from './types';

export function teamRef(team: Team, anchor = ''): LeaderTeamRef {
  return {
    slug: team.slug,
    name: team.name,
    shortName: team.shortName,
    leagueShort: getLeague(team.league).shortName,
    href: `/teams/${team.slug}${anchor}`,
  };
}

/** A count as a cell: null (an untracked stat) prints as a dash, never a 0. */
export const num = (v: number | null): LeaderCell => ({ text: statText(v) });

/** School names, registry order: prose spells them out (shortName is for a narrow cell). */
export const names = (teams: readonly Team[]) => teams.map((t) => t.name);

/**
 * Said on both adjusted boards when lib/adjusted-scoring.ts's goal model did not converge and so adjusted
 * nothing (it has converged on every day replayed): a board titled "Elo-adjusted" must not then read as if
 * it had been.
 */
export const UNADJUSTED_NOTE =
  ' The goal model did not settle on this build’s data, so no game is weighed here: every schedule factor is 1.00.';

/** A school board, as each one declares it. */
export interface SchoolBoardSpec<L extends { team: Team }> {
  /** The unsuffixed anchor: 'best-record'. */
  id: string;
  title: string;
  navLabel: string;
  meta: string;
  /** Best first, already filtered to the schools that qualify. */
  sorted: readonly L[];
  /** Two neighbours share a place. */
  same: (a: L, b: L) => boolean;
  columns: LeaderColumnSpec<L>[];
  rankedBy: number;
  note: string;
  method?: string;
  empty: string;
  /** The team page anchor a row links to: '#elo'. */
  anchor?: string;
}

export function schoolBoard<L extends { team: Team }>(spec: SchoolBoardSpec<L>, scope: BoardScope): LeaderBoard {
  return {
    id: `${spec.id}${scope.suffix}`,
    kind: 'school',
    title: spec.title,
    navLabel: spec.navLabel,
    meta: spec.meta,
    caption: `${spec.title}, schools in ${scope.leagues}, this season`,
    columns: spec.columns.map(({ key, label, title }) => ({ key, label, title })),
    rankedBy: spec.rankedBy,
    rows: rankBoard(spec.sorted, spec.same).map(({ item, rank, tied }) => ({
      key: item.team.slug,
      rank,
      tied,
      name: item.team.name,
      facts: [],
      team: teamRef(item.team, spec.anchor),
      cells: spec.columns.map((c) => c.cell(item)),
    })),
    extra: null,
    note: spec.note,
    method: spec.method ?? null,
    empty: spec.empty,
  };
}
