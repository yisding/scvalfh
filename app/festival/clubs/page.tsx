import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import FestivalChrome from '../../../components/festival/FestivalChrome';
import { buildClubIndexView } from '../../../components/festival/club-index-view';
import { OG_BASE, ROOT_OG_IMAGE } from '../../../components/layout/site';
import SectionHeader from '../../../components/ui/SectionHeader';
import { plural } from '../../../components/words/plural';
import { getFestival } from '../../../lib/festival/festival';
import { HAS_FESTIVAL } from '../../../lib/sports/current';

/**
 * /festival/clubs — every club with a team at the National Hockey Festival (DESIGN §35): California's first
 * (Northern, then Southern, by this site's club region), then every other club A–Z. Each row: the club (its
 * festival page), its region where known, its teams by division, and their pool records added up. A club is
 * USA Field Hockey's participating-clubs name, matched to TourneyMachine's team names by hand
 * (data/field-hockey/festival-clubs.json); a team no curated club matches gets a club named from the team.
 *
 * Heading outline: h1 → h2 per group. Field hockey's alone; takes the root OG card.
 */
const PAGE_TITLE = 'National Hockey Festival clubs';

export function generateMetadata(): Metadata {
  if (!HAS_FESTIVAL) return { title: 'Page not found' };
  const view = buildClubIndexView();
  const description = `The ${plural(view.clubs, 'club')} with teams at the ${getFestival().tournament.name} (${plural(view.teams, 'team')} in all), California clubs first, each with its teams’ records and a page of every result. Unofficial.`;
  return {
    title: PAGE_TITLE,
    description,
    alternates: { canonical: '/festival/clubs' },
    openGraph: { ...OG_BASE, ...ROOT_OG_IMAGE, title: PAGE_TITLE, description, url: '/festival/clubs' },
  };
}

export default function FestivalClubsPage() {
  if (!HAS_FESTIVAL) notFound();
  const view = buildClubIndexView();
  return (
    <div className="pb-section-lg">
      <FestivalChrome
        title="Clubs"
        current="clubs"
        meta={
          <>
            <span>{plural(view.clubs, 'club')}</span>
            <span>{plural(view.teams, 'team')}</span>
          </>
        }
      />
      {view.groups.map((group) => (
        <section key={group.id} aria-labelledby={`clubs-${group.id}`} className="sx-section">
          <SectionHeader id={`clubs-${group.id}`} kicker={group.heading} meta={plural(group.clubs.length, 'club')} />
          <ul className="m-0 list-none p-0">
            {group.clubs.map((club) => (
              <li key={club.slug} className="min-w-0 border-t border-hairline py-2 first:border-t-0">
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <Link href={club.href} prefetch={false} className="sx-action font-semibold whitespace-normal">
                    {club.name}
                  </Link>
                  <span className="text-cell text-ink-2">
                    {[club.region, club.teamsWord, club.record ? `${club.record} in pool games` : null].filter(Boolean).join(' · ')}
                  </span>
                </div>
                <ul className="m-0 flex list-none flex-wrap gap-x-4 p-0 text-cell">
                  {club.teams.map((team) => (
                    <li key={team.id}>
                      <span data-fest-team={team.slug}>
                        <Link href={team.href} prefetch={false} className="sx-action text-cell">
                          {team.name}
                        </Link>
                        <span className="sx-pin-note" hidden>
                          Following
                        </span>
                      </span>
                      <span className="text-ink-2"> {team.divisionShort}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
