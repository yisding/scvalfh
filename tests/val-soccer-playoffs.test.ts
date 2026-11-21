/**
 * The VAL build once its playoff schedule names teams: a playoff game is published (the page's G1 row, seeded), and the
 * pages that link a game to its bracket read it without the CCS block this build does not have (snapshot.playoffs is
 * null). The snapshot is the corpus run with the G1 row's seats filled, loaded through SCVAL_SNAPSHOT before any data
 * module is imported.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { Game } from '../lib/types';
import { REPO } from './helpers';

let g1: Game;
let bracketLink: typeof import('../components/playoffs/bracket-link');
let bracketPlace: typeof import('../components/playoffs/bracket-place');
let data: typeof import('../lib/data');

/** The corpus page with G1's seats ('4th' at home, '5th' away) filled with two teams. */
function seededPage(): string {
  const html = readFileSync(path.join(REPO, 'tests/fixtures/corpus/val-soccer-2026-11-21/teamsideline/schedule/main.html'), 'utf8');
  const g1Row = /(PlayoffGrid_ctl00_(ctl\d+)_GameLabel">G1<)/.exec(html);
  if (!g1Row) throw new Error('the corpus page has no G1 row');
  const ctl = g1Row[2];
  return html
    .replace(new RegExp(`(PlayoffGrid_ctl00_${ctl}_HomeLabel">)4th(<)`), '$1Lawson Lightning$2')
    .replace(new RegExp(`(PlayoffGrid_ctl00_${ctl}_AwayLabel">)5th(<)`), '$1Hyde Lions$2');
}

beforeAll(async () => {
  vi.stubEnv('SCVAL_SPORT', 'val-soccer');
  vi.resetModules();
  const support = await import('./pipeline/support/run-corpus');
  const variant = support.writeTempVariant({ 'teamsideline/schedule/main': { rel: 'teamsideline/schedule/main.html', body: seededPage() } });
  const { snapshot } = await support.snapshotOf({ corpus: 'val-soccer-2026-11-21', variants: [variant] });
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'scvalfh-val-')), 'snapshot.json');
  writeFileSync(file, JSON.stringify(snapshot));
  vi.stubEnv('SCVAL_SNAPSHOT', file);
  vi.resetModules();
  data = await import('../lib/data');
  bracketLink = await import('../components/playoffs/bracket-link');
  bracketPlace = await import('../components/playoffs/bracket-place');
  const found = data.getSnapshot().games.find((g) => g.contestId === 'teamsideline:731407-g1');
  if (!found) throw new Error('the seeded G1 row published no game');
  g1 = found;
}, 120_000);

describe('a VAL playoff game', () => {
  it('is published from the page’s G1 row as a league tournament game, counting for no table', () => {
    expect(g1.home.slug).toBe('lawson');
    expect(g1.away.slug).toBe('hyde');
    expect(g1.dateKey).toBe('2027-02-01');
    expect(g1.postseason?.kind).toBe('mcal-tournament');
    expect(g1.countsFor).toBeNull();
    expect(data.getSnapshot().playoffs).toBeNull();
  });

  it('links to its place in the league’s own bracket, with no CCS block to read', () => {
    expect(() => bracketLink.getBracketLink(g1)).not.toThrow();
    expect(bracketLink.getBracketLink(g1)?.href).toBe('/playoffs#val-bracket');
    expect(() => bracketPlace.getBracketPlace(g1)).not.toThrow();
  });
});
