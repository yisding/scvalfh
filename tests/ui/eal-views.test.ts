/**
 * The league pages on the EAL corpus (spec D5, D8, D9, D21, D23, D26): `/standings/eal`, the
 * `/standings` EAL block, `/schedule/eal`, the EAL parts of `/about` (its source card, its generated
 * rules, its health card, the Postseason paragraph) and `/history/2025-26#eal`.
 *
 * The EAL publishes no schedule document (`official.mode: 'none'`), decides its title on points and
 * publishes no standings (`orderScope: 'title'`), and its postseason is the Super Regional, an unbracketed
 * tournament: no ladder line, no bracket, no seeding. These tests run on the EAL corpus (where the
 * EAL has data, including two league games past their date with no score), loaded by pointing
 * SCVAL_SNAPSHOT at it BEFORE lib/data is imported. Every expected number is read from the snapshot
 * or from config; every assertion message names the module that produced the value.
 */

import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { EAL_CORPUS, corpusSnapshotPath } from '../helpers';
import { textOf } from './html-text';

type Data = typeof import('../../lib/data');
type Leagues = typeof import('../../lib/leagues');
type StandingsPageView = typeof import('../../components/standings/standings-page-view');
type View = typeof import('../../components/standings/standings-view');

const LEAGUE = 'eal';
const priorEnv = process.env.SCVAL_SNAPSHOT;
let data: Data;
let leagues: Leagues;
let sd: StandingsPageView;
let view: View;
let standingsHtml: string;
let overviewHtml: string;
let scheduleHtml: string;
let aboutHtml: string;
let historyHtml: string;

/** CCS concepts and seed words no EAL view may carry (spec D21, D10). */
const BANNED = /\bCCS\b|at-large|automatic qualifier|\b(\d+(st|nd|rd|th)|No\. ?\d+|top|first|second) seed(ed)?\b/i;

/** The inner HTML of the first element carrying `id`, up to its matching close tag. */
function byId(html: string, id: string): string {
  const open = new RegExp(`<(\\w+)[^>]*\\sid="${id}"[^>]*>`).exec(html);
  if (!open) return '';
  const tag = open[1];
  let depth = 1;
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'g');
  re.lastIndex = open.index + open[0].length;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(open.index + open[0].length, m.index);
  }
  return '';
}

/** The `<section aria-labelledby="<id>">` block (a heading carries the id, the section names it). */
function sectionLabelledBy(html: string, id: string): string {
  const at = html.search(new RegExp(`<section[^>]*\\saria-labelledby="${id}"`));
  return at < 0 ? '' : byId(`${html.slice(0, at)}<section id="__probe__"${html.slice(at + '<section'.length)}`, '__probe__');
}

beforeAll(async () => {
  process.env.SCVAL_SNAPSHOT = corpusSnapshotPath(EAL_CORPUS);
  vi.resetModules();
  data = await import('../../lib/data');
  leagues = await import('../../lib/leagues');
  sd = await import('../../components/standings/standings-page-view');
  view = await import('../../components/standings/standings-view');
  const leagueStandings = (await import('../../app/standings/[league]/page')).default;
  const overview = (await import('../../app/standings/page')).default;
  const leagueSchedule = (await import('../../app/schedule/[league]/page')).default;
  const about = (await import('../../app/about/page')).default;
  const history = (await import('../../app/history/2025-26/page')).default;
  const params = { params: Promise.resolve({ league: LEAGUE }) } as never;
  standingsHtml = renderToStaticMarkup((await leagueStandings(params)) as ReactElement);
  overviewHtml = renderToStaticMarkup(createElement(overview));
  scheduleHtml = renderToStaticMarkup((await leagueSchedule(params)) as ReactElement);
  aboutHtml = renderToStaticMarkup(createElement(about));
  historyHtml = renderToStaticMarkup(createElement(history));
}, 600_000);

afterAll(() => {
  if (priorEnv === undefined) delete process.env.SCVAL_SNAPSHOT;
  else process.env.SCVAL_SNAPSHOT = priorEnv;
  vi.resetModules();
});

