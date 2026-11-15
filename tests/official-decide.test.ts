/**
 * lib/official/match.ts split into `decideOfficialMatches` (cross-game) and `applyOfficialDecision` (per game).
 *
 * On the corpora tests/official-match.test.ts uses (the all-2026-10-02 corpus through BVAL, PCAL and MCAL; the
 * Stage-0 SCVAL corpus through the legacy matcher) and on its synthetic cases, the decisions are checked against
 * known values: which contests are stamped and by which pass, the counts, the notes. Decide changes no input game.
 */

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { EXCLUSIONS } from '../lib/fixtures/ledger';
import { LEAGUES, getLeague } from '../lib/leagues';
import {
  applyOfficialDecision,
  decideOfficialMatches,
  matchOfficialFixtures,
  officialDecisionOf,
  type MatchOptions,
} from '../lib/official/match';
import { loadBundledFixtures, officialDocumentOf } from '../lib/official/schema';
import { applyExclusions, normalizeGames } from '../lib/pipeline/normalize';
import { isExcludedFor } from '../lib/pipeline/steps/official';
import { ScheduleResponseSchema } from '../lib/sources/maxpreps';
import { parseSchedulePdfText } from '../lib/sources/scval-pdf';
import type { Game, LeagueId, OfficialFixture } from '../lib/types';
import { REPO, allScheduleRows, corpusDir, game } from './helpers';

const CORPUS = corpusDir('all-2026-10-02');
const FETCHED_AT = '2026-10-02T15:00:00.000Z';
const TODAY = '2026-10-02';

function corpusGames(): Game[] {
  const dir = path.join(CORPUS, 'maxpreps', 'schedule');
  const rows = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .flatMap((f) => ScheduleResponseSchema.parse(JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as unknown).data);
  return applyExclusions(normalizeGames(rows, { fetchedAt: FETCHED_AT }).games, EXCLUSIONS).games;
}

function scvalCorpus(): { games: Game[]; fixtures: OfficialFixture[] } {
  const games = normalizeGames(allScheduleRows(), { fetchedAt: '2026-09-29T15:00:00.000Z' }).games;
  const scvalFix = path.join(REPO, 'tests', 'fixtures', 'scval');
  const fixtures = [
    ...parseSchedulePdfText(readFileSync(path.join(scvalFix, 'da-pdftotext.txt'), 'utf8'), 'de-anza').fixtures,
    ...parseSchedulePdfText(readFileSync(path.join(scvalFix, 'ec-pdftotext.txt'), 'utf8'), 'el-camino').fixtures,
  ];
  return { games, fixtures };
}

const optionsFor = (league: LeagueId, today: string | undefined = TODAY): MatchOptions => ({
  matcher: getLeague(league).rules.matcher,
  isExcluded: isExcludedFor(getLeague(league)),
  rescheduleWindowDays: 14,
  ...(today !== undefined ? { today } : {}),
});

const fx = (division: string, dateKey: string, away: string, home: string): OfficialFixture => {
  const league = LEAGUES.find((l) => l.divisions.some((d) => d.id === division))!;
  const source = officialDocumentOf(division).source;
  return {
    id: `${division}:${dateKey}:${away}@${home}`, league: league.id, division, dateKey, time: null,
    awayName: away, homeName: home, awaySlug: away, homeSlug: home, source,
  };
};

/**
 * Decide, then apply per game, checking what the decision says rather than another run of the same code: decide
 * changes no input game; a game with a stamp decision comes out stamped with exactly that stamp, one with only a
 * classification note comes out with that note and no stamp from this run, and one with no decision comes out as
 * the same object; every stamp is a matched fixture; a classification note is never on a stamped contest.
 * Returns the decisions and the games they were applied to, for the caller's known-value assertions.
 */
function decideAndApply(games: readonly Game[], fixtures: readonly OfficialFixture[], opts: MatchOptions) {
  const before = structuredClone(games);
  const decisions = decideOfficialMatches(games, fixtures, opts);
  expect(games).toStrictEqual(before);

  const applied = games.map((g) => applyOfficialDecision(g, officialDecisionOf(decisions, g.contestId)));
  for (const [i, g] of games.entries()) {
    const stamp = decisions.stamps.get(g.contestId);
    const note = decisions.classificationNotes.get(g.contestId);
    if (stamp) {
      expect(applied[i].official).toStrictEqual(stamp.stamp);
      expect(note).toBeUndefined();
    } else if (note !== undefined) {
      expect(applied[i].provenance.classificationNote).toBe(note);
      expect(applied[i].official).toBe(g.official);
    } else {
      expect(applied[i]).toBe(g);
    }
  }
  const { stamps, classificationNotes } = decisions;
  expect(stamps.size).toBe(decisions.matched);
  expect(decisions.unmatched.length + decisions.matched).toBe(fixtures.length);
  for (const id of classificationNotes.keys()) expect(stamps.has(id)).toBe(false);
  return { decisions, applied };
}

