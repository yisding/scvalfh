/**
 * lib/festival/festival-crons.ts: the festival refresh's cron lines from the game slots (spec §5). Slots built in
 * memory, so these hold the rule itself; tests/workflows.test.ts holds the workflow to the lines for the committed
 * data/field-hockey/festival.json.
 */

import { describe, expect, it, vi } from 'vitest';

import { FESTIVAL_GAME_MINUTES, festivalSlots } from '../lib/festival/festival';
import {
  FESTIVAL_CATCH_UP_MINUTES,
  FESTIVAL_REFRESH_OFFSETS,
  cronList,
  festivalCrons,
  festivalRuns,
} from '../lib/festival/festival-crons';
import { main } from '../scripts/festival-crons';

/** Games on the hour from `first` to `last` (Eastern, EST: UTC-5) on `day`, one per slot. */
function day(date: string, first: number, last: number) {
  const games = [];
  for (let h = first; h <= last; h++) {
    const hh = String(h).padStart(2, '0');
    const utc = new Date(`${date}T${hh}:00:00-05:00`).toISOString().replace('.000Z', 'Z');
    games.push({ start: `${date}T${hh}:00:00`, startUtc: utc });
  }
  return games;
}

/** The festival's three days as they were scheduled: Thu 8 AM-4 PM, Fri 8 AM-6 PM, Sat 8 AM-2 PM ET. */
const FESTIVAL = { games: [...day('2026-11-26', 8, 16), ...day('2026-11-27', 8, 18), ...day('2026-11-28', 8, 14)] };

describe('festivalCrons', () => {
  it('gives the festival’s schedule: three runs an hour after each slot, and a catch-up a day', () => {
    expect(festivalCrons(festivalSlots(FESTIVAL))).toEqual([
      '7,27,47 14-22 26 11 *',
      '7,27,47 14-23 27 11 *',
      '7,27,47 0,14-20 28 11 *',
      '10 0 27 11 *',
      '10 2,22 28 11 *',
    ]);
  });

  it('puts Friday’s 6 PM ET slot on the next UTC day: it ends at 23:55 UTC', () => {
    const slots = festivalSlots({ games: day('2026-11-27', 18, 18) });
    expect(slots).toEqual([{ start: '2026-11-27T18:00:00', startUtc: '2026-11-27T23:00:00Z', endUtc: '2026-11-27T23:55:00Z', games: 1 }]);
    expect(festivalRuns(slots)).toEqual([
      { at: '2026-11-28T00:07:00Z', kind: 'slot' },
      { at: '2026-11-28T00:27:00Z', kind: 'slot' },
      { at: '2026-11-28T00:47:00Z', kind: 'slot' },
      // 9:10 PM ET.
      { at: '2026-11-28T02:10:00Z', kind: 'catch-up' },
    ]);
    expect(festivalCrons(slots)).toEqual(['7,27,47 0 28 11 *', '10 2 28 11 *']);
  });

  it('rolls the month over with the day', () => {
    const slots = festivalSlots({ games: day('2026-11-30', 18, 18) });
    expect(festivalCrons(slots)).toEqual(['7,27,47 0 1 12 *', '10 2 1 12 *']);
  });

  it('keeps day-of-week unrestricted and every field a plain cron list', () => {
    for (const line of festivalCrons(festivalSlots(FESTIVAL))) {
      expect(line).toMatch(/^[\d,-]+ [\d,-]+ \d{1,2} \d{1,2} \*$/);
    }
  });

  it('runs FESTIVAL_REFRESH_OFFSETS after each slot ends and the catch-up after the day’s last', () => {
    expect(FESTIVAL_GAME_MINUTES).toBe(55);
    expect(FESTIVAL_REFRESH_OFFSETS).toEqual([12, 32, 52]);
    expect(FESTIVAL_CATCH_UP_MINUTES).toBe(135);
    const runs = festivalRuns(festivalSlots(FESTIVAL));
    // 27 slots, three runs each, and three catch-ups.
    expect(runs.filter((r) => r.kind === 'slot')).toHaveLength(81);
    expect(runs.filter((r) => r.kind === 'catch-up').map((r) => r.at)).toEqual([
      '2026-11-27T00:10:00Z',
      '2026-11-28T02:10:00Z',
      '2026-11-28T22:10:00Z',
    ]);
    // Never on :00 or :30, GitHub's busiest minutes.
    for (const r of runs) expect(['00', '30']).not.toContain(r.at.slice(14, 16));
    // In time order, no two at the same minute.
    expect(runs.map((r) => r.at)).toEqual([...new Set(runs.map((r) => r.at))].sort());
  });

  it('groups a day’s hours by their minutes, and counts each slot once whatever its games', () => {
    // Two games in one slot, and an odd 10:30 slot: its runs are :37, :57 and :17 of the next hour.
    const games = [
      { start: '2026-11-26T08:00:00', startUtc: '2026-11-26T13:00:00Z' },
      { start: '2026-11-26T08:00:00', startUtc: '2026-11-26T13:00:00Z' },
      { start: '2026-11-26T10:30:00', startUtc: '2026-11-26T15:30:00Z' },
    ];
    expect(festivalRuns(festivalSlots({ games })).map((r) => r.at.slice(11, 16))).toEqual([
      '14:07',
      '14:27',
      '14:47',
      '16:37',
      '16:57',
      '17:17',
      '18:40',
    ]);
    expect(festivalCrons(festivalSlots({ games }))).toEqual(['7,27,47 14 26 11 *', '37,57 16 26 11 *', '17 17 26 11 *', '40 18 26 11 *']);
  });

  it('drops a catch-up that falls on a slot run', () => {
    const slots = [
      // Thursday's last slot ends 13:55 UTC: its catch-up would be 16:10 UTC…
      { start: '2026-11-26T08:00:00', endUtc: '2026-11-26T13:55:00Z' },
      // …where a slot of another day already runs (15:58 + 12 minutes).
      { start: '2026-11-27T08:00:00', endUtc: '2026-11-26T15:58:00Z' },
    ];
    const runs = festivalRuns(slots);
    expect(runs.filter((r) => r.at === '2026-11-26T16:10:00Z')).toEqual([{ at: '2026-11-26T16:10:00Z', kind: 'slot' }]);
    expect(runs.filter((r) => r.kind === 'catch-up').map((r) => r.at)).toEqual(['2026-11-26T18:13:00Z']);
  });

  it('has nothing to schedule without games', () => {
    expect(festivalRuns([])).toEqual([]);
    expect(festivalCrons([])).toEqual([]);
  });
});

describe('cronList', () => {
  it('writes runs of three or more as ranges, and shorter ones as lists', () => {
    expect(cronList([0, 14, 15, 16, 17, 18, 19, 20])).toBe('0,14-20');
    expect(cronList([2, 22])).toBe('2,22');
    expect(cronList([14, 15])).toBe('14,15');
    expect(cronList([47, 7, 27, 7])).toBe('7,27,47');
    expect(cronList([])).toBe('');
  });
});

describe('pnpm festival-crons', () => {
  it('prints the committed file’s lines as YAML, and refuses an argument', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(main([])).toBe(0);
      expect(main(['--bogus'])).toBe(1);
      const lines = log.mock.calls.map((c) => String(c[0]));
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) expect(line).toMatch(/^ {4}- cron: '[\d,-]+ [\d,-]+ \d{1,2} \d{1,2} \*'$/);
      expect(error).toHaveBeenCalledWith('Usage: pnpm festival-crons');
    } finally {
      log.mockRestore();
      error.mockRestore();
    }
  });
});
