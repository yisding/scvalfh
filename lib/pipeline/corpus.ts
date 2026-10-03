/**
 * The offline corpus (SPEC §7.3): a directory with a Zod-validated `manifest.json` that maps every
 * resource key (`resourcePath(key)`) to a captured file or to an HTTP status number, plus optional
 * VARIANT overlays — directories with their own partial manifest whose entries replace or add to
 * the corpus's (a `null` entry removes one) — and an optional `previous` snapshot file.
 *
 * Node-only (reads the filesystem). Pure apart from that: no clock, no network.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

const isoStamp = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z$/, 'expected an ISO UTC stamp');
/** A file path relative to the manifest's directory, or the HTTP status the resource answers with. */
const entry = z.union([z.string().min(1), z.number().int().min(100).max(599)]);

export const ManifestSchema = z.object({
  id: z.string().min(1),
  fetchedAt: isoStamp,
  leagues: z.array(z.string().min(1)).min(1),
  note: z.string().optional(),
  files: z.record(z.string().min(1), entry),
  capturedAt: z.record(z.string().min(1), z.string()).optional(),
  /** A snapshot file (relative path) that the caller copies to `--out` before the run. */
  previous: z.string().min(1).optional(),
});
export type Manifest = z.infer<typeof ManifestSchema>;

/** A variant's manifest: every key optional; a `files` entry of `null` removes that resource. */
export const VariantManifestSchema = z.object({
  id: z.string().min(1).optional(),
  fetchedAt: isoStamp.optional(),
  leagues: z.array(z.string().min(1)).min(1).optional(),
  note: z.string().optional(),
  files: z.record(z.string().min(1), z.union([entry, z.null()])).optional(),
  capturedAt: z.record(z.string().min(1), z.string()).optional(),
  previous: z.string().min(1).optional(),
});
export type VariantManifest = z.infer<typeof VariantManifestSchema>;

export type CorpusEntry =
  | { kind: 'file'; /** Absolute path. */ file: string; capturedAt?: string }
  | { kind: 'status'; httpStatus: number };

export interface Corpus {
  /** The corpus id, with each applied variant's id appended (`all-2026-10-02+leland-feed-503`). */
  id: string;
  /** Absolute corpus directory. */
  dir: string;
  fetchedAt: string;
  leagues: string[];
  note: string | null;
  /** Keyed by `resourcePath(key)`. */
  entries: ReadonlyMap<string, CorpusEntry>;
  /** Absolute path of the previous snapshot to start from (a variant's overrides the corpus's), or null. */
  previous: string | null;
  /** Absolute variant directories, in application order. */
  variants: string[];
}

function readJson(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as unknown;
  } catch (err) {
    throw new Error(`lib/pipeline/corpus.ts: cannot read ${file}: ${(err as Error).message}`);
  }
}

function issues(err: z.ZodError): string {
  return err.issues
    .slice(0, 5)
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('; ');
}

export function readManifest(dir: string): Manifest {
  const file = path.join(dir, 'manifest.json');
  const parsed = ManifestSchema.safeParse(readJson(file));
  if (!parsed.success) throw new Error(`lib/pipeline/corpus.ts: invalid manifest ${file}: ${issues(parsed.error)}`);
  return parsed.data;
}

export function readVariantManifest(dir: string): VariantManifest {
  const file = path.join(dir, 'manifest.json');
  const parsed = VariantManifestSchema.safeParse(readJson(file));
  if (!parsed.success) throw new Error(`lib/pipeline/corpus.ts: invalid variant manifest ${file}: ${issues(parsed.error)}`);
  return parsed.data;
}

function toEntry(dir: string, value: string | number, capturedAt: string | undefined): CorpusEntry {
  if (typeof value === 'number') return { kind: 'status', httpStatus: value };
  const file = path.resolve(dir, value);
  return capturedAt ? { kind: 'file', file, capturedAt } : { kind: 'file', file };
}

/**
 * Load a corpus and apply its variants in order. Every file a manifest names must exist (a typo in
 * a fixture would otherwise read as "not in corpus" and quietly change what a test exercises).
 */
export function loadCorpus(corpusDir: string, variants: readonly string[] = []): Corpus {
  const dir = path.resolve(corpusDir);
  const manifest = readManifest(dir);
  const entries = new Map<string, CorpusEntry>();
  for (const [key, value] of Object.entries(manifest.files)) {
    entries.set(key, toEntry(dir, value, manifest.capturedAt?.[key]));
  }
  let id = manifest.id;
  let fetchedAt = manifest.fetchedAt;
  let leagues = [...manifest.leagues];
  let note = manifest.note ?? null;
  let previous = manifest.previous ? path.resolve(dir, manifest.previous) : null;
  const applied: string[] = [];

  for (const variant of variants) {
    const vdir = path.resolve(variant);
    const v = readVariantManifest(vdir);
    for (const [key, value] of Object.entries(v.files ?? {})) {
      if (value === null) entries.delete(key);
      else entries.set(key, toEntry(vdir, value, v.capturedAt?.[key]));
    }
    id = `${id}+${v.id ?? path.basename(vdir)}`;
    if (v.fetchedAt) fetchedAt = v.fetchedAt;
    if (v.leagues) leagues = [...v.leagues];
    if (v.note) note = note ? `${note} ${v.note}` : v.note;
    if (v.previous) previous = path.resolve(vdir, v.previous);
    applied.push(vdir);
  }

  for (const [key, e] of entries) {
    if (e.kind === 'file' && !existsSync(e.file)) {
      throw new Error(`lib/pipeline/corpus.ts: ${key} names a missing file: ${e.file}`);
    }
  }
  if (previous !== null && !existsSync(previous)) {
    throw new Error(`lib/pipeline/corpus.ts: previous snapshot not found: ${previous}`);
  }

  return { id, dir, fetchedAt, leagues, note, entries, previous, variants: applied };
}
