/**
 * The fixture ledger (lib/fixtures/): this site's own record of a game, and the sources merged into it. The
 * ledger's shape rules (assertLedger), the slices each pipeline step reads (ledgerView), and every fixture checked
 * against the games the sources gave (ledgerProblems, over the committed snapshot).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { LEDGER, LEDGER_VIEW, assertLedger, fixtureKey, ledgerProblems, ledgerView } from '../lib/fixtures/ledger';
import type { CanonicalFixture, FixtureLedger } from '../lib/fixtures/shape';
import type { Game } from '../lib/types';
import { game, type GameSpec } from './game-builder';

const FALLBROOK = 'fc8be1f8-e3e6-48dc-8b7a-eebc0f1f2ce0';
const TIE = '9ecb5378-55b3-4163-a0cc-7c8fc039ff47';
const base: CanonicalFixture = { dateKey: '2026-09-29', home: 'fallbrook', away: 'valley-center', sources: { maxpreps: FALLBROOK } };
const ledgerOf = (...fixtures: CanonicalFixture[]): FixtureLedger => ({ fixtures, rejected: {} });
const violation = (ledger: FixtureLedger): string => {
  try {
    assertLedger(ledger);
  } catch (err) {
    return (err as Error).message;
  }
  return '';
};

describe('the ledger: one fixture per game', () => {
  it('states a game once: the Sep 11 tie carries its day and its result in one fixture', () => {
    const f = LEDGER_VIEW.byContest.get(TIE)!;
    expect(fixtureKey(f)).toBe('2026-09-11-cupertino-at-homestead');
    expect(f.date?.source).toMatch(/Friday Sep 11/);
    expect(f.result).toMatchObject({ goals: { homestead: 5, cupertino: 5 }, otPeriods: 1 });
    expect(LEDGER.fixtures.filter((x) => x.sources.maxpreps === TIE)).toHaveLength(1);
  });

  it('files a second MaxPreps row under the game it repeats, and a row that is no game under none', () => {
    const f = LEDGER.fixtures.find((x) => fixtureKey(x) === '2026-10-06-torrey-pines-at-la-costa-canyon')!;
    expect(Object.keys(f.sources.maxprepsDuplicates ?? {})).toEqual(['8c6b3f6a-4a53-4e4e-87c2-690b6b45d182']);
    expect(LEDGER_VIEW.rejected['8c6b3f6a-4a53-4e4e-87c2-690b6b45d182']).toMatch(/second MaxPreps row/);
    // The scrimmage is rejected outright: it is no fixture's duplicate.
    expect(LEDGER.rejected['5c14da41-b4c8-412f-aff3-34c8b454af35']).toMatch(/scrimmage/);
    expect(LEDGER_VIEW.byContest.has('5c14da41-b4c8-412f-aff3-34c8b454af35')).toBe(false);
  });

  it('reads as the slices the pipeline’s steps work on', () => {
    const view = ledgerView(
      ledgerOf(
        { ...base, date: { source: 'the Section lists it on 09/29' } },
        { dateKey: '2026-10-30', home: 'redwood', away: 'tamalpais', sources: { maxpreps: TIE }, host: { source: 'Moved to Redwood', url: null } },
        { dateKey: '2026-10-13', home: 'homestead', away: 'cupertino', sources: { official: 'de-anza:2026-09-09:homestead@cupertino' }, date: { source: 'si.com has it on Oct 13' } },
        { dateKey: '2026-10-30', home: 'poway', away: 'valley-center', sources: {}, listing: { time: '18:00', goals: null, forfeitBy: null, from: 'cifss', otPeriods: 0, source: 'the Section’s listing', url: null } },
      ),
    );
    expect(view.dates).toEqual({ [FALLBROOK]: { dateKey: '2026-09-29', source: 'the Section lists it on 09/29' } });
    expect(view.hosts).toEqual({ [TIE]: { home: 'redwood', source: 'Moved to Redwood', url: null } });
    expect(view.moves).toEqual({ 'de-anza:2026-09-09:homestead@cupertino': { dateKey: '2026-10-13', home: 'homestead', source: 'si.com has it on Oct 13' } });
    expect(view.listed).toEqual([
      { dateKey: '2026-10-30', home: 'poway', away: 'valley-center', time: '18:00', goals: null, forfeitBy: null, from: 'cifss', otPeriods: 0, source: 'the Section’s listing', url: null },
    ]);
    expect(view.results).toEqual({});
  });
});

describe('assertLedger: what a fixture has to say', () => {
  it('accepts this sport’s ledger', () => {
    expect(violation(LEDGER)).toBe('');
  });

  it('a fixture is two registry teams on a day of a season, tied to a source’s row or a listing', () => {
    expect(violation(ledgerOf({ ...base, away: 'nowhere-high' }))).toMatch(/nowhere-high is not a team of the registry/);
    expect(violation(ledgerOf({ ...base, dateKey: '2026-09-31' }))).toMatch(/dateKey 2026-09-31 is not a valid YYYY-MM-DD date/);
    expect(violation(ledgerOf({ ...base, dateKey: '2027-03-01' }))).toMatch(/2027-03-01 is outside every section's season window/);
    expect(violation(ledgerOf({ ...base, sources: {} }))).toMatch(/names no source's row and has no listing/);
    expect(violation(ledgerOf({ ...base, sources: { maxpreps: 'fc8be1f8' } }))).toMatch(/fc8be1f8 is not a contest GUID/);
  });

  it('a contest, and a pair on a day, is in the ledger once', () => {
    expect(violation(ledgerOf(base, { ...base, dateKey: '2026-10-01' }))).toMatch(/contest fc8be1f8-e3e6-48dc-8b7a-eebc0f1f2ce0 is named twice/);
    expect(violation({ fixtures: [base], rejected: { [FALLBROOK]: 'a stray row' } })).toMatch(/named twice/);
    expect(violation(ledgerOf(base, { ...base, home: 'valley-center', away: 'fallbrook', sources: { maxpreps: TIE } }))).toMatch(/the pair has two fixtures on 2026-09-29/);
  });

  it('every fact is cited, and a result names the fixture’s own two teams', () => {
    expect(violation(ledgerOf({ ...base, date: { source: ' ' } }))).toMatch(/the date needs a source/);
    expect(violation(ledgerOf({ ...base, host: { source: 'Moved.', url: null } }))).toMatch(/the host needs a source, one sentence without a final period/);
    const result = { goals: { fallbrook: 1, poway: 1 }, otPeriods: 0, shootout: null, source: 'a report', url: null };
    expect(violation(ledgerOf({ ...base, result }))).toMatch(/the result's goals name the fixture's two teams by slug/);
    expect(violation(ledgerOf({ ...base, result: { ...result, goals: { fallbrook: 1, 'valley-center': 0 }, shootout: { fallbrook: 3, 'valley-center': 2 } } }))).toMatch(/a shootout follows a level score/);
    expect(violation(ledgerOf({ ...base, result: { ...result, goals: null } }))).toMatch(/a result with no goals names the winner/);
    expect(violation(ledgerOf({ ...base, result: { ...result, goals: null, winner: 'poway' } }))).toMatch(/the winner poway is neither side/);
  });

  it('a linked league fixture is one of a configured division, played on another day, between the same two schools', () => {
    const linked: CanonicalFixture = { dateKey: '2026-10-13', home: 'homestead', away: 'cupertino', sources: { official: 'de-anza:2026-09-09:homestead@cupertino' }, date: { source: 'si.com has it on Oct 13' } };
    expect(violation(ledgerOf(linked))).toBe('');
    expect(violation(ledgerOf({ ...linked, sources: { official: 'de-anz:2026-09-09:homestead@cupertino' } }))).toMatch(/is not an official fixture id of a configured division/);
    expect(violation(ledgerOf({ ...linked, dateKey: '2026-09-09' }))).toMatch(/dateKey is the official date/);
    expect(violation(ledgerOf({ ...linked, home: 'los-altos' }))).toMatch(/its sides are not the two of/);
    expect(violation(ledgerOf({ ...linked, date: undefined }))).toMatch(/a league fixture played on another day needs a source/);
  });
});

describe('ledgerProblems: the ledger against what the sources gave', () => {
  const view = ledgerView(ledgerOf(base));
  const listed = (over: Partial<GameSpec> = {}): Game => ({
    ...game({ home: 'fallbrook', away: 'valley-center', hs: 11, as: 0, date: '2026-09-29', status: 'final', ...over }),
    contestId: FALLBROOK,
  });

  it('says nothing of a contest that is the game its fixture states, or of a game with no fixture', () => {
    expect(ledgerProblems([listed()], view)).toEqual([]);
    expect(ledgerProblems([{ ...listed(), contestId: 'another' }], view)).toEqual([]);
  });

  it('reports a fixture whose contest is another pair, another day or the other host', () => {
    expect(ledgerProblems([listed({ away: 'poway' })], view)).toEqual([`fixture 2026-09-29-valley-center-at-fallbrook: contest ${FALLBROOK} is Poway at Fallbrook`]);
    expect(ledgerProblems([listed({ date: '2026-09-25' })], view)[0]).toMatch(/is dated 2026-09-25, and the fixture cites no source for its own day/);
    expect(ledgerProblems([listed({ home: 'valley-center', away: 'fallbrook' })], view)[0]).toMatch(/is at Valley Center, and the fixture cites no source for its own host/);
  });

  it('finds every fixture’s contest in the committed snapshot as the game the fixture states', () => {
    const raw = JSON.parse(readFileSync(path.join(__dirname, '..', 'data', 'snapshot.json'), 'utf8')) as { games: Game[] };
    expect(ledgerProblems(raw.games)).toEqual([]);
    const stored = new Set(raw.games.map((g) => g.contestId));
    for (const id of LEDGER_VIEW.byContest.keys()) expect(stored.has(id), id).toBe(true);
    // And no rejected or duplicate row is among the stored games.
    for (const id of Object.keys(LEDGER_VIEW.rejected)) expect(stored.has(id), id).toBe(false);
  });
});
