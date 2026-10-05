/**
 * `components/history/history-view.ts` and `AwardsBlock` over the committed
 * data/history-2025-26.json: every award line on /history/2025-26 reads one way (player, then
 * school · grade · position, as the roster and /leaders print a player), in the site's words, with
 * the school linked, whatever the document wrote ("St Ignatius- Olivia Van de Braak", "Leaya Cleary Los Gatos 12", "GK", "Midfiled").
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import AwardsBlock from '../../components/history/AwardsBlock';
import {
  awardLine,
  awardTitle,
  overallAwards,
  rosterYear,
  splitOverallValue,
} from '../../components/history/history-view';
import { positionFromText } from '../../components/ui/position-words';
import { getAvailableHistoryLeagues, type HistoryAwards } from '../../lib/history';
import { getTeamBySlug } from '../../lib/teams';

const blocks: Array<{ leagueId: string; division: string; awards: HistoryAwards }> = getAvailableHistoryLeagues()
  .flatMap(({ id, entry }) =>
    entry.divisions.flatMap((d) =>
      [d.awards.varsity, d.awards.jv]
        .filter((a): a is HistoryAwards => a !== null)
        .map((awards) => ({ leagueId: id, division: d.division, awards })),
    ),
  );

const listed = (a: HistoryAwards) => [...a.firstTeam, ...a.secondTeam, ...a.honorableMention];

describe('positionFromText', () => {
  it('puts every document spelling in the roster’s words', () => {
    const cases: Array<[string | null, string | null]> = [
      ['Defender', 'Defense'],
      ['Defense', 'Defense'],
      ['GK', 'Goalkeeper'],
      ['Goalie', 'Goalkeeper'],
      ['Mid', 'Midfield'],
      ['Midfielder', 'Midfield'],
      ['Midfiled', 'Midfield'],
      ['Mid Center', 'Midfield'],
      ['Attack', 'Forward'],
      ['F, M', 'Forward / Midfield'],
      ['Forward/ D', 'Forward / Defense'],
      ['D, Goalie', 'Defense / Goalkeeper'],
      ['Midfield/F', 'Midfield / Forward'],
      ['Center Left', 'Midfield'],
      ['Sweeper', 'Sweeper'],
      [null, null],
    ];
    for (const [raw, words] of cases) expect(positionFromText(raw), String(raw)).toBe(words);
  });

  it('leaves no committed position outside the vocabulary', () => {
    const vocabulary = /^(Forward|Midfield|Defense|Goalkeeper)( \/ (Forward|Midfield|Defense|Goalkeeper))*$/;
    const outside = new Set<string>();
    for (const { leagueId, awards } of blocks) {
      for (const p of listed(awards)) {
        const words = awardLine(p).position;
        if (words !== null && !vocabulary.test(words)) outside.add(words);
      }
      for (const o of overallAwards(leagueId, awards)) {
        const words = o.winner?.position ?? null;
        if (words !== null && !vocabulary.test(words)) outside.add(words);
      }
    }
    expect([...outside]).toEqual([]);
  });
});

describe('awardTitle', () => {
  it('says "of the Year" the same way in both leagues', () => {
    expect(awardTitle('GK of the Year')).toBe('Goalkeeper of the Year');
    expect(awardTitle('Goalie of the Year')).toBe('Goalkeeper of the Year');
    expect(awardTitle('Offensive Player')).toBe('Offensive Player of the Year');
    expect(awardTitle('MVP')).toBe('MVP');
    const titles = new Set(blocks.flatMap(({ awards }) => awards.overall.map((o) => awardTitle(o.award))));
    for (const t of titles) expect(t, t).toMatch(/^(MVP|.+ of the Year)$/);
  });
});

describe('overall awards', () => {
  it('splits every shape the documents use', () => {
    expect(splitOverallValue('scval', 'St Ignatius- Olivia Van de Braak')).toEqual({
      player: 'Olivia Van de Braak', position: null, year: null, slug: 'st-ignatius',
    });
    expect(splitOverallValue('scval', 'Leaya Cleary Los Gatos 12')).toEqual({
      player: 'Leaya Cleary', position: null, year: 12, slug: 'los-gatos',
    });
    expect(splitOverallValue('scval', 'Brooklyn Barnard, Goalie, Presentation HS')).toEqual({
      player: 'Brooklyn Barnard', position: 'Goalie', year: null, slug: 'presentation',
    });
    expect(splitOverallValue('scval', 'Monisha Preetham, Monta Vista')).toEqual({
      player: 'Monisha Preetham', position: null, year: null, slug: 'monta-vista',
    });
    expect(splitOverallValue('bval', 'Elle Obenour, Leigh, Midfield')).toEqual({
      player: 'Elle Obenour', position: 'Midfield', year: null, slug: 'leigh',
    });
    // No school of the league, or too much left around it: printed as written.
    expect(splitOverallValue('scval', 'Elle Obenour, Leigh, Midfield')).toBeNull();
    expect(splitOverallValue('scval', 'A, B, C, Los Gatos')).toBeNull();
  });

  it('splits every committed overall award into a player of a registry school', () => {
    let n = 0;
    for (const { leagueId, division, awards } of blocks) {
      for (const o of overallAwards(leagueId, awards)) {
        n += 1;
        expect(o.winner, `${division} ${o.award}: ${o.value}`).not.toBeNull();
        expect(getTeamBySlug(o.winner!.slug!)?.name, o.value).toBe(o.winner!.school);
        expect(o.value, o.value).toContain(o.winner!.player);
      }
    }
    expect(n).toBe(26);
  });

  it('fills a grade from the same document first, then this season’s roster, and never against it', () => {
    const scval = blocks.find((b) => b.division === 'el-camino')!;
    const monisha = overallAwards('scval', scval.awards).find((o) => o.winner?.player === 'Monisha Preetham')!;
    // "Monisha Preetham, Monta Vista": her first-team line gives Midfield, 12th grade.
    expect(monisha.winner).toMatchObject({ position: 'Midfield', year: 12, school: 'Monta Vista' });
    const deAnza = blocks.find((b) => b.division === 'de-anza')!;
    const byAward = new Map(overallAwards('scval', deAnza.awards).map((o) => [o.award, o.winner!]));
    // "St Ignatius- Olivia Van de Braak": no grade or position anywhere in the document. This
    // season's St. Ignatius roster lists her as a junior, so she was a sophomore; her position
    // this season says nothing about last season's, so it stays unshown.
    expect(byAward.get('Offensive Player of the Year')).toMatchObject({ position: null, year: 10 });
    expect(rosterYear('st-ignatius', 'Olivia Van de Braak')).toBe(10);
    // "Los Altos- Alison Wilson": not on this season's roster, so no grade.
    expect(byAward.get('Defensive Player of the Year')).toMatchObject({ position: null, year: null });
    // What the award means: a Junior of the Year is in 11th grade, a Goalkeeper of the Year a goalkeeper.
    expect(byAward.get('Junior of the Year')!.year).toBe(11);
    expect(byAward.get('Goalkeeper of the Year')!.position).toBe('Goalkeeper');

    // Wherever the line, the player's team-list line and the award's class all give a grade, they agree.
    const classYear: Record<string, number> = { Senior: 12, Junior: 11, Sophomore: 10, Freshman: 9 };
    for (const { leagueId, awards } of blocks) {
      for (const o of awards.overall) {
        const split = splitOverallValue(leagueId, o.value)!;
        const own = listed(awards).find((p) => p.slug === split.slug && p.player === split.player);
        const cls = /\b(Senior|Junior|Sophomore|Freshman) of the Year$/.exec(o.award)?.[1];
        const years = [split.year, own?.year ?? null, cls ? classYear[cls] : null].filter((y) => y !== null);
        expect(new Set(years).size, o.value).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('AwardsBlock', () => {
  it('links every winner’s and listed player’s school to its team page', () => {
    for (const { division, awards } of blocks) {
      const html = renderToStaticMarkup(createElement(AwardsBlock, { awards, levelLabel: 'Varsity' }));
      const links = [...html.matchAll(/<a [^>]*href="\/teams\/([a-z0-9-]+)"/g)].map((m) => m[1]);
      expect(links.length, division).toBe(awards.overall.length + listed(awards).length);
      // No document spelling survives: the overall values are never printed as written.
      for (const o of awards.overall) expect(html, o.value).not.toContain(o.value);
      expect(html).not.toMatch(/\b(GK|Goalie|Defender|Midfielder|Midfiled)\b/);
    }
  });

  it('prints school · grade · position, the grade a word, as the roster and /leaders do', () => {
    const deAnza = blocks.find((b) => b.division === 'de-anza')!;
    const html = renderToStaticMarkup(createElement(AwardsBlock, { awards: deAnza.awards, levelLabel: 'Varsity' }));
    // Sophie Ghosh, Saint Ignatius, Midfield, 12 in the document.
    expect(html).toMatch(
      /Sophie Ghosh<\/span><span[^>]*><a [^>]*>St\. Ignatius<\/a><span>\u00a0· <span class="whitespace-nowrap">Senior<\/span><\/span><span>\u00a0· <span class="whitespace-nowrap">Midfield<\/span><\/span><\/span>/,
    );
    expect(html).not.toMatch(/\d(st|nd|rd|th)\sgrade/);
  });
});
