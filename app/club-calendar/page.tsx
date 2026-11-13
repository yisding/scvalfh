import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import ClubEventList from '../../components/club-calendar/ClubEventList';
import { buildClubCalendarView } from '../../components/club-calendar/calendar-view';
import PageHeader from '../../components/layout/PageHeader';
import { DATA_CORRECTIONS_URL, OG_BASE, ROOT_OG_IMAGE } from '../../components/layout/site';
import RecruitingTabs from '../../components/recruiting/RecruitingTabs';
import ExternalLink from '../../components/ui/ExternalLink';
import SectionHeader from '../../components/ui/SectionHeader';
import { plural } from '../../components/words/plural';
import { HAS_RECRUITING } from '../../lib/sports/current';

/** The page's title, and its og:title too: og:title never carries the site-name suffix (OG_BASE). */
const PAGE_TITLE = 'Club calendar';

/**
 * /club-calendar — "When and where do Northern California club teams play?" (DESIGN §34).
 *
 * The tournaments, league days and national events of data/club-events.json, as their organizers'
 * own pages listed them on the file's `capturedAt` day, which the header prints. It is the club
 * season's page: the high school season ends in November, and the club tournaments run from
 * December to July.
 *
 * Heading outline: the h1, then one h2 per month with an event coming up or under way on the day
 * the list was read (each event an h3), then "Dates not announced yet" (recurring events whose next
 * dates were not posted), "Where club fixtures are posted" (the standing pages: calendars and
 * tournament sites), "Earlier in 2026" (events over by that day, latest first: their results
 * pages), and "How this list is made".
 *
 * It sits under the Clubs tab of the recruiting family's tab row, lit as a club page lights it
 * (`exact={false}`), and is a top-level route rather than /clubs/calendar because /clubs/<slug> is
 * the club pages' family, whose prerendered files are checked against the club slugs exactly
 * (scripts/lib/prerender-expectations.ts). /clubs and every club page with an event link it. Not in
 * the nav (DESIGN §17.6). Field hockey's alone: another sport's build renders it as a 404. Takes the
 * root OG card. Nothing on it is a client component.
 */
export function generateMetadata(): Metadata {
  const view = buildClubCalendarView();
  const description = `Northern California club field hockey tournaments, leagues and national events for the 2026-27 club season, with links to each event’s page and where its fixtures and results are posted. As listed ${view.checkedOn}. Unofficial and incomplete.`;
  return {
    title: PAGE_TITLE,
    description,
    alternates: { canonical: '/club-calendar' },
    openGraph: { ...OG_BASE, ...ROOT_OG_IMAGE, title: PAGE_TITLE, description, url: '/club-calendar' },
  };
}

export default function ClubCalendarPage() {
  if (!HAS_RECRUITING) notFound();
  const view = buildClubCalendarView();

  return (
    <div className="pb-section-lg">
      <PageHeader
        title={PAGE_TITLE}
        meta={
          <>
            <span>Northern California</span>
            <span>As listed {view.checkedOn}</span>
          </>
        }
      >
        <RecruitingTabs current="clubs" exact={false} />
      </PageHeader>

      <p className="mt-4 mb-0 max-w-prose text-body text-ink-2">
        Club tournaments, leagues and the national events Northern California club teams travel to, as each
        organizer’s own page listed them on {view.checkedOn}. Club fixtures are posted by each event, usually in
        the week before it: follow an event’s links for its schedule, and check its page before you go, because
        dates and fields change.
      </p>
      <ul className="sx-linkrow">
        <li>
          <Link href="#where-posted" className="sx-action">
            Where club fixtures are posted
          </Link>
        </li>
        <li>
          <Link href="/clubs" prefetch={false} className="sx-action">
            Club teams
          </Link>
        </li>
      </ul>

      {view.months.map((month, i) => (
        <section
          key={month.id}
          aria-labelledby={`month-${month.id}`}
          className="sx-section"
          data-first={i === 0 ? '' : undefined}
        >
          <SectionHeader id={`month-${month.id}`} kicker={month.heading} meta={plural(month.events.length, 'event')} />
          <ClubEventList events={month.events} />
        </section>
      ))}

      {view.undated.length > 0 ? (
        <section aria-labelledby="not-announced" className="sx-section">
          <SectionHeader id="not-announced" kicker="Dates not announced yet" meta={plural(view.undated.length, 'event')} />
          <p className="sx-note max-w-prose">
            Events held every year whose next dates were not posted on {view.checkedOn}. Each says when it usually runs
            and when it was last held.
          </p>
          <ClubEventList events={view.undated} />
        </section>
      ) : null}

      <section aria-labelledby="where-posted" className="sx-section">
        <SectionHeader id="where-posted" kicker="Where club fixtures are posted" />
        <p className="sx-note max-w-prose">
          No one site lists every club game. These pages are where Northern California’s club events and their
          schedules appear first.
        </p>
        <ul className="m-0 list-none p-0">
          {view.resources.map((r) => (
            <li key={r.id} id={`posted-${r.id}`} className="min-w-0 border-b border-hairline py-3">
              <h3 className="m-0 text-body font-semibold text-ink">{r.name}</h3>
              <p className="m-0 text-cell text-ink-2">{r.organizer}</p>
              <p className="mt-1 mb-0 max-w-prose text-cell text-ink">{r.what}</p>
              <ul className="sx-linkrow">
                <li>
                  <ExternalLink href={r.href} className="sx-action whitespace-normal">
                    <span>
                      <span className="sr-only">{r.name}: </span>
                      Open the page
                    </span>
                  </ExternalLink>
                </li>
                {r.feed ? (
                  <li>
                    <ExternalLink href={r.feed} className="sx-action whitespace-normal">
                      <span>
                        <span className="sr-only">{r.name}: </span>
                        Calendar feed
                      </span>
                    </ExternalLink>
                  </li>
                ) : null}
              </ul>
            </li>
          ))}
        </ul>
      </section>

      {view.earlier.length > 0 ? (
        <section aria-labelledby="earlier" className="sx-section">
          <SectionHeader id="earlier" kicker="Earlier in 2026" meta={plural(view.earlier.length, 'event')} />
          <p className="sx-note max-w-prose">Over by {view.checkedOn}, latest first: their pages carry the results.</p>
          <ClubEventList events={view.earlier} />
        </section>
      ) : null}

      <section aria-labelledby="how-made" className="sx-section">
        <SectionHeader id="how-made" kicker="How this list is made" />
        <div className="max-w-prose text-body text-ink-2">
          <p className="mt-0">
            Every event here was read from its organizer’s own page, or from a club’s or a field hockey association’s
            page, on {view.checkedOn}; none is from social media. A club is listed as entering an event only when its
            own page says so. Club events move, fill up and are added through the season, so this list is incomplete
            and is not updated with each change: the event’s own page is the one to trust.
          </p>
          <p className="mb-0">
            Know of an event that is missing, or a date that has changed?{' '}
            <ExternalLink href={DATA_CORRECTIONS_URL}>Report it</ExternalLink>.
          </p>
        </div>
      </section>
    </div>
  );
}
