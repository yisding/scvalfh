/**
 * components/playoffs/board-view.ts — "Where every league stands" (DESIGN §32.2): each league's postseason in a
 * phrase from config, and its next dated item (or a decided tournament's champion) read from the same rows as the
 * "This week" strip.
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
    expect(pathPhrase(input('sunset')), VIEW).toBe('Tournament of Champions, Oct 22–29 · eight teams');
    expect(pathPhrase(input('independents')), VIEW).toBe('Tournament of Champions, Oct 22–29 · eight teams');
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
    row({ dateKey: '2026-10-30', time: '3:30 PM PT', text: 'Saint Francis at Los Gatos', label: 'SCVAL crossover · #2 v #2', leagueIds: ['scval'], href: '/game/c' }),
    row({ dateKey: '2026-10-30', time: '4:00 PM PT', text: 'Santa Clara at Los Altos', label: 'SCVAL play-in', leagueIds: ['scval'], href: '/game/b' }),
    row({ dateKey: '2026-10-31', time: '11 AM PT', text: 'Willow Glen at Westmont.', label: 'BVAL play-in', kind: 'event', leagueIds: ['bval'], href: '/playoffs#bval-pairings' }),
    row({ dateKey: '2026-11-02', time: '1:00 PM PT', text: 'CCS Division 1 and CCS Division 2', label: 'CCS seeding meeting', kind: 'event', leagueIds: ['scval', 'bval', 'pcal'], href: '/playoffs#key-dates' }),
  ];

  it('dates every Next (never "Today"), names the round, and counts a day of several rows', () => {
    const board = buildBoard([input('scval'), input('bval'), input('pcal'), input('eal')], rows, today);
    expect(board.map((b) => b.key), VIEW).toEqual(['scval', 'bval', 'pcal', 'eal']);
    const [scval, bval, pcal, eal] = board;
    expect(scval.href, VIEW).toBe('#scval');
    expect(scval.next, VIEW).toEqual({ term: 'Next', text: 'Fri Oct 30 · 2 games', href: '#scval' });
    expect(bval.next, VIEW).toEqual({ term: 'Next', text: 'Sat Oct 31 · 11 AM PT · BVAL play-in', href: '/playoffs#bval-pairings' });
    // An event leagues share (the CCS seeding meeting) is each one's next item.
    expect(pcal.next, VIEW).toEqual({ term: 'Next', text: 'Mon Nov 2 · 1:00 PM PT · CCS seeding meeting', href: '/playoffs#key-dates' });
    expect(eal.next, VIEW).toBeNull();
    for (const b of board) expect(b.next?.text ?? '', VIEW).not.toMatch(/Today|Tomorrow/);
  });

  it('says a league tournament’s champion instead of a next item once it is decided', () => {
    const [mcal] = buildBoard([input('mcal', { champion: 'Tamalpais won the MCAL tournament.' })], [], today);
    expect(mcal.next, VIEW).toEqual({ term: 'Result', text: 'Tamalpais won the MCAL tournament.', href: '#mcal' });
  });

  it('gives the San Diego Section playoffs one row for its three leagues, linking the Section’s block', () => {
    const sds = row({ dateKey: '2026-10-31', text: 'Section seeding meeting', label: 'San Diego Section playoffs', kind: 'event', leagueIds: ['city', 'north-county', 'metro'], href: '/playoffs#sds-playoffs' });
    const board = buildBoard([input('city'), input('north-county'), input('metro'), input('sunset')], [sds], today);
    expect(board.map((b) => b.names), VIEW).toEqual(['City · North · Metro', 'Sunset']);
    expect(board[0].href, VIEW).toBe('#sds-playoffs');
    expect(board[0].next?.text, VIEW).toBe('Sat Oct 31 · Section seeding meeting');
    expect(board[1].next, VIEW).toBeNull();
  });
});
