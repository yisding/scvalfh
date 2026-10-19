/**
 * Missing league results of the standings engine (lib/engine/standings.ts): the one definition the
 * pipeline's DivisionHealth and the read API share.
 */

import { getDivision } from '@/lib/config/leagues';
import type { OfficialFixture } from '@/lib/model/fixture';
import type { Game } from '@/lib/model/game';
import type { DivisionId, TeamSlug } from '@/lib/model/ids';

export interface MissingOfficialRow {
  kind: 'missing' | 'postponed';
  dateKey: string;
  awayName: string;
  homeName: string;
  awaySlug: TeamSlug | null;
  homeSlug: TeamSlug | null;
  game: Game | null;
}

const NOT_YET_REPORTED: ReadonlySet<Game['status']> = new Set<Game['status']>([
  'scheduled',
  'live',
  'score-pending',
]);

/**
 * THE single definition of 'league result missing', used by the pipeline's DivisionHealth
 * (`official.missingPast`; `missingLeaguePast` for a division with no official schedule) AND by
 * lib/data getMissingOfficialResults/getStandingContext. Pure. Sorted by dateKey, then fixture id
 * (the contest id where there is no fixture).
 *
 * A fixture-backed division: unmatched fixtures of `division` dated before `today` (kind 'missing',
 * game null), plus matched contests (official.division === division, official.scheduledDate < today)
 * with status 'scheduled' | 'live' | 'score-pending' (kind 'missing') or 'postponed' (kind
 * 'postponed', never counted as missing).
 *
 * A division whose league publishes no schedule (`official.mode === 'none'`: the EAL, the Sunset,
 * the San Diego divisions): there are no fixtures, so the rows are its classified games
 * (countsFor === division) dated before `today`, with the same status rule and the contest id in
 * place of a fixture id. What "classified" means is the league's rule (lib/engine/classify.ts): under
 * 'contest-type' (EAL) a game MaxPreps flags as a league game between two members; under
 * 'membership' (Sunset, San Diego, the LA independents) EVERY game between two members on MaxPreps' schedule inside leaguePlay,
 * flagged or not — the double round robin is the schedule, so an unflagged Patrick Henry game
 * dated before today with no score is a missing league result too.
 */
export function missingOfficialResults(
  games: readonly Game[],
  unmatched: readonly OfficialFixture[],
  division: DivisionId,
  today: string,
): MissingOfficialRow[] {
  const rows: Array<MissingOfficialRow & { fixtureId: string }> = [];
  if (getDivision(division).official.mode === 'none') {
    for (const g of games) {
      if (g.countsFor !== division || !(g.dateKey < today)) continue;
      const kind = missingKindOf(g);
      if (kind === null) continue;
      rows.push({
        kind,
        dateKey: g.dateKey,
        awayName: g.away.name,
        homeName: g.home.name,
        awaySlug: g.away.slug,
        homeSlug: g.home.slug,
        game: g,
        fixtureId: g.contestId,
      });
    }
    return sortMissing(rows);
  }
  for (const f of unmatched) {
    if (f.division !== division || !(f.dateKey < today)) continue;
    rows.push({
      kind: 'missing',
      dateKey: f.dateKey,
      awayName: f.awayName,
      homeName: f.homeName,
      awaySlug: f.awaySlug,
      homeSlug: f.homeSlug,
      game: null,
      fixtureId: f.id,
    });
  }
  for (const g of games) {
    const o = g.official;
    if (!o || o.division !== division || !(o.scheduledDate < today)) continue;
    const kind = missingKindOf(g);
    if (kind === null) continue;
    rows.push({
      kind,
      dateKey: o.scheduledDate,
      awayName: g.away.name,
      homeName: g.home.name,
      awaySlug: g.away.slug,
      homeSlug: g.home.slug,
      game: g,
      fixtureId: o.fixtureId,
    });
  }
  return sortMissing(rows);
}

/** 'postponed' for a postponed game, 'missing' for one not yet reported, null once it has a result. */
function missingKindOf(g: Game): MissingOfficialRow['kind'] | null {
  if (g.status === 'postponed') return 'postponed';
  if (NOT_YET_REPORTED.has(g.status)) return 'missing';
  return null;
}

function sortMissing(rows: Array<MissingOfficialRow & { fixtureId: string }>): MissingOfficialRow[] {
  rows.sort((a, b) =>
    a.dateKey === b.dateKey ? a.fixtureId.localeCompare(b.fixtureId) : a.dateKey.localeCompare(b.dateKey),
  );
  return rows.map((row) => ({
    kind: row.kind,
    dateKey: row.dateKey,
    awayName: row.awayName,
    homeName: row.homeName,
    awaySlug: row.awaySlug,
    homeSlug: row.homeSlug,
    game: row.game,
  }));
}
