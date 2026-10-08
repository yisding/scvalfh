/**
 * data/history-brackets-2025-26.json — the 2025 CCS and San Diego Section brackets on
 * /history/2025-26 — and its contract, lib/history-brackets-schema.ts.
 *
 * The file is a hand transcription, so the results it must reproduce are asserted literally from
 * the sources its `notes` name (read 2026-10-07): the CCS bracket pages on cifccs.org and the CCS
 * Field Hockey History PDF; the San Diego Section's "2025 Championship Brackets" Google Sheet and
 * its Record Book. If a value here changes, the page changes with it.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  divisionChampion,
  finalLine,
  gameNote,
  gameSentence,
  gameSentenceTail,
  roundByes,
  sideName,
} from '../components/history/bracket-view';
import { HistoryBracketsSchema, type HistoryBrackets } from '../lib/history-brackets-schema';
import { getHistoryBracketFor, getHistoryBrackets } from '../lib/history';
import { REPO } from './helpers';

const raw = JSON.parse(readFileSync(path.join(REPO, 'data', 'history-brackets-2025-26.json'), 'utf8')) as HistoryBrackets;
const brackets = HistoryBracketsSchema.parse(raw);
const ccs = brackets.sections.ccs;
const sds = brackets.sections.sds;
const division = (s: typeof ccs, id: string) => s.divisions.find((d) => d.id === id)!;

/** Every game of a division as "winner beat loser" sentences, round by round. */
const sentences = (s: typeof ccs, id: string) => division(s, id).rounds.map((r) => r.games.map(gameSentence));

describe('the 2025 CCS bracket', () => {
  it('has the two divisions of eight, three rounds each', () => {
    expect(ccs.divisions.map((d) => d.label)).toEqual(['Division 1', 'Division 2']);
    for (const d of ccs.divisions) {
      expect(d.rounds.map((r) => `${r.name} ${r.date}`)).toEqual([
        'Quarterfinals 2025-11-05',
        'Semifinals 2025-11-08',
        'Final 2025-11-12',
      ]);
      expect(d.rounds.map((r) => r.games.length)).toEqual([4, 2, 1]);
    }
  });

  it('reproduces Division 1 as the CCS bracket page prints it', () => {
    expect(sentences(ccs, 'division-1')).toEqual([
      [
        'Archbishop Mitty beat Leigh 1-0.',
        'Los Gatos beat Christopher 2-0.',
        'Saint Francis beat Gilroy 1-0.',
        'St. Ignatius beat Palo Alto 8-1.',
      ],
      ['Los Gatos beat Archbishop Mitty 2-0.', 'Saint Francis beat St. Ignatius 1-0.'],
      ['Los Gatos beat Saint Francis 3-0.'],
    ]);
  });

  it('reproduces Division 2, with the semifinal Willow Glen won in a shootout', () => {
    expect(sentences(ccs, 'division-2')).toEqual([
      [
        'Willow Glen beat Carmel 2-0.',
        'Stevenson beat Presentation 3-0.',
        'Valley Christian beat Saratoga 2-0.',
        'Los Altos beat Monterey 5-1.',
      ],
      ['Willow Glen and Stevenson drew 1-1; Willow Glen won the shootout 2-1.', 'Valley Christian beat Los Altos 2-1.'],
      ['Valley Christian beat Willow Glen 1-0.'],
    ]);
  });

  it('crowns the champions the CCS Field Hockey History names, at its final sites', () => {
    const d1 = divisionChampion(division(ccs, 'division-1'));
    const d2 = divisionChampion(division(ccs, 'division-2'));
    expect([sideName(d1.champion), d1.final.site]).toEqual(['Los Gatos', 'Los Altos HS']);
    expect([sideName(d2.champion), d2.final.site]).toEqual(['Valley Christian', 'Gilroy HS']);
    expect(finalLine(d1.final)).toBe('Beat Saint Francis 3-0 in the final');
    expect(finalLine(d2.final)).toBe('Beat Willow Glen 1-0 in the final');
  });
});

