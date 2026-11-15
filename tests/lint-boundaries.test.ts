/**
 * The layer zones in eslint.config.mjs fire. Flat-config blocks replace, rather than merge, a rule's
 * options, so a zone that matches the wrong files (or is overridden by a later block) fails silently;
 * this lints one-line snippets as if they lived at a given path (nothing is written) and checks each
 * zone reports its ban, and that the one site-safe build-only module, lib/crosscheck/cifss-notes, is
 * still allowed.
 */
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

import { REPO } from './helpers';

const eslint = new ESLint({ cwd: REPO });

async function restrictedImports(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(`${code}\nexport default x;\n`, { filePath });
  return result.messages.filter((m) => m.ruleId === 'no-restricted-imports').map((m) => m.message);
}

describe('lint layer zones (eslint.config.mjs)', () => {
  it('lib/sources must not import the pipeline', async () => {
    const errors = await restrictedImports(`import x from '../pipeline/contract';`, 'lib/sources/x.ts');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/lib\/sources is an adapter/);
  });

  it('lib/crosscheck must not import the pipeline', async () => {
    expect(await restrictedImports(`import x from '../pipeline/run';`, 'lib/crosscheck/x.ts')).toHaveLength(1);
  });

  it('lib/ must not import components/', async () => {
    const errors = await restrictedImports(`import x from '../components/ui/ResultChip';`, 'lib/x.ts');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/lib\/ is the shared core/);
  });

  it('lib/sources keeps the general lib/ bans', async () => {
    expect(await restrictedImports(`import x from '../../components/ui/ResultChip';`, 'lib/sources/x.ts')).toHaveLength(1);
  });

  it('components/ must not import the build-only pipeline', async () => {
    const errors = await restrictedImports(`import x from '../../lib/pipeline/run';`, 'components/x/y.ts');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/build-only/);
  });

  it('components/ may import lib/crosscheck/cifss-notes, and no other lib/crosscheck module', async () => {
    expect(await restrictedImports(`import x from '../../lib/crosscheck/cifss-notes';`, 'components/x/y.ts')).toEqual([]);
    expect(await restrictedImports(`import x from '../../lib/crosscheck/backfill';`, 'components/x/y.ts')).toHaveLength(1);
  });

  it('scripts/ must not import tests/', async () => {
    expect(await restrictedImports(`import x from '../tests/helpers';`, 'scripts/x.ts')).toHaveLength(1);
  });

  it('the rule modules lib/claims calls must not import lib/claims', async () => {
    for (const dir of ['sources', 'crosscheck', 'official', 'results', 'postseason']) {
      const errors = await restrictedImports(`import x from '../claims/store';`, `lib/${dir}/x.ts`);
      expect(errors, dir).toHaveLength(1);
      expect(errors[0], dir).toMatch(/must not depend on it/);
    }
  });

  it('lib/results and lib/postseason keep the general lib/ bans', async () => {
    expect(await restrictedImports(`import x from '../../components/ui/ResultChip';`, 'lib/results/x.ts')).toHaveLength(1);
    expect(await restrictedImports(`import x from '@/lib/format';`, 'lib/postseason/x.ts')).toHaveLength(1);
  });

  it('lib/claims must not import the pipeline, but may import its contract and its normalize functions', async () => {
    const errors = await restrictedImports(`import x from '../pipeline/run';`, 'lib/claims/x.ts');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/lib\/claims must not depend on lib\/pipeline/);
    expect(await restrictedImports(`import x from '../../pipeline/ledger';`, 'lib/claims/sources/x.ts')).toHaveLength(1);
    expect(await restrictedImports(`import x from '../pipeline/contract';`, 'lib/claims/x.ts')).toEqual([]);
    expect(await restrictedImports(`import x from '../../pipeline/normalize';`, 'lib/claims/sources/x.ts')).toEqual([]);
  });

  it('lib/claims must not import lib/data.ts or the site', async () => {
    expect(await restrictedImports(`import x from '../data';`, 'lib/claims/x.ts')).toHaveLength(1);
    expect(await restrictedImports(`import x from '../../components/ui/ResultChip';`, 'lib/claims/x.ts')).toHaveLength(1);
  });

  it('components/ and app/ must not import lib/claims', async () => {
    const errors = await restrictedImports(`import x from '../../lib/claims/file';`, 'components/x/y.ts');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/lib\/claims is build-only/);
    expect(await restrictedImports(`import x from '@/lib/claims/types';`, 'app/x/page.tsx')).toHaveLength(1);
  });

  it('lib/pipeline may import lib/claims', async () => {
    expect(await restrictedImports(`import x from '../claims/store';`, 'lib/pipeline/x.ts')).toEqual([]);
  });
});
