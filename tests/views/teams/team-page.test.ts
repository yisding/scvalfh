/**
 * The /teams/[slug] page (SPEC §10.5, §10.9; views/teams/team-page.ts → app/teams/[slug]/page.tsx and
 * components/teams/*): the page's sections, the Southern California pages, the NEXT card and identity place line,
 * and a team with no results. The "no results" case (gp 0) does not occur in the corpus, so that block runs on a
 * copy of it with one MCAL team's results zeroed.  League-specific values are asserted on the all-2026-10-02 CORPUS
 * snapshot (SPEC §13.6), loaded through useCorpusModules (tests/support/team-view.ts), so live fetch #2 cannot break
 * them. Every assertion message names the module that produced the value, so a failure routes to its owner.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ordinal } from '@/lib/format/numbers';
import type { Snapshot } from '@/lib/model/snapshot';
import { CORPUS_HOOK_TIMEOUT, withSnapshotModules } from '@/tests/support/corpus-modules';
import { corpusSnapshotPath } from '@/tests/support/corpus-snapshot';
import { textOf } from '@/tests/support/html-text';
import { tempDir } from '@/tests/support/repo';
import { loaders, type Modules, pageRenderers, m, renderTeam, describeTeam } from '@/tests/support/team-view';

describe('Southern California team pages (DESIGN-socal §2.4)', () => {
  it('league copy: the Sunset has no playoffs to promise; a San Diego league waits for the Section', () => {
    const sunset = m.view.leagueCopy('sunset');
    expect(sunset.postseasonKind).toBe('no-postseason');
    expect(sunset.postseasonName).toBeNull();
    expect(sunset.seasonEndSentence).toBe('The Sunset season ends Sat Oct 31.');
    expect(sunset.bracketSentence).toMatch(/^The CIF Southern Section holds no field hockey playoffs/);
    const city = m.view.leagueCopy('city');
    expect(city.postseasonKind).toBe('section-playoffs');
    expect(city.postseasonName).toBe('San Diego Section playoffs');
    expect(city.seasonEndSentence).toBe('The City league season ends Fri Oct 30; the San Diego Section playoffs follow, Nov 2–14.');
    expect(city.bracketSentence).toBe('We will list a playoff game as soon as the Section publishes its brackets after its Sat Oct 31 seeding meeting.');
    expect(city.classification).toBe('membership');
  });

  it('a Sunset page: kicker "Postseason", the league note whatever it has played, no projection, GP bare', async () => {
    const v = m.view.buildTeamPageView('huntington-beach')!;
    expect(v.leagueScheduled, 'views/teams/team-view.ts no fixed schedule').toBeNull();
    expect(v.postseasonLine?.href).toBe('/playoffs#sunset');
    const text = textOf(await renderTeam('huntington-beach'));
    expect(text).toContain('Postseason');
    expect(text).toContain('The CIF Southern Section holds no field hockey playoffs');
    expect(text, 'components/teams/TeamPlayoffLine.tsx').not.toContain('Projected from the table today');
    expect(text).not.toMatch(/\bof null\b|\/null|CCS|at-large|automatic qualifier|eliminat/i);
    expect(text, 'components/teams/TeamElo.tsx: one fit').toMatch(/Elo rating/);
  });

  it('a San Diego page: the Section picture kicker, its own region\u2019s Elo board, no CCS word', async () => {
    const v = m.view.buildTeamPageView('poway')!;
    expect(v.elo.boardHref).toBe('/leaders#elo-rating-socal');
    expect(v.elo.boardRegion).toBe('SoCal');
    const html = await renderTeam('poway');
    const text = textOf(html);
    expect(text).toContain('San Diego Section playoffs picture');
    expect(html).toContain('href="/leaders#elo-rating-socal"');
    expect(text).not.toMatch(/CCS|at-large|automatic qualifier|lowest-seeded|eliminat/i);
    const norcal = m.view.buildTeamPageView('leigh')!;
    expect(norcal.elo.boardHref).toBe('/leaders#elo-rating');
  });
});

describe('TeamPlayoffLine without a result (the EAL in the all-2026-10-02 corpus)', () => {
  it('names the Super Regional picture, not a playoff or a CCS one', async () => {
    const { TeamPlayoffLine } = await import('@/components/teams/TeamPlayoffLine');
    const lassen = m.view.buildTeamPageView('lassen')!;
    expect(lassen.hasResults, 'the all corpus holds no EAL league result').toBe(false);
    const text = textOf(renderToStaticMarkup(createElement(TeamPlayoffLine, { view: lassen })));
    expect(text, 'components/teams/TeamPlayoffLine.tsx').toContain(
      'Lassen has no counted EAL result, so it has no computed place in the Super Regional picture.',
    );
    expect(text, 'components/teams/TeamPlayoffLine.tsx').not.toContain('CCS');
    const mcal = textOf(renderToStaticMarkup(createElement(TeamPlayoffLine, {
      view: { ...m.view.buildTeamPageView('tamalpais')!, postseasonLine: null },
    })));
    expect(mcal, 'components/teams/TeamPlayoffLine.tsx MCAL').toContain('in the MCAL tournament picture.');
    const scval = textOf(renderToStaticMarkup(createElement(TeamPlayoffLine, {
      view: { ...m.view.buildTeamPageView('st-ignatius')!, postseasonLine: null },
    })));
    expect(scval, 'components/teams/TeamPlayoffLine.tsx SCVAL').toContain('in the playoff picture.');
  });
});

describe('/teams/[slug] pages (app/teams/[slug]/page.tsx)', () => {
  it('CCS vs MCAL copy: kicker and meta description', async () => {
    const scval = textOf(await renderTeam('st-ignatius'));
    expect(scval, 'app/teams/[slug]/page.tsx SCVAL kicker').toContain('CCS picture');
    expect(await describeTeam('st-ignatius'), 'app/teams/[slug]/page.tsx SCVAL description').toMatch(
      /… ?goal margins and CCS picture\.$|goal margins and CCS picture\.$/,
    );
    expect(await describeTeam('tamalpais'), 'app/teams/[slug]/page.tsx MCAL description').toMatch(
      /goal margins and MCAL tournament picture\.$/,
    );
    expect(await describeTeam('davis'), 'app/teams/[slug]/page.tsx EAL description').toMatch(
      /goal margins and Super Regional picture\.$/,
    );
  });

  it('no CCS concept inside an MCAL team page (SPEC §10.9), for all nine', async () => {
    for (const team of m.data.getTeams({ league: 'mcal' })) {
      const html = await renderTeam(team.slug);
      const text = textOf(html);
      expect(text, `app/teams/[slug]/page.tsx ${team.slug}`).toContain('MCAL tournament picture');
      for (const banned of ['automatic qualifier', 'at-large', 'CCS picture', 'CCS Division', 'Gabilan', 'eliminated']) {
        expect(text.toLowerCase().includes(banned.toLowerCase()), `app/teams/[slug]/page.tsx ${team.slug}: "${banned}"`).toBe(false);
      }
      expect(text, `app/teams/[slug]/page.tsx ${team.slug}: division label`).not.toMatch(/MCAL Division|Marin County Division/);
      expect(html, `app/teams/[slug]/page.tsx ${team.slug}: standings link`).toContain('href="/standings/mcal#marin-county"');
    }
  });

  it('every page: identity line, pin control with its league, league links, never 0-0 for a missing score', async () => {
    for (const team of m.data.getTeams()) {
      const v = m.view.buildTeamPageView(team.slug)!;
      const html = await renderTeam(team.slug);
      const text = textOf(html);
      expect(text, `components/teams/TeamIdentity.tsx ${team.slug}`).toContain(v.identityLine);
      expect(html, `app/teams/[slug]/page.tsx ${team.slug} standings`).toContain(`href="${v.standingsHref}"`);
      // An LA independent (DESIGN §24.10, §24.11): the standings link reads 'LA standings', and its GP tile prints
      // the bare count, as the Sunset's does (no fixed schedule).
      if (m.leagues.isIndependentLeague(team.league)) {
        expect(text, `app/teams/[slug]/page.tsx ${team.slug} group link`).toContain('LA standings →');
        expect(v.context!.scheduled, `views/teams/team-view.ts ${team.slug} scheduled`).toBeNull();
        expect(text, `components/teams/TeamStatTiles.tsx ${team.slug} GP`).toMatch(new RegExp(`GP\\s*${v.context!.counted}\\b`));
        expect(html, `app/teams/[slug]/page.tsx ${team.slug}`).not.toContain('Gabilan');
        continue;
      }
      expect(text, `app/teams/[slug]/page.tsx ${team.slug} standings label`).toContain(`${v.league.shortName} standings`);
      // A league with no fixed schedule (the Sunset) prints the bare count: no "of N" (DESIGN-socal §2.1.7).
      if (v.context!.scheduled === null) {
        expect(text, `components/teams/TeamStatTiles.tsx ${team.slug} GP`).toMatch(new RegExp(`GP\\s*${v.context!.counted}\\b`));
        expect(text, `components/teams/TeamStatTiles.tsx ${team.slug} GP`).not.toMatch(/\/null|of null/);
      } else expect(text, `components/teams/TeamStatTiles.tsx ${team.slug} GP`).toContain(
        `${v.context!.counted}/${v.context!.scheduled}`,
      );
      expect(html, `app/teams/[slug]/page.tsx ${team.slug}`).not.toContain('Gabilan');
      expect(html, `app/teams/[slug]/page.tsx ${team.slug} game links`).not.toMatch(/href="\/game\/sblive:/);
      if (team.league === 'pcal' || team.league === 'mcal') {
        expect(text, `app/teams/[slug]/page.tsx ${team.slug}: division label`).not.toMatch(/PCAL Division|MCAL Division/);
      }
    }
  });

  it('the margin strip spans the division\'s scheduled league games, never a phantom 14-game season', async () => {
    const PHONE_CELL = 'flex flex-col items-center min-w-3 max-w-14 flex-1';
    // A slate longer than 14 (MCAL's 16) takes the 20px desktop floor at a 24px pitch, so it fits
    // the 380px plot of a half-width card at 1024px (components/ui/MarginStrip.tsx).
    const desktopCell = (slots: number) =>
      `flex flex-col items-center ${slots > 14 ? 'min-w-5' : 'min-w-6'} max-w-14 flex-1`;
    let checked = 0;
    for (const division of m.leagues.ALL_DIVISIONS) {
      for (const team of m.data.getTeams(division.id)) {
        const v = m.view.buildTeamPageView(team.slug)!;
        if (!v.marginEntries.some((e) => e.margin !== null && !e.excludedFromMargin)) continue;
        const html = await renderTeam(team.slug);
        // A league with no fixed schedule (the Sunset, gamesPerTeam null) draws only the games it has.
        const slots = division.gamesPerTeam ?? v.marginEntries.length;
        const expected = Math.max(slots, v.marginEntries.length);
        const count = (cls: string) => html.split(`${cls}"`).length - 1;
        expect(count(PHONE_CELL), `app/teams/[slug]/page.tsx MarginStrip slots ${team.slug}`).toBe(expected);
        expect(count(desktopCell(slots)), `app/teams/[slug]/page.tsx MarginStrip slots ${team.slug}`).toBe(expected);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(30);
  });

  it('every page: the Elo card is the /leaders board’s rating and place, and names no place below its top 10', async () => {
    const { buildLeadersView } = await import('@/views/leaders/leaders-view');
    // One Elo board per region (DESIGN-socal §2.3): a team's place is on its own region's board, whose id
    // is `elo-rating` (NorCal) or `elo-rating-socal` (SoCal), and the card links that board.
    const regions = buildLeadersView().regions;
    const boardFor = (league: string) => {
      const region = m.leagues.regionOf(league);
      const r = regions.find((x) => x.region === region)!;
      return r.schools.find((b) => b.id === `elo-rating${r.idSuffix}`)!;
    };
    let rated = 0;
    for (const team of m.data.getTeams()) {
      const board = boardFor(team.league);
      const listed = new Map(board.rows.map((r) => [r.team.slug, r]));
      const { elo } = m.view.buildTeamPageView(team.slug)!;
      expect(elo.boardHref, `views/teams/team-view.ts ${team.slug}: board link`).toBe(`/leaders#${board.id}`);
      expect(elo.fitTeams, `views/teams/team-view.ts ${team.slug}: one fit`).toBe(m.data.getTeams().length);
      const html = await renderTeam(team.slug);
      const text = textOf(html);
      const row = listed.get(team.slug);
      // Collapsed: the summary says "Elo rating" and nothing else shows until the reader opens it.
      expect(html, `components/teams/TeamElo.tsx ${team.slug}: closed disclosure`).toMatch(
        /<details id="elo" class="sx-disclosure"><summary>Elo rating<\/summary>/,
      );
      expect(html, `components/teams/TeamElo.tsx ${team.slug}: method link`).toContain(`href="/leaders#${board.id}"`);
      if (row) {
        expect(elo.boardPlace, `views/teams/team-view.ts ${team.slug}`).toEqual({ rank: row.rank, tied: row.tied });
        expect(String(elo.elo), `views/teams/team-view.ts ${team.slug}`).toBe(row.cells[board.rankedBy].text);
        expect(text, `components/teams/TeamElo.tsx ${team.slug}`).toContain(
          `${row.tied ? 'tied for ' : ''}${ordinal(row.rank)} on the ${elo.boardRegion} Elo board`,
        );
      } else {
        expect(elo.boardPlace, `views/teams/team-view.ts ${team.slug}`).toBeNull();
        expect(text, `components/teams/TeamElo.tsx ${team.slug}`).not.toMatch(/on the \w+ Elo board/);
      }
      expect(elo.provisional, `views/teams/team-view.ts ${team.slug} provisional`).toBe(
        elo.elo !== null && elo.games > 0 && elo.games < elo.minGames,
      );
      expect(elo.preseason, `views/teams/team-view.ts ${team.slug} preseason`).toBe(elo.elo !== null && elo.games === 0);
      if (elo.elo !== null) {
        rated += 1;
        expect(text, `components/teams/TeamElo.tsx ${team.slug}`).toContain(`Elo rating ${elo.elo} points ·`);
      }
      if (elo.provisional) {
        expect(text, `components/teams/TeamElo.tsx ${team.slug}`).toContain(`provisional, from ${elo.games}`);
      }
    }
    expect(rated, 'views/teams/team-view.ts: the corpus rates most teams').toBeGreaterThan(30);
  });

  it('a si.com-only game links by its param, never the raw contest id', async () => {
    const game = m.data.getGames().find((g) => g.contestId.startsWith('sblive:'));
    expect(game, 'lib/queries/games.ts: the corpus has a si.com backfill').toBeDefined();
    const slug = game!.home.slug ?? game!.away.slug!;
    const html = await renderTeam(slug);
    expect(html, 'components/teams/TeamGameLog.tsx sblive link').toContain(`href="/game/${game!.contestId.replace(':', '-')}"`);
  });
});

describe('the NEXT card and the identity place line (UI pass, league-aware)', () => {
  it('an opponent’s record line is scoped to its own league: never a division label for PCAL or MCAL', () => {
    const ranked = (league: string) =>
      m.data.getTeams({ league }).find((t) => m.data.getStandingFor(t.slug)?.hasReportedResults)!;
    const scval = ranked('scval');
    const mcal = ranked('mcal');
    const heading = m.labels.divisionHeading(scval.division)!;
    expect(m.view.opponentRecordLine(scval, 'scval'), 'views/teams/team-view.ts same league').toMatch(
      new RegExp(` in ${heading}$`),
    );
    expect(m.view.opponentRecordLine(scval, 'bval'), 'views/teams/team-view.ts cross-league').toMatch(
      new RegExp(` in SCVAL ${heading}$`),
    );
    expect(m.view.opponentRecordLine(mcal, 'mcal')).toMatch(/ in MCAL$/);
    expect(m.view.opponentRecordLine(mcal, 'scval')).toMatch(/ in MCAL$/);
    expect(m.view.opponentRecordLine(undefined, 'scval')).toBeNull();
  });

  it('every team’s NEXT card: an earlier meeting is a real final, and MCAL cards carry no CCS concept', () => {
    for (const team of m.data.getTeams()) {
      const v = m.view.buildTeamPageView(team.slug)!;
      const card = v.nextCard;
      if (card.kind === 'game' && card.earlier) {
        expect(card.earlier.text, `views/teams/team-view.ts ${team.slug} earlier`).toMatch(
          /^Earlier: ((won|lost|tied) \d+–\d+|(credited with the win|lost) on a level \d+–\d+ score)/,
        );
      }
      if (card.kind !== 'none') expect(card.record ?? '').not.toContain('0-0-0');
      if (team.league === 'mcal' && card.kind !== 'none') {
        // The strings the card prints (the Team and Game objects it carries are data, not copy).
        const printed = [
          card.dateLabel,
          card.opponentName,
          card.record ?? '',
          ...(card.kind === 'game'
            ? [card.place ?? '', card.earlier?.text ?? '', ...card.chips.map((c) => c.label)]
            : []),
        ].join(' ');
        expect(printed, `views/teams/team-view.ts ${team.slug} nextCard`).not.toMatch(
          /\bCCS\b|automatic qualifier/i,
        );
      }
    }
  });

  it('the identity card states the place on its own line, T-prefixed when level', async () => {
    const { TeamIdentity } = await import('@/components/teams/TeamIdentity');
    const { ordinal } = await import('@/lib/format/numbers');
    let checked = 0;
    for (const team of m.data.getTeams()) {
      const v = m.view.buildTeamPageView(team.slug)!;
      if (!v.hasResults || !v.standing) continue;
      checked += 1;
      const html = renderToStaticMarkup(createElement(TeamIdentity, { view: v, knownSlugs: [] }));
      const text = textOf(html);
      const place = ordinal(v.standing.computed.place);
      const scope = m.view.placeScope(v.divisionSize, v.scopeLabel);
      expect(text, `components/teams/TeamIdentity.tsx ${team.slug} identity line`).toContain(v.identityLine);
      if (v.standing.tiebreak.shared) {
        expect(text, `components/teams/TeamIdentity.tsx ${team.slug} level place`).toContain(`T-${place}`);
        expect(text).toContain(`tied for ${place}`);
      } else {
        expect(text, `components/teams/TeamIdentity.tsx ${team.slug} place`).toContain(`${place} ${scope}`);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('the Place tile writes a level place the same way: T-prefixed value, "tied for" spoken', async () => {
    const { TeamStatTiles } = await import('@/components/teams/TeamStatTiles');
    const { ordinal } = await import('@/lib/format/numbers');
    let checked = 0;
    for (const team of m.data.getTeams()) {
      const v = m.view.buildTeamPageView(team.slug)!;
      if (!v.hasResults || !v.standing) continue;
      checked += 1;
      const text = textOf(renderToStaticMarkup(createElement(TeamStatTiles, { view: v })));
      const place = ordinal(v.standing.computed.place);
      expect(text, `components/teams/TeamStatTiles.tsx ${team.slug} sub`).not.toContain('(tied)');
      if (v.standing.tiebreak.shared) {
        expect(text, `components/teams/TeamStatTiles.tsx ${team.slug} level place`).toContain(`T-${place}`);
        expect(text, `components/teams/TeamStatTiles.tsx ${team.slug} spoken`).toContain(`tied for ${place}`);
      } else {
        expect(text, `components/teams/TeamStatTiles.tsx ${team.slug} place`).not.toContain(`T-${place}`);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('the Splits card never prints 0-0-0 for a venue with no league games', async () => {
    const { TeamSplits } = await import('@/components/teams/TeamSplits');
    let empty = 0;
    for (const team of m.data.getTeams()) {
      const v = m.view.buildTeamPageView(team.slug)!;
      const text = textOf(renderToStaticMarkup(createElement(TeamSplits, { view: v })));
      expect(text, `components/teams/TeamSplits.tsx ${team.slug}`).not.toContain('0-0-0');
      const league = v.hasResults && v.standing ? v.standing.computed : null;
      if (!league) continue;
      const splits = [
        [league.homeRecord, 'no home league games'],
        [league.awayRecord, 'no away league games'],
        [league.neutralRecord, 'no neutral-site league games'],
      ] as const;
      for (const [record, words] of splits) {
        if (record.w + record.l + record.t > 0) continue;
        empty += 1;
        expect(text, `components/teams/TeamSplits.tsx ${team.slug} empty split`).toContain(words);
      }
    }
    expect(empty, 'the corpus has an empty split to check').toBeGreaterThan(0);
  });
});

describe('a team with no results (corpus copy, one MCAL team zeroed)', () => {
  let zeroed: Modules;
  let zeroedRelease: () => void;
  const zeroedPages = pageRenderers(() => zeroed);
  const slug = 'marin-academy';

  beforeAll(async () => {
    const snap = JSON.parse(readFileSync(corpusSnapshotPath('all-2026-10-02'), 'utf8')) as Snapshot;
    const team = snap.teams.find((t) => t.slug === slug)!;
    // Drop its games and zero its row: a registry member with nothing reported (DESIGN §8).
    snap.games = snap.games.filter((g) => g.home.teamId !== team.id && g.away.teamId !== team.id);
    snap.counts.games = snap.games.length;
    const row = snap.standings.find((r) => r.slug === slug)!;
    const zero = { w: 0, l: 0, t: 0 };
    row.computed = {
      ...row.computed,
      gp: 0, w: 0, l: 0, t: 0, winPct: 0, pts: 0, gf: 0, ga: 0, gd: 0,
      streak: null, last5: [], homeRecord: zero, awayRecord: zero, neutralRecord: zero,
    };
    row.hasReportedResults = false;
    const dir = tempDir('team-view');
    const file = path.join(dir, 'snapshot.json');
    writeFileSync(file, JSON.stringify(snap));
    const loaded = await withSnapshotModules(file, loaders);
    zeroed = loaded.modules;
    zeroedRelease = loaded.release;
  }, CORPUS_HOOK_TIMEOUT);

  afterAll(() => zeroedRelease());

  it('getTeamPostseasonLine is null and the block says "No results reported yet."', async () => {
    expect(zeroed.data.getTeamPostseasonLine(slug), 'lib/queries/postseason.ts getTeamPostseasonLine gp 0').toBeNull();
    const v = zeroed.view.buildTeamPageView(slug)!;
    expect(v.hasResults, 'views/teams/team-view.ts hasResults').toBe(false);
    const text = textOf(await zeroedPages.renderTeam(slug));
    expect(text, 'components/teams/TeamPlayoffLine.tsx gp 0').toContain('No results reported yet.');
    expect(text, 'app/teams/[slug]/page.tsx gp 0').not.toMatch(/0-0-0/);
    expect(text, 'app/teams/[slug]/page.tsx gp 0: no CCS on MCAL').not.toContain('CCS');
  });

  it('the Elo card rates the team from last season alone, as preseason, and keeps it off the board', async () => {
    const v = zeroed.view.buildTeamPageView(slug)!;
    expect(v.elo, 'views/teams/team-view.ts elo gp 0').toMatchObject({
      games: 0,
      preseason: true,
      provisional: false,
      boardPlace: null,
      seededFrom: '2025-26',
    });
    expect(v.elo.elo, 'views/teams/team-view.ts elo gp 0').not.toBeNull();
    expect(v.elo.seeded, 'views/teams/team-view.ts elo gp 0: its own start').toBe(true);
    const text = textOf(await zeroedPages.renderTeam(slug));
    expect(text, 'components/teams/TeamElo.tsx gp 0').toContain(`Elo rating ${v.elo.elo} points · preseason, from 2025-26`);
    expect(text, 'components/teams/TeamElo.tsx gp 0').toContain('No counted result this season yet, so this is where it starts');
  });

  it('the Elo card says where THIS team started: its own rating from last season, or average', async () => {
    const { TeamElo } = await import('@/components/teams/TeamElo');
    const view = zeroed.view.buildTeamPageView(slug)!.elo;
    const played = { ...view, elo: 1600, games: 8, preseason: false, provisional: false, boardPlace: null };
    const seeded = textOf(renderToStaticMarkup(createElement(TeamElo, { elo: { ...played, seeded: true } })));
    expect(seeded, 'components/teams/TeamElo.tsx seeded').toContain('It started the season from its 2025-26 rating');
    // A program new to the registry: no 2025-26 rating, though every other team has one.
    const fresh = textOf(renderToStaticMarkup(createElement(TeamElo, { elo: { ...played, seeded: false } })));
    // "Counted": last season's forfeits, unscored finals and games against outside schools are not
    // in the file, so a team can have played and still have no start.
    expect(fresh, 'components/teams/TeamElo.tsx unseeded').toContain('It had no counted 2025-26 game against the nine leagues’ teams and the Southern Section’s five independents, so it started from an average rating.');
    expect(fresh, 'components/teams/TeamElo.tsx unseeded').not.toContain('from its 2025-26 rating');
  });

  it('the Elo card says a team with no rating at all is not rated, never a 1500 it has not earned', async () => {
    const { TeamElo } = await import('@/components/teams/TeamElo');
    const view = zeroed.view.buildTeamPageView(slug)!.elo;
    const unrated = { ...view, elo: null, preseason: false, provisional: false, boardPlace: null };
    const text = textOf(renderToStaticMarkup(createElement(TeamElo, { elo: unrated })));
    expect(text, 'components/teams/TeamElo.tsx unrated').toContain('Elo rating Not rated · no counted results yet');
    expect(text, 'components/teams/TeamElo.tsx unrated').toContain('A rating needs at least one completed game');
    expect(text, 'components/teams/TeamElo.tsx unrated').not.toContain('1500 is an average team');
  });

  it('the identity card prints no place line at all (never an em dash in a sentence)', async () => {
    const { TeamIdentity } = await import('@/components/teams/TeamIdentity');
    const v = zeroed.view.buildTeamPageView(slug)!;
    const text = textOf(renderToStaticMarkup(createElement(TeamIdentity, { view: v, knownSlugs: [] })));
    expect(text, 'components/teams/TeamIdentity.tsx gp 0').toContain(v.identityLine);
    expect(text, 'components/teams/TeamIdentity.tsx gp 0: place line').not.toContain(
      zeroed.view.placeScope(v.divisionSize, v.scopeLabel),
    );
  });
});
