/**
 * The run's ledgers (SPEC §7.2, §7.5, §7.11): the deterministic SourceStatus order, the league
 * state machine (only ever towards worse), the dropped list, and the RunContext they back.
 */

import { describe, expect, it } from 'vitest';

import { LEAGUES } from '../../lib/leagues';
import type { RunArgs } from '../../lib/pipeline/contract';
import {
  DroppedLedger,
  LeagueLedger,
  PipelineContext,
  SILENT_SINK,
  SourceLedger,
  asOfStamp,
  hasPreviousData,
  lastFreshStamp,
} from '../../lib/pipeline/ledger';
import { TEAMS } from '../../lib/teams';
import type { Snapshot, SourceStatus } from '../../lib/types';

const AT = '2026-10-02T15:00:00.000Z';

function row(kind: SourceStatus['kind'], scope: SourceStatus['scope'], label: string, url = 'https://example.com/'): SourceStatus {
  return { id: 'maxpreps-api', kind, ...(scope ? { scope } : {}), label, url, status: 'ok', fetchedAt: AT };
}

function args(over: Partial<RunArgs> = {}): RunArgs {
  return {
    fixtures: null, variants: [], capture: null, out: '/dev/null', dryRun: true, fetchedAt: AT, force: false,
    leagues: null, acceptRegression: [], sblive: true, sbliveFull: false, official: true, ccs: true, vnn: true, ...over,
  };
}

