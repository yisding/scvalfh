/**
 * Playoff games link to their place in the bracket (2026-11-03): components/playoffs/bracket-link.ts (the anchor),
 * components/playoffs/bracket-place.ts (the game page's "Where it stands"), and the team page's bracket-aware
 * postseason line. On the bundled snapshot, whose results move twice a day, so the checks are structural: every link
 * lands on an id /playoffs draws exactly once, and the sentences keep their shape whatever the results.
 */

import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { getBracketLink } from '../../components/playoffs/bracket-link';
import { getBracketPlace } from '../../components/playoffs/bracket-place';
import { buildTeamPageView, leagueCopy } from '../../components/teams/team-view';
import { getGames } from '../../lib/data';
import { getSdsBrackets } from '../../lib/postseason/sds-bracket';
import type { Game } from '../../lib/types';
import { SEED_CLAIM } from '../../scripts/copy-rules';

const LINK = 'components/playoffs/bracket-link.ts';
const PLACE = 'components/playoffs/bracket-place.ts';

const postseason = getGames().filter((g) => g.postseason !== null && g.postseason.kind !== 'other');
const byKind = (kind: NonNullable<Game['postseason']>['kind']) => postseason.filter((g) => g.postseason?.kind === kind);

let ids: string[] = [];
let playoffsHtml = '';

beforeAll(async () => {
  const Page = (await import('../../app/playoffs/page')).default;
  const html = renderToStaticMarkup(Page() as ReactElement);
  playoffsHtml = html;
  ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
}, 600_000);

