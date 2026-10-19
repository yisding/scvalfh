/**
 * The division tables' view models (SPEC §10.3, §8.1; views/standings/division.ts): ladder badges and legends per
 * league, single-division leagues, and the missing official results and postponed rows.  League-specific values are
 * asserted on the all-2026-10-02 CORPUS snapshot (SPEC §13.6), loaded through useCorpusModules
 * (tests/support/standings-view.ts), so live fetch #2 cannot break them. Every assertion message names the module
 * that produced the value, so a failure routes to its owner.
 */

import { describe, expect, it } from 'vitest';

import type { MissingOfficialResult } from '@/lib/queries/standings';
import { getTeamById } from '@/lib/registry/teams';
import { textOf } from '@/tests/support/html-text';
import { m, renderLeague, renderOverview } from '@/tests/support/standings-view';

describe('ladder badges and legends, per league (verbatim from config)', () => {
  const legends = (league: string) =>
    Object.fromEntries(
      m.sd.buildStandingsPageView(league).views.flatMap((v) => v.statusGroups.map((g) => [`${v.division}:${g.badge}`, g.label])),
    );

  it('SCVAL keeps today’s strings', () => {
    const l = legends('scval');
    expect(l['de-anza:AQ'], 'views/standings/division.ts SCVAL AQ').toBe('Places 1-3 — automatic CCS qualifier');
    expect(l['de-anza:Play-in'], 'views/standings/division.ts SCVAL play-in').toBe(
      '4th place — play-in Fri Oct 30 for the SCVAL 7th berth',
    );
    const scval = m.sd.buildStandingsPageView('scval');
    const deAnza = scval.views.find((v) => v.division === 'de-anza')!;
    expect(deAnza.caption, 'views/standings/division.ts caption').toMatch(
      /^De Anza Division league standings, league games only, through /,
    );
    expect(deAnza.legendNotes, 'views/standings/division.ts legend').toContain(
      'This order is our computation from published results, not a league ruling: the official tiebreak, including any coin flip, belongs to SCVAL.',
    );
    expect(deAnza.kicker).toBe('De Anza');
    expect(deAnza.statusHeading).toBe('CCS qualifying, as things stand');
  });

  it('BVAL: Mt. Hamilton ladder and the Santa Teresa play-in host', () => {
    const l = legends('bval');
    expect(l['mt-hamilton:AQ'], 'views/standings/division.ts BVAL').toBe(
      'Places 1-3 — automatic CCS qualifier (BVAL #1-#3)',
    );
    expect(l['santa-teresa:Play-in host'], 'views/standings/division.ts BVAL').toBe(
      'Champion — hosts Mt. Hamilton #4 Sat Oct 31, 11 AM, for BVAL’s 4th berth',
    );
    expect(l['santa-teresa:No AQ route'], 'views/standings/division.ts BVAL').toBe(
      '2nd or lower — no automatic-berth route (at-large is the CCS committee’s call)',
    );
  });

  it('PCAL: two automatic berths', () => {
    const l = legends('pcal');
    expect(l['pcal:AQ'], 'views/standings/division.ts PCAL').toBe('Places 1-2 — automatic CCS qualifier');
    expect(l['pcal:No AQ route']).toBe('3rd or lower — no automatic-berth route; may apply for at-large (PCAL By-laws §23.4)');
  });

  it('MCAL: the tournament ladder and no CCS concept', () => {
    const l = legends('mcal');
    expect(l['marin-county:Bye'], 'views/standings/division.ts MCAL').toBe(
      'Places 1-2 — bye to the semifinals, Wed Oct 28',
    );
    expect(l['marin-county:Top 6']).toBe('Places 3-6 — quarterfinal Mon Oct 26 (3 hosts 6, 4 hosts 5)');
    const mcal = m.sd.buildStandingsPageView('mcal').views[0];
    expect(mcal.statusHeading, 'views/standings/division.ts MCAL heading').toBe('MCAL tournament, as things stand');
    expect(mcal.playoffsHref).toBe('/playoffs/mcal');
  });
});

