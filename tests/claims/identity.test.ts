/**
 * Fixture ids (lib/claims/identity.ts, docs/DATA-SOURCES.md §4.2): read like a game slug, a school outside the
 * registry by its name key, a doubleheader told apart by `~2`, and minted in an order that does not depend on the order
 * the rows came in.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { claimsFileText } from '../../lib/claims/file';
import { claimsFromSnapshot } from '../../lib/claims/from-snapshot';
import { baseFixtureId, fixtureSideKey, mintFixtureId } from '../../lib/claims/identity';
import { LEDGER_VIEW, fixtureKey } from '../../lib/fixtures/ledger';
import { loadSnapshot } from '../../lib/snapshot/snapshot-load';
import type { Game, Snapshot } from '../../lib/types';
import { REPO } from '../helpers';

const committed = (): Snapshot => loadSnapshot(JSON.parse(readFileSync(path.join(REPO, 'data', 'field-hockey', 'snapshot.json'), 'utf8')) as unknown);

describe('fixture ids', () => {
  it('reads like a game slug, a school outside the registry by its name key', () => {
    expect(fixtureSideKey({ slug: 'los-gatos', name: 'Los Gatos' })).toBe('los-gatos');
    expect(fixtureSideKey({ slug: null, name: 'St. Mary’s (Stockton)' })).toBe('name:stmarysstockton');
    expect(baseFixtureId('2026-09-01', 'los-gatos', 'name:hockaday')).toBe('2026-09-01-los-gatos-at-name:hockaday');
  });

  it('a taken id gets the first free ~n suffix', () => {
    expect(mintFixtureId('a', new Set())).toBe('a');
    expect(mintFixtureId('a', new Set(['a']))).toBe('a~2');
    expect(mintFixtureId('a', new Set(['a', 'a~2', 'a~3']))).toBe('a~4');
  });

  it('a contest the ledger links takes the ledger fixture’s name', () => {
    const file = claimsFromSnapshot(committed(), LEDGER_VIEW)!;
    const [contest, fixture] = [...LEDGER_VIEW.byContest].find(([id]) => file.fixtures.some((f) => f.claims.maxpreps?.ref === id))!;
    expect(file.fixtures.find((f) => f.claims.maxpreps?.ref === contest)?.id).toBe(fixtureKey(fixture));
  });

  it('is the same whatever order the games come in, a doubleheader included', () => {
    const snapshot = committed();
    const [first] = snapshot.games;
    // A second game of the same pair on the same day, with a contest id that sorts first.
    const second: Game = { ...first, contestId: '00000000-0000-4000-8000-000000000000', slug: undefined, aliases: undefined };
    const games = [...snapshot.games, second];
    const forward = claimsFromSnapshot({ ...snapshot, games }, LEDGER_VIEW)!;
    const reversed = claimsFromSnapshot({ ...snapshot, games: [...games].reverse() }, LEDGER_VIEW)!;
    expect(claimsFileText(reversed)).toBe(claimsFileText(forward));
    const pair = forward.fixtures.filter((f) => [first.contestId, second.contestId].includes(f.claims.maxpreps?.ref ?? ''));
    expect(pair.map((f) => [f.id.endsWith('~2'), f.claims.maxpreps?.ref])).toEqual([
      [false, second.contestId],
      [true, first.contestId],
    ]);
  });
});
