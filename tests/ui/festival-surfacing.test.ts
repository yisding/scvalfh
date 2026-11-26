/**
 * How the rest of the site leads to the National Hockey Festival's pages (DESIGN §35.8): the home page's notice
 * (components/home/FestivalNotice.tsx: a section head with where and when and one link to /festival, shown only
 * while the build instant is within a week before the first day and three days after the last), the More sheet's
 * row, and the link from each /clubs/<slug> page whose club is at the festival (festival-clubs.json `siteClub`).
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import ClubPage from '../../app/clubs/[slug]/page';
import PrivacySection from '../../components/about/sections/PrivacySection';
import FestivalNotice, { festivalDates, festivalNoticeMeta, festivalNoticeShown } from '../../components/home/FestivalNotice';
import { MORE_LINKS } from '../../components/layout/BottomTabBar';
import { festivalClubs, getFestival } from '../../lib/festival/festival';
import { getClubSlugs } from '../../lib/players/clubs';
import { textOf } from './html-text';

const { tournament } = getFestival();

describe('the festival notice on /', () => {
  it('says where and when from the festival file', () => {
    expect(festivalNoticeMeta(tournament)).toBe('Naples, Fla. · Nov 26–28');
    expect(festivalDates('2026-11-30', '2026-12-02')).toBe('Nov 30–Dec 2');
    expect(festivalDates('2026-11-26', '2026-11-26')).toBe('Nov 26');
  });

  it('is up from the venue’s midnight a week before the first day to the end of the third day after the last', () => {
    // 2026-11-19T00:00 Eastern is 05:00Z; 2026-12-01 ends at 2026-12-02T05:00Z.
    expect(festivalNoticeShown('2026-11-19T04:59:59Z', tournament)).toBe(false);
    expect(festivalNoticeShown('2026-11-19T05:00:00Z', tournament)).toBe(true);
    expect(festivalNoticeShown('2026-11-26T15:00:00Z', tournament)).toBe(true);
    expect(festivalNoticeShown('2026-12-02T04:59:59Z', tournament)).toBe(true);
    expect(festivalNoticeShown('2026-12-02T05:00:00Z', tournament)).toBe(false);
  });

  it('renders a section head with one link to /festival during the event, and nothing outside its window', () => {
    const html = renderToStaticMarkup(createElement(FestivalNotice, { now: '2026-11-26T15:00:00Z' }));
    expect(html).toMatch(/^<section class="sx-section" data-first="" data-festival-notice="">/);
    expect(html).toMatch(/<h2[^>]*>National Hockey Festival<\/h2>/);
    expect(html).toContain('href="/festival"');
    expect(textOf(html)).toContain('Results and brackets');
    expect(html).not.toMatch(/sx-band|bg-/);
    expect(renderToStaticMarkup(createElement(FestivalNotice, { now: '2027-01-01T00:00:00Z' }))).toBe('');
  });
});

describe('the More sheet', () => {
  it('lists the festival once, after History, as a plain sheet row', () => {
    const rows = MORE_LINKS.map((l) => l.href);
    expect(rows.filter((h) => h === '/festival')).toHaveLength(1);
    expect(rows.indexOf('/festival')).toBe(rows.indexOf('/history/2025-26') + 1);
    expect(MORE_LINKS.find((l) => l.href === '/festival')).toEqual({ href: '/festival', label: 'Festival' });
  });
});

describe('the /clubs/<slug> link to the club’s festival page', () => {
  const linked = (html: string) => [...html.matchAll(/href="\/festival\/clubs\/([a-z0-9-]+)"[^>]*>([^<]*)</g)].map((m) => [m[1], m[2]]);
  const render = async (slug: string) => renderToStaticMarkup(await ClubPage({ params: Promise.resolve({ slug }) } as never));

  it('links each site club the festival file maps to it, and no other', async () => {
    const mapped = new Set(festivalClubs().flatMap((c) => (c.siteClub ? [c.siteClub] : [])));
    expect([...mapped].sort()).toEqual(['hayward-hawks', 'htc', 'norcal-impact', 'sf-hawks']);
    for (const slug of getClubSlugs()) {
      const links = linked(await render(slug));
      expect(links.length > 0, slug).toBe(mapped.has(slug));
    }
    expect(linked(await render('sf-hawks'))).toEqual([['san-francisco-hawks', 'At the National Hockey Festival']]);
  });

  // Spec §3 (b): the California club first, so a San Diego parent's first tap is HTC CA U19, not the East Coast
  // U16 team (A–Z put "HTC" first).
  it('names both of HTC’s festival clubs, its California team’s first, then its East Coast team’s', async () => {
    expect(linked(await render('htc'))).toEqual([
      ['htc-ca', 'HTC CA at the National Hockey Festival'],
      ['htc', 'HTC at the National Hockey Festival'],
    ]);
  });
});

describe('the privacy copy on /about', () => {
  it('counts the followed festival teams among what the browser stores', () => {
    const text = textOf(renderToStaticMarkup(createElement(PrivacySection))).replace(/\s+/g, ' ');
    expect(text).toContain('This site stores exactly five things, all only in your browser:');
    expect(text).toContain('the region you chose (Northern or Southern California), and the National Hockey Festival teams you follow.');
  });
});
