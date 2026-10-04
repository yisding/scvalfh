/**
 * `components/clubs/club-view.ts` and the clubs routes (/clubs, /clubs/[slug]) over the committed
 * data/clubs.json, data/rosters.json and data/rosters-enrichment.json (SPEC §1.1j2, DESIGN §17).
 *
 * The pages make promises a test can hold them to:
 *   - privacy: only players on the tracked varsity rosters are named, by the roster's spelling, and
 *     nothing the data file keeps but never renders (a quote, a basis, a confidence) reaches a
 *     page — checked with scripts/copy-rules.ts `affiliationLeaks`, the rule assert-copy applies
 *     to the build;
 *   - honesty: a tie that is only listed is never worded as current, and every row links the
 *     pages it rests on, each labelled by its kind and host, never by its path;
 *   - order: regions in CLUB_REGIONS order, clubs in lib/clubs.ts' display order (DESIGN §17.5),
 *     players current first, then by school and name.
 *
 * The data is hand research that changes only with a new sweep (tests/clubs-file.test.ts), so the
 * words pinned below (status lines, link labels, counts) are pinned to it: when a sweep lands,
 * re-read the pages and update them together.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import AboutPage from '../../app/about/page';
import ClubPage, { generateMetadata, generateStaticParams } from '../../app/clubs/[slug]/page';
import ClubsPage, { metadata as clubsMetadata } from '../../app/clubs/page';
import TeamPage from '../../app/teams/[slug]/page';
import {
  REGION_WORDS,
  buildClubPageView,
  buildClubsIndexView,
  countLine,
  sourceLabel,
  sourceName,
  statusWords,
  type ClubPageView,
} from '../../components/clubs/club-view';
import {
  clubDisplayName,
  getClub,
  getClubAffiliations,
  getClubSlugs,
  getClubs,
  getClubsFile,
  type Club,
  type ClubAffiliation,
} from '../../lib/clubs';
import { getEnrichedTeamRoster, getRosters } from '../../lib/rosters';
import { getTeamBySlug } from '../../lib/teams';
import { affiliationLeaks } from '../../scripts/copy-rules';
import { PUBLIC_TERMS } from '../../scripts/public-terms';
import { textOf } from './html-text';

const file = getClubsFile();
const club = (slug: string): Club => getClub(slug)!;
/** The affiliation for `name` at `slug`. */
const tie = (name: string, slug: string): ClubAffiliation =>
  file.affiliations.find((a) => a.fullName === name && a.club === slug)!;
const views: Array<{ slug: string; view: ClubPageView }> = getClubSlugs().map((slug) => ({
  slug,
  view: buildClubPageView(slug)!,
}));
const viewOf = (slug: string) => views.find((v) => v.slug === slug)!.view;

async function renderClub(slug: string): Promise<string> {
  return renderToStaticMarkup(await ClubPage({ params: Promise.resolve({ slug }) } as never));
}
async function renderTeam(slug: string): Promise<string> {
  return renderToStaticMarkup(await TeamPage({ params: Promise.resolve({ slug }) } as never));
}
const renderIndex = () => renderToStaticMarkup(createElement(ClubsPage));

/** Heading levels in document order. */
const headings = (html: string) => [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));

