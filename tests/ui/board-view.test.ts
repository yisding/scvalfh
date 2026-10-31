/**
 * components/playoffs/board-view.ts — "Where every league stands" (DESIGN §32.2): each league's postseason in a
 * phrase from config, and its latest result and next item read from the same rows as the "This week" strip.
 */
import { describe, expect, it } from 'vitest';

import { buildBoard, pathPhrase, type BoardLeagueInput } from '../../components/playoffs/board-view';
import type { ThisWeekRow } from '../../components/playoffs/this-week';
import { getLeague } from '../../lib/leagues';
import type { LeagueId } from '../../lib/types';

const VIEW = 'components/playoffs/board-view.ts';

const input = (id: LeagueId, extra: Partial<BoardLeagueInput> = {}): BoardLeagueInput => ({
  leagueId: id,
  shortName: getLeague(id).shortName,
  config: getLeague(id),
  ...extra,
});

const row = (r: Partial<ThisWeekRow> & Pick<ThisWeekRow, 'dateKey' | 'text' | 'leagueIds'>): ThisWeekRow => ({
  time: null,
  label: '',
  href: null,
  final: false,
  kind: 'game',
  key: r.text,
  ...r,
});

describe('pathPhrase', () => {
  it('says each kind of postseason in its own words, from config', () => {
    expect(pathPhrase(input('scval', { berths: { auto: 7, total: 16 } })), VIEW).toBe('CCS championship · 7 of 16 berths');
    expect(pathPhrase(input('mcal')), VIEW).toBe('MCAL tournament · 6 teams');
    expect(pathPhrase(input('eal')), VIEW).toBe('Super Regional, Oct 30–31 · the top six qualify');
    expect(pathPhrase(input('city')), VIEW).toBe('San Diego Section playoffs, Nov 2–14 · placed by the Section');
    expect(pathPhrase(input('sunset')), VIEW).toBe('No section playoffs');
  });

  it('puts no CCS word, seed word or "eliminated" on a league outside the CCS', () => {
    for (const id of ['mcal', 'eal', 'city', 'north-county', 'metro', 'sunset', 'independents'] as LeagueId[]) {
      expect(pathPhrase(input(id)), `${VIEW}: ${id}`).not.toMatch(/\bCCS\b|at-large|automatic|seed|eliminat/i);
    }
  });
});

describe('buildBoard', () => {
  const today = '2026-10-30';
  const rows: ThisWeekRow[] = [
    row({ dateKey: '2026-10-29', text: 'Archbishop Mitty 0, St. Ignatius 3, final.', final: true, leagueIds: ['scval'], href: '/game/a' }),
    row({ dateKey: '2026-10-30', time: '4:00 PM PT', text: 'Santa Clara at Los Altos', label: 'SCVAL play-in', leagueIds: ['scval'], href: '/game/b' }),
    row({ dateKey: '2026-10-31', time: '11 AM PT', text: 'Willow Glen at Westmont', kind: 'event', leagueIds: ['bval'], href: '/playoffs#bval' }),
    row({ dateKey: '2026-11-02', time: '1:00 PM PT', text: 'CCS Division 1 and CCS Division 2', kind: 'event', leagueIds: ['scval', 'bval', 'pcal'] }),
  ];

  it('gives each league its latest final and its next row, in the order the leagues are given', () => {
    const board = buildBoard([input('scval'), input('bval'), input('pcal'), input('eal')], rows, today);
    expect(board.map((b) => b.leagueId), VIEW).toEqual(['scval', 'bval', 'pcal', 'eal']);
    const [scval, bval, pcal, eal] = board;
    expect(scval.href, VIEW).toBe('#scval');
    expect(scval.latest, VIEW).toEqual({ when: 'Thu Oct 29', text: 'Archbishop Mitty 0, St. Ignatius 3, final.', label: '', href: '/game/a' });
    expect(scval.next, VIEW).toEqual([{ when: 'Today · 4:00 PM PT', text: 'Santa Clara at Los Altos', label: 'SCVAL play-in', href: '/game/b' }]);
    expect(bval.latest, VIEW).toBeNull();
    expect(bval.next.map((l) => l.when), VIEW).toEqual(['Tomorrow · 11 AM PT']);
    // An event a league shares (the CCS seeding meeting) is every one of its leagues' next item.
    expect(pcal.next[0]?.text, VIEW).toBe('CCS Division 1 and CCS Division 2');
    expect(pcal.next[0]?.when, VIEW).toBe('Mon Nov 2 · 1:00 PM PT');
    expect(eal.latest, VIEW).toBeNull();
    expect(eal.next, VIEW).toEqual([]);
  });

  it('lists every row of the league’s next day, and only that day', () => {
    const more = [
      ...rows,
      row({ dateKey: '2026-10-30', time: '3:30 PM PT', text: 'Saint Francis at Los Gatos', leagueIds: ['scval'] }),
    ].sort((a, b) => a.dateKey.localeCompare(b.dateKey) || (a.time ?? '').localeCompare(b.time ?? ''));
    const [scval] = buildBoard([input('scval')], more, today);
    expect(scval.next.map((l) => l.text), VIEW).toEqual(['Saint Francis at Los Gatos', 'Santa Clara at Los Altos']);
  });

  it('says a league tournament’s champion and nothing next once it is decided', () => {
    const final = row({ dateKey: '2026-10-30', text: 'Redwood 1, Tamalpais 3, final.', final: true, leagueIds: ['mcal'], href: '/game/f' });
    const [mcal] = buildBoard([input('mcal', { champion: 'Tamalpais won the MCAL tournament.' })], [final], today);
    expect(mcal.latest, VIEW).toEqual({ when: 'Champion', text: 'Tamalpais won the MCAL tournament.', label: '', href: '/game/f' });
    expect(mcal.next, VIEW).toEqual([]);
  });
});