describe('/standings/eal', () => {
  it('prints the membership note under the header, from config', () => {
    const note = leagues.getLeague(LEAGUE).membershipNote!;
    expect(note).toBeTruthy();
    expect(textOf(standingsHtml), 'app/standings/[league]/page.tsx membershipNote').toContain(note);
    expect(sd.buildStandingsPageView(LEAGUE).membershipNote).toBe(note);
  });

  it('links no official schedule and says where its league games come from', () => {
    const [v] = sd.buildStandingsPageView(LEAGUE).views;
    expect(v.officialSchedule, 'components/standings/standings-view.ts officialSchedule').toBeNull();
    expect(v.scheduledPer).toBe('League games as MaxPreps marks them (EAL publishes no schedule)');
    const text = textOf(standingsHtml);
    expect(text, 'components/standings/StandingsNotes.tsx source line').toContain(
      'League games as MaxPreps marks them (EAL publishes no schedule).',
    );
    expect(text, 'components/standings/StandingsNotes.tsx').not.toMatch(/Official schedule|Scheduled per EAL/);
  });

  it('words the rank rule and the order legend for a league that publishes no standings (D26)', () => {
    const [v] = sd.buildStandingsPageView(LEAGUE).views;
    expect(v.rankRule, 'components/standings/standings-view.ts rankRule').toBe(
      'EAL decides its title on points (NS Guidelines §VII.C.2) and publishes no standings; this site orders the whole table by the same points.',
    );
    expect(v.legendNotes, 'components/standings/standings-view.ts legend').toContain(
      'This order is our computation from published results, not a league ruling: EAL publishes no standings.',
    );
    expect(textOf(standingsHtml)).not.toContain('the official tiebreak belongs to EAL');
    // The Guidelines DO write an order (§III.E.1 seeding on league record) and assume league places
    // (§IV, §VII.F); what they lack is a rule for the league table and any published standings.
    const claims = /ranks no table|set no other order|only a champion|publishes no table/;
    expect(textOf(standingsHtml), 'app/standings/[league]/page.tsx eal').not.toMatch(claims);
    // The San Diego Section's Valley has, in fact, no MaxPreps table, and its health card says so in
    // lib/standings.ts crossCheckSkipReason's words; that sentence is about Valley, not the EAL.
    expect(textOf(aboutHtml).replaceAll('MaxPreps publishes no table for this division', ''), 'app/about/page.tsx').not.toMatch(claims);
    const order = leagues.getLeague(LEAGUE).rules.citations.order;
    expect(order, 'lib/leagues.ts EAL citations.order').toContain('§III.E.1 Super Regional seeding criteria are not applied here');
    expect(textOf(aboutHtml), 'app/about/page.tsx rules').toContain(`${order}.`);
    const alone = data.getStandings(LEAGUE).filter((r) => r.hasReportedResults && !r.tiebreak.shared);
    expect(alone.length, 'the EAL corpus has teams placed on points alone').toBeGreaterThan(0);
    for (const s of alone) expect(s.tiebreak.note, 'lib/standings.ts EAL tiebreak note').toContain(order);
    expect(view.rankRuleText(leagues.getLeague('mcal')), 'table-scope leagues unchanged').toBe(
      'MCAL ranks by points (MCAL Handbook §7a), and so do we.',
    );
  });

  it('heads the band "Super Regional, as things stand", links the /playoffs card, and draws no 2px rule', () => {
    const [v] = sd.buildStandingsPageView(LEAGUE).views;
    expect(v.statusHeading, 'components/standings/standings-view.ts statusHeading').toBe('Super Regional, as things stand');
    expect(v.playoffsHref).toBe(`/playoffs#${LEAGUE}`);
    expect(v.playoffsLinkText).toBe('Postseason');
    expect(v.berthRuleAfter, 'no ladder line: every team is in the top six').toBeUndefined();
    expect(v.ladderLineLabel).toBeNull();
    const ps = leagues.getLeague(LEAGUE).postseason;
    if (ps.kind !== 'unbracketed-tournament') throw new Error('EAL postseason kind');
    expect(v.legendNotes[0], 'components/standings/standings-view.ts legend').toBe(`${ps.citations.qualification}.`);
    const text = textOf(standingsHtml);
    expect(text, 'components/standings/PlayoffStatusBand.tsx').toContain('Super Regional, as things stand');
    expect(standingsHtml).toContain(`href="/playoffs#${LEAGUE}"`);
    expect(text, 'app/standings/[league]/page.tsx legend').not.toMatch(/2px rule|heavier line/);
  });

  it('lists every league game past its date with no counted result, in words that never say "official" (D23)', () => {
    const today = data.getToday();
    const expected = data
      .getGames({ division: LEAGUE })
      .filter(
        (g) =>
          g.countsFor === LEAGUE &&
          g.dateKey < today &&
          (g.status === 'scheduled' || g.status === 'live' || g.status === 'score-pending'),
      )
      .map((g) => g.contestId)
      .sort();
    const rows = data.getMissingOfficialResults(LEAGUE).filter((r) => r.kind === 'missing');
    expect(rows.map((r) => r.game?.contestId).sort(), 'lib/data.ts getMissingOfficialResults(eal)').toEqual(expected);
    expect(expected.length, 'the EAL corpus has league games past their date with no score').toBeGreaterThan(0);

    const [v] = sd.buildStandingsPageView(LEAGUE).views;
    expect(v.missing).toHaveLength(expected.length);
    expect(v.missingBanner, 'components/standings/standings-view.ts missingBanner').toBe(
      expected.length === 1
        ? '⚑ 1 league result missing — listed below the table.'
        : `⚑ ${expected.length} league results missing — listed below the table.`,
    );
    expect(v.missingIntro).toBe(
      'Marked by MaxPreps as EAL league games, dated before today, with no counted result yet:',
    );
    const text = textOf(standingsHtml);
    expect(text).toContain(v.missingBanner!.replace(/^⚑\s*/, ''));
    expect(text).toContain(v.missingIntro);
    for (const row of v.missing) expect(text).toContain(row.matchup);
    const notes = textOf(byId(standingsHtml, `missing-${LEAGUE}`));
    expect(notes, 'components/standings/StandingsNotes.tsx missing list').not.toBe('');
    expect(`${v.missingBanner} ${notes}`.toLowerCase()).not.toContain('official');
  });

  it('keeps the wording for a league with a schedule document', () => {
    expect(view.missingBannerText(1)).toBe('⚑ 1 official league result missing — listed below the table.');
    expect(view.missingBannerText(2, { official: false })).toBe('⚑ 2 league results missing — listed below the table.');
  });

  it('carries no CCS concept and no seed word', () => {
    expect(textOf(standingsHtml), 'app/standings/[league]/page.tsx eal').not.toMatch(BANNED);
  });
});

