/**
 * "New scores are in" (DESIGN §35.7; components/festival/freshness-poll.ts, FestivalFreshness.tsx): ncfh.net sends no
 * ETag or Last-Modified, so the poll compares the scores stamp every festival page prints (`data-fest-stamp`, the
 * committed file's fetchedAt) instead. Here: the stamp is on the rendered pages, including the one polled, and the
 * poll, driven with a fake fetch, clock and tab, asks the right page, says so once on a change and otherwise keeps
 * quiet, and never polls when it cannot tell.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import ClubsPage from '../../app/festival/clubs/page';
import FestivalPage from '../../app/festival/page';
import {
  FEST_STAMP_ATTR,
  FRESHNESS_EVERY_MS,
  FRESHNESS_URL,
  freshnessVerdict,
  pollFreshness,
  stampIn,
  type FreshnessEnv,
} from '../../components/festival/freshness-poll';
import { festivalResultsStamp, getFestival } from '../../lib/festival/festival';

const FILE = getFestival();
const OWN = '2026-11-26T17:08:00.000Z';
const page = (stamp: string | null) => `<p class="m-0"${stamp === null ? '' : ` ${FEST_STAMP_ATTR}="${stamp}"`}>Scores as of …</p>`;

/** A browser the poll can run in: `tick()` fires the interval once and lets the fetch settle. */
function fakeBrowser(bodies: Array<string | Error>, visible = true) {
  const calls: Array<{ url: string; init: unknown }> = [];
  let interval: (() => void) | null = null;
  let listener: (() => void) | null = null;
  const state = { visible };
  const env: FreshnessEnv = {
    fetch: async (url, init) => {
      calls.push({ url, init });
      const body = bodies.shift() ?? page(OWN);
      if (body instanceof Error) throw body;
      return { ok: true, text: async () => body };
    },
    visible: () => state.visible,
    onVisibility: (fn) => {
      listener = fn;
      return () => {
        listener = null;
      };
    },
    setInterval: (fn, ms) => {
      expect(ms).toBe(FRESHNESS_EVERY_MS);
      interval = fn;
      return 1;
    },
    clearInterval: () => {
      interval = null;
    },
  };
  const settle = () => new Promise((r) => setTimeout(r, 0));
  return {
    env,
    calls,
    state,
    running: () => interval !== null,
    listening: () => listener !== null,
    async tick() {
      interval?.();
      await settle();
    },
    async show(v: boolean) {
      state.visible = v;
      listener?.();
      await settle();
    },
  };
}

describe('the scores stamp on the pages', () => {
  it('every festival page prints the stamp of the results, the polled page included', () => {
    expect(FRESHNESS_URL).toBe('/festival/clubs');
    const clubs = renderToStaticMarkup(createElement(ClubsPage));
    const hub = renderToStaticMarkup(createElement(FestivalPage));
    const stamp = festivalResultsStamp(FILE);
    expect(stamp).toMatch(/^[0-9a-f]{8}$/);
    expect(stampIn(clubs)).toBe(stamp);
    expect(stampIn(hub)).toBe(stamp);
    expect(freshnessVerdict(stamp, clubs)).toBe('same');
  });

  // TourneyMachine moves its version about once an hour with no new result (5:01:59, 6:02:01, 7:02:03 PM on
  // 2026-11-26), and the refresh commits it with a new fetchedAt: an open page must not be told of new scores then.
  it('stays the same when only the version and fetch time move, and changes with a score, a pool order or a placement team', () => {
    const stamp = festivalResultsStamp(FILE);
    const bumped = { ...structuredClone(FILE), fetchedAt: '2026-11-26T20:14:00.000Z', sourceVersion: 'v6_11/26/2026 8:02:00 PM' };
    expect(festivalResultsStamp(bumped)).toBe(stamp);
    // Each edit changes what the committed file holds, whatever state the event is in.
    const scored = structuredClone(FILE);
    const game = scored.games[0];
    game.status = 'final';
    game.score = game.score?.[0] === 9 ? [8, 0] : [9, 0];
    expect(festivalResultsStamp(scored)).not.toBe(stamp);
    const reordered = structuredClone(FILE);
    const pool = reordered.divisions[0].pools[0];
    pool.teamIds = [...pool.teamIds].reverse();
    expect(festivalResultsStamp(reordered)).not.toBe(stamp);
    const filled = structuredClone(FILE);
    const side = filled.games.find((g) => g.kind === 'placement')!.sides[0];
    side.teamId = side.teamId === filled.teams[0].id ? filled.teams[1].id : filled.teams[0].id;
    expect(festivalResultsStamp(filled)).not.toBe(stamp);
  });

  it('reads the verdict: same, changed, or unknown with no stamp', () => {
    expect(freshnessVerdict(OWN, page(OWN))).toBe('same');
    expect(freshnessVerdict(OWN, page('2026-11-26T17:31:00.000Z'))).toBe('changed');
    expect(freshnessVerdict(OWN, page(null))).toBe('unknown');
  });
});

describe('the poll', () => {
  it('GETs the small festival page uncached every 3 minutes, and keeps quiet while the stamp is the same', async () => {
    const b = fakeBrowser([page(OWN), page(OWN)]);
    let changed = 0;
    pollFreshness({ stamp: OWN, complete: false, onChange: () => changed++, env: b.env });
    // Nothing on load: the page's own stamp is the baseline.
    expect(b.calls).toEqual([]);
    await b.tick();
    await b.tick();
    expect(b.calls).toEqual([
      { url: FRESHNESS_URL, init: { cache: 'no-store' } },
      { url: FRESHNESS_URL, init: { cache: 'no-store' } },
    ]);
    expect(changed).toBe(0);
    expect(b.running()).toBe(true);
  });

  it('says so once when the stamp moves, then stops', async () => {
    const b = fakeBrowser([page(OWN), page('2026-11-26T17:31:00.000Z')]);
    let changed = 0;
    pollFreshness({ stamp: OWN, complete: false, onChange: () => changed++, env: b.env });
    await b.tick();
    await b.tick();
    expect(changed).toBe(1);
    expect(b.running()).toBe(false);
    expect(b.listening()).toBe(false);
    await b.tick();
    expect(b.calls).toHaveLength(2);
  });

  it('stops without a word when the page carries no stamp (it cannot tell), and keeps going after an error', async () => {
    const b = fakeBrowser([new Error('offline'), page(null)]);
    let changed = 0;
    pollFreshness({ stamp: OWN, complete: false, onChange: () => changed++, env: b.env });
    await b.tick();
    expect(b.running()).toBe(true);
    await b.tick();
    expect(changed).toBe(0);
    expect(b.running()).toBe(false);
  });

  it('never polls without a stamp of its own or once every game is final', async () => {
    for (const opts of [
      { stamp: '', complete: false },
      { stamp: OWN, complete: true },
    ]) {
      const b = fakeBrowser([]);
      pollFreshness({ ...opts, onChange: () => {}, env: b.env });
      await b.tick();
      expect(b.running()).toBe(false);
      expect(b.listening()).toBe(false);
      expect(b.calls).toEqual([]);
    }
  });

  it('pauses while the tab is hidden, and checks at once when it comes back', async () => {
    const b = fakeBrowser([page(OWN)], false);
    pollFreshness({ stamp: OWN, complete: false, onChange: () => {}, env: b.env });
    expect(b.running()).toBe(false);
    await b.show(true);
    expect(b.calls).toHaveLength(1);
    expect(b.running()).toBe(true);
    await b.show(false);
    expect(b.running()).toBe(false);
  });
});
