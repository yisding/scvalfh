/**
 * The proof that SCVAL is unchanged (SPEC §5.11 items 1 and 2, plus the §5.9 phase isolation case).
 *
 * Inputs were captured from `main` before any lib change (Stage 0, tests/golden/). If a test here
 * fails, the engine changed SCVAL: fix the engine, never the golden.
 */

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { classifyGames } from '../lib/classify';
import { divisionsOf } from '../lib/leagues';
import { buildSeason } from '../lib/season-build';
import {
  buildCrossCheck,
  computeStandings,
  divisionGames,
  playoffOutcomeLabel,
  statusBadge,
  statusLegend,
} from '../lib/standings';
import { countsOf, migrateV1ToV2 } from '../lib/snapshot-migrate';
import { parseSnapshot, stableStringify } from '../lib/snapshot-schema';
import type {
  Game,
  GameStatus,
  PlayoffStatus,
  ReportedRecord,
  Snapshot,
  Standing,
} from '../lib/types';
import { teamsInLeague } from '../lib/teams';
import { game } from './game-builder';

type DataModule = typeof import('../lib/data');

const REPO = path.resolve(import.meta.dirname, '..');
const readJson = (p: string): unknown => JSON.parse(readFileSync(path.join(REPO, p), 'utf8'));

interface GoldenRow {
  teamId: string; slug: string; place: number; status: string; statuses: string[]; label: string; shared: boolean;
}
interface GoldenSeat { teamId: string; slug: string }
interface Golden {
  standings: Standing[];
  crossCheck: unknown[];
  divisionGames: Record<string, string[]>;
  projection: {
    berths: { auto: number; total: number };
    byDivision: Record<string, GoldenRow[]>;
    crossover: {
      date: string;
      pairings: Array<{ seed: number; deAnza: GoldenSeat[]; elCamino: GoldenSeat[]; label: string; isPlayIn: boolean }>;
    };
  };
  phases: Record<string, string>;
  labels: {
    statusLabels: Record<string, string>;
    legends: Record<string, string>;
    badges: Record<string, string>;
    unions: Record<string, string>;
  };
}

const golden = readJson('tests/golden/scval-committed.json') as Golden;
const v1Raw = readJson('tests/golden/snapshot-2026-10-02.v1.json') as { games: Game[]; standings: Standing[] };

const SCVAL = divisionsOf('scval').map((d) => d.id);
const isScval = (s: Standing) => SCVAL.includes(s.division);

const migrated: Snapshot = parseSnapshot(migrateV1ToV2(readJson('tests/golden/snapshot-2026-10-02.v1.json')));

const dir = mkdtempSync(path.join(tmpdir(), 'scvalfh-golden-'));
function writeSnapshot(name: string, s: Snapshot): string {
  const file = path.join(dir, name);
  writeFileSync(file, JSON.stringify(s));
  return file;
}

/** lib/data loaded fresh against a given snapshot file. */
async function loadData(file: string): Promise<DataModule> {
  vi.resetModules();
  process.env.SCVAL_SNAPSHOT = file;
  return import('../lib/data');
}

const priorEnv = process.env.SCVAL_SNAPSHOT;
afterAll(() => {
  if (priorEnv === undefined) delete process.env.SCVAL_SNAPSHOT;
  else process.env.SCVAL_SNAPSHOT = priorEnv;
});

/** Every day 2026-08-01 … 2026-12-01 (123 dates). */
function goldenDates(): string[] {
  return Object.keys(golden.phases).sort();
}

describe('golden: the engine on the v1 games before any migration (§13.4 step 2)', () => {
  it('SCVAL rows of computeStandings(classifyGames(v1Games)) equal the golden rows', () => {
    const v1Games = v1Raw.games.map((g) => ({
      ...g,
      contestTypes: { home: null, away: null },
      postseason: null,
      countsFor: null,
    }));
    const reported = new Map<string, ReportedRecord>();
    for (const r of v1Raw.standings) if (r.reported) reported.set(r.teamId, r.reported);
    const rows = computeStandings(classifyGames(v1Games), { reported }).filter(isScval);
    expect(stableStringify(rows)).toBe(stableStringify(golden.standings));
  });
});

