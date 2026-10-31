/**
 * The San Diego Section's brackets on /playoffs (plan final-08, 2026-10-30): components/playoffs/sds-bracket-view.ts
 * (lib/sds-bracket.ts LiveBracketDivision → the shared BracketDivisionView), components/playoffs/SdsBracket.tsx (the
 * archive's drawer, HistoryBracket.tsx BracketView) and the `#sds-bracket` section of app/playoffs/page.tsx.
 *
 * Run against last season: the 2025 brackets in this season's file shape and the 26 San Diego playoff rows MaxPreps
 * posted (tests/fixtures/sds/brackets-2025.ts). The copy rules are checked on what renders: no seed word at all (the
 * Section's places print as bare numerals; scripts/copy-rules.ts SEED_CLAIM covers every San Diego surface), no
 * "eliminat", no champion named, no CCS word. The page is rendered with lib/sds-bracket mocked to the 2025 file (the
 * committed data/sds-brackets-2026.json is the placeholder and must stay so), the way tests/ui/playoff-view.test.ts
 * mocks lib/ccs-bracket; on the placeholder nothing is drawn.
 */

import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import SdsBracket from '../../components/playoffs/SdsBracket';
import { sdsBracketIntro, sdsBracketView } from '../../components/playoffs/sds-bracket-view';
import { gameHref } from '../../lib/game-id';
import { buildSdsBrackets, getSdsBrackets, getSdsBracketsSource } from '../../lib/sds-bracket';
import type { Snapshot } from '../../lib/types';
import { SEED_CLAIM, attributeText, elementById, visibleText } from '../../scripts/copy-rules';
import { sdsGames2025, seedsFromHistory } from '../fixtures/sds/brackets-2025';
import { corpusSnapshotPath } from '../helpers';
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

  it('renders three divisions under their own h3, the Section’s labels, with one sentence and the sheet’s link above', () => {
    expect([...played.matchAll(/<h3[^>]*>([^<]*)<\/h3>/g)].map((m) => m[1]), COMPONENT).toEqual([
      'Open Division',
      'Division I',
      'Division II',
    ]);
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
    // The winner's line: 600 weight and the 2px rule, on every decided card (29 of 30: the play-in is not).
    expect(played.match(/box-shadow:inset 2px 0 0 var\(--sx-text\)/g)?.length, COMPONENT).toBe(29);
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

  it('prints a place still to be decided as "Winner of 8 v 9", never a blank box', () => {
    expect(text, COMPONENT).toContain('Winner of 8 v 9');
    expect(text, VIEW).toContain('Mt. Carmel (1) plays the winner of 8 v 9, Fri Nov 7.');
    expect(text, VIEW).toContain('Torrey Pines (1) plays Canyon Crest Academy (8), Thu Nov 6.');
    expect(text, COMPONENT).toContain('Winner of the play-in');
  });

  it('gives an unplayed card its day, time and site, no score column and no game link', () => {
    const final = sdsBracketView(divisions[0], BEFORE).rounds.at(-1)!.cards[0];
    expect(final, VIEW).toMatchObject({ status: 'scheduled', winner: null, score: null, href: null, site: 'La Jolla HS', time: 'Sat Nov 15 · time TBA' });
    expect(final.note, VIEW).toBe('Sat Nov 15 · time TBA · At La Jolla HS');
    expect(final.sentence.join(''), VIEW).toBe('The winner of 1/8 v 4/5 plays the winner of 3/6 v 2/7, Sat Nov 15, at La Jolla HS.');
    expect(html, COMPONENT).not.toContain('score not posted');
    expect(html, COMPONENT).not.toContain('href="/game/');
    expect(html, COMPONENT).not.toMatch(/inset 2px 0 0/);
    expectSanDiegoCopy(html, COMPONENT);
  });

  it('a joined but unplayed MaxPreps game links its page and prints its own time', () => {
    const [first] = games.filter((g) => g.contestId === '811cef45-a5e4-4ad0-9183-535c63f02f01');
    const upcoming = { ...first, status: 'scheduled' as const, home: { ...first.home, score: null, result: null }, away: { ...first.away, score: null, result: null }, dateLocal: '2025-11-04T15:30:00', isTimeTba: false };
    const d1 = buildSdsBrackets(file, [upcoming]).find((d) => d.id === 'division-1')!;
    const card = sdsBracketView(d1, BEFORE).rounds[0].cards[0];
    expect(card, VIEW).toMatchObject({ status: 'scheduled', href: gameHref(first.contestId), time: 'Tue Nov 4 · 3:30 PM PT' });
    expect(card.sentence.join(''), VIEW).toBe('Poway (8) plays University City (9), Tue Nov 4, 3:30 PM PT.');
  });
});

