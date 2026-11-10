/** lib/data-file.ts — the bundled-or-override read and the validation every data file goes through. */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { readOverride, validateData } from '../lib/data-file';

const VAR = 'SCVALFH_DATA_FILE_TEST';
const dir = mkdtempSync(path.join(tmpdir(), 'scvalfh-data-file-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
afterEach(() => {
  delete process.env[VAR];
});

describe('readOverride', () => {
  const bundled = { from: 'bundle' };

  it('returns the bundled value when the variable is unset or empty', () => {
    expect(readOverride('lib/x.ts', VAR, bundled)).toBe(bundled);
    process.env[VAR] = '';
    expect(readOverride('lib/x.ts', VAR, bundled)).toBe(bundled);
  });

  it('returns the named file parsed', () => {
    const file = path.join(dir, 'ok.json');
    writeFileSync(file, '{"from":"file"}');
    process.env[VAR] = file;
    expect(readOverride('lib/x.ts', VAR, bundled)).toEqual({ from: 'file' });
  });

  it('names the module, variable and path when the file is missing or not JSON', () => {
    const missing = path.join(dir, 'missing.json');
    process.env[VAR] = missing;
    expect(() => readOverride('lib/x.ts', VAR, bundled)).toThrow(`lib/x.ts: cannot read ${VAR}=${missing} (`);
    const bad = path.join(dir, 'bad.json');
    writeFileSync(bad, '{not json');
    process.env[VAR] = bad;
    expect(() => readOverride('lib/x.ts', VAR, bundled)).toThrow(`lib/x.ts: cannot read ${VAR}=${bad} (`);
  });
});

describe('validateData', () => {
  const Schema = z.object({ n: z.number() });

  it('returns the parsed value', () => {
    expect(validateData('lib/x.ts', Schema, { n: 1 })).toEqual({ n: 1 });
  });

  it('throws naming the label and failing path', () => {
    expect(() => validateData('lib/x.ts data/x.json', Schema, { n: 'one' })).toThrow(/^lib\/x\.ts data\/x\.json failed validation:\n[\s\S]*\bn\b/);
  });
});
