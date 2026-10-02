/**
 * The team finder (components/search/TeamFinder.tsx, SPEC §9.3): its initial markup in both modes
 * (react-dom/server), its wiring to lib/search.ts, the pin-mode buttons' accessible names for all
 * 43 teams, and unique `useId` ids when a page renders two finders.
 */
import { Fragment, createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_FINDER_LABEL,
  PinResult,
  TeamFinder,
  TeamResultLink,
  finderView,
  pinResultDetail,
} from '../../components/search/TeamFinder';
import { getTeamSearchIndex } from '../../lib/data';
import { pinLabel } from '../../lib/pin-label';
import { searchTeams } from '../../lib/search';

const index = getTeamSearchIndex();

/** The accessible name of a button with no aria-label: all of its text, sr-only included. */
function textOf(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

/** What a sighted reader sees: the text with every sr-only span removed, per line. */
function visibleLines(html: string): string[] {
  const noSr = html.replace(/<span class="sr-only">[^<]*<\/span>/g, '');
  return [...noSr.matchAll(/<span class="[^"]*">([^<]*)<\/span>/g)].map((m) => textOf(m[1]));
}

describe('TeamFinder initial markup', () => {
  for (const mode of ['filter', 'pin'] as const) {
    it(`${mode} mode: a <search> landmark, a visible label, a plain search field, hidden without JS`, () => {
      const html = renderToStaticMarkup(
        createElement(TeamFinder, { index, mode, listId: 'team-list', hideWhileSearchingId: 'team-league-switcher' }),
      );
      expect(html.startsWith('<search class="sx-js-only')).toBe(true);
      expect(html).toContain(`>${DEFAULT_FINDER_LABEL}</label>`);
      expect(html).toMatch(/<input [^>]*type="search"/);
      expect(html).toContain('enterKeyHint="go"');
      expect(html).toContain('autoComplete="off"');
      expect(html).toContain('autoCapitalize="none"');
      expect(html).toContain('spellCheck="false"');
      expect(html).toContain('aria-live="polite"');
      // No combobox, no results, no searching flag before anything is typed.
      expect(html).not.toContain('combobox');
      expect(html).not.toContain('<button');
      expect(html).not.toContain('data-searching');
      // The label is tied to the field.
      const forId = /<label for="([^"]+)"/.exec(html)?.[1];
      expect(forId).toBeTruthy();
      expect(html).toContain(`<input id="${forId}"`);
    });
  }

  it('takes a custom label', () => {
    const html = renderToStaticMarkup(createElement(TeamFinder, { index, mode: 'pin', label: 'Find your school' }));
    expect(html).toContain('>Find your school</label>');
  });

  it('two instances on one page render unique ids', () => {
    const html = renderToStaticMarkup(
      createElement(
        Fragment,
        null,
        createElement(TeamFinder, { index, mode: 'pin', key: 'a' }),
        createElement(TeamFinder, { index, mode: 'pin', key: 'b' }),
      ),
    );
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThanOrEqual(4);
    expect(new Set(ids).size).toBe(ids.length);
    const fors = [...html.matchAll(/\sfor="([^"]+)"/g)].map((m) => m[1]);
    expect(fors).toHaveLength(2);
    for (const f of fors) expect(ids).toContain(f);
  });
});

