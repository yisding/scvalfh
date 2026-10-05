/**
 * lib/official/match.ts and lib/pipeline/steps/official.ts (SPEC §7.8).
 *
 *  - the two-phase matcher on the all-2026-10-02 corpus (43 raw schedules normalized with
 *    lib/normalize.ts, classified with lib/classify.ts): BVAL 60/60, PCAL 34/42 with the CAT/STE
 *    and MON/CAR legs uncrossed and every moved leg 1-13 days, MCAL 72/72;
 *  - pass 3 assigns globally by smallest |Δdays|;
 *  - postseason and excludeContestTypes contests are never candidates (the published ct-2 reason);
 *  - the MCAL after-the-cut-off reason; classificationNote only when postseasonTag is null;
 *  - the legacy matcher reproduces the Stage-0 SCVAL officialStamps exactly;
 *  - the MCAL officialChanges hash re-derived from the captured Schedir.htm equals config;
 *  - stepOfficial over the corpus: revision/changes checks, SCVAL carry, a failed bundle.
 */

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { classifyGames, postseasonTag } from '../lib/classify';
import { DATA_QUALITY, LEAGUES, getLeague } from '../lib/leagues';
import { applyExclusions, normalizeGames } from '../lib/normalize';
import { matchOfficialFixtures, type MatchOptions, type MatchResult } from '../lib/official/match';
import { loadBundledFixtures, officialDocumentOf } from '../lib/official/schema';
import { officialChangesCellText, officialChangesHash, sha256Hex } from '../lib/official/validate';
import {
  FixtureMissing,
  TransportError,
  resourcePath,
  type ResourceKey,
  type RunContext,
  type Transport,
} from '../lib/pipeline/contract';
import { isExcludedFor, stepOfficial } from '../lib/pipeline/steps/official';
import { ScheduleResponseSchema } from '../lib/sources/maxpreps';
import { parseSchedulePdfText } from '../lib/sources/scval-pdf';
import type { Game, LeagueId, LeagueRunState, OfficialFixture, Snapshot, SourceStatus } from '../lib/types';
import { REPO, allScheduleRows, corpusDir, game } from './helpers';
import { testRunArgs } from './pipeline/support/run-args';

/** Lets one test break a bundle at load (the step's validation-failure path). */
const breakBundle = vi.hoisted(() => ({ league: null as string | null }));
vi.mock('../lib/official/schema', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../lib/official/schema')>();
  return {
    ...mod,
    loadBundledFixtures: (league: string, root?: string) => {
      const fixtures = mod.loadBundledFixtures(league, root);
      return breakBundle.league === league ? fixtures.slice(1) : fixtures;
    },
  };
});

const CORPUS = corpusDir('all-2026-10-02');
const FETCHED_AT = '2026-10-02T15:00:00.000Z';
const TODAY = '2026-10-02';

function corpusGames(): Game[] {
  const dir = path.join(CORPUS, 'maxpreps', 'schedule');
  const rows = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .flatMap((f) => ScheduleResponseSchema.parse(JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as unknown).data);
  return applyExclusions(normalizeGames(rows, { fetchedAt: FETCHED_AT }).games, DATA_QUALITY).games;
}

const optionsFor = (league: LeagueId, today: string | undefined = TODAY): MatchOptions => ({
  matcher: getLeague(league).rules.matcher,
  isExcluded: isExcludedFor(getLeague(league)),
  rescheduleWindowDays: 14,
  ...(today !== undefined ? { today } : {}),
});

const days = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;

// ---------------------------------------------------------------- the corpus

