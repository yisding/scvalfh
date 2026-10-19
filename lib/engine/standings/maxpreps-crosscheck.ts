/**
 * The published MaxPreps cross-check of the standings engine (lib/engine/standings.ts; DESIGN §9,
 * SPEC §5.8): each computed row against MaxPreps' own row, and the field-by-field rows /about prints.
 */

import { getDivision, getLeague, leagueStandingsUrl } from '@/lib/config/leagues';
import { recordString } from '@/lib/format/numbers';
import type { CrossCheckRow } from '@/lib/model/crosscheck';
import type { DivisionId } from '@/lib/model/ids';
import type { ComputedRecord, ReportedRecord, Standing } from '@/lib/model/standings';

export function compareToReported(
  computed: ComputedRecord,
  overall: ComputedRecord,
  reported: ReportedRecord | null,
): { mismatch: boolean; detail?: string } {
  if (!reported) return { mismatch: false };
  const diffs: string[] = [];
  const ours = recordString(computed);
  const theirs = recordString({
    w: reported.conferenceWins,
    l: reported.conferenceLosses,
    t: reported.conferenceTies,
  });
  if (ours !== theirs) diffs.push(`league record ${ours} vs MaxPreps ${theirs}`);

  const oursOverall = recordString(overall);
  const theirsOverall = recordString({
    w: reported.overallWins,
    l: reported.overallLosses,
    t: reported.overallTies,
  });
  if (oursOverall !== theirsOverall) {
    diffs.push(`overall record ${oursOverall} vs MaxPreps ${theirsOverall}`);
  }
  if (computed.gf !== reported.conferencePoints || computed.ga !== reported.conferencePointsAgainst) {
    diffs.push(
      `league goals ${computed.gf}-${computed.ga} vs MaxPreps ` +
        `${reported.conferencePoints}-${reported.conferencePointsAgainst}`,
    );
  }
  // Place is deliberately NOT a mismatch: MaxPreps orders on win percentage while the by-laws
  // order on points (Article VI §2), so a place difference is a rules difference, not an
  // arithmetic error. It is still published as a cross-check row.
  return diffs.length ? { mismatch: true, detail: diffs.join('; ') } : { mismatch: false };
}

/**
 * Why a division has no MaxPreps comparison at all: MaxPreps publishes no table for it (the San Diego
 * Section's Valley, whose six teams all carry MaxPreps' zero-GUID "no league"; DivisionConfig.maxprepsLeagueId
 * null). The same words as the pipeline's DivisionHealth reason (lib/pipeline/steps/league-meta.ts
 * NO_MAXPREPS_TABLE_REASON), so /about and the health card say one thing. null for every other division.
 */
export function crossCheckSkipReason(division: DivisionId): string | null {
  return leagueStandingsUrl(division) === null ? 'MaxPreps publishes no table for this division' : null;
}

/**
 * Field-by-field cross-check rows for /about#cross-check (DESIGN §9), by the division's
 * `reportedTrust` (SPEC §5.8): 'full' = all six fields; 'records-only' = records and league
 * goals; 'informational' = league record only. Rows of a division with a known cause carry it.
 * A division with no MaxPreps table (`crossCheckSkipReason`) is skipped: it has no reported rows
 * and no page to link, so no row is ever built for it.
 */
export function buildCrossCheck(standings: readonly Standing[]): CrossCheckRow[] {
  const rows: CrossCheckRow[] = [];
  for (const s of standings) {
    const r = s.reported;
    if (!r) continue;
    const div = getDivision(s.division);
    const trust = div.reportedTrust;
    const url = leagueStandingsUrl(s.division);
    if (url === null) continue;
    const push = (field: string, ours: string, theirs: string) => {
      if (ours === theirs) return;
      rows.push({
        slug: s.slug,
        field,
        ours,
        theirs,
        url,
        ...(div.knownCause ? { knownCause: div.knownCause } : {}),
      });
    };
    push(
      'league record',
      recordString(s.computed),
      recordString({ w: r.conferenceWins, l: r.conferenceLosses, t: r.conferenceTies }),
    );
    if (trust === 'informational') continue;
    push(
      'overall record',
      recordString(s.overall),
      recordString({ w: r.overallWins, l: r.overallLosses, t: r.overallTies }),
    );
    push('league goals for', String(s.computed.gf), String(r.conferencePoints));
    push('league goals against', String(s.computed.ga), String(r.conferencePointsAgainst));
    if (trust === 'records-only') continue;
    push(
      `place (we order on points, ${getLeague(div.leagueId).rules.citations.pointsShort}; MaxPreps orders on win pct)`,
      String(s.computed.place),
      r.conferenceStandingPlacement === null ? '—' : String(r.conferenceStandingPlacement),
    );
    push(
      'win pct',
      s.computed.winPct.toFixed(3),
      r.conferenceWinningPercentage.toFixed(3),
    );
  }
  return rows;
}