describe('golden item 1: the committed snapshot, migrated and parsed', () => {
  it('SCVAL Standing rows are byte-identical', () => {
    expect(migrated.schemaVersion).toBe(2);
    expect(stableStringify(migrated.standings.filter(isScval))).toBe(stableStringify(golden.standings));
  });

  it('cross-check rows are identical', () => {
    expect(buildCrossCheck(migrated.standings.filter(isScval))).toEqual(golden.crossCheck);
    expect(migrated.crossCheck).toEqual(golden.crossCheck);
  });

  it('the counted division games are the same contests', () => {
    for (const d of SCVAL) {
      expect(divisionGames(migrated.games, d).map((g) => g.contestId).sort(), d).toEqual(
        [...golden.divisionGames[d]].sort(),
      );
    }
  });

  it('ladder labels, legends, badges and unions are today’s strings', () => {
    const { statusLabels, legends, badges, unions } = golden.labels;
    for (const [status, label] of Object.entries(statusLabels)) {
      expect(playoffOutcomeLabel('de-anza', [status as PlayoffStatus]), status).toBe(label);
      expect(playoffOutcomeLabel('el-camino', [status as PlayoffStatus]), status).toBe(label);
    }
    for (const [status, legend] of Object.entries(legends)) {
      expect(statusLegend('de-anza', status as PlayoffStatus), status).toBe(legend);
    }
    for (const [status, badge] of Object.entries(badges)) {
      expect(statusBadge('de-anza', status as PlayoffStatus), status).toBe(badge);
    }
    for (const [union, label] of Object.entries(unions)) {
      expect(playoffOutcomeLabel('de-anza', union.split('|') as PlayoffStatus[]), union).toBe(label);
    }
  });

  describe('through lib/data (SCVAL_SNAPSHOT = the migrated file)', () => {
    let data: DataModule;
    beforeAll(async () => {
      data = await loadData(writeSnapshot('migrated.json', migrated));
    });

    it('projection rows per division equal the golden projection', () => {
      const projection = data.getPlayoffProjection('scval');
      expect(projection.berths).toEqual(golden.projection.berths);
      for (const d of SCVAL) {
        const rows = projection.byDivision[d].map((r) => ({
          teamId: r.teamId, slug: r.slug, place: r.place, status: r.status,
          statuses: r.statuses, label: r.label, shared: r.shared,
        }));
        expect(rows, d).toEqual(golden.projection.byDivision[d]);
      }
    });

    it('crossover pairings equal the golden pairings', () => {
      const pairings = data.getPlayoffProjection('scval').pairings;
      expect(pairings).toHaveLength(golden.projection.crossover.pairings.length);
      golden.projection.crossover.pairings.forEach((g, i) => {
        expect(pairings[i].seats[0], `seat ${g.seed}`).toEqual(g.deAnza);
        expect(pairings[i].seats[1], `seat ${g.seed}`).toEqual(g.elCamino);
        expect(pairings[i].label).toBe(g.label);
        expect(pairings[i].isPlayIn).toBe(g.isPlayIn);
        expect(pairings[i].date).toBe(golden.projection.crossover.date);
      });
    });

    it('getSeasonPhase(scval) equals the golden phase on all 123 dates', () => {
      const dates = goldenDates();
      expect(dates).toHaveLength(123);
      const got = Object.fromEntries(dates.map((d) => [d, data.getSeasonPhase('scval', `${d}T19:00:00.000Z`)]));
      expect(got).toEqual(golden.phases);
    });
  });
});

describe('golden §5.9: postseason games never stretch the SCVAL regular phase', () => {
  let data: DataModule;
  beforeAll(async () => {
    const crossover = game({
      home: 'saint-francis', away: 'mitty', hs: 2, as: 1, date: '2026-10-30', league: false,
    });
    const ccs = game({
      home: 'saint-francis', away: 'st-ignatius', hs: 1, as: 0, date: '2026-11-07',
      contestTypes: { home: 4, away: 0 },
    });
    expect(crossover.postseason?.kind).toBe('scval-crossover');
    expect(ccs.postseason).toEqual({ kind: 'ccs', leagueId: 'scval', via: 'contest-type-4' });
    expect(ccs.countsFor).toBeNull();
    const games = [...migrated.games, crossover, ccs];
    const standings = computeStandings(games, {
      reported: new Map(migrated.standings.filter((s) => s.reported).map((s) => [s.teamId, s.reported!])),
    });
    const augmented = parseSnapshot({
      ...migrated,
      games,
      standings,
      crossCheck: buildCrossCheck(standings),
      season: buildSeason(games),
      counts: countsOf(games, standings),
    });
    data = await loadData(writeSnapshot('augmented.json', augmented));
  });

  it('is crossover on Oct 29 and playoffs on Nov 7', () => {
    expect(data.getSeasonPhase('scval', '2026-10-29T19:00:00.000Z')).toBe('crossover');
    expect(data.getSeasonPhase('scval', '2026-11-07T19:00:00.000Z')).toBe('playoffs');
  });

  it('the un-augmented games still give the 123 golden phases', async () => {
    const plain = await loadData(writeSnapshot('plain.json', migrated));
    for (const d of goldenDates()) {
      expect(plain.getSeasonPhase('scval', `${d}T19:00:00.000Z`), d).toBe(golden.phases[d]);
    }
  });
});

