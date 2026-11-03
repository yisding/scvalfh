/**
 * unbracketedChampion (components/playoffs/unbracketed-view.ts): the EAL Super Regional's result line on
 * /playoffs, read from the one game MaxPreps' own row calls the final ("Super regional championship").
 */
import { describe, expect, it } from 'vitest';

import { unbracketedChampion } from '../../components/playoffs/unbracketed-view';
import { getGames } from '../../lib/data';
import type { Game } from '../../lib/types';

const NS = { words: '1 v 1s', inference: 'verified' as const };
const eal = getGames().filter((g) => g.postseason?.kind === 'league-postseason' && g.postseason.leagueId === 'eal');
const final = eal.find((g) => /championship/i.test(g.venue.text ?? '')) as Game;

describe('unbracketedChampion', () => {
  it('names the 2026 Super Regional champion from the final’s own row', () => {
    expect(unbracketedChampion('Super Regional', 'eal', eal, NS)).toBe(
      'Pleasant Valley won the Super Regional, beating Chico on 1 v 1s after a 0–0 tie in the final on Sat Oct 31.',
    );
  });

  it('names no champion without a clean W/L pair, with a result conflict, or with no final', () => {
    const others = eal.filter((g) => g !== final);
    const withFinal = (g: Game) => [...others, g];
    expect(unbracketedChampion('Super Regional', 'eal', withFinal({ ...final, away: { ...final.away, result: 'W' } }), NS)).toBeNull();
    expect(unbracketedChampion('Super Regional', 'eal', withFinal({ ...final, home: { ...final.home, result: null } }), NS)).toBeNull();
    expect(
      unbracketedChampion('Super Regional', 'eal', withFinal({ ...final, provenance: { ...final.provenance, resultConflict: 'W/W' } }), NS),
    ).toBeNull();
    expect(unbracketedChampion('Super Regional', 'eal', others, NS)).toBeNull();
  });
});
