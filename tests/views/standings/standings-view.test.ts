/**
 * The per-league standings page (SPEC §10.3, §10.0, §10.9; views/standings/standings-view.ts and
 * app/standings/[league]/page.tsx): status chips, the preseason notice, the ladder line and the Southern California
 * tables.  League-specific values are asserted on the all-2026-10-02 CORPUS snapshot (SPEC §13.6), loaded through
 * useCorpusModules (tests/support/standings-view.ts), so live fetch #2 cannot break them. Every assertion message
 * names the module that produced the value, so a failure routes to its owner.
 */

import { describe, expect, it } from 'vitest';

import { LEAGUE_IDS } from '@/lib/config/leagues';
import { standaloneName } from '@/lib/config/leagues/labels';
import type { LeagueId } from '@/lib/model/ids';
import { textOf } from '@/tests/support/html-text';
import { m, renderLeague, renderOverview } from '@/tests/support/standings-view';

describe('status chips, rank rule and level reason (UI pass, from config)', () => {
  const texts = (league: string) =>
    Object.fromEntries(
      m.sd.buildStandingsPageView(league).views.map((v) => [v.division, v.statusGroups.map((g) => g.statusText)]),
    );

  it('each chip is the ladder rung’s own label; MCAL’s carry no CCS concept', () => {
    expect(texts('scval')['de-anza'], 'views/standings/division.ts SCVAL statusText').toEqual([
      'Automatic qualifier',
      'Play-in game Oct 30',
      'At-large consideration',
      'No automatic path',
    ]);
    expect(texts('bval')['santa-teresa'], 'views/standings/division.ts BVAL statusText').toEqual([
      'Hosts the play-in Oct 31',
      'No automatic-berth route',
    ]);
    expect(texts('pcal').pcal).toEqual(['Automatic qualifier', 'No automatic-berth route']);
    const mcal = texts('mcal')['marin-county'];
    expect(mcal, 'views/standings/division.ts MCAL statusText').toEqual([
      'Semifinal bye',
      'MCAL tournament',
      'Below the tournament line',
    ]);
    for (const t of mcal) expect(t).not.toMatch(/CCS|automatic qualifier|at-large/i);
  });

  it('the rank rule comes from each league’s citation', () => {
    const [deAnza] = m.sd.buildStandingsPageView('scval').views;
    expect(deAnza.rankRule, 'views/standings/division.ts rankRule').toBe(
      'SCVAL ranks by points (Art. VI §2), and so do we.',
    );
    const [mcal] = m.sd.buildStandingsPageView('mcal').views;
    expect(mcal.rankRule).toBe('MCAL ranks by points (MCAL Handbook §7a), and so do we.');
  });

  it('the Notes word a reciprocal place swap once, with the league’s own rule (rendered)', async () => {
    const scvalHtml = await renderLeague('scval');
    const scval = textOf(scvalHtml);
    expect(scval, 'components/standings/StandingsNotes.tsx swap').toContain('MaxPreps lists them the other way round');
    expect(scval).toContain('SCVAL ranks by points (Art. VI §2), and so do we.');
    expect(scval, 'components/standings/PlayoffStatusBand.tsx chip').toContain('Automatic qualifier');
    // One tie notation site-wide: `T7` / `T-7th`, never `7=`.
    expect(scvalHtml, 'app/standings/[league]/page.tsx tie mark').not.toMatch(/\d=</);
    const mcal = textOf(await renderLeague('mcal'));
    expect(mcal, 'app/standings/[league]/page.tsx mcal: SCVAL citation').not.toContain('Article VI');
    expect(renderOverview(), 'app/standings/page.tsx tie mark').not.toMatch(/\d=</);
  });
});

describe('the preseason notice (standings-view.ts buildNotice, DESIGN §8)', () => {
  const SPV = 'views/standings/standings-view.ts buildNotice';
  it('is absent once a league has a counted final, and shown while it has none (the EAL here)', () => {
    // The corpus predates the Southern California leagues too: they load with no games at all.
    const empty = ['eal', 'sunset', 'city', 'north-county', 'metro', 'independents'];
    // The independents' notice names the group, not "Independent league play" (DESIGN §24.10).
    expect(m.sd.buildStandingsPageView('independents').notice?.heading, `${SPV}: independents`).toBe(
      'The first game between two of the LA independents is Tue Sep 8.',
    );
    for (const id of LEAGUE_IDS.filter((l) => !empty.includes(l))) {
      expect(m.sd.buildStandingsPageView(id).notice, `${SPV}: ${id}`).toBeNull();
    }
    // This corpus predates the EAL's league games, so its tables have no counted final yet.
    expect(m.sd.buildStandingsPageView('eal').notice, `${SPV}: eal`).toEqual({
      heading: 'EAL league play starts Mon Aug 24.',
      body: 'These tables count league games only, so every record reads 0-0-0 until the first league result is published. The 4 non-league games played so far are on the schedule.',
    });
    expect(m.sd.buildStandingsPageView('metro').notice?.heading, `${SPV}: metro`).toBe('Metro league play starts Mon Sep 28.');
  });

  it('dates league play from config and counts the non-league games played so far', () => {
    expect(m.sd.buildNotice('scval', []), SPV).toEqual({
      heading: 'SCVAL league play starts Wed Sep 9.',
      body: 'These tables count league games only, so every record reads 0-0-0 until the first league result is published. The 47 non-league games played so far are on the schedule.',
    });
  });
});

