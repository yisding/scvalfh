/**
 * The BVAL entry of data/<sport>/history-2025-26.json for the soccer, basketball and volleyball builds, from the
 * league's own 2025-26 standings sheet for the sport (lib/sources/bval-sheet.ts BVAL_SEASON_SHEETS, linked from
 * bval.org/standings; the owner gave the three sheets on 2026-11-16). scripts/build-history.ts calls it; the
 * sheet's CSV is downloaded, or read offline from `<bvalFrom>/standings-2025-26.csv`
 * (tests/fixtures/<sport>/bval-history/).
 *
 * Records only, as field hockey's BVAL entry: Place, School, Overall and League Record per school, no points or
 * goals. Two things differ from field hockey's sheet:
 *  - the season's divisions are not 2026-27's (`seasonAlignment`), so each block is filed under the division the
 *    sheet names, and a division BVAL no longer has (boys basketball's Santa Teresa North and South) is a past
 *    division of the entry;
 *  - JV: where the sheet gives every JV record a JV place (boys basketball, girls volleyball) the JV table is
 *    stored, in JV-place order; where it ranks only some (girls soccer: three schools) it is not, as field hockey's.
 * The sheets print tied places ("2, 2, 4"), and they are stored as printed.
 *
 * It returns the entry and the problems found; build-history validates the whole file and writes nothing on any
 * problem. No all-league documents are read for these sports, so every division's awards are null.
 */

import { getLeague } from '../../lib/leagues';
import {
  BVAL_HISTORY_SOURCES,
  BVAL_SEASON_SHEETS,
  bvalRegistrySlugs,
  bvalSheetUrls,
  parseStandingsCsv,
  type BvalStandingRow,
} from '../../lib/sources/bval-sheet';
import { listWords } from '../../lib/format';
import { SPORT } from '../../lib/sports/current';
import { getTeamBySlug } from '../../lib/teams';

export type BvalSheetSport = keyof typeof BVAL_SEASON_SHEETS;

const COUNT_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const countWord = (n: number) => COUNT_WORDS[n] ?? String(n);

/**
 * The page's JV sentence for a BVAL sheet (provenance `jvNote`): whether JV is shown, and why. `withoutJv` names the
 * schools a stored JV table leaves out (no JV record in the sheet); `placed` counts the JV places a sheet prints
 * when it ranks too few to publish a table.
 */
export function bvalJvNote(jv: { stored: true; withoutJv: string[] } | { stored: false; placed: number }): string {
  if (!jv.stored) {
    return `JV is not shown: the sheet lists JV records but gives a JV place for ${countWord(jv.placed)} school${jv.placed === 1 ? '' : 's'} only.`;
  }
  const tail = jv.withoutJv.length
    ? ` ${listWords(jv.withoutJv)} ${jv.withoutJv.length === 1 ? 'has' : 'have'} no JV row: the sheet prints no JV record for ${jv.withoutJv.length === 1 ? 'it' : 'them'}.`
    : '';
  return `The JV tables are the sheet’s JV Place and JV Record columns, in its JV order.${tail}`;
}

/** Places as printed, with ties ("2, 2, 4"): the rows that share one. */
function tiedPlaces(rows: readonly BvalStandingRow[]): string[] {
  const out: string[] = [];
  for (const place of new Set(rows.map((r) => r.place))) {
    const tied = rows.filter((r) => r.place === place);
    if (tied.length > 1) out.push(`${listWords(tied.map((r) => r.name))} (${place})`);
  }
  return out;
}

