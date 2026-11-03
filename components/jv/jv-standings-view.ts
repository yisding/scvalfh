/**
 * The JV tables' view model: one block per division on `/jv` (`#<division>`), and a team's JV
 * place for its team page.
 *
 * Every number comes from lib/jv/jv.ts (lib/jv/jv-standings.ts: JV league games take their varsity
 * counterpart's classification; tables order on points; a table is shown only once enough of the
 * played JV league games have a score). The copy says which of those it is, in words.
 *
 * SERVER-ONLY: reads lib/jv/jv, which imports data/jv.json and the snapshot.
 */

import { listWords, monthDay, ordinal, plural, recordString } from '../../lib/format';
import { getJvClassification, getJvTable, getJvTables } from '../../lib/jv/jv';
import {
  JV_STANDINGS_MIN_REPORTED_SHARE,
  type JvClassification,
  type JvDivisionTable,
  type JvStandingRow,
} from '../../lib/jv/jv-standings';
import { divisionHeading, getDivision, getLeague, isSingleDivision } from '../../lib/leagues';
import { jvSlotTeamFor } from '../../lib/jv/jv-teams';
import { getTeamBySlug, teamsInDivision } from '../../lib/teams';
import type { DivisionId, LeagueId, Team, TeamSlug } from '../../lib/types';
import { shortNameOf } from '../words/team-short-name';

export interface JvTableView {
  division: DivisionId;
  /** `de-anza`: the block's anchor on /jv; null in a single-division league, whose section is its anchor. */
  anchor: string | null;
  /** `De Anza JV` for a multi-division league, `SCVAL JV` for a single-division one. */
  title: string;
  status: JvDivisionTable['status'];
  /** `team` is null for a JV slot team (York), which has no page; `mascot` is then its tile stem. */
  rows: Array<{ row: JvStandingRow; team: Team | null; mascot: string | null }>;
  /** "York plays the JV games of Santa Catalina, which fields varsity only, …" when the table has such a team. */
  slotNote: string | null;
  /** "12 of the 18 El Camino JV league games played so far have a score (2 are si.com’s †)." */
  coverage: string;
  /** "Through Sep 30." when the table is shown and has a counted final. */
  through: string | null;
  /** Why there is no table, when there is none. */
  emptyHeading: string | null;
  /** "Valley Christian has no JV league game on MaxPreps or si.com, so is not in the table." */
  absentNote: string | null;
  /** "Not counted: Valley Christian at Fremont, Sep 22 (no varsity game matches it)." Each game names its own reason. */
  uncountedNote: string | null;
}

/** Why an uncounted JV game is not counted, in words, for each reason lib/jv/jv-standings.ts gives. */
export const UNCOUNTED_REASON_WORDS: Readonly<Record<UncountedReason, string>> = {
  'no-varsity-counterpart': 'no varsity game matches it',
  ambiguous: 'two varsity games are equally near it',
  'varsity-postseason': 'its varsity game is a postseason game',
};

type UncountedReason = Extract<JvClassification, { kind: 'uncounted' }>['reason'];

const SHARE_WORDS = `${Math.round(JV_STANDINGS_MIN_REPORTED_SHARE * 100)}%`;

/** `De Anza JV` | `MCAL JV`. */
export function jvTableTitle(division: DivisionId): string {
  const heading = divisionHeading(division);
  return `${heading ?? getLeague(getDivision(division).leagueId).shortName} JV`;
}

