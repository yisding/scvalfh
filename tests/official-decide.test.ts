/**
 * lib/official/match.ts split into `decideOfficialMatches` (cross-game) and `applyOfficialDecision` (per game).
 *
 * `matchOfficialFixtures` stays the oracle: on the corpora tests/official-match.test.ts uses (the all-2026-10-02
 * corpus through BVAL, PCAL and MCAL; the Stage-0 SCVAL corpus through the legacy matcher) and on its synthetic
 * cases, applying each game's decision over the decide result gives the same games, in the same order, with the
 * same key order and the same untouched objects. Decide changes no input game.
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
 * Decide, then apply per game, checked against `matchOfficialFixtures` on the same input: the games deeply and in
 * order (key order included, since the snapshot is serialized JSON), which games are returned untouched, every
 * other field of the result, and that decide left the input games as they were.
 */
function expectComposes(games: readonly Game[], fixtures: readonly OfficialFixture[], opts: MatchOptions): Game[] {
  const before = structuredClone(games);
  const decisions = decideOfficialMatches(games, fixtures, opts);
  expect(games).toStrictEqual(before);

  const applied = games.map((g) => applyOfficialDecision(g, officialDecisionOf(decisions, g.contestId)));
  const expected = matchOfficialFixtures(games, fixtures, opts);

  expect(applied).toStrictEqual(expected.games);
  expect(JSON.stringify(applied)).toBe(JSON.stringify(expected.games));
  expect(applied.map((g, i) => g === games[i])).toEqual(expected.games.map((g, i) => g === games[i]));
  for (const [i, g] of games.entries()) {
    if (officialDecisionOf(decisions, g.contestId) === undefined) expect(applied[i]).toBe(g);
  }
  const { stamps, classificationNotes, ...rest } = decisions;
  expect(rest).toStrictEqual({
    unmatched: expected.unmatched,
    warnings: expected.warnings,
    reasons: expected.reasons,
    matched: expected.matched,
    leagueDisagreements: expected.leagueDisagreements,
  });
  expect(stamps.size).toBe(expected.matched);
  for (const id of classificationNotes.keys()) expect(stamps.has(id)).toBe(false);
  return expected.games;
}

describe('decide + apply equals matchOfficialFixtures on the corpora', () => {
  it('the all-2026-10-02 corpus through BVAL, PCAL and MCAL (two-phase), each league on the previous one’s output', () => {
    let games = corpusGames();
    let stamped = 0;
    for (const league of ['bval', 'pcal', 'mcal'] as const) {
      games = expectComposes(games, loadBundledFixtures(league), optionsFor(league));
      stamped = games.filter((g) => g.official).length;
    }
    expect(stamped).toBe(60 + 34 + 72);
  });

  it('the Stage-0 SCVAL corpus through the legacy matcher', () => {
    const { games, fixtures } = scvalCorpus();
    const out = expectComposes(games, fixtures, optionsFor('scval', undefined));
    expect(out.some((g) => g.official)).toBe(true);
    expect(decideOfficialMatches(games, fixtures, optionsFor('scval', undefined)).classificationNotes.size).toBe(0);
  });
});

describe('decide + apply equals matchOfficialFixtures on the synthetic cases', () => {
  const legs = [fx('mt-hamilton', '2026-09-17', 'leigh', 'gilroy'), fx('mt-hamilton', '2026-10-06', 'gilroy', 'leigh')];
  const leg1 = game({ home: 'gilroy', away: 'leigh', hs: 1, as: 0, date: '2026-09-17', official: null });
  const leg2 = game({ home: 'leigh', away: 'gilroy', hs: 1, as: 0, date: '2026-10-06', official: null });

  it('a classification note, a pending game and a postseason game', () => {
    const friendly = game({ home: 'leigh', away: 'gilroy', hs: 3, as: 0, date: '2026-08-28', league: false, official: null });
    const ccs = game({ home: 'leigh', away: 'gilroy', hs: 3, as: 0, date: '2026-11-07', contestTypes: { home: 4, away: 4 }, official: null });
    const pending = game({ home: 'leigh', away: 'gilroy', date: '2026-08-29', league: false, official: null });
    expectComposes([leg1, leg2, friendly, ccs, pending], legs, optionsFor('bval'));
    const d = decideOfficialMatches([leg1, leg2, friendly], legs, optionsFor('bval'));
    expect(officialDecisionOf(d, friendly.contestId)).toEqual({ classificationNote: 'Not on the official BVAL schedule; not counted.' });
  });

  it('a host swap, a rescheduled leg and an excluded contest (two-phase)', () => {
    const swapped = game({ home: 'leigh', away: 'gilroy', hs: 1, as: 0, date: '2026-09-17', league: false, official: null });
    const moved = game({ home: 'leigh', away: 'gilroy', hs: 2, as: 1, date: '2026-09-28', official: null });
    const neutral = game({
      home: 'gilroy', away: 'leland', hs: 2, as: 0, date: '2026-09-17', league: false, contestTypes: { home: 2, away: 2 }, official: null,
    });
    expectComposes([swapped, moved, neutral], [...legs, fx('mt-hamilton', '2026-09-17', 'leland', 'gilroy')], optionsFor('bval'));
    const d = decideOfficialMatches([swapped], legs, optionsFor('bval'));
    expect(d.stamps.get(swapped.contestId)).toMatchObject({
      stamp: { pass: 'same-date-swapped' },
      hostNote: expect.stringMatching(/^the official BVAL schedule has Gilroy hosting/) as unknown,
      leagueFlagNote: expect.stringMatching(/MaxPreps flags it non-league$/) as unknown,
    });
  });

  it('a moved leg MaxPreps also hosts the other way round (legacy)', () => {
    const first = fx('de-anza', '2026-09-09', 'homestead', 'cupertino');
    const second = fx('de-anza', '2026-10-05', 'cupertino', 'homestead');
    const moved = game({ home: 'homestead', away: 'cupertino', hs: 5, as: 5, date: '2026-09-11', official: null });
    const other = game({ home: 'saratoga', away: 'cupertino', hs: 1, as: 0, date: '2026-09-11', official: null });
    expectComposes([other, moved], [first, second], optionsFor('scval', undefined));
  });

  it('keeps a league-flag conflict MaxPreps already published', () => {
    const own = { ...leg1, isLeague: false, provenance: { ...leg1.provenance, leagueFlagConflict: 'from MaxPreps' } };
    const out = expectComposes([own, leg2], legs, optionsFor('bval'));
    expect(out[0].provenance.leagueFlagConflict).toBe('from MaxPreps');
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
