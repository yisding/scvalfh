/**
 * The /festival pages (app/festival/**, DESIGN §35) rendered on the committed data: their params and metadata, the
 * hooks the follow script, stylesheet and filter key off, the hub's order, and the copy rules every page keeps
 * (no "eliminat…", no missing score printed as a zero, nothing undefined).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { Metadata } from 'next';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import FestivalLayout from '../../app/festival/layout';
import FestivalPage, { generateMetadata as hubMetadata } from '../../app/festival/page';
import DivisionPage, { generateMetadata as divisionMetadata, generateStaticParams as divisionParams } from '../../app/festival/[division]/page';
import ClubsPage, { generateMetadata as clubsMetadata } from '../../app/festival/clubs/page';
import ClubPage, { generateMetadata as clubMetadata, generateStaticParams as clubParams } from '../../app/festival/clubs/[club]/page';
import SchedulePage, { generateMetadata as scheduleMetadata } from '../../app/festival/schedule/page';
import TeamPage, { generateMetadata as teamMetadata, generateStaticParams as teamParams } from '../../app/festival/teams/[team]/page';
import FestivalPoolTable from '../../components/festival/FestivalPoolTable';
import { festivalModel, poolTable } from '../../components/festival/festival-model';
import { festivalClubSlugs, festivalDivisionSlugs, festivalTeamSlugs, getFestival } from '../../lib/festival/festival';
import { REPO } from '../helpers';
import { stripTags } from './html-text';

const FILE = getFestival();
const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) }) as never;
const render = (node: React.ReactElement) => renderToStaticMarkup(node);

const hub = render(createElement(FestivalPage));
const schedule = render(createElement(SchedulePage));
const clubs = render(createElement(ClubsPage));
const u19 = render(await DivisionPage(params({ division: 'u19' })));
const u16 = render(await DivisionPage(params({ division: 'u16' })));
const htc = render(await ClubPage(params({ club: 'htc' })));
const sfTeam = FILE.teams.find((t) => t.name === 'San Francisco Hawks U16')!;
const team = render(await TeamPage(params({ team: sfTeam.slug })));
const PAGES = { hub, schedule, clubs, u19, u16, htc, team };

describe('params', () => {
  it('prerenders every division, club and team, and nothing else', () => {
    expect(divisionParams().map((p) => p.division)).toEqual(festivalDivisionSlugs());
    expect(divisionParams().map((p) => p.division)).toEqual(['u10', 'u12', 'u14-coed', 'u14-7v7', 'u14-11v11', 'u16', 'u19', 'adult']);
    expect(clubParams().map((p) => p.club)).toEqual(festivalClubSlugs());
    expect(teamParams().map((p) => p.team)).toEqual(festivalTeamSlugs());
    expect(teamParams().length).toBe(FILE.teams.length);
  });
});

describe('metadata', () => {
  const all: Array<[string, Promise<Metadata> | Metadata]> = [
    ['/festival', hubMetadata()],
    ['/festival/schedule', scheduleMetadata()],
    ['/festival/clubs', clubsMetadata()],
    ['/festival/u19', divisionMetadata(params({ division: 'u19' }))],
    ['/festival/clubs/htc', clubMetadata(params({ club: 'htc' }))],
    [`/festival/teams/${sfTeam.slug}`, teamMetadata(params({ team: sfTeam.slug }))],
  ];

  it('every page: its title, an "Unofficial." description, its canonical, and the root OG card', async () => {
    for (const [path, pending] of all) {
      const meta = await pending;
      expect(meta.title, path).toBeTruthy();
      expect(String(meta.description), path).toMatch(/Unofficial\.$/);
      expect(meta.alternates?.canonical, path).toBe(path);
      expect(meta.openGraph?.url, path).toBe(path);
      expect(meta.openGraph?.title, path).toBe(meta.title);
      expect(meta.openGraph?.images, path).toBeTruthy();
    }
  });

  it('an unknown param gets a not-found title, not a throw', async () => {
    expect((await divisionMetadata(params({ division: 'nope' }))).title).toBe('Division not found');
    expect((await clubMetadata(params({ club: 'nope' }))).title).toBe('Club not found');
    expect((await teamMetadata(params({ team: 'nope' }))).title).toBe('Team not found');
  });
});

describe('copy rules on every page', () => {
  it('never "eliminat…", never "undefined" or "NaN", plain spaces in clock times', () => {
    for (const [name, html] of Object.entries(PAGES)) {
      const text = stripTags(html);
      expect(text, name).not.toMatch(/eliminat/i);
      expect(text, name).not.toMatch(/\bundefined\b|\bNaN\b/);
      expect(text, name).not.toMatch(/\d [AP]M | [AP]M/);
      expect(html, name).not.toMatch(/\b1 (games|teams|pools|clubs)\b/);
    }
  });

  it('a game not started prints no score', () => {
    const scheduled = FILE.games.filter((g) => g.status === 'scheduled').length;
    expect(schedule.match(/class="sx-num sx-game-score"/g)?.length ?? 0).toBe((FILE.games.length - scheduled) * 2);
  });
});

describe('the hub', () => {
  it('ships a hidden "Your teams" card for every team, and the empty state', () => {
    expect(hub.match(/data-fest-card="/g)?.length).toBe(FILE.teams.length);
    expect(hub).toMatch(/<li[^>]*data-fest-card="[a-z0-9-]+"[^>]*hidden=""/);
    expect(stripTags(hub)).toContain('Tap Follow on any team to keep its games here. Saved in this browser only.');
    expect(hub).toContain('data-fest-empty=""');
    expect(hub).toContain('[data-fest-card=');
  });

  it('runs in the order the spec gives', () => {
    const at = (id: string) => hub.indexOf(`id="${id}"`);
    const order = ['your-teams', 'california', 'latest', 'up-next', 'divisions', 'clubs', 'about'].filter((id) => at(id) >= 0);
    expect(order.map(at)).toEqual([...order.map(at)].sort((a, b) => a - b));
    expect(at('your-teams')).toBeGreaterThan(0);
    expect(at('about')).toBeGreaterThan(0);
  });

  it('lists the California teams Northern then Southern, and not HTC’s East Coast team', () => {
    const text = stripTags(hub);
    const cal = text.slice(text.indexOf('California teams'), text.indexOf('Latest results') > 0 ? text.indexOf('Latest results') : text.indexOf('Divisions'));
    expect(cal.indexOf('Northern California')).toBeLessThan(cal.indexOf('Southern California'));
    for (const name of ['San Francisco Hawks U16', 'San Francisco Hawks U19', 'Norcal Wolves U16', 'Hayward Hawks', 'HTC CA U19']) {
      expect(cal).toContain(name);
    }
    // HTC's U16 team is its East Coast team: no card for it in this section.
    const htcU16 = FILE.teams.find((t) => t.name === 'HTC')!.slug;
    const from = hub.indexOf('id="california"');
    const section = hub.slice(from, hub.indexOf('<section', from));
    expect(section).not.toContain(`data-fest-team="${htcU16}"`);
    expect(hub).toContain('href="/clubs/sf-hawks"');
    expect(hub).toContain('href="/clubs/htc"');
  });

  it('carries the corrections link and the source links', () => {
    expect(hub).toContain(FILE.tournament.resultsUrl.replace(/&/g, '&amp;'));
    expect(hub).toContain(FILE.tournament.infoUrl);
  });
});

describe('a division page', () => {
  it('draws a pool table per pool, then the placement columns, then the schedule by slot', () => {
    const d = FILE.divisions.find((x) => x.slug === 'u19')!;
    expect(u19.match(/<table class="sx-table"/g)?.length).toBe(d.pools.length);
    expect(stripTags(u19)).toContain('Pool R v Pool S');
    expect(stripTags(u19)).toContain('No knockout bracket');
    expect(stripTags(u19)).toContain('1st-place final');
    expect(u19).toContain('id="game-b1"');
    expect(u19.indexOf('id="pools"')).toBeLessThan(u19.indexOf('id="bracket"'));
    expect(u19.indexOf('id="bracket"')).toBeLessThan(u19.indexOf('id="schedule"'));
    expect(u16).not.toContain('id="bracket"');
    expect(u19).toContain('aria-current="page"');
  });
});

describe('team names in matches (owner ask, 2026-11-26: tapping a name opens the team)', () => {
  it('every game list is a festival list, whose team names are links to team pages', () => {
    for (const [name, html] of Object.entries({ hub, schedule, u19, u16 })) {
      const lists = html.match(/<div class="sx-gamelist[^"]*"/g) ?? [];
      expect(lists.length, name).toBeGreaterThan(0);
      for (const l of lists) expect(l, name).toContain('sx-fest-games');
      expect(html, name).toMatch(/<a class="sx-game-name" href="\/festival\/teams\/[a-z0-9-]+"/);
    }
  });

  it('keeps those links tappable on a touch screen, where the site’s other game rows send a tap to the game', () => {
    const css = readFileSync(path.join(REPO, 'app', 'globals.css'), 'utf8');
    expect(css).toContain('@media (hover: none), (pointer: coarse) { .sx-fest-games a.sx-game-name { pointer-events: auto; } }');
  });

  it('underlines the "Now:" team of an open placement side, so it reads as a link without relying on colour', () => {
    const now = u19.match(/ · Now: <\/?[^>]*>?<a [^>]*>/g) ?? u19.match(/Now: <a [^>]*>/g) ?? [];
    expect(now.length).toBeGreaterThan(0);
    for (const a of now) expect(a).toContain('class="sx-link"');
  });
});

describe('a club page’s profile (owner ask, 2026-11-26: hometown, a brief description and the club’s website)', () => {
  it('prints the hometown in its header, its one-line description and a "Club website" link', async () => {
    const page = render(await ClubPage(params({ club: 'san-francisco-hawks' })));
    const text = stripTags(page);
    expect(text).toContain('San Francisco, Calif.');
    // SF Hawks' description is its festival entry's own (festival-clubs.json); its website comes from its page on
    // this site (data/field-hockey/clubs.json).
    expect(text).toContain('A San Francisco youth club with fall, winter and spring seasons');
    expect(page).toMatch(/href="https:\/\/sfyouthfieldhockey\.com\/"[^>]*>Club website/);
  });

  it('prints neither when a club has none (the adult "Stars" team’s automatic club)', async () => {
    const page = render(await ClubPage(params({ club: 'stars' })));
    expect(page).not.toContain('Club website');
  });
});

describe('a division without placement games', () => {
  it('says "Pool play only" in its header, and the hub’s division list links its pools where others link a bracket', () => {
    expect(stripTags(u16)).toContain('Pool play only');
    expect(stripTags(u19)).not.toContain('Pool play only');
    expect(u16).toContain('id="pools"');
    const list = hub.split('aria-labelledby="divisions"')[1]!.split('</section>')[0]!;
    const row = (short: string) => list.split('<li').find((li) => li.includes(`>${short}</a>`)) ?? '';
    for (const [short, slug] of [['U16', 'u16'], ['U14 Co-Ed', 'u14-coed'], ['Adult', 'adult']]) {
      expect(row(short), short).toMatch(new RegExp(`href="/festival/${slug}#pools"[^>]*>Pools<`));
      expect(row(short), short).not.toContain('#bracket');
    }
    expect(row('U19')).toMatch(/href="\/festival\/u19#bracket"[^>]*>Finals</);
    expect(row('U19')).not.toContain('#pools');
  });
});

describe('a pool table with a full tie', () => {
  // DESIGN §35.5: teams level on points, wins, goal difference and goals for share a rank (TourneyMachine lists them
  // alphabetically); the table prints it "=1", read as "tied 1".
  it('prints the shared rank as "=1", and a plain rank for a team alone at its place', () => {
    const base = poolTable(festivalModel(), FILE.divisions[0].pools[0].id);
    const pool = {
      ...base,
      rows: base.rows.map((r, i) => ({ ...r, rank: i < 2 ? 1 : i + 1, tied: i < 2 })),
    };
    const html = render(createElement(FestivalPoolTable, { pool }));
    const cells = [...html.matchAll(/<td class="sx-num sx-col-rank">(.*?)<\/td>/g)].map((m) => m[1]);
    const tied = '<span aria-hidden="true">=1</span><span class="sr-only">tied 1</span>';
    expect(cells.slice(0, 3)).toEqual([tied, tied, '3']);
  });
});

describe('the schedule', () => {
  it('writes every game as a filterable row inside its slot and day', () => {
    expect(schedule.match(/data-fest-game="/g)?.length).toBe(FILE.games.length);
    expect(schedule.match(/data-fest-slot=""/g)?.length).toBe(new Set(FILE.games.map((g) => g.startUtc)).size);
    expect(schedule.match(/data-fest-day=""/g)?.length).toBe(3);
    // A pool game names both its teams for the filter.
    const pg = FILE.games.find((g) => g.kind === 'pool')!;
    const slugs = pg.sides.map((s) => FILE.teams.find((t) => t.id === s.teamId)!.slug).join(' ');
    expect(schedule).toContain(`data-fest-game="${slugs}"`);
  });
});

describe('club and team pages', () => {
  it('the HTC page links its club page on this site and has a Follow-all control', () => {
    expect(htc).toContain('href="/clubs/htc"');
    expect(stripTags(htc)).toContain('Club page on this site');
    expect(stripTags(htc)).toMatch(/Follow its team/);
  });

  it('/festival/clubs puts the California clubs first', () => {
    const text = stripTags(clubs);
    expect(text.indexOf('Northern California')).toBeLessThan(text.indexOf('Southern California'));
    expect(text.indexOf('Southern California')).toBeLessThan(text.indexOf('Every other club'));
  });

  it('a team page marks its own row in the pool table, lights its division tab and has a Follow control', () => {
    expect(team).toContain('class="relative sx-self"');
    expect(team).toMatch(/<a class="sx-tab" aria-current="true" href="\/festival\/u16">/);
    expect(stripTags(team)).toContain('saved in this browser only');
  });
});

describe('the layout', () => {
  it('renders the marks stylesheet and its children', () => {
    const html = render(createElement(FestivalLayout as never, { children: createElement('p', null, 'child') } as never));
    expect(html).toContain('@layer base{[data-fest-team]{--sx-fest-pin:none}');
    expect(html).toContain('<p>child</p>');
  });

  it('hides the tab bar and footer below the 48rem breakpoint (owner ask: on a phone they read as the festival’s)', () => {
    const html = render(createElement(FestivalLayout as never, { children: null } as never));
    expect(html).toContain('@media not all and (min-width:48rem){.sx-tabbar,.sx-foot{display:none}');
    expect(html).toContain('body{padding-bottom:calc(2rem + env(safe-area-inset-bottom))}');
  });
});
