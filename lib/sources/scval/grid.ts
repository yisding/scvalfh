/**
 * OFFICIAL source: the two scval.com schedule-grid PDFs (SPEC §1.3).
 *
 * These are the authority for DIVISION ALIGNMENT and for the official league fixture list. They
 * carry no scores and no times beyond the footer's "Varsity 4:00".
 *
 * The De Anza grid still lists Wilcox, which is not fielding a team this season: its fixtures are
 * dropped here and its roster-line entry is not a membership warning (`isWithdrawnSchool(name,
 * league)`, config `withdrawnNames`). Grid spellings resolve through the league scope only
 * (`resolveOfficialName`). The URLs come from config (`getDivision(d).official.scheduleUrl`), and
 * only the live-PDF divisions are parsed: lib/pipeline/steps/official.ts reads a grid only for a
 * division whose `official.mode` is 'live-pdf' (source 'scval-pdf'), so a bundled BVAL/PCAL/MCAL
 * division can never be counted as a missing grid. The fixture matcher (formerly
 * `applyOfficialFixtures`) lives in lib/official/match.ts as
 * `matchOfficialFixtures(games, fixtures, { matcher: 'legacy', … })` (SPEC §7.8); the membership
 * diff and the per-division carry-forward are lib/official/membership.ts and lib/official/carry.ts.
 *
 * The rest of lib/sources/scval/: pdftotext.ts (the poppler binary), standings-index.ts (the
 * 2026-27 standings-PDF poll) and history.ts (the 2025-26 end-of-season PDFs).
 *
 * Extraction facts, all verified against the live files:
 *   - `http://` 302s to `https://`; redirects must be followed.
 *   - `pdftotext -layout` (poppler-utils). No binary ⇒ the step reports `skipped`, never fails.
 *   - the grid is COLUMN-MAJOR with three date columns per band, so naive line reading interleaves
 *     three different dates. Each matchup is assigned to a column by its character offset.
 *   - the naive "split on 2+ spaces, re-pair on @" approach is broken: `ST. FRANCIS        @   FREMONT`
 *     shatters into `"@"` and `"FREMONT"`. The verified matchup regex below scores 56/56 on both
 *     PDFs with zero bad rows.
 *   - group 1 is AWAY, group 2 is HOME (`ST. FRANCIS @ FREMONT` = St. Francis away at Fremont).
 *   - the Friday Oct 30 column is the crossover block (`DE ANZA #4 VS EL CAMINO #4`, `#1 v. #1`)
 *     and carries no `@`, so it falls out of the matchup regex on its own.
 */

import { getDivision, leagueOfDivision } from '@/lib/config/leagues';
import { officialDocumentOf } from '@/lib/config/leagues/official';
import type { OfficialFixture } from '@/lib/model/fixture';
import type { DivisionId, TeamSlug } from '@/lib/model/ids';
import { isWithdrawnSchool, resolveOfficialName } from '@/lib/registry/resolve';
import { officialFixtureId } from '@/lib/shared/official-id';

/** The grid PDF of a division, from config (`getDivision(d).official.scheduleUrl`; throws for a division with no schedule document). */
export function scvalScheduleUrl(division: DivisionId): string {
  return officialDocumentOf(division).scheduleUrl;
}

/** The season the grids belong to. Sep–Oct dates are 2026 (SPEC §1.3). */
export const SCVAL_GRID_YEAR = 2026;

const MONTHS: Record<string, number> = {
  JANUARY: 1, FEBRUARY: 2, MARCH: 3, APRIL: 4, MAY: 5, JUNE: 6,
  JULY: 7, AUGUST: 8, SEPTEMBER: 9, OCTOBER: 10, NOVEMBER: 11, DECEMBER: 12,
};

/** Matched GLOBALLY on a line — up to three hits, one per date column. */
const DAY_HEADER_RE =
  /(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)[, ]+([A-Z]+)\s+(\d{1,2})\b/g;

/** Group 1 = AWAY, group 2 = HOME. Verified 56/56 rows, 0 bad rows, on both PDFs. */
const MATCHUP_RE = /([A-Z][A-Z. ]*?[A-Z.])\s{1,}@\s{1,}([A-Z][A-Z. ]*?[A-Z.])(?=\s{2,}|\s*$)/g;

/** `Teams: Cupertino, Fremont, …` — the official roster line. */
const TEAMS_LINE_RE = /^\s*Teams:\s*(.+)$/;

/** `DE ANZA DIVISION`, `EL CAMINO DIVISION` — built from the division's config label. */
function divisionHeaderRe(division: DivisionId): RegExp {
  const words = getDivision(division).label.split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`${words.join('\\s+')}\\s+DIVISION`, 'i');
}

export interface OfficialSchedule {
  division: DivisionId;
  /** "2026 - 2027" from the page header, when present. */
  yearLabel: string | null;
  /** The `Teams:` line, verbatim entries, less any school not fielding a team. */
  officialTeamNames: string[];
  /** Those names resolved through the alias table; null = unknown to the registry. */
  officialTeamSlugs: Array<TeamSlug | null>;
  fixtures: OfficialFixture[];
  /** The Friday crossover / play-in column, when the grid has one. */
  crossoverDate: string | null;
  warnings: string[];
}

