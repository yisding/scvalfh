/**
 * lib/sources/cifss.ts and lib/cifss-crosscheck.ts — the cifsshome.org score cross-check
 * (docs/DATA-SOURCES.md §1.2a). The rules under test:
 *   1. a widget page parses into rows; a TBA opponent is skipped; the pagination names the last page;
 *   2. team identity is Section-scoped: a bare name resolves only within the listing's Section, a
 *      "(<Section>)" suffix within that Section, a "(No Section)" one only through the curated list;
 *   3. the comparison never changes a game, and reports only what a scored widget row says;
 *   4. a contest MaxPreps marks Deleted (or the pipeline dropped) is not "missing from MaxPreps".
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { CIFSS_NOTES, carryCifssCrossCheck, compareCifss } from '../lib/cifss-crosscheck';
import { gamePairKey } from '../lib/crosscheck';
import {
  CIFSS_NO_SECTION_TEAMS,
  CIFSS_SECTION_OVERRIDES,
  cifssListingUrl,
  parseCifssPage,
  resolveCifssName,
  type CifssRow,
  type CifssSectionKey,
} from '../lib/sources/cifss';
import { getTeamBySlug } from '../lib/teams';
import type { Game } from '../lib/types';
import { REPO, game } from './helpers';

const fixture = (name: string) => readFileSync(path.join(REPO, 'tests/fixtures/cifss', name), 'utf8');

let seq = 0;
function row(
  home: [string, number | null],
  away: [string, number | null],
  over: Partial<CifssRow> & { section?: CifssSectionKey } = {},
): CifssRow {
  const section = over.section ?? 'ccs';
  const side = ([name, score]: [string, number | null]) => ({ ...resolveCifssName(name, section)!, score });
  seq += 1;
  return {
    cifssId: String(9000 + seq),
    section,
    dateKey: '2026-09-09',
    home: side(home),
    away: side(away),
    gameType: 'League',
    note: null,
    ...over,
  };
}

const opts = { cifssFetchedAt: '2026-10-07T15:00:00.000Z' };

describe('parseCifssPage', () => {
  it('reads every row but the TBA one, with scores, dates, notes and the last page', () => {
    const page = parseCifssPage(fixture('ccs-1.html'), 'ccs');
    expect(page.lastPage).toBe(6);
    expect(page.listed).toBe(5); // the TBA row is listed, not parsed
    expect(page.rows.map((r) => [r.cifssId, r.dateKey, r.home.slug, r.home.score, r.away.slug, r.away.score, r.gameType])).toEqual([
      ['3916574', '2026-08-24', 'homestead', 4, 'santa-clara', 0, 'Non-League'],
      ['4962723', '2026-08-25', 'valley-christian', 0, 'christopher', 4, 'Non-League'],
      ['4558871', '2026-08-28', 'los-altos', 1, 'leigh', 2, 'Non-League'],
      ['4911754', '2026-09-11', 'salinas', null, 'stevenson', null, 'League'],
    ]);
    // "N/A" is no note; a real note is kept.
    expect(page.rows[1].note).toBeNull();
    expect(page.rows[2].note).toBe('Pre-season/out of League');
  });

  it('throws on a page with no listing table (a challenge or error page served with HTTP 200)', () => {
    expect(() => parseCifssPage('<html><body>Checking your browser…</body></html>', 'ccs')).toThrow(/not a cifsshome.org listing/);
    // A real listing with no games keeps its column heads, and parses as empty.
    const heads = fixture('ncs-1.html').replace(/<tr id="[\s\S]*<\/tbody>/, '</tbody>');
    expect(parseCifssPage(heads, 'ncs')).toEqual({ rows: [], listed: 0, lastPage: 1 });
  });

  it('resolves a suffixed school to its own Section, and an MCAL school by its widget name', () => {
    const page = parseCifssPage(fixture('ncs-1.html'), 'ncs');
    expect(page.lastPage).toBe(1);
    expect(page.rows.map((r) => [r.home.slug, r.away.slug])).toEqual([
      ['christopher', 'redwood'],
      ['tamalpais', 'convent-sacred-heart'],
    ]);
    expect(page.rows[0].home.name).toBe('Christopher');
  });
});

describe('resolveCifssName (Section-scoped)', () => {
  it.each([
    ['Del Norte', 'ncs', null], // the North Coast Section's own Del Norte, not San Diego's
    ['Del Norte  (San Diego Section)', 'ncs', 'del-norte'],
    ['Davis Sr', 'sjs', 'davis'],
    ['Davis Sr  (SAC-Joaquin Section)', 'ns', 'davis'],
    ['Davis Sr', 'ns', null],
    ['Edison/HB  (Southern Section)', 'sds', 'edison'],
    ['San Marcos/San Marcos', 'sds', 'san-marcos'],
    ['Stevenson  (No Section)', 'ccs', 'stevenson'],
    ['Hockaday  (No Section)', 'sds', null],
    ['Palo Alto  (Los Angeles City Section)', 'ccs', null],
  ] as const)('%s in the %s listing → %s', (name, listing, slug) => {
    expect(resolveCifssName(name, listing)?.slug ?? null).toBe(slug);
  });

  it('skips an unnamed opponent', () => {
    expect(resolveCifssName('TBA', 'ccs')).toBeNull();
    expect(resolveCifssName('  ', 'ccs')).toBeNull();
  });

  it('names only registry teams in its curated lists', () => {
    for (const slug of [...Object.keys(CIFSS_SECTION_OVERRIDES), ...Object.values(CIFSS_NO_SECTION_TEAMS)]) {
      expect(getTeamBySlug(slug), slug).toBeDefined();
    }
  });
});

describe('cifssListingUrl', () => {
  it('builds the widget query the site uses', () => {
    expect(cifssListingUrl('ccs', { from: '2026-08-01', to: '2026-10-07', page: 2 })).toBe(
      'https://www.cifsshome.org/widget/schedule-score?section_id=4&year=2026&sport_id=30' +
        '&date_from=08%2F01%2F2026&date_to=10%2F07%2F2026&page=2',
    );
    expect(cifssListingUrl('sds', { from: '2026-08-01', to: '2026-08-01' })).not.toContain('page=');
  });
});

describe('compareCifss', () => {
  const games: Game[] = [
    game({ home: 'Homestead', away: 'Santa Clara', hs: 4, as: 0, date: '2026-09-09' }),
    game({ home: 'Fremont', away: 'Cupertino', hs: 2, as: 1, date: '2026-09-09' }),
    game({ home: 'Leland', away: 'Gilroy', date: '2026-09-09', status: 'score-pending' }),
    game({ home: 'Palo Alto', away: 'Los Altos', hs: 3, as: 1, date: '2026-09-12' }),
  ];

  it('agrees on the same numbers whoever the widget calls home, and never changes a game', () => {
    const before = JSON.stringify(games);
    const { report } = compareCifss(games, [row(['Santa Clara', 0], ['Homestead', 4])], opts);
    expect(report).toMatchObject({ compared: 1, agreements: 1, conflicts: [], cifssOnlyScored: [], notOnMaxPreps: [] });
    expect(JSON.stringify(games)).toBe(before);
  });

  it('lists a disagreement, aligned to MaxPreps home and away, and keeps MaxPreps’ score', () => {
    const { report } = compareCifss(games, [row(['Cupertino', 1], ['Fremont', 3])], opts);
    expect(report.compared).toBe(1);
    expect(report.conflicts).toHaveLength(1);
    const c = report.conflicts[0];
    expect(c).toMatchObject({ label: 'Cupertino at Fremont', maxpreps: { home: 2, away: 1 }, cifss: { home: 3, away: 1 } });
    expect(c.note).toBe("Sources disagree: we show MaxPreps' 1-2 (Cupertino–Fremont); cifsshome.org reports 1-3. MaxPreps’ score stands.");
    expect(c.cifssUrl).toContain('date_from=09%2F09%2F2026&date_to=09%2F09%2F2026');
  });

  it('matches a row left on its first date to the pair’s game within three days', () => {
    const { report } = compareCifss(games, [row(['Palo Alto', 2], ['Los Altos', 1], { dateKey: '2026-09-10' })], opts);
    expect(report.conflicts[0].note).toContain('cifsshome.org dates it 2026-09-10.');
    expect(report.notOnMaxPreps).toEqual([]);
  });

  it('lists a score MaxPreps lacks without publishing it', () => {
    const { report } = compareCifss(games, [row(['Leland', 2], ['Gilroy', 2])], opts);
    expect(report.compared).toBe(0);
    expect(report.cifssOnlyScored).toEqual([
      expect.objectContaining({ label: 'Gilroy at Leland', cifss: { home: 2, away: 2 }, note: CIFSS_NOTES.pending }),
    ]);
  });

  it('lists a scored game MaxPreps has no contest for, unless MaxPreps deleted or the pipeline dropped one', () => {
    const vc = row(['Valley Christian', 0], ['Christopher', 4], { dateKey: '2026-08-25' });
    const missing = compareCifss(games, [vc], opts);
    expect(missing.report.notOnMaxPreps).toEqual([
      expect.objectContaining({ contestId: `cifss:${vc.cifssId}`, label: 'Christopher at Valley Christian', pairKey: 'christopher~valley-christian' }),
    ]);
    const deleted = compareCifss(games, [vc], { ...opts, nonGames: [{ dateKey: '2026-08-25', pairKey: 'christopher~valley-christian' }] });
    expect(deleted.report.notOnMaxPreps).toEqual([]);
    expect(deleted.nonGameMatches).toBe(1);
  });

  it('never lists a game against an opponent outside the registry as missing from MaxPreps', () => {
    // MaxPreps and the widget often spell such an opponent differently, so finding no game proves nothing.
    const { report } = compareCifss(games, [row(['Universal Sports Institute at PYLUSD', 1], ['Homestead', 0], { dateKey: '2026-08-21' })], opts);
    expect(report.notOnMaxPreps).toEqual([]);
  });

  it('ignores unscored rows, rows with none of our teams, and rows noted as scrimmages', () => {
    const { report } = compareCifss(
      games,
      [
        row(['Fremont', null], ['Cupertino', null]),
        row(['Hockaday  (No Section)', 3], ['Del Norte', 1], { section: 'ncs' }),
        row(['Leland', 1], ['Gilroy', 0], { note: 'Scrimmage' }),
      ],
      opts,
    );
    expect(report).toMatchObject({ compared: 0, conflicts: [], cifssOnlyScored: [], notOnMaxPreps: [] });
  });

  it('counts a game two schools entered differently as agreeing when either entry is MaxPreps’, else sets it aside', () => {
    const agree = compareCifss(games, [row(['Fremont', 2], ['Cupertino', 1]), row(['Cupertino', 1], ['Fremont', 3], { section: 'ccs' })], opts);
    expect(agree.report).toMatchObject({ compared: 1, agreements: 1, conflicts: [] });
    const neither = compareCifss(games, [row(['Fremont', 4], ['Cupertino', 1]), row(['Fremont', 3], ['Cupertino', 1])], opts);
    expect(neither.report).toMatchObject({ compared: 0, conflicts: [] });
    expect(neither.ambiguous).toEqual(['2026-09-09 cupertino~fremont']);
  });
});

describe('carryCifssCrossCheck', () => {
  it('keeps only the rows still true of this run’s games', () => {
    const fremont = game({ home: 'Fremont', away: 'Cupertino', hs: 2, as: 1 });
    const leland = game({ home: 'Leland', away: 'Gilroy', status: 'score-pending' });
    const prior = compareCifss(
      [fremont, leland],
      [row(['Fremont', 3], ['Cupertino', 1]), row(['Leland', 2], ['Gilroy', 2]), row(['Valley Christian', 0], ['Christopher', 4], { dateKey: '2026-08-25' })],
      opts,
    ).report;
    expect([prior.conflicts.length, prior.cifssOnlyScored.length, prior.notOnMaxPreps.length]).toEqual([1, 1, 1]);

    expect(carryCifssCrossCheck(prior, [fremont, leland])).toEqual(prior);

    // MaxPreps corrected Fremont's score, scored Leland's game, and now lists VC–Christopher.
    const corrected = { ...fremont, home: { ...fremont.home, score: 3 } };
    const scored = { ...leland, status: 'final' as const, home: { ...leland.home, score: 2 }, away: { ...leland.away, score: 2 } };
    const vc = game({ home: 'Valley Christian', away: 'Christopher', hs: 0, as: 4, date: '2026-08-26', league: false });
    expect(gamePairKey(vc)).toBe(prior.notOnMaxPreps[0].pairKey);
    const carried = carryCifssCrossCheck(prior, [corrected, scored, vc]);
    // Fremont now shows the widget's 3-1 and Leland's 2-2 matches it: both become agreements.
    expect(carried).toMatchObject({ compared: prior.agreements + 2, agreements: prior.agreements + 2, conflicts: [], cifssOnlyScored: [], notOnMaxPreps: [] });
  });

  it('keeps a conflict whose MaxPreps score changed but still differs, showing the current score', () => {
    const fremont = game({ home: 'Fremont', away: 'Cupertino', hs: 2, as: 1 });
    const prior = compareCifss([fremont], [row(['Fremont', 3], ['Cupertino', 1])], opts).report;
    const changed = { ...fremont, home: { ...fremont.home, score: 4 } };
    const carried = carryCifssCrossCheck(prior, [changed]);
    expect(carried.conflicts).toEqual([
      expect.objectContaining({ maxpreps: { home: 4, away: 1 }, cifss: { home: 3, away: 1 }, note: expect.stringContaining("MaxPreps' 1-4") }),
    ]);
    expect(carried.compared).toBe(carried.agreements + carried.conflicts.length);
    // The game gone from MaxPreps: the row and its count go with it.
    expect(carryCifssCrossCheck(prior, [])).toMatchObject({ compared: 0, agreements: 0, conflicts: [] });
  });
});
