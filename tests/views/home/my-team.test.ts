/**
 * The pinned card (views/home/my-team.ts and team-tiles.ts → components/home/MyTeamCard.tsx; SPEC §8.4), on the
 * offline corpus snapshot so league-specific values never move with a live fetch (SPEC §13.6; the fixture is
 * tests/support/home-view.ts). Every assertion names the module that produced the value (the repair policy routes on
 * it).
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { getTeamBySlug } from '@/lib/registry/teams';
import { textOf } from '@/tests/support/html-text';
import { loadQueries } from '@/tests/support/queries';
import { width } from '@/tests/support/text-metrics';
import { POSTSEASON_LEAD, postseasonCardLine, rungCardText } from '@/views/home/home-client';
import { m, data, HV } from '@/tests/support/home-view';

describe('the pinned card (components/home/MyTeamCard.tsx ← home-view.ts team views)', () => {
  /** The card's identity: the search index entry its view joins to on `slug` (MyTeamCard.tsx). */
  const cardTeam = (slug: string) => data.searchIndex.teams.find((t) => t.slug === slug)!;
  /** The league a view's team plays in, from its search-index entry (a team with no table has no table link). */
  const cardTeamLeague = (slug: string) => cardTeam(slug).leagueId;

  it('joins every view to exactly one search-index entry, and ships no identity of its own', () => {
    const slugs = data.teamViews.map((v) => v.slug);
    expect(new Set(slugs).size, `${HV}: one view per team`).toBe(102);
    expect([...slugs].sort(), `${HV}: views ↔ search index`).toEqual(data.searchIndex.teams.map((t) => t.slug).sort());
    for (const v of data.teamViews) {
      expect(Object.hasOwn(v, 'team'), `${HV}: ${v.slug} carries no second copy of the identity`).toBe(false);
    }
  });

  it('has a view for all 102 teams with the meta, played and postseason lines', async () => {
    const { PinnedCard } = await import('@/components/home/MyTeamCard');
    expect(data.teamViews, `${HV}: team views`).toHaveLength(102);
    const leigh = data.teamViews.find((v) => v.slug === 'leigh')!;
    expect(leigh.meta, `${HV}: meta`).toBe('3rd · Mt. Hamilton · BVAL');
    expect(leigh.played, `${HV}: played`).toBe('3 of 10 played');
    expect(leigh.postseason, `${HV}: postseason line`).toBe('If the season ended today: Automatic qualifier');
    expect(postseasonCardLine(leigh), `${HV}: postseason card line`).toBe('Today: Automatic qualifier');
    expect(leigh.postseasonShort, `${HV}: no tie, no second copy of the line`).toBeUndefined();
    expect(leigh.tableHref).toBe('/standings/bval#mt-hamilton');
    const tam = data.teamViews.find((v) => v.slug === 'tamalpais')!;
    expect(tam.meta, `${HV}: single-division meta`).toBe('1st · MCAL');
    for (const v of data.teamViews) {
      // A team with no result is never placed, except that a Sunset team's line is the league's "no
      // playoffs" note whatever it has played (lib/queries/postseason getTeamPostseasonLine).
      const noPostseason = m.leagues.NO_POSTSEASON_LEAGUE_IDS.includes(m.leagues.getLeague(cardTeamLeague(v.slug)).id);
      if (!v.hasResults && !noPostseason) expect(v.postseason, `${HV}: ${v.slug} gp 0 has no postseason line`).toBeNull();
      const html = renderToStaticMarkup(createElement(PinnedCard, { view: v, team: cardTeam(v.slug), onUnpin: () => {} }));
      expect(html, `components/home/MyTeamCard.tsx: ${v.slug} unpin id`).toContain('id="my-team-unpin"');
      if (v.postseason) expect(textOf(html)).toContain(v.postseason);
      const card = postseasonCardLine(v);
      if (card) expect(textOf(html)).toContain(card);
      expect(card === null, `${HV}: ${v.slug} card line iff line`).toBe(v.postseason === null);
    }
  });

  it('"Last" is the newest PLAYED game: a score-pending one shows as unreported, never as a final', async () => {
    const d = await loadQueries();
    const { describeGame } = await import('@/views/shared/describe-game');
    const { gameHref } = await import('@/lib/shared/game-id');
    const { PinnedCard } = await import('@/components/home/MyTeamCard');
    let pending = 0;
    for (const v of data.teamViews) {
      const team = getTeamBySlug(v.slug)!;
      const played = d
        .getGames({ teamId: team.id })
        .filter((g) => (g.status === 'final' || g.status === 'score-pending') && g.dateKey <= data.today)
        .sort((a, b) => a.dateLocal.localeCompare(b.dateLocal) || a.away.name.localeCompare(b.away.name));
      const newest = played.at(-1);
      expect(v.last?.href ?? null, `${HV}: ${v.slug} last`).toBe(newest ? gameHref(newest.contestId) : null);
      if (!newest || !v.last) continue;
      expect(Object.hasOwn(v.last, 'recap'), `${HV}: ${v.slug} carries no recap`).toBe(false);
      const unreported = describeGame(newest, v.slug).kind === 'unreported';
      expect(v.last.display.kind, `${HV}: ${v.slug} last kind`).toBe(unreported ? 'unreported' : 'final');
      if (!unreported) continue;
      pending += 1;
      const text = textOf(renderToStaticMarkup(createElement(PinnedCard, { view: v, team: cardTeam(v.slug), onUnpin: () => {} })));
      expect(text, `components/home/MyTeamCard.tsx: ${v.slug} unreported last`).toMatch(/score not reported/i);
      if (v.last.display.note) expect(text, `components/home/MyTeamCard.tsx: ${v.slug} note`).toContain(v.last.display.note);
    }
    // The corpus has at least one such team, so the unreported branch is never vacuous.
    expect(pending, `${HV}: a newest played game that is score-pending`).toBeGreaterThan(0);
  });

  // The card text is 288px wide at 320 (px-4 in a 320px card); the line is one truncated h-6 row,
  // so the STATUS must fit whole or the reader sees only the prefix. Widths: tests/support/text-metrics.ts
  // (Geist 12px/500) scaled to the 14px meta size — an over-estimate for the 400 weight.
  const CARD_TEXT_PX = 288;
  const at14 = (s: string) => (width(s) * 14) / 12;

  it('the postseason card line fits one 320px line for every team (corpus)', () => {
    for (const v of data.teamViews) {
      const card = postseasonCardLine(v);
      if (!card) continue;
      expect(at14(card), `${HV}: ${v.slug} "${card}"`).toBeLessThanOrEqual(CARD_TEXT_PX);
    }
  });

  it('every ladder label, and every two-rung tie, fits that line in every league', () => {
    for (const league of m.leagues.LEAGUES) {
      const rungs = league.postseason.ladder;
      for (const division of league.divisions) {
        const mine = rungs.filter((r) => r.divisions === '*' || r.divisions.includes(division.id));
        for (const lead of Object.values(POSTSEASON_LEAD).map((l) => l.short)) {
          for (const r of mine) {
            // The card shows a long "<who>: <what>" label by its short form (home-types.ts rungCardText).
            const line = `${lead} ${rungCardText(r.label, r.badge)}`;
            expect(at14(line), `${HV}: ${division.id} "${line}"`).toBeLessThanOrEqual(CARD_TEXT_PX);
          }
          for (let i = 0; i + 1 < mine.length; i++) {
            const line = `${lead} ${mine[i].badge} or ${mine[i + 1].badge} (tied)`;
            expect(at14(line), `${HV}: ${division.id} "${line}"`).toBeLessThanOrEqual(CARD_TEXT_PX);
          }
        }
      }
    }
  });
});
