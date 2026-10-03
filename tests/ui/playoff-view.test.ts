/**
 * `components/playoffs/playoff-view.ts` and `/playoffs` (SPEC §6.1, §10.7) — the per-division CCS
 * ladder projection for every CCS league, the league pairings (SCVAL crossover, BVAL play-in), the key
 * dates, and the rendered CCS page.
 *
 * League-specific values are asserted on the all-2026-10-02 CORPUS snapshot (SPEC §13.6), loaded by
 * pointing SCVAL_SNAPSHOT at it BEFORE lib/data is imported (dynamic imports after
 * `vi.resetModules()`), so live fetch #2 cannot break them. On that snapshot De Anza's 3rd place is
 * shared (Los Altos, Valley Christian), El Camino's 4th straddles the play-in and at-large places,
 * Santa Teresa's champions are level (Prospect, Westmont) and Mt. Hamilton's 4th is shared — every
 * by-law consequence of an uncomputable tiebreak shows up at once. Every assertion message names the
 * module that produced the value.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { ProjectionRow } from '../../components/playoffs/playoff-view';
import type { PlayoffStatus } from '../../lib/types';
import { corpusSnapshotPath } from '../helpers';
import { textOf } from './html-text';

type Data = typeof import('../../lib/data');
type View = typeof import('../../components/playoffs/playoff-view');
type Leagues = typeof import('../../lib/leagues');

const VIEW = 'components/playoffs/playoff-view.ts';
const PAGE = 'app/playoffs/page.tsx';

const priorEnv = process.env.SCVAL_SNAPSHOT;
let data: Data;
let view: View;
let leagues: Leagues;
let html = '';

beforeAll(async () => {
  process.env.SCVAL_SNAPSHOT = corpusSnapshotPath('all-2026-10-02');
  vi.resetModules();
  data = await import('../../lib/data');
  view = await import('../../components/playoffs/playoff-view');
  leagues = await import('../../lib/leagues');
  const Page = (await import('../../app/playoffs/page')).default;
  html = renderToStaticMarkup(Page() as ReactElement);
}, 600_000);

afterAll(() => {
  if (priorEnv === undefined) delete process.env.SCVAL_SNAPSHOT;
  else process.env.SCVAL_SNAPSHOT = priorEnv;
  vi.resetModules();
});

function liveRows(division: string): ProjectionRow[] {
  const league = leagues.leagueOfDivision(division).id;
  return data.getPlayoffProjection(league).byDivision[division].flatMap((row) => {
    const team = data.getTeamById(row.teamId);
    const standing = data.getStandingFor(row.teamId);
    if (!team || !standing) return [];
    return [{ team, standing, status: row.status, statuses: row.statuses, label: row.label, shared: row.shared }];
  });
}

/** The same rows with the statuses forced, which is what each by-law case turns on. */
function withStatuses(division: string, statuses: PlayoffStatus[]): ProjectionRow[] {
  return liveRows(division).map((row, i) => ({
    ...row,
    status: statuses[i] ?? 'out',
    statuses: [statuses[i] ?? 'out'],
    shared: statuses[i] !== undefined && (statuses[i] === statuses[i - 1] || statuses[i] === statuses[i + 1]),
  }));
}

/** A row that straddles a by-law boundary carries BOTH statuses. */
function withOutcomes(division: string, outcomes: PlayoffStatus[][]): ProjectionRow[] {
  return liveRows(division).map((row, i) => {
    const statuses = outcomes[i] ?? ['out'];
    return { ...row, status: statuses[0], statuses, shared: statuses.length > 1 };
  });
}

function build(division: string, rows: ProjectionRow[]) {
  return view.buildDivisionProjection(division, leagues.divisionLabel(division), rows, view.ladderFactsFor(division));
}