describe('the ladder line (division.ts ladderLineAfter)', () => {
  const LL = 'views/standings/division.ts ladderLineAfter';
  const rows = (...places: Array<number | null>) =>
    places.map((place) => ({ ranked: place !== null, place: place ?? 0 }));
  it('is counted, not assumed: two teams level on the line both sit above it', () => {
    expect(m.view.ladderLineAfter(rows(1, 2, 3, 3, 5), 3), LL).toBe(4);
    expect(m.view.ladderLineAfter(rows(1, 1, 3, 4), 1), `${LL}: level on 1st`).toBe(2);
  });
  it('draws none before any result, when every row is above it, or with no line configured', () => {
    expect(m.view.ladderLineAfter(rows(null, null, null), 3), `${LL}: no results`).toBeNull();
    expect(m.view.ladderLineAfter(rows(1, 2, 3), 6), `${LL}: every row above`).toBeNull();
    expect(m.view.ladderLineAfter(rows(1, 2, 3), null), `${LL}: no line`).toBeNull();
  });
});

describe('Southern California tables (division.ts, DESIGN-socal §2.1.7)', () => {
  const SV = 'views/standings/division.ts';

  it('a ‘site’ league says the order is this site’s points, never that its rules require it', () => {
    for (const id of ['sunset', 'city', 'north-county', 'metro']) {
      const league = m.data.getLeagueSummary(id)!;
      const page = m.sd.buildStandingsPageView(id);
      for (const v of page.views) {
        expect(v.rankRule, `${SV} rankRuleText ${id}`).toBe(
          `The order is this site’s 3-1-0 points; no ${league.shortName} rule orders the table.`,
        );
        expect(v.legendNotes.join(' '), `${SV} orderLegendText ${id}`).toContain(
          `${standaloneName(id as LeagueId)} publishes no standings and no points rule, so the order is this site’s 3-1-0 points.`,
        );
      }
    }
    const uneven = m.footnotes.unevenGpFootnote('city', { min: 2, max: 6, scheduled: 10 })!;
    expect(uneven, 'views/standings/footnotes.ts unevenGpFootnote city').toContain('The order is this site’s 3-1-0 points; no City rule orders the table.');
    expect(uneven).toContain('LEFT is league games');
    expect(uneven).not.toMatch(/rules require/);
  });

  it('the Sunset: no fixed schedule (no LEFT, MAX or "of N") and no postseason band', async () => {
    const sunset = m.sd.buildStandingsPageView('sunset').views[0];
    expect(sunset.fixedSchedule, `${SV} fixedSchedule`).toBe(false);
    expect(sunset.statusGroups, `${SV} no band groups`).toEqual([]);
    expect(sunset.noPostseason?.sourceLabel).toBe('CIF-SS Blue Book 2026-27');
    expect(sunset.noPostseason?.note).toMatch(/^The CIF Southern Section holds no field hockey playoffs/);
    expect(sunset.playoffsHref).toBe('/playoffs#sunset');
    expect(sunset.statusIntro).toBeNull();
    const uneven = m.footnotes.unevenGpFootnote('sunset', { min: 2, max: 7, scheduled: null });
    expect(uneven, 'views/standings/footnotes.ts unevenGpFootnote sunset').toBe(
      'Teams have played between 2 and 7 games against other Sunset teams, and there is no fixed league schedule, so points favour teams that have played more. The order is this site’s 3-1-0 points; no Sunset rule orders the table.',
    );
    const html = await renderLeague('sunset');
    expect(html, 'components/standings/DivisionStandings.tsx Sunset: no Left/Max').not.toMatch(/>Left<\/th>|>Max<\/th>/);
    expect(textOf(html)).toContain('GP is league games counted. Sunset has no fixed league schedule, so there is no LEFT or MAX column.');
    expect(textOf(html)).not.toMatch(/\d+\/null/);
    // Copy rules: 'Sunset League' only beside 'all-sports'; 'Sunset teams', never schools or members.
    for (const sentence of textOf(html).split(/(?<=[.!?])\s+/)) {
      if (/\bSunset League\b/.test(sentence)) expect(sentence).toContain('all-sports');
      expect(sentence).not.toMatch(/\bSunset (school|member)s?\b/);
      expect(sentence).not.toMatch(/rules require|at-large|automatic qualifier|eliminat/i);
    }
  });

  it('a San Diego league: the band reads the Section line and the champion rung; Valley has no MaxPreps table', async () => {
    const page = m.sd.buildStandingsPageView('north-county');
    for (const v of page.views) {
      expect(v.statusIntro, `${SV} statusIntro ${v.division}`).toMatch(/^San Diego Section playoffs, Nov 2–14/);
      expect(v.statusHeading).toBe('San Diego Section playoffs: the league route, as things stand');
      expect(v.playoffsHref).toBe('/playoffs#north-county');
      expect(v.fixedSchedule).toBe(true);
      expect(v.ladderLineLabel).toBe('Champion line');
    }
    const valley = page.views.find((v) => v.division === 'valley')!;
    expect(valley.sourceUrl, `${SV} Valley has no MaxPreps table`).toBeNull();
    expect(valley.sourceSkipped).toBe('MaxPreps publishes no table for this division');
    expect(page.views.find((v) => v.division === 'palomar')!.sourceUrl).toMatch(/^https:\/\/www\.maxpreps\.com\//);
    // Every game between two members is a league game here ('membership'), and the Notes say so.
    expect(valley.scheduledPer).toBe(
      'League games are every game between two division members on MaxPreps’ schedules (North County publishes no schedule)',
    );
    const text = textOf(await renderLeague('north-county'));
    expect(text).toContain('MaxPreps publishes no table for this division, so there is nothing to compare these records with.');
    expect(text).not.toMatch(/at-large|automatic qualifier|lowest-seeded|eliminat/i);
    // With no MaxPreps table, no "MaxPreps’ table leaves out" line (review 2026-10-06): the six Valley
    // slugs stay in maxprepsMissing for the count invariant, and the no-table sentence alone speaks.
    expect(valley.comparison.leftOut, `${SV} Valley leftOut`).toEqual([]);
    expect(text).not.toMatch(/MaxPreps’ table leaves out (Escondido|Mission Hills|Sage Creek|San Pasqual|Vista|Westview)\./);
    // Avocado has a MaxPreps table that leaves two out: those lines stay.
    expect(page.views.find((v) => v.division === 'avocado')!.comparison.leftOut).toEqual([
      'MaxPreps’ table leaves out Mt. Carmel.',
      'MaxPreps’ table leaves out Rancho Bernardo.',
    ]);
  });

  it('says a team is in a table "as MaxPreps lists it" only when MaxPreps’ table for that division lists it', async () => {
    // This corpus has no SoCal games, so every Sunset and Metro team is a no-results row.
    const metro = textOf(await renderLeague('metro'));
    const sunset = textOf(await renderLeague('sunset'));
    for (const name of ['Hilltop', 'Southwest', 'El Capitan', 'Granite Hills']) {
      expect(metro, `${name}`).not.toContain(`${name} is in the Metro South Bay table as MaxPreps lists it`);
      expect(metro).toContain(
        `${name} is a Metro South Bay team (the CIF-SDS 2026-27 League Alignment) but has no results in the source table — no record is invented for them.`,
      );
    }
    // MaxPreps' "Metro- South Bay" table is the Metro Mesa one, so Metro Mesa is named by the alignment too.
    expect(metro).not.toMatch(/as MaxPreps lists it/);
    expect(sunset).not.toContain('Newport Harbor is in the Sunset table as MaxPreps lists it');
    expect(sunset).toContain(
      'Newport Harbor is a Sunset team (MaxPreps’ 2024-25 and 2025-26 Sunset tables) but has no results in the source table — no record is invented for them.',
    );
    // Great Oak is one of the five rows of MaxPreps' 2026-27 Sunset table, so that wording is true for it.
    expect(sunset).toContain('Great Oak is in the Sunset table as MaxPreps lists it but has no results in the source table');
  });

  it('a San Diego caption says "league standings", never "Division" (the Section’s playoff tiers)', async () => {
    const html = await renderLeague('north-county');
    expect(html).toContain('Palomar league standings');
    expect(html).not.toMatch(/(Avocado|Palomar|Valley) Division league standings/);
    expect(await renderLeague('bval')).toContain('Mt. Hamilton Division league standings');
  });

  it('prints no "biggest goal difference" for a division where every goal difference is 0', async () => {
    // No SoCal game is in this corpus: every Metro goal difference is 0 and gdDomain is the bar floor 1.
    expect(m.sd.buildStandingsPageView('metro').views.every((v) => v.gdDomain === 1)).toBe(true);
    const text = textOf(await renderLeague('metro'));
    expect(text).not.toMatch(/biggest goal difference \(|’s is 1\b|'s is 1\b/);
    expect(text).toContain(
      'Bars are scaled to each division’s own biggest goal difference, so bars in different divisions are not comparable.',
    );
    expect(text).not.toContain('GD bars are per division, scaled');
    // A division with results keeps the figure.
    expect(textOf(await renderLeague('scval'))).toMatch(/De Anza’s biggest goal difference \(\d+\)/);
  });

  it('a league page’s chips are its own region’s leagues plus All', async () => {
    const html = await renderLeague('city');
    const nav = html.match(/<nav aria-label="Leagues"[\s\S]*?<\/nav>/)![0];
    const hrefs = [...nav.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual([
      '/standings', '/standings/sunset', '/standings/independents', '/standings/city', '/standings/north-county', '/standings/metro',
    ]);
    const scval = (await renderLeague('scval')).match(/<nav aria-label="Leagues"[\s\S]*?<\/nav>/)![0];
    expect(scval).not.toContain('/standings/city');
  });
});
