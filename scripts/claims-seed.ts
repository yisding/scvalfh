#!/usr/bin/env tsx
/**
 * Writes the claims file beside this sport's committed snapshot (`<DATA_DIR>/claims.json`), seeded from the
 * snapshot (lib/claims/from-snapshot.ts) and stamped with its fetchedAt, so the next scheduled run reads a claims
 * file that matches its previous snapshot. The editor's claims of the current ledger are included, as a run writes
 * them. Reads only the committed snapshot: no network.
 *
 *   pnpm tsx scripts/claims-seed.ts                          field hockey (data/claims.json)
 *   SCVAL_SPORT=basketball pnpm tsx scripts/claims-seed.ts   basketball (data/basketball/claims.json)
 *   pnpm tsx scripts/claims-seed.ts --snapshot <path>        the claims file beside another snapshot
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { runCliIfMain } from './cli';

export async function main(argv: readonly string[]): Promise<number> {
  const { DATA_DIR, SPORT_ID } = await import('../lib/sports/current');
  const { attachEditorClaims, ledgerEditor } = await import('../lib/claims/editor');
  const { claimsPathOf, writeClaimsFile } = await import('../lib/claims/file');
  const { claimsFromSnapshot } = await import('../lib/claims/from-snapshot');
  const { ClaimStore } = await import('../lib/claims/store');
  const { readPrevious } = await import('../lib/pipeline/run');

  let snapshotFile = path.join(process.cwd(), DATA_DIR, 'snapshot.json');
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--snapshot' && argv[i + 1] !== undefined) snapshotFile = path.resolve(process.cwd(), argv[(i += 1)]);
    else throw new Error(`unknown flag: ${argv[i]}`);
  }
  const previous = readPrevious(snapshotFile);
  if (!previous) throw new Error(`no snapshot to seed from at ${snapshotFile}`);
  const editor = ledgerEditor(previous.fetchedAt);
  const store = ClaimStore.fromFile(claimsFromSnapshot(previous, editor.view, editor.claims));
  attachEditorClaims(store, editor.claims);
  const claims = store.toFile(previous.fetchedAt, SPORT_ID);
  const out = claimsPathOf(snapshotFile);
  writeClaimsFile(out, claims);

  const text = readFileSync(out, 'utf8');
  const snapshotBytes = readFileSync(snapshotFile).length;
  const bytes = Buffer.byteLength(text, 'utf8');
  const reconstructed = claims.fixtures.filter((f) => f.claims.maxpreps?.reconstructed).length;
  console.log(
    `claims-seed: wrote ${path.relative(process.cwd(), out)} (${SPORT_ID}): ${claims.fixtures.length} fixtures, ` +
      `${reconstructed} with reconstructed fields · ${bytes} bytes, ${text.split('\n').length - 1} lines ` +
      `(${(bytes / snapshotBytes).toFixed(2)}× the snapshot's ${snapshotBytes} bytes)`,
  );
  return 0;
}

runCliIfMain(import.meta.url, main);
