import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import FestivalChrome from '../../../components/festival/FestivalChrome';
import FestivalGameList from '../../../components/festival/FestivalGameList';
import MyTeamsFilter from '../../../components/festival/MyTeamsFilter';
import { buildScheduleView } from '../../../components/festival/schedule-view';
import { OG_BASE, ROOT_OG_IMAGE } from '../../../components/layout/site';
import SectionHeader from '../../../components/ui/SectionHeader';
import { plural } from '../../../components/words/plural';
import { getFestival } from '../../../lib/festival/festival';
import { HAS_FESTIVAL } from '../../../lib/sports/current';

/**
 * /festival/schedule — every game of the National Hockey Festival by day and time slot (DESIGN §35), with the
 * day jump links and the client "Only my teams" filter (components/festival/MyTeamsFilter.tsx), which hides the
 * rows, slots and days without a followed team. Without JS every game shows.
 *
 * Each day is a `[data-fest-day]` section (h2), each slot a `[data-fest-slot]` group under a strip (h3) with both
 * clocks, each game a `[data-fest-game="<slug> <slug>"]` row. Field hockey's alone; takes the root OG card.
 */
const PAGE_TITLE = 'National Hockey Festival schedule';

export function generateMetadata(): Metadata {
  if (!HAS_FESTIVAL) return { title: 'Page not found' };
  const view = buildScheduleView();
  const description = `Every game of the ${getFestival().tournament.name} by day and time slot, in Eastern and Pacific time, with field, score and Saturday finals: ${view.facts}. Show only the teams you follow. Unofficial.`;
  return {
    title: PAGE_TITLE,
    description,
    alternates: { canonical: '/festival/schedule' },
    openGraph: { ...OG_BASE, ...ROOT_OG_IMAGE, title: PAGE_TITLE, description, url: '/festival/schedule' },
  };
}

export default function FestivalSchedulePage() {
  if (!HAS_FESTIVAL) notFound();
  const view = buildScheduleView();
  return (
    <div className="pb-section-lg">
      <FestivalChrome
        title="Schedule"
        current="schedule"
        meta={
          <>
            <span>{plural(view.games, 'game')}</span>
            <span>{view.finals} final</span>
            <span>Times ET and PT</span>
          </>
        }
      />
      <nav aria-label="Days" className="sx-print-hide">
        <ul className="sx-linkrow">
          {view.days.map((day) => (
            <li key={day.key}>
              <a href={`#${day.id}`} className="sx-action">
                {day.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <MyTeamsFilter />

      {view.days.map((day) => (
        <section key={day.key} aria-labelledby={day.id} className="sx-section" data-fest-day="">
          <SectionHeader id={day.id} kicker={day.label} meta={plural(day.games, 'game')} />
          {day.slots.map((slot) => (
            <div key={slot.id} id={slot.id} className="mt-3" data-fest-slot="">
              <SectionHeader strip kicker={slot.clocks} meta={plural(slot.rows.length, 'game')} />
              <FestivalGameList games={slot.rows} />
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
