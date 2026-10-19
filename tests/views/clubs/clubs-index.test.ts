/**
 * views/clubs/clubs-index.ts and views/clubs/club-view.ts buildClubsIndexView (/clubs; DESIGN §17.5): the regions in
 * CLUB_REGIONS order, the clubs in display order, the counts and the lede.  The data is hand research that changes
 * only with a new sweep (tests/data/clubs.test.ts), so the words pinned here are pinned to it: when a sweep lands,
 * re-read the pages and update them together. The suites share tests/support/clubs-view.ts.
 */

import { describe, expect, it } from 'vitest';

import { getClubAffiliations, getClubSlugs, getClubs } from '@/lib/datasets/clubs';
import { getRosters } from '@/lib/datasets/rosters';
import { getTeamBySlug } from '@/lib/registry/teams';
import { club } from '@/tests/support/clubs-view';
import { buildClubsIndexView } from '@/views/clubs/club-view';
import { countLine } from '@/views/clubs/clubs-index';
import { REGION_WORDS } from '@/views/clubs/words';

describe('buildClubsIndexView (/clubs)', () => {
  const index = buildClubsIndexView();
  const rows = index.regions.flatMap((r) => r.clubs);

  it('groups the clubs by region, in CLUB_REGIONS order, each club once in display order', () => {
    expect(index.regions.map((r) => r.id)).toEqual([
      'san-francisco', 'south-bay', 'east-bay', 'marin', 'sacramento', 'north-state',
      'ventura', 'los-angeles', 'orange-county', 'san-diego',
    ]);
    expect(index.regions.map((r) => r.heading)).toEqual([
      'San Francisco', 'South Bay', 'East Bay', 'Marin', 'Sacramento area', 'North State',
      'Ventura County', 'Los Angeles', 'Orange County', 'San Diego',
    ]);
    expect(index.regions.map((r) => r.meta)).toEqual(['2 clubs', '7 clubs', '2 clubs', '1 club', '2 clubs', '1 club', '2 clubs', '2 clubs', '4 clubs', '5 clubs']);
    // Each region's section is scoped to its half of the site (the NorCal/SoCal toggle).
    expect(index.regions.map((r) => r.siteRegion)).toEqual([...Array(6).fill('norcal'), ...Array(4).fill('socal')]);
    expect(rows.map((r) => r.slug)).toEqual(getClubSlugs());
    expect(rows.map((r) => r.slug)).toEqual(getClubs().map((c) => c.slug));
    for (const r of index.regions) for (const c of r.clubs) expect(club(c.slug).region, c.slug).toBe(r.id);
  });

  it('names the searched areas that hold no club', () => {
    expect(index.regionsWithoutClubs).toEqual(['Peninsula', 'Central Coast', 'Inland Empire']);
    expect(index.regionsWithoutClubsSentence).toBe('This list has no club based on the Peninsula, the Central Coast or in the Inland Empire.');
    expect(REGION_WORDS.marin.label).toBe('Marin');
    expect(index.regionsNotSearched).toEqual(['Sacramento area', 'North State']);
    expect(index.regionsNotSearchedSentence).toBe('The Sacramento area and the North State were not searched for every club, so other clubs may be based there.');
    expect(index.regionsWithoutClubsSentence).not.toMatch(/Sacramento|North State/);
    expect(REGION_WORDS.sacramento.label).toBe('Sacramento area');
    expect(REGION_WORDS['north-state'].label).toBe('North State');
  });

  it('counts each club’s tied players, current apart from the rest, and lists their schools', () => {
    for (const r of rows) {
      const ties = getClubAffiliations(r.slug);
      expect(r.current + r.other, r.slug).toBe(ties.length);
      expect(r.current, r.slug).toBe(ties.filter((a) => a.status === 'current').length);
      expect(r.href, r.slug).toBe(`/clubs/${r.slug}`);
      expect(r.schools, r.slug).toEqual([...new Set(ties.map((a) => getTeamBySlug(a.teamSlug)!.name))].sort((a, b) => a.localeCompare(b)));
    }
    const line = (slug: string) => rows.find((r) => r.slug === slug)!.countLine;
    expect(line('sf-hawks')).toBe('32 current players');
    expect(line('norcal-impact')).toBe('25 current players');
    expect(line('fly-fhc')).toBe('14 players: 5 current, 9 earlier or not known to be current');
    expect(line('infinity')).toBe('9 players: 2 current, 7 earlier or not known to be current');
    expect(line('lightning')).toBe('3 players: 1 current, 2 earlier or not known to be current');
    expect(line('htc')).toBe('30 players: 26 current, 4 earlier or not known to be current');
    expect(line('rush')).toBe('16 players: 14 current, 2 earlier or not known to be current');
    expect(line('myto')).toBe('15 players: 13 current, 2 earlier or not known to be current');
    expect(line('vcrd')).toBe('6 current players');
    expect(line('bulldogs')).toBe('No player from these rosters found');
    expect(rows.find((r) => r.slug === 'htc')!.subline).toBe('HTC Field Hockey Club · La Jolla, CA (HTC California)');
    expect(rows.find((r) => r.slug === 'la-tigers')!.subline).toBe('LA Tigers Sports Club');
    expect(line('pac-heights')).toBe('No player from these rosters found');
    expect(line('d-city')).toBe('4 players, all earlier or not known to be current');
    expect(line('roseville-fhc')).toBe('No player from these rosters found');
    expect(line('chico-hotshots')).toBe('5 players: 4 current, 1 earlier or not known to be current');
    expect(rows.find((r) => r.slug === 'd-city')!.subline).toBe('D-City Field Hockey Club · Davis');
    expect(rows.find((r) => r.slug === 'd-city')!.schools).toEqual(['Davis']);
    expect(rows.find((r) => r.slug === 'chico-hotshots')!.subline).toBe('Chico Hotshots Field Hockey Club · Chico');
    expect(rows.find((r) => r.slug === 'chico-hotshots')!.schools).toEqual(['Chico', 'Pleasant Valley']);
    expect(rows.find((r) => r.slug === 'performance-fh')!.subline).toBe('Los Gatos');
    expect(rows.find((r) => r.slug === 'sf-hawks')!.subline).toBe('San Francisco Youth Field Hockey Club · San Francisco');
  });

  it('countLine says "earlier" alone when nothing is merely listed, and words a lone tie', () => {
    expect(countLine([{ status: 'current' }, { status: 'past' }])).toBe('2 players: 1 current, 1 earlier');
    expect(countLine([{ status: 'past' }, { status: 'past' }])).toBe('2 players, all earlier');
    expect(countLine([{ status: 'unknown' }])).toBe('1 player, earlier or not known to be current');
    expect(countLine([])).toBe('No player from these rosters found');
  });

  it('answers the page’s question in its lede, counted from the files', () => {
    expect(index.trackedTeams).toBe(getRosters().teams.length);
    expect([index.playerCount, index.schoolCount, index.clubCount, index.clubsWithPlayers]).toEqual([149, 48, 28, 15]);
    expect(index.lede).toBe(
      `Which youth clubs players on this site’s ${getRosters().teams.length} varsity rosters play for, or played for, according to public pages that name both. 149 players from 48 schools are tied to 15 of these 28 clubs, the most to SF Hawks (32) and HTC (30).`,
    );
    expect(index.capturedOn).toBe('Oct 3, 2026');
    expect(index.currentSeasons).toBe('2025-26 or 2026-27');
  });
});
