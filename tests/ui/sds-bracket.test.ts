/**
 * The San Diego Section's brackets on /playoffs (plan final-08, 2026-10-30): components/playoffs/sds-bracket-view.ts
 * (lib/postseason/sds-bracket.ts LiveBracketDivision → the shared BracketDivisionView), components/playoffs/SdsBracket.tsx (the
 * archive's drawer, HistoryBracket.tsx BracketView) and the `#sds-bracket` section of app/playoffs/page.tsx.
 *
 * Run against last season: the 2025 brackets in this season's file shape and the 26 San Diego playoff rows MaxPreps
 * posted (tests/fixtures/sds/brackets-2025.ts). The copy rules are checked on what renders: no seed word at all (the
 * Section's places print as bare numerals; scripts/copy-rules.ts SEED_CLAIM covers every San Diego surface), no
 * "eliminat", no champion named, no CCS word. The page is rendered with lib/postseason/sds-bracket mocked to the 2025 file (the
 * committed data/sds-brackets-2026.json is the placeholder and must stay so), the way tests/ui/playoff-view.test.ts
 * mocks lib/postseason/ccs-bracket; on the placeholder nothing is drawn.
 */

import { readFileSync } from 'node:fs';

import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import SdsBracket from '../../components/playoffs/SdsBracket';
import { sdsBracketIntro, sdsBracketView } from '../../components/playoffs/sds-bracket-view';
import { gameHref } from '../../lib/game-id';
import { buildSdsBrackets, getSdsBrackets, getSdsBracketsSource } from '../../lib/postseason/sds-bracket';
import type { Snapshot } from '../../lib/types';
import { SEED_CLAIM, attributeText, elementById, visibleText } from '../../scripts/copy-rules';
import { sdsGames2025, seedsFromHistory } from '../fixtures/sds/brackets-2025';
import { corpusSnapshotPath, writeTempSnapshot } from '../helpers';
import { textOf } from './html-text';

const VIEW = 'components/playoffs/sds-bracket-view.ts';
const COMPONENT = 'components/playoffs/SdsBracket.tsx';
const PAGE = 'app/playoffs/page.tsx';

const file = seedsFromHistory('sds');
const games = sdsGames2025();
const source = { label: file.source!.label, url: file.source!.url, retrievedOn: file.retrievedOn! };
/** After the 2025 finals: every card with a row is decided. */
const AFTER = '2025-11-20';
/** Before the 2025 play-in: nothing played. */
const BEFORE = '2025-11-01';

const render = (divisions: ReturnType<typeof buildSdsBrackets>, today: string) =>
  renderToStaticMarkup(createElement(SdsBracket, { divisions, source, today }));

/** What a reader sees or is read out, as scripts/assert-copy.ts reads a card. */
const readable = (html: string) => `${visibleText(html)}\n${attributeText(html)}`;

/** The copy rules every San Diego surface keeps. */
function expectSanDiegoCopy(html: string, where: string) {
  const text = readable(html);
  expect(text, `${where}: SEED_CLAIM`).not.toMatch(SEED_CLAIM);
  expect(text, `${where}: no seed word at all`).not.toMatch(/\bseed(ed|s|ing)?\b/i);
  expect(text, `${where}: eliminat`).not.toMatch(/eliminat/i);
  // "Championship Brackets" is the sheet's title; a champion is never named.
  expect(text, `${where}: no champion named`).not.toMatch(/\bchampions?\b/i);
  expect(text, `${where}: no CCS word`).not.toMatch(/\bCCS\b|at-large|automatic qualifier/i);
}

