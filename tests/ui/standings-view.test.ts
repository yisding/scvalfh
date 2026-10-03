/**
 * The standings pages' view models and markup (SPEC §10.3, §8.1, §10.0, §10.9):
 * `components/standings/standings-view.ts`, `app/standings/standings-data.ts`, the per-league page
 * `/standings/<league>` and the all-league overview `/standings`.
 *
 * League-specific values are asserted on the all-2026-10-02 CORPUS snapshot (SPEC §13.6), loaded by
 * pointing SCVAL_SNAPSHOT at it BEFORE lib/data is imported (dynamic imports after
 * `vi.resetModules()`), so live fetch #2 cannot break them. Every assertion message names the
 * module that produced the value, so a failure routes to its owner.
 */

import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { MissingOfficialResult } from '../../lib/data';
import { corpusSnapshotPath } from '../helpers';
// textOf: visible text, tags dropped and entities decoded.
import { textOf } from './html-text';

type Data = typeof import('../../lib/data');
type StandingsData = typeof import('../../app/standings/standings-data');
type View = typeof import('../../components/standings/standings-view');

const priorEnv = process.env.SCVAL_SNAPSHOT;
let data: Data;
let sd: StandingsData;
let view: View;
let renderLeague: (league: string) => Promise<string>;
let renderOverview: () => string;

beforeAll(async () => {
  process.env.SCVAL_SNAPSHOT = corpusSnapshotPath('all-2026-10-02');
  vi.resetModules();
  data = await import('../../lib/data');
  sd = await import('../../app/standings/standings-data');
  view = await import('../../components/standings/standings-view');
  const leaguePage = (await import('../../app/standings/[league]/page')).default;
  const overviewPage = (await import('../../app/standings/page')).default;
  renderLeague = async (league) => {
    const el = await leaguePage({ params: Promise.resolve({ league }) } as never);
    return renderToStaticMarkup(el as ReactElement);
  };
  renderOverview = () => renderToStaticMarkup(createElement(overviewPage));
}, 600_000);

afterAll(() => {
  if (priorEnv === undefined) delete process.env.SCVAL_SNAPSHOT;
  else process.env.SCVAL_SNAPSHOT = priorEnv;
  vi.resetModules();
});