describe('two-phase matcher on the all-2026-10-02 corpus', () => {
  const base = corpusGames();
  const results = new Map<LeagueId, MatchResult>();
  let games = base;
  for (const league of ['bval', 'pcal', 'mcal']) {
    const res = matchOfficialFixtures(games, loadBundledFixtures(league), optionsFor(league));
    results.set(league, res);
    games = res.games;
  }
  const byFixture = new Map(games.filter((g) => g.official).map((g) => [g.official!.fixtureId, g]));
  const classified = classifyGames(games);

  it('BVAL: 60/60, all on the official date; Prospect’s four contestType-1 legs carry the conflict and count', () => {
    const res = results.get('bval')!;
    expect(res.matched).toBe(60);
    expect(res.unmatched).toEqual([]);
    const stamped = games.filter((g) => g.official?.source === 'bval-docx');
    expect(stamped).toHaveLength(60);
    expect(stamped.every((g) => g.official!.pass === 'same-date' && g.official!.scheduledDate === g.dateKey)).toBe(true);
    const flagged = stamped.filter((g) => g.provenance.leagueFlagConflict).map((g) => g.contestId).sort();
    expect(flagged).toEqual([
      '258b9301-ddeb-48f1-a1ad-2b3d01e4ab7d', '6828777b-0c17-4afa-ae98-00fcc2e539be',
      'b369d96f-b201-4256-90e3-d743cab336dd', 'b3bfb653-7e3a-4cdb-a422-5bc1b833ea54',
    ]);
    for (const id of flagged) {
      const g = classified.find((x) => x.contestId === id)!;
      expect(g.isLeague).toBe(false);
      expect(g.countsFor).toBe('santa-teresa');
    }
  });

  it('PCAL: 34/42, the 8 absent fixtures unmatched, every moved leg 1-13 days from its grid date', () => {
    const res = results.get('pcal')!;
    expect(res.matched).toBe(34);
    expect(res.unmatched.map((f) => f.id)).toEqual([
      'pcal:2026-09-04:greenfield@santa-catalina',
      'pcal:2026-09-30:hollister@greenfield',
      'pcal:2026-10-06:santa-catalina@greenfield',
      'pcal:2026-10-13:santa-catalina@hollister',
      'pcal:2026-10-14:monterey@greenfield',
      'pcal:2026-10-22:monterey@hollister',
      'pcal:2026-10-26:santa-catalina@monterey',
      'pcal:2026-10-28:greenfield@hollister',
    ]);
    const moved = games.filter((g) => g.official?.source === 'pcal-pdf' && g.official.scheduledDate !== g.dateKey);
    expect(moved.length).toBeGreaterThan(0);
    for (const g of moved) {
      expect(g.official!.pass).toBe('rescheduled');
      const d = days(g.dateKey, g.official!.scheduledDate);
      expect(d).toBeGreaterThanOrEqual(1);
      expect(d).toBeLessThanOrEqual(13);
    }
  });

  it('PCAL: the CAT/STE and MON/CAR legs are not crossed', () => {
    // Santa Catalina @ Stevenson (Sep 16) was played Sep 23; Stevenson @ Santa Catalina stays Oct 16.
    expect(byFixture.get('pcal:2026-09-16:santa-catalina@stevenson')?.dateKey).toBe('2026-09-23');
    expect(byFixture.get('pcal:2026-10-16:stevenson@santa-catalina')?.dateKey).toBe('2026-10-16');
    // Monterey @ Carmel (Sep 18) was played Oct 1; Carmel @ Monterey stays Oct 19.
    expect(byFixture.get('pcal:2026-09-18:monterey@carmel')?.dateKey).toBe('2026-10-01');
    expect(byFixture.get('pcal:2026-10-19:carmel@monterey')?.dateKey).toBe('2026-10-19');
  });

  it('MCAL: 72/72, the two MaxPreps date differences recorded as rescheduled', () => {
    const res = results.get('mcal')!;
    expect(res.matched).toBe(72);
    expect(res.unmatched).toEqual([]);
    const moved = games
      .filter((g) => g.official?.source === 'mcal-pdf' && g.official.scheduledDate !== g.dateKey)
      .map((g) => [g.official!.fixtureId, g.dateKey, g.official!.pass])
      .sort();
    expect(moved).toEqual([
      ['marin-county:2026-09-09:marin-catholic@archie-williams', '2026-09-16', 'rescheduled'],
      ['marin-county:2026-09-17:lick-wilmerding@convent-sacred-heart', '2026-09-16', 'rescheduled'],
    ]);
  });

  it('publishes no league reason and no classification note on the corpus', () => {
    for (const res of results.values()) expect(res.reasons).toEqual([]);
    expect(games.some((g) => g.provenance.classificationNote)).toBe(false);
  });

  it('counts exactly the stamped same-division games of the three leagues', () => {
    for (const division of ['mt-hamilton', 'santa-teresa', 'pcal', 'marin-county']) {
      const counted = classified.filter((g) => g.countsFor === division);
      expect(counted.every((g) => g.official?.division === division)).toBe(true);
      expect(counted.length).toBe(games.filter((g) => g.official?.division === division && postseasonTag(g) === null).length);
    }
  });
});