describe('golden item 2: isolation from 100+ foreign-league games', () => {
  const STATUSES: GameStatus[] = ['final', 'scheduled', 'score-pending', 'postponed', 'live'];
  const CONTEST_TYPES = [0, 1, 2, 4];
  const PAIRS: Array<[string, string]> = [
    ['leigh', 'leland'], ['branham', 'gilroy'], ['christopher', 'willow-glen'],
    ['live-oak', 'prospect'], ['del-mar', 'westmont'], ['sobrato', 'silver-creek'],
    ['live-oak', 'gilroy'], ['leigh', 'del-mar'],
    ['carmel', 'salinas'], ['greenfield', 'hollister'], ['monterey', 'stevenson'], ['santa-catalina', 'carmel'],
    ['tamalpais', 'redwood'], ['berkeley', 'archie-williams'], ['university-sf', 'marin-catholic'],
    ['convent-sacred-heart', 'marin-academy'], ['lick-wilmerding', 'tamalpais'],
    ['leigh', 'tamalpais'], ['carmel', 'branham'], ['redwood', 'hollister'],
  ];

  function foreignGames(): Game[] {
    const out: Game[] = [];
    const start = Date.UTC(2026, 7, 20); // Aug 20
    const end = Date.UTC(2026, 10, 14); // Nov 14
    const span = Math.round((end - start) / 86_400_000);
    for (let i = 0; i < 120; i += 1) {
      const [home, away] = PAIRS[i % PAIRS.length];
      const status = STATUSES[i % STATUSES.length];
      const ct = CONTEST_TYPES[i % CONTEST_TYPES.length];
      const date = new Date(start + ((i * 7) % (span + 1)) * 86_400_000).toISOString().slice(0, 10);
      const final = status === 'final';
      out.push(
        game({
          home, away, date, status,
          hs: final ? i % 4 : undefined,
          as: final ? (i * 3) % 3 : undefined,
          league: ct === 0,
          contestTypes: { home: ct, away: i % 2 ? ct : 0 },
          ...(i % 3 === 0 ? { official: null } : {}),
        }),
      );
    }
    return out;
  }

  it('builds a mix of every status, contest type and date through Nov 14', () => {
    const games = foreignGames();
    expect(games.length).toBeGreaterThanOrEqual(100);
    expect(new Set(games.map((g) => g.status)).size).toBe(STATUSES.length);
    expect(games.some((g) => g.dateKey >= '2026-11-07')).toBe(true);
    expect(games.some((g) => g.countsFor !== null)).toBe(true);
    expect(games.some((g) => g.postseason !== null)).toBe(true);
    const scvalSlugs = new Set(teamsInLeague('scval').map((t) => t.slug));
    for (const g of games) {
      expect([g.home.slug, g.away.slug].some((s) => s !== null && scvalSlugs.has(s))).toBe(false);
    }
  });

  it('leaves every SCVAL row byte-identical', () => {
    const reported = new Map<string, ReportedRecord>();
    for (const r of migrated.standings) if (r.reported) reported.set(r.teamId, r.reported);
    const games = classifyGames([...migrated.games, ...foreignGames()]);
    const rows = computeStandings(games, { reported }).filter(isScval);
    expect(stableStringify(rows)).toBe(stableStringify(golden.standings));
    expect(buildCrossCheck(rows)).toEqual(golden.crossCheck);
    for (const d of SCVAL) {
      expect(divisionGames(games, d).map((g) => g.contestId).sort(), d).toEqual([...golden.divisionGames[d]].sort());
    }
  });
});
