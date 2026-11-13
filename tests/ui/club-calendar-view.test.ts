/**
 * `components/club-calendar/calendar-view.ts` and /club-calendar over the committed
 * data/club-events.json (DESIGN §34), plus the links into it from /clubs and the club pages.
 *
 * The page's promises: an event whose next dates are not posted is never given dates; the split
 * between coming up and earlier is the day the list was read, which the page prints; a quote never
 * reaches the page; every event is an anchor a club page can link.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import ClubCalendarPage, { generateMetadata } from '../../app/club-calendar/page';
import ClubPage from '../../app/clubs/[slug]/page';
import ClubsPage from '../../app/clubs/page';
import { buildClubCalendarView, clubEventLines, eventRow, shortSpan, spanWords } from '../../components/club-calendar/calendar-view';
import { getClubEvents, getClubEventsFile } from '../../lib/players/club-events';
import { lastDay } from '../../lib/players/club-events-schema';
import { getClubSlugs } from '../../lib/players/clubs';

const file = getClubEventsFile();
const html = renderToStaticMarkup(createElement(ClubCalendarPage));

async function renderClub(slug: string): Promise<string> {
  return renderToStaticMarkup(await ClubPage({ params: Promise.resolve({ slug }) } as never));
}

describe('date words', () => {
  it('writes one day, a span within a month, across months and across years', () => {
    expect(spanWords('2026-12-05', null)).toBe('Sat Dec 5, 2026');
    expect(spanWords('2026-12-05', '2026-12-06')).toBe('Sat Dec 5 – Sun Dec 6, 2026');
    expect(spanWords('2026-12-28', '2027-01-03')).toBe('Mon Dec 28, 2026 – Sun Jan 3, 2027');
    expect(shortSpan('2026-05-23', '2026-05-25')).toBe('May 23–25, 2026');
    expect(shortSpan('2026-04-12', '2026-05-10')).toBe('Apr 12 – May 10, 2026');
    expect(shortSpan('2026-04-12', null)).toBe('Apr 12, 2026');
  });
});

describe('the calendar view', () => {
  const view = buildClubCalendarView();

  it('puts every event in exactly one place', () => {
    const placed = [...view.months.flatMap((m) => m.events), ...view.undated, ...view.earlier].map((e) => e.id);
    expect(placed.sort()).toEqual(file.events.map((e) => e.id).sort());
  });

  it('splits on the day the list was read, not the build’s clock', () => {
    for (const e of getClubEvents()) {
      const last = lastDay(e);
      const inEarlier = view.earlier.some((r) => r.id === e.id);
      expect(inEarlier, e.id).toBe(last !== null && last < file.capturedAt);
    }
  });

  it('never gives dates to an event whose dates are not posted', () => {
    for (const row of view.undated) {
      expect(row.when).toBe('Dates not announced yet');
      expect(row.dateTime).toBeNull();
    }
  });

  it('orders the months and labels each link by what it is', () => {
    const ids = view.months.map((m) => m.id);
    expect([...ids].sort()).toEqual(ids);
    for (const e of getClubEvents()) {
      const row = eventRow(e);
      expect(row.links[0]).toEqual({ label: 'Event page', href: e.url });
      for (const l of row.links) expect(['Event page', 'Fixtures and results', 'Register']).toContain(l.label);
      expect(new Set([...row.links, ...row.sources].map((l) => l.href)).size).toBe(row.links.length + row.sources.length);
    }
  });
});

describe('/club-calendar, rendered', () => {
  it('prints the day the list was read, a heading per month and an anchor per event', () => {
    const view = buildClubCalendarView();
    expect(html).toContain(`As listed ${view.checkedOn}`);
    for (const m of view.months) expect(html).toContain(`id="month-${m.id}"`);
    for (const e of file.events) expect(html, e.id).toContain(`id="${e.id}"`);
    expect(html).toContain('id="where-posted"');
    for (const r of file.resources) expect(html).toContain(`href="${r.url.replace(/&/g, '&amp;')}"`);
  });

  it('shows no maintainer quote', () => {
    for (const e of file.events) {
      for (const s of e.sources) {
        if (s.quote.length >= 40) expect(html, e.id).not.toContain(s.quote.replace(/&/g, '&amp;'));
      }
    }
  });

  it('describes itself honestly', () => {
    const meta = generateMetadata();
    expect(meta.title).toBe('Club calendar');
    expect(String(meta.description)).toMatch(/ Unofficial and incomplete\.$/);
  });
});

describe('the links in', () => {
  it('/clubs links the calendar', () => {
    expect(renderToStaticMarkup(createElement(ClubsPage))).toContain('href="/club-calendar"');
  });

  it('a club page lists each event it hosts or enters, linking its anchor', async () => {
    for (const slug of getClubSlugs()) {
      const lines = clubEventLines(slug);
      const page = await renderClub(slug);
      if (lines.length === 0) {
        expect(page, slug).not.toContain('id="events"');
        continue;
      }
      expect(page, slug).toContain('id="events"');
      for (const l of lines) expect(page, slug).toContain(`href="/club-calendar#${l.id}"`);
    }
  });
});