describe('/playoffs with the Section’s brackets (lib/sds-bracket mocked to the 2025 file)', () => {
  // The Oct 2 corpus with the snapshot's day moved to Tue Nov 3, after the seeding meeting; the brackets come
  // through getSdsBrackets/getSdsBracketsSource, mocked to the 2025 file joined to its MaxPreps rows the way a
  // filled data/sds-brackets-2026.json would answer.
  const priorEnv = process.env.SCVAL_SNAPSHOT;
  const brackets = buildSdsBrackets(file, games);
  let html = '';

  beforeAll(async () => {
    const snap = JSON.parse(readFileSync(corpusSnapshotPath('all-2026-10-02'), 'utf8')) as Snapshot;
    snap.fetchedAt = '2026-11-03T12:00:00.000Z';
    const dir = mkdtempSync(path.join(tmpdir(), 'scvalfh-playoffs-sds-'));
    const snapFile = path.join(dir, 'snapshot.json');
    writeFileSync(snapFile, JSON.stringify(snap));
    process.env.SCVAL_SNAPSHOT = snapFile;
    vi.resetModules();
    vi.doMock('../../lib/sds-bracket', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../../lib/sds-bracket')>();
      return { ...actual, getSdsBrackets: () => brackets, getSdsBracketsSource: () => source };
    });
    const page = await import('../../app/playoffs/page');
    html = renderToStaticMarkup(page.default() as ReactElement);
  }, 600_000);

  afterAll(() => {
    vi.doUnmock('../../lib/sds-bracket');
    if (priorEnv === undefined) delete process.env.SCVAL_SNAPSHOT;
    else process.env.SCVAL_SNAPSHOT = priorEnv;
    vi.resetModules();
  });

  it('draws #sds-bracket once, in the SoCal block, after the round dates and outside the three conference cards', () => {
    expect(html.match(/id="sds-bracket"/g)?.length, PAGE).toBe(1);
    const socal = html.indexOf('<div id="socal" data-region-scope="socal"');
    const at = html.indexOf('id="sds-bracket"');
    expect(socal, PAGE).toBeGreaterThan(0);
    expect(at, PAGE).toBeGreaterThan(socal);
    expect(at, PAGE).toBeGreaterThan(html.indexOf('id="sds-round-dates"'));
    for (const id of ['city', 'north-county', 'metro']) {
      expect(at, `${PAGE}: before #${id}`).toBeLessThan(html.indexOf(`id="${id}"`));
      const card = elementById(html, id, 'div');
      expect(card, `${PAGE}: #${id}`).not.toBe('');
      expect(card, `${PAGE}: #${id} holds no bracket`).not.toContain('sds-bracket');
      expect(readable(card), `${PAGE}: #${id} SEED_CLAIM`).not.toMatch(SEED_CLAIM);
    }
    const section = elementById(html, 'sds-bracket', 'section');
    expect(section.match(/<h3[^>]*>[^<]*<\/h3>/g)?.length, PAGE).toBe(3);
    expect(section.match(/href="\/game\//g)?.length, PAGE).toBe(26);
  });

  it('says the brackets below are the Section’s, and keeps the SoCal copy rules', () => {
    const socal = html.slice(html.indexOf('<div id="socal" data-region-scope="socal"'));
    const text = textOf(socal);
    expect(text, PAGE).toContain('The Section has published its brackets; the brackets below are the Section’s, with results as MaxPreps posts them.');
    expect(text, PAGE).not.toContain('this site draws no bracket');
    // The SoCal block's own regex (tests/ui/playoff-view.test.ts, "the San Diego block states the Section’s rule").
    expect(text, PAGE).not.toMatch(/at-large|automatic qualifier|lowest-seeded|\bseed(ed|s)?\b(?! ?ing meeting)|eliminat/i);
    expectSanDiegoCopy(elementById(html, 'sds-bracket', 'section'), PAGE);
    expect(html, PAGE).not.toMatch(/eliminat/i);
  });
});

describe('the committed placeholder: nothing is drawn', () => {
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

  it('has no brackets, no source and no #sds-bracket, and the dated sentence is unchanged', () => {
    expect(getSdsBrackets(), 'lib/sds-bracket.ts').toBeNull();
    expect(getSdsBracketsSource(), 'lib/sds-bracket.ts').toBeNull();
    expect(html, PAGE).not.toContain('sds-bracket');
    expect(textOf(html), PAGE).toContain(
      'The Section places teams at its Sat Oct 31 seeding meeting and posts its brackets on its field hockey page afterwards; this site draws no bracket and projects no places.',
    );
  });
});
