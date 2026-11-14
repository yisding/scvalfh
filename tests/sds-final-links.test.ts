/**
 * lib/postseason/sds-final-links.ts: a San Diego final's stream and tickets from data/sds-brackets-2026.json onto
 * its game where the game has none, and the site's read of the committed snapshot (lib/data.ts) carrying them.
 */

import { describe, expect, it } from 'vitest';

import { getGames } from '../lib/data';
import { SDS_BRACKETS_FILE } from '../lib/postseason/sds-brackets-file';
import { withSdsFinalLinks } from '../lib/postseason/sds-final-links';
import type { Game } from '../lib/types';

const d1 = SDS_BRACKETS_FILE.divisions.find((d) => d.id === 'division-1')!;
const final = d1.rounds.at(-1)!;

/** A game of the two Division I finalists, as the Section's sheet lists it (no MaxPreps contest, no links). */
function game(over: Partial<Game> = {}): Game {
  return {
    contestId: 'cifsds:poway-at-san-marcos',
    dateKey: final.date,
    isDateTba: false,
    status: 'scheduled',
    home: { teamId: 'h', slug: 'san-marcos', name: 'San Marcos', score: null, result: null },
    away: { teamId: 'a', slug: 'poway', name: 'Poway', score: null, result: null },
    urls: { maxpreps: null, nfhsStream: null, goFan: null },
    ...over,
  } as Game;
}

describe('withSdsFinalLinks', () => {
  it('the committed file names a stream and a ticket page for all three finals', () => {
    for (const d of SDS_BRACKETS_FILE.divisions) {
      const r = d.rounds.at(-1)!;
      expect(r.stream, d.id).toMatch(/^https:\/\/www\.nfhsnetwork\.com\/events\/cifsds\/gam[0-9a-f]+$/);
      expect(r.tickets, d.id).toMatch(/^https:\/\/gofan\.co\/event\/\d+\?schoolId=CIFSD$/);
    }
  });

  it('fills the final’s stream and tickets where the game has none', () => {
    const [g] = withSdsFinalLinks([game()], SDS_BRACKETS_FILE);
    expect(g.urls.nfhsStream).toBe(final.stream);
    expect(g.urls.goFan).toBe(final.tickets);
    expect(g.urls.maxpreps).toBeNull();
  });

  it('keeps a link the game already has (MaxPreps first)', () => {
    const own = 'https://www.nfhsnetwork.com/events/cifsds/gam0000000000?maxpreps=maxpreps';
    const [g] = withSdsFinalLinks([game({ urls: { maxpreps: null, nfhsStream: own, goFan: null } })], SDS_BRACKETS_FILE);
    expect(g.urls.nfhsStream).toBe(own);
    expect(g.urls.goFan).toBe(final.tickets);
  });

  it('leaves every other game as it is', () => {
    const others = [
      game({ dateKey: d1.rounds.at(-2)!.date }), // the same pair on another day
      game({ away: { teamId: 'x', slug: 'bishops', name: "Bishop's", score: null, result: null } }), // a team of another division
      game({ status: 'postponed' }),
    ];
    const out = withSdsFinalLinks(others, SDS_BRACKETS_FILE);
    out.forEach((g, i) => expect(g).toBe(others[i]));
  });

  it('a file with no links changes nothing', () => {
    const bare = structuredClone(SDS_BRACKETS_FILE);
    for (const d of bare.divisions) {
      const r = d.rounds.at(-1)!;
      delete r.stream;
      delete r.tickets;
    }
    const g = game();
    expect(withSdsFinalLinks([g], bare)[0]).toBe(g);
  });

  it('the site’s games carry the links on each final that is listed', () => {
    for (const d of SDS_BRACKETS_FILE.divisions) {
      const r = d.rounds.at(-1)!;
      const teams = new Set<string>(d.seeds.map((s) => s.slug));
      const listed = getGames({ date: r.date }).filter((g) => teams.has(g.home.slug ?? '') && teams.has(g.away.slug ?? ''));
      for (const g of listed) {
        expect(g.urls.nfhsStream, g.contestId).toBeTruthy();
        expect(g.urls.goFan, g.contestId).toBeTruthy();
      }
    }
  });
});