export function buildBvalSheetHistory({
  sport,
  csv,
  retrievedOn,
}: {
  sport: BvalSheetSport;
  csv: string;
  retrievedOn: string;
}): { entry: Record<string, unknown>; problems: string[] } {
  const sheet = BVAL_SEASON_SHEETS[sport];
  const urls = bvalSheetUrls(sheet);
  const problems: string[] = [];
  // In a sport with no ties (basketball, volleyball) the sheet's W-L record has zero ties: t is 0, not null (null
  // is field hockey's Sobrato, a record printed without the ties field a tie-allowing sport has).
  const zeroTies = (r: BvalStandingRow): BvalStandingRow => (!SPORT.scoring.allowsTies && r.t === null ? { ...r, t: 0 } : r);
  const blocks = parseStandingsCsv(csv, sheet.divisions).map((b) => ({ ...b, rows: b.rows.map(zeroTies), jv: b.jv.map(zeroTies) }));

  for (const d of sheet.divisions) {
    const n = blocks.filter((b) => b.division === d.id).length;
    if (n !== 1) problems.push(`BVAL ${sport} sheet has ${n} "${d.sheetLabel}" blocks, expected 1`);
  }
  // JV is stored only when every JV record in the sheet has a place: a ranked table, not records alone.
  const jvPlaced = blocks.reduce((n, b) => n + b.jv.length, 0);
  const storeJv = blocks.every((b) => b.jvUnplaced.length === 0 && b.jv.length > 0);

  const divisions = sheet.divisions.map((d) => {
    const block = blocks.find((b) => b.division === d.id);
    if (!block || block.rows.length === 0) problems.push(`BVAL ${sport} sheet has no ${d.id} block`);
    for (const row of [...(block?.rows ?? []), ...(storeJv ? (block?.jv ?? []) : [])]) {
      if (!row.slug) problems.push(`BVAL standings name "${row.name}" resolves to no registry team`);
    }
    return {
      division: d.id,
      label: d.label,
      standings: { varsity: block?.rows ?? [], jv: storeJv ? (block?.jv ?? []) : [] },
      awards: { varsity: null, jv: null },
    };
  });

  const placed = divisions.flatMap((d) => d.standings.varsity.map((r) => r.slug));
  for (const slug of bvalRegistrySlugs()) {
    const n = placed.filter((s) => s === slug).length;
    if (n !== 1) problems.push(`BVAL registry team ${slug} is in ${n} 2025-26 standings blocks, expected 1`);
  }

  const rows = divisions.flatMap((d) => d.standings.varsity);
  const withoutJv = storeJv
    ? divisions.flatMap((d) => d.standings.varsity.filter((r) => !d.standings.jv.some((j) => j.slug === r.slug)).map((r) => r.name))
    : [];
  const ties = divisions.flatMap((d) => tiedPlaces(d.standings.varsity));
  const jvTies = divisions.flatMap((d) => tiedPlaces(d.standings.jv));
  const noOverall = rows.filter((r) => r.overallRecord === null).map((r) => r.name);
  const twoPart = rows.some((r) => r.t === null);
  const past = sheet.divisions.filter((d) => d.past);
  const absent = getLeague('bval').divisions.filter((c) => !sheet.divisions.some((d) => d.id === c.id));
  // A school whose 2025-26 division (as the sheet files it) is not its division on this site now.
  const moved = divisions.flatMap((d) =>
    d.standings.varsity.flatMap((r) => {
      const team = r.slug ? getTeamBySlug(r.slug) : undefined;
      return team && team.division !== d.division ? [`${r.name} (${d.label})`] : [];
    }),
  );

  const notes = [
    `Official BVAL sheet titled "${sheet.title}", linked from bval.org/standings. Varsity order is the sheet's own "Place".`,
    'Records only: the sheet has Overall and League Record per school and no points, goals or tiebreak data, so none are stored or computed.',
    SPORT.scoring.allowsTies
      ? `Records are written as the sheet prints them (W-L-T), without the spaces around each hyphen${twoPart ? '; a record printed without a ties field keeps t null (unpublished, not 0)' : ''}.`
      : 'Records are written as the sheet prints them (W-L), without the spaces around each hyphen; the sport has no ties, so t is 0.',
    ties.length
      ? `Places are the sheet's, ties included: ${ties.join('; ')}. A tied place is stored as printed, and the next place skips.`
      : 'The sheet prints no tied place.',
    `The 2025-26 divisions are the sheet's (${sheet.divisions.map((d) => (d.sheetLabel === d.label ? d.label : `${d.label}, "${d.sheetLabel}" in the sheet`)).join('; ')}), not 2026-27's in lib/registry/${sport}/bval.ts.` +
      (past.length ? ` ${listWords(past.map((d) => d.label))} ${past.length === 1 ? 'is a division' : 'are divisions'} BVAL no longer has (seasonAlignment.pastDivisions).` : '') +
      (absent.length ? ` ${listWords(absent.map((d) => d.label))} did not exist in 2025-26.` : '') +
      (moved.length ? ` Filed elsewhere in 2026-27: ${moved.join(', ')}. The registry is not changed; the page says these teams moved.` : ''),
    storeJv
      ? `JV is stored from the JV Place and JV Record columns, ordered on the JV place (the sheet's row order among equal places)${jvTies.length ? `; tied JV places: ${jvTies.join('; ')}` : ''}.` +
        (withoutJv.length ? ` No JV row for ${listWords(withoutJv)}: its JV record is not a record ("n/a" or empty).` : '')
      : `JV is not stored: the sheet has a JV Record column, but a JV place for ${countWord(jvPlaced)} school${jvPlaced === 1 ? '' : 's'} only, so there is no JV standings order to publish.`,
    ...(noOverall.length ? [`The sheet leaves the Overall cell empty for ${listWords(noOverall)}: overallRecord is null.`] : []),
    'No all-league awards: this sport\'s BVAL all-league documents are not transcribed, so every division\'s awards are null.',
  ];

  const entry = {
    status: 'available',
    league: getLeague('bval').name,
    provenance: {
      source: 'bval-sheet',
      builtBy: 'scripts/build-history.ts',
      standingsSheet: urls.csv,
      standingsSheetView: urls.view,
      standingsIndex: BVAL_HISTORY_SOURCES.standingsIndex,
      allLeagueDocs: {},
      retrievedOn,
      extraction: 'Google Sheets CSV export of the standings sheet.',
      jvNote: storeJv ? bvalJvNote({ stored: true, withoutJv }) : bvalJvNote({ stored: false, placed: jvPlaced }),
      notes,
    },
    seasonAlignment: { pastDivisions: past.map((d) => d.id) },
    divisions,
  };
  return { entry, problems };
}
