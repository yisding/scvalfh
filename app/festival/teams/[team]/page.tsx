import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import FestivalChrome from '../../../../components/festival/FestivalChrome';
import FestivalPoolTable from '../../../../components/festival/FestivalPoolTable';
import FollowButton from '../../../../components/festival/FollowButton';
import PlacementPath from '../../../../components/festival/PlacementPath';
import TeamGameList from '../../../../components/festival/TeamGameList';
import { opponentWords } from '../../../../components/festival/festival-model';
import { buildTeamView } from '../../../../components/festival/team-view';
import { OG_BASE, ROOT_OG_IMAGE } from '../../../../components/layout/site';
import ExternalLink from '../../../../components/ui/ExternalLink';
import SectionHeader from '../../../../components/ui/SectionHeader';
import { plural } from '../../../../components/words/plural';
import { festivalTeamSlugs, getFestival } from '../../../../lib/festival/festival';
import { HAS_FESTIVAL } from '../../../../lib/sports/current';

/**
 * /festival/teams/[team] — one team at the National Hockey Festival (DESIGN §35): its record, points and pool
 * place, its next game, every game it plays with result chips, its pool table with the team marked, and where its
 * final pool place sends it on Saturday; links to its club, its division and TourneyMachine.
 *
 * One static page per team of data/field-hockey/festival.json (`<division>-<name>` slugs: team names repeat
 * across divisions). Heading outline: h1 → h2 Games → h2 the pool → h2 Placement. The division's tab is lit
 * (`aria-current="true"`). Field hockey's alone; takes the root OG card.
 */

export const dynamicParams = false;

export function generateStaticParams(): { team: string }[] {
  return HAS_FESTIVAL ? festivalTeamSlugs().map((team) => ({ team })) : [];
}

export async function generateMetadata({ params }: PageProps<'/festival/teams/[team]'>): Promise<Metadata> {
  const { team } = await params;
  const view = HAS_FESTIVAL ? buildTeamView(team) : null;
  // No notFound() here: the page itself 404s.
  if (!view) return { title: 'Team not found' };
  const { card } = view;
  const title = `${card.team.name} (${card.team.divisionShort}) at the National Hockey Festival`;
  const standing = card.record ? `${card.record}${card.place ? `, ${card.place.words} in ${card.team.poolName}` : ''}` : `${card.team.poolName}, no result yet`;
  const description = `${card.team.name} of ${card.team.clubName}, ${view.divisionName}, at the ${getFestival().tournament.name}: ${standing}. Every game with time and field, the pool table and the placement games. Unofficial.`;
  return {
    title,
    description,
    alternates: { canonical: `/festival/teams/${team}` },
    openGraph: { ...OG_BASE, ...ROOT_OG_IMAGE, title, description, url: `/festival/teams/${team}` },
  };
}

export default async function FestivalTeamPage({ params }: PageProps<'/festival/teams/[team]'>) {
  const { team } = await params;
  const view = HAS_FESTIVAL ? buildTeamView(team) : null;
  if (!view) notFound();
  const { card } = view;
  const summary = [
    card.record ? `${card.record}, ${plural(card.pts, 'pt')}` : 'No result yet',
    card.place ? `${card.place.words} in ${card.team.poolName}${card.place.final ? ', final' : ''}` : null,
  ].filter(Boolean);

  return (
    <div className="pb-section-lg">
      <FestivalChrome
        title={card.team.name}
        current={card.team.divisionSlug}
        exact={false}
        meta={
          <>
            <span>
              <Link href={view.divisionHref} prefetch={false} className="sx-link inline-flex min-h-6 items-center">
                {card.team.divisionShort}
              </Link>
            </span>
            <span>{card.team.poolName}</span>
            <span>
              <Link href={card.team.clubHref} prefetch={false} className="sx-link inline-flex min-h-6 items-center">
                {card.team.clubName}
              </Link>
            </span>
          </>
        }
      />
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1">
        <FollowButton slug={card.team.slug} name={`${card.team.name} (${card.team.divisionShort})`} />
      </div>
      <dl className="mt-3 mb-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-body">
        <dt className="text-ink-2">Record</dt>
        <dd className="m-0 text-ink">{summary.join(' · ')}</dd>
        <dt className="text-ink-2">{card.next?.status === 'live' ? 'Now' : 'Next'}</dt>
        <dd className="m-0 text-ink">
          {card.next
            ? `${card.next.when}, ${card.next.field} v ${opponentWords(card.next.opponent)}`
            : card.placementAhead
              ? 'A placement game, set by the final pool table (below)'
              : 'No more games on the schedule'}
        </dd>
      </dl>
      {card.note ? <p className="sx-note">{card.note}</p> : null}

      <section aria-labelledby="games" className="sx-section">
        <SectionHeader id="games" kicker="Games" meta={`${plural(view.games.length, 'game')} · times ET`} />
        <TeamGameList games={view.games} />
      </section>

      <section aria-labelledby="pool" className="sx-section">
        <SectionHeader id="pool" kicker={view.pool.name} meta={view.pool.status} action={{ href: `${view.divisionHref}#${view.pool.anchor}`, label: `All ${card.team.divisionShort} pools` }} />
        <FestivalPoolTable pool={view.pool} />
      </section>

      <section aria-labelledby="placement" className="sx-section">
        <SectionHeader id="placement" kicker="Placement" action={view.path.entries.length > 0 ? { href: view.path.bracketHref, label: 'Bracket' } : undefined} />
        <PlacementPath path={view.path} teamName={card.team.name} />
      </section>

      <ul className="sx-linkrow mt-6">
        <li>
          <Link href={card.team.clubHref} prefetch={false} className="sx-action">
            {card.team.clubName} at the festival
          </Link>
        </li>
        <li>
          <Link href={view.divisionHref} prefetch={false} className="sx-action">
            {card.team.divisionShort} division
          </Link>
        </li>
        <li>
          <ExternalLink href={view.resultsUrl} className="sx-action">
            TourneyMachine
          </ExternalLink>
        </li>
      </ul>
    </div>
  );
}