describe('/standings, the EAL block', () => {
  it('sits under the Northern Section with its membership note', () => {
    const outline = [...overviewHtml.matchAll(/<h([1-4])[^>]*>([\s\S]*?)<\/h\1>/g)].map(
      (m) => `h${m[1]} ${textOf(m[2]).trim()}`,
    );
    // The last NorCal section (the SoCal sections follow it, in their own region block).
    const ns = outline.indexOf('h2 Northern Section');
    expect(outline.slice(ns, ns + 2), 'app/standings/page.tsx outline').toEqual(['h2 Northern Section', 'h3 EAL — Eastern Athletic League']);
    expect(outline[ns + 2], 'app/standings/page.tsx outline').toBe('h2 Southern Section');
    const block = textOf(sectionLabelledBy(overviewHtml, 'ns'));
    expect(block, 'app/standings/page.tsx EAL block').toContain(leagues.getLeague(LEAGUE).membershipNote!);
    // No ladder line in the compact table (ladderLine null).
    expect(block).not.toMatch(/\bline\b/i);
    // Only the EAL carries a NorCal membership note.
    for (const id of ['ccs', 'ncs']) {
      const other = textOf(sectionLabelledBy(overviewHtml, id));
      expect(other).not.toBe('');
      expect(other).not.toContain('Sac-Joaquin');
    }
  });
});

describe('/schedule/eal', () => {
  it('ends the rail with the Super Regional chip, never a CCS one', () => {
    expect(scheduleHtml, 'components/schedule/TimelineRail.tsx').toContain(`href="/playoffs#${LEAGUE}"`);
    const text = textOf(scheduleHtml);
    expect(text).toContain('Super Regional Oct 30–31');
    expect(scheduleHtml).toContain('Super Regional, Oct 30 to 31');
    expect(text, 'app/schedule/[league]/page.tsx eal').not.toMatch(BANNED);
  });
});

