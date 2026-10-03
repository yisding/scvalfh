/**
 * lib/sources/scval-pdf.ts — the two official SCVAL schedule-grid PDFs (SPEC §1.3).
 *
 * `tests/fixtures/scval/{da,ec}-pdftotext.txt` are the REAL `pdftotext -layout` output of
 * https://scval.com/fallSports/26-27%20SCVAL%20FH%20{DA,EC}%20Final.pdf, and
 * `standings-index.html` is the real https://www.scval.com/standings/ page. The grid parser has to
 * reproduce 56 fixtures per division from them: 8 teams × 7 opponents, home and away — less, in
 * De Anza, the 14 involving Wilcox, which is on the grid but not fielding a team.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { matchOfficialFixtures } from '../lib/official/match';
import {
  carryOfficialForward,
  diffMembership,
  findStandingsPdfLink,
  listFieldHockeyLinks,
  parseSchedulePdfText,
  scvalPdfDivisions,
  scvalScheduleUrl,
} from '../lib/sources/scval-pdf';
import { teamsInDivision } from '../lib/teams';
import type { Game, OfficialFixture, OfficialStamp } from '../lib/types';
import { REPO, game } from './helpers';

/** The SCVAL matcher (moved from scval-pdf.ts to lib/official/match.ts as the 'legacy' matcher). */
const applyOfficialFixtures = (games: readonly Game[], fixtures: readonly OfficialFixture[]) =>
  matchOfficialFixtures(games, fixtures, { matcher: 'legacy', isExcluded: () => false, rescheduleWindowDays: 14 });

/** The widened stamp the legacy matcher writes for a De Anza / El Camino fixture. */
const stamp = (
  division: string,
  scheduledDate: string,
  away: string,
  home: string,
  pass: OfficialStamp['pass'] = 'same-date',
): OfficialStamp => ({
  scheduledDate,
  division,
  source: 'scval-pdf',
  fixtureId: `${division}:${scheduledDate}:${away}@${home}`,
  pass,
});

const FIX = path.join(REPO, 'tests', 'fixtures', 'scval');
const daText = readFileSync(path.join(FIX, 'da-pdftotext.txt'), 'utf8');
const ecText = readFileSync(path.join(FIX, 'ec-pdftotext.txt'), 'utf8');
const indexHtml = readFileSync(path.join(FIX, 'standings-index.html'), 'utf8');

const da = parseSchedulePdfText(daText, 'de-anza');
const ec = parseSchedulePdfText(ecText, 'el-camino');