describe('the 2025 San Diego Section brackets', () => {
  it('has the Open Division and Divisions I and II', () => {
    expect(sds.divisions.map((d) => d.label)).toEqual(['Open Division', 'Division I', 'Division II']);
    expect(sds.divisions.map((d) => d.rounds.map((r) => r.name))).toEqual([
      ['Quarterfinals', 'Semifinals', 'Final'],
      ['First round', 'Quarterfinals', 'Semifinals', 'Final'],
      ['Play-in', 'First round', 'Quarterfinals', 'Semifinals', 'Final'],
    ]);
  });

  it('reproduces the Open Division, the final score from the Record Book', () => {
    expect(sentences(sds, 'open')).toEqual([
      [
        'Canyon Crest Academy and Torrey Pines drew 1-1; Canyon Crest Academy won the shootout 2-1.',
        'Canyon Hills beat La Jolla 4-1.',
        'Scripps Ranch beat San Marcos 1-0.',
        "Bishop's beat Mission Bay 4-1.",
      ],
      ['Canyon Hills beat Canyon Crest Academy 2-1.', "Bishop's beat Scripps Ranch 4-0."],
      ["Bishop's beat Canyon Hills 3-0."],
    ]);
    expect(division(sds, 'open').rounds[2].games[0].scoreSource).toBe('record-book');
  });

  it('reproduces Division I, its byes and the quarterfinal moved to Nov 6', () => {
    const d = division(sds, 'division-1');
    expect(sentences(sds, 'division-1')).toEqual([
      [
        'University City beat Poway 1-0.',
        'Fallbrook beat Valley Center 5-2.',
        'La Costa Canyon beat Mission Vista 7-0.',
        'Clairemont beat La Jolla Country Day 1-0 in overtime.',
      ],
      [
        'Mt. Carmel beat University City 2-0.',
        'Fallbrook beat Cathedral Catholic 1-0.',
        'La Costa Canyon beat San Dieguito Academy 2-1.',
        'Rancho Bernardo beat Clairemont 2-0.',
      ],
      ['Mt. Carmel beat Fallbrook 2-1 in overtime.', 'La Costa Canyon beat Rancho Bernardo 4-2 in overtime.'],
      ['Mt. Carmel and La Costa Canyon drew 2-2; Mt. Carmel won the shootout 3-2.'],
    ]);
    expect(roundByes(d, 0).map((s) => `${s.seed} ${sideName(s)}`)).toEqual([
      '1 Mt. Carmel',
      '2 Rancho Bernardo',
      '3 San Dieguito Academy',
      '4 Cathedral Catholic',
    ]);
    const moved = d.rounds[1].games[3];
    expect(gameNote(moved, d.rounds[1])).toBe('Played Nov 6');
    expect(gameSentenceTail(moved, d.rounds[1])).toBe(' Played Nov 6.');
    expect(finalLine(d.rounds[3].games[0])).toBe('Drew 2-2 with La Costa Canyon in the final and won the shootout 3-2');
  });

  it('reproduces Division II: the play-in, the byes after it, and a final with no posted score', () => {
    const d = division(sds, 'division-2');
    expect(sentences(sds, 'division-2')).toEqual([
      ['Helix beat Granite Hills 2-1.'],
      [
        'Bonita Vista beat Westview 1-0.',
        'Mira Mesa beat Mission Hills 1-0.',
        'Rancho Buena Vista beat Helix 2-0.',
        'Point Loma beat Otay Ranch 7-0.',
      ],
      [
        'Del Norte beat Bonita Vista 2-0.',
        'Mira Mesa beat San Pasqual 1-0 in overtime.',
        'Rancho Buena Vista beat Olympian 1-0 in double overtime.',
        'Eastlake beat Point Loma 3-0.',
      ],
      ['Del Norte beat Mira Mesa 1-0 in overtime.', 'Eastlake beat Rancho Buena Vista 2-0.'],
      ['Eastlake beat Del Norte; no score was posted.'],
    ]);
    // The play-in is no round of byes; the four top seeds skipped the first round.
    expect(roundByes(d, 0)).toEqual([]);
    expect(roundByes(d, 1).map((s) => s.seed)).toEqual([1, 2, 3, 4]);
    const final = d.rounds[4].games[0];
    expect(gameNote(final, d.rounds[4])).toBe('No score posted · At La Jolla HS');
    expect(finalLine(final)).toBe('Beat Del Norte in the final; no score was posted');
  });
});

describe('lib/history bracket reads', () => {
  it('places the CCS bracket after PCAL and the San Diego Section’s after Metro', () => {
    expect(getHistoryBrackets().map((b) => `${b.id}:${b.afterLeague}`)).toEqual(['ccs:pcal', 'sds:metro']);
  });

  it('finds a league’s section bracket, and none for a section that held no playoffs', () => {
    expect(getHistoryBracketFor('scval')?.id).toBe('ccs');
    expect(getHistoryBracketFor('north-county')?.id).toBe('sds');
    for (const id of ['mcal', 'eal', 'sunset', 'independents'] as const) expect(getHistoryBracketFor(id)).toBeNull();
  });
});

describe('the bracket contract refuses a transcription slip', () => {
  const clone = (): HistoryBrackets => structuredClone(raw);
  const issues = (h: HistoryBrackets) => {
    const r = HistoryBracketsSchema.safeParse(h);
    return r.success ? [] : r.error.issues.map((i) => i.message);
  };

  it('accepts the committed file', () => {
    expect(issues(clone())).toEqual([]);
  });

  it('refuses a winner the score contradicts', () => {
    const h = clone();
    h.sections.ccs.divisions[0].rounds[2].games[0].winner = 'bottom';
    expect(issues(h).join('\n')).toMatch(/winner, score/);
  });

  it('refuses a level score with no shootout', () => {
    const h = clone();
    const g = h.sections.ccs.divisions[1].rounds[1].games[0];
    g.decidedBy = null;
    g.shootout = null;
    expect(issues(h).join('\n')).toMatch(/winner, score/);
  });

  it('refuses a winner who does not play the next round', () => {
    const h = clone();
    h.sections.ccs.divisions[0].rounds[1].games[0].top = { seed: 3, name: 'Leigh', slug: 'leigh' };
    expect(issues(h).join('\n')).toMatch(/does not advance/);
  });

  it('refuses a school outside the section’s leagues', () => {
    const h = clone();
    h.sections.sds.divisions[0].rounds[0].games[0].top.slug = 'los-gatos';
    expect(issues(h).join('\n')).toMatch(/not a registry slug of a sds league/);
  });

  it('refuses a division that does not end in one final', () => {
    const h = clone();
    h.sections.sds.divisions[0].rounds.pop();
    expect(issues(h).join('\n')).toMatch(/single final/);
  });
});
