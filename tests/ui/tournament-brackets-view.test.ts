/**
 * components/playoffs/tournament-brackets-view.ts: the published brackets as the drawer's rounds, read off the
 * pages the volleyball corpus captured (tests/fixtures/corpus/volleyball-2026-11-14: the CCS championship and three
 * CIF State divisions, as they stood on the evening of Nov 13, 2026). A volleyball build's registry decides which
 * teams are ours, so this file sets the switch before importing anything that reads it (tests/volleyball.test.ts).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { Game, TournamentBracket } from '../../lib/types';
import type { TournamentBracketsView } from '../../components/playoffs/tournament-brackets-view';
import { REPO } from '../helpers';

const CORPUS = path.join(REPO, 'tests/fixtures/corpus/volleyball-2026-11-14');
const CCS_URL = 'https://www.maxpreps.com/tournament/TPozgxV2DkGkNEbD5cAlqA/volleyball-26/2026-central-coast-section-girls-volleyball-championship.htm';
const CIF = [
  ['cc4e6cc2-b002-46c5-bcd6-767e314cb33f', 'i'],
  ['03154bfd-27dc-46b2-ae38-ebc9c4311de6', 'ii'],
  ['f16579ea-d6ea-422e-97f9-fd758faf1069', 'iii'],
] as const;
const TODAY = '2026-11-13';

let view: typeof import('../../components/playoffs/tournament-brackets-view');
let brackets: TournamentBracket[];
let drawn: TournamentBracketsView;

beforeAll(async () => {
  vi.stubEnv('SCVAL_SPORT', 'volleyball');
  vi.resetModules();
  const { parseTournamentBrackets } = await import('../../lib/sources/maxpreps-tournament');
  view = await import('../../components/playoffs/tournament-brackets-view');
  const read = (rel: string) => readFileSync(path.join(CORPUS, rel), 'utf8');
  brackets = [
    ...parseTournamentBrackets(read('ccs/bracket.html')).brackets.map((b): TournamentBracket => ({ event: 'ccs', url: CCS_URL, ...b })),
    ...CIF.flatMap(([id, n]) =>
      parseTournamentBrackets(read(`maxpreps/tournament/${id}.html`)).brackets.map(
        (b): TournamentBracket => ({ event: 'cif', url: `https://www.maxpreps.com/tournament/x/y/volleyball-26/division-${n}.htm`, ...b }),
      ),
    ),
  ];
  drawn = view.tournamentBracketsView(brackets, [], TODAY);
});

const bracket = (id: string) => {
  const found = drawn.brackets.find((b) => b.id === id);
  if (!found) throw new Error(`no bracket ${id}`);
  return found;
};

describe('which brackets are drawn', () => {
  it('draws the divisions a team of ours is in, the CIF State ones first, and names the rest', () => {
    expect(drawn.brackets.map((b) => [b.id, b.name, b.nav, b.meta])).toEqual([
      ['cif-division-i', 'CIF State Division I', 'CIF Division I', 'NorCal regional, 15 teams'],
      ['cif-division-ii', 'CIF State Division II', 'CIF Division II', 'NorCal regional, 16 teams'],
      ['cif-division-iii', 'CIF State Division III', 'CIF Division III', 'NorCal regional, 16 teams'],
      ['ccs-open-division', 'CCS Open Division', 'CCS Open', '8 teams'],
      ['ccs-division-1', 'CCS Division 1', 'CCS Division 1', '13 teams'],
      ['ccs-division-2', 'CCS Division 2', 'CCS Division 2', '10 teams'],
      ['ccs-division-3', 'CCS Division 3', 'CCS Division 3', '13 teams'],
    ]);
    expect(drawn.ccsOthers).toEqual(['Division 4', 'Division 5']);
  });

  it('draws nothing from no brackets', () => {
    expect(view.tournamentBracketsView(undefined, [], TODAY)).toEqual({ brackets: [], ccsOthers: [] });
  });
});

describe('a CCS division', () => {
  it('is its rounds in the site’s words, each round half the one before once the byes are set aside', () => {
    expect(bracket('ccs-open-division').rounds.map((r) => [r.name, r.dateLabel, r.ties.length, r.byes])).toEqual([
      ['Quarterfinals', 'Sat Oct 31', 4, null],
      ['Semifinals', 'Wed Nov 4', 2, null],
      ['Final', 'Sat Nov 7', 1, null],
    ]);
    expect(bracket('ccs-division-1').rounds.map((r) => [r.name, r.dateLabel, r.ties.length, r.byes])).toEqual([
      ['First round', 'Sat Oct 31', 5, 'Salinas (1), Menlo-Atherton (2), Homestead (3)'],
      ['Quarterfinals', 'Tue Nov 3', 4, null],
      ['Semifinals', 'Thu Nov 5', 2, null],
      ['Final', 'Sat Nov 7', 1, null],
    ]);
    expect(bracket('ccs-division-2').rounds[0].byes).toBe('Aragon (1), Burlingame (2), San Mateo (3), Christopher (4), Gunn (5), Monta Vista (6)');
  });

  it('orders each round so two neighbours feed one game of the next', () => {
    const [, quarters, semis, final] = bracket('ccs-division-1').rounds;
    const names = (r: typeof quarters) => r.ties.map((t) => t.lines.map((l) => l.name));
    expect(names(quarters)).toEqual([['Sequoia', 'Homestead'], ['Mountain View', 'Menlo-Atherton'], ['Carlmont', 'Milpitas'], ['Los Altos', 'Salinas']]);
    expect(names(semis)).toEqual([['Homestead', 'Mountain View'], ['Milpitas', 'Los Altos']]);
    expect(names(final)).toEqual([['Homestead', 'Milpitas']]);
  });

  it('prints a decided game: seeds, sets won, the winner, a registry team by its slug', () => {
    const final = bracket('ccs-division-1').rounds[3].ties[0];
    expect(final).toMatchObject({
      state: 'final', time: null, note: null, href: null,
      sentence: 'Homestead (3) beat Milpitas (4) 3–2.',
      lines: [
        { slug: 'homestead', name: 'Homestead', seed: 3, score: 3, result: 'won', open: false },
        { slug: 'milpitas', name: 'Milpitas', seed: 4, score: 2, result: 'lost', open: false },
      ],
    });
    // A school outside the build's leagues prints by MaxPreps' name, with no slug.
    expect(bracket('ccs-open-division').rounds[2].ties[0].lines.map((l) => [l.slug, l.name])).toEqual([[null, 'Saint Francis'], [null, 'Archbishop Mitty']]);
  });
});

describe('a CIF State division', () => {
  it('is the regional our teams are in, then the state final', () => {
    expect(bracket('cif-division-iii').rounds.map((r) => [r.name, r.dateLabel, r.ties.length])).toEqual([
      ['First round', 'Tue Nov 10', 8],
      ['Quarterfinals', 'Thu Nov 12', 4],
      ['Semifinals', 'Sat Nov 14', 2],
      ['Regional final', 'Tue Nov 17', 1],
      ['State final', 'Sat Nov 21', 1],
    ]);
    expect(bracket('cif-division-i').rounds[0]).toMatchObject({ byes: 'St. Francis (1)' });
    expect(bracket('cif-division-i').rounds[0].ties).toHaveLength(7);
  });

  it('prints a game still to play with its start, and a place nobody has reached by who can reach it', () => {
    const [, , semis, regional, state] = bracket('cif-division-iii').rounds;
    expect(semis.ties[0]).toMatchObject({
      state: 'upcoming', time: '6 PM',
      sentence: 'Los Altos (8) plays Burlingame (5), Sat Nov 14, 6 PM PT.',
      lines: [{ slug: 'los-altos', name: 'Los Altos', seed: 8 }, { slug: null, name: 'Burlingame', seed: 5 }],
    });
    expect(semis.ties[0].lines[0].score).toBeUndefined();
    expect(regional.ties[0]).toMatchObject({
      state: null,
      lines: [{ name: 'Los Altos or Burlingame', open: true, seed: null }, { name: 'Ripon or Nevada Union', open: true, seed: null }],
    });
    expect(state.ties[0]).toMatchObject({ state: null, note: 'At Santiago Canyon College', lines: [{ name: 'TBD' }, { name: 'TBD' }] });
  });

  it('says so when a game’s day has passed with no result', () => {
    const late = view.tournamentBracketsView(brackets, [], '2026-11-16');
    const semi = late.brackets.find((b) => b.id === 'cif-division-iii')?.rounds[2].ties[0];
    expect(semi).toMatchObject({
      state: null, time: null, note: 'No result posted yet',
      sentence: 'Los Altos (8) and Burlingame (5) were to play Sat Nov 14; no result is posted yet.',
    });
  });
});

describe('a game the snapshot holds', () => {
  it('links to its game page and carries its seeds by the game’s own sides', () => {
    const d1 = brackets.find((b) => b.name === 'Division 1');
    const final = d1?.matchups.find((m) => m.next === null);
    if (!final?.contestId) throw new Error('the Division 1 final has a contest');
    // Milpitas at Homestead, as the snapshot has it: the page lists Homestead first.
    const game = {
      contestId: final.contestId, dateLocal: '2026-11-07T18:00:00', dateKey: '2026-11-07', isDateTba: false, isTimeTba: false,
      home: { teamId: final.sides[0].teamId }, away: { teamId: final.sides[1].teamId }, venue: { text: '@ Santa Clara HS' },
      urls: { goFan: null, nfhsStream: null },
    } as unknown as Game;
    const tie = view.tournamentBracketsView(brackets, [game], TODAY).brackets.find((b) => b.id === 'ccs-division-1')?.rounds[3].ties[0];
    expect(tie).toMatchObject({
      id: `ccs-division-1-${final.id.slice(0, 8)}`,
      href: `/game/${final.contestId}`,
      contestId: final.contestId,
      gameSeeds: { home: 3, away: 4 },
    });
  });
});

describe('roundName', () => {
  it('turns MaxPreps’ round names into the site’s', () => {
    const names = ['1st round', 'Round I', 'Quarter Finals', 'Quarterfinals', 'Semi Finals', 'Finals', 'Regional Finals', 'State Final', 'Consolation'];
    expect(names.map((n) => view.roundName(n, 1))).toEqual([
      'First round', 'First round', 'Quarterfinals', 'Quarterfinals', 'Semifinals', 'Final', 'Regional final', 'State final', 'Consolation',
    ]);
    expect(view.roundName('Regional Finals', 2)).toBe('Regional finals');
  });
});
