/**
 * Step 09's CCS carry (lib/pipeline/steps/secondary.ts `stepCcs`): a run that does not read CCS —
 * `--leagues mcal` (no CCS league in the run), `--no-ccs`, the season gate, a corpus without the
 * resources, a failed request, or a tournament page `readTournamentPage` does not recognise (the 403
 * body MaxPreps' WAF serves) — keeps the previous snapshot's `bracketPublished`, `divisionsPublished`,
 * `ccsCalendar` and `keyDatesConfirmed`, per part, instead of unpublishing a live bracket. With no
 * previous snapshot it publishes today's empty state; a run that reads a recognised page publishes
 * what it read, per division.
 *
 * The previous snapshot is the corpus run's own output with the four fields set, so it stays
 * schema-valid. The unpublished page is the REAL capture of 2026-10-29 (tests/fixtures/ccs/).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { SnapshotSchema } from '../../lib/snapshot-schema';
import type { CcsCalendarEvent, Snapshot } from '../../lib/types';
import { REPO } from '../helpers';
import { snapshotOf, writeTempVariant } from './support/run-corpus';

const STEP = 'lib/pipeline/steps/secondary.ts';

/** One event the corpus never contains, so a carried calendar is unmistakable. */
const EVENT: CcsCalendarEvent = {
  date: '2026-11-07',
  summary: 'CCS Quarterfinals at High Seeds',
  kind: 'quarterfinals',
  uid: 'carry-test@prestosports.com',
  detail: null,
};

/** After CCS.pollFrom (2026-10-25), so the season gate is open. */
const POLL_OPEN = '2026-11-08T15:00:00.000Z';

const ICS = readFileSync(path.join(REPO, 'tests', 'fixtures', 'ccs', 'field-hockey.ics'), 'utf8');
/** The live MaxPreps tournament page of 2026-10-29: both divisions still carry the not-published marker. */
const UNPUBLISHED = readFileSync(path.join(REPO, 'tests', 'fixtures', 'ccs', 'tournament-2026-10-29-unpublished.html'), 'utf8');
/** MaxPreps' WAF body: 200 to the transport, but not the bracket page. */
const FORBIDDEN = readFileSync(path.join(REPO, 'tests', 'fixtures', 'ccs', 'tournament-403.html'), 'utf8');
const PREVIOUS_DIVISIONS = { 'Division 1': true, 'Division 2': false } as const;

let previous: Snapshot;

beforeAll(async () => {
  const { snapshot } = await snapshotOf();
  previous = {
    ...snapshot,
    playoffs: {
      ...snapshot.playoffs,
      bracketPublished: true,
      divisionsPublished: { ...PREVIOUS_DIVISIONS },
      ccsCalendar: [EVENT],
      keyDatesConfirmed: true,
    },
  };
  expect(SnapshotSchema.safeParse(previous).success, 'the shaped previous snapshot is schema-valid').toBe(true);
}, 600_000);

const ccsLog = (lines: readonly string[] | undefined) => (lines ?? []).filter((l) => l.startsWith('  ccs'));