// ---------------------------------------------------------------- synthetic cases

const fx = (division: string, dateKey: string, away: string, home: string): OfficialFixture => {
  const league = LEAGUES.find((l) => l.divisions.some((d) => d.id === division))!;
  const source = officialDocumentOf(division).source;
  return {
    id: `${division}:${dateKey}:${away}@${home}`, league: league.id, division, dateKey, time: null,
    awayName: away, homeName: home, awaySlug: away, homeSlug: home, source,
  };
};

describe('two-phase matcher: pass 3 assigns globally by smallest |Δdays|', () => {
  it('gives a moved contest to the nearer fixture, not to an earlier unplayed one', () => {
    const early = fx('mt-hamilton', '2026-09-17', 'leigh', 'gilroy');
    const late = fx('mt-hamilton', '2026-10-06', 'gilroy', 'leigh');
    // 11 days after the early fixture, 8 before the late one: a fixture-order greedy pass would
    // hand it to the early fixture.
    const moved = game({ home: 'leigh', away: 'gilroy', hs: 2, as: 1, date: '2026-09-28', official: null });
    const res = matchOfficialFixtures([moved], [early, late], optionsFor('bval'));
    expect(res.games[0].official).toMatchObject({ fixtureId: late.id, pass: 'rescheduled', scheduledDate: '2026-10-06' });
    expect(res.unmatched.map((f) => f.id)).toEqual([early.id]);
  });

  it('assigns two moved contests to the two fixtures by distance', () => {
    const early = fx('mt-hamilton', '2026-09-17', 'leigh', 'gilroy');
    const late = fx('mt-hamilton', '2026-10-06', 'gilroy', 'leigh');
    const a = game({ home: 'gilroy', away: 'leigh', hs: 1, as: 1, date: '2026-09-24', official: null });
    const b = game({ home: 'leigh', away: 'gilroy', hs: 0, as: 1, date: '2026-10-08', official: null });
    const res = matchOfficialFixtures([b, a], [late, early], optionsFor('bval'));
    expect(res.matched).toBe(2);
    expect(res.games.find((g) => g.contestId === a.contestId)?.official?.fixtureId).toBe(early.id);
    expect(res.games.find((g) => g.contestId === b.contestId)?.official?.fixtureId).toBe(late.id);
  });

  it('breaks a distance tie by fixture date, then fixture id', () => {
    const f1 = fx('mt-hamilton', '2026-09-20', 'leigh', 'gilroy');
    const f2 = fx('mt-hamilton', '2026-09-30', 'gilroy', 'leigh');
    const g = game({ home: 'gilroy', away: 'leigh', hs: 1, as: 0, date: '2026-09-25', official: null });
    const res = matchOfficialFixtures([g], [f2, f1], optionsFor('bval'));
    expect(res.games[0].official?.fixtureId).toBe(f1.id);
  });

  it('matches same-date ordered first, then same-date swapped (host conflict published)', () => {
    const f = fx('mt-hamilton', '2026-09-17', 'leigh', 'gilroy');
    const swapped = game({ home: 'leigh', away: 'gilroy', hs: 1, as: 0, date: '2026-09-17', official: null });
    const res = matchOfficialFixtures([swapped], [f], optionsFor('bval'));
    expect(res.games[0].official?.pass).toBe('same-date-swapped');
    expect(res.games[0].provenance.hostConflict).toBe(
      'the official BVAL schedule has Gilroy hosting; MaxPreps has Leigh, and MaxPreps is the only source of the two that states home and away.',
    );
  });
});