describe('the 2025 brackets, drawn (SdsBracket over sds-bracket-view)', () => {
  const played = render(buildSdsBrackets(file, games), AFTER);
  const playedText = textOf(played);

  it('renders three divisions under their own h2, the Section’s labels, each round an h3, with one sentence and the sheet’s link under them', () => {
    expect([...played.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map((m) => m[1]), COMPONENT).toEqual([
      'Open Division',
      'Division I',
      'Division II',
    ]);
    // A round's heading is an h3 with its day (spec §5.6): 3 rounds in the Open Division and 4 in each of the
    // other two (a fifth round that is a play-in is drawn at the head of the first round's column, named in its note).
    const rounds = [...played.matchAll(/<h3>([^<]*)<\/h3>/g)].map((m) => m[1]);
    expect(rounds, COMPONENT).toHaveLength(11);
    expect(rounds, COMPONENT).not.toContain('Play-in, Nov 3');
    expect(playedText, COMPONENT).toMatch(/Play-in, Nov \d+/);
    expect(rounds.slice(0, 3), COMPONENT).toEqual(['Quarterfinals, Nov 6', 'Semifinals, Nov 11', 'Final, Nov 15']);
    expect(played, COMPONENT).not.toContain('<h4');
    expect(played.match(/class="sx-bracket/g)?.length, COMPONENT).toBe(3);
    // The sentence that says where the brackets come from follows the last of them.
    expect(played.indexOf(sdsBracketIntro('2026', source.retrievedOn)), COMPONENT).toBeGreaterThan(played.lastIndexOf('class="sx-bracket'));
    expect(played.match(/id="sds-bracket"/g)?.length, COMPONENT).toBe(1);
    expect(sdsBracketIntro('2026', '2026-11-01'), VIEW).toBe(
      'The Section’s published brackets, from its 2026 Championship Brackets sheet (retrieved Sun Nov 1); results as MaxPreps posts them.',
    );
    expect(playedText, COMPONENT).toContain(sdsBracketIntro('2026', source.retrievedOn));
    expect(played, COMPONENT).toContain(`href="${source.url}"`);
  });

  it('links every joined card to its game page, and never nests a link inside one', () => {
    for (const g of games) expect(played, `${COMPONENT}: ${g.contestId}`).toContain(`href="${gameHref(g.contestId)}"`);
    expect(played.match(/href="\/game\//g)?.length, COMPONENT).toBe(26);
    for (const a of played.match(/<a [^>]*href="\/game\/[\s\S]*?<\/a>/g) ?? []) {
      expect(a.slice(2).includes('<a '), `${COMPONENT}: an anchor inside a game card`).toBe(false);
    }
  });

  it('writes each result as a sentence with bare numerals, winner first, with an en dash', () => {
    for (const sentence of [
      // The registry writes the name with a straight apostrophe.
      "Bishop's (2) beat Mission Bay (7) 4–1.",
      'Canyon Crest Academy (8) and Torrey Pines (1) drew 1–1; Canyon Crest Academy won the shootout.',
      'Rancho Bernardo (2) beat Clairemont (7) 2–0. Played Nov 6.',
      'Mt. Carmel (1) and La Costa Canyon (6) drew 2–2; Mt. Carmel won the shootout. At La Jolla HS.',
      // MaxPreps posted no row for Bonita Vista v Westview; Bonita Vista's quarterfinal shows it came through.
      'Bonita Vista (8) beat Westview (9); no score was posted.',
      // No later game says who won the play-in, and its day has passed.
      'Helix (11) and Granite Hills (11) were to play Mon Nov 3; no result is posted yet.',
    ]) {
      expect(playedText, VIEW).toContain(sentence);
    }
    // A decided card with no score prints the missing-score dash, never a 0.
    expect(played, COMPONENT).toContain('<span class="sr-only">score not posted</span>');
    // The winner's line is marked `data-won` (bold) and the other `data-lost` (grey), on every decided card
    // (29 of 30: the play-in is not); the 2px winner bar is retired (spec §5.6).
    expect(played.match(/class="sx-tie-line" aria-hidden="true"[^>]* data-won=""/g)?.length, COMPONENT).toBe(29);
    expect(played.match(/class="sx-tie-line" aria-hidden="true"[^>]* data-lost=""/g)?.length, COMPONENT).toBe(29);
    expect(played, COMPONENT).not.toMatch(/inset 2px 0 0/);
    expect(played, COMPONENT).not.toContain('sx-pin-note');
    expect(played.match(/Byes: /g)?.length, COMPONENT).toBe(2);
    expect(playedText, COMPONENT).toContain('Byes: Mt. Carmel (1), Rancho Bernardo (2), San Dieguito Academy (3), Cathedral Catholic (4)');
  });

  it('keeps the San Diego copy rules', () => {
    expectSanDiegoCopy(played, COMPONENT);
  });
});

describe('the 2025 brackets before a game is played', () => {
  const divisions = buildSdsBrackets(file, []);
  const html = render(divisions, BEFORE);
  const text = textOf(html);

  it('prints a place still to be decided by its two schools ("Poway or University City"), else its places, never a blank box', () => {
    expect(text, COMPONENT).toContain('Poway or University City');
    expect(text, VIEW).toContain('Mt. Carmel (1) plays the winner of Poway v University City, Fri Nov 7.');
    expect(text, VIEW).toContain('Torrey Pines (1) plays Canyon Crest Academy (8), Thu Nov 6.');
    // The play-in's place names its two schools; a place two results away keeps its numbers.
    expect(text, COMPONENT).toContain('Helix or Granite Hills');
    expect(text, COMPONENT).toContain('Winner of 1 v 8/9');
  });

  it('gives an unplayed card its day, time and site, no score column and no game link', () => {
    const final = sdsBracketView(divisions[0], BEFORE).rounds.at(-1)!.cards[0];
    expect(final, VIEW).toMatchObject({ status: 'scheduled', winner: null, score: null, href: null, site: 'La Jolla HS', time: 'Sat Nov 15 · time TBA' });
    expect(final.note, VIEW).toBe('Sat Nov 15 · time TBA · At La Jolla HS');
    expect(final.sentence.join(''), VIEW).toBe('The winner of 1/8 v 4/5 plays the winner of 3/6 v 2/7, Sat Nov 15, at La Jolla HS.');
    expect(html, COMPONENT).not.toContain('score not posted');
    expect(html, COMPONENT).not.toContain('href="/game/');
    expect(html, COMPONENT).not.toMatch(/inset 2px 0 0|data-won|data-lost/);
    // An unplayed card's start sits where its score will be: the time alone on its round's day, "TBD" with none.
    expect(final.clock, VIEW).toBe('TBD');
    expect(html, COMPONENT).toContain('<span class="sx-num sx-tie-time" aria-hidden="true">TBD</span>');
    expect(html, COMPONENT).not.toContain('sx-tie-score');
    expectSanDiegoCopy(html, COMPONENT);
  });

  it('a joined but unplayed MaxPreps game links its page and prints its own time', () => {
    const [first] = games.filter((g) => g.contestId === '811cef45-a5e4-4ad0-9183-535c63f02f01');
    const upcoming = { ...first, status: 'scheduled' as const, home: { ...first.home, score: null, result: null }, away: { ...first.away, score: null, result: null }, dateLocal: '2025-11-04T15:30:00', isTimeTba: false };
    const d1 = buildSdsBrackets(file, [upcoming]).find((d) => d.id === 'division-1')!;
    const card = sdsBracketView(d1, BEFORE).rounds[0].cards[0];
    expect(card, VIEW).toMatchObject({ status: 'scheduled', href: gameHref(first.contestId), time: 'Tue Nov 4 · 3:30 PM PT' });
    // In the cell: the time, with the weekday only when the card is not on its round's day.
    expect(card.clock, VIEW).toMatch(/^(Tue )?3:30 PM$/);
    expect(card.sentence.join(''), VIEW).toBe('Poway (8) plays University City (9), Tue Nov 4, 3:30 PM PT.');
  });
});

describe('/playoffs with the Section’s brackets (lib/postseason/sds-bracket mocked to the 2025 file)', () => {
  // The Oct 2 corpus with the snapshot's day moved to Tue Nov 3, after the seeding meeting; the brackets come
  // through getSdsBrackets/getSdsBracketsSource, mocked to the 2025 file joined to its MaxPreps rows the way a
  // filled data/sds-brackets-2026.json would answer.
  const priorEnv = process.env.SCVAL_SNAPSHOT;
  const brackets = buildSdsBrackets(file, games);
  let html = '';

  beforeAll(async () => {
    const snap = JSON.parse(readFileSync(corpusSnapshotPath('all-2026-10-02'), 'utf8')) as Snapshot;
    snap.fetchedAt = '2026-11-03T12:00:00.000Z';
    process.env.SCVAL_SNAPSHOT = writeTempSnapshot(snap, 'playoffs-sds');
    vi.resetModules();
    vi.doMock('../../lib/postseason/sds-bracket', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../../lib/postseason/sds-bracket')>();
      return { ...actual, getSdsBrackets: () => brackets, getSdsBracketsSource: () => source };
    });
    const page = await import('../../app/playoffs/page');
    html = renderToStaticMarkup(page.default() as ReactElement);
  }, 600_000);

  afterAll(() => {
    vi.doUnmock('../../lib/postseason/sds-bracket');
    if (priorEnv === undefined) delete process.env.SCVAL_SNAPSHOT;
    else process.env.SCVAL_SNAPSHOT = priorEnv;
    vi.resetModules();
  });

  it('draws #sds-bracket once, first in the SoCal block (bracket-first), before the round dates and outside the three conference sections', () => {
    expect(html.match(/id="sds-bracket"/g)?.length, PAGE).toBe(1);
    const socal = html.indexOf('<div id="socal" data-region-scope="socal"');
    const at = html.indexOf('id="sds-bracket"');
    expect(socal, PAGE).toBeGreaterThan(0);
    expect(at, PAGE).toBeGreaterThan(socal);
    expect(at, PAGE).toBeLessThan(html.indexOf('id="sds-round-dates"'));
    expect(at, PAGE).toBeLessThan(html.indexOf('id="sds-playoffs"'));
    // Nothing but the wrapper's own tag sits between the SoCal block's start and the brackets.
    expect(textOf(html.slice(socal, html.lastIndexOf('<', at))).trim(), PAGE).toBe('');
    for (const id of ['city', 'north-county', 'metro']) {
      expect(at, `${PAGE}: before #${id}`).toBeLessThan(html.indexOf(`id="${id}"`));
      const card = elementById(html, id, 'section');
      expect(card, `${PAGE}: #${id}`).not.toBe('');
      expect(card, `${PAGE}: #${id} holds no bracket`).not.toContain('sds-bracket');
      expect(readable(card), `${PAGE}: #${id} SEED_CLAIM`).not.toMatch(SEED_CLAIM);
    }
    const section = elementById(html, 'sds-bracket', 'section');
    expect(section.match(/<h2[^>]*>[^<]*<\/h2>/g)?.length, PAGE).toBe(3);
    expect(section.match(/href="\/game\//g)?.length, PAGE).toBe(26);
  });

  it('says the brackets above are the Section’s, and keeps the SoCal copy rules', () => {
    const socal = html.slice(html.indexOf('<div id="socal" data-region-scope="socal"'));
    const text = textOf(socal);
    expect(text, PAGE).toContain('The Section has published its brackets; the brackets above are the Section’s, with results as MaxPreps posts them.');
    expect(text, PAGE).not.toContain('this site draws no bracket');
    // The SoCal block's own regex (tests/ui/playoff-view.test.ts, "the San Diego block states the Section’s rule").
    expect(text, PAGE).not.toMatch(/at-large|automatic qualifier|lowest-seeded|\bseed(ed|s)?\b(?! ?ing meeting)|eliminat/i);
    expectSanDiegoCopy(elementById(html, 'sds-bracket', 'section'), PAGE);
    expect(html, PAGE).not.toMatch(/eliminat/i);
  });
});

describe('the committed 2026 brackets: drawn under #sds-bracket', () => {
  const priorEnv = process.env.SCVAL_SNAPSHOT;
  let html = '';

  beforeAll(async () => {
    process.env.SCVAL_SNAPSHOT = corpusSnapshotPath('all-2026-10-02');
    vi.resetModules();
    const page = await import('../../app/playoffs/page');
    html = renderToStaticMarkup(page.default() as ReactElement);
  }, 600_000);

  afterAll(() => {
    if (priorEnv === undefined) delete process.env.SCVAL_SNAPSHOT;
    else process.env.SCVAL_SNAPSHOT = priorEnv;
    vi.resetModules();
  });

  it('draws the three brackets with their source, and the sentence says they are the Section’s', () => {
    expect(getSdsBrackets()?.length, 'lib/postseason/sds-bracket.ts').toBe(3);
    expect(getSdsBracketsSource(), 'lib/postseason/sds-bracket.ts').not.toBeNull();
    expect(html, PAGE).toContain('id="sds-bracket"');
    expect(textOf(html), PAGE).toContain(
      'The Section has published its brackets; the brackets above are the Section’s, with results as MaxPreps posts them.',
    );
  });
});
