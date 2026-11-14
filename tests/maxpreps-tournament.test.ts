/**
 * lib/sources/maxpreps-tournament.ts: a MaxPreps tournament page read whole, against the pages the volleyball
 * corpus captured (the CCS girls volleyball championship, six brackets; three divisions of the CIF State
 * championships) and the unpublished field hockey page of 2026-10-29.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { isTournamentPageUrl, parseTournamentBrackets } from '../lib/sources/maxpreps-tournament';

import { REPO } from './helpers';

const CORPUS = path.join(REPO, 'tests/fixtures/corpus/volleyball-2026-11-14');
const read = (rel: string) => readFileSync(path.join(CORPUS, rel), 'utf8');
const CIF_DIVISION_II = '03154bfd-27dc-46b2-ae38-ebc9c4311de6';

describe('the CCS championship page', () => {
  const page = parseTournamentBrackets(read('ccs/bracket.html'));

  it('reads all six published brackets, in page order, under the page’s own heading', () => {
    expect(page.problems).toEqual([]);
    expect(page.tournament).toBe('2026 Central Coast Section Girls Volleyball Championship');
    expect(page.brackets.map((b) => [b.name, b.matchups.length])).toEqual([
      ['Open Division', 7], ['Division 1', 15], ['Division 2', 15], ['Division 3', 15], ['Division 4', 15], ['Division 5', 15],
    ]);
  });

  it('joins every bracket into one tree: one last game, every link inside the bracket', () => {
    for (const b of page.brackets) {
      const ids = new Set(b.matchups.map((m) => m.id));
      expect(b.matchups.filter((m) => m.next === null), b.name).toHaveLength(1);
      for (const m of b.matchups) {
        for (const link of [m.next, m.sides[0].from, m.sides[1].from]) expect(link === null || ids.has(link), `${b.name} ${m.id}`).toBe(true);
      }
    }
  });

  it('reads a result: seeds, sets won, the winner and the contest', () => {
    const d1 = page.brackets[1];
    const final = d1.matchups.find((m) => m.next === null);
    expect(final).toMatchObject({
      round: 'Finals', roundDate: '2026-11-07', bye: false, winner: 0,
      sides: [{ name: 'Homestead', seed: 3, score: 3 }, { name: 'Milpitas', seed: 4, score: 2 }],
    });
    expect(final?.contestId).toMatch(/^23a56a2b-/);
    expect(final?.sides.every((s) => s.from !== null)).toBe(true);
  });

  it('reads a bye as one school and no game, and a seed MaxPreps pads with a space', () => {
    const d1 = page.brackets[1];
    const byes = d1.matchups.filter((m) => m.bye);
    expect(byes.map((m) => m.sides.find((s) => s.teamId !== null)?.name).sort()).toEqual(['Homestead', 'Menlo-Atherton', 'Salinas']);
    for (const m of byes) {
      expect(m.contestId).toBeNull();
      expect(m.winner).toBeNull();
      expect(m.sides.filter((s) => s.teamId === null)).toEqual([{ teamId: null, name: null, seed: null, score: null, from: null }]);
    }
    expect(byes.flatMap((m) => m.sides).find((s) => s.name === 'Salinas')?.seed).toBe(1);
  });
});

describe('a CIF State division page', () => {
  const page = parseTournamentBrackets(read(`maxpreps/tournament/${CIF_DIVISION_II}.html`));

  it('reads the two regionals, the regional finals and the state final as one tree of 31', () => {
    expect(page.problems).toEqual([]);
    expect(page.tournament).toBe('2026 CIF State Girls Volleyball Championships');
    expect(page.brackets.map((b) => [b.bracketId, b.name, b.matchups.length])).toEqual([[CIF_DIVISION_II, 'Division II', 31]]);
    const rounds = new Map<string, number>();
    for (const m of page.brackets[0].matchups) rounds.set(m.round, (rounds.get(m.round) ?? 0) + 1);
    expect([...rounds]).toEqual([['Round I', 16], ['Quarterfinals', 8], ['Semifinals', 4], ['Regional Finals', 2], ['State Final', 1]]);
  });

  it('reads a game still to play: both schools, its start, no winner; and a game nobody has reached yet', () => {
    const matchups = page.brackets[0].matchups;
    const semi = matchups.find((m) => m.round === 'Semifinals');
    expect(semi).toMatchObject({
      dateLocal: '2026-11-14T18:00:00', winner: null, bye: false,
      sides: [{ name: 'St. Mary\'s', seed: 1, score: null }, { name: 'Las Lomas', seed: 4, score: null }],
    });
    const stateFinal = matchups.find((m) => m.next === null);
    expect(stateFinal).toMatchObject({ round: 'State Final', roundDate: '2026-11-21', site: 'Santiago Canyon College', contestId: null });
    expect(stateFinal?.sides.map((s) => [s.teamId, s.name, s.from !== null])).toEqual([[null, null, true], [null, null, true]]);
  });
});

describe('a page with nothing to read', () => {
  it('skips a bracket that is not published yet, and says so', () => {
    const page = parseTournamentBrackets(readFileSync(path.join(REPO, 'tests/fixtures/ccs/tournament-2026-10-29-unpublished.html'), 'utf8'));
    expect(page.brackets).toEqual([]);
    expect(page.problems).toEqual(['Division 1: not published', 'Division 2: not published']);
  });

  it('reports a page with no bracket block (a WAF body, another page)', () => {
    expect(parseTournamentBrackets('<html><body>Access denied</body></html>')).toEqual({
      tournament: '', brackets: [], problems: ['no <li id="bracket_…"> block on the page'],
    });
  });
});

describe('isTournamentPageUrl', () => {
  it('accepts only a maxpreps.com tournament page', () => {
    expect(isTournamentPageUrl('https://www.maxpreps.com/tournament/TIUpmSF7J06hXDh6zuDG7Q/_UsVA9wnskauOOvJxDEd5g/volleyball-26/2026-cif-state-girls-volleyball-championships-division-ii.htm')).toBe(true);
    expect(isTournamentPageUrl('https://www.maxpreps.com/ca/volleyball/')).toBe(false);
    expect(isTournamentPageUrl('http://www.maxpreps.com/tournament/x/y.htm')).toBe(false);
    expect(isTournamentPageUrl('https://example.com/tournament/x/y.htm')).toBe(false);
    expect(isTournamentPageUrl('https://www.maxpreps.com/tournament/x/y.htm?next=https://example.com')).toBe(false);
  });
});