describe('CCS not read this run: the previous snapshot’s bracket and calendar are carried', () => {
  it('--leagues mcal (no CCS league in the run) keeps a published bracket and the confirmed calendar', async () => {
    const { snapshot, run } = await snapshotOf({ extraArgs: ['--leagues', 'mcal'], previous });
    expect(snapshot.playoffs.bracketPublished, STEP).toBe(true);
    expect(snapshot.playoffs.divisionsPublished, STEP).toEqual(PREVIOUS_DIVISIONS);
    expect(snapshot.playoffs.ccsCalendar, STEP).toEqual([EVENT]);
    expect(snapshot.playoffs.keyDatesConfirmed, STEP).toBe(true);
    expect(ccsLog(run.result?.logLines), STEP).toEqual([
      '  ccs: skipped (no CCS league in this run) — carried bracket/calendar state from the previous snapshot',
    ]);
    // The ledger rows are unchanged: CCS was not queried.
    expect(snapshot.sources.filter((s) => s.scope?.section === 'ccs').map((s) => [s.label, s.status, s.error])).toEqual([
      ['ccs calendar', 'skipped', 'no CCS league in this run'],
      ['ccs bracket', 'skipped', 'no CCS league in this run'],
    ]);
  });

  it('--leagues mcal with no previous snapshot: bracket not published, no calendar', async () => {
    const { snapshot, run } = await snapshotOf({ extraArgs: ['--leagues', 'mcal'] });
    expect(snapshot.playoffs.bracketPublished, STEP).toBe(false);
    expect(snapshot.playoffs.divisionsPublished, STEP).toBeUndefined();
    expect(snapshot.playoffs.ccsCalendar, STEP).toBeUndefined();
    expect(snapshot.playoffs.keyDatesConfirmed, STEP).toBeUndefined();
    expect(ccsLog(run.result?.logLines), STEP).toEqual(['  ccs: skipped (no CCS league in this run) — nothing to carry']);
  });

  it('--no-ccs keeps them too', async () => {
    const { snapshot, run } = await snapshotOf({ extraArgs: ['--no-ccs'], previous });
    expect(snapshot.playoffs.bracketPublished, STEP).toBe(true);
    expect(snapshot.playoffs.ccsCalendar, STEP).toEqual([EVENT]);
    expect(snapshot.playoffs.keyDatesConfirmed, STEP).toBe(true);
    expect(ccsLog(run.result?.logLines), STEP).toEqual([
      '  ccs: skipped (--no-ccs) — carried bracket/calendar state from the previous snapshot',
    ]);
  });

  it('the season gate keeps them (a full run on the corpus date, before CCS.pollFrom)', async () => {
    const { snapshot, run } = await snapshotOf({ previous });
    expect(snapshot.playoffs.bracketPublished, STEP).toBe(true);
    expect(snapshot.playoffs.ccsCalendar, STEP).toEqual([EVENT]);
    expect(ccsLog(run.result?.logLines)[0], STEP).toMatch(/^ {2}ccs: skipped \(season gate: .*\) — carried bracket\/calendar state/);
  });

  it('gate open but neither resource in the corpus: both carried', async () => {
    const { snapshot, run } = await snapshotOf({ previous, fetchedAt: POLL_OPEN });
    expect(snapshot.playoffs.bracketPublished, STEP).toBe(true);
    expect(snapshot.playoffs.ccsCalendar, STEP).toEqual([EVENT]);
    expect(ccsLog(run.result?.logLines), STEP).toEqual([
      '  ccs: calendar not in corpus, bracket not in corpus — carried bracket/calendar state from the previous snapshot',
    ]);
  });
});

