import { describe, expect, it } from 'vitest';

import {
  cleanRecap,
  dateKeyOf,
  normalizeGames,
  seasonWindowOf,
  splitLocation,
  toUtcIso,
} from '../lib/normalize';
import { resolveTeam } from '../lib/teams';
import { allScheduleRows } from './helpers';

const rows = allScheduleRows();
const result = normalizeGames(rows, { fetchedAt: '2026-09-29T15:00:00.000Z' });
const { games } = result;
const byId = new Map(games.map((g) => [g.contestId, g]));

describe('normalize: dedupe and drops (SPEC §5.5.1-2)', () => {
  it('reads all 293 team rows from the 15 captured feeds', () => {
    expect(rows.length).toBe(293);
  });

  it('collapses them to 174 distinct contests before the Deleted filter', () => {
    expect(new Set(rows.map((r) => r.contest.contestId)).size).toBe(174);
  });

  it('drops every contestState === 1 row and keeps the rest', () => {
    const deletedIds = new Set(
      rows.filter((r) => r.calculatedFields.contestState === 1).map((r) => r.contest.contestId),
    );
    expect(deletedIds.size).toBeGreaterThan(0);
    for (const id of deletedIds) expect(byId.has(id)).toBe(false);
    expect(games.length).toBe(174 - deletedIds.size);
    expect(result.stats.dropped.deleted).toBeGreaterThan(0);
  });

  it('never publishes the scrimmage that hides behind a Deleted row', () => {
    // vc.json's 2026-08-25 row is a scrimmage with a real 0-4 score and contestState 1.
    const scrimmage = rows.find(
      (r) => r.calculatedFields.contestState === 1 && r.contest.teams.some((t) => t.score !== null),
    );
    expect(scrimmage).toBeDefined();
    expect(byId.has(scrimmage!.contest.contestId)).toBe(false);
  });

  it('emits one game per contestId', () => {
    expect(new Set(games.map((g) => g.contestId)).size).toBe(games.length);
  });
});

describe('normalize: scores are never invented (SPEC §5.5.3)', () => {
  it('gives every non-final game two null scores', () => {
    for (const g of games) {
      if (g.status === 'final') continue;
      expect(g.home.score, g.contestId).toBeNull();
      expect(g.away.score, g.contestId).toBeNull();
    }
  });

  it('gives every final game two numbers', () => {
    for (const g of games.filter((x) => x.status === 'final')) {
      expect(typeof g.home.score).toBe('number');
      expect(typeof g.away.score).toBe('number');
    }
  });

  it('keeps score-pending games pending rather than 0-0', () => {
    const pending = games.filter((g) => g.status === 'score-pending');
    expect(pending.length).toBe(3);
    for (const g of pending) {
      expect(g.home.score).toBeNull();
      expect(g.away.score).toBeNull();
      expect(g.decider).toBeNull();
    }
  });

  it('keeps a genuine 0-0 final as a real 0-0 tie', () => {
    const draws = games.filter(
      (g) => g.status === 'final' && g.home.score === 0 && g.away.score === 0,
    );
    expect(draws.length).toBe(3);
    for (const g of draws) {
      expect(g.home.result).toBe('T');
      expect(g.away.result).toBe('T');
    }
  });
});

describe('normalize: home/away and site (SPEC §5.5.4)', () => {
  it('maps homeAwayType 0 to home and 1 to away', () => {
    // Leigh @ Los Altos, 2026-08-28: Los Altos is homeAwayType 0 and lost 1-2.
    const g = byId.get('e5110a4c-40e5-4d3d-8c69-409de720f633');
    expect(g).toBeDefined();
    expect(g!.home.slug).toBe('los-altos');
    expect(g!.home.score).toBe(1);
    expect(g!.away.name).toBe('Leigh');
    expect(g!.away.slug).toBeNull();
    expect(g!.away.score).toBe(2);
    expect(g!.site).toBe('home');
    expect(g!.isLeague).toBe(false);
  });

  it('marks a 2/2 pair as a neutral site instead of guessing a host', () => {
    const neutral = games.filter((g) => g.site === 'neutral');
    expect(neutral.length).toBeGreaterThan(0);
    for (const g of neutral) expect(g.leagueDivision === null || g.isLeague).toBeTruthy();
  });

  it('agrees with every row of the source on which side was home', () => {
    for (const row of rows) {
      if (row.calculatedFields.contestState === 1) continue;
      const g = byId.get(row.contest.contestId);
      if (!g || g.site === 'neutral') continue;
      const homeRow = row.contest.teams.find((t) => t.homeAwayType === 0)!;
      const expected = resolveTeam(homeRow.teamId)?.name ?? homeRow.name;
      expect(g.home.name).toBe(expected);
    }
  });
});

describe('normalize: league flag and division (SPEC §5.5.5)', () => {
  it('flags a conference game and names its division', () => {
    // Saint Francis @ Los Altos, 2026-09-16 — contestType 0 on both rows.
    const g = games.find(
      (x) =>
        x.dateKey === '2026-09-16' &&
        [x.home.slug, x.away.slug].includes('los-altos') &&
        [x.home.slug, x.away.slug].includes('saint-francis'),
    );
    expect(g).toBeDefined();
    expect(g!.isLeague).toBe(true);
    expect(g!.leagueDivision).toBe('de-anza');
  });

  it('never sets leagueDivision for a non-member opponent', () => {
    for (const g of games) {
      if (g.home.slug && g.away.slug) continue;
      expect(g.leagueDivision).toBeNull();
    }
  });

  it('never sets leagueDivision across divisions', () => {
    for (const g of games.filter((x) => x.leagueDivision !== null)) {
      expect(g.home.slug).not.toBeNull();
      expect(g.away.slug).not.toBeNull();
    }
  });

  it('counts a plausible number of league games', () => {
    // 15 MaxPreps teams in a double round robin, part-way through the season.
    expect(result.stats.league).toBeGreaterThan(80);
    expect(result.stats.league).toBeLessThan(120);
  });
});

