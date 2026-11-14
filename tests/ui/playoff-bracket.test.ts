/**
 * `components/playoffs/PlayoffBracket.tsx` rendered (the first render test of the live CCS bracket, plan
 * final-06, 2026-10-30), on the 2025 championship rebuilt on 2026's dates with 2025's seeds
 * (tests/fixtures/ccs/bracket-2025.ts): the seed digits, the `TBD` and `Winner of 1 v 8` slots, the winner's
 * 600-weight line with its 2px `--sx-text` inset rule, every named game card's link to its game page, and
 * what an unplayed card says (date and time or "time TBA", the location without MaxPreps' "@ ", the Tickets
 * and NFHS stream pills). The component reads the registry through lib/data for the mascot tiles; nothing
 * here depends on the bundled snapshot's games.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';

import { PlayoffBracket } from '../../components/playoffs/PlayoffBracket';
import { buildBrackets, type BracketPath } from '../../components/playoffs/bracket-model';
import { gameHref } from '../../lib/game-id';
import { shortDate } from '../../lib/format';
import { CCS } from '../../lib/league-config/sections';
import type { CcsPlayoffs, Game } from '../../lib/types';
import { ccsGames2025, ccsSeeds2025, unplayed } from '../fixtures/ccs/bracket-2025';
import { textOf } from './html-text';

const COMPONENT = 'components/playoffs/PlayoffBracket.tsx';
/** The retired winner bar (spec §5.6: the winner is the bold line, `data-won`, and nothing else). */
const WINNER_RULE = 'inset 2px 0 0 var(--sx-text)';

const playoffs: CcsPlayoffs = {
  keyDates: { ...CCS.keyDates },
  format: {
    elimination: 'single',
    ccsDivisions: CCS.ccsDivisions.map((d) => ({ name: d.name, seeds: [d.seeds[0], d.seeds[1]] })),
    autoQualifiers: { ...CCS.autoQualifiers },
    highSeedHostsThrough: 'quarterfinals',
  },
  bracketPublished: true,
  bracketUrl: CCS.bracketUrl,
  games: [],
};

const GAMES = ccsGames2025();
const SEEDS = ccsSeeds2025();

function render(path: BracketPath): string {
  return renderToStaticMarkup(createElement(PlayoffBracket, { path, headingLevel: 'h4' }));
}

function paths(games: Game[], seeds = SEEDS): BracketPath[] {
  return buildBrackets({ ...playoffs, games }, seeds);
}

