/**
 * `pdftotext -layout` (poppler-utils) over a PDF held in memory: how the SCVAL grid PDFs
 * (lib/sources/scval/grid.ts, through LiveTransport's 'scval-pdf-text') and the 2025-26
 * end-of-season PDFs (lib/sources/scval/history.ts) become text. No binary ⇒ PdftotextMissingError,
 * which the official step reports as `skipped`, never a failure.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export class PdftotextMissingError extends Error {
  constructor() {
    super('pdftotext (poppler-utils) is not on PATH');
    this.name = 'PdftotextMissingError';
  }
}

let pdftotextChecked: boolean | null = null;

/** Cached probe so the cron only shells out once. */
export function hasPdftotext(): boolean {
  if (pdftotextChecked === null) {
    const probe = spawnSync('pdftotext', ['-v'], { stdio: 'ignore' });
    pdftotextChecked = !probe.error && (probe.status === 0 || probe.status === 99);
  }
  return pdftotextChecked;
}

/** `pdftotext -layout` over a PDF held in memory. Throws PdftotextMissingError when absent. */
export function pdfToText(bytes: Uint8Array): string {
  if (!hasPdftotext()) throw new PdftotextMissingError();
  const dir = mkdtempSync(path.join(tmpdir(), 'scvalfh-pdf-'));
  const file = path.join(dir, 'in.pdf');
  try {
    writeFileSync(file, bytes);
    return execFileSync('pdftotext', ['-layout', file, '-'], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