describe('two-phase matcher: excluded contests are never candidates', () => {
  it('never lets a contestType-2 contest consume a fixture, and publishes the league reason', () => {
    const f = fx('mt-hamilton', '2026-09-17', 'leigh', 'gilroy');
    const neutral = game({
      home: 'gilroy', away: 'leigh', hs: 2, as: 0, date: '2026-09-17', league: false,
      contestTypes: { home: 2, away: 2 }, official: null,
    });
    const res = matchOfficialFixtures([neutral], [f], optionsFor('bval'));
    expect(res.matched).toBe(0);
    expect(res.unmatched.map((x) => x.id)).toEqual([f.id]);
    expect(res.games[0].official).toBeUndefined();
    expect(res.reasons).toEqual([
      'MaxPreps marks Leigh v Gilroy on Thu Sep 17 as a tournament/neutral game (contestType 2), so it is not counted; the official BVAL schedule lists it as a league game.',
    ]);
    // It IS on the official schedule, so it does not get the "not on the schedule" note.
    expect(res.games[0].provenance.classificationNote).toBeUndefined();
    expect(classifyGames(res.games)[0].countsFor).toBeNull();
  });

  it('gives that reason only for a fixture dated before today', () => {
    const f = fx('mt-hamilton', '2026-10-13', 'leland', 'gilroy');
    const neutral = game({
      home: 'gilroy', away: 'leland', date: '2026-10-13', league: false, contestTypes: { home: 2, away: 2 }, official: null,
    });
    expect(matchOfficialFixtures([neutral], [f], optionsFor('bval', '2026-10-02')).reasons).toEqual([]);
    expect(matchOfficialFixtures([neutral], [f], optionsFor('bval', '2026-10-14')).reasons).toHaveLength(1);
  });

  it('never lets a postseason (contestType 4) contest consume a fixture', () => {
    const f = fx('mt-hamilton', '2026-09-17', 'leigh', 'gilroy');
    const ccs = game({ home: 'gilroy', away: 'leigh', hs: 2, as: 0, date: '2026-09-17', contestTypes: { home: 4, away: 4 }, official: null });
    expect(postseasonTag(ccs)).not.toBeNull();
    const res = matchOfficialFixtures([ccs], [f], optionsFor('bval'));
    expect(res.matched).toBe(0);
    expect(res.games[0].official).toBeUndefined();
  });

  it('publishes the MCAL after-the-cut-off reason when the only candidate is dated Oct 23 or later', () => {
    const f = loadBundledFixtures('mcal').find((x) => x.dateKey === '2026-10-22')!;
    expect(f).toBeDefined();
    const late = game({ home: f.homeSlug!, away: f.awaySlug!, hs: 1, as: 0, date: '2026-10-23', official: null });
    expect(postseasonTag(late)?.kind).toBe('mcal-tournament');
    const res = matchOfficialFixtures([late], [f], optionsFor('mcal'));
    expect(res.matched).toBe(0);
    expect(res.games[0].official).toBeUndefined();
    const away = game({ home: f.awaySlug!, away: f.homeSlug! }).home.name;
    const home = late.home.name;
    expect(res.reasons).toEqual([
      `An MCAL contest between ${away} and ${home} on Fri Oct 23 is after the league's Oct 22 cut-off, so it is treated as tournament play. If it is the rescheduled league game from Thu Oct 22, add its contest id to LEAGUES.mcal.rules.leagueGameOverrides.`,
    ]);
  });

  it('publishes nothing for a real MCAL tournament game (contestType 4) after the cut-off', () => {
    const f = loadBundledFixtures('mcal').find((x) => x.dateKey === '2026-10-22')!;
    const qf = game({ home: f.homeSlug!, away: f.awaySlug!, hs: 1, as: 0, date: '2026-10-26', contestTypes: { home: 4, away: 4 }, official: null });
    const res = matchOfficialFixtures([qf], [f], optionsFor('mcal'));
    expect(res.matched).toBe(0);
    expect(res.reasons).toEqual([]);
  });
});

