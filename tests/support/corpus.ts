/**
 * The offline fixture corpora (tests/fixtures/maxpreps and tests/fixtures/corpus/*): where each lives,
 * the schedule and standings rows it holds, and {@link CorpusReader}, which reads one by its manifest.
 * The snapshot a corpus produces through the real cron script is tests/support/corpus-snapshot.ts.
 */

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import type { Game } from '@/lib/model/game';
import type { DivisionId, LeagueId } from '@/lib/model/ids';
import type { Snapshot } from '@/lib/model/snapshot';
import { readManifest, type Manifest } from '@/lib/pipeline/corpus';
import { TEAMS } from '@/lib/registry/teams';
import { ScheduleResponseSchema, type ScheduleRow } from '@/lib/sources/maxpreps/schemas';
import { FIXTURES_ROOT, fixturePath, readJson } from '@/tests/support/repo';

/** The original SCVAL capture directory (2026-09-29), now also the `scval` corpus (its manifest.json). */
export const FIXTURE_DIR = fixturePath('maxpreps');
export const CORPUS_ROOT = path.join(FIXTURES_ROOT, 'corpus');
export const VARIANTS_DIR = path.join(CORPUS_ROOT, 'variants');

export type CorpusName = 'scval' | 'all-2026-10-02' | 'eal-2026-10-04' | 'socal-2026-10-06';

/** The EAL-only live capture (2026-10-04): the Eastern Athletic League's schedules, standings and si.com scoreboards. */
export const EAL_CORPUS: CorpusName = 'eal-2026-10-04';

/**
 * The Southern California live capture (2026-10-06T02:33Z, the evening of Oct 5 Pacific): the Sunset
 * and the San Diego Section's City, North County and Metro conferences, read with `--leagues
 * sunset,city,north-county,metro`, so the five NorCal leagues are "not fetched in this run"
 * (tests/integration/socal.test.ts).
 */
export const SOCAL_CORPUS: CorpusName = 'socal-2026-10-06';

/** The directory of a named corpus (SPEC §7.3, §12.1). */
export function corpusDir(corpus: CorpusName): string {
  return corpus === 'scval' ? FIXTURE_DIR : path.join(CORPUS_ROOT, corpus);
}

/** A variant overlay directory by name (`leland-feed-503`), or a path as given. */
export function variantDir(variant: string): string {
  return variant.includes('/') ? path.resolve(variant) : path.join(VARIANTS_DIR, variant);
}

/** Every captured SCVAL schedule row, exactly as the 15 live requests would return them. */
export function allScheduleRows(): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  for (const file of readdirSync(FIXTURE_DIR).filter((f) => f.startsWith('sched-')).sort()) {
    rows.push(...ScheduleResponseSchema.parse(readJson(path.join(FIXTURE_DIR, file))).data);
  }
  return rows;
}

/**
 * Every schedule row of a corpus, feed by feed in registry order (optionally one league's teams
 * only), parsed but otherwise exactly as the live requests return them (TBA rows included).
 */
export function corpusRows(corpus: CorpusName, opts: { league?: LeagueId } = {}): ScheduleRow[] {
  const dir = corpusDir(corpus);
  const manifest = readManifest(dir);
  const rows: ScheduleRow[] = [];
  for (const team of TEAMS) {
    if (opts.league && team.league !== opts.league) continue;
    const file = manifest.files[`maxpreps/schedule/${team.slug}`];
    if (typeof file !== 'string') continue;
    rows.push(...ScheduleResponseSchema.parse(readJson(path.resolve(dir, file))).data);
  }
  return rows;
}

/**
 * A raw MaxPreps standings response: 'da' / 'ec' are the 2026-09-29 SCVAL captures; a division id
 * reads the all-2026-10-02 corpus.
 */
export function standingsFixture(which: DivisionId | 'da' | 'ec'): unknown {
  const file =
    which === 'da' || which === 'ec'
      ? path.join(FIXTURE_DIR, `${which}.json`)
      : path.join(corpusDir('all-2026-10-02'), 'maxpreps', 'standings', `${which}.json`);
  return readJson(file);
}

/** The first game of a snapshot whose contest id starts with `prefix`. */
export function gameOf(snapshot: Snapshot, prefix: string): Game | undefined {
  return snapshot.games.find((g) => g.contestId.startsWith(prefix));
}

/**
 * One corpus read through its manifest: `file(key)` is the path of a captured resource, `json` and
 * `text` read it, and `scheduleRows()` is every captured schedule row, one per contest. The expected
 * values in a corpus test come from these files, never from literals, so the suite follows a re-capture.
 */
export class CorpusReader {
  readonly dir: string;
  readonly manifest: Manifest;

  constructor(readonly corpus: CorpusName) {
    this.dir = corpusDir(corpus);
    this.manifest = readManifest(this.dir);
  }

  /** The corpus's own capture stamp. */
  get fetchedAt(): string {
    return this.manifest.fetchedAt;
  }

  /** Whether the manifest lists `key` as a captured file (an HTTP-status entry is not one). */
  has(key: string): boolean {
    return typeof this.manifest.files[key] === 'string';
  }

  /** The path of a corpus resource (every entry of the live corpora is a file, not an HTTP status). */
  file(key: string): string {
    const entry = this.manifest.files[key];
    if (typeof entry !== 'string') {
      throw new Error(`tests/fixtures/corpus/${this.corpus.split('-')[0]}-*/manifest.json: ${key} is not a file`);
    }
    return path.resolve(this.dir, entry);
  }

  /** The text of a corpus resource. */
  text(key: string): string {
    return readFileSync(this.file(key), 'utf8');
  }

  /** A corpus resource parsed as JSON. */
  json<T = unknown>(key: string): T {
    return readJson<T>(this.file(key));
  }

  /** Every schedule row of the corpus, one per contest (a game between two of ours is in both feeds). */
  scheduleRows(): ScheduleRow[] {
    const byId = new Map<string, ScheduleRow>();
    for (const key of Object.keys(this.manifest.files)) {
      if (!key.startsWith('maxpreps/schedule/')) continue;
      for (const row of ScheduleResponseSchema.parse(this.json(key)).data) byId.set(row.contest.contestId, row);
    }
    return [...byId.values()];
  }

  /** Whether a captured schedule row's contest id starts with `prefix`. */
  hasContest(prefix: string): boolean {
    return this.scheduleRows().some((row) => row.contest.contestId.startsWith(prefix));
  }
}
