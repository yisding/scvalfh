/**
 * The COMMITTED data/snapshot.json, as it stands on disk, read the way the site reads it: through
 * `loadSnapshot` (loadSnapshot would migrate a v1 file in memory; the committed file is v2).
 *
 * Every other suite builds its own snapshot, so nothing else looks at the file the site actually
 * renders and the cron actually commits. This one does, which makes `pnpm test` a real gate in
 * `.github/workflows/update-data.yml`: the workflow fetches, then tests, then commits.
 *
 * Assertions are STRUCTURAL only — counts change every night, so asserting them would fail daily.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { LEAGUES } from '../lib/leagues';
import { officialDocumentOf } from '../lib/official/schema';
import { SNAPSHOT_MAX_BYTES, SNAPSHOT_WARN_BYTES, SOURCES_MAX, budgetLabel } from '../lib/pipeline/steps/assemble';
import { loadSnapshot, snapshotContentHash } from '../lib/snapshot-schema';
import { TEAMS, getTeamBySlug } from '../lib/teams';
import type { Snapshot } from '../lib/types';
import { REPO } from './helpers';

const SNAPSHOT_PATH = path.join(REPO, 'data', 'snapshot.json');
const META_PATH = path.join(REPO, 'data', 'snapshot.meta.json');
const present = existsSync(SNAPSHOT_PATH);

// A fresh clone before the first `pnpm fetch-data` has no snapshot; that is not a failure.
const describeIfPresent = present ? describe : describe.skip;

let raw: unknown;
let snapshot: Snapshot;
if (present) {
  raw = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')) as unknown;
  snapshot = loadSnapshot(raw);
}

// The budgets were raised deliberately for the Southern California amendment (DESIGN-socal §2.2): a
// change to them is a decision, so it is pinned here, with the labels printed from the constants.
describe('the snapshot budgets', () => {
  it('are 3.2 MB (warn 2.4 MB) and 280 source rows', () => {
    expect([SNAPSHOT_MAX_BYTES, SNAPSHOT_WARN_BYTES, SOURCES_MAX]).toEqual([3_200_000, 2_400_000, 280]);
    expect([budgetLabel(SNAPSHOT_MAX_BYTES), budgetLabel(SNAPSHOT_WARN_BYTES), budgetLabel(1_600_000)]).toEqual([
      '3.2 MB',
      '2.4 MB',
      '1.6 MB',
    ]);
  });
});

describeIfPresent('the committed snapshot', () => {
  it('loads through loadSnapshot as schema version 2 with the whole registry', () => {
    expect(snapshot.schemaVersion).toBe(2);
    expect(snapshot.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(snapshot.season.year).toBe('26-27');
    expect(snapshot.teams).toHaveLength(TEAMS.length);
    expect(snapshot.standings).toHaveLength(TEAMS.length);
    expect(snapshot.leagueHealth.map((h) => h.leagueId)).toEqual(LEAGUES.map((l) => l.id));
  });

  it(`stays within the ${budgetLabel(SNAPSHOT_MAX_BYTES)} budget`, () => {
    expect(statSync(SNAPSHOT_PATH).size).toBeLessThanOrEqual(SNAPSHOT_MAX_BYTES);
  });

  it(`stays within the ${SOURCES_MAX}-row sources budget`, () => {
    expect(snapshot.sources.length).toBeLessThanOrEqual(SOURCES_MAX);
  });

  it('never renders a scoreline for a game that is not final', () => {
    for (const g of snapshot.games) {
      if (g.status === 'final') {
        expect(g.home.score, g.contestId).not.toBeNull();
        expect(g.away.score, g.contestId).not.toBeNull();
      } else {
        expect(`${g.home.score}-${g.away.score}`, g.contestId).toBe('null-null');
      }
    }
  });

  /**
   * The cron's "commit only if the content changed" gate compares the fresh run's hash against
   * `HEAD:data/snapshot.meta.json`'s `contentHash` (.github/workflows/update-data.yml). A committed
   * figure that does not describe the committed snapshot therefore guarantees one no-change commit
   * and one pointless hosting rebuild. The hash is over the file as written (v1 or v2), not over
   * the in-memory migration.
   */
  it('publishes a meta contentHash that still describes this file', () => {
    if (!existsSync(META_PATH)) return;
    const meta = JSON.parse(readFileSync(META_PATH, 'utf8')) as { contentHash?: string };
    expect(meta.contentHash).toBe(snapshotContentHash(raw as Snapshot));
  });

  it('keeps counts in step with the arrays', () => {
    expect(snapshot.counts.teams).toBe(snapshot.teams.length);
    expect(snapshot.counts.games).toBe(snapshot.games.length);
    expect(snapshot.counts.finals).toBe(snapshot.games.filter((g) => g.status === 'final').length);
    expect(snapshot.counts.leagueGames).toBe(snapshot.games.filter((g) => g.countsFor !== null).length);
    // stableStringify sorts keys on disk, so compare as a set rather than in config order.
    expect([...Object.keys(snapshot.counts.byLeague)].sort()).toEqual(LEAGUES.map((l) => l.id).sort());
  });

  it('gives SCVAL real counted finals', () => {
    const scval = snapshot.leagueHealth.find((h) => h.leagueId === 'scval')!;
    expect(scval.divisions.reduce((n, d) => n + d.countedFinals, 0)).toBeGreaterThan(0);
  });

  it('has one source row per request and no unexplained failures', () => {
    expect(snapshot.sources.length).toBeGreaterThan(20);
    for (const s of snapshot.sources) {
      expect(s.url.length, s.label).toBeGreaterThan(0);
      if (s.status === 'error' || s.status === 'stale' || s.status === 'skipped') {
        // A row that is not ok must say why, so /about can print it.
        expect(s.error, `${s.label} has no error text`).toBeTruthy();
      }
    }
  });
});

