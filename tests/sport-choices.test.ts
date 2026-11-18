/**
 * Every choice among sports names every sport (docs/MULTI-SPORT.md, "The seam"), so adding a sport to SPORT_IDS
 * cannot leave a choice silently falling into another sport's value.
 *
 * - A choice of a value is `bySport({...})` (lib/sports/current.ts): its record must name every SportId, which the
 *   type checker holds. A multi-way chain of the IS_* flags (`IS_A ? a : IS_B ? b : c`) is not allowed, because its
 *   last branch is whatever sport no flag named.
 * - A choice of a bundled data file stays a literal `process.env.SCVAL_SPORT` chain, which the bundler folds so the
 *   other sports' files stay out of a build (scripts/assert-budgets.ts). Each such chain must compare every sport but
 *   field hockey, the default, in that order of branches, and each branch must take its own sport's import.
 * - Every sport's data is under data/<sport>/; data/ itself holds only those folders and the cross-sport player
 *   registry (lib/players/registry-file.ts).
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { PLAYER_IDENTITY_FILE, PLAYERS_FILE } from '../lib/players/registry-file';
import { DATA_DIR, SPORT_ID, SPORT_IDS, type SportId } from '../lib/sports/current';
import { REPO } from './helpers';

const ROOTS = ['lib', 'components', 'app', 'scripts'];

const SOURCES: ReadonlyArray<{ file: string; text: string }> = ROOTS.flatMap((root) =>
  (readdirSync(path.join(REPO, root), { recursive: true }) as string[])
    .filter((f) => /\.(ts|tsx|mts|mjs)$/.test(f) && !f.endsWith('.d.json.ts'))
    .map((f) => {
      const file = `${root}/${f.split(path.sep).join('/')}`;
      return { file, text: readFileSync(path.join(REPO, file), 'utf8') };
    }),
);

/** The source without comments, so a chain quoted in a comment is not read as code. */
const code = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

/** 'volleyball' → 'Volleyball', 'field-hockey' → 'FieldHockey': the suffix of a sport's bundled import. */
const suffix = (sport: SportId): string => sport.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');

const OTHER_SPORTS = SPORT_IDS.filter((s) => s !== 'field-hockey');

describe('choices among sports', () => {
  it('no multi-way chain of the IS_* flags (use bySport)', () => {
    const chains = SOURCES.flatMap(({ file, text }) =>
      [...code(text).matchAll(/\bIS_[A-Z_]+\s*\?[^;]*?:\s*IS_[A-Z_]+\s*\?/g)].map((m) => `${file}: ${m[0].replace(/\s+/g, ' ').slice(0, 120)}`),
    );
    expect(chains).toEqual([]);
  });

  const chains = SOURCES.flatMap(({ file, text }) =>
    [...code(text).matchAll(/=\s*(process\.env\.SCVAL_SPORT === '[^']+' \? \w+ :[^;]*);/g)]
      .map((m) => ({ file, chain: m[1] })),
  );

  it('finds the bundled-data chains', () => {
    // lib/data.ts alone holds two; every loader of a per-sport file holds at least one.
    expect(chains.length).toBeGreaterThanOrEqual(20);
  });

  it.each(chains.map((c) => [c.file, c.chain] as const))('%s: names every sport, each branch its own file', (_file, chain) => {
    const branches = [...chain.matchAll(/process\.env\.SCVAL_SPORT === '([^']+)' \? (\w+) :/g)].map((m) => ({ sport: m[1], value: m[2] }));
    expect([...branches.map((b) => b.sport)].sort()).toEqual([...OTHER_SPORTS].sort());
    for (const b of branches) expect(b.value.endsWith(suffix(b.sport as SportId)), `${b.sport} → ${b.value}`).toBe(true);
    const last = chain.slice(chain.lastIndexOf(':') + 1).trim();
    expect(last.endsWith(suffix('field-hockey')), `the default → ${last}`).toBe(true);
  });
});

describe('data/<sport>/', () => {
  it('DATA_DIR is data/<sport>', () => {
    expect(DATA_DIR).toBe(`data/${SPORT_ID}`);
  });

  it('data/ holds one folder per sport and the cross-sport player registry, nothing else', () => {
    const entries = readdirSync(path.join(REPO, 'data')).sort();
    expect(entries).toEqual([...SPORT_IDS, path.basename(PLAYER_IDENTITY_FILE), path.basename(PLAYERS_FILE)].sort());
    expect(path.dirname(PLAYERS_FILE)).toBe('data');
    expect(path.dirname(PLAYER_IDENTITY_FILE)).toBe('data');
  });
});
