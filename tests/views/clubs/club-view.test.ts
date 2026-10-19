/**
 * views/clubs/club-view.ts and the clubs routes (/clubs, /clubs/[slug]), rendered (SPEC §1.1j2, DESIGN §17).
 *
 * The pages make promises a test can hold them to:
 *   - privacy: only players on the tracked varsity rosters are named, by the roster's spelling, and nothing the data file
 *     keeps but never renders (a quote, a basis, a confidence) reaches a page: checked with scripts/ci/copy/copy-rules.ts
 *     `affiliationLeaks`, the rule assert-copy applies to the build;
 *   - honesty: a tie that is only listed is never worded as current, and every row links the pages it rests on, each
 *     labelled by its kind and host, never by its path;
 *   - order: regions in CLUB_REGIONS order, clubs in lib/datasets/clubs.ts' display order (DESIGN §17.5), players current
 *     first, then by school and name.
 *
 * The data is hand research that changes only with a new sweep (tests/data/clubs.test.ts), so the words pinned here are
 * pinned to it: when a sweep lands, re-read the pages and update them together. The suites share
 * tests/support/clubs-view.ts.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import AboutPage from '@/app/about/page';
import ClubPage, { generateMetadata, generateStaticParams } from '@/app/clubs/[slug]/page';
import ClubsPage, { metadata as clubsMetadata } from '@/app/clubs/page';
import TeamPage from '@/app/teams/[slug]/page';
import { getClubSlugs, getClubs } from '@/lib/datasets/clubs';
import { affiliationLeaks } from '@/scripts/ci/copy/copy-rules';
import { PUBLIC_TERMS } from '@/scripts/ci/copy/public-terms';
import { textOf } from '@/tests/support/html-text';
import { file, club, views } from '@/tests/support/clubs-view';

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
    expect(levels).toEqual([1, ...Array(11).fill(2)]);
    // Each region's section carries its half of the site's scope, under the region switcher.
    expect(index).toContain('data-region-option="socal"');
    expect(index).toMatch(/<section aria-labelledby="san-francisco" data-region-scope="norcal"/);
    expect(index).toMatch(/<section aria-labelledby="san-diego" data-region-scope="socal"/);
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
    expect(htc).toContain('La Jolla, CA (HTC California) · Founded 2009');
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
      // The aria-hidden cells that finish a short last row (components/ui/GridRowFiller.tsx) are not rows.
      const items = [...players.matchAll(/<li\b(?![^>]*aria-hidden)[^>]*>([\s\S]*?)<\/li>/g)].map((m) => m[1]);
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
      const items = [...programs.matchAll(/<li\b(?![^>]*aria-hidden)[^>]*>([\s\S]*?)<\/li>/g)].map((m) => m[1]);
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
    expect(await descriptionOf('htc')).toContain('30 players on this site’s varsity rosters are tied to it, each with a source. Unofficial and incomplete.');
    expect(await descriptionOf('golden-gate-rippers')).toContain('1 player on this site’s varsity rosters is tied to it, with a source. Unofficial and incomplete.');
    expect(await descriptionOf('sf-hawks')).toContain('32 players on this site’s varsity rosters are tied to it, each with a source.');
    expect(await descriptionOf('pac-heights')).toContain('No player on this site’s varsity rosters is tied to it by a public page we found.');
    expect(await descriptionOf('d-city')).toContain('4 players on this site’s varsity rosters are tied to it, each with a source.');
    expect(await descriptionOf('roseville-fhc')).toContain('No player on this site’s varsity rosters is tied to it by a public page we found.');
    expect(await descriptionOf('chico-hotshots')).toBe(
      'Chico Hotshots Field Hockey Club, Chico. Chico club that lists U12, U14, U16, U19 and adult teams for spring 2026, the latest season it has posted. 5 players on this site’s varsity rosters are tied to it, each with a source. Unofficial and incomplete.',
    );
    for (const slug of getClubSlugs()) expect(await descriptionOf(slug), slug).toMatch(/ Unofficial and incomplete\.$/);
  });

  it('shows no quote or basis from the data file on any clubs page or team page with a club line', async () => {
    const pages: Array<[string, string]> = [['/clubs', renderIndex()]];
    for (const slug of getClubSlugs()) pages.push([`/clubs/${slug}`, await renderClub(slug)]);
    const teams = [...new Set(file.affiliations.map((a) => a.teamSlug))];
    expect(teams).toHaveLength(48);
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