function ids(html: string): string[] {
  return [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
}

describe('ladder badges and legends, per league (verbatim from config)', () => {
  const legends = (league: string) =>
    Object.fromEntries(
      sd.getStandingsPageData(league).views.flatMap((v) => v.statusGroups.map((g) => [`${v.division}:${g.badge}`, g.label])),
    );

  it('SCVAL keeps today’s strings', () => {
    const l = legends('scval');
    expect(l['de-anza:AQ'], 'components/standings/standings-view.ts SCVAL AQ').toBe('Places 1-3 — automatic CCS qualifier');
    expect(l['de-anza:Play-in'], 'components/standings/standings-view.ts SCVAL play-in').toBe(
      '4th place — play-in Fri Oct 30 for the SCVAL 7th berth',
    );
    const scval = sd.getStandingsPageData('scval');
    const deAnza = scval.views.find((v) => v.division === 'de-anza')!;
    expect(deAnza.caption, 'components/standings/standings-view.ts caption').toMatch(
      /^De Anza Division league standings, league games only, through /,
    );
    expect(deAnza.legendNotes, 'components/standings/standings-view.ts legend').toContain(
      'This order is our computation from published results, not a league ruling: the official tiebreak, including any coin flip, belongs to SCVAL.',
    );
    expect(deAnza.kicker).toBe('De Anza');
    expect(deAnza.statusHeading).toBe('CCS qualifying, as things stand');
  });

  it('BVAL: Mt. Hamilton ladder and the Santa Teresa play-in host', () => {
    const l = legends('bval');
    expect(l['mt-hamilton:AQ'], 'components/standings/standings-view.ts BVAL').toBe(
      'Places 1-3 — automatic CCS qualifier (BVAL #1-#3)',
    );
    expect(l['santa-teresa:Play-in host'], 'components/standings/standings-view.ts BVAL').toBe(
      'Champion — hosts Mt. Hamilton #4 Sat Oct 31, 11 AM, for BVAL’s 4th berth',
    );
    expect(l['santa-teresa:No AQ route'], 'components/standings/standings-view.ts BVAL').toBe(
      '2nd or lower — no automatic-berth route (at-large is the CCS committee’s call)',
    );
  });

  it('PCAL: two automatic berths', () => {
    const l = legends('pcal');
    expect(l['pcal:AQ'], 'components/standings/standings-view.ts PCAL').toBe('Places 1-2 — automatic CCS qualifier');
    expect(l['pcal:No AQ route']).toBe('3rd or lower — no automatic-berth route; may apply for at-large (PCAL By-laws §23.4)');
  });

  it('MCAL: the tournament ladder and no CCS concept', () => {
    const l = legends('mcal');
    expect(l['marin-county:Bye'], 'components/standings/standings-view.ts MCAL').toBe(
      'Places 1-2 — bye to the semifinals, Wed Oct 28',
    );
    expect(l['marin-county:Top 6']).toBe('Places 3-6 — quarterfinal Mon Oct 26 (3 hosts 6, 4 hosts 5)');
    const mcal = sd.getStandingsPageData('mcal').views[0];
    expect(mcal.statusHeading, 'components/standings/standings-view.ts MCAL heading').toBe('MCAL tournament, as things stand');
    expect(mcal.playoffsHref).toBe('/playoffs/mcal');
  });
});

describe('single-division leagues have no division label', () => {
  it('kicker, caption and heading (view model)', () => {
    for (const league of ['pcal', 'mcal']) {
      const [v] = sd.getStandingsPageData(league).views;
      expect(v.heading, `components/standings/standings-view.ts ${league} heading`).toBeNull();
      expect(v.kicker, `components/standings/standings-view.ts ${league} kicker`).toBe('League table');
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
    const st = sd.getStandingsPageData('bval').views.find((v) => v.division === 'santa-teresa')!;
    expect(st.missing.length, 'lib/data.ts getMissingOfficialResults(santa-teresa)').toBe(2);
    expect(st.missingBanner, 'components/standings/standings-view.ts banner').toBe(
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
    expect(view.missingBannerText(1)).toBe('⚑ 1 official league result missing — listed below the table.');
    const base = sd.getStandingsPageData('scval').views[0];
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
    const v = view.buildDivisionView({
      division: 'de-anza',
      standings: data.getStandings('de-anza'),
      teams: data.getTeams(),
      crossCheck: [],
      context: base.context,
      missing: [row('missing', '2026-09-09'), row('postponed', '2026-09-16')],
      backfilledGames: 0,
      gdDomain: 10,
      throughDate: '2026-09-30',
      leagueFinals: 10,
      pendingLeagueGames: 0,
    });
    expect(v.missingBanner, 'components/standings/standings-view.ts').toBe(
      '⚑ 1 official league result missing — listed below the table.',
    );
    expect(v.missing.map((r) => r.text)).toEqual(['Sep 9 Homestead at Cupertino']);
    expect(v.missing[0].sbliveNote).toBe(
      'si.com reports Homestead 5-5 Cupertino; not counted: no MaxPreps contest and the si.com row is not final',
    );
    expect(v.postponed.map((r) => r.text)).toEqual(['Sep 16 Homestead at Cupertino — Postponed']);
  });
});

describe('GP, LEFT and MAX', () => {
  it('render from the standing context on the desktop table, GP on the phone row', async () => {
    const html = await renderLeague('mcal');
    expect(html, 'components/ui/StandingsTable.tsx head').toMatch(/>GP<\/th>/);
    expect(html).toMatch(/>Left<\/th>/);
    expect(html).toMatch(/>Max<\/th>/);
    const ctx = data.getStandingContext('marin-county');
    for (const c of ctx.values()) {
      expect(c.remaining, 'lib/data.ts getStandingContext').toBe(Math.max(0, c.scheduled - c.counted));
      expect(html, 'components/ui/StandingsTable.tsx GP').toContain(`${c.counted}/${c.scheduled}`);
    }
  });

  it('prints the uneven-GP footnote verbatim when the spread is two or more (MCAL adds its rule)', () => {
    const spread = data.getGamesPlayedSpread('marin-county');
    const note = view.unevenGpFootnote('mcal', spread);
    if (spread.max - spread.min >= 2) {
      expect(note, 'components/standings/standings-view.ts uneven-GP').toBe(
        `Teams have played between ${spread.min} and ${spread.max} of ${spread.scheduled} league games, so points favour teams that have played more. LEFT is league games with no counted result yet — still to play, or played and not reported. MAX is the most points a team could reach if it won all of them. The order is points, as MCAL rules require. If the season ends with games unplayed, MCAL General Rules (with an incomplete schedule, winning percentage replaces points); we will show that order then.`,
      );
    }
    expect(view.unevenGpFootnote('scval', { min: 5, max: 6, scheduled: 12 })).toBeNull();
  });

  it('marks si.com-backfilled records with † and the footnote (PCAL corpus: three backfills)', async () => {
    const pcal = sd.getStandingsPageData('pcal').views[0];
    expect(pcal.backfilledGames, 'app/standings/standings-data.ts backfilledGames').toBe(3);
    expect(pcal.backfillFootnote).toBe(
      '† Includes 3 results from High School on SI (si.com) that MaxPreps does not have, counted under the site’s si.com backfill rule (About → Sources).',
    );
    expect(view.backfillFootnoteText(1)).toBe(
      '† Includes 1 result from High School on SI (si.com) that MaxPreps does not have, counted under the site’s si.com backfill rule (About → Sources).',
    );
    const html = await renderLeague('pcal');
    expect(html, 'components/ui/StandingsTable.tsx †').toContain('score via si.com');
  });

  it('never claims agreement for Santa Teresa or PCAL', () => {
    const st = sd.getStandingsPageData('bval').views.find((v) => v.division === 'santa-teresa')!;
    expect(st.comparison.agreement, 'components/standings/standings-view.ts').toBeNull();
    expect(st.comparison.leftOut).toEqual(['MaxPreps’ table leaves out Prospect.']);
    const pcal = sd.getStandingsPageData('pcal').views[0];
    expect(pcal.comparison.agreement).toBeNull();
    expect(pcal.comparison.knownCause).toMatch(/^MaxPreps is missing some of PCAL’s official league games/);
    expect(pcal.comparison.flag).toBe(false);
  });

  it('labels the official schedule link by source', () => {
    expect(view.officialScheduleLabel('bval-docx')).toBe('Official schedule (Google Doc)');
    for (const s of ['scval-pdf', 'pcal-pdf', 'mcal-pdf'] as const) {
      expect(view.officialScheduleLabel(s)).toBe('Official schedule (PDF)');
    }
    expect(sd.getStandingsPageData('mcal').views[0].scheduledPer).toBe('Scheduled per MCAL');
  });

  it('writes the rules footnote with the league’s own points citation', () => {
    expect(view.rulesFootnote('scval'), 'components/standings/standings-view.ts rules').toBe(
      'PTS: SCVAL Field Hockey By-Laws 2026-27, Article VI §2 (3 points for a win, 1 for a tie). Ties: head-to-head, then division wins, then fewest goals given up between the tied teams, then head-to-head goal differential, then a coin flip (Article VI §3, §4, §5, §6, §7).',
    );
    expect(view.rulesFootnote('pcal')).toMatch(/^PTS: PCAL Sports Rules — Field Hockey \(Jan 2022\) §1\.7/);
  });
});

describe('the /standings overview', () => {
  it('has every anchor, each once, including the old SCVAL ones', () => {
    const html = renderOverview();
    const all = ids(html);
    const dupes = all.filter((id, i) => all.indexOf(id) !== i);
    expect(dupes, 'app/standings/page.tsx: duplicate ids').toEqual([]);
    for (const id of ['ccs', 'ncs', 'scval', 'de-anza', 'el-camino', 'bval', 'mt-hamilton', 'santa-teresa', 'pcal', 'mcal', 'marin-county']) {
      expect(all, `app/standings/page.tsx: #${id}`).toContain(id);
    }
  });

  it('follows the heading outline h2 section → h3 league → plain h4 division', () => {
    const html = renderOverview();
    const outline = [...html.matchAll(/<h([1-4])[^>]*>([\s\S]*?)<\/h\1>/g)].map((m) => `h${m[1]} ${textOf(m[2]).trim()}`);
    expect(outline, 'app/standings/page.tsx outline').toEqual([
      'h1 Standings',
      'h2 Central Coast Section',
      'h3 SCVAL — Santa Clara Valley Athletic League',
      'h4 De Anza',
      'h4 El Camino',
      'h3 BVAL — Blossom Valley Athletic League',
      'h4 Mt. Hamilton',
      'h4 Santa Teresa',
      'h3 PCAL — Pacific Coast Athletic League',
      'h2 North Coast Section',
      'h3 MCAL — Marin County Athletic League',
    ]);
    expect(html).toMatch(/<h4 class="m-0 mb-3 text-lead text-ink">/);
  });

  it('draws the labelled ladder line, links each full table, and has no sticky head', () => {
    const html = renderOverview();
    const text = textOf(html);
    for (const label of ['AQ line', 'Play-in host', 'Tournament line']) {
      expect(text, `components/standings/CompactStandingsTable.tsx ${label}`).toContain(label);
    }
    expect(html).toContain('href="/standings/scval#de-anza"');
    expect(html).toContain('href="/standings/mcal#marin-county"');
    expect(text).toContain('Full De Anza table →');
    expect(text).toContain('Full PCAL table →');
    expect(html, 'components/standings/CompactStandingsTable.tsx static head').toContain('[&amp;_th]:static');
    expect(text).not.toContain('Gabilan');
  });
});

describe('status chips, rank rule and level reason (UI pass, from config)', () => {
  const texts = (league: string) =>
    Object.fromEntries(
      sd.getStandingsPageData(league).views.map((v) => [v.division, v.statusGroups.map((g) => g.statusText)]),
    );

  it('each chip is the ladder rung’s own label; MCAL’s carry no CCS concept', () => {
    expect(texts('scval')['de-anza'], 'components/standings/standings-view.ts SCVAL statusText').toEqual([
      'Automatic qualifier',
      'Play-in game Oct 30',
      'At-large consideration',
      'No automatic path',
    ]);
    expect(texts('bval')['santa-teresa'], 'components/standings/standings-view.ts BVAL statusText').toEqual([
      'Hosts the play-in Oct 31',
      'No automatic-berth route',
    ]);
    expect(texts('pcal').pcal).toEqual(['Automatic qualifier', 'No automatic-berth route']);
    const mcal = texts('mcal')['marin-county'];
    expect(mcal, 'components/standings/standings-view.ts MCAL statusText').toEqual([
      'Semifinal bye',
      'MCAL tournament',
      'Below the tournament line',
    ]);
    for (const t of mcal) expect(t).not.toMatch(/CCS|automatic qualifier|at-large/i);
  });

  it('the rank rule and the level reason come from each league’s citations, never nested parentheses', () => {
    const [deAnza] = sd.getStandingsPageData('scval').views;
    expect(deAnza.rankRule, 'components/standings/standings-view.ts rankRule').toBe(
      'SCVAL ranks by points (Art. VI §2), and so do we.',
    );
    expect(deAnza.levelReason).toBe('Article VI §7 decides it with a coin flip');
    const [mcal] = sd.getStandingsPageData('mcal').views;
    expect(mcal.rankRule).toBe('MCAL ranks by points (MCAL Handbook §7a), and so do we.');
    expect(mcal.levelReason, 'components/standings/standings-view.ts MCAL levelReason').toBe(
      'a play-in on Fri Oct 23 decides it, MCAL Tie-Breaking Criteria',
    );
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
