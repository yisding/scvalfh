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
import { CCS } from '../../lib/leagues';
import type { CcsPlayoffs, Game } from '../../lib/types';
import { ccsGames2025, ccsSeeds2025, unplayed } from '../fixtures/ccs/bracket-2025';
import { textOf } from './html-text';

const COMPONENT = 'components/playoffs/PlayoffBracket.tsx';
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

/** The desktop twin (the second `data-twin` list), where the bracket-specific card markup lives. */
function desktop(html: string): string {
  const at = html.lastIndexOf('<ol data-twin');
  return html.slice(at);
}

describe('PlayoffBracket on the 2025 championship', () => {
  const [d1] = paths(GAMES);
  const html = render(d1);
  const text = textOf(html);

  it('prints every seed digit beside its team, in both twins', () => {
    const d = desktop(html);
    // 1 St. Ignatius v 8 Palo Alto on the first card: the digits as their own spans.
    expect(d, COMPONENT).toMatch(/<span class="sx-num[^"]*">1<\/span>/);
    expect(d, COMPONENT).toMatch(/<span class="sx-num[^"]*">8<\/span>/);
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      expect(d.match(new RegExp(`<span class="sx-num[^"]*">${seed}</span>`, 'g'))?.length ?? 0, `${COMPONENT}: seed ${seed}`).toBeGreaterThan(0);
    }
    expect(text, COMPONENT).toContain('Quarterfinals');
    expect(text, COMPONENT).toContain('Semifinals');
    expect(text, COMPONENT).toContain('Final');
  });

  it('marks the winner’s line with the 2px inset rule and nothing on the loser’s', () => {
    const d = desktop(html);
    // Seven games, one winner each in the desktop twin.
    expect(d.match(new RegExp(WINNER_RULE.replace(/[()]/g, '\\$&'), 'g'))?.length, COMPONENT).toBe(7);
    // The final: Los Gatos 3-0 Saint Francis — Los Gatos' line carries the rule, Saint Francis' does not.
    const final = d.slice(d.lastIndexOf('<li class="flex min-w-0 items-center">'));
    const lines = [...final.matchAll(/<span class="flex items-center gap-2 py-1 pr-2 pl-2"( style="[^"]*")?>/g)];
    expect(lines).toHaveLength(2);
    expect(lines.map((m) => (m[1] ?? '').includes(WINNER_RULE)), COMPONENT).toEqual([false, true]);
    expect(textOf(final), COMPONENT).toMatch(/Saint Francis.*Los Gatos/);
  });

  it('links every named game card to its game page, with prefetch off', () => {
    const d = desktop(html);
    for (const g of GAMES.filter((x) => x.bracket?.name === 'Division 1')) {
      expect(d, `${COMPONENT}: ${g.contestId}`).toContain(`href="${gameHref(g.contestId)}"`);
    }
    expect(d.match(/href="\/game\//g)?.length, COMPONENT).toBe(7);
    expect(html, COMPONENT).not.toContain('prefetch="true"');
  });

  it('speaks each card as one sentence and hides the drawn lines', () => {
    expect(html, COMPONENT).toContain('<span class="sr-only">');
    expect(html, COMPONENT).toContain('aria-hidden="true"');
    // describeGame's sentence for a final, once per card (both twins): 'Los Gatos 3, Saint Francis 0, final.'
    expect(text, COMPONENT).toContain('Los Gatos 3, Saint Francis 0, final.');
  });

  it('never writes "eliminated" and renders no 0-0', () => {
    expect(html, COMPONENT).not.toMatch(/eliminat/i);
    expect(text, COMPONENT).not.toContain('0-0');
  });
});

describe('PlayoffBracket before the games exist', () => {
  it('seeds alone: four pairings with both seeds and names, "Winner of 1 v 8" semifinals, a TBD final, no link', () => {
    const [d1] = paths([]);
    const html = render(d1);
    const text = textOf(html);
    expect(html, COMPONENT).not.toContain('href="/game/');
    for (const name of ['St. Ignatius', 'Palo Alto', 'Saint Francis', 'Gilroy', 'Leigh', 'Mitty', 'Los Gatos', 'Christopher']) {
      expect(text, COMPONENT).toContain(name);
    }
    expect(text, COMPONENT).toContain('Winner of 1 v 8');
    expect(text, COMPONENT).toContain('Winner of 4 v 5');
    expect(text, COMPONENT).toContain('Winner of 3 v 6');
    expect(text, COMPONENT).toContain('Winner of 2 v 7');
    expect(text, COMPONENT).toContain('TBD');
    // The sentence a screen reader hears for a pairing.
    expect(text, COMPONENT).toContain('Quarterfinal: 8 Palo Alto v 1 St. Ignatius. Not listed on MaxPreps yet.');
    expect(text, COMPONENT).toContain('Semifinal: the winner of 4 v 5 v the winner of 1 v 8. Not listed on MaxPreps yet.');
    expect(html, COMPONENT).not.toContain(WINNER_RULE);
  });

  it('an unplayed game card prints its date and time, the location without "@ ", and Tickets / NFHS stream pills', () => {
    const quarters = GAMES.filter((g) => g.dateKey === CCS.keyDates.quarterfinals && g.bracket?.name === 'Division 1');
    const [first, second, ...rest] = quarters;
    const ticketed = unplayed(first, { venue: '@ St. Ignatius College Preparatory', goFan: 'https://gofan.co/app/events/1' });
    const tba = unplayed(second, { timeTba: true, venue: null, nfhsStream: 'https://www.nfhsnetwork.com/events/cifccs/gam1' });
    const [d1] = paths([ticketed, tba, ...rest]);
    const html = render(d1);
    const d = desktop(html);
    const text = textOf(d);
    expect(text, COMPONENT).toContain('Sat Nov 7 · 4:00 PM PT');
    expect(text, COMPONENT).toContain('St. Ignatius College Preparatory');
    expect(text, COMPONENT).not.toContain('@ St. Ignatius');
    expect(text, COMPONENT).toContain('Sat Nov 7 · time TBA');
    expect(d, COMPONENT).toContain('href="https://gofan.co/app/events/1"');
    expect(d, COMPONENT).toContain('href="https://www.nfhsnetwork.com/events/cifccs/gam1"');
    expect(text, COMPONENT).toContain('Tickets');
    expect(text, COMPONENT).toContain('NFHS stream');
    // The pills sit beside the game link, never inside it: an anchor holds no anchor.
    expect(d, COMPONENT).not.toMatch(/<a [^>]*href="\/game\/[^"]*"[^>]*>(?:(?!<\/a>)[\s\S])*<a /);
    // Both unplayed cards still link their game page and show no winner rule or score.
    expect(d, COMPONENT).toContain(`href="${gameHref(ticketed.contestId)}"`);
    expect(d, COMPONENT).toContain(`href="${gameHref(tba.contestId)}"`);
    expect(d.match(new RegExp(WINNER_RULE.replace(/[()]/g, '\\$&'), 'g'))?.length ?? 0, COMPONENT).toBe(2);
  });
});