/** `<section aria-labelledby="id"…>` up to the next section (sections are not nested on these pages). */
function sectionOf(html: string, id: string): string {
  const start = html.indexOf(`<section aria-labelledby="${id}"`);
  if (start < 0) return '';
  const next = html.indexOf('<section', start + 1);
  return html.slice(start, next < 0 ? html.length : next);
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
const squashWs = (t: string) => t.replace(/\s+/g, '');

describe('status words (DESIGN §17.3)', () => {
  it('words every pinned tie as the table says', () => {
    const PINS: Array<[string, string, string]> = [
      ['Storey Lewis', 'sf-hawks', 'Current, as of Aug 27, 2026'],
      ['Caitlyn Hughes', 'sf-hawks', 'Current, as of Aug 27, 2026'],
      ['Clara Brunello', 'sf-hawks', 'Current, as of Jul 8, 2026'],
      ['Isabella Bjork', 'fly-fhc', 'Current, as of 2026'],
      ['Gigi Colant', 'sf-hawks', 'Current, 2025-26 season'],
      ['Dylan Powell', 'sf-hawks', 'Current'],
      ['Melanie Henderson', 'fly-fhc', 'Earlier, 2019–2022'],
      ['Melanie Henderson', 'lightning', 'Earlier, 2015–2018'],
      ['Alex Pires', 'infinity', 'Earlier, Jul 18, 2025'],
      ['Hailey Moncada', 'infinity', 'Earlier, 2024-25 season'],
      ['Riya Mehrotra', 'fly-fhc', 'Listed by NCSA, 2025'],
      // Her NCSA page and one of her two MaxPreps URLs are undated; the other is dated Oct 19, 2025.
      ['Gabrielle Moll', 'fly-fhc', 'Listed by MaxPreps, Oct 19, 2025'],
      ['Emma Traverso', 'fly-fhc', 'Listed by NCSA, 2025'],
      // No source is dated "2025", so the first one (NCSA) lists it, not the dated Stick Together page.
      ['Brooklyn Barnard', 'fly-fhc', 'Listed by NCSA, 2025'],
      ['Colette Boyd', 'infinity', 'Listed by the Gilroy Dispatch, Jul 18, 2025'],
      ['Ruhee Bhatnagar', 'lightning', 'Listed by NCSA, 2024-25 season'],
      ['Kira Kelly', 'd-city', 'Listed by the NFHCA, Aug 28, 2025'],
      ['Amelia Zedonis', 'd-city', 'Listed by the NFHCA, Aug 28, 2025'],
      ['Kate Loscutoff', 'd-city', 'Earlier, 2024'],
      ['Lilah Letcher', 'chico-hotshots', 'Current, as of Sep 29, 2026'],
      ['Kate Panighetti', 'chico-hotshots', 'Current, as of May 20, 2026'],
    ];
    for (const [name, slug, words] of PINS) expect(statusWords(tie(name, slug), club(slug)), `${name} @ ${slug}`).toBe(words);
  });

  it('covers the shapes the data does not use yet: a month, a current range, an undated listing', () => {
    const base = tie('Riya Mehrotra', 'fly-fhc');
    const fly = club('fly-fhc');
    expect(statusWords({ ...base, status: 'current', asOf: '2025-10' }, fly)).toBe('Current, as of Oct 2025');
    expect(statusWords({ ...base, status: 'current', asOf: '2025-2026' }, fly)).toBe('Current, 2025–2026');
    expect(statusWords({ ...base, status: 'past', asOf: null }, fly)).toBe('Earlier');
    expect(statusWords({ ...base, status: 'unknown', asOf: null }, fly)).toBe('Listed by NCSA; no date given');
  });

  it('never words a listed or earlier tie as current, nor a current one as listed', () => {
    for (const a of file.affiliations) {
      const words = statusWords(a, club(a.club));
      if (a.status === 'current') expect(words, a.fullName).not.toMatch(/listed|not/i);
      else expect(words, `${a.fullName} @ ${a.club}`).not.toMatch(/^Current/);
      if (a.status === 'unknown') expect(words, a.fullName).toMatch(/^Listed by /);
      if (a.status === 'past') expect(words, a.fullName).toMatch(/^Earlier/);
    }
  });
});

describe('source labels: the kind and the host, never the path', () => {
  it('names a page by whose site it is on', () => {
    // Bridget Schilb's earlier Fly club rests on NorCal Impact's page for her.
    const page = tie('Bridget Schilb', 'fly-fhc').sources[0];
    expect(sourceLabel(page, club('fly-fhc'))).toBe('NorCal Impact site');
    // The same page on NorCal Impact's own club page is "club site".
    const bridget = tie('Bridget Schilb', 'norcal-impact').sources.find((s) => s.url === page.url)!;
    expect(sourceLabel(bridget, club('norcal-impact'))).toBe('club site');
    // Ruhee Bhatnagar's Lightning roster (an older sub-season than the club's rosterPages).
    const ruhee = tie('Ruhee Bhatnagar', 'lightning').sources.find((s) => s.kind === 'club-site')!;
    expect(sourceLabel(ruhee, club('lightning'))).toBe('club roster');
    // A host no club record names is printed as it is. No tie in the file rests on such a page any
    // more (Fly's old about page on sanjosefly.com named no player and was dropped), so the rule is
    // held on a source built here.
    const oldFly = { url: 'https://sanjosefly.com/about-fly/', kind: 'club-site' } as const;
    expect(sourceLabel(oldFly, club('fly-fhc'))).toBe('sanjosefly.com');
    expect(sourceName(oldFly, club('fly-fhc'))).toBe('sanjosefly.com');
  });

  it('labels the EAL-area ties, and reads a shared host (Google Sites, TeamLinkt) by its site, not its host', () => {
    const labels = (slug: string) => viewOf(slug).groups.flatMap((g) => g.rows).map((r) => [r.name, r.sources.map((s) => s.label)]);
    expect(labels('d-city')).toEqual([
      ['Kira Kelly', ['NFHCA']],
      ['Kate Loscutoff', ['NCSA profile']],
      ['Amelia Zedonis', ['NFHCA']],
    ]);
    expect(labels('chico-hotshots')).toEqual([
      ['Lilah Letcher', ['MaxPreps profile']],
      ['Kate Panighetti', ['MaxPreps profile']],
    ]);
    // Davis High's Google Site is on D-City's host but not on D-City's site.
    const dcity = club('d-city');
    expect(sourceLabel({ url: 'https://sites.google.com/djusd.net/dhsfieldhockey/home', kind: 'club-site' }, dcity)).toBe('sites.google.com');
    expect(sourceLabel({ url: 'https://sites.google.com/view/dcityhockeyclub/home', kind: 'club-site' }, dcity)).toBe('club site');
    // Another TeamLinkt league, or a TeamLinkt page outside the club's slug, is not Chico Hotshots' site.
    const chico = club('chico-hotshots');
    expect(sourceLabel({ url: 'https://leagues.teamlinkt.com/chicohotshotsfieldhockey/Divisions', kind: 'club-site' }, chico)).toBe('club site');
    expect(sourceLabel({ url: 'https://leagues.teamlinkt.com/someotherleague/Divisions', kind: 'club-site' }, chico)).toBe('leagues.teamlinkt.com');
    expect(sourceLabel({ url: 'https://leagues.teamlinkt.com/leagues/NewsItem/34623/39251', kind: 'club-site' }, chico)).toBe('leagues.teamlinkt.com');
  });

  it('names the NFHCA watchlists and MAX Field Hockey pages by their outlet', () => {
    const hughes = tie('Caitlyn Hughes', 'sf-hawks');
    const label = (host: string) => sourceLabel(hughes.sources.find((s) => s.url.includes(host))!, club('sf-hawks'));
    expect(label('nfhca.org/')).toBe('NFHCA');
    expect(label('maxfh.longstreth.com')).toBe('MAX Field Hockey');
    // Two watchlists (2025 and 2026) on one row read apart.
    const hazel = viewOf('sf-hawks').groups[0].rows.find((r) => r.name === 'Hazel Stang')!;
    expect(hazel.sources.map((s) => s.label).filter((l) => l.startsWith('NFHCA'))).toEqual(['NFHCA', 'NFHCA (2)']);
  });

  it('every label on every club page is a closed-set word, another club’s site, or the bare host', () => {
    const fixed = new Set([
      'SportsRecruits profile',
      'SportsRecruits team page',
      'NCSA profile',
      'Hudl profile',
      'FieldLevel profile',
      'MaxPreps profile',
      'MaxPreps roster',
      'MaxPreps page',
      'club roster',
      'club site',
      'Stick Together',
      'Gilroy Dispatch',
      'SCVAL',
      'NFHCA',
      'MAX Field Hockey',
      'Saint Francis athletics',
      ...getClubs().flatMap((c) => [`${clubDisplayName(c)} site`, `${clubDisplayName(c)} roster`]),
    ]);
    let checked = 0;
    for (const { slug, view } of views) {
      for (const row of view.groups.flatMap((g) => g.rows)) {
        for (const s of row.sources) {
          const label = s.label.replace(/ \(\d+\)$/, '');
          const host = new URL(s.url).hostname.replace(/^www\./, '');
          expect(fixed.has(label) || label === host, `${slug} / ${row.name}: ${s.label} (${s.url})`).toBe(true);
          // A label is never read from a path, so no name in a slug (a coach's bio page) reaches one.
          expect(s.label, `${slug} / ${row.name}`).not.toMatch(/leaf|huynh/i);
          checked += 1;
        }
      }
    }
    expect(checked).toBe(file.affiliations.reduce((n, a) => n + new Set(a.sources.map((s) => s.url)).size, 0));
  });
});

describe('buildClubsIndexView (/clubs)', () => {
  const index = buildClubsIndexView();
  const rows = index.regions.flatMap((r) => r.clubs);

  it('groups the clubs by region, in CLUB_REGIONS order, each club once in display order', () => {
    expect(index.regions.map((r) => r.id)).toEqual(['san-francisco', 'south-bay', 'east-bay', 'marin', 'sacramento', 'north-state', 'elsewhere']);
    expect(index.regions.map((r) => r.heading)).toEqual(['San Francisco', 'South Bay', 'East Bay', 'Marin', 'Sacramento area', 'North State', 'Elsewhere']);
    expect(index.regions.map((r) => r.meta)).toEqual(['2 clubs', '7 clubs', '2 clubs', '1 club', '2 clubs', '1 club', '1 club']);
    expect(rows.map((r) => r.slug)).toEqual(getClubSlugs());
    expect(rows.map((r) => r.slug)).toEqual(getClubs().map((c) => c.slug));
    for (const r of index.regions) for (const c of r.clubs) expect(club(c.slug).region, c.slug).toBe(r.id);
  });

  it('names the searched areas that hold no club', () => {
    expect(index.regionsWithoutClubs).toEqual(['Peninsula', 'Central Coast']);
    expect(index.regionsWithoutClubsSentence).toBe('This list has no club based on the Peninsula or the Central Coast.');
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
    expect(line('sf-hawks')).toBe('31 current players');
    expect(line('norcal-impact')).toBe('22 current players');
    expect(line('fly-fhc')).toBe('10 players: 2 current, 8 earlier or not known to be current');
    expect(line('infinity')).toBe('8 players: 1 current, 7 earlier or not known to be current');
    expect(line('lightning')).toBe('3 players: 1 current, 2 earlier or not known to be current');
    expect(line('htc')).toBe('1 current player');
    expect(line('pac-heights')).toBe('No player from these rosters found');
    expect(line('d-city')).toBe('3 players, all earlier or not known to be current');
    expect(line('roseville-fhc')).toBe('No player from these rosters found');
    expect(line('chico-hotshots')).toBe('2 current players');
    expect(rows.find((r) => r.slug === 'd-city')!.subline).toBe('D-City Field Hockey Club · Davis');
    expect(rows.find((r) => r.slug === 'd-city')!.schools).toEqual(['Davis']);
    expect(rows.find((r) => r.slug === 'chico-hotshots')!.subline).toBe('Chico Hotshots Field Hockey Club · Chico');
    expect(rows.find((r) => r.slug === 'chico-hotshots')!.schools).toEqual(['Pleasant Valley']);
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
    expect([index.playerCount, index.schoolCount, index.clubCount, index.clubsWithPlayers]).toEqual([71, 24, 16, 8]);
    expect(index.lede).toBe(
      `Which youth clubs players on this site’s ${getRosters().teams.length} varsity rosters play for, or played for, according to public pages that name both. 71 players from 24 schools are tied to 8 of these 16 clubs, the most to SF Hawks (31) and NorCal Impact (22).`,
    );
    expect(index.capturedOn).toBe('Oct 3, 2026');
    expect(index.currentSeasons).toBe('2025-26 or 2026-27');
  });
});

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
    expect(riya.facts).toEqual(['Black - Advanced']); // no grade anywhere, so none is printed
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
    expect(viewOf('htc').regionLabel).toBeNull(); // "Elsewhere" says nothing
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
    expect(viewOf('chico-hotshots').groups.map((g) => g.heading)).toEqual(['Current']);
    expect(viewOf('chico-hotshots').groups[0].rows.map((r) => [r.name, r.facts, r.status])).toEqual([
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

describe('the clubs routes, rendered', () => {
  it('prerenders exactly the clubs of the file, and 404s anything else at no metadata cost', async () => {
    expect(generateStaticParams()).toEqual(getClubSlugs().map((slug) => ({ slug })));
    await expect(renderClub('nope')).rejects.toThrow();
    const meta = await generateMetadata({ params: Promise.resolve({ slug: 'nope' }) } as never);
    expect(meta.title).toBe('Club not found');
  });

  it('every page has one h1, skips no heading level, and labels its sections', async () => {
    for (const slug of getClubSlugs()) {
      const html = await renderClub(slug);
      const levels = headings(html);
      expect(levels.filter((l) => l === 1), slug).toHaveLength(1);
      expect(levels[0], slug).toBe(1);
      levels.forEach((l, i) => {
        if (i > 0) expect(l, `${slug}: h${levels[i - 1]} then h${l}`).toBeLessThanOrEqual(levels[i - 1] + 1);
      });
      for (const id of ['players', 'sources']) expect(html, `${slug} #${id}`).toContain(`<section aria-labelledby="${id}"`);
      expect(html.includes('aria-labelledby="programs"'), slug).toBe(club(slug).programs.length > 0);
      expect(html, slug).toContain('href="/clubs"');
      expect(html, slug).toContain('href="/clubs#how-matched"');
    }
    const index = renderIndex();
    const levels = headings(index);
    expect(levels).toEqual([1, 2, 2, 2, 2, 2, 2, 2, 2]);
    expect(index).toContain('<section aria-labelledby="how-matched"');
    const how = textOf(sectionOf(index, 'how-matched'));
    expect(how).toContain('The Sacramento area and the North State were not searched for every club, so other clubs may be based there.');
    expect(how).not.toMatch(/no club based (in|on) the (Sacramento area|North State)/);
    for (const slug of getClubSlugs()) expect(index).toContain(`href="/clubs/${slug}"`);
  });

  it('puts both names in the one h1, apart, and the website in a pill', async () => {
    const html = await renderClub('sf-hawks');
    const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)![1];
    expect(textOf(h1).trim()).toBe('SF Hawks San Francisco Youth Field Hockey Club');
    expect(html).toMatch(/<a href="https:\/\/sfyouthfieldhockey\.com\/" target="_blank" rel="noopener noreferrer" class="text-accent hover:underline sx-pill">SF Hawks website/);
    expect(textOf(html)).toContain('San Francisco · Founded 2017');
    const htc = textOf(await renderClub('htc'));
    expect(htc).toContain('Madison, CT (HTC California trains in La Jolla, CA) · Founded 2009');
    expect(textOf(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(await renderClub('performance-fh'))![1]).trim()).toBe('Performance Field Hockey');
  });

  it('labels the two player groups only when both exist', async () => {
    const hawks = sectionOf(await renderClub('sf-hawks'), 'players');
    const fly = sectionOf(await renderClub('fly-fhc'), 'players');
    expect(hawks).not.toMatch(/<h3/);
    expect([...fly.matchAll(/<h3[^>]*>([^<]+)<\/h3>/g)].map((m) => m[1])).toEqual(['Current', 'Earlier, or not known to be current']);
  });

  it('renders each player row as its view and nothing more, with sources named for the player', async () => {
    for (const { slug, view } of views) {
      if (view.groups.length === 0) continue;
      const players = sectionOf(await renderClub(slug), 'players');
      const items = [...players.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((m) => m[1]);
      const rows = view.groups.flatMap((g) => g.rows);
      expect(items, slug).toHaveLength(rows.length);
      rows.forEach((row, i) => {
        const expected = [
          row.name,
          `${row.school.name} roster`,
          ...row.facts.map((f) => `· ${f}`),
          row.status,
          'Sources:',
          ...row.sources.map((s, j) => `${j ? '· ' : ''}${row.name}: ${s.label} ↗ (opens in a new tab)`),
        ].join(' ');
        expect(squashWs(textOf(items[i])), `${slug} / ${row.name}`).toBe(squashWs(expected));
        expect(items[i], `${slug} / ${row.name}`).toContain(`href="${row.school.href}"`);
        for (const s of row.sources) {
          expect(items[i], `${slug} / ${row.name}`).toContain(`<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer"`);
          expect(items[i], `${slug} / ${row.name}`).toContain(`<span><span class="sr-only">${esc(row.name)}: </span>${esc(s.label)}</span>`);
        }
        // No confidence word in a row (a club team like "High Performance" is a fact, not a mark).
        expect(textOf(items[i]), `${slug} / ${row.name}`).not.toMatch(/confidence|\bmedium\b/i);
      });
    }
  });

  it('links a shared program page once, under the list, under a name of its own', async () => {
    for (const { slug, view } of views) {
      if (view.programs.length === 0) continue;
      const html = await renderClub(slug);
      const programs = sectionOf(html, 'programs');
      const items = [...programs.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((m) => m[1]);
      expect(items, slug).toHaveLength(view.programs.length);
      view.programs.forEach((p, i) => {
        expect((items[i].match(/<a /g) ?? []).length, `${slug} / ${p.name}`).toBe(p.source ? 1 : 0);
        if (p.source) expect(items[i], `${slug} / ${p.name}`).toContain(`<span><span class="sr-only">${esc(p.name)}: </span>${esc(p.source.label)}</span>`);
      });
      // Every link in the section: the rows' own, then the shared one after the list, each once.
      const links = [...programs.matchAll(/<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => ({ url: m[1], name: textOf(m[2]).replace(/\s+/g, ' ').trim() }));
      const shared = view.programsSource;
      expect(links.length, slug).toBe(view.programs.filter((p) => p.source).length + (shared ? 1 : 0));
      expect(new Set(links.map((l) => l.name)).size, slug).toBe(links.length);
      if (shared) {
        const after = programs.slice(programs.lastIndexOf('</ul>'));
        expect(textOf(after).replace(/\s+/g, ' '), slug).toContain(`${shared.lead}: Teams and programs: ${shared.label} ↗ (opens in a new tab)`);
        expect(after, slug).toContain(`<a href="${esc(shared.url)}" target="_blank" rel="noopener noreferrer"`);
        // The same page under "Pages about the club" goes by its plain name, so the two read apart.
        const about = [...sectionOf(html, 'sources').matchAll(/<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
          .filter((m) => m[1] === esc(shared.url))
          .map((m) => textOf(m[2]).replace(/\s+/g, ' ').trim());
        for (const name of about) expect(name, slug).not.toBe(links[links.length - 1].name);
      }
    }
    const fly = textOf(sectionOf(await renderClub('fly-fhc'), 'programs')).replace(/\s+/g, ' ');
    expect(fly).toContain('Listed on the club’s site: Teams and programs: Programs overview');
    expect(fly).not.toContain('club site');
  });

  it('gives a club with no tied player its empty state, and no player list', async () => {
    const html = await renderClub('pac-heights');
    const players = sectionOf(html, 'players');
    expect(textOf(players)).toContain('No player on this site’s varsity rosters is tied to Pac Heights.');
    expect(textOf(players)).toContain('that does not mean none plays for it. Checked Oct 3, 2026.');
    expect(players).not.toContain('<ul');
    expect(textOf(html)).toContain('We found no public roster page naming this club’s players.');
    expect(textOf(players)).toContain('No public page we found ties one of them to this club; that does not mean none plays for it. Checked Oct 3, 2026.');
    for (const slug of ['d-city', 'chico-hotshots']) expect(textOf(await renderClub(slug)), slug).toContain('We found no public roster page naming this club’s players.');
    const rose = textOf(sectionOf(await renderClub('roseville-fhc'), 'players'));
    expect(rose).toContain('No player on this site’s varsity rosters is tied to Roseville FHC.');
    expect(rose).toContain('Checked Oct 4, 2026.');
    expect(textOf(await renderClub('sf-hawks'))).toContain('The club’s own rosters list many more players than this page does.');
  });

  it('says recall is partial on every club page, listed players or not', async () => {
    for (const { slug, view } of views) {
      const players = textOf(sectionOf(await renderClub(slug), 'players'));
      if (view.groups.length === 0) expect(players, slug).toContain('that does not mean none plays for it.');
      else expect(players, slug).toContain(`Recall is partial: a player not listed here may still play for ${view.name}.`);
    }
  });

  it('defines each status word on /clubs#how-matched as the rows use it', () => {
    const how = squashWs(textOf(sectionOf(renderIndex(), 'how-matched')));
    expect(how).toContain(
      squashWs(
        '“Current” means a source from the 2025-26 or 2026-27 club season: a page dated in one of them, a club’s current-players page, or a live recruiting profile that lists the club.',
      ),
    );
    expect(how).toContain(squashWs('“Listed by” means a source names the club without saying whether the player is still with it'));
    expect(how).toContain(squashWs('The date shown is the date or season the sources give for that listing, and such a tie is never shown as current.'));
    // Every listed tie in the file carries a date, so "without a usable date" would contradict them.
    expect(how).not.toContain(squashWs('without a usable date'));
  });

  it('names no player in any page’s metadata', async () => {
    const names = [...new Set(file.affiliations.map((a) => a.fullName))];
    const texts: string[] = [JSON.stringify(clubsMetadata)];
    for (const slug of getClubSlugs()) {
      const meta = await generateMetadata({ params: Promise.resolve({ slug }) } as never);
      expect(meta.title, slug).toBe(club(slug).name);
      texts.push(JSON.stringify(meta));
    }
    for (const text of texts) for (const name of names) expect(text, name).not.toContain(name);
    const descriptionOf = async (slug: string) =>
      (await generateMetadata({ params: Promise.resolve({ slug }) } as never)).description;
    expect(await descriptionOf('htc')).toContain('1 player on this site’s varsity rosters is tied to it, with a source. Unofficial and incomplete.');
    expect(await descriptionOf('sf-hawks')).toContain('31 players on this site’s varsity rosters are tied to it, each with a source.');
    expect(await descriptionOf('pac-heights')).toContain('No player on this site’s varsity rosters is tied to it by a public page we found.');
    expect(await descriptionOf('d-city')).toContain('3 players on this site’s varsity rosters are tied to it, each with a source.');
    expect(await descriptionOf('roseville-fhc')).toContain('No player on this site’s varsity rosters is tied to it by a public page we found.');
    expect(await descriptionOf('chico-hotshots')).toBe(
      'Chico Hotshots Field Hockey Club, Chico. Chico club that lists U12, U14, U16, U19 and adult teams for spring 2026, the latest season it has posted. 2 players on this site’s varsity rosters are tied to it, each with a source. Unofficial and incomplete.',
    );
    for (const slug of getClubSlugs()) expect(await descriptionOf(slug), slug).toMatch(/ Unofficial and incomplete\.$/);
  });

  it('shows no quote or basis from the data file on any clubs page or team page with a club line', async () => {
    const pages: Array<[string, string]> = [['/clubs', renderIndex()]];
    for (const slug of getClubSlugs()) pages.push([`/clubs/${slug}`, await renderClub(slug)]);
    const teams = [...new Set(file.affiliations.map((a) => a.teamSlug))];
    expect(teams).toHaveLength(24);
    for (const slug of teams) pages.push([`/teams/${slug}`, await renderTeam(slug)]);
    for (const [route, html] of pages) expect(affiliationLeaks(html, file, { publicTerms: PUBLIC_TERMS }), route).toEqual([]);
  });

  it('links /clubs from /about’s sources section', () => {
    const html = renderToStaticMarkup(createElement(AboutPage));
    const para = /<p id="clubs-coverage"[^>]*>([\s\S]*?)<\/p>/.exec(html);
    expect(para).not.toBeNull();
    expect(para![1]).toContain('href="/clubs"');
    expect(textOf(para![1])).toContain(`list ${getClubs().length} youth clubs`);
    expect(textOf(para![1])).toContain('the clubs found around these schools');
    expect(textOf(para![1])).toContain('recall is partial');
  });
});
