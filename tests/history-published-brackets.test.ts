/**
 * The 2025-26 CCS and CIF State brackets of the soccer, basketball and volleyball archives
 * (data/<sport>/history-brackets-2025-26.json `published`): MaxPreps' tournament pages read whole once the season
 * was over (lib/history/history-brackets-schema.ts PublishedBracketsSchema), drawn on /history/2025-26 by the view
 * /playoffs draws the current season's with (components/history/PublishedBracketsBlock.tsx).
 *
 * Each file is held to the contract (one tree per division, every game decided, every winner going on), each
 * build's page opens on the CCS block, before any league, with a champion row per CCS division, and the finals a
 * reader sees first are asserted literally: this is committed data, and the page prints it.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OtherHistoryBracketsSchema } from '../lib/history/history-brackets-schema';
import { publishedChampion } from '../components/history/published-bracket-view';
import type { TournamentBracket } from '../lib/types';
import { sectionById } from '../scripts/copy-rules';
import { REPO } from './helpers';
import { textOf } from './ui/html-text';

const SPORTS = ['volleyball', 'soccer', 'basketball'] as const;
type SportId = (typeof SPORTS)[number];

function read(sport: SportId) {
  return OtherHistoryBracketsSchema.parse(
    JSON.parse(readFileSync(path.join(REPO, 'data', sport, 'history-brackets-2025-26.json'), 'utf8')),
  );
}

/** Every CCS division of the championship, in the order the page lists its champions. */
const CCS_DIVISIONS: Record<SportId, string[]> = {
  volleyball: ['Open Division', 'Division 1', 'Division 2', 'Division 3', 'Division 4', 'Division 5'],
  soccer: ['Division I', 'Division II', 'Division III', 'Division IV', 'Division V'],
  basketball: ['Division I', 'Division II', 'Division III', 'Division IV', 'Division V'],
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe.each(SPORTS)('%s: the 2025-26 brackets read whole', (sport) => {
  const file = read(sport);
  const brackets = file.published!.brackets as TournamentBracket[];

  it('holds every CCS division, each with a champion, and only CIF State divisions a team of ours played in', () => {
    expect(brackets.filter((b) => b.event === 'ccs').map((b) => b.name)).toEqual(CCS_DIVISIONS[sport]);
    for (const b of brackets) expect(publishedChampion(b), `${b.event} ${b.name}`).not.toBeNull();
    expect(brackets.filter((b) => b.event === 'cif').length).toBeGreaterThan(0);
    // No transcribed section or tournament: those are field hockey's.
    expect(file.sections).toEqual({});
    expect(file.tournaments).toEqual({});
  });

  it('dates every round, in order from the opening round to the final', () => {
    for (const b of brackets) {
      const byId = new Map(b.matchups.map((m) => [m.id, m]));
      for (const m of b.matchups) {
        if (m.next === null) continue;
        expect(byId.get(m.next)!.roundDate >= m.roundDate, `${b.name}: ${m.round} after ${byId.get(m.next)!.round}`).toBe(true);
      }
      expect(b.matchups.every((m) => m.roundDate.startsWith('2025-') || m.roundDate.startsWith('2026-'))).toBe(true);
    }
  });

  it('opens /history/2025-26 on the CCS championship, then the CIF State divisions, before any league', async () => {
    vi.stubEnv('SCVAL_SPORT', sport);
    vi.resetModules();
    const { default: HistoryPage } = await import('../app/history/2025-26/page');
    const html = renderToStaticMarkup(createElement(HistoryPage));
    const at = (id: string) => html.indexOf(`<section id="${id}"`);
    expect(at('ccs')).toBeGreaterThan(0);
    expect(at('ccs')).toBeLessThan(at('cif'));
    expect(at('cif')).toBeLessThan(at('scval'));
    const ccs = textOf(sectionById(html, 'ccs')!);
    for (const name of CCS_DIVISIONS[sport]) expect(ccs).toContain(`${name} champion`);
    expect(ccs).toContain('Brackets, seeds and results as MaxPreps had them on');
    // One jump row per block, each with its own name, and no id twice.
    expect(html).toContain('aria-label="CCS brackets"');
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });
});

describe('the finals a reader sees first', () => {
  const champion = (sport: SportId, event: 'ccs' | 'cif', name: string) => {
    const b = read(sport).published!.brackets.find((x) => x.event === event && x.name === name) as TournamentBracket;
    const c = publishedChampion(b)!;
    return `${c.name}: ${c.detail}`;
  };

  it('volleyball: Archbishop Mitty won the 2025 CCS Open Division', () => {
    expect(champion('volleyball', 'ccs', 'Open Division')).toBe('Archbishop Mitty: Beat Saint Francis 3-0 in the final');
    expect(champion('volleyball', 'ccs', 'Division 1')).toBe('Milpitas: Beat Menlo-Atherton 3-1 in the final');
    expect(champion('volleyball', 'cif', 'Division III')).toBe('Academy of Our Lady of Peace: Beat Sequoia 3-0 in the final');
  });

  it('soccer: Los Gatos won the 2026 CCS Division I', () => {
    expect(champion('soccer', 'ccs', 'Division I')).toBe('Los Gatos: Beat Saint Francis 4-3 in the final');
  });

  it('basketball: Milpitas won the 2026 CCS Division I, Willow Glen Division II', () => {
    expect(champion('basketball', 'ccs', 'Division I')).toBe('Milpitas: Beat Los Gatos 49-36 in the final');
    expect(champion('basketball', 'ccs', 'Division II')).toBe('Willow Glen: Beat Saint Francis 47-44 in the final');
  });
});