describe('scval-pdf: urls', () => {
  it('uses https, because http 302s', () => {
    expect(scvalScheduleUrl('de-anza')).toMatch(/^https:\/\/scval\.com\//);
    expect(scvalScheduleUrl('el-camino')).toMatch(/^https:\/\/scval\.com\//);
  });

  it('parses only the live-PDF (SCVAL) divisions', () => {
    expect(scvalPdfDivisions()).toEqual(['de-anza', 'el-camino']);
  });
});

describe('scval-pdf: the day-header grid', () => {
  it('reads the roster line and the year label', () => {
    expect(da.yearLabel).toBe('2026 - 2027');
    expect(da.officialTeamNames).toEqual([
      'Cupertino', 'Fremont', 'Homestead', 'Los Altos',
      'Saint Francis', 'Saint Ignatius', 'Valley Christian',
    ]);
    expect(ec.officialTeamNames).toEqual([
      'Los Gatos', 'Lynbrook', 'Mitty', 'Monta Vista',
      'Palo Alto', 'Presentation', 'Santa Clara', 'Saratoga',
    ]);
    // Grid prose spellings are aliases, so all 15 resolve.
    expect(da.officialTeamSlugs).not.toContain(null);
    expect(ec.officialTeamSlugs).not.toContain(null);
  });

  it('extracts a complete double round robin over 14 dates, no bad rows', () => {
    // El Camino: 8 teams, 56 fixtures, 4 a day. De Anza: the grid's 56 less Wilcox's 14.
    for (const [schedule, teams] of [[da, 7], [ec, 8]] as const) {
      const total = teams * (teams - 1);
      expect(schedule.fixtures).toHaveLength(total);
      expect(new Set(schedule.fixtures.map((f) => f.dateKey)).size).toBe(14);
      expect(schedule.fixtures.every((f) => f.awaySlug !== null && f.homeSlug !== null)).toBe(true);
      const byDate = new Map<string, number>();
      for (const f of schedule.fixtures) byDate.set(f.dateKey, (byDate.get(f.dateKey) ?? 0) + 1);
      expect([...new Set(byDate.values())]).toEqual([Math.floor(teams / 2)]);
      // Every ordered pair exactly once ⇒ home and away against every opponent.
      const keys = schedule.fixtures.map((f) => `${f.awaySlug}@${f.homeSlug}`);
      expect(new Set(keys).size).toBe(total);
      expect(schedule.warnings).toEqual([]);
    }
  });

  it('drops every fixture of a school that is not fielding a team', () => {
    expect(daText).toMatch(/WILCOX\s+@\s+VALLEY CHRISTIAN/);
    expect(da.fixtures.some((f) => /WILCOX/.test(f.awayName) || /WILCOX/.test(f.homeName))).toBe(false);
  });

  it('assigns each matchup to its own COLUMN, not to the line it shares', () => {
    // Wed Sep 9 / Mon Sep 14 / Wed Sep 16 are one three-column band; naive line reading would
    // put all three on the same date.
    const sep9 = da.fixtures.filter((f) => f.dateKey === '2026-09-09');
    expect(sep9.map((f) => `${f.awayName} @ ${f.homeName}`).sort()).toEqual([
      'HOMESTEAD @ CUPERTINO',
      'ST. FRANCIS @ FREMONT',
      'ST. IGNATIUS @ LOS ALTOS',
    ]);
    expect(da.fixtures.filter((f) => f.dateKey === '2026-09-14')).toHaveLength(3);
    expect(da.fixtures.filter((f) => f.dateKey === '2026-09-16')).toHaveLength(3);
  });

  it('survives the irregular spacing that broke the split-on-2-spaces approach', () => {
    // `ST. FRANCIS        @   FREMONT` — three spaces after the @.
    const row = da.fixtures.find(
      (f) => f.dateKey === '2026-09-09' && f.awayName === 'ST. FRANCIS',
    );
    expect(row?.homeName).toBe('FREMONT');
    expect(row?.homeSlug).toBe('fremont');
    // `MITTY        @ LOS GATOS` on the El Camino grid.
    expect(
      ec.fixtures.find((f) => f.dateKey === '2026-10-20' && f.awayName === 'MITTY')?.homeName,
    ).toBe('LOS GATOS');
  });

  it('reads group 1 as AWAY and group 2 as HOME', () => {
    const row = da.fixtures.find((f) => f.dateKey === '2026-09-09' && f.awaySlug === 'homestead');
    expect(row?.homeSlug).toBe('cupertino');
  });

  it('covers the verified windows: DA Mon/Wed Sep 9 – Oct 26, EC Tue/Thu Sep 10 – Oct 27', () => {
    const daDates = [...new Set(da.fixtures.map((f) => f.dateKey))].sort();
    expect(daDates[0]).toBe('2026-09-09');
    expect(daDates[daDates.length - 1]).toBe('2026-10-26');
    const ecDates = [...new Set(ec.fixtures.map((f) => f.dateKey))].sort();
    expect(ecDates[0]).toBe('2026-09-10');
    expect(ecDates[ecDates.length - 1]).toBe('2026-10-27');
  });

  it('skips the Oct 30 crossover block but records its date', () => {
    // `DE ANZA #4 VS EL CAMINO #4` and `#1 v. #1` carry no '@' and must not become fixtures.
    expect(da.fixtures.some((f) => f.dateKey === '2026-10-30')).toBe(false);
    expect(da.crossoverDate).toBe('2026-10-30');
    expect(ec.crossoverDate).toBe('2026-10-30');
    expect(da.fixtures.some((f) => /#/.test(f.awayName) || /#/.test(f.homeName))).toBe(false);
  });

  it('handles the day header with no comma ("MONDAY OCTOBER 26")', () => {
    expect(da.fixtures.filter((f) => f.dateKey === '2026-10-26')).toHaveLength(3);
    expect(ec.fixtures.filter((f) => f.dateKey === '2026-10-22')).toHaveLength(4);
  });

  it('warns when handed the other division\'s text', () => {
    const wrong = parseSchedulePdfText(ecText, 'de-anza');
    expect(wrong.warnings.some((w) => /division header/.test(w))).toBe(true);
  });
});

describe('scval-pdf: membership diff', () => {
  it('agrees with the registry on both divisions', () => {
    for (const schedule of [da, ec]) {
      const diff = diffMembership(schedule);
      expect(diff.unknownOfficialNames).toEqual([]);
      expect(diff.missingFromOfficial).toEqual([]);
      expect(diff.wrongDivision).toEqual([]);
      expect(diff.warnings).toEqual([]);
    }
  });

  it('leaves Wilcox out of De Anza membership without a warning', () => {
    expect(teamsInDivision('de-anza')).toHaveLength(7);
    const diff = diffMembership(da);
    expect(diff.unknownOfficialNames).toEqual([]);
    expect(diff.missingFromOfficial).toEqual([]);
    expect(diff.warnings).toEqual([]);
  });

  it('warns rather than rewriting when the official roster disagrees', () => {
    const diff = diffMembership({
      ...da,
      officialTeamNames: ['Cupertino', 'Mitty', 'Somewhere Else'],
      officialTeamSlugs: ['cupertino', 'mitty', null],
    });
    expect(diff.unknownOfficialNames).toEqual(['Somewhere Else']);
    expect(diff.wrongDivision).toEqual([{ slug: 'mitty', registryDivision: 'el-camino' }]);
    expect(diff.missingFromOfficial).toContain('fremont');
    expect(diff.warnings.length).toBeGreaterThan(0);
  });
});

describe('scval-pdf: matching fixtures to MaxPreps contests', () => {
  const fixture = (dateKey: string, away: string, home: string): OfficialFixture => ({
    id: `de-anza:${dateKey}:${away}@${home}`,
    league: 'scval',
    division: 'de-anza',
    dateKey,
    time: null,
    awayName: away.toUpperCase(),
    homeName: home.toUpperCase(),
    awaySlug: away as OfficialFixture['awaySlug'],
    homeSlug: home as OfficialFixture['homeSlug'],
    source: 'scval-pdf',
  });

  it('attaches game.official on an exact date + ordering match', () => {
    const g = game({ home: 'valley-christian', away: 'homestead', hs: 1, as: 0, date: '2026-09-09' });
    const res = applyOfficialFixtures([g], [fixture('2026-09-09', 'homestead', 'valley-christian')]);
    expect(res.matched).toBe(1);
    expect(res.unmatched).toHaveLength(0);
    expect(res.games[0].official).toEqual(stamp('de-anza', '2026-09-09', 'homestead', 'valley-christian'));
  });

  it('lists a fixture with no contest', () => {
    const homesteadFixtures = da.fixtures.filter(
      (f) => f.awaySlug === 'homestead' || f.homeSlug === 'homestead',
    );
    expect(homesteadFixtures).toHaveLength(12);
    const res = applyOfficialFixtures([], homesteadFixtures);
    expect(res.matched).toBe(0);
    expect(res.unmatched).toHaveLength(12);
    expect(res.unmatched[0].dateKey <= res.unmatched[11].dateKey).toBe(true);
  });

  it('flags a contest the official grid calls a league game but MaxPreps does not', () => {
    const g = game({
      home: 'valley-christian',
      away: 'homestead',
      hs: 1,
      as: 0,
      date: '2026-09-09',
      league: false,
    });
    const res = applyOfficialFixtures([g], [fixture('2026-09-09', 'homestead', 'valley-christian')]);
    expect(res.leagueDisagreements).toHaveLength(1);
    expect(res.leagueDisagreements[0]).toMatch(/official De Anza grid/);
    // isLeague itself is NOT rewritten — the disagreement is logged, not resolved.
    expect(res.games[0].isLeague).toBe(false);
    // …and it is PUBLISHED on the game, not only logged: the standings tally on `isLeague`, so a
    // mis-flag silently drops a league result and MaxPreps' own table cannot catch it.
    expect(res.games[0].provenance.leagueFlagConflict).toMatch(/official De Anza grid/);
  });

  it('will not stamp an official league fixture onto a meeting months away', () => {
    // These two meet three times a season: both league legs plus a non-league preseason game.
    const preseason = game({
      home: 'cupertino',
      away: 'fremont',
      hs: 1,
      as: 0,
      date: '2026-08-28',
      league: false,
    });
    const res = applyOfficialFixtures(
      [preseason],
      [fixture('2026-09-16', 'fremont', 'cupertino')],
    );
    expect(res.matched).toBe(0);
    expect(res.unmatched).toHaveLength(1);
    expect(res.games[0].official).toBeUndefined();
  });

  it('still matches a leg that really moved, and prefers the league one', () => {
    const nonLeague = game({
      home: 'cupertino',
      away: 'fremont',
      hs: 1,
      as: 0,
      date: '2026-09-14',
      league: false,
    });
    const league = game({ home: 'cupertino', away: 'fremont', hs: 2, as: 0, date: '2026-09-18' });
    const res = applyOfficialFixtures(
      [nonLeague, league],
      [fixture('2026-09-16', 'fremont', 'cupertino')],
    );
    expect(res.matched).toBe(1);
    // The non-league game is two days closer; the league leg still wins.
    expect(res.games.find((g) => g.contestId === league.contestId)?.official?.scheduledDate).toBe(
      '2026-09-16',
    );
    expect(res.games.find((g) => g.contestId === nonLeague.contestId)?.official).toBeUndefined();
  });

  it('warns when MaxPreps has the host the other way round, and publishes the disagreement', () => {
    const g = game({ home: 'homestead', away: 'valley-christian', hs: 0, as: 2, date: '2026-09-09' });
    const res = applyOfficialFixtures([g], [fixture('2026-09-09', 'homestead', 'valley-christian')]);
    expect(res.matched).toBe(1);
    expect(res.warnings.some((w) => /host the other way round/.test(w))).toBe(true);
    // Home/away is NOT rewritten — SPEC §5.5.4 takes it only from MaxPreps' homeAwayType …
    expect(res.games[0].home.slug).toBe('homestead');
    // … but the disagreement survives the run on the game, like a league-flag disagreement does.
    const note = res.games[0].provenance.hostConflict ?? '';
    expect(note).toMatch(
      /official De Anza grid has Valley Christian hosting; MaxPreps has Homestead/,
    );
    // It is PROSE, not a log line: GameDetails prints it verbatim in the WHERE block, so it uses
    // the display name rather than the grid's UPPERCASE spelling, and carries no raw ISO date
    // (this is the same-date pass, and the page states that date two lines above).
    expect(note).not.toMatch(/[A-Z]{3}/);
    expect(note).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('matches a league leg that moved 29 days, the way the real De Anza grid did', () => {
    // The published grid has ST. IGNATIUS @ LOS ALTOS on Sep 9; it was played Oct 8. A ±14-day
    // cap rejected the only candidate, dropping the "Moved" note off a game the site lists and
    // publishing the empty Sep 9 slot as an unplayed fixture instead.
    const moved = game({
      home: 'los-altos',
      away: 'st-ignatius',
      hs: 0,
      as: 3,
      date: '2026-10-08',
    });
    const res = applyOfficialFixtures(
      [moved],
      [fixture('2026-09-09', 'st-ignatius', 'los-altos')],
    );
    expect(res.matched).toBe(1);
    expect(res.unmatched).toEqual([]);
    expect(res.games[0].official?.scheduledDate).toBe('2026-09-09');
    expect(res.games[0].dateKey).toBe('2026-10-08');
  });

  it('still refuses a NON-league meeting 29 days away, which is what the cap is for', () => {
    const friendly = game({
      home: 'los-altos',
      away: 'st-ignatius',
      hs: 0,
      as: 3,
      date: '2026-10-08',
      league: false,
    });
    const res = applyOfficialFixtures(
      [friendly],
      [fixture('2026-09-09', 'st-ignatius', 'los-altos')],
    );
    expect(res.matched).toBe(0);
    expect(res.games[0].official).toBeUndefined();
  });

  it('matches a rescheduled game and keeps the OFFICIAL date in scheduledDate', () => {
    const g = game({ home: 'valley-christian', away: 'homestead', hs: 1, as: 0, date: '2026-09-11' });
    const res = applyOfficialFixtures([g], [fixture('2026-09-09', 'homestead', 'valley-christian')]);
    expect(res.matched).toBe(1);
    expect(res.games[0].official?.scheduledDate).toBe('2026-09-09');
    expect(res.games[0].dateKey).toBe('2026-09-11');
    expect(res.warnings.some((w) => /official 2026-09-09, MaxPreps 2026-09-11/.test(w))).toBe(true);
  });

  it('never gives two fixtures the same contest, so the two legs stay distinct', () => {
    const leg1 = game({ home: 'valley-christian', away: 'homestead', hs: 1, as: 0, date: '2026-09-09' });
    const leg2 = game({ home: 'homestead', away: 'valley-christian', hs: 0, as: 3, date: '2026-10-05' });
    const res = applyOfficialFixtures(
      [leg1, leg2],
      [
        fixture('2026-09-09', 'homestead', 'valley-christian'),
        fixture('2026-10-05', 'valley-christian', 'homestead'),
      ],
    );
    expect(res.matched).toBe(2);
    expect(res.games.map((g) => g.official?.scheduledDate)).toEqual(['2026-09-09', '2026-10-05']);
  });

  it('leaves unmatched contests untouched', () => {
    const g = game({ home: 'los-altos', away: 'cupertino', hs: 4, as: 0, date: '2026-09-23' });
    const res = applyOfficialFixtures([g], []);
    expect(res.games[0].official).toBeUndefined();
  });
});

describe('scval-pdf: SPEC §5.3 per-division carry-forward', () => {
  const fixture = (
    division: OfficialFixture['division'],
    dateKey: string,
    away: string,
    home: string,
  ): OfficialFixture => ({
    id: `${division}:${dateKey}:${away}@${home}`,
    league: 'scval',
    division,
    dateKey,
    time: null,
    awayName: away.toUpperCase(),
    homeName: home.toUpperCase(),
    awaySlug: away as OfficialFixture['awaySlug'],
    homeSlug: home as OfficialFixture['homeSlug'],
    source: 'scval-pdf',
  });

  /** A De Anza game and an El Camino game, each already carrying an `official` marker. */
  const previousGames = [
    {
      ...game({ home: 'los-altos', away: 'cupertino', hs: 2, as: 1, date: '2026-09-23' }),
      official: stamp('de-anza', '2026-09-23', 'cupertino', 'los-altos'),
    },
    {
      ...game({ home: 'lynbrook', away: 'saratoga', hs: 0, as: 3, date: '2026-09-24' }),
      official: stamp('el-camino', '2026-09-24', 'saratoga', 'lynbrook'),
    },
  ];
  /** The SAME two contests (same contestIds) as a fresh run produces them: no `official`. */
  const freshGames = () => previousGames.map(({ official, ...g }) => (void official, g));

  const previous = {
    officialFixtures: [
      fixture('de-anza', '2026-09-16', 'homestead', 'cupertino'),
      fixture('el-camino', '2026-10-05', 'mitty', 'presentation'),
    ],
    games: previousGames,
  };

  it('restores ONLY the failed division when the other grid was read', () => {
    const res = carryOfficialForward(['de-anza'], previous, freshGames());
    expect(res.fixtures.map((f) => f.division)).toEqual(['de-anza']);
    expect(res.carried).toBe(1);
    const byDivision = new Map(res.games.map((g) => [g.leagueDivision, g.official]));
    // De Anza's unmatched fixtures and markers survive one failed PDF …
    expect(byDivision.get('de-anza')).toEqual(stamp('de-anza', '2026-09-23', 'cupertino', 'los-altos'));
    // … and El Camino, which WAS read this run, keeps exactly what this run said about it.
    expect(byDivision.get('el-camino')).toBeUndefined();
  });

  it('restores both when neither grid could be read', () => {
    const res = carryOfficialForward(['de-anza', 'el-camino'], previous, freshGames());
    expect(res.fixtures).toHaveLength(2);
    expect(res.carried).toBe(2);
  });

  it('does nothing when both grids were read', () => {
    const fresh = freshGames();
    const res = carryOfficialForward([], previous, fresh);
    expect(res.fixtures).toEqual([]);
    expect(res.carried).toBe(0);
    expect(res.games.every((g) => g.official === undefined)).toBe(true);
  });

  it('never overwrites a marker this run produced', () => {
    const thisRun = freshGames().map((g) =>
      g.leagueDivision === 'de-anza'
        ? { ...g, official: stamp('de-anza', '2026-09-21', 'cupertino', 'los-altos') }
        : g,
    );
    const res = carryOfficialForward(['de-anza'], previous, thisRun);
    expect(res.carried).toBe(0);
    expect(res.games.find((g) => g.leagueDivision === 'de-anza')?.official?.scheduledDate).toBe(
      '2026-09-21',
    );
  });
});

describe('scval-pdf: standings-index poll', () => {
  it('finds the two 2025-26 field hockey PDFs on the real index', () => {
    const links = listFieldHockeyLinks(indexHtml);
    expect(links).toContain('2025-26 Field Hockey standings.pdf');
    expect(links).toContain('SCVAL 2025-26 Field Hockey all league.pdf');
  });

  it('reports NO 2026-27 standings PDF, because SCVAL has not published one', () => {
    expect(findStandingsPdfLink(indexHtml)).toBeNull();
  });

  it('percent-encodes the filename when the file does appear', () => {
    const link = findStandingsPdfLink(indexHtml, { start: '2025-26', alt: '25-26' });
    expect(link?.href).toBe('2025-26 Field Hockey standings.pdf');
    expect(link?.url).toBe(
      'https://www.scval.com/standings/2025-26%20Field%20Hockey%20standings.pdf',
    );
  });

  it('does not mistake the all-league PDF for a standings PDF', () => {
    const html = '<a href="SCVAL 2026-27 Field Hockey all league.pdf">x</a>';
    expect(findStandingsPdfLink(html)).toBeNull();
  });
});