function toDateKey(monthWord: string, day: string, warnings: string[]): string | null {
  const month = MONTHS[monthWord.toUpperCase()];
  if (!month) {
    warnings.push(`unknown month "${monthWord}" in a day header`);
    return null;
  }
  return `${SCVAL_GRID_YEAR}-${String(month).padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/** Assign a character offset to one of the (up to three) date columns. */
function columnFor(offset: number, headerOffsets: readonly number[]): number {
  for (let i = 1; i < headerOffsets.length; i += 1) {
    const boundary = (headerOffsets[i - 1] + headerOffsets[i]) / 2;
    if (offset < boundary) return i - 1;
  }
  return headerOffsets.length - 1;
}

export function parseSchedulePdfText(text: string, division: DivisionId): OfficialSchedule {
  const warnings: string[] = [];
  const leagueId = leagueOfDivision(division).id;
  const lines = text.replace(/\r\n?/g, '\n').split('\n');

  if (!lines.some((l) => divisionHeaderRe(division).test(l))) {
    warnings.push(`the PDF text has no "${division}" division header — is this the right file?`);
  }

  const yearLine = lines.find((l) => /\d{4}\s*-\s*\d{4}\s*-\s*FIELD HOCKEY/i.test(l)) ?? null;
  const yearLabel = yearLine
    ? (/(\d{4}\s*-\s*\d{4})/.exec(yearLine)?.[1].replace(/\s+/g, ' ') ?? null)
    : null;

  const teamsLine = lines.find((l) => TEAMS_LINE_RE.test(l));
  const officialTeamNames = teamsLine
    ? (TEAMS_LINE_RE.exec(teamsLine)?.[1] ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s && !isWithdrawnSchool(s, leagueId))
    : [];
  if (officialTeamNames.length === 0) warnings.push('no "Teams:" roster line found');

  const fixtures: OfficialFixture[] = [];
  let headerDates: Array<{ dateKey: string | null; offset: number; weekday: string }> = [];
  let crossoverDate: string | null = null;

  for (const line of lines) {
    DAY_HEADER_RE.lastIndex = 0;
    const headers: Array<{ dateKey: string | null; offset: number; weekday: string }> = [];
    let hm: RegExpExecArray | null;
    while ((hm = DAY_HEADER_RE.exec(line)) !== null) {
      headers.push({ dateKey: toDateKey(hm[2], hm[3], warnings), offset: hm.index, weekday: hm[1] });
    }
    if (headers.length > 0) {
      headerDates = headers;
      for (const h of headers) {
        // The crossover / play-in block is the one Friday column (ADDENDUM, Article VII §2).
        if (h.weekday === 'FRIDAY' && h.dateKey) crossoverDate = h.dateKey;
      }
      continue;
    }

    MATCHUP_RE.lastIndex = 0;
    const offsets = headerDates.map((h) => h.offset);
    let mm: RegExpExecArray | null;
    while ((mm = MATCHUP_RE.exec(line)) !== null) {
      if (headerDates.length === 0) {
        warnings.push(`matchup "${mm[1].trim()} @ ${mm[2].trim()}" appeared before any day header`);
        continue;
      }
      const col = headerDates[columnFor(mm.index, offsets)];
      if (!col.dateKey) continue;
      const awayName = mm[1].trim();
      const homeName = mm[2].trim();
      // A school that is not fielding a team plays none of its grid fixtures.
      if (isWithdrawnSchool(awayName, leagueId) || isWithdrawnSchool(homeName, leagueId)) continue;
      const away = resolveOfficialName(leagueId, awayName);
      const home = resolveOfficialName(leagueId, homeName);
      if (!away) warnings.push(`official grid name "${awayName}" resolves to no registry team`);
      if (!home) warnings.push(`official grid name "${homeName}" resolves to no registry team`);
      const awaySlug = away?.slug ?? null;
      const homeSlug = home?.slug ?? null;
      fixtures.push({
        id: officialFixtureId(division, col.dateKey, { slug: awaySlug, name: awayName }, { slug: homeSlug, name: homeName }),
        league: leagueId,
        division,
        dateKey: col.dateKey,
        // The grid prints only a footer "Varsity 4:00", never a per-game time.
        time: null,
        awayName,
        homeName,
        awaySlug,
        homeSlug,
        source: 'scval-pdf',
      });
    }
  }

  fixtures.sort((a, b) =>
    a.dateKey === b.dateKey
      ? `${a.awayName}@${a.homeName}`.localeCompare(`${b.awayName}@${b.homeName}`)
      : a.dateKey.localeCompare(b.dateKey),
  );

  return {
    division,
    yearLabel,
    officialTeamNames,
    officialTeamSlugs: officialTeamNames.map((n) => resolveOfficialName(leagueId, n)?.slug ?? null),
    fixtures,
    crossoverDate,
    warnings,
  };
}