describe('two-phase matcher: the classification note', () => {
  const legs = [fx('mt-hamilton', '2026-09-17', 'leigh', 'gilroy'), fx('mt-hamilton', '2026-10-06', 'gilroy', 'leigh')];
  const leg1 = game({ home: 'gilroy', away: 'leigh', hs: 1, as: 0, date: '2026-09-17', official: null });
  const leg2 = game({ home: 'leigh', away: 'gilroy', hs: 1, as: 0, date: '2026-10-06', official: null });

  it('marks a same-division final that matched no fixture', () => {
    const friendly = game({ home: 'leigh', away: 'gilroy', hs: 3, as: 0, date: '2026-08-28', league: false, official: null });
    const res = matchOfficialFixtures([leg1, leg2, friendly], legs, optionsFor('bval'));
    expect(res.matched).toBe(2);
    const out = res.games.find((g) => g.contestId === friendly.contestId)!;
    expect(out.official).toBeUndefined();
    expect(out.provenance.classificationNote).toBe('Not on the official BVAL schedule; not counted.');
    expect(res.games.find((g) => g.contestId === leg1.contestId)?.provenance.classificationNote).toBeUndefined();
  });

  it('never marks a postseason game (postseasonTag ≠ null) or a game that is not final', () => {
    const ccs = game({ home: 'leigh', away: 'gilroy', hs: 3, as: 0, date: '2026-11-07', contestTypes: { home: 4, away: 4 }, official: null });
    const pending = game({ home: 'leigh', away: 'gilroy', date: '2026-08-28', league: false, official: null });
    const res = matchOfficialFixtures([leg1, leg2, ccs, pending], legs, optionsFor('bval'));
    expect(res.games.find((g) => g.contestId === ccs.contestId)?.provenance.classificationNote).toBeUndefined();
    expect(res.games.find((g) => g.contestId === pending.contestId)?.provenance.classificationNote).toBeUndefined();
  });

  it('logs a pair with three or more contests around its fixtures', () => {
    const extra = game({ home: 'leigh', away: 'gilroy', hs: 3, as: 0, date: '2026-09-24', league: false, official: null });
    const res = matchOfficialFixtures([leg1, leg2, extra], legs, optionsFor('bval'));
    expect(res.warnings.some((w) => /^Leigh v Gilroy: 3 contests between 2026-09-17 and 2026-10-06/.test(w))).toBe(true);
  });
});

// ---------------------------------------------------------------- legacy (SCVAL)

describe('legacy matcher: the Stage-0 SCVAL golden', () => {
  it('reproduces tests/golden/scval-corpus.json officialStamps exactly', () => {
    const golden = JSON.parse(readFileSync(path.join(REPO, 'tests', 'golden', 'scval-corpus.json'), 'utf8')) as {
      officialStamps: Record<string, string>;
      _meta: { officialMatched: number; officialUnmatched: number };
    };
    const games = normalizeGames(allScheduleRows(), { fetchedAt: '2026-09-29T15:00:00.000Z' }).games;
    const scvalFix = path.join(REPO, 'tests', 'fixtures', 'scval');
    const fixtures = [
      ...parseSchedulePdfText(readFileSync(path.join(scvalFix, 'da-pdftotext.txt'), 'utf8'), 'de-anza').fixtures,
      ...parseSchedulePdfText(readFileSync(path.join(scvalFix, 'ec-pdftotext.txt'), 'utf8'), 'el-camino').fixtures,
    ];
    const res = matchOfficialFixtures(games, fixtures, optionsFor('scval', undefined));
    const stamps: Record<string, string> = {};
    for (const g of res.games) if (g.official) stamps[g.contestId] = g.official.scheduledDate;
    expect(stamps).toEqual(golden.officialStamps);
    expect(res.matched).toBe(golden._meta.officialMatched);
    expect(res.unmatched).toHaveLength(golden._meta.officialUnmatched);
    expect(res.reasons).toEqual([]);
    // The widened stamp: division, source, fixture id and pass.
    for (const g of res.games.filter((x) => x.official)) {
      expect(g.official!.division).toBe(g.leagueDivision);
      expect(g.official!.source).toBe('scval-pdf');
      expect(g.official!.fixtureId).toMatch(new RegExp(`^${g.leagueDivision}:${g.official!.scheduledDate}:`));
      expect(['same-date', 'same-date-swapped', 'rescheduled']).toContain(g.official!.pass);
    }
  });
});

// ---------------------------------------------------------------- MCAL changes page

