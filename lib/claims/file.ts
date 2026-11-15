/**
 * The claims file on disk: where it sits beside a snapshot, and how it is written and read back.
 *
 * Written in the repo's stable JSON (lib/stable-json.ts). A claim's `seenAt`, and a fixture's published contest's, is
 * left out when it equals the file's `fetchedAt`, and a MaxPreps claim's `game.provenance.fetchedAt` is always left out
 * (it equals the claim's seenAt), so a run over unchanged upstream changes the file's stamp and nothing else. Reading
 * restores both. Node-only.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { formatIssues } from '../schema-primitives';
import { stableStringify } from '../stable-json';
import { ClaimsFileSchema } from './schema';
import type { ClaimSource, ClaimsFile, Fixture, FixtureClaims } from './types';

/**
 * The claims file beside a snapshot written to `snapshotOut`: `<dir>/claims.json` for the default `snapshot.json`
 * (data/claims.json, data/soccer/claims.json …), else `<out>.claims.json`, as the meta file is `<out>.meta.json`.
 */
export function claimsPathOf(snapshotOut: string): string {
  if (path.basename(snapshotOut) === 'snapshot.json') return path.join(path.dirname(snapshotOut), 'claims.json');
  return snapshotOut.replace(/\.json$/, '') + '.claims.json';
}

/** Over this many bytes the run warns (lib/pipeline/run.ts), as the snapshot has SNAPSHOT_MAX_BYTES. */
export const CLAIMS_WARN_BYTES = 3_000_000;

type AnyClaim = { seenAt?: string; game?: { provenance: Record<string, unknown> } };

/** Each claim of `claims`, rebuilt by `map` (a multi-claim source's list in its order). */
function mapClaims(claims: FixtureClaims, map: (source: ClaimSource, claim: AnyClaim) => AnyClaim): FixtureClaims {
  const out: Record<string, unknown> = {};
  for (const [source, v] of Object.entries(claims) as Array<[ClaimSource, AnyClaim | AnyClaim[] | undefined]>) {
    if (v === undefined) continue;
    out[source] = Array.isArray(v) ? v.map((c) => map(source, c)) : map(source, v);
  }
  return out as FixtureClaims;
}

/** The file as written: seenAt left out where it is the file's stamp, a MaxPreps game's provenance.fetchedAt left out. */
export function claimsFileOnDisk(file: ClaimsFile): unknown {
  const fixtures = file.fixtures.map((f): Fixture => ({
    ...f,
    ...(f.published ? { published: f.published.map(({ seenAt, ...p }) => (seenAt === file.fetchedAt ? p : { ...p, seenAt })) as Fixture['published'] } : {}),
    claims: mapClaims(f.claims, (source, claim) => {
      const { seenAt, ...rest } = claim;
      const out: AnyClaim = seenAt === file.fetchedAt ? rest : { ...rest, seenAt };
      if (source === 'maxpreps' && out.game) {
        const { fetchedAt: _stamp, ...provenance } = out.game.provenance;
        void _stamp;
        out.game = { ...out.game, provenance };
      }
      return out;
    }),
  }));
  return { ...file, fixtures };
}

/** A parsed file with every claim's seenAt and every MaxPreps game's provenance.fetchedAt restored. */
function claimsFileInMemory(disk: ClaimsFile): ClaimsFile {
  const fixtures = disk.fixtures.map((f): Fixture => ({
    ...f,
    ...(f.published ? { published: f.published.map((p) => ({ ...p, seenAt: p.seenAt ?? disk.fetchedAt })) } : {}),
    claims: mapClaims(f.claims, (source, claim) => {
      const seenAt = claim.seenAt ?? disk.fetchedAt;
      const out: AnyClaim = { ...claim, seenAt };
      if (source === 'maxpreps' && out.game) out.game = { ...out.game, provenance: { ...out.game.provenance, fetchedAt: seenAt } };
      return out;
    }),
  }));
  return { ...disk, fixtures };
}

/** The file's text: stable JSON of its written form. */
export function claimsFileText(file: ClaimsFile): string {
  return stableStringify(claimsFileOnDisk(file));
}

/**
 * The claims of a file's text, validated (lib/claims/schema.ts) and restored to the in-memory form; throws on
 * invalid JSON or a schema failure. The parsed JSON itself is kept, not zod's output, so nothing is dropped.
 */
export function parseClaimsText(text: string): ClaimsFile {
  const raw = JSON.parse(text) as unknown;
  const parsed = ClaimsFileSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`claims file failed validation:\n${formatIssues(parsed.error.issues)}`);
  return claimsFileInMemory(raw as ClaimsFile);
}

/** The claims at `file`, or null when it is absent or invalid (a warning says which, and why). */
export function readClaimsFile(file: string, warn: (line: string) => void = (line) => console.warn(line)): ClaimsFile | null {
  if (!existsSync(file)) return null;
  try {
    return parseClaimsText(readFileSync(file, 'utf8'));
  } catch (err) {
    warn(`WARN claims file ${file} could not be read, so it is seeded from the previous snapshot: ${(err as Error).message.split('\n').slice(0, 3).join(' ')}`);
    return null;
  }
}

export function writeClaimsFile(file: string, claims: ClaimsFile): void {
  writeFileSync(file, claimsFileText(claims), 'utf8');
}