describe('/about, the EAL parts', () => {
  const rules = () => byId(aboutHtml, `rules-${LEAGUE}`);

  it('lists the five postseason citations, the note and the counts sentence in the generated rules', () => {
    const ps = leagues.getLeague(LEAGUE).postseason;
    if (ps.kind !== 'unbracketed-tournament') throw new Error('EAL postseason kind');
    const text = textOf(rules());
    for (const key of ['qualification', 'format', 'seeding', 'eligibility', 'noFurtherPath'] as const) {
      expect(text, `app/about/page.tsx postseason ${key}`).toContain(`${ps.citations[key]}.`);
    }
    expect(text, 'app/about/page.tsx postseason note').toContain(ps.note);
    expect(text, 'app/about/page.tsx counts').toContain(
      'A game counts when MaxPreps marks it a league game and both teams belong to the same league; MaxPreps’ tournament and postseason games never count. Games between two EAL teams on or after Fri Oct 30 are Super Regional games.',
    );
    expect(text).not.toMatch(BANNED);
  });

  it('prints no multi-team tie procedure for the EAL, whose chain has no step that separates teams', () => {
    expect(leagues.getLeague(LEAGUE).rules.tiebreaks.default, 'lib/leagues.ts EAL chain').toEqual(['no-rule']);
    expect(textOf(rules()), 'app/about/page.tsx EAL rules').not.toContain('three or more teams are level');
    // Every other league with generated rules (SCVAL's by-laws are quoted) keeps the paragraph exactly when
    // its chain has a separating step: the Southern California leagues' lone 'no-rule' has none, like the EAL's.
    for (const other of leagues.LEAGUES.filter((l) => l.id !== LEAGUE && l.rules.matcher !== 'legacy')) {
      const separates =
        Object.keys(other.rules.tiebreaks.byBucketStart ?? {}).length > 0 ||
        other.rules.tiebreaks.default.some((stage) => stage !== 'no-rule');
      const text = textOf(byId(aboutHtml, `rules-${other.id}`));
      if (separates) expect(text, `app/about/page.tsx ${other.id} rules`).toContain('three or more teams are level');
      else expect(text, `app/about/page.tsx ${other.id} rules`).not.toContain('three or more teams are level');
    }
  });

  it('gives the EAL a source card with the Guidelines, its official note and its membership note, and no schedule link', () => {
    const text = textOf(aboutHtml);
    const division = leagues.getDivision(LEAGUE);
    if (division.official.mode !== 'none') throw new Error('EAL official mode');
    expect(text, 'app/about/page.tsx source card').toContain(
      `The rules quoted under EAL rules come from the CIF Northern Section’s Field Hockey Guidelines 2026-28. ${division.official.note} ${leagues.getLeague(LEAGUE).membershipNote}`,
    );
    expect(text).not.toMatch(/EAL schedule \((PDF|Google Doc)\)/);
    expect(text, 'app/about/page.tsx CIF Northern Section card').toContain(
      'CIF Northern Section Rules & postseason dates',
    );
    const ps = leagues.getLeague(LEAGUE).postseason;
    if (ps.kind !== 'unbracketed-tournament') throw new Error('EAL postseason kind');
    expect(textOf(byId(aboutHtml, 'playoffs')), 'app/about/page.tsx Postseason').toContain(
      `Northern Section: ${ps.note} Northern Section Field Hockey Guidelines (PDF)`,
    );
    expect(text, 'app/about/page.tsx roster line').toMatch(/for all \d+ teams in all nine leagues/);
  });

  it('names the reported scores, not the Guidelines, as the EAL’s record for seeding, and dates no sweep wrongly', () => {
    const text = textOf(aboutHtml);
    // The Guidelines are rules, not a record of results: §VII.J says the scores schools report are
    // what seeding uses.
    expect(text, 'app/about/page.tsx disclaimer').toContain(
      'each league’s own standings (or, for the EAL, which publishes none, the scores its schools report for seeding under the Northern Section’s Field Hockey Guidelines) are always the source of truth',
    );
    // The commitments research ran in rounds that did not cover the same teams (2026-10-03 and
    // 2026-10-04 for the four older leagues; a field-hockey-only sweep on 2026-10-04 for the EAL),
    // so the coverage paragraph prints no single research date (as the clubs one beside it).
    const coverage = textOf(byId(aboutHtml, 'commits-coverage'));
    expect(coverage, 'app/about/page.tsx #commits-coverage').toContain(
      'It was researched by hand with the club pages’ matching rule, each commitment checked twice when it was added, and is not part of the twice-daily update.',
    );
    expect(coverage).not.toMatch(/researched by hand on/);
  });

  it('shows "No official schedule document." and the D23 Missing row on the EAL health card', () => {
    const card = /<article[^>]*aria-label="EAL data health"[^>]*>([\s\S]*?)<\/article>/.exec(aboutHtml)?.[1] ?? '';
    const text = textOf(card);
    const division = leagues.getDivision(LEAGUE);
    if (division.official.mode !== 'none') throw new Error('EAL official mode');
    expect(text, 'components/about/LeagueHealthCard.tsx').toContain(`No official schedule document. ${division.official.note}`);
    const missing = data
      .getLeagueHealth(LEAGUE)
      .divisions.reduce((n, d) => n + (d.official?.missingPast ?? d.missingLeaguePast ?? 0), 0);
    expect(missing, 'the EAL corpus health row counts the past league games with no score').toBeGreaterThan(0);
    expect(text, 'components/about/LeagueHealthCard.tsx Missing').toContain(
      `${missing} ${missing === 1 ? 'league result' : 'league results'} past their date with no counted result`,
    );
    expect(text).not.toMatch(/official league result|EAL schedule \(/);
  });

  it('counts the member rows of the MaxPreps table, never its extra non-member row', () => {
    const card = /<article[^>]*aria-label="EAL data health"[^>]*>([\s\S]*?)<\/article>/.exec(aboutHtml)?.[1] ?? '';
    const health = data.getLeagueHealth(LEAGUE).divisions[0];
    const members = data.getStandings(LEAGUE).filter((s) => s.reported !== null).length;
    expect(health.reportedTable, 'lib/pipeline/steps/reported.ts').toBe('ok');
    expect(health.reportedRows, 'lib/pipeline/steps/reported.ts: the members the table resolved to').toBe(members);
    expect(textOf(card), 'components/about/LeagueHealthCard.tsx').toContain(`read this run (${members} member rows).`);
  });

  it('counts member rows from the standings, so an older snapshot’s stored count cannot print a wrong one', async () => {
    // A snapshot written before reported.ts stopped counting MaxPreps' extra row stored one more
    // than the members (7 for the six EAL teams); the card must still print the member count.
    const { LeagueHealthCard } = await import('../../components/about/LeagueHealthCard');
    const health = data.getLeagueHealth(LEAGUE);
    const stale = { ...health, divisions: health.divisions.map((d) => ({ ...d, reportedRows: (d.reportedRows ?? 0) + 1 })) };
    const division = leagues.getLeague(LEAGUE).divisions[0];
    const members = data.getStandings(division.id).filter((s) => s.reported !== null).length;
    const html = renderToStaticMarkup(
      createElement(LeagueHealthCard, {
        shortName: 'EAL',
        name: 'Eastern Athletic League',
        health: stale,
        divisions: [
          { id: division.id, heading: null, maxprepsUrl: 'https://example.invalid/', memberRows: members, knownCause: null, official: { mode: 'none', note: 'n' } },
        ],
        dropped: 0,
        problems: [],
      }),
    );
    expect(textOf(html)).toContain(`(${members} member rows)`);
    expect(textOf(html)).not.toContain(`(${members + 1} member rows)`);
  });
});

describe('/history/2025-26#eal', () => {
  it('renders the EAL as unavailable, with its reason and no claim of a league site', async () => {
    const { getHistorySeason } = await import('../../lib/history');
    expect(getHistorySeason()).toBe('2025-26');
    const section = byId(historyHtml, LEAGUE);
    const text = textOf(section);
    expect(text, 'app/history/2025-26/page.tsx #eal').toContain('Unavailable');
    expect(text).toContain('The EAL published no 2025-26 final standings of its own.');
    expect(text).toContain('its section’s field hockey page is cifns.org/sports/fh/index');
    expect(text).not.toContain('its official site is');
    expect(text).not.toMatch(BANNED);
  });
});
