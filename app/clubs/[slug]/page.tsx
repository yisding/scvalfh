import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import ClubPlayers from '../../../components/clubs/ClubPlayers';
import ClubPrograms from '../../../components/clubs/ClubPrograms';
import ClubSources from '../../../components/clubs/ClubSources';
import { buildClubPageView } from '../../../components/clubs/club-view';
import PageHeader from '../../../components/layout/PageHeader';
import { OG_BASE, ROOT_OG_IMAGE } from '../../../components/layout/site-url';
import ExternalLink from '../../../components/ui/ExternalLink';
import { plural } from '../../../components/ui/plural';
import SectionHeader from '../../../components/ui/SectionHeader';
import { clubDisplayName, getClub, getClubAffiliations, getClubSlugs } from '../../../lib/clubs';

/**
 * /clubs/[slug] — "Who here plays for this club, and how do we know?" (DESIGN §16.1, SPEC §1.1j2).
 *
 * One static page per club in data/clubs.json, in lib/clubs.ts' display order. A club no tracked
 * player is tied to still gets its page, with an honest empty state (DESIGN §8): what the club is,
 * what it runs and where that was read are true whether or not a public page names a player here.
 *
 * Source order is reading order: identity (the display name, the full name under it in the same
 * h1, the city and founding year, the website), then the players from the tracked rosters, then
 * the club's teams and programs, then where all of it comes from. The eyebrow links back to
 * /clubs: the page is not in the nav (DESIGN §16.1, §16.6), so this is the way back.
 *
 * Privacy (DESIGN §16.2). Only players already on the tracked varsity rosters are named, each by
 * the roster's own spelling. A source's verbatim quote, an affiliation's basis and its confidence
 * are never rendered (they are not in the view, components/clubs/club-view.ts), and the metadata
 * names no player at all: a title or description travels further than the page. The club record
 * itself names no individual.
 *
 * Heading outline: h1 → h2 Players (→ an h3 per group, only when there are two) → h2 Teams and
 * programs (when the club lists any) → h2 Where this comes from (→ h3 labels). The page takes the
 * root OG card: there is no per-club card (DESIGN §16.6), so ROOT_OG_IMAGE is safe to spread here.
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

  return (
    <div className="pb-section-lg">
      <PageHeader
        eyebrow={
          <>
            <Link href="/clubs" prefetch={false} className="sx-action text-accent hover:underline">
              Club teams
            </Link>
            {view.regionLabel ? <> &middot; {view.regionLabel}</> : null}
          </>
        }
        title={
          <>
            {view.name}
            {/* The space keeps the h1's accessible name from running the two names together
                ("SF HawksSan Francisco…"): the span is a block, which adds no space of its own. */}
            {view.fullName ? (
              <>
                {' '}
                <span className="mt-1 block text-lead font-normal text-ink-2">{view.fullName}</span>
              </>
            ) : null}
          </>
        }
        description={view.description}
        meta={
          view.facts.length > 0 || view.website ? (
            <>
              {view.facts.length > 0 ? (
                <span className="text-meta text-ink-2">{view.facts.join(' · ')}</span>
              ) : null}
              {/* A pill, never an `sx-badge`: a badge is nowrap, and the link must wrap at 320px. */}
              {view.website ? (
                <ExternalLink href={view.website} className="sx-pill">
                  {view.name} website
                </ExternalLink>
              ) : null}
            </>
          ) : undefined
        }
      />

      <section aria-labelledby="players" className="mt-8 md:mt-10">
        <SectionHeader
          id="players"
          kicker="Players from tracked high school rosters"
          meta={view.playerCount > 0 ? plural(view.playerCount, 'player') : undefined}
        />
        <ClubPlayers view={view} />
      </section>

      {view.programs.length > 0 ? (
        <section aria-labelledby="programs" className="mt-section md:mt-section-lg">
          <SectionHeader id="programs" kicker="Teams and programs" meta={`As listed ${view.checkedOn}`} />
          <ClubPrograms programs={view.programs} />
        </section>
      ) : null}

      <section aria-labelledby="sources" className="mt-section md:mt-section-lg">
        <SectionHeader id="sources" kicker="Where this comes from" />
        <ClubSources view={view} />
      </section>
    </div>
  );
}