describe('TeamFinder wiring to lib/search.ts', () => {
  it('has the 43-team index', () => {
    expect(index.teams).toHaveLength(43);
  });

  it('filter mode matches every team searchTeams matches, in its order, and lists none itself', () => {
    for (const q of ['santa', 'st', 'wildcats', 'san jose', 'marin', 'lyn']) {
      const view = finderView(index, q, 'filter');
      expect(view.matches.map((t) => t.slug), q).toEqual(searchTeams(index, q).teams.map((t) => t.entry.slug));
      expect(view.shown).toEqual([]);
      expect(view.more).toBe(false);
    }
  });

  it('pin mode shows at most 8 and offers the Teams page when more match', () => {
    const all = searchTeams(index, 'san').teams.length;
    const view = finderView(index, 'san', 'pin');
    expect(view.shown.length).toBe(Math.min(8, all));
    expect(view.more).toBe(all > 8);
    const three = finderView(index, 'san', 'pin', 3);
    expect(three.shown).toHaveLength(Math.min(3, all));
    expect(three.more).toBe(all > 3);
  });

  it('announces counts with real plurals', () => {
    // "santa": the Santa teams, the Santa Teresa division and — through its full name, Santa Clara
    // Valley Athletic League — the SCVAL league group.
    const santa = searchTeams(index, 'santa');
    const teams = santa.teams.length;
    const divisions = santa.groups.filter((g) => g.kind === 'division').length;
    const leagues = santa.groups.filter((g) => g.kind === 'league').length;
    expect(teams).toBeGreaterThan(1);
    expect(divisions).toBe(1);
    expect(finderView(index, 'santa', 'filter').message).toBe(
      leagues === 0
        ? `${teams} teams and 1 division match "santa".`
        : `${teams} teams, 1 division and ${leagues} ${leagues === 1 ? 'league' : 'leagues'} match "santa".`,
    );
    expect(finderView(index, 'Carmel', 'pin').message).toBe('1 team matches "Carmel".');
    expect(finderView(index, 'santa teresa', 'pin').message).toBe('1 division matches "santa teresa".');
    expect(finderView(index, 'wildcats', 'pin').message).toBe('4 teams match "wildcats".');
  });

  it('says what search covers when nothing matches, and the not-covered reason when that matches', () => {
    expect(finderView(index, 'xyz', 'pin').message).toBe(
      'No team matches "xyz". Search covers the 43 teams in SCVAL, BVAL, PCAL and MCAL.',
    );
    const york = finderView(index, 'york', 'filter');
    expect(york.notCovered).toHaveLength(1);
    expect(york.message).toBe(york.notCovered[0].reason);
  });

  it('a 1-character query is not a search', () => {
    const view = finderView(index, 's', 'filter');
    expect(view.matches).toEqual([]);
    expect(view.message).toBe('');
  });

  it('Gabilan finds nothing at all', () => {
    const view = finderView(index, 'Gabilan', 'pin');
    expect(view.matches).toEqual([]);
    expect(view.groups).toEqual([]);
    expect(view.notCovered).toEqual([]);
  });
});

describe('pin-mode result buttons', () => {
  it('every one of the 43: no aria-label, the name is the pin label, the visible text is inside it in order', () => {
    for (const entry of index.teams) {
      const html = renderToStaticMarkup(createElement(PinResult, { entry, onPick: () => {} }));
      expect(html.startsWith('<button type="button"'), entry.slug).toBe(true);
      expect(html, entry.slug).not.toContain('aria-label');

      const name = textOf(html);
      const label = pinLabel({
        name: entry.name,
        shortName: entry.shortName,
        divisionHeading: entry.divisionLabel,
        leagueShort: entry.leagueShort,
      });
      expect(name, entry.slug).toBe(label);
      expect(name.startsWith('Pin '), entry.slug).toBe(true);

      const [line1, line2] = visibleLines(html);
      expect(line1, entry.slug).toBe(entry.shortName);
      expect(line2, entry.slug).toBe(pinResultDetail(entry));
      // Label in name (WCAG 2.5.3): the visible words appear in the name, in order.
      const at1 = name.indexOf(line1);
      expect(at1, entry.slug).toBeGreaterThan(0);
      expect(name.indexOf(line2, at1 + line1.length), entry.slug).toBeGreaterThan(at1);
      // The name minus its sr-only words is exactly the visible text.
      expect(visibleLines(html).join(''), entry.slug).toBe(textOf(html.replace(/<span class="sr-only">[^<]*<\/span>/g, '')));
    }
  });

  it('the detail line is "<division heading> · <league short>", or the league alone', () => {
    const leigh = index.teams.find((t) => t.slug === 'leigh')!;
    expect(pinResultDetail(leigh)).toBe('Mt. Hamilton · BVAL');
    const tam = index.teams.find((t) => t.slug === 'tamalpais')!;
    expect(pinResultDetail(tam)).toBe('MCAL');
  });
});

describe('pin-mode results when this browser stores nothing', () => {
  it('each result is a plain link to the team page with the same visible text, not a pin button', () => {
    for (const entry of index.teams) {
      const html = renderToStaticMarkup(createElement(TeamResultLink, { entry }));
      expect(html, entry.slug).toMatch(new RegExp(`^<a [^>]*href="/teams/${entry.slug}"`));
      expect(html, entry.slug).not.toContain('<button');
      expect(textOf(html), entry.slug).toBe(`${entry.shortName}${pinResultDetail(entry)}`);
      expect(textOf(html).startsWith('Pin '), entry.slug).toBe(false);
    }
  });
});