describe('MCAL officialChanges', () => {
  it('re-derives the config hash from the captured Schedir.htm', () => {
    const html = readFileSync(path.join(REPO, 'tests', 'fixtures', 'official', 'mcal-Schedir.htm'), 'utf8');
    const changes = getLeague('mcal').officialChanges!;
    expect(officialChangesCellText(html, changes.cellMarker)).toBe(
      'Girls Field Hockey: Oct 12: Marin Catholic vs Lick Wilmerding moved to Oct 15 (Varsity at 4:30pm and JV at 5:15pm) Sept 24: Lick Wilmerding vs Berkeley moved to Sept. 29. (Varsity at 4:30pm and JV at 5:30pm at City College of San Francisco)',
    );
    expect(officialChangesHash(html, changes.cellMarker)).toBe(changes.sha256);
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(officialChangesHash('<td>nothing here</td>', changes.cellMarker)).toBeNull();
  });

  it('matches the marker against the cell text, not its raw HTML', () => {
    // A tag inside the marker, or an entity in it, still finds the cell: the decoded text is read.
    expect(officialChangesCellText('<td>x</td><td><b>Girls</b> Field Hockey: Oct 12 moved</td>', 'Girls Field Hockey:'))
      .toBe('Girls Field Hockey: Oct 12 moved');
    expect(officialChangesCellText('<td>Boys &amp; Girls Field Hockey:&nbsp;none</td>', 'Boys & Girls Field Hockey:'))
      .toBe('Boys & Girls Field Hockey: none');
    expect(officialChangesHash('<td><i>Girls</i>&nbsp;Field Hockey: none</td>', 'Girls Field Hockey:'))
      .toBe(sha256Hex('Girls Field Hockey: none'));
  });
});

// ---------------------------------------------------------------- stepOfficial

interface Recorded {
  ctx: RunContext;
  sources: SourceStatus[];
  degraded: Array<{ league: LeagueId; state: Exclude<LeagueRunState, 'fresh'>; reason: string; cause?: string }>;
  warnings: string[];
}

function corpusTransport(overrides: Record<string, string | number | null> = {}): Transport {
  const manifest = JSON.parse(readFileSync(path.join(CORPUS, 'manifest.json'), 'utf8')) as {
    files: Record<string, string | number>;
  };
  return {
    mode: 'fixture',
    async get(key: ResourceKey) {
      const p = resourcePath(key);
      const entry = p in overrides ? overrides[p] : manifest.files[p];
      if (entry === undefined || entry === null) throw new FixtureMissing(key);
      if (typeof entry === 'number') throw new TransportError(`HTTP ${entry}`, `fixture:${p}`, entry);
      if (p in overrides) return { url: `fixture:${p}`, httpStatus: 200, body: entry };
      return { url: `fixture:${p}`, httpStatus: 200, body: readFileSync(path.join(CORPUS, entry), 'utf8') };
    },
  };
}

function makeCtx(opts: {
  transport?: Transport;
  previous?: Snapshot | null;
  leagues?: LeagueId[];
  official?: boolean;
} = {}): Recorded {
  const sources: SourceStatus[] = [];
  const degraded: Recorded['degraded'] = [];
  const warnings: string[] = [];
  const args = testRunArgs({
    fixtures: CORPUS, fetchedAt: FETCHED_AT, leagues: opts.leagues ?? null,
    sblive: false, official: opts.official ?? true, ccs: false, vnn: false,
  });
  const ctx: RunContext = {
    args,
    fetchedAt: FETCHED_AT,
    today: TODAY,
    previous: opts.previous ?? null,
    transport: opts.transport ?? corpusTransport(),
    source: (row) => void sources.push(row),
    degrade: (league, state, reason, cause) => void degraded.push({ league, state, reason, cause }),
    drop: () => undefined,
    leaguesInRun: () => opts.leagues ?? LEAGUES.map((l) => l.id),
    log: () => undefined,
    warn: (line) => void warnings.push(line),
  };
  return { ctx, sources, degraded, warnings };
}

