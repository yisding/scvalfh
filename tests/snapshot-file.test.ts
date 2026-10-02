/**
 * The COMMITTED data/snapshot.json, as it stands on disk.
 *
 * Every other suite builds a snapshot from the offline fixtures, so nothing else looks at the file
 * the site actually renders and the cron actually commits. This one does, which makes `pnpm test` a
 * real gate in `.github/workflows/update-data.yml`: the workflow fetches, then tests, then commits.
 *
 * Assertions are STRUCTURAL only — counts change every night, so asserting them would fail daily.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseSnapshot, snapshotContentHash } from '../lib/snapshot-schema';
import { getTeamBySlug } from '../lib/teams';
import type { Snapshot } from '../lib/types';
import { REPO } from './helpers';

const SNAPSHOT_PATH = path.join(REPO, 'data', 'snapshot.json');
const META_PATH = path.join(REPO, 'data', 'snapshot.meta.json');
const present = existsSync(SNAPSHOT_PATH);

// A fresh clone before the first `pnpm fetch-data` has no snapshot; that is not a failure.
const describeIfPresent = present ? describe : describe.skip;

let snapshot: Snapshot;
if (present) {
  snapshot = parseSnapshot(JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')) as unknown);
}

describeIfPresent('the committed snapshot', () => {
  it('passes the zod contract', () => {
    expect(snapshot.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(snapshot.season.year).toBe('26-27');
    expect(snapshot.teams).toHaveLength(15);
    expect(snapshot.standings).toHaveLength(15);
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
   * and one pointless hosting rebuild — the same symptom as a hash that moves on a timestamp. It
   * went stale once already, when `snapshotContentHash` was taught to strip `sbliveFetchedAt` and
   * the number the file carried was still the old function's.
   */
  it('publishes a meta contentHash that still describes this snapshot', () => {
    if (!existsSync(META_PATH)) return;
    const meta = JSON.parse(readFileSync(META_PATH, 'utf8')) as { contentHash?: string };
    expect(meta.contentHash).toBe(snapshotContentHash(snapshot));
  });

  it('keeps counts in step with the arrays', () => {
    expect(snapshot.counts.games).toBe(snapshot.games.length);
    expect(snapshot.counts.finals).toBe(snapshot.games.filter((g) => g.status === 'final').length);
    expect(snapshot.counts.leagueGames).toBe(snapshot.games.filter((g) => g.isLeague).length);
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

describeIfPresent('the committed snapshot: SBLive score cross-check', () => {
  it('never lets a conflict overwrite MaxPreps', () => {
    const x = snapshot.sbliveCrossCheck;
    if (!x) return;
    expect(x.compared).toBeGreaterThanOrEqual(x.agreements + x.conflicts.length);
    for (const row of x.conflicts) {
      const game = snapshot.games.find((g) => g.contestId === row.contestId);
      expect(game, row.contestId).toBeDefined();
      // The published numbers are MaxPreps', not SBLive's.
      expect(game?.home.score).toBe(row.maxpreps.home);
      expect(game?.away.score).toBe(row.maxpreps.away);
      expect(game?.provenance.scoreConflict?.sblive).toEqual(row.sblive);
      expect(row.maxpreps).not.toEqual(row.sblive);
    }
  });

  it('never backfills a score that only SBLive has', () => {
    const x = snapshot.sbliveCrossCheck;
    if (!x) return;
    for (const row of x.sbliveOnlyScored) {
      const game = snapshot.games.find((g) => g.contestId === row.contestId);
      expect(game, row.contestId).toBeDefined();
      expect(game?.status).not.toBe('final');
      expect(game?.home.score).toBeNull();
      expect(game?.away.score).toBeNull();
    }
  });

  it('puts a scoreConflict on a game only when the cross-check reported one', () => {
    const x = snapshot.sbliveCrossCheck;
    if (!x) return;
    const reported = new Set([
      ...x.conflicts.map((c) => c.contestId),
      ...x.sbliveOnlyScored.map((c) => c.contestId),
    ]);
    for (const g of snapshot.games) {
      if (g.provenance.scoreConflict) expect(reported.has(g.contestId), g.contestId).toBe(true);
    }
  });
});

describeIfPresent('the committed snapshot: official SCVAL fixtures', () => {
  it('names real teams and real dates', () => {
    for (const f of snapshot.officialFixtures ?? []) {
      expect(f.source).toBe('scval-pdf');
      expect(f.dateKey).toMatch(/^2026-(09|10)-\d{2}$/);
      for (const slug of [f.awaySlug, f.homeSlug]) {
        if (slug !== null) expect(getTeamBySlug(slug), slug).toBeDefined();
      }
      expect(f.awaySlug).not.toBe(f.homeSlug);
    }
  });

  it('attaches game.official only with a well-formed official date', () => {
    for (const g of snapshot.games) {
      if (!g.official) continue;
      expect(g.official.source).toBe('scval-pdf');
      expect(g.official.scheduledDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  /**
   * The team PAIR, not the pair-on-that-date. A rescheduled leg is matched by pair alone (see
   * `RESCHEDULE_WINDOW_DAYS`), so a fixture whose own date is empty can still be the same game as
   * a contest a month later — which is exactly how a too-narrow reschedule window escaped this
   * gate once: the Sep 9 grid slot for ST. IGNATIUS @ LOS ALTOS was published as unplayed while
   * the site listed the contest on Oct 8. Asserting on the date alone could not see it.
   */
  it('marks every unmatched fixture as one whose TEAMS never meet in the snapshot', () => {
    const fixtures = snapshot.officialFixtures ?? [];
    if (fixtures.length === 0) return;
    const pairs = new Map<string, string[]>();
    for (const g of snapshot.games) {
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

describeIfPresent('the committed snapshot: playoffs', () => {
  it('keeps the by-law dates and does not claim a published bracket without evidence', () => {
    expect(snapshot.playoffs.keyDates.quarterfinals).toBe('2026-11-07');
    expect(snapshot.playoffs.keyDates.crossover).toBe('2026-10-30');
    expect(snapshot.playoffs.format.autoQualifiers.scval).toBe(7);
    if (!snapshot.playoffs.bracketPublished) expect(snapshot.playoffs.games).toEqual([]);
  });

  it('only carries a CCS calendar once the season gate has opened', () => {
    if (!snapshot.playoffs.ccsCalendar) return;
    expect(snapshot.playoffs.ccsCalendar.length).toBeGreaterThan(0);
    expect(snapshot.playoffs.ccsCalendar.every((e) => /^2026-\d{2}-\d{2}$/.test(e.date))).toBe(true);
  });
});