/** The bracket's cells: one `.sx-tie` each, sliced out of the markup in order. */
function ties(html: string): string[] {
  return html.split(/<div (?:id="[^"]*" )?class="sx-tie(?: sx-target)?(?=")/).slice(1);
}

/** A cell's two lines, each with its `data-won` / `data-lost` mark and its text. */
function linesOf(tie: string): Array<{ won: boolean; lost: boolean; text: string }> {
  return tie
    .split('<div class="sx-tie-line"')
    .slice(1)
    .map((line) => {
      const open = line.slice(0, line.indexOf('>'));
      return { won: open.includes('data-won'), lost: open.includes('data-lost'), text: textOf(`<div${line}`) };
    });
}

describe('PlayoffBracket on the 2025 championship', () => {
  const [d1] = paths(GAMES);
  const html = render(d1);
  const text = textOf(html);

  it('is ONE bracket (no phone / desktop twin), each round an h3 with its day', () => {
    expect(html, COMPONENT).not.toContain('data-twin');
    expect(html.match(/class="sx-bracket/g)?.length, COMPONENT).toBe(1);
    expect([...html.matchAll(/<h3>([^<]*)<\/h3>/g)].map((m) => m[1]), COMPONENT).toEqual([
      `Quarterfinals, ${shortDate(CCS.keyDates.quarterfinals)}`,
      `Semifinals, ${shortDate(CCS.keyDates.semifinals)}`,
      `Final, ${shortDate(CCS.keyDates.finals)}`,
    ]);
    expect(html, COMPONENT).not.toContain('<h4');
    // Without JavaScript every round shows, stacked: the server marks them all, and the tab row is hidden.
    expect(html.match(/class="sx-round" data-current=""/g)?.length, COMPONENT).toBe(3);
    expect(html, COMPONENT).toMatch(/<nav class="sx-round-tabs sx-js-only[^"]*"/);
    expect([...html.matchAll(/<button type="button" class="sx-tab"[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]), COMPONENT).toEqual([
      'Quarterfinals',
      'Semifinals',
      'Final',
    ]);
    // Seven cells; the quarterfinals and the semifinals are paired for the connectors, the final is not.
    expect(ties(html), COMPONENT).toHaveLength(7);
    expect(html.match(/class="sx-tie-pair"/g)?.length, COMPONENT).toBe(3);
  });

  it('prints every seed beside its team as #n', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      expect(html.match(new RegExp(`<span class="sx-seed sx-num">#(?:<!-- -->)?${seed}</span>`, 'g'))?.length ?? 0, `${COMPONENT}: seed ${seed}`).toBeGreaterThan(0);
    }
    expect(text, COMPONENT).toContain('Quarterfinals');
    expect(text, COMPONENT).toContain('Semifinals');
    expect(text, COMPONENT).toContain('Final');
  });

  it('marks the winner’s line data-won and the other data-lost, with no bar and no star', () => {
    // Seven games, one winner and one loser each.
    expect(html.match(/class="sx-tie-line" aria-hidden="true"[^>]* data-won=""/g)?.length, COMPONENT).toBe(7);
    expect(html.match(/class="sx-tie-line" aria-hidden="true"[^>]* data-lost=""/g)?.length, COMPONENT).toBe(7);
    expect(html, COMPONENT).not.toContain(WINNER_RULE);
    expect(html, COMPONENT).not.toContain('style=');
    expect(html, COMPONENT).not.toContain('sx-pin-note');
    // The final: Los Gatos 3-0 Saint Francis. Away first: Saint Francis' line is the loser's, Los Gatos' the winner's.
    const final = ties(html).at(-1)!;
    expect(final.startsWith('" data-state="final"'), COMPONENT).toBe(true);
    const lines = linesOf(final);
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => [l.won, l.lost]), COMPONENT).toEqual([[false, true], [true, false]]);
    expect(lines[0].text.trim(), COMPONENT).toMatch(/^Saint Francis.* 0$/);
    expect(lines[1].text.trim(), COMPONENT).toMatch(/^Los Gatos.* 3$/);
    // Each line carries its team's slug (the pin hook), and each score is a figure of its own.
    expect(final, COMPONENT).toContain('data-team-slug="los-gatos"');
    expect(final.match(/<span class="sx-num sx-tie-score">\d+<\/span>/g)?.length, COMPONENT).toBe(2);
  });

  it('links every named game cell to its game page, once, with prefetch off', () => {
    for (const g of GAMES.filter((x) => x.bracket?.name === 'Division 1')) {
      expect(html, `${COMPONENT}: ${g.contestId}`).toContain(`href="${gameHref(g.contestId)}"`);
    }
    expect(html.match(/href="\/game\//g)?.length, COMPONENT).toBe(7);
    expect(html, COMPONENT).not.toContain('prefetch="true"');
    // A cell that links its game holds no other link: its team names are plain text.
    expect(html, COMPONENT).not.toContain('href="/teams/');
  });

  it('speaks each card as one sentence and hides the drawn lines', () => {
    expect(html, COMPONENT).toContain('<span class="sr-only">');
    expect(html, COMPONENT).toContain('aria-hidden="true"');
    // describeGame's sentence for a final, once per cell: 'Los Gatos 3, Saint Francis 0, final.'
    expect(text.split('Los Gatos 3, Saint Francis 0, final.').length - 1, COMPONENT).toBe(1);
  });

  it('never writes "eliminated" and renders no 0-0', () => {
    expect(html, COMPONENT).not.toMatch(/eliminat/i);
    expect(text, COMPONENT).not.toContain('0-0');
  });
});

describe('PlayoffBracket before the games exist', () => {
  it('seeds alone: four pairings with both seeds and names, semifinals naming the two schools each, a TBD final, no link', () => {
    const [d1] = paths([]);
    const html = render(d1);
    const text = textOf(html);
    expect(html, COMPONENT).not.toContain('href="/game/');
    for (const name of ['St. Ignatius', 'Palo Alto', 'Saint Francis', 'Gilroy', 'Leigh', 'Mitty', 'Los Gatos', 'Christopher']) {
      expect(text, COMPONENT).toContain(name);
    }
    // A semifinal place names the quarterfinal's two schools (2026-11-03), not "Winner of 1 v 8".
    for (const place of ['St. Ignatius or Palo Alto', 'Saint Francis or Gilroy', 'Leigh or Mitty', 'Los Gatos or Christopher']) {
      expect(text, COMPONENT).toContain(place);
    }
    expect(text, COMPONENT).not.toContain('Winner of');
    expect(text, COMPONENT).toContain('TBD');
    // The sentence a screen reader hears for a pairing.
    expect(text, COMPONENT).toContain('Quarterfinal: 8 Palo Alto v 1 St. Ignatius. Not listed on MaxPreps yet.');
    expect(text, COMPONENT).toContain('Semifinal: the winner of 1 St. Ignatius v 8 Palo Alto v the winner of 4 Saint Francis v 5 Gilroy. Not listed on MaxPreps yet.');
    expect(html, COMPONENT).not.toContain(WINNER_RULE);
  });

  it('a seeds-only cell has no state; a place two results away is drawn in the secondary grey', () => {
    const [d1] = paths([]);
    const html = render(d1);
    expect(html, COMPONENT).not.toContain('data-state=');
    expect(html, COMPONENT).toMatch(/<span class="sx-game-name [^"]*font-normal [^"]*text-ink-2">St\. Ignatius or Palo Alto<\/span>/);
    expect(html, COMPONENT).toMatch(/<span class="sx-game-name [^"]*font-normal [^"]*text-ink-2">TBD<\/span>/);
    // A seeded team with no game page yet: its name is a pointer-only link to its team page.
    expect(html, COMPONENT).toMatch(/<a tabindex="-1" class="sx-game-name sx-teamlink" href="\/teams\/st-ignatius">St\. Ignatius<\/a>/);
  });

  it('an unplayed game cell prints its start time in the score position, the location without "@ ", and Tickets / NFHS stream links', () => {
    const quarters = GAMES.filter((g) => g.dateKey === CCS.keyDates.quarterfinals && g.bracket?.name === 'Division 1');
    const [first, second, ...rest] = quarters;
    const ticketed = unplayed(first, { venue: '@ St. Ignatius College Preparatory', goFan: 'https://gofan.co/app/events/1' });
    const tba = unplayed(second, { timeTba: true, venue: null, nfhsStream: 'https://www.nfhsnetwork.com/events/cifccs/gam1' });
    const [d1] = paths([ticketed, tba, ...rest]);
    const html = render(d1);
    const text = textOf(html);
    const upcoming = ties(html).filter((t) => t.startsWith('" data-state="upcoming"'));
    expect(upcoming, COMPONENT).toHaveLength(2);
    // The round's heading carries the day; the cell carries the time where a score will be (never a score, never a dash).
    expect(text, COMPONENT).toContain(`Quarterfinals, ${shortDate(CCS.keyDates.quarterfinals)}`);
    const cellOf = (g: Game) => upcoming.find((t) => t.includes(gameHref(g.contestId)))!;
    expect(cellOf(ticketed), COMPONENT).toContain('<span class="sx-num sx-tie-time" aria-hidden="true">4:00 PM</span>');
    expect(cellOf(tba), COMPONENT).toContain('<span class="sx-num sx-tie-time" aria-hidden="true">TBD</span>');
    for (const cell of upcoming) expect(cell, COMPONENT).not.toContain('sx-tie-score');
    expect(text, COMPONENT).toContain('At St. Ignatius College Preparatory');
    expect(text, COMPONENT).not.toContain('@ St. Ignatius');
    expect(html, COMPONENT).toContain('href="https://gofan.co/app/events/1"');
    expect(html, COMPONENT).toContain('href="https://www.nfhsnetwork.com/events/cifccs/gam1"');
    expect(text, COMPONENT).toContain('Tickets');
    expect(text, COMPONENT).toContain('NFHS stream');
    // The links sit beside the game link, never inside it: an anchor holds no anchor.
    expect(html, COMPONENT).not.toMatch(/<a [^>]*href="\/game\/[^"]*"[^>]*>(?:(?!<\/a>)[\s\S])*<a /);
    // Both unplayed cells still link their game page and mark no winner; the two played quarterfinals do.
    expect(html, COMPONENT).toContain(`href="${gameHref(ticketed.contestId)}"`);
    expect(html, COMPONENT).toContain(`href="${gameHref(tba.contestId)}"`);
    expect(html.match(/ data-won=""/g)?.length, COMPONENT).toBe(2);
    for (const cell of upcoming) expect(cell, COMPONENT).not.toMatch(/data-won|data-lost/);
    expect(html, COMPONENT).not.toContain(WINNER_RULE);
  });
});