const passes = (d: ReturnType<typeof decideOfficialMatches>) => {
  const out: Record<string, number> = {};
  for (const { stamp } of d.stamps.values()) out[stamp.pass] = (out[stamp.pass] ?? 0) + 1;
  return out;
};

describe('decideOfficialMatches + applyOfficialDecision on the corpora', () => {
  it('the all-2026-10-02 corpus through BVAL, PCAL and MCAL (two-phase), each league on the previous one’s output', () => {
    let games = corpusGames();
    expect(games).toHaveLength(362);
    const seen: Array<{ stamps: number; unmatched: number; warnings: number; passes: Record<string, number> }> = [];
    for (const league of ['bval', 'pcal', 'mcal'] as const) {
      const { decisions, applied } = decideAndApply(games, loadBundledFixtures(league), optionsFor(league));
      seen.push({ stamps: decisions.stamps.size, unmatched: decisions.unmatched.length, warnings: decisions.warnings.length, passes: passes(decisions) });
      expect(decisions.classificationNotes.size).toBe(0);
      if (league === 'bval') {
        // Four Prospect games the official schedule lists as league games and MaxPreps flags non-league.
        expect(decisions.leagueDisagreements).toHaveLength(4);
        expect(decisions.leagueDisagreements.every((l) => /MaxPreps flags it non-league$/.test(l))).toBe(true);
        expect(decisions.leagueDisagreements.filter((l) => l.includes('Prospect'))).toHaveLength(4);
      } else expect(decisions.leagueDisagreements).toEqual([]);
      games = applied;
    }
    expect(seen).toEqual([
      { stamps: 60, unmatched: 0, warnings: 0, passes: { 'same-date': 60 } },
      { stamps: 34, unmatched: 8, warnings: 12, passes: { 'same-date': 22, 'same-date-swapped': 4, rescheduled: 8 } },
      { stamps: 72, unmatched: 0, warnings: 7, passes: { 'same-date': 65, 'same-date-swapped': 5, rescheduled: 2 } },
    ]);
    expect(games.filter((g) => g.official)).toHaveLength(60 + 34 + 72);
  });

  it('the Stage-0 SCVAL corpus through the legacy matcher', () => {
    const { games, fixtures } = scvalCorpus();
    const { decisions, applied } = decideAndApply(games, fixtures, optionsFor('scval', undefined));
    expect(games).toHaveLength(158);
    expect(fixtures).toHaveLength(98);
    expect(decisions.stamps.size).toBe(96);
    expect(decisions.unmatched).toHaveLength(2);
    expect(decisions.warnings).toHaveLength(6);
    expect(passes(decisions)).toEqual({ 'same-date': 90, rescheduled: 4, 'same-date-swapped': 2 });
    expect(applied.filter((g) => g.official)).toHaveLength(96);
    expect(decisions.classificationNotes.size).toBe(0);
  });
});