describe('single-division leagues have no division label', () => {
  it('kicker, caption and heading (view model)', () => {
    for (const league of ['pcal', 'mcal', 'eal']) {
      const [v] = m.sd.buildStandingsPageView(league).views;
      expect(v.heading, `views/standings/division.ts ${league} heading`).toBeNull();
      expect(v.kicker, `views/standings/division.ts ${league} kicker`).toBe('League table');
      expect(v.caption).not.toMatch(/Division/);
    }
  });

  it('no division label, no Gabilan, no CCS concept on MCAL (rendered pages)', async () => {
    const pcal = await renderLeague('pcal');
    const mcal = await renderLeague('mcal');
    for (const [name, html] of [
      ['pcal', pcal],
      ['mcal', mcal],
    ] as const) {
      const text = textOf(html);
      expect(text, `app/standings/[league]/page.tsx ${name}: Gabilan`).not.toContain('Gabilan');
      expect(text, `app/standings/[league]/page.tsx ${name}: division label`).not.toMatch(
        /PCAL Division|MCAL Division|Marin County Division/,
      );
      expect(html, `app/standings/[league]/page.tsx ${name}: division tabs`).not.toContain('aria-label="Divisions"');
      expect(/eliminat/i.test(text), `app/standings/[league]/page.tsx ${name}: eliminated`).toBe(false);
    }
    const mcalText = textOf(mcal);
    for (const banned of ['automatic qualifier', 'at-large', 'CCS Division', 'CCS picture']) {
      expect(mcalText.toLowerCase(), `app/standings/[league]/page.tsx mcal: ${banned}`).not.toContain(banned.toLowerCase());
    }
    expect(mcal, 'app/standings/[league]/page.tsx mcal: id').toContain('id="marin-county"');
    expect(pcal, 'app/standings/[league]/page.tsx pcal: id').toContain('id="pcal"');
  });

  it('never calls a team of a league with no documents "official" when it has no results (EAL, D23)', async () => {
    // The all-2026-10-02 corpus does not fetch the EAL, so all six EAL rows have no results.
    const rows = m.data.getStandings('eal');
    expect(rows.length, 'lib/queries/standings.ts getStandings(eal)').toBe(6);
    expect(rows.every((s) => !s.hasReportedResults), 'the EAL has no data in this corpus').toBe(true);
    const eal = textOf(await renderLeague('eal'));
    for (const team of m.data.getTeams('eal')) {
      expect(eal, 'views/standings/table-notes.ts collectStandingsNotes').toContain(
        `${team.name} is in the EAL table as MaxPreps lists it but has no results in the source table — no record is invented for them.`,
      );
    }
    expect(eal, 'app/standings/[league]/page.tsx eal').not.toMatch(/\bofficial EAL|\bofficial\s+\S+\s+alignment/i);
    expect(textOf(renderOverview()), 'app/standings/page.tsx').not.toMatch(/\bofficial EAL/i);

    // A league with a schedule document keeps its wording.
    const { collectStandingsNotes } = await import('@/views/standings/table-notes');
    const [first] = m.data.getStandings('pcal');
    const team = getTeamById(first.teamId)!;
    const notes = collectStandingsNotes({
      rows: [{ team, standing: { ...first, hasReportedResults: false } }],
    });
    expect(notes, 'views/standings/table-notes.ts collectStandingsNotes (pcal)').toContainEqual({
      kind: 'no-results',
      text: `${team.name} is in the official PCAL alignment but has no results in the source table — no record is invented for them.`,
    });
  });

  it('multi-division leagues keep their anchors and tabs', async () => {
    const scval = await renderLeague('scval');
    expect(scval).toContain('id="de-anza"');
    expect(scval).toContain('id="el-camino"');
    expect(scval).toContain('href="#de-anza"');
    expect(scval, 'app/standings/[league]/page.tsx sticky offset').toContain('[--sx-sticky-top:6rem]');
    const pcal = await renderLeague('pcal');
    expect(pcal, 'app/standings/[league]/page.tsx single-division offset').not.toContain('[--sx-sticky-top:6rem]');
  });
});

describe('missing official results and postponed rows', () => {
  it('Santa Teresa shows its two missing results with the one-line banner', async () => {
    const st = m.sd.buildStandingsPageView('bval').views.find((v) => v.division === 'santa-teresa')!;
    expect(st.missing.length, 'lib/queries/standings.ts getMissingOfficialResults(santa-teresa)').toBe(2);
    expect(st.missingBanner, 'views/standings/division.ts banner').toBe(
      '⚑ 2 official league results missing — listed below the table.',
    );
    expect(st.missingIntro).toBe(
      'On Blossom Valley Athletic League’s official schedule for a date that has passed, with no counted result yet:',
    );
    const html = await renderLeague('bval');
    expect(html, 'components/standings/MissingResultsBanner.tsx link').toContain('href="#missing-santa-teresa"');
    expect(html, 'components/standings/StandingsNotes.tsx target').toContain('id="missing-santa-teresa"');
    expect(textOf(html)).toContain('official league results missing — listed below the table.');
  });

  it('singular banner, postponed rows listed after and never counted', () => {
    expect(m.view.missingBannerText(1)).toBe('⚑ 1 official league result missing — listed below the table.');
    const base = m.sd.buildStandingsPageView('scval').views[0];
    const row = (kind: 'missing' | 'postponed', dateKey: string): MissingOfficialResult => ({
      kind,
      dateKey,
      awayName: 'Homestead',
      homeName: 'Cupertino',
      awaySlug: 'homestead',
      homeSlug: 'cupertino',
      game: null,
      sblive: kind === 'missing' ? { home: 5, away: 5, note: 'no MaxPreps contest and the si.com row is not final' } : null,
    });
    const v = m.view.buildDivisionView({
      division: 'de-anza',
      standings: m.data.getStandings('de-anza'),
      teams: m.data.getTeams(),
      crossCheck: [],
      context: base.context,
      missing: [row('missing', '2026-09-09'), row('postponed', '2026-09-16')],
      backfilledGames: 0,
      gdDomain: 10,
      throughDate: '2026-09-30',
      leagueFinals: 10,
      pendingLeagueGames: 0,
    });
    expect(v.missingBanner, 'views/standings/division.ts').toBe(
      '⚑ 1 official league result missing — listed below the table.',
    );
    expect(v.missing.map((r) => r.text)).toEqual(['Sep 9 Homestead at Cupertino']);
    expect(v.missing[0].sbliveNote).toBe(
      'si.com reports Homestead 5-5 Cupertino; not counted: no MaxPreps contest and the si.com row is not final',
    );
    expect(v.postponed.map((r) => r.text)).toEqual(['Sep 16 Homestead at Cupertino — Postponed']);
  });
});
