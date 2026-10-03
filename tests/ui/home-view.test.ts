/**
 * The home page's view models and rendered markup (SPEC §10.1, §8.2, §8.4), on the offline corpus
 * snapshot so league-specific values never move with a live fetch (SPEC §13.6).
 *
 * Every assertion names the module that produced the value (the repair policy routes on it).
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';

import { corpusSnapshotPath } from '../helpers';

import { POSTSEASON_LEAD, postseasonCardLine } from '../../components/home/home-types';

import { textOf } from './html-text';
import { width } from './text-metrics';

type HomeData = typeof import('../../components/home/home-data');

let home: HomeData;
let data: ReturnType<HomeData['getHomeData']>;
let leagues: typeof import('../../lib/leagues');
let pageHtml = '';
const panelHtml = new Map<string, string>();
let renderPanel: (id: string) => string;

const HD = 'components/home/home-data.ts';

beforeAll(async () => {
  process.env.SCVAL_SNAPSHOT = corpusSnapshotPath('all-2026-10-02');
  home = await import('../../components/home/home-data');
  leagues = await import('../../lib/leagues');
  const { default: HomePage } = await import('../../app/page');
  const { LeaguePanel } = await import('../../components/home/LeaguePanel');
  data = home.getHomeData();
  pageHtml = renderToStaticMarkup(createElement(HomePage));
  renderPanel = (id: string) => {
    const cached = panelHtml.get(id);
    if (cached) return cached;
    const panel = data.panels.find((p) => p.id === id);
    if (!panel) throw new Error(`${HD}: no panel for ${id}`);
    const html = renderToStaticMarkup(createElement(LeaguePanel, { panel }));
    panelHtml.set(id, html);
    return html;
  };
}, 600_000);

describe('home panels (components/home/home-data.ts → LeaguePanel)', () => {
  it('builds one panel per league, config order', () => {
    expect(data.panels.map((p) => p.id), `${HD}: panels`).toEqual(['scval', 'bval', 'pcal', 'mcal']);
    for (const p of data.panels) {
      const html = renderPanel(p.id);
      expect(html, `components/home/LeaguePanel.tsx: ${p.id} scope`).toContain(`data-scope="${p.id}"`);
      expect(html, `components/home/LeaguePanel.tsx: ${p.id} heading id`).toContain(`id="league-${p.id}"`);
      expect(textOf(html), `components/home/LeaguePanel.tsx: ${p.id} heading`).toContain(`${p.shortName} · ${p.name}`);
    }
  });

  it('the MCAL panel carries no CCS concept', () => {
    const text = textOf(renderPanel('mcal'));
    expect(text, `${HD}: MCAL panel`).not.toMatch(/automatic qualifier/i);
    expect(text, `${HD}: MCAL panel`).not.toMatch(/at-large/i);
    expect(text, `${HD}: MCAL panel`).not.toMatch(/CCS Division/i);
    expect(text, `${HD}: MCAL panel`).not.toMatch(/\bCCS\b/);
    const mcal = data.panels.find((p) => p.id === 'mcal')!;
    expect(mcal.postseason.kind, `${HD}: MCAL postseason`).toBe('league-tournament');
    if (mcal.postseason.kind === 'league-tournament') {
      expect(mcal.postseason.line, `${HD}: MCAL postseason line`).toBe(
        'MCAL tournament · Quarterfinals Mon Oct 26 (a play-in Fri Oct 23 only if needed) · Semifinals Wed Oct 28 · Final Fri Oct 30 at Tamalpais',
      );
      expect(mcal.postseason.link.href).toBe('/playoffs/mcal');
    }
    expect(renderPanel('mcal'), 'components/home/PostseasonCard.tsx: MCAL has no meter').not.toContain('sx-meter');
  });

  it('the CCS leagues show their berth sentence and CCS dates', () => {
    const labels = Object.fromEntries(
      data.panels.map((p) => [p.id, p.postseason.kind === 'ccs-ladder' ? p.postseason.meter.label : null]),
    );
    expect(labels.scval, `${HD}: SCVAL berth sentence`).toBe(
      'SCVAL holds 7 of the 16 CCS berths automatically: the top three in each division, plus the winner of the fourth-place play-in (By-Laws Article VII §1–2).',
    );
    expect(labels.bval, `${HD}: BVAL berth sentence`).toBe(
      'BVAL holds 4 of the 16 CCS berths automatically: Mt. Hamilton’s top three, plus the winner of the Oct 31 play-in (Mt. Hamilton #4 at the Santa Teresa champion).',
    );
    expect(labels.pcal, `${HD}: PCAL berth sentence`).toBe(
      'PCAL holds 2 of the 16 CCS berths automatically: the top two of the final standings.',
    );
    for (const id of ['scval', 'bval', 'pcal']) {
      const html = renderPanel(id);
      expect(html, `components/home/PostseasonCard.tsx: ${id} CCS link`).toContain(`href="/playoffs#${id}"`);
      expect(textOf(html), `components/home/PostseasonCard.tsx: ${id} dates`).toContain('Quarterfinals');
    }
  });

  it('PCAL and MCAL mini tables carry no division label', () => {
    for (const id of ['pcal', 'mcal']) {
      const panel = data.panels.find((p) => p.id === id)!;
      expect(panel.divisions.map((d) => d.heading), `${HD}: ${id} division heading`).toEqual([null]);
      const text = textOf(renderPanel(id));
      expect(text, `components/home/MiniStandings.tsx: ${id} kicker`).toContain('League table');
      expect(text, `components/home/MiniStandings.tsx: ${id}`).not.toMatch(/\b(PCAL|MCAL) Division\b/);
      expect(text, `components/home/MiniStandings.tsx: ${id}`).not.toMatch(/Gabilan/i);
    }
    const bval = data.panels.find((p) => p.id === 'bval')!;
    expect(bval.divisions.map((d) => d.heading), `${HD}: BVAL division headings`).toEqual(['Mt. Hamilton', 'Santa Teresa']);
  });

  it('the division `home` config drives each mini table', async () => {
    const { MiniStandings, miniShownCount } = await import('../../components/home/MiniStandings');
    const expected: Record<string, { rows: number; line: string | null }> = {
      'de-anza': { rows: 4, line: null },
      'el-camino': { rows: 4, line: null },
      'mt-hamilton': { rows: 4, line: 'AQ line' },
      'santa-teresa': { rows: 3, line: 'Play-in host' },
      pcal: { rows: 7, line: 'AQ line' },
      'marin-county': { rows: 7, line: 'Tournament line' },
    };
    for (const panel of data.panels) {
      for (const division of panel.divisions) {
        expect(division.home, `${HD}: ${division.id} home`).toEqual(leagues.getDivision(division.id).home);
        const html = renderToStaticMarkup(
          createElement(MiniStandings, {
            division,
            href: division.href,
            showDivisionLabel: division.heading !== null,
            home: division.home,
          }),
        );
        const want = expected[division.id];
        const rows = (html.match(/<tr data-team-slug=/g) ?? []).length;
        // `want.rows`, plus any team sharing the place at the cutoff.
        expect(rows, `components/home/MiniStandings.tsx: ${division.id} rows`).toBe(miniShownCount(division.rows, want.rows));
        expect(rows, `components/home/MiniStandings.tsx: ${division.id} rows`).toBeGreaterThanOrEqual(Math.min(want.rows, division.total));
        if (want.line) expect(textOf(html), `components/home/MiniStandings.tsx: ${division.id} line`).toContain(want.line);
        expect(html, `components/home/MiniStandings.tsx: ${division.id} GP column`).toContain('>GP</th>');
        expect(division.href, `${HD}: ${division.id} href`).toBe(`/standings/${panel.id}#${division.id}`);
      }
    }
    // The points legend: once per league, under its last table, citing the league's own rule.
    for (const panel of data.panels) {
      expect(panel.pointsLegend, `${HD}: ${panel.id} legend`).toBe(
        `PTS: ${leagues.getLeague(panel.id).rules.citations.points}.`,
      );
      const html = renderPanel(panel.id);
      expect(html.split(panel.pointsLegend).length - 1, `components/home/LeaguePanel.tsx: ${panel.id} legend once`).toBe(1);
    }
  });

  it('a place shared at the row cutoff is shown whole (Mt. Hamilton 4= pair), and nothing else stretches it', async () => {
    const { miniShownCount } = await import('../../components/home/MiniStandings');
    const row = (place: number, shared: boolean, hasResults = true) => ({ place, shared, hasResults });
    // 1, 2, 3, 4=, 4=, 6: four rows asked, both 4= teams shown.
    const tied = [row(1, false), row(2, false), row(3, false), row(4, true), row(4, true), row(6, false)];
    expect(miniShownCount(tied, 4)).toBe(5);
    // Three-way tie at the cutoff.
    expect(miniShownCount([row(1, false), row(2, true), row(2, true), row(2, true)], 2)).toBe(4);
    // The next row is a different shared cluster: no stretch.
    expect(miniShownCount([row(1, true), row(1, true), row(3, true), row(3, true)], 2)).toBe(2);
    // No tie at the cutoff, or no results yet: exactly the configured rows.
    expect(miniShownCount([row(1, false), row(2, false), row(3, false), row(4, false), row(5, false)], 4)).toBe(4);
    const unplayed = Array.from({ length: 6 }, () => row(1, true, false));
    expect(miniShownCount(unplayed, 4)).toBe(4);
    expect(miniShownCount([row(1, false)], 4)).toBe(1);
  });

  it('the other-leagues strip names each division leader', () => {
    const bval = data.panels.find((p) => p.id === 'bval')!;
    const scval = data.panels.find((p) => p.id === 'scval')!;
    const line = (panel: typeof bval, id: string) => panel.others.find((o) => o.id === id)?.text;
    expect(bval.others.map((o) => o.id), `${HD}: BVAL strip`).toEqual(['scval', 'pcal', 'mcal']);
    expect(line(bval, 'scval'), `${HD}: strip SCVAL`).toBe('St Francis leads De Anza · Mitty leads El Camino');
    expect(line(scval, 'bval'), `${HD}: strip BVAL`).toBe(
      'Christopher leads Mt. Hamilton · Prospect & Westmont lead Santa Teresa',
    );
    expect(line(scval, 'pcal'), `${HD}: strip PCAL`).toBe('Stevenson leads');
    expect(bval.others.every((o) => o.href === `/standings/${o.id}`), `${HD}: strip links`).toBe(true);
  });

  it('writes the phase copy per league (dates from config)', () => {
    const lead = (id: string, phase: Parameters<HomeData['phaseLead']>[1], today: string) =>
      home.phaseLead(leagues.getLeague(id), phase, today);
    expect(lead('mcal', 'regular', '2026-10-02'), `${HD}: regular renders nothing`).toBeNull();
    expect(lead('mcal', 'tournament', '2026-10-24'), `${HD}: MCAL tournament`).toEqual({
      lead: 'MCAL league play is over.',
      body: 'Quarterfinals are Mon Oct 26 (a play-in Fri Oct 23 only if needed); the final is Fri Oct 30 at Tamalpais.',
      link: { href: '/playoffs/mcal', label: 'Bracket' },
    });
    const bval = lead('bval', 'play-in', '2026-10-31');
    expect(`${bval?.lead} ${bval?.body}`, `${HD}: BVAL play-in`).toBe(
      'BVAL league play is over. Mt. Hamilton #4 plays at the Santa Teresa champion Sat Oct 31, 11 AM, for BVAL’s fourth automatic CCS berth; the CCS seeding meeting is Mon Nov 2.',
    );
    expect(bval?.link?.href).toBe('/playoffs#bval');
    const scval = lead('scval', 'crossover', '2026-10-29');
    expect(`${scval?.lead} ${scval?.body}`, `${HD}: SCVAL crossover`).toBe(
      'League play is over. The crossover games and the fourth-place play-in for SCVAL’s seventh automatic CCS berth are Fri Oct 30; the CCS seeding meeting is Mon Nov 2.',
    );
    const pcal = lead('pcal', 'playoffs', '2026-11-03');
    expect(`${pcal?.lead} ${pcal?.body}`, `${HD}: PCAL playoffs`).toBe(
      'PCAL league play is over. CCS seeds the 16-team field on Mon Nov 2; quarterfinals are Sat Nov 7.',
    );
    expect(lead('pcal', 'complete', '2026-11-20')?.link, `${HD}: no last-season link: PCAL history is unavailable`).toBeNull();
    expect(lead('mcal', 'complete', '2026-11-20')?.link).toBeNull();
    expect(lead('scval', 'complete', '2026-11-20')?.link?.href).toBe('/history/2025-26#scval');
    expect(lead('bval', 'complete', '2026-11-20')?.link?.href).toBe('/history/2025-26#bval');
  });
});

describe('first visit (components/home/FindYourTeam.tsx, LeagueCard.tsx)', () => {
  it('has a card per league with its facts and both ways on', async () => {
    const { LeagueCard } = await import('../../components/home/LeagueCard');
    expect(data.leagueCards.map((c) => c.id), `${HD}: cards`).toEqual(['scval', 'bval', 'pcal', 'mcal']);
    const bval = data.leagueCards.find((c) => c.id === 'bval')!;
    expect(bval, `${HD}: BVAL card`).toMatchObject({
      shortName: 'BVAL',
      name: 'Blossom Valley Athletic League',
      teamsLine: '12 teams',
      divisions: ['Mt. Hamilton', 'Santa Teresa'],
      region: 'San Jose, Campbell, Saratoga, Morgan Hill and Gilroy',
    });
    expect(data.leagueCards.find((c) => c.id === 'pcal')?.divisions, `${HD}: PCAL card`).toEqual([]);
    expect(data.leagueCards.find((c) => c.id === 'mcal')?.sectionShort, `${HD}: MCAL card`).toBe('NCS');
    for (const card of data.leagueCards) {
      const html = renderToStaticMarkup(createElement(LeagueCard, { card }));
      expect(textOf(html), `components/home/LeagueCard.tsx: ${card.id}`).toContain(`Show ${card.shortName} here`);
      expect(html, `components/home/LeagueCard.tsx: ${card.id} link`).toContain(`href="/standings/${card.id}"`);
      expect(html, 'components/home/SetLeagueButton.tsx: js-only, disabled before hydration').toMatch(
        /<button[^>]*disabled=""[^>]*class="sx-js-only/,
      );
    }
  });
});

describe('the rendered home page (app/page.tsx)', () => {
  it('has one data-scope section per league, a first-visit block and the always-on chrome', () => {
    for (const id of ['scval', 'bval', 'pcal', 'mcal']) {
      expect(pageHtml.split(`<section data-scope="${id}"`).length - 1, `app/page.tsx: ${id} panel`).toBe(1);
    }
    expect(pageHtml, 'components/home/FindYourTeam.tsx: first-visit block').toMatch(
      /<section data-scope="none" aria-labelledby="find-your-team"/,
    );
    expect(textOf(pageHtml)).toContain('Find your team');
    expect(pageHtml, 'app/page.tsx: My-team slot').toMatch(/<section data-scope="all" class="sx-myteam-slot[^"]*" aria-labelledby="my-team-heading"/);
    expect(pageHtml, 'app/page.tsx: h1').toContain('NorCal field hockey');
    expect(textOf(pageHtml), 'app/page.tsx: status line').toMatch(
      /Results through \w{3} \w{3} \d{1,2} · 43 teams · SCVAL · BVAL · PCAL · MCAL/,
    );
  });

  it('keeps every id unique', () => {
    const ids = [...pageHtml.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes, 'app/page.tsx: duplicate ids').toEqual([]);
    for (const id of ['my-team-heading', 'find-your-team', 'league-scval', 'league-bval', 'league-pcal', 'league-mcal']) {
      expect(ids, `app/page.tsx: #${id}`).toContain(id);
    }
  });

  it('never renders Gabilan, "eliminated", a league hue or a game link that skips gameHref', () => {
    const text = textOf(pageHtml);
    expect(text, 'app/page.tsx').not.toMatch(/Gabilan/i);
    expect(text, 'app/page.tsx').not.toMatch(/eliminated/i);
    expect(pageHtml, 'app/page.tsx: no league hue').not.toMatch(/--sx-league|league-hue|data-league-hue/);
    expect(pageHtml, 'app/page.tsx: sblive game links use gameHref').not.toMatch(/href="\/game\/sblive:/);
  });
});

describe('the pinned card (components/home/MyTeamCard.tsx ← home-data.ts team views)', () => {
  it('has a view for all 43 teams with the meta, played and postseason lines', async () => {
    const { PinnedCard } = await import('../../components/home/MyTeamCard');
    expect(data.teamViews, `${HD}: team views`).toHaveLength(43);
    const leigh = data.teamViews.find((v) => v.team.slug === 'leigh')!;
    expect(leigh.meta, `${HD}: meta`).toBe('3rd · Mt. Hamilton · BVAL');
    expect(leigh.played, `${HD}: played`).toBe('3 of 10 played');
    expect(leigh.postseason, `${HD}: postseason line`).toBe('If the season ended today: Automatic qualifier');
    expect(postseasonCardLine(leigh), `${HD}: postseason card line`).toBe('Today: Automatic qualifier');
    expect(leigh.postseasonShort, `${HD}: no tie, no second copy of the line`).toBeUndefined();
    expect(leigh.tableHref).toBe('/standings/bval#mt-hamilton');
    const tam = data.teamViews.find((v) => v.team.slug === 'tamalpais')!;
    expect(tam.meta, `${HD}: single-division meta`).toBe('1st · MCAL');
    for (const v of data.teamViews) {
      if (!v.hasResults) expect(v.postseason, `${HD}: ${v.team.slug} gp 0 has no postseason line`).toBeNull();
      const html = renderToStaticMarkup(createElement(PinnedCard, { view: v, onUnpin: () => {} }));
      expect(html, `components/home/MyTeamCard.tsx: ${v.team.slug} unpin id`).toContain('id="my-team-unpin"');
      if (v.postseason) expect(textOf(html)).toContain(v.postseason);
      const card = postseasonCardLine(v);
      if (card) expect(textOf(html)).toContain(card);
      expect(card === null, `${HD}: ${v.team.slug} card line iff line`).toBe(v.postseason === null);
    }
  });

  it('"Last" is the newest PLAYED game: a score-pending one shows as unreported, never as a final', async () => {
    const d = await import('../../lib/data');
    const { describeGame } = await import('../../components/ui/game-view');
    const { gameHref } = await import('../../lib/game-id');
    const { PinnedCard } = await import('../../components/home/MyTeamCard');
    let pending = 0;
    for (const v of data.teamViews) {
      const team = d.getTeamBySlug(v.team.slug)!;
      const played = d
        .getGames({ teamId: team.id })
        .filter((g) => (g.status === 'final' || g.status === 'score-pending') && g.dateKey <= data.today)
        .sort((a, b) => a.dateLocal.localeCompare(b.dateLocal) || a.away.name.localeCompare(b.away.name));
      const newest = played.at(-1);
      expect(v.last?.href ?? null, `${HD}: ${v.team.slug} last`).toBe(newest ? gameHref(newest.contestId) : null);
      if (!newest || !v.last) continue;
      expect(Object.hasOwn(v.last, 'recap'), `${HD}: ${v.team.slug} carries no recap`).toBe(false);
      const unreported = describeGame(newest, v.team.slug).kind === 'unreported';
      expect(v.last.display.kind, `${HD}: ${v.team.slug} last kind`).toBe(unreported ? 'unreported' : 'final');
      if (!unreported) continue;
      pending += 1;
      const text = textOf(renderToStaticMarkup(createElement(PinnedCard, { view: v, onUnpin: () => {} })));
      expect(text, `components/home/MyTeamCard.tsx: ${v.team.slug} unreported last`).toMatch(/score not reported/i);
      if (v.last.display.note) expect(text, `components/home/MyTeamCard.tsx: ${v.team.slug} note`).toContain(v.last.display.note);
    }
    // The corpus has at least one such team, so the unreported branch is never vacuous.
    expect(pending, `${HD}: a newest played game that is score-pending`).toBeGreaterThan(0);
  });

  // The card text is 288px wide at 320 (px-4 in a 320px card); the line is one truncated h-6 row,
  // so the STATUS must fit whole or the reader sees only the prefix. Widths: tests/ui/text-metrics.ts
  // (Geist 12px/500) scaled to the 14px meta size — an over-estimate for the 400 weight.
  const CARD_TEXT_PX = 288;
  const at14 = (s: string) => (width(s) * 14) / 12;

  it('the postseason card line fits one 320px line for every team (corpus)', () => {
    for (const v of data.teamViews) {
      const card = postseasonCardLine(v);
      if (!card) continue;
      expect(at14(card), `${HD}: ${v.team.slug} "${card}"`).toBeLessThanOrEqual(CARD_TEXT_PX);
    }
  });

  it('every ladder label, and every two-rung tie, fits that line in every league', () => {
    for (const league of leagues.LEAGUES) {
      const rungs = league.postseason.ladder;
      for (const division of league.divisions) {
        const mine = rungs.filter((r) => r.divisions === '*' || r.divisions.includes(division.id));
        for (const lead of Object.values(POSTSEASON_LEAD).map((l) => l.short)) {
          for (const r of mine) {
            const line = `${lead} ${r.label}`;
            expect(at14(line), `${HD}: ${division.id} "${line}"`).toBeLessThanOrEqual(CARD_TEXT_PX);
          }
          for (let i = 0; i + 1 < mine.length; i++) {
            const line = `${lead} ${mine[i].badge} or ${mine[i + 1].badge} (tied)`;
            expect(at14(line), `${HD}: ${division.id} "${line}"`).toBeLessThanOrEqual(CARD_TEXT_PX);
          }
        }
      }
    }
  });
});

describe('root OG card rows (home-data.ts leagueRowText, app/opengraph-image.tsx)', () => {
  it('names each division leader with points, co-leaders capped at two', () => {
    const row = (id: string) =>
      home.leagueRowText(
        leagues.getLeague(id).divisions.map((d) => ({ id: d.id, heading: leagues.divisionHeading(d.id) })),
      );
    expect(row('scval'), `${HD}: OG SCVAL`).toBe('De Anza: St Francis 12 pts · El Camino: Mitty 15 pts');
    expect(row('bval'), `${HD}: OG BVAL`).toBe('Mt. Hamilton: Christopher 6 pts · Santa Teresa: Prospect & Westmont 6 pts');
    expect(row('pcal'), `${HD}: OG PCAL`).toBe('Stevenson 18 pts');
    expect(home.leaderNames(['A', 'B', 'C', 'D']), `${HD}: OG co-leaders`).toBe('A & B +2');
    expect(home.leaderNames(['A', 'B']), `${HD}: OG co-leaders`).toBe('A & B');
  });
});