function viewOf(t: JvDivisionTable): JvTableView {
  const title = jvTableTitle(t.division);
  const isAre = (n: number) => `${n} ${n === 1 ? 'is' : 'are'}`;
  const marked = [
    t.sbliveScores > 0 ? `${isAre(t.sbliveScores)} si.com’s` : null,
    t.schoolSiteScores > 0 ? `${t.schoolSiteScores} from a school’s own athletics site` : null,
  ].filter((p): p is string => p !== null);
  const sblive = marked.length ? ` (${marked.join(', ')} †)` : '';
  const coverage =
    t.played === 0
      ? `No ${title} league game has been played yet${t.toCome > 0 ? `; ${isAre(t.toCome)} to come` : ''}.`
      : `${t.reported} of the ${plural(t.played, `${title} league game`)} played so far ${t.reported === 1 ? 'has' : 'have'} a score${sblive}.`;
  const emptyHeading =
    t.status === 'shown'
      ? null
      : t.status === 'none-played'
        ? t.rows.length === 0
          ? `No ${title} league games are listed.`
          : `No ${title} league games have been played yet.`
        : `Not enough ${title} results for a table yet.`;
  const absent = t.absent.map((slug) => shortNameOf(slug, slug));
  // No school of the division has a JV league game at all: one heading, one line, nothing else.
  const noneListed = t.rows.length === 0;
  return {
    division: t.division,
    anchor: isSingleDivision(t.league) ? null : t.division,
    title,
    status: t.status,
    rows: t.rows.map((row) => ({
      row,
      team: row.slug ? getTeamBySlug(row.slug)! : null,
      mascot: row.slug ? null : (jvSlotTeamFor(row.jvFor ?? null)?.mascot ?? null),
    })),
    slotNote: slotNoteOf(t),
    coverage: noneListed
      ? `No ${title.replace(/ JV$/, '')} school has a JV league game on MaxPreps or si.com.`
      : t.status === 'too-few'
        ? `${coverage} A table needs ${SHARE_WORDS}.`
        : coverage,
    through: t.status === 'shown' && t.throughDate ? `Through ${monthDay(t.throughDate)}.` : null,
    emptyHeading,
    absentNote:
      absent.length && !noneListed
        ? `${listWords(absent)} ${absent.length === 1 ? 'has' : 'have'} no JV league game on MaxPreps or si.com, so ${absent.length === 1 ? 'is' : 'are'} not in the table.`
        : null,
    uncountedNote: t.uncounted.length
      ? `Not counted: ${t.uncounted
          .map((g) => {
            const c = getJvClassification(g.contestId);
            const why = c?.kind === 'uncounted' ? ` (${UNCOUNTED_REASON_WORDS[c.reason]})` : '';
            return `${shortNameOf(g.away.slug, g.away.name)} at ${shortNameOf(g.home.slug, g.home.name)}, ${monthDay(g.dateKey)}${why}`;
          })
          .join('; ')}.`
      : null,
  };
}

/** The sentence that says who plays a varsity-only school's JV slot, when a division has one. */
function slotNoteOf(t: JvDivisionTable): string | null {
  const notes = teamsInDivision(t.division).flatMap((school) => {
    const slot = jvSlotTeamFor(school.slug);
    return slot
      ? [`${slot.name}, which fields JV only, plays the JV games of ${school.shortName}, which fields varsity only, in its place on ${getLeague(t.league).shortName}’s schedule.`]
      : [];
  });
  return notes.length ? notes.join(' ') : null;
}

/** A league's JV tables, in division order. */
export function buildJvTablesView(league: LeagueId): JvTableView[] {
  return getJvTables(league).map(viewOf);
}

/**
 * A team's JV line for its team page: `2nd in El Camino JV · 3-0-0` when its table is shown and it
 * has a result there; null otherwise. `href` is the table's anchor on /jv.
 */
export function teamJvStanding(slug: TeamSlug): { line: string | null; href: string } | null {
  const team = getTeamBySlug(slug);
  if (!team) return null;
  const table = getJvTable(team.division);
  if (!table) return null;
  const href = `/jv#${isSingleDivision(team.league) ? team.league : team.division}`;
  const row = table.rows.find((r) => r.slug === slug);
  if (table.status !== 'shown' || !row || row.record.gp === 0) return { line: null, href };
  return {
    line: `${row.shared ? 'T-' : ''}${ordinal(row.record.place)} in ${jvTableTitle(team.division)} · ${recordString(row.record)}`,
    href,
  };
}
