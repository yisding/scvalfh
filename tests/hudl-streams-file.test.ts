/**
 * data/hudl-streams.json and its three siblings (lib/streams/hudl-streams.ts): every sport's committed file loads
 * and keeps its invariants, a bad file is refused at load, the overlay puts a game's Hudl TV broadcast on
 * `urls.hudl` and nothing else, and the site's read of the committed snapshot (lib/data.ts) carries it.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { getGames } from '../lib/data';
import { getHudlStreamsFile, loadHudlStreams, withHudlStreams, type HudlStreamsFile } from '../lib/streams/hudl-streams';
import type { Game } from '../lib/types';
import { REPO } from './helpers';

const SPORT_DIRS = ['data', 'data/soccer', 'data/basketball', 'data/volleyball'];
const read = (dir: string): unknown => JSON.parse(readFileSync(path.join(REPO, dir, 'hudl-streams.json'), 'utf8'));
const fieldHockey = (): HudlStreamsFile => structuredClone(read('data')) as HudlStreamsFile;

const WATCH = 'https://fan.hudl.com/usa/ca/palo-alto/organization/12437/gunn-high-school/watch?b=QnJvYWRjYXN0NDI0NTI2Ng%3D%3D';

function game(contestId: string, over: Partial<Game['urls']> = {}): Game {
  return {
    contestId,
    dateKey: '2026-10-27',
    status: 'final',
    home: { teamId: 'h', slug: 'gunn', name: 'Gunn', score: 3, result: 'W' },
    away: { teamId: 'a', slug: 'saratoga', name: 'Saratoga', score: 0, result: 'L' },
    urls: { maxpreps: null, nfhsStream: null, goFan: null, ...over },
  } as Game;
}

describe('the committed Hudl streams files', () => {
  it.each(SPORT_DIRS)('%s/hudl-streams.json loads, each contest once, each url a fan.hudl.com watch page', (dir) => {
    const file = loadHudlStreams(read(dir));
    expect(new Set(file.streams.map((s) => s.contestId)).size).toBe(file.streams.length);
    for (const s of file.streams) expect(s.url, s.contestId).toMatch(/^https:\/\/fan\.hudl\.com\/.+\/watch\?b=/);
  });

  it('the build reads its own sport\'s file, and it is not empty', () => {
    expect(getHudlStreamsFile().streams.length).toBeGreaterThan(0);
  });
});

describe('loadHudlStreams refuses a bad file', () => {
  it('a contest twice', () => {
    const bad = fieldHockey();
    bad.streams.push({ ...bad.streams[0] });
    expect(() => loadHudlStreams(bad)).toThrow(/appears twice/);
  });

  it('a link that is not a fan.hudl.com watch page', () => {
    const bad = fieldHockey();
    bad.streams[0] = { ...bad.streams[0], url: 'https://www.hudl.com/video/123' };
    expect(() => loadHudlStreams(bad)).toThrow(/watch page/);
  });
});

describe('withHudlStreams', () => {
  const file: HudlStreamsFile = {
    builtBy: 'test',
    capturedAt: '2026-11-14',
    notes: ['test'],
    streams: [{ contestId: 'c1', url: WATCH, by: 'Gunn', kind: 'replay', access: 'free', match: 'confirmed' }],
  };

  it('puts the broadcast on its game and leaves every other game and link as it was', () => {
    const nfhs = 'https://www.nfhsnetwork.com/events/x/gam1';
    const [one, two] = withHudlStreams([game('c1', { nfhsStream: nfhs }), game('c2')], file);
    expect(one.urls).toEqual({ maxpreps: null, nfhsStream: nfhs, goFan: null, hudl: WATCH });
    expect(two.urls.hudl).toBeUndefined();
  });

  it('ignores a record whose game is not in the list, and returns the same objects when nothing changes', () => {
    const games = [game('c2')];
    const out = withHudlStreams(games, file);
    expect(out[0]).toBe(games[0]);
  });
});

describe('the site\'s read of the snapshot carries the links', () => {
  it('every game the file names and the snapshot lists has its link, and only those', () => {
    const urls = new Map(getHudlStreamsFile().streams.map((s) => [s.contestId, s.url]));
    const games = getGames();
    const linked = games.filter((g) => g.urls.hudl !== undefined);
    expect(linked.length).toBeGreaterThan(0);
    for (const g of games) expect(g.urls.hudl, g.contestId).toBe(urls.get(g.contestId));
  });

  it('the game page draws it as a Hudl TV button', async () => {
    const { GameDetails } = await import('../components/game/GameDetails');
    const { buildGameViewOf } = await import('../components/game/game-view');
    const g = getGames().find((x) => x.urls.hudl !== undefined)!;
    const html = renderToStaticMarkup(createElement(GameDetails, { model: buildGameViewOf(g.contestId)! }));
    expect(html).toContain(`href="${g.urls.hudl!.replace(/&/g, '&amp;')}"`);
    expect(html).toContain('Hudl TV');
  });
});