/** A deterministic shuffle (so the test never depends on Math.random). */
function shuffled<T>(xs: readonly T[], seed: number): T[] {
  const out = [...xs];
  let s = seed;
  for (let i = out.length - 1; i > 0; i -= 1) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

describe('SourceLedger', () => {
  const expected: SourceStatus[] = [row('bootstrap', undefined, 'season bootstrap')];
  for (const league of LEAGUES) {
    for (const d of league.divisions) expected.push(row('league-meta', { league: league.id, division: d.id }, `${d.id} league metadata`));
    for (const d of league.divisions) expected.push(row('reported-standings', { league: league.id, division: d.id }, `${d.id} reported standings`));
    for (const t of TEAMS.filter((x) => x.league === league.id)) {
      expected.push(row('team-schedule', { league: league.id, division: t.division, team: t.slug }, `${t.slug} schedule`));
    }
    for (const d of league.divisions) expected.push(row('official-schedule', { league: league.id, division: d.id }, `${d.id} official schedule`));
  }
  expected.push(
    row('sblive-scoreboard', undefined, 'sblive scoreboard 2026-09-23', 'https://www.si.com/x/scores?date=2026-09-23'),
    row('sblive-scoreboard', undefined, 'sblive scoreboard 2026-09-30', 'https://www.si.com/x/scores?date=2026-09-30'),
    row('sblive-team-games', { team: 'carmel' }, 'sblive carmel games'),
    row('sblive-team-games', { team: 'stevenson' }, 'sblive stevenson games'),
    row('school-calendar', { team: 'los-gatos' }, 'los-gatos school calendar'),
    row('school-calendar', { team: 'palo-alto' }, 'palo-alto school calendar'),
    row('ccs-calendar', { section: 'ccs' }, 'ccs calendar'),
    row('ccs-bracket', { section: 'ccs' }, 'ccs bracket'),
  );

  it('orders rows per §7.11 whatever order the steps appended them in', () => {
    for (const seed of [1, 7, 42, 2026]) {
      const ledger = new SourceLedger();
      for (const r of shuffled(expected, seed)) ledger.add(r);
      expect(ledger.ordered().map((r) => r.label), `seed ${seed}`).toEqual(expected.map((r) => r.label));
    }
  });

  it('orders a league’s official rows by division (league-wide rows last), and a division-scoped row finds its league', () => {
    const ledger = new SourceLedger();
    ledger.add(row('official-revision-check', { division: 'santa-teresa' }, 'b'));
    ledger.add(row('team-schedule', { team: 'leigh' }, 'leigh schedule'));
    ledger.add(row('official-schedule', { league: 'bval' }, 'a'));
    ledger.add(row('league-meta', { division: 'de-anza' }, 'de-anza league metadata'));
    expect(ledger.ordered().map((r) => r.label)).toEqual(['de-anza league metadata', 'leigh schedule', 'b', 'a']);
  });

  it('marks this run’s failed rows stale with a note, never an ok row', () => {
    const ledger = new SourceLedger();
    ledger.add({ ...row('school-calendar', { team: 'palo-alto' }, 'palo-alto school calendar'), status: 'error', error: 'HTTP 500' });
    ledger.add(row('school-calendar', { team: 'los-gatos' }, 'los-gatos school calendar'));
    expect(ledger.markStale((r) => r.kind === 'school-calendar', 'carried forward from the previous snapshot', '2026-10-01T14:00:00.000Z')).toBe(1);
    const [pa, lg] = ledger.all();
    expect(pa).toMatchObject({ status: 'stale', error: 'HTTP 500; carried forward from the previous snapshot', carriedFrom: '2026-10-01T14:00:00.000Z' });
    expect(lg.status).toBe('ok');
  });
});

describe('LeagueLedger', () => {
  it('moves only towards worse and records every reason once', () => {
    const l = new LeagueLedger();
    expect(l.ids()).toEqual(LEAGUES.map((x) => x.id));
    expect(l.state('bval')).toBe('fresh');
    l.degrade('bval', 'partial', 'one', 'c1');
    l.degrade('bval', 'frozen', 'two', 'c2');
    l.degrade('bval', 'partial', 'three');
    l.degrade('bval', 'degraded', 'two');
    expect(l.state('bval')).toBe('frozen');
    expect(l.reasons('bval')).toEqual(['one', 'two', 'three']);
    expect(l.causes('bval')).toEqual(['c1', 'c2']);
    l.degrade('pcal', 'degraded', 'x');
    l.degrade('pcal', 'partial', 'y');
    expect(l.state('pcal')).toBe('degraded');
    expect(() => l.degrade('nope', 'partial', 'z')).toThrow(/unknown league/);
  });

  it('names the cause that set the state, not the first one recorded', () => {
    const l = new LeagueLedger();
    l.degrade('bval', 'partial', 'one', 'team feed carried');
    expect(l.stateCause('bval')).toBe('team feed carried');
    l.degrade('bval', 'frozen', 'two', 'finals regression');
    l.degrade('bval', 'degraded', 'three', 'official file invalid');
    expect(l.stateCause('bval')).toBe('finals regression');
    expect(l.causes('bval')).toEqual(['team feed carried', 'finals regression', 'official file invalid']);
    // A worse state with no cause of its own falls back to the first cause recorded.
    l.degrade('pcal', 'partial', 'x', 'reported table carried');
    l.degrade('pcal', 'degraded', 'y');
    expect(l.stateCause('pcal')).toBe('reported table carried');
    expect(l.stateCause('mcal')).toBeUndefined();
  });
});

describe('DroppedLedger', () => {
  it('dedupes on (contestId, reason) and sorts by date then id', () => {
    const d = new DroppedLedger();
    const base = { note: 'n', teams: [] };
    d.add({ ...base, contestId: 'b', reason: 'tba-opponent', dateKey: '2026-09-12' });
    d.add({ ...base, contestId: 'a', reason: 'ghost-team', dateKey: null });
    d.add({ ...base, contestId: 'c', reason: 'excluded-by-config', dateKey: '2026-08-18' });
    d.add({ ...base, contestId: 'b', reason: 'tba-opponent', dateKey: '2026-09-12' });
    expect(d.all().map((x) => x.contestId)).toEqual(['c', 'b', 'a']);
  });
});

describe('PipelineContext', () => {
  it('derives today from fetchedAt (Pacific), never the clock, and lists leagues in config order', () => {
    const ctx = new PipelineContext({
      args: args({ fetchedAt: '2026-10-03T05:00:00.000Z', leagues: ['mcal', 'scval'] }),
      transport: { mode: 'fixture', get: async () => ({ url: '', httpStatus: 200, body: '' }) },
      previous: null,
      sink: SILENT_SINK,
    });
    expect(ctx.today).toBe('2026-10-02');
    expect(ctx.leaguesInRun()).toEqual(['scval', 'mcal']);
    ctx.warn('something', { league: 'mcal', team: 'tamalpais' });
    ctx.log('plain');
    expect(ctx.logLines).toEqual(['WARN something [mcal/tamalpais]', 'plain']);
    ctx.degrade('mcal', 'partial', 'why', 'because');
    expect(ctx.leagues.state('mcal')).toBe('partial');
    expect(ctx.leagues.stateCause('mcal')).toBe('because');
  });

  it('formats the as-of stamp and knows when a league has previous data', () => {
    expect(asOfStamp('2026-09-29T14:02:00.000Z')).toBe('Tue Sep 29, 7:02 AM');
    const previous = {
      leagueHealth: [
        { leagueId: 'scval', lastFreshAt: '2026-10-01T14:00:00.000Z' },
        { leagueId: 'bval', lastFreshAt: null },
      ],
    } as unknown as Snapshot;
    expect(hasPreviousData(previous, 'scval')).toBe(true);
    expect(hasPreviousData(previous, 'bval')).toBe(false);
    expect(hasPreviousData(previous, 'pcal')).toBe(false);
    expect(hasPreviousData(null, 'scval')).toBe(false);
    expect(lastFreshStamp(previous, 'scval')).toBe('Thu Oct 1, 7:00 AM');
    expect(lastFreshStamp(previous, 'bval')).toBeNull();
    expect(lastFreshStamp(null, 'scval')).toBeNull();
  });
});
