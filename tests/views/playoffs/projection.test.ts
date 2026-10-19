/**
 * views/playoffs/projection.ts (SPEC §6.1, §10.7): the per-division CCS ladder projection for every CCS league, its
 * ladder facts, status labels and row copy.  League-specific values are asserted on the all-2026-10-02 CORPUS
 * snapshot (SPEC §13.6), loaded through useCorpusModules (tests/support/playoffs-view.ts), so live fetch #2 cannot
 * break them. On that snapshot De Anza's 3rd place is shared (Los Altos, Valley Christian), El Camino's 4th
 * straddles the play-in and at-large places, Santa Teresa's champions are level (Prospect, Westmont) and Mt.
 * Hamilton's 4th is shared: every by-law consequence of an uncomputable tiebreak shows up at once. Every assertion
 * message names the module that produced the value.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { listWords } from '@/lib/format/words';
import type { PlayoffStatus } from '@/lib/model/standings';
import { getTeamById } from '@/lib/registry/teams';
import { textOf } from '@/tests/support/html-text';
import type { ProjectionRow } from '@/views/playoffs/projection';
import { VIEW, m, liveRows, withStatuses, withOutcomes, build } from '@/tests/support/playoffs-view';

describe('ladderFactsFor (config → the ladder facts the notes use)', () => {
  it('reads each division’s ladder from config', () => {
    expect(m.projection.ladderFactsFor('de-anza'), VIEW).toEqual({
      aqPlaces: 3,
      playInPlace: 4,
      playInDate: 'Oct 30',
      atLargePlace: 5,
      line: { status: 'aq', label: 'AQ line' },
      unresolved: 'Article VI §7 decides it with a coin flip',
    });
    expect(m.projection.ladderFactsFor('santa-teresa'), VIEW).toMatchObject({
      aqPlaces: 0,
      playInPlace: 1,
      playInDate: 'Oct 31',
      atLargePlace: null,
      line: { status: 'play-in', label: 'Play-in host' },
    });
    expect(m.projection.ladderFactsFor('pcal'), VIEW).toMatchObject({
      aqPlaces: 2,
      playInPlace: null,
      playInDate: null,
      atLargePlace: null,
      line: { status: 'aq', label: 'AQ line' },
    });
  });
});

describe('buildDivisionProjection — SCVAL', () => {
  it('draws the ladder line after the LAST automatic qualifier, not after a hardcoded 3', () => {
    const clean = build('de-anza', withStatuses('de-anza', ['aq', 'aq', 'aq', 'play-in', 'at-large']));
    expect(clean.lineAfter, VIEW).toBe(3);
    expect(clean.lineLabel, VIEW).toBe('AQ line');

    // A shared 3rd place: four teams hold three berths, so the line lands after row 4.
    const sharedThird = build('de-anza', withStatuses('de-anza', ['aq', 'aq', 'aq', 'aq', 'play-in', 'at-large']));
    expect(sharedThird.lineAfter, VIEW).toBe(4);
    expect(sharedThird.autoRows, VIEW).toHaveLength(4);
    expect(sharedThird.notes.join(' '), VIEW).toContain('only three automatic berths');
  });

  it('says in words that a shared 4th leaves the Oct 30 play-in unsettled', () => {
    const p = build('de-anza', withStatuses('de-anza', ['aq', 'aq', 'aq', 'play-in', 'play-in', 'at-large']));
    expect(p.playInRows, VIEW).toHaveLength(2);
    expect(p.notes.join(' '), VIEW).toContain('are level at fourth');
    expect(p.notes.join(' '), VIEW).toContain('on Oct 30 is not settled');
  });

  it('says a shared 5th means two at-large candidates and no sixth place', () => {
    const p = build('el-camino', withStatuses('el-camino', ['aq', 'aq', 'aq', 'play-in', 'at-large', 'at-large']));
    expect(p.atLargeRows, VIEW).toHaveLength(2);
    expect(p.notes.join(' '), VIEW).toContain('no sixth place');
  });

  it('flags a division with nobody alone in fourth', () => {
    const p = build('de-anza', withStatuses('de-anza', ['aq', 'aq', 'aq', 'at-large']));
    expect(p.playInRows, VIEW).toHaveLength(0);
    expect(p.notes.join(' '), VIEW).toContain('play-in pairing is not settled');
  });

  it('counts a tie that straddles 3rd/4th in BOTH the berth and play-in groups', () => {
    const p = build('de-anza', withOutcomes('de-anza', [['aq'], ['aq'], ['aq', 'play-in'], ['aq', 'play-in'], ['at-large']]));
    expect(p.autoRows, VIEW).toHaveLength(4);
    expect(p.playInRows, VIEW).toHaveLength(2);
    expect(p.atLargeRows, VIEW).toHaveLength(1);
    expect(p.notes.join(' '), VIEW).toContain('only three automatic berths');
    expect(p.notes.join(' '), VIEW).toContain('are level across fourth');
  });

  it('projects nothing at all when no result has been reported', () => {
    const rows = liveRows('de-anza').map((row) => ({
      ...row,
      status: 'out' as PlayoffStatus,
      statuses: ['out'] as PlayoffStatus[],
      shared: false,
      standing: { ...row.standing, hasReportedResults: false },
    }));
    const p = build('de-anza', rows);
    expect(p.lineAfter, VIEW).toBe(0);
    expect(p.lineLabel, VIEW).toBeNull();
    expect(p.autoRows, VIEW).toHaveLength(0);
    expect(p.notes, VIEW).toHaveLength(1);
    expect(p.notes[0], VIEW).toContain('nothing to project');
    expect(p.notes[0], VIEW).toContain('official alignment');
  });

  it('never calls the teams of a league with no documents an "official alignment" (EAL, D23)', async () => {
    // The all-2026-10-02 corpus does not fetch the EAL, so its rows have no results.
    const rows: ProjectionRow[] = m.data.getTeams('eal').map((team) => ({
      team,
      standing: m.data.getStandingFor(team.id)!,
      status: 'out' as PlayoffStatus,
      statuses: ['out'] as PlayoffStatus[],
      label: 'Outside the top six',
      shared: false,
    }));
    expect(rows.every((r) => !r.standing.hasReportedResults), 'the EAL has no data in this corpus').toBe(true);
    const facts = { aqPlaces: 0, playInPlace: null, playInDate: null, atLargePlace: null, line: null, unresolved: '' };
    const none = m.projection.buildDivisionProjection('eal', 'EAL', rows, facts);
    expect(none.notes, VIEW).toEqual([
      'No EAL league results have been reported yet, so there is nothing to project here. The rows below are the EAL table as MaxPreps lists it.',
    ]);

    // One team with results: the per-set footnote of the rendered table.
    const partial = rows.map((r, i) => (i === 0 ? { ...r, standing: { ...r.standing, hasReportedResults: true } } : r));
    const { PlayoffProjection } = await import('@/components/playoffs/PlayoffProjection');
    const text = textOf(
      renderToStaticMarkup(
        PlayoffProjection({
          projection: m.projection.buildDivisionProjection('eal', 'EAL', partial, facts),
          heading: 'League table',
          asOfLabel: 'so far',
          standingsHref: '/standings/eal',
        }),
      ),
    );
    expect(text, 'components/playoffs/PlayoffProjection.tsx').toContain(
      `${listWords(rows.slice(1).map((r) => r.team.name))} are in the EAL table as MaxPreps lists it but have no reported results`,
    );
    expect(text, 'components/playoffs/PlayoffProjection.tsx').not.toMatch(/\bofficial\s+(EAL\s+)?alignment/i);
  });

  it('says "as MaxPreps lists it" only where MaxPreps’ table for the division lists the teams (Metro South Bay, Sunset)', async () => {
    // The corpus has no SoCal games, so every row is a no-results row. MaxPreps' table for Metro South
    // Bay is 'Grossmont' (El Capitan, Granite Hills) and leaves out Hilltop and Southwest.
    const rowsOf = (division: string) =>
      m.data.getTeams().filter((t) => t.division === division).map((team) => ({
        team,
        standing: m.data.getStandingFor(team.id)!,
        status: 'out' as PlayoffStatus,
        statuses: ['out'] as PlayoffStatus[],
        label: 'x',
        shared: false,
      }));
    const facts = { aqPlaces: 0, playInPlace: null, playInDate: null, atLargePlace: null, line: null, unresolved: '' };
    const msb = m.projection.buildDivisionProjection('metro-south-bay', 'Metro South Bay', rowsOf('metro-south-bay'), facts);
    expect(msb.notes[0], VIEW).toBe(
      'No Metro South Bay league results have been reported yet, so there is nothing to project here. The rows below are the Metro South Bay teams (the CIF-SDS 2026-27 League Alignment).',
    );
    const sunsetRows = rowsOf('sunset');
    const partial = sunsetRows.map((r) =>
      r.team.slug === 'great-oak' ? { ...r, standing: { ...r.standing, hasReportedResults: true } } : r,
    );
    const { PlayoffProjection } = await import('@/components/playoffs/PlayoffProjection');
    const text = textOf(
      renderToStaticMarkup(
        PlayoffProjection({
          projection: m.projection.buildDivisionProjection('sunset', 'Sunset', partial, facts),
          heading: 'League table',
          asOfLabel: 'so far',
          standingsHref: '/standings/sunset',
        }),
      ),
    );
    expect(text, 'components/playoffs/PlayoffProjection.tsx').not.toContain('as MaxPreps lists it');
    expect(text).toContain('are Sunset teams (MaxPreps’ 2024-25 and 2025-26 Sunset tables) but have no reported results');
  });

  it('reproduces the corpus table: De Anza’s shared 3rd holds three berths among four teams', () => {
    const da = build('de-anza', liveRows('de-anza'));
    expect(da.autoRows.map((r) => r.team.slug), VIEW).toEqual(['saint-francis', 'st-ignatius', 'los-altos', 'valley-christian']);
    expect(da.lineAfter, VIEW).toBe(4);
    expect(da.notes.join(' '), VIEW).toContain(
      'Los Altos and Valley Christian share the last of the top three places, and De Anza has only three automatic berths — Article VI §7 decides it with a coin flip',
    );
    expect(da.notes.join(' '), VIEW).toContain('are level across fourth');

    const ec = build('el-camino', liveRows('el-camino'));
    expect(ec.autoRows, VIEW).toHaveLength(3);
    expect(ec.lineAfter, VIEW).toBe(3);
    expect(ec.playInRows.map((r) => r.team.slug), VIEW).toEqual(['presentation', 'santa-clara']);
    expect(ec.notes.join(' '), VIEW).toContain('are level across fifth');
  });
});

describe('buildDivisionProjection — BVAL and PCAL ladders', () => {
  it('Santa Teresa: no automatic places; the play-in host line after the co-champions', () => {
    const st = build('santa-teresa', liveRows('santa-teresa'));
    expect(st.autoRows, VIEW).toHaveLength(0);
    expect(st.playInRows.map((r) => r.team.slug), VIEW).toEqual(['prospect', 'westmont']);
    expect(st.lineAfter, VIEW).toBe(2);
    expect(st.lineLabel, VIEW).toBe('Play-in host');
    expect(st.notes.join(' '), VIEW).toContain('Prospect and Westmont are level across first');
    expect(st.notes.join(' '), VIEW).toContain('BVAL By-Laws §6f decides it with a coin flip');
    expect(st.notes.join(' '), VIEW).not.toMatch(/automatic berths/);
  });

  it('PCAL: two automatic places, no play-in note, the AQ line after 2nd', () => {
    const p = build('pcal', liveRows('pcal'));
    expect(p.autoRows.map((r) => r.team.slug), VIEW).toEqual(['stevenson', 'hollister']);
    expect(p.lineAfter, VIEW).toBe(2);
    expect(p.lineLabel, VIEW).toBe('AQ line');
    expect(p.playInRows, VIEW).toHaveLength(0);
    expect(p.notes.join(' '), VIEW).not.toMatch(/play-in/);
    expect(p.rows.slice(2).every((r) => r.label === 'No automatic-berth route'), VIEW).toBe(true);
  });

  it('PCAL: a level 2nd past two berths says PCAL has only two', () => {
    const p = build('pcal', withStatuses('pcal', ['aq', 'aq', 'aq', 'no-aq-route']));
    expect(p.notes.join(' '), VIEW).toContain('PCAL has only two automatic berths — PCAL By-laws §23.3 ends in a coin flip or blind draw by the Commissioner');
  });
});

describe('splitStatusLabel', () => {
  it('splits a status label into the chip head and the " — " tail', () => {
    expect(m.projection.splitStatusLabel('Automatic qualifier'), VIEW).toEqual({ head: 'Automatic qualifier', tail: null });
    expect(m.projection.splitStatusLabel('Play-in game Oct 30 — a coin flip decides it'), VIEW).toEqual({
      head: 'Play-in game Oct 30',
      tail: 'a coin flip decides it',
    });
    expect(m.projection.splitStatusLabel('A — b — c'), VIEW).toEqual({ head: 'A', tail: 'b — c' });
  });
});

describe('row copy', () => {
  it('never invents a record for a team with nothing reported', () => {
    const fremont = m.data.getStandingFor('fremont');
    expect(fremont).toBeTruthy();
    const unreported = { ...fremont!, hasReportedResults: false };
    expect(m.projection.recordLine(unreported), VIEW).toBe('—');
    expect(m.projection.recordLine(unreported), VIEW).not.toContain('0-0-0');
  });

  it('reads the row link’s record in words and never says "1 points"', () => {
    const standing = m.data.getStandingFor('fremont')!;
    const team = getTeamById(standing.teamId)!;
    const row = {
      team,
      standing: { ...standing, hasReportedResults: true, computed: { ...standing.computed, w: 0, l: 6, t: 1, pts: 1 } },
      shared: false,
    } as unknown as ProjectionRow;
    const label = m.projection.projectionRowLabel(row, 'De Anza');
    expect(label, VIEW).toContain('0 wins, 6 losses, 1 tie, 1 point');
    expect(label, VIEW).not.toMatch(/\b1 points\b|\d-\d-\d/);
  });
});