describe('decideOfficialMatches + applyOfficialDecision on the synthetic cases', () => {
  const legs = [fx('mt-hamilton', '2026-09-17', 'leigh', 'gilroy'), fx('mt-hamilton', '2026-10-06', 'gilroy', 'leigh')];
  const leg1 = game({ home: 'gilroy', away: 'leigh', hs: 1, as: 0, date: '2026-09-17', official: null });
  const leg2 = game({ home: 'leigh', away: 'gilroy', hs: 1, as: 0, date: '2026-10-06', official: null });

  it('a classification note, a pending game and a postseason game', () => {
    const friendly = game({ home: 'leigh', away: 'gilroy', hs: 3, as: 0, date: '2026-08-28', league: false, official: null });
    const ccs = game({ home: 'leigh', away: 'gilroy', hs: 3, as: 0, date: '2026-11-07', contestTypes: { home: 4, away: 4 }, official: null });
    const pending = game({ home: 'leigh', away: 'gilroy', date: '2026-08-29', league: false, official: null });
    const { decisions, applied } = decideAndApply([leg1, leg2, friendly, ccs, pending], legs, optionsFor('bval'));
    expect([...decisions.stamps.keys()]).toEqual([leg1.contestId, leg2.contestId]);
    expect(passes(decisions)).toEqual({ 'same-date': 2 });
    // Only the finished non-league game is noted; the postseason and pending ones are left alone.
    expect([...decisions.classificationNotes]).toEqual([[friendly.contestId, 'Not on the official BVAL schedule; not counted.']]);
    expect(officialDecisionOf(decisions, friendly.contestId)).toEqual({ classificationNote: 'Not on the official BVAL schedule; not counted.' });
    expect(applied[2]).not.toBe(friendly);
    expect(applied[3]).toBe(ccs);
    expect(applied[4]).toBe(pending);
    expect(decisions.unmatched).toEqual([]);
  });

  it('a host swap, a rescheduled leg and an excluded contest (two-phase)', () => {
    const swapped = game({ home: 'leigh', away: 'gilroy', hs: 1, as: 0, date: '2026-09-17', league: false, official: null });
    const moved = game({ home: 'leigh', away: 'gilroy', hs: 2, as: 1, date: '2026-09-28', official: null });
    const neutral = game({
      home: 'gilroy', away: 'leland', hs: 2, as: 0, date: '2026-09-17', league: false, contestTypes: { home: 2, away: 2 }, official: null,
    });
    const extra = fx('mt-hamilton', '2026-09-17', 'leland', 'gilroy');
    const { decisions, applied } = decideAndApply([swapped, moved, neutral], [...legs, extra], optionsFor('bval'));
    expect([...decisions.stamps].map(([id, v]) => [id, v.stamp.pass, v.stamp.fixtureId])).toEqual([
      [swapped.contestId, 'same-date-swapped', legs[0].id],
      [moved.contestId, 'rescheduled', legs[1].id],
    ]);
    // The neutral-site contest is excluded: no decision, and its fixture is left unmatched.
    expect(officialDecisionOf(decisions, neutral.contestId)).toBeUndefined();
    expect(applied[2]).toBe(neutral);
    expect(decisions.unmatched.map((f) => f.id)).toEqual([extra.id]);
    expect(decisions.warnings).toHaveLength(3);
    expect(decisions.reasons).toHaveLength(1);
    expect(decisions.leagueDisagreements).toHaveLength(1);
    expect(decisions.stamps.get(swapped.contestId)).toMatchObject({
      stamp: { pass: 'same-date-swapped' },
      hostNote: expect.stringMatching(/^the official BVAL schedule has Gilroy hosting/) as unknown,
      leagueFlagNote: expect.stringMatching(/MaxPreps flags it non-league$/) as unknown,
    });
    expect(applied[0].provenance.hostConflict).toMatch(/^the official BVAL schedule has Gilroy hosting/);
    expect(applied[0].provenance.leagueFlagConflict).toMatch(/MaxPreps flags it non-league$/);
  });

  it('a moved leg MaxPreps also hosts the other way round (legacy)', () => {
    const first = fx('de-anza', '2026-09-09', 'homestead', 'cupertino');
    const second = fx('de-anza', '2026-10-05', 'cupertino', 'homestead');
    const moved = game({ home: 'homestead', away: 'cupertino', hs: 5, as: 5, date: '2026-09-11', official: null });
    const other = game({ home: 'saratoga', away: 'cupertino', hs: 1, as: 0, date: '2026-09-11', official: null });
    const { decisions, applied } = decideAndApply([other, moved], [first, second], optionsFor('scval', undefined));
    expect([...decisions.stamps].map(([id, v]) => [id, v.stamp.pass])).toEqual([[moved.contestId, 'rescheduled']]);
    expect(applied[0]).toBe(other);
    expect(decisions.unmatched).toHaveLength(1);
    expect(decisions.warnings).toHaveLength(1);
  });

  it('keeps a league-flag conflict MaxPreps already published', () => {
    const own = { ...leg1, isLeague: false, provenance: { ...leg1.provenance, leagueFlagConflict: 'from MaxPreps' } };
    const { decisions, applied } = decideAndApply([own, leg2], legs, optionsFor('bval'));
    expect(decisions.leagueDisagreements).toHaveLength(1);
    expect(decisions.stamps.get(own.contestId)?.leagueFlagNote).toMatch(/MaxPreps flags it non-league$/);
    expect(applied[0].provenance.leagueFlagConflict).toBe('from MaxPreps');
    expect(applied[0].official?.pass).toBe('same-date');
  });
});

describe('applyOfficialDecision', () => {
  it('returns a game with no decision as the same object', () => {
    const g = game({ home: 'gilroy', away: 'leigh', date: '2026-09-17', official: null });
    expect(applyOfficialDecision(g, undefined)).toBe(g);
    const d = decideOfficialMatches([g], [], optionsFor('bval'));
    expect(officialDecisionOf(d, g.contestId)).toBeUndefined();
    expect(matchOfficialFixtures([g], [], optionsFor('bval')).games[0]).toBe(g);
  });

  it('does not change the game it is given', () => {
    const g = game({ home: 'gilroy', away: 'leigh', hs: 1, as: 0, date: '2026-09-17', league: false, official: null });
    const before = structuredClone(g);
    const d = decideOfficialMatches([g], [fx('mt-hamilton', '2026-09-17', 'leigh', 'gilroy')], optionsFor('bval'));
    const out = applyOfficialDecision(g, officialDecisionOf(d, g.contestId));
    expect(out).not.toBe(g);
    expect(out.official?.pass).toBe('same-date');
    expect(g).toStrictEqual(before);
  });
});