describe('ladderFactsFor (config → the ladder facts the notes use)', () => {
  it('reads each division’s ladder from config', () => {
    expect(view.ladderFactsFor('de-anza'), VIEW).toEqual({
      aqPlaces: 3,
      playInPlace: 4,
      playInDate: 'Oct 30',
      atLargePlace: 5,
      line: { status: 'aq', label: 'AQ line' },
      unresolved: 'Article VI §7 decides it with a coin flip',
    });
    expect(view.ladderFactsFor('santa-teresa'), VIEW).toMatchObject({
      aqPlaces: 0,
      playInPlace: 1,
      playInDate: 'Oct 31',
      atLargePlace: null,
      line: { status: 'play-in', label: 'Play-in host' },
    });
    expect(view.ladderFactsFor('pcal'), VIEW).toMatchObject({
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

describe('buildPairingView — the BVAL play-in card', () => {
  it('marks the Santa Teresa #1 seat as host and names both co-champions with the by-law that decides', () => {
    const [pairing] = data.getLeaguePairings('bval');
    const resolve = (id: string) => {
      const team = data.getTeamById(id);
      return team ? { team, standing: data.getStandingFor(id) } : undefined;
    };
    const v = view.buildPairingView(pairing, resolve, view.pairingNotesFor(pairing));
    expect(v.title, VIEW).toBe('Play-in');
    expect(v.dateLabel, VIEW).toBe('Sat Oct 31');
    expect(v.timeLabel, VIEW).toBe('11 AM PT');
    expect(v.connector, VIEW).toBe('at');
    expect(v.seats.map((s) => s.label), VIEW).toEqual(['Santa Teresa #1', 'Mt. Hamilton #4']);
    expect(v.seats.map((s) => s.host), VIEW).toEqual([true, false]);
    expect(v.seats[0].contenders.map((c) => c.team.slug), VIEW).toEqual(['prospect', 'westmont']);
    expect(v.seats[1].contenders.map((c) => c.team.slug), VIEW).toEqual(['branham', 'willow-glen']);
    expect(v.unsettled, VIEW).toBe(true);
    expect(v.notes[0], VIEW).toBe('Santa Teresa co-champions: BVAL By-Laws §6b-f decide who hosts.');
    expect(view.pairingSentence(v), VIEW).toBe(
      'Play-in, Sat Oct 31, 11 AM PT: Branham or Willow Glen (Mt. Hamilton #4) at Prospect or Westmont (Santa Teresa #1, host).',
    );
  });

  it('SCVAL crossover: seat labels from config, no host, the play-in last', () => {
    const views = data.getLeaguePairings('scval').map((p) =>
      view.buildPairingView(p, (id) => {
        const team = data.getTeamById(id);
        return team ? { team, standing: data.getStandingFor(id) } : undefined;
      }, view.pairingNotesFor(p)),
    );
    expect(views.map((v) => v.title), VIEW).toEqual(['Crossover · #1 v #1', 'Crossover · #2 v #2', 'Crossover · #3 v #3', 'Play-in']);
    expect(views.every((v) => v.connector === 'vs' && v.seats.every((s) => !s.host)), VIEW).toBe(true);
    expect(views[3].seats.map((s) => s.label), VIEW).toEqual(['De Anza #4', 'El Camino #4']);
    expect(views[3].unsettled, VIEW).toBe(true);
    expect(views[3].notes, VIEW).toEqual([
      'Not settled yet: teams are level across a seat, and Article VI §7 decides it with a coin flip. The pairing follows the table, so it moves with every result.',
    ]);
  });
});

describe('keyDateRows', () => {
  it('lists the CCS dates and each league’s own date, labelled with its league, in date order', () => {
    const rows = view.keyDateRows(data.getPlayoffs().keyDates, [
      { id: 'bval', league: 'BVAL', date: '2026-10-31', time: '11:00', label: 'BVAL play-in', detail: 'x' },
      { id: 'scval', league: 'SCVAL', date: '2026-10-30', time: null, label: 'SCVAL crossover and 4th-place play-in', detail: 'y' },
    ]);
    expect(rows.map((r) => `${r.date}|${r.league ?? ''}|${r.label}|${r.time ?? ''}`), VIEW).toEqual([
      'Fri Oct 30|SCVAL|SCVAL crossover and 4th-place play-in|',
      'Sat Oct 31||CCS end of league season|',
      'Sat Oct 31|BVAL|BVAL play-in|11 AM PT',
      'Mon Nov 2||CCS entries due|12:00 PM PT',
      'Mon Nov 2||CCS seeding meeting|1:00 PM PT',
      'Sat Nov 7||Quarterfinals|',
      'Wed Nov 11||Semifinals|',
      'Sat Nov 14||Finals|',
      'Thu Nov 19||CCS evaluation meeting|4:00 PM PT',
    ]);
  });
});

describe('row copy', () => {
  it('never invents a record for a team with nothing reported', () => {
    const fremont = data.getStandingFor('fremont');
    expect(fremont).toBeTruthy();
    const unreported = { ...fremont!, hasReportedResults: false };
    expect(view.recordLine(unreported), VIEW).toBe('—');
    expect(view.recordLine(unreported), VIEW).not.toContain('0-0-0');
  });

  it('joins names the way a sentence does', () => {
    expect(view.joinNames([])).toBe('');
    expect(view.joinNames(['Cupertino'])).toBe('Cupertino');
    expect(view.joinNames(['Cupertino', 'Homestead'])).toBe('Cupertino and Homestead');
    expect(view.joinNames(['A', 'B', 'C'])).toBe('A, B and C');
  });
});

describe('/playoffs (rendered)', () => {
  it('has the league anchors, key dates and bracket anchors, each id once', () => {
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    for (const id of ['scval', 'bval', 'pcal', 'key-dates', 'bracket', 'de-anza', 'el-camino', 'mt-hamilton', 'santa-teresa']) {
      expect(ids.filter((x) => x === id), `${PAGE}: #${id}`).toHaveLength(1);
    }
    expect(new Set(ids).size, `${PAGE}: unique ids`).toBe(ids.length);
  });

  it('carries the NCS pointer card, the field and the verbatim at-large paragraph', () => {
    const text = textOf(html);
    expect(text, PAGE).toContain(
      'Following an MCAL team? The North Coast Section holds no field hockey championship. MCAL tournament →',
    );
    expect(html, PAGE).toContain('href="/playoffs/mcal"');
    expect(text, PAGE).toContain('Central Coast Section · 16 teams · SCVAL 7, BVAL 4, PCAL 2, 3 at-large');
    for (const line of ['SCVAL holds 7 of 16', 'BVAL holds 4 of 16', 'PCAL holds 2 of 16', '3 at-large berths, chosen by the CCS committee']) {
      expect(text, PAGE).toContain(line);
    }
    expect(text, PAGE).toContain(
      'Three at-large berths are the CCS committee’s call. SCVAL submits its play-in loser and both fifth-place teams (Article VII §2); PCAL teams placed 3rd or lower may apply (PCAL By-laws §23.4); BVAL’s by-laws do not say whom it submits.',
    );
    expect(text, PAGE).toContain('SCVAL crossover and 4th-place play-in');
    expect(text, PAGE).toContain('BVAL play-in');
    expect(text, PAGE).toContain('11 AM PT');
    expect(text, PAGE).toContain('(host)');
    expect(text, PAGE).toContain('Santa Teresa co-champions: BVAL By-Laws §6b-f decide who hosts.');
    expect(text, PAGE).toContain('AQ line');
    expect(text, PAGE).toContain('Play-in host');
  });

  it('never writes "eliminated" or "Gabilan", and never renders a missing record as 0-0-0', () => {
    expect(html, PAGE).not.toMatch(/eliminat/i);
    expect(html, PAGE).not.toContain('Gabilan');
    expect(textOf(html), PAGE).not.toContain('0-0-0');
  });
});
