import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import ClubPlayers from '../../../components/clubs/ClubPlayers';
import ClubPrograms from '../../../components/clubs/ClubPrograms';
import ClubSources from '../../../components/clubs/ClubSources';
import { buildClubPageView } from '../../../components/clubs/club-view';
import { clubEventLines } from '../../../components/club-calendar/calendar-view';
import PageHeader from '../../../components/layout/PageHeader';
import { OG_BASE, ROOT_OG_IMAGE } from '../../../components/layout/site';
import ExternalLink from '../../../components/ui/ExternalLink';
import { plural } from '../../../components/words/plural';
import RecruitingTabs from '../../../components/recruiting/RecruitingTabs';
import SectionHeader from '../../../components/ui/SectionHeader';
import { clubDisplayName, getClub, getClubAffiliations, getClubSlugs } from '../../../lib/players/clubs';

/**
 * /clubs/[slug] — "Who here plays for this club, and how do we know?" (DESIGN §17.1, SPEC §1.1j2).
 *
 * One static page per club in data/clubs.json, in lib/players/clubs.ts' display order. A club no tracked
 * player is tied to still gets its page, with an honest empty state (DESIGN §8): what the club is,
 * what it runs and where that was read are true whether or not a public page names a player here.
 *
 * Source order is reading order: identity (the display name as the h1; the full name, the city and
 * the founding year in the one line under it), the recruiting family's tab row with "Clubs" lit
 * (the way back to /clubs: the page is not in the nav), what the club is and its website, then the
 * players from the tracked rosters, then the club's teams and programs, then where all of it comes
 * from.
 *
 * Privacy (DESIGN §17.2). Only players already on the tracked varsity rosters are named, each by
 * the roster's own spelling. A source's verbatim quote, an affiliation's basis and its confidence
 * are never rendered (they are not in the view, components/clubs/club-view.ts), and the metadata
 * names no player at all: a title or description travels further than the page. The club record
 * itself names no individual.
 *
 * Heading outline: h1 → h2 Players (→ an h3 per group, only when there are two) → h2 Teams and
 * programs (when the club lists any) → h2 Tournaments and leagues (when data/club-events.json has an
 * event the club hosts or whose page says the club enters it; each links /club-calendar#<event>,
 * DESIGN §34) → h2 Where this comes from (→ h3 labels). The page takes the
 * root OG card: there is no per-club card (DESIGN §17.6), so ROOT_OG_IMAGE is safe to spread here.
 */

/** Every club prerendered; anything else is a 404 rather than a runtime render. */
export const dynamicParams = false;

export function generateStaticParams() {
  return getClubSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<'/clubs/[slug]'>): Promise<Metadata> {
  const { slug } = await params;
  const club = getClub(slug);
  // No notFound() here: the page itself 404s, and a metadata pass must not cost an unknown slug
  // anything (the team page's pattern).
  if (!club) return { title: 'Club not found' };
  const n = getClubAffiliations(slug).length;
  const tied = n
    ? `${plural(n, 'player')} on this site’s varsity rosters ${n === 1 ? 'is tied to it, with a source' : 'are tied to it, each with a source'}.`
    : 'No player on this site’s varsity rosters is tied to it by a public page we found.';
  const description = `${club.name}${club.city ? `, ${club.city}` : ''}. ${club.description} ${tied} Unofficial and incomplete.`;
  return {
    // The full name, never "<short name> club field hockey": "Lions club field hockey" reads as the
    // service club, and "Performance Field Hockey field hockey" repeats itself.
    title: club.name,
    description,
    alternates: { canonical: `/clubs/${club.slug}` },
    openGraph: {
      ...OG_BASE,
      ...ROOT_OG_IMAGE,
      title: clubDisplayName(club),
      description,
      url: `/clubs/${club.slug}`,
    },
  };
}

export default async function ClubPage({ params }: PageProps<'/clubs/[slug]'>) {
  const { slug } = await params;
  const view = buildClubPageView(slug);
  if (!view) notFound();
  const events = clubEventLines(slug);

  return (
    <div className="pb-section-lg">
      <PageHeader
        title={view.name}
        meta={
          view.fullName || view.regionLabel || view.facts.length > 0 ? (
            <>
              {view.fullName ? <span>{view.fullName}</span> : null}
              {view.regionLabel ? <span>{view.regionLabel}</span> : null}
              {view.facts.map((fact) => (
                <span key={fact}>{fact}</span>
              ))}
            </>
          ) : undefined
        }
      >
        <RecruitingTabs current="clubs" exact={false} />
      </PageHeader>

      <p className="mt-4 mb-0 max-w-prose text-body text-ink-2">{view.description}</p>
      {view.website ? (
        <ul className="sx-linkrow">
          <li>
            {/* Free to wrap: a long club name must not run past a 320px screen. */}
            <ExternalLink href={view.website} className="sx-action whitespace-normal">
              {view.name} website
            </ExternalLink>
          </li>
        </ul>
      ) : null}

      <section aria-labelledby="players" className="sx-section">
        <SectionHeader
          id="players"
          kicker="Players from tracked high school rosters"
          meta={view.playerCount > 0 ? plural(view.playerCount, 'player') : undefined}
        />
        <ClubPlayers view={view} />
      </section>

      {view.programs.length > 0 ? (
        <section aria-labelledby="programs" className="sx-section">
          <SectionHeader id="programs" kicker="Teams and programs" meta={`As listed ${view.checkedOn}`} />
          <ClubPrograms programs={view.programs} shared={view.programsSource} />
        </section>
      ) : null}

      {events.length > 0 ? (
        <section aria-labelledby="events" className="sx-section">
          <SectionHeader id="events" kicker="Tournaments and leagues" action={{ href: '/club-calendar', label: 'Club calendar' }} />
          <ul className="sx-auto m-0 list-none p-0">
            {events.map((e) => (
              <li key={e.id} className="min-w-0 border-b border-hairline py-1.5">
                <Link href={e.href} prefetch={false} className="text-body font-semibold">
                  {e.name}
                </Link>
                <span className="flex flex-wrap gap-x-3 text-cell text-ink-2">
                  <span>{e.role}</span>
                  <span>{e.when}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="sources" className="sx-section">
        <SectionHeader id="sources" kicker="Where this comes from" />
        <ClubSources view={view} />
      </section>
    </div>
  );
}