describeIfPresent('the committed snapshot: si.com score cross-check (owner decision D2)', () => {
  it('never lets a plain disagreement overwrite MaxPreps (rule 5)', () => {
    const x = snapshot.sbliveCrossCheck;
    if (!x) return;
    expect(x.compared).toBeGreaterThanOrEqual(x.agreements + x.conflicts.length);
    for (const row of x.conflicts) {
      const game = snapshot.games.find((g) => g.contestId === row.contestId);
      expect(game, row.contestId).toBeDefined();
      expect(game?.home.score).toBe(row.maxpreps.home);
      expect(game?.away.score).toBe(row.maxpreps.away);
      expect(game?.provenance.scores).not.toBe('sblive');
      expect(row.maxpreps).not.toEqual(row.sblive);
    }
  });

  it('publishes a si.com score exactly where the backfill report says it did (rules 2-4)', () => {
    const x = snapshot.sbliveCrossCheck;
    if (!x) return;
    for (const row of x.backfilled) {
      const game = snapshot.games.find((g) => g.contestId === row.contestId);
      expect(game, row.contestId).toBeDefined();
      expect(game?.status).toBe('final');
      expect(game?.provenance.scores).toBe('sblive');
      expect(game?.provenance.backfill?.rule).toBe(row.rule);
      expect({ home: game?.home.score, away: game?.away.score }).toEqual(row.sblive);
    }
    const reported = new Set(x.backfilled.map((r) => r.contestId));
    for (const g of snapshot.games) {
      if (g.provenance.scores === 'sblive') expect(reported.has(g.contestId), g.contestId).toBe(true);
    }
  });

  it('a si.com-only score D2 did not publish is not on the game', () => {
    const x = snapshot.sbliveCrossCheck;
    if (!x) return;
    for (const row of x.sbliveOnlyScored) {
      const game = snapshot.games.find((g) => g.contestId === row.contestId);
      if (!game) continue;
      expect(game.provenance.scores, row.contestId).not.toBe('sblive');
      if (game.status !== 'final') {
        expect(game.home.score).toBeNull();
        expect(game.away.score).toBeNull();
      }
    }
  });

  it('puts a scoreConflict on a game only when the cross-check reported one', () => {
    const x = snapshot.sbliveCrossCheck;
    if (!x) return;
    const reported = new Set([
      ...x.conflicts.map((c) => c.contestId),
      ...x.sbliveOnlyScored.map((c) => c.contestId),
      ...x.backfilled.map((c) => c.contestId),
    ]);
    for (const g of snapshot.games) {
      if (g.provenance.scoreConflict) expect(reported.has(g.contestId), g.contestId).toBe(true);
    }
  });
});

