/**
 * views/clubs/club-page.ts and views/clubs/club-view.ts buildClubPageView (/clubs/[slug]): the players in order, the
 * sources under their labels, the empty club.  The data is hand research that changes only with a new sweep
 * (tests/data/clubs.test.ts), so the words pinned here are pinned to it: when a sweep lands, re-read the pages and
 * update them together. The suites share tests/support/clubs-view.ts.
 */

import { describe, expect, it } from 'vitest';

import { getClubAffiliations } from '@/lib/datasets/clubs';
import { getEnrichedTeamRoster } from '@/lib/datasets/rosters';
import { getTeamBySlug } from '@/lib/registry/teams';
import { buildClubPageView } from '@/views/clubs/club-view';
import { club, views, viewOf } from '@/tests/support/clubs-view';

describe('buildClubPageView (/clubs/[slug])', () => {
  it('is null for a slug the file does not hold', () => {
    expect(buildClubPageView('nope')).toBeNull();
  });

  it('lists current ties first, then the rest, each by school, then the roster’s name order', () => {
    for (const { slug, view } of views) {
      expect(view.groups.map((g) => g.id), slug).toEqual(
        [view.groups.some((g) => g.id === 'current') ? 'current' : null, view.groups.some((g) => g.id === 'other') ? 'other' : null].filter(Boolean),
      );
      for (const g of view.groups) {
        expect(g.rows.every((r) => (g.id === 'current') === (r.statusKind === 'current')), `${slug} ${g.id}`).toBe(true);
        const schools = g.rows.map((r) => r.school.name);
        expect(schools, `${slug} ${g.id}`).toEqual([...schools].sort((a, b) => a.localeCompare(b)));
      }
    }
    expect(viewOf('fly-fhc').groups.map((g) => g.heading)).toEqual(['Current', 'Earlier, or not known to be current']);
    expect(viewOf('sf-hawks').groups.map((g) => g.heading)).toEqual(['Current']);
    // Within St. Ignatius on the SF Hawks page: by last name.
    const si = viewOf('sf-hawks').groups[0].rows.filter((r) => r.school.name.startsWith('St. Ignatius')).map((r) => r.name);
    expect(si.slice(0, 4)).toEqual(['Clara Brunello', 'Samantha Brunsell', 'Gigi Colant', 'Scarlett Gammack']);
  });

  it('names exactly the club’s tied players, each a non-JV row of that team, by the roster’s spelling', () => {
    for (const { slug, view } of views) {
      const rows = view.groups.flatMap((g) => g.rows);
      const ties = getClubAffiliations(slug);
      expect(rows.map((r) => r.key).sort(), slug).toEqual(ties.map((a) => `${a.teamSlug}-${a.athleteId}`).sort());
      expect(view.playerCount, slug).toBe(ties.length);
      for (const a of ties) {
        const row = rows.find((r) => r.key === `${a.teamSlug}-${a.athleteId}`)!;
        const merged = getEnrichedTeamRoster(a.teamSlug)!.players.find((p) => p.athleteId === a.athleteId)!;
        expect(merged.level, `${slug} / ${a.fullName}`).not.toBe('jv');
        expect(row.name, slug).toBe(merged.fullName);
        expect(row.school.href, slug).toBe(`/teams/${a.teamSlug}#roster`);
        expect(row.school.name, slug).toBe(getTeamBySlug(a.teamSlug)!.name);
      }
    }
  });

  it('prints only the facts that exist, and links each source once under a distinct label', () => {
    const riya = viewOf('fly-fhc').groups.flatMap((g) => g.rows).find((r) => r.name === 'Riya Mehrotra')!;
    // Her grade comes from the overlay (the Talon, 2026-10-12): the club page prints it before the team.
    expect(riya.facts).toEqual(['Senior', 'Black - Advanced']);
    const storey = viewOf('sf-hawks').groups[0].rows.find((r) => r.name === 'Storey Lewis')!;
    expect(storey.facts).toEqual(['Senior', 'U19 Hawks Blue']);
    expect(storey.sources.map((s) => s.label)).toEqual(['SportsRecruits profile', 'NFHCA', 'SportsRecruits team page', 'NCSA profile', 'club roster']);
    const roxana = viewOf('norcal-impact').groups[0].rows.find((r) => r.name === 'Roxana Jafarpur')!;
    expect(roxana.sources.map((s) => s.label)).toEqual(['NCSA profile', 'NCSA profile (2)']);
    const frankie = viewOf('sf-hawks').groups[0].rows.find((r) => r.name === 'Frankie Lemieux')!;
    expect(frankie.sources.map((s) => s.label).filter((l) => l.startsWith('Stick Together'))).toEqual(['Stick Together', 'Stick Together (2)']);
    for (const { slug, view } of views) {
      for (const row of view.groups.flatMap((g) => g.rows)) {
        const urls = row.sources.map((s) => s.url);
        const labels = row.sources.map((s) => s.label);
        expect(new Set(urls).size, `${slug} / ${row.name}`).toBe(urls.length);
        expect(new Set(labels).size, `${slug} / ${row.name}`).toBe(labels.length);
        expect(row.sources.length, `${slug} / ${row.name}`).toBeGreaterThan(0);
      }
    }
  });

  it('gives an empty club its page with no groups, and words the identity honestly', () => {
    expect(viewOf('pac-heights').groups).toEqual([]);
    expect(viewOf('pac-heights').playerCount).toBe(0);
    expect(viewOf('performance-fh').fullName).toBeNull();
    expect(viewOf('sf-hawks').fullName).toBe('San Francisco Youth Field Hockey Club');
    expect(viewOf('sf-hawks').regionLabel).toBeNull(); // it would only repeat the city
    expect(viewOf('htc').regionLabel).toBe('San Diego'); // HTC California trains in La Jolla and Chula Vista
    expect(viewOf('rush').regionLabel).toBe('San Diego'); // Encinitas, in San Diego County
    expect(viewOf('la-tigers').regionLabel).toBe('Los Angeles'); // no city given
    expect(viewOf('fly-fhc').regionLabel).toBe('South Bay');
    expect(viewOf('fly-fhc').facts).toEqual(['Los Altos', 'Founded 2001']);
    expect(viewOf('lightning').facts).toEqual(['Los Altos Hills']);
    expect(viewOf('sf-hawks').checkedOn).toBe('Oct 3, 2026');
    expect(viewOf('d-city').regionLabel).toBe('Sacramento area');
    expect(viewOf('d-city').facts).toEqual(['Davis', 'Founded 2019']);
    expect(viewOf('d-city').checkedOn).toBe('Oct 4, 2026');
    expect(viewOf('d-city').groups.map((g) => g.heading)).toEqual(['Earlier, or not known to be current']);
    expect(viewOf('roseville-fhc').facts).toEqual(['Roseville', 'Founded 2024']);
    expect(viewOf('chico-hotshots').regionLabel).toBe('North State');
    expect(viewOf('chico-hotshots').facts).toEqual(['Chico']); // no founding year posted
    expect(viewOf('chico-hotshots').fullName).toBe('Chico Hotshots Field Hockey Club');
    expect(viewOf('chico-hotshots').checkedOn).toBe('Oct 4, 2026');
    expect(viewOf('chico-hotshots').groups.map((g) => g.heading)).toEqual(['Current', 'Earlier, or not known to be current']);
    expect(viewOf('chico-hotshots').groups[0].rows.map((r) => [r.name, r.facts, r.status])).toEqual([
      ['Quinn Karolyi', ['Junior', 'U16'], 'Current'],
      ['Evie Nielsen', ['Junior', 'Hotshots u19'], 'Current'],
      ['Lilah Letcher', ['Junior', 'U19'], 'Current, as of Sep 29, 2026'],
      ['Kate Panighetti', ['Senior', 'U19'], 'Current, as of May 20, 2026'],
    ]);
  });

  it('labels roster pages by what they are, and lists each of the club’s pages once', () => {
    const roster = (slug: string) => viewOf(slug).rosterPages.map((p) => p.label);
    expect(roster('sf-hawks')).toEqual(['Current players', 'SportsRecruits club page', 'U19 Hawks Blue roster', 'U16 Hawks Blue roster']);
    expect(roster('lightning')).toEqual(['U16/U19 girls roster, Fall 2025', 'U14/U16 girls roster, Fall 2025']);
    expect(roster('norcal-impact')).toEqual(['Club roster page', 'Club roster page (2)']);
    expect(roster('htc')).toEqual(['SportsRecruits club page', 'SportsRecruits team page', 'SportsRecruits team page (2)']);
    expect(roster('pac-heights')).toEqual([]);
    expect(roster('roseville-fhc')).toEqual(['Fall 2026 League roster', 'USA Gold Cup 2026 team rosters', 'UC Davis 7v7 Tournament roster']);
    expect(roster('d-city')).toEqual([]);
    expect(roster('chico-hotshots')).toEqual([]);
    expect(viewOf('chico-hotshots').sources.map((s) => [s.label, s.host])).toEqual([
      ['Club home page', 'leagues.teamlinkt.com'],
      ['Spring 2026 divisions and teams', 'leagues.teamlinkt.com'],
      ['Spring 2026 locations', 'leagues.teamlinkt.com'],
      ['Club news (Feb 2026)', 'leagues.teamlinkt.com'],
    ]);
    expect(viewOf('sf-hawks').rosterPages[0].host).toBe('sfyouthfieldhockey.com');
    // "Pages about the club" is the club's sources less the roster pages listed just above it.
    expect(viewOf('sf-hawks').sources.map((s) => s.label)).toEqual(['Club home page', 'Program overview', 'Winter 2026-27 teams', 'Club history']);
    expect(viewOf('lightning').sources.map((s) => s.label)).toEqual(['Club home page', 'U16/U19 girls team page', 'NCFHA youth club directory']);
    for (const { slug, view } of views) {
      const c = club(slug);
      expect(view.sources.map((s) => s.label), slug).toEqual(c.sources.filter((s) => !c.rosterPages.includes(s.url)).map((s) => s.what));
      // Nothing is lost: every source is under one heading or the other, and no URL under both.
      const urls = [...view.rosterPages, ...view.sources].map((l) => l.url);
      expect(new Set(urls).size, slug).toBe(urls.length);
      for (const src of c.sources) expect(urls, `${slug} ${src.url}`).toContain(src.url);
      const names = [...view.rosterPages, ...view.sources].map((l) => l.label);
      expect(new Set(names).size, slug).toBe(names.length);
    }
  });

  it('links the page most programs were read from once, under the list, and keeps a row’s own link only when it differs', () => {
    // Fly lists all eight on one page: no row has a link of its own.
    const fly = viewOf('fly-fhc');
    expect(fly.programs.every((p) => p.source === null)).toBe(true);
    expect(fly.programsSource).toEqual({ label: 'Programs overview', url: 'https://flyfhc.com/programs/', lead: 'Listed on the club’s site' });
    // SF Hawks lists five age groups on its program overview; the other five rows keep their links.
    const hawks = viewOf('sf-hawks');
    expect(hawks.programsSource).toEqual({
      label: 'Program overview',
      url: 'https://sfyouthfieldhockey.com/program-overview/',
      lead: 'Programs without a link of their own are listed on the club’s site',
    });
    expect(hawks.programs.filter((p) => p.source === null).map((p) => p.name)).toEqual(['U19', 'U16', 'U14', 'U12', 'U06, U08 and U10']);
    expect(new Set(hawks.programs.flatMap((p) => (p.source ? [p.source.label] : [])))).toEqual(new Set(['club site', 'SportsRecruits team page']));
    expect(viewOf('roseville-fhc').programsSource).toEqual({
      label: 'Fall 2026 programs',
      url: 'https://rosevillefhc.org/programs',
      lead: 'Programs without a link of their own are listed on the club’s site',
    });
    expect(viewOf('chico-hotshots').programsSource).toEqual({
      label: 'Spring 2026 divisions and teams',
      url: 'https://leagues.teamlinkt.com/chicohotshotsfieldhockey/Divisions',
      lead: 'Listed on the club’s site',
    });
    // Every program page is its own: nothing to share.
    expect(viewOf('lightning').programsSource).toBeNull();
    expect(viewOf('lightning').programs.every((p) => p.source?.label === 'club site')).toBe(true);
    // The rule over every club: the shared page is the one most programs cite (two or more), and a
    // row has a link exactly when its page is another.
    for (const { slug, view } of views) {
      const c = club(slug);
      expect(view.programs.map((p) => p.name), slug).toEqual(c.programs.map((p) => p.name));
      const counts = c.programs.map((p) => c.programs.filter((q) => q.source === p.source).length);
      const most = Math.max(0, ...counts);
      if (most < 2) expect(view.programsSource, slug).toBeNull();
      else expect(c.programs.filter((p) => p.source === view.programsSource?.url), slug).toHaveLength(most);
      view.programs.forEach((p, i) => {
        const own = c.programs[i].source !== view.programsSource?.url;
        expect(p.source === null ? null : p.source.url, `${slug} / ${p.name}`).toBe(own ? c.programs[i].source : null);
      });
      if (view.programsSource) {
        const all = view.programs.every((p) => p.source === null);
        expect(view.programsSource.lead.startsWith(all ? 'Listed on ' : 'Programs without a link of their own are listed on '), slug).toBe(true);
      }
    }
  });
});
