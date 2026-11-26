import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import FestivalChrome from '../../../components/festival/FestivalChrome';
import FestivalGameList from '../../../components/festival/FestivalGameList';
import FestivalPoolTable from '../../../components/festival/FestivalPoolTable';
import PlacementBracket from '../../../components/festival/PlacementBracket';
import { buildDivisionView } from '../../../components/festival/division-view';
import { OG_BASE, ROOT_OG_IMAGE } from '../../../components/layout/site';
import ExternalLink from '../../../components/ui/ExternalLink';
import SectionHeader from '../../../components/ui/SectionHeader';
import { plural } from '../../../components/words/plural';
import { festivalDivisionSlugs, getFestival } from '../../../lib/festival/festival';
import { HAS_FESTIVAL } from '../../../lib/sports/current';

/**
 * /festival/[division] — one division of the National Hockey Festival (DESIGN §35): its pools in TourneyMachine's
 * order, its Saturday placement games laid out as TourneyMachine draws them, and every game by day and time slot.
 *
 * One static page per division of data/field-hockey/festival.json; the static siblings (schedule, clubs, teams)
 * take precedence, and the schema refuses those words as division slugs. Another sport's build has no params and
 * `dynamicParams = false` makes every segment a 404.
 *
 * Heading outline: h1 (the division's feed name) → h2 Pools (→ h3 per pool strip) → h2 Finals (→ h3 per
 * column) → h2 Schedule (→ h3 per day → slot strips). Takes the root OG card.
 */

export const dynamicParams = false;

export function generateStaticParams(): { division: string }[] {
  return HAS_FESTIVAL ? festivalDivisionSlugs().map((division) => ({ division })) : [];
}

export async function generateMetadata({ params }: PageProps<'/festival/[division]'>): Promise<Metadata> {
  const { division } = await params;
  const view = HAS_FESTIVAL ? buildDivisionView(division) : null;
  // No notFound() here: the page itself 404s (the club page's pattern).
  if (!view) return { title: 'Division not found' };
  const title = `${view.name} at the National Hockey Festival`;
  const description = `${view.name} at the ${getFestival().tournament.name}: ${plural(view.teams, 'team')} in ${plural(view.pools.length, 'pool')}, pool tables, ${view.bracket ? 'finals, ' : ''}and every game by time slot, ${view.finals} of ${plural(view.games, 'game')} final. Unofficial.`;
  return {
    title,
    description,
    alternates: { canonical: `/festival/${division}` },
    openGraph: { ...OG_BASE, ...ROOT_OG_IMAGE, title, description, url: `/festival/${division}` },
  };
}

export default async function FestivalDivisionPage({ params }: PageProps<'/festival/[division]'>) {
  const { division } = await params;
  const view = HAS_FESTIVAL ? buildDivisionView(division) : null;
  if (!view) notFound();

  return (
    <div className="pb-section-lg">
      <FestivalChrome
        title={view.name}
        current={view.slug}
        meta={view.facts.map((fact) => (
          <span key={fact}>{fact}</span>
        ))}
      />
      <nav aria-label="On this page" className="sx-print-hide">
        <ul className="sx-linkrow">
          <li>
            <a href="#pools" className="sx-action">
              Pools
            </a>
          </li>
          {view.bracket ? (
            <li>
              <a href="#bracket" className="sx-action">
                Finals
              </a>
            </li>
          ) : null}
          <li>
            <a href="#schedule" className="sx-action">
              Schedule
            </a>
          </li>
        </ul>
      </nav>

      <section aria-labelledby="pools" className="sx-section">
        <SectionHeader id="pools" kicker="Pools" meta={plural(view.pools.length, 'pool')} />
        {view.pools.map((pool) => (
          <div key={pool.id} className="mt-4">
            <SectionHeader strip id={pool.anchor} kicker={pool.name} meta={pool.status} />
            <FestivalPoolTable pool={pool} />
          </div>
        ))}
        <p className="sx-note">
          In TourneyMachine’s order: points (3 for a win, 1 for a tie), then wins, goal difference, goals for and the
          head-to-head result. Teams level on the first four share a rank (“=1”): TourneyMachine lists them
          alphabetically.{' '}
          <Link href="/festival#about" prefetch={false} className="sx-link">
            How ties are broken
          </Link>
        </p>
      </section>

      {view.bracket ? (
        <section aria-labelledby="bracket" className="sx-section">
          <SectionHeader id="bracket" kicker="Finals" meta={plural(view.bracket.reduce((n, c) => n + c.games.length, 0), 'game')} />
          {view.finalsSummary ? <p className="mt-0 mb-4 max-w-prose text-body text-ink-2">{view.finalsSummary}</p> : null}
          <PlacementBracket columns={view.bracket} label={`${view.short} finals`} />
          {view.bracketUrl ? (
            <p className="sx-note">
              The same games on{' '}
              <ExternalLink href={view.bracketUrl} arrow={false}>
                TourneyMachine’s bracket page
              </ExternalLink>
              .
            </p>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="schedule" className="sx-section">
        <SectionHeader id="schedule" kicker="Schedule" meta={`${plural(view.games, 'game')} · times ET`} />
        {view.days.map((day) => (
          <div key={day.key} id={day.id} className="mt-4">
            <h3 className="m-0 mb-2 text-lead text-ink">{day.label}</h3>
            {day.slots.map((slot) => (
              <div key={slot.id} className="mt-3">
                <SectionHeader strip as="h4" kicker={slot.clocks} meta={plural(slot.rows.length, 'game')} />
                <FestivalGameList games={slot.rows} />
              </div>
            ))}
          </div>
        ))}
      </section>
    </div>
  );
}