describe('getBracketLink', () => {
  it('gives every postseason game a link to an id /playoffs draws exactly once', () => {
    expect(postseason.length, 'the bundled snapshot has postseason games').toBeGreaterThan(0);
    for (const g of postseason) {
      const link = getBracketLink(g);
      expect(link, `${LINK}: ${g.contestId} (${g.postseason?.kind})`).not.toBeNull();
      const [page, hash] = link!.href.split('#');
      expect(page, LINK).toBe('/playoffs');
      expect(ids.filter((id) => id === hash).length, `${LINK}: #${hash} for ${g.contestId}`).toBe(1);
    }
  });

  it('sends a CCS game to its division, a San Diego game to its own card, and none to a regular-season game', () => {
    for (const g of byKind('ccs')) expect(getBracketLink(g), LINK).toMatchObject({ href: expect.stringMatching(/^\/playoffs#ccs-division-[12]$/), label: 'CCS bracket' });
    if (getSdsBrackets()) {
      for (const g of byKind('section-playoffs')) {
        expect(getBracketLink(g), LINK).toMatchObject({ href: expect.stringMatching(/^\/playoffs#sds-(open|division-[12])-\d+-\d+$/), label: 'Section bracket' });
      }
    }
    const regular = getGames().find((g) => g.postseason === null)!;
    expect(getBracketLink(regular), LINK).toBeNull();
  });

  it('never says "bracket" for the EAL or the Tournament of Champions, which publish none, and no CCS word off a CCS game', () => {
    for (const g of postseason) {
      const { label } = getBracketLink(g)!;
      if (g.postseason?.kind === 'league-postseason' || g.postseason?.kind === 'outside-tournament') expect(label, LINK).not.toMatch(/bracket/i);
      if (g.postseason?.kind !== 'ccs') expect(label, LINK).not.toMatch(/\bCCS\b/);
      expect(label, LINK).not.toMatch(SEED_CLAIM);
    }
  });
});

describe('getBracketPlace (the game page)', () => {
  it('names a CCS game’s division and round, and what its winner plays next', () => {
    for (const g of byKind('ccs')) {
      const place = getBracketPlace(g)!;
      expect(place.round, `${PLACE}: ${g.contestId}`).toMatch(/^CCS Division [12] (quarterfinal|semifinal|final)( · \d+ v \d+)?$/);
      if (/quarterfinal|semifinal/.test(place.round!)) {
        expect(place.next, `${PLACE}: ${g.contestId}`).toMatch(/ (plays .+ in|goes on to) the (semifinal|final), \w{3} \w{3} \d+\.$/);
      }
    }
  });

  it('names a San Diego game’s division and round with no seed word, and what comes next', () => {
    if (!getSdsBrackets()) return;
    for (const g of byKind('section-playoffs')) {
      const place = getBracketPlace(g)!;
      expect(place.round, `${PLACE}: ${g.contestId}`).toMatch(/^(Open Division|Division I|Division II) (play-in|first round|quarterfinal|semifinal|final)$/);
      expect(`${place.round} ${place.next ?? ''}`, PLACE).not.toMatch(SEED_CLAIM);
      expect(`${place.round} ${place.next ?? ''}`, PLACE).not.toMatch(/\bseed|eliminat/i);
      // Every card but the final feeds another, so a game before the final always says what comes next.
      if (!/ final$/.test(place.round!)) expect(place.next, `${PLACE}: ${g.contestId}`).not.toBeNull();
    }
  });

  it('gives any other postseason game its link alone', () => {
    for (const g of [...byKind('league-postseason'), ...byKind('outside-tournament')]) {
      expect(getBracketPlace(g), `${PLACE}: ${g.contestId}`).toMatchObject({ round: null, next: null });
    }
  });
});

describe('the team page’s postseason line once the bracket is drawn', () => {
  it('names the round and links the team’s place for a CCS team with a bracket game', () => {
    const team = byKind('ccs')[0]?.home.slug;
    if (!team) return;
    const line = buildTeamPageView(team)!.postseasonLine!;
    expect(line.sentence, 'components/teams/team-view.ts').toMatch(/^CCS Division [12] /);
    expect(line.href, 'components/teams/team-view.ts').toMatch(/^\/playoffs#ccs-division-[12]$/);
    expect(line.linkText, 'components/teams/team-view.ts').toMatch(/ in the CCS bracket$/);
    expect(line.caveat).toBeNull();
  });
});

describe('an unbracketed postseason that is over (the EAL Super Regional, Oct 30–31)', () => {
  it('reads in the past tense from the day after its last day, and points to the result', () => {
    const before = leagueCopy('eal', '2026-10-29');
    expect(before.seasonEndSentence).toContain('the Super Regional follows, Oct 30–31.');
    expect(before.bracketSentence).toMatch(/^No pairings are published/);
    const after = leagueCopy('eal', '2026-11-01');
    expect(after.seasonEndSentence, 'components/teams/team-view.ts leagueCopy').toContain('the Super Regional followed, Oct 30–31.');
    expect(after.bracketSentence).toBe('Its games and results, as MaxPreps posts them, are on the playoffs page.');
  });
});

describe('getBracketPlace on a decided CCS quarterfinal (Codex review, 2026-11-03)', () => {
  // A quarterfinal played 3–1 for the home side whose MaxPreps flags say the opposite: the score decides.
  async function placeWith(seeded: boolean) {
    vi.resetModules();
    const data = await import('../../lib/data');
    const playoffs = data.getPlayoffs();
    const [first, ...rest] = playoffs.games;
    const decided: Game = {
      ...first,
      status: 'final',
      home: { ...first.home, score: 3, result: 'L' },
      away: { ...first.away, score: 1, result: 'W' },
    };
    vi.doMock('../../lib/data', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../../lib/data')>();
      return { ...actual, getPlayoffs: () => ({ ...playoffs, games: [decided, ...rest] }) };
    });
    if (!seeded) {
      vi.doMock('../../lib/postseason/ccs-bracket', async (importOriginal) => {
        const actual = await importOriginal<typeof import('../../lib/postseason/ccs-bracket')>();
        return { ...actual, getCcsSeeds: () => null };
      });
    }
    const { getBracketPlace: place } = await import('../../components/playoffs/bracket-place');
    const result = place(decided);
    vi.doUnmock('../../lib/data');
    vi.doUnmock('../../lib/postseason/ccs-bracket');
    vi.resetModules();
    return { result, home: data.getTeamBySlug(decided.home.slug!)!.name };
  }

  it('advances the side with more goals, whatever the flags say', async () => {
    const { result, home } = await placeWith(true);
    expect(result?.next, PLACE).toMatch(new RegExp(`^${home.replace('.', '\\.')} plays .+ in the semifinal`));
  });

  it('names no division winner while the quarterfinals are the last round drawn (no seed file)', async () => {
    const { result } = await placeWith(false);
    expect(result?.next ?? '', PLACE).not.toMatch(/ won /);
  });
});

describe('follow-ups: the day page, the status board and the division jumps (2026-11-03)', () => {
  it('files every CCS game of a day under its division, never under a league, with the division’s bracket linked', async () => {
    const { dayGroups } = await import('../../components/schedule/day-summary');
    const days = [...new Set(byKind('ccs').map((g) => g.dateKey))];
    for (const day of days) {
      const groups = dayGroups(getGames().filter((g) => g.dateKey === day));
      for (const g of byKind('ccs').filter((x) => x.dateKey === day)) {
        const group = groups.find((gr) => gr.games.includes(g))!;
        expect(group.id, `components/schedule/day-summary.ts ${g.contestId}`).toMatch(/^postseason-ccs/);
        expect(group.leagueId).toBeNull();
        if (group.id.startsWith('postseason-ccs-division-')) {
          expect(group.kicker).toMatch(/^CCS Division [12] · \d+$/);
          expect(group.bracket, 'its division is linked').toEqual({ href: `/playoffs#${group.id.replace('postseason-', '')}`, label: 'CCS bracket' });
        }
      }
    }
  });

  it('names a day of one round on the board ("8 CCS quarterfinals") and links the bracket', async () => {
    const { buildBoard } = await import('../../components/playoffs/board-view');
    const { getLeague } = await import('../../lib/leagues');
    const row = (n: number, division: 1 | 2) => ({
      dateKey: '2026-11-07', time: '10:00 AM PT', text: `Game ${n}`, label: 'CCS quarterfinal', href: `/game/${n}`,
      bracket: `ccs-division-${division}`, final: false, kind: 'game' as const, key: String(n), leagueIds: ['scval' as const],
    });
    const rows = [row(1, 1), row(2, 1), row(3, 2)];
    const [scval] = buildBoard([{ leagueId: 'scval', shortName: 'SCVAL', config: getLeague('scval') }], rows, '2026-11-03');
    expect(scval.next).toEqual({ term: 'Next', text: 'Sat Nov 7 · 3 CCS quarterfinals', href: '/playoffs#bracket' });
    const [one] = buildBoard([{ leagueId: 'scval', shortName: 'SCVAL', config: getLeague('scval') }], [row(1, 2)], '2026-11-03');
    expect(one.next?.href, 'a lone game links its place').toBe('/playoffs#ccs-division-2');
  });

  it('draws a jump to each CCS division above the bracket when there are two', () => {
    if (!ids.includes('ccs-division-1') || !ids.includes('ccs-division-2')) return;
    const nav = playoffsHtml.slice(playoffsHtml.indexOf('aria-label="CCS divisions"'));
    expect(nav, 'app/playoffs/page.tsx division jumps').toMatch(/^aria-label="CCS divisions"[^>]*>\s*<a href="#ccs-division-1"[^>]*>Division 1<\/a><a href="#ccs-division-2"[^>]*>Division 2<\/a>/);
  });
});