describeIfPresent('the committed snapshot: official fixtures', () => {
  it('names real teams of the fixture’s division and real dates', () => {
    for (const f of snapshot.officialFixtures ?? []) {
      expect(f.source).toBe(officialDocumentOf(f.division).source);
      expect(f.dateKey).toMatch(/^2026-(08|09|10)-\d{2}$/);
      for (const slug of [f.awaySlug, f.homeSlug]) {
        if (slug !== null) expect(getTeamBySlug(slug)?.division, slug).toBe(f.division);
      }
      expect(f.awaySlug).not.toBe(f.homeSlug);
    }
  });

  it('attaches game.official only with a well-formed official stamp', () => {
    for (const g of snapshot.games) {
      if (!g.official) continue;
      expect(g.official.source).toBe(officialDocumentOf(g.official.division).source);
      expect(g.official.scheduledDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  /**
   * SCVAL's legacy matcher matches a rescheduled leg by PAIR, so an unmatched SCVAL fixture is
   * one whose teams never meet in the snapshot at all. This is exactly how a too-narrow reschedule
   * window escaped this gate once: the Sep 9 grid slot for ST. IGNATIUS @ LOS ALTOS was published
   * as unplayed while the site listed the contest on Oct 8. (The two-phase matcher of the other
   * leagues matches legs one by one, so this property is SCVAL's.)
   *
   * "Meet" means a game not already matched to another fixture: the two legs of a round robin are
   * two fixtures, and a pair whose second leg was played on its grid date (matched, `official` set)
   * while the first leg is postponed with no make-up date yet does meet in the snapshot — once — and
   * still leaves the first fixture unmatched honestly (Homestead and Cupertino on 2026-10-05, the
   * Sep 9 leg unplayed). Only a game with NO official stamp could have matched the fixture by pair.
   */
  it('marks every unmatched SCVAL fixture as one whose TEAMS never meet in the snapshot', () => {
    const fixtures = (snapshot.officialFixtures ?? []).filter((f) => f.league === 'scval');
    if (fixtures.length === 0) return;
    const pairs = new Map<string, string[]>();
    for (const g of snapshot.games) {
      if (g.official) continue;
      const key = [g.home.slug, g.away.slug].sort().join('~');
      const list = pairs.get(key);
      const row = `${g.dateKey} ${g.away.name} @ ${g.home.name}`;
      if (list) list.push(row);
      else pairs.set(key, [row]);
    }
    for (const f of fixtures) {
      const key = [f.homeSlug, f.awaySlug].sort().join('~');
      expect(
        pairs.get(key) ?? [],
        `${f.dateKey} ${f.awayName} @ ${f.homeName} is listed as unmatched, but these teams do ` +
          `meet in the snapshot: ${(pairs.get(key) ?? []).join('; ')}`,
      ).toEqual([]);
    }
  });
});

describeIfPresent('the committed snapshot: CCS playoffs', () => {
  it('keeps the CCS dates and does not claim a published bracket without evidence', () => {
    expect(snapshot.playoffs.keyDates.quarterfinals).toBe('2026-11-07');
    expect(snapshot.playoffs.keyDates.endOfLeagueSeason).toBe('2026-10-31');
    expect(snapshot.playoffs.format.autoQualifiers.scval).toBe(7);
    expect(snapshot.playoffs.format.autoQualifiers.total).toBe(16);
    if (!snapshot.playoffs.bracketPublished) expect(snapshot.playoffs.games).toEqual([]);
  });

  it('only carries a CCS calendar once the season gate has opened', () => {
    if (!snapshot.playoffs.ccsCalendar) return;
    expect(snapshot.playoffs.ccsCalendar.length).toBeGreaterThan(0);
    expect(snapshot.playoffs.ccsCalendar.every((e) => /^2026-\d{2}-\d{2}$/.test(e.date))).toBe(true);
  });
});