describe('stepOfficial over the corpus', () => {
  const games = corpusGames();
  beforeEach(() => {
    breakBundle.league = null;
  });

  it('matches every league, checks every revision, and degrades nothing', async () => {
    const rec = makeCtx();
    const res = await stepOfficial(rec.ctx, games);
    expect(res.degradedDivisions.size).toBe(0);
    expect(res.revisedUpstream.size).toBe(0);
    expect(res.carriedDivisions.size).toBe(0);
    expect(rec.degraded).toEqual([]);
    expect(res.games).toHaveLength(games.length);
    const stamped = (source: string) => res.games.filter((g) => g.official?.source === source).length;
    expect(stamped('bval-docx')).toBe(60);
    expect(stamped('pcal-pdf')).toBe(34);
    expect(stamped('mcal-pdf')).toBe(72);
    expect(stamped('scval-pdf')).toBeGreaterThan(0);
    expect(res.unmatched.filter((f) => f.league === 'pcal')).toHaveLength(8);
    expect(res.unmatched.filter((f) => f.league === 'bval' || f.league === 'mcal')).toEqual([]);

    const rows = rec.sources.map((r) => [r.kind, r.scope?.division ?? r.scope?.league, r.status]);
    expect(rows).toEqual([
      ['official-schedule', 'de-anza', 'ok'],
      ['official-schedule', 'el-camino', 'ok'],
      ['standings-index', 'scval', 'skipped'],
      ['official-schedule', 'mt-hamilton', 'ok'],
      ['official-schedule', 'santa-teresa', 'ok'],
      ['official-revision-check', 'mt-hamilton', 'ok'],
      ['official-revision-check', 'santa-teresa', 'ok'],
      ['official-schedule', 'pcal', 'ok'],
      ['official-revision-check', 'pcal', 'ok'],
      ['official-schedule', 'marin-county', 'ok'],
      ['official-revision-check', 'marin-county', 'ok'],
      ['official-revision-check', 'mcal', 'ok'],
    ]);
    // Only the SCVAL divisions are live PDFs; no bundled division is ever "missing".
    expect(rec.sources.find((r) => r.kind === 'standings-index')?.error).toBe('not in corpus');
  });

  it('a revised upstream document: stale row, revisedUpstream, league reason — fixtures still used', async () => {
    const rec = makeCtx({ transport: corpusTransport({ 'official/revision/mt-hamilton': `${'a'.repeat(64)}\n` }) });
    const res = await stepOfficial(rec.ctx, games);
    expect([...res.revisedUpstream]).toEqual(['mt-hamilton']);
    const reason = 'BVAL revised the Mt. Hamilton schedule after our copy (revised 9/20/26); official dates may be out of date.';
    expect(rec.sources.find((r) => r.kind === 'official-revision-check' && r.scope?.division === 'mt-hamilton')).toMatchObject({
      status: 'stale', error: reason, id: 'bval-docx',
    });
    expect(rec.degraded).toEqual([{ league: 'bval', state: 'partial', reason, cause: 'upstream revised' }]);
    expect(res.games.filter((g) => g.official?.division === 'mt-hamilton')).toHaveLength(30);
  });

  it('a revised PCAL document names no division (single-division league)', async () => {
    const rec = makeCtx({ transport: corpusTransport({ 'official/revision/pcal': 'b'.repeat(64) }) });
    await stepOfficial(rec.ctx, games);
    expect(rec.degraded.map((d) => d.reason)).toEqual(['PCAL revised its schedule after our copy; official dates may be out of date.']);
  });

  it('an MCAL changes-page edit: stale row scoped to the league, marin-county revisedUpstream', async () => {
    const rec = makeCtx({ transport: corpusTransport({ 'official/changes/mcal': 'c'.repeat(64) }) });
    const res = await stepOfficial(rec.ctx, games);
    const reason = 'MCAL posted a schedule change after our copy; official dates may be out of date.';
    expect(rec.sources.find((r) => r.scope?.league === 'mcal' && r.scope.division === undefined)).toMatchObject({
      kind: 'official-revision-check', status: 'stale', error: reason,
    });
    expect([...res.revisedUpstream]).toEqual(['marin-county']);
    expect(rec.degraded).toEqual([{ league: 'mcal', state: 'partial', reason, cause: 'schedule changes posted' }]);
    expect(res.games.filter((g) => g.official?.division === 'marin-county')).toHaveLength(72);
  });

  it('a failed revision fetch is an error row and nothing else', async () => {
    const rec = makeCtx({ transport: corpusTransport({ 'official/revision/pcal': 503 }) });
    const res = await stepOfficial(rec.ctx, games);
    expect(rec.sources.find((r) => r.kind === 'official-revision-check' && r.scope?.division === 'pcal')).toMatchObject({
      status: 'error', httpStatus: 503,
    });
    expect(res.revisedUpstream.size).toBe(0);
    expect(rec.degraded).toEqual([]);
  });

  it('a bundle that fails validation degrades its divisions with the verbatim reason', async () => {
    breakBundle.league = 'pcal';
    const rec = makeCtx();
    const res = await stepOfficial(rec.ctx, games);
    expect([...res.degradedDivisions]).toEqual(['pcal']);
    expect(rec.degraded).toEqual([
      {
        league: 'pcal', state: 'degraded',
        reason: "The official PCAL schedule file failed validation; league games are identified by MaxPreps' league flag this run.",
        cause: 'official file invalid',
      },
    ]);
    expect(rec.sources.find((r) => r.kind === 'official-schedule' && r.scope?.division === 'pcal')?.status).toBe('error');
    expect(res.games.some((g) => g.official?.division === 'pcal')).toBe(false);
    // The other leagues are untouched.
    expect(res.games.filter((g) => g.official?.division === 'marin-county')).toHaveLength(72);
  });

  it('carries the previous annotations of ONE failed SCVAL grid, per division', async () => {
    const first = await stepOfficial(makeCtx().ctx, games);
    const previous = {
      fetchedAt: '2026-10-01T15:00:00.000Z',
      games: first.games,
      officialFixtures: first.unmatched,
      sources: [],
    } as unknown as Snapshot;
    const rec = makeCtx({ transport: corpusTransport({ 'scval/pdf-text/de-anza': 503 }), previous });
    const res = await stepOfficial(rec.ctx, games);
    expect([...res.carriedDivisions]).toEqual(['de-anza']);
    expect(rec.sources.find((r) => r.scope?.division === 'de-anza')).toMatchObject({
      status: 'stale', carriedFrom: '2026-10-01T15:00:00.000Z', httpStatus: 503,
    });
    expect(rec.sources.find((r) => r.scope?.division === 'el-camino')?.status).toBe('ok');
    const stamp = (gs: Game[], division: string) =>
      gs.filter((g) => g.leagueDivision === division && g.official).map((g) => [g.contestId, g.official!.fixtureId]).sort();
    expect(stamp(res.games, 'de-anza')).toEqual(stamp(first.games, 'de-anza'));
    expect(stamp(res.games, 'el-camino')).toEqual(stamp(first.games, 'el-camino'));
    expect(res.unmatched.filter((f) => f.division === 'de-anza')).toEqual(first.unmatched.filter((f) => f.division === 'de-anza'));
  });

  it('a grid that failed in the previous run too keeps the stamp of when it was last read', async () => {
    const first = await stepOfficial(makeCtx().ctx, games);
    const previous = {
      fetchedAt: '2026-10-01T15:00:00.000Z',
      games: first.games,
      officialFixtures: first.unmatched,
      sources: [
        {
          id: 'scval-pdf', kind: 'official-schedule', scope: { league: 'scval', division: 'de-anza' },
          label: 'De Anza official schedule (PDF)', url: 'https://example.invalid/de-anza.pdf',
          fetchedAt: '2026-10-01T15:00:00.000Z', status: 'stale', carriedFrom: '2026-09-30T15:00:00.000Z',
        },
      ],
    } as unknown as Snapshot;
    const rec = makeCtx({ transport: corpusTransport({ 'scval/pdf-text/de-anza': 503 }), previous });
    await stepOfficial(rec.ctx, games);
    expect(rec.sources.find((r) => r.scope?.division === 'de-anza')).toMatchObject({
      status: 'stale', carriedFrom: '2026-09-30T15:00:00.000Z',
    });
  });

  it('touches only the leagues in the run', async () => {
    const rec = makeCtx({ leagues: ['scval'] });
    const res = await stepOfficial(rec.ctx, games);
    expect(new Set(rec.sources.map((r) => r.scope?.league))).toEqual(new Set(['scval']));
    expect(res.games.some((g) => g.official && g.official.source !== 'scval-pdf')).toBe(false);
  });

  it('--no-official: no request is made, bundled fixtures are still matched', async () => {
    const transport: Transport = { mode: 'fixture', get: vi.fn(async (key: ResourceKey) => { throw new FixtureMissing(key); }) };
    const rec = makeCtx({ transport, official: false });
    const res = await stepOfficial(rec.ctx, games);
    expect(transport.get).not.toHaveBeenCalled();
    expect(res.games.filter((g) => g.official?.source === 'bval-docx')).toHaveLength(60);
    expect(rec.sources.filter((r) => r.status === 'skipped').map((r) => r.kind)).toEqual([
      'official-schedule', 'official-schedule', 'standings-index',
      'official-revision-check', 'official-revision-check', 'official-revision-check', 'official-revision-check', 'official-revision-check',
    ]);
  });
});