describe('CCS read this run: what was read is published', () => {
  it('a full run with CCS in scope reports the calendar and bracket it read, not the previous ones', async () => {
    const variant = writeTempVariant({
      'ccs/ical': { rel: 'ccs/ical.ics', body: ICS },
      'ccs/bracket': { rel: 'ccs/bracket.html', body: UNPUBLISHED },
    });
    const { snapshot, run } = await snapshotOf({ variants: [variant], previous, fetchedAt: POLL_OPEN });
    // The previous snapshot said Division 1 was published; a recognised page that says neither is flips it back.
    expect(snapshot.playoffs.bracketPublished, STEP).toBe(false);
    expect(snapshot.playoffs.divisionsPublished, STEP).toEqual({ 'Division 1': false, 'Division 2': false });
    expect(snapshot.playoffs.ccsCalendar?.map((e) => e.date), STEP).toEqual([
      '2026-11-02',
      '2026-11-07',
      '2026-11-11',
      '2026-11-14',
      '2026-11-19',
    ]);
    expect(snapshot.playoffs.keyDatesConfirmed, STEP).toBe(true);
    expect(snapshot.sources.filter((s) => s.scope?.section === 'ccs').map((s) => [s.label, s.status, s.rowCount])).toEqual([
      ['ccs calendar', 'ok', 5],
      ['ccs bracket', 'ok', 0],
    ]);
    const lines = ccsLog(run.result?.logLines);
    expect(lines.some((l) => l.startsWith('  ccs calendar: 5 events')), STEP).toBe(true);
    expect(lines, STEP).toContain('  ccs bracket: Division 1 not published · Division 2 not published');
    expect(lines.some((l) => l.includes('carried')), STEP).toBe(false);
  });

  it('a page with Division 1’s marker gone publishes Division 1 only, and counts it on the source row', async () => {
    const MARKER = '<div class="not-published" >This tournament bracket will go live when published.</div>';
    const variant = writeTempVariant({
      'ccs/ical': { rel: 'ccs/ical.ics', body: ICS },
      'ccs/bracket': { rel: 'ccs/bracket.html', body: UNPUBLISHED.replace(MARKER, '') },
    });
    const unpublished = { ...previous, playoffs: { ...previous.playoffs, bracketPublished: false, divisionsPublished: { 'Division 1': false, 'Division 2': false } } };
    const { snapshot, run } = await snapshotOf({ variants: [variant], previous: unpublished, fetchedAt: POLL_OPEN });
    expect(snapshot.playoffs.bracketPublished, STEP).toBe(true);
    expect(snapshot.playoffs.divisionsPublished, STEP).toEqual({ 'Division 1': true, 'Division 2': false });
    expect(snapshot.sources.find((s) => s.label === 'ccs bracket')?.rowCount, STEP).toBe(1);
    expect(ccsLog(run.result?.logLines), STEP).toContain('  ccs bracket: Division 1 PUBLISHED · Division 2 not published');
  });

  it('a 403 body (200 to the transport, not the bracket page) carries the previous bracket state and says so', async () => {
    const variant = writeTempVariant({
      'ccs/ical': { rel: 'ccs/ical.ics', body: ICS },
      'ccs/bracket': { rel: 'ccs/bracket.html', body: FORBIDDEN },
    });
    const { snapshot, run } = await snapshotOf({ variants: [variant], previous, fetchedAt: POLL_OPEN });
    expect(snapshot.playoffs.bracketPublished, STEP).toBe(true);
    expect(snapshot.playoffs.divisionsPublished, STEP).toEqual(PREVIOUS_DIVISIONS);
    expect(snapshot.playoffs.ccsCalendar?.length, STEP).toBe(5);
    const bracket = snapshot.sources.find((s) => s.label === 'ccs bracket');
    expect(bracket?.status).toBe('error');
    expect(bracket?.error).toMatch(/^page not recognised: /);
    const lines = ccsLog(run.result?.logLines);
    expect(lines.some((l) => l.startsWith('  ccs bracket: page not recognised (') && l.endsWith(') — carried bracket state from the previous snapshot')), STEP).toBe(true);
    expect(lines, STEP).toContain('  ccs: bracket page not recognised — carried bracket state from the previous snapshot');
  });

  it('a failed bracket page carries only the bracket; the calendar read this run wins', async () => {
    const variant = writeTempVariant({ 'ccs/ical': { rel: 'ccs/ical.ics', body: ICS }, 'ccs/bracket': 503 });
    const { snapshot, run } = await snapshotOf({ variants: [variant], previous, fetchedAt: POLL_OPEN });
    expect(snapshot.playoffs.bracketPublished, STEP).toBe(true);
    expect(snapshot.playoffs.ccsCalendar?.length, STEP).toBe(5);
    const bracket = snapshot.sources.find((s) => s.label === 'ccs bracket');
    expect(bracket?.status).toBe('error');
    expect(ccsLog(run.result?.logLines), STEP).toContain(
      '  ccs: bracket page failed — carried bracket state from the previous snapshot',
    );
  });
});