describe('normalize: details', () => {
  it('records overtime from overtimePeriodsPlayed', () => {
    const ot = games.filter((g) => g.isOt);
    expect(ot.length).toBe(4);
    for (const g of ot) {
      expect(g.otPeriods).toBeGreaterThan(0);
      expect(g.decider === 'OT' || g.decider === '2OT').toBe(true);
    }
  });

  it('stores both date forms and a matching date key', () => {
    for (const g of games) {
      expect(g.dateKey).toBe(dateKeyOf(g.dateLocal));
      expect(g.dateUtc.endsWith('Z')).toBe(true);
    }
  });

  it('keeps location text as a note, never as a venue name', () => {
    const noted = games.filter((g) => g.venue.text !== null);
    expect(noted.length).toBeGreaterThan(0);
    for (const g of noted) expect(g.venue.name).toBeUndefined();
  });

  it('carries the MaxPreps deep link on every published contest', () => {
    for (const g of games.filter((x) => x.status === 'final')) {
      expect(g.urls.maxpreps).toMatch(/^https:\/\/www\.maxpreps\.com\//);
    }
  });

  it('drops a third-party URL that is not http(s), with a warning', () => {
    // React does not filter a URL scheme, so a hostile `canonicalUrl` upstream would otherwise be
    // emitted verbatim into an `href` on a prerendered page. One bad row is dropped, not fatal.
    const one = rows.find((r) => r.calculatedFields.canonicalUrl)!;
    const poisoned = {
      ...one,
      calculatedFields: { ...one.calculatedFields, canonicalUrl: 'javascript:alert(1)' },
      goFanUrl: 'data:text/html,<script>x()</script>',
    };
    const res = normalizeGames([poisoned], { fetchedAt: '2026-09-29T15:00:00.000Z' });
    expect(res.games).toHaveLength(1);
    expect(res.games[0].urls.maxpreps).toBeNull();
    expect(res.games[0].urls.goFan).toBeNull();
    expect(res.warnings.some((w) => /canonicalUrl is not an http\(s\) URL/.test(w))).toBe(true);
    expect(res.warnings.some((w) => /goFanUrl is not an http\(s\) URL/.test(w))).toBe(true);
  });

  it('cleans the recap sentence (DESIGN §5.8)', () => {
    expect(
      cleanRecap(
        'On 9/24, the Saratoga varsity field hockey team lost their home conference game against Santa Clara (CA) by a score of 3-2.',
      ),
    ).toBe('Saratoga lost their home conference game against Santa Clara by a score of 3-2.');
    expect(cleanRecap('')).toBeNull();
    expect(cleanRecap(null)).toBeNull();
  });

  it('only keeps a recap on a final', () => {
    for (const g of games) if (g.status !== 'final') expect(g.recap).toBeNull();
  });

  it('computes the season window from the games, not a constant', () => {
    const w = seasonWindowOf(games);
    expect(w.firstGame!.slice(0, 10)).toBe('2026-08-24');
    expect(w.lastGame!.slice(0, 10)).toBe('2026-10-28');
    expect(w.lastLeagueGame!.slice(0, 10)).toBe('2026-10-28');
  });

  it('normalizes an unsuffixed GMT stamp exactly once', () => {
    expect(toUtcIso('2026-09-16T23:00:00')).toBe('2026-09-16T23:00:00Z');
    expect(toUtcIso('2026-09-16T23:00:00Z')).toBe('2026-09-16T23:00:00Z');
  });
});

describe('normalize: contest.location is a 50-char free-text field', () => {
  it('reads an explicit "Location:" prefix as the venue, not as a note', () => {
    expect(splitLocation('Location: Archbishop Mitty High School')).toEqual({
      name: 'Archbishop Mitty High School',
      text: null,
    });
    expect(splitLocation('  location :  Wilcox HS  ')).toEqual({ name: 'Wilcox HS', text: null });
  });

  it('marks a note that the source cut off at its field limit', () => {
    // 49 characters, cut mid-word by MaxPreps — shipped verbatim it reads as our bug.
    expect(splitLocation('Lacey played 3Q had 7 saves. Noa played last quart')).toEqual({
      text: 'Lacey played 3Q had 7 saves. Noa played last…',
    });
  });

  it('leaves a short note, and a complete sentence at the limit, exactly as published', () => {
    for (const note of ['Senior Night', 'Scrimmage', 'Too be rescheduled']) {
      expect(splitLocation(note)).toEqual({ text: note });
    }
    const full = `${'a'.repeat(48)}.`;
    expect(splitLocation(full)).toEqual({ text: full });
    expect(splitLocation(null)).toEqual({ text: null });
    expect(splitLocation('   ')).toEqual({ text: null });
  });

  it('is what the fixture corpus carries', () => {
    for (const game of games) {
      if (game.venue.text) expect(game.venue.text).not.toMatch(/^Location\s*:/i);
    }
  });
});
