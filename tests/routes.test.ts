import { describe, expect, it } from 'vitest';

import { clubHref, playoffsHref, scheduleHref, scoresHref, standingsHref, teamHref } from '@/lib/shared/routes';

describe('routed URLs (lib/shared/routes.ts)', () => {
  it('builds a team, club, schedule and scores href from one segment', () => {
    expect(teamHref('carmel')).toBe('/teams/carmel');
    expect(clubHref('some-club')).toBe('/clubs/some-club');
    expect(scheduleHref('scval')).toBe('/schedule/scval');
    expect(scoresHref('2026-10-18')).toBe('/scores/2026-10-18');
  });

  it('puts the division on the standings href as a fragment, only when one is named', () => {
    expect(standingsHref('scval')).toBe('/standings/scval');
    expect(standingsHref('scval', 'de-anza')).toBe('/standings/scval#de-anza');
  });

  it('points at the cross-league playoffs page when no league is named', () => {
    expect(playoffsHref()).toBe('/playoffs');
    expect(playoffsHref('scval')).toBe('/playoffs/scval');
  });
});
