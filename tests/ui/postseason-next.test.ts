/**
 * The postseason consistency pass (2026-10-31), on the committed snapshot pinned to Fri Oct 30 with the CCS
 * leagues' own postseason games set by the test: Archbishop Mitty 2-0 St. Ignatius in the #1 v #1 crossover (final,
 * Thu Oct 29), Santa Clara at Los Altos in the SCVAL 4th-place play-in (scheduled, Fri Oct 30), and no BVAL play-in
 * game listed (MaxPreps had none on Oct 30). Any copy of those games, and any CCS game, a later refresh carries is
 * replaced, so the cases here are the test's own.
 *
 * - The SCVAL play-in reads "SCVAL play-in" (chip, game page), the crossover "SCVAL crossover"
 *   (lib/postseason-round-label.ts through describe-game postseasonTagOf).
 * - A team seated in a play-in MaxPreps has not listed gets that game as Next (team page and home card), never "no
 *   more games", even with a later game listed (the test gives Willow Glen a non-league game on Tue Nov 3); the empty state names the seeding meeting's day and the team's own played crossover.
 * - The team page's "CCS playoffs →" goes to `/playoffs#<league>-pairings` while the team has a pairing to play.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { countsOf } from '../../lib/snapshot-migrate';
import { loadSnapshot } from '../../lib/snapshot-schema';
import type { Snapshot } from '../../lib/types';
import { game } from '../game-builder';

type Data = typeof import('../../lib/data');
type TeamView = typeof import('../../components/teams/team-view');
type HomeView = typeof import('../../components/home/home-view');
type Describe = typeof import('../../components/ui/describe-game');
type GameView = typeof import('../../components/game/game-view');

const priorEnv = process.env.SCVAL_SNAPSHOT;
let data: Data;
let teamView: TeamView;
let homeView: HomeView;
let describeGame: Describe;
let gameView: GameView;

const PLAY_IN_ID = '0000feed-0000-4000-8000-00000000a1a1';
const CROSSOVER_ID = '0000feed-0000-4000-8000-00000000c1c1';
const LATER_ID = '0000feed-0000-4000-8000-00000000d1d1';

beforeAll(async () => {
  const base = loadSnapshot(
    JSON.parse(readFileSync(path.join(import.meta.dirname, '..', '..', 'data', 'snapshot.json'), 'utf8')) as unknown,
  );
  const crossover = { kind: 'scval-crossover', leagueId: 'scval', via: 'config-pairing' } as const;
  const set = [
    game({ contestId: CROSSOVER_ID, home: 'mitty', away: 'st-ignatius', hs: 2, as: 0, date: '2026-10-29', league: false, postseason: crossover, official: null }),
    game({ contestId: PLAY_IN_ID, home: 'los-altos', away: 'santa-clara', date: '2026-10-30', status: 'scheduled', league: false, postseason: crossover, official: null }),
    // A non-league game AFTER Willow Glen's unlisted Oct 31 play-in: the play-in must still be its Next.
    game({ contestId: LATER_ID, home: 'willow-glen', away: 'carmel', date: '2026-11-03', status: 'scheduled', league: false, official: null }),
  ];
  const pairs = new Set(set.map((g) => [g.home.slug, g.away.slug].sort().join('|')));
  const games = [
    ...base.games.filter(
      (g) =>
        g.postseason?.kind !== 'bval-play-in' &&
        g.postseason?.kind !== 'ccs' &&
        !(g.postseason?.kind === 'scval-crossover' && pairs.has([g.home.slug, g.away.slug].sort().join('|'))),
    ),
    ...set,
  ];
  const next: Snapshot = { ...base, fetchedAt: '2026-10-30T19:00:00.000Z', games, counts: countsOf(games, base.standings) };
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'scvalfh-postseason-next-')), 'snapshot.json');
  writeFileSync(file, JSON.stringify(loadSnapshot(next)));
  process.env.SCVAL_SNAPSHOT = file;
  vi.resetModules();
  data = await import('../../lib/data');
  teamView = await import('../../components/teams/team-view');
  homeView = await import('../../components/home/home-view');
  describeGame = await import('../../components/ui/describe-game');
  gameView = await import('../../components/game/game-view');
}, 600_000);

afterAll(() => {
  if (priorEnv === undefined) delete process.env.SCVAL_SNAPSHOT;
  else process.env.SCVAL_SNAPSHOT = priorEnv;
  vi.resetModules();
});

const byId = (id: string) => data.getGames().find((g) => g.contestId === id)!;

describe('the round label of a CCS league crossover-day game', () => {
  it('the 4th-place play-in reads "SCVAL play-in"; a crossover "SCVAL crossover"', () => {
    expect(describeGame.postseasonTagOf(byId(PLAY_IN_ID)), 'describe-game postseasonTagOf').toBe('SCVAL play-in');
    expect(describeGame.describeGame(byId(PLAY_IN_ID)).postseasonTag, 'GameRow chip').toBe('SCVAL play-in');
    expect(describeGame.postseasonTagOf(byId(CROSSOVER_ID))).toBe('SCVAL crossover');
    expect(gameView.buildGameView(PLAY_IN_ID)?.contextLabel, 'components/game/game-view.ts').toBe('SCVAL play-in');
    expect(gameView.buildGameView(CROSSOVER_ID)?.contextLabel).toBe('SCVAL crossover');
  });

  it('the home card of a team in the play-in names it', () => {
    const losAltos = homeView.buildTeamViews().find((v) => v.slug === 'los-altos')!;
    expect(losAltos.next?.kindLabel, 'components/home/home-view.ts kindLabel').toBe('SCVAL play-in');
  });
});

describe('Next for a team seated in a play-in MaxPreps has not listed', () => {
  it('the team page shows the BVAL play-in, not "no more games"', () => {
    const v = teamView.buildTeamPageView('willow-glen')!;
    expect(v.nextCard.kind, 'components/teams/team-view.ts buildNextCard').toBe('pairing');
    if (v.nextCard.kind !== 'pairing') return;
    expect(v.nextCard.pairing).toMatchObject({
      kindLabel: 'BVAL play-in',
      purpose: 'Play-in for BVAL’s 4th automatic CCS berth',
      dateKey: '2026-10-31',
      timeLabel: '11 AM PT',
      versus: 'at',
      seats: 'Mt. Hamilton #4 at Santa Teresa #1',
      href: '/playoffs#bval-pairings',
    });
    expect(v.nextCard.dateLabel).toBe('Sat Oct 31');
    // The Santa Teresa champion today (alone, or level co-champions named with "or").
    expect(v.nextCard.opponentName).toMatch(/Westmont/);
  });

  it('the home card shows it too, and only teams with one carry the field', () => {
    const views = homeView.buildTeamViews();
    const wg = views.find((v) => v.slug === 'willow-glen')!;
    expect(wg.next).toBeNull();
    expect(wg.pairingNext).toMatchObject({
      when: 'Sat Oct 31 · 11 AM PT',
      note: 'From the BVAL tables today; MaxPreps has not listed this game yet.',
      href: '/playoffs#bval-pairings',
    });
    expect(wg.pairingNext!.title).toMatch(/^BVAL play-in at .*Westmont/);
    expect(views.find((v) => v.slug === 'mitty')!.pairingNext).toBeUndefined();
    expect(views.filter((v) => v.pairingNext).length).toBeLessThanOrEqual(2);
  });

  it('the empty state names the seeding meeting and the team’s own played crossover', () => {
    const v = teamView.buildTeamPageView('mitty')!;
    expect(v.nextCard).toEqual({
      kind: 'none',
      heading: 'No more games on Archbishop Mitty’s published schedule.',
      body:
        'The SCVAL league season ended Wed Oct 28 and Archbishop Mitty played the SCVAL crossover Thu Oct 29. ' +
        'CCS seeds the field on Mon Nov 2; we list each CCS game as MaxPreps posts it.',
    });
    const text = JSON.stringify(v.nextCard);
    expect(text).not.toMatch(/as soon as CCS publishes the bracket/);
  });
});

describe('the team page’s CCS playoffs link', () => {
  it('goes to the pairing cards while the team has a crossover or play-in to play', () => {
    const href = (slug: string) => teamView.buildTeamPageView(slug)!.postseasonLine?.href;
    expect(href('willow-glen')).toBe('/playoffs#bval-pairings');
    expect(href('los-altos')).toBe('/playoffs#scval-pairings');
    expect(href('santa-clara')).toBe('/playoffs#scval-pairings');
    // Mitty's crossover is final; Cupertino has no pairing.
    expect(href('mitty')).toBe('/playoffs#scval');
    expect(href('cupertino')).toBe('/playoffs#scval');
  });
});
