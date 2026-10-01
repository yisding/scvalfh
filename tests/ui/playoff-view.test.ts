/**
 * `components/playoffs/playoff-view.ts` — the per-division CCS projection (BYLAWS-ADDENDUM
 * Article VII §2), and every consequence of Article VI §7's coin flip that the page derives
 * rather than assumes.
 *
 * The /playoffs stage verified these by pointing `SCVAL_SNAPSHOT` at synthetic snapshots and
 * reading the rendered HTML, and asked for them to be asserted in CI (scratchpad/notes/
 * page-playoffs.md, request 2). The module is pure, so the cases are built here directly from
 * the live rows with the one field each case is about changed.
 */

import { describe, expect, it } from 'vitest';

import {
  buildDivisionProjection,
  joinNames,
  recordLine,
  type ProjectionRow,
} from '../../components/playoffs/playoff-view';
import { getPlayoffProjection, getStandingFor, getTeamById } from '../../lib/data';
import { DIVISION_LABELS } from '../../lib/season';
import type { Division, PlayoffStatus } from '../../lib/types';

function liveRows(division: Division): ProjectionRow[] {
  return getPlayoffProjection().byDivision[division].flatMap((row) => {
    const team = getTeamById(row.teamId);
    const standing = getStandingFor(row.teamId);
    if (!team || !standing) return [];
    return [
      {
        team,
        standing,
        status: row.status,
        statuses: row.statuses,
        label: row.label,
        shared: row.shared,
      },
    ];
  });
}

/** The same rows with the statuses forced, which is what each by-law case turns on. */
function withStatuses(division: Division, statuses: PlayoffStatus[]): ProjectionRow[] {
  return liveRows(division).map((row, i) => ({
    ...row,
    status: statuses[i] ?? 'out',
    statuses: [statuses[i] ?? 'out'],
    shared:
      statuses[i] !== undefined &&
      (statuses[i] === statuses[i - 1] || statuses[i] === statuses[i + 1]),
  }));
}

/** A row that straddles a by-law boundary carries BOTH statuses (Article VI §7 + VII §2). */
function withOutcomes(division: Division, outcomes: PlayoffStatus[][]): ProjectionRow[] {
  return liveRows(division).map((row, i) => {
    const statuses = outcomes[i] ?? ['out'];
    return { ...row, status: statuses[0], statuses, shared: statuses.length > 1 };
  });
}

function build(division: Division, rows: ProjectionRow[]) {
  return buildDivisionProjection(division, DIVISION_LABELS[division], rows);
}

describe('buildDivisionProjection', () => {
  it('draws the berth rule after the LAST automatic qualifier, not after a hardcoded 3', () => {
    const clean = build('de-anza', withStatuses('de-anza', ['aq', 'aq', 'aq', 'play-in', 'at-large']));
    expect(clean.berthRuleAfter).toBe(3);

    // A shared 3rd place: four teams hold three berths, so the rule lands after row 4.
    const sharedThird = build(
      'de-anza',
      withStatuses('de-anza', ['aq', 'aq', 'aq', 'aq', 'play-in', 'at-large']),
    );
    expect(sharedThird.berthRuleAfter).toBe(4);
    expect(sharedThird.autoRows).toHaveLength(4);
    expect(sharedThird.notes.join(' ')).toContain('only three automatic berths');
  });

  it('says in words that a shared 4th leaves the Oct 30 play-in unsettled', () => {
    const p = build(
      'de-anza',
      withStatuses('de-anza', ['aq', 'aq', 'aq', 'play-in', 'play-in', 'at-large']),
    );
    expect(p.playInRows).toHaveLength(2);
    expect(p.notes.join(' ')).toContain('are level at fourth');
    expect(p.notes.join(' ')).toContain('not settled');
  });

  it('says a shared 5th means two at-large candidates and no sixth place', () => {
    const p = build(
      'el-camino',
      withStatuses('el-camino', ['aq', 'aq', 'aq', 'play-in', 'at-large', 'at-large']),
    );
    expect(p.atLargeRows).toHaveLength(2);
    expect(p.notes.join(' ')).toContain('no sixth place');
  });

  it('flags a division with nobody alone in fourth', () => {
    const p = build('de-anza', withStatuses('de-anza', ['aq', 'aq', 'aq', 'at-large']));
    expect(p.playInRows).toHaveLength(0);
    expect(p.notes.join(' ')).toContain('play-in pairing is not settled');
  });

  it('counts a tie that straddles 3rd/4th in BOTH the berth and play-in groups', () => {
    const p = build(
      'de-anza',
      withOutcomes('de-anza', [['aq'], ['aq'], ['aq', 'play-in'], ['aq', 'play-in'], ['at-large']]),
    );
    expect(p.autoRows).toHaveLength(4);
    expect(p.playInRows).toHaveLength(2);
    expect(p.atLargeRows).toHaveLength(1);
    expect(p.notes.join(' ')).toContain('only three automatic berths');
    expect(p.notes.join(' ')).toContain('are level across fourth');
  });

  it('projects nothing at all when no result has been reported', () => {
    const rows = liveRows('de-anza').map((row) => ({
      ...row,
      status: 'out' as PlayoffStatus,
      statuses: ['out'] as PlayoffStatus[],
      shared: false,
      standing: {
        ...row.standing,
        hasReportedResults: false,
      },
    }));
    const p = build('de-anza', rows);
    expect(p.berthRuleAfter).toBe(0);
    expect(p.autoRows).toHaveLength(0);
    expect(p.notes).toHaveLength(1);
    expect(p.notes[0]).toContain('nothing to project');
    expect(p.notes[0]).toContain('official alignment');
  });

  it('reproduces the live snapshot: three automatic rows per division', () => {
    for (const division of ['de-anza', 'el-camino'] as const) {
      const p = build(division, liveRows(division));
      expect(p.autoRows).toHaveLength(3);
      expect(p.berthRuleAfter).toBe(3);
    }
  });
});

describe('row copy', () => {
  it('never invents a record for a team with nothing reported', () => {
    const wilcox = getStandingFor('wilcox');
    expect(wilcox).toBeTruthy();
    expect(wilcox!.hasReportedResults).toBe(false);
    expect(recordLine(wilcox!)).toBe('—');
    expect(recordLine(wilcox!)).not.toContain('0-0-0');
  });

  it('joins names the way a sentence does', () => {
    expect(joinNames([])).toBe('');
    expect(joinNames(['Cupertino'])).toBe('Cupertino');
    expect(joinNames(['Cupertino', 'Homestead'])).toBe('Cupertino and Homestead');
    expect(joinNames(['A', 'B', 'C'])).toBe('A, B and C');
  });
});
