/**
 * data/ccs-bracket-2026.json and its contract, lib/ccs-bracket-schema.ts.
 *
 * The file is the owner's hand transcription of the CCS seeds from the MaxPreps tournament page once the
 * committee enters them (Mon Nov 2); this suite is what `pnpm test` runs before the file is committed, and the
 * data cron's Test step gates its own commit on the suite. The schema is proved here against a real
 * sixteen-seed field — the 2025 bracket in data/history-brackets-2025-26.json, converted by `seedsFromHistory`
 * — and refused the ways a transcription slips: a short division, a repeated school, a school of another
 * section, the committee's 9-16 grouping typed as seeds, the divisions out of order.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { CcsSeedFileSchema, type CcsSeedFile } from '../lib/ccs-bracket-schema';
import { ccsSeedOf, getCcsSeeds, seedsFromHistory } from '../lib/ccs-bracket';
import { HistoryBracketsSchema } from '../lib/history-brackets-schema';
import { CCS } from '../lib/leagues';
import { REPO } from './helpers';

const committed = JSON.parse(readFileSync(path.join(REPO, 'data', 'ccs-bracket-2026.json'), 'utf8')) as unknown;
const history = HistoryBracketsSchema.parse(
  JSON.parse(readFileSync(path.join(REPO, 'data', 'history-brackets-2025-26.json'), 'utf8')) as unknown,
);
const seeds2025 = seedsFromHistory(history.sections.ccs, '2025-26');

/** The first issue's message, for a refused file. */
function refusal(file: unknown): string {
  const result = CcsSeedFileSchema.safeParse(file);
  expect(result.success).toBe(false);
  return result.error!.issues.map((i) => i.message).join(' | ');
}

/** A valid file with one division's seeds replaced. */
function withSeeds(index: 0 | 1, seeds: CcsSeedFile['divisions'][number]['seeds']): CcsSeedFile {
  return { ...seeds2025, divisions: seeds2025.divisions.map((d, i) => (i === index ? { ...d, seeds } : d)) };
}

describe('the committed seed file', () => {
  it('is the placeholder today: it parses, and getCcsSeeds() is null', () => {
    expect(CcsSeedFileSchema.parse(committed)).toEqual({ season: '2026-27', retrievedOn: null, source: null, divisions: [] });
    expect(getCcsSeeds()).toBeNull();
  });
});

describe('the contract, against the real 2025 field', () => {
  it('accepts the 2025 bracket’s sixteen seeds converted from data/history-brackets-2025-26.json', () => {
    const parsed = CcsSeedFileSchema.parse(seeds2025);
    expect(parsed.divisions.map((d) => d.name)).toEqual(CCS.ccsDivisions.map((d) => d.name));
    expect(parsed.divisions.map((d) => d.seeds.length)).toEqual([8, 8]);
    // The 2025 seeds, as the CCS bracket pages printed them (tests/history-brackets.test.ts holds the file to them).
    expect(parsed.divisions[0].seeds.map((s) => s.slug)).toEqual([
      'st-ignatius', 'los-gatos', 'leigh', 'saint-francis', 'gilroy', 'mitty', 'christopher', 'palo-alto',
    ]);
    expect(parsed.divisions[1].seeds.map((s) => s.slug)).toEqual([
      'los-altos', 'stevenson', 'willow-glen', 'valley-christian', 'saratoga', 'carmel', 'presentation', 'monterey',
    ]);
    const seeds = getCcsSeeds(parsed);
    expect(seeds?.provenance).toBe('owner-file');
    expect(seeds?.source.url).toMatch(/^https:\/\//);
    expect(ccsSeedOf(seeds, 'Division 1', 'los-gatos')).toBe(2);
    expect(ccsSeedOf(seeds, 'Division 2', 'monterey')).toBe(8);
  });

  it('refuses seven seeds in a division', () => {
    expect(refusal(withSeeds(0, seeds2025.divisions[0].seeds.slice(0, 7)))).toMatch(/exactly 8 seeds/);
  });

  it('refuses a school seeded twice, across divisions too', () => {
    const [first, ...rest] = seeds2025.divisions[0].seeds;
    const twice = withSeeds(0, [first, { ...rest[0], slug: first.slug }, ...rest.slice(1)]);
    expect(refusal(twice)).toMatch(/is seeded twice/);
    const across = withSeeds(1, seeds2025.divisions[1].seeds.map((s, i) => (i === 0 ? { ...s, slug: 'los-gatos' } : s)));
    expect(refusal(across)).toMatch(/los-gatos is seeded twice/);
  });

  it('refuses a team of another section (Tamalpais, NCS)', () => {
    const tam = withSeeds(0, seeds2025.divisions[0].seeds.map((s, i) => (i === 0 ? { ...s, slug: 'tamalpais' } : s)));
    expect(refusal(tam)).toMatch(/tamalpais is not a registry team of a CCS league/);
  });

  it('refuses Division 2 numbered 9-16: MaxPreps and the CCS number each division 1-8', () => {
    const nineUp = withSeeds(1, seeds2025.divisions[1].seeds.map((s) => ({ ...s, seed: s.seed + 8 })));
    expect(refusal(nineUp)).toMatch(/numbered 1\.\.8|less than or equal to 8|<=8/);
  });

  it('refuses the divisions out of order, and a lone division', () => {
    const swapped = { ...seeds2025, divisions: [seeds2025.divisions[1], seeds2025.divisions[0]] };
    expect(refusal(swapped)).toMatch(/exactly 'Division 1', 'Division 2' in that order/);
    const lone = { ...seeds2025, divisions: [seeds2025.divisions[0]] };
    expect(refusal(lone)).toMatch(/exactly 'Division 1', 'Division 2' in that order/);
  });

  it('requires retrievedOn and source once a division is filled, and an https source', () => {
    expect(refusal({ ...seeds2025, retrievedOn: null })).toMatch(/retrievedOn and source are required/);
    expect(refusal({ ...seeds2025, source: null })).toMatch(/retrievedOn and source are required/);
    expect(refusal({ ...seeds2025, source: { label: 'x', url: 'http://www.maxpreps.com/' } })).toMatch(/https/);
  });
});
